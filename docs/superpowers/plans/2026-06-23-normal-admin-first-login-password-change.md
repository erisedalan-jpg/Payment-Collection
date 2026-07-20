# 普通管理员首次登录强制改密 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 超管在 `/admin` 新建的普通管理员（非超管账号）首次登录时必须先改密码才能进入系统。

**Architecture:** 账号记录新增 `mustChangePassword` 标志（缺省 False，零迁移）；新建非超管置位、重置不置位；后端加自助改密端点 `/api/account/change-password`；前端路由守卫把置位用户锁到新 `/change-password` 页，改密成功清标志后放行。沿用现有"前端门禁 + 后端切数据"折中威胁模型，不加后端硬性门禁。

**Tech Stack:** Python 标准库（auth.py / server.py，pytest）；Vue3 + Vite + TS + Pinia + Element Plus + Vue Router（vitest / vue-tsc）。

## Global Constraints

- 交流用简体中文；代码、命令、文件名保持原文。**不使用任何 emoji**（需符号用 `→ ↓ ❌ ✕ ▾`）。
- 前端样式只引用 `frontend/src/styles/theme.css` 设计令牌，**不手写散值**；禁止外链字体。
- 版本单一来源 `frontend/src/version.ts`，本期 **V1.17.0**（日期 2026-06-23）。
- 威胁模型：前端强制流转 + 后端自助改密端点，**不**加后端硬性门禁（未改密前不 403 拦其它端点）。
- `mustChangePassword`：**仅新建非超管时置 True**；超管 `/admin` 重置密码**不**改它；记录缺省按 `False`（向后兼容、零迁移，已上线 accounts.json 不动）。
- 新密码校验：复用 `_validate_password`（长度 1–256）**且新密码 ≠ 原密码**。
- TS 接口字段 `mustChangePassword?: boolean` 设为 **optional**（后端恒发该字段；optional 使既有测试 fixtures 不破）。
- 完成定义：`bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build），并手动冒烟走通一次。
- 每次 commit 消息结尾追加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

---

### Task 1: 后端数据模型 — mustChangePassword 标志（auth.py）

**Files:**
- Modify: `auth.py:69-79`（`_make_user`）、`auth.py:97-104`（`public_user`）、`auth.py:201-216`（`create_account`）
- Test: `tests/test_auth_admin.py`（新增用例 + 修订 `test_list_public_accounts_strips_secrets`）

**Interfaces:**
- Consumes: 无（基于现有 `_make_user` / `create_account` / `public_user`）。
- Produces:
  - `_make_user(password, display_name, is_super=True, pages=None, l4=None, must_change=False) -> dict`（记录含 `'mustChangePassword': bool`）。
  - `create_account(...)` 创建的非超管记录 `mustChangePassword=True`。
  - `public_user(account, rec) -> dict` 多回 `'mustChangePassword': bool`。

- [ ] **Step 1: 写失败测试**（追加到 `tests/test_auth_admin.py` 末尾）

```python
def test_make_user_must_change_default_false():
    u = auth._make_user('p', '名', is_super=True)
    assert u['mustChangePassword'] is False
    u2 = auth._make_user('p', '名', is_super=False, pages=['projects'], l4=['北京'], must_change=True)
    assert u2['mustChangePassword'] is True


def test_create_account_sets_must_change_true():
    acc = _fresh_accounts()
    out = auth.create_account(acc, 'newbie', 'pw123', '新人', ['projects'], ['上海'])
    assert out['users']['newbie']['mustChangePassword'] is True


def test_seed_supers_not_must_change(tmp_path, monkeypatch):
    f = tmp_path / 'accounts.json'
    monkeypatch.setattr(auth, 'ACCOUNTS_FILE', str(f))
    auth.seed_default_accounts()
    users = auth.load_accounts()['users']
    for acc in users.values():
        assert acc['mustChangePassword'] is False


def test_public_user_exposes_must_change():
    rec = auth._make_user('p', '名', is_super=False, pages=['projects'], l4=['北京'], must_change=True)
    pub = auth.public_user('liu', rec)
    assert pub['mustChangePassword'] is True


def test_update_account_keeps_must_change():
    acc = _fresh_accounts()
    acc = auth.create_account(acc, 'newbie', 'pw123', '新人', ['projects'], ['上海'])
    assert acc['users']['newbie']['mustChangePassword'] is True
    out = auth.update_account(acc, 'newbie', password='reset999')
    assert out['users']['newbie']['mustChangePassword'] is True  # 重置不强制再改
```

并修订既有 `test_list_public_accounts_strips_secrets`，把期望键集加上 `mustChangePassword`：

```python
        assert set(a.keys()) == {'account', 'displayName', 'isSuper',
                                 'allowedPages', 'allowedL4', 'mustChangePassword'}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_auth_admin.py -q`
Expected: 新增 5 个用例失败（`KeyError: 'mustChangePassword'`），`test_list_public_accounts_strips_secrets` 也失败（键集不含该字段）。

- [ ] **Step 3: 改实现**

`_make_user`（`auth.py:69`）替换为：

```python
def _make_user(password: str, display_name: str, is_super: bool = True,
               pages: list | None = None, l4: list | None = None,
               must_change: bool = False) -> dict:
    salt = secrets.token_hex(16)
    return {
        'salt': salt,
        'hash': hash_password(password, salt),
        'isSuper': is_super,
        'allowedPages': pages if pages is not None else ['*'],
        'allowedL4': l4 if l4 is not None else ['*'],
        'displayName': display_name,
        'mustChangePassword': bool(must_change),
    }
```

`public_user`（`auth.py:97`）替换为：

```python
def public_user(account: str, rec: dict) -> dict:
    return {
        'account': account,
        'displayName': rec.get('displayName', account),
        'isSuper': bool(rec.get('isSuper', False)),
        'allowedPages': rec.get('allowedPages', []),
        'allowedL4': rec.get('allowedL4', []),
        'mustChangePassword': bool(rec.get('mustChangePassword', False)),
    }
```

`create_account` 内构造新用户那行（`auth.py:212-213`）替换为：

```python
    new_users[name] = _make_user(password, (display_name or name)[:64],
                                 is_super=False, pages=pages, l4=l4,
                                 must_change=True)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_auth_admin.py tests/test_auth.py -q`
Expected: 全部 PASS（含 `test_seed_then_authenticate` 等既有用例；注意 `public_user` 新增字段不影响"无 salt/hash"断言）。

- [ ] **Step 5: 提交**

```bash
git add auth.py tests/test_auth_admin.py
git commit -m "feat(auth): 账号记录新增 mustChangePassword(新建非超管置位,public_user 暴露)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 后端自助改密纯函数 + 封装（auth.py）

**Files:**
- Modify: `auth.py`（在 `remove_account` 之后、文件末尾追加两个函数）
- Test: `tests/test_auth_change_password.py`（新建）

**Interfaces:**
- Consumes: `verify_password`、`_validate_password`、`hash_password`、`load_accounts`、`save_accounts`、`public_user`、`_accounts_mutate_lock`、`create_account`（测试构造置位用户）。
- Produces:
  - `change_own_password_dict(accounts: dict, account: str, old_password: str, new_password: str) -> dict`（纯函数；账号不存在 → `KeyError`；原密码错 → `ValueError('原密码错误')`；新密码非法 → `ValueError`；新==旧 → `ValueError('新密码不能与原密码相同')`；成功 → 新 dict，记录换 salt/hash 且 `mustChangePassword=False`）。
  - `change_own_password(account: str, old_password: str, new_password: str) -> dict`（封装：锁内 load→改→save，返回 `public_user`）。

- [ ] **Step 1: 写失败测试**（新建 `tests/test_auth_change_password.py`）

```python
import pytest
import auth


def _flagged_user_dict():
    # 一个 mustChangePassword=True 的非超管 + 一个超管
    data = {'version': 1, 'users': {}}
    data['users']['boss'] = auth._make_user('bosspw', '超管', is_super=True)
    data = auth.create_account(data, 'liu', 'temp123', '老刘', ['projects'], ['北京'])
    return data


def test_change_own_password_success_clears_flag():
    acc = _flagged_user_dict()
    out = auth.change_own_password_dict(acc, 'liu', 'temp123', 'newpass456')
    rec = out['users']['liu']
    assert rec['mustChangePassword'] is False
    assert auth.verify_password('newpass456', rec['salt'], rec['hash'])
    assert not auth.verify_password('temp123', rec['salt'], rec['hash'])
    # 入参不变
    assert acc['users']['liu']['mustChangePassword'] is True


def test_change_own_password_wrong_old_raises():
    acc = _flagged_user_dict()
    with pytest.raises(ValueError, match='原密码错误'):
        auth.change_own_password_dict(acc, 'liu', 'WRONG', 'newpass456')
    assert acc['users']['liu']['mustChangePassword'] is True  # 未改


def test_change_own_password_same_as_old_raises():
    acc = _flagged_user_dict()
    with pytest.raises(ValueError):
        auth.change_own_password_dict(acc, 'liu', 'temp123', 'temp123')


def test_change_own_password_empty_new_raises():
    acc = _flagged_user_dict()
    with pytest.raises(ValueError):
        auth.change_own_password_dict(acc, 'liu', 'temp123', '')


def test_change_own_password_missing_account_raises():
    acc = _flagged_user_dict()
    with pytest.raises(KeyError):
        auth.change_own_password_dict(acc, 'ghost', 'x', 'y')


def test_change_own_password_wrapper_persists(tmp_path, monkeypatch):
    f = tmp_path / 'accounts.json'
    monkeypatch.setattr(auth, 'ACCOUNTS_FILE', str(f))
    auth.add_account('dan', 'temp123', 'Dan', ['projects'], ['北京'])
    pub = auth.change_own_password('dan', 'temp123', 'fresh789')
    assert pub['mustChangePassword'] is False and 'hash' not in pub
    # 落盘生效:新密码可认证,旧密码失效
    assert auth.authenticate('dan', 'fresh789') is not None
    assert auth.authenticate('dan', 'temp123') is None
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_auth_change_password.py -q`
Expected: FAIL（`AttributeError: module 'auth' has no attribute 'change_own_password_dict'`）。

- [ ] **Step 3: 改实现**（追加到 `auth.py` 末尾）

```python
def change_own_password_dict(accounts: dict, account: str, old_password: str,
                             new_password: str) -> dict:
    """自助改密(纯函数):验旧密码→校验新密码(1-256 且≠旧)→换 salt/hash 并清 mustChangePassword。
    账号不存在抛 KeyError;原密码错抛 ValueError('原密码错误');新密码非法/同旧抛 ValueError。不改入参。"""
    if not isinstance(account, str):
        raise ValueError('账号名须为字符串')
    users = accounts.get('users', {})
    if account not in users:
        raise KeyError(account)
    rec = users[account]
    if not verify_password(old_password, rec.get('salt', ''), rec.get('hash', '')):
        raise ValueError('原密码错误')
    _validate_password(new_password)
    if new_password == old_password:
        raise ValueError('新密码不能与原密码相同')
    salt = secrets.token_hex(16)
    new_rec = dict(rec)
    new_rec['salt'] = salt
    new_rec['hash'] = hash_password(new_password, salt)
    new_rec['mustChangePassword'] = False
    new_users = dict(users)
    new_users[account] = new_rec
    out = dict(accounts)
    out['users'] = new_users
    return out


def change_own_password(account: str, old_password: str, new_password: str) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = change_own_password_dict(data, account, old_password, new_password)
        save_accounts(data)
        return public_user(account, data['users'][account])
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_auth_change_password.py -q`
Expected: 6 个用例全 PASS。

- [ ] **Step 5: 提交**

```bash
git add auth.py tests/test_auth_change_password.py
git commit -m "feat(auth): 新增 change_own_password 自助改密(验旧/新≠旧/清标志)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 后端改密端点 /api/account/change-password（server.py）

**Files:**
- Modify: `server.py:473-474`（`do_POST` 路由分支后追加）、`server.py:1166`（`handle_logout` 之后插入新 handler）

**Interfaces:**
- Consumes: `auth.parse_cookie_token`、`auth.validate_session`、`auth.change_own_password`、`self._read_json_body`、`self._send_json`、`_error_payload`、`ERR_AUTH`/`ERR_PARSE`/`ERR_VALIDATION`/`ERR_NOT_FOUND`。
- Produces: `POST /api/account/change-password`，body `{oldPassword, newPassword}` → 成功 200 `{success:true, user}`；原密码错 401；新密码非法/同旧 400；账号不存在 404；未登录 401。

> 说明：本仓服务端 HTTP 端点（login/logout/admin 等）均无 socket 级自动化测试，按 CLAUDE.md §6 以 py_compile/ruff + 手动冒烟验证；改密的核心逻辑已在 Task 2 单测覆盖。此端点鉴权由现有 `_auth_gate`（`/api/` 前缀需登录）+ `_authz_gate`（非 `_SUPER_ONLY_PATHS`/非 `/api/admin/`/非受保护数据 → 任意登录用户可调）自动覆盖，无需改 `_path_needs_auth`/`_SUPER_ONLY_PATHS`。

- [ ] **Step 1: 加路由分支**（`server.py` `do_POST`，在 `/api/admin/accounts/delete` 分支之后、`else` 之前）

```python
        elif parsed.path == '/api/account/change-password':
            self.handle_account_change_password()
```

- [ ] **Step 2: 加 handler**（插在 `handle_logout` 方法之后）

```python
    def handle_account_change_password(self):
        """自助改密:任意登录用户改自己的密码(供"首次登录强制改密"流程)。"""
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        if not account:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        old_pw = data.get('oldPassword') or ''
        new_pw = data.get('newPassword') or ''
        try:
            user = auth.change_own_password(account, old_pw, new_pw)
        except KeyError:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, f"账号不存在: {account}"))
            return
        except ValueError as e:
            if str(e) == '原密码错误':
                self._send_json(401, _error_payload(ERR_AUTH, str(e)))
            else:
                self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        self._send_json(200, {"success": True, "user": user})
```

- [ ] **Step 3: 语法 + lint**

Run: `python -m py_compile server.py && ruff check server.py`
Expected: 无报错。

- [ ] **Step 4: 手动冒烟**（确认端点接通；需另起一个服务实例）

```bash
# 终端A: python server.py   (监听 8080)
# 终端B:
# 1) 用某普通管理员初始密码登录拿 cookie
curl -s -c cj.txt -X POST localhost:8080/api/login -H 'Content-Type: application/json' \
  -d '{"account":"<普通管理员账号>","password":"<初始密码>"}'
# 2) 错误原密码 → 401 原密码错误
curl -s -b cj.txt -X POST localhost:8080/api/account/change-password -H 'Content-Type: application/json' \
  -d '{"oldPassword":"WRONG","newPassword":"newpass456"}'
# 3) 正确改密 → 200 success:true, user.mustChangePassword=false
curl -s -b cj.txt -X POST localhost:8080/api/account/change-password -H 'Content-Type: application/json' \
  -d '{"oldPassword":"<初始密码>","newPassword":"newpass456"}'
```
Expected: 第 2 步返回 401/`原密码错误`；第 3 步返回 `{"success": true, "user": {... "mustChangePassword": false}}`。（冒烟完把测试账号还原或删除）

- [ ] **Step 5: 提交**

```bash
git add server.py
git commit -m "feat(server): 新增 /api/account/change-password 自助改密端点" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 前端 lib — AuthUser 字段 + changePassword()（lib/auth.ts）

**Files:**
- Modify: `frontend/src/lib/auth.ts:3-9`（`AuthUser`）、文件末尾追加 `changePassword`
- Test: `frontend/src/lib/auth.test.ts`（追加用例）

**Interfaces:**
- Consumes: `apiUrl`、`AuthResult`、`AuthUser`。
- Produces:
  - `AuthUser` 多 optional 字段 `mustChangePassword?: boolean`。
  - `changePassword(oldPassword: string, newPassword: string) => Promise<AuthResult>`。

- [ ] **Step 1: 写失败测试**（追加到 `frontend/src/lib/auth.test.ts` 的 `describe('lib/auth', ...)` 内）

```python
# (TS, 见下方代码块)
```

```ts
  it('changePassword 成功映射 user(flag 清)', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, user: { ...U, mustChangePassword: false } }) })
    vi.stubGlobal('fetch', f)
    const { changePassword } = await import('./auth')
    const r = await changePassword('temp123', 'newpass456')
    expect(r.ok).toBe(true)
    expect(r.user?.mustChangePassword).toBe(false)
    expect(f).toHaveBeenCalledWith('/api/account/change-password', expect.objectContaining({ method: 'POST' }))
  })
  it('changePassword 失败映射 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, message: '原密码错误' }) }))
    const { changePassword } = await import('./auth')
    const r = await changePassword('bad', 'newpass456')
    expect(r.ok).toBe(false)
    expect(r.message).toBe('原密码错误')
  })
```

并把顶部 import 行改为同时导出 changePassword（已是 `import { authenticate, fetchMe, logoutApi } from './auth'`，本测试改用动态 `await import('./auth')` 取 `changePassword`，无需改顶部 import）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/auth.test.ts`
Expected: FAIL（`changePassword` 不是函数 / 未导出）。

- [ ] **Step 3: 改实现**

`AuthUser` 接口（`frontend/src/lib/auth.ts:3`）加一行字段：

```ts
export interface AuthUser {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
  mustChangePassword?: boolean
}
```

文件末尾追加：

```ts
/** 自助改密:POST /api/account/change-password。成功带回更新后的 user(mustChangePassword 已清)。 */
export async function changePassword(oldPassword: string, newPassword: string): Promise<AuthResult> {
  try {
    const res = await fetch(apiUrl('/api/account/change-password'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword, newPassword }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) return { ok: true, user: data.user as AuthUser }
    return { ok: false, message: data.message || '修改失败' }
  } catch {
    return { ok: false, message: '网络错误,无法连接服务' }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/auth.test.ts && npx vue-tsc --noEmit`
Expected: 该测试文件全 PASS；typecheck 无错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/auth.ts frontend/src/lib/auth.test.ts
git commit -m "feat(fe): lib/auth 增 changePassword + AuthUser.mustChangePassword" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 前端 store — mustChangePassword + changePassword 动作（stores/auth.ts）

**Files:**
- Modify: `frontend/src/stores/auth.ts:3`（import）、`:7-41`（store 体）
- Test: `frontend/src/stores/auth.test.ts:4-9`（mock 工厂加 changePassword）+ 追加用例

**Interfaces:**
- Consumes: `changePassword as apiChangePassword`（来自 Task 4 的 `@/lib/auth`）。
- Produces: store 暴露 `mustChangePassword`（computed）与 `changePassword(old, neo): Promise<AuthResult>`（成功后用返回 user 覆盖 `user.value`）。

- [ ] **Step 1: 写失败测试**

把 `frontend/src/stores/auth.test.ts` 顶部的 mock 工厂（`:4-9`）改为含 changePassword：

```ts
vi.mock('@/lib/auth', () => ({
  authenticate: vi.fn(),
  fetchMe: vi.fn(),
  logoutApi: vi.fn(async () => {}),
  changePassword: vi.fn(),
}))
import { authenticate, fetchMe, logoutApi, changePassword } from '@/lib/auth'
```

在 `describe('stores/auth', ...)` 内追加：

```ts
  it('changePassword 成功:更新 user 且 mustChangePassword 清零', async () => {
    ;(fetchMe as any).mockResolvedValue({ ...U, mustChangePassword: true })
    const s = useAuthStore()
    await s.fetchMe()
    expect(s.mustChangePassword).toBe(true)
    ;(changePassword as any).mockResolvedValue({ ok: true, user: { ...U, mustChangePassword: false } })
    const r = await s.changePassword('temp123', 'newpass456')
    expect(r.ok).toBe(true)
    expect(s.mustChangePassword).toBe(false)
  })
  it('changePassword 失败:不动 user', async () => {
    ;(fetchMe as any).mockResolvedValue({ ...U, mustChangePassword: true })
    const s = useAuthStore()
    await s.fetchMe()
    ;(changePassword as any).mockResolvedValue({ ok: false, message: '原密码错误' })
    const r = await s.changePassword('bad', 'newpass456')
    expect(r.ok).toBe(false)
    expect(s.mustChangePassword).toBe(true)
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/stores/auth.test.ts`
Expected: FAIL（`s.changePassword` 不是函数 / `s.mustChangePassword` undefined）。

- [ ] **Step 3: 改实现**

import 行（`frontend/src/stores/auth.ts:3`）：

```ts
import { authenticate, fetchMe as apiFetchMe, logoutApi, changePassword as apiChangePassword, type AuthUser, type AuthResult } from '@/lib/auth'
```

在 `isSuper` computed 之后加：

```ts
  const mustChangePassword = computed(() => user.value?.mustChangePassword === true)
```

在 `logout` 之后加动作：

```ts
  async function changePassword(oldPassword: string, newPassword: string): Promise<AuthResult> {
    const res = await apiChangePassword(oldPassword, newPassword)
    if (res.ok && res.user) user.value = res.user
    return res
  }
```

把 `return { ... }` 行补上两个导出：

```ts
  return { user, isLoggedIn, isSuper, mustChangePassword, login, fetchMe, logout, changePassword, ensureReady, canAccess, firstAllowedPath }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/stores/auth.test.ts && npx vue-tsc --noEmit`
Expected: store 测试全 PASS；typecheck 无错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/auth.ts frontend/src/stores/auth.test.ts
git commit -m "feat(fe): auth store 增 mustChangePassword + changePassword 动作" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 前端强制流转 — 改密页 + 路由守卫 + 登录跳转

**Files:**
- Create: `frontend/src/views/ChangePasswordView.vue`、`frontend/src/views/ChangePasswordView.test.ts`
- Modify: `frontend/src/router/index.ts:25`（import）、`:41`（route）、`:78-87`（guard）、`frontend/src/views/LoginView.vue:25-31`（onSubmit 跳转）
- Test: `frontend/src/router/guard.test.ts`（追加）、`frontend/src/views/LoginView.test.ts`（追加）

**Interfaces:**
- Consumes: `useAuthStore`（`mustChangePassword`、`changePassword`、`firstAllowedPath`）、`useRouter`。
- Produces: 路由 `/change-password`（name `change-password`，`meta.fullscreen`）；守卫规则：登录态且 `user.mustChangePassword` 且 `to.path !== '/change-password'` → 重定向 `/change-password`。

- [ ] **Step 1: 写失败测试**

`frontend/src/router/guard.test.ts` 追加（`describe('router 守卫', ...)` 内）：

```ts
  it('未改密用户访问受控页→重定向 /change-password', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['projects'], allowedL4: [], mustChangePassword: true })
    await router.push('/projects')
    expect(router.currentRoute.value.path).toBe('/change-password')
  })
  it('未改密用户访问 /change-password 自身→放行', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['projects'], allowedL4: [], mustChangePassword: true })
    await router.push('/change-password')
    expect(router.currentRoute.value.path).toBe('/change-password')
  })
  it('已改密用户不被改密页拦截', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['projects'], allowedL4: [], mustChangePassword: false })
    await router.push('/projects')
    expect(router.currentRoute.value.path).toBe('/projects')
  })
```

新建 `frontend/src/views/ChangePasswordView.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChangePasswordView from './ChangePasswordView.vue'
import { useAuthStore } from '@/stores/auth'

const pushSpy = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

beforeEach(() => { setActivePinia(createPinia()); pushSpy.mockClear() })

function mountCPW() { return mount(ChangePasswordView) }

describe('ChangePasswordView', () => {
  it('两次新密码不一致→提示,不调 store', async () => {
    const s = useAuthStore()
    const spy = vi.spyOn(s, 'changePassword')
    const w = mountCPW()
    await w.find('[data-test="cpw-old"]').setValue('temp123')
    await w.find('[data-test="cpw-new"]').setValue('newpass456')
    await w.find('[data-test="cpw-confirm"]').setValue('mismatch')
    await w.find('form').trigger('submit')
    expect(spy).not.toHaveBeenCalled()
    expect(w.find('[data-test="cpw-error"]').text()).toContain('不一致')
  })
  it('合法提交→调 store.changePassword,成功跳转 firstAllowedPath', async () => {
    const s = useAuthStore()
    vi.spyOn(s, 'changePassword').mockResolvedValue({ ok: true, user: { account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [], mustChangePassword: false } } as any)
    vi.spyOn(s, 'firstAllowedPath').mockReturnValue('/data')
    const w = mountCPW()
    await w.find('[data-test="cpw-old"]').setValue('temp123')
    await w.find('[data-test="cpw-new"]').setValue('newpass456')
    await w.find('[data-test="cpw-confirm"]').setValue('newpass456')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick(); await w.vm.$nextTick()
    expect(s.changePassword).toHaveBeenCalledWith('temp123', 'newpass456')
    expect(pushSpy).toHaveBeenCalledWith('/data')
  })
})
```

`frontend/src/views/LoginView.test.ts` 追加（`describe('LoginView', ...)` 内）：

```ts
  it('登录成功且须改密→跳转 /change-password', async () => {
    authMock.mockResolvedValueOnce({ ok: true, user: { account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [], mustChangePassword: true } } as any)
    const w = mountLV()
    await w.find('input[autocomplete="username"]').setValue('b')
    await w.find('input[autocomplete="current-password"]').setValue('temp123')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick(); await w.vm.$nextTick()
    expect(pushSpy).toHaveBeenCalledWith('/change-password')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/router/guard.test.ts src/views/ChangePasswordView.test.ts src/views/LoginView.test.ts`
Expected: FAIL（`ChangePasswordView.vue` 不存在；guard 未重定向 /change-password；LoginView 仍跳 `/`）。

- [ ] **Step 3: 改实现**

新建 `frontend/src/views/ChangePasswordView.vue`：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const error = ref('')
const submitting = ref(false)
const router = useRouter()
const auth = useAuthStore()

async function onSubmit() {
  error.value = ''
  if (!oldPassword.value || !newPassword.value || !confirmPassword.value) { error.value = '请填写所有字段'; return }
  if (newPassword.value !== confirmPassword.value) { error.value = '两次输入的新密码不一致'; return }
  if (newPassword.value === oldPassword.value) { error.value = '新密码不能与原密码相同'; return }
  submitting.value = true
  const res = await auth.changePassword(oldPassword.value, newPassword.value)
  submitting.value = false
  if (res.ok) { router.push(auth.firstAllowedPath()) }
  else { error.value = res.message || '修改失败' }
}
</script>

<template>
  <div class="cpw">
    <form class="cpw-form" @submit.prevent="onSubmit">
      <h1 class="cpw-title">修改密码</h1>
      <p class="cpw-sub">首次登录请设置新密码</p>
      <label class="cpw-field">
        <span class="cpw-label">原密码</span>
        <input class="cpw-input" data-test="cpw-old" v-model="oldPassword" type="password"
               autocomplete="current-password" placeholder="请输入原密码" />
      </label>
      <label class="cpw-field">
        <span class="cpw-label">新密码</span>
        <input class="cpw-input" data-test="cpw-new" v-model="newPassword" type="password"
               autocomplete="new-password" placeholder="请输入新密码" />
      </label>
      <label class="cpw-field">
        <span class="cpw-label">确认新密码</span>
        <input class="cpw-input" data-test="cpw-confirm" v-model="confirmPassword" type="password"
               autocomplete="new-password" placeholder="请再次输入新密码" />
      </label>
      <p v-if="error" class="cpw-error" data-test="cpw-error">{{ error }}</p>
      <button class="cpw-submit" type="submit" :disabled="submitting">确认修改</button>
    </form>
  </div>
</template>

<style scoped>
.cpw { display: grid; place-items: center; min-height: 100vh; background: var(--bg); padding: var(--sp-6); }
.cpw-form { width: 100%; max-width: 360px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow-1); padding: var(--sp-6); display: flex; flex-direction: column; gap: var(--sp-3); }
.cpw-title { font-size: var(--fs-5); font-weight: 700; color: var(--txt); margin: 0; }
.cpw-sub { font-size: var(--fs-1); color: var(--mut); margin: 0 0 var(--sp-2); }
.cpw-field { display: flex; flex-direction: column; gap: var(--sp-1); }
.cpw-label { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.cpw-input { width: 100%; box-sizing: border-box; padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--txt); font-size: var(--fs-2); font-family: var(--font-sans); transition: border-color var(--dur-1) var(--ease); }
.cpw-input:focus { outline: none; border-color: var(--accent); }
.cpw-error { margin: 0; padding: var(--sp-1) var(--sp-2); border-radius: var(--r-sm); background: var(--danger-bg); color: var(--danger-text); font-size: var(--fs-1); }
.cpw-submit { width: 100%; box-sizing: border-box; height: 40px; border: none; border-radius: var(--r-sm); background: var(--accent); color: var(--on-accent); cursor: pointer; font-size: var(--fs-2); font-weight: 600; }
.cpw-submit:disabled { opacity: var(--disabled-opacity); cursor: not-allowed; }
@media (prefers-reduced-motion: reduce) { .cpw-input { transition: none !important; } }
</style>
```

`frontend/src/router/index.ts`：在 `import AdminView ...`（`:25`）后加：

```ts
import ChangePasswordView from '@/views/ChangePasswordView.vue'
```

在 `/login` 路由（`:41`）之后加：

```ts
    { path: '/change-password', name: 'change-password', component: ChangePasswordView, meta: { title: '修改密码', fullscreen: true } },
```

守卫（`:78-87`）改为（在 `isLoggedIn` 判断之后、`requiresSuper` 之前插入一行）：

```ts
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.path === '/login') return true
  await auth.ensureReady()
  if (!auth.isLoggedIn) return { path: '/login' }
  if (auth.user?.mustChangePassword && to.path !== '/change-password') return { path: '/change-password' }
  if (to.meta.requiresSuper && !auth.isSuper) return { path: auth.firstAllowedPath() }
  const key = to.meta.pageKey
  if (auth.isSuper || !key || auth.canAccess(key)) return true
  return { path: auth.firstAllowedPath() }
})
```

`frontend/src/views/LoginView.vue` `onSubmit` 成功分支（`:29`）改为：

```ts
  if (res.ok) {
    if (res.user?.mustChangePassword) router.push('/change-password')
    else router.push('/')
  }
  else { mood.value = 'fail'; error.value = res.message || '登录失败' }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/router/guard.test.ts src/views/ChangePasswordView.test.ts src/views/LoginView.test.ts && npx vue-tsc --noEmit`
Expected: 全 PASS；typecheck 无错。（既有"登录成功跳转 /"用例仍 PASS，因其 user 无 mustChangePassword）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/ChangePasswordView.vue frontend/src/views/ChangePasswordView.test.ts frontend/src/router/index.ts frontend/src/router/guard.test.ts frontend/src/views/LoginView.vue frontend/src/views/LoginView.test.ts
git commit -m "feat(fe): 首次登录强制改密页 + 路由守卫 + 登录跳转" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: AdminView 状态徽标 + 建号提示（lib/admin.ts + AdminView.vue）

**Files:**
- Modify: `frontend/src/lib/admin.ts:3-9`（`AdminAccount`）、`frontend/src/views/AdminView.vue`（表格加列 + 表单提示 + CSS）
- Test: `frontend/src/views/AdminView.test.ts`（fixtures 加字段 + 断言徽标）

**Interfaces:**
- Consumes: `AdminAccount.mustChangePassword`（来自 `listAccounts()`，后端 `public_user` 已带回）。
- Produces: 账号列表对非超管显示"首次须改密/已改密"徽标；新建弹窗显示提示文案。

- [ ] **Step 1: 写失败测试**

`frontend/src/views/AdminView.test.ts` 的 `listAccounts` mock fixtures（`:22-25`）加 `mustChangePassword`：

```ts
    vi.mocked(adminApi.listAccounts).mockResolvedValue([
      { account: 'boss', displayName: '超管', isSuper: true, allowedPages: ['*'], allowedL4: ['*'], mustChangePassword: false },
      { account: 'liu', displayName: '老刘', isSuper: false, allowedPages: ['projects'], allowedL4: ['北京'], mustChangePassword: true },
    ])
```

在 `describe('AdminView', ...)` 内追加：

```ts
  it('非超管未改密行显示「首次须改密」徽标', async () => {
    const wrapper = mount(AdminView, { global: { plugins: [ElementPlus], stubs: STUBS } })
    await flushPromises()
    expect(wrapper.text()).toContain('首次须改密')
  })
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts`
Expected: FAIL（文本不含"首次须改密"）。

- [ ] **Step 3: 改实现**

`frontend/src/lib/admin.ts` `AdminAccount` 接口（`:3`）加字段：

```ts
export interface AdminAccount {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
  mustChangePassword?: boolean
}
```

`frontend/src/views/AdminView.vue`：在"可见 L4"列（`:134-136`）之后插入状态列：

```vue
      <el-table-column label="状态" width="120">
        <template #default="{ row }">
          <template v-if="row && !row.isSuper">
            <span class="pw-tag" :class="row.mustChangePassword ? 'pw-must' : 'pw-done'">
              {{ row.mustChangePassword ? '首次须改密' : '已改密' }}
            </span>
          </template>
          <span v-else>—</span>
        </template>
      </el-table-column>
```

在密码 `el-form-item`（`:152-155`）的 `el-input` 之后、该 form-item 内追加提示（仅新建）：

```vue
        <el-form-item :label="editing ? '重置密码' : '密码'">
          <el-input v-model="form.password" type="password" show-password
            :placeholder="editing ? '留空表示不修改' : '设置初始密码'" />
          <span v-if="!editing" class="admin-hint">新账号首次登录须修改密码</span>
        </el-form-item>
```

`<style scoped>` 末尾追加：

```css
.pw-tag { display: inline-block; padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.pw-must { background: var(--warn-bg); color: var(--warn-text); }
.pw-done { background: var(--ok-bg); color: var(--ok-text); }
.admin-hint { display: block; margin-top: var(--sp-1); font-size: var(--fs-1); color: var(--mut); }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts && npx vue-tsc --noEmit`
Expected: PASS；typecheck 无错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/admin.ts frontend/src/views/AdminView.vue frontend/src/views/AdminView.test.ts
git commit -m "feat(fe): AdminView 显示首次须改密状态徽标 + 建号提示" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 版本号 V1.17.0 + PROGRESS 记录 + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

**Interfaces:** 无（发布元数据 + 文档）。

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts` 整体替换为：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.17.0'
export const RELEASE_DATE = '2026-06-23'
```

- [ ] **Step 2: PROGRESS 记录**

在 `PROGRESS.md` 的版本史区顶部（按既有最新条目的标题层级与格式），新增一条：

```markdown
## V1.17.0（2026-06-23）普通管理员首次登录强制改密

- 账号记录新增 `mustChangePassword`（缺省 False，零迁移）：超管在 `/admin` 新建的普通管理员置位，重置密码不置位，种子超管不受影响。
- 后端新增自助改密端点 `POST /api/account/change-password`（验旧密码、新≠旧、清标志；任意登录用户可改自己密码，非超管专属）。
- 前端新增 `/change-password` 页 + 路由守卫：置位用户被锁到改密页，改密成功后放行；登录成功若须改密直接跳转改密页。
- AdminView 账号列表显示「首次须改密/已改密」徽标，新建弹窗加提示。
- 威胁模型沿用前端强制 + 后端自助端点（不加后端硬拦）。部署为纯代码 + dist 轻量更新，无账号重置。
```

- [ ] **Step 3: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest 全过；前端 typecheck + vitest 全过 + build 成功）。

- [ ] **Step 4: 手动冒烟**（按 CLAUDE.md §6）

启动 `python server.py` + `cd frontend && npm run dev`，走通：超管登录 `/admin` 新建一个普通管理员 → 退出 → 用初始密码登录该普通管理员 → 被强制跳到 `/change-password` → 输错原密码报错、新=旧报错、两次不一致报错 → 正确改密 → 进入其授权页 → 重新登录用新密码成功、`/admin` 该行显示「已改密」。超管登录不受影响。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V1.17.0 普通管理员首次登录强制改密" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 自查（spec 覆盖 / 占位 / 类型一致）

**Spec 覆盖：**
- 数据模型零迁移（spec §2）→ Task 1。
- 后端自助改密（spec §3）→ Task 2（auth.py）+ Task 3（端点）。
- 前端 lib/store/视图/守卫/登录跳转（spec §4.1-4.5）→ Task 4/5/6。
- AdminView 徽标 + 提示（spec §4.6）→ Task 7。
- 测试（spec §5）→ 各任务 TDD 步骤；服务端端点按本仓约定以单测覆盖逻辑 + 手动冒烟（Task 3 说明）。
- 部署轻量（spec §6）→ Task 8（无迁移、纯代码 + dist）。
- 版本 V1.17.0 → Task 8。
- 非目标（spec §8）：不实现后端硬拦 / 密码复杂度 / 超管自助入口 —— 计划未触及，符合 YAGNI。

**占位扫描：** 无 TBD/TODO；每个改代码步骤均含完整代码块与确切命令/预期。

**类型一致：** `mustChangePassword` 全程一致——Python 记录键 `mustChangePassword`（bool）；`public_user`/`AdminAccount`/`AuthUser` 同名；store `mustChangePassword` computed 与 `changePassword` 动作名贯穿 Task 5/6；端点路径 `/api/account/change-password` 在 Task 3/4 一致；`change_own_password_dict`/`change_own_password` 名称在 Task 2/3 一致。
