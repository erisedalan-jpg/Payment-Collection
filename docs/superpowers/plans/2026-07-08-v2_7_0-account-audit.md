# 账号管理审计（全操作审计）Implementation Plan · V2.7.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为账号管理增加一套操作审计子系统，记录登录/登出/账号管理及全站写操作的留痕，仅超管可见、支持筛选与 xlsx 导出。

**Architecture:** 新增 `audit.py`（纯标准库，采集/存储/读取，含惰性滚动归档），`server.py` 在 `do_POST`/`do_GET` 通过 try/finally 中央埋点 + 登录/登出/账号 CRUD 显式补录，新增超管专属查询端点 `GET /api/admin/audit`。前端在 `AdminView.vue` 加 el-tabs，新增 `AuditLogTab.vue` + `lib/audit.ts`。

**Tech Stack:** Python 标准库（`http.server`、`json`、`threading`、`datetime`）；前端 Vue3 + TS + Pinia + Element Plus + xlsx；pytest + vitest。

## Global Constraints

- 交流与文案用**简体中文**；代码/命令/文件名原文。
- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- 版本单一来源 `frontend/src/version.ts`，本期 **V2.7.0**、日期 `2026-07-08`。
- 前端只引用 `styles/theme.css` 设计令牌、不手写散值；金额/时间/数字列必须挂 `.u-num`（tabular-nums）。
- **隐私红线**：审计**绝不记录**明文密码、密码哈希、salt、会话 token、cookie 原值、完整请求体。
- `data/audit_log.jsonl` 与 `data/audit_archive/` 为 **gitignored 运行期数据**，不进发布包。
- `audit.py` **不依赖** `server`（`server` 单向依赖 `audit`）；I/O 路径经模块常量，测试可 monkeypatch。
- **审计写入失败绝不影响主请求**：`record()` 与所有埋点调用点均以 try/except 吞掉异常、只写 `logger.error`。
- 埋点**只覆盖通过 `_auth_gate`+`_authz_gate` 后**的请求；被 gate 拦截的 401/403 不记（认证探测由 `login.failure` 覆盖）。
- 常量：`MAX_ROWS=10000`、`MAX_DAYS=365`、`TRIM_MARGIN=1000`、`UA_MAX=200`。
- 保留口径：活动日志只留**同时满足『最近 MAX_ROWS 条』与『晚于 MAX_DAYS 天』**的记录；滚出条件为并集（超条数 **或** 超天数），溢出**追加进按年归档、永不删除**。
- 完成定义：`bash verify.sh` 全绿（pytest + 前端 typecheck/vitest/build）+ `PROGRESS.md` 更新。
- 升级须**重启后端**；**不需点「更新数据」**；**无需改 nginx**（`X-Forwarded-For` 已配）。

## File Structure

| 文件 | 职责 |
|---|---|
| `audit.py`（新增） | 审计核心：路径常量、`map_action`、`client_ip`、`_trim_and_archive`（纯）、`record`、`read`、滚动归档 I/O |
| `server.py`（改） | `send_response` 覆写暂存状态；`_audit_request` 中央埋点；`do_POST`/`do_GET` 抽 `_dispatch_*` 并 try/finally 包裹；`handle_login`/`handle_logout` 显式补录；账号 CRUD 设 `_audit_target`/`_audit_detail`；新增 `handle_admin_audit` 端点 |
| `tests/test_audit.py`（新增） | `audit.py` 纯函数 + record/read/滚动归档 I/O |
| `tests/test_server_audit.py`（新增） | HTTP 级：中央埋点落库、登录/登出事件、隐私、端点鉴权 |
| `.gitignore`（改） | 追加 `data/audit_log.jsonl`、`data/audit_archive/` |
| `frontend/src/lib/audit.ts`（新增） | 类型 + `fetchAudit` + 纯函数 `buildExportRows` |
| `frontend/src/lib/audit.test.ts`（新增） | `buildExportRows` 纯函数测试 |
| `frontend/src/components/AuditLogTab.vue`（新增） | 审计标签页：筛选 + el-table + 分页 + 导出 |
| `frontend/src/components/AuditLogTab.test.ts`（新增） | 组件 vitest |
| `frontend/src/views/AdminView.vue`（改） | 包 el-tabs，加「审计日志」标签 |
| `frontend/src/version.ts`（改） | V2.7.0 |

---

## Task 1: audit.py 纯函数核心（map_action / client_ip / _trim_and_archive）

**Files:**
- Create: `audit.py`
- Test: `tests/test_audit.py`

**Interfaces:**
- Produces:
  - `MAX_ROWS=10000`, `MAX_DAYS=365`, `TRIM_MARGIN=1000`, `UA_MAX=200`（模块常量）
  - `AUDIT_LOG_FILE: str`, `AUDIT_ARCHIVE_DIR: str`（可 monkeypatch）
  - `map_action(method: str, path: str) -> tuple[str, str] | None`
  - `client_ip(headers, client_address) -> str`
  - `_ts_epoch(ts: str) -> float`
  - `_trim_and_archive(events: list[dict], max_rows: int, max_days: int, now: float) -> tuple[list, list]`（返回 `(kept, overflow)`）

- [ ] **Step 1: 写失败测试**

创建 `tests/test_audit.py`：

```python
import datetime
import audit


def _iso(days_ago):
    dt = datetime.datetime.now().astimezone() - datetime.timedelta(days=days_ago)
    return dt.isoformat(timespec='seconds')


def test_map_action_hits_and_misses():
    assert audit.map_action('POST', '/api/admin/accounts/create') == ('account.create', '创建账号')
    assert audit.map_action('POST', '/api/tags') == ('tags.save', '保存标签')
    assert audit.map_action('GET', '/api/reprocess') == ('data.reprocess', '数据更新')
    # 登录/登出不入表(由 handler 显式补录)
    assert audit.map_action('POST', '/api/login') is None
    assert audit.map_action('POST', '/api/logout') is None
    # 读端点/未知路径不审计
    assert audit.map_action('GET', '/api/auth/me') is None
    assert audit.map_action('GET', '/data/analysis_data.json') is None


def test_client_ip_prefers_xff_then_xreal_then_addr():
    assert audit.client_ip({'X-Forwarded-For': '1.2.3.4, 5.6.7.8'}, ('127.0.0.1', 9)) == '1.2.3.4'
    assert audit.client_ip({'X-Real-IP': '9.9.9.9'}, ('127.0.0.1', 9)) == '9.9.9.9'
    assert audit.client_ip({}, ('10.0.0.1', 9)) == '10.0.0.1'
    assert audit.client_ip({}, None) == ''


def test_trim_by_row_count():
    events = [{'ts': _iso(0), 'i': i} for i in range(5)]
    kept, overflow = audit._trim_and_archive(events, max_rows=3, max_days=365, now=_now())
    assert [e['i'] for e in kept] == [2, 3, 4]
    assert [e['i'] for e in overflow] == [0, 1]


def test_trim_by_age():
    events = [
        {'ts': _iso(400), 'i': 0},   # 早于 365 天 → 溢出
        {'ts': _iso(10), 'i': 1},
        {'ts': _iso(1), 'i': 2},
    ]
    kept, overflow = audit._trim_and_archive(events, max_rows=100, max_days=365, now=_now())
    assert [e['i'] for e in kept] == [1, 2]
    assert [e['i'] for e in overflow] == [0]


def test_trim_nothing_when_within_limits():
    events = [{'ts': _iso(1), 'i': i} for i in range(3)]
    kept, overflow = audit._trim_and_archive(events, max_rows=10, max_days=365, now=_now())
    assert overflow == [] and len(kept) == 3


def _now():
    import time
    return time.time()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_audit.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'audit'` 或 `AttributeError`）

- [ ] **Step 3: 写最小实现**

创建 `audit.py`：

```python
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_audit.py -q`
Expected: PASS（5 passed）

- [ ] **Step 5: 提交**

```bash
git add audit.py tests/test_audit.py
git commit -m "feat(audit): audit.py 纯函数核心 map_action/client_ip/_trim_and_archive (V2.7.0)"
```

---

## Task 2: audit.py 存储层（record / read / 滚动归档）+ .gitignore

**Files:**
- Modify: `audit.py`（追加函数）
- Modify: `.gitignore`
- Test: `tests/test_audit.py`（追加）

**Interfaces:**
- Consumes: Task 1 的 `_trim_and_archive`、`_ts_epoch`、常量、`AUDIT_LOG_FILE`、`AUDIT_ARCHIVE_DIR`
- Produces:
  - `record(event: dict) -> None`（补 `ts`、追加、惰性滚动;绝不抛）
  - `read(filters: dict, page: int, page_size: int) -> dict`，返回 `{'rows': list, 'total': int, 'facets': {'accounts': list[str], 'events': list[{'code','label'}]}}`；`rows` 最新在前

- [ ] **Step 1: 写失败测试**

在 `tests/test_audit.py` 追加：

```python
def _reset_paths(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, 'AUDIT_LOG_FILE', str(tmp_path / 'audit_log.jsonl'))
    monkeypatch.setattr(audit, 'AUDIT_ARCHIVE_DIR', str(tmp_path / 'audit_archive'))


def test_record_read_roundtrip(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)
    audit.record({'event': 'login.success', 'action': '登录成功', 'account': 'admin',
                  'ip': '1.2.3.4', 'success': True})
    res = audit.read({}, 1, 50)
    assert res['total'] == 1
    row = res['rows'][0]
    assert row['event'] == 'login.success' and row['account'] == 'admin'
    assert 'ts' in row and row['ts']                 # record 自动补 ts
    assert res['facets']['accounts'] == ['admin']
    assert res['facets']['events'] == [{'code': 'login.success', 'label': '登录成功'}]


def test_read_newest_first_and_filters(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)
    audit.record({'event': 'login.success', 'action': '登录成功', 'account': 'a', 'success': True})
    audit.record({'event': 'login.failure', 'action': '登录失败', 'account': 'b', 'success': False})
    # 最新在前
    assert audit.read({}, 1, 50)['rows'][0]['account'] == 'b'
    # 账号筛选
    assert [r['account'] for r in audit.read({'account': 'a'}, 1, 50)['rows']] == ['a']
    # 结果筛选
    assert [r['account'] for r in audit.read({'result': 'failure'}, 1, 50)['rows']] == ['b']
    # 事件筛选
    assert [r['account'] for r in audit.read({'event': ['login.success']}, 1, 50)['rows']] == ['a']
    # 关键字(命中 action/account)
    assert audit.read({'kw': '失败'}, 1, 50)['total'] == 1


def test_read_pagination(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)
    for i in range(5):
        audit.record({'event': 'x', 'action': 'X', 'account': 'a%d' % i, 'success': True})
    p1 = audit.read({}, 1, 2)
    assert p1['total'] == 5 and len(p1['rows']) == 2 and p1['rows'][0]['account'] == 'a4'
    p3 = audit.read({}, 3, 2)
    assert len(p3['rows']) == 1 and p3['rows'][0]['account'] == 'a0'


def test_rotation_moves_overflow_to_archive(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)
    monkeypatch.setattr(audit, 'MAX_ROWS', 3)
    monkeypatch.setattr(audit, 'TRIM_MARGIN', 1)
    # 写 10 条:反复触发滚动(> MAX_ROWS+TRIM_MARGIN=4 才滚)。断言不变量,不断言精确计数。
    for i in range(10):
        audit.record({'event': 'x', 'action': 'X', 'account': 'a%d' % i, 'success': True})
    res = audit.read({}, 1, 50)
    assert res['rows'][0]['account'] == 'a9'                       # 最新在前
    assert res['total'] <= audit.MAX_ROWS + audit.TRIM_MARGIN      # 活动日志有界
    # 归档文件已生成
    import os
    year = __import__('datetime').datetime.now().astimezone().year
    archive = os.path.join(str(tmp_path / 'audit_archive'), 'audit-%d.jsonl' % year)
    assert os.path.exists(archive)
    with open(archive, encoding='utf-8') as f:
        archived = [__import__('json').loads(l) for l in f if l.strip()]
    live_accts = {r['account'] for r in res['rows']}
    arch_accts = {r['account'] for r in archived}
    assert 'a0' in arch_accts                                      # 最旧已滚入归档
    assert live_accts | arch_accts == {'a%d' % i for i in range(10)}  # 无丢失
    assert not (live_accts & arch_accts)                          # 不重复


def test_record_never_raises_on_write_failure(tmp_path, monkeypatch):
    _reset_paths(tmp_path, monkeypatch)

    def boom(*a, **k):
        raise OSError('disk full')

    monkeypatch.setattr('builtins.open', boom)
    # 不应抛出
    audit.record({'event': 'x', 'action': 'X', 'account': 'a', 'success': True})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_audit.py -q`
Expected: FAIL（`AttributeError: module 'audit' has no attribute 'record'`）

- [ ] **Step 3: 写实现**

在 `audit.py` 末尾追加：

```python
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_audit.py -q`
Expected: PASS（全部 passed）

- [ ] **Step 5: 改 .gitignore**

在 `.gitignore` 中 `data/accounts.json` 一行之后追加：

```
data/audit_log.jsonl
data/audit_log.jsonl.tmp
data/audit_archive/
```

- [ ] **Step 6: 提交**

```bash
git add audit.py tests/test_audit.py .gitignore
git commit -m "feat(audit): record/read 存储层 + 惰性滚动归档 + gitignore (V2.7.0)"
```

---

## Task 3: server.py 埋点（中央拦截 + 登录/登出/账号 CRUD 显式补录）

**Files:**
- Modify: `server.py`
- Test: `tests/test_server_audit.py`

**Interfaces:**
- Consumes: `audit.record`、`audit.map_action`、`audit.client_ip`、`audit.UA_MAX`；`auth.parse_cookie_token`、`auth.validate_session`、`auth.load_accounts`
- Produces（供 Task 4 复用）：`CustomHandler._audit_request(self, target=None, detail=None)`、`_dispatch_get`/`_dispatch_post`、`_audit_login`

**背景（已核实的现有代码位置）：**
- `send_response` 未被覆写；`_send_json`/`_json_response`/SSE/静态最终都经 `self.send_response(code)`。
- `end_headers` 覆写在 `server.py` 约 596-602 行。
- `do_GET` 在约 608 行：`parsed=urlparse`、`_auth_gate`、`_authz_gate` 后紧跟 `# 拦截静态文件请求` 分发链，末尾 `super().do_GET()`。
- `do_POST` 在约 720 行：两 gate 后紧跟 `if parsed.path == '/api/followup/add':` 分发链，末尾 `else: send_response(404)`。
- `handle_login` 约 2195、`handle_logout` 约 2215、账号 CRUD 约 2133-2193。

- [ ] **Step 1: 写失败测试**

创建 `tests/test_server_audit.py`：

```python
import json
import http.client
import threading
import auth
import audit
import server


def _start(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    monkeypatch.setattr(audit, "AUDIT_LOG_FILE", str(tmp_path / "audit_log.jsonl"))
    monkeypatch.setattr(audit, "AUDIT_ARCHIVE_DIR", str(tmp_path / "audit_archive"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv, port


def _login(port, account="admin", password="wxtnb"):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": password}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = (r.getheader("Set-Cookie") or "").split(";")[0]
    r.read()
    return conn, cookie


def test_login_success_failure_logout_recorded(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)                       # 成功
        # 失败登录(错密码 BADPASS123)
        conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "BADPASS123"}),
                     {"Content-Type": "application/json"})
        conn.getresponse().read()
        # 登出
        conn.request("POST", "/api/logout", headers={"Cookie": cookie})
        conn.getresponse().read()
        events = [r["event"] for r in audit.read({}, 1, 50)["rows"]]
        assert "login.success" in events
        assert "login.failure" in events
        assert "logout" in events
        # 隐私:错误密码明文绝不落库
        with open(str(tmp_path / "audit_log.jsonl"), encoding="utf-8") as f:
            raw = f.read()
        assert "BADPASS123" not in raw
    finally:
        srv.shutdown(); srv.server_close()


def test_account_create_recorded_with_target_no_password(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        body = {"account": "zhangsan", "password": "SECRET_PW_9", "displayName": "张三",
                "allowedPages": ["projects"], "allowedL4": ["交付一部"]}
        conn.request("POST", "/api/admin/accounts/create", json.dumps(body),
                     {"Content-Type": "application/json", "Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        r.read()
        rows = audit.read({"event": ["account.create"]}, 1, 50)["rows"]
        assert rows and rows[0]["target"] == "zhangsan"
        assert rows[0]["account"] == "admin" and rows[0]["success"] is True
        # 隐私:新账号密码明文绝不落库
        with open(str(tmp_path / "audit_log.jsonl"), encoding="utf-8") as f:
            assert "SECRET_PW_9" not in f.read()
    finally:
        srv.shutdown(); srv.server_close()


def test_read_only_get_not_recorded(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)
        conn.request("GET", "/api/auth/me", headers={"Cookie": cookie})
        conn.getresponse().read()
        # /api/auth/me 不在动作表 → 不产生审计
        assert audit.read({"event": ["login.success"]}, 1, 50)["total"] == 1
        me_rows = [r for r in audit.read({}, 1, 50)["rows"] if r["path"] == "/api/auth/me"]
        assert me_rows == []
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_audit.py -q`
Expected: FAIL（登录/账号事件未被记录，断言失败）

- [ ] **Step 3a: 顶部 import 与 send_response 覆写**

在 `server.py` 顶部已有 `import auth` 处旁追加：

```python
import audit
```

在 `end_headers` 覆写方法之后（约 602 行 `super().end_headers()` 所在方法后）新增：

```python
    def send_response(self, code, message=None):
        self._audit_status = code
        super().send_response(code, message)
```

- [ ] **Step 3b: 新增 `_audit_request` 与 `_audit_login`**

在 `_require_super` 方法之后（约 2089 行后）新增：

```python
    def _audit_request(self, target=None, detail=None):
        """中央审计:map_action 命中的写请求落一条。绝不抛(失败仅记日志)。"""
        try:
            path = urlparse(self.path).path
            mapped = audit.map_action(self.command, path)
            if not mapped:
                return
            event_code, action = mapped
            token = auth.parse_cookie_token(self.headers.get('Cookie'))
            account = auth.validate_session(token) or ''
            rec = auth.load_accounts().get('users', {}).get(account) if account else None
            status = getattr(self, '_audit_status', 0) or 0
            audit.record({
                'event': event_code, 'action': action,
                'account': account,
                'displayName': (rec or {}).get('displayName', account),
                'ip': audit.client_ip(self.headers, self.client_address),
                'userAgent': (self.headers.get('User-Agent') or '')[:audit.UA_MAX],
                'method': self.command, 'path': path,
                'status': status, 'success': 200 <= status < 300,
                'target': target if target is not None else getattr(self, '_audit_target', None),
                'detail': detail if detail is not None else getattr(self, '_audit_detail', None),
            })
        except Exception:
            logger.error('audit 记录失败', exc_info=True)

    def _audit_login(self, account, ok, reason=''):
        """登录/登出以外的认证补录:登录成功/失败。绝不记密码。"""
        try:
            rec = auth.load_accounts().get('users', {}).get(account) if (ok and account) else None
            audit.record({
                'event': 'login.success' if ok else 'login.failure',
                'action': '登录成功' if ok else '登录失败',
                'account': account or '',
                'displayName': (rec or {}).get('displayName', account or ''),
                'ip': audit.client_ip(self.headers, self.client_address),
                'userAgent': (self.headers.get('User-Agent') or '')[:audit.UA_MAX],
                'method': 'POST', 'path': '/api/login',
                'status': 200 if ok else 401, 'success': bool(ok),
                'target': None, 'detail': None if ok else reason,
            })
        except Exception:
            logger.error('audit 登录记录失败', exc_info=True)
```

- [ ] **Step 3c: do_POST 抽 `_dispatch_post` 并 try/finally 包裹**

将 `do_POST` 中两 gate 之后的分发链切成独立方法。用如下 Edit：把

```python
        if not self._authz_gate():
            return

        if parsed.path == '/api/followup/add':
            self.handle_followup_add()
```

替换为

```python
        if not self._authz_gate():
            return
        try:
            self._dispatch_post(parsed)
        finally:
            self._audit_request()

    def _dispatch_post(self, parsed):
        if parsed.path == '/api/followup/add':
            self.handle_followup_add()
```

（其下 `elif ...` 分发链保持原样不动 —— 它们缩进不变，已成为 `_dispatch_post` 的方法体。）

- [ ] **Step 3d: do_GET 抽 `_dispatch_get` 并 try/finally 包裹**

同法处理 `do_GET`。把

```python
        if not self._authz_gate():
            return

        # 拦截静态文件请求，强制添加 charset=utf-8
        if parsed.path.endswith(('.js', '.css', '.html')):
            self._serve_static_with_charset()
            return
```

替换为

```python
        if not self._authz_gate():
            return
        try:
            self._dispatch_get(parsed)
        finally:
            self._audit_request()

    def _dispatch_get(self, parsed):
        # 拦截静态文件请求，强制添加 charset=utf-8
        if parsed.path.endswith(('.js', '.css', '.html')):
            self._serve_static_with_charset()
            return
```

（其下分发链与末尾 `super().do_GET()` 保持原样，成为 `_dispatch_get` 的方法体。）

- [ ] **Step 3e: 登录/登出显式补录 + 账号 CRUD 富字段**

改 `handle_login` 的两处失败与一处成功（保持原响应不变，仅加审计）：

把

```python
        if len(account) > 256 or len(password) > 256:
            self._send_json(401, _error_payload(ERR_AUTH, "账号或密码错误"))
            return
        user = auth.authenticate(account, password)
        if not user:
            self._send_json(401, _error_payload(ERR_AUTH, "账号或密码错误"))
            return
        token = auth.create_session(account)
        self._send_json(200, {"success": True, "user": user},
                        [('Set-Cookie', auth.build_set_cookie(token))])
```

替换为

```python
        if len(account) > 256 or len(password) > 256:
            self._audit_login(account[:256], False, '账号或密码超长')
            self._send_json(401, _error_payload(ERR_AUTH, "账号或密码错误"))
            return
        user = auth.authenticate(account, password)
        if not user:
            exists = account in auth.load_accounts().get('users', {})
            self._audit_login(account, False, '密码错误' if exists else '账号不存在')
            self._send_json(401, _error_payload(ERR_AUTH, "账号或密码错误"))
            return
        token = auth.create_session(account)
        self._audit_login(account, True)
        self._send_json(200, {"success": True, "user": user},
                        [('Set-Cookie', auth.build_set_cookie(token))])
```

改 `handle_logout`：把

```python
    def handle_logout(self):
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        auth.destroy_session(token)
        self._send_json(200, {"success": True},
                        [('Set-Cookie', auth.build_clear_cookie())])
```

替换为

```python
    def handle_logout(self):
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token) or ''
        auth.destroy_session(token)
        if account:
            try:
                rec = auth.load_accounts().get('users', {}).get(account) or {}
                audit.record({
                    'event': 'logout', 'action': '登出', 'account': account,
                    'displayName': rec.get('displayName', account),
                    'ip': audit.client_ip(self.headers, self.client_address),
                    'userAgent': (self.headers.get('User-Agent') or '')[:audit.UA_MAX],
                    'method': 'POST', 'path': '/api/logout',
                    'status': 200, 'success': True, 'target': None, 'detail': None,
                })
            except Exception:
                logger.error('audit 登出记录失败', exc_info=True)
        self._send_json(200, {"success": True},
                        [('Set-Cookie', auth.build_clear_cookie())])
```

在 `handle_admin_account_create` 中，`data` 非空校验通过后、`try:` 之前插入：

```python
        self._audit_target = str(data.get('account', ''))
        self._audit_detail = '授予页面%s L4%s' % (data.get('allowedPages', []), data.get('allowedL4', []))
```

在 `handle_admin_account_update` 中，`account = data.get('account', '')` 之后插入：

```python
        self._audit_target = str(account)
        _changed = []
        if data.get('displayName') is not None:
            _changed.append('显示名')
        if data.get('allowedPages') is not None:
            _changed.append('页面权限')
        if data.get('allowedL4') is not None:
            _changed.append('L4权限')
        if data.get('password'):
            _changed.append('重置密码')
        self._audit_detail = '修改:' + ('、'.join(_changed) or '无')
```

在 `handle_admin_account_delete` 中，`account = data.get('account', '')` 之后插入：

```python
        self._audit_target = str(account)
        self._audit_detail = '删除账号(其会话已强制失效)'
```

在 `handle_account_change_password` 中，`account = auth.validate_session(token)` 校验通过后插入：

```python
        self._audit_detail = '修改本人密码'
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_server_audit.py tests/test_server_auth.py -q`
Expected: PASS（新审计测试 + 既有认证测试均通过，证明未破坏登录流程）

- [ ] **Step 5: 提交**

```bash
git add server.py tests/test_server_audit.py
git commit -m "feat(audit): server 中央埋点 + 登录/登出/账号CRUD显式补录 (V2.7.0)"
```

---

## Task 4: 查询端点 GET /api/admin/audit

**Files:**
- Modify: `server.py`
- Test: `tests/test_server_audit.py`（追加）

**Interfaces:**
- Consumes: `audit.read`、`audit.MAX_ROWS`、Task 3 的 `_dispatch_get`、`_require_super`
- Produces: `GET /api/admin/audit?account=&event=&from=&to=&result=&kw=&page=&pageSize=` → `{success, rows, total, facets}`（超管专属）

- [ ] **Step 1: 写失败测试**

在 `tests/test_server_audit.py` 追加：

```python
def test_audit_endpoint_super_reads_nonsuper_403(tmp_path, monkeypatch):
    srv, port = _start(tmp_path, monkeypatch)
    try:
        conn, cookie = _login(port)                       # admin 超管
        # 造一条业务写(创建普通账号)以产生可读审计
        conn.request("POST", "/api/admin/accounts/create",
                     json.dumps({"account": "puser", "password": "Pw123456", "displayName": "普通",
                                 "allowedPages": ["projects"], "allowedL4": ["交付一部"]}),
                     {"Content-Type": "application/json", "Cookie": cookie})
        conn.getresponse().read()
        # 超管读端点
        conn.request("GET", "/api/admin/audit?pageSize=100", headers={"Cookie": cookie})
        r = conn.getresponse()
        assert r.status == 200
        data = json.loads(r.read())
        assert data["success"] is True
        assert data["total"] >= 1
        assert "accounts" in data["facets"] and "events" in data["facets"]
        # 普通账号登录后读 → 403
        conn2, cookie2 = _login(port, "puser", "Pw123456")
        conn2.request("GET", "/api/admin/audit", headers={"Cookie": cookie2})
        assert conn2.getresponse().status == 403
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_audit.py::test_audit_endpoint_super_reads_nonsuper_403 -q`
Expected: FAIL（端点不存在 → 404 ≠ 200）

- [ ] **Step 3: 写实现**

在 `handle_admin_accounts_list` 方法之后新增：

```python
    def handle_admin_audit(self):
        if self._require_super() is None:
            return
        q = parse_qs(urlparse(self.path).query)

        def one(k, default=''):
            v = q.get(k, [default])
            return v[0] if v else default

        filters = {
            'account': one('account'),
            'event': q.get('event', []),
            'from': one('from'), 'to': one('to'),
            'result': one('result'),
            'kw': one('kw'),
        }
        try:
            page = max(1, int(one('page', '1')))
        except ValueError:
            page = 1
        try:
            page_size = min(audit.MAX_ROWS, max(1, int(one('pageSize', '50'))))
        except ValueError:
            page_size = 50
        result = audit.read(filters, page, page_size)
        self._send_json(200, {'success': True, **result})
```

在 `_dispatch_get` 的分发链中，`elif parsed.path == '/api/admin/accounts':` 分支之后追加：

```python
        elif parsed.path == '/api/admin/audit':
            self.handle_admin_audit()
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_server_audit.py -q`
Expected: PASS（全部通过）

- [ ] **Step 5: 后端全量回归**

Run: `python -m pytest -q`
Expected: PASS（全绿，无回归）

- [ ] **Step 6: 提交**

```bash
git add server.py tests/test_server_audit.py
git commit -m "feat(audit): GET /api/admin/audit 超管查询端点(筛选+分页+facets) (V2.7.0)"
```

---

## Task 5: 前端数据层 lib/audit.ts

**Files:**
- Create: `frontend/src/lib/audit.ts`
- Test: `frontend/src/lib/audit.test.ts`

**Interfaces:**
- Consumes: `@/lib/baseUrl` 的 `apiUrl`；后端 `GET /api/admin/audit` 契约
- Produces:
  - `interface AuditRow`、`interface AuditFilters`、`interface AuditResponse`
  - `fetchAudit(filters: AuditFilters, page: number, pageSize: number): Promise<AuditResponse>`
  - `buildExportRows(rows: AuditRow[]): Record<string, unknown>[]`（纯函数）

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/audit.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildExportRows, type AuditRow } from './audit'

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  ts: '2026-07-08T14:23:01+08:00', event: 'login.success', action: '登录成功',
  account: 'admin', displayName: '超级管理员', ip: '1.2.3.4', userAgent: 'UA',
  method: 'POST', path: '/api/login', status: 200, success: true,
  target: null, detail: null, ...over,
})

describe('buildExportRows', () => {
  it('中文表头映射且结果成功/失败中文化', () => {
    const out = buildExportRows([row(), row({ success: false, action: '登录失败' })])
    expect(out).toHaveLength(2)
    expect(out[0]['时间']).toBe('2026-07-08T14:23:01+08:00')
    expect(out[0]['账号']).toBe('admin')
    expect(out[0]['结果']).toBe('成功')
    expect(out[1]['结果']).toBe('失败')
  })

  it('空 target/detail 输出空串而非 null', () => {
    const out = buildExportRows([row({ target: null, detail: null })])
    expect(out[0]['目标']).toBe('')
    expect(out[0]['详情']).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/audit.test.ts`
Expected: FAIL（`Cannot find module './audit'`）

- [ ] **Step 3: 写实现**

创建 `frontend/src/lib/audit.ts`：

```ts
import { apiUrl } from '@/lib/baseUrl'

export interface AuditRow {
  ts: string
  event: string
  action: string
  account: string
  displayName: string
  ip: string
  userAgent: string
  method: string
  path: string
  status: number
  success: boolean
  target?: string | null
  detail?: string | null
}

export interface AuditFilters {
  account?: string
  event?: string[]
  from?: string
  to?: string
  result?: '' | 'success' | 'failure'
  kw?: string
}

export interface AuditResponse {
  rows: AuditRow[]
  total: number
  facets: { accounts: string[]; events: { code: string; label: string }[] }
}

export async function fetchAudit(
  filters: AuditFilters,
  page: number,
  pageSize: number,
): Promise<AuditResponse> {
  const p = new URLSearchParams()
  if (filters.account) p.set('account', filters.account)
  for (const e of filters.event ?? []) p.append('event', e)
  if (filters.from) p.set('from', filters.from)
  if (filters.to) p.set('to', filters.to)
  if (filters.result) p.set('result', filters.result)
  if (filters.kw) p.set('kw', filters.kw)
  p.set('page', String(page))
  p.set('pageSize', String(pageSize))
  const res = await fetch(apiUrl('/api/admin/audit?' + p.toString()), { credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.message || '获取审计日志失败')
  return data as AuditResponse
}

/** 审计行 → xlsx 导出行(中文表头)。纯函数。 */
export function buildExportRows(rows: AuditRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    时间: r.ts,
    账号: r.account,
    显示名: r.displayName,
    动作: r.action,
    事件码: r.event,
    IP: r.ip,
    方法: r.method,
    路径: r.path,
    状态: r.status,
    结果: r.success ? '成功' : '失败',
    目标: r.target ?? '',
    详情: r.detail ?? '',
  }))
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/audit.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/audit.ts frontend/src/lib/audit.test.ts
git commit -m "feat(audit): 前端 lib/audit.ts 数据层 + buildExportRows (V2.7.0)"
```

---

## Task 6: 审计标签页 AuditLogTab.vue + AdminView 标签化 + 版本号

**Files:**
- Create: `frontend/src/components/AuditLogTab.vue`
- Create: `frontend/src/components/AuditLogTab.test.ts`
- Modify: `frontend/src/views/AdminView.vue`
- Modify: `frontend/src/version.ts`

**Interfaces:**
- Consumes: `@/lib/audit` 的 `fetchAudit`/`buildExportRows`/类型；`@/lib/exportXlsx` 的 `exportRows`
- Produces: `<AuditLogTab />` 组件（自洽,无 props）

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/AuditLogTab.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import AuditLogTab from './AuditLogTab.vue'
import * as auditLib from '@/lib/audit'
import * as xlsx from '@/lib/exportXlsx'

vi.mock('@/lib/audit', async (orig) => {
  const actual = await orig<typeof import('@/lib/audit')>()
  return { ...actual, fetchAudit: vi.fn() }
})

const sampleResp: auditLib.AuditResponse = {
  rows: [{
    ts: '2026-07-08T14:23:01+08:00', event: 'login.success', action: '登录成功',
    account: 'admin', displayName: '超级管理员', ip: '1.2.3.4', userAgent: 'UA',
    method: 'POST', path: '/api/login', status: 200, success: true, target: null, detail: null,
  }],
  total: 1,
  facets: { accounts: ['admin'], events: [{ code: 'login.success', label: '登录成功' }] },
}

describe('AuditLogTab', () => {
  beforeEach(() => {
    vi.mocked(auditLib.fetchAudit).mockResolvedValue(sampleResp)
  })

  it('挂载即拉取并渲染行', async () => {
    const w = mount(AuditLogTab)
    await flushPromises()
    expect(auditLib.fetchAudit).toHaveBeenCalled()
    expect(w.text()).toContain('登录成功')
    expect(w.text()).toContain('1.2.3.4')
  })

  it('导出调用 exportRows', async () => {
    const spy = vi.spyOn(xlsx, 'exportRows').mockImplementation(() => {})
    const w = mount(AuditLogTab)
    await flushPromises()
    await (w.vm as unknown as { onExport: () => Promise<void> }).onExport()
    await flushPromises()
    expect(spy).toHaveBeenCalledOnce()
    expect(spy.mock.calls[0][0]).toContain('审计日志')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/AuditLogTab.test.ts`
Expected: FAIL（`Cannot find module './AuditLogTab.vue'`）

- [ ] **Step 3: 写组件**

创建 `frontend/src/components/AuditLogTab.vue`：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { fetchAudit, buildExportRows, type AuditRow, type AuditFilters, type AuditResponse } from '@/lib/audit'
import { exportRows } from '@/lib/exportXlsx'

const rows = ref<AuditRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const accounts = ref<string[]>([])
const events = ref<{ code: string; label: string }[]>([])

const filters = ref<AuditFilters>({ account: '', event: [], from: '', to: '', result: '', kw: '' })
const dateRange = ref<[string, string] | null>(null)

function applyDateRange() {
  filters.value.from = dateRange.value?.[0] || ''
  filters.value.to = dateRange.value?.[1] || ''
}

async function load() {
  loading.value = true
  try {
    applyDateRange()
    const res: AuditResponse = await fetchAudit(filters.value, page.value, pageSize.value)
    rows.value = res.rows
    total.value = res.total
    accounts.value = res.facets.accounts
    events.value = res.facets.events
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  load()
}

function onReset() {
  filters.value = { account: '', event: [], from: '', to: '', result: '', kw: '' }
  dateRange.value = null
  page.value = 1
  load()
}

function onPageChange(p: number) {
  page.value = p
  load()
}

async function onExport() {
  applyDateRange()
  const res = await fetchAudit(filters.value, 1, 10000)
  if (!res.rows.length) {
    ElMessage.info('无可导出的记录')
    return
  }
  exportRows('审计日志.xlsx', buildExportRows(res.rows))
}

onMounted(load)
defineExpose({ onExport })
</script>

<template>
  <div class="audit-tab">
    <el-form :inline="true" class="audit-filters">
      <el-form-item label="账号">
        <el-select v-model="filters.account" clearable placeholder="全部" style="width: 160px">
          <el-option v-for="a in accounts" :key="a" :label="a" :value="a" />
        </el-select>
      </el-form-item>
      <el-form-item label="事件">
        <el-select v-model="filters.event" multiple collapse-tags clearable placeholder="全部" style="width: 220px">
          <el-option v-for="e in events" :key="e.code" :label="e.label" :value="e.code" />
        </el-select>
      </el-form-item>
      <el-form-item label="日期">
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD"
          start-placeholder="起" end-placeholder="止" style="width: 240px" />
      </el-form-item>
      <el-form-item label="结果">
        <el-select v-model="filters.result" clearable placeholder="全部" style="width: 120px">
          <el-option label="成功" value="success" />
          <el-option label="失败" value="failure" />
        </el-select>
      </el-form-item>
      <el-form-item label="关键字">
        <el-input v-model="filters.kw" clearable placeholder="账号/动作/目标/详情" style="width: 200px"
          @keyup.enter="onSearch" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="onSearch">查询</el-button>
        <el-button @click="onReset">重置</el-button>
        <el-button @click="onExport">导出</el-button>
      </el-form-item>
    </el-form>

    <el-table :data="rows" v-loading="loading" size="small" border stripe>
      <el-table-column prop="ts" label="时间" width="200" class-name="u-num" />
      <el-table-column prop="account" label="账号" width="140" />
      <el-table-column prop="action" label="动作" width="160" />
      <el-table-column prop="ip" label="IP" width="140" class-name="u-num" />
      <el-table-column prop="target" label="目标" width="160" />
      <el-table-column label="结果" width="90">
        <template #default="{ row }">
          <span :class="row.success ? 'ok-text' : 'danger-text'">{{ row.success ? '成功' : '失败' }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="detail" label="详情" min-width="220" show-overflow-tooltip />
    </el-table>

    <div class="audit-pager">
      <el-pagination background layout="total, prev, pager, next" :total="total"
        :page-size="pageSize" :current-page="page" @current-change="onPageChange" />
    </div>
  </div>
</template>

<style scoped>
.audit-filters {
  margin-bottom: var(--gap-card);
}
.audit-pager {
  margin-top: var(--gap-card);
  display: flex;
  justify-content: flex-end;
}
.ok-text {
  color: var(--ok-text);
}
.danger-text {
  color: var(--danger-text);
}
</style>
```

- [ ] **Step 4: 跑组件测试确认通过**

Run: `cd frontend && npx vitest run src/components/AuditLogTab.test.ts`
Expected: PASS

- [ ] **Step 5: AdminView 标签化**

在 `frontend/src/views/AdminView.vue` 的 `<script setup>` 内追加（`ref` 已在首行 `import { ref, reactive, computed, onMounted } from 'vue'` 导入，**不要重复导入**，只加下面两行）：

```ts
import AuditLogTab from '@/components/AuditLogTab.vue'
const activeTab = ref('accounts')
```

把 `<template>` 现有最外层内容包进 el-tabs：将账号管理原有内容整体放入第一个 `el-tab-pane`，第二个挂 `AuditLogTab`。结构为：

```vue
<template>
  <el-tabs v-model="activeTab" class="admin-tabs">
    <el-tab-pane label="账号管理" name="accounts">
      <!-- 此处放入原 AdminView 模板的全部现有内容(账号表格 + 新建/编辑对话框等),原样不动 -->
    </el-tab-pane>
    <el-tab-pane label="审计日志" name="audit">
      <AuditLogTab v-if="activeTab === 'audit'" />
    </el-tab-pane>
  </el-tabs>
</template>
```

（`v-if="activeTab === 'audit'"` 确保切到审计标签才挂载拉取，避免进账号管理页即请求审计。）

- [ ] **Step 6: 版本号 V2.7.0**

改 `frontend/src/version.ts`：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V2.7.0'
export const RELEASE_DATE = '2026-07-08'
```

- [ ] **Step 7: 前端校验**

Run: `cd frontend && npm run typecheck && npx vitest run src/components/AuditLogTab.test.ts src/lib/audit.test.ts && npm run build`
Expected: typecheck 通过、vitest 通过、build 成功

- [ ] **Step 8: 提交**

```bash
git add frontend/src/components/AuditLogTab.vue frontend/src/components/AuditLogTab.test.ts frontend/src/views/AdminView.vue frontend/src/version.ts
git commit -m "feat(audit): AuditLogTab 审计标签页 + AdminView 标签化 + V2.7.0"
```

---

## Task 7: 全量验证与 PROGRESS 收尾

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 2: 更新 PROGRESS.md**

在 `PROGRESS.md` 顶部版本史加入 V2.7.0 条目：账号管理审计（全操作审计）——新增 `audit.py`、`server.py` 中央埋点、`/api/admin/audit` 端点、`AuditLogTab.vue`；仅超管可见、支持筛选/导出；升级须重启后端、不需点更新数据。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): V2.7.0 账号管理审计收官"
```

---

## Self-Review 检查（已随计划完成）

- **Spec 覆盖**：事件目录 A/B/C/D → Task 1 `_ACTION_MAP` + Task 3 登录/登出/账号补录；存储/保留/归档 → Task 1/2；埋点 → Task 3；端点 → Task 4；查看页/导出 → Task 5/6；隐私护栏 → Task 3 测试；版本/打包 → Task 6/7。无遗漏。
- **占位符**：无 TBD/TODO；每个改代码步骤均含完整代码或精确 Edit 前后串。
- **类型/命名一致**：`AuditRow`/`AuditFilters`/`AuditResponse`、`fetchAudit`/`buildExportRows`、`_audit_request`/`_audit_login`/`_dispatch_get`/`_dispatch_post`、`map_action`/`client_ip`/`record`/`read` 全计划一致；`_ACTION_MAP` 中 `('POST','/api/tags')→('tags.save','保存标签')` 与 Task 1 测试断言一致。
