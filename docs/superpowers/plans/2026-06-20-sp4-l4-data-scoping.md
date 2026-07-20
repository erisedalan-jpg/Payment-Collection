# SP-4 数据量控制（L4 数据隔离） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端按账号 `allowedL4` 过滤 `analysis_data.json` 再下发;超管/`['*']` 原样;前端零改。

**Architecture:** 纯函数 `data_scope.py`(`allowed_project_ids`/`filter_analysis_data`) + `server.py` `/data/analysis_data.json` 专用 handler(超管走原样快路、否则 mtime 缓存解析→过滤→dumps) + 15MB mtime 缓存。

**Tech Stack:** Python 3.8+ 标准库 + pytest。

## Global Constraints

- 后端纯标准库;并发下缓存读写加 `threading.Lock`。
- `filter_analysis_data` 纯函数,不改入参,返回新 dict;`allowed_l4` 含 `'*'` → 返回原 data。
- keep 集含允许项目的 `relatedClosedId`;过滤后重算 `meta.totalProjects/totalClosed/totalPaymentNodes`(lastUpdate 不变)。
- 透传 `dataQuality`/`projectsQuality`/`periodCompare`/`projectOverview`/`tagSeed`(系统/管线统计,非按 L4)。
- 异常项目(orgL4 空)非超管不可见。
- `data_scope.py` 顶部 `from __future__ import annotations`。
- 逐文件 `git add`;commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。不改 version.ts。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `data_scope.py` | 建 | allowed_project_ids + filter_analysis_data(T1) |
| `tests/test_data_scope.py` | 建 | 纯函数(T1) |
| `server.py` | 改 | handle_data_json + _serve_raw_data_file + _load_analysis_cached + do_GET 注册(T2) |
| `tests/test_server_data.py` | 建 | 真 HTTP 切片(T2) |

---

### Task 1: data_scope.py 纯过滤函数

**Files:** Create `data_scope.py`、`tests/test_data_scope.py`

**Interfaces:**
- Produces: `allowed_project_ids(projects: list, allowed_l4: list) -> set`、`filter_analysis_data(data: dict, allowed_l4: list) -> dict`。

- [ ] **Step 1: 写失败测试** —— Create `tests/test_data_scope.py`

```python
import data_scope


def _fixture():
    return {
        "meta": {"lastUpdate": "2026-06-20", "totalProjects": 3, "totalClosed": 1, "totalPaymentNodes": 3},
        "projects": [
            {"projectId": "P1", "orgL4": "D1"},
            {"projectId": "P2", "orgL4": "D2"},
            {"projectId": "P3", "orgL4": "D1", "relatedClosedId": "C9"},
            {"projectId": "PX", "orgL4": ""},
        ],
        "closedProjects": [{"projectId": "C1", "orgL4": "D1"}, {"projectId": "C2", "orgL4": "D2"}],
        "projectPmis": {"P1": {}, "P2": {}, "P3": {}, "C9": {}},
        "paymentNodes": {"P1": [{}, {}], "P2": [{}], "C9": [{}]},
        "paymentRecords": {"P1": {}, "P2": {}},
        "followupRecords": {"P1": {}, "P2": {}},
        "events": [{"projectId": "P1"}, {"projectId": "P2"}, {"projectId": "C9"}],
        "dataQuality": {"summary": {"matchRate": 0.9}},
        "periodCompare": {"lastSync": {}},
    }


def test_allowed_project_ids():
    f = _fixture()
    keep = data_scope.allowed_project_ids(f["projects"], ["D1"])
    assert keep == {"P1", "P3", "C9"}          # D1 项目 + relatedClosedId C9;D2/异常 PX 不入
    assert data_scope.allowed_project_ids(f["projects"], ["*"]) >= {"P1", "P2", "P3", "C9"}


def test_filter_star_passthrough():
    f = _fixture()
    out = data_scope.filter_analysis_data(f, ["*"])
    assert len(out["projects"]) == 4           # 不过滤


def test_filter_by_l4():
    f = _fixture()
    out = data_scope.filter_analysis_data(f, ["D1"])
    assert [p["projectId"] for p in out["projects"]] == ["P1", "P3"]   # 仅 D1(PX 异常排除)
    assert [c["projectId"] for c in out["closedProjects"]] == ["C1"]
    assert set(out["projectPmis"].keys()) == {"P1", "P3", "C9"}        # 含 relatedClosedId
    assert set(out["paymentNodes"].keys()) == {"P1", "C9"}            # P2(D2) 剔除
    assert set(out["paymentRecords"].keys()) == {"P1"}
    assert set(out["followupRecords"].keys()) == {"P1"}
    assert [e["projectId"] for e in out["events"]] == ["P1", "C9"]
    # meta 重算
    assert out["meta"]["totalProjects"] == 2
    assert out["meta"]["totalClosed"] == 1
    assert out["meta"]["totalPaymentNodes"] == 3                       # P1:2 + C9:1
    assert out["meta"]["lastUpdate"] == "2026-06-20"                   # 不变
    # 系统统计透传
    assert out["dataQuality"] == f["dataQuality"]
    assert out["periodCompare"] == f["periodCompare"]
    # 不改入参
    assert len(f["projects"]) == 4


def test_filter_not_mutate_input():
    f = _fixture()
    data_scope.filter_analysis_data(f, ["D1"])
    assert set(f["paymentNodes"].keys()) == {"P1", "P2", "C9"}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_data_scope.py -q`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** —— Create `data_scope.py`

```python
"""按 allowedL4 过滤 analysis_data.json(L4 数据隔离,SP-4)。纯函数,可单测,不改入参。"""
from __future__ import annotations

# projectId 键控的业务 dict(按 keep 集裁键)
_PID_KEYED = (
    'projectPmis', 'paymentNodes', 'projectMilestones', 'paymentRecords',
    'projectProfit', 'naguanMap', 'naguanExclude', 'followupRecords',
)


def allowed_project_ids(projects: list, allowed_l4: list) -> set:
    """orgL4 ∈ allowed_l4 的项目 id ∪ 其 relatedClosedId。allowed_l4 含 '*' → 全部 id(含 relatedClosedId)。"""
    allow = set(allowed_l4 or [])
    star = '*' in allow
    keep: set = set()
    for p in projects or []:
        if not isinstance(p, dict):
            continue
        pid = p.get('projectId')
        if pid is None:
            continue
        org = str(p.get('orgL4') or '').strip()
        if star or org in allow:
            keep.add(pid)
            rel = p.get('relatedClosedId')
            if rel:
                keep.add(rel)
    return keep


def filter_analysis_data(data: dict, allowed_l4: list) -> dict:
    """返回按 allowed_l4 过滤的新 dict;'*' → 原样返回;不改入参 data。"""
    if not isinstance(data, dict):
        return data
    allow = set(allowed_l4 or [])
    if '*' in allow:
        return data

    projects = data.get('projects') or []
    keep = allowed_project_ids(projects, allowed_l4)

    out = dict(data)  # 浅拷顶层(透传块随之保留引用)
    out['projects'] = [p for p in projects
                       if isinstance(p, dict) and str(p.get('orgL4') or '').strip() in allow]
    closed = data.get('closedProjects') or []
    out['closedProjects'] = [c for c in closed
                             if isinstance(c, dict) and str(c.get('orgL4') or '').strip() in allow]

    for key in _PID_KEYED:
        d = data.get(key)
        if isinstance(d, dict):
            out[key] = {k: v for k, v in d.items() if k in keep}

    events = data.get('events')
    if isinstance(events, list):
        out['events'] = [e for e in events if isinstance(e, dict) and e.get('projectId') in keep]

    meta = data.get('meta')
    if isinstance(meta, dict):
        nm = dict(meta)
        nm['totalProjects'] = len(out['projects'])
        nm['totalClosed'] = len(out['closedProjects'])
        pn = out.get('paymentNodes')
        nm['totalPaymentNodes'] = (
            sum(len(v) for v in pn.values() if isinstance(v, list)) if isinstance(pn, dict) else 0
        )
        out['meta'] = nm

    return out
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_data_scope.py -q`
Expected: PASS（4 通过）

- [ ] **Step 5: ruff + 提交**

Run: `ruff check data_scope.py tests/test_data_scope.py`
Expected: 无错误

```bash
git add data_scope.py tests/test_data_scope.py
git commit -m "$(printf 'feat(scope): data_scope 按 allowedL4 过滤 analysis_data(纯函数,含售前 relatedClosedId,重算 meta,透传系统统计)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: server.py `/data/analysis_data.json` 切片 handler + mtime 缓存

**Files:** Modify `server.py`;Create `tests/test_server_data.py`

**Interfaces:**
- Consumes: `data_scope.filter_analysis_data`(T1)、`auth.parse_cookie_token/validate_session/load_accounts`、`_send_json`、`_error_payload`、`ERR_AUTH`/`ERR_NOT_FOUND`、`ANALYSIS_FILE`(均既有)。

- [ ] **Step 1: 写失败测试** —— Create `tests/test_server_data.py`

```python
import json
import http.client
import threading
import auth
import server


def _write_accounts(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    data = {"version": 1, "users": {
        "super": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": True,
                  "allowedPages": ["*"], "allowedL4": ["*"], "displayName": "超管"},
        "d1": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
               "allowedPages": ["*"], "allowedL4": ["D1"], "displayName": "D1管理"},
    }}
    auth.save_accounts(data)


def _write_analysis(tmp_path, monkeypatch):
    f = tmp_path / "analysis_data.json"
    f.write_text(json.dumps({
        "meta": {"lastUpdate": "x", "totalProjects": 2, "totalClosed": 0, "totalPaymentNodes": 0},
        "projects": [{"projectId": "P1", "orgL4": "D1"}, {"projectId": "P2", "orgL4": "D2"}],
        "closedProjects": [], "projectPmis": {"P1": {}, "P2": {}}, "paymentNodes": {},
        "events": [], "dataQuality": {"summary": {}},
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(f))
    # 清缓存(若实现用模块级缓存)
    if hasattr(server, "_analysis_cache"):
        server._analysis_cache["mtime"] = None


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    return conn, cookie


def test_data_scoped_by_l4(tmp_path, monkeypatch):
    _write_accounts(tmp_path, monkeypatch)
    _write_analysis(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        # 超管 → 全量
        conn, ck = _login(port, "super")
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": ck})
        r = conn.getresponse(); body = json.loads(r.read())
        assert {p["projectId"] for p in body["projects"]} == {"P1", "P2"}
        # D1 用户 → 仅 D1
        conn2, ck2 = _login(port, "d1")
        conn2.request("GET", "/data/analysis_data.json", headers={"Cookie": ck2})
        r2 = conn2.getresponse(); body2 = json.loads(r2.read())
        assert [p["projectId"] for p in body2["projects"]] == ["P1"]
        assert set(body2["projectPmis"].keys()) == {"P1"}
        assert body2["meta"]["totalProjects"] == 1
        # 未登录 → 401(门)
        conn3 = http.client.HTTPConnection("127.0.0.1", port)
        conn3.request("GET", "/data/analysis_data.json")
        assert conn3.getresponse().status == 401
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_data.py -q`
Expected: FAIL（无切片 handler,D1 用户拿到全量 P1+P2）

- [ ] **Step 3: 实现** —— 改 `server.py`

顶部 import 区加：`import data_scope`。

在模块级（`ANALYSIS_FILE` 定义之后）加 mtime 缓存：

```python
_analysis_cache = {'mtime': None, 'data': None}
_analysis_cache_lock = threading.Lock()


def _load_analysis_cached():
    try:
        mtime = os.path.getmtime(ANALYSIS_FILE)
    except OSError:
        return None
    with _analysis_cache_lock:
        if _analysis_cache['mtime'] != mtime:
            try:
                with open(ANALYSIS_FILE, 'r', encoding='utf-8') as f:
                    _analysis_cache['data'] = json.load(f)
                _analysis_cache['mtime'] = mtime
            except Exception:
                return None
        return _analysis_cache['data']
```

在 `CustomHandler` 内加两方法：

```python
    def _serve_raw_data_file(self):
        try:
            with open(ANALYSIS_FILE, 'rb') as f:
                body = f.read()
        except OSError:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, "数据文件不存在"))
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_data_json(self):
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        allowed = rec.get('allowedL4', [])
        if rec.get('isSuper') or '*' in allowed:
            self._serve_raw_data_file()
            return
        data = _load_analysis_cached()
        if data is None:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, "数据文件不存在"))
            return
        self._send_json(200, data_scope.filter_analysis_data(data, allowed))
```

在 `do_GET` 的 if/elif 链中（静态 `else` 之前，建议紧接其它 `/api/...` elif 之后、`_serve_static_with_charset`/SPA 兜底之前）加：

```python
        elif parsed.path == '/data/analysis_data.json':
            self.handle_data_json()
```

注意：`_auth_gate` 已在 do_GET 首行拦未登录的 `/data/*`;handle_data_json 内再取 account 用于 allowedL4(经门后必有效,401 分支为防御)。`ERR_NOT_FOUND` 若 server.py 无此常量则用既有等价(检查 `ERR_*` 区,若缺加 `ERR_NOT_FOUND = "not_found"`)。

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_server_data.py -q`
Expected: PASS

- [ ] **Step 5: ruff + 全 pytest + 提交**

Run: `ruff check server.py tests/test_server_data.py && python -m pytest -q`
Expected: 无错误 + 全套件绿（含既有 auth/门测试无回归）

```bash
git add server.py tests/test_server_data.py
git commit -m "$(printf 'feat(scope): /data/analysis_data.json 按账号 allowedL4 切片(超管原样快路+mtime缓存)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## 收尾验证（全部任务后）

```bash
bash verify.sh
```
Expected: 全绿。

手动冒烟（`python server.py` + `cd frontend && npm run dev`）：
- admin(超管)登录 → `/data` 全量、各页全量。
- 手改 `data/accounts.json` 造 `isSuper:false, allowedL4:['某真实L4'], allowedPages:['*']` 账号 → 登录后各页只见该 L4 项目;头部/治理 meta 计数随之;`fetch('/data/analysis_data.json')` 体内 projects 仅该 L4。
- backlog: `/data/*` 其它原始文件(events.json/snapshots 等)仅登录门后、未按 L4 切——前端不取,属后端工件;SP-3 review 建议的"默认拦 BASE_DIR 数据、白名单放行静态"可在后续统一收。
