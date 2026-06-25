import { describe, it, expect } from 'vitest'
import { projectMatches, opsForKind, FIELD_CATALOG, type ScopeFilter, type ScopeProjectInput } from './tempScope'

const inp = (over: Partial<ScopeProjectInput>): ScopeProjectInput => ({
  id: 'P', proj: {}, nodes: [], milestones: [], ...over,
})

describe('opsForKind', () => {
  it('按 kind 给运算符', () => {
    expect(opsForKind('enum')).toEqual(['in', 'notIn'])
    expect(opsForKind('text')).toEqual(['contains', 'notContains'])
    expect(opsForKind('number')).toEqual(['between', 'notBetween'])
    expect(opsForKind('date')).toEqual(['between', 'notBetween'])
  })
})

describe('FIELD_CATALOG', () => {
  it('含三组且键唯一(组内)', () => {
    const groups = new Set(FIELD_CATALOG.map((f) => f.group))
    expect(groups).toEqual(new Set(['project', 'paymentNode', 'milestone']))
    const projKeys = FIELD_CATALOG.filter((f) => f.group === 'project').map((f) => f.key)
    expect(new Set(projKeys).size).toBe(projKeys.length)
    expect(projKeys).toContain('orgL4')
    expect(projKeys).toContain('contractWan')
  })
})

describe('projectMatches', () => {
  const scope = (s: Partial<ScopeFilter>): ScopeFilter => ({ combinator: 'AND', groups: [], ...s })

  it('空范围 → 命中为空(false)', () => {
    expect(projectMatches(inp({ proj: { orgL4: '小金融服务组' } }), scope({}))).toBe(false)
  })

  it('project enum in / notIn', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'orgL4', op: 'in', values: ['小金融服务组'] }] }] })
    expect(projectMatches(inp({ proj: { orgL4: '小金融服务组' } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组' } }), f)).toBe(false)
    const fn = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'orgL4', op: 'notIn', values: ['小金融服务组'] }] }] })
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组' } }), fn)).toBe(true)
  })

  it('project number between (含端点) / notBetween', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'contractWan', op: 'between', min: 100, max: 500 }] }] })
    expect(projectMatches(inp({ proj: { contractWan: 100 } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { contractWan: 500 } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { contractWan: 80 } }), f)).toBe(false)
    expect(projectMatches(inp({ proj: { contractWan: null } }), f)).toBe(false)
  })

  it('date between 取前10位字典序', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'finalAcceptDate', op: 'between', min: '2026-01-01', max: '2026-12-31' }] }] })
    expect(projectMatches(inp({ proj: { finalAcceptDate: '2026-06-30' } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { finalAcceptDate: '2027-01-01' } }), f)).toBe(false)
  })

  it('tags 多值: 任一 ∈ values 命中', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'tags', op: 'in', values: ['重点'] }] }] })
    expect(projectMatches(inp({ proj: { tags: ['普通', '重点'] } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { tags: ['普通'] } }), f)).toBe(false)
  })

  it('子表存在性: 任一节点满足', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'paymentNode', field: 'status', op: 'in', values: ['延期'] }] }] })
    expect(projectMatches(inp({ nodes: [{ status: '正常' }, { status: '延期' }] }), f)).toBe(true)
    expect(projectMatches(inp({ nodes: [{ status: '正常' }] }), f)).toBe(false)
    expect(projectMatches(inp({ nodes: [] }), f)).toBe(false)
  })

  it('text contains / notContains(里程碑名称)', () => {
    const f = scope({ groups: [{ combinator: 'AND', conditions: [
      { group: 'milestone', field: 'name', op: 'contains', values: ['验收'] }] }] })
    expect(projectMatches(inp({ milestones: [{ name: '初验收节点' }] }), f)).toBe(true)
    expect(projectMatches(inp({ milestones: [{ name: '启动' }] }), f)).toBe(false)
  })

  it('两级 AND/OR: (A AND B) OR (C)', () => {
    const f: ScopeFilter = { combinator: 'OR', groups: [
      { combinator: 'AND', conditions: [
        { group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] },
        { group: 'project', field: 'top1000', op: 'in', values: ['是'] }] },
      { combinator: 'AND', conditions: [
        { group: 'project', field: 'health', op: 'in', values: ['风险'] }] },
    ] }
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组', top1000: '是', health: '健康' } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组', top1000: '否', health: '风险' } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { orgL4: '银行服务组', top1000: '否', health: '健康' } }), f)).toBe(false)
  })

  it('空组求值为 false(不命中全部)', () => {
    const f: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] }
    expect(projectMatches(inp({ proj: { orgL4: 'X' } }), f)).toBe(false)
  })
})
