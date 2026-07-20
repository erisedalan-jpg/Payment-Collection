# SP-2 后端鉴权 + 账号/权限模型 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把登录接上真实后端校验：账号哈希存储 + 内存会话(cookie) + login/logout/me 三接口 + 前端 auth store + 登录落地 App + 头部登出。

**Architecture:** 后端 `auth.py`(PBKDF2 哈希、内存会话+锁、cookie 助手、首次种子 2 超管) + `server.py` 三接口；前端 `lib/auth.ts` 接真 fetch、`stores/auth.ts` 持有当前用户、`LoginView` 成功跳 `/`、`main.ts` 启动恢复会话、`AppHeader` 显示用户+登出。**不加守卫/不切数据/不做超管界面**(后续 SP)。

**Tech Stack:** Python 3.8+ 标准库(hashlib/secrets/hmac/http.cookies/threading) + pytest；Vue3+TS+Pinia+Vitest。

## Global Constraints

- 后端纯标准库，无新依赖；并发(ThreadingHTTPServer)下会话字典与账号文件写入各加 `threading.Lock`。
- 密码 PBKDF2-HMAC-SHA256 + 每用户随机盐(`secrets.token_hex(16)`) + 200000 迭代；校验用 `hmac.compare_digest`；**明文密码不落盘、不日志**。
- 会话 token=`secrets.token_hex(32)`；cookie `pmp_session`，属性 `HttpOnly; SameSite=Lax; Path=/`(本地 http 不加 Secure)；会话 12h 过期。
- 仅种子 2 个超管(admin/wxtnb、wangxutong/niubi)，**不臆造第 3 个**；系统按 N 超管可配置。
- `data/accounts.json` gitignored，**永不提交**。
- `public_user` 下发体严格剔除 salt/hash。
- 前端不使用 emoji；样式只引用 theme.css 令牌；逐文件 `git add`；commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不改 `frontend/src/version.ts`。
- SP-2 不加路由守卫、不强制 /api·/data 鉴权、不按 L4 切数据。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `auth.py` | 建 | 哈希/校验/账号存储/种子/会话/cookie(Task 1) |
| `tests/test_auth.py` | 建 | auth 纯函数 + 会话(Task 1) |
| `server.py` | 改 | login/logout/me 三 handler + 注册 + main 种子 + `_send_json`(Task 2) |
| `.gitignore` | 改 | + `data/accounts.json`(Task 2) |
| `tests/test_server_auth.py` | 建 | 真 HTTP login→cookie→me→logout(Task 2) |
| `frontend/src/lib/auth.ts` | 改 | authenticate/fetchMe/logoutApi 接真请求 + AuthUser(Task 3) |
| `frontend/src/lib/auth.test.ts` | 改 | mock fetch 测三函数(Task 3) |
| `frontend/src/stores/auth.ts` | 建 | 当前用户 + login/logout/fetchMe(Task 4) |
| `frontend/src/stores/auth.test.ts` | 建 | store 行为(Task 4) |
| `frontend/src/views/LoginView.vue` | 改 | onSubmit→authStore.login+成功跳 /(Task 5) |
| `frontend/src/main.ts` | 改 | 启动 authStore.fetchMe()(Task 5) |
| `frontend/src/views/LoginView.test.ts` | 改 | 接 store/router(Task 5) |
| `frontend/src/layout/AppHeader.vue` | 改 | 当前用户 + 登出(Task 6) |
| `frontend/src/layout/AppHeader.test.ts` | 改 | 登录态显示 + 登出(Task 6) |

---

### Task 1: auth.py + tests/test_auth.py

**Files:**
- Create: `auth.py`、`tests/test_auth.py`

**Interfaces:**
- Produces: `hash_password(pw,salt)->str`、`verify_password(pw,salt,h)->bool`、`load_accounts()->dict`、`save_accounts(dict)`、`seed_default_accounts()->bool`、`public_user(account,rec)->dict`、`authenticate(account,pw)->dict|None`、`create_session(account)->str`、`validate_session(token)->str|None`、`destroy_session(token)`、`parse_cookie_token(header)->str|None`、`build_set_cookie(token)->str`、`build_clear_cookie()->str`；模块级可 monkeypatch 的 `ACCOUNTS_FILE`、`_sessions`。

- [ ] **Step 1: 写失败测试** —— Create `tests/test_auth.py`

```python
import json
import os
import time
import auth


def _fresh(tmp_path, monkeypatch):
    f = tmp_path / "accounts.json"
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(f))
    auth._sessions.clear()
    return f


def test_hash_verify(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    h = auth.hash_password("pw", "salt1")
    assert auth.hash_password("pw", "salt1") == h
    assert auth.hash_password("pw", "salt2") != h
    assert auth.verify_password("pw", "salt1", h) is True
    assert auth.verify_password("bad", "salt1", h) is False


def test_seed_then_authenticate(tmp_path, monkeypatch):
    f = _fresh(tmp_path, monkeypatch)
    assert auth.seed_default_accounts() is True
    assert os.path.exists(str(f))
    data = json.loads(f.read_text(encoding="utf-8"))
    assert "admin" in data["users"] and "wangxutong" in data["users"]
    assert data["users"]["admin"]["isSuper"] is True
    raw = f.read_text(encoding="utf-8")
    assert "wxtnb" not in raw and "niubi" not in raw      # 明文不落盘
    u = auth.authenticate("admin", "wxtnb")
    assert u is not None and u["account"] == "admin" and u["isSuper"] is True
    assert "salt" not in u and "hash" not in u            # public_user 无哈希材料
    assert auth.authenticate("admin", "wrong") is None
    assert auth.authenticate("nobody", "x") is None
    assert auth.seed_default_accounts() is False           # 已存在不覆盖


def test_sessions(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    t = auth.create_session("admin")
    assert auth.validate_session(t) == "admin"
    assert auth.validate_session("bad") is None
    assert auth.validate_session(None) is None
    auth.destroy_session(t)
    assert auth.validate_session(t) is None


def test_session_expiry(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    t = auth.create_session("admin")
    auth._sessions[t]["expiry"] = time.time() - 1
    assert auth.validate_session(t) is None


def test_cookie_helpers(tmp_path, monkeypatch):
    _fresh(tmp_path, monkeypatch)
    assert auth.parse_cookie_token("a=1; pmp_session=abc123; b=2") == "abc123"
    assert auth.parse_cookie_token("a=1; b=2") is None
    assert auth.parse_cookie_token(None) is None
    assert auth.parse_cookie_token("") is None
    assert "HttpOnly" in auth.build_set_cookie("xyz")
    assert "pmp_session=xyz" in auth.build_set_cookie("xyz")
    assert "Max-Age=0" in auth.build_clear_cookie()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_auth.py -q`
Expected: FAIL（`No module named 'auth'`）

- [ ] **Step 3: 实现** —— Create `auth.py`

```python
"""本地账号鉴权:PBKDF2 密码哈希 + 内存会话 + cookie 助手。纯标准库(SP-2)。
data/accounts.json 为本地敏感数据(gitignored);明文密码不落盘、不日志。"""
from __future__ import annotations

import os
import sys
import json
import time
import hmac
import hashlib
import secrets
import threading
from http.cookies import SimpleCookie

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

ACCOUNTS_FILE = os.path.join(BASE_DIR, 'data', 'accounts.json')

PBKDF2_ITERS = 200_000
SESSION_TTL_SECONDS = 12 * 3600
COOKIE_NAME = 'pmp_session'

# 首次种子的超级管理员(用户提供 2 个明文;不臆造第 3 个,留 SP-5/手工补)
_SEED_SUPERS = [
    ('admin', 'wxtnb', '超级管理员'),
    ('wangxutong', 'niubi', 'wangxutong'),
]

_file_lock = threading.Lock()
_sessions: dict = {}            # token -> {'account': str, 'expiry': float}
_sessions_lock = threading.Lock()


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), PBKDF2_ITERS).hex()


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password, salt), expected_hash)


def load_accounts() -> dict:
    if os.path.exists(ACCOUNTS_FILE):
        try:
            with open(ACCOUNTS_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, dict) and isinstance(data.get('users'), dict):
                return data
        except Exception:
            pass
    return {'version': 1, 'users': {}}


def save_accounts(data: dict) -> None:
    with _file_lock:
        os.makedirs(os.path.dirname(ACCOUNTS_FILE), exist_ok=True)
        tmp = ACCOUNTS_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(tmp, ACCOUNTS_FILE)


def _make_user(password: str, display_name: str, is_super: bool = True,
               pages: list | None = None, l4: list | None = None) -> dict:
    salt = secrets.token_hex(16)
    return {
        'salt': salt,
        'hash': hash_password(password, salt),
        'isSuper': is_super,
        'allowedPages': pages if pages is not None else ['*'],
        'allowedL4': l4 if l4 is not None else ['*'],
        'displayName': display_name,
    }


def seed_default_accounts() -> bool:
    """文件不存在才种子 2 个超管;已存在不动,返回 False。"""
    if os.path.exists(ACCOUNTS_FILE):
        return False
    data: dict = {'version': 1, 'users': {}}
    for account, pw, name in _SEED_SUPERS:
        data['users'][account] = _make_user(pw, name, is_super=True)
    save_accounts(data)
    return True


def public_user(account: str, rec: dict) -> dict:
    return {
        'account': account,
        'displayName': rec.get('displayName', account),
        'isSuper': bool(rec.get('isSuper', False)),
        'allowedPages': rec.get('allowedPages', []),
        'allowedL4': rec.get('allowedL4', []),
    }


def authenticate(account: str, password: str) -> dict | None:
    rec = load_accounts().get('users', {}).get(account)
    if not rec:
        return None
    if not verify_password(password, rec.get('salt', ''), rec.get('hash', '')):
        return None
    return public_user(account, rec)


def create_session(account: str) -> str:
    token = secrets.token_hex(32)
    with _sessions_lock:
        _sessions[token] = {'account': account, 'expiry': time.time() + SESSION_TTL_SECONDS}
    return token


def validate_session(token: str | None) -> str | None:
    if not token:
        return None
    with _sessions_lock:
        sess = _sessions.get(token)
        if not sess:
            return None
        if sess['expiry'] < time.time():
            _sessions.pop(token, None)
            return None
        return sess['account']


def destroy_session(token: str | None) -> None:
    if not token:
        return
    with _sessions_lock:
        _sessions.pop(token, None)


def parse_cookie_token(cookie_header: str | None) -> str | None:
    if not cookie_header:
        return None
    try:
        c = SimpleCookie()
        c.load(cookie_header)
        morsel = c.get(COOKIE_NAME)
        return morsel.value if morsel else None
    except Exception:
        return None


def build_set_cookie(token: str) -> str:
    return f'{COOKIE_NAME}={token}; HttpOnly; SameSite=Lax; Path=/'


def build_clear_cookie() -> str:
    return f'{COOKIE_NAME}=; Max-Age=0; SameSite=Lax; Path=/'
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_auth.py -q`
Expected: PASS（5 通过）

- [ ] **Step 5: ruff + 提交**

Run: `ruff check auth.py tests/test_auth.py`
Expected: 无错误

```bash
git add auth.py tests/test_auth.py
git commit -m "$(printf 'feat(auth): auth.py 账号哈希存储+内存会话+cookie+种子2超管(SP-2)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: server.py 三接口 + 种子 + .gitignore + 集成测试

**Files:**
- Modify: `server.py`(import auth、ERR_AUTH、`_send_json`、handle_login/logout/auth_me、do_GET/do_POST 注册、main 种子)、`.gitignore`
- Create: `tests/test_server_auth.py`

**Interfaces:**
- Consumes: `auth.authenticate/create_session/destroy_session/validate_session/parse_cookie_token/build_set_cookie/build_clear_cookie/load_accounts/public_user/seed_default_accounts`(Task 1)。
- Produces: `POST /api/login`、`POST /api/logout`、`GET /api/auth/me`。

- [ ] **Step 1: 写失败测试** —— Create `tests/test_server_auth.py`

```python
import json
import http.client
import threading
import auth
import server


def test_login_me_logout_flow(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port)
        conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "wxtnb"}),
                     {"Content-Type": "application/json"})
        r = conn.getresponse()
        assert r.status == 200
        set_cookie = r.getheader("Set-Cookie")
        assert set_cookie and "pmp_session=" in set_cookie
        cookie = set_cookie.split(";")[0]
        body = json.loads(r.read())
        assert body["success"] is True and body["user"]["account"] == "admin"
        assert "hash" not in body["user"]

        conn.request("GET", "/api/auth/me", headers={"Cookie": cookie})
        r2 = conn.getresponse()
        assert r2.status == 200
        assert json.loads(r2.read())["user"]["isSuper"] is True

        conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "bad"}),
                     {"Content-Type": "application/json"})
        r3 = conn.getresponse()
        assert r3.status == 401
        r3.read()

        conn.request("GET", "/api/auth/me")
        r4 = conn.getresponse()
        assert r4.status == 401
        r4.read()

        conn.request("POST", "/api/logout", headers={"Cookie": cookie})
        r5 = conn.getresponse()
        assert r5.status == 200
        assert "Max-Age=0" in (r5.getheader("Set-Cookie") or "")
        r5.read()
    finally:
        srv.shutdown()
        srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_auth.py -q`
Expected: FAIL（/api/login 走 404，断言 200 失败）

- [ ] **Step 3: 实现** —— 改 `server.py`

顶部 import 区加（与既有 import 同处）：

```python
import auth
```

在 `ERR_*` 常量区（约 server.py:154-167）加一行：

```python
ERR_AUTH = "auth_failed"
```

在 `CustomHandler` 类内（`_json_response` 附近）加发送助手 + 三 handler：

```python
    def _send_json(self, status, payload, extra_headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        for k, v in (extra_headers or []):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def handle_login(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(n).decode('utf-8'))
        except Exception:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        account = (data.get('account') or '').strip()
        password = data.get('password') or ''
        user = auth.authenticate(account, password)
        if not user:
            self._send_json(401, _error_payload(ERR_AUTH, "账号或密码错误"))
            return
        token = auth.create_session(account)
        self._send_json(200, {"success": True, "user": user},
                        [('Set-Cookie', auth.build_set_cookie(token))])

    def handle_logout(self):
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        auth.destroy_session(token)
        self._send_json(200, {"success": True},
                        [('Set-Cookie', auth.build_clear_cookie())])

    def handle_auth_me(self):
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        account = auth.validate_session(token)
        rec = auth.load_accounts().get('users', {}).get(account) if account else None
        if not account or not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录"))
            return
        self._send_json(200, {"success": True, "user": auth.public_user(account, rec)})
```

在 `do_GET` 的 if/elif 链加（任一 elif 之间）：

```python
        elif parsed.path == '/api/auth/me':
            self.handle_auth_me()
```

在 `do_POST` 的 if/elif 链加：

```python
        elif parsed.path == '/api/login':
            self.handle_login()
        elif parsed.path == '/api/logout':
            self.handle_logout()
```

在 `main()` 内、`create_server()` 之前（仿 `_create_desktop_shortcut()` 位置）加：

```python
    auth.seed_default_accounts()
```

- [ ] **Step 4: 改 .gitignore** —— 在"运行时用户数据"区（`data/project_tags.json` 行附近）加：

```
# 本地账号库(含密码哈希,敏感,运行时生成,SP-2)
data/accounts.json
```

- [ ] **Step 5: 跑测试确认通过**

Run: `python -m pytest tests/test_server_auth.py -q`
Expected: PASS

- [ ] **Step 6: ruff + 提交**

Run: `ruff check server.py tests/test_server_auth.py`
Expected: 无错误

```bash
git add server.py tests/test_server_auth.py .gitignore
git commit -m "$(printf 'feat(auth): server /api/login /api/logout /api/auth/me + cookie + main 种子;accounts.json 入 gitignore\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: 前端 lib/auth.ts 接真请求

**Files:**
- Modify: `frontend/src/lib/auth.ts`、`frontend/src/lib/auth.test.ts`

**Interfaces:**
- Produces: `AuthUser{account,displayName,isSuper,allowedPages,allowedL4}`、`AuthResult{ok,message?,user?}`、`authenticate(account,password)->Promise<AuthResult>`、`fetchMe()->Promise<AuthUser|null>`、`logoutApi()->Promise<void>`。

- [ ] **Step 1: 写失败测试** —— 全量替换 `frontend/src/lib/auth.test.ts`

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { authenticate, fetchMe, logoutApi } from './auth'

afterEach(() => vi.unstubAllGlobals())

const U = { account: 'admin', displayName: '超级管理员', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }

describe('lib/auth', () => {
  it('authenticate 成功映射 user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, user: U }) }))
    const r = await authenticate('admin', 'wxtnb')
    expect(r.ok).toBe(true)
    expect(r.user?.account).toBe('admin')
  })
  it('authenticate 失败映射 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ success: false, message: '账号或密码错误' }) }))
    const r = await authenticate('admin', 'bad')
    expect(r.ok).toBe(false)
    expect(r.message).toBe('账号或密码错误')
  })
  it('fetchMe 返回 user / null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, user: U }) }))
    expect((await fetchMe())?.account).toBe('admin')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    expect(await fetchMe()).toBeNull()
  })
  it('fetchMe 网络异常→null(不抛)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    expect(await fetchMe()).toBeNull()
  })
  it('logoutApi 调 POST /api/logout', async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', f)
    await logoutApi()
    expect(f).toHaveBeenCalledWith('/api/logout', expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/auth.test.ts`
Expected: FAIL（旧桩无 fetch/fetchMe/logoutApi）

- [ ] **Step 3: 实现** —— 全量替换 `frontend/src/lib/auth.ts`

```ts
export interface AuthUser {
  account: string
  displayName: string
  isSuper: boolean
  allowedPages: string[]
  allowedL4: string[]
}

export interface AuthResult {
  ok: boolean
  message?: string
  user?: AuthUser
}

/** 登录:POST /api/login。成功带回 user(含权限集);失败带 message。 */
export async function authenticate(account: string, password: string): Promise<AuthResult> {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) return { ok: true, user: data.user as AuthUser }
    return { ok: false, message: data.message || '登录失败' }
  } catch {
    return { ok: false, message: '网络错误,无法连接服务' }
  }
}

/** 取当前登录用户(GET /api/auth/me,带 cookie);未登录或异常→null。 */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
    if (!res.ok) return null
    const data = await res.json().catch(() => ({}))
    return data.success ? (data.user as AuthUser) : null
  } catch {
    return null
  }
}

/** 登出(POST /api/logout,清服务端会话与 cookie)。 */
export async function logoutApi(): Promise<void> {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
  } catch {
    // 登出失败不阻断前端清态
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/auth.test.ts`
Expected: PASS（5 通过）

- [ ] **Step 5: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/lib/auth.ts frontend/src/lib/auth.test.ts
git commit -m "$(printf 'feat(auth): 前端 lib/auth 接真请求(authenticate/fetchMe/logoutApi + AuthUser)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: 前端 stores/auth.ts

**Files:**
- Create: `frontend/src/stores/auth.ts`、`frontend/src/stores/auth.test.ts`

**Interfaces:**
- Consumes: `authenticate/fetchMe/logoutApi/AuthUser/AuthResult`(Task 3)。
- Produces: `useAuthStore()` → `{ user, isLoggedIn, isSuper, login(account,password)->Promise<AuthResult>, fetchMe()->Promise<void>, logout()->Promise<void> }`。

- [ ] **Step 1: 写失败测试** —— Create `frontend/src/stores/auth.test.ts`

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/auth', () => ({
  authenticate: vi.fn(),
  fetchMe: vi.fn(),
  logoutApi: vi.fn(async () => {}),
}))
import { authenticate, fetchMe, logoutApi } from '@/lib/auth'
import { useAuthStore } from './auth'

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.clearAllMocks())

const U = { account: 'admin', displayName: '超级管理员', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }

describe('stores/auth', () => {
  it('login 成功 set user', async () => {
    ;(authenticate as any).mockResolvedValue({ ok: true, user: U })
    const s = useAuthStore()
    const r = await s.login('admin', 'wxtnb')
    expect(r.ok).toBe(true)
    expect(s.user?.account).toBe('admin')
    expect(s.isLoggedIn).toBe(true)
    expect(s.isSuper).toBe(true)
  })
  it('login 失败不 set user', async () => {
    ;(authenticate as any).mockResolvedValue({ ok: false, message: 'x' })
    const s = useAuthStore()
    await s.login('admin', 'bad')
    expect(s.user).toBeNull()
    expect(s.isLoggedIn).toBe(false)
  })
  it('fetchMe set user', async () => {
    ;(fetchMe as any).mockResolvedValue(U)
    const s = useAuthStore()
    await s.fetchMe()
    expect(s.user?.account).toBe('admin')
  })
  it('logout 调 api 并清 user', async () => {
    ;(fetchMe as any).mockResolvedValue(U)
    const s = useAuthStore()
    await s.fetchMe()
    await s.logout()
    expect(logoutApi).toHaveBeenCalled()
    expect(s.user).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/auth.test.ts`
Expected: FAIL（store 不存在）

- [ ] **Step 3: 实现** —— Create `frontend/src/stores/auth.ts`

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authenticate, fetchMe as apiFetchMe, logoutApi, type AuthUser, type AuthResult } from '@/lib/auth'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const isLoggedIn = computed(() => user.value !== null)
  const isSuper = computed(() => user.value?.isSuper === true)

  async function login(account: string, password: string): Promise<AuthResult> {
    const res = await authenticate(account, password)
    if (res.ok && res.user) user.value = res.user
    return res
  }
  async function fetchMe(): Promise<void> {
    user.value = await apiFetchMe()
  }
  async function logout(): Promise<void> {
    await logoutApi()
    user.value = null
  }
  return { user, isLoggedIn, isSuper, login, fetchMe, logout }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/stores/auth.test.ts`
Expected: PASS（4 通过）

- [ ] **Step 5: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/stores/auth.ts frontend/src/stores/auth.test.ts
git commit -m "$(printf 'feat(auth): stores/auth(当前用户 + login/fetchMe/logout + isLoggedIn/isSuper)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: LoginView 接 store + 成功跳转 + 启动恢复会话

**Files:**
- Modify: `frontend/src/views/LoginView.vue`、`frontend/src/main.ts`、`frontend/src/views/LoginView.test.ts`

**Interfaces:**
- Consumes: `useAuthStore`(Task 4，`login`)。
- Produces: 无。

- [ ] **Step 1: 写失败测试** —— 全量替换 `frontend/src/views/LoginView.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import LoginView from './LoginView.vue'
import LoginCharacters from '@/components/LoginCharacters.vue'

const pushSpy = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

const authMock = vi.fn(async (_account: string, _password: string) => ({ ok: false, message: '账号或密码错误' }))
vi.mock('@/lib/auth', () => ({ authenticate: (a: string, b: string) => authMock(a, b) }))

beforeEach(() => { setActivePinia(createPinia()); pushSpy.mockClear(); authMock.mockClear() })

function mountLV() {
  return mount(LoginView, { global: { stubs: { LoginCharacters: false } } })
}

describe('LoginView', () => {
  it('渲染角色 + 账号/密码输入 + 登录按钮', () => {
    const w = mountLV()
    expect(w.findComponent(LoginCharacters).exists()).toBe(true)
    expect(w.find('input[autocomplete="username"]').exists()).toBe(true)
    expect(w.find('input[autocomplete="current-password"]').exists()).toBe(true)
    expect(w.find('.lv-submit').exists()).toBe(true)
  })
  it('账号聚焦→mood=account;密码聚焦→mood=password', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="username"]').trigger('focus')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('account')
    await w.find('input[autocomplete="current-password"]').trigger('focus')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('password')
  })
  it('显示密码切换:type 变 text + mood=reveal', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="current-password"]').trigger('focus')
    await w.find('.lv-eye-btn').trigger('click')
    expect(w.find('input[autocomplete="current-password"]').attributes('type')).toBe('text')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('reveal')
  })
  it('空表单提交:不调 authenticate,显示校验提示', async () => {
    const w = mountLV()
    await w.find('form').trigger('submit')
    expect(authMock).not.toHaveBeenCalled()
    expect(w.find('[data-test="lv-error"]').text()).toContain('请输入账号和密码')
  })
  it('非空提交失败:mood=fail+显示 message,不跳转', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="username"]').setValue('admin')
    await w.find('input[autocomplete="current-password"]').setValue('bad')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick()
    expect(authMock).toHaveBeenCalledWith('admin', 'bad')
    expect(w.findComponent(LoginCharacters).props('mood')).toBe('fail')
    expect(w.find('[data-test="lv-error"]').text()).toContain('账号或密码错误')
    expect(pushSpy).not.toHaveBeenCalled()
  })
  it('非空提交成功:跳转 /', async () => {
    authMock.mockResolvedValueOnce({ ok: true, user: { account: 'admin', displayName: 'x', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] } } as any)
    const w = mountLV()
    await w.find('input[autocomplete="username"]').setValue('admin')
    await w.find('input[autocomplete="current-password"]').setValue('wxtnb')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick()
    await w.vm.$nextTick()
    expect(pushSpy).toHaveBeenCalledWith('/')
  })
  it('失败提交后重新聚焦账号→清除错误提示', async () => {
    const w = mountLV()
    await w.find('input[autocomplete="username"]').setValue('admin')
    await w.find('input[autocomplete="current-password"]').setValue('bad')
    await w.find('form').trigger('submit')
    await w.vm.$nextTick()
    expect(w.find('[data-test="lv-error"]').exists()).toBe(true)
    await w.find('input[autocomplete="username"]').trigger('focus')
    await w.vm.$nextTick()
    expect(w.find('[data-test="lv-error"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/LoginView.test.ts`
Expected: FAIL（LoginView 仍直接用 lib/auth、无 router.push）

- [ ] **Step 3: 实现** —— 改 `frontend/src/views/LoginView.vue` 的 `<script setup>`

把 `import { authenticate } from '@/lib/auth'` 替换为：

```ts
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
```

在 `const error = ref('')` 之后加：

```ts
const router = useRouter()
const auth = useAuthStore()
```

把 `onSubmit` 改为：

```ts
async function onSubmit() {
  error.value = ''
  if (!account.value || !password.value) { error.value = '请输入账号和密码'; return }
  const res = await auth.login(account.value, password.value)
  if (res.ok) { router.push('/') }
  else { mood.value = 'fail'; error.value = res.message || '登录失败' }
}
```

- [ ] **Step 4: 启动恢复会话** —— 改 `frontend/src/main.ts`

import 区加：

```ts
import { useAuthStore } from './stores/auth'
```

在 `useSettingsStore(pinia).init()` 之后、`app.mount('#app')` 之前加：

```ts
// 启动静默恢复登录态(失败不跳转,守卫是 SP-3)
useAuthStore(pinia).fetchMe()
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/LoginView.test.ts`
Expected: PASS（7 用例全绿）

- [ ] **Step 6: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/views/LoginView.vue frontend/src/main.ts frontend/src/views/LoginView.test.ts
git commit -m "$(printf 'feat(auth): LoginView 接 authStore 成功跳首页 + main 启动恢复会话\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 6: AppHeader 当前用户 + 登出

**Files:**
- Modify: `frontend/src/layout/AppHeader.vue`、`frontend/src/layout/AppHeader.test.ts`

**Interfaces:**
- Consumes: `useAuthStore`(Task 4，`user`/`logout`)。
- Produces: 无。

- [ ] **Step 1: 写失败测试** —— append 到 `frontend/src/layout/AppHeader.test.ts`（顶部加 `import { useAuthStore } from '@/stores/auth'`；`vue-router` 需 mock）

在文件顶部 import 区后加 router mock（若已存在则复用）：

```ts
const pushSpy = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))
```

append 用例：

```ts
describe('AppHeader 登录态', () => {
  it('登录后显示 displayName + 登出按钮,点击调 logout 并跳 /login', async () => {
    const a = useAuthStore()
    a.user = { account: 'admin', displayName: '超级管理员', isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }
    const logoutSpy = vi.spyOn(a, 'logout').mockResolvedValue()
    const w = mount(AppHeader)
    expect(w.text()).toContain('超级管理员')
    await w.get('[data-test="logout"]').trigger('click')
    expect(logoutSpy).toHaveBeenCalled()
  })
  it('未登录不显示登出按钮', () => {
    const w = mount(AppHeader)
    expect(w.find('[data-test="logout"]').exists()).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/layout/AppHeader.test.ts`
Expected: FAIL（无 logout 按钮 / displayName）

- [ ] **Step 3: 实现** —— 改 `frontend/src/layout/AppHeader.vue`

`<script setup>` 加：

```ts
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
async function onLogout() {
  await auth.logout()
  router.push('/login')
}
```

模板 `.meta` 内、`<DisplaySettings />` 之前加：

```html
        <template v-if="auth.user">
          <span class="user-name">{{ auth.user.displayName || auth.user.account }}</span>
          <button data-test="logout" class="logout-btn" @click="onLogout">登出</button>
        </template>
```

`<style scoped>` 加：

```css
.user-name { font-size: var(--fs-1); color: var(--sub); }
.logout-btn { padding: var(--sp-1) var(--sp-2); border: 1px solid var(--line); border-radius: var(--r-sm); background: none; color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.logout-btn:hover { color: var(--accent); border-color: var(--accent); }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/layout/AppHeader.test.ts`
Expected: PASS（含原有 2 用例 + 新 2 用例）

- [ ] **Step 5: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/layout/AppHeader.vue frontend/src/layout/AppHeader.test.ts
git commit -m "$(printf 'feat(auth): AppHeader 显示当前用户 + 登出按钮\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## 收尾验证（全部任务后）

```bash
bash verify.sh
```
Expected: 全绿（ruff + pytest 含 test_auth/test_server_auth + 前端 typecheck/vitest/build）。

手动冒烟（`python server.py` + `cd frontend && npm run dev`）：
- 首次启动后 `data/accounts.json` 生成（含 admin/wangxutong 的哈希，无明文）。
- `/login` 输入 admin/wxtnb → 跳首页；头部显示"超级管理员"+登出；点登出→回 /login。
- 错误密码 → 摇头 + "账号或密码错误"。
- 刷新页面仍保持登录（cookie + /api/auth/me 恢复）。
- 其余页面此时仍可不登录直接访问（守卫是 SP-3）。
- 第 3 个超管未种子（用户只给 2 个）——验收时提醒，可经 SP-5 或手工补。
