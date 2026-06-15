import type { RawNode } from '@/types/analysis'
import type { ProjectAgg } from './dashboardStats'

/** 仅排除过滤（忠实移植 _filteredRawNodes：台账数据源不含年份/视角过滤）。 */
export function excludeFilter(
  rawNodes: RawNode[],
  excludeActive: boolean,
  excludedIds: Record<string, boolean>,
): RawNode[] {
  if (!excludeActive || !excludedIds) return rawNodes
  return rawNodes.filter((n) => !excludedIds[(n as Record<string, any>).projectId])
}

export interface LedgerFilterOpts {
  search: string
  tier: string
  status: string
}

/** 忠实移植 filterLedger 的搜索/区间/状态过滤 + 按项目金额降序。CF 列筛选在组件层另用 applyColumnFilters。 */
export function filterLedgerProjects(projs: ProjectAgg[], opts: LedgerFilterOpts): ProjectAgg[] {
  const q = (opts.search || '').toLowerCase()
  let out = projs
  if (opts.tier)
    out = out.filter(
      (p) => p.nodes && p.nodes.some((n) => (n as Record<string, any>).tier === opts.tier),
    )
  if (opts.status) out = out.filter((p) => p.paymentStatus === opts.status)
  if (q)
    out = out.filter((p) =>
      (String(p.projectId) + p.projectName + p.projectManager + p.orgL4).toLowerCase().includes(q),
    )
  return [...out].sort((a, b) => (b.projectAmount || 0) - (a.projectAmount || 0))
}

export interface LedgerSummary {
  projectCount: number
  totalExp: number
  totalAct: number
  totalRem: number
  rate: number
}
export function ledgerSummary(projs: ProjectAgg[]): LedgerSummary {
  const totalExp = projs.reduce((s, p) => s + (p.expectedPayment || 0), 0)
  const totalAct = projs.reduce((s, p) => s + (p.actualPayment || 0), 0)
  return {
    projectCount: projs.length,
    totalExp,
    totalAct,
    totalRem: totalExp - totalAct,
    rate: totalExp > 0 ? totalAct / totalExp : 0,
  }
}

const LEDGER_TIERS = ['100万以上', '50-100万', '50万以下']

export interface LedgerTierStat {
  tier: string
  count: number
  expWan: number
  remWan: number
}
/** 忠实移植 filterLedger 的分层卡：按 p.tier 分组（项目级 tier，单位万）。 */
export function ledgerTierStats(projs: ProjectAgg[]): LedgerTierStat[] {
  return LEDGER_TIERS.map((t) => {
    const tp = projs.filter((p) => p.tier === t)
    const exp = tp.reduce((s, p) => s + (p.expectedPayment || 0), 0)
    const act = tp.reduce((s, p) => s + (p.actualPayment || 0), 0)
    return { tier: t, count: tp.length, expWan: exp / 10000, remWan: (exp - act) / 10000 }
  })
}

export interface LedgerStatusCounts {
  canAdvance: number
  reachedCondition: number
  advance: number
  fullPaid: number
  delayed: number
  onTime: number
}
/** 项目级状态计数（按 paymentStatus）。忠实移植 ledger-status-row 联动计数。 */
export function ledgerStatusCounts(projs: ProjectAgg[]): LedgerStatusCounts {
  const c = (s: string) => projs.filter((p) => p.paymentStatus === s).length
  return {
    canAdvance: c('加资源可提前'),
    reachedCondition: c('达到回款条件'),
    advance: c('已提前回款'),
    fullPaid: c('已全额回款'),
    delayed: c('延期'),
    onTime: c('正常实施中'),
  }
}
