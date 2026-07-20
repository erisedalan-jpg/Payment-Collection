# SP-A 路由/导航重构 实现计划（/insight 项目分析中心 V1.16.0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）or superpowers:executing-plans 逐任务执行本计划。步骤用 checkbox（`- [ ]`）跟踪。

**Goal：** 把 `/insight` 重构为"项目分析"主入口下挂 5 子页的信息架构——新增 `/insight/milestone`、`/insight/costdetail` 两个占位页（stub），把 `/payment/board`、`/calendar` 迁到 `/insight/board`、`/insight/calendar`，旧链接单跳 redirect 兼容（保 query），导航新增"项目分析"二级缩进分区。本子项目只搭骨架，两个新页内容由 SP-B/SP-C 填充。

**Architecture：** 沿用现有"平铺独立路由 + per-route meta + nav.ts 数组渲染 + RouterLink active-class"模式，不引入嵌套 router-view、不引入新框架。被迁移的两个页（BoardView/CalendarView）组件本身路径无关（只读 `useRoute().query` 或 lib，不引用自身路径），故迁移仅改路由表 `path`/`meta.title`，组件零改动。新页用共享占位组件 `PageStub.vue` 渲染"建设中"。

**Tech Stack：** Vue3 + Vite + TS + Pinia + Element Plus + vue-router 4 + Vitest（@vue/test-utils）。

## Global Constraints

> 以下为项目级硬约束，每个任务隐含包含。来源：CLAUDE.md + 用户钦定规则。

- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- **样式只引用 `frontend/src/styles/theme.css` 设计令牌**（`--sp-*`/`--fs-*`/`--txt`/`--mut`/`--accent` 等），**禁手写散值**（颜色/间距/字号）。
- **版本单一来源** `frontend/src/version.ts`；本次为 Y 级（整页级）调整 V1.15.0 → **V1.16.0**（用户已批准该整合=V1.16.0，无需再确认；X 大版本才需确认）。
- **回款子页禁止引入 `/payment/:param` 通配**（会遮蔽 `/payment` 的 DashboardView）；**`/insight/:param` 同理**，新子页一律用精确路径。
- **redirect 全部保 query**（board 依赖 `?dim=`）；旧链接单跳直达最终规范路径（不做多跳）。
- **git：逐文件 `git add <path>`，禁止 `git add -A`/`git add .`**；commit message 结尾**恒含一行**：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **不提交**：`data/analysis_data.json`（gitignored 产物）、`.claude/`、`docs/` 下两份数据血缘 md、`看板数据取值条件与计算公式.md`、本 plan/spec 文档（除非用户另行要求）。每个任务只 add 自己改的源码/测试文件。
- 沟通语言**简体中文**。

## 关键约定（命名保持，降低连锁改动）

- 迁移后**保留路由 `name`**：`/insight/board` 仍 `name: 'pay-board'`，`/insight/calendar` 仍 `name: 'calendar'`。这样 redirect 测试断言的 `name` 不变，且无 name-based 导航需要改。
- `meta.title` 改为菜单同名：board → `回款多维分析`，calendar → `回款日历`，milestone → `里程碑管理`，costdetail → `成本分析`。
- `/insight` 自身（InsightView，name `insight`）**不改**（仍 `meta.title:'项目分析', hideFilter:true`）。
- board/calendar **不 `hideFilter`**（消费全局 FilterBar）；milestone/costdetail **`hideFilter:true`**（自带页内工具栏）。

## 文件结构（创建/修改清单）

- 创建 `frontend/src/components/PageStub.vue` —— 共享占位组件（title prop + "建设中"），DRY 两个新页。
- 创建 `frontend/src/views/MilestoneView.vue` —— 里程碑页 stub（SP-B 替换内容，路由不再改）。
- 创建 `frontend/src/views/CostDetailView.vue` —— 成本页 stub（SP-C 替换内容）。
- 修改 `frontend/src/router/index.ts` —— 迁移 board/calendar 路由、新增 2 子页、新增/级联 redirect。
- 修改 `frontend/src/router/index.test.ts` —— 更新受影响断言、补 2 条新 redirect 测试。
- 修改 `frontend/src/nav.ts` —— PROJECT_LINKS 去掉「项目分析」；新增 `ANALYSIS_LINKS`；PAYMENT_LINKS 去掉「多维看板」「回款日历」。
- 修改 `frontend/src/layout/AppSidebar.vue` —— 新增"项目分析"分区渲染 `ANALYSIS_LINKS`（`.nav-sub`）。
- 修改 `frontend/src/layout/AppSidebar.test.ts` —— 更新 label 断言与 `.nav-sub` 计数 8 → 11，补 makeRouter 路由。
- 修改 `frontend/src/lib/navContext.ts` —— `goBoard()` 目标 `/payment/board` → `/insight/board`。
- 修改 `frontend/src/lib/navContext.test.ts` —— 断言改 `/insight/board`。
- 修改 `frontend/src/components/OrgRanking.test.ts` —— 点击跳转断言改 `/insight/board`。
- 修改 `frontend/src/version.ts` —— V1.16.0 / 2026-06-20。

**明确不改（已核实迁移不影响，运行其测试应保持绿）：** `frontend/src/views/BoardView.vue`、`frontend/src/views/CalendarView.vue` 及 `BoardView.test.ts`、`CalendarView.test.ts`（组件路径无关，仅 `meta.title` 变化，测试以直接 mount 方式不触达路由表）。实现者**不要**编辑这四个文件，只需运行其 vitest 确认仍绿。

---

## Task 1: 路由迁移 + 2 子页 stub + redirect 兼容

**Files:**
- Create: `frontend/src/components/PageStub.vue`
- Create: `frontend/src/views/MilestoneView.vue`
- Create: `frontend/src/views/CostDetailView.vue`
- Modify: `frontend/src/router/index.ts`
- Test: `frontend/src/router/index.test.ts`（修改现有）

**Interfaces:**
- Produces：路由 `/insight/board`(name `pay-board`)、`/insight/calendar`(name `calendar`)、`/insight/milestone`(name `insight-milestone`)、`/insight/costdetail`(name `insight-costdetail`)；redirect `/payment/board`、`/calendar`、`/board`、`/panalysis/:tab?`、`/analysis/:tab` 均落到新规范路径并保 query。Task 2 的 `ANALYSIS_LINKS` 的 5 个 `to` 全部由本任务提供为可达路由。
- Consumes：现有 `BoardView`、`CalendarView`、`InsightView` 组件（不改）。

- [ ] **Step 1: 更新 router 测试断言（先让其变红）**

把 `frontend/src/router/index.test.ts` 改为下述内容（整文件替换）：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { router } from './index'

describe('router', () => {
  beforeEach(async () => { await router.push('/') })

  it('resolves all top-level pages', () => {
    for (const path of ['/', '/payment', '/insight/board', '/payment/projects', '/payment/nodes', '/payment/plan', '/payment/risk', '/insight/calendar', '/insight/milestone', '/insight/costdetail', '/ledger', '/data', '/about', '/projects', '/activity', '/insight']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
  })

  it('/insight/board 解析到 BoardView、/about 解析到 AboutView（非占位 PageStub）', () => {
    const p = router.resolve('/insight/board')
    const a = router.resolve('/about')
    expect((p.matched[0].components?.default as any).__name).toBe('BoardView')
    expect((a.matched[0].components?.default as any).__name).toBe('AboutView')
  })

  it('两个新子页解析到各自 stub 视图', () => {
    expect((router.resolve('/insight/milestone').matched[0].components?.default as any).__name).toBe('MilestoneView')
    expect((router.resolve('/insight/costdetail').matched[0].components?.default as any).__name).toBe('CostDetailView')
  })

  it('回款四子页 + /insight/board 各自命名', () => {
    expect(router.resolve('/insight/board').name).toBe('pay-board')
    expect(router.resolve('/payment/projects').name).toBe('pay-projects')
    expect(router.resolve('/payment/nodes').name).toBe('pay-nodes')
    expect(router.resolve('/payment/plan').name).toBe('pay-plan')
    expect(router.resolve('/payment/risk').name).toBe('pay-risk')
  })

  // 函数式 redirect 仅在导航时生效(resolve 不跟随),故用 push 后断言 currentRoute
  it('旧 /panalysis/:tab 导航 redirect 到 /payment/:tab', async () => {
    await router.push('/panalysis/plan')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-plan')
    expect(cur.redirectedFrom?.path).toBe('/panalysis/plan')
  })

  it('旧 /panalysis 缺省 redirect 到 /insight/board', async () => {
    await router.push('/panalysis')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.path).toBe('/insight/board')
    expect(cur.redirectedFrom?.path).toBe('/panalysis')
  })

  it('旧 /board 导航 redirect 到 /insight/board 并保 query(dim)', async () => {
    await router.push('/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.path).toBe('/insight/board')
    expect(cur.query.dim).toBe('orgL4')
    expect(cur.redirectedFrom?.path).toBe('/board')
  })

  it('旧 /payment/board 导航 redirect 到 /insight/board 并保 query(dim)', async () => {
    await router.push('/payment/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.path).toBe('/insight/board')
    expect(cur.query.dim).toBe('orgL4')
    expect(cur.redirectedFrom?.path).toBe('/payment/board')
  })

  it('旧 /calendar 导航 redirect 到 /insight/calendar', async () => {
    await router.push('/calendar')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('calendar')
    expect(cur.path).toBe('/insight/calendar')
    expect(cur.redirectedFrom?.path).toBe('/calendar')
  })

  it('旧 /analysis/:tab 导航 redirect 到 /payment/:tab', async () => {
    await router.push('/analysis/risk')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-risk')
    expect(cur.redirectedFrom?.path).toBe('/analysis/risk')
    expect(Object.keys(cur.query).length).toBe(0)
  })

  it('resolves project detail with id param', () => {
    const r = router.resolve('/project/QABJ-SS-1')
    expect(r.params.id).toBe('QABJ-SS-1')
    expect(r.name).toBe('project-detail')
  })

  it('unknown path falls back to overview', () => {
    const r = router.resolve('/nonexistent-xyz')
    expect(r.name).toBe('overview')
  })

  it('/ resolves overview and /payment resolves dashboard', () => {
    expect(router.resolve('/').name).toBe('overview')
    expect(router.resolve('/payment').name).toBe('payment')
  })
})
```

- [ ] **Step 2: 运行测试确认变红**

Run: `cd frontend && npm run test:run -- src/router/index.test.ts`
Expected: FAIL（`/insight/board` 等路由尚不存在；MilestoneView/CostDetailView import 未建）。

- [ ] **Step 3: 创建共享占位组件 `PageStub.vue`**

`frontend/src/components/PageStub.vue`：

```vue
<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="page-stub">
    <h1 class="ps-title">{{ title }}</h1>
    <p class="ps-msg">建设中</p>
  </div>
</template>

<style scoped>
.page-stub { padding: var(--sp-5); }
.ps-title { font-size: var(--fs-5); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.ps-msg { font-size: var(--fs-2); color: var(--mut); margin: 0; }
</style>
```

- [ ] **Step 4: 创建两个 stub 视图**

`frontend/src/views/MilestoneView.vue`：

```vue
<script setup lang="ts">
import PageStub from '@/components/PageStub.vue'
</script>

<template>
  <PageStub title="里程碑管理" />
</template>
```

`frontend/src/views/CostDetailView.vue`：

```vue
<script setup lang="ts">
import PageStub from '@/components/PageStub.vue'
</script>

<template>
  <PageStub title="成本分析" />
</template>
```

> 注意：`<script setup>` 默认组件名取自文件名，故 `MilestoneView.vue` 的 `__name` 为 `MilestoneView`、`CostDetailView.vue` 为 `CostDetailView`，与 Step 1 测试断言一致。

- [ ] **Step 5: 改 `frontend/src/router/index.ts`**

5a. 在文件顶部 import 区（现有 `import InsightView ...` 之后）新增两行：

```ts
import MilestoneView from '@/views/MilestoneView.vue'
import CostDetailView from '@/views/CostDetailView.vue'
```

5b. **删除**旧的 `/calendar` 行（原第 38 行）：

```ts
    { path: '/calendar', name: 'calendar', component: CalendarView, meta: { title: '回款日历' } },
```

5c. 在 `/insight` 路由行（`{ path: '/insight', name: 'insight', ... }`）之后**插入** 4 行 `/insight/*`：

```ts
    // 项目分析子页(V1.16.0):milestone/costdetail 新建,board/calendar 迁自回款子域。
    // 均为精确路径,勿引入 /insight/:param 通配,否则会遮蔽 /insight 的 InsightView。
    { path: '/insight/milestone', name: 'insight-milestone', component: MilestoneView, meta: { title: '里程碑管理', hideFilter: true } },
    { path: '/insight/costdetail', name: 'insight-costdetail', component: CostDetailView, meta: { title: '成本分析', hideFilter: true } },
    { path: '/insight/board', name: 'pay-board', component: BoardView, meta: { title: '回款多维分析' } },
    { path: '/insight/calendar', name: 'calendar', component: CalendarView, meta: { title: '回款日历' } },
```

5d. **删除**旧的 `/payment/board` 行（原第 43 行）：

```ts
    { path: '/payment/board', name: 'pay-board', component: BoardView, meta: { title: '多维看板' } },
```

5e. 把旧 redirect 块（原第 48-51 行）整体替换为：

```ts
    // 兼容旧深链:board/calendar 迁至 /insight 后,旧路径单跳 redirect 到新规范路径(保 query;board 依赖 ?dim=)
    { path: '/payment/board', redirect: (to) => ({ path: '/insight/board', query: to.query }) },
    { path: '/calendar', redirect: (to) => ({ path: '/insight/calendar', query: to.query }) },
    { path: '/panalysis/:tab?', redirect: (to) => { const t = String(to.params.tab || 'board'); return { path: t === 'board' ? '/insight/board' : '/payment/' + t, query: to.query } } },
    { path: '/board', redirect: (to) => ({ path: '/insight/board', query: to.query }) },
    { path: '/analysis/:tab', redirect: (to) => { const t = String(to.params.tab); return { path: t === 'board' ? '/insight/board' : '/payment/' + t, query: to.query } } },
```

> 改完后 `/payment` 块仅余 projects/nodes/plan/risk 四行；board 不再在 `/payment/*` 下。`BoardView`、`CalendarView` 的 import 仍保留（被 `/insight/board`、`/insight/calendar` 使用）。

- [ ] **Step 6: 运行测试确认转绿**

Run: `cd frontend && npm run test:run -- src/router/index.test.ts`
Expected: PASS（全部用例绿）。

- [ ] **Step 7: 回归 board/calendar 组件测试（不应改这两个文件）**

Run: `cd frontend && npm run test:run -- src/views/BoardView.test.ts src/views/CalendarView.test.ts`
Expected: PASS（组件零改动，迁移只动路由表，故仍绿）。若变红，说明组件意外依赖了自身路径——停下排查，勿强改测试。

- [ ] **Step 8: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无错误。

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/PageStub.vue frontend/src/views/MilestoneView.vue frontend/src/views/CostDetailView.vue frontend/src/router/index.ts frontend/src/router/index.test.ts
git commit -m "feat(router): /insight 子域迁移 board/calendar + 新增里程碑/成本 stub + redirect 兼容 (SP-A·V1.16.0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 导航重组（项目分析分区 + 侧栏渲染）

**Files:**
- Modify: `frontend/src/nav.ts`
- Modify: `frontend/src/layout/AppSidebar.vue`
- Test: `frontend/src/layout/AppSidebar.test.ts`（修改现有）

**Interfaces:**
- Consumes：Task 1 提供的 `/insight`、`/insight/milestone`、`/insight/costdetail`、`/insight/board`、`/insight/calendar` 路由。
- Produces：`ANALYSIS_LINKS: NavLink[]`（导出，供 AppSidebar 渲染）；侧栏新增"项目分析"分区。

- [ ] **Step 1: 更新 AppSidebar 测试（先变红）**

把 `frontend/src/layout/AppSidebar.test.ts` 改为下述内容（整文件替换）：

```ts
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
      { path: '/projects', component: { template: '<div/>' } },
      { path: '/projects/closed', component: { template: '<div/>' } },
      { path: '/activity', component: { template: '<div/>' } },
      { path: '/insight', component: { template: '<div/>' } },
      { path: '/insight/milestone', component: { template: '<div/>' } },
      { path: '/insight/costdetail', component: { template: '<div/>' } },
      { path: '/insight/board', component: { template: '<div/>' } },
      { path: '/insight/calendar', component: { template: '<div/>' } },
      { path: '/payment', component: { template: '<div/>' } },
      { path: '/payment/projects', component: { template: '<div/>' } },
      { path: '/payment/nodes', component: { template: '<div/>' } },
      { path: '/payment/plan', component: { template: '<div/>' } },
      { path: '/payment/risk', component: { template: '<div/>' } },
      { path: '/ledger', name: 'ledger', component: { template: '<div/>' } },
      { path: '/data', component: { template: '<div/>' } },
      { path: '/governance', component: { template: '<div/>' } },
      { path: '/about', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('AppSidebar', () => {
  it('renders 项目/项目分析/回款/工具 四段分组', async () => {
    const router = makeRouter()
    router.push('/')
    await router.isReady()
    const wrapper = mount(AppSidebar, { global: { plugins: [router] } })
    const text = wrapper.text()
    expect(text).toContain('项目总览')        // 项目组（P4 新首页）
    expect(text).toContain('在建项目')        // 项目组（在建）
    expect(text).toContain('已关闭项目')      // 项目组（已关闭）
    expect(text).toContain('项目动态')
    expect(text).toContain('项目分析')        // 项目分析分区标题
    expect(text).toContain('项目多维分析')    // 项目分析组：现 InsightView
    expect(text).toContain('里程碑管理')      // 项目分析组：SP-B 新页
    expect(text).toContain('成本分析')        // 项目分析组：SP-C 新页
    expect(text).toContain('回款多维分析')    // 项目分析组：迁自 /payment/board
    expect(text).toContain('回款日历')        // 项目分析组：迁自 /calendar
    expect(text).toContain('回款总览')        // 回款组
    expect(text).toContain('回款项目')
    expect(text).toContain('回款节点')
    expect(text).toContain('回款进度')
    expect(text).toContain('风险项目')
    expect(text).toContain('回款台账')
    expect(text).toContain('数据管理')        // 工具组
    expect(text).not.toContain('看板首页')    // 旧 label 退场
    expect(text).not.toContain('回款分析')    // SP4 拆分后单入口退场
    expect(text).not.toContain('多维看板')    // 迁移后更名为「回款多维分析」
    // 项目分析(5) + 回款子域(6) 均为 .nav-sub 二级呈现 = 11
    expect(wrapper.findAll('.nav-sub').length).toBe(11)
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

- [ ] **Step 2: 运行确认变红**

Run: `cd frontend && npm run test:run -- src/layout/AppSidebar.test.ts`
Expected: FAIL（`ANALYSIS_LINKS` 未导出 / `.nav-sub` 仍 8 / 缺新 label）。

- [ ] **Step 3: 改 `frontend/src/nav.ts`**

3a. 把 `PROJECT_LINKS` 改为（去掉「项目分析」行）：

```ts
// 项目主域（P2 起逐期补全：P3 项目动态 /activity、P4 项目总览 /、子项目2 已关闭项目）
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目总览', to: '/' },
  { label: '在建项目', to: '/projects' },
  { label: '已关闭项目', to: '/projects/closed' },
  { label: '项目动态', to: '/activity' },
]
```

3b. 在 `PROJECT_LINKS` 之后**新增** `ANALYSIS_LINKS`：

```ts
// 项目分析中心（V1.16.0）：/insight 主入口下挂 5 子页，侧栏二级缩进(.nav-sub)平铺
export const ANALYSIS_LINKS: NavLink[] = [
  { label: '项目多维分析', to: '/insight' },
  { label: '里程碑管理', to: '/insight/milestone' },
  { label: '成本分析', to: '/insight/costdetail' },
  { label: '回款多维分析', to: '/insight/board' },
  { label: '回款日历', to: '/insight/calendar' },
]
```

3c. 把 `PAYMENT_LINKS` 改为（去掉「多维看板」「回款日历」两行）：

```ts
// 回款重点子域（SP4 拆分；V1.16.0 board/calendar 迁出至项目分析中心）
export const PAYMENT_LINKS: NavLink[] = [
  { label: '回款总览', to: '/payment' },
  { label: '回款项目', to: '/payment/projects' },
  { label: '回款节点', to: '/payment/nodes' },
  { label: '回款进度', to: '/payment/plan' },
  { label: '风险项目', to: '/payment/risk' },
  { label: '回款台账', to: '/ledger' },
]
```

- [ ] **Step 4: 改 `frontend/src/layout/AppSidebar.vue`**

4a. import 行加入 `ANALYSIS_LINKS`：

```ts
import { PROJECT_LINKS, ANALYSIS_LINKS, PAYMENT_LINKS, TOOL_LINKS } from '@/nav'
```

4b. 在"项目"`<div class="section">`（PROJECT_LINKS）与"回款"section 之间**插入**项目分析分区：

```html
      <div class="section">
        <div class="section-label">项目分析</div>
        <RouterLink v-for="link in ANALYSIS_LINKS" :key="link.to" :to="link.to"
          class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
      </div>
```

> 复用现有 `.section`/`.section-label`/`.nav-sub` 样式（已在本文件 `<style scoped>` 定义），不新增散值。

- [ ] **Step 5: 运行确认转绿**

Run: `cd frontend && npm run test:run -- src/layout/AppSidebar.test.ts`
Expected: PASS。

- [ ] **Step 6: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无错误。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/nav.ts frontend/src/layout/AppSidebar.vue frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(nav): 新增「项目分析」侧栏分区(5 子页) + board/calendar 移出回款子域 (SP-A·V1.16.0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 程序化跳转目标更新 + 版本号

**Files:**
- Modify: `frontend/src/lib/navContext.ts`
- Test: `frontend/src/lib/navContext.test.ts`（修改现有）
- Test: `frontend/src/components/OrgRanking.test.ts`（修改现有断言，不改 `OrgRanking.vue`）
- Modify: `frontend/src/version.ts`

**Interfaces:**
- Consumes：Task 1 的 `/insight/board` 路由。
- Produces：`goBoard()` 推送到 `/insight/board`（保持 `{ dim }` query 签名不变）。

- [ ] **Step 1: 更新 navContext 测试（先变红）**

把 `frontend/src/lib/navContext.test.ts` 改为：

```ts
import { describe, it, expect, vi } from 'vitest'
import { goBoard } from './navContext'

describe('goBoard', () => {
  it('push 到 /insight/board 并带 dim query', () => {
    const router = { push: vi.fn() } as any
    goBoard(router, 'orgL4')
    expect(router.push).toHaveBeenCalledWith({ path: '/insight/board', query: { dim: 'orgL4' } })
  })
})
```

- [ ] **Step 2: 更新 OrgRanking 测试断言（先变红）**

在 `frontend/src/components/OrgRanking.test.ts` 中，把唯一一处 `/payment/board` 断言（约第 90、95 行）改为 `/insight/board`：

```ts
  it('点击排名行跳转 /insight/board（orgL4 维度）', async () => {
    seed()
    pushSpy.mockClear()
    const w = mount(OrgRanking)
    await w.findAll('.rank-item')[0].trigger('click')
    expect(pushSpy).toHaveBeenCalledWith({ path: '/insight/board', query: { dim: 'orgL4' } })
  })
```

> 只改这一处 `it` 块的标题文本与 `toHaveBeenCalledWith` 断言；文件其余部分（seed/seedMany/其它用例）不动。

- [ ] **Step 3: 运行确认变红**

Run: `cd frontend && npm run test:run -- src/lib/navContext.test.ts src/components/OrgRanking.test.ts`
Expected: FAIL（实现仍 push `/payment/board`）。

- [ ] **Step 4: 改 `frontend/src/lib/navContext.ts`**

整文件改为：

```ts
import type { Router } from 'vue-router'

/** 带维度跳转回款多维分析(board)。年/视角等全局筛选由 filter store 跨页保留,此处只传维度。
 *  V1.16.0:board 迁至 /insight/board(项目分析中心)。 */
export function goBoard(router: Router, dim: string): void {
  router.push({ path: '/insight/board', query: { dim } })
}
```

- [ ] **Step 5: 运行确认转绿**

Run: `cd frontend && npm run test:run -- src/lib/navContext.test.ts src/components/OrgRanking.test.ts`
Expected: PASS。

- [ ] **Step 6: 版本号 V1.16.0**

把 `frontend/src/version.ts` 改为：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.16.0'
export const RELEASE_DATE = '2026-06-20'
```

- [ ] **Step 7: 全量前端验证**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: typecheck 无错误；vitest 全绿。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/navContext.ts frontend/src/components/OrgRanking.test.ts frontend/src/lib/navContext.test.ts frontend/src/version.ts
git commit -m "feat(nav): goBoard 跳转改 /insight/board + 版本 V1.16.0 (SP-A 收尾)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 收尾验证（全分支，控制器执行，非任务）

- [ ] Run: `bash verify.sh` —— 后端 ruff + pytest + 前端 typecheck/vitest/build 全绿（SP-A 未碰后端，后端应原样绿）。
- [ ] 手动冒烟：`python server.py`(:8080) + `cd frontend && npm run dev`(:5173)，验证：
  - 侧栏出现"项目分析"分区，5 个二级链接可点；点击各项落到对应页（milestone/costdetail 显"建设中"占位）。
  - 浏览器直接访问旧链接 `/payment/board?dim=orgL4`、`/calendar`、`/board?dim=orgL4` 均跳到 `/insight/*` 且 board 维度生效。
  - board/calendar 页功能与迁移前一致（FilterBar 仍显示并联动）。
  - 控制台无报错。

---

## Self-Review（已对照 spec §1/§2-SP-A/§8 + 6 个受影响测试核验）

- **Spec 覆盖**：迁移 board/calendar ✓（Task 1）；新增 milestone/costdetail stub ✓（Task 1）；redirect 保 query ✓（Task 1，含 `/payment/board`、`/calendar`、`/board`、`/panalysis`、`/analysis`）；nav 重组（board/calendar 移出 PAYMENT_LINKS、并入项目分析二级缩进）✓（Task 2）；`navContext.goBoard` 改址 ✓（Task 3）；6 个受影响测试断言修订 ✓（router/navContext/OrgRanking/AppSidebar 改；BoardView/CalendarView 经核实无需改，仅回归）；V1.16.0 ✓（Task 3）。
- **Placeholder 扫描**：无 TBD/TODO；每个改动均给出完整代码或整文件替换。
- **类型/命名一致**：路由 `name` 全程一致（`pay-board`/`calendar` 保留迁移）；`ANALYSIS_LINKS` 在 Task 2 定义、AppSidebar 同名消费；`goBoard` 签名 `(router, dim)` 不变。
- **硬约束守护**：未引入 `/insight/:param`/`/payment/:param` 通配（全精确路径并加注释）；样式仅复用既有令牌类，无散值；redirect 单跳保 query。
