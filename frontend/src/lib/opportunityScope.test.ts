import { describe, it, expect } from 'vitest'
import { OPP_SCOPE_CATALOG, opportunityMatches, DEFAULT_OPP_SCOPE } from './opportunityScope'
import type { ScopeFilter } from './tempScope'

const row = (o: Record<string, any>) => ({
  top1000: '非TOP1000', earlyIntervene: '否', keyOpp: '否', status: '意向沟通',
  amountWan: 100, ...o,
})

describe('OPP_SCOPE_CATALOG', () => {
  it('从 OPP_COLUMNS 派生,含 opportunityLevel(enum),金额为 number', () => {
    const m = new Map(OPP_SCOPE_CATALOG.map((f) => [f.key, f.kind]))
    expect(m.get('opportunityLevel')).toBe('enum')
    expect(m.get('amountWan')).toBe('number')
    expect(m.get('expectedDate')).toBe('date')
    expect(m.get('customer')).toBe('text')
    expect(m.get('majorPoc')).toBe('enum')
    expect(OPP_SCOPE_CATALOG.length).toBe(27)
  })
})

describe('DEFAULT_OPP_SCOPE', () => {
  it('= TOP1000 & 提前介入 & 重点商机 & 状态非赢单', () => {
    const conds = DEFAULT_OPP_SCOPE.groups[0].conditions
    expect(DEFAULT_OPP_SCOPE.combinator).toBe('AND')
    expect(conds).toHaveLength(4)
    expect(conds.map((c) => [c.field, c.op])).toEqual([
      ['top1000', 'in'], ['earlyIntervene', 'in'], ['keyOpp', 'in'], ['status', 'notIn'],
    ])
  })
  it('默认范围只命中四条件齐备且状态非赢单的商机', () => {
    const hit = row({ top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '招投标' })
    const missEarly = row({ top1000: 'TOP1000', earlyIntervene: '否', keyOpp: '是', status: '招投标' })
    const won = row({ top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '赢单' })
    expect(opportunityMatches(hit, DEFAULT_OPP_SCOPE)).toBe(true)
    expect(opportunityMatches(missEarly, DEFAULT_OPP_SCOPE)).toBe(false)
    expect(opportunityMatches(won, DEFAULT_OPP_SCOPE)).toBe(false)
  })
})

describe('opportunityMatches', () => {
  const scope = (s: Partial<ScopeFilter>): ScopeFilter => ({ combinator: 'AND', groups: [], ...s })
  it('空范围 → false', () => {
    expect(opportunityMatches(row({}), scope({}))).toBe(false)
  })
  it('number between 与 两级 OR', () => {
    const f: ScopeFilter = { combinator: 'OR', groups: [
      { combinator: 'AND', conditions: [{ field: 'amountWan', op: 'between', min: 150, max: 300 }] },
      { combinator: 'AND', conditions: [{ field: 'opportunityLevel', op: 'in', values: ['P1'] }] },
    ] }
    expect(opportunityMatches(row({ amountWan: 200 }), f)).toBe(true)
    expect(opportunityMatches(row({ amountWan: 100, opportunityLevel: 'P1' }), f)).toBe(true)
    expect(opportunityMatches(row({ amountWan: 100, opportunityLevel: 'P3' }), f)).toBe(false)
  })
})
