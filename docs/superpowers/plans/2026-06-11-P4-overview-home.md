# P4 项目总览首页（布局 2）+ 旧首页迁 /payment 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/` 上线驾驶舱式项目总览（KPI 条 + 健康度总览 + 回款重点带 + 风险焦点行 + 右栏动态流，spec 4.1 布局 2）；旧回款看板原样平移到 `/payment`（内容不动，P6 再瘦身）。

**Architecture:** 纯前端期。新 `lib/overview.ts` 三个纯函数（KPI/健康度汇总/回款重点带，now 注入）；`OverviewView.vue` 薄视图复用 HealthBadge/EventTimeline；路由让位 = catch-all 从 DashboardView 换为 OverviewView + 新增 `/payment`；风险焦点行"带筛选跳清单"通过 ProjectsView 读路由 query 初始化筛选实现（新增 paused/overspend 两个 URL-only 筛选 + 可关闭标签）。

**Tech Stack:** Vue3+TS+vitest；theme.css 令牌；既有组件复用。

---

## 设计决策（评审依据）

1. **两套口径并存且各自一致**：KPI 条的回款达成率用主域 projects[] 聚合（59.13% 基线）；回款重点带与 `/payment` 同口径——全部门 isPaymentRelated 节点（年度=planDate 当年、本月=planMonth 当月），因为各微块点击钻的就是 /payment。两处数字不必相等，分区标题已区分语义。
2. **KPI 条不可点击**（spec 4.1 只规定风险焦点行带筛选跳转、健康度风险卡跳详情、回款微块钻 /payment 子页——不做 spec 外的交互）。
3. **paused/overspend 是 URL-only 筛选**：spec 4.3 清单工具栏筛选集固定（不含暂停/超支），故这两个筛选不进工具栏下拉，仅由风险焦点行跳入时经 query 生效，页面显示可关闭标签「已暂停项目 ✕」/「超支项目 ✕」（✕ 为 CLAUDE.md 允许符号）。
4. **暂停口径 = `是否暂停 === true`**（8 个基线），不用 项目状态='项目暂停'（两者可能不一致，健康度规则也用 bool）。高风险口径 = `health.riskAbnormal`（最高等级=高且未关闭>0，6 个基线）；超支 = `cost.超支 === true`（43 个基线）。
5. **路由让位**：`/payment`（name `payment`，meta 回款总览，FilterBar 保留）= DashboardView 原样；catch-all+alias '/'（name 由 `dashboard` 改 `overview`，meta 项目总览，hideFilter: true——项目域页不用回款 FilterBar）。`dashboard` 路由名仅测试桩自建路由引用，改名安全（已核实）。
6. **时间依赖**：lib 的 `paymentBand(rawNodes, now)` 注入 now（HX-6 约定）；视图传 `new Date()`，视图测试的节点日期 fixture 用运行时日期动态构造，避免日历脆弱。
7. **真实数据基线**（2026-06-11，回归哨兵）：KPI 640/563/8/6/43/59.13%；健康度 547/82/11（无数据 0，仅在 org 文件缺失降级时出现）+ 四维 19/6/54/25；年度已回 4648/计划 11055 万、本月待回 887 万、7 天临期 2、延期 35（Top1 石家庄轨交到货款 1063 万）。
8. 右栏 = events 前 10 条（内嵌已新在前）+「查看全部 →」/activity；空态文案与 /activity 一致。

## 分级调度

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | lib/overview 三纯函数 | 中 | sonnet | 主循环核实 + 真实基线比对 |
| T2 | projectList 扩展 + ProjectsView query 筛选 | 中 | sonnet | 主循环核实 |
| T3 | OverviewView + 路由让位 + nav | 高 | opus | opus 双审（spec+质量） |
| T4 | 版本 V7.3.0 + PROGRESS + verify | 低 | 主循环亲做 | verify.sh |

子代理产出一律 git/vitest 直接核实，不采信自述。

---

### Task 1: lib/overview — KPI / 健康度汇总 / 回款重点带

**Files:**
- Create: `frontend/src/lib/overview.ts`
- Test: `frontend/src/lib/overview.test.ts`

- [ ] **Step 1: 失败测试** — 新建 `frontend/src/lib/overview.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis, RawNode } from '@/types/analysis'
import { computeKpis, healthSummary, paymentBand } from './overview'

const PAY0 = { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }

const PROJECTS = [
  { projectId: 'P-1', projectName: '甲', payment: { ...PAY0, expectedTotal: 1000, actualTotal: 600 }, deliveryCosts: [],
    health: { progressAbnormal: true, riskAbnormal: true, costAbnormal: false, paymentAbnormal: false, overall: '风险' } },
  { projectId: 'P-2', projectName: '乙', payment: { ...PAY0, expectedTotal: 1000, actualTotal: 0 }, deliveryCosts: [],
    health: { progressAbnormal: false, riskAbnormal: false, costAbnormal: true, paymentAbnormal: false, overall: '关注' } },
  { projectId: 'P-3', projectName: '丙', payment: { ...PAY0 }, deliveryCosts: [],
    health: { overall: '健康' } },
] as unknown as Project[]

const PMIS = {
  'P-1': { status: { 项目状态: '实施中', 是否暂停: false }, cost: { 超支: true } },
  'P-2': { status: { 项目状态: '项目暂停', 是否暂停: true }, cost: { 超支: false } },
} as unknown as Record<string, ProjectPmis>

describe('computeKpis', () => {
  it('六指标统计(实施中/暂停bool/高风险=riskAbnormal/超支/达成率)', () => {
    const k = computeKpis(PROJECTS, PMIS)
    expect(k.total).toBe(3)
    expect(k.active).toBe(1)
    expect(k.paused).toBe(1)
    expect(k.highRisk).toBe(1)
    expect(k.overspend).toBe(1)
    expect(k.paymentRatio).toBeCloseTo(0.3) // 600/2000
  })
  it('计划为 0 → 达成率 null', () => {
    expect(computeKpis([PROJECTS[2]], {}).paymentRatio).toBeNull()
  })
})

describe('healthSummary', () => {
  it('三档计数+四维异常+风险项目卡列表', () => {
    const h = healthSummary(PROJECTS)
    expect(h.counts).toEqual({ 健康: 1, 关注: 1, 风险: 1, 无数据: 0 })
    expect(h.dims).toEqual({ progress: 1, risk: 1, cost: 1, payment: 0 })
    expect(h.riskProjects.map((p) => p.projectId)).toEqual(['P-1'])
  })
  it('overall 缺失/未知值归无数据', () => {
    const h = healthSummary([{ projectId: 'X', health: {} } as unknown as Project])
    expect(h.counts.无数据).toBe(1)
  })
})

describe('paymentBand', () => {
  const NOW = new Date('2026-06-11T08:00:00')
  const NODES = [
    // 年内+本月+未回清 → 计入年度/本月
    { projectId: 'P-1', projectName: '甲', nodeName: 'a', isPaymentRelated: true, nodeStatus: '正常实施中',
      planDate: '2026-06-25', planMonth: '2026-06', expectedPayment: 500000, actualPayment: 100000 },
    // 7 天临期(6-13)且未回清
    { projectId: 'P-1', projectName: '甲', nodeName: 'b', isPaymentRelated: true, nodeStatus: '正常实施中',
      planDate: '2026-06-13', planMonth: '2026-06', expectedPayment: 200000, actualPayment: 0 },
    // 延期,待回 30 万
    { projectId: 'P-2', projectName: '乙', nodeName: 'c', isPaymentRelated: true, nodeStatus: '延期',
      planDate: '2026-03-31', planMonth: '2026-03', expectedPayment: 300000, actualPayment: 0 },
    // 去年节点不计年度
    { projectId: 'P-2', projectName: '乙', nodeName: 'd', isPaymentRelated: true, nodeStatus: '已全额回款',
      planDate: '2025-12-31', planMonth: '2025-12', expectedPayment: 100000, actualPayment: 100000 },
    // 非回款节点排除
    { projectId: 'P-3', projectName: '丙', nodeName: 'e', isPaymentRelated: false, planDate: '2026-06-12', expectedPayment: 999999 },
  ] as unknown as RawNode[]

  it('年度/本月/临期/延期Top 各口径', () => {
    const b = paymentBand(NODES, NOW)
    expect(b.yearExpected).toBe(1000000) // a+b+c
    expect(b.yearActual).toBe(100000)
    expect(b.monthPending).toBe(600000)  // a 余40万 + b 20万
    expect(b.dueSoon7).toBe(1)           // b(6-13);a(6-25)超窗;e 非回款排除
    expect(b.delayedTop).toEqual([
      { projectId: 'P-2', projectName: '乙', nodeName: 'c', remaining: 300000 },
    ])
  })
  it('延期超过 3 条只取待回金额 Top3', () => {
    const many = [1, 2, 3, 4].map((i) => ({
      projectId: `P-${i}`, projectName: `项${i}`, nodeName: `n${i}`, isPaymentRelated: true,
      nodeStatus: '延期', planDate: '2026-01-01', planMonth: '2026-01',
      expectedPayment: i * 100000, actualPayment: 0,
    })) as unknown as RawNode[]
    const b = paymentBand(many, NOW)
    expect(b.delayedTop.map((t) => t.remaining)).toEqual([400000, 300000, 200000])
  })
})
```

- [ ] **Step 2: 确认失败** — `cd frontend && npx vitest run src/lib/overview.test.ts` → FAIL（模块不存在）
- [ ] **Step 3: 实现** — 新建 `frontend/src/lib/overview.ts`：

```ts
import type { Project, ProjectPmis, RawNode } from '@/types/analysis'

// 项目总览(/)的纯计算层(spec 4.1)。两套口径:KPI 用主域 projects[] 聚合;
// 回款重点带与 /payment 同口径(全部门 isPaymentRelated 节点)——微块点击钻的就是 /payment。

export interface OverviewKpis {
  total: number
  active: number
  paused: number
  highRisk: number
  overspend: number
  paymentRatio: number | null
}

export function computeKpis(projects: Project[], pmisMap: Record<string, ProjectPmis>): OverviewKpis {
  let active = 0
  let paused = 0
  let overspend = 0
  let highRisk = 0
  let exp = 0
  let act = 0
  for (const p of projects) {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    if (m.status?.项目状态 === '实施中') active++
    if (m.status?.是否暂停 === true) paused++
    if (m.cost?.超支 === true) overspend++
    if (p.health?.riskAbnormal) highRisk++
    exp += p.payment?.expectedTotal ?? 0
    act += p.payment?.actualTotal ?? 0
  }
  return { total: projects.length, active, paused, highRisk, overspend, paymentRatio: exp > 0 ? act / exp : null }
}

export interface HealthSummary {
  counts: { 健康: number; 关注: number; 风险: number; 无数据: number }
  dims: { progress: number; risk: number; cost: number; payment: number }
  riskProjects: Project[]
}

export function healthSummary(projects: Project[]): HealthSummary {
  const counts = { 健康: 0, 关注: 0, 风险: 0, 无数据: 0 }
  const dims = { progress: 0, risk: 0, cost: 0, payment: 0 }
  const riskProjects: Project[] = []
  for (const p of projects) {
    const h = (p.health ?? {}) as Record<string, any>
    const overall = String(h.overall || '无数据')
    if (overall === '健康' || overall === '关注' || overall === '风险') counts[overall]++
    else counts.无数据++
    if (h.progressAbnormal) dims.progress++
    if (h.riskAbnormal) dims.risk++
    if (h.costAbnormal) dims.cost++
    if (h.paymentAbnormal) dims.payment++
    if (overall === '风险') riskProjects.push(p)
  }
  return { counts, dims, riskProjects }
}

export interface DelayedTopItem {
  projectId: string
  projectName: string
  nodeName: string
  remaining: number
}

export interface PaymentBand {
  yearExpected: number
  yearActual: number
  monthPending: number
  dueSoon7: number
  delayedTop: DelayedTopItem[]
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 回款重点带——now 注入便于测试(HX-6 约定);口径与 /payment 一致(全 isPaymentRelated 节点) */
export function paymentBand(rawNodes: RawNode[], now: Date): PaymentBand {
  const year = String(now.getFullYear())
  const month = isoDate(now).slice(0, 7)
  const today = isoDate(now)
  const until = isoDate(new Date(now.getTime() + 7 * 86400000))

  let yearExpected = 0
  let yearActual = 0
  let monthPending = 0
  let dueSoon7 = 0
  const delayed: DelayedTopItem[] = []
  for (const n of rawNodes) {
    if (!n.isPaymentRelated) continue
    const exp = Number(n.expectedPayment ?? 0)
    const act = Number(n.actualPayment ?? 0)
    const plan = String(n.planDate ?? '')
    if (plan.startsWith(year)) {
      yearExpected += exp
      yearActual += act
    }
    if (String(n.planMonth ?? '') === month) monthPending += Math.max(exp - act, 0)
    if (plan >= today && plan <= until && act < exp) dueSoon7++
    if (n.nodeStatus === '延期') {
      delayed.push({
        projectId: String(n.projectId ?? ''),
        projectName: String(n.projectName ?? ''),
        nodeName: String((n as Record<string, any>).nodeName ?? ''),
        remaining: Math.max(exp - act, 0),
      })
    }
  }
  delayed.sort((a, b) => b.remaining - a.remaining)
  return { yearExpected, yearActual, monthPending, dueSoon7, delayedTop: delayed.slice(0, 3) }
}
```

- [ ] **Step 4: 通过** — 同 Step 2 命令 PASS（7 cases）
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/overview.ts frontend/src/lib/overview.test.ts
git commit -m "feat(p4): lib/overview KPI/健康度汇总/回款重点带纯函数(now注入,双口径注释)"
```

---

### Task 2: projectList 扩展 paused/overspend + ProjectsView 路由 query 筛选

**Files:**
- Modify: `frontend/src/lib/projectList.ts`（ProjectRow/ProjectFilters/build/filter 四处小改）
- Modify: `frontend/src/views/ProjectsView.vue`（query 初始化 + 标签 chip）
- Test: `frontend/src/lib/projectList.test.ts`、`frontend/src/views/ProjectsView.test.ts`（各追加）

- [ ] **Step 1: 失败测试**

`frontend/src/lib/projectList.test.ts` 追加（文件已有 proj/PMIS/F0 fixtures；F0 需同步加两个新空字段，见 Step 3 说明）：

```ts
describe('paused/overspend 扩展(P4 风险焦点行)', () => {
  const PM2: Record<string, any> = {
    'QABJ-SS-1': { status: { 是否暂停: true }, cost: { 超支: true } },
  }
  it('build 取 是否暂停/超支 bool', () => {
    const [r] = buildProjectRows([proj()], PM2 as any)
    expect(r.paused).toBe(true)
    expect(r.overspend).toBe(true)
    const [r2] = buildProjectRows([proj({ projectId: 'NO-PMIS' })], PM2 as any)
    expect(r2.paused).toBe(false)
    expect(r2.overspend).toBe(false)
  })
  it('filter paused=yes / overspend=yes', () => {
    const rows = buildProjectRows([proj(), proj({ projectId: 'X2', projectName: '乙' })], PM2 as any)
    expect(filterProjectRows(rows, { ...F0, paused: 'yes' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, overspend: 'yes' })[0].projectId).toBe('QABJ-SS-1')
  })
})
```

`frontend/src/views/ProjectsView.test.ts`：把 seed 中 `'P-1'` 的 projectPmis 项 `cost: { 消耗比: 0.3 }` 改为 `cost: { 消耗比: 0.3, 超支: true }`（既有断言不受影响），追加：

```ts
  it('路由 query 初始化筛选并显示可关闭标签(风险焦点行跳入)', async () => {
    seed()
    await router.push('/projects?overspend=yes')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('超支项目')   // 标签
    expect(w.text()).toContain('P-1')
    expect(w.text()).not.toContain('P-2')   // P-2 无超支
    await w.find('.pv-tag button').trigger('click')
    expect(w.text()).toContain('P-2')       // 关闭标签恢复全量
  })

  it('query 初始化既有筛选(riskLevel)', async () => {
    seed()
    await router.push('/projects?riskLevel=中')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('P-1')
    expect(w.text()).not.toContain('P-2')
  })
```

- [ ] **Step 2: 确认失败** — `cd frontend && npx vitest run src/lib/projectList.test.ts src/views/ProjectsView.test.ts` → FAIL
- [ ] **Step 3: 实现**

`frontend/src/lib/projectList.ts`：
- `ProjectRow` 加两字段：`paused: boolean`、`overspend: boolean`
- `ProjectFilters` 加两字段：`paused: string`、`overspend: string`（注释 `// '' | 'yes'（URL-only,风险焦点行跳入）`）
- `buildProjectRows` 返回对象加：

```ts
      paused: status.是否暂停 === true,
      overspend: cost.超支 === true,
```

- `filterProjectRows` 加两条（presale 判断之前）：

```ts
    if (f.paused === 'yes' && !r.paused) return false
    if (f.overspend === 'yes' && !r.overspend) return false
```

- 测试文件中 `F0` 常量补 `paused: '', overspend: ''`。

`frontend/src/views/ProjectsView.vue`：
- import 行 `useRouter` 改为 `import { useRoute, useRouter } from 'vue-router'`，script 加 `const route = useRoute()`
- filters reactive 初始化加 `paused: '', overspend: ''`，其后追加：

```ts
// 路由 query → 初始筛选(项目总览风险焦点行带筛选跳入;仅取字符串值)
const QUERY_KEYS = ['search', 'stage', 'projectStatus', 'health', 'riskLevel', 'paymentStatus', 'presale', 'paused', 'overspend'] as const
for (const k of QUERY_KEYS) {
  const v = route.query[k]
  if (typeof v === 'string' && v) filters[k] = v
}
```

- 模板 toolbar 之后、空态/表格之前加（paused/overspend 不进工具栏下拉，设计决策 3）：

```vue
    <div v-if="filters.paused === 'yes' || filters.overspend === 'yes'" class="pv-tags">
      <span v-if="filters.paused === 'yes'" class="pv-tag">已暂停项目 <button @click="filters.paused = ''">✕</button></span>
      <span v-if="filters.overspend === 'yes'" class="pv-tag">超支项目 <button @click="filters.overspend = ''">✕</button></span>
    </div>
```

- style 追加：

```css
.pv-tags { display: flex; gap: 8px; margin-bottom: 10px; }
.pv-tag { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: var(--r-full); font-size: 12px; background: var(--selected-tint); color: var(--accent); font-weight: 600; }
.pv-tag button { border: none; background: none; color: var(--accent); cursor: pointer; padding: 0; font-size: 12px; }
```

- [ ] **Step 4: 通过** — 同 Step 2 命令 PASS；`npm run typecheck` 无错
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/projectList.ts frontend/src/lib/projectList.test.ts frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts
git commit -m "feat(p4): 清单页路由query筛选初始化 + paused/overspend URL-only筛选与可关闭标签"
```

---

### Task 3: OverviewView 项目总览 + 路由让位 + 导航

**Files:**
- Create: `frontend/src/views/OverviewView.vue`
- Modify: `frontend/src/router/index.ts`（/payment 新增 + catch-all 换组件改名）
- Modify: `frontend/src/nav.ts`（PROJECT_LINKS 加项目总览、PAYMENT_LINKS 回款总览改 /payment）
- Test: `frontend/src/views/OverviewView.test.ts`（新建）、`frontend/src/router/index.test.ts`、`frontend/src/layout/AppSidebar.test.ts`

- [ ] **Step 1: 失败测试**

新建 `frontend/src/views/OverviewView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import OverviewView from './OverviewView.vue'
import { useDataStore } from '@/stores/data'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: OverviewView },
      { path: '/projects', component: { template: '<div />' } },
      { path: '/project/:id', component: { template: '<div />' } },
      { path: '/payment', component: { template: '<div />' } },
      { path: '/followup', component: { template: '<div />' } },
      { path: '/activity', component: { template: '<div />' } },
    ],
  })
})

// 节点日期用运行时 now 动态构造,避免日历脆弱(设计决策 6)
const now = new Date()
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n: number) => iso(new Date(now.getTime() + n * 86400000))

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    projects: [
      { projectId: 'P-1', projectName: '风险甲', payment: { relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 600, remainingTotal: 400, paymentRatio: 0.6, delayedCount: 1 }, deliveryCosts: [],
        health: { progressAbnormal: true, riskAbnormal: true, costAbnormal: false, paymentAbnormal: true, overall: '风险' } },
      { projectId: 'P-2', projectName: '健康乙', payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }, deliveryCosts: [],
        health: { overall: '健康' } },
    ],
    projectPmis: {
      'P-1': { status: { 项目状态: '实施中', 是否暂停: false }, cost: { 超支: true } },
      'P-2': { status: { 项目状态: '实施中', 是否暂停: true }, cost: {} },
    },
    rawNodes: [
      { projectId: 'P-1', projectName: '风险甲', nodeName: '延期款', isPaymentRelated: true, nodeStatus: '延期',
        planDate: inDays(-30), planMonth: iso(now).slice(0, 7), expectedPayment: 300000, actualPayment: 0 },
      { projectId: 'P-1', projectName: '风险甲', nodeName: '临期款', isPaymentRelated: true, nodeStatus: '正常实施中',
        planDate: inDays(2), planMonth: iso(now).slice(0, 7), expectedPayment: 200000, actualPayment: 0 },
    ],
    events: Array.from({ length: 12 }, (_, i) => ({
      date: iso(now), type: '到账', domain: 'payment', projectId: 'P-1', projectName: '风险甲', summary: `事件${i}`,
    })),
  } as any
}

async function mountView() {
  await router.push('/')
  await router.isReady()
  const w = mount(OverviewView, { global: { plugins: [router] } })
  await flushPromises()
  return w
}

describe('OverviewView', () => {
  it('KPI 条六指标', async () => {
    seed()
    const w = await mountView()
    expect(w.text()).toContain('在管项目')
    expect(w.find('.ov-kpis').text()).toContain('2')   // 在管
    expect(w.text()).toContain('回款达成率')
    expect(w.text()).toContain('60%')                   // 600/1000 fmtRatio
  })

  it('健康度总览:三档计数+四维+风险卡点击跳详情', async () => {
    seed()
    const w = await mountView()
    const push = vi.spyOn(router, 'push')
    expect(w.text()).toContain('进度异常')
    const card = w.find('.ov-risk-card')
    expect(card.text()).toContain('风险甲')
    await card.trigger('click')
    expect(push).toHaveBeenCalledWith('/project/P-1')
  })

  it('回款重点带:年度进度/本月待回/7天临期/延期Top', async () => {
    seed()
    const w = await mountView()
    expect(w.text()).toContain('年度回款进度')
    expect(w.text()).toContain('本月待回款')
    expect(w.find('.ov-pay').text()).toContain('50')   // 本月待回 50 万(30+20)
    expect(w.text()).toContain('7 天临期')
    expect(w.text()).toContain('延期 Top')
    expect(w.find('.ov-top-item').text()).toContain('30') // 延期款待回 30 万
  })

  it('风险焦点行链接带筛选 query', async () => {
    seed()
    const w = await mountView()
    expect(w.find('a[href="/projects?riskLevel=%E9%AB%98"]').exists() || w.find('a[href="/projects?riskLevel=高"]').exists()).toBe(true)
    expect(w.find('a[href="/projects?paused=yes"]').exists()).toBe(true)
    expect(w.find('a[href="/projects?overspend=yes"]').exists()).toBe(true)
  })

  it('右栏动态最多 10 条 + 查看全部链接', async () => {
    seed()
    const w = await mountView()
    expect(w.findAll('.ev-item')).toHaveLength(10)
    expect(w.find('a[href="/activity"]').exists()).toBe(true)
  })

  it('无数据空态不崩(零项目零事件)', async () => {
    const ds = useDataStore()
    ds.data = { meta: {}, dashboard: {}, summary: {}, projectOverview: { projects: [], columns: [] }, naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {}, rawNodes: [], events: [] } as any
    const w = await mountView()
    expect(w.text()).toContain('首次同步，暂无变化记录')
    expect(w.text()).toContain('在管项目')
  })
})
```

`frontend/src/router/index.test.ts`：top-level 数组加 `'/payment'`；追加：

```ts
  it('/ resolves overview and /payment resolves old dashboard', () => {
    expect(router.resolve('/').name).toBe('overview')
    expect(router.resolve('/payment').name).toBe('payment')
  })
```

`frontend/src/layout/AppSidebar.test.ts`：三段分组用例加 `expect(text).toContain('项目总览')`。

- [ ] **Step 2: 确认失败** — 三文件 vitest → FAIL
- [ ] **Step 3: 实现**

`frontend/src/nav.ts`：

```ts
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目总览', to: '/' },
  { label: '项目清单', to: '/projects' },
  { label: '项目动态', to: '/activity' },
]
```

PAYMENT_LINKS 首项改 `{ label: '回款总览', to: '/payment' }`（注释更新：P4 已迁，P6 瘦身）。

`frontend/src/router/index.ts`：import 加 `import OverviewView from '@/views/OverviewView.vue'`；在 `/data` 条目前加：

```ts
    { path: '/payment', name: 'payment', component: DashboardView, meta: { title: '回款总览' } },
```

末行 catch-all 替换为：

```ts
    // catch-all(含 '/')渲染项目总览——P4 起 '/' 为项目主域首页,旧回款看板迁 /payment
    { path: '/:pathMatch(.*)*', name: 'overview', component: OverviewView, alias: '/', meta: { title: '项目总览', hideFilter: true } },
```

新建 `frontend/src/views/OverviewView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { Event, Project, ProjectPmis, RawNode } from '@/types/analysis'
import { computeKpis, healthSummary, paymentBand } from '@/lib/overview'
import { fmtWan, fmtRatio } from '@/lib/format'
import HealthBadge from '@/components/HealthBadge.vue'
import EventTimeline from '@/components/EventTimeline.vue'

const data = useDataStore()
const router = useRouter()
onMounted(() => { if (!data.data) data.load() })

const projects = computed(() => (data.data?.projects ?? []) as Project[])
const pmisMap = computed(() => (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)

const kpis = computed(() => computeKpis(projects.value, pmisMap.value))
const health = computed(() => healthSummary(projects.value))
const band = computed(() => paymentBand((data.data?.rawNodes ?? []) as RawNode[], new Date()))
const recentEvents = computed(() => ((data.data?.events ?? []) as Event[]).slice(0, 10))

const kpiCards = computed(() => [
  { k: '在管项目', v: String(kpis.value.total) },
  { k: '进行中', v: String(kpis.value.active) }, // spec 4.1 用词;口径=项目状态'实施中'
  { k: '暂停', v: String(kpis.value.paused) },
  { k: '高风险', v: String(kpis.value.highRisk) },
  { k: '超支', v: String(kpis.value.overspend) },
])
const HEALTH_KEYS = ['健康', '关注', '风险'] as const
const DIM_LABELS = [['progress', '进度'], ['risk', '风险'], ['cost', '成本'], ['payment', '回款']] as const
const yearPct = computed(() => (band.value.yearExpected > 0 ? Math.min(band.value.yearActual / band.value.yearExpected, 1) : 0))
</script>

<template>
  <div class="overview-view">
    <div class="ov-body">
      <div class="ov-main">
        <div class="ov-kpis">
          <div v-for="c in kpiCards" :key="c.k" class="ov-kpi">
            <div class="ov-kpi-v u-num">{{ c.v }}</div>
            <div class="ov-kpi-k">{{ c.k }}</div>
          </div>
          <div class="ov-kpi accent">
            <div class="ov-kpi-v u-num">{{ fmtRatio(kpis.paymentRatio) }}</div>
            <div class="ov-kpi-k">回款达成率</div>
          </div>
        </div>

        <section class="ov-card">
          <div class="ov-card-head">项目健康度</div>
          <div class="ov-health-row">
            <span v-for="k in HEALTH_KEYS" :key="k" class="ov-health-chip">
              <HealthBadge :overall="k" /><b class="u-num">{{ health.counts[k] }}</b>
            </span>
            <span v-if="health.counts.无数据" class="ov-health-chip">
              <HealthBadge overall="无数据" /><b class="u-num">{{ health.counts.无数据 }}</b>
            </span>
            <span v-for="[key, label] in DIM_LABELS" :key="key" class="ov-dim">{{ label }}异常 <b class="u-num">{{ health.dims[key] }}</b></span>
          </div>
          <div v-if="health.riskProjects.length" class="ov-risk-list">
            <button v-for="p in health.riskProjects" :key="p.projectId" class="ov-risk-card" @click="router.push(`/project/${p.projectId}`)">
              <span class="ov-risk-name">{{ p.projectName || p.projectId }}</span>
              <HealthBadge overall="风险" />
            </button>
          </div>
        </section>

        <section class="ov-card ov-pay">
          <div class="ov-card-head">回款重点 <RouterLink class="ov-more" to="/payment">回款总览 →</RouterLink></div>
          <div class="ov-pay-grid">
            <RouterLink class="ov-pay-block" to="/payment">
              <div class="ov-pay-bar"><div class="ov-pay-fill" :style="{ width: yearPct * 100 + '%' }"></div></div>
              <div class="ov-pay-v u-num">{{ fmtWan(band.yearActual) }} / {{ fmtWan(band.yearExpected) }} 万</div>
              <div class="ov-pay-k">年度回款进度</div>
            </RouterLink>
            <RouterLink class="ov-pay-block" to="/payment">
              <div class="ov-pay-v u-num">{{ fmtWan(band.monthPending) }} 万</div>
              <div class="ov-pay-k">本月待回款</div>
            </RouterLink>
            <RouterLink class="ov-pay-block" to="/followup">
              <div class="ov-pay-v u-num">{{ band.dueSoon7 }}</div>
              <div class="ov-pay-k">7 天临期</div>
            </RouterLink>
            <div class="ov-pay-block">
              <div class="ov-pay-k">延期 Top3（待回金额）</div>
              <button v-for="t in band.delayedTop" :key="`${t.projectId}-${t.nodeName}`" class="ov-top-item" @click="router.push(`/project/${t.projectId}`)">
                <span class="ov-top-name">{{ t.projectName || t.projectId }}</span>
                <span class="u-num">{{ fmtWan(t.remaining) }} 万</span>
              </button>
              <div v-if="!band.delayedTop.length" class="ov-empty-mini">无延期节点</div>
            </div>
          </div>
        </section>

        <section class="ov-focus">
          <RouterLink class="ov-focus-card danger" to="/projects?riskLevel=高">高风险 <b class="u-num">{{ kpis.highRisk }}</b></RouterLink>
          <RouterLink class="ov-focus-card warn" to="/projects?paused=yes">暂停 <b class="u-num">{{ kpis.paused }}</b></RouterLink>
          <RouterLink class="ov-focus-card warn" to="/projects?overspend=yes">超支 <b class="u-num">{{ kpis.overspend }}</b></RouterLink>
        </section>
      </div>

      <aside class="ov-aside">
        <div class="ov-aside-title">项目动态</div>
        <EventTimeline :events="recentEvents" empty-text="首次同步，暂无变化记录" />
        <RouterLink class="ov-more" to="/activity">查看全部 →</RouterLink>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.overview-view { padding: 16px; }
.ov-body { display: grid; grid-template-columns: minmax(0, 7fr) minmax(260px, 3fr); gap: 16px; align-items: start; }
.ov-kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.ov-kpi { flex: 1; min-width: 110px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px 16px; }
.ov-kpi.accent { border-color: var(--accent); }
.ov-kpi.accent .ov-kpi-v { color: var(--accent); }
.ov-kpi-v { font-size: 22px; font-weight: 700; color: var(--txt); line-height: var(--lh-tight, 1.15); }
.ov-kpi-k { font-size: 12px; color: var(--mut); margin-top: 4px; }
.ov-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 14px 16px; margin-bottom: 16px; }
.ov-card-head { font-weight: 700; font-size: 14px; color: var(--txt); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; }
.ov-more { font-size: 12px; color: var(--accent); text-decoration: none; font-weight: 600; }
.ov-health-row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 10px; }
.ov-health-chip { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--txt); }
.ov-dim { font-size: 12px; color: var(--sub); }
.ov-dim b { color: var(--txt); }
.ov-risk-list { display: flex; flex-wrap: wrap; gap: 8px; }
.ov-risk-card { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: var(--card2); border-radius: var(--r-sm); padding: 6px 10px; font-size: 13px; color: var(--txt); cursor: pointer; }
.ov-risk-card:hover { background: var(--hover-tint); }
.ov-pay { border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
.ov-pay-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.ov-pay-block { display: block; background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); padding: 10px 12px; text-decoration: none; }
.ov-pay-block:hover { background: var(--hover-tint); }
.ov-pay-bar { height: 8px; background: var(--line); border-radius: var(--r-full); overflow: hidden; margin-bottom: 6px; }
.ov-pay-fill { height: 100%; background: var(--accent); }
.ov-pay-v { font-size: 16px; font-weight: 700; color: var(--txt); }
.ov-pay-k { font-size: 12px; color: var(--mut); margin-top: 2px; }
.ov-top-item { display: flex; justify-content: space-between; gap: 8px; width: 100%; border: none; background: none; padding: 3px 0; font-size: 12px; color: var(--txt); cursor: pointer; text-align: left; }
.ov-top-item:hover { color: var(--accent); }
.ov-top-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-empty-mini { font-size: 12px; color: var(--mut); }
.ov-focus { display: flex; gap: 12px; }
.ov-focus-card { flex: 1; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: var(--r-md); font-size: 13px; font-weight: 600; text-decoration: none; border: 1px solid var(--line); }
.ov-focus-card b { font-size: 18px; }
.ov-focus-card.danger { background: var(--danger-bg); color: var(--danger-text); }
.ov-focus-card.warn { background: var(--warn-bg); color: var(--warn-text); }
.ov-aside { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 12px 14px; }
.ov-aside-title { font-weight: 700; font-size: 13px; color: var(--txt); margin-bottom: 8px; }
@media (max-width: 1200px) { .ov-body { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 4: 通过** — `cd frontend && npx vitest run src/views/OverviewView.test.ts src/router/index.test.ts src/layout/AppSidebar.test.ts` PASS；`npm run test:run` 全量无回归；`npm run typecheck` 无错
- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/OverviewView.vue frontend/src/views/OverviewView.test.ts frontend/src/router/index.ts frontend/src/router/index.test.ts frontend/src/nav.ts frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(p4): / 项目总览上线(KPI条+健康度+回款重点带+风险焦点行+右栏动态),旧首页迁 /payment"
```

---

### Task 4: 版本 V7.3.0 + PROGRESS + 全量验证（主循环亲做）

- [ ] `frontend/src/version.ts` → `APP_VERSION = 'V7.3.0'`
- [ ] `PROGRESS.md`：头部版本/日期；进行中 → P4 完成、下一步 P5（/insight 项目分析，项目域五页齐）；新 Handoff 段（双口径决策、真实基线 KPI 640/563/8/6/43/59.13%、烟雾清单：`/` 驾驶舱五区/`/payment` 旧看板原样/风险焦点行跳清单带标签/右栏 10 条）；backlog 补遗留。
- [ ] `bash verify.sh` 全绿。
- [ ] Commit：`chore(p4): 版本 V7.3.0 + PROGRESS 记录 P4 完成`
