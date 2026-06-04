import type { RawNode } from '@/types/analysis'

/** 三档顺序（忠实 app.js initCompare 的 tiers）。 */
export const COMPARE_TIERS = ['100万以上', '50-100万', '50万以下'] as const

/** 各档线条/强调色（忠实 app.js tierColors）。 */
export const COMPARE_TIER_COLORS: Record<string, string> = {
  '100万以上': '#EF4444',
  '50-100万': '#F59E0B',
  '50万以下': '#10B981',
}

/** 状态分布图的 6 状态与配色（忠实 app.js statuses/statusColors，顺序不可改）。 */
export const COMPARE_STATUSES = [
  '加资源可提前',
  '达到回款条件',
  '已提前回款',
  '已全额回款',
  '延期',
  '正常实施中',
] as const
export const COMPARE_STATUS_COLORS = ['#6366F1', '#F59E0B', '#059669', '#10B981', '#EF4444', '#3B82F6']

export interface CompareTierStat {
  tier: string
  completionRate: number
  delayRate: number
  actualAmountWan: number
  expectedAmountWan: number
  // 其余字段（projectCount/totalAmountWan/remainingAmountWan/delayedAmount/...）来自 summary 透传
  [k: string]: any
}

/**
 * 按档统计（忠实移植 app.js:3178-3196）。
 * 完成率优先用 summary 的 actual/expectedAmountWan；缺失时按该档 isPaymentRelated 节点累加(元→万)。
 * delayRate = relatedNodeCount>0 ? delayedCount/relatedNodeCount : 0。
 */
export function compareTierStats(
  summary: Record<string, any> | undefined,
  rawNodes: RawNode[],
): CompareTierStat[] {
  return COMPARE_TIERS.map((t) => {
    const s = summary?.[t] || {}
    const tierRelated = rawNodes.filter(
      (n) => (n as any).tier === t && (n as any).isPaymentRelated,
    )
    const tierActualWan =
      s.actualAmountWan ||
      tierRelated.reduce((acc, n) => acc + ((n as any).actualPayment || 0), 0) / 10000
    const tierExpectedWan =
      s.expectedAmountWan ||
      tierRelated.reduce((acc, n) => acc + ((n as any).expectedPayment || 0), 0) / 10000
    const completionRate = tierExpectedWan > 0 ? tierActualWan / tierExpectedWan : 0
    const delayRate = s.relatedNodeCount > 0 ? s.delayedCount / s.relatedNodeCount : 0
    return {
      ...s,
      tier: t,
      actualAmountWan: tierActualWan,
      expectedAmountWan: tierExpectedWan,
      completionRate,
      delayRate,
    }
  })
}

export interface CompareProgress {
  categories: string[]
  paid: number[]
  pending: number[]
  delayed: number[]
}

/**
 * 进度对比图三系列（忠实移植 app.js:3266-3274 的数据，已修正"已回款"系列：
 * app.js 误用 fmt() 千分位字符串导致 ECharts 解析失败，这里统一用裸数值）。
 */
export function compareProgressSeries(stats: CompareTierStat[]): CompareProgress {
  return {
    categories: [...COMPARE_TIERS],
    paid: stats.map((s) => s.actualAmountWan || 0),
    pending: stats.map((s) => s.remainingAmountWan || 0),
    delayed: stats.map((s) => s.delayedAmount || 0),
  }
}

export interface CompareStatusSeries {
  name: string
  data: number[]
}

/** 状态分布堆叠图（忠实移植 app.js:3304-3314，保留原不可达兜底分支）。 */
export function compareStatusSeries(summary: Record<string, any> | undefined): CompareStatusSeries[] {
  return COMPARE_STATUSES.map((st) => ({
    name: st,
    data: COMPARE_TIERS.map((t) => {
      const s = (summary?.[t] || {}) as Record<string, any>
      if (st === '正常实施中') return s.onTimeCount || 0
      if (st === '已提前回款') return s.advanceEarlyCount || 0
      if (st === '已全额回款') return s.fullPaidCount || 0
      if (st === '加资源可提前') return s.canAdvanceCount || 0
      if (st === '达到回款条件') return s.reachedConditionCount || 0
      if (st === '延期') return s.delayedCount || 0
      // 忠实保留：6 状态全命中后不可达的兜底分支
      const rel =
        (s.relatedNodeCount || 0) -
        (s.onTimeCount || 0) -
        (s.advanceEarlyCount || 0) -
        (s.delayedCount || 0)
      return rel > 0 ? rel : 0
    }),
  }))
}

export interface CompareTrend {
  months: string[]
  series: { tier: string; data: number[] }[]
}

/** 月度趋势（忠实移植 app.js:3328-3356）：各档 monthlyPlan 键并集、升序、过滤 >2027-12。 */
export function compareTrendSeries(summary: Record<string, any> | undefined): CompareTrend {
  const ms = new Set<string>()
  const td: Record<string, Record<string, any>> = {}
  COMPARE_TIERS.forEach((t) => {
    const mp = (summary?.[t] || {}).monthlyPlan || {}
    td[t] = mp
    Object.keys(mp).forEach((m) => ms.add(m))
  })
  const months = [...ms].sort().filter((m) => m <= '2027-12')
  return {
    months,
    series: COMPARE_TIERS.map((t) => ({
      tier: t,
      data: months.map((m) => ((td[t] || {})[m] || {}).amountWan || 0),
    })),
  }
}

export interface OrgRankRow {
  org: string
  actualTotal: number
  actualTotalWan: number
  achievementRate: number
  [k: string]: any
}

export interface CompareOrgRanks {
  top5: OrgRankRow[]
  bottom5: OrgRankRow[]
  max: number
}

/** 服务组达成率 TOP5/BOTTOM5（忠实移植 app.js:3368-3374）。 */
export function compareOrgRanks(orgRanking: OrgRankRow[] | undefined): CompareOrgRanks {
  const sorted = [...(orgRanking || [])].sort((a, b) => b.achievementRate - a.achievementRate)
  const top5 = sorted.slice(0, 5)
  const bottom5 = sorted.slice(-5).reverse()
  const max = Math.max(...sorted.map((s) => s.actualTotal), 1)
  return { top5, bottom5, max }
}
