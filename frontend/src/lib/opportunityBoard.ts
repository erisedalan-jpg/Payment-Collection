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
  // 月趋势仅统计标准 L4 团队(L4_OPTIONS);非标准/越界 l4 值的行不计入趋势(l4 为 select、正常即 L4_OPTIONS)
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
