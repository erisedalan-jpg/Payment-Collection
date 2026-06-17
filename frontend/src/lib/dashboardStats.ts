import type { RawNode } from '@/types/analysis'

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
