import { describe, it, expect } from 'vitest'
import { DIMENSIONS, DIM_BY_KEY, groupByDims, METRICS, crossMatrix, pivotTable } from './pivot'

const NODES: any[] = [
  // 项目 P1（北京/张三/100万以上）两节点：计划 100+50 万，已回 60+0 万，一节点延期
  { projectId: 'P1', tier: '100万以上', orgL4: '北京', orgL3: '华北', projectManager: '张三', projectType: '集成', signUnit: '甲公司', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 1000000, actualPayment: 600000 },
  { projectId: 'P1', tier: '100万以上', orgL4: '北京', orgL3: '华北', projectManager: '张三', projectType: '集成', signUnit: '甲公司', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 500000, actualPayment: 0 },
  // 项目 P2（上海/李四/50万以下）一节点
  { projectId: 'P2', tier: '50万以下', orgL4: '上海', orgL3: '华东', projectManager: '李四', projectType: '运维', signUnit: '', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 300000, actualPayment: 300000 },
]

describe('DIMENSIONS', () => {
  it('提供 6 个维度，valueOf 空值回退「未指定」', () => {
    expect(DIMENSIONS.map((d) => d.key)).toEqual(['orgL4', 'orgL3', 'projectManager', 'projectType', 'signUnit', 'tier'])
    expect(DIM_BY_KEY.signUnit.valueOf({ signUnit: '' } as any)).toBe('未指定')
    expect(DIM_BY_KEY.orgL4.valueOf({ orgL4: '北京' } as any)).toBe('北京')
  })
})

describe('groupByDims 单维', () => {
  it('按 orgL4 分组并算指标', () => {
    const gs = groupByDims(NODES, ['orgL4'])
    const bj = gs.find((g) => g.key === '北京')!
    expect(bj.projectCount).toBe(1)
    expect(bj.expectedAmount).toBe(1500000)
    expect(bj.actualAmount).toBe(600000)
    expect(bj.remainingAmount).toBe(900000)
    expect(bj.completionRate).toBeCloseTo(0.4)
    expect(bj.delayedCount).toBe(1)
    expect(bj.delayRate).toBeCloseTo(1)
    expect(bj.projects.length).toBe(1)
  })

  it('按 tier 分组得到两组，默认按已回款降序', () => {
    const gs = groupByDims(NODES, ['tier'])
    expect(gs.map((g) => g.key)).toEqual(['100万以上', '50万以下'])
  })
})

describe('crossMatrix 双维透视', () => {
  const X: any[] = [
    { projectId: 'A', orgL4: '北京', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 1000000, actualPayment: 600000 },
    { projectId: 'B', orgL4: '北京', tier: '50万以下', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 200000, actualPayment: 100000 },
    { projectId: 'C', orgL4: '上海', tier: '50万以下', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 400000, actualPayment: 300000 },
  ]

  it('METRICS 含 6 指标', () => {
    expect(METRICS.map((m) => m.key)).toEqual(['actualAmount', 'expectedAmount', 'remainingAmount', 'completionRate', 'projectCount', 'delayedCount'])
  })

  it('按 orgL4 × tier 透视已回款，行列按合计降序', () => {
    const m = crossMatrix(X, 'orgL4', 'tier', 'actualAmount')
    expect(m.rows).toEqual(['北京', '上海'])
    expect(m.cols).toEqual(['100万以上', '50万以下'])
    expect(m.cells[0]).toEqual([600000, 100000])
    expect(m.cells[1]).toEqual([0, 300000])
    expect(m.index['北京']['100万以上'].projects.length).toBe(1)
  })
})

describe('pivotTable 多行多列透视', () => {
  const PX: any[] = [
    { projectId: 'A', orgL4: '北京', projectManager: '张三', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 1000000, actualPayment: 600000 },
    { projectId: 'B', orgL4: '北京', projectManager: '李四', tier: '50万以下', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 200000, actualPayment: 100000 },
    { projectId: 'C', orgL4: '上海', projectManager: '王五', tier: '50万以下', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 400000, actualPayment: 300000 },
  ]

  it('行=orgL4×projectManager、列=tier、指标=已回款', () => {
    const p = pivotTable(PX, ['orgL4', 'projectManager'], ['tier'], 'actualAmount')
    expect(p.rowDimLabels).toEqual(['服务组(L4)', '项目经理'])
    expect(p.colDimLabels).toEqual(['金额档位'])
    expect(p.rows.map((r) => r.tuple)).toEqual([
      ['北京', '张三'],
      ['上海', '王五'],
      ['北京', '李四'],
    ])
    expect(p.cols.map((c) => c.label)).toEqual(['100万以上', '50万以下'])
    expect(p.cells[0]).toEqual([600000, 0])
    expect(p.index['北京 / 张三']['100万以上'].projects.length).toBe(1)
  })

  it('无列维度时列为单列「合计」', () => {
    const p = pivotTable(PX, ['orgL4'], [], 'actualAmount')
    expect(p.cols.map((c) => c.label)).toEqual(['合计'])
    expect(p.rows.map((r) => r.tuple)).toEqual([['北京'], ['上海']])
    expect(p.cells).toEqual([[700000], [300000]])
  })
})
