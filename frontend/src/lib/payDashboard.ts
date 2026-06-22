import type { Project, PaymentRecordsEntry, PaymentNodePmis } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
import { filterProjects, deriveTier, type FilterOpts as ProjFilterOpts } from './paymentPmis'
import { inRange, actualInRange, hasActivityInRange } from './paymentRange'

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

/** 看板指标(同 DashSummary 字段名)。已回款=流水口径(inScope项目Σ actualInRange)；项目数=区间内有回款活动。 */
export function payDashSummary(
  rows: PayNodeRow[],
  projects: Project[],
  opts: ProjFilterOpts,
  paymentRecords?: Record<string, PaymentRecordsEntry>,
  paymentNodes?: Record<string, PaymentNodePmis[]>,
  start = '',
  end = '',
): PayDashSummary {
  const inScope = filterProjects(projects, opts)
  const totalActual = inScope.reduce((s, p) => s + actualInRange(paymentRecords?.[p.projectId]?.records, start, end), 0)
  // 完成率分母:选了日期区间时只算区间内有回款活动的项目合同(与分子同范围,避免窄区间下分母不缩、完成率被压低);
  // 全部(start=end='')时保持 Σ全 inScope 合同不变(基线不动)。
  const dateActive = !!(start || end)
  const totalContract = inScope
    .filter((p) => !dateActive || hasActivityInRange(paymentNodes?.[p.projectId], paymentRecords?.[p.projectId]?.records, start, end))
    .reduce((s, p) => s + (p.paymentPmis?.contract ?? 0), 0)
  const totalExpected = rows.reduce((s, r) => s + r.expectedPayment, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.unpaidAmount, 0)
  const delayedPids = new Set(rows.filter((r) => r.status === '延期').map((r) => r.projectId))
  const totalProjects = inScope.filter((p) => hasActivityInRange(paymentNodes?.[p.projectId], paymentRecords?.[p.projectId]?.records, start, end)).length
  return {
    relatedNodeCount: rows.length,
    totalProjects,
    totalExpected, totalActual, totalRemaining,
    rate: totalContract > 0 ? totalActual / totalContract : 0,
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

/** 单档聚合：档位由项目合同(deriveTier)定，计划/待回款/延期/节点数=该档位项目节点(计划日∈R)，已回款=Σ该档位项目流水(到账日∈R)。 */
export function payTierStats(
  tier: string,
  projects: Project[],
  paymentNodes: Record<string, PaymentNodePmis[]> | undefined,
  paymentRecords: Record<string, PaymentRecordsEntry> | undefined,
  start: string,
  end: string,
): PayTierStat {
  const grp = projects.filter((p) => deriveTier(p.paymentPmis?.contract) === tier)
  let expected = 0, remaining = 0, nodeCnt = 0, delayed = 0, paid = 0, actual = 0
  for (const p of grp) {
    for (const n of paymentNodes?.[p.projectId] ?? []) if (inRange(n.planDate || '', start, end)) {
      expected += Number(n.expectedPayment ?? 0); remaining += Number(n.unpaidAmount ?? 0); nodeCnt++
      if (n.status === '延期') delayed++; if (n.status === '已回款') paid++
    }
    actual += actualInRange(paymentRecords?.[p.projectId]?.records, start, end)
  }
  return {
    projectCount: grp.length,
    relatedNodeCount: nodeCnt,
    expectedAmountWan: expected / 10000,
    actualAmountWan: actual / 10000,
    remainingAmountWan: remaining / 10000,
    delayedCount: delayed,
    paidCount: paid,
  }
}

export interface OrgRank {
  org: string
  expectedTotal: number
  actualTotal: number
  actualTotalWan: number
  achievementRate: number
  contractTotal: number
}

/** 服务组(L4)达成排名。计划=Σ节点 expectedPayment(计划日∈R)；已回款=Σ流水(到账日∈R)；达成率=已回/合同（paymentPmis.contract）。sortBy 降序全量(组件自行 slice)。 */
export function payOrgRanking(
  projects: Project[],
  paymentNodes: Record<string, PaymentNodePmis[]> | undefined,
  paymentRecords: Record<string, PaymentRecordsEntry> | undefined,
  start: string,
  end: string,
  sortBy: 'actualTotal' | 'achievementRate',
): OrgRank[] {
  const m: Record<string, OrgRank> = {}
  for (const p of projects) {
    const org = (p.orgL4 ?? '').trim() || '未指定'
    if (!m[org]) m[org] = { org, expectedTotal: 0, actualTotal: 0, actualTotalWan: 0, achievementRate: 0, contractTotal: 0 }
    for (const n of paymentNodes?.[p.projectId] ?? []) {
      if (inRange(n.planDate || '', start, end)) m[org].expectedTotal += Number(n.expectedPayment ?? 0)
    }
    m[org].actualTotal += actualInRange(paymentRecords?.[p.projectId]?.records, start, end)
    m[org].contractTotal += p.paymentPmis?.contract ?? 0
  }
  return Object.values(m)
    .map((o) => ({ ...o, achievementRate: o.contractTotal > 0 ? o.actualTotal / o.contractTotal : 0, actualTotalWan: o.actualTotal / 10000 }))
    .sort((a, b) => b[sortBy] - a[sortBy])
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
  return { categories, series: TIER_KEYS.map((t) => ({ tier: t, data: categories.map((c) => Math.round(byTier[t][c] || 0)) })) }
}

export function payQuarterlyTrend(rows: PayNodeRow[], start: string, end: string): PeriodSeries {
  return buildPaySeries(rows, quarterOf, fillKeysFromRange(start, end, 'quarter'))
}
export function payMonthlyTrend(rows: PayNodeRow[], start: string, end: string): PeriodSeries {
  return buildPaySeries(rows, (m) => m, fillKeysFromRange(start, end, 'month'))
}
