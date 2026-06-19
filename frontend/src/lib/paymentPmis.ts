import type { Project, ProjectPaymentPmis, ProjectPmis, PaymentNodePmis, PaymentRecordsEntry } from '@/types/analysis'
import { isAnomalous } from './anomaly'
import { paymentPmisInRange } from './paymentRange'

// ── 阈值常量（集中定义，spec §2）──
export const TIER_HIGH = 1_000_000
export const TIER_MID = 500_000
export const RATE_OK = 0.8
export const RATE_WARN = 0.5

/** 金额档：由 paymentPmis.contract 派生。 */
export function deriveTier(contract: number | null | undefined): string {
  if (contract == null || contract <= 0) return '未知'
  if (contract >= TIER_HIGH) return '100万以上'
  if (contract >= TIER_MID) return '50-100万'
  return '50万以下'
}

/** 进度态：由节点级 payment.paymentRatio(Σ已收÷Σ计划)派生。无合同→未知；ratio 0/null 且有合同→未回款。 */
export function deriveProgress(contract: number | null | undefined, nodeRatio: number | null | undefined): string {
  if (contract == null || contract <= 0) return '未知'
  const r = nodeRatio
  if (r == null || r <= 0) return '未回款'
  if (r >= 0.999) return '已全额回款'
  return '部分回款'
}

/** 部门：project.orgL4（空→未指定）。 */
export function deriveDept(p: Project): string {
  const s = (p.orgL4 ?? '').trim()
  return s === '' ? '未指定' : s
}

/** 阶段：projectPmis[pid].progress.项目阶段（空/缺→未指定）。 */
export function deriveStage(pid: string, pmisMap: Record<string, ProjectPmis> | undefined): string {
  const s = String((pmisMap?.[pid]?.progress as Record<string, unknown> | undefined)?.['项目阶段'] ?? '').trim()
  return s === '' ? '未指定' : s
}

/** 完成率三态色（对齐既有 0.8/0.5 阈值，输出 theme 令牌；null→mut）。 */
export function rateColorPmis(r: number | null | undefined): string {
  if (r == null) return 'var(--mut)'
  if (r >= RATE_OK) return 'var(--ok-text)'
  if (r >= RATE_WARN) return 'var(--warn-text)'
  return 'var(--danger-text)'
}

// ── 共享维度选择器（前 4 个 facet tab）──
export interface PayDimDef { key: 'dept' | 'stage' | 'tier' | 'progress'; label: string }
export const PAY_FACET_DIMS: PayDimDef[] = [
  { key: 'dept', label: '部门' },
  { key: 'stage', label: '阶段' },
  { key: 'tier', label: '金额档' },
  { key: 'progress', label: '进度态' },
]

// ── 视角/纳管过滤（对 projects[]，不复用 filterNodes）──
export interface FilterOpts {
  viewMode: 'global' | 'l4' | 'pm'
  viewL4: string
  viewPM: string
  excludeActive: boolean
  excludedIds: Record<string, boolean>
}
export function filterProjects(projects: Project[], opts: FilterOpts): Project[] {
  return projects.filter((p) => {
    if (isAnomalous(p)) return false
    if (opts.excludeActive && opts.excludedIds && opts.excludedIds[p.projectId]) return false
    if (opts.viewMode === 'l4' && opts.viewL4) return (p.orgL4 ?? '') === opts.viewL4
    if (opts.viewMode === 'pm' && opts.viewPM) return (p.projectManager ?? '') === opts.viewPM
    return true
  })
}

// ── 项目级回款行（项目总览表底座 + 维度 + 下钻兼容列）──
export interface PayProjectRow {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  dept: string
  stage: string
  tier: string
  progress: string
  contract: number
  actualTotal: number
  paymentRatio: number | null
  expectedTotal: number
  remainingTotal: number
  nodeCount: number
  reachedCount: number
  delayedCount: number
  fromOrigin: boolean
  overspendAmount: number
  projectAmount: number
  paymentStatus: string
}

export function projectPaymentRows(
  projects: Project[],
  pmisMap?: Record<string, ProjectPmis>,
  paymentNodes?: Record<string, PaymentNodePmis[]>,
  paymentRecords?: Record<string, PaymentRecordsEntry>,
  start = '',
  end = '',
): PayProjectRow[] {
  return projects.map((p) => {
    const pm = p.paymentPmis ?? null
    const contract = pm?.contract ?? 0
    const dept = deriveDept(p)
    const tier = deriveTier(pm?.contract)

    const rp = paymentPmisInRange(
      contract,
      paymentNodes?.[p.projectId],
      paymentRecords?.[p.projectId]?.records,
      start,
      end,
    )

    const progress = deriveProgress(rp.contract, rp.paymentRatio)
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      projectManager: (p.projectManager ?? '').trim() || '未指定',
      orgL4: dept,
      dept,
      stage: deriveStage(p.projectId, pmisMap),
      tier,
      progress,
      contract: rp.contract,
      actualTotal: rp.actualTotal,
      paymentRatio: rp.paymentRatio,
      expectedTotal: rp.expectedTotal,
      remainingTotal: rp.remainingTotal,
      nodeCount: rp.nodeCount,
      reachedCount: rp.reachedCount,
      delayedCount: rp.delayedCount,
      fromOrigin: pm?.fromOrigin ?? false,
      overspendAmount: p.overspendAmount ?? 0,
      projectAmount: contract,
      paymentStatus: progress,
    }
  })
}

// ── 单维汇总（加权完成率 Σ÷Σ，rate=已回/计划）──
export interface DimSummary {
  value: string
  projectCount: number
  contractSum: number
  actualSum: number
  rate: number | null
  delayedNodeSum: number
  remainingSum: number
}
export function summaryByDim(rows: PayProjectRow[], dimKey: string): DimSummary[] {
  const buckets: Record<string, PayProjectRow[]> = {}
  for (const r of rows) {
    const v = String((r as unknown as Record<string, unknown>)[dimKey] ?? '未指定')
    ;(buckets[v] ||= []).push(r)
  }
  return Object.entries(buckets)
    .map(([value, grp]) => {
      const contractSum = grp.reduce((s, r) => s + r.contract, 0)
      const actualSum = grp.reduce((s, r) => s + r.actualTotal, 0)
      const expSum = grp.reduce((s, r) => s + r.expectedTotal, 0)
      return {
        value,
        projectCount: grp.length,
        contractSum,
        actualSum,
        rate: expSum > 0 ? actualSum / expSum : null,   // 已回/计划
        delayedNodeSum: grp.reduce((s, r) => s + r.delayedCount, 0),
        remainingSum: grp.reduce((s, r) => s + r.remainingTotal, 0),
      }
    })
    .sort((a, b) => b.contractSum - a.contractSum)
}

// ── 节点级回款行（扁平化 + 维度 join）──
export interface PayNodeRow {
  projectId: string
  projectName: string
  stage: string
  planDate: string
  actualDate: string
  payRatio: number | null
  actualRatio: number | null
  expectedPayment: number
  receivedAmount: number
  unpaidAmount: number
  projectManager: string
  status: string
  dept: string
  orgL3_1: string
  projStage: string
  tier: string
  progress: string
}

export function paymentNodeRows(
  paymentNodes: Record<string, PaymentNodePmis[]> | undefined,
  projects: Project[],
  pmisMap?: Record<string, ProjectPmis>,
): PayNodeRow[] {
  if (!paymentNodes) return []
  const byId = new Map(projects.map((p) => [p.projectId, p]))
  const rows: PayNodeRow[] = []
  for (const [pid, nodes] of Object.entries(paymentNodes)) {
    const p = byId.get(pid)
    if (!p) continue
    if (isAnomalous(p)) continue
    const dept = deriveDept(p)
    const tier = deriveTier(p.paymentPmis?.contract)
    const progress = deriveProgress(p.paymentPmis?.contract ?? null, p.payment?.paymentRatio)
    const projStage = deriveStage(pid, pmisMap)
    for (const n of nodes) {
      rows.push({
        projectId: pid,
        projectName: p.projectName || pid,
        stage: n.stage,
        planDate: n.planDate || '',
        actualDate: n.actualDate || '',
        payRatio: n.payRatio ?? null,
        actualRatio: n.actualRatio ?? null,
        expectedPayment: n.expectedPayment ?? 0,
        receivedAmount: n.receivedAmount ?? 0,
        unpaidAmount: n.unpaidAmount ?? 0,
        projectManager: (p.projectManager ?? '').trim() || '未指定',
        status: n.status || '',
        dept,
        orgL3_1: (p.orgL3_1 ?? '').trim(),
        projStage,
        tier,
        progress,
      })
    }
  }
  return rows
}

export interface NodeSummary {
  total: number
  reached: number
  delayed: number
  pending: number
  expectedTotal: number
}
export function nodeSummary(rows: PayNodeRow[]): NodeSummary {
  return {
    total: rows.length,
    reached: rows.filter((r) => r.status === '已回款').length,
    delayed: rows.filter((r) => r.status === '延期').length,
    pending: rows.filter((r) => r.status !== '已回款' && r.status !== '延期').length,
    expectedTotal: rows.reduce((s, r) => s + r.expectedPayment, 0),
  }
}

// ── 进度桶（项目级 3 互斥桶）──
const PROGRESS_ORDER = ['已全额回款', '部分回款', '未回款'] as const
export interface ProgressBucket {
  key: string
  projectCount: number
  contractSum: number
  actualSum: number
  rate: number | null
}
export function progressBuckets(rows: PayProjectRow[]): { buckets: ProgressBucket[]; unknown: number } {
  let unknown = 0
  const map: Record<string, PayProjectRow[]> = {}
  for (const r of rows) {
    if (r.progress === '未知') { unknown++; continue }
    ;(map[r.progress] ||= []).push(r)
  }
  const buckets = PROGRESS_ORDER.map((key) => {
    const grp = map[key] || []
    const contractSum = grp.reduce((s, r) => s + r.contract, 0)
    const actualSum = grp.reduce((s, r) => s + r.actualTotal, 0)
    return { key, projectCount: grp.length, contractSum, actualSum, rate: contractSum > 0 ? actualSum / contractSum : null }
  })
  return { buckets, unknown }
}

// ── 风险三类 ──
export interface PmisRiskGroups {
  delayedNodes: PayNodeRow[]
  lowPayment: PayProjectRow[]
  overspend: PayProjectRow[]
}
export function pmisRiskGroups(rows: PayProjectRow[], nodeRows: PayNodeRow[]): PmisRiskGroups {
  const delayedNodes = nodeRows
    .filter((n) => n.status === '延期')
    .sort((a, b) => (a.planDate || '').localeCompare(b.planDate || ''))
  const lowPayment = rows
    .filter((r) => r.contract > 0 && (r.paymentRatio ?? 0) < 0.3)
    .sort((a, b) => b.contract - a.contract)
    .slice(0, 10)
  const overspend = rows
    .filter((r) => r.overspendAmount > 0)
    .sort((a, b) => b.overspendAmount - a.overspendAmount)
  return { delayedNodes, lowPayment, overspend }
}
