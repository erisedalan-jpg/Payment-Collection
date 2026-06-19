import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis, PaymentNodePmis, PaymentRecord } from '@/types/analysis'
import {
  buildPayBoardRows, PAY_BOARD_DIMENSIONS, PAY_BOARD_METRICS,
  groupPayBoard, payBoardCross, payBoardPivot,
} from './paymentBoard'

// ---- 测试夹具 ----

const node = (o: Partial<PaymentNodePmis>): PaymentNodePmis => ({
  stage: '实施' as PaymentNodePmis['stage'],
  ...o,
})
const rec = (amount: number, date: string): PaymentRecord => ({ amount, date } as unknown as PaymentRecord)

// 节点：计划日 2024-03，金额 1_500_000，未收 500_000
const nodesA: PaymentNodePmis[] = [
  node({ planDate: '2024-03-31' as PaymentNodePmis['planDate'], expectedPayment: 1_500_000 as unknown as PaymentNodePmis['expectedPayment'], unpaidAmount: 500_000 as unknown as PaymentNodePmis['unpaidAmount'], status: '延期' as PaymentNodePmis['status'], reached: false }),
]
// 节点：计划日 2024-06，金额 1_000_000，未收 0（已收）
const nodesB: PaymentNodePmis[] = [
  node({ planDate: '2024-06-30' as PaymentNodePmis['planDate'], expectedPayment: 1_000_000 as unknown as PaymentNodePmis['expectedPayment'], unpaidAmount: 0 as unknown as PaymentNodePmis['unpaidAmount'], status: '正常' as PaymentNodePmis['status'], reached: true }),
]

const recordsA: PaymentRecord[] = [rec(1_000_000, '2024-03-15')]
const recordsB: PaymentRecord[] = [rec(1_000_000, '2024-06-10')]

const projects: Project[] = [
  {
    projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1',
    payment: { relatedNodeCount: 1, expectedTotal: 1_500_000, actualTotal: 1_000_000, remainingTotal: 500_000, paymentRatio: 0.5, delayedCount: 1 },
    paymentPmis: { contract: 2_000_000, actualTotal: 1_000_000, expectedTotal: 1_500_000, delayedCount: 1 },
  } as unknown as Project,
  {
    projectId: 'B', projectName: '乙', projectManager: '李四', orgL4: '组1',
    payment: { relatedNodeCount: 1, expectedTotal: 1_000_000, actualTotal: 1_000_000, remainingTotal: 0, paymentRatio: 1, delayedCount: 0 },
    paymentPmis: { contract: 1_000_000, actualTotal: 1_000_000, expectedTotal: 1_000_000, delayedCount: 0 },
  } as unknown as Project,
  {
    projectId: 'C', projectName: '丙', projectManager: '李四', orgL4: '组2',
    payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
    paymentPmis: { contract: 0, actualTotal: 0, expectedTotal: 0, delayedCount: 0 },
  } as unknown as Project,
]

const pmisMap: Record<string, ProjectPmis> = {
  A: { progress: { 项目阶段: '实施' }, customer: { 行业: '银行' }, status: { 项目级别: 'A级' } } as unknown as ProjectPmis,
}

const paymentNodes = { A: nodesA, B: nodesB }
const paymentRecords = {
  A: { records: recordsA },
  B: { records: recordsB },
} as unknown as import('@/types/analysis').Paymentrecords

// ---- 维度/指标元数据 ----

describe('PAY_BOARD_DIMENSIONS / PAY_BOARD_METRICS', () => {
  it('维度 5 项：L4部门/项目级别/行业/项目阶段/标签，标签为多值', () => {
    expect(PAY_BOARD_DIMENSIONS.map((d) => d.key)).toEqual(['dept', 'projectLevel', 'industry', 'stage', 'tag'])
    expect(PAY_BOARD_DIMENSIONS.find((d) => d.key === 'tag')?.multi).toBe(true)
    expect(PAY_BOARD_DIMENSIONS.find((d) => d.key === 'dept')?.label).toBe('L4部门')
    expect(PAY_BOARD_DIMENSIONS.find((d) => d.key === 'stage')?.label).toBe('项目阶段')
  })
  it('指标 5 项，仅 rate 为 kind=rate', () => {
    expect(PAY_BOARD_METRICS.map((m) => m.key)).toEqual(['projectCount', 'contractSum', 'expectedSum', 'rate', 'delayedNodeSum'])
    expect(PAY_BOARD_METRICS.filter((m) => m.kind === 'rate').map((m) => m.key)).toEqual(['rate'])
    expect(PAY_BOARD_METRICS.find((m) => m.key === 'delayedNodeSum')?.label).toBe('延期节点')
  })
})

// ---- buildPayBoardRows 区间重算 ----

describe('buildPayBoardRows', () => {
  it('无区间(全部)：行字段来自 paymentPmisInRange，包含 remainingTotal', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '', { A: ['BH项目', '框架合同'] })
    const a = rows.find((r) => r.projectId === 'A')!
    // contract 从 paymentPmis.contract 传入
    expect(a.contract).toBe(2_000_000)
    // actualTotal = 流水到账日∈全部 = 1_000_000
    expect(a.actualTotal).toBe(1_000_000)
    // expectedTotal = 节点计划日∈全部 = 1_500_000
    expect(a.expectedTotal).toBe(1_500_000)
    // remainingTotal = 节点未收 = 500_000
    expect(a.remainingTotal).toBe(500_000)
    expect(a.delayedCount).toBe(1)
    // paymentRatio = actual/contract = 1_000_000/2_000_000（分母改为合同总额）
    expect(a.paymentRatio).toBeCloseTo(1_000_000 / 2_000_000, 4)
    // 维度字段
    expect(a.dept).toBe('组1')
    expect(a.stage).toBe('实施')
    expect(a.manager).toBe('张三')
    expect(a.industry).toBe('银行')
    expect(a.projectAmount).toBe(2_000_000)
    expect(a.paymentStatus).toBe(a.progress)
    expect(a.projectLevel).toBe('A级')
    expect(a.tags).toEqual(['BH项目', '框架合同'])
  })

  it('区间收窄到 2024-01~2024-04：A 的节点在范围内，B 的不在', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '2024-01-01', '2024-04-30')
    const a = rows.find((r) => r.projectId === 'A')!
    // A 节点 2024-03 在范围，流水 2024-03 在范围
    expect(a.expectedTotal).toBe(1_500_000)
    expect(a.actualTotal).toBe(1_000_000)
    expect(a.remainingTotal).toBe(500_000)
    const b = rows.find((r) => r.projectId === 'B')!
    // B 节点 2024-06 不在范围，流水 2024-06 不在范围
    expect(b.expectedTotal).toBe(0)
    expect(b.actualTotal).toBe(0)
    expect(b.remainingTotal).toBe(0)
    // contract=1_000_000>0，actual=0 → paymentRatio=0（原为 null，分母改合同后不再 null）
    expect(b.paymentRatio).toBeCloseTo(0)
  })

  it('B 不含 pmisMap 条目：stage/industry 为「未指定」', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '')
    const b = rows.find((r) => r.projectId === 'B')!
    expect(b.stage).toBe('未指定')
    expect(b.industry).toBe('未指定')
  })

  it('兼容旧调用签名(无 nodes/records/range)：remainingTotal=0', () => {
    const rows = buildPayBoardRows(projects, pmisMap)
    const a = rows.find((r) => r.projectId === 'A')!
    // 无节点数据时 remainingTotal=0，但 contract 仍来自 paymentPmis.contract
    expect(a.contract).toBe(2_000_000)
    expect(a.remainingTotal).toBe(0)
  })
})

// ---- groupPayBoard 口径收敛 ----

describe('groupPayBoard（单维分桶 + 7 指标，口径收敛后 pendingSum=Σ节点未收，rate=actual/contract）', () => {
  it('全部：组1 pendingSum=ΣremainingTotal；rate=actualSum/contractSum（分母改合同）', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '')
    const g = groupPayBoard(rows, ['dept'])
    const g1 = g.find((x) => x.key === '组1')!
    // A.remainingTotal=500_000，B.remainingTotal=0 → pendingSum=500_000
    expect(g1.pendingSum).toBe(500_000)
    // actualSum = 1_000_000 + 1_000_000 = 2_000_000
    expect(g1.actualSum).toBe(2_000_000)
    // expectedSum = 1_500_000 + 1_000_000 = 2_500_000
    expect(g1.expectedSum).toBe(2_500_000)
    // rate = actual/contract = 2_000_000/3_000_000（分母改为 contractSum）
    expect(g1.rate).toBeCloseTo(2_000_000 / 3_000_000, 6)
    expect(g1.projectCount).toBe(2)
    expect(g1.contractSum).toBe(3_000_000)
    expect(g1.delayedNodeSum).toBe(1)
  })

  it('全部不变式：actualSum=Σ流水；pendingSum=Σ节点未收；rate=actual/contract', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '')
    const all = groupPayBoard(rows, ['dept'])
    const totalActual = all.reduce((s, g) => s + g.actualSum, 0)
    const totalPending = all.reduce((s, g) => s + g.pendingSum, 0)
    // totalActual = 流水总和 = 2_000_000
    expect(totalActual).toBe(2_000_000)
    // totalPending = 节点未收总和 = 500_000
    expect(totalPending).toBe(500_000)
    // 各组 rate = actual/contract（分母改合同总额）
    const g1 = all.find((x) => x.key === '组1')!
    expect(g1.rate).toBeCloseTo(g1.actualSum / g1.contractSum, 6)
  })

  it('组2(C)：contract=0 → rate=null（无计划，防除零）', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '')
    const g = groupPayBoard(rows, ['dept'])
    const g2 = g.find((x) => x.key === '组2')!
    expect(g2.rate).toBeNull()
  })

  it('区间收窄后：B 指标清零，组1 的 pendingSum/rate 含 A+B 合同（合同静态传入）', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '2024-01-01', '2024-04-30')
    const g = groupPayBoard(rows, ['dept'])
    const g1 = g.find((x) => x.key === '组1')!
    // A: actual=1_000_000, expected=1_500_000, remaining=500_000, contract=2_000_000
    // B: 区间内无节点无流水 → actual=0, expected=0, remaining=0; contract=1_000_000(静态)
    expect(g1.actualSum).toBe(1_000_000)
    expect(g1.expectedSum).toBe(1_500_000)
    expect(g1.pendingSum).toBe(500_000)
    // contractSum = A.contract + B.contract = 2_000_000 + 1_000_000 = 3_000_000
    expect(g1.contractSum).toBe(3_000_000)
    // rate = actual/contract = 1_000_000/3_000_000
    expect(g1.rate).toBeCloseTo(1_000_000 / 3_000_000, 6)
  })

  it('默认按项目数降序', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '')
    const g = groupPayBoard(rows, ['dept'])
    expect(g[0].projectCount).toBeGreaterThanOrEqual(g[g.length - 1].projectCount)
  })
})

// ---- 交叉/透视（消费同一 PayBoardRow，结构不变）----

describe('payBoardCross / payBoardPivot', () => {
  it('cross 返回 rows/cols/cells/index', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '')
    const m = payBoardCross(rows, 'dept', 'stage', 'contractSum')
    expect(m.rows.length).toBeGreaterThan(0)
    expect(Array.isArray(m.cells)).toBe(true)
  })
  it('pivot 多行多列；colDims 空退化单列合计', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '')
    const r = payBoardPivot(rows, ['dept'], [], 'projectCount')
    expect(r.cols).toHaveLength(1)
    expect(r.cols[0].label).toBe('合计')
  })
  it('rate 指标空桶单元格为 NaN（展示层显 -）', () => {
    const rows = buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, '', '')
    const m = payBoardCross(rows, 'dept', 'stage', 'rate')
    const hasNaN = m.cells.flat().some((v) => Number.isNaN(v))
    expect(hasNaN).toBe(true)
  })
})

describe('groupPayBoard 标签多值炸开', () => {
  const rows = buildPayBoardRows(
    projects, pmisMap, paymentNodes, paymentRecords, '', '',
    { A: ['BH项目', '框架合同'], B: ['BH项目'] }, // C 无标签
  )
  it('多标签项目计入它每个标签组；无标签项目归「无标签」', () => {
    const g = groupPayBoard(rows, ['tag'])
    const bh = g.find((x) => x.key === 'BH项目')!
    const fw = g.find((x) => x.key === '框架合同')!
    const none = g.find((x) => x.key === '无标签')!
    // A,B 都挂 BH项目
    expect(bh.projectCount).toBe(2)
    // 仅 A 挂框架合同
    expect(fw.projectCount).toBe(1)
    // 仅 C 无标签
    expect(none.projectCount).toBe(1)
  })
  it('组间重复计数：各标签组项目数之和 > 总项目数(3)', () => {
    const g = groupPayBoard(rows, ['tag'])
    const sum = g.reduce((s, x) => s + x.projectCount, 0)
    expect(sum).toBeGreaterThan(3) // 2(BH)+1(框架)+1(无)=4 > 3
  })
  it('非 tag 维零回归：dept 仍每项目一桶(项目数之和=总数3)', () => {
    const g = groupPayBoard(rows, ['dept'])
    const sum = g.reduce((s, x) => s + x.projectCount, 0)
    expect(sum).toBe(3)
  })
  it('交叉含 tag 维：行/列正常返回', () => {
    const m = payBoardCross(rows, 'dept', 'tag', 'projectCount')
    expect(m.rows.length).toBeGreaterThan(0)
    expect(m.cols).toContain('BH项目')
  })
})
