import { describe, it, expect } from 'vitest'
import { groupByProject, computeTierStats, computeDashboardSummary } from './dashboardStats'

const NODES: any[] = [
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三',
    projectAmount: 2000000, isPaymentRelated: true, nodeStatus: '已全额回款', expectedPayment: 1000000, actualPayment: 1000000, actualPaymentRatio: '100%', canAdvance: false },
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三',
    projectAmount: 2000000, isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, actualPaymentRatio: '0%', canAdvance: false },
  { projectId: 'P2', projectName: '乙', tier: '50-100万', orgL4: '上海', projectManager: '李四',
    projectAmount: 800000, isPaymentRelated: false, nodeStatus: '', expectedPayment: 0, actualPayment: 0, actualPaymentRatio: '', canAdvance: false },
]

describe('groupByProject', () => {
  it('aggregates nodes by project with summed payments + status precedence', () => {
    const ps = groupByProject(NODES)
    const byId = Object.fromEntries(ps.map((p) => [p.projectId, p]))
    expect(byId.P1.expectedPayment).toBe(2000000)
    expect(byId.P1.actualPayment).toBe(1000000)
    expect(byId.P1.paymentRatio).toBe(0.5)
    expect(byId.P1.paymentStatus).toBe('已全额回款')
    expect(byId.P2.paymentStatus).toBe('待确定')
  })
})

describe('computeTierStats', () => {
  it('computes per-tier counts and wan amounts', () => {
    const s = computeTierStats('100万以上', NODES)
    expect(s.projectCount).toBe(1)
    expect(s.relatedNodeCount).toBe(2)
    expect(s.fullPaidCount).toBe(1)
    expect(s.delayedCount).toBe(1)
    expect(s.expectedAmountWan).toBe(200)
    expect(s.actualAmountWan).toBe(100)
  })
  it('empty tier yields zeros', () => {
    const s = computeTierStats('50万以下', NODES)
    expect(s.projectCount).toBe(0)
    expect(s.relatedNodeCount).toBe(0)
  })
})

describe('computeDashboardSummary', () => {
  it('totals from grouped projects + project count from overview with naguan/view filter', () => {
    const overview = [
      { projectId: 'P1', 项目经理L4部门: '北京', 项目经理: '张三' },
      { projectId: 'P2', 项目经理L4部门: '上海', 项目经理: '李四' },
    ]
    const sum = computeDashboardSummary(NODES, overview, {
      naguanOn: true, naguanExclude: { P2: true }, viewMode: 'global', viewL4: '', viewPM: '',
    })
    expect(sum.relatedNodeCount).toBe(2)
    expect(sum.totalProjects).toBe(1)
    expect(sum.totalExpected).toBe(2000000)
    expect(sum.totalActual).toBe(1000000)
    expect(sum.totalRemaining).toBe(1000000)
    expect(sum.rate).toBe(0.5)
  })
})
