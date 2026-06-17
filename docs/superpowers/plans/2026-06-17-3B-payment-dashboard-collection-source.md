# 3B 回款总览 /payment 换源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/payment`(DashboardView) 的 4 个组件从 rawNodes 旧口径换到收款阶段口径（节点级，3A 的 paymentNodes/projects），状态用 5 态，忠实换源（视觉不变）。

**Architecture:** 纯前端。扩展 `PayNodeRow` 三字段；新增 `lib/payDashboard.ts`（收款阶段口径的过滤+聚合，函数返回形态**匹配既有组件契约**使下游不动）；filter store 加 `filteredPayNodes`；4 组件改 import+源。**不动**后端、`filteredNodes`、旧 `dashboardStats/dashboardCharts`（留 3C/3D/3E）。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + Vitest；复用 2B 的 `lib/paymentPmis.ts`。

参考 spec：`docs/superpowers/specs/2026-06-17-3B-payment-dashboard-collection-source-design.md`

**对 spec §接口的细化说明（口径/范围不变）**：spec 的接口代码块为示意；本计划把返回形态**贴合既有组件契约**——`payOrgRanking`→`OrgRank`、`payMonthlyTrend/payQuarterlyTrend`→`PeriodSeries`、`payTierStats` 出 `expectedAmountWan/actualAmountWan/projectCount/delayedCount`、`payDashSummary`→ `DashSummary` 同名字段，使 DashMetrics/OrgRanking/TrendCard 模板与 `PendingBarChart`/`BoardDrilldownModal` **不改**。TierStrip 下钻改用 `projectPaymentRows`（已含 BoardDrilldownModal 所需 8 键）。

**约定（务必遵守）：**
- 简体中文沟通；不用 emoji（用 → ↓ ❌ ✕ ▾）。
- 提交信息结尾固定加：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 严禁 `git add -A`／`git add .`：仓库根有未跟踪文件「看板数据取值条件与计算公式.md」必须始终排除，只用显式路径。
- 前端命令在 `frontend/` 下跑；单测 `npx vitest run <file>`。
- `frontend/src/types/analysis.ts` 自动生成，本期**不涉及后端 schema**，不重生成类型。

**关键背景事实（实现时据此，勿臆测）：**
- `PaymentNodePmis` 节点已有 `receivedAmount/unpaidAmount`（3A）、`status`(5态)、`stage/planDate/actualDate/payRatio/expectedPayment`。
- `paymentNodeRows(paymentNodes, projects, pmisMap)` 现产出 `PayNodeRow{projectId,projectName,stage,planDate,actualDate,payRatio,expectedPayment,status,dept,projStage,tier,progress}`（paymentPmis.ts:163-212）。`dept=deriveDept(project)=orgL4||'未指定'`；`tier=deriveTier(contract)`，无合同→`'未知'`。
- `deriveTier` 档名：`100万以上 / 50-100万 / 50万以下 / 未知`。
- 旧 `OrgRank` 形态：`{org,expectedTotal,actualTotal,actualTotalWan,achievementRate}`（dashboardCharts.ts:77-83）。
- 旧 `PeriodSeries` 形态：`{categories:string[], series:{tier,data:number[]}[]}`（dashboardCharts.ts:20-23），`TIER_KEYS=['100万以上','50-100万','50万以下']`。
- 旧 `DashSummary`：`{relatedNodeCount,totalProjects,totalExpected,totalActual,totalRemaining,rate,delayedProjects}`（dashboardStats.ts:138-146）。
- `filterProjects(projects, {viewMode,viewL4,viewPM,excludeActive,excludedIds})`（paymentPmis.ts:64-71）已实现项目级视角/排除过滤。

---

### Task 1: 扩展 PayNodeRow 三字段（金额+经理）

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts:164-212`
- Test: `frontend/src/lib/paymentPmis.test.ts`

- [ ] **Step 1: 加失败测试** — 在 `frontend/src/lib/paymentPmis.test.ts` 末尾追加（若已有 `paymentNodeRows` 的 describe，则在其内补一个 it；否则新增 describe）：

```ts
import { paymentNodeRows } from './paymentPmis'

describe('paymentNodeRows 金额与经理字段(3B)', () => {
  it('节点行带 receivedAmount/unpaidAmount/projectManager', () => {
    const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组',
      paymentPmis: { contract: 2000000 } }] as any
    const paymentNodes = { P1: [
      { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.7, expectedPayment: 700000,
        receivedAmount: 300000, unpaidAmount: 400000, status: '部分回款' },
    ] } as any
    const rows = paymentNodeRows(paymentNodes, projects)
    expect(rows[0].receivedAmount).toBe(300000)
    expect(rows[0].unpaidAmount).toBe(400000)
    expect(rows[0].projectManager).toBe('张三')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts -t "金额与经理字段"`
Expected: FAIL（`receivedAmount` 等为 undefined）

- [ ] **Step 3: 扩展接口与构建** — `frontend/src/lib/paymentPmis.ts`：

(a) `PayNodeRow` 接口（约 164-177 行）追加三字段（放在 `expectedPayment` 后）：

```ts
  expectedPayment: number
  receivedAmount: number
  unpaidAmount: number
  projectManager: string
  status: string
```

(b) `paymentNodeRows` 的 `rows.push({...})`（约 195-208 行）补三字段（放在 `expectedPayment` 后）：

```ts
        expectedPayment: n.expectedPayment ?? 0,
        receivedAmount: n.receivedAmount ?? 0,
        unpaidAmount: n.unpaidAmount ?? 0,
        projectManager: (p.projectManager ?? '').trim() || '未指定',
        status: n.status || '',
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: PASS（含既有用例）

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无报错（追加字段，现有 /panalysis 消费方忽略）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "$(cat <<'EOF'
feat(3b): PayNodeRow 增 receivedAmount/unpaidAmount/projectManager

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 新增 lib/payDashboard.ts —— filterPayNodes + payDashSummary + payTierStats

**Files:**
- Create: `frontend/src/lib/payDashboard.ts`
- Test: `frontend/src/lib/payDashboard.test.ts`

- [ ] **Step 1: 写失败测试** — 新建 `frontend/src/lib/payDashboard.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { filterPayNodes, payDashSummary, payTierStats } from './payDashboard'
import type { PayNodeRow } from './paymentPmis'

function node(p: Partial<PayNodeRow>): PayNodeRow {
  return {
    projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-01', actualDate: '',
    payRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0, projectManager: '张三',
    status: '待回款', dept: 'A组', projStage: '', tier: '100万以上', progress: '部分回款', ...p,
  }
}

describe('filterPayNodes', () => {
  const rows = [
    node({ projectId: 'P1', dept: 'A组', projectManager: '张三', planDate: '2026-02-01' }),
    node({ projectId: 'P2', dept: 'B组', projectManager: '李四', planDate: '2026-08-01' }),
    node({ projectId: 'P3', dept: 'A组', projectManager: '张三', planDate: '' }),
  ]
  const base = { filterYear: 'all', viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  it('视角 l4 按 dept 过滤', () => {
    expect(filterPayNodes(rows, { ...base, viewMode: 'l4', viewL4: 'A组' }).map((r) => r.projectId)).toEqual(['P1', 'P3'])
  })
  it('视角 pm 按 projectManager 过滤', () => {
    expect(filterPayNodes(rows, { ...base, viewMode: 'pm', viewPM: '李四' }).map((r) => r.projectId)).toEqual(['P2'])
  })
  it('排除按 excludedIds', () => {
    expect(filterPayNodes(rows, { ...base, excludeActive: true, excludedIds: { P1: true } }).map((r) => r.projectId)).toEqual(['P2', 'P3'])
  })
  it('单年度按 planDate 月份(无 planDate 被排除)', () => {
    expect(filterPayNodes(rows, { ...base, filterYear: '2026' }).map((r) => r.projectId)).toEqual(['P1', 'P2'])
  })
  it('季度过滤 2026-Q1', () => {
    expect(filterPayNodes(rows, { ...base, filterYear: '2026-Q1' }).map((r) => r.projectId)).toEqual(['P1'])
  })
})

describe('payDashSummary', () => {
  const rows = [
    node({ projectId: 'P1', expectedPayment: 1000, receivedAmount: 600, unpaidAmount: 400, status: '部分回款' }),
    node({ projectId: 'P2', expectedPayment: 500, receivedAmount: 0, unpaidAmount: 500, status: '延期' }),
  ]
  const projects = [{ projectId: 'P1', orgL4: 'A组', projectManager: '张三' }, { projectId: 'P2', orgL4: 'B组', projectManager: '李四' }] as any
  const opts = { viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
  it('金额/完成率/延期项目/项目数', () => {
    const s = payDashSummary(rows, projects, opts)
    expect(s.relatedNodeCount).toBe(2)
    expect(s.totalProjects).toBe(2)
    expect(s.totalActual).toBe(600)
    expect(s.totalExpected).toBe(1500)
    expect(s.totalRemaining).toBe(900)
    expect(s.rate).toBeCloseTo(0.4)
    expect(s.delayedProjects).toBe(1)
  })
})

describe('payTierStats', () => {
  const rows = [
    node({ projectId: 'P1', tier: '100万以上', expectedPayment: 1000, receivedAmount: 600, unpaidAmount: 400, status: '已回款' }),
    node({ projectId: 'P1', tier: '100万以上', expectedPayment: 500, receivedAmount: 0, unpaidAmount: 500, status: '延期' }),
    node({ projectId: 'P2', tier: '50万以下', expectedPayment: 100, receivedAmount: 0, unpaidAmount: 100, status: '待回款' }),
  ]
  it('单档聚合 Wan + 5态计数', () => {
    const s = payTierStats('100万以上', rows)
    expect(s.projectCount).toBe(1)
    expect(s.expectedAmountWan).toBeCloseTo(0.15)
    expect(s.actualAmountWan).toBeCloseTo(0.06)
    expect(s.delayedCount).toBe(1)
    expect(s.paidCount).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/payDashboard.test.ts`
Expected: FAIL（模块/导出不存在）

- [ ] **Step 3: 实现** — 新建 `frontend/src/lib/payDashboard.ts`：

```ts
import type { Project } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
import { filterProjects, type FilterOpts as ProjFilterOpts } from './paymentPmis'

export interface PayNodeFilterOpts {
  filterYear: string
  viewMode: 'global' | 'l4' | 'pm'
  viewL4: string
  viewPM: string
  excludeActive: boolean
  excludedIds: Record<string, boolean>
}

const Q_RANGE: Record<string, [string, string]> = {
  Q1: ['01', '03'], Q2: ['04', '06'], Q3: ['07', '09'], Q4: ['10', '12'],
}

/** 镜像 lib/filterNodes：视角(dept/projectManager) → 排除 → 年份/季度(按 planDate 月份)。无 planDate 的节点在年/季筛选被排除。 */
export function filterPayNodes(rows: PayNodeRow[], opts: PayNodeFilterOpts): PayNodeRow[] {
  let ns = rows
  if (opts.viewMode === 'l4' && opts.viewL4) ns = ns.filter((r) => r.dept === opts.viewL4)
  if (opts.viewMode === 'pm' && opts.viewPM) ns = ns.filter((r) => r.projectManager === opts.viewPM)
  if (opts.excludeActive && opts.excludedIds) ns = ns.filter((r) => !opts.excludedIds[r.projectId])
  const fy = opts.filterYear
  if (fy === 'all') return ns
  const mo = (r: PayNodeRow) => (r.planDate || '').slice(0, 7)
  if (fy.includes('-Q')) {
    const keyPart = fy.startsWith('upto') ? fy.slice(4) : fy
    const [qYear, qn] = keyPart.split('-Q')
    const range = Q_RANGE['Q' + qn]
    if (!range) return ns
    const mStart = `${qYear}-${range[0]}`, mEnd = `${qYear}-${range[1]}`
    return ns.filter((r) => { const m = mo(r); return !!m && m >= mStart && m <= mEnd })
  }
  if (fy.startsWith('upto')) {
    const end = `${fy.slice(4)}-12`
    return ns.filter((r) => { const m = mo(r); return !!m && m <= end })
  }
  const start = `${fy}-01`, end = `${fy}-12`
  return ns.filter((r) => { const m = mo(r); return !!m && m >= start && m <= end })
}

export interface PayDashSummary {
  relatedNodeCount: number
  totalProjects: number
  totalExpected: number
  totalActual: number
  totalRemaining: number
  rate: number
  delayedProjects: number
}

/** 看板指标(同 DashSummary 字段名)。项目数按视角/排除过滤 projects(不随年份)。金额=节点收款阶段口径。 */
export function payDashSummary(rows: PayNodeRow[], projects: Project[], opts: ProjFilterOpts): PayDashSummary {
  const totalExpected = rows.reduce((s, r) => s + r.expectedPayment, 0)
  const totalActual = rows.reduce((s, r) => s + r.receivedAmount, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.unpaidAmount, 0)
  const delayedPids = new Set(rows.filter((r) => r.status === '延期').map((r) => r.projectId))
  return {
    relatedNodeCount: rows.length,
    totalProjects: filterProjects(projects, opts).length,
    totalExpected, totalActual, totalRemaining,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0,
    delayedProjects: delayedPids.size,
  }
}

export interface PayTierStat {
  projectCount: number
  relatedNodeCount: number
  expectedAmountWan: number
  actualAmountWan: number
  remainingAmountWan: number
  delayedCount: number
  paidCount: number
}

/** 单档聚合(字段名贴合 TierStrip 既有用法 expectedAmountWan/actualAmountWan/projectCount/delayedCount)。 */
export function payTierStats(tier: string, rows: PayNodeRow[]): PayTierStat {
  const grp = rows.filter((r) => r.tier === tier)
  const expected = grp.reduce((s, r) => s + r.expectedPayment, 0)
  const actual = grp.reduce((s, r) => s + r.receivedAmount, 0)
  const remaining = grp.reduce((s, r) => s + r.unpaidAmount, 0)
  return {
    projectCount: new Set(grp.map((r) => r.projectId)).size,
    relatedNodeCount: grp.length,
    expectedAmountWan: expected / 10000,
    actualAmountWan: actual / 10000,
    remainingAmountWan: remaining / 10000,
    delayedCount: grp.filter((r) => r.status === '延期').length,
    paidCount: grp.filter((r) => r.status === '已回款').length,
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/payDashboard.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/payDashboard.ts frontend/src/lib/payDashboard.test.ts
git commit -m "$(cat <<'EOF'
feat(3b): payDashboard filterPayNodes + payDashSummary + payTierStats

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: payDashboard —— payOrgRanking + payMonthlyTrend + payQuarterlyTrend

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`
- Test: `frontend/src/lib/payDashboard.test.ts`

- [ ] **Step 1: 加失败测试** — 在 `payDashboard.test.ts` 末尾追加：

```ts
import { payOrgRanking, payMonthlyTrend, payQuarterlyTrend } from './payDashboard'

describe('payOrgRanking', () => {
  const rows = [
    node({ dept: 'A组', expectedPayment: 1000, receivedAmount: 800 }),
    node({ dept: 'B组', expectedPayment: 1000, receivedAmount: 100 }),
  ]
  it('OrgRank 形态 + 按 actualTotal 降序', () => {
    const r = payOrgRanking(rows, 'actualTotal')
    expect(r[0].org).toBe('A组')
    expect(r[0].actualTotal).toBe(800)
    expect(r[0].achievementRate).toBeCloseTo(0.8)
  })
  it('按 achievementRate 降序', () => {
    expect(payOrgRanking(rows, 'achievementRate')[0].org).toBe('A组')
  })
})

describe('payMonthlyTrend/payQuarterlyTrend', () => {
  const rows = [
    node({ tier: '100万以上', planDate: '2026-02-10', unpaidAmount: 10000, status: '待回款' }),
    node({ tier: '100万以上', planDate: '2026-05-10', unpaidAmount: 20000, status: '延期' }),
    node({ tier: '100万以上', planDate: '2026-02-10', unpaidAmount: 99999, status: '已回款' }), // 已回款不计入待回款
  ]
  it('月度按 planDate 月份分桶,已回款不计', () => {
    const s = payMonthlyTrend(rows, 'all')
    expect(s.categories).toContain('2026-02')
    const t = s.series.find((x) => x.tier === '100万以上')!
    const i = s.categories.indexOf('2026-02')
    expect(t.data[i]).toBeCloseTo(1) // 10000/10000=1 万,已回款的 99999 不计
  })
  it('指定年份补满 12 月', () => {
    expect(payMonthlyTrend(rows, '2026').categories.length).toBe(12)
  })
  it('季度分桶 key 形如 2026-Q1', () => {
    expect(payQuarterlyTrend(rows, 'all').categories).toContain('2026-Q1')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/payDashboard.test.ts -t "payOrgRanking"`
Expected: FAIL（导出不存在）

- [ ] **Step 3: 实现** — 在 `payDashboard.ts` 末尾追加：

```ts
export interface OrgRank {
  org: string
  expectedTotal: number
  actualTotal: number
  actualTotalWan: number
  achievementRate: number
}

/** 服务组(dept)达成排名。sortBy: 'actualTotal' | 'achievementRate'。降序全量(组件自行 slice)。 */
export function payOrgRanking(rows: PayNodeRow[], sortBy: 'actualTotal' | 'achievementRate'): OrgRank[] {
  const m: Record<string, OrgRank> = {}
  for (const r of rows) {
    const org = r.dept || '未指定'
    if (!m[org]) m[org] = { org, expectedTotal: 0, actualTotal: 0, actualTotalWan: 0, achievementRate: 0 }
    m[org].expectedTotal += r.expectedPayment
    m[org].actualTotal += r.receivedAmount
  }
  const list = Object.values(m).map((o) => ({
    ...o,
    achievementRate: o.expectedTotal > 0 ? o.actualTotal / o.expectedTotal : 0,
    actualTotalWan: o.actualTotal / 10000,
  }))
  return list.sort((a, b) => b[sortBy] - a[sortBy])
}

export interface PeriodSeries {
  categories: string[]
  series: { tier: string; data: number[] }[]
}

const TIER_KEYS = ['100万以上', '50-100万', '50万以下'] as const

function isSpecificYear(filterYear: string): boolean {
  return filterYear !== 'all' && !filterYear.startsWith('upto') && !filterYear.includes('-Q')
}
function quarterOf(planMonth: string): string {
  const [y, moStr] = planMonth.split('-')
  const mo = parseInt(moStr, 10)
  const q = mo <= 3 ? 'Q1' : mo <= 6 ? 'Q2' : mo <= 9 ? 'Q3' : 'Q4'
  return `${y}-${q}`
}

/** 待回款趋势：未全额回款(status≠已回款)的节点按 planDate 月份/季度分桶,待回款=Σunpaid(万),按 tier 分层。 */
function buildPaySeries(rows: PayNodeRow[], keyOf: (planMonth: string) => string, fillKeys: string[]): PeriodSeries {
  const byTier: Record<string, Record<string, number>> = {}
  TIER_KEYS.forEach((t) => (byTier[t] = {}))
  const catSet: Record<string, true> = {}
  for (const r of rows) {
    if (r.status === '已回款') continue
    const m = (r.planDate || '').slice(0, 7)
    if (!m) continue
    const k = keyOf(m)
    const tier = r.tier
    if (!byTier[tier]) continue // 仅三档进趋势(未知档不计,同旧 TIER_KEYS 口径)
    byTier[tier][k] = (byTier[tier][k] || 0) + r.unpaidAmount / 10000
    catSet[k] = true
  }
  for (const k of fillKeys) {
    catSet[k] = true
    TIER_KEYS.forEach((t) => { if (byTier[t][k] === undefined) byTier[t][k] = 0 })
  }
  const categories = Object.keys(catSet).sort()
  return { categories, series: TIER_KEYS.map((t) => ({ tier: t, data: categories.map((c) => byTier[t][c] || 0) })) }
}

export function payQuarterlyTrend(rows: PayNodeRow[], filterYear: string): PeriodSeries {
  const fill = isSpecificYear(filterYear) ? ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => `${filterYear}-${q}`) : []
  return buildPaySeries(rows, quarterOf, fill)
}
export function payMonthlyTrend(rows: PayNodeRow[], filterYear: string): PeriodSeries {
  const fill = isSpecificYear(filterYear)
    ? Array.from({ length: 12 }, (_, i) => `${filterYear}-${String(i + 1).padStart(2, '0')}`)
    : []
  return buildPaySeries(rows, (m) => m, fill)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/payDashboard.test.ts`
Expected: PASS（全部）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/payDashboard.ts frontend/src/lib/payDashboard.test.ts
git commit -m "$(cat <<'EOF'
feat(3b): payDashboard payOrgRanking + payMonthly/QuarterlyTrend

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: filter store 加 filteredPayNodes

**Files:**
- Modify: `frontend/src/stores/filter.ts`
- Test: `frontend/src/stores/filter.test.ts`

- [ ] **Step 1: 加失败测试** — 在 `frontend/src/stores/filter.test.ts` 末尾追加（沿用该文件既有 setActivePinia/seed 模式；若已有 useDataStore 注入助手则复用）：

```ts
import { useDataStore as _useDataStore } from '@/stores/data'

describe('filteredPayNodes(3B)', () => {
  it('随 viewMode/filterYear 过滤收款阶段节点', () => {
    const ds = _useDataStore()
    ds.data = {
      meta: {}, dashboard: {}, summary: {}, projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {}, rawNodes: [],
      projects: [
        { projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } },
        { projectId: 'P2', projectName: '乙', projectManager: '李四', orgL4: 'B组', paymentPmis: { contract: 100000 } },
      ],
      projectPmis: {},
      paymentNodes: {
        P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.7, expectedPayment: 700000, receivedAmount: 0, unpaidAmount: 700000, status: '待回款' }],
        P2: [{ stage: '预付款', planDate: '2026-08-01', actualDate: '', payRatio: 1, expectedPayment: 100000, receivedAmount: 0, unpaidAmount: 100000, status: '待回款' }],
      },
    } as any
    const f = useFilterStore()
    expect(f.filteredPayNodes.length).toBe(2)
    f.setViewL4('A组')
    expect(f.filteredPayNodes.map((r) => r.projectId)).toEqual(['P1'])
    f.setViewGlobal()
    f.setYear('2026-Q1')
    expect(f.filteredPayNodes.map((r) => r.projectId)).toEqual(['P1'])
  })
})
```

> 注：`filter.test.ts` 顶部已 import `useFilterStore` 与 `beforeEach(setActivePinia(createPinia()))`；本用例复用。若文件无 `useDataStore` import，按上面 `_useDataStore` 别名引入即可。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts -t "filteredPayNodes"`
Expected: FAIL（`filteredPayNodes` 未定义）

- [ ] **Step 3: 实现** — `frontend/src/stores/filter.ts`：

(a) 顶部 import 追加：

```ts
import { paymentNodeRows } from '@/lib/paymentPmis'
import { filterPayNodes } from '@/lib/payDashboard'
```

(b) 在 `filteredNodes` computed 之后加两个 computed：

```ts
  const payNodeRowsAll = computed(() =>
    paymentNodeRows(data.data?.paymentNodes, data.data?.projects ?? [], data.data?.projectPmis),
  )
  const filteredPayNodes = computed(() =>
    filterPayNodes(payNodeRowsAll.value, {
      filterYear: filterYear.value, viewMode: viewMode.value, viewL4: viewL4.value, viewPM: viewPM.value,
      excludeActive: excludeOn.value, excludedIds: excludedIds.value,
    }),
  )
```

(c) `return { ... }` 里把 `filteredPayNodes` 加入导出（与 `filteredNodes` 并列；`payNodeRowsAll` 不必导出）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/filter.ts frontend/src/stores/filter.test.ts
git commit -m "$(cat <<'EOF'
feat(3b): filter store 加 filteredPayNodes(收款阶段过滤节点)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: DashMetrics 换源

**Files:**
- Modify: `frontend/src/components/DashMetrics.vue:1-31`
- Test: `frontend/src/components/DashMetrics.test.ts`

- [ ] **Step 1: 改测试先失败** — 把 `DashMetrics.test.ts` 的 seed 从 rawNodes 改为收款阶段，断言保留。替换该用例 body：

```ts
  it('渲染六个指标含延期数(收款阶段口径)', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
      projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }],
      projectPmis: {},
      paymentNodes: { P1: [
        { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.6, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
      ] },
    } as any
    const w = mount(DashMetrics)
    const cards = w.findAll('.dm-card')
    expect(cards.length).toBe(6)
    const text = w.text()
    expect(text).toContain('项目数')
    expect(text).toContain('回款节点')
    expect(text).toContain('延期')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/DashMetrics.test.ts`
Expected: FAIL（旧 summary 基于 filteredNodes/projectOverview，新 seed 无 rawNodes → 数值/卡异常或仍引用旧源）

- [ ] **Step 3: 换源** — `DashMetrics.vue` `<script setup>`：

把 import 与 summary 改为：

```ts
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { payDashSummary } from '@/lib/payDashboard'
import { fmtWan, pct } from '@/lib/format'

const data = useDataStore()
const filter = useFilterStore()

const summary = computed(() =>
  payDashSummary(filter.filteredPayNodes, data.data?.projects ?? [], {
    excludeActive: filter.excludeOn, excludedIds: filter.excludedIds,
    viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
  }),
)
```

`metrics` computed 与模板**不变**（字段名 totalProjects/relatedNodeCount/totalActual/totalRemaining/rate/delayedProjects 一致）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/DashMetrics.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DashMetrics.vue frontend/src/components/DashMetrics.test.ts
git commit -m "$(cat <<'EOF'
feat(3b): DashMetrics 换收款阶段口径(filteredPayNodes)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: TierStrip 换源（含下钻改 projectPaymentRows）

**Files:**
- Modify: `frontend/src/components/TierStrip.vue:1-42`
- Test: `frontend/src/components/TierStrip.test.ts`

- [ ] **Step 1: 改测试先失败** — 把 `TierStrip.test.ts` 两个用例的 seed 改为收款阶段。第一个用例 body：

```ts
  it('每档渲染一条进度行并显示完成率(收款阶段口径)', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
      projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }],
      projectPmis: {},
      paymentNodes: { P1: [
        { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.6, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
      ] },
    } as any
    const w = mount(TierStrip, { global: { stubs: { BoardDrilldownModal: true } } })
    expect(w.findAll('.ts-row').length).toBe(3)
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('60%')
  })
```

第二个用例（点击下钻）seed 同款（projects+paymentNodes，含一个 100万以上 项目），断言不变（`(w.vm as any).drillOpen` 为 true）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/TierStrip.test.ts`
Expected: FAIL

- [ ] **Step 3: 换源** — `TierStrip.vue` `<script setup>`：

(a) import 改：

```ts
import { ref, computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { payTierStats } from '@/lib/payDashboard'
import { projectPaymentRows, type PayProjectRow } from '@/lib/paymentPmis'
import { fmtWan, pct } from '@/lib/format'
import { TIERS } from '@/nav'
import BoardDrilldownModal from './BoardDrilldownModal.vue'

const data = useDataStore()
const filter = useFilterStore()
```

(b) `rows` computed 改用 payTierStats（字段名 expectedAmountWan/actualAmountWan/projectCount/delayedCount 一致，模板不变）：

```ts
const rows = computed(() =>
  TIERS.map((t) => {
    const s = payTierStats(t.label, filter.filteredPayNodes)
    const expectedWan = s.expectedAmountWan
    const actualWan = s.actualAmountWan
    return {
      tier: t.label,
      projectCount: s.projectCount,
      expectedWan,
      actualWan,
      completion: expectedWan > 0 ? actualWan / expectedWan : 0,
      delayedCount: s.delayedCount,
    }
  }),
)
```

(c) 下钻改用 projectPaymentRows（取该档、且在 filteredPayNodes 中出现的项目；BoardDrilldownModal 需 projectId/projectName/tier/orgL4/projectManager/projectAmount/paymentStatus/paymentRatio，PayProjectRow 全有）：

```ts
const drillOpen = ref(false)
const drillTitle = ref('')
const drillProjects = ref<PayProjectRow[]>([])
function openTier(tier: string) {
  drillTitle.value = tier
  const pids = new Set(filter.filteredPayNodes.filter((r) => r.tier === tier).map((r) => r.projectId))
  drillProjects.value = projectPaymentRows(data.data?.projects ?? [], data.data?.projectPmis)
    .filter((r) => pids.has(r.projectId))
  drillOpen.value = true
}
defineExpose({ drillOpen })
```

模板与 `barColor` 不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/TierStrip.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/TierStrip.vue frontend/src/components/TierStrip.test.ts
git commit -m "$(cat <<'EOF'
feat(3b): TierStrip 换收款阶段口径 + 下钻改 projectPaymentRows

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: OrgRanking 换源

**Files:**
- Modify: `frontend/src/components/OrgRanking.vue:1-26`
- Test: `frontend/src/components/OrgRanking.test.ts`

- [ ] **Step 1: 改测试先失败** — 读 `OrgRanking.test.ts`，把 seed 从 rawNodes 改为收款阶段（参照下方形态），保留"渲染排名行/排序"类断言：

seed 形态（替换原 rawNodes 注入；其余 meta/dashboard/summary/projectOverview/naguan…/displayColumns/followupRecords 保留）：

```ts
      rawNodes: [],
      projects: [
        { projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } },
        { projectId: 'P2', projectName: '乙', projectManager: '李四', orgL4: 'B组', paymentPmis: { contract: 2000000 } },
      ],
      projectPmis: {},
      paymentNodes: {
        P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.8, expectedPayment: 1000000, receivedAmount: 800000, unpaidAmount: 200000, status: '部分回款' }],
        P2: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.1, expectedPayment: 1000000, receivedAmount: 100000, unpaidAmount: 900000, status: '部分回款' }],
      },
```

断言至少：渲染出 'A组'、'B组'，A 组排在 B 组之前（actualTotal 降序）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/OrgRanking.test.ts`
Expected: FAIL

- [ ] **Step 3: 换源** — `OrgRanking.vue` `<script setup>` 改 import 与 ranked（`OrgRank` 字段 org/actualTotal/achievementRate 一致，模板与 SORT_OPTS 不变）：

```ts
import { rankByOrg as _old } from '@/lib/dashboardCharts' // 删除此行
```
→ 改为：
```ts
import { payOrgRanking } from '@/lib/payDashboard'
```
并把 `ranked` 改：
```ts
const ranked = computed(() =>
  payOrgRanking(filter.filteredPayNodes, sortBy.value as 'actualTotal' | 'achievementRate').slice(0, 8),
)
```
其余（useFilterStore/router/sortBy/SORT_OPTS/maxActual/rateColor/模板）不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/OrgRanking.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/OrgRanking.vue frontend/src/components/OrgRanking.test.ts
git commit -m "$(cat <<'EOF'
feat(3b): OrgRanking 换收款阶段口径(payOrgRanking)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: TrendCard 换源

**Files:**
- Modify: `frontend/src/components/TrendCard.vue:1-20`
- Test: `frontend/src/components/TrendCard.test.ts`

- [ ] **Step 1: 改测试先失败** — 读 `TrendCard.test.ts`，把 seed 改为收款阶段（含带 planDate/unpaidAmount/tier 的节点），保留趋势渲染断言。seed 形态：

```ts
      rawNodes: [],
      projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }],
      projectPmis: {},
      paymentNodes: { P1: [
        { stage: '到货款', planDate: '2026-02-10', actualDate: '', payRatio: 0.5, expectedPayment: 1000000, receivedAmount: 0, unpaidAmount: 500000, status: '待回款' },
      ] },
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/TrendCard.test.ts`
Expected: FAIL

- [ ] **Step 3: 换源** — `TrendCard.vue` `<script setup>` 改 import 与 series（返回 `PeriodSeries`，PendingBarChart 与模板不变）：

```ts
import { aggregateMonthly, aggregateQuarterly } from '@/lib/dashboardCharts' // 删除
```
→
```ts
import { payMonthlyTrend, payQuarterlyTrend } from '@/lib/payDashboard'
```
并把 `series` 改：
```ts
const series = computed(() =>
  period.value === 'month'
    ? payMonthlyTrend(filter.filteredPayNodes, filter.filterYear)
    : payQuarterlyTrend(filter.filteredPayNodes, filter.filterYear),
)
```
其余不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/TrendCard.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/TrendCard.vue frontend/src/components/TrendCard.test.ts
git commit -m "$(cat <<'EOF'
feat(3b): TrendCard 换收款阶段口径(payMonthly/QuarterlyTrend)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 版本 V1.6.4 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 升版本** — `frontend/src/version.ts`：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.6.4'
export const RELEASE_DATE = '2026-06-17'
```

- [ ] **Step 2: 更新 PROGRESS.md** — 在「全局下线 rawNodes 程序」条目（含①3A 的那条）里，把"②3B 概览/…待开"更新为已做，追加一句（紧随 3A 描述后）：

```markdown
②**3B 回款总览 /payment 换源（spec/plan 2026-06-17-3B-payment-dashboard-collection-source，V1.6.4，feat/3b-payment-dashboard-source）**：纯前端忠实换源——DashboardView 4 组件（DashMetrics/TierStrip/OrgRanking/TrendCard）从 rawNodes 旧口径(filteredNodes)换到收款阶段节点级口径(paymentNodes+projects)，状态用 5 态、年份/视角/排除筛选保留。新增 lib/payDashboard.ts（filterPayNodes + payDashSummary/payTierStats/payOrgRanking/payMonthly·QuarterlyTrend，返回形态贴合既有组件契约使 PendingBarChart/BoardDrilldownModal 不动）；扩展 PayNodeRow 增 receivedAmount/unpaidAmount/projectManager；filter store 加 filteredPayNodes。不动后端(dashboard 对象前端未消费,留 3E)、不动 filteredNodes 及旧 dashboardStats/dashboardCharts（留 /ledger 3C、/calendar 3D）。③-⑤ 3C 台账 / 3D 日历 / 3E 移除后端 rawNodes 待开。
```

（若原条目尾部为"②-⑤ … 待开"，相应改写为"③-⑤ … 待开"。）

- [ ] **Step 3: typecheck + 全量 verify.sh**

Run: `cd frontend && npm run typecheck` → 无报错
Run: `bash verify.sh`
Expected: python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

- [ ] **Step 4: 手验（可选但建议）** — `cd frontend && npm run build` 后或开发模式手验 `/payment`：6 指标卡/分层/服务组排名/趋势有数，年份/视角/排除筛选切换看板随之变化，无 JS 报错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "$(cat <<'EOF'
chore(3b): 版本 V1.6.4 + PROGRESS(回款总览换源)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完成定义

- 9 任务全部提交；`bash verify.sh` 全绿。
- `/payment` 4 组件由收款阶段口径驱动、状态 5 态、年份/视角/排除筛选生效、视觉不变。
- 版本 V1.6.4；PROGRESS 已记。
- 未触碰：后端、`filteredNodes`、`lib/dashboardStats.ts`/`dashboardCharts.ts`、`l4Options/pmOptions`、PendingBarChart/BoardDrilldownModal、仓库根未跟踪文件。
