import type { Project, Paymentrecords } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
import { actualInRange } from './paymentRange'

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

/** 按 projectId 聚合收款阶段节点 → 项目级台账行(仅纳入在 projects 中的项目)。
 * actualPayment 取流水区间和（actualInRange），expectedPayment/remainingAmount 仍 Σ节点。
 * paymentRecords/start/end 可选，缺省=全量兼容旧调用。
 */
export function ledgerRows(
  nodeRows: PayNodeRow[],
  projects: Project[],
  paymentRecords?: Paymentrecords,
  start = '',
  end = '',
): LedgerProjectRow[] {
  const byId = new Map(projects.map((p) => [p.projectId, p]))
  const grp: Record<string, PayNodeRow[]> = {}
  for (const n of nodeRows) (grp[n.projectId] ||= []).push(n)
  const out: LedgerProjectRow[] = []
  for (const [pid, nodes] of Object.entries(grp)) {
    const p = byId.get(pid)
    if (!p) continue
    const expectedPayment = nodes.reduce((s, n) => s + n.expectedPayment, 0)
    const actualPayment = actualInRange(paymentRecords?.[pid]?.records as any, start, end)
    const remainingAmount = nodes.reduce((s, n) => s + n.unpaidAmount, 0)
    const contract = p.paymentPmis?.contract ?? 0
    const r = contract > 0 ? actualPayment / contract : 0
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
  const totalCon = rows.reduce((s, r) => s + (r.projectAmount || 0), 0)
  return { projectCount: rows.length, totalExp, totalAct, totalRem, rate: totalCon > 0 ? totalAct / totalCon : 0 }
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
