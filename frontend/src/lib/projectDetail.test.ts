import { describe, it, expect } from 'vitest'
import { buildProjectDetail } from './projectDetail'
import type { RawNode } from '@/types/analysis'

const nodes = [
  { projectId: 'P1', projectName: '甲项目', orgL4: '一部', projectManager: '张', tier: '100万以上', isPaymentRelated: true, expectedPayment: 200000, actualPayment: 50000, nodeStatus: '延期' },
  { projectId: 'P1', projectName: '甲项目', isPaymentRelated: false, nodeStatus: '' },
  { projectId: 'P2', projectName: '乙项目', isPaymentRelated: true, expectedPayment: 100000, actualPayment: 100000, nodeStatus: '已全额回款' },
] as unknown as RawNode[]

describe('buildProjectDetail', () => {
  it('聚合该项目并返回其全部节点(含非回款节点)', () => {
    const d = buildProjectDetail(nodes, 'P1')
    expect(d.project?.projectId).toBe('P1')
    expect(d.project?.projectName).toBe('甲项目')
    expect(d.nodes.length).toBe(2)
    expect(d.project?.expectedPayment).toBe(200000)
    expect(d.project?.actualPayment).toBe(50000)
    expect(d.project?.paymentStatus).toBe('延期')
  })
  it('未知 id 返回 project=null、nodes=[]', () => {
    const d = buildProjectDetail(nodes, 'NOPE')
    expect(d.project).toBeNull()
    expect(d.nodes).toEqual([])
  })
})
