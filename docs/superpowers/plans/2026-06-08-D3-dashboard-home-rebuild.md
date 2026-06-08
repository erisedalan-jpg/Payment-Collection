# D3 看板首页重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 Phase D 决策 10 重做看板首页：6 指标 + 统一金额档位条（替代三张档位卡）+ 服务组达成排名 + 待回款趋势卡（月/季切换）+ 延期 Top 卡（天数/金额切换 + 点项目开详情面板）。

**Architecture:** 复用既有纯函数计算层（`lib/dashboardStats`、`lib/dashboardCharts` 已含月度/季度聚合、服务组排名、延期 Top），仅小幅扩展（汇总加延期项目数、延期 Top 加按金额排序）。表现层全部重写为 5 个新组件 + 1 个共享分段控件，吃 D1/D2.5 的主题 token、`v-activate` 指令与 `.u-grid-auto` 工具，并接入 D2 的全局项目详情面板。底层金额/日期/比例/状态算法不改。

**Tech Stack:** Vue3 `<script setup lang="ts">` + Pinia + Element Plus + vue-echarts(经 ChartBox/PendingBarChart) + Vitest(@vue/test-utils/jsdom)。

---

## 背景与范围

Phase D spec（`docs/superpowers/specs/2026-06-04-phase-d-frontend-redesign-design.md`）决策 10 + §4.6 定义本页；批准草图 `home-v2`（6 指标 → 档位条+排名(1.3:1) → 趋势+延期Top(1.3:1)）。

**已就绪的依赖（不重复造）：**
- `lib/dashboardStats.ts`：`groupByProject`、`computeTierStats(tier,nodes)`、`computeDashboardSummary(nodes,projectOverview,opts)`、`tierSummaryBar`。
- `lib/dashboardCharts.ts`：`aggregateMonthly(nodes,filterYear)`、`aggregateQuarterly(...)`（季度已实现）、`rankByOrg(nodes,tierFilter,sortBy)`、`delayedTopProjects(nodes,limit)`。
- `stores/filter.ts`：`filteredNodes`、`filterYear`、`naguanOn`、`viewMode/viewL4/viewPM`。
- `stores/projectDetail.ts`（D2）：`open(id)`/`close()`/`visible`/`openId`，配合 AppLayout 已全局挂载的 `ProjectDetailDrawer`。
- `components/PendingBarChart.vue`：堆叠柱图，props `categories/series/height`（D3 复用，TrendCard 包它）。
- D2.5 地基：主题 token、`v-activate` 全局指令、`.u-grid-auto`（`--col-min` 控制列宽）。
- 测试范式：`setActivePinia(createPinia())` + `useDataStore().data = {...rawNodes...}` 种子 + mount + 断言（见各任务测试代码）。

**本计划要新建/改的文件：**
- 改 `lib/dashboardStats.ts`（+ 延期项目数）、`lib/dashboardCharts.ts`（延期 Top + 按金额排序）。
- 新建 `components/SegToggle.vue`（共享分段控件）、`DashMetrics.vue`、`TierStrip.vue`、`TrendCard.vue`、`DelayTopCard.vue`;重写 `components/OrgRanking.vue`、`views/DashboardView.vue`。
- 删除 `components/DashSummaryCards.vue`、`TierCards.vue`、`DelayedTop.vue` 及其 `.test.ts`（被新组件取代;均仅 DashboardView 使用）。`PendingBarChart.vue` 保留。

**YAGNI 延后（与 D2 一致）：** OrgRanking「点行→带筛选跳多维看板」依赖 `/board` 与 `navContext`，二者属 D4。本计划 OrgRanking 行**不可点**（展示型），D4 落地 `/board` 时再接入跳转。延期 Top「点项目开详情面板」因 D2 面板已存在，本计划**全量接入**。

## 约定（CLAUDE.md，所有任务遵守）

- 简体中文;**无 emoji**（用 → ↓ ❌ ✕ ▾）;术语「邮件推动」。
- 颜色一律用主题 token（背景 --card/--card2、文字 --txt/--sub/--mut、线 --line/--line2、状态 --c-paid/--c-pending/--danger/--accent/--cyan、彩底反白 --on-accent），**不写硬编码 hex**;尺寸优先 `var(--fs-*)`/rem。
- 计算口径忠实：复用 `lib/*`，不改金额/日期/比例/状态算法;新增纯函数派生必须有 Vitest 覆盖。
- 提交信息结尾固定：
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: lib dashboardStats — 汇总增加「延期项目数」

**Files:**
- Modify: `frontend/src/lib/dashboardStats.ts`（`DashSummary` 接口 + `computeDashboardSummary`）
- Test: `frontend/src/lib/dashboardStats.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试**

在 `frontend/src/lib/dashboardStats.test.ts` 的顶层 `describe`（或文件末尾新增 describe）内追加：

```ts
import { computeDashboardSummary } from './dashboardStats'

describe('computeDashboardSummary delayedProjects', () => {
  const opts = { naguanOn: false, naguanExclude: {}, viewMode: 'global' as const, viewL4: '', viewPM: '' }
  it('统计回款状态为「延期」的项目数', () => {
    const nodes = [
      { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 100, actualPayment: 0, planMonth: '2026-01' },
      { projectId: 'P2', tier: '50万以下', isPaymentRelated: true, nodeStatus: '已全额回款', expectedPayment: 100, actualPayment: 100, planMonth: '2026-02' },
    ] as any
    const s = computeDashboardSummary(nodes, [{ projectId: 'P1' }, { projectId: 'P2' }], opts)
    expect(s.delayedProjects).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/dashboardStats.test.ts`
Expected: FAIL（`delayedProjects` 为 undefined，不等于 1）。

- [ ] **Step 3: 实现**

在 `dashboardStats.ts` 的 `DashSummary` 接口末尾加字段：

```ts
  rate: number
  delayedProjects: number
}
```

在 `computeDashboardSummary` 的 `return` 前，`projs` 已存在，加一行并把字段写进返回对象：

```ts
  const delayedProjects = projs.filter((p) => p.paymentStatus === '延期').length
  return {
    relatedNodeCount,
    totalProjects,
    totalExpected,
    totalActual,
    totalRemaining: totalExpected - totalActual,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0,
    delayedProjects,
  }
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/dashboardStats.test.ts`
Expected: PASS（含原有用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dashboardStats.ts frontend/src/lib/dashboardStats.test.ts
git commit -m "feat(D3): computeDashboardSummary 增加延期项目数

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: lib dashboardCharts — 延期 Top 支持「按金额」排序

**Files:**
- Modify: `frontend/src/lib/dashboardCharts.ts`（`DelayedProject` 接口 + `delayedTopProjects`）
- Test: `frontend/src/lib/dashboardCharts.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试**

在 `frontend/src/lib/dashboardCharts.test.ts` 末尾追加（若文件已 import delayedTopProjects 则复用 import）：

```ts
import { delayedTopProjects } from './dashboardCharts'

describe('delayedTopProjects sortBy', () => {
  const nodes = [
    { projectId: 'A', projectName: '延期A', tier: '100万以上', orgL4: 'X', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 2200000, actualPayment: 0, delayDays: 15, planMonth: '2026-01' },
    { projectId: 'B', projectName: '延期B', tier: '50万以下', orgL4: 'Y', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 400000, actualPayment: 0, delayDays: 40, planMonth: '2026-02' },
  ] as any

  it('默认按天数降序', () => {
    const r = delayedTopProjects(nodes, 10)
    expect(r.map((p) => p.projectId)).toEqual(['B', 'A'])
  })

  it('按金额降序（remainingAmount）', () => {
    const r = delayedTopProjects(nodes, 10, 'amount')
    expect(r.map((p) => p.projectId)).toEqual(['A', 'B'])
    expect(r[0].remainingAmount).toBe(2200000)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/dashboardCharts.test.ts`
Expected: FAIL（第三参数与 `remainingAmount` 尚不存在）。

- [ ] **Step 3: 实现**

把 `dashboardCharts.ts` 的 `DelayedProject` 接口与 `delayedTopProjects` 替换为：

```ts
export interface DelayedProject {
  projectId: string
  projectName: string
  orgL4: string
  tier: string
  maxDelay: number
  remainingAmount: number
}

export function delayedTopProjects(
  nodes: RawNode[],
  limit = 10,
  sortBy: 'delay' | 'amount' = 'delay',
): DelayedProject[] {
  const projs = groupByProject(nodes).filter((p) => p.paymentStatus === '延期')
  const withDelay = projs.map((p) => {
    let maxDelay = 0
    for (const n of p.nodes) {
      const d = (n as Record<string, any>).delayDays || 0
      if (d > maxDelay) maxDelay = d
    }
    return {
      projectId: p.projectId,
      projectName: p.projectName,
      orgL4: p.orgL4,
      tier: p.tier,
      maxDelay,
      remainingAmount: p.remainingAmount,
    }
  })
  withDelay.sort((a, b) =>
    sortBy === 'amount' ? b.remainingAmount - a.remainingAmount : b.maxDelay - a.maxDelay,
  )
  return withDelay.slice(0, limit)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/dashboardCharts.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/dashboardCharts.ts frontend/src/lib/dashboardCharts.test.ts
git commit -m "feat(D3): delayedTopProjects 支持按金额排序 + remainingAmount 字段

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: SegToggle 共享分段控件

**Files:**
- Create: `frontend/src/components/SegToggle.vue`
- Test: `frontend/src/components/SegToggle.test.ts`

趋势卡（月/季）、延期 Top（天数/金额）、服务组排名（已回款/达成率）三处共用。受控组件：`v-model` + `options`。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/SegToggle.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SegToggle from './SegToggle.vue'

const OPTS = [
  { value: 'a', label: '甲' },
  { value: 'b', label: '乙' },
]

describe('SegToggle', () => {
  it('高亮当前值、渲染选项', () => {
    const w = mount(SegToggle, { props: { modelValue: 'a', options: OPTS } })
    expect(w.get('[data-test="seg-a"]').classes()).toContain('on')
    expect(w.get('[data-test="seg-b"]').classes()).not.toContain('on')
    expect(w.text()).toContain('甲')
  })

  it('点击选项 emit update:modelValue', async () => {
    const w = mount(SegToggle, { props: { modelValue: 'a', options: OPTS } })
    await w.get('[data-test="seg-b"]').trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([['b']])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/SegToggle.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/SegToggle.vue`:

```vue
<script setup lang="ts">
defineProps<{ modelValue: string; options: { value: string; label: string }[] }>()
defineEmits<{ 'update:modelValue': [string] }>()
</script>

<template>
  <div class="seg" role="group">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="seg-b"
      :class="{ on: o.value === modelValue }"
      :data-test="`seg-${o.value}`"
      @click="$emit('update:modelValue', o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg { display: inline-flex; background: var(--card2); border: 1px solid var(--line); border-radius: 8px; padding: 2px; }
.seg-b { border: none; background: transparent; color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: 3px 11px; border-radius: 6px; line-height: 1.6; }
.seg-b.on { background: var(--accent); color: var(--on-accent); font-weight: 700; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/SegToggle.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SegToggle.vue frontend/src/components/SegToggle.test.ts
git commit -m "feat(D3): SegToggle 共享分段切换控件

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: DashMetrics 六指标

**Files:**
- Create: `frontend/src/components/DashMetrics.vue`
- Test: `frontend/src/components/DashMetrics.test.ts`

替代旧 DashSummaryCards。6 指标：项目数 / 回款节点 / 已回款(万) / 待回款(万) / 完成率 / 延期。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/DashMetrics.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashMetrics from './DashMetrics.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('DashMetrics', () => {
  it('渲染六个指标含延期数', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [
        { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-02' },
      ],
      projectOverview: { projects: [{ projectId: 'P1' }], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(DashMetrics)
    const cards = w.findAll('.dm-card')
    expect(cards.length).toBe(6)
    const text = w.text()
    expect(text).toContain('项目数')
    expect(text).toContain('回款节点')
    expect(text).toContain('延期')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/DashMetrics.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/DashMetrics.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { computeDashboardSummary } from '@/lib/dashboardStats'
import { fmtWan, pct } from '@/lib/format'

const data = useDataStore()
const filter = useFilterStore()

const summary = computed(() =>
  computeDashboardSummary(filter.filteredNodes, data.data?.projectOverview?.projects ?? [], {
    naguanOn: filter.naguanOn,
    naguanExclude: (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
    viewMode: filter.viewMode,
    viewL4: filter.viewL4,
    viewPM: filter.viewPM,
  }),
)

const metrics = computed(() => {
  const s = summary.value
  return [
    { k: '项目数', v: String(s.totalProjects), cls: '' },
    { k: '回款节点', v: String(s.relatedNodeCount), cls: '' },
    { k: '已回款(万)', v: fmtWan(s.totalActual), cls: 'paid' },
    { k: '待回款(万)', v: fmtWan(s.totalRemaining), cls: 'remain' },
    { k: '完成率', v: pct(s.rate), cls: s.rate >= 0.8 ? 'paid' : s.rate >= 0.5 ? 'pending' : 'danger' },
    { k: '延期', v: String(s.delayedProjects), cls: 'danger' },
  ]
})
</script>

<template>
  <div class="dash-metrics u-grid-auto">
    <div v-for="m in metrics" :key="m.k" class="dm-card">
      <div class="dm-k">{{ m.k }}</div>
      <div class="dm-v" :class="m.cls">{{ m.v }}</div>
    </div>
  </div>
</template>

<style scoped>
.dash-metrics { --col-min: 130px; }
.dm-card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
.dm-k { font-size: var(--fs-1); color: var(--mut); }
.dm-v { font-size: var(--fs-5); font-weight: 800; margin-top: 4px; color: var(--txt); }
.dm-v.paid { color: var(--c-paid); }
.dm-v.remain { color: var(--cyan); }
.dm-v.pending { color: var(--c-pending); }
.dm-v.danger { color: var(--danger); }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/DashMetrics.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DashMetrics.vue frontend/src/components/DashMetrics.test.ts
git commit -m "feat(D3): DashMetrics 六指标卡（替代 DashSummaryCards）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: TierStrip 统一档位条

**Files:**
- Create: `frontend/src/components/TierStrip.vue`
- Test: `frontend/src/components/TierStrip.test.ts`

替代旧 TierCards（三张卡 → 一条堆叠条 + 图例）。段宽 ∝ 各档项目数，图例显示各档待回款金额。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/TierStrip.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TierStrip from './TierStrip.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('TierStrip', () => {
  it('按档位渲染段与图例', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [
        { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' },
        { projectId: 'P2', tier: '50万以下', isPaymentRelated: true, nodeStatus: '已全额回款', projectAmount: 300000, expectedPayment: 300000, actualPayment: 300000, planMonth: '2026-03' },
      ],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(TierStrip)
    expect(w.findAll('.ts-seg').length).toBe(3)
    expect(w.text()).toContain('100万以上')
    expect(w.find('.ts-empty').exists()).toBe(false)
  })

  it('无项目时显示空态', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(TierStrip)
    expect(w.find('.ts-empty').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/TierStrip.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/TierStrip.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { computeTierStats } from '@/lib/dashboardStats'
import { fmtWan } from '@/lib/format'
import { TIERS } from '@/nav'

const filter = useFilterStore()

const TIER_VAR: Record<string, string> = {
  '100万以上': 'var(--danger)',
  '50-100万': 'var(--warn)',
  '50万以下': 'var(--ok)',
}

const rows = computed(() =>
  TIERS.map((t) => {
    const s = computeTierStats(t.label, filter.filteredNodes) as Record<string, any>
    return {
      tier: t.label,
      color: TIER_VAR[t.label] || 'var(--mut)',
      projectCount: s.projectCount as number,
      remainingWan: s.remainingAmountWan as number,
    }
  }),
)

const totalProjects = computed(() => rows.value.reduce((sum, r) => sum + r.projectCount, 0))
</script>

<template>
  <div class="tier-strip">
    <div class="ts-head"><h3 class="ts-title">金额档位概览</h3></div>
    <div v-if="totalProjects > 0" class="ts-bar">
      <div
        v-for="r in rows"
        :key="r.tier"
        class="ts-seg"
        :style="{ flexGrow: r.projectCount, background: r.color }"
        :title="`${r.tier} · ${r.projectCount} 个项目`"
      >
        <span v-if="r.projectCount > 0">{{ r.tier }} · {{ r.projectCount }}</span>
      </div>
    </div>
    <div v-else class="ts-empty">暂无项目</div>
    <div class="ts-legend">
      <span v-for="r in rows" :key="r.tier" class="ts-leg">
        <i :style="{ background: r.color }" />{{ r.tier }} 待回 {{ fmtWan(r.remainingWan * 10000) }} 万
      </span>
    </div>
  </div>
</template>

<style scoped>
.tier-strip { }
.ts-head { margin-bottom: 10px; }
.ts-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
.ts-bar { display: flex; height: 34px; border-radius: 9px; overflow: hidden; margin-bottom: 10px; }
.ts-seg { display: flex; align-items: center; justify-content: center; min-width: 0; font-size: var(--fs-1); color: var(--on-accent); font-weight: 700; white-space: nowrap; overflow: hidden; padding: 0 6px; }
.ts-empty { height: 34px; display: flex; align-items: center; justify-content: center; color: var(--mut); border: 1px dashed var(--line); border-radius: 9px; margin-bottom: 10px; }
.ts-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: var(--fs-1); color: var(--sub); }
.ts-leg { display: flex; align-items: center; gap: 6px; }
.ts-leg i { width: 10px; height: 10px; border-radius: 3px; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/TierStrip.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TierStrip.vue frontend/src/components/TierStrip.test.ts
git commit -m "feat(D3): TierStrip 统一档位堆叠条（替代 TierCards）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: TrendCard 待回款趋势（月/季切换）

**Files:**
- Create: `frontend/src/components/TrendCard.vue`
- Test: `frontend/src/components/TrendCard.test.ts`

包 PendingBarChart + SegToggle，默认月度，可切季度（决策 10）。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/TrendCard.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TrendCard from './TrendCard.vue'
import PendingBarChart from './PendingBarChart.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('TrendCard', () => {
  it('默认渲染月度图（含 PendingBarChart 与切换）', () => {
    seed()
    const w = mount(TrendCard)
    expect(w.findComponent(PendingBarChart).exists()).toBe(true)
    expect(w.get('[data-test="seg-month"]').classes()).toContain('on')
  })

  it('切到季度后类别变为季度键', async () => {
    seed()
    const w = mount(TrendCard)
    await w.get('[data-test="seg-quarter"]').trigger('click')
    const cats = w.findComponent(PendingBarChart).props('categories') as string[]
    expect(cats.some((c) => c.includes('Q'))).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/TrendCard.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/TrendCard.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { aggregateMonthly, aggregateQuarterly } from '@/lib/dashboardCharts'
import PendingBarChart from './PendingBarChart.vue'
import SegToggle from './SegToggle.vue'

const filter = useFilterStore()
const period = ref('month')
const PERIOD_OPTS = [
  { value: 'month', label: '月度' },
  { value: 'quarter', label: '季度' },
]

const series = computed(() =>
  period.value === 'month'
    ? aggregateMonthly(filter.filteredNodes, filter.filterYear)
    : aggregateQuarterly(filter.filteredNodes, filter.filterYear),
)
</script>

<template>
  <div class="trend-card">
    <div class="tc-head">
      <h3 class="tc-title">待回款趋势</h3>
      <SegToggle v-model="period" :options="PERIOD_OPTS" />
    </div>
    <PendingBarChart :categories="series.categories" :series="series.series" />
  </div>
</template>

<style scoped>
.trend-card { }
.tc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.tc-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/TrendCard.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TrendCard.vue frontend/src/components/TrendCard.test.ts
git commit -m "feat(D3): TrendCard 待回款趋势卡（月/季切换）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: DelayTopCard 延期 Top（天数/金额切换 + 点项目开详情面板）

**Files:**
- Create: `frontend/src/components/DelayTopCard.vue`
- Test: `frontend/src/components/DelayTopCard.test.ts`

替代旧 DelayedTop。SegToggle 切天数/金额;行点击调 `projectDetail.open(projectId)` 唤起 D2 全局详情面板;行用 `v-activate` 键盘可达。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/DelayTopCard.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DelayTopCard from './DelayTopCard.vue'
import { useDataStore } from '@/stores/data'
import { useProjectDetailStore } from '@/stores/projectDetail'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'A', projectName: '延期A', tier: '100万以上', orgL4: 'X', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 2200000, actualPayment: 0, delayDays: 15, planMonth: '2026-01' },
      { projectId: 'B', projectName: '延期B', tier: '50万以下', orgL4: 'Y', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 400000, actualPayment: 0, delayDays: 40, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('DelayTopCard', () => {
  it('默认按天数：B(40天) 在 A(15天) 之前', () => {
    seed()
    const w = mount(DelayTopCard)
    const rows = w.findAll('.dtc-row')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('延期B')
  })

  it('切到按金额：A(¥220万) 升到首位', async () => {
    seed()
    const w = mount(DelayTopCard)
    await w.get('[data-test="seg-amount"]').trigger('click')
    expect(w.findAll('.dtc-row')[0].text()).toContain('延期A')
  })

  it('点击行唤起项目详情面板', async () => {
    seed()
    const w = mount(DelayTopCard)
    await w.findAll('.dtc-row')[0].trigger('click')
    const pd = useProjectDetailStore()
    expect(pd.openId).toBe('B')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/DelayTopCard.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/DelayTopCard.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { delayedTopProjects } from '@/lib/dashboardCharts'
import { fmtWan } from '@/lib/format'
import SegToggle from './SegToggle.vue'

const filter = useFilterStore()
const pd = useProjectDetailStore()
const sortBy = ref('delay')
const SORT_OPTS = [
  { value: 'delay', label: '按天数' },
  { value: 'amount', label: '按金额' },
]

const items = computed(() =>
  delayedTopProjects(filter.filteredNodes, 10, sortBy.value as 'delay' | 'amount'),
)
</script>

<template>
  <div class="delay-top-card">
    <div class="dtc-head">
      <h3 class="dtc-title">延期 Top</h3>
      <SegToggle v-model="sortBy" :options="SORT_OPTS" />
    </div>
    <div v-if="!items.length" class="dtc-empty">暂无延期项目</div>
    <div
      v-for="(p, i) in items"
      :key="p.projectId"
      v-activate
      class="dtc-row"
      @click="pd.open(p.projectId)"
    >
      <span class="dtc-rank">{{ i + 1 }}</span>
      <span class="dtc-name" :title="p.projectName">{{ p.projectName || p.projectId }}</span>
      <span class="dtc-primary">{{ sortBy === 'delay' ? p.maxDelay + ' 天' : fmtWan(p.remainingAmount) + ' 万' }}</span>
      <span class="dtc-sub">{{ sortBy === 'delay' ? fmtWan(p.remainingAmount) + ' 万' : p.maxDelay + ' 天' }}</span>
    </div>
  </div>
</template>

<style scoped>
.delay-top-card { }
.dtc-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.dtc-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
.dtc-empty { color: var(--mut); padding: 20px; text-align: center; }
.dtc-row { display: flex; align-items: center; gap: 10px; padding: 7px 6px; border-top: 1px solid var(--line); cursor: pointer; border-radius: 6px; }
.dtc-row:first-of-type { border-top: none; }
.dtc-row:hover { background: var(--card2); }
.dtc-rank { width: 18px; height: 18px; border-radius: 5px; background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); font-size: var(--fs-1); display: flex; align-items: center; justify-content: center; font-weight: 700; flex: none; }
.dtc-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt); font-size: var(--fs-2); }
.dtc-primary { font-weight: 700; color: var(--danger); font-size: var(--fs-2); }
.dtc-sub { color: var(--mut); font-size: var(--fs-1); width: 70px; text-align: right; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/DelayTopCard.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DelayTopCard.vue frontend/src/components/DelayTopCard.test.ts
git commit -m "feat(D3): DelayTopCard 延期Top（天数/金额切换 + 点项目开详情面板）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 重写 OrgRanking 服务组达成排名

**Files:**
- Modify(重写): `frontend/src/components/OrgRanking.vue`
- Modify(重写): `frontend/src/components/OrgRanking.test.ts`

去掉旧的档位下拉（档位已是全局概念），保留排序切换（已回款/达成率），用 SegToggle + token。行点击「带筛选跳 /board」依赖 D4，本任务**不接**（行展示型），仅留代码注释。

- [ ] **Step 1: 重写测试（先让其失败/对齐新结构）**

把 `frontend/src/components/OrgRanking.test.ts` 整体替换为：

```ts
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
  it('渲染服务组排名（金额与达成率）', () => {
    seed()
    const w = mount(OrgRanking)
    const text = w.text()
    expect(text).toContain('北京服务组')
    expect(text).toContain('上海一服务组')
    expect(text).toContain('60%')
  })

  it('切到达成率排序：北京(60%) 在 上海(25%) 之前', async () => {
    seed()
    const w = mount(OrgRanking)
    await w.get('[data-test="seg-achievementRate"]').trigger('click')
    const items = w.findAll('.rank-item')
    expect(items[0].text()).toContain('北京服务组')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/OrgRanking.test.ts`
Expected: FAIL（旧组件无 `[data-test="seg-achievementRate"]`）。

- [ ] **Step 3: 重写组件**

把 `frontend/src/components/OrgRanking.vue` 整体替换为：

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { rankByOrg } from '@/lib/dashboardCharts'
import { fmtWan, pct } from '@/lib/format'
import SegToggle from './SegToggle.vue'

const filter = useFilterStore()
const sortBy = ref('actualTotal')
const SORT_OPTS = [
  { value: 'actualTotal', label: '已回款' },
  { value: 'achievementRate', label: '达成率' },
]

const ranked = computed(() =>
  rankByOrg(filter.filteredNodes, '', sortBy.value as 'actualTotal' | 'achievementRate').slice(0, 8),
)
const maxActual = computed(() => Math.max(1, ...ranked.value.map((o) => o.actualTotal)))

function rateColor(r: number): string {
  return r >= 0.45 ? 'var(--c-paid)' : r >= 0.3 ? 'var(--c-pending)' : 'var(--danger)'
}
// 行点击「带筛选跳多维看板」依赖 /board 与 navContext（D4），本期行不可点，留 D4 接入。
</script>

<template>
  <div class="org-ranking">
    <div class="or-head">
      <h3 class="or-title">服务组达成排名</h3>
      <SegToggle v-model="sortBy" :options="SORT_OPTS" />
    </div>
    <div v-for="(o, i) in ranked" :key="o.org" class="rank-item">
      <span class="rank-no">{{ i + 1 }}</span>
      <span class="rank-name" :title="o.org">{{ o.org }}</span>
      <span class="rank-bar-wrap">
        <span class="rank-bar" :style="{ width: ((o.actualTotal / maxActual) * 100).toFixed(1) + '%', background: rateColor(o.achievementRate) }" />
      </span>
      <span class="rank-amount">{{ fmtWan(o.actualTotal) }} 万</span>
      <span class="rank-rate" :style="{ color: rateColor(o.achievementRate) }">{{ pct(o.achievementRate) }}</span>
    </div>
    <div v-if="!ranked.length" class="or-empty">暂无数据</div>
  </div>
</template>

<style scoped>
.org-ranking { }
.or-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.or-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0; }
.rank-item { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: var(--fs-2); }
.rank-no { width: 20px; text-align: center; color: var(--mut); }
.rank-name { width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt); }
.rank-bar-wrap { flex: 1; background: var(--card2); border-radius: 4px; height: 10px; overflow: hidden; }
.rank-bar { display: block; height: 10px; border-radius: 4px; }
.rank-amount { width: 90px; text-align: right; color: var(--sub); }
.rank-rate { width: 56px; text-align: right; font-weight: 600; }
.or-empty { color: var(--mut); padding: 12px; text-align: center; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/OrgRanking.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OrgRanking.vue frontend/src/components/OrgRanking.test.ts
git commit -m "feat(D3): 重写 OrgRanking（SegToggle 排序 + token；跳转留 D4）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 重写 DashboardView + 删除旧组件

**Files:**
- Modify(重写): `frontend/src/views/DashboardView.vue`
- Modify(重写): `frontend/src/views/DashboardView.test.ts`
- Delete: `frontend/src/components/DashSummaryCards.vue`、`DashSummaryCards.test.ts`、`TierCards.vue`、`TierCards.test.ts`、`DelayedTop.vue`、`DelayedTop.test.ts`

新布局：6 指标行 + 2×2 网格（档位条 1.3fr / 排名 1fr // 趋势 1.3fr / 延期Top 1fr），全用 token。

- [ ] **Step 1: 重写 DashboardView 组件**

把 `frontend/src/views/DashboardView.vue` 整体替换为：

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import DashMetrics from '@/components/DashMetrics.vue'
import TierStrip from '@/components/TierStrip.vue'
import OrgRanking from '@/components/OrgRanking.vue'
import TrendCard from '@/components/TrendCard.vue'
import DelayTopCard from '@/components/DelayTopCard.vue'

const data = useDataStore()
onMounted(() => {
  if (!data.data) data.load()
})
</script>

<template>
  <div class="dashboard">
    <p v-if="data.loading" class="dash-hint">加载中…</p>
    <p v-else-if="data.error" class="dash-hint error">数据加载失败：{{ data.error }}</p>
    <template v-else-if="data.data">
      <DashMetrics />
      <div class="dash-grid">
        <section class="dash-card"><TierStrip /></section>
        <section class="dash-card"><OrgRanking /></section>
        <section class="dash-card"><TrendCard /></section>
        <section class="dash-card"><DelayTopCard /></section>
      </div>
    </template>
    <p v-else class="dash-hint">暂无数据，请先在数据管理中同步/导入。</p>
  </div>
</template>

<style scoped>
.dashboard { min-height: 100%; padding: 16px; }
.dash-hint { padding: 24px; color: var(--mut); }
.dash-hint.error { color: var(--danger); }
.dash-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; margin-top: 12px; }
.dash-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; min-width: 0; }
@media (max-width: 900px) { .dash-grid { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 2: 重写 DashboardView 测试**

把 `frontend/src/views/DashboardView.test.ts` 整体替换为：

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashboardView from './DashboardView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('DashboardView', () => {
  it('渲染指标与四张卡片', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [{ projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '已全额回款', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 1000000, planMonth: '2026-02' }],
      projectOverview: { projects: [{ projectId: 'P1' }], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(DashboardView)
    expect(w.find('.dash-metrics').exists()).toBe(true)
    expect(w.find('.tier-strip').exists()).toBe(true)
    expect(w.find('.org-ranking').exists()).toBe(true)
    expect(w.find('.trend-card').exists()).toBe(true)
    expect(w.find('.delay-top-card').exists()).toBe(true)
  })

  it('渲染加载态', () => {
    const ds = useDataStore()
    ds.loading = true
    const w = mount(DashboardView)
    expect(w.text()).toContain('加载中')
  })

  it('加载失败渲染错误态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }))
    const w = mount(DashboardView)
    await flushPromises()
    expect(w.text()).toContain('数据加载失败')
  })
})
```

- [ ] **Step 3: 删除被取代的旧组件与其测试**

```bash
git rm frontend/src/components/DashSummaryCards.vue frontend/src/components/DashSummaryCards.test.ts \
       frontend/src/components/TierCards.vue frontend/src/components/TierCards.test.ts \
       frontend/src/components/DelayedTop.vue frontend/src/components/DelayedTop.test.ts
```

- [ ] **Step 4: 运行受影响测试**

Run: `cd frontend && npm run test:run -- src/views/DashboardView.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: 确认无残留引用**

Run: `rg -n "DashSummaryCards|TierCards|DelayedTop\b" frontend/src`
Expected: 无输出（旧组件已无任何引用;注意 `DelayedTop` 不应误伤 `DelayTopCard`，故用 `\b`）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/DashboardView.vue frontend/src/views/DashboardView.test.ts
git commit -m "feat(D3): 重写 DashboardView 新布局 + 删除 DashSummaryCards/TierCards/DelayedTop

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 全量验证 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`（py_compile + ruff + pytest + 前端 typecheck/vitest/build 全绿）。

- [ ] **Step 2: 更新 PROGRESS.md**

- 顶部「最近更新」改为 2026-06-08（Plan D3 看板首页重做完成）。
- Phase D backlog 把 `- [ ] **D3** …` 改为 `- [x] **D3** …`，简述：6 指标 + TierStrip 档位条 + OrgRanking(排序切换，跳转留 D4) + TrendCard(月/季) + DelayTopCard(天数/金额 + 接 D2 详情面板) + SegToggle 共享控件 + lib 增延期项目数/延期按金额。
- 「会话交接备注」新增 D3 段：分支、产物、YAGNI 延后（OrgRanking 跳 /board 待 D4）、删除的旧组件清单、下一步 D4。

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs(D3): PROGRESS 记录看板首页重做完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- 看板首页 5 区（6 指标 / 档位条 / 服务组排名 / 趋势月季 / 延期Top天数金额）按草图布局落地，全用 token、随窗口自适应、暗色生效。
- 延期 Top 行点击唤起 D2 详情面板;OrgRanking 跳转明确留 D4。
- 旧 DashSummaryCards/TierCards/DelayedTop 删除且无残留引用;新增纯函数派生有 Vitest 覆盖。
- `bash verify.sh` 全绿;`PROGRESS.md` 已更新。
```
