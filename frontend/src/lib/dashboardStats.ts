import type { RawNode } from '@/types/analysis'
import type { ViewMode } from './filterNodes'
import { pctToNum } from './format'

export interface ProjectAgg {
  projectId: string
  projectName: string
  orgL4: string
  orgL3: string
  projectManager: string
  projectType: string
  projectAmount: number
  tier: string
  canAdvance: boolean
  expectedPayment: number
  actualPayment: number
  paymentRatio: number | null
  remainingAmount: number
  paymentStatus: string
  nodes: RawNode[]
}

export function groupByProject(nodes: RawNode[]): ProjectAgg[] {
  const m: Record<string, ProjectAgg> = {}
  for (const raw of nodes) {
    const n = raw as Record<string, any>
    if (!m[n.projectId]) {
      m[n.projectId] = {
        projectId: n.projectId,
        projectName: n.projectName,
        orgL4: n.orgL4 || '',
        orgL3: n.orgL3 || '',
        projectManager: n.projectManager || '',
        projectType: n.projectType || '',
        projectAmount: n.projectAmount || 0,
        tier: n.tier,
        canAdvance: false,
        expectedPayment: 0,
        actualPayment: 0,
        paymentRatio: null,
        remainingAmount: 0,
        paymentStatus: '待确定',
        nodes: [],
      }
    }
    const p = m[n.projectId]
    if (n.isPaymentRelated) {
      p.expectedPayment += n.expectedPayment || 0
      p.actualPayment += n.actualPayment || 0
    }
    if (n.canAdvance) p.canAdvance = true
    p.nodes.push(raw)
  }
  for (const p of Object.values(m)) {
    const rel = p.nodes.filter((n) => (n as Record<string, any>).isPaymentRelated)
    if (!rel.length) {
      p.paymentStatus = '待确定'
      p.paymentRatio = null
    } else {
      p.paymentRatio = p.expectedPayment > 0 ? p.actualPayment / p.expectedPayment : 0
      p.remainingAmount = p.expectedPayment - p.actualPayment
      const has = (s: string) => rel.some((n) => (n as Record<string, any>).nodeStatus === s)
      if (has('加资源可提前')) p.paymentStatus = '加资源可提前'
      else if (has('达到回款条件')) p.paymentStatus = '达到回款条件'
      else if (has('已提前回款')) p.paymentStatus = '已提前回款'
      else if (has('已全额回款')) p.paymentStatus = '已全额回款'
      else if (has('延期')) p.paymentStatus = '延期'
      else if (has('正常实施中')) p.paymentStatus = '正常实施中'
      else p.paymentStatus = '待确定'
    }
  }
  return Object.values(m)
}

function statusStats(group: RawNode[]) {
  const exp = group.reduce((s, n) => s + ((n as Record<string, any>).expectedPayment || 0), 0)
  const act = group.reduce((s, n) => s + ((n as Record<string, any>).actualPayment || 0), 0)
  return { expected: exp, actual: act, remaining: exp - act, rate: exp > 0 ? act / exp : 0 }
}

export function computeTierStats(tier: string, nodes: RawNode[]) {
  const tierNodes = nodes.filter((n) => n.tier === tier)
  const related = tierNodes.filter((n) => (n as Record<string, any>).isPaymentRelated)
  const projectCount = new Set(tierNodes.map((n) => n.projectId)).size
  const relatedProjectCount = new Set(related.map((n) => n.projectId)).size

  const pa: Record<string, number> = {}
  tierNodes.forEach((n) => {
    const r = n as Record<string, any>
    if (!(r.projectId in pa)) pa[r.projectId] = r.projectAmount || 0
  })
  const totalAmount = Object.values(pa).reduce((s, v) => s + v, 0)
  const expectedTotal = related.reduce((s, n) => s + ((n as Record<string, any>).expectedPayment || 0), 0)
  const actualTotal = related.reduce((s, n) => s + ((n as Record<string, any>).actualPayment || 0), 0)
  const remaining = expectedTotal - actualTotal

  const byStatus = (s: string) => related.filter((n) => (n as Record<string, any>).nodeStatus === s)
  const canAdvance = byStatus('加资源可提前')
  const reachedCondition = byStatus('达到回款条件')
  const advance = byStatus('已提前回款')
  const fullPaid = byStatus('已全额回款')
  const onTime = byStatus('正常实施中')
  const delayed = byStatus('延期')

  const ca = statusStats(canAdvance)
  const rc = statusStats(reachedCondition)
  const av = statusStats(advance)
  const fp = statusStats(fullPaid)
  const ot = statusStats(onTime)
  const dl = statusStats(delayed)

  const paid = related.filter((n) => {
    const v = pctToNum((n as Record<string, any>).actualPaymentRatio)
    return v !== null && v >= 1
  })

  return {
    projectCount,
    relatedProjectCount,
    relatedNodeCount: related.length,
    totalAmountWan: totalAmount / 10000,
    expectedAmountWan: expectedTotal / 10000,
    actualAmountWan: actualTotal / 10000,
    remainingAmountWan: remaining / 10000,

    canAdvanceCount: canAdvance.length, canAdvanceExpected: ca.expected / 10000, canAdvanceActual: ca.actual / 10000, canAdvanceRemaining: ca.remaining / 10000, canAdvanceRate: ca.rate,
    reachedConditionCount: reachedCondition.length, reachedConditionExpected: rc.expected / 10000, reachedConditionActual: rc.actual / 10000, reachedConditionRemaining: rc.remaining / 10000, reachedConditionRate: rc.rate,
    advanceCount: advance.length, advanceExpected: av.expected / 10000, advanceActual: av.actual / 10000, advanceRemaining: av.remaining / 10000, advanceRate: av.rate,
    fullPaidCount: fullPaid.length, fullPaidExpected: fp.expected / 10000, fullPaidActual: fp.actual / 10000, fullPaidRemaining: fp.remaining / 10000, fullPaidRate: fp.rate,
    onTimeCount: onTime.length, onTimeExpected: ot.expected / 10000, onTimeActual: ot.actual / 10000, onTimeRemaining: ot.remaining / 10000, onTimeRate: ot.rate,
    delayedCount: delayed.length, delayedExpected: dl.expected / 10000, delayedActual: dl.actual / 10000, delayedRemaining: dl.remaining / 10000, delayedRate: dl.rate,

    paidCount: paid.length,
    paidAmount: paid.reduce((s, n) => s + ((n as Record<string, any>).actualPayment || 0), 0) / 10000,
  }
}

export interface DashSummary {
  relatedNodeCount: number
  totalProjects: number
  totalExpected: number
  totalActual: number
  totalRemaining: number
  rate: number
  delayedProjects: number
}

export function computeDashboardSummary(
  nodes: RawNode[],
  projectOverview: Record<string, any>[],
  opts: { naguanOn: boolean; naguanExclude: Record<string, boolean>; viewMode: ViewMode; viewL4: string; viewPM: string },
): DashSummary {
  const projs = groupByProject(nodes)
  const totalProjects = projectOverview.filter((p) => {
    if (opts.naguanOn && opts.naguanExclude && opts.naguanExclude[p.projectId]) return false
    if (opts.viewMode === 'l4' && opts.viewL4 && p['项目经理L4部门'] !== opts.viewL4) return false
    if (opts.viewMode === 'pm' && opts.viewPM && p['项目经理'] !== opts.viewPM) return false
    return true
  }).length
  const relatedNodeCount = nodes.filter((n) => (n as Record<string, any>).isPaymentRelated).length
  const totalExpected = projs.reduce((s, p) => s + (p.expectedPayment || 0), 0)
  const totalActual = projs.reduce((s, p) => s + (p.actualPayment || 0), 0)
  const delayedProjects = projs.filter((p) => p.paymentStatus === '延期').length
  return {
    relatedNodeCount,
    totalProjects,
    totalExpected,
    totalActual,
    totalRemaining: totalExpected - totalActual,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0,
    delayedProjects,
  }
}

export interface TierSummaryBar {
  projectCount: number
  relatedNodeCount: number
  totalActual: number
  totalExpected: number
  rate: number
  projCanAdvance: number
  projReachedCondition: number
  projDelayed: number
}

/** 忠实移植 renderTier 的汇总条计算（项目级状态计数 + 金额，单位元）。 */
export function tierSummaryBar(nodes: RawNode[]): TierSummaryBar {
  const projs = groupByProject(nodes)
  const totalActual = projs.reduce((s, p) => s + (p.actualPayment || 0), 0)
  const totalExpected = projs.reduce((s, p) => s + (p.expectedPayment || 0), 0)
  return {
    projectCount: projs.length,
    relatedNodeCount: nodes.filter((n) => (n as Record<string, any>).isPaymentRelated).length,
    totalActual,
    totalExpected,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0,
    projCanAdvance: projs.filter((p) => p.paymentStatus === '加资源可提前').length,
    projReachedCondition: projs.filter((p) => p.paymentStatus === '达到回款条件').length,
    projDelayed: projs.filter((p) => p.paymentStatus === '延期').length,
  }
}
