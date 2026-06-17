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
