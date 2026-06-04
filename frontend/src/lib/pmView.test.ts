import { describe, it, expect } from 'vitest'
import { pmRanking, pmDrilldown, PM_PROJ_COLS, PM_DELAY_COLS } from './pmView'

const NODES: any[] = [
  { projectManager: '张', projectId: 'P1', projectAmount: 1000000, isPaymentRelated: true, expectedPayment: 200000, actualPayment: 100000, nodeStatus: '延期', tier: '100万以上', milestone: 'M1' },
  { projectManager: '张', projectId: 'P1', projectAmount: 1000000, isPaymentRelated: false },
  { projectManager: '李', projectId: 'P2', projectAmount: 500000, isPaymentRelated: true, expectedPayment: 100000, actualPayment: 100000, nodeStatus: '正常实施中' },
  { projectId: 'P3', projectAmount: 300000, isPaymentRelated: true, expectedPayment: 100000, actualPayment: 0, nodeStatus: '正常实施中' },
]

describe('pmRanking', () => {
  it('按完成率降序，含未指定，逐节点累加金额', () => {
    const r = pmRanking(NODES, '')
    expect(r.map((p) => p.name)).toEqual(['李', '张', '未指定'])
    const zhang = r.find((p) => p.name === '张')!
    expect(zhang.projectCount).toBe(1)
    expect(zhang.totalAmount).toBe(2000000) // 逐节点累加 1M+1M
    expect(zhang.actualPayment).toBe(100000)
    expect(zhang.expectedPayment).toBe(200000)
    expect(zhang.remaining).toBe(100000)
    expect(zhang.rate).toBeCloseTo(0.5)
    expect(zhang.delayedCount).toBe(1)
  })
  it('搜索按经理名子串过滤', () => {
    expect(pmRanking(NODES, '张').map((p) => p.name)).toEqual(['张'])
  })
})

describe('pmDrilldown', () => {
  it('纳管过滤后按经理筛选 → 项目 + 延期节点', () => {
    const d = pmDrilldown(NODES, '张', false, {})
    expect(d.projects.map((p) => p.projectId)).toEqual(['P1'])
    expect(d.delayedNodes).toHaveLength(1)
  })
  it('纳管开启时排除被纳管排除的项目', () => {
    const d = pmDrilldown(NODES, '张', true, { P1: true })
    expect(d.projects).toHaveLength(0)
    expect(d.delayedNodes).toHaveLength(0)
  })
})

describe('列定义', () => {
  it('PM_PROJ_COLS / PM_DELAY_COLS keys 忠实', () => {
    expect(PM_PROJ_COLS.map((c) => c.key)).toEqual([
      'projectId', 'projectName', 'tier', 'orgL4', 'projectManager', 'projectAmount', 'paymentStatus', 'paymentRatio',
    ])
    expect(PM_DELAY_COLS.map((c) => c.key)).toEqual([
      'projectId', 'projectName', 'tier', 'milestone', 'planDate', 'expectedPayment', 'actualPaymentRatio', 'delayDays',
    ])
  })
})
