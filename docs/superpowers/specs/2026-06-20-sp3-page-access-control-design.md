# SP-3 页面访问控制 设计（权限控制功能 第 3 子项目）

> 把 SP-2 的"登录能用但不强制"升级为**强制**：前端路由守卫(未登录→/login;已登录按 `allowedPages` 控可访问页) + 导航按权限过滤 + 后端对 `/api/*`·`/data/*` 的会话校验(401 拦截)。
> **仍不做 L4 数据切片(SP-4)、不做超管建号界面(SP-5)。** 本期只"门禁"，数据仍全量(给有权页)。

## 0. 背景与边界

威胁模型=折中：页面门禁前端守卫 + 后端 token 校验(本 SP 落地);L4 数据后端切(SP-4)。SP-1 登录页、SP-2 后端鉴权(会话 cookie + `auth.validate_session` + `stores/auth`)已合入 master。当前 App 任何页可不登录直接访问、`/api`·`/data` 不校验——本 SP 收口。

页面清单(取自 `@/nav` 四组)：项目域 `/`·`/projects`·`/projects/closed`·`/activity`；分析 `/insight`·`/insight/milestone`·`/insight/costdetail`·`/insight/board`·`/insight/calendar`；回款 `/payment`·`/payment/projects`·`/payment/nodes`·`/payment/plan`·`/payment/risk`·`/ledger`；工具 `/data`·`/governance`·`/about`。详情页 `/project/:id`·`/closed-project/:id` 继承其域权限。

## 1. 范围与非目标

**范围**：
- **页 key 体系**：定义 `PageKey`，每路由挂 `meta.pageKey`，nav 链接挂 `key`(同一字符串集)。
- **前端守卫** `router.beforeEach`：/login 放行;未登录→/login;已登录且 `isSuper||无key||canAccess(key)`→放行,否则→首个可访问页。处理首屏 `fetchMe` 竞态(守卫等会话恢复完成)。
- **导航过滤**：AppSidebar 仅显示有权链接。
- **后端会话门** `server.py`：`/api/*`·`/data/*`(除 `/api/login`·`/api/logout`·`/api/auth/me`)须有效会话,否则 401。
- 顺带(SP-2 backlog)：`handle_login` 限 account/password 长度(防超长 pbkdf2 DoS)。

**非目标**：不切 L4 数据(SP-4);不做超管界面(SP-5);CORS `Allow-Origin` 收紧留 backlog(同源/代理下不构成漏洞,SP-2 终审已判定);不做"无权"独立 403 页(无权统一跳首个可访问页,够用)。

## 2. 全局约束（写入 plan Global Constraints）

- 后端纯标准库;改"调用脚本/读写路径"两分支同维护(本 SP 不涉及路径,仅请求门)。
- 前端不使用 emoji;样式只引用 theme.css 令牌。
- 守卫不得卡死首屏:`/login` 与静态资源(SPA 壳)永不被守卫/后端门拦死,保证未登录也能加载登录页。
- 后端门**放行** `/api/login`·`/api/logout`·`/api/auth/me`(鉴权端自管)与静态资源/SPA 回退;**拦截** 其余 `/api/*` 与 `/data/*`。
- 超管(`isSuper`)对所有页/接口放行。
- 逐文件 `git add`;commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不改 `frontend/src/version.ts`。

## 3. 架构

```
导航(beforeEach 守卫) ── 未登录→/login ── 已登录: isSuper||无key||canAccess→放行, 否则→firstAllowedPath
        │                                   ▲
   stores/auth (user.allowedPages) ── ensureReady() 等首屏 fetchMe 完成(防竞态)
        │
AppSidebar ── 按 canAccessNav 过滤四组链接(仅显有权)
        │
后端 server.py do_GET/do_POST 顶部 _auth_gate() ── /api·/data(除鉴权端)无有效会话→401
```

## 4. 页 key 体系

`frontend/src/lib/pageAccess.ts`(新)：

```ts
export type PageKey =
  | 'overview' | 'projects' | 'projects-closed' | 'activity'
  | 'insight' | 'insight-milestone' | 'insight-costdetail' | 'insight-board' | 'insight-calendar'
  | 'payment' | 'payment-projects' | 'payment-nodes' | 'payment-plan' | 'payment-risk' | 'ledger'
  | 'data' | 'governance' | 'about'

/** allowedPages 含 '*' 或该 key → 可访问;isSuper 在调用方先判。 */
export function canAccess(allowedPages: string[], key: PageKey): boolean {
  return allowedPages.includes('*') || allowedPages.includes(key)
}
```

- `router/index.ts`：每业务路由 `meta: { ..., pageKey: '<key>' }`。详情页 `/project/:id`→`projects`、`/closed-project/:id`→`projects-closed`。`/login` 无 pageKey(且 fullscreen)。catch-all/`/`→`overview`。redirect 路由无需 pageKey(跳转到目标后再判)。
- `RouteMeta` 加 `pageKey?: PageKey`。
- `nav.ts`：`NavLink` 加 `key: PageKey`,每链接补 key(与路由 meta 一致)。

## 5. stores/auth 扩展

加：
- `ensureReady(): Promise<void>` —— 首次调用触发 `fetchMe()` 并缓存其 promise;后续返回同一 promise(守卫每次 await,仅首屏真正等待)。
- `canAccess(key: PageKey): boolean` —— `isSuper || pageAccess.canAccess(user.allowedPages, key)`(未登录返回 false)。
- `firstAllowedPath(): string` —— 返回当前用户可访问的第一个导航路径(遍历 nav 四组按顺序),全无→`/login`。超管→`/`。

`main.ts`：把 `useAuthStore(pinia).fetchMe()` 改为 `useAuthStore(pinia).ensureReady()`(预热,与守卫共用同一 promise)。

## 6. 路由守卫

`router/index.ts` 末尾(导出 router 后)加 `router.beforeEach`:

```ts
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.path === '/login') return true
  await auth.ensureReady()
  if (!auth.isLoggedIn) return { path: '/login' }
  const key = to.meta.pageKey as PageKey | undefined
  if (auth.isSuper || !key || auth.canAccess(key)) return true
  return { path: auth.firstAllowedPath() }
})
```

注意：守卫内 `useAuthStore()` 须在 pinia 安装后调用(beforeEach 在导航时执行,此时 main.ts 已 `app.use(pinia)`,OK)。`ensureReady` 防止首屏直接深链时 user 尚未恢复就误判未登录。

## 7. 导航过滤

`AppSidebar.vue`：把四组 `*_LINKS` 改为按权限过滤的 computed：

```ts
const auth = useAuthStore()
const projectLinks = computed(() => PROJECT_LINKS.filter((l) => auth.canAccess(l.key)))
// analysisLinks/paymentLinks/toolLinks 同理
```
模板 `v-for` 改用过滤后的 computed;某组全空则该 section 不渲染(`v-if="projectLinks.length"`)。超管 canAccess 恒真→全显。

## 8. 后端会话门

`server.py` 加：

```python
_AUTH_EXEMPT = ('/api/login', '/api/logout', '/api/auth/me')

def _path_needs_auth(path):
    if path in _AUTH_EXEMPT:
        return False
    return path.startswith('/api/') or path.startswith('/data/')

# CustomHandler 方法:
def _auth_gate(self):
    path = urlparse(self.path).path
    if _path_needs_auth(path):
        token = auth.parse_cookie_token(self.headers.get('Cookie'))
        if not auth.validate_session(token):
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return False
    return True
```

`do_GET` 与 `do_POST` 函数体**第一行**(解析 path 之后/分发之前)加：`if not self._auth_gate(): return`。静态资源(.js/.css/.html)、SPA 回退、`/` 等非 /api·/data 路径不被拦(壳与登录页可加载)。`_path_needs_auth` 为模块级纯函数(可单测)。

`handle_login` 顶部加长度护栏(SP-2 backlog)：account/password 任一 `len > 256` → 401 `_error_payload(ERR_AUTH, "账号或密码错误")`(不泄露具体原因)。

## 9. 测试

后端 `tests/test_server_auth.py` 追加：
- `_path_needs_auth`：`/api/sync`·`/data/analysis_data.json`→True;`/api/login`·`/api/logout`·`/api/auth/me`→False;`/`·`/assets/x.js`·`/index.html`→False。
- 集成：未带 cookie GET `/data/analysis_data.json`→401;GET `/api/tags`→401;登录拿 cookie 后同请求→非 401(200 或既有逻辑)。`/api/login` 无 cookie 仍可访问(200/401 由凭据定,非门拦)。超长 account 登录→401。

前端：
- `lib/pageAccess.test.ts`：`canAccess(['*'],k)`真;`canAccess(['data'],'data')`真、`canAccess(['data'],'about')`假。
- `stores/auth.test.ts` 追加：`ensureReady` 多次调用只 fetchMe 一次(spy 调用次数=1);`canAccess`(超管恒真、普通按 allowedPages);`firstAllowedPath`(超管→'/'、普通→首个有权 nav 路径、无权→'/login')。
- `router` 守卫测试(`router/guard.test.ts` 或并入既有 `router/index.test.ts`)：用 memoryHistory + mock authStore：未登录访 `/projects`→重定向 `/login`;登录普通用户(allowedPages 不含 'data')访 `/data`→重定向首个可访问;访 `/login` 始终放行;超管访任意→放行。
- `AppSidebar.test.ts`：超管显全部链接;普通(allowedPages=['data'])仅显数据管理、其余 section 空不显;mock authStore。

`bash verify.sh` 全绿。

## 10. 对后续 SP 的接口预留

- 后端 `_auth_gate` 已把 `/data` 收口在"已登录"门后;SP-4 在 `/data` 处理内按 `validate_session` 得到的 account 的 `allowedL4` 切 `analysis_data.json` 再下发。
- `allowedPages` 体系 + `canAccess` 是 SP-5 超管调权界面的编辑对象(给某账号勾选可访问页 key)。
- `firstAllowedPath`/导航过滤为普通管理员(SP-5 创建)落地后即生效。
