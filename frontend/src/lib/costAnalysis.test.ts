import { describe, it, expect } from 'vitest'
import { isXs, costStatusOf, buildCostRows, costKpis, costL4Dist, costL4Summary } from './costAnalysis'

describe('isXs / costStatusOf', () => {
  it('XS 前缀(大小写不敏感)', () => {
    expect(isXs('XS-001')).toBe(true)
    expect(isXs('xs001')).toBe(true)
    expect(isXs('WS-1')).toBe(false)
  })
  it('三档边界 + XS 强制未超支 + null→未超支', () => {
    expect(costStatusOf(-5000.01, 'WS1')).toBe('超支大于5k')
    expect(costStatusOf(-5000, 'WS1')).toBe('超支不足5k')   // −5000 归不足5k(排他下界)
    expect(costStatusOf(-0.01, 'WS1')).toBe('超支不足5k')
    expect(costStatusOf(0, 'WS1')).toBe('未超支')
    expect(costStatusOf(100, 'WS1')).toBe('未超支')
    expect(costStatusOf(null, 'WS1')).toBe('未超支')
    expect(costStatusOf(-99999, 'XS9')).toBe('未超支')        // XS 强制
  })
})

const projects = [
  { projectId: 'WS1', projectName: '甲', projectManager: '张', orgL4: 'D1', orgL3_1: 'L31' },
  { projectId: 'XS9', projectName: '售前', projectManager: '李', orgL4: 'D2', orgL3_1: '' },
] as any
const pmis = {
  WS1: { status: { 项目类型: '正常实施类' }, team: { L3部门: '交付一部' }, cost: { 总预算: 1000, 核算: 1200, 剩余预算: -6000 } },
  XS9: { status: { 项目类型: '售前服务类' }, team: { L3部门: '交付二部' }, cost: { 剩余预算: -8000 } },
} as any

describe('buildCostRows', () => {
  it('字段映射 + XS 标记 + 状态', () => {
    const rows = buildCostRows(projects, pmis)
    const a = rows.find((r) => r.projectId === 'WS1')!
    expect(a).toMatchObject({ projectName: '甲', projectType: '正常实施类', orgL3: '交付一部', orgL3_1: 'L31', orgL4: 'D1', manager: '张', status: '超支大于5k', totalBudget: 1000, actualCost: 1200, remaining: -6000, xs: false })
    const x = rows.find((r) => r.projectId === 'XS9')!
    expect(x).toMatchObject({ xs: true, status: '未超支' }) // XS 强制未超支
  })
  it('交付剩余字段映射(缺类别/无 deliveryCosts → 0)', () => {
    const projects2 = [
      { projectId: 'W1', projectName: 'a', projectManager: '', orgL4: 'D1', orgL3_1: '', paymentPmis: { contract: 500 },
        deliveryCosts: [{ 类别: '交付部门人工成本', 剩余预算: 30 }, { 类别: '交付外包服务成本', 剩余预算: 70 }] },
      { projectId: 'W2', projectName: 'b', projectManager: '', orgL4: 'D1', orgL3_1: '', paymentPmis: { contract: 200 } },
    ] as any
    const pmis2 = { W1: { cost: { 剩余预算: 5 } }, W2: { cost: { 剩余预算: 9 } } } as any
    const rows = buildCostRows(projects2, pmis2)
    expect(rows[0]).toMatchObject({ amount: 500, remaining: 5, deliveryDeptRemaining: 30, deliveryOutsourceRemaining: 70 })
    expect(rows[1]).toMatchObject({ amount: 200, deliveryDeptRemaining: 0, deliveryOutsourceRemaining: 0 })
  })
})

function cr(o: Partial<any> = {}): any {
  return { projectId: 'W', projectName: 'x', projectType: '', orgL3: '', orgL3_1: '', orgL4: 'D1', manager: '', amount: 0, status: '未超支', totalBudget: 0, actualCost: 0, remaining: 0, xs: false, deliveryDeptRemaining: 0, deliveryOutsourceRemaining: 0, ...o }
}

describe('costKpis / costL4Dist / costL4Summary(均剔 XS)', () => {
  const rows = [
    cr({ orgL4: 'B', status: '未超支' }),
    cr({ orgL4: 'B', status: '超支不足5k' }),
    cr({ orgL4: 'A', status: '超支大于5k' }),
    cr({ orgL4: 'A', status: '超支大于5k' }),
    cr({ orgL4: 'A', status: 'XS忽略', xs: true }), // XS→不计
  ]
  it('KPI 剔 XS 计数', () => {
    expect(costKpis(rows)).toEqual({ total: 4, normal: 1, under5k: 1, over5k: 2 })
  })
  it('L4 分布按 orgL4 升序、两档', () => {
    expect(costL4Dist(rows)).toEqual([
      { orgL4: 'A', under5k: 0, over5k: 2 },
      { orgL4: 'B', under5k: 1, over5k: 0 },
    ])
  })
  it('L4 汇总含占比(大于5k/总数)', () => {
    const s = costL4Summary(rows)
    expect(s.find((x) => x.orgL4 === 'A')).toMatchObject({ total: 2, over5k: 2, over5kRatio: 100 })
    expect(s.find((x) => x.orgL4 === 'B')).toMatchObject({ total: 2, normal: 1, under5k: 1, over5k: 0, over5kRatio: 0 })
  })
  it('L4 汇总四金额列求和(剔 XS)', () => {
    const rows = [
      cr({ orgL4: 'A', amount: 1000, remaining: 100, deliveryDeptRemaining: 10, deliveryOutsourceRemaining: 20 }),
      cr({ orgL4: 'A', amount: 2000, remaining: -50, deliveryDeptRemaining: 5, deliveryOutsourceRemaining: 0 }),
      cr({ orgL4: 'A', amount: 9999, xs: true }),
    ]
    const a = costL4Summary(rows).find((x) => x.orgL4 === 'A')!
    expect(a).toMatchObject({ contractTotal: 3000, remainingTotal: 50, deliveryDeptRemaining: 15, deliveryOutsourceRemaining: 20 })
  })
})
