# Plan B2：布局骨架与全页面路由 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 B1 基建之上，搭出可导航的应用外壳：UI 状态 store（侧边栏折叠，持久化）、覆盖所有页面的路由（占位视图）、`AppHeader`（品牌/版本/数据更新时间/停止服务）、`AppSidebar`（导航树/激活态/折叠）、`AppLayout` 组合，全部带组件测试。

**Architecture:** 纯前端（`frontend/`）。导航由集中式 `nav` 配置 + Vue Router 驱动（取代旧版内联 `onclick`/全局函数）。页面内容用通用 `PageStub` 占位，B4+ 逐页替换。这是 Phase B 的第二块，自成可运行/可测闭环。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Vue Router + Element Plus + Vitest + @vue/test-utils（B1 已装）。

参考：spec `docs/superpowers/specs/2026-06-03-payment-platform-refactor-design.md`；旧版结构见 `index.html`（header/sidebar）；数据来自 B1 的 `useDataStore`；API 客户端 `@/api/client`。

**不在本计划（拆到 B3）：** 年份/视角/纳管筛选控件（docks）+ `filterStore` 过滤逻辑；通用组件 `DataTable`（封装 el-table）/`ChartBox`（封装 vue-echarts）/`Modal`。**B4+**：各页面真实内容。

---

## File Structure（B2 产出）

```
frontend/src/
├── stores/ui.ts                 # 侧边栏折叠状态（localStorage 持久化）
├── stores/ui.test.ts
├── nav.ts                       # 集中导航配置（侧边栏数据源）
├── router/index.ts              # 扩展：所有页面路由（占位视图）
├── router/index.test.ts         # 路由解析测试
├── components/PageStub.vue      # 通用占位视图（按 route.meta.title 显示）
├── layout/AppHeader.vue + .test.ts
├── layout/AppSidebar.vue + .test.ts
├── layout/AppLayout.vue + .test.ts
└── App.vue                      # 改为渲染 <AppLayout>
```

约定：从 `frontend/` 运行 npm；测试用 Vitest + @vue/test-utils；提交信息末尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。Windows，用 Bash 工具。涉及路由测试时用 memory history。

---

### Task 1: uiStore（侧边栏折叠，持久化）

**Files:** Create `frontend/src/stores/ui.ts`、`frontend/src/stores/ui.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/stores/ui.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUiStore } from './ui'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('ui store', () => {
  it('defaults to expanded sidebar', () => {
    const ui = useUiStore()
    expect(ui.sidebarCollapsed).toBe(false)
  })

  it('toggle flips and persists', () => {
    const ui = useUiStore()
    ui.toggleSidebar()
    expect(ui.sidebarCollapsed).toBe(true)
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true')
  })

  it('reads persisted collapsed state on init', () => {
    localStorage.setItem('sidebar_collapsed', 'true')
    const ui = useUiStore()
    expect(ui.sidebarCollapsed).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/stores/ui.test.ts`
Expected: FAIL（找不到 `./ui`）。

- [ ] **Step 3: 写实现 `frontend/src/stores/ui.ts`**

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

const KEY = 'sidebar_collapsed'

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(localStorage.getItem(KEY) === 'true')

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    localStorage.setItem(KEY, String(sidebarCollapsed.value))
  }

  return { sidebarCollapsed, toggleSidebar }
})
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/stores/ui.test.ts`
Expected: PASS（3 passed）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/ui.ts frontend/src/stores/ui.test.ts
git commit -m "feat(frontend): uiStore 侧边栏折叠状态（localStorage 持久化）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 导航配置 + 全页面路由 + 占位视图

**Files:** Create `frontend/src/nav.ts`、`frontend/src/components/PageStub.vue`、`frontend/src/router/index.test.ts`；Modify `frontend/src/router/index.ts`。

- [ ] **Step 1: 创建集中导航配置 `frontend/src/nav.ts`**

```ts
// 侧边栏导航配置（取代旧版散落的内联 onclick）
export interface NavLink { label: string; to: string }
export interface TierTab { label: string; tab: string }
export interface TierOpt { label: string; slug: string; color: string }

export const TIERS: TierOpt[] = [
  { label: '100万以上', slug: 'above1m', color: 'var(--red, #ef4444)' },
  { label: '50-100万', slug: '50to100', color: 'var(--orange, #f59e0b)' },
  { label: '50万以下', slug: 'below50', color: 'var(--green, #10b981)' },
]

export const TIER_TABS: TierTab[] = [
  { label: '项目总览', tab: 'projects' },
  { label: '回款节点', tab: 'nodes' },
  { label: '回款状态', tab: 'plan' },
  { label: '风险项目', tab: 'risk' },
  { label: '数据质检', tab: 'integrity' },
]

export const OVERVIEW_LINKS: NavLink[] = [
  { label: '看板首页', to: '/' },
  { label: '区间对比', to: '/compare' },
  { label: '回款日历', to: '/calendar' },
  { label: '临期跟进', to: '/followup' },
  { label: '回款台账', to: '/ledger' },
]

export const TOOL_LINKS: NavLink[] = [
  { label: '项目经理视图', to: '/pmview' },
  { label: '数据管理', to: '/data' },
  { label: '关于产品', to: '/about' },
]

// slug ↔ 中文档位 映射（路由用 slug，避免 URL 中文）
export const TIER_BY_SLUG: Record<string, string> = Object.fromEntries(
  TIERS.map((t) => [t.slug, t.label]),
)
```

- [ ] **Step 2: 创建占位视图 `frontend/src/components/PageStub.vue`**

```vue
<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div class="page-stub">
    <h2>{{ route.meta.title || route.name }}</h2>
    <p v-if="route.params.tab">页签：{{ route.params.tab }} ／ 档位：{{ route.params.tier }}</p>
    <p class="hint">（此页面将在后续里程碑实现）</p>
  </div>
</template>

<style scoped>
.page-stub { padding: 24px; }
.hint { color: #94a3b8; font-size: 13px; }
</style>
```

- [ ] **Step 3: 写失败测试 `frontend/src/router/index.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { router } from './index'

describe('router', () => {
  it('resolves all top-level pages', () => {
    for (const path of ['/', '/compare', '/calendar', '/followup', '/ledger', '/pmview', '/data', '/about']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
  })

  it('resolves tier pages with tab + tier params', () => {
    const r = router.resolve('/tier/plan/above1m')
    expect(r.matched.length).toBeGreaterThan(0)
    expect(r.params.tab).toBe('plan')
    expect(r.params.tier).toBe('above1m')
  })

  it('unknown path falls back to dashboard', () => {
    const r = router.resolve('/nonexistent-xyz')
    expect(r.name).toBe('dashboard')
  })
})
```

- [ ] **Step 4: 运行确认失败**

Run: `cd frontend && npx vitest run src/router/index.test.ts`
Expected: FAIL（当前 router 只有一个 `/` 路由）。

- [ ] **Step 5: 扩展 `frontend/src/router/index.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import PageStub from '@/components/PageStub.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: HomeView, meta: { title: '看板首页' } },
    { path: '/compare', name: 'compare', component: PageStub, meta: { title: '区间对比' } },
    { path: '/calendar', name: 'calendar', component: PageStub, meta: { title: '回款日历' } },
    { path: '/followup', name: 'followup', component: PageStub, meta: { title: '临期跟进' } },
    { path: '/ledger', name: 'ledger', component: PageStub, meta: { title: '回款台账' } },
    { path: '/tier/:tab/:tier', name: 'tier', component: PageStub, meta: { title: '业务分析' } },
    { path: '/pmview', name: 'pmview', component: PageStub, meta: { title: '项目经理视图' } },
    { path: '/data', name: 'data', component: PageStub, meta: { title: '数据管理' } },
    { path: '/about', name: 'about', component: PageStub, meta: { title: '关于产品' } },
    { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
  ],
})
```

- [ ] **Step 6: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/router/index.test.ts`（3 passed）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 7: 提交**

```bash
git add frontend/src/nav.ts frontend/src/components/PageStub.vue frontend/src/router/index.ts frontend/src/router/index.test.ts
git commit -m "feat(frontend): 集中导航配置 + 全页面路由（占位视图）+ 路由测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: AppHeader

**Files:** Create `frontend/src/layout/AppHeader.vue`、`frontend/src/layout/AppHeader.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/layout/AppHeader.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AppHeader from './AppHeader.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => setActivePinia(createPinia()))
afterEach(() => vi.unstubAllGlobals())

describe('AppHeader', () => {
  it('renders title and data update time from store', () => {
    const store = useDataStore()
    store.data = { meta: { lastUpdate: '2026-06-03 10:00', totalProjects: 1, totalPaymentNodes: 1 } } as any
    const wrapper = mount(AppHeader)
    expect(wrapper.text()).toContain('项目回款跟踪与管控平台')
    expect(wrapper.text()).toContain('2026-06-03 10:00')
  })

  it('stop button calls /api/stop after confirm', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'stopping' }) })
    vi.stubGlobal('fetch', f)
    const wrapper = mount(AppHeader)
    await wrapper.get('[data-test="stop-server"]').trigger('click')
    expect(f).toHaveBeenCalledWith('/api/stop')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/layout/AppHeader.test.ts`
Expected: FAIL（找不到组件）。

- [ ] **Step 3: 写实现 `frontend/src/layout/AppHeader.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { api } from '@/api/client'

const APP_VERSION = 'V6.0.0' // 单一来源；发版时更新

const store = useDataStore()
const updateTime = computed(() => store.data?.meta.lastUpdate ?? '-')

async function stopServer() {
  if (!confirm('确认停止本地服务？停止后页面将无法继续使用。')) return
  try {
    await api.get('/api/stop')
  } catch {
    // 服务停止时连接会中断，忽略错误
  }
}
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <span class="title">项目回款跟踪与管控平台</span>
      <span class="version">{{ APP_VERSION }}</span>
    </div>
    <div class="meta">
      <span class="sync-dot" /> 数据已同步
      <span class="date-badge">{{ updateTime }}</span>
      <button data-test="stop-server" class="stop-btn" title="停止服务" @click="stopServer">■</button>
    </div>
  </header>
</template>

<style scoped>
.app-header { display: flex; justify-content: space-between; align-items: center;
  height: 52px; padding: 0 18px; border-bottom: 1px solid #e2e8f0; background: #fff; }
.brand { display: flex; align-items: center; gap: 10px; }
.title { font-weight: 700; color: #0f172a; }
.version { font-size: 12px; color: #94a3b8; }
.meta { display: flex; align-items: center; gap: 10px; font-size: 13px; color: #475569; }
.sync-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; display: inline-block; }
.date-badge { padding: 2px 8px; background: #f1f5f9; border-radius: 6px; font-size: 12px; }
.stop-btn { width: 28px; height: 28px; border: 1px solid #e2e8f0; border-radius: 6px;
  background: none; color: #ef4444; cursor: pointer; }
.stop-btn:hover { border-color: #ef4444; background: #fef2f2; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/layout/AppHeader.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/layout/AppHeader.vue frontend/src/layout/AppHeader.test.ts
git commit -m "feat(frontend): AppHeader（品牌/版本/数据更新时间/停止服务）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: AppSidebar

**Files:** Create `frontend/src/layout/AppSidebar.vue`、`frontend/src/layout/AppSidebar.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/layout/AppSidebar.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import { useUiStore } from '@/stores/ui'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div/>' } },
      { path: '/ledger', name: 'ledger', component: { template: '<div/>' } },
      { path: '/tier/:tab/:tier', name: 'tier', component: { template: '<div/>' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('AppSidebar', () => {
  it('renders overview + tier-tab + tool nav labels', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
    const text = wrapper.text()
    expect(text).toContain('看板首页')
    expect(text).toContain('回款台账')
    expect(text).toContain('项目总览')   // tier tab
    expect(text).toContain('数据管理')   // tool
  })

  it('toggle button flips uiStore collapsed', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const ui = useUiStore()
    const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
    expect(ui.sidebarCollapsed).toBe(false)
    await wrapper.get('[data-test="sidebar-toggle"]').trigger('click')
    expect(ui.sidebarCollapsed).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/layout/AppSidebar.test.ts`
Expected: FAIL（找不到组件）。

- [ ] **Step 3: 写实现 `frontend/src/layout/AppSidebar.vue`**

```vue
<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import { OVERVIEW_LINKS, TOOL_LINKS, TIER_TABS, TIERS } from '@/nav'

const ui = useUiStore()
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <nav class="sidebar-nav">
      <div class="section">
        <div class="section-label">概览</div>
        <RouterLink v-for="link in OVERVIEW_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div class="section">
        <div class="section-label">业务分析</div>
        <div v-for="t in TIER_TABS" :key="t.tab" class="group">
          <div class="group-label">{{ t.label }}</div>
          <RouterLink v-for="tier in TIERS" :key="tier.slug"
            :to="`/tier/${t.tab}/${tier.slug}`" class="nav-sub" active-class="active">
            <span class="dot" :style="{ background: tier.color }" />{{ tier.label }}
          </RouterLink>
        </div>
      </div>

      <div class="section">
        <div class="section-label">管理工具</div>
        <RouterLink v-for="link in TOOL_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>
    </nav>
    <button data-test="sidebar-toggle" class="toggle" title="折叠/展开菜单"
      @click="ui.toggleSidebar()">{{ ui.sidebarCollapsed ? '››' : '‹‹' }}</button>
  </aside>
</template>

<style scoped>
.sidebar { width: 220px; border-right: 1px solid #e2e8f0; background: #fff;
  display: flex; flex-direction: column; transition: width .15s; overflow: hidden; }
.sidebar.collapsed { width: 0; border-right: none; }
.sidebar-nav { flex: 1; overflow-y: auto; padding: 12px 0; }
.section { margin-bottom: 14px; }
.section-label { font-size: 11px; color: #94a3b8; padding: 4px 18px; font-weight: 600; }
.group-label { font-size: 12px; color: #64748b; padding: 6px 18px 2px; }
.nav-item, .nav-sub { display: flex; align-items: center; gap: 8px; padding: 7px 18px;
  font-size: 13px; color: #334155; text-decoration: none; }
.nav-sub { padding-left: 30px; font-size: 12px; }
.nav-item:hover, .nav-sub:hover { background: #f1f5f9; }
.nav-item.active, .nav-sub.active { background: #eef2ff; color: #4f46e5; font-weight: 600; }
.dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.toggle { height: 32px; border: none; border-top: 1px solid #e2e8f0; background: #fff;
  color: #64748b; cursor: pointer; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/layout/AppSidebar.test.ts`
Expected: PASS（2 passed）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/layout/AppSidebar.vue frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(frontend): AppSidebar（集中导航配置驱动/激活态/折叠）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: AppLayout 组合 + 接入 App.vue

**Files:** Create `frontend/src/layout/AppLayout.vue`、`frontend/src/layout/AppLayout.test.ts`；Modify `frontend/src/App.vue`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/layout/AppLayout.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppLayout from './AppLayout.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('AppLayout', () => {
  it('renders header, sidebar and routed content', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', name: 'dashboard', component: { template: '<div class="routed">ROUTED</div>' } }],
    })
    router.push('/')
    await router.isReady()
    const wrapper = mount(AppLayout, { global: { plugins: [router] } })
    expect(wrapper.find('.app-header').exists()).toBe(true)
    expect(wrapper.find('.sidebar').exists()).toBe(true)
    expect(wrapper.find('.routed').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/layout/AppLayout.test.ts`
Expected: FAIL（找不到组件）。

- [ ] **Step 3: 写实现 `frontend/src/layout/AppLayout.vue`**

```vue
<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
</script>

<template>
  <div class="app-layout">
    <AppHeader />
    <div class="app-body">
      <AppSidebar />
      <main class="app-main">
        <router-view />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-layout { display: flex; flex-direction: column; height: 100vh; }
.app-body { display: flex; flex: 1; min-height: 0; }
.app-main { flex: 1; overflow: auto; background: #f8fafc; }
</style>
```

- [ ] **Step 4: 接入 `frontend/src/App.vue`**（替换现有内容）

```vue
<script setup lang="ts">
import AppLayout from '@/layout/AppLayout.vue'
</script>

<template>
  <AppLayout />
</template>
```

- [ ] **Step 5: 运行确认通过 + 全量前端验证**

Run: `cd frontend && npx vitest run src/layout/AppLayout.test.ts`（1 passed）
Run: `cd frontend && npm run test:run`（全部前端测试通过）
Run: `cd frontend && npm run typecheck`（通过）
Run: `cd frontend && npm run build`（构建成功）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/layout/AppLayout.vue frontend/src/layout/AppLayout.test.ts frontend/src/App.vue
git commit -m "feat(frontend): AppLayout 组合 header+sidebar+router-view，接入 App.vue

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 收尾——verify 全绿 + 更新 PROGRESS

**Files:** Modify `PROGRESS.md`。

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（py_compile + ruff + 75 pytest + 前端 typecheck/vitest/build 全绿）。失败则报告 BLOCKED。

- [ ] **Step 2: 更新 PROGRESS.md**

- 在 "🟦 Phase B 前端" 小节，把 B2 行改为 `[x]` 并校正描述：
  ```
  - [x] **B2** 布局骨架与全页面路由：uiStore（侧边栏折叠持久化）、集中导航配置、全页面路由（占位视图）、AppHeader/AppSidebar/AppLayout，App.vue 接入。
  ```
- 把原 B2 中"年份/视角 dock + 通用组件"的部分明确移交 B3——调整 B3 行为：
  ```
  - [ ] **B3** 筛选与通用组件：filterStore（年份/视角/纳管，取代散落全局 + getFilteredNodes）+ 年份/视角/纳管控件（docks）；通用组件 DataTable（封装 el-table）/ChartBox（封装 vue-echarts）/Modal。
  ```
- 保留 `B4+`（各页面）与 `B-opt`。更新"最近更新"为 `2026-06-03`。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): 标记 B2 布局骨架完成，B3 调整为筛选+通用组件

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（对照 spec §6 子里程碑 1 的"布局"部分）：**
- 布局 header/sidebar + 折叠 → Task 3/4/5 ✓
- 路由骨架（所有页面）→ Task 2 ✓
- UI 状态 store → Task 1 ✓
- **明确移交 B3**：年份/视角/纳管 docks + filterStore；通用组件 DataTable/ChartBox/Modal（Task 6 在 PROGRESS 记录）。**B4+**：页面真实内容（占位由 PageStub 承接）。

**Placeholder scan：** 所有 store/组件/路由/测试均给出完整代码；npm/git 命令含预期输出。PageStub 是有意的占位视图（非计划占位符），B4+ 替换。无 TBD/TODO。

**一致性：** `useUiStore`/`useDataStore`、`@/nav` 的 `OVERVIEW_LINKS/TOOL_LINKS/TIER_TABS/TIERS`、路由 `name`（dashboard/compare/.../tier）与 AppSidebar 的 `RouterLink :to`、tier slug（above1m/50to100/below50）在 nav 与路由 `/tier/:tab/:tier` 间一致；测试用 `createMemoryHistory` 隔离路由。版本号 `V6.0.0` 作为前端单一来源（与 PROGRESS 版本约定对齐，后续 Phase C 统一注入）。

**风险点：**
- AppSidebar/AppLayout 测试需注入路由（memory history）——已在测试中用 `global.plugins:[router]`。
- AppHeader 的停止按钮测试 mock `confirm` + `fetch`；真实点击会停服，仅测调用。
- 视觉精度：B2 是骨架，样式从简（用户已接受展示改动）；像素级还原非目标，后续页面里程碑按需补 CSS。

---

## Execution Handoff

见会话中执行方式选择（建议同前：subagent-driven-development）。
