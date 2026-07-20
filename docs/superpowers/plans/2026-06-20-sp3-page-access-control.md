# SP-3 页面访问控制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 强制登录与按页授权：路由守卫(未登录→/login、无权→首个可访问页) + 导航过滤 + 后端 `/api`·`/data` 会话门。

**Architecture:** 页 key 体系(`lib/pageAccess.ts` + 路由 `meta.pageKey` + nav `key`);`stores/auth` 加 `ensureReady/canAccess/firstAllowedPath`;`router.beforeEach` 守卫;`AppSidebar` 按权限过滤;`server.py` `_auth_gate` 在 do_GET/do_POST 顶部拦 `/api`·`/data`(除鉴权端)。

**Tech Stack:** Vue3+TS+Pinia+Vue Router+Vitest;Python 标准库+pytest。

## Global Constraints

- 不使用 emoji;前端样式只引用 theme.css 令牌。
- `/login` 与静态资源(SPA 壳)永不被守卫/后端门拦死(未登录也能加载登录页)。
- 后端门**放行** `/api/login`·`/api/logout`·`/api/auth/me` 与非 `/api`·`/data` 路径;**拦截**其余 `/api/*`·`/data/*`(无有效会话→401)。
- 超管(`isSuper`)对所有页/接口放行。
- 不改 `frontend/src/version.ts`。
- 逐文件 `git add`,禁止 `git add -A/.`;commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/lib/pageAccess.ts` | 建 | `PageKey` 类型 + `canAccess`(T1) |
| `frontend/src/lib/pageAccess.test.ts` | 建 | canAccess(T1) |
| `frontend/src/nav.ts` | 改 | `NavLink.key: PageKey` + 各链接补 key(T1) |
| `frontend/src/router/index.ts` | 改 | `RouteMeta.pageKey` + 各路由 meta.pageKey(T1) + `beforeEach` 守卫(T3) |
| `frontend/src/stores/auth.ts` | 改 | ensureReady/canAccess/firstAllowedPath(T2) |
| `frontend/src/stores/auth.test.ts` | 改 | 上述(T2) |
| `frontend/src/main.ts` | 改 | fetchMe()→ensureReady()(T2) |
| `frontend/src/router/guard.test.ts` | 建 | 守卫行为(T3) |
| `frontend/src/layout/AppSidebar.vue` | 改 | 按权限过滤四组(T4) |
| `frontend/src/layout/AppSidebar.test.ts` | 改/建 | 过滤(T4) |
| `server.py` | 改 | `_path_needs_auth` + `_auth_gate` + do_GET/do_POST 钩 + login 长度护栏(T5) |
| `tests/test_server_auth.py` | 改 | 门 + 长度护栏(T5) |

---

### Task 1: 页 key 体系（pageAccess.ts + 路由 meta + nav key）

**Files:** Create `frontend/src/lib/pageAccess.ts`、`frontend/src/lib/pageAccess.test.ts`;Modify `frontend/src/nav.ts`、`frontend/src/router/index.ts`(仅类型 + 各路由 meta.pageKey,不加守卫)

**Interfaces:**
- Produces: `PageKey`(联合类型,见下)、`canAccess(allowedPages,key)->boolean`;`NavLink.key: PageKey`;`RouteMeta.pageKey?: PageKey`;各路由 meta 带 pageKey。

- [ ] **Step 1: 写失败测试** —— Create `frontend/src/lib/pageAccess.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { canAccess } from './pageAccess'

describe('pageAccess.canAccess', () => {
  it("'*' 通配可访问任意", () => {
    expect(canAccess(['*'], 'data')).toBe(true)
    expect(canAccess(['*'], 'about')).toBe(true)
  })
  it('命中 key 才可访问', () => {
    expect(canAccess(['data'], 'data')).toBe(true)
    expect(canAccess(['data'], 'about')).toBe(false)
    expect(canAccess([], 'data')).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/pageAccess.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 pageAccess.ts** —— Create `frontend/src/lib/pageAccess.ts`

```ts
export type PageKey =
  | 'overview' | 'projects' | 'projects-closed' | 'activity'
  | 'insight' | 'insight-milestone' | 'insight-costdetail' | 'insight-board' | 'insight-calendar'
  | 'payment' | 'payment-projects' | 'payment-nodes' | 'payment-plan' | 'payment-risk' | 'ledger'
  | 'data' | 'governance' | 'about'

/** allowedPages 含 '*' 或该 key → 可访问(isSuper 由调用方先判)。 */
export function canAccess(allowedPages: string[], key: PageKey): boolean {
  return allowedPages.includes('*') || allowedPages.includes(key)
}
```

- [ ] **Step 4: nav.ts 加 key** —— 改 `frontend/src/nav.ts`

`NavLink` 接口改为：

```ts
import type { PageKey } from '@/lib/pageAccess'
export interface NavLink { label: string; to: string; key: PageKey }
```

各组链接补 `key`（与 to 对应）：

```ts
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目总览', to: '/', key: 'overview' },
  { label: '在建项目', to: '/projects', key: 'projects' },
  { label: '已关闭项目', to: '/projects/closed', key: 'projects-closed' },
  { label: '项目动态', to: '/activity', key: 'activity' },
]
export const ANALYSIS_LINKS: NavLink[] = [
  { label: '项目多维分析', to: '/insight', key: 'insight' },
  { label: '里程碑管理', to: '/insight/milestone', key: 'insight-milestone' },
  { label: '成本分析', to: '/insight/costdetail', key: 'insight-costdetail' },
  { label: '回款多维分析', to: '/insight/board', key: 'insight-board' },
  { label: '回款日历', to: '/insight/calendar', key: 'insight-calendar' },
]
export const PAYMENT_LINKS: NavLink[] = [
  { label: '回款总览', to: '/payment', key: 'payment' },
  { label: '回款项目', to: '/payment/projects', key: 'payment-projects' },
  { label: '回款节点', to: '/payment/nodes', key: 'payment-nodes' },
  { label: '回款进度', to: '/payment/plan', key: 'payment-plan' },
  { label: '风险项目', to: '/payment/risk', key: 'payment-risk' },
  { label: '回款台账', to: '/ledger', key: 'ledger' },
]
export const TOOL_LINKS: NavLink[] = [
  { label: '数据管理', to: '/data', key: 'data' },
  { label: '数据治理', to: '/governance', key: 'governance' },
  { label: '关于产品', to: '/about', key: 'about' },
]
```

- [ ] **Step 5: router meta.pageKey** —— 改 `frontend/src/router/index.ts`

顶部加 import：`import type { PageKey } from '@/lib/pageAccess'`。`declare module 'vue-router'` 的 `RouteMeta` 加 `pageKey?: PageKey`。给各业务路由 meta 加 `pageKey`（按下表，给已有 meta 对象补这一键）：

| 路由 path | pageKey |
|---|---|
| `/projects` | `projects` |
| `/project/:id` | `projects` |
| `/projects/closed` | `projects-closed` |
| `/closed-project/:id` | `projects-closed` |
| `/activity` | `activity` |
| `/insight` | `insight` |
| `/insight/milestone` | `insight-milestone` |
| `/insight/costdetail` | `insight-costdetail` |
| `/insight/board` | `insight-board` |
| `/insight/calendar` | `insight-calendar` |
| `/payment` | `payment` |
| `/payment/projects` | `payment-projects` |
| `/payment/nodes` | `payment-nodes` |
| `/payment/plan` | `payment-plan` |
| `/payment/risk` | `payment-risk` |
| `/ledger` | `ledger` |
| `/data` | `data` |
| `/governance` | `governance` |
| `/about` | `about` |
| catch-all(`/:pathMatch(.*)*`, alias `/`) | `overview` |

`/login` 不加 pageKey;redirect-only 路由(`/payment/board`、`/calendar`、`/panalysis/:tab?`、`/board`、`/analysis/:tab`)不加 pageKey(跳转到目标路由后再判)。

- [ ] **Step 6: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/lib/pageAccess.test.ts && npm run typecheck`
Expected: PASS + 类型无错误（既有路由/nav 测试不破——仅追加字段）

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/pageAccess.ts frontend/src/lib/pageAccess.test.ts frontend/src/nav.ts frontend/src/router/index.ts
git commit -m "$(printf 'feat(access): 页 key 体系(PageKey/canAccess + nav.key + 路由 meta.pageKey)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: stores/auth 扩展（ensureReady/canAccess/firstAllowedPath）+ main 预热

**Files:** Modify `frontend/src/stores/auth.ts`、`frontend/src/stores/auth.test.ts`、`frontend/src/main.ts`

**Interfaces:**
- Consumes: `canAccess`/`PageKey`(T1)、nav 四组(T1)。
- Produces: `ensureReady()->Promise<void>`、`canAccess(key:PageKey)->boolean`、`firstAllowedPath()->string`。

- [ ] **Step 1: 写失败测试** —— append 到 `frontend/src/stores/auth.test.ts`

```ts
describe('stores/auth 访问控制', () => {
  it('ensureReady 多次调用只 fetchMe 一次', async () => {
    ;(fetchMe as any).mockResolvedValue(null)
    const s = useAuthStore()
    await Promise.all([s.ensureReady(), s.ensureReady(), s.ensureReady()])
    expect((fetchMe as any).mock.calls.length).toBe(1)
  })
  it('canAccess:超管恒真,普通按 allowedPages', () => {
    const s = useAuthStore()
    s.user = { account: 'a', displayName: 'a', isSuper: true, allowedPages: [], allowedL4: [] }
    expect(s.canAccess('data')).toBe(true)
    s.user = { account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [] }
    expect(s.canAccess('data')).toBe(true)
    expect(s.canAccess('about')).toBe(false)
  })
  it('firstAllowedPath:超管→/,普通→首个有权 nav 路径,无权→/login', () => {
    const s = useAuthStore()
    s.user = { account: 'a', displayName: 'a', isSuper: true, allowedPages: [], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/')
    s.user = { account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/data')
    s.user = { account: 'c', displayName: 'c', isSuper: false, allowedPages: [], allowedL4: [] }
    expect(s.firstAllowedPath()).toBe('/login')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/auth.test.ts`
Expected: FAIL（无 ensureReady/canAccess/firstAllowedPath）

- [ ] **Step 3: 实现** —— 改 `frontend/src/stores/auth.ts`

import 区加：

```ts
import { canAccess as pageCanAccess, type PageKey } from '@/lib/pageAccess'
import { PROJECT_LINKS, ANALYSIS_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'
```

在 `defineStore` 回调内（`logout` 之后、`return` 之前）加：

```ts
  let readyPromise: Promise<void> | null = null
  function ensureReady(): Promise<void> {
    if (!readyPromise) readyPromise = fetchMe()
    return readyPromise
  }
  function canAccess(key: PageKey): boolean {
    if (!user.value) return false
    if (user.value.isSuper) return true
    return pageCanAccess(user.value.allowedPages, key)
  }
  function firstAllowedPath(): string {
    if (!user.value) return '/login'
    if (user.value.isSuper) return '/'
    const all = [...PROJECT_LINKS, ...ANALYSIS_LINKS, ...PAYMENT_LINKS, ...TOOL_LINKS]
    const hit = all.find((l) => canAccess(l.key))
    return hit ? hit.to : '/login'
  }
```

`return { ... }` 加上 `ensureReady, canAccess, firstAllowedPath`。

- [ ] **Step 4: main.ts 预热改 ensureReady** —— 改 `frontend/src/main.ts`

把 `useAuthStore(pinia).fetchMe()` 改为 `useAuthStore(pinia).ensureReady()`。

- [ ] **Step 5: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/stores/auth.test.ts && npm run typecheck`
Expected: PASS（含原有 4 用例 + 新 3 用例）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/stores/auth.ts frontend/src/stores/auth.test.ts frontend/src/main.ts
git commit -m "$(printf 'feat(access): authStore ensureReady/canAccess/firstAllowedPath + main 预热\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: 路由守卫 router.beforeEach

**Files:** Modify `frontend/src/router/index.ts`;Create `frontend/src/router/guard.test.ts`

**Interfaces:**
- Consumes: `useAuthStore`(T2:ensureReady/isLoggedIn/isSuper/canAccess/firstAllowedPath)、`PageKey`(T1)。

- [ ] **Step 1: 写失败测试** —— Create `frontend/src/router/guard.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { router } from './index'
import { useAuthStore } from '@/stores/auth'

beforeEach(async () => {
  setActivePinia(createPinia())
  await router.replace('/login')
  await router.isReady()
})

function setUser(u: any) {
  const a = useAuthStore()
  a.user = u
  vi.spyOn(a, 'ensureReady').mockResolvedValue()
}

describe('router 守卫', () => {
  it('未登录访问受控页→重定向 /login', async () => {
    setUser(null)
    await router.push('/projects')
    expect(router.currentRoute.value.path).toBe('/login')
  })
  it('登录超管访问任意页→放行', async () => {
    setUser({ account: 'a', displayName: 'a', isSuper: true, allowedPages: [], allowedL4: [] })
    await router.push('/data')
    expect(router.currentRoute.value.path).toBe('/data')
  })
  it('普通用户访问无权页→重定向首个可访问页', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [] })
    await router.push('/projects')
    expect(router.currentRoute.value.path).toBe('/data')
  })
  it('普通用户访问有权页→放行', async () => {
    setUser({ account: 'b', displayName: 'b', isSuper: false, allowedPages: ['data'], allowedL4: [] })
    await router.push('/data')
    expect(router.currentRoute.value.path).toBe('/data')
  })
  it('/login 始终放行', async () => {
    setUser(null)
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/router/guard.test.ts`
Expected: FAIL（无守卫,/projects 不重定向）

- [ ] **Step 3: 实现** —— 改 `frontend/src/router/index.ts`

顶部 import 加：`import { useAuthStore } from '@/stores/auth'`（注意：router 模块被 store 间接依赖,但 store 在守卫执行时才用,无循环初始化问题——守卫是运行时调用）。

在 `export const router = createRouter({...})` 之后加：

```ts
router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (to.path === '/login') return true
  await auth.ensureReady()
  if (!auth.isLoggedIn) return { path: '/login' }
  const key = to.meta.pageKey
  if (auth.isSuper || !key || auth.canAccess(key)) return true
  return { path: auth.firstAllowedPath() }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/router/guard.test.ts src/router/index.test.ts && npm run typecheck`
Expected: PASS（守卫 5 用例 + 既有路由用例。既有 index.test 若因守卫重定向受影响,需在其中 mock 登录态或断言调整——实现者按需在既有测试 setActivePinia + 设 super user 以放行）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/router/index.ts frontend/src/router/guard.test.ts
git commit -m "$(printf 'feat(access): router.beforeEach 守卫(未登录→/login、无权→首个可访问页)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: AppSidebar 导航过滤

**Files:** Modify `frontend/src/layout/AppSidebar.vue`、`frontend/src/layout/AppSidebar.test.ts`

**Interfaces:**
- Consumes: `useAuthStore`(T2:canAccess)、nav 四组(T1)。

- [ ] **Step 1: 写失败测试** —— 全量替换/新建 `frontend/src/layout/AppSidebar.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { template: '<div/>' } }] })
beforeEach(() => setActivePinia(createPinia()))
const opts = () => ({ global: { plugins: [router] } })

describe('AppSidebar 权限过滤', () => {
  it('超管显示全部分组链接', () => {
    const a = useAuthStore()
    a.user = { account: 's', displayName: 's', isSuper: true, allowedPages: [], allowedL4: [] }
    const w = mount(AppSidebar, opts())
    expect(w.text()).toContain('数据管理')
    expect(w.text()).toContain('在建项目')
    expect(w.text()).toContain('回款台账')
  })
  it('普通用户(仅 data)只显数据管理,其余 section 不显', () => {
    const a = useAuthStore()
    a.user = { account: 'n', displayName: 'n', isSuper: false, allowedPages: ['data'], allowedL4: [] }
    const w = mount(AppSidebar, opts())
    expect(w.text()).toContain('数据管理')
    expect(w.text()).not.toContain('在建项目')
    expect(w.text()).not.toContain('回款台账')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/layout/AppSidebar.test.ts`
Expected: FAIL（未过滤,普通用户仍显全部）

- [ ] **Step 3: 实现** —— 改 `frontend/src/layout/AppSidebar.vue`

`<script setup>` 改为：

```ts
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import { PROJECT_LINKS, ANALYSIS_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'

const ui = useUiStore()
const auth = useAuthStore()
const projectLinks = computed(() => PROJECT_LINKS.filter((l) => auth.canAccess(l.key)))
const analysisLinks = computed(() => ANALYSIS_LINKS.filter((l) => auth.canAccess(l.key)))
const paymentLinks = computed(() => PAYMENT_LINKS.filter((l) => auth.canAccess(l.key)))
const toolLinks = computed(() => TOOL_LINKS.filter((l) => auth.canAccess(l.key)))
```

模板四个 section 各加 `v-if="<组>.length"` 且 `v-for` 用过滤后的 computed。例如项目 section：

```html
      <div v-if="projectLinks.length" class="section">
        <div class="section-label">项目</div>
        <RouterLink v-for="link in projectLinks" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>
```

分析 section 用 `analysisLinks`(class `nav-sub`)、回款 section 用 `paymentLinks`(class `nav-sub`，保留 `section-tag`)、工具 section 用 `toolLinks`(class `nav-item`)。其余结构/样式不变。

- [ ] **Step 4: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/layout/AppSidebar.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/layout/AppSidebar.vue frontend/src/layout/AppSidebar.test.ts
git commit -m "$(printf 'feat(access): AppSidebar 按 canAccess 过滤导航(空组不显)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: 后端会话门 + 登录长度护栏

**Files:** Modify `server.py`、`tests/test_server_auth.py`

**Interfaces:**
- Consumes: `auth.parse_cookie_token/validate_session`、`_send_json`、`_error_payload`、`ERR_AUTH`(均既有)。
- Produces: `_path_needs_auth(path)->bool`(模块级)、`CustomHandler._auth_gate()`。

- [ ] **Step 1: 写失败测试** —— append 到 `tests/test_server_auth.py`

```python
def test_path_needs_auth():
    assert server._path_needs_auth('/api/sync') is True
    assert server._path_needs_auth('/data/analysis_data.json') is True
    assert server._path_needs_auth('/api/login') is False
    assert server._path_needs_auth('/api/logout') is False
    assert server._path_needs_auth('/api/auth/me') is False
    assert server._path_needs_auth('/') is False
    assert server._path_needs_auth('/assets/index.js') is False
    assert server._path_needs_auth('/index.html') is False


def test_auth_gate_blocks_unauthenticated(tmp_path, monkeypatch):
    monkeypatch.setattr(auth, "ACCOUNTS_FILE", str(tmp_path / "accounts.json"))
    auth._sessions.clear()
    auth.seed_default_accounts()
    srv = server.create_server(host="127.0.0.1", port=0)
    port = srv.server_address[1]
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    try:
        conn = http.client.HTTPConnection("127.0.0.1", port)
        # 未带 cookie 访 /data → 401
        conn.request("GET", "/data/analysis_data.json")
        r = conn.getresponse()
        assert r.status == 401
        r.read()
        # 登录拿 cookie
        conn.request("POST", "/api/login", json.dumps({"account": "admin", "password": "wxtnb"}),
                     {"Content-Type": "application/json"})
        r2 = conn.getresponse()
        cookie = r2.getheader("Set-Cookie").split(";")[0]
        r2.read()
        # 带 cookie 访 /data → 非 401(404/200 视文件,门已放行)
        conn.request("GET", "/data/analysis_data.json", headers={"Cookie": cookie})
        r3 = conn.getresponse()
        assert r3.status != 401
        r3.read()
        # 超长 account 登录 → 401
        conn.request("POST", "/api/login", json.dumps({"account": "x" * 300, "password": "y"}),
                     {"Content-Type": "application/json"})
        r4 = conn.getresponse()
        assert r4.status == 401
        r4.read()
    finally:
        srv.shutdown()
        srv.server_close()
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_auth.py -q`
Expected: FAIL（无 _path_needs_auth;/data 未拦返回非 401）

- [ ] **Step 3: 实现** —— 改 `server.py`

在模块级（`ERR_AUTH` 附近或 CustomHandler 之前）加：

```python
_AUTH_EXEMPT = ('/api/login', '/api/logout', '/api/auth/me')


def _path_needs_auth(path):
    if path in _AUTH_EXEMPT:
        return False
    return path.startswith('/api/') or path.startswith('/data/')
```

在 `CustomHandler` 内加方法：

```python
    def _auth_gate(self):
        path = urlparse(self.path).path
        if _path_needs_auth(path):
            token = auth.parse_cookie_token(self.headers.get('Cookie'))
            if not auth.validate_session(token):
                self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
                return False
        return True
```

在 `do_GET` 函数体第一行（`parsed = urlparse(self.path)` 之后立即）加：

```python
        if not self._auth_gate():
            return
```

在 `do_POST` 同样位置加：

```python
        if not self._auth_gate():
            return
```

在 `handle_login` 顶部（读体之后、authenticate 之前）加长度护栏：

```python
        if len(account) > 256 or len(password) > 256:
            self._send_json(401, _error_payload(ERR_AUTH, "账号或密码错误"))
            return
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_server_auth.py -q && ruff check server.py tests/test_server_auth.py`
Expected: PASS + ruff 净

- [ ] **Step 5: 提交**

```bash
git add server.py tests/test_server_auth.py
git commit -m "$(printf 'feat(access): 后端会话门 _auth_gate 拦 /api·/data(除鉴权端) + 登录长度护栏\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## 收尾验证（全部任务后）

```bash
bash verify.sh
```
Expected: 全绿（ruff + pytest + 前端 typecheck/vitest/build）。

手动冒烟（`python server.py` + `cd frontend && npm run dev`）：
- 未登录访问任意业务页 → 跳 `/login`;直接 `fetch('/data/analysis_data.json')` → 401。
- admin 登录(全权)→ 各页可访问、导航全显、`/data` 加载正常。
- (普通管理员账号要 SP-5 才能建;本期可临时手改 `data/accounts.json` 造一个 `isSuper:false, allowedPages:['data']` 验证:登录后只显数据管理、访其他页被弹回。)
- 登出 → 回 /login;此后业务页与 /data 再被门挡。
