import { describe, it, expect } from 'vitest'
import { leafMatch, opsForKind, OPS_BY_KIND, OP_LABEL } from './scopeOps'

describe('opsForKind', () => {
  it('按 kind 给运算符', () => {
    expect(opsForKind('enum')).toEqual(['in', 'notIn'])
    expect(opsForKind('text')).toEqual(['contains', 'notContains'])
    expect(opsForKind('number')).toEqual(['between', 'notBetween'])
    expect(opsForKind('date')).toEqual(['between', 'notBetween'])
    expect(OPS_BY_KIND['date']).toEqual(['between', 'notBetween'])
    expect(OP_LABEL['notIn']).toBe('不属于')
  })
})

describe('leafMatch', () => {
  it('in / notIn(标量与数组)', () => {
    expect(leafMatch('A', { op: 'in', values: ['A', 'B'] })).toBe(true)
    expect(leafMatch('C', { op: 'in', values: ['A'] })).toBe(false)
    expect(leafMatch('C', { op: 'notIn', values: ['A'] })).toBe(true)
    expect(leafMatch(['x', 'y'], { op: 'in', values: ['y'] })).toBe(true)
  })
  it('number between 含端点 / 空值不命中', () => {
    expect(leafMatch(100, { op: 'between', min: 100, max: 500 })).toBe(true)
    expect(leafMatch(80, { op: 'between', min: 100, max: 500 })).toBe(false)
    expect(leafMatch(null, { op: 'between', min: 100, max: 500 })).toBe(false)
  })
  it('date between 取前10位字典序', () => {
    expect(leafMatch('2026-06-30', { op: 'between', min: '2026-01-01', max: '2026-12-31' })).toBe(true)
    expect(leafMatch('2027-01-01', { op: 'between', min: '2026-01-01', max: '2026-12-31' })).toBe(false)
  })
  it('contains / notContains', () => {
    expect(leafMatch('初验收节点', { op: 'contains', values: ['验收'] })).toBe(true)
    expect(leafMatch('启动', { op: 'contains', values: ['验收'] })).toBe(false)
    expect(leafMatch('启动', { op: 'notContains', values: ['验收'] })).toBe(true)
  })
})
