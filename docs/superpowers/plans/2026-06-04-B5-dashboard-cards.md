# Plan B5：看板首页 — 计算层 + 汇总卡片 + 分层卡片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地看板首页的卡片部分：格式化工具 `lib/format.ts`、看板计算 `lib/dashboardStats.ts`（忠实移植 `groupByProject`/`computeTierStats` + 汇总计算）、汇总卡片组件、分层卡片组件，并组成 `DashboardView` 挂到 `/`。

**Architecture:** 纯前端。计算移到可单测的 `lib/`，组件消费 `filterStore.filteredNodes`。这是 Phase B 首个真实页面（B5），自成可运行/可测闭环。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Vitest（已装）。

参考：spec §4；旧版忠实来源 `app.js`：`groupByProject`(659-704)、`computeTierStats`(1446-1555)、`renderDashSummary`(968-1023)、格式化 `fmt/fmtYuan/fmtWan/pct/pctToNum`(589-640)。数据来自 B1 `useDataStore` + B3 `useFilterStore`。

**不在本计划（拆到 B6）：** 季度/月度待回款图（renderQuarterly/renderMonthly，用 B4 的 ChartBox）、服务组回款达成排名（renderRank）、延期 Top10（renderDelayed）。

---

## File Structure（B5 产出）

```
frontend/src/
├── lib/format.ts + format.test.ts          # 格式化工具
├── lib/dashboardStats.ts + dashboardStats.test.ts  # groupByProject/computeTierStats/computeDashboardSummary
├── components/DashSummaryCards.vue + .test.ts
├── components/TierCards.vue + .test.ts
├── views/DashboardView.vue + .test.ts       # 组合两组卡片
├── router/index.ts                          # 改：'/' → DashboardView
└── （删除 views/HomeView.vue + HomeView.test.ts）
```

约定：从 `frontend/` 运行 npm；提交信息末尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。Windows，Bash 工具。

---

### Task 1: lib/format.ts 格式化工具

**Files:** Create `frontend/src/lib/format.ts`、`frontend/src/lib/format.test.ts`。忠实移植 app.js 589-640。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/format.test.ts
import { describe, it, expect } from 'vitest'
import { fmt, fmtYuan, fmtWan, pct, pctToNum } from './format'

describe('format', () => {
  it('fmtWan divides by 10000, 2 decimals, null→-', () => {
    expect(fmtWan(12345)).toBe('1.23')
    expect(fmtWan(20710110)).toBe('2,071.01')
    expect(fmtWan(null)).toBe('-')
  })
  it('fmtYuan / fmt', () => {
    expect(fmtYuan(1234.5)).toBe('1,234.5')
    expect(fmt(1234, 1)).toBe('1,234.0')
    expect(fmt(null)).toBe('-')
  })
  it('pct: 0-1→%, ≥1 keeps, integer no decimals else 1', () => {
    expect(pct(0.8)).toBe('80%')
    expect(pct(1.08)).toBe('108%')
    expect(pct(1)).toBe('100%')
    expect(pct(0.805)).toBe('80.5%')
    expect(pct('空值')).toBe('-')
    expect(pct('70%')).toBe('70%')
    expect(pct(null)).toBe('-')
  })
  it('pctToNum: %/bare/decimal → 0-1, 空值/empty→null', () => {
    expect(pctToNum('30%')).toBe(0.3)
    expect(pctToNum('30')).toBe(0.3)
    expect(pctToNum('0.3')).toBe(0.3)
    expect(pctToNum('0%')).toBe(0)
    expect(pctToNum('空值')).toBeNull()
    expect(pctToNum('')).toBeNull()
    expect(pctToNum(null)).toBeNull()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/format.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/lib/format.ts`**

```ts
// 格式化工具（忠实移植 app.js fmt/fmtYuan/fmtWan/pct/pctToNum）
export function fmt(n: number | null | undefined, d = 1): string {
  return n != null ? Number(n).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-'
}

export function fmtYuan(n: number | null | undefined): string {
  return n != null ? Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '-'
}

/** 元 → 万元（除以 10000），最多 2 位小数 */
export function fmtWan(yuan: number | null | undefined): string {
  return yuan != null ? Number(yuan / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '-'
}

/** 0~1 小数 → 百分数；≥1 原样×100；整数不留小数，否则保留 1 位；空值/'空值'/'' → '-'；已含 % 原样 */
export function pct(n: unknown): string {
  if (n === null || n === undefined || n === '空值' || n === '') return '-'
  if (typeof n === 'string' && n.includes('%')) return n
  const num = typeof n === 'number' ? n : parseFloat(String(n))
  if (isNaN(num)) return '-'
  const pctVal = num * 100
  if (pctVal === Math.round(pctVal)) return Math.round(pctVal) + '%'
  return pctVal.toFixed(1) + '%'
}

/** 百分比/裸数 → 0~1 小数；'空值'/''/null → null。"30%"→0.3, "30"→0.3, "0.3"→0.3 */
export function pctToNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (v === '空值') return null
  const s = String(v).trim()
  if (s === '') return null
  const m = s.match(/([\d.]+)\s*%?/)
  if (!m) return null
  const num = parseFloat(m[1])
  if (isNaN(num)) return null
  if (s.includes('%') || num > 1) return num / 100
  return num
}
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/format.test.ts`（4 passed）
Run: `cd frontend && npm run typecheck`（通过）
注：`toLocaleString('zh-CN')` 的千分位在 Node ICU 下应为 `,`；若运行环境 ICU 缺失导致分隔符不同（如无分隔），按实际输出校正断言并报告（极少见，Node 一般完整 ICU）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/format.ts frontend/src/lib/format.test.ts
git commit -m "feat(frontend): 格式化工具 lib/format（fmt/fmtYuan/fmtWan/pct/pctToNum）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: lib/dashboardStats.ts 看板计算

**Files:** Create `frontend/src/lib/dashboardStats.ts`、`frontend/src/lib/dashboardStats.test.ts`。忠实移植 `groupByProject`/`computeTierStats` + 新增 `computeDashboardSummary`（移植 renderDashSummary 的计算部分）。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/dashboardStats.test.ts
import { describe, it, expect } from 'vitest'
import { groupByProject, computeTierStats, computeDashboardSummary } from './dashboardStats'

const NODES: any[] = [
  // P1: 100万以上, 两个关联回款节点（已全额回款 + 延期）
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三',
    projectAmount: 2000000, isPaymentRelated: true, nodeStatus: '已全额回款', expectedPayment: 1000000, actualPayment: 1000000, actualPaymentRatio: '100%', canAdvance: false },
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三',
    projectAmount: 2000000, isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, actualPaymentRatio: '0%', canAdvance: false },
  // P2: 50-100万, 一个非关联回款节点
  { projectId: 'P2', projectName: '乙', tier: '50-100万', orgL4: '上海', projectManager: '李四',
    projectAmount: 800000, isPaymentRelated: false, nodeStatus: '', expectedPayment: 0, actualPayment: 0, actualPaymentRatio: '', canAdvance: false },
]

describe('groupByProject', () => {
  it('aggregates nodes by project with summed payments + status precedence', () => {
    const ps = groupByProject(NODES)
    const byId = Object.fromEntries(ps.map((p) => [p.projectId, p]))
    expect(byId.P1.expectedPayment).toBe(2000000)
    expect(byId.P1.actualPayment).toBe(1000000)
    expect(byId.P1.paymentRatio).toBe(0.5)
    // 状态优先级：已全额回款 先于 延期
    expect(byId.P1.paymentStatus).toBe('已全额回款')
    expect(byId.P2.paymentStatus).toBe('待确定') // 无关联回款
  })
})

describe('computeTierStats', () => {
  it('computes per-tier counts and wan amounts', () => {
    const s = computeTierStats('100万以上', NODES)
    expect(s.projectCount).toBe(1)
    expect(s.relatedNodeCount).toBe(2)
    expect(s.fullPaidCount).toBe(1)
    expect(s.delayedCount).toBe(1)
    expect(s.expectedAmountWan).toBe(200) // 2,000,000 元 / 10000
    expect(s.actualAmountWan).toBe(100)
  })
  it('empty tier yields zeros', () => {
    const s = computeTierStats('50万以下', NODES)
    expect(s.projectCount).toBe(0)
    expect(s.relatedNodeCount).toBe(0)
  })
})

describe('computeDashboardSummary', () => {
  it('totals from grouped projects + project count from overview with naguan/view filter', () => {
    const overview = [
      { projectId: 'P1', 项目经理L4部门: '北京', 项目经理: '张三' },
      { projectId: 'P2', 项目经理L4部门: '上海', 项目经理: '李四' },
    ]
    const sum = computeDashboardSummary(NODES, overview, {
      naguanOn: true, naguanExclude: { P2: true }, viewMode: 'global', viewL4: '', viewPM: '',
    })
    expect(sum.relatedNodeCount).toBe(2)       // P1 的两个关联节点
    expect(sum.totalProjects).toBe(1)          // P2 被纳管排除
    expect(sum.totalExpected).toBe(2000000)
    expect(sum.totalActual).toBe(1000000)
    expect(sum.totalRemaining).toBe(1000000)
    expect(sum.rate).toBe(0.5)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/dashboardStats.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/lib/dashboardStats.ts`**

```ts
import type { RawNode } from '@/types/analysis'
import type { ViewMode } from './filterNodes'
import { pctToNum } from './format'

export interface ProjectAgg {
  projectId: string
  projectName: string
  orgL4: string
  orgL3: string
  projectManager: string
  projectType: string
  projectAmount: number
  tier: string
  canAdvance: boolean
  expectedPayment: number
  actualPayment: number
  paymentRatio: number | null
  remainingAmount: number
  paymentStatus: string
  nodes: RawNode[]
}

/** 忠实移植 app.js groupByProject：按 projectId 聚合 + 状态优先级。 */
export function groupByProject(nodes: RawNode[]): ProjectAgg[] {
  const m: Record<string, ProjectAgg> = {}
  for (const raw of nodes) {
    const n = raw as Record<string, any>
    if (!m[n.projectId]) {
      m[n.projectId] = {
        projectId: n.projectId,
        projectName: n.projectName,
        orgL4: n.orgL4 || '',
        orgL3: n.orgL3 || '',
        projectManager: n.projectManager || '',
        projectType: n.projectType || '',
        projectAmount: n.projectAmount || 0,
        tier: n.tier,
        canAdvance: false,
        expectedPayment: 0,
        actualPayment: 0,
        paymentRatio: null,
        remainingAmount: 0,
        paymentStatus: '待确定',
        nodes: [],
      }
    }
    const p = m[n.projectId]
    if (n.isPaymentRelated) {
      p.expectedPayment += n.expectedPayment || 0
      p.actualPayment += n.actualPayment || 0
    }
    if (n.canAdvance) p.canAdvance = true
    p.nodes.push(raw)
  }
  for (const p of Object.values(m)) {
    const rel = p.nodes.filter((n) => (n as Record<string, any>).isPaymentRelated)
    if (!rel.length) {
      p.paymentStatus = '待确定'
      p.paymentRatio = null
    } else {
      p.paymentRatio = p.expectedPayment > 0 ? p.actualPayment / p.expectedPayment : 0
      p.remainingAmount = p.expectedPayment - p.actualPayment
      const has = (s: string) => rel.some((n) => (n as Record<string, any>).nodeStatus === s)
      if (has('加资源可提前')) p.paymentStatus = '加资源可提前'
      else if (has('达到回款条件')) p.paymentStatus = '达到回款条件'
      else if (has('已提前回款')) p.paymentStatus = '已提前回款'
      else if (has('已全额回款')) p.paymentStatus = '已全额回款'
      else if (has('延期')) p.paymentStatus = '延期'
      else if (has('正常实施中')) p.paymentStatus = '正常实施中'
      else p.paymentStatus = '待确定'
    }
  }
  return Object.values(m)
}

function statusStats(group: RawNode[]) {
  const exp = group.reduce((s, n) => s + ((n as Record<string, any>).expectedPayment || 0), 0)
  const act = group.reduce((s, n) => s + ((n as Record<string, any>).actualPayment || 0), 0)
  return { expected: exp, actual: act, remaining: exp - act, rate: exp > 0 ? act / exp : 0 }
}

/** 忠实移植 app.js computeTierStats：按档位统计计数/金额(万)/各状态分组。 */
export function computeTierStats(tier: string, nodes: RawNode[]) {
  const tierNodes = nodes.filter((n) => n.tier === tier)
  const related = tierNodes.filter((n) => (n as Record<string, any>).isPaymentRelated)
  const projectCount = new Set(tierNodes.map((n) => n.projectId)).size
  const relatedProjectCount = new Set(related.map((n) => n.projectId)).size

  const pa: Record<string, number> = {}
  tierNodes.forEach((n) => {
    const r = n as Record<string, any>
    if (!(r.projectId in pa)) pa[r.projectId] = r.projectAmount || 0
  })
  const totalAmount = Object.values(pa).reduce((s, v) => s + v, 0)
  const expectedTotal = related.reduce((s, n) => s + ((n as Record<string, any>).expectedPayment || 0), 0)
  const actualTotal = related.reduce((s, n) => s + ((n as Record<string, any>).actualPayment || 0), 0)
  const remaining = expectedTotal - actualTotal

  const byStatus = (s: string) => related.filter((n) => (n as Record<string, any>).nodeStatus === s)
  const canAdvance = byStatus('加资源可提前')
  const reachedCondition = byStatus('达到回款条件')
  const advance = byStatus('已提前回款')
  const fullPaid = byStatus('已全额回款')
  const onTime = byStatus('正常实施中')
  const delayed = byStatus('延期')

  const ca = statusStats(canAdvance)
  const rc = statusStats(reachedCondition)
  const av = statusStats(advance)
  const fp = statusStats(fullPaid)
  const ot = statusStats(onTime)
  const dl = statusStats(delayed)

  const paid = related.filter((n) => {
    const v = pctToNum((n as Record<string, any>).actualPaymentRatio)
    return v !== null && v >= 1
  })

  return {
    projectCount,
    relatedProjectCount,
    relatedNodeCount: related.length,
    totalAmountWan: totalAmount / 10000,
    expectedAmountWan: expectedTotal / 10000,
    actualAmountWan: actualTotal / 10000,
    remainingAmountWan: remaining / 10000,

    canAdvanceCount: canAdvance.length, canAdvanceExpected: ca.expected / 10000, canAdvanceActual: ca.actual / 10000, canAdvanceRemaining: ca.remaining / 10000, canAdvanceRate: ca.rate,
    reachedConditionCount: reachedCondition.length, reachedConditionExpected: rc.expected / 10000, reachedConditionActual: rc.actual / 10000, reachedConditionRemaining: rc.remaining / 10000, reachedConditionRate: rc.rate,
    advanceCount: advance.length, advanceExpected: av.expected / 10000, advanceActual: av.actual / 10000, advanceRemaining: av.remaining / 10000, advanceRate: av.rate,
    fullPaidCount: fullPaid.length, fullPaidExpected: fp.expected / 10000, fullPaidActual: fp.actual / 10000, fullPaidRemaining: fp.remaining / 10000, fullPaidRate: fp.rate,
    onTimeCount: onTime.length, onTimeExpected: ot.expected / 10000, onTimeActual: ot.actual / 10000, onTimeRemaining: ot.remaining / 10000, onTimeRate: ot.rate,
    delayedCount: delayed.length, delayedExpected: dl.expected / 10000, delayedActual: dl.actual / 10000, delayedRemaining: dl.remaining / 10000, delayedRate: dl.rate,

    paidCount: paid.length,
    paidAmount: paid.reduce((s, n) => s + ((n as Record<string, any>).actualPayment || 0), 0) / 10000,
  }
}

export interface DashSummary {
  relatedNodeCount: number
  totalProjects: number
  totalExpected: number
  totalActual: number
  totalRemaining: number
  rate: number
}

/** 忠实移植 renderDashSummary 的计算部分（不含 HTML）。 */
export function computeDashboardSummary(
  nodes: RawNode[],
  projectOverview: Record<string, any>[],
  opts: { naguanOn: boolean; naguanExclude: Record<string, boolean>; viewMode: ViewMode; viewL4: string; viewPM: string },
): DashSummary {
  const projs = groupByProject(nodes)
  const totalProjects = projectOverview.filter((p) => {
    if (opts.naguanOn && opts.naguanExclude && opts.naguanExclude[p.projectId]) return false
    if (opts.viewMode === 'l4' && opts.viewL4 && p['项目经理L4部门'] !== opts.viewL4) return false
    if (opts.viewMode === 'pm' && opts.viewPM && p['项目经理'] !== opts.viewPM) return false
    return true
  }).length
  const relatedNodeCount = nodes.filter((n) => (n as Record<string, any>).isPaymentRelated).length
  const totalExpected = projs.reduce((s, p) => s + (p.expectedPayment || 0), 0)
  const totalActual = projs.reduce((s, p) => s + (p.actualPayment || 0), 0)
  return {
    relatedNodeCount,
    totalProjects,
    totalExpected,
    totalActual,
    totalRemaining: totalExpected - totalActual,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0,
  }
}
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/dashboardStats.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/dashboardStats.ts frontend/src/lib/dashboardStats.test.ts
git commit -m "feat(frontend): lib/dashboardStats（groupByProject/computeTierStats/computeDashboardSummary 忠实移植）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: DashSummaryCards 组件

**Files:** Create `frontend/src/components/DashSummaryCards.vue`、`frontend/src/components/DashSummaryCards.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/DashSummaryCards.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashSummaryCards from './DashSummaryCards.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三', projectAmount: 2000000, isPaymentRelated: true, nodeStatus: '已全额回款', expectedPayment: 1000000, actualPayment: 1000000, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [{ projectId: 'P1', 项目经理L4部门: '北京', 项目经理: '张三' }], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('DashSummaryCards', () => {
  it('renders five summary cards with computed values', () => {
    seed()
    const wrapper = mount(DashSummaryCards)
    const text = wrapper.text()
    expect(text).toContain('回款节点数 / 项目总数')
    expect(text).toContain('1 / 1')             // relatedNodeCount / totalProjects
    expect(text).toContain('计划回款总金额(万)')
    expect(text).toContain('总完成率')
    expect(text).toContain('100%')              // rate 1.0
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/DashSummaryCards.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/components/DashSummaryCards.vue`**

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

const cards = computed(() => {
  const s = summary.value
  return [
    { label: '回款节点数 / 项目总数', value: `${s.relatedNodeCount} / ${s.totalProjects}`, cls: 'c-primary' },
    { label: '计划回款总金额(万)', value: fmtWan(s.totalExpected), cls: 'c-blue' },
    { label: '已回款总合计(万)', value: fmtWan(s.totalActual), cls: 'c-green' },
    { label: '待回款总金额(万)', value: fmtWan(s.totalRemaining), cls: 'c-red' },
    { label: '总完成率', value: pct(s.rate), cls: s.rate >= 0.8 ? 'c-green' : s.rate >= 0.5 ? 'c-orange' : 'c-red' },
  ]
})
</script>

<template>
  <div class="dash-summary">
    <div v-for="c in cards" :key="c.label" class="ds-card">
      <div class="ds-value" :class="c.cls">{{ c.value }}</div>
      <div class="ds-label">{{ c.label }}</div>
    </div>
  </div>
</template>

<style scoped>
.dash-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding: 16px; }
.ds-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
.ds-value { font-size: 22px; font-weight: 700; }
.ds-label { font-size: 12px; color: #64748b; margin-top: 4px; }
.c-primary { color: #4f46e5; } .c-blue { color: #2563eb; } .c-green { color: #10b981; }
.c-orange { color: #f59e0b; } .c-red { color: #ef4444; }
</style>
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/components/DashSummaryCards.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DashSummaryCards.vue frontend/src/components/DashSummaryCards.test.ts
git commit -m "feat(frontend): DashSummaryCards 汇总卡片（消费 filteredNodes + computeDashboardSummary）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: TierCards 组件

**Files:** Create `frontend/src/components/TierCards.vue`、`frontend/src/components/TierCards.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/TierCards.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TierCards from './TierCards.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '已全额回款', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 1000000, planMonth: '2026-02' },
      { projectId: 'P2', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', projectAmount: 1500000, expectedPayment: 500000, actualPayment: 0, planMonth: '2026-03' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('TierCards', () => {
  it('renders a card per tier with project count and status rows', () => {
    seed()
    const wrapper = mount(TierCards)
    const text = wrapper.text()
    expect(text).toContain('100万以上')
    expect(text).toContain('50-100万')
    expect(text).toContain('50万以下')
    expect(text).toContain('已全额回款')
    expect(text).toContain('延期')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/TierCards.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/components/TierCards.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import { computeTierStats } from '@/lib/dashboardStats'
import { fmtWan, pct } from '@/lib/format'
import { TIERS } from '@/nav'

const filter = useFilterStore()

const STATUS_ROWS = [
  { key: 'canAdvance', label: '加资源可提前' },
  { key: 'reachedCondition', label: '达到回款条件' },
  { key: 'advance', label: '已提前回款' },
  { key: 'fullPaid', label: '已全额回款' },
  { key: 'onTime', label: '正常实施中' },
  { key: 'delayed', label: '延期' },
] as const

const cards = computed(() =>
  TIERS.map((t) => {
    const s = computeTierStats(t.label, filter.filteredNodes) as Record<string, any>
    return {
      tier: t.label,
      color: t.color,
      projectCount: s.projectCount,
      expectedAmountWan: s.expectedAmountWan,
      actualAmountWan: s.actualAmountWan,
      remainingAmountWan: s.remainingAmountWan,
      completion: s.expectedAmountWan > 0 ? s.actualAmountWan / s.expectedAmountWan : 0,
      rows: STATUS_ROWS.map((r) => ({
        label: r.label,
        count: s[`${r.key}Count`] as number,
        amountWan: s[`${r.key}Expected`] as number,
      })),
    }
  }),
)
</script>

<template>
  <div class="tier-cards">
    <div v-for="c in cards" :key="c.tier" class="tier-card">
      <div class="tc-head">
        <span class="tc-dot" :style="{ background: c.color }" />
        <span class="tc-title">{{ c.tier }}</span>
        <span class="tc-count">{{ c.projectCount }} 个项目</span>
      </div>
      <div class="tc-amounts">
        <span>计划 {{ fmtWan(c.expectedAmountWan * 10000) }} 万</span>
        <span>已回 {{ fmtWan(c.actualAmountWan * 10000) }} 万</span>
        <span>完成率 {{ pct(c.completion) }}</span>
      </div>
      <table class="tc-table">
        <tbody>
          <tr v-for="r in c.rows" :key="r.label">
            <td>{{ r.label }}</td>
            <td class="tc-num">{{ r.count }}</td>
            <td class="tc-num">{{ fmtWan(r.amountWan * 10000) }} 万</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.tier-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; padding: 0 16px 16px; }
.tier-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
.tc-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.tc-dot { width: 8px; height: 8px; border-radius: 50%; }
.tc-title { font-weight: 700; color: #0f172a; }
.tc-count { margin-left: auto; font-size: 12px; color: #64748b; }
.tc-amounts { display: flex; gap: 12px; font-size: 12px; color: #475569; margin-bottom: 8px; }
.tc-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.tc-table td { padding: 4px 0; border-top: 1px solid #f1f5f9; }
.tc-num { text-align: right; color: #334155; }
</style>
```

注：`computeTierStats` 返回的金额字段已是"万"单位（`expectedAmountWan` 等 = 元/10000）。模板里 `fmtWan(x * 10000)` 是把"万"还原为"元"再交给 `fmtWan`（除以 10000）得到带千分位的"万"显示——保持与旧版一致的千分位格式。

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/components/TierCards.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/TierCards.vue frontend/src/components/TierCards.test.ts
git commit -m "feat(frontend): TierCards 分层卡片（computeTierStats over filteredNodes）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: DashboardView 组合 + 路由切换

**Files:** Create `frontend/src/views/DashboardView.vue`、`frontend/src/views/DashboardView.test.ts`；Modify `frontend/src/router/index.ts`；Delete `frontend/src/views/HomeView.vue`、`frontend/src/views/HomeView.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/views/DashboardView.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashboardView from './DashboardView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('DashboardView', () => {
  it('renders summary cards and tier cards sections', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [{ projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '已全额回款', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 1000000, planMonth: '2026-02' }],
      projectOverview: { projects: [{ projectId: 'P1' }], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const wrapper = mount(DashboardView)
    expect(wrapper.find('.dash-summary').exists()).toBe(true)
    expect(wrapper.find('.tier-cards').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/DashboardView.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/views/DashboardView.vue`**

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import DashSummaryCards from '@/components/DashSummaryCards.vue'
import TierCards from '@/components/TierCards.vue'

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
      <DashSummaryCards />
      <TierCards />
    </template>
    <p v-else class="dash-hint">暂无数据，请先在数据管理中同步/导入。</p>
  </div>
</template>

<style scoped>
.dashboard { min-height: 100%; }
.dash-hint { padding: 24px; color: #64748b; }
.dash-hint.error { color: #ef4444; }
</style>
```

- [ ] **Step 4: 路由切到 DashboardView，删除 HomeView**

在 `frontend/src/router/index.ts`：把 `import HomeView from '@/views/HomeView.vue'` 改为 `import DashboardView from '@/views/DashboardView.vue'`；把 dashboard 路由（catch-all，name 'dashboard'，alias '/'）的 `component: HomeView` 改为 `component: DashboardView`。
然后删除文件：`frontend/src/views/HomeView.vue` 与 `frontend/src/views/HomeView.test.ts`（`git rm`）。

- [ ] **Step 5: 运行确认通过 + 全量前端验证**

Run: `cd frontend && npx vitest run src/views/DashboardView.test.ts`（PASS）
Run: `cd frontend && npm run test:run`（全部通过；HomeView 测试已随文件删除而移除）
Run: `cd frontend && npm run typecheck`（通过）
Run: `cd frontend && npm run build`（成功）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/DashboardView.vue frontend/src/views/DashboardView.test.ts frontend/src/router/index.ts
git rm frontend/src/views/HomeView.vue frontend/src/views/HomeView.test.ts
git commit -m "feat(frontend): DashboardView 组合汇总+分层卡片，路由 '/' 切到看板（替换 HomeView）

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
- 把 `B5+`（页面）拆出已完成的看板卡片，新增/改写：
  ```
  - [x] **B5** 看板首页（卡片部分）：lib/format + lib/dashboardStats（groupByProject/computeTierStats/computeDashboardSummary 忠实移植）、DashSummaryCards、TierCards、DashboardView 挂到 '/'（替换 HomeView）。
  - [ ] **B6** 看板首页（图表部分）：季度/月度待回款图（ChartBox）、服务组回款达成排名、延期 Top10。
  - [ ] **B7+** 其余页面：分层五页 → 台账/PM → 日历 → 临期跟进 → 数据管理 → 区间对比/关于。
  ```
- 保留 `B-opt`。更新"最近更新"为 `2026-06-04`。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): 标记 B5 看板卡片完成；看板图表 B6，其余页面 B7+

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（看板首页卡片部分）：**
- 格式化工具（忠实移植）→ Task 1 ✓
- 看板计算（groupByProject/computeTierStats/computeDashboardSummary 忠实移植）→ Task 2 ✓
- 汇总卡片 → Task 3 ✓
- 分层卡片 → Task 4 ✓
- DashboardView 挂 '/'（替换 HomeView）→ Task 5 ✓
- **明确移交 B6**：季度/月度图、服务组排名、延期 Top10。**B7+**：其余页面。

**Placeholder scan：** 所有 lib/组件/视图/测试均给出完整代码；命令含预期输出。Task 1 Step 4 对 ICU 千分位差异给了校正说明。无 TBD/TODO。

**一致性：** `groupByProject`/`computeTierStats`/`computeDashboardSummary` 在 lib 与组件间签名一致；金额单位约定明确（computeTierStats 返回"万"，组件用 `fmtWan(x*10000)` 取千分位"万"显示，与旧版一致）；`TIERS`(B2 nav) 复用于 TierCards；`filterStore.filteredNodes` 为数据源（视角/年份/纳管自动生效）；路由 dashboard（catch-all+alias '/'）组件由 HomeView 换为 DashboardView，name 不变、删除 HomeView。

**风险点：**
- 忠实性：Task 1/2 的单测（含状态优先级、纳管/视角 totalProjects、各状态计数与万元金额）是移植护栏。
- `RawNode` extra 字段经 `Record<string,any>` 局部转型访问（schema extra=allow，已在代码中处理）。
- 金额单位换算（万↔元）已在 Task 4 注明，避免双重除法错误——务必按注释实现并由 fmtWan 测试 + 卡片测试共同保护。

---

## Execution Handoff

见会话中执行方式选择（建议同前：subagent-driven-development）。
