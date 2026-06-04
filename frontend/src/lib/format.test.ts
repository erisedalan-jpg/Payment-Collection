import { describe, it, expect } from 'vitest'
import { fmt, fmtYuan, fmtWan, pct, pctToNum } from './format'

describe('format', () => {
  it('fmtWan divides by 10000, 2 decimals, null→-', () => {
    expect(fmtWan(12345)).toBe('1.23')
    expect(fmtWan(20710110)).toBe('2,071.01')
    expect(fmtWan(null)).toBe('-')
  })
  it('fmtYuan / fmt', () => {
    expect(fmtYuan(1234.5)).toBe('1,234.5')
    expect(fmt(1234, 1)).toBe('1,234.0')
    expect(fmt(null)).toBe('-')
  })
  it('pct: 0-1→%, ≥1 keeps, integer no decimals else 1', () => {
    expect(pct(0.8)).toBe('80%')
    expect(pct(1.08)).toBe('108%')
    expect(pct(1)).toBe('100%')
    expect(pct(0.805)).toBe('80.5%')
    expect(pct('空值')).toBe('-')
    expect(pct('70%')).toBe('70%')
    expect(pct(null)).toBe('-')
  })
  it('pctToNum: %/bare/decimal → 0-1, 空值/empty→null', () => {
    expect(pctToNum('30%')).toBe(0.3)
    expect(pctToNum('30')).toBe(0.3)
    expect(pctToNum('0.3')).toBe(0.3)
    expect(pctToNum('0%')).toBe(0)
    expect(pctToNum('空值')).toBeNull()
    expect(pctToNum('')).toBeNull()
    expect(pctToNum(null)).toBeNull()
  })
})
