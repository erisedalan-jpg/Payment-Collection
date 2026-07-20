# SP-5 超管账号管理界面 设计（权限控制功能 第 5 / 最后子项目）

> 超级管理员经前端 `/admin` 页统一建号、调权（allowedPages / allowedL4 / 显示名）、重置密码、删号；后端 `/api/admin/accounts*` 端点全部 **super-only**。完成后整套权限控制（SP-1..5）交用户统一验收。

## 0. 背景与边界

威胁模型=折中（前序 SP 已落）：登录/页面门禁=前端守卫+后端会话门；L4 数据隔离=后端切 `analysis_data.json`。账号库 `data/accounts.json`（PBKDF2 哈希，gitignored）已由 SP-2 落地，种子 2 个超管（admin/wxtnb、wangxutong/niubi）。SP-3 用 `allowedPages` 控页、SP-4 用 `allowedL4` 切数据，且**每请求从 accounts.json 读最新权限**——故经本页改权后，对应账号下次请求即生效（数据侧立即生效，无需其重登）。

本期补齐"超管自助管理账号"的闭环：把此前只能手工编辑 `accounts.json` 的建号/调权，做成 super-only 的 UI + 后端端点。

## 1. 范围与非目标

**范围**：
- `auth.py` 扩账号 CRUD：纯变换函数（`create_account`/`update_account`/`delete_account`，操作 accounts dict、校验、返回新 dict）+ 带锁 IO 包装（`add_account`/`edit_account`/`remove_account`，load→变换→save 全程持账号变更锁）+ `destroy_sessions_for_account`（删号即吊销其在内存中的活动会话）。
- `server.py` 四端点（**全部 super-only**，经 `_require_super` 把关）：
  - `GET /api/admin/accounts` —— 列全部账号（**剔除 salt/hash**，复用 `public_user`）。
  - `POST /api/admin/accounts/create` —— 建号（强制 `isSuper=false`）。
  - `POST /api/admin/accounts/update` —— 改显示名/allowedPages/allowedL4/（可选）重置密码。
  - `POST /api/admin/accounts/delete` —— 删号（连带吊销其会话）。
- 前端 `/admin` 页 `AdminView.vue`（账号表 + 建号弹窗 + 编辑弹窗 + 删除确认）+ `lib/admin.ts`（4 个 API 封装）+ 路由 `meta.requiresSuper` + 守卫扩展 + 侧栏 super-only 入口 + `lib/pageAccess.ts` 导出 `PAGE_OPTIONS`（建/编辑表单的页面多选项，单一来源）。

**非目标 / YAGNI**：
- **不经 UI 提权为超管**：UI 建的账号恒 `isSuper=false`；3 个超管由 `auth.py` 种子（config）维护，不经 UI 提权（"最高=超管除账号管理外" = 普通账号可被赋 `allowedPages=['*']`+`allowedL4=['*']`，但仍非 super、仍进不了 `/admin`）。
- **UI 只管普通账号**：对 `isSuper=true` 目标的 update/delete 一律拒绝（保护种子超管不被 UI 误删/误改）。第 3 个超管：用户只给 2 个明文，留用户日后手工加 config 超管，或经本页建普通账号（验收时提醒）。
- 不做密码复杂度策略（离线内网，仅非空+长度上限）。不做账号自助改密（下级无改密，仅超管重置——SP-2 既定）。不做分页（账号数量级小）。不改 `frontend/src/version.ts` 的 X 位。

## 2. 全局约束（写入 plan Global Constraints）

- 后端纯标准库；`ThreadingHTTPServer` 并发下账号库 read-modify-write 必须串行：用模块级 `_accounts_mutate_lock = threading.Lock()` 包住 `add/edit/remove` 的"load→变换→save"全程（与既有 `_file_lock`/`_sessions_lock` 不同锁、不嵌套同锁、无死锁）。
- CRUD 纯变换函数 **不改入参 accounts dict**，返回新 dict（深拷需改动子树）；校验失败抛 `ValueError`（带中文消息），目标不存在抛 `KeyError`。
- **明文密码不落盘（仅 PBKDF2 哈希）、不日志、不出现在任何响应体**；`public_user` 已剔 salt/hash，列表/建/改响应只回 public 视图。
- 后端端点 super-only：`_require_super(self)` = 取 cookie token→`validate_session`→`load_accounts()[account]`→必须存在且 `isSuper`，否则发 403（`ERR_FORBIDDEN`）并返回 None。`/api/admin/*` 已落 `/api/` 前缀→`_auth_gate` 先要求登录，`_require_super` 再要求超管（双层）。
- 输入护栏（防脏数据/DoS）：`account` strip 后 1..64 字符且仅 `[A-Za-z0-9_.-]`；`password` 1..256；`displayName` ≤64（空则回退为 account）；`allowedPages`/`allowedL4` 为字符串数组、各 ≤100 项、每项 1..64 字符（去重；`'*'` 是合法哨兵）。后端**不**校验 pages 取值是否属合法 PageKey 集（避免与前端 PageKey 双源漂移；未知 key 在 `canAccess` 永不命中、无害）。
- 逐文件 `git add`；commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。文档（spec/plan/账本/memory）写盘不 commit。`data/accounts.json` 永不提交（已 gitignored）。
- 样式只用 `theme.css` 设计令牌，不手写散值；优先 Element Plus（el-table/el-dialog/el-select/el-button/el-input/ElMessage/ElMessageBox），无文字状态色禁实底白字。

## 3. 架构与数据流

```
超管登录(isSuper) → 侧栏"系统管理 > 账号管理"(v-if auth.isSuper) → /admin
  AdminView onMounted → GET /api/admin/accounts
      server: _require_super ✓ → load_accounts → [public_user...] → 200 列表
  建号: 弹窗填 account/password/displayName/allowedPages/allowedL4 → POST create
      server: _require_super ✓ → auth.add_account(... isSuper=false) → 200 {user}
  编辑: 弹窗(account 只读) 改 displayName/pages/l4 + 可选重置密码 → POST update
      server: _require_super ✓ → 目标须 isSuper=false → auth.edit_account → 200 {user}
  删除: 确认 → POST delete
      server: _require_super ✓ → 目标须 isSuper=false 且 ≠ 自己 → auth.remove_account(吊销会话) → 200
  每次写操作后 AdminView 重新拉列表刷新表格。
```

权限改动生效：被改账号下次请求 `/data` 即按新 `allowedL4` 切（后端每请求读最新）；其前端缓存的 `allowedPages`（导航/守卫）在它下次刷新/`fetchMe` 后更新——数据边界（后端切）立即生效，页面门禁（前端 cosmetic）下次加载生效。删号即时吊销其活动会话（`destroy_sessions_for_account`），令其后续请求 401。

## 4. auth.py 扩展 API

```python
# 合法账号名字符集
import re
_ACCOUNT_RE = re.compile(r'^[A-Za-z0-9_.-]{1,64}$')

# —— 校验助手（纯，抛 ValueError(中文)）——
def _validate_account_name(account: str) -> str:        # strip 后校验字符集/长度,返回规范名
def _validate_str_list(values, field: str) -> list:     # 列表+各项 1..64 去重,非法抛 ValueError
def _validate_password(password: str) -> None:          # 1..256

# —— 纯变换（不改入参,返回新 accounts dict）——
def create_account(accounts: dict, account: str, password: str, display_name: str,
                   pages: list, l4: list) -> dict:
    """校验;account 已存在→ValueError;isSuper 恒 False;返回新 dict(含新 user 的 salt/hash)。"""

def update_account(accounts: dict, account: str, *, display_name=None, pages=None,
                   l4=None, password=None) -> dict:
    """目标不存在→KeyError;目标 isSuper→ValueError(不可经UI改超管);
       仅对传入(非 None)字段更新;password 非 None→新盐重哈希;返回新 dict。"""

def delete_account(accounts: dict, account: str) -> dict:
    """目标不存在→KeyError;目标 isSuper→ValueError(不可经UI删超管);返回去掉该 user 的新 dict。"""

# —— 带锁 IO 包装(impure;_accounts_mutate_lock 串行 load→变换→save)——
def add_account(account, password, display_name, pages, l4) -> dict:   # 返回 public_user
def edit_account(account, *, display_name=None, pages=None, l4=None, password=None) -> dict:  # public_user
def remove_account(account) -> None:                                   # 删 + destroy_sessions_for_account

# —— 会话吊销 ——
def destroy_sessions_for_account(account: str) -> None:
    """遍历 _sessions(持 _sessions_lock)删该 account 的全部 token。"""

def list_public_accounts() -> list:
    """load_accounts → [public_user(acc,rec) for ...],按 account 排序。"""
```

实现要点：`_make_user` 已有（复用，但建号传 `is_super=False`、pages/l4 由参数）；纯变换用 `dict(accounts)` + `dict(accounts['users'])` 浅拷再改，避免改入参；`update_account` 改 user 时浅拷该 user dict 后改字段；`re` 已可 import。

## 5. server.py 改动

- 新增常量 `ERR_FORBIDDEN = "forbidden"`（403 语义）。
- `_require_super(self)`：
  ```
  token = auth.parse_cookie_token(self.headers.get('Cookie'))
  account = auth.validate_session(token)
  rec = auth.load_accounts().get('users', {}).get(account) if account else None
  if not rec or not rec.get('isSuper'):
      self._send_json(403, _error_payload(ERR_FORBIDDEN, "需要超级管理员权限")); return None
  return account
  ```
- `handle_admin_accounts_list(self)`：`_require_super` ✓ → `_send_json(200, {"success": True, "accounts": auth.list_public_accounts()})`。
- `handle_admin_account_create(self)`：`_require_super` ✓ → 解析 body（account/password/displayName/allowedPages/allowedL4）→ `try: user = auth.add_account(...)` `except ValueError as e: 400 ERR_VALIDATION` → `200 {"success": True, "user": user}`。
- `handle_admin_account_update(self)`：`_require_super` ✓ → body（account 必填；displayName/allowedPages/allowedL4/password 可选，缺省=不改）→ `try: user = auth.edit_account(account, ...)` `except KeyError: 404 ERR_NOT_FOUND` `except ValueError: 400 ERR_VALIDATION` → 200 {user}。
- `handle_admin_account_delete(self)`：`super = _require_super` ✓ → body account → `if account == super: 400 ERR_VALIDATION("不能删除自己")` → `try: auth.remove_account(account)` `except KeyError: 404` `except ValueError: 400`（删超管被拒）→ 200 {"success": True}。
- do_GET 链加 `elif parsed.path == '/api/admin/accounts': self.handle_admin_accounts_list()`。
- do_POST 链加三条 `elif`：`/api/admin/accounts/create|update|delete`。
- body 解析复用既有模式：`json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))).decode('utf-8'))`，异常→400 ERR_PARSE。

## 6. 前端改动

### 6.1 lib/pageAccess.ts —— 导出 PAGE_OPTIONS（页面多选项单一来源）
```ts
import { PROJECT_LINKS, ANALYSIS_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'
// 18 个 PageKey 恰由 4 组 nav 覆盖;'*'=全部页面哨兵
export const PAGE_OPTIONS: { key: string; label: string }[] = [
  { key: '*', label: '全部页面' },
  ...[...PROJECT_LINKS, ...ANALYSIS_LINKS, ...PAYMENT_LINKS, ...TOOL_LINKS].map(l => ({ key: l.key, label: l.label })),
]
```
（注意：`pageAccess.ts` import `nav`，而 `nav.ts` import `pageAccess` 的 `PageKey` **类型**——类型 import 不构成运行时循环依赖；若打包告警则将 `PAGE_OPTIONS` 放入 `nav.ts` 末尾改从 nav 导出。实现时验证无循环依赖告警。）

### 6.2 lib/admin.ts —— 4 个 API 封装
```ts
export interface AdminAccount { account: string; displayName: string; isSuper: boolean; allowedPages: string[]; allowedL4: string[] }
export async function listAccounts(): Promise<AdminAccount[]>            // GET, 失败抛
export async function createAccount(p: {account; password; displayName; allowedPages; allowedL4}): Promise<void>
export async function updateAccount(p: {account; displayName?; allowedPages?; allowedL4?; password?}): Promise<void>
export async function deleteAccount(account: string): Promise<void>
// 均 fetch credentials:'same-origin';非 2xx 读 data.message 抛 Error(message)。
```

### 6.3 router —— requiresSuper
- `RouteMeta` 加 `requiresSuper?: boolean`。
- 路由表加 `{ path: '/admin', name: 'admin', component: AdminView, meta: { title: '账号管理', hideFilter: true, requiresSuper: true } }`（catch-all 之前）。
- `beforeEach` 在 `isLoggedIn` 之后、pageKey 判定之前插：`if (to.meta.requiresSuper && !auth.isSuper) return { path: auth.firstAllowedPath() }`。

### 6.4 AppSidebar —— super-only 入口
工具 section 后加（或独立"系统管理"section）：
```html
<div v-if="auth.isSuper" class="section">
  <div class="section-label">系统管理</div>
  <RouterLink to="/admin" class="nav-item" active-class="active">账号管理</RouterLink>
</div>
```
（admin 无 PageKey，故直接 `v-if="auth.isSuper"`，不走 canAccess。）

### 6.5 AdminView.vue
- `onMounted` → `listAccounts()` 填 `accounts` ref；`store.data` 派生 `l4Options`（`store.data?.projects` 的 unique 非空 orgL4 排序 + 顶置 `{value:'*',label:'全部L4'}`）；`PAGE_OPTIONS` 作 pages 选项。
- el-table 列：账号 / 显示名 / 类型（`isSuper?'超级管理员':'普通管理员'`，淡底深字标签）/ 可访问页面（chips，`'*'`→"全部"）/ 可见 L4（chips，`'*'`→"全部"）/ 操作（编辑、删除）。**超管行操作禁用**（UI 只管普通账号）。
- "新建账号"按钮 → el-dialog 表单：账号(el-input) / 密码(el-input type=password) / 显示名(el-input) / 可访问页面(el-select multiple，选项 PAGE_OPTIONS) / 可见 L4(el-select multiple，选项 l4Options)。提交 → `createAccount` → 成功 ElMessage + 重拉列表 + 关弹窗；失败 ElMessage.error(e.message)。
- 编辑 → el-dialog（account 只读展示）改 displayName/allowedPages/allowedL4 + "重置密码"(留空=不改)。提交 → `updateAccount`（password 空则不传）。
- 删除 → ElMessageBox.confirm → `deleteAccount` → 重拉列表。
- 全部样式用令牌；表格挂 `.u-num` 不适用（无数字列）；类型/权限标签用淡底+深字（如 `--ok-bg/--ok-text` 表普通、`--accent` 系表超管，遵设计规范三态）。

## 7. 测试

**后端 `tests/test_auth_admin.py`（纯函数）**：
- `create_account`：成功加 user（isSuper=false、pages/l4 落库、有 salt/hash 且 hash≠明文）；account 已存在→ValueError；非法 account 名（空/超长/含空格）→ValueError；空密码→ValueError；不改入参 dict。
- `update_account`：改 displayName/pages/l4 生效；password 给值→hash 变、旧密码 verify 失败、新密码 verify 成功；目标 isSuper→ValueError；目标不存在→KeyError；不传的字段不变；不改入参。
- `delete_account`：删普通成功（user 不在新 dict）；删超管→ValueError；不存在→KeyError；不改入参。
- `_validate_*`：边界（64 字符通过、65 拒；'*' 作 list 项通过）。

**后端 `tests/test_server_admin.py`（集成,真 HTTP；构造临时 accounts.json，含 1 超管+1 普通）**：
- 超管登录拿 cookie → GET /api/admin/accounts → 200，列表含两账号、**无 salt/hash 字段**。
- 普通账号登录 → GET /api/admin/accounts → 403；POST create/update/delete → 403。
- 未登录 → 全部 401（`_auth_gate`）。
- 超管 create → 200，列表多一员且 isSuper=false；同名再 create → 400。
- 超管 update 普通账号 allowedL4 → 200，再 list 反映新值；update 超管目标 → 400。
- 超管 delete 普通 → 200，list 少一员；delete 超管 → 400；delete 自己 → 400。
- （会话吊销）被删账号原 cookie 再请求 `/api/auth/me` → 401。

**前端**：
- `lib/admin.test.ts`：四封装命中正确 URL/method/body，2xx 解析、非 2xx 抛带 message（mock fetch）。
- `router/guard.test.ts`（扩展）：`requiresSuper` 路由——超管放行、普通→firstAllowedPath、未登录→/login。
- `AppSidebar.test.ts`（扩展）：超管见"账号管理"链接、普通不见。
- `AdminView.test.ts`：挂载拉列表渲染行；点新建开弹窗；填表提交调 createAccount 并重拉；超管行操作按钮 disabled；l4Options/PAGE_OPTIONS 正确派生。

`bash verify.sh` 全绿（pytest + 前端 typecheck/vitest/build）。手动冒烟：超管登录见"账号管理"、建一普通账号(单页单 L4)、登出、以该号登录只见该页该 L4 数据；超管回来改其权、删其号。

## 8. 完成与验收

SP-5 合入 master 后整套权限控制（SP-1 登录页 / SP-2 鉴权+账号模型 / SP-3 页面门禁 / SP-4 L4 数据隔离 / SP-5 超管管理）齐备，交用户**统一验收**。验收提示项：① 仅种子 2 个超管（admin/wxtnb、wangxutong/niubi），第 3 个超管须手工加 config 或经本页建普通账号；② 经本页建的账号均为普通管理员；③ 改权数据侧即时生效、页面门禁待对方刷新；④ `data/accounts.json` 含哈希、永不入库。
