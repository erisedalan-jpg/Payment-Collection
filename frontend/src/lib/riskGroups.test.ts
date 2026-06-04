import { describe, it, expect } from 'vitest'
import { riskGroups, getNodeRemaining } from './riskGroups'

const NOW = new Date('2026-06-04T00:00:00')

const NODES: any[] = [
  { projectId: 'P1', projectName: '甲', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-06', actualPaymentRatio: 0.5, expectedPayment: 200000, actualPayment: 100000, orgL4: '北京' },
  { projectId: 'P2', projectName: '乙', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-07-30', actualPaymentRatio: 0, expectedPayment: 100000, actualPayment: 0, orgL4: '上海' },
  { projectId: 'P3', projectName: '丙', tier: '100万以上', isPaymentRelated: true, nodeStatus: '加资源可提前', planDate: '2026-08-01', actualPaymentRatio: 0, expectedPayment: 300000, actualPayment: 0, orgL4: '广州' },
  { projectId: 'P4', projectName: '丁', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-09-01', actualPaymentRatio: 0.1, expectedPayment: 1000000, actualPayment: 100000, projectAmount: 2000000, orgL4: '深圳' },
]

describe('getNodeRemaining', () => {
  it('expected - actual（元）', () => {
    expect(getNodeRemaining({ expectedPayment: 200000, actualPayment: 100000 })).toBe(100000)
    expect(getNodeRemaining({})).toBe(0)
  })
})

describe('riskGroups', () => {
  it('临近到期：7天内且未100%回款，按 planDate 升序', () => {
    const g = riskGroups(NODES, NOW)
    expect(g.nearDue.map((n: any) => n.projectId)).toEqual(['P1'])
  })
  it('可提前但未行动：nodeStatus=加资源可提前', () => {
    const g = riskGroups(NODES, NOW)
    expect(g.canAdvance.map((n: any) => n.projectId)).toEqual(['P3'])
  })
  it('高金额低完成率：项目完成率<0.3，按项目金额降序，取前10', () => {
    const g = riskGroups(NODES, NOW)
    expect(g.highRisk.map((p) => p.projectId)).toEqual(['P4'])
    expect(g.highRisk[0].paymentRatio).toBeCloseTo(0.1)
  })
})
