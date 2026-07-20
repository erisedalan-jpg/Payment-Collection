# V2.4.0 商机看板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增商机统计看板页 `/opportunities/board`，读现有商机数据，自上而下复刻 `oppoboard.pdf` 的约 19 个统计元素（KPI 卡 + 环形/饼/柱/多系列折线/双轴组合/堆叠柱）。

**Architecture:** 纯前端。新增 `lib/opportunityBoard.ts`（聚合纯函数 + 复杂图 ECharts option 构造）与 `views/OpportunitiesBoardView.vue`（布局+渲染），复用 `charts/ChartBox.vue` 与 `lib/chartOptions.ts` 的 `buildRankingOption`（给后者加一个 `'wan'` valueKind）。读现有 `useOpportunitiesStore().rows`（`/api/opportunities`，已按 L4 隔离）。最后接路由/导航/门禁。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus + ECharts（vue-echarts，经 ChartBox 封装）；Vitest 单测。

## Global Constraints

- 纯前端：**不改**后端（`opportunities.py`/`server.py`）、不改商机数据结构、不新增端点。读现有 `/api/opportunities`。
- 设计令牌只引用 `theme.css` 变量与 `echartsTheme.ts` 的 `CHART_LIGHT`；图表经 `ChartBox`；不手写散值色/间距。
- 金额口径：商机 `amountWan` 已是**万元数值**；所有金额=`Σ amountWan`，单位万元；**不得**走 `buildRankingOption` 的 `'amount'`（会再 ÷10000），金额图用新 `'wan'` 档或 lib 自建 option。
- 口径（用户钦定）：产品维度=`productCategory`；AI相关=`String(productCategory).toUpperCase().includes('AI')`；近7天=`0 ≤ (今天−d) ≤ 7`（与 `recentUpdateOf` 同口径）；月趋势=按 `firstReg` 分月。
- 不使用 emoji。版本单一来源 `frontend/src/version.ts`：`APP_VERSION='V2.4.0'`、`RELEASE_DATE='2026-06-29'`。
- 验证：`bash verify.sh` 全绿。先补测试再写实现（TDD）。
- 工作目录：仓库根 `C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection`；前端命令在 `frontend/` 下跑。
- 仓库工作树有大量预先存在的未跟踪文件/改动（docs/、.claude/、.gitignore、deploy 等），**不是本次改动**；每个任务**只 `git add` 本任务列出的文件**，绝不 `git add -A`。

---

### Task 1: chartOptions.ts 新增 `'wan'` valueKind

**Files:**
- Modify: `frontend/src/lib/chartOptions.ts`（`ValueKind` 类型约 `:12`；`makeLabelFormatter` 约 `:25-41`）
- Test: `frontend/src/lib/chartOptions.test.ts`（若不存在则新建）

**Interfaces:**
- Produces: `ValueKind` 增加 `'wan'`；`buildRankingOption(type, { valueKind: 'wan', ... })` 时金额按原值显示并带「万」后缀（不 ÷10000）。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/chartOptions.test.ts` 追加（文件不存在则新建，含下方 import 头）：

```ts
import { describe, it, expect } from 'vitest'
import { buildRankingOption } from './chartOptions'

describe("buildRankingOption valueKind 'wan'", () => {
  it('bar: 值原样不除万, 标签带「万」', () => {
    const opt = buildRankingOption('bar', {
      categories: ['终端安全'], values: [22604], metricLabel: '预估金额(万元)', valueKind: 'wan',
    })
    // series 数据未被 ÷10000
    expect(opt.series[0].data).toEqual([22604])
    // y 轴名沿用 metricLabel(不追加 (万))
    expect(opt.yAxis.name).toBe('预估金额(万元)')
    // label formatter 输出含「万」
    const txt = opt.series[0].label.formatter({ value: 22604 })
    expect(txt).toContain('万')
    expect(txt).toContain('22,604')
  })
  it('pie: label formatter 带「万」且不除万', () => {
    const opt = buildRankingOption('pie', {
      categories: ['可参与'], values: [38108], metricLabel: '预估金额(万元)', valueKind: 'wan',
    })
    const txt = opt.series[0].label.formatter({ name: '可参与', value: 38108, percent: 50 })
    expect(txt).toContain('38,108')
    expect(txt).toContain('万')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/chartOptions.test.ts`
Expected: FAIL —— `'wan'` 不是合法 valueKind（类型/格式化未处理），label 不含「万」或 series 数据被 ÷10000。

- [ ] **Step 3: 实现 `'wan'` 档**

在 `frontend/src/lib/chartOptions.ts`：

1. 改类型（约 `:12`）：
```ts
export type ValueKind = 'amount' | 'ratio' | 'count' | 'wan'
```

2. 在 `makeLabelFormatter`（`:25` 起）的 `ratio` 分支之后、`// count` 之前插入：
```ts
  if (valueKind === 'wan') {
    return (p) => p.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '万'
  }
```

> 不需改柱状/饼图主体：现有对 `valueKind === 'amount'` 的三处特判（`yAxisName`/`seriesData`/`axisFormatter`，约 `:86-97`）对 `'wan'` 自然走 else——`seriesData=values`（不除）、`yAxisName=metricLabel`、`axisFormatter=formatter`（即上面新增的 wan 档）；饼图分支用同一 `formatter`。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/chartOptions.test.ts`
Expected: PASS（含原有用例如有）。

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无类型错误。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/chartOptions.ts frontend/src/lib/chartOptions.test.ts
git commit -m "feat(V2.4.0): chartOptions 新增 'wan' valueKind(万元值原样显示带万,供商机看板复用)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: lib/opportunityBoard.ts —— 聚合纯函数 + 复杂图 option 构造

**Files:**
- Create: `frontend/src/lib/opportunityBoard.ts`
- Test: `frontend/src/lib/opportunityBoard.test.ts`

**Interfaces:**
- Consumes: `OppRow`（`@/lib/opportunitiesApi`）；`L4_OPTIONS`（`@/lib/opportunityColumns`，已 export）；`CHART_LIGHT`（`@/charts/echartsTheme`）。
- Produces（供 Task 3 view 调用）：常量 `FORECAST_ORDER`/`TOP1000_TIERS`；纯函数 `amtWan`/`isAiRow`/`isWithin7Days`/`groupBy`/`customerTierAgg`/`monthlyTrendByTeam`/`expectedDateStack`/`boardKpis`/`aiKpis`；option 构造 `buildMultiLineOption`/`buildCustomerTierOption`/`buildStackedAmountOption`/`buildHorizontalBarOption`。签名见 Step 3。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/opportunityBoard.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  amtWan, isAiRow, isWithin7Days, groupBy, customerTierAgg,
  monthlyTrendByTeam, expectedDateStack, boardKpis, aiKpis,
  buildMultiLineOption, buildCustomerTierOption, buildStackedAmountOption, buildHorizontalBarOption,
  FORECAST_ORDER, TOP1000_TIERS,
} from './opportunityBoard'
import type { OppRow } from '@/lib/opportunitiesApi'

const NOW = new Date(2026, 5, 29) // 2026-06-29(月份 0 基)

function row(o: Partial<OppRow>): OppRow {
  return { id: o.id ?? 'x', ...o } as OppRow
}

describe('amtWan / isAiRow', () => {
  it('amtWan 数值化容错', () => {
    expect(amtWan(row({ amountWan: 123 }))).toBe(123)
    expect(amtWan(row({ amountWan: '' as any }))).toBe(0)
    expect(amtWan(row({ amountWan: undefined }))).toBe(0)
  })
  it('isAiRow 按 productCategory 含 AI(不分大小写)', () => {
    expect(isAiRow(row({ productCategory: 'AISOC' }))).toBe(true)
    expect(isAiRow(row({ productCategory: 'ai审计' }))).toBe(true)
    expect(isAiRow(row({ productCategory: '终端安全' }))).toBe(false)
    expect(isAiRow(row({ productCategory: '' }))).toBe(false)
  })
})

describe('isWithin7Days', () => {
  it('今天/7天前为真, 8天前/未来/空为假', () => {
    expect(isWithin7Days('2026-06-29', NOW)).toBe(true)
    expect(isWithin7Days('2026-06-22', NOW)).toBe(true)   // 7 天前(含)
    expect(isWithin7Days('2026-06-21', NOW)).toBe(false)  // 8 天前
    expect(isWithin7Days('2026-06-30', NOW)).toBe(false)  // 未来
    expect(isWithin7Days('', NOW)).toBe(false)
  })
})

describe('groupBy', () => {
  const rows = [
    row({ l4: '银行服务组', amountWan: 100 }),
    row({ l4: '银行服务组', amountWan: 50 }),
    row({ l4: '浙江服务组', amountWan: 200 }),
    row({ l4: '', amountWan: 9 }),
  ]
  it('默认按金额降序, 空进「空白」', () => {
    const g = groupBy(rows, 'l4')
    expect(g[0]).toMatchObject({ category: '浙江服务组', count: 1, amountWan: 200 })
    expect(g[1]).toMatchObject({ category: '银行服务组', count: 2, amountWan: 150 })
    expect(g.find((x) => x.category === '空白')).toMatchObject({ count: 1, amountWan: 9 })
  })
  it('skipEmpty 跳过空类目', () => {
    const g = groupBy(rows, 'l4', { skipEmpty: true })
    expect(g.some((x) => x.category === '空白')).toBe(false)
  })
  it('order 固定序在前, topN 截断', () => {
    const g = groupBy(rows, 'l4', { order: ['银行服务组', '浙江服务组'], skipEmpty: true })
    expect(g.map((x) => x.category)).toEqual(['银行服务组', '浙江服务组'])
    expect(groupBy(rows, 'l4', { skipEmpty: true, topN: 1 })).toHaveLength(1)
  })
})

describe('customerTierAgg', () => {
  it('4 固定桶 + 去重客户数', () => {
    const rows = [
      row({ top1000: 'TOP1000', customer: 'A', amountWan: 10 }),
      row({ top1000: 'TOP1000', customer: 'A', amountWan: 20 }), // 同客户去重
      row({ top1000: 'TOP1000', customer: 'B', amountWan: 5 }),
      row({ top1000: '', customer: 'C', amountWan: 7 }),          // 空→空白桶
    ]
    const agg = customerTierAgg(rows)
    expect(agg.map((a) => a.tier)).toEqual(TOP1000_TIERS)
    const top = agg.find((a) => a.tier === 'TOP1000')!
    expect(top).toMatchObject({ amountWan: 35, customers: 2 })
    expect(agg.find((a) => a.tier === '空白')!).toMatchObject({ amountWan: 7, customers: 1 })
  })
})

describe('monthlyTrendByTeam', () => {
  it('连续月轴(补空月)+ 团队按 L4_OPTIONS 序 + 矩阵对位', () => {
    const rows = [
      row({ l4: '银行服务组', firstReg: '2026-02-10', amountWan: 100 }),
      row({ l4: '银行服务组', firstReg: '2026-04-01', amountWan: 50 }),
      row({ l4: '浙江服务组', firstReg: '2026-03-15', amountWan: 200 }),
    ]
    const t = monthlyTrendByTeam(rows)
    expect(t.months).toEqual(['2026-02', '2026-03', '2026-04']) // 连续(含空 03? 03 有浙江)
    expect(t.teams).toContain('银行服务组')
    expect(t.teams).toContain('浙江服务组')
    const bi = t.teams.indexOf('银行服务组')
    expect(t.countMatrix[bi]).toEqual([1, 0, 1])
    expect(t.amountMatrix[bi]).toEqual([100, 0, 50])
  })
})

describe('expectedDateStack', () => {
  it('连续月 + 末尾空白桶, 按 forecast 堆叠', () => {
    const rows = [
      row({ expectedDate: '2026-01-10', forecast: '可参与', amountWan: 10 }),
      row({ expectedDate: '2026-03-10', forecast: '赢单', amountWan: 30 }),
      row({ expectedDate: '', forecast: '可参与', amountWan: 5 }),
    ]
    const s = expectedDateStack(rows)
    expect(s.months[s.months.length - 1]).toBe('空白')
    expect(s.months).toEqual(['2026-01', '2026-02', '2026-03', '空白'])
    expect(s.series).toContain('可参与')
    expect(s.series).toContain('赢单')
    const ci = s.series.indexOf('可参与')
    // 可参与: 2026-01=10, 空白=5
    expect(s.matrix[ci][0]).toBe(10)
    expect(s.matrix[ci][s.months.length - 1]).toBe(5)
  })
})

describe('boardKpis / aiKpis', () => {
  it('本周(近7天)按 firstReg 或 lastUpdate 命中', () => {
    const rows = [
      row({ amountWan: 100, firstReg: '2026-06-28', lastUpdate: '2026-01-01' }), // firstReg 近7天
      row({ amountWan: 50, firstReg: '2026-01-01', lastUpdate: '2026-06-25' }),  // lastUpdate 近7天
      row({ amountWan: 9, firstReg: '2026-01-01', lastUpdate: '2026-01-01' }),   // 都不近
    ]
    const k = boardKpis(rows, NOW)
    expect(k).toMatchObject({ weekCount: 2, weekAmountWan: 150, totalCount: 3, totalAmountWan: 159 })
  })
  it('aiKpis 统计 AI 行', () => {
    const rows = [row({ productCategory: 'AISOC', amountWan: 7000 }), row({ productCategory: '终端安全', amountWan: 1 })]
    expect(aiKpis(rows)).toMatchObject({ count: 1, amountWan: 7000 })
  })
})

describe('option 构造', () => {
  it('buildMultiLineOption: 每队一条 line series', () => {
    const opt = buildMultiLineOption(['2026-02', '2026-03'], ['银行服务组', '浙江服务组'], [[1, 0], [0, 2]], '商机数量', 'count')
    expect(opt.series).toHaveLength(2)
    expect(opt.series[0]).toMatchObject({ name: '银行服务组', type: 'line' })
    expect(opt.xAxis.data).toEqual(['2026-02', '2026-03'])
  })
  it('buildCustomerTierOption: 双 yAxis + 2 series', () => {
    const opt = buildCustomerTierOption([{ tier: 'TOP1000', amountWan: 100, customers: 10 }])
    expect(opt.yAxis).toHaveLength(2)
    expect(opt.series).toHaveLength(2)
    expect(opt.series[1].yAxisIndex).toBe(1)
  })
  it('buildStackedAmountOption: series 带同名 stack', () => {
    const opt = buildStackedAmountOption(['2026-01'], ['可参与', '赢单'], [[10], [30]])
    expect(opt.series).toHaveLength(2)
    expect(opt.series[0].stack).toBe(opt.series[1].stack)
  })
  it('buildHorizontalBarOption: category 在 yAxis(inverse)', () => {
    const opt = buildHorizontalBarOption(['终端安全', '主机安全'], [22604, 10297], '预估金额(万元)')
    expect(opt.yAxis.type).toBe('category')
    expect(opt.xAxis.type).toBe('value')
    expect(opt.yAxis.inverse).toBe(true)
    expect(opt.series[0].data).toEqual([22604, 10297])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/opportunityBoard.test.ts`
Expected: FAIL —— 模块 `./opportunityBoard` 不存在。

- [ ] **Step 3: 实现 `frontend/src/lib/opportunityBoard.ts`**

```ts
/**
 * opportunityBoard.ts — 商机看板纯计算口径 + 复杂图 ECharts option 构造(可单测)。
 * 金额口径:amountWan 已是万元数值,所有金额为 Σ amountWan(万元)。
 */
import type { OppRow } from '@/lib/opportunitiesApi'
import { L4_OPTIONS } from '@/lib/opportunityColumns'
import { CHART_LIGHT } from '@/charts/echartsTheme'

export const FORECAST_ORDER = ['可参与', '可承诺', '可争取', '赢单']
export const TOP1000_TIERS = ['TOP1000', '非TOP1000', '其他非指名', '空白']

export interface GroupAgg { category: string; count: number; amountWan: number }

/** amountWan 数值化:非有限值→0。 */
export function amtWan(row: OppRow): number {
  const n = Number(row.amountWan)
  return Number.isFinite(n) ? n : 0
}

/** AI相关:productCategory 含 'AI'(不分大小写)。 */
export function isAiRow(row: OppRow): boolean {
  return String(row.productCategory ?? '').toUpperCase().includes('AI')
}

/** 近7天:0 ≤ (今天 − d) ≤ 7(取日期前 10 位;与 recentUpdateOf 同口径)。 */
export function isWithin7Days(d: string | null | undefined, now: Date): boolean {
  const s = String(d ?? '').slice(0, 10)
  const [y, m, day] = s.split('-').map(Number)
  if (!y || !m || !day) return false
  const t = new Date(y, m - 1, day).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diff = Math.round((today - t) / 86400000)
  return diff >= 0 && diff <= 7
}

interface GroupOpts { skipEmpty?: boolean; order?: string[]; blankLabel?: string; topN?: number }

/** 按字段聚合 count + ΣamountWan。order 给定则在前(其余按金额降序补后),否则全按金额降序;topN 截断。 */
export function groupBy(rows: OppRow[], field: string, opts: GroupOpts = {}): GroupAgg[] {
  const { skipEmpty = false, order, blankLabel = '空白', topN } = opts
  const map = new Map<string, GroupAgg>()
  for (const r of rows) {
    let key = String((r as any)[field] ?? '').trim()
    if (!key) {
      if (skipEmpty) continue
      key = blankLabel
    }
    let g = map.get(key)
    if (!g) { g = { category: key, count: 0, amountWan: 0 }; map.set(key, g) }
    g.count += 1
    g.amountWan += amtWan(r)
  }
  let out = [...map.values()]
  if (order) {
    out.sort((a, b) => {
      const ia = order.indexOf(a.category), ib = order.indexOf(b.category)
      if (ia === -1 && ib === -1) return b.amountWan - a.amountWan
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
  } else {
    out.sort((a, b) => b.amountWan - a.amountWan)
  }
  if (topN != null) out = out.slice(0, topN)
  return out
}

/** 各级别客户:固定 4 桶(含空白) ΣamountWan + 去重客户数。非标准/空 top1000 → 空白桶;空 customer 不计数。 */
export function customerTierAgg(rows: OppRow[]): { tier: string; amountWan: number; customers: number }[] {
  const m = new Map<string, { amountWan: number; cust: Set<string> }>()
  for (const t of TOP1000_TIERS) m.set(t, { amountWan: 0, cust: new Set() })
  for (const r of rows) {
    let tier = String(r.top1000 ?? '').trim()
    if (!TOP1000_TIERS.includes(tier)) tier = '空白'
    const b = m.get(tier)!
    b.amountWan += amtWan(r)
    const c = String(r.customer ?? '').trim()
    if (c) b.cust.add(c)
  }
  return TOP1000_TIERS.map((t) => ({ tier: t, amountWan: m.get(t)!.amountWan, customers: m.get(t)!.cust.size }))
}

function monthKey(d: unknown): string { return String(d ?? '').slice(0, 7) }
function isMonth(s: string): boolean { return /^\d{4}-\d{2}$/.test(s) }
/** 连续 YYYY-MM 序列(含端点)。 */
function monthRange(minYM: string, maxYM: string): string[] {
  const out: string[] = []
  let [y, m] = minYM.split('-').map(Number)
  const [my, mm] = maxYM.split('-').map(Number)
  while (y < my || (y === my && m <= mm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++; if (m > 12) { m = 1; y++ }
  }
  return out
}

/** 按 firstReg 分月 × l4 的趋势。months 连续(补空月);teams 为出现过的 l4(按 L4_OPTIONS 序)。 */
export function monthlyTrendByTeam(rows: OppRow[]): {
  months: string[]; teams: string[]; countMatrix: number[][]; amountMatrix: number[][]
} {
  const set = new Set<string>()
  for (const r of rows) { const k = monthKey(r.firstReg); if (isMonth(k)) set.add(k) }
  const sorted = [...set].sort()
  const months = sorted.length ? monthRange(sorted[0], sorted[sorted.length - 1]) : []
  const teams = L4_OPTIONS.filter((t) => rows.some((r) => String(r.l4 ?? '').trim() === t))
  const mIdx = new Map(months.map((m, i) => [m, i]))
  const tIdx = new Map(teams.map((t, i) => [t, i]))
  const countMatrix = teams.map(() => months.map(() => 0))
  const amountMatrix = teams.map(() => months.map(() => 0))
  for (const r of rows) {
    const mi = mIdx.get(monthKey(r.firstReg))
    const ti = tIdx.get(String(r.l4 ?? '').trim())
    if (mi == null || ti == null) continue
    countMatrix[ti][mi] += 1
    amountMatrix[ti][mi] += amtWan(r)
  }
  return { months, teams, countMatrix, amountMatrix }
}

/** 预估落单分布:按 expectedDate 分月(连续 + 末尾空白桶) × forecast 堆叠 ΣamountWan。空 forecast→「未填」。 */
export function expectedDateStack(rows: OppRow[]): { months: string[]; series: string[]; matrix: number[][] } {
  const set = new Set<string>()
  let hasBlank = false
  for (const r of rows) { const k = monthKey(r.expectedDate); if (isMonth(k)) set.add(k); else hasBlank = true }
  const sorted = [...set].sort()
  let months = sorted.length ? monthRange(sorted[0], sorted[sorted.length - 1]) : []
  if (hasBlank) months = [...months, '空白']
  const used = new Set<string>()
  let hasUnfilled = false
  for (const r of rows) {
    const f = String(r.forecast ?? '').trim()
    if (FORECAST_ORDER.includes(f)) used.add(f); else hasUnfilled = true
  }
  const series = FORECAST_ORDER.filter((f) => used.has(f))
  if (hasUnfilled) series.push('未填')
  const sIdx = new Map(series.map((s, i) => [s, i]))
  const mIdx = new Map(months.map((m, i) => [m, i]))
  const matrix = series.map(() => months.map(() => 0))
  for (const r of rows) {
    const raw = monthKey(r.expectedDate)
    const mi = mIdx.get(isMonth(raw) ? raw : '空白')
    let f = String(r.forecast ?? '').trim()
    if (!FORECAST_ORDER.includes(f)) f = '未填'
    const si = sIdx.get(f)
    if (mi == null || si == null) continue
    matrix[si][mi] += amtWan(r)
  }
  return { months, series, matrix }
}

/** 顶部 4 KPI。 */
export function boardKpis(rows: OppRow[], now: Date): {
  weekCount: number; weekAmountWan: number; totalCount: number; totalAmountWan: number
} {
  let weekCount = 0, weekAmountWan = 0, totalAmountWan = 0
  for (const r of rows) {
    const a = amtWan(r)
    totalAmountWan += a
    if (isWithin7Days(r.firstReg, now) || isWithin7Days(r.lastUpdate, now)) { weekCount += 1; weekAmountWan += a }
  }
  return { weekCount, weekAmountWan, totalCount: rows.length, totalAmountWan }
}

/** AI 两 KPI。 */
export function aiKpis(rows: OppRow[]): { count: number; amountWan: number } {
  let count = 0, amountWan = 0
  for (const r of rows) if (isAiRow(r)) { count += 1; amountWan += amtWan(r) }
  return { count, amountWan }
}

// ——— 复杂图 option 构造(简单柱/饼用 chartOptions.buildRankingOption,不在此处) ———
const wanLabel = (p: { value: number }) => p.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '万'
const intLabel = (p: { value: number }) => String(Math.round(p.value))

/** 多系列折线:每队一条线。 */
export function buildMultiLineOption(
  months: string[], teams: string[], matrix: number[][], metricLabel: string, kind: 'count' | 'wan',
): Record<string, any> {
  return {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 0 },
    grid: { left: 60, right: 20, top: 50, bottom: 60 },
    color: CHART_LIGHT,
    xAxis: { type: 'category', data: months, axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: metricLabel },
    series: teams.map((t, i) => ({
      name: t, type: 'line', smooth: false, symbol: 'circle', symbolSize: 5, data: matrix[i],
      label: { show: false, formatter: kind === 'wan' ? wanLabel : intLabel },
    })),
  }
}

/** 各级别客户:左轴金额(万元)、右轴去重客户数,双柱。 */
export function buildCustomerTierOption(
  agg: { tier: string; amountWan: number; customers: number }[],
): Record<string, any> {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, data: ['预估金额(万元)', '商户数量'] },
    grid: { left: 60, right: 60, top: 50, bottom: 40 },
    color: CHART_LIGHT,
    xAxis: { type: 'category', data: agg.map((a) => a.tier) },
    yAxis: [
      { type: 'value', name: '预估金额(万元)' },
      { type: 'value', name: '商户数量' },
    ],
    series: [
      { name: '预估金额(万元)', type: 'bar', yAxisIndex: 0, data: agg.map((a) => a.amountWan),
        label: { show: true, position: 'top', formatter: (p: any) => Math.round(p.value).toLocaleString('zh-CN') } },
      { name: '商户数量', type: 'bar', yAxisIndex: 1, data: agg.map((a) => a.customers),
        label: { show: true, position: 'top' } },
    ],
  }
}

/** 预估落单堆叠柱:x=月,堆叠 series,值=ΣamountWan(万元)。 */
export function buildStackedAmountOption(months: string[], series: string[], matrix: number[][]): Record<string, any> {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { type: 'scroll', top: 0 },
    grid: { left: 60, right: 20, top: 50, bottom: 60 },
    color: CHART_LIGHT,
    xAxis: { type: 'category', data: months, axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: '预估金额(万元)' },
    series: series.map((s, i) => ({ name: s, type: 'bar', stack: 'amount', data: matrix[i] })),
  }
}

/** 商机覆盖产品横向柱:category 在 yAxis(inverse,大值在上),值固定万元。 */
export function buildHorizontalBarOption(categories: string[], values: number[], metricLabel: string): Record<string, any> {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 110, right: 50, top: 30, bottom: 30 },
    color: CHART_LIGHT,
    xAxis: { type: 'value', name: metricLabel },
    yAxis: { type: 'category', data: categories, inverse: true },
    series: [{
      name: metricLabel, type: 'bar', colorBy: 'data', data: values,
      label: { show: true, position: 'right', formatter: (p: any) => Math.round(p.value).toLocaleString('zh-CN') },
    }],
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/opportunityBoard.test.ts`
Expected: PASS（全部用例）。

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无类型错误。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/opportunityBoard.ts frontend/src/lib/opportunityBoard.test.ts
git commit -m "feat(V2.4.0): 新增 opportunityBoard 商机看板计算口径+复杂图option构造+单测

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: OpportunitiesBoardView.vue —— 看板页

**Files:**
- Create: `frontend/src/views/OpportunitiesBoardView.vue`

**Interfaces:**
- Consumes: `useOpportunitiesStore`（`@/stores/opportunities`，`rows`/`loaded`/`load()`）；Task 1 的 `buildRankingOption`；Task 2 的全部导出；`ChartBox`（`@/charts/ChartBox.vue`）。
- Produces: 默认导出的 Vue 组件，供 Task 4 路由挂载。

- [ ] **Step 1: 创建组件**

创建 `frontend/src/views/OpportunitiesBoardView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { buildRankingOption } from '@/lib/chartOptions'
import {
  boardKpis, aiKpis, groupBy, customerTierAgg, monthlyTrendByTeam, expectedDateStack,
  buildMultiLineOption, buildCustomerTierOption, buildStackedAmountOption, buildHorizontalBarOption,
  isAiRow, FORECAST_ORDER,
} from '@/lib/opportunityBoard'
import { L4_OPTIONS } from '@/lib/opportunityColumns'
import ChartBox from '@/charts/ChartBox.vue'

const opps = useOpportunitiesStore()
onMounted(() => { if (!opps.loaded) opps.load() })

const now = new Date()
const rows = computed(() => opps.rows)
const keyRows = computed(() => rows.value.filter((r) => String(r.keyOpp ?? '').trim() === '是'))
const aiRows = computed(() => rows.value.filter(isAiRow))

const fmtInt = (n: number) => Math.round(n).toLocaleString('zh-CN')

// 顶部 4 KPI
const kpi = computed(() => boardKpis(rows.value, now))
const topCards = computed(() => [
  { k: '本周新增/更新商机数', main: fmtInt(kpi.value.weekCount), sub: '记录总数' },
  { k: '本周新增/更新商机金额', main: fmtInt(kpi.value.weekAmountWan), sub: '商机金额(万元)' },
  { k: '商机总数', main: fmtInt(kpi.value.totalCount), sub: '商机总数' },
  { k: '商机总额', main: fmtInt(kpi.value.totalAmountWan), sub: '商机金额(万元)' },
])
// 底部 2 AI KPI
const ai = computed(() => aiKpis(rows.value))
const aiCards = computed(() => [
  { k: 'AI相关商机数', main: fmtInt(ai.value.count), sub: '记录总数' },
  { k: 'AI相关商机金额', main: fmtInt(ai.value.amountWan), sub: '商机金额(万元)' },
])

// —— 简单柱/饼(复用 buildRankingOption) ——
function pieAmount(field: string, order?: string[]) {
  const g = groupBy(rows.value, field, { skipEmpty: true, order })
  return buildRankingOption('pie', {
    categories: g.map((x) => x.category), values: g.map((x) => x.amountWan),
    metricLabel: '预估金额(万元)', valueKind: 'wan',
  })
}
function teamBar(src: () => typeof rows.value, kind: 'amount' | 'count') {
  const g = groupBy(src(), 'l4', { order: L4_OPTIONS, skipEmpty: true })
  return buildRankingOption('bar', {
    categories: g.map((x) => x.category),
    values: g.map((x) => (kind === 'amount' ? x.amountWan : x.count)),
    metricLabel: kind === 'amount' ? '预估金额(万元)' : '计数',
    valueKind: kind === 'amount' ? 'wan' : 'count',
  })
}

const productCoverOption = computed(() => {
  const g = groupBy(rows.value, 'productCategory', { skipEmpty: true, topN: 10 })
  return buildHorizontalBarOption(g.map((x) => x.category), g.map((x) => x.amountWan), '预估金额(万元)')
})
const forecastPie = computed(() => pieAmount('forecast', FORECAST_ORDER))
const stagePie = computed(() => pieAmount('status'))
const teamAmount = computed(() => teamBar(() => rows.value, 'amount'))
const teamKeyAmount = computed(() => teamBar(() => keyRows.value, 'amount'))
const teamCount = computed(() => teamBar(() => rows.value, 'count'))
const teamKeyCount = computed(() => teamBar(() => keyRows.value, 'count'))

// —— 多系列折线趋势 ——
const trend = computed(() => monthlyTrendByTeam(rows.value))
const trendCountOption = computed(() => buildMultiLineOption(trend.value.months, trend.value.teams, trend.value.countMatrix, '商机数量', 'count'))
const trendAmountOption = computed(() => buildMultiLineOption(trend.value.months, trend.value.teams, trend.value.amountMatrix, '预估金额(万元)', 'wan'))

// —— 双轴 / 堆叠 ——
const tierOption = computed(() => buildCustomerTierOption(customerTierAgg(rows.value)))
const expectedStack = computed(() => expectedDateStack(rows.value))
const expectedOption = computed(() => buildStackedAmountOption(expectedStack.value.months, expectedStack.value.series, expectedStack.value.matrix))

// —— AI 两饼 ——
const aiCountPie = computed(() => {
  const g = groupBy(aiRows.value, 'productCategory', { skipEmpty: true })
  return buildRankingOption('pie', { categories: g.map((x) => x.category), values: g.map((x) => x.count), metricLabel: '记录数', valueKind: 'count' })
})
const aiAmountPie = computed(() => {
  const g = groupBy(aiRows.value, 'productCategory', { skipEmpty: true })
  return buildRankingOption('pie', { categories: g.map((x) => x.category), values: g.map((x) => x.amountWan), metricLabel: '预估金额(万元)', valueKind: 'wan' })
})
</script>

<template>
  <div class="ob-view">
    <!-- 顶部 KPI -->
    <div class="ob-cards">
      <div v-for="c in topCards" :key="c.k" class="ob-card">
        <div class="ob-card-k">{{ c.k }}</div>
        <div class="ob-card-main u-num">{{ c.main }}</div>
        <div class="ob-card-sub">{{ c.sub }}</div>
      </div>
    </div>

    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">商机覆盖产品</h3><ChartBox :option="productCoverOption" height="320px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">商机主观预测</h3><ChartBox :option="forecastPie" height="320px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">商机阶段分布</h3><ChartBox :option="stagePie" height="320px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">各团队商机金额</h3><ChartBox :option="teamAmount" height="300px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">各团队【重点】商机金额</h3><ChartBox :option="teamKeyAmount" height="300px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">各团队商机数量</h3><ChartBox :option="teamCount" height="300px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">各团队【重点】商机数量</h3><ChartBox :option="teamKeyCount" height="300px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">商机数量月变化趋势</h3><ChartBox :option="trendCountOption" height="320px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">商机金额月变化趋势</h3><ChartBox :option="trendAmountOption" height="320px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">各级别客户商机数及商机金额</h3><ChartBox :option="tierOption" height="340px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">预估落单时间分布</h3><ChartBox :option="expectedOption" height="340px" /></div>
    </div>
    <div class="ob-row">
      <div class="ob-chart"><h3 class="ob-h3">AI相关商机数</h3><ChartBox :option="aiCountPie" height="320px" /></div>
      <div class="ob-chart"><h3 class="ob-h3">AI相关商机金额</h3><ChartBox :option="aiAmountPie" height="320px" /></div>
    </div>
    <div class="ob-cards">
      <div v-for="c in aiCards" :key="c.k" class="ob-card">
        <div class="ob-card-k">{{ c.k }}</div>
        <div class="ob-card-main u-num">{{ c.main }}</div>
        <div class="ob-card-sub">{{ c.sub }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ob-view { display: flex; flex-direction: column; gap: var(--gap-section); }
.ob-cards { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.ob-card {
  flex: 1 1 200px; min-width: 180px; background: var(--card); border: 1px solid var(--line);
  border-radius: var(--r-md); padding: var(--card-pad); display: flex; flex-direction: column; gap: var(--gap-stack);
}
.ob-card-k { font-size: var(--fs-1); color: var(--sub); font-weight: 600; }
.ob-card-main { font-size: var(--fs-5); font-weight: 700; color: var(--accent); }
.ob-card-sub { font-size: var(--fs-2); color: var(--mut); }
.ob-row { display: flex; flex-wrap: wrap; gap: var(--gap-card); }
.ob-chart { flex: 1 1 420px; min-width: 320px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.ob-h3 { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-2); }
</style>
```

- [ ] **Step 2: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无类型错误（此页尚未挂路由，但类型须通过）。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/views/OpportunitiesBoardView.vue
git commit -m "feat(V2.4.0): 新增商机看板页 OpportunitiesBoardView(复刻 oppoboard.pdf 约19元素)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 接线（路由 + 导航 + 门禁 + 侧栏）+ 版本 V2.4.0 + PROGRESS + 验证

**Files:**
- Modify: `frontend/src/router/index.ts`（import 区约 `:31`；路由数组 `:59-60` 之间）
- Modify: `frontend/src/nav.ts`（`ANALYSIS_LINKS` `:34-35` 之间）
- Modify: `frontend/src/lib/pageAccess.ts`（`PageKey` `:3`）
- Modify: `frontend/src/layout/AppSidebar.vue`（`activeSectionKey` `:20-21`）
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: `OpportunitiesBoardView`（Task 3）。
- Produces: 可访问的 `/opportunities/board` 路由（项目分析分区，pageKey `opportunities-board`）。

- [ ] **Step 1: 路由**

`frontend/src/router/index.ts`：
1. import 区（紧接 `import OpportunityFollowupView ...` 那行之后，约 `:31`）加：
```ts
import OpportunitiesBoardView from '@/views/OpportunitiesBoardView.vue'
```
2. 在 `/insight/risk`（`:59`）与 `/insight/board`（`:60`）之间插入一行：
```ts
    { path: '/opportunities/board', name: 'opportunities-board', component: OpportunitiesBoardView, meta: { title: '商机看板', hideFilter: true, pageKey: 'opportunities-board' } },
```

- [ ] **Step 2: 导航**

`frontend/src/nav.ts` `ANALYSIS_LINKS`：在「风险看板」(`:34`) 与「回款多维分析」(`:35`) 之间插：
```ts
  { label: '商机看板', to: '/opportunities/board', key: 'opportunities-board' },
```

- [ ] **Step 3: 门禁类型**

`frontend/src/lib/pageAccess.ts` `PageKey`：把第 3 行
```ts
  | 'insight' | 'insight-milestone' | 'insight-costdetail' | 'insight-risk' | 'insight-board' | 'insight-calendar'
```
改为（行尾加 `| 'opportunities-board'`）：
```ts
  | 'insight' | 'insight-milestone' | 'insight-costdetail' | 'insight-risk' | 'insight-board' | 'insight-calendar' | 'opportunities-board'
```

- [ ] **Step 4: 侧栏高亮**

`frontend/src/layout/AppSidebar.vue` `activeSectionKey`：在 `if (p.startsWith('/opportunities/key')) return 'keyfollowup'`（`:20`）之后、`if (p.startsWith('/insight')) return 'analysis'`（`:21`）之前插一行：
```ts
  if (p.startsWith('/opportunities/board')) return 'analysis'
```

> 注意：`/opportunities/board` 不匹配 `/opportunities/key`，且 `/opportunities`、`/opportunities/key` 仍走各自分支/默认值，互不影响。

- [ ] **Step 5: 版本 → V2.4.0**

`frontend/src/version.ts` 改为：
```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V2.4.0'
export const RELEASE_DATE = '2026-06-29'
```

- [ ] **Step 6: PROGRESS.md**

把 `PROGRESS.md:7`（`- 当前版本：**V2.3.3**...`）改为：
```markdown
- 当前版本：**V2.4.0**（整页级·新增页面：商机看板 /opportunities/board——读现有商机数据，复刻 oppoboard.pdf 的 KPI/环形/柱/折线/双轴/堆叠 约 19 个统计元素；在「项目分析」分区。**纯前端，升级不需点「更新数据」、无新依赖、无新后端端点；新页 pageKey opportunities-board 需授权**）
```
把 `PROGRESS.md:8`（`- 最近更新：...`）改为：
```markdown
- 最近更新：2026-06-29（V2.4.0：新增商机看板 /opportunities/board，纯前端，读现有 /api/opportunities）
```
并在 `## 版本（单一来源约定，2026-06-12 起）` 小节里、`- **V2.3.3**（...` 条目**之前**插入：
```markdown
- **V2.4.0**（2026-06-29，Y 级·整页级·新增页面）：
  - **新增商机看板页 `/opportunities/board`**（项目分析分区，风险看板下/回款多维分析上）：读现有商机数据（`useOpportunitiesStore`，`/api/opportunities`，已按 L4 隔离），自上而下复刻 `oppoboard.pdf` 约 19 个统计元素——顶部 4 KPI（本周新增/更新数·额[近7天]、商机总数/总额）+ 商机覆盖产品（横向柱，按 productCategory ΣamountWan）+ 主观预测/阶段分布环形 + 各团队金额/数量及【重点】4 柱 + 数量/金额月趋势 2 多系列折线（按 firstReg 分月×l4）+ 各级别客户双轴组合柱（top1000 桶：ΣamountWan + 去重客户数）+ 预估落单时间堆叠柱（expectedDate 月×forecast）+ AI 相关两饼及两 KPI（productCategory 含 'AI'）。
  - 新增 `lib/opportunityBoard.ts`（聚合纯函数 + 复杂图 option 构造）+ `OpportunitiesBoardView.vue`；复用 `ChartBox`/`buildRankingOption`（后者加 `'wan'` valueKind，加法）。
  - 接路由/`nav.ts`/`pageAccess.ts`/`AppSidebar.vue`；**新 pageKey `opportunities-board`**（超管默认可见，普通管理员需在「页面访问控制」授权）。
  - 无 `preprocess_data.py`/`schema.py`/后端改动 → 升级不需点「更新数据」；无新依赖；无新后端端点。
```

- [ ] **Step 7: 全量验证**

Run: `cd frontend && npm run typecheck && npm run test:run && npm run build`
Expected: typecheck 无错；vitest 全绿（含新增 `chartOptions.test.ts`、`opportunityBoard.test.ts`；既有 `AppSidebar.test.ts`/`pageAccess.test.ts` 若断言导航条目/pageKey 数量需同步——见下注）；build 成功。

> 注：若 `AppSidebar.test.ts` 或 `pageAccess.test.ts` 对 `ANALYSIS_LINKS`/`.nav-sub` 条目数或 `PAGE_OPTIONS` 长度有硬断言，新增「商机看板」会令其 +1，需同步更新对应期望值（这是新增导航条目的正常连带，不是缺陷）。修改后将相应 test 文件一并 `git add`。

- [ ] **Step 8: 全仓验证**

Run: `bash verify.sh`
Expected: 全绿（后端 pytest 不受本次纯前端改动影响；前端 typecheck/vitest/build 全绿）。

- [ ] **Step 9: 提交**

```bash
git add frontend/src/router/index.ts frontend/src/nav.ts frontend/src/lib/pageAccess.ts frontend/src/layout/AppSidebar.vue frontend/src/version.ts PROGRESS.md
# 若 Step 7 注同步了测试文件,一并 add:
# git add frontend/src/layout/AppSidebar.test.ts frontend/src/lib/pageAccess.test.ts
git commit -m "feat(V2.4.0): 接线商机看板(路由/导航/门禁/侧栏)+版本V2.4.0

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 验收（实现完成后人工冒烟，非自动步骤）

- `python server.py` + `cd frontend && npm run dev`，超管登录 → 左侧「项目分析」分区出现「商机看板」（在风险看板下、回款多维分析上）→ 进 `/opportunities/board`：
  - 顶部 4 KPI、底部 2 AI KPI 数字正常；金额卡标注「万元」。
  - 商机覆盖产品横向柱（大值在上）、主观预测/阶段分布环形、各团队 4 柱、月趋势 2 折线、各级别客户双轴、预估落单堆叠、AI 两饼 均渲染、无 console 报错。
  - 切暗色主题图表配色正常（ChartBox 已桥接）。
  - 普通管理员未授权该页时左侧不显示；授权 `opportunities-board` 后可见，且只见本 L4 商机（数据随 `/api/opportunities` L4 过滤）。
  - `/opportunities`（商机清单）、`/opportunities/key`、风险看板 行为不变。
