import { describe, it, expect } from 'vitest'
import { buildRiskRows, riskRowMatches } from './riskRows'
import type { ScopeFilter } from './tempScope'

const projects = [
  { projectId: 'P1', projectName: '甲项目', projectManager: '张三', orgL4: '一组',
    paymentPmis: { contract: 2_000_000 } },
  { projectId: 'P2', projectName: '乙项目', projectManager: '李四', orgL4: '二组',
    paymentPmis: { contract: null } },
] as any
const pmis = {
  P1: { status: { 项目级别: 'P1', 项目类型: '实施', 项目状态: '实施中' },
        riskRecords: [
          { 风险编码: 'FX-1', 风险名称: '进度风险', 风险等级: '高', 风险状态: '未关闭', 风险大类: '进度', 风险小类: '排期', 风险描述: '长文本', 项目编号: 'P1' },
          { 风险编码: 'FX-2', 风险名称: '成本风险', 风险等级: '中', 风险状态: '已关闭', 风险大类: '成本', 风险小类: '人力', 项目编号: 'P1' },
        ] },
  P2: { status: {}, riskRecords: [{ 风险编码: 'FX-9', 风险名称: '客户风险', 风险等级: '低', 风险状态: '未关闭', 项目编号: 'P2' }] },
} as any

describe('buildRiskRows', () => {
  it('拍平所有风险(含已关闭) + join 项目列 + 复合键 + 跟进字段', () => {
    const rows = buildRiskRows(projects, pmis, { 'P1::FX-1': { followAction: '推动中', followActionEditTime: '2026-06-29 10:00' } })
    expect(rows.length).toBe(3)
    const r1 = rows.find((r) => r.riskKey === 'P1::FX-1')!
    expect(r1['项目名称']).toBe('甲项目')
    expect(r1['项目经理']).toBe('张三')
    expect(r1['L4组织']).toBe('一组')
    expect(r1['项目级别']).toBe('P1')
    expect(r1['项目金额']).toBe(200)            // 200万
    expect(r1['风险编码']).toBe('FX-1')
    expect(r1.projectId).toBe('P1')
    expect(r1.followAction).toBe('推动中')
    expect(r1.followActionEditTime).toBe('2026-06-29 10:00')
    const r9 = rows.find((r) => r.riskKey === 'P2::FX-9')!
    expect(r9['项目金额']).toBeNull()           // contract null
    expect(r9.followAction ?? '').toBe('')
  })
})

describe('riskRowMatches(单表两级 AND/OR)', () => {
  const rows = buildRiskRows(projects, pmis, {})
  it('空范围 → false(由视图判空回退全量,本函数对空范围返回 false)', () => {
    expect(riskRowMatches(rows[0], { combinator: 'AND', groups: [] })).toBe(false)
  })
  it('按风险等级 in [高] 命中', () => {
    const scope: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [{ field: '风险等级', op: 'in', values: ['高'] }] }] }
    expect(riskRowMatches(rows.find((r) => r.riskKey === 'P1::FX-1')!, scope)).toBe(true)
    expect(riskRowMatches(rows.find((r) => r.riskKey === 'P2::FX-9')!, scope)).toBe(false)
  })
  it('两组 OR:风险状态=未关闭 或 L4组织=二组', () => {
    const scope: ScopeFilter = { combinator: 'OR', groups: [
      { combinator: 'AND', conditions: [{ field: '风险状态', op: 'in', values: ['未关闭'] }] },
      { combinator: 'AND', conditions: [{ field: 'L4组织', op: 'in', values: ['二组'] }] },
    ] }
    expect(riskRowMatches(rows.find((r) => r.riskKey === 'P1::FX-2')!, scope)).toBe(false) // 已关闭 且 一组
    expect(riskRowMatches(rows.find((r) => r.riskKey === 'P2::FX-9')!, scope)).toBe(true)  // 未关闭
  })
})
