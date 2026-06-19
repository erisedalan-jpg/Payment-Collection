import type { Project } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
import { filterProjects, type FilterOpts as ProjFilterOpts } from './paymentPmis'
import { inRange } from './paymentRange'

export interface PayNodeFilterOpts {
  dateStart: string
  dateEnd: string
  viewMode: 'global' | 'l4' | 'pm'
  viewL4: string
  viewPM: string
  excludeActive: boolean
  excludedIds: Record<string, boolean>
}

/** 镜像 lib/filterNodes：视角(dept/projectManager) → 排除 → 日期区间(按 planDate)。无 planDate 的节点在限定区间被排除。 */
export function filterPayNodes(rows: PayNodeRow[], opts: PayNodeFilterOpts): PayNodeRow[] {
  let ns = rows
  if (opts.viewMode === 'l4' && opts.viewL4) ns = ns.filter((r) => r.dept === opts.viewL4)
  if (opts.viewMode === 'pm' && opts.viewPM) ns = ns.filter((r) => r.projectManager === opts.viewPM)
  if (opts.excludeActive && opts.excludedIds) ns = ns.filter((r) => !opts.excludedIds[r.projectId])
  if (opts.dateStart || opts.dateEnd) return ns.filter((r) => inRange(r.planDate || '', opts.dateStart, opts.dateEnd))
  return ns
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

function quarterOf(planMonth: string): string {
  const [y, moStr] = planMonth.split('-')
  const mo = parseInt(moStr, 10)
  const q = mo <= 3 ? 'Q1' : mo <= 6 ? 'Q2' : mo <= 9 ? 'Q3' : 'Q4'
  return `${y}-${q}`
}

function fillKeysFromRange(start: string, end: string, gran: 'month' | 'quarter'): string[] {
  if (!start || !end) return []
  const sy = +start.slice(0, 4), sm = +start.slice(5, 7), ey = +end.slice(0, 4), em = +end.slice(5, 7)
  const out: string[] = []
  if (gran === 'month') {
    for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (m = 1, y++) : m++) out.push(`${y}-${String(m).padStart(2, '0')}`)
  } else {
    const sq = Math.floor((sm - 1) / 3), eq = Math.floor((em - 1) / 3)
    for (let y = sy, q = sq; y < ey || (y === ey && q <= eq); q === 3 ? (q = 0, y++) : q++) out.push(`${y}-Q${q + 1}`)
  }
  return out
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
    if (!byTier[tier]) continue
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

export function payQuarterlyTrend(rows: PayNodeRow[], start: string, end: string): PeriodSeries {
  return buildPaySeries(rows, quarterOf, fillKeysFromRange(start, end, 'quarter'))
}
export function payMonthlyTrend(rows: PayNodeRow[], start: string, end: string): PeriodSeries {
  return buildPaySeries(rows, (m) => m, fillKeysFromRange(start, end, 'month'))
}
