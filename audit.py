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
