# Plan B6：看板首页 — 图表 + 排名 + 延期榜 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补全看板首页的图表部分：季度/月度待回款堆叠柱图（用 B4 的 ChartBox）、服务组回款达成排名、延期 Top10，全部消费 `filterStore.filteredNodes`、随筛选联动，并忠实移植旧 app.js 的聚合语义。

**Architecture:** 纯前端。聚合逻辑放可单测的 `lib/dashboardCharts.ts`；图表组件用 ChartBox（vue-echarts），排名/延期用普通列表组件。Phase B 第六块，自成可运行/可测闭环。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + ChartBox(B4) + Vitest（已装）。

参考：spec §6；旧版忠实来源 `app.js`：`renderQuarterly`(1694-1750)、`renderMonthly`(1752-1836)、`renderRank`(1869-1904)、`renderDelayed`(1909-1951)、`getNodeRemaining`(652)。数据来自 `useDataStore`/`useFilterStore`；复用 `lib/dashboardStats.groupByProject`、`lib/format`。

**不在本计划（延后）：** 图表点击钻取弹窗（B-opt，后续用 Modal 补）；延期项点击跳转项目节点（目标 tier 页在 B7+ 才有，本计划延期项暂不可点）；旧版图表的横向滚动/自定义 tooltip 定位（展示从简，用户已接受）。

---

## File Structure（B6 产出）

```
frontend/src/
├── lib/dashboardCharts.ts + dashboardCharts.test.ts   # aggregateQuarterly/aggregateMonthly/rankByOrg/delayedTopProjects
├── components/PendingBarChart.vue + .test.ts           # 堆叠柱图（季度/月度通用，含 ChartBox）
├── components/OrgRanking.vue + .test.ts                # 服务组排名
├── components/DelayedTop.vue + .test.ts                # 延期 Top10
└── views/DashboardView.vue + .test.ts                  # 改：卡片下方加 图表/排名/延期
```

约定：从 `frontend/` 运行 npm；提交信息末尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。Windows，Bash 工具。

---

### Task 1: lib/dashboardCharts.ts 聚合函数

**Files:** Create `frontend/src/lib/dashboardCharts.ts`、`frontend/src/lib/dashboardCharts.test.ts`。忠实移植 renderQuarterly/renderMonthly/renderRank/renderDelayed 的聚合部分。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/dashboardCharts.test.ts
import { describe, it, expect } from 'vitest'
import { aggregateQuarterly, aggregateMonthly, rankByOrg, delayedTopProjects } from './dashboardCharts'

const NODES: any[] = [
  { projectId: 'P1', tier: '100万以上', orgL4: '北京', isPaymentRelated: true, nodeStatus: '延期', planMonth: '2026-02', expectedPayment: 1000000, actualPayment: 0, actualPaymentRatio: '0%', delayDays: 30 },
  { projectId: 'P2', tier: '50-100万', orgL4: '上海', isPaymentRelated: true, nodeStatus: '正常实施中', planMonth: '2026-05', expectedPayment: 800000, actualPayment: 200000, actualPaymentRatio: '25%', delayDays: 0 },
  { projectId: 'P3', tier: '100万以上', orgL4: '北京', isPaymentRelated: true, nodeStatus: '已全额回款', planMonth: '2026-03', expectedPayment: 500000, actualPayment: 500000, actualPaymentRatio: '100%', delayDays: 0 },
]

describe('aggregateQuarterly', () => {
  it('sums remaining(万) by tier×quarter, excludes fully-paid', () => {
    const r = aggregateQuarterly(NODES, 'all')
    // P3 已全额回款(ratio=100%) 被排除；P1→2026-Q1, P2→2026-Q2
    expect(r.categories).toEqual(['2026-Q1', '2026-Q2'])
    const above = r.series.find((s) => s.tier === '100万以上')!
    const mid = r.series.find((s) => s.tier === '50-100万')!
    expect(above.data).toEqual([100, 0])   // P1 remaining 1,000,000/10000 = 100万 in Q1
    expect(mid.data).toEqual([0, 60])      // P2 remaining 600,000/10000 = 60万 in Q2
  })
  it('fills all 4 quarters for a specific year', () => {
    const r = aggregateQuarterly(NODES, '2026')
    expect(r.categories).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4'])
  })
})

describe('aggregateMonthly', () => {
  it('sums remaining(万) by tier×month, excludes fully-paid', () => {
    const r = aggregateMonthly(NODES, 'all')
    expect(r.categories).toEqual(['2026-02', '2026-05'])
  })
  it('fills 12 months for a specific year', () => {
    const r = aggregateMonthly(NODES, '2026')
    expect(r.categories.length).toBe(12)
    expect(r.categories[0]).toBe('2026-01')
  })
})

describe('rankByOrg', () => {
  it('groups related nodes by orgL4 with achievementRate, sorted', () => {
    const r = rankByOrg(NODES, '', 'actualTotal')
    const bj = r.find((o) => o.org === '北京')!
    expect(bj.expectedTotal).toBe(1500000)  // P1+P3
    expect(bj.actualTotal).toBe(500000)
    expect(bj.achievementRate).toBeCloseTo(1 / 3)
    // 排序：北京 actualTotal 500000 > 上海 200000
    expect(r[0].org).toBe('北京')
  })
  it('tier filter restricts to that tier', () => {
    const r = rankByOrg(NODES, '50-100万', 'actualTotal')
    expect(r.map((o) => o.org)).toEqual(['上海'])
  })
})

describe('delayedTopProjects', () => {
  it('returns delayed projects sorted by max delayDays', () => {
    const r = delayedTopProjects(NODES, 10)
    expect(r.length).toBe(1)
    expect(r[0].projectId).toBe('P1')
    expect(r[0].maxDelay).toBe(30)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/dashboardCharts.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/lib/dashboardCharts.ts`**

```ts
import type { RawNode } from '@/types/analysis'
import { pctToNum } from './format'
import { groupByProject } from './dashboardStats'

const TIER_KEYS = ['100万以上', '50-100万', '50万以下'] as const

function remaining(n: Record<string, any>): number {
  return (n.expectedPayment || 0) - (n.actualPayment || 0)
}

/** 关联回款 且 未全额回款（实际比例为空或 <1）—— 待回款节点 */
function pendingNodes(nodes: RawNode[]): RawNode[] {
  return nodes.filter((raw) => {
    const n = raw as Record<string, any>
    if (!n.isPaymentRelated) return false
    const ar = pctToNum(n.actualPaymentRatio)
    return ar === null || ar < 1
  })
}

export interface PeriodSeries {
  categories: string[]
  series: { tier: string; data: number[] }[]
}

function isSpecificYear(filterYear: string): boolean {
  return filterYear !== 'all' && !filterYear.startsWith('upto') && !filterYear.includes('-Q')
}

function quarterOf(planMonth: string): string {
  const [y, moStr] = planMonth.split('-')
  const mo = parseInt(moStr, 10)
  const q = mo <= 3 ? 'Q1' : mo <= 6 ? 'Q2' : mo <= 9 ? 'Q3' : 'Q4'
  return `${y}-${q}`
}

function buildPeriodSeries(
  nodes: RawNode[],
  keyOf: (planMonth: string) => string,
  fillKeys: string[],
): PeriodSeries {
  const byTier: Record<string, Record<string, number>> = {}
  TIER_KEYS.forEach((t) => (byTier[t] = {}))
  const catSet: Record<string, true> = {}
  for (const raw of pendingNodes(nodes)) {
    const n = raw as Record<string, any>
    const m = n.planMonth
    if (!m) continue
    const k = keyOf(m)
    const tier = n.tier as string
    if (!byTier[tier]) byTier[tier] = {}
    byTier[tier][k] = (byTier[tier][k] || 0) + remaining(n) / 10000
    catSet[k] = true
  }
  for (const k of fillKeys) {
    catSet[k] = true
    TIER_KEYS.forEach((t) => { if (byTier[t][k] === undefined) byTier[t][k] = 0 })
  }
  const categories = Object.keys(catSet).sort()
  return {
    categories,
    series: TIER_KEYS.map((t) => ({ tier: t, data: categories.map((c) => byTier[t][c] || 0) })),
  }
}

/** 季度待回款（万），忠实移植 renderQuarterly 聚合 + 具体年份补全 4 季度。 */
export function aggregateQuarterly(nodes: RawNode[], filterYear: string): PeriodSeries {
  const fill = isSpecificYear(filterYear) ? ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => `${filterYear}-${q}`) : []
  return buildPeriodSeries(nodes, quarterOf, fill)
}

/** 月度待回款（万），忠实移植 renderMonthly 聚合 + 具体年份补全 12 月。
 *  （输入应为已按周期筛选的 filteredNodes，故不再重复月份边界过滤——结果等价。） */
export function aggregateMonthly(nodes: RawNode[], filterYear: string): PeriodSeries {
  const fill = isSpecificYear(filterYear)
    ? Array.from({ length: 12 }, (_, i) => `${filterYear}-${String(i + 1).padStart(2, '0')}`)
    : []
  return buildPeriodSeries(nodes, (m) => m, fill)
}

export interface OrgRank {
  org: string
  expectedTotal: number
  actualTotal: number
  actualTotalWan: number
  achievementRate: number
}

/** 服务组排名（忠实移植 renderRank 聚合）：按 orgL4 汇总关联回款节点，可选 tier 过滤，按 sortBy 降序。 */
export function rankByOrg(
  nodes: RawNode[],
  tierFilter: string,
  sortBy: 'actualTotal' | 'achievementRate',
): OrgRank[] {
  let ns = nodes.filter((n) => (n as Record<string, any>).isPaymentRelated)
  if (tierFilter) ns = ns.filter((n) => n.tier === tierFilter)
  const m: Record<string, OrgRank> = {}
  for (const raw of ns) {
    const n = raw as Record<string, any>
    const org = n.orgL4 || '未指定'
    if (!m[org]) m[org] = { org, expectedTotal: 0, actualTotal: 0, actualTotalWan: 0, achievementRate: 0 }
    m[org].expectedTotal += n.expectedPayment || 0
    m[org].actualTotal += n.actualPayment || 0
  }
  const list = Object.values(m).map((o) => ({
    ...o,
    achievementRate: o.expectedTotal > 0 ? o.actualTotal / o.expectedTotal : 0,
    actualTotalWan: o.actualTotal / 10000,
  }))
  return list.sort((a, b) => b[sortBy] - a[sortBy])
}

export interface DelayedProject {
  projectId: string
  projectName: string
  orgL4: string
  tier: string
  maxDelay: number
}

/** 延期 TopN（忠实移植 renderDelayed）：groupByProject → 状态=延期 → 按最大 delayDays 降序。 */
export function delayedTopProjects(nodes: RawNode[], limit = 10): DelayedProject[] {
  const projs = groupByProject(nodes).filter((p) => p.paymentStatus === '延期')
  const withDelay = projs.map((p) => {
    let maxDelay = 0
    for (const n of p.nodes) {
      const d = (n as Record<string, any>).delayDays || 0
      if (d > maxDelay) maxDelay = d
    }
    return { projectId: p.projectId, projectName: p.projectName, orgL4: p.orgL4, tier: p.tier, maxDelay }
  })
  withDelay.sort((a, b) => b.maxDelay - a.maxDelay)
  return withDelay.slice(0, limit)
}
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/dashboardCharts.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/dashboardCharts.ts frontend/src/lib/dashboardCharts.test.ts
git commit -m "feat(frontend): lib/dashboardCharts（季度/月度聚合 + 服务组排名 + 延期Top 忠实移植）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: PendingBarChart 组件（堆叠柱图）

**Files:** Create `frontend/src/components/PendingBarChart.vue`、`frontend/src/components/PendingBarChart.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/PendingBarChart.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PendingBarChart from './PendingBarChart.vue'
import ChartBox from '@/charts/ChartBox.vue'

describe('PendingBarChart', () => {
  it('builds a stacked bar option with 3 tier series and passes it to ChartBox', () => {
    const wrapper = mount(PendingBarChart, {
      props: {
        categories: ['2026-Q1', '2026-Q2'],
        series: [
          { tier: '100万以上', data: [100, 0] },
          { tier: '50-100万', data: [0, 60] },
          { tier: '50万以下', data: [0, 0] },
        ],
      },
    })
    const cb = wrapper.findComponent(ChartBox)
    expect(cb.exists()).toBe(true)
    const option = cb.props('option') as any
    expect(option.series).toHaveLength(3)
    expect(option.series[0].stack).toBe('a')
    expect(option.xAxis.data).toEqual(['2026-Q1', '2026-Q2'])
    expect(option.series[0].data).toEqual([100, 0])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/PendingBarChart.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/components/PendingBarChart.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import ChartBox from '@/charts/ChartBox.vue'
import type { PeriodSeries } from '@/lib/dashboardCharts'

const props = defineProps<{
  categories: string[]
  series: PeriodSeries['series']
  height?: string
}>()

const COLORS = ['#EF4444', '#F59E0B', '#10B981']

const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 60, right: 25, top: 25, bottom: 25 },
  xAxis: { type: 'category', data: props.categories },
  yAxis: { type: 'value', name: '金额(万)' },
  series: props.series.map((s, i) => ({
    name: s.tier,
    type: 'bar',
    stack: 'a',
    data: s.data,
    itemStyle: { color: COLORS[i % COLORS.length] },
  })),
}))
</script>

<template>
  <ChartBox :option="option" :height="height || '300px'" />
</template>
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/components/PendingBarChart.test.ts`（PASS；ChartBox 内部 VChart 已由测试 alias 桩替换，不触 canvas）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/PendingBarChart.vue frontend/src/components/PendingBarChart.test.ts
git commit -m "feat(frontend): PendingBarChart 堆叠柱图（封装 ChartBox，季度/月度通用）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: OrgRanking 组件（服务组排名）

**Files:** Create `frontend/src/components/OrgRanking.vue`、`frontend/src/components/OrgRanking.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/OrgRanking.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import OrgRanking from './OrgRanking.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', orgL4: '北京服务组', isPaymentRelated: true, expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-02' },
      { projectId: 'P2', tier: '50-100万', orgL4: '上海一服务组', isPaymentRelated: true, expectedPayment: 800000, actualPayment: 200000, planMonth: '2026-05' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('OrgRanking', () => {
  it('renders ranked orgs with amount and rate', () => {
    seed()
    const wrapper = mount(OrgRanking)
    const text = wrapper.text()
    expect(text).toContain('北京服务组')
    expect(text).toContain('上海一服务组')
    expect(text).toContain('60%')   // 北京 600000/1000000
  })

  it('tier filter restricts orgs', async () => {
    seed()
    const wrapper = mount(OrgRanking)
    await wrapper.get('[data-test="rank-tier"]').setValue('50-100万')
    const text = wrapper.text()
    expect(text).toContain('上海一服务组')
    expect(text).not.toContain('北京服务组')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/OrgRanking.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/components/OrgRanking.vue`**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { rankByOrg } from '@/lib/dashboardCharts'
import { fmtWan, pct } from '@/lib/format'
import { TIERS } from '@/nav'

const filter = useFilterStore()
const tierFilter = ref('')
const sortBy = ref<'actualTotal' | 'achievementRate'>('actualTotal')

const ranked = computed(() => rankByOrg(filter.filteredNodes, tierFilter.value, sortBy.value).slice(0, 15))
const maxActual = computed(() => Math.max(1, ...ranked.value.map((o) => o.actualTotal)))

function rateColor(r: number): string {
  return r >= 0.45 ? '#10b981' : r >= 0.3 ? '#f59e0b' : '#ef4444'
}
</script>

<template>
  <div class="org-ranking">
    <div class="or-toolbar">
      <select data-test="rank-tier" v-model="tierFilter">
        <option value="">全部区间</option>
        <option v-for="t in TIERS" :key="t.slug" :value="t.label">{{ t.label }}</option>
      </select>
      <select data-test="rank-sort" v-model="sortBy">
        <option value="actualTotal">已回款金额</option>
        <option value="achievementRate">已回款达成率</option>
      </select>
    </div>
    <div v-for="(o, i) in ranked" :key="o.org" class="rank-item">
      <span class="rank-no">{{ i + 1 }}</span>
      <span class="rank-name" :title="o.org">{{ o.org }}</span>
      <span class="rank-bar-wrap">
        <span class="rank-bar" :style="{ width: (o.actualTotal / maxActual * 100).toFixed(1) + '%', background: rateColor(o.achievementRate) }" />
      </span>
      <span class="rank-amount">{{ fmtWan(o.actualTotal) }} 万</span>
      <span class="rank-rate" :style="{ color: rateColor(o.achievementRate) }">{{ pct(o.achievementRate) }}</span>
    </div>
    <div v-if="!ranked.length" class="or-empty">暂无数据</div>
  </div>
</template>

<style scoped>
.org-ranking { padding: 8px 0; }
.or-toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
.or-toolbar select { padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; }
.rank-item { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 13px; }
.rank-no { width: 20px; text-align: center; color: #64748b; }
.rank-name { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-bar-wrap { flex: 1; background: #f1f5f9; border-radius: 4px; height: 10px; }
.rank-bar { display: block; height: 10px; border-radius: 4px; }
.rank-amount { width: 90px; text-align: right; color: #334155; }
.rank-rate { width: 56px; text-align: right; font-weight: 600; }
.or-empty { color: #94a3b8; padding: 12px; text-align: center; }
</style>
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/components/OrgRanking.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/OrgRanking.vue frontend/src/components/OrgRanking.test.ts
git commit -m "feat(frontend): OrgRanking 服务组排名（rankByOrg + tier过滤/排序）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: DelayedTop 组件（延期 Top10）

**Files:** Create `frontend/src/components/DelayedTop.vue`、`frontend/src/components/DelayedTop.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/DelayedTop.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DelayedTop from './DelayedTop.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('DelayedTop', () => {
  it('lists delayed projects with max delay days', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [
        { projectId: 'P1', projectName: '延期甲', tier: '100万以上', orgL4: '北京', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, delayDays: 45, planMonth: '2025-01' },
      ],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const wrapper = mount(DelayedTop)
    const text = wrapper.text()
    expect(text).toContain('P1')
    expect(text).toContain('延期甲')
    expect(text).toContain('45')
  })

  it('shows empty hint when no delayed projects', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [{ projectId: 'P9', tier: '100万以上', isPaymentRelated: true, nodeStatus: '已全额回款', expectedPayment: 1, actualPayment: 1, delayDays: 0, planMonth: '2026-02' }],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const wrapper = mount(DelayedTop)
    expect(wrapper.text()).toContain('暂无延期项目')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/DelayedTop.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/components/DelayedTop.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { delayedTopProjects } from '@/lib/dashboardCharts'

const filter = useFilterStore()
const items = computed(() => delayedTopProjects(filter.filteredNodes, 10))

const TIER_CLASS: Record<string, string> = { '100万以上': 't-red', '50-100万': 't-orange', '50万以下': 't-green' }
</script>

<template>
  <div class="delayed-top">
    <div v-if="!items.length" class="dt-empty">暂无延期项目</div>
    <div v-for="p in items" :key="p.projectId" class="dt-item">
      <div class="dt-row1">
        <span class="dt-id">{{ p.projectId }}</span>
        <span class="dt-delay">{{ p.maxDelay }}<span class="dt-unit">天</span></span>
      </div>
      <div class="dt-name" :title="p.projectName">{{ p.projectName || '-' }}</div>
      <div class="dt-row3">
        <span>{{ p.orgL4 || '-' }}</span>
        <span class="dt-tier" :class="TIER_CLASS[p.tier]">{{ p.tier }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.delayed-top { padding: 4px 0; }
.dt-item { padding: 10px 12px; border: 1px solid #f1f5f9; border-radius: 8px; margin-bottom: 8px; background: #fff; }
.dt-row1 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.dt-id { font-weight: 700; font-size: 13px; color: #0f172a; }
.dt-delay { color: #ef4444; font-weight: 800; font-size: 15px; }
.dt-unit { font-size: 11px; font-weight: 500; margin-left: 2px; }
.dt-name { font-size: 13px; color: #475569; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-row3 { display: flex; gap: 8px; align-items: center; font-size: 12px; color: #94a3b8; }
.dt-tier { font-size: 11px; padding: 1px 6px; border-radius: 4px; }
.t-red { background: #fef2f2; color: #ef4444; } .t-orange { background: #fffbeb; color: #f59e0b; } .t-green { background: #ecfdf5; color: #10b981; }
.dt-empty { color: #94a3b8; padding: 20px; text-align: center; }
</style>
```

注：旧版延期项点击跳转项目节点（navTierNodeByProject）依赖 tier 页（B7+），本组件暂不可点；待 tier 页就绪后补路由跳转。

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/components/DelayedTop.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DelayedTop.vue frontend/src/components/DelayedTop.test.ts
git commit -m "feat(frontend): DelayedTop 延期Top10（delayedTopProjects over filteredNodes）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: DashboardView 接入图表/排名/延期

**Files:** Modify `frontend/src/views/DashboardView.vue`、`frontend/src/views/DashboardView.test.ts`。

- [ ] **Step 1: 改 `frontend/src/views/DashboardView.vue`**

在 `<script setup>` 增加：
```ts
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import PendingBarChart from '@/components/PendingBarChart.vue'
import OrgRanking from '@/components/OrgRanking.vue'
import DelayedTop from '@/components/DelayedTop.vue'
import { aggregateQuarterly, aggregateMonthly } from '@/lib/dashboardCharts'
```
（保留现有 useDataStore/DashSummaryCards/TierCards import。）增加：
```ts
const filter = useFilterStore()
const quarterly = computed(() => aggregateQuarterly(filter.filteredNodes, filter.filterYear))
const monthly = computed(() => aggregateMonthly(filter.filteredNodes, filter.filterYear))
```
在 `data.data` 分支的模板里、`<TierCards />` 之后加入：
```vue
      <section class="dash-block">
        <h3 class="dash-block-title">季度待回款</h3>
        <PendingBarChart :categories="quarterly.categories" :series="quarterly.series" />
      </section>
      <section class="dash-block">
        <h3 class="dash-block-title">月度待回款</h3>
        <PendingBarChart :categories="monthly.categories" :series="monthly.series" />
      </section>
      <div class="dash-two-col">
        <section class="dash-block">
          <h3 class="dash-block-title">服务组回款达成排名</h3>
          <OrgRanking />
        </section>
        <section class="dash-block">
          <h3 class="dash-block-title" style="color:#ef4444">延期项目 Top10</h3>
          <DelayedTop />
        </section>
      </div>
```
在 `<style scoped>` 增加：
```css
.dash-block { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; margin: 0 16px 12px; padding: 12px 16px; }
.dash-block-title { font-size: 14px; font-weight: 600; color: #0f172a; margin: 0 0 8px; }
.dash-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 900px) { .dash-two-col { grid-template-columns: 1fr; } }
```

- [ ] **Step 2: 更新 `frontend/src/views/DashboardView.test.ts`**

在现有 "renders summary cards and tier cards sections" 测试内追加断言（该测试已 seed 数据）：
```ts
    expect(wrapper.findAllComponents({ name: 'PendingBarChart' }).length).toBe(2)
    expect(wrapper.find('.org-ranking').exists()).toBe(true)
    expect(wrapper.find('.delayed-top').exists()).toBe(true)
```
（PendingBarChart 需要可被 `findAllComponents({name})` 找到——若组件无显式 name，改用 `wrapper.findAll('.chart-box').length >= 2` 断言两个图表容器存在。择一可用即可，报告所用方式。）

- [ ] **Step 3: 运行确认通过 + 全量前端验证**

Run: `cd frontend && npx vitest run src/views/DashboardView.test.ts`（PASS）
Run: `cd frontend && npm run test:run`（全部通过）
Run: `cd frontend && npm run typecheck`（通过）
Run: `cd frontend && npm run build`（成功）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/DashboardView.vue frontend/src/views/DashboardView.test.ts
git commit -m "feat(frontend): DashboardView 接入季度/月度图 + 服务组排名 + 延期Top10

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 收尾——verify 全绿 + 更新 PROGRESS

**Files:** Modify `PROGRESS.md`。

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（py_compile + ruff + 75 pytest + 前端 typecheck/vitest/build 全绿）。失败则 BLOCKED。

- [ ] **Step 2: 更新 PROGRESS.md**

在 "🟦 Phase B 前端"：
- B6 行改 `[x]`：
  ```
  - [x] **B6** 看板首页（图表部分）：lib/dashboardCharts（季度/月度聚合 + 服务组排名 + 延期Top 忠实移植）、PendingBarChart、OrgRanking、DelayedTop，接入 DashboardView。看板首页完成。
  ```
- 确认 `B7+`（其余页面）存在。保留 `B-opt`，追加："看板图表点击钻取弹窗、延期项点击跳转（待 tier 页 B7+ 后补）"。
- 更新"最近更新"为 `2026-06-04`。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): 标记 B6 看板图表完成（看板首页完整），钻取/跳转记入 B-opt

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（看板首页图表部分）：**
- 季度/月度聚合（忠实移植 renderQuarterly/renderMonthly）→ Task 1 ✓
- 服务组排名（renderRank）→ Task 1 + Task 3 ✓
- 延期 Top10（renderDelayed）→ Task 1 + Task 4 ✓
- 堆叠柱图组件（用 ChartBox）→ Task 2 ✓
- 接入 DashboardView → Task 5 ✓
- **明确延后**：图表点击钻取弹窗、延期项跳转（B-opt / 待 B7+ tier 页）。

**Placeholder scan：** 所有 lib/组件/视图/测试均给出完整代码；命令含预期输出。Task 5 Step 2 对 PendingBarChart 的 findComponent name 给了 `.chart-box` 计数兜底。无 TBD/TODO。

**一致性：** `aggregateQuarterly/aggregateMonthly/rankByOrg/delayedTopProjects` 在 lib 与组件/视图间签名一致；复用 `groupByProject`(B5)、`fmtWan/pct/pctToNum`(B5)、`TIERS`(B2)、`ChartBox`(B4)、`filterStore.filteredNodes`(B3)；金额单位为万（remaining/10000），与卡片一致；待回款节点判定（related && actualRatio<1|null）与旧版一致。

**风险点：**
- 月度聚合省略了旧版的月份边界二次过滤——因输入是已按周期筛选的 filteredNodes，结果等价（已在代码注释 + 测试覆盖 'all'/具体年份）。
- PendingBarChart 测试通过 ChartBox→VChart(测试 alias 桩) 渲染，不触 canvas；断言落在传给 ChartBox 的 option 上。
- 图表 tooltip/滚动从简（展示改动已接受），钻取延后。

---

## Execution Handoff

见会话中执行方式选择（建议同前：subagent-driven-development）。
