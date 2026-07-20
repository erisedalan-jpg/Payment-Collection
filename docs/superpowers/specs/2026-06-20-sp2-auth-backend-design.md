# SP-2 后端鉴权 + 账号/权限模型 设计（权限控制功能 第 2 子项目）

> 把登录从 SP-1 的前端桩接上**真实后端校验**：账号存储(哈希)、会话(cookie)、登录/登出/取当前用户三接口、权限数据模型；前端 `lib/auth` 接真请求 + auth 状态 store + 登录成功落地 App + 头部显示当前用户与登出。
> **本子项目只让登录"能用"——不强制(无路由守卫，SP-3)、不按 L4 切数据(SP-4)、不做超管建号界面(SP-5)。** 权限字段在本期建模并存储、随登录下发给前端 store，供 SP-3/4/5 消费。

## 0. 背景与边界

父功能=权限控制(登录+页面门禁+L4数据隔离)，5 子项目，威胁模型已定=折中：登录/页面门禁前端守卫+后端 token 校验；L4 数据后端切。SP-1 登录页 UI 已合入 master(含 `lib/auth.ts` 桩 `authenticate()` 为本期替换点、`AppLayout` 全屏分支、`mood` 模型)。

后端事实(已勘察)：`server.py` 的 `CustomHandler(SimpleHTTPRequestHandler)`，**`ThreadingHTTPServer`(并发，需锁)**；`do_GET/do_POST` 扁平 if/elif 按 `parsed.path` 分发；POST 读体 `json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))).decode('utf-8'))`；JSON 响应 `self._json_response(data)`(200+CORS)；错误 `_error_payload(code,msg)` + `ERR_*` 常量；**无任何 cookie 处理**(从零加)；数据路径 `os.path.join(BASE_DIR,'data',X)`，`BASE_DIR` 已处理 frozen/dev；首次种子放 `main()` 内 `create_server()` 前(仿 `_create_desktop_shortcut()`)；测试在 `tests/`，Pattern A=`monkeypatch` 模块级路径常量后测纯函数；`hashlib.pbkdf2_hmac`/`secrets`/`hmac` 均 stdlib 可用。

## 1. 范围与非目标

**范围**：
- 新建 `auth.py`：账号存储(哈希/校验)、会话(内存+锁)、cookie 解析、首次种子。
- `server.py`：`POST /api/login`、`POST /api/logout`、`GET /api/auth/me` 三接口 + `main()` 种子调用。
- `data/accounts.json`：账号库(首次种子 2 个超管，密码 PBKDF2 哈希)。
- 前端：`lib/auth.ts` `authenticate()` 接真 `POST /api/login`；新 `stores/auth.ts`(当前用户+login/logout/fetchMe)；`LoginView` 成功→存用户+跳 `/`；`AppHeader` 显示当前账号 + 登出按钮。

**非目标(留后续 SP)**：
- 不加"未登录重定向 /login"路由守卫、不强制任何页面/接口鉴权(SP-3)。本期 `/api/login|logout|me` 以外的既有接口与 `/data` **不**校验 token——App 仍可不登录访问(SP-3 再收口)。
- 不按 `allowedL4` 切 `/data` 数据(SP-4)。
- 不做超管建号/调权界面(SP-5)；本期只种子 2 个超管，**不臆造第 3 个**(用户说设 3 个但只给 2 个明文：admin/wxtnb、wangxutong/niubi)——系统按"N 个超管可配置"设计，第 3 个留用户经 SP-5 界面或手工配置补。
- 不做改密功能(下级管理员无改密；超管改密留 SP-5 或手工)。

## 2. 全局约束（写入 plan Global Constraints）

- 后端纯 Python 标准库(无新依赖)；改任何"路径/调用脚本"逻辑须同时维护 frozen 与 dev 两分支(本期数据路径用既有 `BASE_DIR`，无需新增分支)。
- 并发安全：`ThreadingHTTPServer` 下会话字典与账号文件写入须加 `threading.Lock`。
- 密码：PBKDF2-HMAC-SHA256 + 每用户随机盐(`secrets.token_hex(16)`)、迭代 200000；校验用 `hmac.compare_digest`；**明文密码不落盘、不日志**。
- 会话 token=`secrets.token_hex(32)`；cookie `pmp_session`，属性 `HttpOnly; SameSite=Lax; Path=/`(本地 http，不加 Secure)。
- 前端不使用 emoji；样式只引用 theme.css 令牌；逐文件 `git add`；commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不改 `frontend/src/version.ts`(整套权限功能完成后统一定版)。
- `data/accounts.json` 是本地敏感数据：**gitignored、永不提交**(加入 .gitignore)。

## 3. 架构

```
登录页(SP-1) ── lib/auth.authenticate() ── POST /api/login {account,password}
                                              │  server.handle_login → auth.verify_password
                                              │     成功: auth.create_session→Set-Cookie pmp_session
                                              ▼     返回 {success, user:{account,displayName,isSuper,allowedPages,allowedL4}}
                                   stores/auth (当前用户) ── LoginView 成功→router.push('/')
                                              ▲
App 加载 ── stores/auth.fetchMe() ── GET /api/auth/me (带 cookie) ── auth.validate_session → 同 user 或 401
AppHeader ── 显示 account/displayName + 登出 ── POST /api/logout → auth.destroy_session + 清 cookie
```

后端会话为**内存字典**(`{token: {account, expiry}}` + Lock)：服务重启=需重登录(单机离线工具可接受，记入边界)。

## 4. 数据模型

`data/accounts.json`：

```json
{
  "version": 1,
  "users": {
    "admin": {
      "salt": "<hex16>", "hash": "<hex>",
      "isSuper": true, "allowedPages": ["*"], "allowedL4": ["*"],
      "displayName": "超级管理员"
    },
    "wangxutong": {
      "salt": "<hex16>", "hash": "<hex>",
      "isSuper": true, "allowedPages": ["*"], "allowedL4": ["*"],
      "displayName": "wangxutong"
    }
  }
}
```

权限字段语义(本期仅建模/存储/下发，**不强制**)：
- `isSuper: bool` — 全功能权(含账号管理)；为真时 `allowedPages`/`allowedL4` 视同 `["*"]`。
- `allowedPages: string[]` — 可访问页 key 列表，`["*"]`=全部(页 key 体系在 SP-3 定义并强制)。
- `allowedL4: string[]` — 可见 orgL4 列表，`["*"]`=全部(SP-4 强制切数据)。
- `displayName: string` — 展示名。

下发给前端的 `user`(登录/me 返回)：`{ account, displayName, isSuper, allowedPages, allowedL4 }`(**不含 salt/hash**)。

## 5. auth.py API（纯函数 + 会话；可 monkeypatch 测）

模块级：`ACCOUNTS_FILE = os.path.join(BASE_DIR, 'data', 'accounts.json')`（`BASE_DIR` 由 server 传入或在 auth 内复算同一 frozen/dev 逻辑——见下）。为可测，auth.py 自带 `BASE_DIR` 计算(复用 server 同款 `getattr(sys,'frozen',False)` 逻辑)，并暴露 `ACCOUNTS_FILE` 供 monkeypatch。

纯函数与会话：
```python
PBKDF2_ITERS = 200_000
SESSION_TTL_SECONDS = 12 * 3600
COOKIE_NAME = 'pmp_session'

def hash_password(password: str, salt: str) -> str          # pbkdf2_hmac sha256 → hex
def verify_password(password: str, salt: str, expected_hash: str) -> bool   # hmac.compare_digest
def load_accounts() -> dict                                  # 读 ACCOUNTS_FILE,缺/坏→{"version":1,"users":{}}
def save_accounts(data: dict) -> None                        # makedirs + 原子写(tmp+os.replace),加锁
def seed_default_accounts() -> bool                          # 文件不存在才种子 2 超管(admin/wxtnb、wangxutong/niubi),返回是否种子
def public_user(account: str, rec: dict) -> dict             # 去 salt/hash,组装下发 user
def authenticate(account: str, password: str) -> dict | None # 校验成功返回 public_user,否则 None
def create_session(account: str) -> str                      # 生成 token,存 {account,expiry=now+TTL},返回 token(加锁)
def validate_session(token: str) -> str | None               # 有效且未过期→account,否则 None(过期顺手清,加锁)
def destroy_session(token: str) -> None                      # 删 token(加锁)
def parse_cookie_token(cookie_header: str | None) -> str | None  # 从 Cookie 头取 pmp_session 值(用 http.cookies.SimpleCookie)
def build_set_cookie(token: str) -> str                      # "pmp_session=<t>; HttpOnly; SameSite=Lax; Path=/"
def build_clear_cookie() -> str                              # "pmp_session=; Max-Age=0; Path=/"
```
种子：用 `secrets.token_hex(16)` 生成盐、`hash_password` 哈希两个明文密码后写盘。明文只在种子那一刻内存出现，不落盘不日志。

时间用 `time.time()`(epoch 秒)算 expiry，避免时区问题。会话字典 + Lock 为模块级全局。

## 6. 接口（server.py 加 handler）

**POST /api/login**  请求 `{account, password}`：
- 解析体失败 → 400 `_error_payload(ERR_PARSE, ...)`。
- `auth.authenticate(account,password)`：
  - None → **401**，体 `_error_payload("auth_failed","账号或密码错误")`(`success:false`)。
  - 命中 user → `token=auth.create_session(account)`；响应 200，头加 `Set-Cookie: auth.build_set_cookie(token)`；体 `{success:true, user:<public_user>}`。
- 新增错误常量 `ERR_AUTH = "auth_failed"`。

**POST /api/logout**：读 `Cookie` 头→`parse_cookie_token`→`destroy_session`；响应 200 + `Set-Cookie: build_clear_cookie()`；体 `{success:true}`。无 token 也返回 success(幂等)。

**GET /api/auth/me**：读 `Cookie`→token→`validate_session`→account：
- 有效 → 取 `load_accounts()` 中该账号 → 200 `{success:true, user:<public_user>}`。
- 无/失效 → **401** `_error_payload(ERR_AUTH,"未登录")`(`success:false`)。

三接口均在 `do_GET`(me) / `do_POST`(login/logout) 的 if/elif 链注册。响应须带既有 `Access-Control-Allow-Origin: *`(同 `_json_response`)；含 `Set-Cookie` 的响应不能用 `_json_response`(它不发 Set-Cookie)，故 login/logout 用内联 send_response+send_header(含 Set-Cookie)+write 模式(仿既有非 200 内联写法，但状态 200)。

`main()` 内 `create_server()` 前加 `auth.seed_default_accounts()`(仿 `_create_desktop_shortcut()` 位置)。

## 7. 前端

**`lib/auth.ts`** 替换桩为真请求(保留 `AuthResult` 接口 + 扩 `user`)：
```ts
export interface AuthUser { account: string; displayName: string; isSuper: boolean; allowedPages: string[]; allowedL4: string[] }
export interface AuthResult { ok: boolean; message?: string; user?: AuthUser }
export async function authenticate(account: string, password: string): Promise<AuthResult> {
  const res = await fetch('/api/login', { method:'POST', credentials:'same-origin',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify({account,password}) })
  const data = await res.json().catch(() => ({}))
  return res.ok && data.success ? { ok:true, user:data.user } : { ok:false, message:data.message || '登录失败' }
}
export async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', { credentials:'same-origin' })
  if (!res.ok) return null
  const data = await res.json().catch(() => ({}))
  return data.success ? data.user as AuthUser : null
}
export async function logoutApi(): Promise<void> {
  await fetch('/api/logout', { method:'POST', credentials:'same-origin' }).catch(() => {})
}
```

**`stores/auth.ts`**(Pinia)：`user = ref<AuthUser|null>(null)`；`login(account,password)`(调 authenticate，成功 set user 返回 AuthResult)；`logout()`(调 logoutApi + 清 user)；`fetchMe()`(调 fetchMe set user)；getter `isLoggedIn`、`isSuper`。

**`LoginView.vue`**：`onSubmit` 改用 `authStore.login()`：成功 → `router.push('/')`(落地首页)；失败 → mood='fail' + message(沿用)。引入 `useRouter` + `useAuthStore`。

**App 启动恢复会话**：`AppLayout.vue`(或 App.vue)`onMounted` 调 `authStore.fetchMe()`(静默，失败不跳转——SP-2 无守卫)。

**`AppHeader.vue`**：显示 `authStore.user?.displayName ?? authStore.user?.account`(登录后)与"登出"按钮→`authStore.logout()` 后 `router.push('/login')`；未登录则不显示这块(SP-2 允许未登录用 App)。样式走 theme 令牌。

## 8. 安全要点

- 密码 PBKDF2-HMAC-SHA256 + 随机盐 + 200000 迭代；`hmac.compare_digest` 防时序；明文不落盘/不日志。
- token `secrets.token_hex(32)`(256-bit)；cookie `HttpOnly`(JS 不可读)+`SameSite=Lax`；会话 12h 过期。
- `public_user` 严格剔除 salt/hash，下发体绝不含哈希材料。
- `data/accounts.json` gitignored 永不提交。
- 并发：会话字典 + 文件写各自 Lock。
- 仅种子 2 超管；不臆造第 3 个凭据。

## 9. 测试

后端 `tests/test_auth.py`(Pattern A，`monkeypatch.setattr(auth,'ACCOUNTS_FILE',str(tmp))`)：
- `hash_password` 同盐同密一致、异盐不同；`verify_password` 正确/错误密码。
- `seed_default_accounts`：空目录→建文件、含 admin/wangxutong、isSuper、密码可被 `authenticate` 校验通过(用已知明文 wxtnb/niubi)、salt/hash 存在且非明文；文件已存在→不覆盖(返回 False)。
- `authenticate`：对/错密码、不存在账号→None；返回的 public_user 无 salt/hash。
- 会话：`create_session`→`validate_session` 返回 account；`destroy_session` 后失效；过期(monkeypatch time 或构造 expiry 过去)→失效。
- `parse_cookie_token`：从 `"a=1; pmp_session=abc; b=2"` 取 abc；无则 None。
- (可选)`tests/test_server_auth.py` 走 `create_server(port=0)` + 真 HTTP 打 /api/login→Set-Cookie→/api/auth/me 带 cookie→200，错误密码→401。

前端：
- `lib/auth.test.ts` 重写(mock fetch)：authenticate 成功/失败映射、fetchMe、logoutApi。
- `stores/auth.test.ts`：login set user、logout 清 user、fetchMe。
- `LoginView.test.ts` 更新：成功提交 → router.push('/') 被调(mock authStore.login 返回 ok)；失败 → mood='fail'+message。
- `AppHeader.test.ts`：登录态显示 displayName + 登出按钮触发 store.logout。

`bash verify.sh` 全绿(ruff + pytest + 前端 typecheck/vitest/build)。

## 10. 对后续 SP 的接口预留

- `stores/auth`(user 含 isSuper/allowedPages/allowedL4)是 SP-3 路由守卫(按 allowedPages、未登录跳 /login)与 SP-4(allowedL4)的数据源。
- 后端会话/`validate_session` 是 SP-3 给 `/api`·`/data` 加 token 校验的挂点。
- `auth.load_accounts/save_accounts` + 权限字段是 SP-5 超管建号/调权的底座。
- 第 3 个超管、改密：SP-5 界面或手工补。
