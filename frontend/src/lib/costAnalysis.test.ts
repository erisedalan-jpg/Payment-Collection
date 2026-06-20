import { describe, it, expect } from 'vitest'
import { isXs, costStatusOf, buildCostRows } from './costAnalysis'

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
})
