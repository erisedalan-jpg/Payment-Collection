# 账号权限细粒度升级 Phase 2 — 分数据域范围 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 账号在 Phase 1 全局「默认范围」之上，新增 `domainScopes`，为 `project`/`yitian`/`opportunity` 三个数据域各设一个覆盖范围；缺省则回退默认范围，全服务端强制、前端业务页零改动。

**Architecture:** `auth.py` 加 `domainScopes` 字段 + 纯函数 `effective_scope(rec, domain)`（域覆盖优先、否则回退 `allowedL4`/`allowedStaff`）；`server.py` 三个已过滤端点（`analysis_data`/`yitian_data`/`opportunities`）各按自己的域取 `effective_scope` 再过滤，复用 Phase 1 的过滤函数；前端只加 `AdminView` 配置 UI（默认范围 + 可选分域覆盖）。业务页不动。

**Tech Stack:** Python 3.8+ 标准库 + pytest；Vue3 + TS + Element Plus + Pinia + vitest。

## Global Constraints

- **向后兼容**：既有账号无 `domainScopes` → 读作 `{}` → 所有域走默认范围 → 行为与 Phase 1 逐字一致；既有测试必须继续通过。新参一律给默认值。
- **三个域键**（唯一合法）：`project`（analysis_data，含项目内跟进 followupRecords/治理页）、`yitian`（工时）、`opportunity`（商机清单，**只用 l4，staff 恒忽略**）。
- **独立 followup store（risk/temp/payment_key/商机跟进/项目进展）不纳入任何域**——沿用既有「不做 L4 隔离」边界，本期不碰。
- **「显式空覆盖」≠「缺省」**：域配成 `{l4:[],staff:[]}` = 该域看不到；域不配 = 回退默认。
- **`'*'` 短路不变**：某域有效 l4 含 `'*'` → 该域全部。**超管恒全量**。
- **前端业务页零改动、无逐页收窄层**（域=服务端下发单位）。`AuthUser` **不加** `domainScopes`（前端不消费）。
- **完成定义**（CLAUDE.md §6/§7）：`bash verify.sh` 全绿；改 `auth.py`/`server.py` 计算逻辑先补/改测试再改实现。

## 文件结构（改动地图）

| 文件 | 职责 | 改动 |
|---|---|---|
| `auth.py` | 账号模型/校验/CRUD + 有效范围 | 改：加 `domainScopes` 字段/校验/CRUD + 新 `effective_scope` |
| `tests/test_auth_domain_scope.py` | domainScopes/effective_scope 单测 | 建 |
| `tests/test_auth_admin.py` | 既有 public_user 精确键集断言 | 改：断言集合加 `domainScopes`（1 行） |
| `server.py` | HTTP 端点接线 | 改：3 端点用 `effective_scope` + create/update 透传 + 审计 |
| `tests/test_server_data.py` | data 端点集成 | 改：加 project 域覆盖用例 |
| `tests/test_server_admin.py` | admin 端点集成 | 改：加 domainScopes 持久化用例 |
| `tests/test_server_opportunities.py` | 商机域读+写越权集成 | 建 |
| `frontend/src/lib/admin.ts` | 账号 API 封装 | 改：`AdminAccount.domainScopes?` + 载荷 |
| `frontend/src/views/AdminView.vue` | 账号配置界面 | 改：默认范围正名 + 分域覆盖 UI |
| `frontend/src/views/AdminView.test.ts` | AdminView 单测 | 改：加分域覆盖载荷用例 |
| `frontend/src/version.ts` / `PROGRESS.md` | 收尾 | 改 |

---

## Task 1: `auth.py` — `domainScopes` 字段 + `effective_scope` + 校验 + CRUD

**Files:**
- Modify: `auth.py`（`_make_user` ~69、`public_user` ~99、`_validate_str_list` 后加 `_validate_domain_scopes` 与 `effective_scope`、`create_account` ~204、`update_account` ~223、`add_account` ~278、`edit_account` ~287）
- Test: `tests/test_auth_domain_scope.py`（建）、`tests/test_auth_admin.py`（改 1 行断言）

**Interfaces:**
- Consumes: Phase 1 的 `_validate_str_list(values, field, cap=100)`、`allowedL4`/`allowedStaff`。
- Produces:
  - `effective_scope(rec, domain) -> (list, list)`（domain ∈ `{'project','yitian','opportunity'}`；域覆盖优先、否则回退默认范围）
  - `_validate_domain_scopes(value) -> dict`
  - `_make_user(..., domain_scopes=None, ...)`；`public_user` 含 `domainScopes`
  - `create_account(accounts, account, password, display_name, pages, l4, staff=None, domain_scopes=None)`
  - `update_account(..., staff=None, domain_scopes=None, password=None)`
  - `add_account(..., staff=None, domain_scopes=None)`；`edit_account(..., staff=None, domain_scopes=None, password=None)`

- [ ] **Step 1: 建 `tests/test_auth_domain_scope.py`**

```python
import pytest
import auth


def _accounts():
    return {"version": 1, "users": {}}


def test_effective_scope_fallback_to_default():
    rec = {"allowedL4": ["D1"], "allowedStaff": ["E1"]}
    assert auth.effective_scope(rec, "project") == (["D1"], ["E1"])
    assert auth.effective_scope(rec, "yitian") == (["D1"], ["E1"])
    assert auth.effective_scope(rec, "opportunity") == (["D1"], ["E1"])


def test_effective_scope_override_wins():
    rec = {"allowedL4": ["*"], "allowedStaff": [],
           "domainScopes": {"yitian": {"l4": ["Dx"], "staff": ["E9"]}}}
    assert auth.effective_scope(rec, "project") == (["*"], [])       # 缺省回退默认
    assert auth.effective_scope(rec, "yitian") == (["Dx"], ["E9"])   # 覆盖生效


def test_effective_scope_explicit_empty_sees_nothing():
    rec = {"allowedL4": ["*"], "allowedStaff": [],
           "domainScopes": {"project": {"l4": [], "staff": []}}}
    assert auth.effective_scope(rec, "project") == ([], [])          # 显式空≠缺省


def test_create_with_domain_scopes_and_public():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["*"], ["*"], [],
                            {"yitian": {"l4": ["Dx"], "staff": ["E1"]}})
    rec = a["users"]["liu"]
    assert rec["domainScopes"] == {"yitian": {"l4": ["Dx"], "staff": ["E1"]}}
    assert auth.public_user("liu", rec)["domainScopes"] == {"yitian": {"l4": ["Dx"], "staff": ["E1"]}}


def test_domain_scopes_defaults_empty_and_migration():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["*"], ["*"], [])
    assert a["users"]["liu"]["domainScopes"] == {}
    rec = {"displayName": "x", "isSuper": False, "allowedPages": [], "allowedL4": []}
    assert auth.public_user("x", rec)["domainScopes"] == {}          # 旧账号迁移默认


def test_update_domain_scopes_and_none_keeps():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["*"], ["*"], [],
                            {"project": {"l4": ["D1"], "staff": []}})
    a = auth.update_account(a, "liu", domain_scopes={"yitian": {"l4": ["Dy"], "staff": []}})
    assert a["users"]["liu"]["domainScopes"] == {"yitian": {"l4": ["Dy"], "staff": []}}
    a = auth.update_account(a, "liu", display_name="新名")   # domain_scopes=None 不改
    assert a["users"]["liu"]["domainScopes"] == {"yitian": {"l4": ["Dy"], "staff": []}}


def test_domain_scopes_validation():
    with pytest.raises(ValueError):     # 未知域键
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [], {"bogus": {"l4": [], "staff": []}})
    with pytest.raises(ValueError):     # 域值非 dict
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [], {"project": ["D1"]})


def test_opportunity_staff_forced_empty():
    a = auth.create_account(_accounts(), "x", "pw", "x", [], [], [],
                            {"opportunity": {"l4": ["D1"], "staff": ["E1"]}})
    assert a["users"]["x"]["domainScopes"]["opportunity"] == {"l4": ["D1"], "staff": []}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_auth_domain_scope.py -v`
Expected: FAIL（`module 'auth' has no attribute 'effective_scope'` / `create_account() takes 7 positional arguments but 8 were given`）。

- [ ] **Step 3: 改 `auth.py`**

`_make_user`（加 `domain_scopes` 形参与字段）：

```python
def _make_user(password: str, display_name: str, is_super: bool = True,
               pages: list | None = None, l4: list | None = None,
               staff: list | None = None, domain_scopes: dict | None = None,
               must_change: bool = False) -> dict:
    salt = secrets.token_hex(16)
    return {
        'salt': salt,
        'hash': hash_password(password, salt),
        'isSuper': is_super,
        'allowedPages': pages if pages is not None else ['*'],
        'allowedL4': l4 if l4 is not None else ['*'],
        'allowedStaff': staff if staff is not None else [],
        'domainScopes': domain_scopes if domain_scopes is not None else {},
        'displayName': display_name,
        'mustChangePassword': bool(must_change),
    }
```

`public_user`（加 `domainScopes`）：

```python
def public_user(account: str, rec: dict) -> dict:
    return {
        'account': account,
        'displayName': rec.get('displayName', account),
        'isSuper': bool(rec.get('isSuper', False)),
        'allowedPages': rec.get('allowedPages', []),
        'allowedL4': rec.get('allowedL4', []),
        'allowedStaff': rec.get('allowedStaff', []),
        'domainScopes': rec.get('domainScopes', {}),
        'mustChangePassword': bool(rec.get('mustChangePassword', False)),
    }
```

在 `_validate_str_list`（现约 190-201 行）**之后**加域常量、校验与有效范围（均纯函数）：

```python
_SCOPE_DOMAINS = ('project', 'yitian', 'opportunity')


def _validate_domain_scopes(value) -> dict:
    """校验 domainScopes:{域键: {l4:[...], staff:[...]}}。未知域键/非 dict 值 → ValueError。
    商机(opportunity)域 staff 恒清空(不做工号级)。None → {}。"""
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError('domainScopes 须为对象')
    out: dict = {}
    for k, v in value.items():
        if k not in _SCOPE_DOMAINS:
            raise ValueError(f'domainScopes 含未知数据域: {k}')
        if not isinstance(v, dict):
            raise ValueError(f'domainScopes.{k} 须为对象')
        l4 = _validate_str_list(v.get('l4', []), f'domainScopes.{k}.l4')
        staff = _validate_str_list(v.get('staff', []), f'domainScopes.{k}.staff', cap=1000)
        if k == 'opportunity':
            staff = []                                   # 商机不做工号级,恒忽略
        out[k] = {'l4': l4, 'staff': staff}
    return out


def effective_scope(rec: dict, domain: str) -> tuple:
    """(l4_list, staff_list):domainScopes[domain] 覆盖优先,否则回退默认范围(allowedL4/allowedStaff)。
    「显式空覆盖」({l4:[],staff:[]}) 返回空 → 该域看不到;域缺省则回退默认。"""
    ds = (rec.get('domainScopes') or {}).get(domain)
    if isinstance(ds, dict):
        return list(ds.get('l4', []) or []), list(ds.get('staff', []) or [])
    return list(rec.get('allowedL4', []) or []), list(rec.get('allowedStaff', []) or [])
```

`create_account`（加 `domain_scopes`）：

```python
def create_account(accounts: dict, account: str, password: str, display_name: str,
                   pages: list, l4: list, staff: list | None = None,
                   domain_scopes: dict | None = None) -> dict:
    name = _validate_account_name(account)
    _validate_password(password)
    _validate_display_name(display_name)
    users = accounts.get('users', {})
    if name in users:
        raise ValueError(f'账号 {name} 已存在')
    pages = _validate_str_list(pages, 'allowedPages')
    l4 = _validate_str_list(l4, 'allowedL4')
    staff = _validate_str_list(staff or [], 'allowedStaff', cap=1000)
    domain_scopes = _validate_domain_scopes(domain_scopes)
    new_users = dict(users)
    new_users[name] = _make_user(password, (display_name or name)[:64],
                                 is_super=False, pages=pages, l4=l4, staff=staff,
                                 domain_scopes=domain_scopes, must_change=True)
    out = dict(accounts)
    out['users'] = new_users
    return out
```

`update_account`（加 `domain_scopes` kwarg 与分支）：

```python
def update_account(accounts: dict, account: str, *, display_name=None, pages=None,
                   l4=None, staff=None, domain_scopes=None, password=None) -> dict:
    if not isinstance(account, str):
        raise ValueError('账号名须为字符串')
    _validate_display_name(display_name)
    users = accounts.get('users', {})
    if account not in users:
        raise KeyError(account)
    if users[account].get('isSuper'):
        raise ValueError('不可经界面修改超级管理员')
    rec = dict(users[account])
    if display_name is not None:
        rec['displayName'] = (display_name or account)[:64]
    if pages is not None:
        rec['allowedPages'] = _validate_str_list(pages, 'allowedPages')
    if l4 is not None:
        rec['allowedL4'] = _validate_str_list(l4, 'allowedL4')
    if staff is not None:
        rec['allowedStaff'] = _validate_str_list(staff, 'allowedStaff', cap=1000)
    if domain_scopes is not None:
        rec['domainScopes'] = _validate_domain_scopes(domain_scopes)
    if password is not None:
        _validate_password(password)
        salt = secrets.token_hex(16)
        rec['salt'] = salt
        rec['hash'] = hash_password(password, salt)
    new_users = dict(users)
    new_users[account] = rec
    out = dict(accounts)
    out['users'] = new_users
    return out
```

`add_account`/`edit_account`（透传 `domain_scopes`）：

```python
def add_account(account: str, password: str, display_name: str, pages: list, l4: list,
                staff: list | None = None, domain_scopes: dict | None = None) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = create_account(data, account, password, display_name, pages, l4, staff, domain_scopes)
        save_accounts(data)
        name = _validate_account_name(account)
        return public_user(name, data['users'][name])


def edit_account(account: str, *, display_name=None, pages=None, l4=None, staff=None,
                 domain_scopes=None, password=None) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = update_account(data, account, display_name=display_name, pages=pages,
                              l4=l4, staff=staff, domain_scopes=domain_scopes, password=password)
        save_accounts(data)
        return public_user(account, data['users'][account])
```

- [ ] **Step 4: 修既有 `test_auth_admin.py` 的 public_user 精确键集断言（孤儿消费方,主动改）**

`public_user` 新增 `domainScopes` 会让 `tests/test_auth_admin.py::test_list_public_accounts_strips_secrets` 的 `set(a.keys()) == {...}` 断言失败（Phase 1 曾同款）。在该断言的期望集合里加入 `'domainScopes'`（该集合 Phase 1 已含 `'allowedStaff'`），只改这一行、不动其他逻辑。

- [ ] **Step 5: 跑测试确认全过（含既有 auth 不回归）**

Run: `python -m pytest tests/test_auth_domain_scope.py tests/test_auth.py tests/test_auth_admin.py tests/test_auth_staff.py -q`
Expected: 全 PASS。

- [ ] **Step 6: Commit**

```bash
git add auth.py tests/test_auth_domain_scope.py tests/test_auth_admin.py
git commit -m "feat(auth): 账号加 domainScopes(分数据域范围)+ effective_scope,向后兼容默认 {}"
```

---

## Task 2: `server.py` — 三端点按域取 `effective_scope` + create/update 透传 domainScopes

**Files:**
- Modify: `server.py`（`handle_data_json` ~2830、`handle_yitian_data` ~2858、`handle_opportunities_get` 2406、`handle_opportunities_create` 2425、`handle_opportunities_update` 2464、`handle_opportunities_delete` 2505、`handle_admin_account_create` ~3827、`handle_admin_account_update` ~3852）
- Test: `tests/test_server_data.py`、`tests/test_server_admin.py`、`tests/test_server_opportunities.py`（建）

**Interfaces:**
- Consumes: Task 1 `auth.effective_scope(rec, domain)`、`auth.add_account(..., domain_scopes)`、`auth.edit_account(..., domain_scopes=...)`；Phase 1 `_staff_pm_names`、`data_scope.filter_analysis_data`/`scope_yitian_data`、`_opp.filter_for_account`/`can_access_l4`。
- Produces: 各端点按自己的域过滤；`/api/admin/accounts/{create,update}` 接受 `domainScopes`。

- [ ] **Step 1: 在 `tests/test_server_data.py` 追加 project 域覆盖用例**

追加到文件末尾（`_write_analysis`/`_login` 已在文件内；`_write_analysis` 写 P1(D1)/P2(D2)）：

```python
def test_data_project_domain_override(tmp_path, monkeypatch):
    # 默认全部(*),但 project 域覆盖为仅 D1 → /data 仅 D1(证明域覆盖压过默认 *)
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "u": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
              "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
              "domainScopes": {"project": {"l4": ["D1"], "staff": []}}, "displayName": "u"},
    }})
    _write_analysis(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "u")
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": ck})
        body = json.loads(conn.getresponse().read())
        assert [p["projectId"] for p in body["projects"]] == ["P1"]
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 在 `tests/test_server_admin.py` 追加 domainScopes 持久化用例**

追加到文件末尾：

```python
def test_super_create_with_domain_scopes(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(
        port, "POST", "/api/admin/accounts/create", cookie,
        {"account": "dm", "password": "pw12345", "displayName": "分域",
         "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
         "domainScopes": {"yitian": {"l4": ["Dx"], "staff": ["E1"]},
                          "opportunity": {"l4": ["D2"], "staff": ["E9"]}}},
    )
    assert status == 200
    assert data["user"]["domainScopes"]["yitian"] == {"l4": ["Dx"], "staff": ["E1"]}
    assert data["user"]["domainScopes"]["opportunity"] == {"l4": ["D2"], "staff": []}   # 商机 staff 清空
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    dm = next(a for a in lst["accounts"] if a["account"] == "dm")
    assert dm["domainScopes"]["yitian"]["l4"] == ["Dx"]
```

- [ ] **Step 3: 建 `tests/test_server_opportunities.py`（商机域读 + 写越权）**

```python
import json
import threading
import http.client
import auth
import server


def _login(port, account):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    conn.request("POST", "/api/login", json.dumps({"account": account, "password": "p"}),
                 {"Content-Type": "application/json"})
    r = conn.getresponse()
    cookie = r.getheader("Set-Cookie").split(";")[0]
    r.read()
    conn.close()
    return cookie


def _req(port, method, path, cookie, body=None):
    conn = http.client.HTTPConnection("127.0.0.1", port)
    headers = {"Cookie": cookie, "Content-Type": "application/json"}
    conn.request(method, path, json.dumps(body) if body is not None else None, headers)
    r = conn.getresponse()
    status = r.status
    data = json.loads(r.read() or b"{}")
    conn.close()
    return status, data


def test_opportunities_scoped_by_domain(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    # 默认 allowedL4=*,但 opportunity 域覆盖为仅 D2
    auth.save_accounts({"version": 1, "users": {
        "u": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
              "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
              "domainScopes": {"opportunity": {"l4": ["D2"], "staff": []}}, "displayName": "u"},
    }})
    oppf = tmp_path / "opportunities.json"
    oppf.write_text(json.dumps({"rows": [
        {"id": "1", "name": "商机A", "l4": "D1"},
        {"id": "2", "name": "商机B", "l4": "D2"},
    ]}, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "OPPORTUNITIES_FILE", str(oppf))
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        cookie = _login(port, "u")
        # 读:商机域仅 D2 → 只见商机B(即使默认 allowedL4=*)
        status, body = _req(port, "GET", "/api/opportunities", cookie)
        assert status == 200
        assert [r["id"] for r in body["rows"]] == ["2"]
        # 写越权:在 D1 建商机 → 403(商机域仅 D2)
        status2, _ = _req(port, "POST", "/api/opportunities/create", cookie,
                          {"fields": {"name": "新商机", "l4": "D1"}})
        assert status2 == 403
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 4: 跑三个测试确认失败**

Run: `python -m pytest tests/test_server_data.py tests/test_server_admin.py tests/test_server_opportunities.py -q`
Expected: 新用例 FAIL（域覆盖未生效 → data 返 P1+P2；domainScopes 未持久化；商机返 D1+D2、create 返 200 而非 403）。

- [ ] **Step 5: 接线 `handle_data_json`（现约 2830-2836，末尾三行）**

把 `allowed = rec.get('allowedL4', [])` 起的逻辑改为按 project 域：

```python
        allowed, staff = auth.effective_scope(rec, 'project')
        if rec.get('isSuper') or '*' in allowed:
            self._serve_raw_data_file()
            return
        data = _load_analysis_cached()
        if data is None:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, "数据文件不存在"))
            return
        pm_names = _staff_pm_names(staff)
        self._send_json(200, data_scope.filter_analysis_data(data, allowed, pm_names))
```

（注：`allowed` 的赋值行原在取 `data` 之前，改后把 `allowed, staff = ...` 放最前、其余顺序不变。）

- [ ] **Step 6: 接线 `handle_yitian_data`（现约 2858 末尾三行）**

```python
        allowed, staff = auth.effective_scope(rec, 'yitian')
        if rec.get('isSuper') or '*' in allowed:
            self._send_json(200, data)
            return
        self._send_json(200, data_scope.scope_yitian_data(data, allowed, staff))
```

- [ ] **Step 7: 接线商机四处（把 `rec.get('allowedL4', ...)` 换成商机域有效 L4）**

`handle_opportunities_get`（2406）：

```python
            rows = _opp.filter_for_account(store.get('rows', []),
                                           auth.effective_scope(rec, 'opportunity')[0],
                                           bool(rec.get('isSuper')))
```

`handle_opportunities_create`（2425）：

```python
        allowed = auth.effective_scope(rec, 'opportunity')[0] or []
```

`handle_opportunities_update`（2464）：

```python
        allowed = auth.effective_scope(rec, 'opportunity')[0] or []
```

`handle_opportunities_delete`（2505）：

```python
            rows = _opp.filter_for_account(store.get('rows', []),
                                           auth.effective_scope(rec, 'opportunity')[0],
                                           bool(rec.get('isSuper')))
```

- [ ] **Step 8: `handle_admin_account_create` 透传 domainScopes（现约 3826-3832）**

```python
        self._audit_target = str(data.get('account', ''))
        self._audit_detail = '授予页面%s L4%s 员工%s%s' % (
            data.get('allowedPages', []), data.get('allowedL4', []), data.get('allowedStaff', []),
            ('，分域%s' % list((data.get('domainScopes') or {}).keys())) if data.get('domainScopes') else '')
        try:
            user = auth.add_account(
                data.get('account', ''), data.get('password', ''),
                data.get('displayName', ''), data.get('allowedPages', []),
                data.get('allowedL4', []), data.get('allowedStaff', []),
                data.get('domainScopes'))
```

- [ ] **Step 9: `handle_admin_account_update` 透传 domainScopes（现约 3852-3865）**

在 `allowedStaff` 的 `_changed` 分支后加 domainScopes 分支，并在 `edit_account` 调用加 `domain_scopes=`：

```python
        if data.get('allowedStaff') is not None:
            _changed.append('员工范围')
        if data.get('domainScopes') is not None:
            _changed.append('分域范围')
        if data.get('password'):
            _changed.append('重置密码')
        self._audit_detail = '修改:' + ('、'.join(_changed) or '无')
        try:
            user = auth.edit_account(
                account,
                display_name=data.get('displayName'),
                pages=data.get('allowedPages'),
                l4=data.get('allowedL4'),
                staff=data.get('allowedStaff'),
                domain_scopes=data.get('domainScopes'),
                password=data.get('password'))
```

- [ ] **Step 10: 跑三个测试确认全过**

Run: `python -m pytest tests/test_server_data.py tests/test_server_admin.py tests/test_server_opportunities.py -q`
Expected: 全 PASS。

- [ ] **Step 11: 后端全量回归**

Run: `python -m pytest -q`
Expected: 全 PASS（含既有 opportunities/yitian/data/auth 端点无横向回归）。

- [ ] **Step 12: Commit**

```bash
git add server.py tests/test_server_data.py tests/test_server_admin.py tests/test_server_opportunities.py
git commit -m "feat(server): 三数据域各按 effective_scope 过滤 + create/update 透传 domainScopes"
```

---

## Task 3: 前端 `AdminView` 分域覆盖配置 UI

**Files:**
- Modify: `frontend/src/lib/admin.ts`、`frontend/src/views/AdminView.vue`、`frontend/src/views/AdminView.test.ts`

**Interfaces:**
- Consumes: Task 1/2 契约——账号 `domainScopes: {域:{l4,staff}}`；`/api/admin/accounts/{create,update}` 接受 `domainScopes`。
- Produces:
  - `admin.ts`：`AdminAccount.domainScopes?`；`createAccount`/`updateAccount` 载荷加 `domainScopes?`（**可选**——避免 Phase 1 那种必填字段孤儿消费方）。
  - `AdminView.vue`：`form.domainOverrides`（3 域各 `{enabled,l4,staff}`）、`DOMAIN_META`、`buildDomainScopes()`、`scopeLabel` 加「＋分域」标记。

- [ ] **Step 1: 改 `frontend/src/lib/admin.ts`**

`AdminAccount` 加 `domainScopes?`，`createAccount`/`updateAccount` 载荷加 `domainScopes?`：

```typescript
export interface AdminAccount {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
  allowedStaff?: string[]
  domainScopes?: Record<string, { l4: string[]; staff: string[] }>
  mustChangePassword?: boolean
}
```

```typescript
export function createAccount(p: {
  account: string; password: string; displayName: string
  allowedPages: string[]; allowedL4: string[]; allowedStaff: string[]
  domainScopes?: Record<string, { l4: string[]; staff: string[] }>
}): Promise<void> {
  return postJson('/api/admin/accounts/create', p)
}

export function updateAccount(p: {
  account: string; displayName?: string; allowedPages?: string[]
  allowedL4?: string[]; allowedStaff?: string[]
  domainScopes?: Record<string, { l4: string[]; staff: string[] }>
  password?: string
}): Promise<void> {
  return postJson('/api/admin/accounts/update', p)
}
```

- [ ] **Step 2: 在 `AdminView.test.ts` 加分域覆盖载荷用例**

在 `describe('AdminView', ...)` 内追加：

```typescript
  it('分域覆盖:启用域 → 载荷含 domainScopes(商机 staff 强制空)', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'dm'
    vm.form.password = 'pw12345'
    vm.form.displayName = '分域'
    vm.form.allowedPages = ['*']
    vm.form.allowedL4 = ['*']
    vm.form.domainOverrides.yitian = { enabled: true, l4: ['Dx'], staff: ['E001'] }
    vm.form.domainOverrides.opportunity = { enabled: true, l4: ['D2'], staff: ['E001'] }
    await vm.submitForm()
    await flushPromises()
    const payload = vi.mocked(adminApi.createAccount).mock.calls[0][0] as any
    expect(payload.domainScopes).toEqual({
      yitian: { l4: ['Dx'], staff: ['E001'] },
      opportunity: { l4: ['D2'], staff: [] },   // 商机 staff 强制空
    })
    expect(payload.domainScopes.project).toBeUndefined()   // 未启用的域不入载荷
  })
```

（`STUBS` 已 stub `el-select`/`el-option`；新增的 `el-checkbox`/`el-divider` 是纯渲染、jsdom 下无副作用，无需 stub。）

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts`
Expected: 新用例 FAIL（`Cannot set properties of undefined (setting 'yitian')` —— `form.domainOverrides` 尚不存在）。

- [ ] **Step 4: 改 `AdminView.vue` `<script setup>`**

在 `blankForm`（现 19-22 行）加 `domainOverrides`：

```typescript
const DOMAIN_META = [
  { key: 'project', label: '项目&回款', staff: true },
  { key: 'yitian', label: '工时', staff: true },
  { key: 'opportunity', label: '商机', staff: false },
] as const

const blankForm = () => ({
  account: '', password: '', displayName: '',
  allowedPages: [] as string[], allowedL4: [] as string[], allowedStaff: [] as string[],
  domainOverrides: {
    project: { enabled: false, l4: [] as string[], staff: [] as string[] },
    yitian: { enabled: false, l4: [] as string[], staff: [] as string[] },
    opportunity: { enabled: false, l4: [] as string[], staff: [] as string[] },
  } as Record<string, { enabled: boolean; l4: string[]; staff: string[] }>,
})
```

在 `scopeLabel`（现 55-59 行）末尾加「＋分域」标记：

```typescript
function scopeLabel(row: AdminAccount): string {
  const l4 = row.allowedL4.includes('*') ? '全部' : (row.allowedL4.join('、') || '')
  const staff = staffLabels(row.allowedStaff)
  const base = [l4, staff].filter(Boolean).join('；') || '—'
  const hasDomain = row.domainScopes && Object.keys(row.domainScopes).length > 0
  return hasDomain ? `${base}　＋分域` : base
}
```

在 `staffLabels`/`scopeLabel` 之后加 `buildDomainScopes`：

```typescript
function buildDomainScopes(): Record<string, { l4: string[]; staff: string[] }> {
  const out: Record<string, { l4: string[]; staff: string[] }> = {}
  for (const d of DOMAIN_META) {
    const o = form.domainOverrides[d.key]
    if (o.enabled) out[d.key] = { l4: o.l4, staff: d.staff ? o.staff : [] }
  }
  return out
}
```

`openEdit`（现 83-91 行）从 `row.domainScopes` 回填开关态：

```typescript
function openEdit(row: AdminAccount) {
  editing.value = true
  Object.assign(form, blankForm())
  Object.assign(form, {
    account: row.account, password: '', displayName: row.displayName,
    allowedPages: [...row.allowedPages], allowedL4: [...row.allowedL4],
    allowedStaff: [...(row.allowedStaff ?? [])],
  })
  const ds = row.domainScopes ?? {}
  for (const d of DOMAIN_META) {
    const v = ds[d.key]
    form.domainOverrides[d.key] = v
      ? { enabled: true, l4: [...(v.l4 ?? [])], staff: [...(v.staff ?? [])] }
      : { enabled: false, l4: [], staff: [] }
  }
  dialogVisible.value = true
}
```

`submitForm`（现 93-117 行）两分支载荷加 `domainScopes: buildDomainScopes()`：

```typescript
    if (editing.value) {
      await updateAccount({
        account: form.account,
        displayName: form.displayName,
        allowedPages: form.allowedPages,
        allowedL4: form.allowedL4,
        allowedStaff: form.allowedStaff,
        domainScopes: buildDomainScopes(),
        ...(form.password ? { password: form.password } : {}),
      })
      ElMessage.success('已保存')
    } else {
      await createAccount({
        account: form.account, password: form.password, displayName: form.displayName,
        allowedPages: form.allowedPages, allowedL4: form.allowedL4, allowedStaff: form.allowedStaff,
        domainScopes: buildDomainScopes(),
      })
      ElMessage.success('已创建')
    }
```

`defineExpose`（现 140 行）加 `DOMAIN_META`：

```typescript
defineExpose({ dialogVisible, editing, form, openCreate, openEdit, submitForm, onDelete, reload, staffOptions, roster, DOMAIN_META })
```

- [ ] **Step 5: 改 `AdminView.vue` `<template>`——默认范围正名 + 分域覆盖区**

把「可见 L4」表单项 label 改为「默认可见 L4」、「可见员工」改为「默认可见员工」（现 208、214 行 `label`），并在「可见员工」表单项（现 214-220 行）**之后**插入分域覆盖区：

```html
        <el-divider content-position="left">分域覆盖（可选，不设则各域用上面的默认范围）</el-divider>
        <el-form-item v-for="d in DOMAIN_META" :key="d.key" :label="d.label">
          <el-checkbox v-model="form.domainOverrides[d.key].enabled">自定义该域范围</el-checkbox>
          <template v-if="form.domainOverrides[d.key].enabled">
            <el-select v-model="form.domainOverrides[d.key].l4" multiple filterable
              class="admin-select" placeholder="该域可见 L4">
              <el-option label="全部 L4" value="*" />
              <el-option v-for="l4 in l4Options" :key="l4" :label="l4" :value="l4" />
            </el-select>
            <el-select v-if="d.staff" v-model="form.domainOverrides[d.key].staff" multiple filterable
              class="admin-select" placeholder="该域可见员工(按姓名选,存工号)">
              <el-option v-for="o in staffOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </template>
        </el-form-item>
```

- [ ] **Step 6: 跑测试确认全过**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts`
Expected: 全 PASS（新 1 + 既有 Phase 1 的 3 + 更早 4）。

- [ ] **Step 7: 类型检查**

Run: `cd frontend && npm run typecheck`
Expected: 无错误（`domainScopes` 可选、`DOMAIN_META` as const、`form.domainOverrides` 索引类型一致）。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/admin.ts frontend/src/views/AdminView.vue frontend/src/views/AdminView.test.ts
git commit -m "feat(admin-ui): 账号加分域覆盖配置(默认范围 + project/yitian/opportunity 各覆盖)"
```

---

## Task 4: 版本号 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 升版本号**

`frontend/src/version.ts`：`APP_VERSION` 升为 `V4.3.0`（Y 级——账号权限新增分域数据维度），`RELEASE_DATE` 保持 `2026-07-21`。（X 级须用户确认;本项 Y 级：账号模型加分域维度、无新用户页面/整页重设计。执行时若 X/Y 定级存疑,暂停询问用户。）

- [ ] **Step 2: 更新 `PROGRESS.md`**

顶部加一条 `V4.3.0`（细粒度权限 Phase 2：分数据域范围），一句话结论 + 改动文件清单 + 「非纯前端：升级须换 dist + 覆盖 `auth.py`/`server.py` + 重启后端；无需更新数据；无新增页面/路由/pageKey；配置在既有 `/admin`」。把当前 `[~]` 项标 `[x]`。

- [ ] **Step 3: 全量 verify**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "release: V4.3.0 账号权限细粒度 Phase 2(分数据域范围)"
```

---

## Self-Review（对照 spec）

**1. Spec 覆盖**
- §2 数据模型 `domainScopes` + 默认回退 + 显式空≠缺省 + `'*'` + 迁移 → Task 1（`_make_user`/`public_user`/`effective_scope`/校验）。opportunity staff 恒忽略 → Task 1 `_validate_domain_scopes` 的 `if k=='opportunity': staff=[]`。
- §3 三域精确边界（project=analysis_data、yitian、opportunity=商机清单；followup store 不纳入）→ Task 2 只接 3 个已过滤端点、不碰任何 `*_followup` 端点。
- §4 生效（effective_scope + 3 端点 + 商机读写一致 + 超管/`'*'` 短路 + 前端零收窄）→ Task 2 全部；前端零改动 → Task 3 只动 AdminView/admin.ts。
- §5 配置 UX（默认范围正名 + 分域覆盖 + 商机无员工 + ＋分域标记 + AuthUser 不加）→ Task 3。
- §6 安全（服务端强制、商机读写一致、超管不受限、缺省不放大、显式空）→ Task 2 wiring + Task 1 effective_scope。
- §8 测试：auth 单测（effective_scope/校验/迁移）Task 1；server（data/admin/opportunities）Task 2；前端 Task 3；verify Task 4。§9 不做项全程未触碰。

**2. 占位符扫描**：无 TBD/TODO；每个改代码步给完整代码 + 预期输出。

**3. 类型/命名一致性**：`effective_scope(rec, domain)`（Task 1 定义、Task 2 消费一致）；`domain_scopes`(py)/`domainScopes`(json/ts)（auth/server/admin.ts/AdminAccount 一致）；`_SCOPE_DOMAINS=('project','yitian','opportunity')` 与前端 `DOMAIN_META` 键一致；`buildDomainScopes`/`form.domainOverrides`/`DOMAIN_META`（Task 3 定义与消费一致）；商机 staff 强制空两端各做一次（后端 `_validate_domain_scopes` + 前端 `buildDomainScopes`，双保险）。

**孤儿消费方预案（吸取 Phase 1 教训）**：Task 1 Step 4 主动修 `test_auth_admin.py` 的 public_user 精确键集断言；`createAccount`/`updateAccount` 的 `domainScopes` 设为**可选**，故 `lib/admin.test.ts` 无需改（不制造新的必填字段孤儿）。Task 2 Step 11 `python -m pytest -q` 为横向回归闸。
