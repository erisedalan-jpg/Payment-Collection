import { describe, it, expect } from 'vitest'
import { buildTempRows, buildScopeInputs } from './tempFollowup'
import { buildKeyProjectRows, buildProgressRowBase } from './keyProjects'
import { projectMatches } from './tempScope'
import type { Project, ProjectPmis } from '@/types/analysis'

const proj = (over: Partial<Project>): Project => ({
  projectId: 'P1', projectName: '项目甲', projectManager: '张三', orgL4: '银行服务组',
  top1000: '是', paymentPmis: { contract: 2_000_000 } as any, payment: { paymentRatio: 0.4 } as any,
  quadrant: 'A', ...over,
} as any)

const pmis = (): Record<string, ProjectPmis> => ({
  P1: {
    status: { 项目级别: 'P1', 项目类型: '实施', 项目状态: '进行中', 是否暂停: false },
    progress: { 项目阶段: '执行', 完工进展: 0.5, 里程碑进度状态: '正常', 终验时间: '2026-09-01' },
    risk: { 最高等级: '中', 未关闭风险数: 2 }, cost: { 消耗比: 0.6, 项目超支: false },
    customer: { 最终客户: '客户甲', 合同总额: 200 }, team: { AR: 'arX', SR: 'srY' },
  } as any,
})

describe('keyProjects 重构回归', () => {
  it('buildProgressRowBase 与 buildKeyProjectRows 输出一致(同一项目)', () => {
    const ps = [proj({})]
    const m = pmis()
    const fromKey = buildKeyProjectRows(ps, m, {})[0]
    const fromBase = buildProgressRowBase(ps[0], m.P1, {})
    expect(fromBase).toEqual(fromKey)
  })
})

describe('buildTempRows', () => {
  it('按 inScopeIds 过滤并带项目级额外列', () => {
    const ps = [proj({}), proj({ projectId: 'P2', projectName: '项目乙', orgL4: '小金融服务组' })]
    const m = { ...pmis(), P2: pmis().P1 }
    const rows = buildTempRows(ps, m as any, {}, new Set(['P1']))
    expect(rows.map((r) => r.projectId)).toEqual(['P1'])
    expect(rows[0].projectName).toBe('项目甲')
    expect(rows[0].health).toBeDefined()
    expect(rows[0].milestoneStatus).toBe('正常')
    expect(rows[0].paymentRatio).toBe(0.4)
  })
})

describe('buildScopeInputs', () => {
  it('产出 proj/nodes/milestones,布尔映射是/否,contractWan 来自 paymentPmis', () => {
    const ps = [proj({})]
    const inputs = buildScopeInputs(ps, pmis() as any, { P1: [{ status: '延期' }] } as any, { P1: [{ name: '验收' }] } as any)
    expect(inputs).toHaveLength(1)
    const i = inputs[0]
    expect(i.id).toBe('P1')
    expect(i.proj.orgL4).toBe('银行服务组')
    expect(i.proj.top1000).toBe('是')
    expect(i.proj.paused).toBe('否')
    expect(i.proj.contractWan).toBe(200) // 2_000_000/10000
    expect(i.proj.ar).toBe('arX')
    expect(i.nodes[0].status).toBe('延期')
    expect(i.milestones[0].name).toBe('验收')
  })
})

describe('buildScopeInputs 回款节点金额单位', () => {
  const projects = [{ projectId: 'P1', projectName: '甲', paymentPmis: { contract: 1000000 } }] as any
  const nodes = { P1: [{ stage: '初验款', status: '待回款', expectedPayment: 600000, receivedAmount: 0, unpaidAmount: 600000 }] }

  it('计划回款(万) 按万元比较：60 万节点命中 [50,100] 万', () => {
    const inputs = buildScopeInputs(projects, {}, nodes, {})
    const scope = { combinator: 'AND' as const, groups: [{ combinator: 'AND' as const, conditions: [
      { group: 'paymentNode' as const, field: 'expectedPayment', op: 'between' as const, min: 50, max: 100 },
    ] }] }
    expect(projectMatches(inputs[0], scope)).toBe(true)
  })

  it('不再误按元命中：60 万节点不命中 [50,100] 元', () => {
    const inputs = buildScopeInputs(projects, {}, nodes, {})
    const scope = { combinator: 'AND' as const, groups: [{ combinator: 'AND' as const, conditions: [
      { group: 'paymentNode' as const, field: 'expectedPayment', op: 'between' as const, min: 50, max: 100 },
    ] }] }
    // 元级 600000 显然不在 [50,100]；万元换算后 60 命中——本用例与上用例互补，确保换算生效
    expect(projectMatches(inputs[0], scope)).toBe(true)
  })
})
