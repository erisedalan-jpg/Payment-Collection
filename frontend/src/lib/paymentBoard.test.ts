import { describe, it, expect } from 'vitest'
import type { Project, ProjectPaymentPmis, ProjectPmis } from '@/types/analysis'
import {
  buildPayBoardRows, PAY_BOARD_DIMENSIONS, PAY_BOARD_METRICS,
  groupPayBoard, payBoardCross, payBoardPivot,
} from './paymentBoard'

const pm = (o: Partial<ProjectPaymentPmis>): ProjectPaymentPmis => ({ ...o })
const proj = (o: Partial<Project>): Project => ({ projectId: 'P0', ...o } as Project)

const projects: Project[] = [
  proj({ projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1',
    payment: { relatedNodeCount: 1, expectedTotal: 1_500_000, actualTotal: 1_000_000, remainingTotal: 500_000, paymentRatio: 0.5, delayedCount: 1 },
    paymentPmis: pm({ contract: 2_000_000, actualTotal: 1_000_000, expectedTotal: 1_500_000, delayedCount: 1 }) }),
  proj({ projectId: 'B', projectName: '乙', projectManager: '李四', orgL4: '组1',
    payment: { relatedNodeCount: 1, expectedTotal: 1_000_000, actualTotal: 1_000_000, remainingTotal: 0, paymentRatio: 1, delayedCount: 0 },
    paymentPmis: pm({ contract: 1_000_000, actualTotal: 1_000_000, expectedTotal: 1_000_000, delayedCount: 0 }) }),
  proj({ projectId: 'C', projectName: '丙', projectManager: '李四', orgL4: '组2',
    payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
    paymentPmis: pm({ contract: 0, actualTotal: 0, expectedTotal: 0, delayedCount: 0 }) }),
]
const pmisMap: Record<string, ProjectPmis> = {
  A: { progress: { 项目阶段: '实施' }, customer: { 行业: '银行' } } as unknown as ProjectPmis,
}

describe('PAY_BOARD_DIMENSIONS / PAY_BOARD_METRICS', () => {
  it('维度含部门/阶段/经理/行业/金额档/进度态', () => {
    expect(PAY_BOARD_DIMENSIONS.map((d) => d.key)).toEqual(['dept', 'stage', 'manager', 'industry', 'tier', 'progress'])
  })
  it('指标 7 项，仅 rate 为 kind=rate（不可加）', () => {
    expect(PAY_BOARD_METRICS.map((m) => m.key)).toEqual(['projectCount', 'contractSum', 'actualSum', 'expectedSum', 'pendingSum', 'rate', 'delayedNodeSum'])
    expect(PAY_BOARD_METRICS.filter((m) => m.kind === 'rate').map((m) => m.key)).toEqual(['rate'])
  })
})

describe('buildPayBoardRows', () => {
  it('维度字段 + 指标基 + 下钻兼容列', () => {
    const rows = buildPayBoardRows(projects, pmisMap)
    const a = rows.find((r) => r.projectId === 'A')!
    expect(a).toMatchObject({
      dept: '组1', stage: '实施', manager: '张三', industry: '银行', tier: '100万以上', progress: '部分回款',
      contract: 2_000_000, actualTotal: 1_000_000, expectedTotal: 1_500_000, delayedCount: 1, paymentRatio: 0.5,
      projectAmount: 2_000_000, paymentStatus: '部分回款', orgL4: '组1', projectManager: '张三',
    })
    const b = rows.find((r) => r.projectId === 'B')!
    expect(b).toMatchObject({ stage: '未指定', industry: '未指定' })
  })
})

describe('groupPayBoard（单维分桶 + 7 指标，加权完成率 Σ÷Σ）', () => {
  it('按 dept：组1 合计；待回款Σ=Σmax(contract-actual,0)', () => {
    const g = groupPayBoard(buildPayBoardRows(projects, pmisMap), ['dept'])
    const g1 = g.find((x) => x.key === '组1')!
    expect(g1).toMatchObject({ projectCount: 2, contractSum: 3_000_000, actualSum: 2_000_000, expectedSum: 2_500_000, delayedNodeSum: 1 })
    expect(g1.pendingSum).toBe(1_000_000)
    expect(g1.rate).toBeCloseTo(2_000_000 / 3_000_000, 6)
    const g2 = g.find((x) => x.key === '组2')!
    expect(g2.rate).toBeNull()
  })
  it('默认按项目数降序', () => {
    const g = groupPayBoard(buildPayBoardRows(projects, pmisMap), ['dept'])
    expect(g[0].projectCount).toBeGreaterThanOrEqual(g[g.length - 1].projectCount)
  })
})

describe('payBoardCross / payBoardPivot（复用泛型结构；rate 无数据→NaN 单元格）', () => {
  it('cross 返回 rows/cols/cells/index', () => {
    const m = payBoardCross(buildPayBoardRows(projects, pmisMap), 'dept', 'progress', 'contractSum')
    expect(m.rows.length).toBeGreaterThan(0)
    expect(Array.isArray(m.cells)).toBe(true)
  })
  it('pivot 多行多列；colDims 空退化单列合计', () => {
    const r = payBoardPivot(buildPayBoardRows(projects, pmisMap), ['dept'], [], 'projectCount')
    expect(r.cols).toHaveLength(1)
    expect(r.cols[0].label).toBe('合计')
  })
  it('rate 指标空桶单元格为 NaN（展示层显 -）', () => {
    const m = payBoardCross(buildPayBoardRows(projects, pmisMap), 'dept', 'progress', 'rate')
    const hasNaN = m.cells.flat().some((v) => Number.isNaN(v))
    expect(hasNaN).toBe(true)
  })
})
