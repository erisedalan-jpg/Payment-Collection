# 账号权限逐页数据范围 + 配置界面重做 实现计划（V4.3.1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 账号加 `pageScopes`（页 > 域 > 默认 三层范围），服务端按域下发并集、前端逐页收窄；`/admin` 配置界面重做（组级选页 + 默认范围 + 覆盖列表）大幅减点击。

**Architecture:** 后端 `auth.effective_scope(rec,domain,page_key)` 三层解析 + `domain_union_scope` 求域并集，三端点按域并集过滤（复用 Phase 1/2 过滤函数），`/api/auth/me`·`/api/login` 富化 `staffNames`。前端新增 `lib/pageScope.ts`（纯 narrow 函数 + 三层解析镜像）+ 三个 route 感知 scoped-selector composable，各数据 view 换成读 scoped 结果，一个源码扫描守卫测试防漏页。

**Tech Stack:** Python 3.8+ 标准库 + pytest；Vue3 + TS + Pinia + Element Plus + vitest。

## Global Constraints

- **向后兼容**：无 `pageScopes`/`domainScopes` → 全走域/默认 → 行为与 V4.3.0 逐字一致；既有测试必须继续通过；新参给默认值。
- **三层优先级**：`effective(pageKey) = pageScopes[pageKey] ?? domainScopes[domainOf(pageKey)] ?? {allowedL4, allowedStaff}`。`'*' in l4` → 该页全部；`{l4:[],staff:[]}` 显式空 → 看不到。
- **商机域恒无工号级**（staff 两端清空）；**超管恒全量**；**独立 followup store 不裁**（只裁 followup 页展示的项目列表）。
- **pageKey→域 映射单一来源**：后端 `config.PAGE_DOMAINS` / 前端 `lib/pageScope.ts PAGE_DOMAINS`，由跨语言同步测试锁一致。
- **前端收窄是展示级**：服务端下发并集为硬边界，漏改 view 顶多显示并集（不越权），守卫测试堵「偏宽」。
- **`domainScopes`/`pageScopes` 载荷设可选**（避免必填字段孤儿——吸取 Phase 1 教训）。
- **收尾重建默认 base dist**（避免本地版本号/白屏，见既有教训）。
- **完成定义**：`bash verify.sh` 全绿 + 逐页真实数据浏览器冒烟。

## 文件结构（改动地图）

| 文件 | 职责 | 改动 |
|---|---|---|
| `config.py` | 常量 | 加 `PAGE_DOMAINS`/`DOMAIN_PAGES` |
| `auth.py` | 账号模型/解析 | 加 `pageScopes` + `effective_scope(page_key)` + `domain_union_scope` + 校验 |
| `server.py` | 端点 | 3 端点按域并集 + `_user_payload` 富化 staffNames + admin 透传 pageScopes |
| `tests/test_auth_page_scope.py` | 新 | auth 三层/并集/校验单测 |
| `tests/test_server_page_scope.py` | 新 | 端点并集 + staffNames 集成 |
| `frontend/src/lib/pageScope.ts` | 新 | PAGE_DOMAINS + effectiveScope + narrow* 纯函数 |
| `frontend/src/lib/pageScope.test.ts` | 新 | 纯函数单测 + 跨语言同步测试 |
| `frontend/src/lib/auth.ts` | 类型 | AuthUser 加 domainScopes?/pageScopes?/staffNames? |
| `frontend/src/composables/useScopedData.ts` | 新 | useScopedProjects/useScopedYitian/useScopedOpportunities |
| `frontend/src/composables/useScopedData.test.ts` | 新 | selector 随 pageKey 收窄 |
| ~40 个 view/组件 + `stores/filter.ts` | 换 scoped 取数 | 见 Task 5 改点表 |
| `frontend/src/views/__scopeGuard.test.ts` | 新 | 防漏页守卫(扫源码) |
| `frontend/src/lib/admin.ts` | API | AdminAccount/载荷 加 pageScopes? |
| `frontend/src/views/AdminView.vue` | 配置界面 | 组级选页 + 默认范围 + 覆盖列表 |
| `frontend/src/version.ts` / `PROGRESS.md` | 收尾 | 改 |

---

## Task 1: 后端范围模型（auth `pageScopes` + `effective_scope` 三层 + `domain_union_scope` + `PAGE_DOMAINS`）

**Files:**
- Modify: `config.py`（尾部加常量）、`auth.py`（`_make_user`/`public_user`/CRUD/校验 + 两个新函数）
- Test: `tests/test_auth_page_scope.py`（建）、`tests/test_auth_admin.py`（键集断言加 `pageScopes`）

**Interfaces:**
- Consumes: Phase 2 `auth.effective_scope(rec, domain)`、`_validate_domain_scopes`、`_validate_str_list`、`_SCOPE_DOMAINS`。
- Produces:
  - `config.PAGE_DOMAINS: dict[str,str]`（pageKey→域，无数据域页不入表）、`config.DOMAIN_PAGES: dict[str,list]`
  - `auth.effective_scope(rec, domain, page_key=None) -> (list,list)`（三层；page_key=None 时退化为 Phase 2 的域?默认，向后兼容）
  - `auth.domain_union_scope(rec, domain, page_keys) -> (list,list)`（对给定 page_keys 求 effective 并集；任一 `'*'`→`(['*'],[])`）
  - `auth._validate_page_scopes(value) -> dict`
  - `_make_user(..., page_scopes=None, ...)`、`public_user` 含 `pageScopes`、`create_account/update_account/add_account/edit_account` 加 `page_scopes`

- [ ] **Step 1: `config.py` 尾部加 pageKey→域 映射**

```python
# 逐页数据范围(V4.3.1):pageKey → 数据域。无数据域页(about/budget/data)不入表。
# 与前端 lib/pageScope.ts 的 PAGE_DOMAINS 由跨语言同步测试锁一致。
PAGE_DOMAINS = {
    'overview': 'project', 'projects': 'project', 'projects-closed': 'project',
    'activity': 'project', 'insight': 'project', 'insight-milestone': 'project',
    'insight-costdetail': 'project', 'insight-risk': 'project', 'insight-board': 'project',
    'insight-calendar': 'project', 'payment': 'project', 'payment-projects': 'project',
    'payment-nodes': 'project', 'projects-key': 'project', 'temp-followup': 'project',
    'risk-followup': 'project', 'payment-key': 'project', 'governance': 'project',
    'yitian': 'yitian', 'yitian-detail': 'yitian', 'yitian-compliance': 'yitian',
    'yitian-analytics': 'yitian', 'yitian-trend': 'yitian', 'yitian-customer': 'yitian',
    'opportunities-progress': 'opportunity', 'opportunities-board': 'opportunity',
    'opportunity-followup': 'opportunity',
}
DOMAIN_PAGES = {}
for _pk, _dom in PAGE_DOMAINS.items():
    DOMAIN_PAGES.setdefault(_dom, []).append(_pk)
```

- [ ] **Step 2: 建 `tests/test_auth_page_scope.py`**

```python
import pytest
import auth


def _accounts():
    return {"version": 1, "users": {}}


def test_effective_scope_three_tier():
    rec = {"allowedL4": ["D0"], "allowedStaff": ["E0"],
           "domainScopes": {"project": {"l4": ["Ddom"], "staff": []}},
           "pageScopes": {"temp-followup": {"l4": ["Dpage"], "staff": []}}}
    assert auth.effective_scope(rec, "project", "temp-followup") == (["Dpage"], [])   # 页覆盖
    assert auth.effective_scope(rec, "project", "projects") == (["Ddom"], [])          # 域覆盖
    assert auth.effective_scope(rec, "yitian", "yitian") == (["D0"], ["E0"])           # 默认
    assert auth.effective_scope(rec, "project") == (["Ddom"], [])                      # 不传页=Phase2 兼容


def test_effective_scope_explicit_empty_page():
    rec = {"allowedL4": ["*"], "allowedStaff": [], "pageScopes": {"projects": {"l4": [], "staff": []}}}
    assert auth.effective_scope(rec, "project", "projects") == ([], [])
    assert auth.effective_scope(rec, "project", "overview") == (["*"], [])


def test_domain_union_scope():
    rec = {"allowedL4": ["D0"], "allowedStaff": [],
           "pageScopes": {"projects": {"l4": ["Da"], "staff": ["E1"]},
                          "payment": {"l4": ["Db"], "staff": []}}}
    # overview 无覆盖→默认 D0;projects→Da+E1;payment→Db;并集
    l4, staff = auth.domain_union_scope(rec, "project", ["overview", "projects", "payment"])
    assert set(l4) == {"D0", "Da", "Db"} and set(staff) == {"E1"}


def test_domain_union_star_short_circuit():
    rec = {"allowedL4": ["*"], "allowedStaff": []}
    assert auth.domain_union_scope(rec, "project", ["overview", "projects"]) == (["*"], [])


def test_create_with_page_scopes_and_public():
    a = auth.create_account(_accounts(), "u", "pw", "U", ["*"], ["*"], [], None,
                            {"temp-followup": {"l4": ["Dx"], "staff": []}})
    rec = a["users"]["u"]
    assert rec["pageScopes"] == {"temp-followup": {"l4": ["Dx"], "staff": []}}
    assert auth.public_user("u", rec)["pageScopes"] == {"temp-followup": {"l4": ["Dx"], "staff": []}}


def test_page_scopes_defaults_and_migration():
    a = auth.create_account(_accounts(), "u", "pw", "U", ["*"], ["*"], [])
    assert a["users"]["u"]["pageScopes"] == {}
    rec = {"displayName": "x", "isSuper": False, "allowedPages": [], "allowedL4": []}
    assert auth.public_user("x", rec)["pageScopes"] == {}


def test_page_scopes_validation():
    with pytest.raises(ValueError):    # 未知 pageKey
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [], None, {"nope": {"l4": [], "staff": []}})
    with pytest.raises(ValueError):    # 值非 dict
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [], None, {"projects": ["D"]})


def test_opportunity_page_staff_cleared():
    a = auth.create_account(_accounts(), "x", "pw", "x", [], [], [], None,
                            {"opportunities-progress": {"l4": ["D1"], "staff": ["E1"]}})
    assert a["users"]["x"]["pageScopes"]["opportunities-progress"] == {"l4": ["D1"], "staff": []}


def test_update_page_scopes_none_keeps():
    a = auth.create_account(_accounts(), "u", "pw", "U", ["*"], ["*"], [], None,
                            {"projects": {"l4": ["D1"], "staff": []}})
    a = auth.update_account(a, "u", display_name="新")
    assert a["users"]["u"]["pageScopes"] == {"projects": {"l4": ["D1"], "staff": []}}
    a = auth.update_account(a, "u", page_scopes={"payment": {"l4": ["D2"], "staff": []}})
    assert a["users"]["u"]["pageScopes"] == {"payment": {"l4": ["D2"], "staff": []}}
```

- [ ] **Step 3: 跑测试确认失败**

Run: `python -m pytest tests/test_auth_page_scope.py -q`
Expected: FAIL（`effective_scope() takes 2 positional arguments` / `no attribute 'domain_union_scope'` / `create_account() takes ... arguments`）。

- [ ] **Step 4: 改 `auth.py`**

把 Phase 2 的 `effective_scope` 替换为**页感知**版，并在其后加 `domain_union_scope`、`_validate_page_scopes`：

```python
def effective_scope(rec: dict, domain: str, page_key: str | None = None) -> tuple:
    """(l4, staff) 三层解析:pageScopes[page_key] ?? domainScopes[domain] ?? 默认范围。
    page_key=None → 退化为 域 ?? 默认(Phase 2 调用点兼容)。显式空覆盖返回空。"""
    if page_key is not None:
        ps = (rec.get('pageScopes') or {}).get(page_key)
        if isinstance(ps, dict):
            return list(ps.get('l4', []) or []), list(ps.get('staff', []) or [])
    ds = (rec.get('domainScopes') or {}).get(domain)
    if isinstance(ds, dict):
        return list(ds.get('l4', []) or []), list(ds.get('staff', []) or [])
    return list(rec.get('allowedL4', []) or []), list(rec.get('allowedStaff', []) or [])


def domain_union_scope(rec: dict, domain: str, page_keys) -> tuple:
    """对 page_keys 求 effective_scope 并集。任一 l4 含 '*' → (['*'], [])。空 page_keys → 回退默认。"""
    keys = list(page_keys or [])
    if not keys:
        l4, staff = effective_scope(rec, domain, None)
        return (['*'], []) if '*' in l4 else (l4, staff)
    l4set: set = set()
    staffset: set = set()
    for pk in keys:
        l4, staff = effective_scope(rec, domain, pk)
        if '*' in l4:
            return ['*'], []
        l4set.update(l4)
        staffset.update(staff)
    return list(l4set), list(staffset)


def _validate_page_scopes(value) -> dict:
    """校验 pageScopes:{pageKey: {l4,staff}}。未知 pageKey/非 dict 值 → ValueError。
    商机域页 staff 恒清空。None → {}。"""
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError('pageScopes 须为对象')
    import config
    out: dict = {}
    for k, v in value.items():
        dom = config.PAGE_DOMAINS.get(k)
        if dom is None:
            raise ValueError(f'pageScopes 含未知或无数据域页面: {k}')
        if not isinstance(v, dict):
            raise ValueError(f'pageScopes.{k} 须为对象')
        l4 = _validate_str_list(v.get('l4', []), f'pageScopes.{k}.l4')
        staff = _validate_str_list(v.get('staff', []), f'pageScopes.{k}.staff', cap=1000)
        if dom == 'opportunity':
            staff = []
        out[k] = {'l4': l4, 'staff': staff}
    return out
```

`_make_user`（加 `page_scopes` 形参与字段，紧跟 `domainScopes` 之后）：

```python
def _make_user(password, display_name, is_super=True, pages=None, l4=None,
               staff=None, domain_scopes=None, page_scopes=None, must_change=False):
    salt = secrets.token_hex(16)
    return {
        'salt': salt, 'hash': hash_password(password, salt), 'isSuper': is_super,
        'allowedPages': pages if pages is not None else ['*'],
        'allowedL4': l4 if l4 is not None else ['*'],
        'allowedStaff': staff if staff is not None else [],
        'domainScopes': domain_scopes if domain_scopes is not None else {},
        'pageScopes': page_scopes if page_scopes is not None else {},
        'displayName': display_name, 'mustChangePassword': bool(must_change),
    }
```

`public_user` 加 `'pageScopes': rec.get('pageScopes', {})`（紧跟 domainScopes）。

`create_account` 加第 9 参 `page_scopes=None`：签名 `create_account(accounts, account, password, display_name, pages, l4, staff=None, domain_scopes=None, page_scopes=None)`；体内 `page_scopes = _validate_page_scopes(page_scopes)`；`_make_user(..., domain_scopes=domain_scopes, page_scopes=page_scopes, must_change=True)`。

`update_account` 加 kwarg `page_scopes=None`：`if page_scopes is not None: rec['pageScopes'] = _validate_page_scopes(page_scopes)`（紧跟 domain_scopes 分支）。

`add_account` 加 `page_scopes=None` 并透传给 `create_account`；`edit_account` 加 `page_scopes=None` kwarg 并透传给 `update_account(..., page_scopes=page_scopes)`。

- [ ] **Step 5: 修既有 `test_auth_admin.py` 键集断言（孤儿预修）**

`public_user` 新增 `pageScopes` → `tests/test_auth_admin.py::test_list_public_accounts_strips_secrets` 的 `set(a.keys()) == {...}` 期望集合加入 `'pageScopes'`（该集合已含 `allowedStaff`/`domainScopes`），只改这一行。

- [ ] **Step 6: 跑测试确认全过**

Run: `python -m pytest tests/test_auth_page_scope.py tests/test_auth_domain_scope.py tests/test_auth.py tests/test_auth_admin.py tests/test_auth_staff.py -q`
Expected: 全 PASS。

- [ ] **Step 7: Commit**

```bash
git add config.py auth.py tests/test_auth_page_scope.py tests/test_auth_admin.py
git commit -m "feat(auth): 逐页范围三层解析(pageScopes) + domain_union_scope + PAGE_DOMAINS,向后兼容"
```

---

## Task 2: 后端端点按域并集 + `staffNames` 富化 + admin 透传

**Files:**
- Modify: `server.py`（`handle_data_json`/`handle_yitian_data`/商机四处 → `domain_union_scope`；`handle_auth_me`/`handle_login` → `_user_payload`；`handle_admin_account_create/update` 透传 `pageScopes`；新增 `_user_payload`/`_scope_staff_ids` helper）
- Test: `tests/test_server_page_scope.py`（建）、`tests/test_server_admin.py`（加 pageScopes 持久化）

**Interfaces:**
- Consumes: Task 1 `auth.domain_union_scope`、`auth.effective_scope`、`config.DOMAIN_PAGES`；Phase 1 `_staff_pm_names`/`_load_roster_cached`。
- Produces: `server._user_payload(account, rec) -> dict`（`{**public_user, staffNames}`）、`server._scope_staff_ids(rec) -> set`（账号所有 scope 出现的工号）；`/api/auth/me`·`/api/login` 返回含 `staffNames`；`/api/admin/accounts/{create,update}` 接受 `pageScopes`。

- [ ] **Step 1: 在 `tests/test_server_page_scope.py`（建）写端点并集 + staffNames 集成**

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
    body = json.loads(r.read())
    conn.close()
    return cookie, body


def _write_analysis(tmp_path, monkeypatch):
    f = tmp_path / "analysis_data.json"
    f.write_text(json.dumps({
        "meta": {"lastUpdate": "x", "totalProjects": 3, "totalClosed": 0, "totalPaymentNodes": 0},
        "projects": [{"projectId": "P1", "orgL4": "D1", "projectManager": "张三"},
                     {"projectId": "P2", "orgL4": "D2", "projectManager": "李四"},
                     {"projectId": "P3", "orgL4": "D3", "projectManager": "王五"}],
        "closedProjects": [], "projectPmis": {"P1": {}, "P2": {}, "P3": {}}, "paymentNodes": {},
        "events": [], "dataQuality": {"summary": {}},
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(f))
    if hasattr(server, "_analysis_cache"):
        server._analysis_cache["mtime"] = None


def test_data_json_is_domain_union(tmp_path, monkeypatch):
    # project 域内:projects 页覆盖 D1、payment 页覆盖 D2 → /data 下发二者并集(D1+D2,不含 D3)
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {"u": {
        "salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
        "allowedPages": ["*"], "allowedL4": [], "allowedStaff": [], "domainScopes": {},
        "pageScopes": {"projects": {"l4": ["D1"], "staff": []}, "payment": {"l4": ["D2"], "staff": []}},
        "displayName": "u"}}})
    _write_analysis(tmp_path, monkeypatch)
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        ck, _ = _login(port, "u")
        conn = http.client.HTTPConnection("127.0.0.1", port)
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": ck})
        body = json.loads(conn.getresponse().read())
        assert {p["projectId"] for p in body["projects"]} == {"P1", "P2"}   # 并集,无 D3
    finally:
        srv.shutdown(); srv.server_close()


def test_auth_me_has_staff_names(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {"u": {
        "salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
        "allowedPages": ["*"], "allowedL4": [], "allowedStaff": ["E_LI"], "domainScopes": {},
        "pageScopes": {"projects": {"l4": [], "staff": ["E_WANG"]}}, "displayName": "u"}}})
    monkeypatch.setattr(server, "_load_roster_cached",
                        lambda: [{"id": "E_LI", "name": "李四", "l4": "D2"},
                                 {"id": "E_WANG", "name": "王五", "l4": "D3"},
                                 {"id": "E_OTHER", "name": "赵六", "l4": "D9"}])
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        ck, login_body = _login(port, "u")
        assert login_body["user"]["staffNames"] == {"E_LI": "李四", "E_WANG": "王五"}   # 仅 scope 工号,不含 E_OTHER
        conn = http.client.HTTPConnection("127.0.0.1", port)
        conn.request("GET", "/api/auth/me", headers={"Cookie": ck})
        me = json.loads(conn.getresponse().read())
        assert me["user"]["staffNames"] == {"E_LI": "李四", "E_WANG": "王五"}
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 2: 在 `tests/test_server_admin.py` 追加 pageScopes 持久化用例**

```python
def test_super_create_with_page_scopes(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(port, "POST", "/api/admin/accounts/create", cookie,
        {"account": "pp", "password": "pw12345", "displayName": "逐页",
         "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
         "pageScopes": {"temp-followup": {"l4": ["Dx"], "staff": []},
                        "opportunities-progress": {"l4": ["D2"], "staff": ["E9"]}}})
    assert status == 200
    assert data["user"]["pageScopes"]["temp-followup"] == {"l4": ["Dx"], "staff": []}
    assert data["user"]["pageScopes"]["opportunities-progress"] == {"l4": ["D2"], "staff": []}  # 商机 staff 清空
```

- [ ] **Step 3: 跑测试确认失败**

Run: `python -m pytest tests/test_server_page_scope.py tests/test_server_admin.py -q`
Expected: 新用例 FAIL（并集未生效返 D1..D3 或按域返旧口径；无 staffNames；pageScopes 未持久化）。

- [ ] **Step 4: 在 `server.py` 加 `_scope_staff_ids` + `_user_payload`（放 `_staff_pm_names` 之后）**

```python
def _scope_staff_ids(rec):
    """账号 default/域/页 scope 里出现的全部工号集(供 staffNames 解析)。"""
    ids = set(rec.get('allowedStaff') or [])
    for scopes in ((rec.get('domainScopes') or {}), (rec.get('pageScopes') or {})):
        for v in scopes.values():
            if isinstance(v, dict):
                ids.update(v.get('staff') or [])
    return ids


def _user_payload(account, rec):
    """public_user + staffNames(仅该账号 scope 工号→姓名,前端 PM 匹配用)。"""
    payload = auth.public_user(account, rec)
    ids = _scope_staff_ids(rec)
    if ids:
        payload['staffNames'] = {r.get('id'): r.get('name') for r in _load_roster_cached()
                                 if r.get('id') in ids and r.get('name')}
    else:
        payload['staffNames'] = {}
    return payload
```

- [ ] **Step 5: `handle_auth_me`（现约 3986）与 `handle_login`（现约 3921-3929）改用 `_user_payload`**

`handle_auth_me` 末行：`self._send_json(200, {"success": True, "user": self._user_payload(account, rec)})`（把 `_user_payload` 挂成实例方法或模块函数——按现有 helper 风格；此处按模块函数 `_user_payload(account, rec)` 调用即可，如与类方法风格不符则改 `self._user_payload`）。

`handle_login`：`authenticate` 成功后，改为重新取 rec 并富化——把 `user = auth.authenticate(...)` 之后的成功分支返回体从 `{"success": True, "user": user}` 改为：

```python
        token = auth.create_session(account)
        self._audit_login(account, True)
        rec = auth.load_accounts().get('users', {}).get(account)
        self._send_json(200, {"success": True, "user": _user_payload(account, rec)},
                        [('Set-Cookie', auth.build_set_cookie(token))])
```

（`_user_payload`/`_scope_staff_ids` 定义在模块级函数区，与 `_staff_pm_names` 同级；`handle_*` 内直接按名调用。）

- [ ] **Step 6: 三端点改用 `domain_union_scope`**

`handle_data_json`（现 `allowed, staff = auth.effective_scope(rec, 'project')` 行）改为：

```python
        allowed, staff = auth.domain_union_scope(
            rec, 'project', [k for k in config.DOMAIN_PAGES['project'] if _can_page(rec, k)])
```

`handle_yitian_data`（现 `allowed, staff = auth.effective_scope(rec, 'yitian')` 行）改为：

```python
        allowed, staff = auth.domain_union_scope(
            rec, 'yitian', [k for k in config.DOMAIN_PAGES['yitian'] if _can_page(rec, k)])
```

商机四处（现 `auth.effective_scope(rec, 'opportunity')[0]`）改为 `auth.domain_union_scope(rec, 'opportunity', [k for k in config.DOMAIN_PAGES['opportunity'] if _can_page(rec, k)])[0]`。

其中 `_can_page` 加在模块函数区（账号是否可访问某页，`'*'` 或含 key）：

```python
def _can_page(rec, page_key):
    pages = rec.get('allowedPages') or []
    return '*' in pages or page_key in pages
```

（`config` 已在 server.py 导入。超管/`'*'` 短路：并集里任一 `'*'` → 返回 `(['*'],[])` → 现有 `if isSuper or '*' in allowed` 分支照旧全量。）

- [ ] **Step 7: `handle_admin_account_create/update` 透传 `pageScopes`**

create：`add_account(..., data.get('domainScopes'), data.get('pageScopes'))`；审计详情追加 `('，逐页%d' % len(data.get('pageScopes') or {})) if data.get('pageScopes') else ''`。
update：`_changed` 加 `if data.get('pageScopes') is not None: _changed.append('逐页范围')`；`edit_account(..., domain_scopes=data.get('domainScopes'), page_scopes=data.get('pageScopes'), password=...)`。

- [ ] **Step 8: 跑测试确认全过 + 后端全量回归**

Run: `python -m pytest tests/test_server_page_scope.py tests/test_server_admin.py tests/test_server_data.py tests/test_server_opportunities.py -q && python -m pytest -q`
Expected: 全 PASS（含既有端点无横向回归）。

- [ ] **Step 9: Commit**

```bash
git add server.py tests/test_server_page_scope.py tests/test_server_admin.py
git commit -m "feat(server): 三端点按域并集下发 + auth 富化 staffNames + admin 透传 pageScopes"
```

---

## Task 3: 前端 scope 纯函数库 `lib/pageScope.ts` + AuthUser 字段 + 跨语言同步测试

**Files:**
- Create: `frontend/src/lib/pageScope.ts`、`frontend/src/lib/pageScope.test.ts`
- Modify: `frontend/src/lib/auth.ts`（AuthUser 加字段）

**Interfaces:**
- Consumes: `PageKey`（`lib/pageAccess`）、`AnalysisData`/`YitianData` 类型。
- Produces:
  - `PAGE_DOMAINS: Record<PageKey, ScopeDomain>`（与后端 `config.PAGE_DOMAINS` 同）、`type ScopeDomain = 'project'|'yitian'|'opportunity'`
  - `effectiveScope(user, pageKey) -> {l4, staff}`（三层镜像）
  - `narrowProjects(data, scope, staffNames)`、`narrowYitian(data, scope)`、`narrowOpportunities(rows, scope)`（纯函数，`'*'`→原样，显式空→空）
  - `AuthUser` 加 `domainScopes?`/`pageScopes?`/`staffNames?`

- [ ] **Step 1: 改 `frontend/src/lib/auth.ts` 的 `AuthUser`（加三字段，均可选）**

```typescript
export interface AuthUser {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
  allowedStaff?: string[]
  domainScopes?: Record<string, { l4: string[]; staff: string[] }>
  pageScopes?: Record<string, { l4: string[]; staff: string[] }>
  staffNames?: Record<string, string>
  mustChangePassword?: boolean
}
```

- [ ] **Step 2: 建 `frontend/src/lib/pageScope.test.ts`（含跨语言同步测试）**

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PAGE_DOMAINS, effectiveScope, narrowProjects, narrowYitian, narrowOpportunities } from './pageScope'
import type { AuthUser } from './auth'

const U = (o: Partial<AuthUser>): AuthUser =>
  ({ account: 'u', displayName: 'u', isSuper: false, allowedPages: ['*'], allowedL4: [], ...o })

describe('effectiveScope 三层', () => {
  it('页 > 域 > 默认', () => {
    const u = U({ allowedL4: ['D0'], domainScopes: { project: { l4: ['Ddom'], staff: [] } },
                  pageScopes: { 'temp-followup': { l4: ['Dpage'], staff: [] } } })
    expect(effectiveScope(u, 'temp-followup')).toEqual({ l4: ['Dpage'], staff: [] })
    expect(effectiveScope(u, 'projects')).toEqual({ l4: ['Ddom'], staff: [] })
    expect(effectiveScope(u, 'yitian')).toEqual({ l4: ['D0'], staff: [] })
  })
  it('显式空覆盖', () => {
    const u = U({ allowedL4: ['*'], pageScopes: { projects: { l4: [], staff: [] } } })
    expect(effectiveScope(u, 'projects')).toEqual({ l4: [], staff: [] })
    expect(effectiveScope(u, 'overview')).toEqual({ l4: ['*'], staff: [] })
  })
})

describe('narrowProjects', () => {
  const data = { projects: [
    { projectId: 'P1', orgL4: 'D1', projectManager: '张三' },
    { projectId: 'P2', orgL4: 'D2', projectManager: '李四' }],
    projectPmis: { P1: {}, P2: {} }, paymentNodes: { P1: [{}], P2: [{}] } } as never
  it("'*' 原样", () => {
    expect(narrowProjects(data, { l4: ['*'], staff: [] }, {}).projects.length).toBe(2)
  })
  it('按 L4', () => {
    const out = narrowProjects(data, { l4: ['D1'], staff: [] }, {})
    expect(out.projects.map((p: { projectId: string }) => p.projectId)).toEqual(['P1'])
    expect(Object.keys(out.paymentNodes)).toEqual(['P1'])
  })
  it('按项目经理姓名(经 staffNames 解析)', () => {
    const out = narrowProjects(data, { l4: [], staff: ['E_LI'] }, { E_LI: '李四' })
    expect(out.projects.map((p: { projectId: string }) => p.projectId)).toEqual(['P2'])
  })
})

describe('narrowYitian / narrowOpportunities', () => {
  it('yitian 按 L4∪工号,issues.i 重映射', () => {
    const y = { roster: [{ id: 'A1', l4: 'D1' }, { id: 'B1', l4: 'D2' }],
      entries: [{ e: 'B1' }, { e: 'A1' }], issues: [{ i: 0 }, { i: 1 }] } as never
    const out = narrowYitian(y, { l4: ['D1'], staff: [] })
    expect(out.roster.map((r: { id: string }) => r.id)).toEqual(['A1'])
    expect(out.entries.map((e: { e: string }) => e.e)).toEqual(['A1'])
    expect(out.issues).toEqual([{ i: 0 }])
  })
  it('opportunities 按 L4', () => {
    const rows = [{ id: '1', l4: 'D1' }, { id: '2', l4: 'D2' }]
    expect(narrowOpportunities(rows, { l4: ['D2'], staff: [] }).map((r) => r.id)).toEqual(['2'])
  })
})

it('PAGE_DOMAINS 与后端 config.py 一致(跨语言同步)', () => {
  const py = readFileSync(resolve(__dirname, '../../../config.py'), 'utf-8')
  const block = py.slice(py.indexOf('PAGE_DOMAINS = {'), py.indexOf('DOMAIN_PAGES'))
  const pyMap: Record<string, string> = {}
  for (const m of block.matchAll(/'([a-z-]+)':\s*'(project|yitian|opportunity)'/g)) pyMap[m[1]] = m[2]
  expect(PAGE_DOMAINS).toEqual(pyMap)
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/pageScope.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 建 `frontend/src/lib/pageScope.ts`**

```typescript
import type { PageKey } from './pageAccess'
import type { AuthUser } from './auth'

export type ScopeDomain = 'project' | 'yitian' | 'opportunity'
export interface Scope { l4: string[]; staff: string[] }

// 与后端 config.py PAGE_DOMAINS 同(跨语言同步测试锁一致)。无数据域页不入表。
export const PAGE_DOMAINS: Record<string, ScopeDomain> = {
  overview: 'project', projects: 'project', 'projects-closed': 'project', activity: 'project',
  insight: 'project', 'insight-milestone': 'project', 'insight-costdetail': 'project',
  'insight-risk': 'project', 'insight-board': 'project', 'insight-calendar': 'project',
  payment: 'project', 'payment-projects': 'project', 'payment-nodes': 'project',
  'projects-key': 'project', 'temp-followup': 'project', 'risk-followup': 'project',
  'payment-key': 'project', governance: 'project',
  yitian: 'yitian', 'yitian-detail': 'yitian', 'yitian-compliance': 'yitian',
  'yitian-analytics': 'yitian', 'yitian-trend': 'yitian', 'yitian-customer': 'yitian',
  'opportunities-progress': 'opportunity', 'opportunities-board': 'opportunity',
  'opportunity-followup': 'opportunity',
}

/** 三层解析:pageScopes[page] ?? domainScopes[域] ?? 默认(allowedL4/allowedStaff)。 */
export function effectiveScope(user: AuthUser, pageKey: PageKey): Scope {
  const dom = PAGE_DOMAINS[pageKey]
  const ps = user.pageScopes?.[pageKey]
  if (ps) return { l4: ps.l4 ?? [], staff: ps.staff ?? [] }
  const ds = dom ? user.domainScopes?.[dom] : undefined
  if (ds) return { l4: ds.l4 ?? [], staff: ds.staff ?? [] }
  return { l4: user.allowedL4 ?? [], staff: user.allowedStaff ?? [] }
}

function _keep(orgL4: string, pm: string, l4set: Set<string>, names: Set<string>): boolean {
  return l4set.has(orgL4) || (!!pm && names.has(pm))
}

/** 收窄 analysis_data(projects + 关联 pid 键 map);'*'→原样;显式空→空。staffNames:工号→姓名。 */
export function narrowProjects(data: any, scope: Scope, staffNames: Record<string, string>): any {
  if (!data) return data
  const l4set = new Set(scope.l4)
  if (l4set.has('*')) return data
  const names = new Set(scope.staff.map((id) => staffNames[id]).filter(Boolean))
  const keep = new Set<string>()
  for (const p of (data.projects ?? [])) {
    if (_keep(String(p.orgL4 ?? '').trim(), String(p.projectManager ?? '').trim(), l4set, names)) {
      keep.add(p.projectId)
      if (p.relatedClosedId) keep.add(p.relatedClosedId)
    }
  }
  const pidKeyed = ['projectPmis', 'paymentNodes', 'projectMilestones', 'paymentRecords', 'projectProfit', 'followupRecords', 'tagSeed']
  const out: any = { ...data }
  out.projects = (data.projects ?? []).filter((p: any) => keep.has(p.projectId))
  out.closedProjects = (data.closedProjects ?? []).filter((c: any) => l4set.has(String(c.orgL4 ?? '').trim()))
  for (const k of pidKeyed) if (data[k] && typeof data[k] === 'object')
    out[k] = Object.fromEntries(Object.entries(data[k]).filter(([id]) => keep.has(id)))
  if (Array.isArray(data.events)) out.events = data.events.filter((e: any) => keep.has(e.projectId))
  return out
}

/** 收窄 yitian_data(roster/entries/issues,issues.i 重映射);'*'→原样;显式空→空。 */
export function narrowYitian(data: any, scope: Scope): any {
  if (!data) return data
  const l4set = new Set(scope.l4)
  if (l4set.has('*')) return data
  const staff = new Set(scope.staff)
  const keepRoster = (data.roster ?? []).filter((p: any) => l4set.has(String(p.l4 ?? '').trim()) || staff.has(p.id))
  const keepIds = new Set(keepRoster.map((p: any) => p.id))
  const o2n = new Map<number, number>()
  const keepEntries: any[] = []
  for (let i = 0; i < (data.entries ?? []).length; i++) {
    if (keepIds.has(data.entries[i].e)) { o2n.set(i, keepEntries.length); keepEntries.push(data.entries[i]) }
  }
  const keepIssues = (data.issues ?? []).filter((it: any) => o2n.has(it.i)).map((it: any) => ({ ...it, i: o2n.get(it.i) }))
  return { ...data, roster: keepRoster, entries: keepEntries, issues: keepIssues }
}

/** 收窄商机行(按 l4);'*'→原样。 */
export function narrowOpportunities<T extends { l4?: string }>(rows: T[], scope: Scope): T[] {
  const l4set = new Set(scope.l4)
  if (l4set.has('*')) return rows
  return rows.filter((r) => l4set.has(String(r.l4 ?? '').trim()))
}
```

- [ ] **Step 5: 跑测试确认全过**

Run: `cd frontend && npx vitest run src/lib/pageScope.test.ts`
Expected: 全 PASS（含跨语言同步测试读 config.py 比对）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/pageScope.ts frontend/src/lib/pageScope.test.ts frontend/src/lib/auth.ts
git commit -m "feat(fe-scope): lib/pageScope 三层解析 + narrow 纯函数 + PAGE_DOMAINS 同步测试"
```

---

## Task 4: 三个 route 感知 scoped-selector composable

**Files:**
- Create: `frontend/src/composables/useScopedData.ts`、`frontend/src/composables/useScopedData.test.ts`

**Interfaces:**
- Consumes: Task 3 `effectiveScope`/`narrow*`；`useDataStore`/`useYitianStore`/`useOpportunitiesStore`；`useAuthStore`；`useRoute().meta.pageKey`。
- Produces:
  - `useScopedProjects() -> ComputedRef<AnalysisData|null>`（当前页收窄后的 analysis_data）
  - `useScopedYitian() -> ComputedRef<YitianData|null>`
  - `useScopedOpportunities() -> ComputedRef<Row[]>`

- [ ] **Step 1: 建 `frontend/src/composables/useScopedData.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useScopedProjects } from './useScopedData'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'

const pageKey = ref<string>('projects')
vi.mock('vue-router', () => ({ useRoute: () => ({ meta: { get pageKey() { return pageKey.value } } }) }))

describe('useScopedProjects', () => {
  beforeEach(() => { setActivePinia(createPinia()); pageKey.value = 'projects' })
  it('按当前页 effectiveScope 收窄', () => {
    const d = useDataStore(); d.$patch({ data: { projects: [
      { projectId: 'P1', orgL4: 'D1' }, { projectId: 'P2', orgL4: 'D2' }], projectPmis: { P1: {}, P2: {} } } as never })
    const auth = useAuthStore()
    auth.user = { account: 'u', displayName: 'u', isSuper: false, allowedPages: ['*'], allowedL4: ['*'],
      pageScopes: { projects: { l4: ['D1'], staff: [] } } } as never
    const scoped = useScopedProjects()
    expect(scoped.value?.projects.map((p: { projectId: string }) => p.projectId)).toEqual(['P1'])
    pageKey.value = 'overview'   // overview 无覆盖→默认 * →不收窄
    expect(scoped.value?.projects.length).toBe(2)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/composables/useScopedData.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 建 `frontend/src/composables/useScopedData.ts`**

```typescript
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useYitianStore } from '@/stores/yitian'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { useAuthStore } from '@/stores/auth'
import { effectiveScope, narrowProjects, narrowYitian, narrowOpportunities } from '@/lib/pageScope'
import type { PageKey } from '@/lib/pageAccess'

function currentScope() {
  const auth = useAuthStore()
  const route = useRoute()
  const pk = route.meta.pageKey as PageKey | undefined
  if (!auth.user || auth.isSuper || !pk) return null   // 超管/无 pageKey → 不收窄
  return effectiveScope(auth.user, pk)
}

export function useScopedProjects() {
  const data = useDataStore()
  const auth = useAuthStore()
  return computed(() => {
    const s = currentScope()
    return s ? narrowProjects(data.data, s, auth.user?.staffNames ?? {}) : data.data
  })
}

export function useScopedYitian() {
  const store = useYitianStore()
  return computed(() => {
    const s = currentScope()
    return s ? narrowYitian(store.data, s) : store.data
  })
}

export function useScopedOpportunities() {
  const store = useOpportunitiesStore()
  return computed(() => {
    const s = currentScope()
    return s ? narrowOpportunities(store.rows, s) : store.rows
  })
}
```

- [ ] **Step 4: 跑测试确认全过**

Run: `cd frontend && npx vitest run src/composables/useScopedData.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useScopedData.ts frontend/src/composables/useScopedData.test.ts
git commit -m "feat(fe-scope): 三个 route 感知 scoped-selector composable"
```

---

## Task 5: 各 view 换 scoped 取数 + 防漏页守卫

**Files:** 见下改点表（约 40 处）。Test: `frontend/src/views/__scopeGuard.test.ts`（建）。

**Interfaces:** Consumes Task 4 `useScopedProjects/useScopedYitian/useScopedOpportunities`。

**统一变换规则**：在每个改点 view 顶部 `import { useScopedProjects } from '@/composables/useScopedData'`（yitian/opp 同理），加 `const scoped = useScopedProjects()`，把该 view 里**读展示数据**的 `data.data?.<字段>` 替换为 `scoped.value?.<字段>`（yitian：把传给 lib 聚合的 `store.data` 换成 `useScopedYitian()` 的 `scopedData.value`；opp：`store.rows` → `useScopedOpportunities().value`）。**非展示用途（下表「例外」）不改。**

### 5.1 project 域改点（换 `data.data?.X` → `scoped.value?.X`）

| view | 行 | 表达式 |
|---|---|---|
| ProjectsView.vue | 40 | `data.data?.projects`（主表）|
| ProjectsView.vue | 178,181,182 | 导出 payload 的 projects/paymentNodes/projectMilestones（所见即所导，随主表收窄）|
| OverviewView.vue | 47 | `data.data?.projects`（baseProjects 源）|
| OverviewView.vue | 149 | `data.data?.events` |
| InsightView.vue | 34 | `data.data?.projects` |
| CostDetailView.vue | 52 | `data.data?.projects` |
| MilestoneView.vue | 50,52 | `projects` / `projectMilestones` |
| RiskBoardView.vue | 24 | `data.data?.projects` |
| ClosedProjectsView.vue | 29 | `data.data?.closedProjects` |
| ActivityView.vue | 40 | `data.data?.events`（展示时间线；45-46/62-63/80-81 的 enrich map/L4 选项**不改**）|
| BoardView.vue | 57,62 | `projects` / `paymentNodes` |
| CalendarView.vue | 50,57 | `paymentNodes`+`projects`+`projectPmis` / `paymentRecords` |
| PayNodesView.vue | 35,42 | `projects` / `paymentNodes`+`projectPmis` |
| PayProjectsView.vue | 41,49 | `projects` / `paymentNodes` |
| RiskFollowupView.vue | 43,44 | `projects` / `projectPmis` |
| PaymentKeyFollowupView.vue | 49,50,53 | `projects` / `projectPmis` / `paymentNodes`+`projectMilestones` |
| KeyProjectsView.vue | 48,49 | `projects` / `projectPmis` |
| components/TempInstancePanel.vue | 45,46,47-49 | `projects` / `projectPmis` / paymentNodes+projectMilestones |
| ProjectDetailView.vue | 52 | `data.data?.projects`.find（越权 id 落空→404 态）；104/144/146/149/178/262 子数据随之 |
| ClosedProjectDetailView.vue | 11 | `closedProjects`.find |

**payment 总览侧集中收窄**：`stores/filter.ts:78` `payNodeRowsAll` 与 `:80` `payRecordsAll` 的源 `data.data?.paymentNodes`/`paymentRecords`/`projects` 改为 scoped（在 store 里 `const scoped = useScopedProjects()` 后取 `scoped.value?.*`），**一处覆盖 DashMetrics/OrgRanking/PaymentL4Table/TrendCard/NoStageProjectsTable 全部下游**（它们消费 `filteredPayNodes`/`payRecordsAll`）。`filteredProjects`（:87）是死派生、不用管。

**例外（不改）**：`AdminView.vue:38`（L4 选项）、`ActivityView.vue:45-46/62-63/80-81`（enrich map/L4 选项）、`InsightView.vue:176`（空态判断）、`DataView.vue:33-34`（元信息）、`DataQualityView.vue:12`（全库体检不收窄）。

### 5.2 yitian 域改点（把传给 lib 的 `store.data` 换成 `useScopedYitian()` 的值）

各 view 顶部加 `const scopedYitian = useScopedYitian()`，把下列调用首参 `store.data` 换成 `scopedYitian.value`（`view.l4s` 等其余实参不变，用户 L4 筛选叠加在权限收窄之上）：
YitianOverviewView.vue:49/80/107、YitianAnalyticsView.vue:51、YitianComplianceView.vue:64/105、YitianCustomerView.vue:48/97/109/135/156、YitianTrendView.vue:57/58、**YitianDetailView.vue:35**（`buildDetailRows(store.data)` → `buildDetailRows(scopedYitian.value)`）。

### 5.3 opportunity 域改点

OpportunitiesView.vue:51、OpportunitiesBoardView.vue:17、OpportunityFollowupView.vue:40（`opps.rows` → `useScopedOpportunities().value`）。归档 `:101`（`oppf.archives`）**不改**（历史快照）。

- [ ] **Step 1: 逐 view 应用 §5.1/§5.2/§5.3 的变换**（可分 project/yitian/opp 三批）。每批改完跑该批相关 view 的既有 vitest（如 `npx vitest run src/views/ProjectsView.test.ts` 等）确认不回归。

- [ ] **Step 2: 建防漏页守卫 `frontend/src/views/__scopeGuard.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// 白名单:确非展示用途的裸读(取 L4 选项/元信息/全库体检)。新增裸读展示数据须走 scoped-selector。
const ALLOW = new Set(['AdminView.vue', 'DataView.vue', 'DataQualityView.vue', 'ActivityView.vue'])
const viewsDir = resolve(__dirname)

describe('防漏页守卫', () => {
  it('views 不直读 store 的展示数据字段(除白名单)', () => {
    const offenders: string[] = []
    for (const f of readdirSync(viewsDir)) {
      if (!f.endsWith('.vue') || ALLOW.has(f)) continue
      const src = readFileSync(resolve(viewsDir, f), 'utf-8')
      if (/data\.data\?\.(projects|closedProjects|paymentNodes|paymentRecords|projectMilestones|projectProfit|events)/.test(src)
          || /\bstore\.rows\b/.test(src) && f.startsWith('Opportunit')) {
        offenders.push(f)
      }
    }
    expect(offenders, `这些 view 仍裸读 store 展示数据,应改用 useScoped*: ${offenders.join(', ')}`).toEqual([])
  })
})
```

（白名单含 ActivityView 因其保留 enrich map 裸读；若 ActivityView 的 events 改成 scoped 后仍有 map 裸读，保持在白名单。守卫的价值是**新增** view 忘用 scoped 时变红。）

- [ ] **Step 3: 跑守卫 + 前端全量**

Run: `cd frontend && npx vitest run src/views/__scopeGuard.test.ts && npx vitest run && npm run typecheck`
Expected: 守卫 PASS（改点已覆盖）、vitest 全绿、typecheck 干净。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views frontend/src/components/TempInstancePanel.vue frontend/src/stores/filter.ts
git commit -m "feat(fe-scope): ~40 处 view/组件换 scoped 取数 + 防漏页守卫"
```

---

## Task 6: 配置界面重做（组级选页 + 默认范围 + 覆盖列表）

**Files:**
- Modify: `frontend/src/lib/admin.ts`（AdminAccount/载荷 加 `pageScopes?`）、`frontend/src/views/AdminView.vue`、`frontend/src/views/AdminView.test.ts`

**Interfaces:** Consumes 后端 `pageScopes` 契约；`nav.ts` 的 6 组 LINKS；`lib/pageScope.ts PAGE_DOMAINS`。

- [ ] **Step 1: `admin.ts` 加 `pageScopes?`**

`AdminAccount` 加 `pageScopes?: Record<string, { l4: string[]; staff: string[] }>`；`createAccount`/`updateAccount` 载荷加 `pageScopes?: Record<...>`（可选）。

- [ ] **Step 2: `AdminView.test.ts` 加用例**

```typescript
  it('覆盖列表:域目标写 domainScopes、页目标写 pageScopes(商机 staff 空)', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'pp'; vm.form.password = 'pw12345'; vm.form.displayName = 'P'
    vm.form.allowedPages = ['*']; vm.form.allowedL4 = ['*']
    vm.form.overrides = [
      { target: 'domain:yitian', l4: ['Dy'], staff: ['E1'] },
      { target: 'page:temp-followup', l4: ['Dp'], staff: [] },
      { target: 'page:opportunities-progress', l4: ['Do'], staff: ['E9'] },
    ]
    await vm.submitForm(); await flushPromises()
    const p = vi.mocked(adminApi.createAccount).mock.calls[0][0] as any
    expect(p.domainScopes).toEqual({ yitian: { l4: ['Dy'], staff: ['E1'] } })
    expect(p.pageScopes['temp-followup']).toEqual({ l4: ['Dp'], staff: [] })
    expect(p.pageScopes['opportunities-progress']).toEqual({ l4: ['Do'], staff: [] })  // 商机 staff 空
  })

  it('组级选页:勾选一组写入该组全部 pageKey', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.toggleGroup('PAYMENT', true)
    expect(vm.form.allowedPages).toEqual(expect.arrayContaining(['payment', 'payment-projects', 'payment-nodes']))
  })
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts`
Expected: 新用例 FAIL（`form.overrides` / `toggleGroup` 不存在）。

- [ ] **Step 4: 改 `AdminView.vue` `<script setup>`**

加导入与常量：

```typescript
import { PROJECT_LINKS, ANALYSIS_LINKS, KEY_FOLLOWUP_LINKS, PAYMENT_LINKS, YITIAN_LINKS, TOOL_LINKS } from '@/nav'
import { PAGE_DOMAINS } from '@/lib/pageScope'

const NAV_GROUPS = [
  { key: 'PROJECT', label: '项目', links: PROJECT_LINKS },
  { key: 'ANALYSIS', label: '分析', links: ANALYSIS_LINKS },
  { key: 'KEY_FOLLOWUP', label: '跟进', links: KEY_FOLLOWUP_LINKS },
  { key: 'PAYMENT', label: '回款', links: PAYMENT_LINKS },
  { key: 'YITIAN', label: '工时', links: YITIAN_LINKS },
  { key: 'TOOL', label: '工具', links: TOOL_LINKS },
] as const
// 覆盖目标下拉:域 + 有数据域的页
const OVERRIDE_TARGETS = [
  { value: 'domain:project', label: '域·项目&回款' },
  { value: 'domain:yitian', label: '域·工时' },
  { value: 'domain:opportunity', label: '域·商机' },
  ...[...PROJECT_LINKS, ...ANALYSIS_LINKS, ...KEY_FOLLOWUP_LINKS, ...PAYMENT_LINKS, ...YITIAN_LINKS]
    .filter((l) => PAGE_DOMAINS[l.key]).map((l) => ({ value: `page:${l.key}`, label: `页·${l.label}` })),
]
function targetIsOpp(t: string): boolean {
  if (t.startsWith('domain:')) return t === 'domain:opportunity'
  return PAGE_DOMAINS[t.slice(5)] === 'opportunity'
}
```

`blankForm` 加 `allowAll: false` 与 `overrides: [] as { target: string; l4: string[]; staff: string[] }[]`（allowedPages 仍在）。

加组级选页 + 覆盖构建：

```typescript
function toggleGroup(groupKey: string, on: boolean) {
  const g = NAV_GROUPS.find((x) => x.key === groupKey); if (!g) return
  const keys = g.links.map((l) => l.key)
  const set = new Set(form.allowedPages.filter((k) => k !== '*'))
  keys.forEach((k) => (on ? set.add(k) : set.delete(k)))
  form.allowedPages = [...set]
}
function groupChecked(groupKey: string): boolean {
  if (form.allowedPages.includes('*')) return true
  const g = NAV_GROUPS.find((x) => x.key === groupKey)
  return !!g && g.links.every((l) => form.allowedPages.includes(l.key))
}
function addOverride() { form.overrides.push({ target: '', l4: [], staff: [] }) }
function removeOverride(i: number) { form.overrides.splice(i, 1) }
function buildScopes(): { domainScopes: Record<string, { l4: string[]; staff: string[] }>; pageScopes: Record<string, { l4: string[]; staff: string[] }> } {
  const domainScopes: Record<string, { l4: string[]; staff: string[] }> = {}
  const pageScopes: Record<string, { l4: string[]; staff: string[] }> = {}
  for (const o of form.overrides) {
    if (!o.target) continue
    const staff = targetIsOpp(o.target) ? [] : o.staff
    if (o.target.startsWith('domain:')) domainScopes[o.target.slice(7)] = { l4: o.l4, staff }
    else pageScopes[o.target.slice(5)] = { l4: o.l4, staff }
  }
  return { domainScopes, pageScopes }
}
```

`submitForm` 两分支载荷加 `...buildScopes()`（`{domainScopes, pageScopes}` 一并带上）；`openEdit` 反填 `overrides`（把 `row.domainScopes` 每项转 `{target:'domain:'+域,...}`、`row.pageScopes` 每项转 `{target:'page:'+页,...}`）：

```typescript
  const ovs: { target: string; l4: string[]; staff: string[] }[] = []
  for (const [dom, v] of Object.entries(row.domainScopes ?? {})) ovs.push({ target: `domain:${dom}`, l4: [...(v.l4 ?? [])], staff: [...(v.staff ?? [])] })
  for (const [pk, v] of Object.entries(row.pageScopes ?? {})) ovs.push({ target: `page:${pk}`, l4: [...(v.l4 ?? [])], staff: [...(v.staff ?? [])] })
  form.overrides = ovs
```

`scopeLabel` 追加 `＋N 覆盖`（N = domainScopes+pageScopes 键数）。`defineExpose` 加 `NAV_GROUPS, OVERRIDE_TARGETS, toggleGroup, groupChecked, addOverride, removeOverride`。删掉 Phase 2 的 `DOMAIN_META`/`domainOverrides`/`buildDomainScopes`（被覆盖列表取代；同步删模板里的分域覆盖区）。

- [ ] **Step 5: 改 `AdminView.vue` `<template>`**

把「可访问页面」多选换成组级复选 + 展开逐页（保留 el-select 逐页作为展开态）；「可见 L4/员工」保留为**默认范围**；分域覆盖区换成**覆盖列表**：

```html
        <el-form-item label="可访问页面">
          <el-checkbox :model-value="form.allowedPages.includes('*')"
            @change="(v:boolean)=> form.allowedPages = v ? ['*'] : []">全部页面</el-checkbox>
          <span v-if="!form.allowedPages.includes('*')">
            <el-checkbox v-for="g in NAV_GROUPS" :key="g.key" :model-value="groupChecked(g.key)"
              @change="(v:boolean)=> toggleGroup(g.key, v)">{{ g.label }}</el-checkbox>
          </span>
        </el-form-item>
        <!-- 默认范围:保留现有 可见L4 / 可见员工 两个 el-select(label 改「默认可见L4」「默认可见员工」) -->
        <el-divider content-position="left">范围覆盖（可选，只加例外；页 &gt; 域 &gt; 默认）</el-divider>
        <el-form-item v-for="(o,i) in form.overrides" :key="i" label="覆盖">
          <el-select v-model="o.target" filterable class="admin-select" placeholder="选目标(域/页)">
            <el-option v-for="t in OVERRIDE_TARGETS" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
          <el-select v-model="o.l4" multiple filterable class="admin-select" placeholder="L4">
            <el-option label="全部 L4" value="*" />
            <el-option v-for="l4 in l4Options" :key="l4" :label="l4" :value="l4" />
          </el-select>
          <el-select v-if="!targetIsOpp(o.target)" v-model="o.staff" multiple filterable class="admin-select" placeholder="员工(按姓名)">
            <el-option v-for="op in staffOptions" :key="op.value" :label="op.label" :value="op.value" />
          </el-select>
          <el-button link type="danger" @click="removeOverride(i)">删除</el-button>
        </el-form-item>
        <el-button link type="primary" @click="addOverride">+ 添加覆盖</el-button>
```

- [ ] **Step 6: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts && npm run typecheck`
Expected: 全 PASS + 无类型错误。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/admin.ts frontend/src/views/AdminView.vue frontend/src/views/AdminView.test.ts
git commit -m "feat(admin-ui): 配置界面重做(组级选页 + 默认范围 + 覆盖列表[域/页],替代分域框)"
```

---

## Task 7: 版本号 + PROGRESS + 全量验证 + 重建 dist

- [ ] **Step 1**: `frontend/src/version.ts` → `APP_VERSION = 'V4.3.1'`（用户钦定版本号，实际为 Y 级工作量）。
- [ ] **Step 2**: `PROGRESS.md` 顶部加 V4.3.1 条目（逐页范围 + 配置重做），旧「当前版本」降级；一句话结论 + 改动清单 + 「非纯前端：换 dist + 覆盖 `config.py`/`auth.py`/`server.py` + 重启；无需更新数据；无新增页面/路由/pageKey」。
- [ ] **Step 3**: `bash verify.sh` → `[PASS]`。
- [ ] **Step 4**: **真实数据浏览器冒烟**（建「默认全部 + /临时跟进 覆盖某 L4」账号，核对 /projects 全量而 /projects/temp 仅该 L4，其余同域页不受影响；核对 yitian/商机域）。
- [ ] **Step 5**: 重建默认 base dist：`cd frontend && npm run build`，核 `dist/index.html` 为 `src="/assets/...`、`dist/assets/index-*.js` 含 `V4.3.1`。
- [ ] **Step 6: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "release: V4.3.1 逐页数据范围 + 配置界面重做"
```

---

## Self-Review（对照 spec）

**1. Spec 覆盖**：§2 模型 pageScopes+三层→Task1；§3 pageKey→域映射(前后端+同步测试)→Task1(config)/Task3(lib+同步测试)；§4.1 服务端按域并集→Task2(domain_union_scope)；§4.2 前端收窄(scoped selector+narrow+staffNames)→Task3/4/5；§4.3 防漏页守卫→Task5;§5 后端清单→Task1/2;§6 配置重做→Task6;§7 安全(并集边界/收窄口径一致/超管/商机)→Task1-4;§9 测试全覆盖。§10 不做项未触碰。

**2. 占位符**：Task5 用「改点表 + 统一变换规则 + 守卫测试 + 全代码 narrow 函数」而非 40 段重复 diff（DRY；每处变换是同一机械替换，表已给 file:line+表达式，守卫兜底完整性）——非占位符。

**3. 类型/命名一致**：`effective_scope(rec,domain,page_key)`/`domain_union_scope`(py) ↔ `effectiveScope`/`narrowProjects/narrowYitian/narrowOpportunities`(ts) 各自定义与消费一致；`PAGE_DOMAINS`(config.py↔pageScope.ts,同步测试锁)；`useScopedProjects/Yitian/Opportunities`(Task4 定义、Task5 消费);`pageScopes`(auth/server/admin.ts/AuthUser 一致);商机 staff 三处清空(后端 _validate_page_scopes + 前端 buildScopes + narrow 不涉及)。

**孤儿预案**：Task1 Step5 主动修 `test_auth_admin.py` 键集断言;`pageScopes`/`domainScopes` 载荷可选(不造必填孤儿);Task2 Step8 `pytest -q` 横向回归闸;Task5 守卫测试防漏页。

**⚠ 规模提示**：本计划 7 任务、约 40 前端改点，是本系列最大一期(实为 Y 级);Task5 建议按 project/yitian/opp 三批推进,每批过守卫+相关 vitest。
