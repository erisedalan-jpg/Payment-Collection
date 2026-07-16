import { describe, it, expect } from 'vitest'
import { buildRiskRows, riskRowMatches, RISK_SCOPE_CATALOG } from './riskRows'
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

describe('buildRiskRows 客户列', () => {
  it('风险行客户列读 Project.customer(单一来源)', () => {
    const projects = [
      { projectId: 'A', projectName: '甲', customer: 'A已算客户', paymentPmis: { contract: 0 } },
      { projectId: 'B', projectName: '乙', customer: '', paymentPmis: { contract: 0 } },
    ] as any
    const pmis = {
      A: { status: {}, riskRecords: [{ 风险编码: 'X1', 风险状态: '未关闭' }] },
      B: { status: {}, riskRecords: [{ 风险编码: 'X2', 风险状态: '未关闭' }] },
    } as any
    const rows = buildRiskRows(projects, pmis, {})
    expect(rows.find((r) => r.riskKey === 'A::X1')!['客户']).toBe('A已算客户')
    expect(rows.find((r) => r.riskKey === 'B::X2')!['客户']).toBe('')
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

describe('buildRiskRows — 项目级 scope 字段(补齐 /projects 列)', () => {
  const projects = [
    { projectId: 'P1', projectName: '甲', orgL4: '一组', paymentPmis: { contract: 2_000_000 },
      payment: { relatedNodeCount: 1, delayedCount: 0, remainingTotal: 0, actualTotal: 100, paymentRatio: 0.5 },
      health: { overall: '关注' }, top1000: '是', quadrant: 'Q1', overspendAmount: 8000 },
  ] as any
  const pmis = { P1: {
    status: { 项目级别: 'P1', 项目类型: '实施', 项目状态: '实施中' },
    progress: { 项目阶段: '交付', 完工进展: 0.6 },
    risk: { 最高等级: '高', 未关闭风险数: 3 },
    cost: { 消耗比: 0.9 },
    riskRecords: [{ 风险编码: 'FX-1', 风险状态: '未关闭', 项目编号: 'P1' }],
  } } as any

  it('风险行挂项目级字段(取自 ProjectRow)', () => {
    const r = buildRiskRows(projects, pmis, {})[0]
    expect(r['项目阶段']).toBe('交付')
    expect(r['完工进展']).toBe(0.6)
    expect(r['项目最高风险等级']).toBe('高')
    expect(r['未关闭风险数']).toBe(3)
    expect(r['预算消耗比']).toBe(0.9)
    expect(r['回款完成率']).toBe(0.5)
    expect(r['健康度']).toBe('关注')
    expect(r['TOP1000']).toBe('是')
    expect(r['象限']).toBe('Q1')
    expect(Array.isArray(r['关注原因'])).toBe(true)
    expect(r['关注原因']).toContain('总成本超支大于5000') // overspendAmount 8000 > 5000
  })

  it('RISK_SCOPE_CATALOG 含新增 11 个项目级字段', () => {
    const keys = RISK_SCOPE_CATALOG.map((f) => f.key)
    for (const k of ['项目阶段', '完工进展', '项目最高风险等级', '未关闭风险数', '预算消耗比',
      '回款完成率', '健康度', '关注原因', '回款状态', 'TOP1000', '象限']) {
      expect(keys).toContain(k)
    }
  })

  it('riskRowMatches 新字段:关注原因(数组enum) / 完工进展(number区间)', () => {
    const r = buildRiskRows(projects, pmis, {})[0]
    const catScope: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND',
      conditions: [{ field: '关注原因', op: 'in', values: ['总成本超支大于5000'] }] }] }
    expect(riskRowMatches(r, catScope)).toBe(true)
    const numScope: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND',
      conditions: [{ field: '完工进展', op: 'between', min: 0.5, max: 0.7 }] }] }
    expect(riskRowMatches(r, numScope)).toBe(true)
  })
})

describe('buildRiskRows 立项日期 + scope date', () => {
  const ps = [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: '一组', paymentPmis: { contract: 2_000_000 } }] as any
  const mk = (立项日期?: string) => ({
    P1: { status: { 项目级别: 'P1', ...(立项日期 ? { 立项日期 } : {}) },
          riskRecords: [{ 风险编码: 'FX-1', 风险名称: 'x', 风险等级: '高', 风险状态: '未关闭', 项目编号: 'P1' }] },
  }) as any
  it('行含 立项日期(取自项目域 setupDate)', () => {
    expect(buildRiskRows(ps, mk('2019-06-24'), {})[0]['立项日期']).toBe('2019-06-24')
    expect(buildRiskRows(ps, mk(), {})[0]['立项日期']).toBeNull()
  })
  it('RISK_SCOPE_CATALOG 含 立项日期(date) + riskRowMatches between', () => {
    expect(RISK_SCOPE_CATALOG.find((f) => f.key === '立项日期')?.kind).toBe('date')
    const row = buildRiskRows(ps, mk('2019-06-24'), {})[0]
    const scope: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND',
      conditions: [{ field: '立项日期', op: 'between', min: '2019-01-01', max: '2019-12-31' } as any] }] }
    expect(riskRowMatches(row, scope)).toBe(true)
  })
})
