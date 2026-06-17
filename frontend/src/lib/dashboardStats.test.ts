import { describe, it, expect } from 'vitest'
import { groupByProject } from './dashboardStats'

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
