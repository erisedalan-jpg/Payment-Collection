# 下钻返回保持视图状态 实现计划（V2.5.9）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 列表页下钻进详情后返回，完整恢复筛选/排序/分页/滚动；从左侧菜单重新进入则恢复默认。

**Architecture:** 选择性 `<keep-alive>`（仅缓存 6 个下钻列表页，详情页不缓存）保住组件状态；`lib/viewReturn.ts` 在 `router.beforeResolve` 集中判定「下钻返回 vs 菜单进入」，用 `:key` token 令菜单进入触发新实例=自动重置；`lib/useViewScrollMemory.ts` 记忆/恢复 `.app-main` 容器滚动；账号切换经全屏登录页天然清空缓存，再加 `:key=account` 显式护栏。

**Tech Stack:** Vue3 `<script setup>` + Vite + TS + Pinia + Element Plus + Vue Router 4；vitest + @vue/test-utils；puppeteer-core 真机冒烟。

**设计依据：** `docs/superpowers/specs/2026-07-01-drilldown-return-keep-view-state-design.md`（行为契约见其 §3）。

## Global Constraints

- 纯前端：**零后端 / 零 schema / 零依赖 / 无新页 / 无新 pageKey**；升级不需点「更新数据」。
- 版本号唯一来源 `frontend/src/version.ts` → `V2.5.9`（Z 级，用户已确认非大版本）；不在别处写版本。
- UI 文案简体中文；**不使用任何 emoji**（需符号用 `→ ↓ ❌ ✕ ▾`）。
- 引用设计令牌，不手写散值（本功能仅复用既有 `el-skeleton`/`.app-main`，无新样式散值）。
- 行为契约不得偏离 spec §3：下钻返回=完整恢复；菜单进入=默认；深链带 query=重置+套用 query；跨列表菜单=目标页重置；登出/换号=缓存清空。
- keep-alive `:include` 按**组件 name** 匹配 → 目标 SFC 必须有 `defineOptions({ name })`，且 name 与 `KEEPALIVE_COMPONENTS` 严格一致。
- 完成 = 代码改完 **且** `bash verify.sh` 全绿 **且** 真机冒烟三主路径过 **且** `PROGRESS.md` 已更新。
- 每次提交信息末尾附：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

**动手前**：在 `PROGRESS.md` 标记本功能 `in_progress`。

---

### Task 1: `lib/viewReturn.ts` 返回判定状态机 + viewKey

纯逻辑、无 DOM，最先做、单测为主战场。

**Files:**
- Create: `frontend/src/lib/viewReturn.ts`
- Test: `frontend/src/lib/viewReturn.test.ts`

**Interfaces:**
- Produces:
  - `KEEPALIVE_ROUTES: readonly string[]`、`KEEPALIVE_COMPONENTS: readonly string[]`
  - `isKeepAliveRoute(name?: unknown): boolean`
  - `trackNavigation(toName: unknown, fromName: unknown): void`（供 `router.beforeResolve` 调用）
  - `token(name: string): number`
  - `viewKey(name?: unknown): string`（供 `AppLayout` 的 `<component :key>`）
  - `__resetViewReturn(): void`（仅测试）

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/viewReturn.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetViewReturn, isKeepAliveRoute, trackNavigation, viewKey } from './viewReturn'

beforeEach(() => __resetViewReturn())

describe('viewReturn', () => {
  it('列表→详情→返回同列表：token 不变（保持缓存）', () => {
    trackNavigation('project-detail', 'projects') // 下钻
    const before = viewKey('projects')
    trackNavigation('projects', 'project-detail') // 返回
    expect(viewKey('projects')).toBe(before)
  })

  it('从菜单（非详情来源）进入列表：token +1（触发重置）', () => {
    const k0 = viewKey('projects')
    trackNavigation('projects', 'overview')
    expect(viewKey('projects')).not.toBe(k0)
  })

  it('跨列表：详情→其它列表菜单，目标列表重置', () => {
    trackNavigation('project-detail', 'projects') // 从 projects 下钻
    const k0 = viewKey('insight-costdetail')
    trackNavigation('insight-costdetail', 'project-detail') // 从详情点“成本分析”
    expect(viewKey('insight-costdetail')).not.toBe(k0)
  })

  it('中间经过另一 keep-alive 列表后 armed 被清，回原列表不误判为返回', () => {
    trackNavigation('project-detail', 'projects') // armed = projects
    trackNavigation('insight-costdetail', 'project-detail') // 到达 costdetail → armed 清
    const k0 = viewKey('projects')
    trackNavigation('projects', 'insight-costdetail') // from 非详情
    expect(viewKey('projects')).not.toBe(k0)
  })

  it('已关闭项目：closed → 详情 → 返回，保持', () => {
    trackNavigation('closed-project-detail', 'closed-projects')
    const before = viewKey('closed-projects')
    trackNavigation('closed-projects', 'closed-project-detail')
    expect(viewKey('closed-projects')).toBe(before)
  })

  it('非 keep-alive 路由：viewKey 返回原 name，不带 token', () => {
    expect(viewKey('project-detail')).toBe('project-detail')
    expect(viewKey('overview')).toBe('overview')
  })

  it('isKeepAliveRoute 边界', () => {
    expect(isKeepAliveRoute('projects')).toBe(true)
    expect(isKeepAliveRoute('overview')).toBe(false)
    expect(isKeepAliveRoute(undefined)).toBe(false)
    expect(isKeepAliveRoute(123)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/viewReturn.test.ts`
Expected: FAIL（`viewReturn` 模块不存在）

- [ ] **Step 3: 实现**

```ts
// frontend/src/lib/viewReturn.ts
import { reactive } from 'vue'

// 需要“下钻返回保持视图状态”的列表页（路由 name）
export const KEEPALIVE_ROUTES = [
  'projects',
  'insight-costdetail',
  'closed-projects',
  'projects-key',
  'temp-followup',
  'insight-milestone',
] as const

// keep-alive :include 需要“组件 name”，须与各 SFC 的 defineOptions({name}) 一致
export const KEEPALIVE_COMPONENTS = [
  'ProjectsView',
  'CostDetailView',
  'ClosedProjectsView',
  'KeyProjectsView',
  'TempFollowupView',
  'MilestoneView',
] as const

// 下钻目标（详情）路由 = 返回来源
const DETAIL_ROUTES = ['project-detail', 'closed-project-detail']

const tokens = reactive<Record<string, number>>({})
let armed: string | null = null // 最近一次从哪个 keep-alive 列表下钻出去

export function isKeepAliveRoute(name?: unknown): boolean {
  return typeof name === 'string' && (KEEPALIVE_ROUTES as readonly string[]).includes(name)
}

function isDetailRoute(name?: unknown): boolean {
  return typeof name === 'string' && DETAIL_ROUTES.includes(name)
}

// 供 router.beforeResolve 调用：先登记（列表→详情），再解析（→列表：判定返回/菜单）
export function trackNavigation(toName: unknown, fromName: unknown): void {
  if (isKeepAliveRoute(fromName) && isDetailRoute(toName)) {
    armed = String(fromName)
  }
  if (isKeepAliveRoute(toName)) {
    const isReturn = armed === String(toName) && isDetailRoute(fromName)
    armed = null
    if (!isReturn) tokens[String(toName)] = (tokens[String(toName)] ?? 0) + 1
  }
}

export function token(name: string): number {
  return tokens[name] ?? 0
}

// keep-alive 路由 → 带 token 后缀（菜单进入 bump → 新 key → 新实例=重置）；其余 → 原 name
export function viewKey(name?: unknown): string {
  const n = String(name ?? '')
  return isKeepAliveRoute(n) ? `${n}:${token(n)}` : n
}

// 仅供测试重置内部状态
export function __resetViewReturn(): void {
  armed = null
  for (const k of Object.keys(tokens)) delete tokens[k]
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/viewReturn.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/viewReturn.ts frontend/src/lib/viewReturn.test.ts
git commit -m "feat(nav): viewReturn 返回判定状态机 + viewKey token"
```

---

### Task 2: `lib/useViewScrollMemory.ts` 容器滚动记忆

`.app-main`（overflow 容器，在 keep-alive 缓存范围外）的滚动存/取；用“新挂载 vs 缓存激活”区分菜单/返回。

**Files:**
- Create: `frontend/src/lib/useViewScrollMemory.ts`
- Test: `frontend/src/lib/useViewScrollMemory.test.ts`

**Interfaces:**
- Produces: `useViewScrollMemory(): void`（在目标视图 setup 内调用，注册 onMounted/onActivated/onDeactivated）
- Consumes: 运行期 DOM 中的 `.app-main` 元素（由 `AppLayout` 提供；缺失时空操作）

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/useViewScrollMemory.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { useViewScrollMemory } from './useViewScrollMemory'

let mainEl: HTMLElement

beforeEach(() => {
  mainEl = document.createElement('div')
  mainEl.className = 'app-main'
  document.body.appendChild(mainEl)
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
})
afterEach(() => {
  mainEl.remove()
  vi.unstubAllGlobals()
})

const A = defineComponent({ name: 'A', setup() { useViewScrollMemory(); return () => h('div', 'A') } })
const B = defineComponent({ name: 'B', setup() { return () => h('div', 'B') } })

function makeHost() {
  const which = ref<'A' | 'B'>('A')
  const Host = defineComponent({
    setup() {
      return () => h(KeepAlive, null, { default: () => h(which.value === 'A' ? A : B) })
    },
  })
  mount(Host, { attachTo: document.body })
  return { which }
}

describe('useViewScrollMemory', () => {
  it('下钻返回（停用→再激活）恢复 .app-main scrollTop', async () => {
    const { which } = makeHost()
    await nextTick()
    mainEl.scrollTop = 240
    which.value = 'B'          // A 被 keep-alive 停用（存 240）
    await nextTick()
    mainEl.scrollTop = 0
    which.value = 'A'          // A 再激活（恢复）
    await flushPromises()
    expect(mainEl.scrollTop).toBe(240)
  })

  it('首次进入（新实例）不改动 scrollTop', async () => {
    mainEl.scrollTop = 55
    makeHost()                 // A 首挂载+首激活(fresh) → 不恢复
    await flushPromises()
    expect(mainEl.scrollTop).toBe(55)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/useViewScrollMemory.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// frontend/src/lib/useViewScrollMemory.ts
import { nextTick, onActivated, onDeactivated, onMounted } from 'vue'

// 记忆并恢复主内容滚动容器(.app-main)的滚动位置：
// 菜单/深链/首次进入(新实例) → 停在顶部；下钻返回(缓存激活) → 恢复离开时的位置。
export function useViewScrollMemory(): void {
  let saved = 0
  let fresh = false
  const container = (): HTMLElement | null =>
    document.querySelector('.app-main') as HTMLElement | null

  onMounted(() => { fresh = true })

  onDeactivated(() => {
    const el = container()
    if (el) saved = el.scrollTop
  })

  onActivated(() => {
    if (fresh) { fresh = false; return } // 新实例：菜单/深链/首次 → 不恢复
    const restore = (): void => {
      const el = container()
      if (el) el.scrollTop = saved
    }
    if (typeof requestAnimationFrame === 'function') {
      void nextTick(() => requestAnimationFrame(restore))
    } else {
      void nextTick(restore)
    }
  })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/useViewScrollMemory.test.ts`
Expected: PASS（两用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/useViewScrollMemory.ts frontend/src/lib/useViewScrollMemory.test.ts
git commit -m "feat(nav): useViewScrollMemory 容器滚动记忆(返回恢复/菜单置顶)"
```

---

### Task 3: KeyProjectsView / TempFollowupView 增加 setup 级 clearAll（统一“菜单=重置”）

这两页当前 setup 无 `cf.clearAll`，列头筛选跨菜单保留。加 setup 级清空，使菜单进入（Task 5 的 key bump→新挂载→setup 重跑）重置列头筛选；下钻返回（缓存激活、setup 不重跑）仍保持。

**Files:**
- Modify: `frontend/src/views/KeyProjectsView.vue`（TABLE_ID `'key-projects'`，L21；`cf` 已在 setup 中使用，见模板按钮 L226）
- Modify: `frontend/src/views/TempFollowupView.vue`（TABLE_ID `'temp-followup'`，L23；`cf` 已在 setup 中使用，见模板按钮 L198）
- Test: `frontend/src/views/KeyProjectsView.test.ts`、`frontend/src/views/TempFollowupView.test.ts`（在既有测试文件中追加；沿用其现有 mount/pinia 装配）

**Interfaces:**
- Consumes: `useCrossFilterStore()`（已在两页 setup 引入）
- Produces: 两页在（重新）挂载时清空各自 TABLE_ID 的列筛选

- [ ] **Step 1: 写失败测试**（在既有测试文件追加；先读该文件复用其挂载工具/桩）

在 `KeyProjectsView.test.ts` 追加：
```ts
it('挂载时清空 key-projects 列筛选（菜单=重置）', async () => {
  const cf = useCrossFilterStore()          // 若文件已 import 则复用
  cf.setColumnFilter('key-projects', 'orgL4', ['某部门'])
  // —— 按本文件既有方式 mount(KeyProjectsView)（含 pinia/data 桩）——
  await nextTick()
  expect(cf.getColumnFilter('key-projects', 'orgL4')).toEqual([])
})
```
在 `TempFollowupView.test.ts` 追加同构用例（TABLE_ID 换 `'temp-followup'`）。
> 实现者：`useCrossFilterStore` API 以 `frontend/src/stores/crossFilter.ts` 为准（`setColumnFilter(tableId, key, values)` / `getColumnFilter(tableId, key)` / `clearAll(tableId)`）；若既有测试已建 pinia，直接复用；断言“清空”按该 store 实际返回（空数组或 undefined）择一，与实现一致。

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/KeyProjectsView.test.ts src/views/TempFollowupView.test.ts`
Expected: FAIL（挂载后列筛选仍在）

- [ ] **Step 3: 实现**

在两页 `<script setup>` 内、`const cf = useCrossFilterStore()` 与 `const TABLE_ID = '...'` 之后的 setup 顶层，各加一行（紧邻现有常量，附中文注释说明“菜单进入即重置；下钻返回因 keep-alive 不重跑 setup 故保持”）：
```ts
// 进页清空本表残留列筛选（keep-alive 下：菜单进入=新挂载会重置，下钻返回=缓存激活不重置）
cf.clearAll(TABLE_ID)
```
> 与 `ProjectsView.vue:85` / `CostDetailView.vue:34` 的既有写法保持一致；两页无 route.query 重建逻辑，clearAll 安全无副作用。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/views/KeyProjectsView.test.ts src/views/TempFollowupView.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/KeyProjectsView.vue frontend/src/views/TempFollowupView.vue \
        frontend/src/views/KeyProjectsView.test.ts frontend/src/views/TempFollowupView.test.ts
git commit -m "feat(nav): 重点项目进展/临时重点跟进 进页清列筛选(统一菜单=重置)"
```

---

### Task 4: 6 个视图补 `defineOptions({ name })` + `useViewScrollMemory()`

为 keep-alive `:include` 提供组件 name，并接入滚动记忆。纯机械改动，以回归 + name 断言把关。

**Files:**（均 Modify）
- `frontend/src/views/ProjectsView.vue` → name `'ProjectsView'`
- `frontend/src/views/CostDetailView.vue` → `'CostDetailView'`
- `frontend/src/views/ClosedProjectsView.vue` → `'ClosedProjectsView'`
- `frontend/src/views/KeyProjectsView.vue` → `'KeyProjectsView'`
- `frontend/src/views/TempFollowupView.vue` → `'TempFollowupView'`
- `frontend/src/views/MilestoneView.vue` → `'MilestoneView'`
- Test: `frontend/src/views/viewNames.test.ts`（新建，集中断言 6 组件 name）

**Interfaces:**
- Consumes: `useViewScrollMemory`（Task 2）
- Produces: 6 组件具备与 `KEEPALIVE_COMPONENTS`（Task 1）一致的 `name`

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/views/viewNames.test.ts
import { describe, expect, it } from 'vitest'
import { KEEPALIVE_COMPONENTS } from '@/lib/viewReturn'
import ProjectsView from './ProjectsView.vue'
import CostDetailView from './CostDetailView.vue'
import ClosedProjectsView from './ClosedProjectsView.vue'
import KeyProjectsView from './KeyProjectsView.vue'
import TempFollowupView from './TempFollowupView.vue'
import MilestoneView from './MilestoneView.vue'

const comps: Record<string, { name?: string }> = {
  ProjectsView, CostDetailView, ClosedProjectsView, KeyProjectsView, TempFollowupView, MilestoneView,
}

describe('目标视图组件 name 与 KEEPALIVE_COMPONENTS 一致', () => {
  it('每个目标组件都声明了与常量一致的 name', () => {
    for (const expected of KEEPALIVE_COMPONENTS) {
      expect(comps[expected]?.name).toBe(expected)
    }
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/viewNames.test.ts`
Expected: FAIL（现无 name → 为 undefined）

- [ ] **Step 3: 实现**

对上述 6 个 `.vue`，在 `<script setup>` 顶部（import 之后）各加：
```ts
import { useViewScrollMemory } from '@/lib/useViewScrollMemory'
defineOptions({ name: 'ProjectsView' }) // 各文件改成对应 name
useViewScrollMemory()
```
> 注意：`defineOptions`/`useViewScrollMemory()` 必须在 setup 顶层（非条件/循环内）。MilestoneView 已有 `useDeferredMount()`，与本调用并列即可。name 字面量逐文件对应上表。

- [ ] **Step 4: 运行确认通过 + 回归**

Run:
```bash
cd frontend && npx vitest run src/views/viewNames.test.ts \
  src/views/ProjectsView.test.ts src/views/CostDetailView.test.ts \
  src/views/ClosedProjectsView.test.ts src/views/KeyProjectsView.test.ts \
  src/views/TempFollowupView.test.ts src/views/MilestoneView.test.ts
```
Expected: PASS（新 name 测试 + 6 页既有测试全绿；无 keep-alive 时 `onActivated/onDeactivated` 不触发、`.app-main` 缺失即空操作，故既有同步断言不受影响。若个别文件无既有测试则跳过该文件。）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/ProjectsView.vue frontend/src/views/CostDetailView.vue \
  frontend/src/views/ClosedProjectsView.vue frontend/src/views/KeyProjectsView.vue \
  frontend/src/views/TempFollowupView.vue frontend/src/views/MilestoneView.vue \
  frontend/src/views/viewNames.test.ts
git commit -m "feat(nav): 6 下钻列表页补组件 name + 接入滚动记忆"
```

---

### Task 5: 启用选择性 keep-alive（AppLayout + router.beforeResolve + 账号护栏）

把前四任务接通：AppLayout 用 v-slot + keep-alive 包裹路由视图，router 挂 `beforeResolve` 驱动 token。

**Files:**
- Modify: `frontend/src/layout/AppLayout.vue`
- Modify: `frontend/src/router/index.ts`（在现有 `beforeEach` 之后新增 `beforeResolve`）
- Test: `frontend/src/layout/AppLayout.test.ts`（新建或在既有基础上追加）

**Interfaces:**
- Consumes: `viewKey`、`KEEPALIVE_COMPONENTS`、`trackNavigation`（Task 1）；`useAuthStore`（`stores/auth.ts`，`auth.user?.account`）
- Produces: 目标列表页被缓存、菜单进入重置、下钻返回恢复；登出/换号缓存清空

- [ ] **Step 1: 写失败测试**（结构性；缓存/返回语义由冒烟证）

```ts
// frontend/src/layout/AppLayout.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import AppLayout from './AppLayout.vue'

const Normal = defineComponent({ name: 'ProjectsView', setup: () => () => h('div', { class: 'normal-page' }, 'N') })
const Full = defineComponent({ name: 'LoginView', setup: () => () => h('div', { class: 'full-page' }, 'F') })

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', name: 'projects', component: Normal, meta: { hideFilter: true } },
      { path: '/login', name: 'login', component: Full, meta: { fullscreen: true } },
    ],
  })
}

const stubs = { AppHeader: true, AppSidebar: true, FilterBar: true, ProjectDetailDrawer: true }

describe('AppLayout keep-alive 包裹', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('普通路由渲染 .app-main 布局', async () => {
    const router = makeRouter()
    router.push('/projects'); await router.isReady()
    const w = mount(AppLayout, { global: { plugins: [router], stubs } })
    await flushPromises()
    expect(w.find('.app-main').exists()).toBe(true)
    expect(w.find('.normal-page').exists()).toBe(true)
  })

  it('全屏路由裸渲染、无 .app-main', async () => {
    const router = makeRouter()
    router.push('/login'); await router.isReady()
    const w = mount(AppLayout, { global: { plugins: [router], stubs } })
    await flushPromises()
    expect(w.find('.app-main').exists()).toBe(false)
    expect(w.find('.full-page').exists()).toBe(true)
  })
})
```
> 实现者：若 mount 因 auth store 依赖报错，按最小方式初始化（`setActivePinia` 已建；`auth.user` 默认 null → `cacheKey='anon'`，无需登录）。stubs 覆盖子组件避免其内部依赖。

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/layout/AppLayout.test.ts`
Expected: FAIL（改造前 `.app-main` 断言可能通过，但本任务先落测试基线；若两用例已巧合通过，则视 Step 3 后仍绿为准——本任务重点是 Step 3 的模板/路由改造不破坏这些结构不变量）

- [ ] **Step 3: 实现**

`frontend/src/layout/AppLayout.vue` 全量替换为：
```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import FilterBar from './FilterBar.vue'
import ProjectDetailDrawer from '@/components/ProjectDetailDrawer.vue'
import { useAuthStore } from '@/stores/auth'
import { KEEPALIVE_COMPONENTS, viewKey } from '@/lib/viewReturn'
const route = useRoute()
const auth = useAuthStore()
const fullscreen = computed(() => !!route.meta?.fullscreen)
const showFilter = computed(() => !route.meta?.hideFilter)
// 账号护栏：换号即换 keep-alive key → 缓存重建；登出经全屏页已卸载 v-else，此为防御纵深
const cacheKey = computed(() => auth.user?.account ?? 'anon')
const includeList = KEEPALIVE_COMPONENTS as unknown as string[]
</script>

<template>
  <router-view v-if="fullscreen" />
  <div v-else class="app-layout">
    <AppHeader />
    <div class="app-body">
      <AppSidebar />
      <main class="app-main">
        <FilterBar v-if="showFilter" />
        <router-view v-slot="{ Component, route: r }">
          <keep-alive :include="includeList" :max="10" :key="cacheKey">
            <component :is="Component" :key="viewKey(r.name)" />
          </keep-alive>
        </router-view>
      </main>
    </div>
    <ProjectDetailDrawer />
  </div>
</template>

<style scoped>
.app-layout { display: flex; flex-direction: column; height: 100vh; }
.app-body { display: flex; flex: 1; min-height: 0; }
.app-main { flex: 1; overflow: auto; background: var(--bg); }
</style>
```

`frontend/src/router/index.ts`：新增 import 与 `beforeResolve`（放在现有 `beforeEach` 之后）：
```ts
import { isKeepAliveRoute, trackNavigation } from '@/lib/viewReturn' // 顶部 import 区
// ... 现有 beforeEach 之后：
router.beforeResolve((to, from) => {
  // 在 DOM 更新前定好 token（避免 afterEach 触发的二次重挂）
  trackNavigation(to.name, from.name)
})
```
> 说明：用 `beforeResolve` 而非 `afterEach`，保证 `viewKey` 的 token 在 router-view 渲染前就位，菜单进入只挂载一次。`isKeepAliveRoute` 已在 `trackNavigation` 内部使用，import 保留 `trackNavigation` 即可（`isKeepAliveRoute` 如未直接用可不引入，避免 lint 未用告警——按实际调整 import 清单）。

- [ ] **Step 4: 运行确认通过 + 全量前端回归**

Run:
```bash
cd frontend && npx vitest run src/layout/AppLayout.test.ts && npx vitest run && npm run typecheck
```
Expected: PASS（AppLayout 两用例 + 全量 vitest + typecheck 全绿）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/layout/AppLayout.vue frontend/src/router/index.ts frontend/src/layout/AppLayout.test.ts
git commit -m "feat(nav): 启用选择性 keep-alive + beforeResolve 返回判定 + 账号护栏"
```

---

### Task 6: 版本 V2.5.9 + 全量 verify + 真机冒烟 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`
- Temp: `scratchpad/smoke_return.mjs`（冒烟脚本，不入库）

**Interfaces:** 无（收尾）

- [ ] **Step 1: 版本号**

`frontend/src/version.ts` → `export const APP_VERSION = 'V2.5.9'`（`RELEASE_DATE` 维持 `'2026-07-01'`）。

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 语法/ruff/pytest + 前端 typecheck/vitest/build 全绿。

- [ ] **Step 3: 真机冒烟（puppeteer-core + 系统 Chrome + --no-proxy-server，沿用既有登录/cookie 手法）**

新建 `scratchpad/smoke_return.mjs`，覆盖三主路径并断言：
1. 进 `/insight/costdetail` → 设列头筛选 + 排序 + 向下滚动 → 点行下钻 `/project/:id` → 浏览器返回 → 断言：筛选/排序仍在、`.app-main` scrollTop 恢复(>0)、无 console 报错。
2. 同页从左侧菜单再次进入 → 断言：筛选清空、scrollTop=0。
3. 登出 → 换另一账号登录 → 进该页 → 断言：默认态、无上一账号残留。
Run: `node <scratchpad>/smoke_return.mjs`
Expected: 三路径全部符合；打印版本 V2.5.9；console 报错(非 favicon/404)=0。
> 冒烟前需 `python server.py`(:8080) 且 `cd frontend && npm run build`（dist 每请求从磁盘读，build 后 :8080 即新前端）。

- [ ] **Step 4: 更新 PROGRESS.md**

将 V2.5.9 记为当前版本（V2.5.8 降格），补本期条目：功能=下钻返回保持视图状态、机制、覆盖 6 页、§4.5 行为变化、纯前端不需更新数据、verify 全绿 + 冒烟过、提交 hash。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.5.9 下钻返回保持视图状态(纯前端) + PROGRESS"
```

---

## 收尾（不在 SDD 任务内，待用户指示）

- **打包与手册**：用户说「出更新包」时再做——PowerShell `npx vite build --base=/pm/` → `python make_update_zip.py`（需先写 `deploy/升级手册-V2.5.9.md`）→ `npx vite build` 重建默认 base。参见 [[v258-crosspage-nav-perf]] 打包坑。
- **push 远端**：用户要求时再 push。
- 全部完成后用 superpowers:finishing-a-development-branch 收束（当前在 master 上直接提交，按项目既有节奏）。

## Self-Review

- **Spec 覆盖**：keep-alive(§4.1)=Task4+5；返回判定/token(§4.2)=Task1+5；滚动(§4.3)=Task2+4；账号隔离(§4.4)=Task5；§4.5 clearAll=Task3；测试(§6)=各任务 + Task6 冒烟；验证/版本(§7)=Task6。行为契约(§3)由 Task1 单测 + Task6 冒烟共同守住。无遗漏。
- **占位符扫描**：Task1/2 给出完整可落地代码；Task3/4/5 给出精确插入点与完整片段/全量文件；Task6 给出命令与断言口径。无 TBD。
- **类型/名称一致**：`KEEPALIVE_COMPONENTS`（Task1）↔ 各 `defineOptions({name})`（Task4）↔ `viewNames.test.ts` 断言（Task4）三处同名；`viewKey`/`trackNavigation` 签名 Task1 定义、Task5 消费一致；`.app-main` 选择器 Task2 与 AppLayout 模板(Task5)一致。
