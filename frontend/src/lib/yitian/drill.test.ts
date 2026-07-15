import { describe, it, expect } from 'vitest'
import { buildDrillQuery, parseDrillQuery } from './drill'

describe('drill query 编解码', () => {
  it('build 只输出非空字段', () => {
    expect(buildDrillQuery({ l4: '银行组' })).toEqual({ dL4: '银行组' })
    expect(buildDrillQuery({ start: '2026-01-01', end: '2026-01-31' })).toEqual({ dStart: '2026-01-01', dEnd: '2026-01-31' })
    expect(buildDrillQuery({ scroll: 'neverfilled' })).toEqual({ dScroll: 'neverfilled' })
    expect(buildDrillQuery({})).toEqual({})
  })
  it('parse 往返一致', () => {
    const d = { l4: '银行组', start: '2026-01-01', end: '2026-01-31' }
    expect(parseDrillQuery(buildDrillQuery(d))).toEqual(d)
  })
  it('parse 忽略非法 scroll', () => {
    expect(parseDrillQuery({ dScroll: 'bogus' })).toEqual({})
    expect(parseDrillQuery({ dScroll: 'diverging' })).toEqual({ scroll: 'diverging' })
  })
  it('parse 数组 query 取首项、空对象得空', () => {
    expect(parseDrillQuery({ dL4: ['银行组', 'x'] })).toEqual({ l4: '银行组' })
    expect(parseDrillQuery({})).toEqual({})
  })
})
