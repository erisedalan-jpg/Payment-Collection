# 账号权限细粒度升级 Phase 1 — 数据范围下沉到员工级 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 账号新增 `allowedStaff`（工号列表），与既有 `allowedL4` 并列构成一个全局数据范围（命中取并集），把可见范围下沉到具体员工/项目经理。

**Architecture:** 后端 `data_scope.py` 两个纯函数各加一个可选参数（`filter_analysis_data` 加 `pm_names`、`scope_yitian_data` 加 `allowed_staff`），项目按「orgL4∈L4 或 项目经理姓名∈pm_names」、工时按「员工L4∈L4 或 工号∈staff」并集过滤；`auth.py` 账号模型加 `allowedStaff` 字段（向后兼容、默认 `[]`）；`server.py` 从 `input/组织架构.xlsx`（`read_org_roster`，mtime 缓存）解析工号→姓名并接线到数据端点，新增超管专属 `GET /api/admin/roster` 喂选择器；前端 `AdminView.vue` 加「可见员工」选择器（**存工号、显示姓名**）。全局范围下服务端下发即所见，业务页不改。

**Tech Stack:** Python 3.8+ 标准库（后端纯函数 + `http.server`）、pytest；Vue3 + TS + Element Plus + Pinia、vitest。

## Global Constraints

- **不动 master 产品行为的向后兼容**：`filter_analysis_data`/`scope_yitian_data`/`auth.create_account`/`add_account` 等现有签名的既有调用与既有测试**必须继续通过**——所有新参数一律给默认值（`pm_names=None`/`allowed_staff=None`/`staff=None`），缺省即今日行为。
- **纯函数不改入参**：`data_scope.py` 两函数继续返回新 dict、不 mutate `data`。
- **员工级隐私服务端强制**：范围过滤在服务端完成；`/api/admin/roster` 只出 `id/name/l4`，绝不含手机号/省市/岗位等隐私列。
- **工号是稳定标识**：`allowedStaff` 存工号；前端选择/展示一律姓名，工号仅重名消歧时出现。
- **`*` 短路不变**：`allowedL4` 含 `'*'` ⟹ 全部，`allowedStaff` 无意义。
- **两套代码路径**（CLAUDE.md §5）：本计划改动的 `server.py` 逻辑不涉及 frozen/dev 分叉的脚本调用路径（只读文件 + 内存过滤），无需双分支维护；`_load_roster_cached` 用既有 `BASE_DIR`（已同时覆盖 frozen/dev）。
- **完成定义**（CLAUDE.md §6/§7）：`bash verify.sh` 全绿；改 `data_scope.py`/`auth.py` 计算逻辑先补/改测试再改实现。
- **不做**：逐页范围/`pageScopes`、只读/字段级、角色体系、员工自助登录、批量开通、商机域工号级、已关闭项目按 PM 工号放大、项目经理姓名→工号入管线精确解析（重名过匹配为已知限制）。

## 文件结构（改动地图）

| 文件 | 职责 | 改动 |
|---|---|---|
| `data_scope.py` | 按范围过滤 analysis/yitian（纯函数） | 改：两函数加并集参数 |
| `tests/test_data_scope.py` | filter_analysis_data 单测 | 改：fixture 加 projectManager + PM 并集用例 |
| `tests/test_data_scope_yitian.py` | scope_yitian_data 单测 | 改：staff 并集用例 |
| `auth.py` | 账号模型/校验/CRUD（纯标准库） | 改：加 `allowedStaff` 字段与校验 |
| `tests/test_auth_staff.py` | 账号 staff 字段单测 | 建 |
| `server.py` | HTTP 端点接线 | 改：roster 缓存+PM 解析+数据端点+新 roster 端点+admin handlers |
| `tests/test_server_admin.py` | admin 端点集成 | 改：加 staff 持久化 + roster 端点用例 |
| `tests/test_server_data.py` | data 端点集成 | 改：加按工号(PM)过滤用例 |
| `frontend/src/lib/admin.ts` | 账号 API 封装 | 改：`allowedStaff` + `RosterEntry` + `listRoster` |
| `frontend/src/lib/auth.ts` | AuthUser 类型 | 改：加 `allowedStaff?` |
| `frontend/src/views/AdminView.vue` | 账号配置界面 | 改：员工选择器(显姓名)+可见范围列 |
| `frontend/src/views/AdminView.test.ts` | AdminView 单测 | 改：mock 加 roster + 姓名展示/工号提交用例 |

---

## Task 1: `data_scope.filter_analysis_data` 加项目经理工号并集（`pm_names`）

**Files:**
- Modify: `data_scope.py:11-69`（`allowed_project_ids` + `filter_analysis_data`）
- Test: `tests/test_data_scope.py`

**Interfaces:**
- Produces:
  - `allowed_project_ids(projects: list, allowed_l4: list, pm_names=None) -> set`
  - `filter_analysis_data(data: dict, allowed_l4: list, pm_names=None) -> dict`
  - 项目命中判据：`orgL4 ∈ allowed_l4` **或** `projectManager(姓名) ∈ pm_names`；`'*' ∈ allowed_l4` 全量；`pm_names=None/空` ⟹ 仅 L4（向后兼容）。

- [ ] **Step 1: 在 `tests/test_data_scope.py` 的 `_fixture()` 给项目加 `projectManager`，并补 PM 并集失败测试**

把 `_fixture()` 的 `projects` 改为带 `projectManager`（其余键不动）：

```python
        "projects": [
            {"projectId": "P1", "orgL4": "D1", "projectManager": "张三"},
            {"projectId": "P2", "orgL4": "D2", "projectManager": "李四"},
            {"projectId": "P3", "orgL4": "D1", "projectManager": "王五", "relatedClosedId": "C9"},
            {"projectId": "PX", "orgL4": "", "projectManager": "赵六"},
        ],
```

在文件末尾追加：

```python
def test_allowed_project_ids_by_pm():
    f = _fixture()
    # 王五管 P3(D1);无 L4 授权,仅按项目经理姓名命中 → P3 + relatedClosedId C9
    keep = data_scope.allowed_project_ids(f["projects"], [], pm_names={"王五"})
    assert keep == {"P3", "C9"}


def test_filter_by_pm_names_only():
    f = _fixture()
    out = data_scope.filter_analysis_data(f, [], pm_names={"李四"})   # 仅按 PM 李四(D2)命中 P2
    assert [p["projectId"] for p in out["projects"]] == ["P2"]
    assert set(out["projectPmis"].keys()) == {"P2"}
    assert set(out["paymentNodes"].keys()) == {"P2"}
    assert [e["projectId"] for e in out["events"]] == ["P2"]


def test_filter_l4_and_pm_union():
    f = _fixture()
    out = data_scope.filter_analysis_data(f, ["D1"], pm_names={"李四"})  # D1(P1,P3) ∪ PM李四(P2)
    assert [p["projectId"] for p in out["projects"]] == ["P1", "P2", "P3"]


def test_filter_pm_none_is_backcompat():
    f = _fixture()
    assert data_scope.filter_analysis_data(f, ["D1"]) == data_scope.filter_analysis_data(f, ["D1"], pm_names=None)
```

- [ ] **Step 2: 跑测试，确认新用例失败、旧用例仍过**

Run: `python -m pytest tests/test_data_scope.py -v`
Expected: `test_allowed_project_ids_by_pm`/`test_filter_by_pm_names_only`/`test_filter_l4_and_pm_union` FAIL（`allowed_project_ids() takes 2 positional arguments but 3 were given` / `filter_analysis_data() got an unexpected keyword argument 'pm_names'`）；其余（`test_filter_by_l4` 等）PASS（fixture 加了 `projectManager` 不影响 L4 口径）。

- [ ] **Step 3: 改 `data_scope.py` 实现 PM 并集**

把 `allowed_project_ids`（11-28 行）整体替换为：

```python
def allowed_project_ids(projects: list, allowed_l4: list, pm_names=None) -> set:
    """orgL4 ∈ allowed_l4 或 项目经理姓名 ∈ pm_names 的项目 id ∪ 其 relatedClosedId。
    allowed_l4 含 '*' → 全部 id(含 relatedClosedId)。pm_names=None/空 → 仅 L4 口径(向后兼容)。"""
    allow = set(allowed_l4 or [])
    star = '*' in allow
    pmset = set(pm_names or ())
    keep: set = set()
    for p in projects or []:
        if not isinstance(p, dict):
            continue
        pid = p.get('projectId')
        if pid is None:
            continue
        org = str(p.get('orgL4') or '').strip()
        pm = str(p.get('projectManager') or '').strip()
        if star or org in allow or (pm and pm in pmset):
            keep.add(pid)
            rel = p.get('relatedClosedId')
            if rel:
                keep.add(rel)
    return keep
```

把 `filter_analysis_data`（31-44 行的签名与 projects 过滤部分）改为按 `keep` 过滤 projects（口径与 `allowed_project_ids` 一致、避免重复判据）：

```python
def filter_analysis_data(data: dict, allowed_l4: list, pm_names=None) -> dict:
    """返回按 allowed_l4(L4) 与 pm_names(项目经理姓名)并集过滤的新 dict;
    '*' → 原样返回;不改入参 data。pm_names=None/空 → 仅 L4 口径(向后兼容)。"""
    if not isinstance(data, dict):
        return data
    allow = set(allowed_l4 or [])
    if '*' in allow:
        return data

    projects = data.get('projects') or []
    keep = allowed_project_ids(projects, allowed_l4, pm_names)   # 含 PM 命中 + relatedClosedId

    out = dict(data)  # 浅拷顶层(透传块随之保留引用)
    out['projects'] = [p for p in projects
                       if isinstance(p, dict) and p.get('projectId') in keep]
    closed = data.get('closedProjects') or []
    out['closedProjects'] = [c for c in closed
                             if isinstance(c, dict) and str(c.get('orgL4') or '').strip() in allow]
```

（45 行以下 `_PID_KEYED`/`events`/`meta` 段**不动**——它们已按 `keep` 裁切，PM 命中的项目自然带上其回款/里程碑/利润/事件。）

- [ ] **Step 4: 跑测试确认全过**

Run: `python -m pytest tests/test_data_scope.py -v`
Expected: 全 PASS（含新增 4 个与既有 `test_filter_by_l4`/`test_no_foreign_projectid_leak` 等）。

- [ ] **Step 5: 变异验证（确认测试真能抓回归）**

临时把 Step 3 的判据 `if star or org in allow or (pm and pm in pmset):` 改成去掉 `or (pm and pm in pmset)`，跑 `python -m pytest tests/test_data_scope.py::test_filter_by_pm_names_only -q`，Expected: FAIL（`assert [] == ['P2']`）。确认后改回。

- [ ] **Step 6: Commit**

```bash
git add data_scope.py tests/test_data_scope.py
git commit -m "feat(scope): filter_analysis_data 支持项目经理姓名并集(pm_names),向后兼容"
```

---

## Task 2: `data_scope.scope_yitian_data` 加员工工号并集（`allowed_staff`）

**Files:**
- Modify: `data_scope.py:72-120`（`scope_yitian_data`）
- Test: `tests/test_data_scope_yitian.py`

**Interfaces:**
- Produces: `scope_yitian_data(data: dict, allowed_l4: list, allowed_staff=None) -> dict`
  - 工时行命中：`员工所属 l4 ∈ allowed_l4` **或** `员工工号(roster.id) ∈ allowed_staff`；`'*' ∈ allowed_l4` 全量；`allowed_staff=None/空` ⟹ 仅 L4（向后兼容）。离册工号自动不命中（roster 里没有 → 不放行）。

- [ ] **Step 1: 在 `tests/test_data_scope_yitian.py` 追加 staff 并集测试**

在 `class TestScopeYitian` 内追加：

```python
    def test_staff_union_adds_employee(self):
        # allowedL4=[] 但按工号 B1 命中李四(浙江服务组)
        out = DS.scope_yitian_data(_data(), [], allowed_staff={"B1"})
        assert [p["id"] for p in out["roster"]] == ["B1"]
        assert [e["e"] for e in out["entries"]] == ["B1"]
        assert len(out["issues"]) == 1
        assert out["issues"][0]["i"] == 0
        assert out["issues"][0]["snippet"] == "李四的正文"

    def test_l4_and_staff_union(self):
        out = DS.scope_yitian_data(_data(), ["银行服务组"], allowed_staff={"B1"})
        assert {p["id"] for p in out["roster"]} == {"A1", "B1"}
        assert len(out["entries"]) == 3

    def test_staff_none_backcompat(self):
        assert DS.scope_yitian_data(_data(), ["银行服务组"]) == \
               DS.scope_yitian_data(_data(), ["银行服务组"], allowed_staff=None)

    def test_offroster_staff_yields_nothing(self):
        out = DS.scope_yitian_data(_data(), [], allowed_staff={"ZZZ"})   # 离册工号
        assert out["roster"] == [] and out["entries"] == []
```

- [ ] **Step 2: 跑测试，确认新用例失败、旧用例仍过**

Run: `python -m pytest tests/test_data_scope_yitian.py -v`
Expected: 4 个新用例 FAIL（`scope_yitian_data() got an unexpected keyword argument 'allowed_staff'`）；旧 7 个 PASS。

- [ ] **Step 3: 改 `data_scope.py` 实现 staff 并集**

把 `scope_yitian_data` 的签名与 `keep_roster` 计算（72-86 行）改为：

```python
def scope_yitian_data(data: dict, allowed_l4: list, allowed_staff=None) -> dict:
    """按 allowed_l4(L4) 与 allowed_staff(工号)并集裁倚天数据(roster/entries/issues);
    '*' → 原样返回;不改入参。allowed_staff=None/空 → 仅 L4 口径(向后兼容)。

    工时是员工级敏感数据:非命中员工、其工时行、其问题正文摘要,一律不下发。
    issues[].i 指向 entries 下标——裁行后必须重映射,否则指到别人头上。
    离册工号(不在 roster)自动不命中——即「工号 ∩ 花名册」的防脏值。"""
    if not isinstance(data, dict):
        return data
    allow = set(allowed_l4 or [])
    if '*' in allow:
        return data
    staff = set(allowed_staff or ())

    roster = data.get('roster') or []
    keep_roster = [p for p in roster
                   if isinstance(p, dict) and (
                       str(p.get('l4') or '').strip() in allow or p.get('id') in staff)]
    keep_ids = {p.get('id') for p in keep_roster}
```

（88 行以下 `entries`/`issues` 重映射/`meta` 段**不动**——按 `keep_ids` 裁切，staff 命中的员工工时自然带上。）

- [ ] **Step 4: 跑测试确认全过**

Run: `python -m pytest tests/test_data_scope_yitian.py -v`
Expected: 全 PASS（新 4 + 旧 7）。

- [ ] **Step 5: 变异验证**

临时把 `keep_roster` 判据的 `or p.get('id') in staff` 删掉，跑 `python -m pytest tests/test_data_scope_yitian.py::TestScopeYitian::test_staff_union_adds_employee -q`，Expected: FAIL。确认后改回。

- [ ] **Step 6: Commit**

```bash
git add data_scope.py tests/test_data_scope_yitian.py
git commit -m "feat(scope): scope_yitian_data 支持员工工号并集(allowed_staff),向后兼容"
```

---

## Task 3: `auth.py` 账号模型加 `allowedStaff`

**Files:**
- Modify: `auth.py:69-107`（`_make_user`/`public_user`）、`auth.py:190-249`（`_validate_str_list`/`create_account`/`update_account`）、`auth.py:278-293`（`add_account`/`edit_account`）
- Test: `tests/test_auth_staff.py`（建）

**Interfaces:**
- Produces:
  - `_make_user(password, display_name, is_super=True, pages=None, l4=None, staff=None, must_change=False) -> dict`（记录含 `allowedStaff`）
  - `public_user(...)` 返回含 `'allowedStaff'`
  - `_validate_str_list(values, field, cap=100) -> list`
  - `create_account(accounts, account, password, display_name, pages, l4, staff=None) -> dict`
  - `update_account(accounts, account, *, display_name=None, pages=None, l4=None, staff=None, password=None) -> dict`
  - `add_account(account, password, display_name, pages, l4, staff=None) -> dict`
  - `edit_account(account, *, display_name=None, pages=None, l4=None, staff=None, password=None) -> dict`

- [ ] **Step 1: 建 `tests/test_auth_staff.py`**

```python
import pytest
import auth


def _accounts():
    return {"version": 1, "users": {}}


def test_create_with_staff_persists_and_public():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["yitian"], ["D1"], ["E001", "E002"])
    rec = a["users"]["liu"]
    assert rec["allowedStaff"] == ["E001", "E002"]
    pub = auth.public_user("liu", rec)
    assert pub["allowedStaff"] == ["E001", "E002"]
    assert "salt" not in pub and "hash" not in pub


def test_create_staff_defaults_empty():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["yitian"], ["D1"])
    assert a["users"]["liu"]["allowedStaff"] == []


def test_public_user_migration_default():
    # 旧账号无 allowedStaff 字段 → public_user 返 []
    rec = {"displayName": "x", "isSuper": False, "allowedPages": [], "allowedL4": []}
    assert auth.public_user("x", rec)["allowedStaff"] == []


def test_update_staff_and_none_keeps():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", ["yitian"], ["D1"], ["E001"])
    a = auth.update_account(a, "liu", staff=["E009"])
    assert a["users"]["liu"]["allowedStaff"] == ["E009"]
    a = auth.update_account(a, "liu", display_name="新名")   # staff=None 不改
    assert a["users"]["liu"]["allowedStaff"] == ["E009"]


def test_staff_validation_dedup_and_type():
    a = auth.create_account(_accounts(), "liu", "pw", "老刘", [], [], ["E1", "E1", "E2"])
    assert a["users"]["liu"]["allowedStaff"] == ["E1", "E2"]
    with pytest.raises(ValueError):
        auth.create_account(_accounts(), "x", "pw", "x", [], [], [123])
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_auth_staff.py -v`
Expected: FAIL（`create_account() takes 6 positional arguments but 7 were given` / `KeyError: 'allowedStaff'`）。

- [ ] **Step 3: 改 `auth.py`**

`_make_user`（69-81 行）加 `staff` 形参与字段：

```python
def _make_user(password: str, display_name: str, is_super: bool = True,
               pages: list | None = None, l4: list | None = None,
               staff: list | None = None, must_change: bool = False) -> dict:
    salt = secrets.token_hex(16)
    return {
        'salt': salt,
        'hash': hash_password(password, salt),
        'isSuper': is_super,
        'allowedPages': pages if pages is not None else ['*'],
        'allowedL4': l4 if l4 is not None else ['*'],
        'allowedStaff': staff if staff is not None else [],
        'displayName': display_name,
        'mustChangePassword': bool(must_change),
    }
```

`public_user`（99-107 行）加字段：

```python
def public_user(account: str, rec: dict) -> dict:
    return {
        'account': account,
        'displayName': rec.get('displayName', account),
        'isSuper': bool(rec.get('isSuper', False)),
        'allowedPages': rec.get('allowedPages', []),
        'allowedL4': rec.get('allowedL4', []),
        'allowedStaff': rec.get('allowedStaff', []),
        'mustChangePassword': bool(rec.get('mustChangePassword', False)),
    }
```

`_validate_str_list`（190-201 行）加 `cap` 形参：

```python
def _validate_str_list(values, field: str, cap: int = 100) -> list:
    if not isinstance(values, list):
        raise ValueError(f'{field} 须为数组')
    out: list = []
    for v in values:
        if not isinstance(v, str) or not (1 <= len(v) <= 64):
            raise ValueError(f'{field} 各项须为 1-64 位字符串')
        if v not in out:
            out.append(v)
    if len(out) > cap:
        raise ValueError(f'{field} 项数过多')
    return out
```

`create_account`（204-220 行）加 `staff`：

```python
def create_account(accounts: dict, account: str, password: str, display_name: str,
                   pages: list, l4: list, staff: list | None = None) -> dict:
    name = _validate_account_name(account)
    _validate_password(password)
    _validate_display_name(display_name)
    users = accounts.get('users', {})
    if name in users:
        raise ValueError(f'账号 {name} 已存在')
    pages = _validate_str_list(pages, 'allowedPages')
    l4 = _validate_str_list(l4, 'allowedL4')
    staff = _validate_str_list(staff or [], 'allowedStaff', cap=1000)
    new_users = dict(users)
    new_users[name] = _make_user(password, (display_name or name)[:64],
                                 is_super=False, pages=pages, l4=l4, staff=staff,
                                 must_change=True)
    out = dict(accounts)
    out['users'] = new_users
    return out
```

`update_account`（223-249 行）加 `staff` kwarg 与赋值分支：

```python
def update_account(accounts: dict, account: str, *, display_name=None, pages=None,
                   l4=None, staff=None, password=None) -> dict:
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

`add_account`（278-284 行）与 `edit_account`（287-293 行）透传 `staff`：

```python
def add_account(account: str, password: str, display_name: str, pages: list, l4: list,
                staff: list | None = None) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = create_account(data, account, password, display_name, pages, l4, staff)
        save_accounts(data)
        name = _validate_account_name(account)
        return public_user(name, data['users'][name])


def edit_account(account: str, *, display_name=None, pages=None, l4=None, staff=None,
                 password=None) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = update_account(data, account, display_name=display_name, pages=pages,
                              l4=l4, staff=staff, password=password)
        save_accounts(data)
        return public_user(account, data['users'][account])
```

- [ ] **Step 4: 跑测试确认全过（含既有 auth 测试不回归）**

Run: `python -m pytest tests/test_auth_staff.py tests/test_auth.py tests/test_auth_admin.py -v`
Expected: 全 PASS（既有 `_make_user`/`create_account` 调用因新参有默认值不受影响）。

- [ ] **Step 5: Commit**

```bash
git add auth.py tests/test_auth_staff.py
git commit -m "feat(auth): 账号加 allowedStaff(工号列表)字段与校验,向后兼容默认 []"
```

---

## Task 4: `server.py` 接线（花名册缓存 + PM 解析 + 数据端点 + roster 端点 + admin handlers）

**Files:**
- Modify: `server.py`（顶部 import；`_load_yitian_cached` 后加 roster 缓存与 PM 解析；`handle_data_json` 2790-2805；`handle_yitian_data` 2824-2828；do_GET 路由 1053 后；`handle_admin_accounts_list` 3742 附近加 `handle_admin_roster`；`handle_admin_account_create` 3782-3788；`handle_admin_account_update` 3806-3819）
- Test: `tests/test_server_admin.py`、`tests/test_server_data.py`

**Interfaces:**
- Consumes: Task 1 `data_scope.filter_analysis_data(data, allowed_l4, pm_names)`；Task 2 `data_scope.scope_yitian_data(data, allowed_l4, allowed_staff)`；Task 3 `auth.add_account(..., staff)`/`auth.edit_account(..., staff=...)`/`public_user` 含 `allowedStaff`；`projects.read_org_roster(path) -> list[{id,name,l2,l3,l31,l4,category}]`。
- Produces:
  - `server._load_roster_cached() -> list[dict]`（`input/组织架构.xlsx` 花名册，mtime 缓存，缺文件→上次结果或 `[]`）
  - `server._staff_pm_names(staff) -> set[str]`（工号列表→项目经理姓名集）
  - `GET /api/admin/roster` → `{"success": True, "roster": [{"id","name","l4"}, ...]}`（超管专属）
  - `POST /api/admin/accounts/{create,update}` 接受 `allowedStaff`

- [ ] **Step 1: 在 `tests/test_server_admin.py` 追加 staff 持久化 + roster 端点测试**

追加到文件末尾（`admin_server`/`_login`/`_req` 已在文件内）：

```python
def test_super_create_with_staff_persists(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(
        port, "POST", "/api/admin/accounts/create", cookie,
        {"account": "emp", "password": "pw12345", "displayName": "员工范围",
         "allowedPages": ["yitian"], "allowedL4": [], "allowedStaff": ["E001", "E002"]},
    )
    assert status == 200
    assert data["user"]["allowedStaff"] == ["E001", "E002"]
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    emp = next(a for a in lst["accounts"] if a["account"] == "emp")
    assert emp["allowedStaff"] == ["E001", "E002"]


def test_super_update_staff(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    assert _req(port, "POST", "/api/admin/accounts/update", cookie,
                {"account": "liu", "allowedStaff": ["E9"]})[0] == 200
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    liu = next(a for a in lst["accounts"] if a["account"] == "liu")
    assert liu["allowedStaff"] == ["E9"]


def test_roster_endpoint_super_only(admin_server, monkeypatch):
    port = admin_server
    monkeypatch.setattr(
        server, "_load_roster_cached",
        lambda: [{"id": "E001", "name": "张三", "l4": "银行组", "category": "正式"}],
    )
    _, boss_cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(port, "GET", "/api/admin/roster", boss_cookie)
    assert status == 200 and data["success"]
    assert data["roster"] == [{"id": "E001", "name": "张三", "l4": "银行组"}]   # 无 category 隐私列
    _, liu_cookie, _ = _login(port, "liu", "liupw")
    assert _req(port, "GET", "/api/admin/roster", liu_cookie)[0] == 403
    assert _req(port, "GET", "/api/admin/roster")[0] == 401
```

- [ ] **Step 2: 在 `tests/test_server_data.py` 追加按工号(PM)过滤测试**

追加到文件末尾（`_login` 已在文件内）：

```python
def _write_analysis_with_pm(tmp_path, monkeypatch):
    f = tmp_path / "analysis_data.json"
    f.write_text(json.dumps({
        "meta": {"lastUpdate": "x", "totalProjects": 3, "totalClosed": 0, "totalPaymentNodes": 0},
        "projects": [
            {"projectId": "P1", "orgL4": "D1", "projectManager": "张三"},
            {"projectId": "P2", "orgL4": "D2", "projectManager": "李四"},
            {"projectId": "P3", "orgL4": "D2", "projectManager": "王五"},
        ],
        "closedProjects": [], "projectPmis": {"P1": {}, "P2": {}, "P3": {}}, "paymentNodes": {},
        "events": [], "dataQuality": {"summary": {}},
    }, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(server, "ANALYSIS_FILE", str(f))
    if hasattr(server, "_analysis_cache"):
        server._analysis_cache["mtime"] = None


def test_data_scoped_by_staff_pm(tmp_path, monkeypatch):
    # emp: 无 L4,可见员工工号 E_LI(李四) → 仅见李四管的 P2
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    salt = "s"
    auth.save_accounts({"version": 1, "users": {
        "emp": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
                "allowedPages": ["*"], "allowedL4": [], "allowedStaff": ["E_LI"], "displayName": "emp"},
    }})
    _write_analysis_with_pm(tmp_path, monkeypatch)
    monkeypatch.setattr(server, "_load_roster_cached",
                        lambda: [{"id": "E_LI", "name": "李四", "l4": "D2"}])
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        conn, ck = _login(port, "emp")
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": ck})
        r = conn.getresponse()
        assert r.status == 200
        body = json.loads(r.read())
        assert [p["projectId"] for p in body["projects"]] == ["P2"]
        assert set(body["projectPmis"].keys()) == {"P2"}
    finally:
        srv.shutdown(); srv.server_close()
```

- [ ] **Step 3: 跑测试确认失败**

Run: `python -m pytest tests/test_server_admin.py tests/test_server_data.py -q`
Expected: 新用例 FAIL（`/api/admin/roster` 404、`allowedStaff` 未持久化/缺 `_load_roster_cached`），旧用例 PASS。

- [ ] **Step 4: `server.py` 顶部确保 `import projects`**

在 server.py 顶部 import 区（与 `import auth`/`import data_scope`/`import config` 同处）确认存在 `import projects`；若无则加一行：

```python
import projects
```

- [ ] **Step 5: 在 `_load_yitian_cached`（约 529 行）之后加花名册缓存与 PM 解析**

```python
_roster_cache = {'mtime': None, 'rows': []}


def _load_roster_cached():
    """input/组织架构.xlsx 花名册(projects.read_org_roster),按 mtime 惰性缓存。
    缺文件/解析失败 → 返回上次结果或 []。供账号「可见员工」选择器与项目经理工号解析共用。"""
    path = os.path.join(BASE_DIR, 'input', config.ORG_FILE)
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return _roster_cache['rows'] or []
    if _roster_cache['mtime'] != mtime:
        try:
            _roster_cache['rows'] = projects.read_org_roster(path)
            _roster_cache['mtime'] = mtime
        except Exception:
            return _roster_cache['rows'] or []
    return _roster_cache['rows']


def _staff_pm_names(staff):
    """工号列表 → 项目经理姓名集(经花名册解析)。空/缺 → 空集。
    注:项目里 projectManager 存姓名非工号,故按姓名并集匹配(重名过匹配为已知限制)。"""
    sset = set(staff or ())
    if not sset:
        return set()
    return {r.get('name') for r in _load_roster_cached()
            if r.get('id') in sset and r.get('name')}
```

- [ ] **Step 6: 接线 `handle_data_json`（2801-2805 行末）**

把结尾两行改为解析 pm_names 后传入：

```python
        data = _load_analysis_cached()
        if data is None:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, "数据文件不存在"))
            return
        pm_names = _staff_pm_names(rec.get('allowedStaff', []))
        self._send_json(200, data_scope.filter_analysis_data(data, allowed, pm_names))
```

- [ ] **Step 7: 接线 `handle_yitian_data`（2824-2828 行）**

```python
        allowed = rec.get('allowedL4', [])
        if rec.get('isSuper') or '*' in allowed:
            self._send_json(200, data)
            return
        self._send_json(200, data_scope.scope_yitian_data(data, allowed, rec.get('allowedStaff', [])))
```

- [ ] **Step 8: 加 `handle_admin_roster`（`handle_admin_accounts_list` 3742 之前或之后）**

```python
    def handle_admin_roster(self):
        """GET /api/admin/roster —— 花名册(工号/姓名/L4),供账号「可见员工」选择器。
        超管专属(/api/admin/ 前缀已由 _authz_gate 要求超管)。只出 id/name/l4,不含隐私列。"""
        if self._require_super() is None:
            return
        rows = [{'id': r.get('id'), 'name': r.get('name'), 'l4': r.get('l4')}
                for r in _load_roster_cached() if r.get('id')]
        self._send_json(200, {"success": True, "roster": rows})
```

- [ ] **Step 9: do_GET 加路由（1053 行 `/api/admin/audit` 分支后）**

```python
        elif parsed.path == '/api/admin/roster':
            self.handle_admin_roster()
```

- [ ] **Step 10: `handle_admin_account_create` 透传 staff（3782-3788 行）**

```python
        self._audit_target = str(data.get('account', ''))
        self._audit_detail = '授予页面%s L4%s 员工%s' % (
            data.get('allowedPages', []), data.get('allowedL4', []), data.get('allowedStaff', []))
        try:
            user = auth.add_account(
                data.get('account', ''), data.get('password', ''),
                data.get('displayName', ''), data.get('allowedPages', []),
                data.get('allowedL4', []), data.get('allowedStaff', []))
```

- [ ] **Step 11: `handle_admin_account_update` 透传 staff（3808-3819 行）**

在 `allowedL4` 的 `_changed` 分支后加 staff 分支，并在 `edit_account` 调用加 `staff=`：

```python
        if data.get('allowedL4') is not None:
            _changed.append('L4权限')
        if data.get('allowedStaff') is not None:
            _changed.append('员工范围')
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
                password=data.get('password'))
```

- [ ] **Step 12: 跑测试确认全过**

Run: `python -m pytest tests/test_server_admin.py tests/test_server_data.py -q`
Expected: 全 PASS（含新 3 + 新 1 与既有）。

- [ ] **Step 13: 回归——后端全量**

Run: `python -m pytest -q`
Expected: 全 PASS（确认 data_scope/auth/server 三处改动无横向回归）。

- [ ] **Step 14: Commit**

```bash
git add server.py tests/test_server_admin.py tests/test_server_data.py
git commit -m "feat(server): 接线 allowedStaff 到数据端点 + 新增超管 /api/admin/roster 选择器数据源"
```

> **说明（no silent cap）**：倚天数据端点 `handle_yitian_data` 的 staff 接线（Step 7）为与 `handle_data_json` 对称的透传，其核心过滤逻辑已由 Task 2 的 `scope_yitian_data` 单测覆盖；不再新建倚天 HTTP 集成用例，改由 spec §12 的真实数据手动冒烟（建「仅某工号」账号核对 `/yitian/detail` 只见该员工）兜底。

---

## Task 5: 前端 `AdminView` 员工选择器（存工号、显示姓名）

**Files:**
- Modify: `frontend/src/lib/admin.ts`、`frontend/src/lib/auth.ts`、`frontend/src/views/AdminView.vue`
- Test: `frontend/src/views/AdminView.test.ts`

**Interfaces:**
- Consumes: Task 4 `GET /api/admin/roster` → `{success, roster:[{id,name,l4}]}`；`public_user`/账号列表含 `allowedStaff`。
- Produces:
  - `admin.ts`：`AdminAccount.allowedStaff?: string[]`；`RosterEntry {id,name,l4}`；`listRoster(): Promise<RosterEntry[]>`；`createAccount`/`updateAccount` 载荷含 `allowedStaff`。
  - `auth.ts`：`AuthUser.allowedStaff?: string[]`。
  - `AdminView.vue`：`form.allowedStaff`、`staffOptions`（label 姓名、重名附工号）、`scopeLabel`（可见范围列）。

- [ ] **Step 1: 改 `frontend/src/lib/admin.ts`**

`AdminAccount` 接口加字段、加 `RosterEntry` 与 `listRoster`、`createAccount`/`updateAccount` 载荷加 `allowedStaff`：

```typescript
export interface AdminAccount {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
  allowedStaff?: string[]
  mustChangePassword?: boolean
}

export interface RosterEntry {
  id: string
  name: string
  l4: string
}
```

`createAccount`/`updateAccount` 改为：

```typescript
export function createAccount(p: {
  account: string; password: string; displayName: string
  allowedPages: string[]; allowedL4: string[]; allowedStaff: string[]
}): Promise<void> {
  return postJson('/api/admin/accounts/create', p)
}

export function updateAccount(p: {
  account: string; displayName?: string; allowedPages?: string[]
  allowedL4?: string[]; allowedStaff?: string[]; password?: string
}): Promise<void> {
  return postJson('/api/admin/accounts/update', p)
}
```

在 `deleteAccount` 后追加：

```typescript
export async function listRoster(): Promise<RosterEntry[]> {
  const res = await fetch(apiUrl('/api/admin/roster'), { credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.message || '获取花名册失败')
  return data.roster as RosterEntry[]
}
```

- [ ] **Step 2: 改 `frontend/src/lib/auth.ts` 的 `AuthUser`（3-10 行）加字段**

```typescript
export interface AuthUser {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
  allowedStaff?: string[]
  mustChangePassword?: boolean
}
```

- [ ] **Step 3: 在 `AdminView.test.ts` 更新 mock 并加姓名展示/工号提交测试**

`beforeEach`（22-25 行）的 `listAccounts` mock 每行加 `allowedStaff`，并新增 `listRoster` mock：

```typescript
    vi.mocked(adminApi.listAccounts).mockResolvedValue([
      { account: 'boss', displayName: '超管', isSuper: true, allowedPages: ['*'], allowedL4: ['*'], allowedStaff: [], mustChangePassword: false },
      { account: 'liu', displayName: '老刘', isSuper: false, allowedPages: ['projects'], allowedL4: ['北京'], allowedStaff: ['E001'], mustChangePassword: true },
    ])
    vi.mocked(adminApi.listRoster).mockResolvedValue([
      { id: 'E001', name: '张三', l4: '北京组' },
      { id: 'E002', name: '张三', l4: '上海组' },   // 与 E001 同名 → 消歧
      { id: 'E003', name: '李四', l4: '北京组' },
    ])
```

在 `describe` 内追加三个用例：

```typescript
  it('员工选择器按姓名展示、同名附工号消歧', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const opts = (wrapper.vm as any).staffOptions
    expect(opts).toContainEqual({ value: 'E003', label: '李四' })            // 唯一姓名只显姓名
    expect(opts).toContainEqual({ value: 'E001', label: '张三（E001）' })     // 同名附工号
    expect(opts).toContainEqual({ value: 'E002', label: '张三（E002）' })
  })

  it('可见范围列按姓名展示员工(非工号)', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    expect(wrapper.text()).toContain('张三')      // liu 的 allowedStaff=['E001'] → 显示「张三」
    expect(wrapper.text()).not.toContain('E001')  // 不显示原始工号
  })

  it('提交新建携带 allowedStaff(工号)', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'emp'
    vm.form.password = 'pw12345'
    vm.form.displayName = '员工'
    vm.form.allowedPages = ['yitian']
    vm.form.allowedL4 = []
    vm.form.allowedStaff = ['E001', 'E003']
    await vm.submitForm()
    await flushPromises()
    expect(adminApi.createAccount).toHaveBeenCalledWith(
      expect.objectContaining({ allowedStaff: ['E001', 'E003'] }),
    )
  })
```

- [ ] **Step 4: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts`
Expected: 新 3 个 FAIL（`staffOptions` undefined / 文本无「张三」/ 载荷无 allowedStaff）。

- [ ] **Step 5: 改 `frontend/src/views/AdminView.vue` `<script setup>`**

import 增 `listRoster`/`RosterEntry`（6-9 行）：

```typescript
import {
  listAccounts, createAccount, updateAccount, deleteAccount, listRoster,
  type AdminAccount, type RosterEntry,
} from '@/lib/admin'
```

`blankForm`（19-22 行）加 `allowedStaff`：

```typescript
const blankForm = () => ({
  account: '', password: '', displayName: '',
  allowedPages: [] as string[], allowedL4: [] as string[], allowedStaff: [] as string[],
})
```

在 `l4Options`（25-32 行）后加 roster 状态与派生：

```typescript
const roster = ref<RosterEntry[]>([])
const nameCount = computed(() => {
  const m = new Map<string, number>()
  for (const r of roster.value) m.set(r.name, (m.get(r.name) ?? 0) + 1)
  return m
})
const staffOptions = computed(() =>
  roster.value.map((r) => ({
    value: r.id,
    label: (nameCount.value.get(r.name) ?? 0) > 1 ? `${r.name}（${r.id}）` : r.name,
  })),
)
const idToName = computed(() => {
  const m = new Map<string, string>()
  for (const r of roster.value) m.set(r.id, r.name)
  return m
})
function staffLabels(ids: string[] | undefined): string {
  if (!ids || !ids.length) return ''
  return ids.map((id) => idToName.value.get(id) || id).join('、')
}
function scopeLabel(row: AdminAccount): string {
  const l4 = row.allowedL4.includes('*') ? '全部' : (row.allowedL4.join('、') || '')
  const staff = staffLabels(row.allowedStaff)
  return [l4, staff].filter(Boolean).join('；') || '—'
}
```

`reload`（34-43 行）改为一并拉花名册（花名册失败不阻断账号列表）：

```typescript
async function reload() {
  loading.value = true
  try {
    accounts.value = await listAccounts()
    try {
      roster.value = await listRoster()
    } catch {
      roster.value = []   // 花名册缺失/失败 → 选择器空,不阻断账号管理
    }
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}
```

`openEdit`（51-58 行）复制 allowedStaff：

```typescript
function openEdit(row: AdminAccount) {
  editing.value = true
  Object.assign(form, {
    account: row.account, password: '', displayName: row.displayName,
    allowedPages: [...row.allowedPages], allowedL4: [...row.allowedL4],
    allowedStaff: [...(row.allowedStaff ?? [])],
  })
  dialogVisible.value = true
}
```

`submitForm`（60-83 行）两个分支载荷加 `allowedStaff`：

```typescript
    if (editing.value) {
      await updateAccount({
        account: form.account,
        displayName: form.displayName,
        allowedPages: form.allowedPages,
        allowedL4: form.allowedL4,
        allowedStaff: form.allowedStaff,
        ...(form.password ? { password: form.password } : {}),
      })
      ElMessage.success('已保存')
    } else {
      await createAccount({
        account: form.account, password: form.password, displayName: form.displayName,
        allowedPages: form.allowedPages, allowedL4: form.allowedL4, allowedStaff: form.allowedStaff,
      })
      ElMessage.success('已创建')
    }
```

删掉旧 `l4Labels`（105-108 行；被 `scopeLabel` 取代）。`defineExpose`（111 行）加 `staffOptions`/`roster`：

```typescript
defineExpose({ dialogVisible, editing, form, openCreate, openEdit, submitForm, onDelete, reload, staffOptions, roster })
```

- [ ] **Step 6: 改 `AdminView.vue` `<template>`**

把「可见 L4」表格列（138-140 行）替换为「可见范围」（L4 + 员工姓名）：

```html
      <el-table-column label="可见范围" min-width="220">
        <template #default="{ row }">{{ row ? scopeLabel(row) : '' }}</template>
      </el-table-column>
```

在对话框「可见 L4」表单项（179-184 行）之后加「可见员工」表单项：

```html
        <el-form-item label="可见员工">
          <el-select v-model="form.allowedStaff" multiple filterable class="admin-select"
            placeholder="按姓名选择员工(实际存工号)">
            <el-option v-for="o in staffOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <span class="admin-hint">按姓名选择;实际按工号隔离。空=不额外放行个人</span>
        </el-form-item>
```

- [ ] **Step 7: 跑测试确认全过**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts`
Expected: 全 PASS（含新 3 + 既有 4）。

- [ ] **Step 8: 类型检查**

Run: `cd frontend && npm run typecheck`
Expected: 无错误（`AdminAccount.allowedStaff` 可选、`RosterEntry` 已导出、`AuthUser.allowedStaff` 可选）。

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/admin.ts frontend/src/lib/auth.ts frontend/src/views/AdminView.vue frontend/src/views/AdminView.test.ts
git commit -m "feat(admin-ui): 账号加「可见员工」选择器(存工号显姓名)+可见范围列"
```

---

## Task 6: 版本号 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

**Interfaces:** 无（收尾）。

- [ ] **Step 1: 升版本号**

`frontend/src/version.ts`：`APP_VERSION` 升为 `V4.2.0`（Y 级——账号权限新增数据维度、新页面数据源端点），`RELEASE_DATE` 改 `2026-07-21`。（X 级需用户确认；本项为 Y 级：账号模型加维度 + 新增 `/api/admin/roster` 端点，非整页重设计、非大版本。若执行时 X/Y 定级存疑，暂停询问用户。）

- [ ] **Step 2: 更新 `PROGRESS.md`**

在版本史顶部加一条 `V4.2.0`（细粒度权限 Phase 1：数据范围下沉到员工级），一句话结论 + 改动文件清单 + 「非纯前端：升级须换 dist + 覆盖 `data_scope.py`/`auth.py`/`server.py`（含新增 `import projects` 依赖已在库内）+ 重启后端；无需点更新数据；无新增页面/路由/pageKey；新增超管端点 `/api/admin/roster`」。把当前 `[~]` 项标 `[x]`。

- [ ] **Step 3: 全量 verify**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`（后端 pytest + ruff + 前端 typecheck/vitest/build 全绿）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "release: V4.2.0 账号权限细粒度 Phase 1(数据范围下沉到员工级)"
```

---

## Self-Review（对照 spec）

**1. Spec 覆盖**
- §3 数据模型 `allowedStaff` → Task 3。`*` 短路 → data_scope 保留 `'*'` 早返回（Task 1/2 未改该分支）+ 端点超管/`'*'` 走全量（未改，Task 4 Step 6/7 仅动 else 分支）。迁移默认 `[]` → Task 3 `public_user`/`_make_user`。
- §4 各域语义：项目=orgL4 或 PM姓名 → Task 1；工时=员工L4 或 工号 → Task 2；商机不做 → 未触碰 `opportunities`。PM 姓名解析 join → Task 4 `_staff_pm_names`；重名过匹配限制 → 记入代码注释 + PROGRESS。
- §5 后端：data_scope 扩参 Task 1/2；auth Task 3；server roster 提供/端点/接线 Task 4；已关闭项目仍按 L4 → Task 1 `closedProjects` 仍用 `allow`。
- §7 前端：选择器显姓名/表格可见范围列/API/类型 → Task 5；业务页不改 → 计划未触碰任何业务 view。
- §8 安全：服务端强制（端点在服务端过滤，未改）；roster 只出 id/name/l4（Task 4 Step 8）；离册工号 ∩ 花名册（Task 2 keep_roster 天然、Task 4 `_staff_pm_names` 的 `id in sset`）；超管不受限（端点 isSuper 全量分支未改）。
- §9 边界：`'*'` 短路、空范围合法、离册工号、花名册缺失（`_load_roster_cached` 缺文件返 []）、非法 staff（`_validate_str_list` 抛错）→ 分散在 Task 2/3/4。
- §10 测试：data_scope 单测 + 变异（Task 1/2）、auth（Task 3）、server（Task 4）、前端（Task 5）、verify（Task 6）。§11 不做项：计划全程未触碰。

**2. 占位符扫描**：无 TBD/TODO；每个改代码步均给完整代码块与预期输出。

**3. 类型/命名一致性**：`pm_names`（Task 1/4 一致）、`allowed_staff`（Task 2/4 一致）、`allowedStaff`（auth/server/admin.ts/AuthUser/AdminView 一致）、`_load_roster_cached`/`_staff_pm_names`（Task 4 定义、Task 4 内消费）、`RosterEntry`/`listRoster`/`staffOptions`/`scopeLabel`（Task 5 定义与消费一致）、`/api/admin/roster`（Task 4 端点、Task 5 `listRoster` 一致）。

**执行说明**：`data_scope`/`auth`/`server` 三处后端改动向后兼容（新参默认值），既有全量测试须持续绿；Task 4 Step 13 的 `python -m pytest -q` 是横向回归闸。
