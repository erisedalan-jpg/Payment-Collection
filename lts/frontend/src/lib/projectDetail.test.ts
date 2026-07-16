import { describe, it, expect } from 'vitest'
import { buildProjectDetail } from './projectDetail'
describe('buildProjectDetail(收款阶段)', () => {
  const projects = [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: 'A组', paymentPmis: { contract: 2000000 } }] as any
  const paymentNodes = { P1: [
    { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.5, actualRatio: 0.3, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
    { stage: '验收款', planDate: '2026-03-01', actualDate: '', payRatio: 0.5, actualRatio: 0, expectedPayment: 1000000, receivedAmount: 0, unpaidAmount: 1000000, status: '延期' },
  ] } as any
  // 流水口径: P1 实际回款 600000
  const paymentRecords = { P1: { records: [{ amount: 600000, date: '2026-02-15' }] } } as any
  it('摘要取 ledgerRows 流水口径 + nodes 为 PayNodeRow', () => {
    const d = buildProjectDetail(paymentNodes, projects, {}, 'P1', paymentRecords)
    expect(d.project?.expectedPayment).toBe(2000000)
    expect(d.project?.actualPayment).toBe(600000)
    expect(d.project?.remainingAmount).toBe(1400000)
    expect(d.project?.paymentStatus).toBe('部分回款')
    expect(d.project?.delayed).toBe(true)
    expect(d.nodes).toHaveLength(2)
    expect(d.nodes[0].stage).toBe('到货款')
  })
  it('无 paymentRecords 时 actualPayment=0', () => {
    const d = buildProjectDetail(paymentNodes, projects, {}, 'P1')
    expect(d.project?.actualPayment).toBe(0)
    expect(d.project?.expectedPayment).toBe(2000000)
  })
  it('项目不存在返回空', () => {
    expect(buildProjectDetail(paymentNodes, projects, {}, 'X')).toEqual({ project: null, nodes: [] })
  })
})
