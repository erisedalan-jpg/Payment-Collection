# SP-5 超管账号管理界面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让超级管理员经 super-only 的 `/admin` 页与 `/api/admin/accounts*` 端点统一建号、调权（allowedPages/allowedL4/显示名）、重置密码、删号。

**Architecture:** 后端 `auth.py` 扩账号 CRUD 纯变换 + 带锁 IO 包装 + 删号吊销会话；`server.py` 四端点经 `_require_super` 双层把关（`_auth_gate` 要求登录 + `isSuper`）。前端 `/admin` 页（Element Plus 表格 + 建/编辑弹窗）由 `meta.requiresSuper`+守卫+侧栏 `v-if isSuper` 三重 super-only 门禁；`lib/admin.ts` 封装 API，`PAGE_OPTIONS` 单源页面选项。

**Tech Stack:** Python 3.8+ 标准库（pbkdf2/hmac/secrets/threading/re）；Vue3 `<script setup>` + TS + Pinia + Vue Router + Element Plus；pytest + Vitest。

## Global Constraints

- 后端纯标准库；`ThreadingHTTPServer` 并发下账号库 read-modify-write 用模块级 `_accounts_mutate_lock = threading.Lock()` 包住 `add/edit/remove` 的 load→变换→save 全程（与 `_file_lock`/`_sessions_lock` 不同锁、不嵌套同锁）。
- CRUD 纯变换函数不改入参 accounts dict，返回新 dict；校验失败抛 `ValueError`（中文消息），目标不存在抛 `KeyError`。
- 明文密码不落盘（仅 PBKDF2 哈希）、不日志、不进任何响应体；列表/建/改响应只回 `public_user`（已剔 salt/hash）。
- 后端 `/api/admin/*` super-only：`_require_super` 校验 session→账号存在且 `isSuper`，否则 403 `ERR_FORBIDDEN`。
- 输入护栏：`account` strip 后 `^[A-Za-z0-9_.-]{1,64}$`；`password` 1..256；`displayName` ≤64（空回退 account）；`allowedPages`/`allowedL4` 字符串数组、各 ≤100 项、每项 1..64、去重；`'*'` 合法哨兵。后端不校验 pages 是否属合法 PageKey 集（避免与前端双源漂移）。
- UI 建号恒 `isSuper=false`；对 `isSuper=true` 目标的 update/delete 一律拒绝（ValueError）。
- 逐文件 `git add`；commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。`data/accounts.json` 永不提交（已 gitignored）。不改 `frontend/src/version.ts` 的 X 位。
- 样式只用 `frontend/src/styles/theme.css` 设计令牌，不手写散值；优先 Element Plus；无文字状态色禁实底白字。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `auth.py` | 改 | 账号 CRUD 纯变换 + 校验 + 带锁 IO 包装 + `destroy_sessions_for_account` + `list_public_accounts` |
| `tests/test_auth_admin.py` | 建 | 纯函数单测 |
| `server.py` | 改 | `_require_super` + 四 admin 端点 + do_GET/do_POST 注册 |
| `tests/test_server_admin.py` | 建 | admin 端点集成测试（真 HTTP） |
| `frontend/src/lib/pageAccess.ts` | 改 | 导出 `PAGE_OPTIONS` |
| `frontend/src/lib/admin.ts` | 建 | 4 个 admin API 封装 |
| `frontend/src/router/index.ts` | 改 | `RouteMeta.requiresSuper` + `/admin` 路由 + 守卫扩展 |
| `frontend/src/layout/AppSidebar.vue` | 改 | super-only "系统管理 > 账号管理"入口 |
| `frontend/src/views/AdminView.vue` | 建 | 账号表 + 建/编辑弹窗 + 删除 |
| `frontend/src/lib/admin.test.ts` | 建 | API 封装单测 |
| `frontend/src/router/guard.test.ts` | 改 | requiresSuper 守卫断言 |
| `frontend/src/layout/AppSidebar.test.ts` | 改 | admin 链接 super-only 断言 |
| `frontend/src/views/AdminView.test.ts` | 建 | 组件渲染/交互测试 |

任务划分：Task 1 后端账号 CRUD；Task 2 后端 admin 端点（依赖 T1）；Task 3 前端 plumbing（lib/路由/侧栏）；Task 4 AdminView 页（依赖 T3）。

---

### Task 1: auth.py 账号 CRUD（纯变换 + 校验 + 带锁 IO + 会话吊销）

**Files:**
- Modify: `auth.py`（在文件末尾、`build_clear_cookie` 之后追加；顶部 import 加 `import re`）
- Test: `tests/test_auth_admin.py`

**Interfaces:**
- Consumes（已存在）：`_make_user(password, display_name, is_super, pages, l4)`、`hash_password`、`verify_password`、`load_accounts`、`save_accounts`、`public_user`、`_sessions`、`_sessions_lock`。
- Produces（Task 2 依赖）：`add_account(account, password, display_name, pages, l4) -> dict(public)`、`edit_account(account, *, display_name=None, pages=None, l4=None, password=None) -> dict(public)`、`remove_account(account) -> None`、`list_public_accounts() -> list`、`destroy_sessions_for_account(account) -> None`。纯变换 `create_account/update_account/delete_account(accounts, ...) -> dict`。

- [ ] **Step 1: 写失败测试 `tests/test_auth_admin.py`**

```python
import importlib
import auth


def _fresh_accounts():
    # 一个超管 + 一个普通账号的内存 accounts dict
    data = {'version': 1, 'users': {}}
    data['users']['boss'] = auth._make_user('p1', '超管', is_super=True)
    data['users']['liu'] = auth._make_user('p2', '老刘', is_super=False,
                                            pages=['projects'], l4=['北京'])
    return data


def test_create_account_adds_normal_user():
    acc = _fresh_accounts()
    out = auth.create_account(acc, 'newbie', 'pw123', '新人',
                              ['projects', 'payment'], ['上海'])
    assert 'newbie' in out['users']
    u = out['users']['newbie']
    assert u['isSuper'] is False
    assert u['allowedPages'] == ['projects', 'payment']
    assert u['allowedL4'] == ['上海']
    assert u['hash'] != 'pw123' and u['salt']
    assert auth.verify_password('pw123', u['salt'], u['hash'])
    # 不改入参
    assert 'newbie' not in acc['users']


def test_create_account_duplicate_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(ValueError):
        auth.create_account(acc, 'liu', 'x', '撞名', ['projects'], ['北京'])


def test_create_account_invalid_name_raises():
    acc = _fresh_accounts()
    import pytest
    for bad in ['', '  ', 'has space', 'x' * 65, '中文名']:
        with pytest.raises(ValueError):
            auth.create_account(acc, bad, 'pw', 'n', ['projects'], ['北京'])


def test_create_account_empty_password_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(ValueError):
        auth.create_account(acc, 'newbie', '', 'n', ['projects'], ['北京'])


def test_update_account_changes_fields():
    acc = _fresh_accounts()
    out = auth.update_account(acc, 'liu', display_name='老刘改',
                              pages=['*'], l4=['*'])
    u = out['users']['liu']
    assert u['displayName'] == '老刘改'
    assert u['allowedPages'] == ['*'] and u['allowedL4'] == ['*']
    # 入参不变
    assert acc['users']['liu']['displayName'] == '老刘'


def test_update_account_password_rehash():
    acc = _fresh_accounts()
    old = acc['users']['liu']['hash']
    out = auth.update_account(acc, 'liu', password='brandnew')
    u = out['users']['liu']
    assert u['hash'] != old
    assert auth.verify_password('brandnew', u['salt'], u['hash'])
    assert not auth.verify_password('p2', u['salt'], u['hash'])


def test_update_account_super_target_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(ValueError):
        auth.update_account(acc, 'boss', display_name='x')


def test_update_account_missing_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(KeyError):
        auth.update_account(acc, 'ghost', display_name='x')


def test_update_account_partial_keeps_others():
    acc = _fresh_accounts()
    out = auth.update_account(acc, 'liu', display_name='仅改名')
    u = out['users']['liu']
    assert u['allowedPages'] == ['projects'] and u['allowedL4'] == ['北京']


def test_delete_account_removes_normal():
    acc = _fresh_accounts()
    out = auth.delete_account(acc, 'liu')
    assert 'liu' not in out['users']
    assert 'liu' in acc['users']  # 入参不变


def test_delete_account_super_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(ValueError):
        auth.delete_account(acc, 'boss')


def test_delete_account_missing_raises():
    acc = _fresh_accounts()
    import pytest
    with pytest.raises(KeyError):
        auth.delete_account(acc, 'ghost')


def test_validate_str_list_dedup_and_bounds():
    import pytest
    assert auth._validate_str_list(['a', 'a', 'b'], 'pages') == ['a', 'b']
    assert auth._validate_str_list(['*'], 'pages') == ['*']
    assert auth._validate_str_list(['x' * 64], 'pages') == ['x' * 64]
    with pytest.raises(ValueError):
        auth._validate_str_list(['x' * 65], 'pages')
    with pytest.raises(ValueError):
        auth._validate_str_list(['ok', ''], 'pages')
    with pytest.raises(ValueError):
        auth._validate_str_list('notalist', 'pages')


def test_destroy_sessions_for_account(monkeypatch):
    monkeypatch.setattr(auth, '_sessions', {}, raising=False)
    t1 = auth.create_session('liu')
    t2 = auth.create_session('liu')
    t3 = auth.create_session('boss')
    auth.destroy_sessions_for_account('liu')
    assert auth.validate_session(t1) is None
    assert auth.validate_session(t2) is None
    assert auth.validate_session(t3) == 'boss'


def test_list_public_accounts_strips_secrets(tmp_path, monkeypatch):
    f = tmp_path / 'accounts.json'
    monkeypatch.setattr(auth, 'ACCOUNTS_FILE', str(f))
    auth.add_account('zoe', 'pw', 'Zoe', ['projects'], ['北京'])
    auth.add_account('amy', 'pw', 'Amy', ['*'], ['*'])
    lst = auth.list_public_accounts()
    accounts = [a['account'] for a in lst]
    assert accounts == sorted(accounts)
    for a in lst:
        assert 'salt' not in a and 'hash' not in a
        assert set(a.keys()) == {'account', 'displayName', 'isSuper', 'allowedPages', 'allowedL4'}


def test_add_edit_remove_roundtrip(tmp_path, monkeypatch):
    f = tmp_path / 'accounts.json'
    monkeypatch.setattr(auth, 'ACCOUNTS_FILE', str(f))
    pub = auth.add_account('dan', 'pw', 'Dan', ['projects'], ['北京'])
    assert pub['isSuper'] is False and 'hash' not in pub
    auth.edit_account('dan', l4=['上海', '北京'])
    assert auth.load_accounts()['users']['dan']['allowedL4'] == ['上海', '北京']
    auth.remove_account('dan')
    assert 'dan' not in auth.load_accounts()['users']
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `python -m pytest tests/test_auth_admin.py -q`
Expected: FAIL（`AttributeError: module 'auth' has no attribute 'create_account'` 等）

- [ ] **Step 3: 实现 auth.py 扩展**

在 `auth.py` 顶部 import 区加 `import re`（与现有 import 同段）。在文件末尾 `build_clear_cookie` 之后追加：

```python
# —— SP-5 账号管理 ——
_ACCOUNT_RE = re.compile(r'^[A-Za-z0-9_.-]{1,64}$')
_accounts_mutate_lock = threading.Lock()


def _validate_account_name(account: str) -> str:
    name = (account or '').strip()
    if not _ACCOUNT_RE.match(name):
        raise ValueError('账号名须为 1-64 位字母/数字/下划线/点/连字符')
    return name


def _validate_password(password: str) -> None:
    if not isinstance(password, str) or not (1 <= len(password) <= 256):
        raise ValueError('密码长度须为 1-256')


def _validate_str_list(values, field: str) -> list:
    if not isinstance(values, list):
        raise ValueError(f'{field} 须为数组')
    out: list = []
    for v in values:
        if not isinstance(v, str) or not (1 <= len(v) <= 64):
            raise ValueError(f'{field} 各项须为 1-64 位字符串')
        if v not in out:
            out.append(v)
    if len(out) > 100:
        raise ValueError(f'{field} 项数过多')
    return out


def create_account(accounts: dict, account: str, password: str, display_name: str,
                   pages: list, l4: list) -> dict:
    name = _validate_account_name(account)
    _validate_password(password)
    users = accounts.get('users', {})
    if name in users:
        raise ValueError(f'账号 {name} 已存在')
    pages = _validate_str_list(pages, 'allowedPages')
    l4 = _validate_str_list(l4, 'allowedL4')
    new_users = dict(users)
    new_users[name] = _make_user(password, (display_name or name)[:64],
                                 is_super=False, pages=pages, l4=l4)
    out = dict(accounts)
    out['users'] = new_users
    return out


def update_account(accounts: dict, account: str, *, display_name=None, pages=None,
                   l4=None, password=None) -> dict:
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


def delete_account(accounts: dict, account: str) -> dict:
    users = accounts.get('users', {})
    if account not in users:
        raise KeyError(account)
    if users[account].get('isSuper'):
        raise ValueError('不可经界面删除超级管理员')
    new_users = dict(users)
    del new_users[account]
    out = dict(accounts)
    out['users'] = new_users
    return out


def destroy_sessions_for_account(account: str) -> None:
    with _sessions_lock:
        for tok in [t for t, s in _sessions.items() if s.get('account') == account]:
            _sessions.pop(tok, None)


def list_public_accounts() -> list:
    users = load_accounts().get('users', {})
    return [public_user(acc, users[acc]) for acc in sorted(users)]


def add_account(account: str, password: str, display_name: str, pages: list, l4: list) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = create_account(data, account, password, display_name, pages, l4)
        save_accounts(data)
        name = _validate_account_name(account)
        return public_user(name, data['users'][name])


def edit_account(account: str, *, display_name=None, pages=None, l4=None, password=None) -> dict:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = update_account(data, account, display_name=display_name, pages=pages,
                              l4=l4, password=password)
        save_accounts(data)
        return public_user(account, data['users'][account])


def remove_account(account: str) -> None:
    with _accounts_mutate_lock:
        data = load_accounts()
        data = delete_account(data, account)
        save_accounts(data)
    destroy_sessions_for_account(account)
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `python -m pytest tests/test_auth_admin.py -q`
Expected: PASS（全部）

- [ ] **Step 5: ruff + 既有 auth 测试回归**

Run: `python -m ruff check auth.py tests/test_auth_admin.py && python -m pytest tests/test_auth.py tests/test_auth_admin.py -q`
Expected: ruff 净；全部 PASS

- [ ] **Step 6: Commit**

```bash
git add auth.py tests/test_auth_admin.py
git commit -m "feat(admin): auth.py 账号 CRUD 纯变换+校验+带锁IO+删号吊销会话

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: server.py admin 端点（super-only）

**Files:**
- Modify: `server.py`（加 `ERR_FORBIDDEN` 常量、`_require_super`、四 handler、do_GET/do_POST 注册）
- Test: `tests/test_server_admin.py`

**Interfaces:**
- Consumes：Task 1 的 `auth.add_account/edit_account/remove_account/list_public_accounts`；既有 `auth.parse_cookie_token/validate_session/load_accounts`、`self._send_json(status, payload, extra_headers=None)`、`_error_payload(code, msg)`、`ERR_PARSE/ERR_VALIDATION/ERR_NOT_FOUND`。
- Produces：HTTP `GET /api/admin/accounts`、`POST /api/admin/accounts/{create,update,delete}`。

- [ ] **Step 1: 写失败集成测试 `tests/test_server_admin.py`**

参照既有 `tests/test_server_auth.py` 的服务器起停夹具（同进程线程起 `ThreadingHTTPServer`、monkeypatch `auth.ACCOUNTS_FILE` 到 tmp、用 `http.client` 或 `urllib`）。若该测试已有可复用夹具（如 `live_server` fixture / helper），复用之；否则按其模式自建。

```python
import json
import os
import threading
import http.client
import pytest
import auth
import server


@pytest.fixture
def admin_server(tmp_path, monkeypatch):
    # 独立 accounts.json:1 超管 boss + 1 普通 liu
    accounts_file = tmp_path / 'accounts.json'
    monkeypatch.setattr(auth, 'ACCOUNTS_FILE', str(accounts_file))
    monkeypatch.setattr(auth, '_sessions', {}, raising=False)
    data = {'version': 1, 'users': {}}
    data['users']['boss'] = auth._make_user('bosspw', '超管', is_super=True)
    data['users']['liu'] = auth._make_user('liupw', '老刘', is_super=False,
                                           pages=['projects'], l4=['北京'])
    auth.save_accounts(data)

    httpd = server.create_server() if hasattr(server, 'create_server') else None
    # 若 create_server 签名不同,参照 test_server_auth.py 的起服务方式构造 httpd(端口 0 自动分配)
    assert httpd is not None, '参照 test_server_auth.py 起服务'
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield port
    httpd.shutdown()


def _login(port, account, password):
    conn = http.client.HTTPConnection('127.0.0.1', port)
    conn.request('POST', '/api/login', json.dumps({'account': account, 'password': password}),
                 {'Content-Type': 'application/json'})
    r = conn.getresponse()
    body = r.read()
    cookie = r.getheader('Set-Cookie')
    conn.close()
    return r.status, cookie, json.loads(body or b'{}')


def _req(port, method, path, cookie=None, body=None):
    conn = http.client.HTTPConnection('127.0.0.1', port)
    headers = {'Content-Type': 'application/json'}
    if cookie:
        headers['Cookie'] = cookie.split(';')[0]
    conn.request(method, path, json.dumps(body) if body is not None else None, headers)
    r = conn.getresponse()
    data = json.loads(r.read() or b'{}')
    conn.close()
    return r.status, data


def test_super_lists_accounts_without_secrets(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, 'boss', 'bosspw')
    status, data = _req(port, 'GET', '/api/admin/accounts', cookie)
    assert status == 200 and data['success']
    accs = data['accounts']
    assert {a['account'] for a in accs} == {'boss', 'liu'}
    for a in accs:
        assert 'salt' not in a and 'hash' not in a


def test_normal_user_forbidden(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, 'liu', 'liupw')
    assert _req(port, 'GET', '/api/admin/accounts', cookie)[0] == 403
    assert _req(port, 'POST', '/api/admin/accounts/create', cookie,
                {'account': 'x', 'password': 'p', 'displayName': 'X',
                 'allowedPages': ['projects'], 'allowedL4': ['北京']})[0] == 403
    assert _req(port, 'POST', '/api/admin/accounts/delete', cookie, {'account': 'boss'})[0] == 403


def test_unauthenticated_401(admin_server):
    port = admin_server
    assert _req(port, 'GET', '/api/admin/accounts')[0] == 401


def test_super_create_then_list(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, 'boss', 'bosspw')
    status, data = _req(port, 'POST', '/api/admin/accounts/create', cookie,
                        {'account': 'newbie', 'password': 'pw12345', 'displayName': '新人',
                         'allowedPages': ['projects'], 'allowedL4': ['上海']})
    assert status == 200 and data['user']['isSuper'] is False
    _, lst = _req(port, 'GET', '/api/admin/accounts', cookie)
    assert 'newbie' in {a['account'] for a in lst['accounts']}
    # 撞名 400
    assert _req(port, 'POST', '/api/admin/accounts/create', cookie,
                {'account': 'newbie', 'password': 'p', 'displayName': 'x',
                 'allowedPages': ['projects'], 'allowedL4': ['上海']})[0] == 400


def test_super_update_normal(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, 'boss', 'bosspw')
    status, _ = _req(port, 'POST', '/api/admin/accounts/update', cookie,
                     {'account': 'liu', 'allowedL4': ['上海', '广州']})
    assert status == 200
    _, lst = _req(port, 'GET', '/api/admin/accounts', cookie)
    liu = next(a for a in lst['accounts'] if a['account'] == 'liu')
    assert liu['allowedL4'] == ['上海', '广州']


def test_super_cannot_update_or_delete_super(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, 'boss', 'bosspw')
    assert _req(port, 'POST', '/api/admin/accounts/update', cookie,
                {'account': 'boss', 'displayName': 'x'})[0] == 400
    assert _req(port, 'POST', '/api/admin/accounts/delete', cookie, {'account': 'boss'})[0] == 400


def test_super_cannot_delete_self(admin_server):
    port = admin_server
    _, cookie, _ = _login(port, 'boss', 'bosspw')
    assert _req(port, 'POST', '/api/admin/accounts/delete', cookie, {'account': 'boss'})[0] == 400


def test_super_delete_normal_revokes_session(admin_server):
    port = admin_server
    _, boss_cookie, _ = _login(port, 'boss', 'bosspw')
    _, liu_cookie, _ = _login(port, 'liu', 'liupw')
    assert _req(port, 'GET', '/api/auth/me', liu_cookie)[0] == 200
    assert _req(port, 'POST', '/api/admin/accounts/delete', boss_cookie, {'account': 'liu'})[0] == 200
    assert _req(port, 'GET', '/api/auth/me', liu_cookie)[0] == 401
```

> 注：`create_server` 的实际名称/签名以 `server.py` 与 `tests/test_server_auth.py` 既有用法为准；起服务夹具直接套用 `test_server_auth.py` 的写法（端口 0、daemon 线程、`shutdown()`）。

- [ ] **Step 2: 运行测试，确认失败**

Run: `python -m pytest tests/test_server_admin.py -q`
Expected: FAIL（404/无 handler）

- [ ] **Step 3: 实现 server.py 改动**

在 `ERR_AUTH = "auth_failed"` 附近加常量：

```python
ERR_FORBIDDEN = "forbidden"           # 权限不足(非超管)
```

在 `_auth_gate` 方法附近（同 class）加：

```python
    def _require_super(self):
        """校验当前会话为超级管理员;否则发 403 并返回 None。返回超管 account。"""
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not rec or not rec.get('isSuper'):
            self._send_json(403, _error_payload(ERR_FORBIDDEN, "需要超级管理员权限"))
            return None
        return account

    def _read_json_body(self):
        """读 POST JSON body;失败返回 None(调用方负责报 400)。"""
        try:
            n = int(self.headers.get('Content-Length', 0))
            return json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            return None

    def handle_admin_accounts_list(self):
        if self._require_super() is None:
            return
        self._send_json(200, {"success": True, "accounts": auth.list_public_accounts()})

    def handle_admin_account_create(self):
        if self._require_super() is None:
            return
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        try:
            user = auth.add_account(
                data.get('account', ''), data.get('password', ''),
                data.get('displayName', ''), data.get('allowedPages', []),
                data.get('allowedL4', []))
        except ValueError as e:
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        self._send_json(200, {"success": True, "user": user})

    def handle_admin_account_update(self):
        if self._require_super() is None:
            return
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        account = data.get('account', '')
        try:
            user = auth.edit_account(
                account,
                display_name=data.get('displayName'),
                pages=data.get('allowedPages'),
                l4=data.get('allowedL4'),
                password=data.get('password'))
        except KeyError:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, f"账号不存在: {account}"))
            return
        except ValueError as e:
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        self._send_json(200, {"success": True, "user": user})

    def handle_admin_account_delete(self):
        super_account = self._require_super()
        if super_account is None:
            return
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        account = data.get('account', '')
        if account == super_account:
            self._send_json(400, _error_payload(ERR_VALIDATION, "不能删除自己"))
            return
        try:
            auth.remove_account(account)
        except KeyError:
            self._send_json(404, _error_payload(ERR_NOT_FOUND, f"账号不存在: {account}"))
            return
        except ValueError as e:
            self._send_json(400, _error_payload(ERR_VALIDATION, str(e)))
            return
        self._send_json(200, {"success": True})
```

在 `do_GET` 的 if/elif 链（`/api/auth/me` 之后、`/data/analysis_data.json` 附近）加：

```python
        elif parsed.path == '/api/admin/accounts':
            self.handle_admin_accounts_list()
```

在 `do_POST` 的 if/elif 链（`/api/logout` 之后）加：

```python
        elif parsed.path == '/api/admin/accounts/create':
            self.handle_admin_account_create()
        elif parsed.path == '/api/admin/accounts/update':
            self.handle_admin_account_update()
        elif parsed.path == '/api/admin/accounts/delete':
            self.handle_admin_account_delete()
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `python -m pytest tests/test_server_admin.py -q`
Expected: PASS（全部）

- [ ] **Step 5: ruff + 鉴权相关回归**

Run: `python -m ruff check server.py tests/test_server_admin.py && python -m pytest tests/test_server_auth.py tests/test_server_admin.py tests/test_server_data.py -q`
Expected: ruff 净；全部 PASS

- [ ] **Step 6: Commit**

```bash
git add server.py tests/test_server_admin.py
git commit -m "feat(admin): /api/admin/accounts CRUD 端点(super-only,_require_super 双层门)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 前端 plumbing（PAGE_OPTIONS + lib/admin + 路由 requiresSuper + 侧栏 super 入口）

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts`（导出 `PAGE_OPTIONS`）
- Create: `frontend/src/lib/admin.ts`
- Modify: `frontend/src/router/index.ts`（`RouteMeta.requiresSuper` + `/admin` 路由 + 守卫）
- Modify: `frontend/src/layout/AppSidebar.vue`（super-only 入口）
- Create: `frontend/src/lib/admin.test.ts`
- Modify: `frontend/src/router/guard.test.ts`（加 requiresSuper 用例）
- Modify: `frontend/src/layout/AppSidebar.test.ts`（加 admin 链接用例）

**Interfaces:**
- Consumes：`@/nav` 的 4 个 LINKS、`useAuthStore` 的 `isSuper`/`firstAllowedPath`/`ensureReady`/`isLoggedIn`。
- Produces（Task 4 依赖）：`PAGE_OPTIONS: {key:string;label:string}[]`、`lib/admin.ts` 的 `AdminAccount` 接口与 `listAccounts/createAccount/updateAccount/deleteAccount`；路由 name `admin` at `/admin`。

- [ ] **Step 1: 写失败测试 `frontend/src/lib/admin.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listAccounts, createAccount, updateAccount, deleteAccount } from './admin'

describe('lib/admin', () => {
  beforeEach(() => { vi.restoreAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('listAccounts GET 解析 accounts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, accounts: [{ account: 'a', displayName: 'A', isSuper: false, allowedPages: ['*'], allowedL4: ['*'] }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const out = await listAccounts()
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/accounts', expect.objectContaining({ credentials: 'same-origin' }))
    expect(out[0].account).toBe('a')
  })

  it('createAccount POST 正确 body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await createAccount({ account: 'x', password: 'p', displayName: 'X', allowedPages: ['projects'], allowedL4: ['北京'] })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/accounts/create')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toMatchObject({ account: 'x', allowedL4: ['北京'] })
  })

  it('updateAccount POST update', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await updateAccount({ account: 'x', allowedPages: ['*'] })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/accounts/update')
  })

  it('deleteAccount POST delete', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) })
    vi.stubGlobal('fetch', fetchMock)
    await deleteAccount('x')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/admin/accounts/delete')
    expect(JSON.parse(opts.body)).toEqual({ account: 'x' })
  })

  it('非 2xx 抛带 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: '需要超级管理员权限' }) }))
    await expect(listAccounts()).rejects.toThrow('需要超级管理员权限')
  })
})
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd frontend && npx vitest run src/lib/admin.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `frontend/src/lib/admin.ts`**

```ts
export interface AdminAccount {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
}

async function postJson(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.success === false) throw new Error(data.message || '操作失败')
}

export async function listAccounts(): Promise<AdminAccount[]> {
  const res = await fetch('/api/admin/accounts', { credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.message || '获取账号列表失败')
  return data.accounts as AdminAccount[]
}

export function createAccount(p: {
  account: string; password: string; displayName: string
  allowedPages: string[]; allowedL4: string[]
}): Promise<void> {
  return postJson('/api/admin/accounts/create', p)
}

export function updateAccount(p: {
  account: string; displayName?: string; allowedPages?: string[]
  allowedL4?: string[]; password?: string
}): Promise<void> {
  return postJson('/api/admin/accounts/update', p)
}

export function deleteAccount(account: string): Promise<void> {
  return postJson('/api/admin/accounts/delete', { account })
}
```

- [ ] **Step 4: 实现 `PAGE_OPTIONS`（pageAccess.ts 末尾追加）**

```ts
import { PROJECT_LINKS, ANALYSIS_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'

/** 建/编辑账号表单的"可访问页面"选项单一来源:'*' 全部 + 18 个 PageKey(取 nav 标签)。 */
export const PAGE_OPTIONS: { key: string; label: string }[] = [
  { key: '*', label: '全部页面' },
  ...[...PROJECT_LINKS, ...ANALYSIS_LINKS, ...PAYMENT_LINKS, ...TOOL_LINKS].map((l) => ({
    key: l.key,
    label: l.label,
  })),
]
```

> 验证：`nav.ts` 仅 `import type { PageKey }`（类型 import，运行时无副作用），故 `pageAccess ↔ nav` 不构成运行时循环依赖。若 `npm run build` 报循环依赖告警，则改为把 `PAGE_OPTIONS` 定义移入 `nav.ts` 末尾并从那里 export，AdminView 改 import 来源。

- [ ] **Step 5: 路由 requiresSuper（router/index.ts）**

`RouteMeta` 接口加一行 `requiresSuper?: boolean`：

```ts
  interface RouteMeta {
    title?: string
    hideFilter?: boolean
    fullscreen?: boolean
    pageKey?: PageKey
    requiresSuper?: boolean
  }
```

顶部加 `import AdminView from '@/views/AdminView.vue'`（Task 4 创建该文件；本任务中为使 typecheck/构建通过，可先创建占位——见下方说明）。在 `/about` 路由之后、catch-all 之前加：

```ts
    { path: '/admin', name: 'admin', component: AdminView, meta: { title: '账号管理', hideFilter: true, requiresSuper: true } },
```

守卫 `beforeEach` 在 `if (!auth.isLoggedIn) return { path: '/login' }` 之后、`const key = ...` 之前加：

```ts
  if (to.meta.requiresSuper && !auth.isSuper) return { path: auth.firstAllowedPath() }
```

> AdminView 占位：本任务为通过 typecheck/build，需要 `AdminView.vue` 至少存在。创建最小占位 `frontend/src/views/AdminView.vue`：
> ```vue
> <script setup lang="ts"></script>
> <template><div class="admin-view">账号管理</div></template>
> ```
> Task 4 将其替换为完整实现。（若 Task 4 与本任务由同一执行者连续完成，可跳过占位直接写完整 AdminView；但本任务的提交须能独立通过 typecheck/build，故占位是底线。）

- [ ] **Step 6: 侧栏 super-only 入口（AppSidebar.vue）**

在工具 section（`v-if="toolLinks.length"` 的 div）之后加：

```html
      <div v-if="auth.isSuper" class="section">
        <div class="section-label">系统管理</div>
        <RouterLink to="/admin" class="nav-item" active-class="active">账号管理</RouterLink>
      </div>
```

（`auth` 已在 `<script setup>` 中 `const auth = useAuthStore()`，复用。）

- [ ] **Step 7: 扩展 guard 测试（router/guard.test.ts）**

在既有文件追加（沿用其 store/router 装配方式；以下为断言意图，按文件既有写法落实）：

```ts
it('requiresSuper 路由:超管放行', async () => {
  // 装配 authStore.user = 超管(isSuper:true) → 访问 /admin → 放行(到达 /admin)
})
it('requiresSuper 路由:普通用户重定向到 firstAllowedPath', async () => {
  // authStore.user = 普通(isSuper:false, allowedPages:['projects']) → 访问 /admin → 落到 /projects(非 /admin)
})
```

> 实现者：复用 guard.test.ts 已有的 `mountWithRoute`/`makeRouter`/直接调 beforeEach 等既有 helper；用 `requiresSuper:true` 的目标（`/admin`）断言重定向。普通用户 firstAllowedPath 取决于其 allowedPages，断言"未停留在 /admin"即可。

- [ ] **Step 8: 扩展 AppSidebar 测试（AppSidebar.test.ts）**

```ts
it('超管见"账号管理"链接', () => {
  // 装配 authStore isSuper=true → 渲染 → 含 to="/admin" 的 RouterLink / 文本"账号管理"
})
it('普通用户不见"账号管理"链接', () => {
  // isSuper=false → 不含 /admin 链接
})
```

> 沿用 AppSidebar.test.ts 既有挂载方式（stub RouterLink、装配 pinia authStore）。

- [ ] **Step 9: 运行前端测试 + typecheck + build**

Run: `cd frontend && npx vitest run src/lib/admin.test.ts src/router/guard.test.ts src/layout/AppSidebar.test.ts && npm run typecheck`
Expected: PASS；typecheck 净

- [ ] **Step 10: Commit**

```bash
git add frontend/src/lib/admin.ts frontend/src/lib/pageAccess.ts frontend/src/router/index.ts frontend/src/layout/AppSidebar.vue frontend/src/views/AdminView.vue frontend/src/lib/admin.test.ts frontend/src/router/guard.test.ts frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(admin): 前端 plumbing(lib/admin+PAGE_OPTIONS+/admin 路由 requiresSuper+侧栏 super 入口)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: AdminView.vue 账号管理页

**Files:**
- Modify/Replace: `frontend/src/views/AdminView.vue`（替换 Task 3 占位为完整实现）
- Create: `frontend/src/views/AdminView.test.ts`

**Interfaces:**
- Consumes：`@/lib/admin`（`listAccounts/createAccount/updateAccount/deleteAccount/AdminAccount`）、`@/lib/pageAccess`（`PAGE_OPTIONS`）、`@/stores/data`（`useDataStore().data?.projects` 取 orgL4）、Element Plus（`ElMessage`、`ElMessageBox`、el-table/el-dialog/el-form/el-input/el-select/el-button/el-tag）。
- Produces：路由 `/admin` 的页面组件（Task 3 已注册路由）。

- [ ] **Step 1: 写失败测试 `frontend/src/views/AdminView.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AdminView from './AdminView.vue'
import * as adminApi from '@/lib/admin'

vi.mock('@/lib/admin')

describe('AdminView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
    vi.mocked(adminApi.listAccounts).mockResolvedValue([
      { account: 'boss', displayName: '超管', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] },
      { account: 'liu', displayName: '老刘', isSuper: false, allowedPages: ['projects'], allowedL4: ['北京'] },
    ])
  })

  it('挂载拉取并渲染账号行', async () => {
    const wrapper = mount(AdminView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(adminApi.listAccounts).toHaveBeenCalled()
    expect(wrapper.text()).toContain('boss')
    expect(wrapper.text()).toContain('老刘')
  })

  it('点新建打开弹窗', async () => {
    const wrapper = mount(AdminView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    const btn = wrapper.find('[data-test="admin-create"]')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).dialogVisible).toBe(true)
  })

  it('提交新建调用 createAccount 并重拉', async () => {
    vi.mocked(adminApi.createAccount).mockResolvedValue()
    const wrapper = mount(AdminView, { global: { stubs: { teleport: true } } })
    await flushPromises()
    const vm = wrapper.vm as any
    vm.openCreate()
    vm.form.account = 'newbie'
    vm.form.password = 'pw12345'
    vm.form.displayName = '新人'
    vm.form.allowedPages = ['projects']
    vm.form.allowedL4 = ['上海']
    await vm.submitForm()
    await flushPromises()
    expect(adminApi.createAccount).toHaveBeenCalledWith(expect.objectContaining({ account: 'newbie', allowedL4: ['上海'] }))
    expect(adminApi.listAccounts).toHaveBeenCalledTimes(2)
  })
})
```

> 实现者：Element Plus 组件在 jsdom 下的交互测试以"驱动 vm 暴露的方法/响应式状态 + 断言 API 调用"为主，避免依赖深层 DOM 渲染。AdminView 须 `defineExpose` 或经 `<script setup>` 顶层声明使 `dialogVisible`/`form`/`openCreate`/`submitForm` 在 `wrapper.vm` 可见（`<script setup>` 顶层 const 默认不暴露——用 `defineExpose({ dialogVisible, form, openCreate, submitForm })`）。`data-test="admin-create"` 挂在新建按钮。

- [ ] **Step 2: 运行，确认失败**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts`
Expected: FAIL（占位组件无这些元素/方法）

- [ ] **Step 3: 实现 `frontend/src/views/AdminView.vue`**

```vue
<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDataStore } from '@/stores/data'
import { PAGE_OPTIONS } from '@/lib/pageAccess'
import {
  listAccounts, createAccount, updateAccount, deleteAccount,
  type AdminAccount,
} from '@/lib/admin'

const store = useDataStore()
const accounts = ref<AdminAccount[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const editing = ref(false) // true=编辑(account 只读),false=新建

const blankForm = () => ({
  account: '', password: '', displayName: '',
  allowedPages: [] as string[], allowedL4: [] as string[],
})
const form = reactive(blankForm())

const l4Options = computed<string[]>(() => {
  const set = new Set<string>()
  for (const p of (store.data?.projects ?? []) as { orgL4?: string }[]) {
    const v = (p.orgL4 || '').trim()
    if (v) set.add(v)
  }
  return Array.from(set).sort()
})

async function reload() {
  loading.value = true
  try {
    accounts.value = await listAccounts()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = false
  Object.assign(form, blankForm())
  dialogVisible.value = true
}

function openEdit(row: AdminAccount) {
  editing.value = true
  Object.assign(form, {
    account: row.account, password: '', displayName: row.displayName,
    allowedPages: [...row.allowedPages], allowedL4: [...row.allowedL4],
  })
  dialogVisible.value = true
}

async function submitForm() {
  try {
    if (editing.value) {
      await updateAccount({
        account: form.account,
        displayName: form.displayName,
        allowedPages: form.allowedPages,
        allowedL4: form.allowedL4,
        ...(form.password ? { password: form.password } : {}),
      })
      ElMessage.success('已保存')
    } else {
      await createAccount({
        account: form.account, password: form.password, displayName: form.displayName,
        allowedPages: form.allowedPages, allowedL4: form.allowedL4,
      })
      ElMessage.success('已创建')
    }
    dialogVisible.value = false
    await reload()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

async function onDelete(row: AdminAccount) {
  try {
    await ElMessageBox.confirm(`确认删除账号「${row.account}」?`, '删除确认', { type: 'warning' })
  } catch {
    return // 取消
  }
  try {
    await deleteAccount(row.account)
    ElMessage.success('已删除')
    await reload()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

function pageLabels(keys: string[]): string {
  if (keys.includes('*')) return '全部'
  const map = new Map(PAGE_OPTIONS.map((o) => [o.key, o.label]))
  return keys.map((k) => map.get(k) || k).join('、') || '—'
}
function l4Labels(keys: string[]): string {
  if (keys.includes('*')) return '全部'
  return keys.join('、') || '—'
}

onMounted(reload)
defineExpose({ dialogVisible, editing, form, openCreate, openEdit, submitForm, onDelete, reload })
</script>

<template>
  <div class="admin-view">
    <div class="admin-head">
      <h2 class="admin-title">账号管理</h2>
      <el-button type="primary" data-test="admin-create" @click="openCreate">新建账号</el-button>
    </div>

    <el-table :data="accounts" v-loading="loading" class="admin-table" stripe>
      <el-table-column prop="account" label="账号" min-width="120" />
      <el-table-column prop="displayName" label="显示名" min-width="120" />
      <el-table-column label="类型" width="120">
        <template #default="{ row }">
          <span class="role-tag" :class="row.isSuper ? 'role-super' : 'role-normal'">
            {{ row.isSuper ? '超级管理员' : '普通管理员' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="可访问页面" min-width="200">
        <template #default="{ row }">{{ pageLabels(row.allowedPages) }}</template>
      </el-table-column>
      <el-table-column label="可见 L4" min-width="160">
        <template #default="{ row }">{{ l4Labels(row.allowedL4) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <el-button link type="primary" :disabled="row.isSuper" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" :disabled="row.isSuper" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑账号' : '新建账号'" width="520px">
      <el-form label-width="92px">
        <el-form-item label="账号">
          <el-input v-model="form.account" :disabled="editing" placeholder="字母/数字/_-." />
        </el-form-item>
        <el-form-item :label="editing ? '重置密码' : '密码'">
          <el-input v-model="form.password" type="password" show-password
            :placeholder="editing ? '留空表示不修改' : '设置初始密码'" />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="form.displayName" placeholder="展示用名称" />
        </el-form-item>
        <el-form-item label="可访问页面">
          <el-select v-model="form.allowedPages" multiple filterable class="admin-select" placeholder="选择可访问页面">
            <el-option v-for="o in PAGE_OPTIONS" :key="o.key" :label="o.label" :value="o.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="可见 L4">
          <el-select v-model="form.allowedL4" multiple filterable class="admin-select" placeholder="选择可见 L4 组织">
            <el-option label="全部 L4" value="*" />
            <el-option v-for="l4 in l4Options" :key="l4" :label="l4" :value="l4" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitForm">{{ editing ? '保存' : '创建' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-view { padding: var(--sp-5); }
.admin-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--sp-4); }
.admin-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.admin-table { margin-top: var(--sp-3); }
.admin-select { width: 100%; }
.role-tag { display: inline-block; padding: 2px var(--sp-2); border-radius: var(--r-sm); font-size: var(--fs-1); }
.role-super { background: var(--accent-bg, var(--card2)); color: var(--accent); }
.role-normal { background: var(--ok-bg); color: var(--ok-text); }
</style>
```

> 令牌核对：实现者须确认 `--ok-bg`/`--ok-text`/`--accent`/`--card2`/`--r-sm`/`--fs-1`/`--fs-4`/`--sp-*` 在 `theme.css` 存在；`--accent-bg` 若不存在则去掉回退、直接用 `var(--card2)`。淡底+深字遵设计三态规范。

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd frontend && npx vitest run src/views/AdminView.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck + build + 全前端测试**

Run: `cd frontend && npm run typecheck && npx vitest run && npm run build`
Expected: 全 PASS；build 成功

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/AdminView.vue frontend/src/views/AdminView.test.ts
git commit -m "feat(admin): AdminView 账号管理页(表格+建/编辑弹窗+删除,Element Plus)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage:**
- auth CRUD 纯变换+校验+IO+会话吊销 → Task 1 ✓
- super-only 端点 `_require_super` + 四端点 → Task 2 ✓
- PAGE_OPTIONS 单源 → Task 3 Step 4 ✓
- lib/admin 4 封装 → Task 3 ✓
- 路由 requiresSuper + 守卫 → Task 3 Step 5 ✓
- 侧栏 super-only 入口 → Task 3 Step 6 ✓
- AdminView 表格/建/编辑/删除 → Task 4 ✓
- UI 建号恒 isSuper=false → Task 1 create_account（不暴露 is_super 参数）+ Task 2 create 不传 → ✓
- UI 不改/删超管 → Task 1 update/delete 拒超管 + Task 2 测试 ✓
- 不自删 → Task 2 handle_admin_account_delete ✓
- 输入护栏 → Task 1 `_validate_*` ✓
- 测试覆盖（后端纯/集成、前端 lib/guard/sidebar/view）→ 各 Task ✓

**2. Placeholder scan:** 无 TBD/TODO；每个代码步含完整代码。集成测试夹具引用"参照 test_server_auth.py"是对既有真实文件的指引（实现者须读该文件取起服务写法），非占位——但实现者须据实落实，已在注记说明。

**3. Type consistency:** `AdminAccount` 字段（account/displayName/isSuper/allowedPages/allowedL4）与后端 `public_user` 输出一致；`add_account/edit_account` 返回 public_user（无 hash）；`PAGE_OPTIONS` 项 `{key,label}` 与 AdminView `el-option :value="o.key"` 一致；`createAccount` 参数与 server `handle_admin_account_create` 读取的 body 键（account/password/displayName/allowedPages/allowedL4）一致；`updateAccount` 可选键与 `edit_account` kwargs 一致。

**4. 跨任务接口:** Task 2 依赖 Task 1 的 add/edit/remove/list_public_accounts（签名已在 Task 1 Produces 固定）；Task 4 依赖 Task 3 的 lib/admin + PAGE_OPTIONS + `/admin` 路由（Task 3 占位 AdminView 保证 Task 3 可独立 typecheck/build，Task 4 替换之）。顺序 1→2→3→4 满足依赖。
