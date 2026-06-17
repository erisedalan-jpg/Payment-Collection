import type { RawNode, Project } from '@/types/analysis'
import type { ProjectAgg } from './dashboardStats'
import type { PayNodeRow } from './paymentPmis'

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

export interface LedgerProjectRow {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  tier: string
  projectAmount: number
  expectedPayment: number
  actualPayment: number
  remainingAmount: number
  paymentRatio: number
  paymentStatus: string
  delayed: boolean
  nodes: PayNodeRow[]
}

/** 按 projectId 聚合收款阶段节点 → 项目级台账行(仅纳入在 projects 中的项目)。金额节点级,状态 progress 三态。 */
export function ledgerRows(nodeRows: PayNodeRow[], projects: Project[]): LedgerProjectRow[] {
  const byId = new Map(projects.map((p) => [p.projectId, p]))
  const grp: Record<string, PayNodeRow[]> = {}
  for (const n of nodeRows) (grp[n.projectId] ||= []).push(n)
  const out: LedgerProjectRow[] = []
  for (const [pid, nodes] of Object.entries(grp)) {
    const p = byId.get(pid)
    if (!p) continue
    const expectedPayment = nodes.reduce((s, n) => s + n.expectedPayment, 0)
    const actualPayment = nodes.reduce((s, n) => s + n.receivedAmount, 0)
    const remainingAmount = nodes.reduce((s, n) => s + n.unpaidAmount, 0)
    const r = expectedPayment > 0 ? actualPayment / expectedPayment : 0
    out.push({
      projectId: pid,
      projectName: p.projectName || pid,
      projectManager: (p.projectManager ?? '').trim() || '未指定',
      orgL4: nodes[0].dept,
      tier: nodes[0].tier,
      projectAmount: p.paymentPmis?.contract ?? 0,
      expectedPayment, actualPayment, remainingAmount,
      paymentRatio: r,
      paymentStatus: r >= 0.999 ? '已全额回款' : r > 0 ? '部分回款' : '未回款',
      delayed: nodes.some((n) => n.status === '延期'),
      nodes,
    })
  }
  return out
}

export interface LedgerRowFilterOpts { search: string; tier: string; status: string }

/** 搜索/区间/状态筛选 + 按 projectAmount 降序。状态:三进度态按 paymentStatus,'延期' 按 delayed。 */
export function filterLedgerRows(rows: LedgerProjectRow[], opts: LedgerRowFilterOpts): LedgerProjectRow[] {
  const q = (opts.search || '').toLowerCase()
  let out = rows
  if (opts.tier) out = out.filter((r) => r.tier === opts.tier)
  if (opts.status) {
    out = opts.status === '延期' ? out.filter((r) => r.delayed) : out.filter((r) => r.paymentStatus === opts.status)
  }
  if (q) out = out.filter((r) =>
    (String(r.projectId) + r.projectName + r.projectManager + r.orgL4).toLowerCase().includes(q))
  return [...out].sort((a, b) => (b.projectAmount || 0) - (a.projectAmount || 0))
}

export interface LedgerSummaryPmis { projectCount: number; totalExp: number; totalAct: number; totalRem: number; rate: number }
export function ledgerSummaryPmis(rows: LedgerProjectRow[]): LedgerSummaryPmis {
  const totalExp = rows.reduce((s, r) => s + r.expectedPayment, 0)
  const totalAct = rows.reduce((s, r) => s + r.actualPayment, 0)
  // 待回款=Σ节点未收(remainingAmount),与下钻"未收"列同口径;不取 expected-received(收款阶段三列独立填报,未必自洽)
  const totalRem = rows.reduce((s, r) => s + r.remainingAmount, 0)
  return { projectCount: rows.length, totalExp, totalAct, totalRem, rate: totalExp > 0 ? totalAct / totalExp : 0 }
}

const LEDGER_TIERS_PMIS = ['100万以上', '50-100万', '50万以下']
export interface LedgerTierStatPmis { tier: string; count: number; expWan: number; remWan: number }
export function ledgerTierStatsPmis(rows: LedgerProjectRow[]): LedgerTierStatPmis[] {
  return LEDGER_TIERS_PMIS.map((t) => {
    const tp = rows.filter((r) => r.tier === t)
    const exp = tp.reduce((s, r) => s + r.expectedPayment, 0)
    const rem = tp.reduce((s, r) => s + r.remainingAmount, 0)   // 待回款=Σ未收,同 summary
    return { tier: t, count: tp.length, expWan: exp / 10000, remWan: rem / 10000 }
  })
}

export interface LedgerStatusCountsPmis { fullPaid: number; partial: number; unpaid: number; delayed: number }
export function ledgerStatusCountsPmis(rows: LedgerProjectRow[]): LedgerStatusCountsPmis {
  return {
    fullPaid: rows.filter((r) => r.paymentStatus === '已全额回款').length,
    partial: rows.filter((r) => r.paymentStatus === '部分回款').length,
    unpaid: rows.filter((r) => r.paymentStatus === '未回款').length,
    delayed: rows.filter((r) => r.delayed).length,
  }
}
