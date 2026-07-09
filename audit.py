"""操作审计:采集/存储/读取登录·登出·账号管理及全站写操作留痕。纯标准库。
data/audit_log.jsonl 为本地敏感数据(gitignored);绝不记录密码/哈希/token/cookie。
本模块不依赖 server(server 单向依赖 audit)。"""
from __future__ import annotations

import os
import sys
import json
import time
import threading
import datetime

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

AUDIT_LOG_FILE = os.path.join(BASE_DIR, 'data', 'audit_log.jsonl')
AUDIT_ARCHIVE_DIR = os.path.join(BASE_DIR, 'data', 'audit_archive')

MAX_ROWS = 10_000
MAX_DAYS = 365
TRIM_MARGIN = 1_000
UA_MAX = 200

_lock = threading.Lock()

# (method, path) -> (event_code, 中文动作)。命中才审计;登录/登出与读端点不入表。
_ACTION_MAP = {
    # 账号管理(POST)
    ('POST', '/api/admin/accounts/create'): ('account.create', '创建账号'),
    ('POST', '/api/admin/accounts/update'): ('account.update', '修改账号'),
    ('POST', '/api/admin/accounts/delete'): ('account.delete', '删除账号'),
    ('POST', '/api/account/change-password'): ('account.change_password', '修改本人密码'),
    # 数据运维
    ('GET', '/api/reprocess'): ('data.reprocess', '数据更新'),
    ('GET', '/api/clear-data'): ('data.clear', '清空数据'),
    ('GET', '/api/stop'): ('server.stop', '停止服务'),
    ('GET', '/api/pmis/download'): ('pmis.download', 'PMIS拉取'),
    ('POST', '/api/pmis/cookie'): ('pmis.cookie_save', '更新PMIS Cookie'),
    ('POST', '/api/pmis/upload'): ('pmis.upload', '上传PMIS包'),
    ('POST', '/api/inputs/upload'): ('inputs.upload', '上传数据文件'),
    ('POST', '/api/data-history/rollback'): ('data.history_rollback', '数据回滚'),
    ('POST', '/api/data-history/undo-rollback'): ('data.history_undo', '撤销数据回滚'),
    ('POST', '/api/manual/import'): ('manual.import', '人工数据导入'),
    ('POST', '/api/manual/rollback'): ('manual.rollback', '人工数据回滚'),
    # 业务写入(POST)
    ('POST', '/api/followup/add'): ('followup.add', '添加跟进记录'),
    ('POST', '/api/followup/delete'): ('followup.delete', '删除跟进记录'),
    ('POST', '/api/followup/update'): ('followup.update', '修改跟进记录'),
    ('POST', '/api/tags'): ('tags.save', '保存标签'),
    ('POST', '/api/progress/update'): ('progress.update', '更新项目进展'),
    ('POST', '/api/progress/archive'): ('progress.archive', '归档项目进展'),
    ('POST', '/api/progress/archive/delete'): ('progress.archive_delete', '删除进展归档'),
    ('POST', '/api/temp-followup/scope'): ('temp_followup.scope', '设置临时跟进范围'),
    ('POST', '/api/temp-followup/update'): ('temp_followup.update', '更新临时跟进'),
    ('POST', '/api/temp-followup/archive'): ('temp_followup.archive', '归档临时跟进'),
    ('POST', '/api/temp-followup/archive/delete'): ('temp_followup.archive_delete', '删除临时跟进归档'),
    ('POST', '/api/opportunity-followup/scope'): ('opportunity_followup.scope', '设置商机跟进范围'),
    ('POST', '/api/opportunity-followup/update'): ('opportunity_followup.update', '更新商机跟进'),
    ('POST', '/api/opportunity-followup/archive'): ('opportunity_followup.archive', '归档商机跟进'),
    ('POST', '/api/opportunity-followup/archive/delete'): ('opportunity_followup.archive_delete', '删除商机跟进归档'),
    ('POST', '/api/risk-followup/scope'): ('risk_followup.scope', '设置风险跟进范围'),
    ('POST', '/api/risk-followup/update'): ('risk_followup.update', '更新风险跟进'),
    ('POST', '/api/risk-followup/archive'): ('risk_followup.archive', '归档风险跟进'),
    ('POST', '/api/risk-followup/archive/delete'): ('risk_followup.archive_delete', '删除风险跟进归档'),
    ('POST', '/api/payment-key-followup/scope'): ('paykey_followup.scope', '设置回款重点范围'),
    ('POST', '/api/payment-key-followup/update'): ('paykey_followup.update', '更新回款重点跟进'),
    ('POST', '/api/payment-key-followup/archive'): ('paykey_followup.archive', '归档回款重点跟进'),
    ('POST', '/api/payment-key-followup/archive/delete'): ('paykey_followup.archive_delete', '删除回款重点归档'),
    ('POST', '/api/opportunities/create'): ('opportunities.create', '新建商机'),
    ('POST', '/api/opportunities/update'): ('opportunities.update', '更新商机'),
    ('POST', '/api/opportunities/delete'): ('opportunities.delete', '删除商机'),
    ('POST', '/api/opportunities/import'): ('opportunities.import', '导入商机'),
}


def map_action(method, path):
    """(method, path) → (事件码, 中文动作);未命中返回 None(不审计)。"""
    return _ACTION_MAP.get((method, path))


def client_ip(headers, client_address):
    """真实客户端 IP:X-Forwarded-For 首跳 → X-Real-IP → client_address[0] → ''。"""
    xff = (headers.get('X-Forwarded-For') or '').split(',')[0].strip()
    if xff:
        return xff
    xri = (headers.get('X-Real-IP') or '').strip()
    if xri:
        return xri
    try:
        return client_address[0]
    except Exception:
        return ''


def _ts_epoch(ts):
    """ISO-8601(带偏移)→ epoch 秒;解析失败返回 0.0(视作极旧)。"""
    try:
        return datetime.datetime.fromisoformat(ts).timestamp()
    except Exception:
        return 0.0


def _trim_and_archive(events, max_rows, max_days, now):
    """纯函数。events 为按时间追加(旧→新)的列表。返回 (kept, overflow):
    kept = 同时满足『最近 max_rows 条』与『晚于 max_days 天』的尾部一段;
    overflow = 其余头部一段(超条数或超天数),保持原序。"""
    cutoff = now - max_days * 86400
    n = len(events)
    start = max(0, n - max_rows)                       # 超 max_rows 的最旧一段进溢出
    while start < n and _ts_epoch(events[start].get('ts', '')) < cutoff:
        start += 1                                     # 保留窗口内早于 cutoff 的也进溢出
    return events[start:], events[:start]


def _read_all_locked():
    if not os.path.exists(AUDIT_LOG_FILE):
        return []
    out = []
    with open(AUDIT_LOG_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(json.loads(line))
            except Exception:
                continue
    return out


def _maybe_rotate_locked():
    """惰性滚动:超条数或最旧超天数才重写活动日志、把溢出按年追加进归档。"""
    events = _read_all_locked()
    if not events:
        return
    over_count = len(events) > MAX_ROWS + TRIM_MARGIN
    oldest_old = _ts_epoch(events[0].get('ts', '')) < (time.time() - MAX_DAYS * 86400)
    if not (over_count or oldest_old):
        return
    kept, overflow = _trim_and_archive(events, MAX_ROWS, MAX_DAYS, time.time())
    if not overflow:
        return
    os.makedirs(AUDIT_ARCHIVE_DIR, exist_ok=True)
    by_year = {}
    for ev in overflow:
        year = (str(ev.get('ts', ''))[:4]) or 'unknown'
        by_year.setdefault(year, []).append(ev)
    for year, evs in by_year.items():
        path = os.path.join(AUDIT_ARCHIVE_DIR, 'audit-%s.jsonl' % year)
        with open(path, 'a', encoding='utf-8') as f:
            for ev in evs:
                f.write(json.dumps(ev, ensure_ascii=False) + '\n')
    tmp = AUDIT_LOG_FILE + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        for ev in kept:
            f.write(json.dumps(ev, ensure_ascii=False) + '\n')
    os.replace(tmp, AUDIT_LOG_FILE)


def record(event):
    """补全 ts、追加一行、按需滚动归档。绝不抛出(审计失败不影响主流程)。"""
    try:
        ev = dict(event)
        ev.setdefault('ts', datetime.datetime.now().astimezone().isoformat(timespec='seconds'))
        with _lock:
            os.makedirs(os.path.dirname(AUDIT_LOG_FILE), exist_ok=True)
            with open(AUDIT_LOG_FILE, 'a', encoding='utf-8') as f:
                f.write(json.dumps(ev, ensure_ascii=False) + '\n')
            _maybe_rotate_locked()
    except Exception:
        pass


def _facet_events(events):
    seen = {}
    for e in events:
        code = e.get('event', '')
        if code and code not in seen:
            seen[code] = e.get('action', code)
    return [{'code': c, 'label': seen[c]} for c in sorted(seen)]


def _apply_filters(events, f):
    acc = f.get('account') or ''
    evset = set(f.get('event') or [])
    frm = f.get('from') or ''
    to = f.get('to') or ''
    result = f.get('result') or ''
    kw = (f.get('kw') or '').lower()
    out = []
    for e in events:
        if acc and e.get('account', '') != acc:
            continue
        if evset and e.get('event', '') not in evset:
            continue
        ts = e.get('ts', '')
        if frm and ts[:10] < frm:
            continue
        if to and ts[:10] > to:
            continue
        if result == 'success' and not e.get('success'):
            continue
        if result == 'failure' and e.get('success'):
            continue
        if kw:
            hay = ' '.join(str(e.get(k, '')) for k in
                           ('account', 'displayName', 'action', 'target', 'detail', 'path')).lower()
            if kw not in hay:
                continue
        out.append(e)
    return out


def read(filters, page, page_size):
    """读活动日志、应用筛选、分页(最新在前)。返回 {rows,total,facets}。"""
    with _lock:
        events = _read_all_locked()
    facets = {
        'accounts': sorted({e.get('account', '') for e in events if e.get('account')}),
        'events': _facet_events(events),
    }
    rows = list(reversed(_apply_filters(events, filters or {})))
    total = len(rows)
    page = max(1, int(page or 1))
    page_size = max(1, int(page_size or 50))
    start = (page - 1) * page_size
    return {'rows': rows[start:start + page_size], 'total': total, 'facets': facets}
