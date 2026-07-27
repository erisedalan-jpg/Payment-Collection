# 权限模型两层收敛 + 配置界面重做（V4.5.2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把三层范围模型收敛为「默认 + 页级例外」两层，配置界面补回单页勾选粒度、按使用频率分层，并新增「从现有账号复制权限」。

**Architecture:** 后端 `auth.effective_scope` 删域层分支、签名去掉 `domain`；新增纯函数 `migrate_domain_scopes` 把存量域覆盖物化进 `pageScopes` 后删字段（防权限放大）；`domain_union_scope` 签名与 server.py 6 处裁剪调用点**一行不改**。前端 `AdminView` 页面选择区改三态组复选框 + 组内单页复选框，范围区常驻、例外区折叠，新增复制下拉。

**Tech Stack:** Python 3.8+ 标准库 / pytest；Vue3 + TS + Element Plus / vitest。

## Global Constraints

- 版本 **V4.5.2**（Z 级，用户钦定）。单一来源 `frontend/src/version.ts`，只改此处。
- **不使用任何 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`。交流与注释一律简体中文。
- **安全边界零触碰**：`domain_union_scope` 的**签名**、`server.py` 中它的 6 处调用点、`data_scope.filter_analysis_data`、`data_scope.scope_yitian_data`、`config.PAGE_DOMAINS` / `config.DOMAIN_PAGES`、商机域 staff 恒清空 —— **一律不动**。
- `allowedStaff` **保留**（用户钦定），每个范围编辑点仍是「L4 + 员工」两轴。
- ruff 只 select `E9/F63/F7/F82`，不含 ARG —— 保留 unused 的 `domain` 参数**不会报错，无需 noqa**。
- 完成定义：`bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
- 提交信息结尾加：`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **绝不 `git add -A` / `git add .`** —— 工作树有未跟踪的 `yitian/` 目录，只 add 本任务明确改动的文件。
- 本期**不 push**（用户要求第四期做完一起推）。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `auth.py` | 改 | `effective_scope` 两层 + 删域校验 + 新增 `migrate_domain_scopes` / `migrate_accounts_file` |
| `tests/test_auth_domain_scope.py` | **删除** | 见 Task 1 步骤 1 的假绿警告 |
| `tests/test_auth_page_scope.py` | 改 | 三层断言改两层、CRUD 调用去掉 `domain_scopes` 位置参数 |
| `tests/test_auth_migrate.py` | 新建 | 迁移等价性 + 幂等 + 不覆写页层 |
| `tests/test_auth_admin.py` | 改 1 行 | `public_user` 键集断言去掉 `domainScopes` |
| `server.py` | 改 | 启动调迁移 + create/update 忽略 `domainScopes` + `_scope_staff_ids` + 审计文案 |
| `tests/test_server_admin.py` | 改 | 域覆盖用例改写为「传了被忽略」 |
| `tests/test_server_data.py` | 改 | fixture 域覆盖 → 等价的默认范围 |
| `tests/test_server_opportunities.py` | 改 | 同上 |
| `tests/test_server_page_scope.py` | 改 | fixture 去掉 `"domainScopes": {}` |
| `frontend/src/lib/pageScope.ts` | 改 | `effectiveScope` 删域分支。**`PAGE_DOMAINS` 保留** |
| `frontend/src/lib/pageScope.test.ts` | 改 | 三层 → 两层 |
| `frontend/src/lib/admin.ts` | 改 | `AdminAccount` / 两个入参类型删 `domainScopes` |
| `frontend/src/lib/auth.ts` | 改 | `AuthUser` 删 `domainScopes` |
| `frontend/src/views/AdminView.vue` | 大改 | Task 4/5/6 三次改同一文件 |
| `frontend/src/views/AdminView.test.ts` | 大改 | 同上 |
| `frontend/src/version.ts` | 改 | V4.5.2 |
| `PROGRESS.md` | 改 | 版本条目 |

**Task 4 / 5 / 6 改同一个 `AdminView.vue`，必须严格串行，不得并行派发。**

---

## Task 1: `auth.py` 两层收敛 + 迁移纯函数

**Files:**
- Modify: `auth.py`（`_make_user` ~69、`public_user` ~103、`_validate_domain_scopes` ~214、`effective_scope` ~235、`domain_union_scope` ~248、`create_account` ~288、`update_account` ~312、`add_account` ~374、`edit_account` ~386）
- Delete: `tests/test_auth_domain_scope.py`
- Modify: `tests/test_auth_page_scope.py`、`tests/test_auth_admin.py:148-150`
- Create: `tests/test_auth_migrate.py`

**Interfaces:**
- Produces:
  - `auth.effective_scope(rec: dict, page_key: str | None = None) -> tuple`（**签名变更**：去掉 `domain`）
  - `auth.domain_union_scope(rec, domain, page_keys) -> tuple`（**签名不变**）
  - `auth.migrate_domain_scopes(accounts: dict) -> tuple[dict, int]`（纯函数，返回新 accounts 与改动账号数）
  - `auth.migrate_accounts_file() -> int`（做 IO + 备份，供 `server.main()` 调）
  - `create_account` / `update_account` / `add_account` / `edit_account` 去掉 `domain_scopes` 形参
- Consumes: `config.DOMAIN_PAGES`

- [ ] **Step 1: 删除 `tests/test_auth_domain_scope.py`**

```bash
git rm tests/test_auth_domain_scope.py
```

**为什么整体删除而不是逐条改**：该文件的断言形如

```python
assert auth.effective_scope(rec, "project") == (["D1"], ["E1"])
```

签名改成 `(rec, page_key=None)` 后，`"project"` 会被当作 **page_key** 传入 —— 它不是合法 pageKey，`pageScopes` 查不到，于是回退默认范围，**恰好等于原断言值，测试静默变绿**。第 11/12/13 行三条断言会以这种方式假绿，只有第 20 行会真红。

**绝不允许「跑一遍看哪条红了就改哪条」** —— 那样会留下三条什么都没验证的测试。

- [ ] **Step 2: 写迁移的失败测试**

Create `tests/test_auth_migrate.py`:

```python
import auth
import config


def _legacy_effective_scope(rec, domain, page_key=None):
    """V4.5.2 前的三层解析,仅供迁移等价性对拍。不得引用生产代码(它已被改)。"""
    if page_key is not None:
        ps = (rec.get('pageScopes') or {}).get(page_key)
        if isinstance(ps, dict):
            return list(ps.get('l4', []) or []), list(ps.get('staff', []) or [])
    ds = (rec.get('domainScopes') or {}).get(domain)
    if isinstance(ds, dict):
        return list(ds.get('l4', []) or []), list(ds.get('staff', []) or [])
    return list(rec.get('allowedL4', []) or []), list(rec.get('allowedStaff', []) or [])


def test_migrate_empty_domain_scopes_only_drops_field():
    a = {"version": 1, "users": {"u": {
        "isSuper": False, "allowedPages": ["*"], "allowedL4": ["D1"],
        "allowedStaff": [], "domainScopes": {}, "pageScopes": {}}}}
    out, changed = auth.migrate_domain_scopes(a)
    assert changed == 1
    assert "domainScopes" not in out["users"]["u"]
    assert out["users"]["u"]["pageScopes"] == {}
    assert a["users"]["u"]["domainScopes"] == {}          # 不改入参


def test_migrate_is_idempotent():
    a = {"version": 1, "users": {"u": {
        "isSuper": False, "allowedPages": ["*"], "allowedL4": ["D1"],
        "allowedStaff": [], "domainScopes": {"yitian": {"l4": ["Dy"], "staff": []}}}}}
    once, c1 = auth.migrate_domain_scopes(a)
    twice, c2 = auth.migrate_domain_scopes(once)
    assert c1 == 1 and c2 == 0
    assert once["users"]["u"] == twice["users"]["u"]


def test_migrate_materializes_and_preserves_every_page_scope():
    """承重:迁移前的三层解析 == 迁移后的两层解析,逐页比对。"""
    rec = {"isSuper": False, "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": ["E0"],
           "domainScopes": {"project": {"l4": ["Dp"], "staff": ["E1"]},
                            "yitian": {"l4": ["Dy"], "staff": ["E2"]}},
           "pageScopes": {"projects": {"l4": ["Dkeep"], "staff": []}}}
    a = {"version": 1, "users": {"u": dict(rec)}}
    out, _ = auth.migrate_domain_scopes(a)
    new_rec = out["users"]["u"]
    for page, dom in config.PAGE_DOMAINS.items():
        assert _legacy_effective_scope(rec, dom, page) == auth.effective_scope(new_rec, page), page


def test_migrate_does_not_overwrite_existing_page_scope():
    a = {"version": 1, "users": {"u": {
        "isSuper": False, "allowedPages": ["*"], "allowedL4": [], "allowedStaff": [],
        "domainScopes": {"project": {"l4": ["Ddom"], "staff": []}},
        "pageScopes": {"projects": {"l4": ["Dpage"], "staff": []}}}}}
    out, _ = auth.migrate_domain_scopes(a)
    assert out["users"]["u"]["pageScopes"]["projects"] == {"l4": ["Dpage"], "staff": []}


def test_migrate_skips_pages_account_cannot_access():
    """账号进不去的页不落 pageScopes —— 否则配置里堆一堆无意义条目。"""
    a = {"version": 1, "users": {"u": {
        "isSuper": False, "allowedPages": ["projects", "yitian"], "allowedL4": [], "allowedStaff": [],
        "domainScopes": {"project": {"l4": ["Dp"], "staff": []}}}}}
    out, _ = auth.migrate_domain_scopes(a)
    ps = out["users"]["u"]["pageScopes"]
    assert "projects" in ps
    assert "overview" not in ps and "activity" not in ps


def test_migrate_super_only_drops_field():
    a = {"version": 1, "users": {"boss": {
        "isSuper": True, "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
        "domainScopes": {"project": {"l4": ["Dp"], "staff": []}}, "pageScopes": {}}}}
    out, _ = auth.migrate_domain_scopes(a)
    assert "domainScopes" not in out["users"]["boss"]
    assert out["users"]["boss"]["pageScopes"] == {}       # 超管短路,不物化
```

- [ ] **Step 3: 运行，确认失败**

Run: `python -m pytest tests/test_auth_migrate.py -q`
Expected: FAIL with `AttributeError: module 'auth' has no attribute 'migrate_domain_scopes'`

- [ ] **Step 4: 在 `auth.py` 实现两层解析与迁移**

替换 `effective_scope`（原 235-245 行）：

```python
def effective_scope(rec: dict, page_key: str | None = None) -> tuple:
    """(l4, staff) 两层解析:pageScopes[page_key] ?? 默认范围(allowedL4/allowedStaff)。
    page_key=None → 直接取默认。显式空覆盖返回空(≠缺省回退)。
    V4.5.2:域层已删除,原三层的中间一跳不复存在。"""
    if page_key is not None:
        ps = (rec.get('pageScopes') or {}).get(page_key)
        if isinstance(ps, dict):
            return list(ps.get('l4', []) or []), list(ps.get('staff', []) or [])
    return list(rec.get('allowedL4', []) or []), list(rec.get('allowedStaff', []) or [])
```

`domain_union_scope` **只改内部两处调用**，签名与其余逻辑一字不动，并补 docstring 说明：

```python
def domain_union_scope(rec: dict, domain: str, page_keys) -> tuple:
    """对 page_keys 求 effective_scope 并集。任一 l4 含 '*' → (['*'], [])。空 page_keys → 回退默认。

    V4.5.2:`domain` 参数已不参与解析(两层模型无域层),保留仅为调用点兼容 ——
    server.py 6 处调用点属服务端裁剪链路(安全边界),本期承诺不触碰其签名。"""
    keys = list(page_keys or [])
    if not keys:
        l4, staff = effective_scope(rec, None)
        return (['*'], []) if '*' in l4 else (l4, staff)
    l4set: set = set()
    staffset: set = set()
    for pk in keys:
        l4, staff = effective_scope(rec, pk)
        if '*' in l4:
            return ['*'], []
        l4set.update(l4)
        staffset.update(staff)
    return list(l4set), list(staffset)
```

删除 `_SCOPE_DOMAINS`（211 行）与 `_validate_domain_scopes`（214-232 行）整块。

`_make_user`：删 `domain_scopes` 形参与 `'domainScopes': ...` 那行。
`public_user`：删 `'domainScopes': rec.get('domainScopes', {}),` 那行。
`create_account` / `update_account` / `add_account` / `edit_account`：删 `domain_scopes` 形参、删 `domain_scopes = _validate_domain_scopes(domain_scopes)` 与 `rec['domainScopes'] = ...`、删传递该实参的那一处。

在 `_validate_page_scopes` 之后新增：

```python
def migrate_domain_scopes(accounts: dict) -> tuple:
    """把 domainScopes 物化进 pageScopes 后删除该字段(V4.5.2 两层收敛)。
    返回 (新 accounts, 改动账号数)。幂等;不改入参。

    为什么必须物化而非直接忽略:域覆盖的典型用途是【收窄】(默认 ['*']、某域限某 L4)。
    若代码删了域分支而数据里仍躺着非空 domainScopes,该域会回退到【更宽的默认】——
    服务端将下发越权数据,即权限放大。物化把域层语义无损翻译到优先级更高的页层,
    杜绝这个窗口。生产虽全空,但备份回滚/其它部署副本/lts 变体都可能带非空数据进来。

    物化目标是最高优先级层,因此升级后的数据拿回旧版程序跑行为也一致(双向兼容)。"""
    import config
    users = accounts.get('users', {})
    new_users: dict = {}
    changed = 0
    for acc, rec in users.items():
        if 'domainScopes' not in rec:
            new_users[acc] = rec
            continue
        new_rec = dict(rec)
        ds = new_rec.pop('domainScopes')
        if isinstance(ds, dict) and ds and not rec.get('isSuper'):
            pages = rec.get('allowedPages') or []
            star = '*' in pages
            ps = dict(new_rec.get('pageScopes') or {})
            for dom, scope in ds.items():
                if not isinstance(scope, dict):
                    continue
                for pk in config.DOMAIN_PAGES.get(dom, []):
                    if pk in ps:                        # 页层本就优先,绝不覆写
                        continue
                    if not (star or pk in pages):       # 账号进不去的页不必落
                        continue
                    ps[pk] = {'l4': list(scope.get('l4') or []),
                              'staff': list(scope.get('staff') or [])}
            new_rec['pageScopes'] = ps
        new_users[acc] = new_rec
        changed += 1
    out = dict(accounts)
    out['users'] = new_users
    return out, changed


def migrate_accounts_file() -> int:
    """读 accounts.json → 迁移 → 有改动则先备份再写回。返回改动账号数。
    备份名 accounts.json.bak-YYYYMMDD,同日重复运行不覆盖已有备份。"""
    with _accounts_mutate_lock:
        data = load_accounts()
        out, changed = migrate_domain_scopes(data)
        if changed:
            import shutil
            stamp = time.strftime('%Y%m%d')
            bak = f'{ACCOUNTS_FILE}.bak-{stamp}'
            if os.path.exists(ACCOUNTS_FILE) and not os.path.exists(bak):
                shutil.copy2(ACCOUNTS_FILE, bak)
            save_accounts(out)
        return changed
```

- [ ] **Step 5: 运行迁移测试，确认通过**

Run: `python -m pytest tests/test_auth_migrate.py -q`
Expected: PASS（6 passed）

- [ ] **Step 6: 修 `tests/test_auth_page_scope.py`**

前两个函数改写为两层语义（**注意签名少了一个参数**）：

```python
def test_effective_scope_two_tier():
    rec = {"allowedL4": ["D0"], "allowedStaff": ["E0"],
           "pageScopes": {"temp-followup": {"l4": ["Dpage"], "staff": []}}}
    assert auth.effective_scope(rec, "temp-followup") == (["Dpage"], [])   # 页覆盖
    assert auth.effective_scope(rec, "projects") == (["D0"], ["E0"])       # 回退默认
    assert auth.effective_scope(rec, "yitian") == (["D0"], ["E0"])         # 回退默认
    assert auth.effective_scope(rec) == (["D0"], ["E0"])                   # 不传页=默认


def test_effective_scope_explicit_empty_page():
    rec = {"allowedL4": ["*"], "allowedStaff": [], "pageScopes": {"projects": {"l4": [], "staff": []}}}
    assert auth.effective_scope(rec, "projects") == ([], [])
    assert auth.effective_scope(rec, "overview") == (["*"], [])
```

`test_domain_union_scope` 与 `test_domain_union_star_short_circuit` **保持原样**（签名未变）。

其余 5 个函数把 `create_account` 的第 8 个位置参数（原 `domain_scopes`，值为 `None` 或字典）**删掉**。例如：

```python
# 原:auth.create_account(_accounts(), "u", "pw", "U", ["*"], ["*"], [], None, {"temp-followup": {...}})
# 改:
a = auth.create_account(_accounts(), "u", "pw", "U", ["*"], ["*"], [], {"temp-followup": {"l4": ["Dx"], "staff": []}})
```

逐处对应：`test_create_with_page_scopes_and_public`（去掉 `None,`）、`test_page_scopes_validation`（两处去掉 `None,`）、`test_opportunity_page_staff_cleared`（去掉 `None,`）、`test_update_page_scopes_none_keeps`（去掉 `None,`）。`test_page_scopes_defaults_and_migration` 无需改（未传该参数）。

- [ ] **Step 7: 修 `tests/test_auth_admin.py` 的键集断言**

`tests/test_auth_admin.py:148-150`，删掉 `'domainScopes',`：

```python
        assert set(a.keys()) == {'account', 'displayName', 'isSuper',
                                 'allowedPages', 'allowedL4', 'allowedStaff',
                                 'pageScopes', 'mustChangePassword'}
```

- [ ] **Step 8: 跑全部后端 auth 测试**

Run: `python -m pytest tests/test_auth_page_scope.py tests/test_auth_admin.py tests/test_auth_migrate.py -q`
Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add auth.py tests/test_auth_page_scope.py tests/test_auth_admin.py tests/test_auth_migrate.py
git rm --cached tests/test_auth_domain_scope.py 2>/dev/null || true
git commit -m "refactor(auth): V4.5.2 范围模型三层收敛为两层 + domainScopes 物化迁移

删 domainScopes 字段与校验;effective_scope 签名去掉 domain(两层:页 ?? 默认)。
domain_union_scope 签名与 6 处服务端裁剪调用点一行不改(安全边界零触碰)。
新增 migrate_domain_scopes 纯函数:域覆盖物化进 pageScopes 后删字段 ——
直接忽略会让域回退更宽的默认 = 权限放大。

test_auth_domain_scope.py 整体删除:其断言在新签名下会因
「域名被当 page_key、查不到、回退默认」而静默变绿,改断言凑绿等于留下空测试。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `server.py` 接线 + server 测试修复

**Files:**
- Modify: `server.py`（`_scope_staff_ids` ~589、`handle_admin_account_create` ~4053、`handle_admin_account_update` ~4079、`main` ~4635）
- Modify: `tests/test_server_admin.py`、`tests/test_server_data.py`、`tests/test_server_opportunities.py`、`tests/test_server_page_scope.py`

**Interfaces:**
- Consumes: Task 1 的 `auth.migrate_accounts_file()`、`auth.add_account` / `auth.edit_account`（已无 `domain_scopes` 参数）

- [ ] **Step 1: 改 `server.py` 四处**

`_scope_staff_ids`（589-596）—— 只遍历 `pageScopes`，返回语义不变：

```python
def _scope_staff_ids(rec):
    """账号 default/页 scope 里出现的全部工号集(供 staffNames 解析)。"""
    ids = set(rec.get('allowedStaff') or [])
    for v in (rec.get('pageScopes') or {}).values():
        if isinstance(v, dict):
            ids.update(v.get('staff') or [])
    return ids
```

`handle_admin_account_create`（4053-4064）—— 审计文案删「分域」、调用删实参，并对旧版前端传来的字段记警告：

```python
        self._audit_target = str(data.get('account', ''))
        self._audit_detail = '授予页面%s L4%s 员工%s%s' % (
            data.get('allowedPages', []), data.get('allowedL4', []), data.get('allowedStaff', []),
            ('，逐页%d' % len(data.get('pageScopes') or {})) if data.get('pageScopes') else '')
        if data.get('domainScopes'):
            logger.warning('收到已废弃的 domainScopes 字段(V4.5.2 已删除),忽略')
        try:
            user = auth.add_account(
                data.get('account', ''), data.get('password', ''),
                data.get('displayName', ''), data.get('allowedPages', []),
                data.get('allowedL4', []), data.get('allowedStaff', []),
                data.get('pageScopes'))
```

**为什么忽略而不是 400**：旧版前端缓存页面提交时不应直接炸掉。

`handle_admin_account_update`（4079-4104）—— 删 `_changed` 里的「分域范围」分支与 `domain_scopes=` 实参：

```python
        if data.get('allowedStaff') is not None:
            _changed.append('员工范围')
        if data.get('pageScopes') is not None:
            _changed.append('逐页范围')
```

```python
            user = auth.edit_account(
                account,
                display_name=data.get('displayName'),
                pages=data.get('allowedPages'),
                l4=data.get('allowedL4'),
                staff=data.get('allowedStaff'),
                page_scopes=data.get('pageScopes'),
                password=data.get('password'))
```

`main()`（4635）在种子之后加一行：

```python
    auth.seed_default_accounts()
    _migrated = auth.migrate_accounts_file()          # V4.5.2 域层物化迁移(幂等,无域覆盖时空操作)
    if _migrated:
        logger.info(f"账号权限迁移:{_migrated} 个账号的 domainScopes 已物化进 pageScopes")
```

- [ ] **Step 2: 改 `tests/test_server_admin.py:271-286`**

`test_super_create_with_domain_scopes` 改写为「传了被忽略」：

```python
def test_super_create_ignores_legacy_domain_scopes(admin_server):
    """V4.5.2:域层已删。旧版前端仍可能提交 domainScopes —— 必须忽略而非报错。"""
    port = admin_server
    _, cookie, _ = _login(port, "boss", "bosspw")
    status, data = _req(
        port, "POST", "/api/admin/accounts/create", cookie,
        {"account": "dm", "password": "pw12345", "displayName": "分域",
         "allowedPages": ["*"], "allowedL4": ["*"], "allowedStaff": [],
         "domainScopes": {"yitian": {"l4": ["Dx"], "staff": ["E1"]}}},
    )
    assert status == 200
    assert "domainScopes" not in data["user"]
    _, lst = _req(port, "GET", "/api/admin/accounts", cookie)
    dm = next(a for a in lst["accounts"] if a["account"] == "dm")
    assert "domainScopes" not in dm
```

- [ ] **Step 3: 改 `tests/test_server_data.py:123-127` 的 fixture**

原意是「默认全部、project 域收窄到 D1，验证下发只含 D1」。两层模型下等价写法是直接把默认设为 D1：

```python
    auth.save_accounts({"version": 1, "users": {
        "u": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
              "allowedPages": ["*"], "allowedL4": ["D1"], "allowedStaff": [],
              "pageScopes": {}, "displayName": "u"},
    }})
```

**该测试的断言不动** —— 它验证的是「服务端按范围裁剪后下发」，换配置形式后结论必须仍成立。若断言变红说明裁剪链路被误伤，立即停手排查。

- [ ] **Step 4: 改 `tests/test_server_opportunities.py:34-39` 的 fixture**

同理，把域覆盖换成默认范围：

```python
    # 默认可见范围仅 D2(V4.5.2 前此处用 domainScopes.opportunity 表达,两层模型下直接设默认)
    auth.save_accounts({"version": 1, "users": {
        "u": {"salt": salt, "hash": auth.hash_password("p", salt), "isSuper": False,
              "allowedPages": ["*"], "allowedL4": ["D2"], "allowedStaff": [],
              "pageScopes": {}, "displayName": "u"},
    }})
```

断言同样不动。

- [ ] **Step 5: 改 `tests/test_server_page_scope.py:41` 与 `:64`**

各删掉 `"domainScopes": {},`（空值，删除后行为不变）。

- [ ] **Step 6: 跑后端全量**

Run: `python -m pytest -q`
Expected: PASS（全绿）

- [ ] **Step 7: 提交**

```bash
git add server.py tests/test_server_admin.py tests/test_server_data.py tests/test_server_opportunities.py tests/test_server_page_scope.py
git commit -m "refactor(server): V4.5.2 接线两层范围模型 + 启动时物化迁移

create/update 不再透传 domainScopes(收到即忽略并记警告,不返回 400 ——
防旧版前端缓存页面提交后炸掉);_scope_staff_ids 只遍历 pageScopes;审计文案去「分域」。
main() 在账号种子后调 migrate_accounts_file(幂等,生产无域覆盖时为空操作)。

data/opportunities 两处 fixture 的域覆盖改为等价的默认范围,断言一字未动 ——
它们验证服务端裁剪,换配置形式后结论必须仍成立。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 前端类型与 `pageScope` 两层

**Files:**
- Modify: `frontend/src/lib/pageScope.ts:21-29`、`frontend/src/lib/pageScope.test.ts:10-17`、`frontend/src/lib/admin.ts:10,42,51`、`frontend/src/lib/auth.ts:10`

**Interfaces:**
- Produces: `effectiveScope(user: AuthUser, pageKey: PageKey): Scope`（签名不变，实现少一跳）；`AuthUser` / `AdminAccount` 不再有 `domainScopes`

- [ ] **Step 1: 改 `pageScope.test.ts` 的三层用例为两层**

```ts
describe('effectiveScope 两层', () => {
  it('页 > 默认', () => {
    const u = U({ allowedL4: ['D0'],
                  pageScopes: { 'temp-followup': { l4: ['Dpage'], staff: [] } } })
    expect(effectiveScope(u, 'temp-followup')).toEqual({ l4: ['Dpage'], staff: [] })
    expect(effectiveScope(u, 'projects')).toEqual({ l4: ['D0'], staff: [] })
    expect(effectiveScope(u, 'yitian')).toEqual({ l4: ['D0'], staff: [] })
  })
```

（`it('显式空覆盖', ...)` 及其后的用例保持原样。）

- [ ] **Step 2: 运行，确认失败**

Run: `npm --prefix frontend run test:run -- src/lib/pageScope.test.ts`
Expected: FAIL —— `effectiveScope(u,'projects')` 仍会命中已删的域分支返回 `Ddom`（或 TS 报 `domainScopes` 不存在）

- [ ] **Step 3: 改 `pageScope.ts` 的 `effectiveScope`**

```ts
/** 两层解析:pageScopes[page] ?? 默认(allowedL4/allowedStaff)。V4.5.2 域层已删。
 *  PAGE_DOMAINS 保留 —— 例外下拉过滤与空范围提示仍依赖它。 */
export function effectiveScope(user: AuthUser, pageKey: PageKey): Scope {
  const ps = user.pageScopes?.[pageKey]
  if (ps) return { l4: ps.l4 ?? [], staff: ps.staff ?? [] }
  return { l4: user.allowedL4 ?? [], staff: user.allowedStaff ?? [] }
}
```

注意 `import type { PageKey }` 与 `PAGE_DOMAINS` 均保留；若 `dom` 变量变成未使用，一并删掉那一行。

- [ ] **Step 4: 删两个类型里的 `domainScopes`**

`frontend/src/lib/auth.ts:10` 删 `domainScopes?: ...` 一行。
`frontend/src/lib/admin.ts` 删三处：`AdminAccount` 的 10 行、`createAccount` 入参的 42 行、`updateAccount` 入参的 51 行。

- [ ] **Step 5: 验证**

Run: `npm --prefix frontend run test:run -- src/lib/pageScope.test.ts` → PASS
Run: `npm --prefix frontend run typecheck`
Expected: 只在 `AdminView.vue` / `AdminView.test.ts` 报 `domainScopes` 相关错（Task 4-6 修）。**若其它文件也报错，说明有本计划未覆盖的消费方，停手并报告。**

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/pageScope.ts frontend/src/lib/pageScope.test.ts frontend/src/lib/admin.ts frontend/src/lib/auth.ts
git commit -m "refactor(frontend): V4.5.2 effectiveScope 两层 + 类型删 domainScopes

PAGE_DOMAINS 保留(例外下拉过滤与空范围提示依赖)。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `AdminView` 页面选择区改三态 + 单页复选框

> 这是用户诉求的正解：当前界面只能整组勾选，物理上配不出「只看成本分析」。

**Files:**
- Modify: `frontend/src/views/AdminView.vue`（script 的 `toggleGroup`/`groupChecked` 区、template 的「可访问页面」表单项、style）
- Modify: `frontend/src/views/AdminView.test.ts`

**Interfaces:**
- Produces: `togglePage(key: string, on: boolean)`、`groupIndeterminate(groupKey: string): boolean`（经 `defineExpose` 暴露给测试）

- [ ] **Step 1: 写失败测试**

追加到 `AdminView.test.ts` 的 `describe('AdminView')` 内：

```ts
  it('单页勾选:只加该页,不带出同组其它页(用户诉求「只看成本分析」)', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.togglePage('insight-costdetail', true)
    expect(vm.form.allowedPages).toEqual(['insight-costdetail'])
  })

  it('组复选框三态:空 / 半选 / 全选', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    expect(vm.groupChecked('project')).toBe(false)
    expect(vm.groupIndeterminate('project')).toBe(false)

    vm.togglePage('insight-costdetail', true)          // 半选
    expect(vm.groupChecked('project')).toBe(false)
    expect(vm.groupIndeterminate('project')).toBe(true)

    vm.toggleGroup('project', true)                    // 全选
    expect(vm.groupChecked('project')).toBe(true)
    expect(vm.groupIndeterminate('project')).toBe(false)
  })

  it('单页取消:整组已选时取消一页 → 组变半选', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.toggleGroup('payment', true)
    vm.togglePage('payment-nodes', false)
    expect(vm.groupChecked('payment')).toBe(false)
    expect(vm.groupIndeterminate('payment')).toBe(true)
    expect(vm.form.allowedPages).not.toContain('payment-nodes')
  })

  it('模板渲染出组内单页复选框(不止 7 个组标题)', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    await flushPromises()
    // 30 个页面 + 7 个组标题 + 1 个「全部页面」= 38;断言下界防「只渲染组标题」的回退。
    // 这条专防「函数写了但模板没接线」—— 光有 togglePage 而模板仍只渲染 7 个组标题时,
    // 上面三条 vm 层测试全绿,只有这条会红。
    expect(wrapper.findAll('.el-checkbox').length).toBeGreaterThanOrEqual(30)
  })
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm --prefix frontend run test:run -- src/views/AdminView.test.ts`
Expected: FAIL with `vm.togglePage is not a function`

- [ ] **Step 3: 实现**

`AdminView.vue` script 中，在 `toggleGroup` 之后加：

```ts
function togglePage(key: string, on: boolean) {
  const set = new Set(form.allowedPages.filter((k) => k !== '*'))
  on ? set.add(key) : set.delete(key)
  form.allowedPages = [...set]
}
function groupIndeterminate(groupKey: string): boolean {
  if (form.allowedPages.includes('*')) return false
  const g = NAV_GROUPS.find((x) => x.key === groupKey)
  if (!g) return false
  const n = g.links.filter((l) => form.allowedPages.includes(l.key)).length
  return n > 0 && n < g.links.length
}
```

template 的「可访问页面」表单项整体替换为：

```vue
        <el-form-item label="可访问页面">
          <el-checkbox :model-value="form.allowedPages.includes('*')"
            @change="(v:boolean)=> form.allowedPages = v ? ['*'] : []">全部页面（含未来新增）</el-checkbox>
          <div v-if="!form.allowedPages.includes('*')" class="admin-pages">
            <div v-for="g in NAV_GROUPS" :key="g.key" class="admin-pgroup">
              <el-checkbox class="admin-pgroup-h" :model-value="groupChecked(g.key)"
                :indeterminate="groupIndeterminate(g.key)"
                @change="(v:boolean)=> toggleGroup(g.key, v)">{{ g.label }}</el-checkbox>
              <div class="admin-pgroup-items">
                <el-checkbox v-for="l in g.links" :key="l.key"
                  :model-value="form.allowedPages.includes(l.key)"
                  @change="(v:boolean)=> togglePage(l.key, v)">{{ l.label }}</el-checkbox>
              </div>
            </div>
          </div>
        </el-form-item>
```

**不要用 `el-checkbox-group`** —— 组标题与单页复选框混在同一 group 内会被其 v-model 隐式接管，与手动 `:model-value`/`@change` 冲突。全部手动管理，与本文件既有风格一致。

`defineExpose` 补 `togglePage, groupIndeterminate`。

弹窗宽度 `width="520px"` 改 `width="640px"`。

style 追加：

```css
.admin-pages { width: 100%; }
.admin-pgroup { margin-top: var(--sp-2); }
.admin-pgroup-h { font-weight: 700; }
.admin-pgroup-items { display: flex; flex-wrap: wrap; gap: 0 var(--sp-3); padding-left: var(--sp-4); }
```

- [ ] **Step 4: 验证**

Run: `npm --prefix frontend run test:run -- src/views/AdminView.test.ts`
Expected: 新增 4 条 PASS；`覆盖列表:域目标写 domainScopes...` 那条仍 FAIL（Task 5 处理）

若最后一条（复选框计数）因 `el-dialog` 在 jsdom 中不渲染内容而失败，**不要删掉这条测试** —— 它是本 Task 唯一能发现「函数写了但模板没接线」的断言。改为给测试里的 dialog 传 `:destroy-on-close="false"`，或把 `STUBS` 加上 `'el-dialog': { template: '<div><slot /><slot name="footer" /></div>' }` 让内容原地渲染。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/AdminView.vue frontend/src/views/AdminView.test.ts
git commit -m "feat(admin): V4.5.2 页面选择区改三态组复选框 + 组内单页勾选

补回被 V4.3.1「减少点击」改版砍掉的单页粒度 —— 此前界面只能整组勾选,
物理上配不出「只看成本分析」这类账号,而后端 _can_page 一直是逐页精确匹配。
组级一击保留(indeterminate 三态),两种粒度统一在同一控件。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `AdminView` 高级区折叠 + 例外下拉过滤 + 孤儿清理 + 空范围提示

**Files:**
- Modify: `frontend/src/views/AdminView.vue`、`frontend/src/views/AdminView.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `togglePage` / `groupIndeterminate`
- Produces: `advancedOpen: Ref<boolean>`、`overrideTargets: ComputedRef<{value,label}[]>`、`emptyScopePages: ComputedRef<string[]>`（经 `defineExpose`）

- [ ] **Step 1: 写失败测试**

替换 `AdminView.test.ts` 中 `覆盖列表:域目标写 domainScopes、页目标写 pageScopes(商机 staff 空)` 整条，并追加：

```ts
  it('例外只写 pageScopes(商机 staff 恒空),不再有域目标', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'pp'; vm.form.password = 'pw12345'; vm.form.displayName = 'P'
    vm.form.allowedPages = ['*']; vm.form.allowedL4 = ['*']
    vm.form.overrides = [
      { target: 'temp-followup', l4: ['Dp'], staff: [] },
      { target: 'opportunities-progress', l4: ['Do'], staff: ['E9'] },
    ]
    await vm.submitForm(); await flushPromises()
    const p = vi.mocked(adminApi.createAccount).mock.calls[0][0] as any
    expect(p.domainScopes).toBeUndefined()
    expect(p.pageScopes['temp-followup']).toEqual({ l4: ['Dp'], staff: [] })
    expect(p.pageScopes['opportunities-progress']).toEqual({ l4: ['Do'], staff: [] })
  })

  it('例外目标下拉只列已勾选、有数据域、非 governance 的页', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.allowedPages = ['insight-costdetail', 'budget', 'governance']
    const vals = vm.overrideTargets.map((t: any) => t.value)
    expect(vals).toEqual(['insight-costdetail'])   // budget 无数据域;governance 沿既有语义排除
  })

  it('孤儿例外在提交时被丢弃(取消勾选该页后)', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'o'; vm.form.password = 'pw12345'; vm.form.displayName = 'O'
    vm.form.allowedPages = ['projects']
    vm.form.overrides = [
      { target: 'projects', l4: ['D1'], staff: [] },
      { target: 'temp-followup', l4: ['D2'], staff: [] },   // 未勾选 → 孤儿
    ]
    await vm.submitForm(); await flushPromises()
    const p = vi.mocked(adminApi.createAccount).mock.calls[0][0] as any
    expect(Object.keys(p.pageScopes)).toEqual(['projects'])
  })

  it('编辑存量账号:pageScopes 非空则高级区强制展开', async () => {
    // 直接给 openEdit 传字面量,不经 accounts —— 若写成 `vm.accounts?.[0] ?? {兜底对象}`,
    // accounts 没加载时会退到兜底对象、测试照样绿,等于什么都没验证。
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    expect(vm.advancedOpen).toBe(false)          // 新建默认折叠
    vm.openEdit({
      account: 'x', displayName: 'X', isSuper: false, allowedPages: ['projects'],
      allowedL4: ['北京'], allowedStaff: [], pageScopes: { projects: { l4: ['D1'], staff: [] } },
    })
    expect(vm.advancedOpen).toBe(true)           // 有存量例外 → 展开
    expect(vm.form.overrides).toEqual([{ target: 'projects', l4: ['D1'], staff: [] }])

    vm.openEdit({                                 // 反向:无例外 → 保持折叠
      account: 'y', displayName: 'Y', isSuper: false, allowedPages: ['projects'],
      allowedL4: ['北京'], allowedStaff: [], pageScopes: {},
    })
    expect(vm.advancedOpen).toBe(false)
  })

  it('空范围提示:已勾有数据域的页但范围为空 → 列出该页', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.allowedPages = ['projects', 'budget']
    vm.form.allowedL4 = []
    vm.form.allowedStaff = []
    expect(vm.emptyScopePages).toContain('在建项目')
    expect(vm.emptyScopePages).not.toContain('概算工具')   // 无数据域,不该被拦
  })
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm --prefix frontend run test:run -- src/views/AdminView.test.ts`
Expected: FAIL（`vm.overrideTargets is not a function` / `advancedOpen` undefined 等）

- [ ] **Step 3: 实现**

script 改动：

删除 `OVERRIDE_TARGETS` 常量与 `targetIsOpp` 函数，替换为：

```ts
const advancedOpen = ref(false)

/** 例外目标:该账号已勾选(或 '*')∩ 有数据域 ∩ 非 governance(沿既有语义排除)。
 *  给没勾的页配范围本是无意义配置,顺手堵死;配「只看成本分析」的账号这里只有 1 项。 */
const overrideTargets = computed(() => {
  const all = NAV_GROUPS.flatMap((g) => g.links)
  const star = form.allowedPages.includes('*')
  return all
    .filter((l) => (star || form.allowedPages.includes(l.key)))
    .filter((l) => PAGE_DOMAINS[l.key] && l.key !== 'governance')
    .map((l) => ({ value: l.key, label: l.label }))
})
function targetIsOpp(key: string): boolean {
  return PAGE_DOMAINS[key] === 'opportunity'
}

/** 已勾选、有数据域、但生效范围为空的页(按 页级例外 ?? 默认 解析)。仅提示,不阻断。
 *  必须按 PAGE_DOMAINS 判定 —— data/budget/about 无数据域,拦它们会重蹈「配不出来」。 */
const emptyScopePages = computed(() => {
  const star = form.allowedPages.includes('*')
  const ovs = new Map(form.overrides.filter((o) => o.target).map((o) => [o.target, o]))
  return NAV_GROUPS.flatMap((g) => g.links)
    .filter((l) => (star || form.allowedPages.includes(l.key)) && PAGE_DOMAINS[l.key])
    .filter((l) => {
      const o = ovs.get(l.key)
      const l4 = o ? o.l4 : form.allowedL4
      const staff = o ? o.staff : form.allowedStaff
      return !l4.length && !staff.length
    })
    .map((l) => l.label)
})
```

`buildScopes` 改为只产 `pageScopes` 并清理孤儿：

```ts
function buildScopes(): { pageScopes: Record<string, { l4: string[]; staff: string[] }> } {
  const star = form.allowedPages.includes('*')
  const pageScopes: Record<string, { l4: string[]; staff: string[] }> = {}
  for (const o of form.overrides) {
    if (!o.target) continue
    if (!star && !form.allowedPages.includes(o.target)) continue   // 孤儿:该页已不可访问
    pageScopes[o.target] = { l4: o.l4, staff: targetIsOpp(o.target) ? [] : o.staff }
  }
  return { pageScopes }
}
```

`openCreate` 末尾加 `advancedOpen.value = false`。

`openEdit` 中构建 overrides 的两个 for 循环改为一个（无 domainScopes），并据存量决定展开：

```ts
  form.overrides = Object.entries(row.pageScopes ?? {}).map(([pk, v]) => ({
    target: pk, l4: [...(v.l4 ?? [])], staff: [...(v.staff ?? [])],
  }))
  advancedOpen.value = form.overrides.length > 0
```

`scopeLabel` 中 `Object.keys(row.domainScopes ?? {}).length + ...` 改为只数 `pageScopes`：

```ts
  const n = Object.keys(row.pageScopes ?? {}).length
```

`defineExpose` 补 `advancedOpen, overrideTargets, emptyScopePages, accounts`。

template 改动 —— 把原「范围覆盖」分隔线与覆盖列表整体替换为：

```vue
        <div class="admin-adv-h" @click="advancedOpen = !advancedOpen">
          {{ advancedOpen ? '▾' : '▸' }} 高级 · 个别页面单设范围
        </div>
        <div v-show="advancedOpen" class="admin-adv">
          <el-form-item v-for="(o,i) in form.overrides" :key="i" label="例外">
            <el-select v-model="o.target" filterable class="admin-select" placeholder="选页面">
              <el-option v-for="t in overrideTargets" :key="t.value" :label="t.label" :value="t.value" />
            </el-select>
            <el-select v-model="o.l4" multiple filterable class="admin-select" placeholder="L4">
              <el-option label="全部 L4" value="*" />
              <el-option v-for="l4 in l4Options" :key="l4" :label="l4" :value="l4" />
            </el-select>
            <el-select v-if="!targetIsOpp(o.target)" v-model="o.staff" multiple filterable
              class="admin-select" placeholder="员工(按姓名)">
              <el-option v-for="op in staffOptions" :key="op.value" :label="op.label" :value="op.value" />
            </el-select>
            <el-button link type="danger" @click="removeOverride(i)">删除</el-button>
          </el-form-item>
          <el-button link type="primary" @click="addOverride">+ 添加例外</el-button>
        </div>
        <div v-if="emptyScopePages.length" class="admin-warn">
          已勾选的「{{ emptyScopePages.slice(0, 3).join('、') }}」{{ emptyScopePages.length > 3 ? ` 等 ${emptyScopePages.length} 页` : '' }}生效范围为空，该账号能进入页面但看不到任何数据。
        </div>
```

「默认可见 L4」「默认可见员工」两个表单项的 label 改为「可见 L4」「额外放行员工」（范围区已常驻，不再有"默认 vs 覆盖"的层级语义需要靠 label 承载）。

style 追加：

```css
.admin-adv-h { margin: var(--sp-3) 0 var(--sp-2); color: var(--accent); cursor: pointer; font-size: var(--fs-2); }
.admin-adv { padding-left: var(--sp-2); border-left: 2px solid var(--line); }
.admin-warn { margin-top: var(--sp-2); padding: var(--sp-2) var(--sp-3); border-radius: var(--r-sm);
  background: var(--warn-bg); color: var(--warn-text); font-size: var(--fs-1); }
```

- [ ] **Step 4: 验证**

Run: `npm --prefix frontend run test:run -- src/views/AdminView.test.ts` → PASS
Run: `npm --prefix frontend run typecheck` → 通过

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/AdminView.vue frontend/src/views/AdminView.test.ts
git commit -m "feat(admin): V4.5.2 高级区折叠 + 例外只列可见页 + 孤儿清理 + 空范围提示

覆盖列表降级为「高级·个别页面单设范围」并默认折叠(有存量例外时强制展开,
绝不把在用配置藏起来);目标下拉从 29 项收窄为「已勾选 ∩ 有数据域」;
提交时按 allowedPages 丢弃孤儿例外(后端 _validate_page_scopes 不校验这层)。
空范围只给黄字提示不硬拦 —— data/budget/about 无数据域,硬拦会误伤只勾工具页的账号。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `AdminView` 从现有账号复制权限

**Files:**
- Modify: `frontend/src/views/AdminView.vue`、`frontend/src/views/AdminView.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `advancedOpen`
- Produces: `copySource: Ref<string>`、`copyOptions: ComputedRef<{value,label}[]>`、`applyCopy(account: string)`

- [ ] **Step 1: 写失败测试**

```ts
  it('复制源下拉排除超管(防一键造出全权限准超管)', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.copyOptions.map((o: any) => o.value)).toEqual(['liu'])   // boss 是超管,不在列
  })

  it('复制填充权限四件套,但不填账号/密码/显示名', async () => {
    vi.mocked(adminApi.listAccounts).mockResolvedValue([
      { account: 'src', displayName: '源', isSuper: false, allowedPages: ['projects', 'yitian'],
        allowedL4: ['北京'], allowedStaff: ['E001'],
        pageScopes: { projects: { l4: ['D1'], staff: [] } }, mustChangePassword: false },
    ])
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.applyCopy('src')
    expect(vm.form.allowedPages).toEqual(['projects', 'yitian'])
    expect(vm.form.allowedL4).toEqual(['北京'])
    expect(vm.form.allowedStaff).toEqual(['E001'])
    expect(vm.form.overrides).toEqual([{ target: 'projects', l4: ['D1'], staff: [] }])
    expect(vm.form.account).toBe('')          // 不复制身份
    expect(vm.form.password).toBe('')         // 绝不复制密码
    expect(vm.form.displayName).toBe('')
    expect(vm.advancedOpen).toBe(true)        // 有例外 → 展开
  })

  it('复制是深拷贝:改新表单不影响源账号对象', async () => {
    vi.mocked(adminApi.listAccounts).mockResolvedValue([
      { account: 'src', displayName: '源', isSuper: false, allowedPages: ['projects'],
        allowedL4: ['北京'], allowedStaff: [], pageScopes: {}, mustChangePassword: false },
    ])
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.applyCopy('src')
    vm.togglePage('yitian', true)
    expect(vm.accounts[0].allowedPages).toEqual(['projects'])
  })

  it('编辑模式不渲染复制下拉', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openEdit({ account: 'liu', displayName: '老刘', isSuper: false,
      allowedPages: ['projects'], allowedL4: ['北京'], allowedStaff: [] })
    await flushPromises()
    expect(wrapper.find('[data-test="admin-copy"]').exists()).toBe(false)
  })
```

- [ ] **Step 2: 运行，确认失败**

Run: `npm --prefix frontend run test:run -- src/views/AdminView.test.ts`
Expected: FAIL with `vm.copyOptions is undefined`

- [ ] **Step 3: 实现**

script 加：

```ts
const copySource = ref('')

/** 复制源:只列普通管理员。
 *  承重:排除超管 —— 超管记录是 allowedPages:['*'] + allowedL4:['*'],
 *  复制它等于一键造出全权限的准超管。要全权限必须手动勾,保持为显式动作。 */
const copyOptions = computed(() =>
  accounts.value.filter((a) => !a.isSuper)
    .map((a) => ({ value: a.account, label: `${a.displayName}（${a.account}）` })))

/** 复制权限四件套。不复制账号名/密码/显示名 —— 身份必须重新填。 */
function applyCopy(account: string) {
  const src = accounts.value.find((a) => a.account === account)
  if (!src) return
  form.allowedPages = [...src.allowedPages]
  form.allowedL4 = [...src.allowedL4]
  form.allowedStaff = [...(src.allowedStaff ?? [])]
  form.overrides = Object.entries(src.pageScopes ?? {}).map(([pk, v]) => ({
    target: pk, l4: [...(v.l4 ?? [])], staff: [...(v.staff ?? [])],
  }))
  if (form.overrides.length) advancedOpen.value = true
}
```

`openCreate` 末尾加 `copySource.value = ''`。

`defineExpose` 补 `copySource, copyOptions, applyCopy`。

template 在 `<el-form label-width="92px">` 内最顶部加：

```vue
        <el-form-item v-if="!editing" label="复制权限">
          <el-select v-model="copySource" filterable clearable class="admin-select"
            data-test="admin-copy" placeholder="从现有账号复制（可选）"
            @change="(v:string)=> v && applyCopy(v)">
            <el-option v-for="o in copyOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
          <span class="admin-hint">复制页面权限与可见范围，不复制密码</span>
        </el-form-item>
```

- [ ] **Step 4: 验证**

Run: `npm --prefix frontend run test:run -- src/views/AdminView.test.ts` → PASS
Run: `npm --prefix frontend run typecheck` → 通过

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/AdminView.vue frontend/src/views/AdminView.test.ts
git commit -m "feat(admin): V4.5.2 从现有账号复制权限

新建弹窗顶部可搜索下拉,复制 allowedPages/allowedL4/allowedStaff/pageScopes 四件套。
不复制密码;复制源排除超管 —— 超管是 ['*']+['*'],复制它等于一键造出全权限准超管。
纯前端行为(只填表单),零后端改动。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 收尾 —— 版本号、全局验证、PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：

```ts
export const APP_VERSION = 'V4.5.2'
export const RELEASE_DATE = '2026-07-27'
```

- [ ] **Step 2: 全仓零残留核对**

```bash
grep -rn "domainScopes\|domain_scopes" --include=*.py --include=*.ts --include=*.vue . | grep -v "^./lts/" | grep -v "^./docs/"
```

Expected: 只剩 `server.py` 里那句「收到已废弃的 domainScopes 字段」的警告日志与 `tests/test_server_admin.py` 的忽略用例。**其它任何残留都要处理。**

- [ ] **Step 3: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）

若前端 build 报 `AdminView.vue` 相关错误，检查 Task 4 的 template 是否漏了闭合标签。

- [ ] **Step 4: 手动冒烟（必须实际操作，不得跳过）**

启动 `python server.py`，用超管登录 `/admin`：

1. 点「新建账号」→ 展开「项目」组 → **只勾「成本分析」** → 可见 L4 选「全部 L4」→ 创建。**确认能建成，且这就是全部操作。**
2. 用该账号登录 → 确认侧栏只有「项目 → 项目分析」一项，落地页是 `/insight/costdetail`，页面有数据。
3. 回超管，新建账号 → 复制权限选刚才那个账号 → 确认页面权限被填上、密码栏是空的。
4. 编辑那个用了 `pageScopes` 的存量账号 → 确认高级区**自动展开**且例外行显示正确。
5. 勾一个组 → 取消其中一页 → 确认组复选框显示为半选态（横线，非对勾）。

- [ ] **Step 5: 更新 `PROGRESS.md`**

在版本历史顶部加 V4.5.2 条目，写明：三层收敛为两层、删 `domainScopes`（生产实测 20 个普通管理员零使用）、单页勾选粒度补回、复制账号、`allowedStaff` 按用户要求保留。

backlog 补两条：
- 项目经理重名过匹配（`allowedStaff` 保留后此债继续存在，启用该维度前需先修）
- 五个版本 V4.4.7~V4.5.2 尚未打包，`release/` 仍在 V4.4.6

- [ ] **Step 6: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V4.5.2 权限模型两层收敛 + 配置界面重做

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

**不 push**（用户要求第四期做完一起推）。

---

## 自审记录

**Spec 覆盖**：§3.1 两层收敛 → Task 1；§3.3 物化迁移 → Task 1 Step 4 + Task 2 Step 1；§3.4 后端清单 → Task 1/2；§3.5 前端清单 → Task 3；§4.1 三态 → Task 4；§4.2 高级区 / §4.3 下拉过滤 / §4.4 孤儿清理 / §4.5 空范围提示 → Task 5；§4.6 复制 → Task 6；§5.1 迁移等价性 → Task 1 Step 2；§5.3 假绿陷阱 → Task 1 Step 1。

**类型一致**：`effective_scope(rec, page_key)`（Task 1 定义 → Task 2 不直接调）、`migrate_accounts_file()`（Task 1 定义 → Task 2 Step 1 调用）、`advancedOpen`（Task 5 定义 → Task 6 消费）、`togglePage`（Task 4 定义 → Task 6 测试消费）、`accounts`（Task 5 补入 defineExpose → Task 6 测试消费）—— 均已对齐。

**已知顺序约束**：Task 4 → 5 → 6 改同一文件，必须串行；Task 3 的 typecheck 会在 AdminView 报错，属预期，由 Task 4-6 消除。
