import { describe, it, expect } from 'vitest'
import { pickDate, computeDiffDays, localToday, type DiffConfig } from './diffColumn'

const ROW = { setupDate: '2026-01-01', nextRevDate: '2026-01-31 08:30:00', 立项日期: '2026-03-01', empty: '', bad: '不是日期' }

describe('pickDate', () => {
  it('取前 10 位;支持中文 key;空/坏值 → null', () => {
    expect(pickDate(ROW, 'setupDate')).toBe('2026-01-01')
    expect(pickDate(ROW, 'nextRevDate')).toBe('2026-01-31')   // 带时间也只取日期
    expect(pickDate(ROW, '立项日期')).toBe('2026-03-01')
    expect(pickDate(ROW, 'empty')).toBeNull()
    expect(pickDate(ROW, 'bad')).toBeNull()
    expect(pickDate(ROW, '不存在的列')).toBeNull()
  })
})

describe('computeDiffDays', () => {
  const cfg = (c: Partial<DiffConfig>): DiffConfig =>
    ({ anchor: { kind: 'today' }, target: 'setupDate', ...c }) as DiffConfig

  it('anchor=today', () => {
    expect(computeDiffDays(ROW, cfg({}), '2026-01-11')).toBe(10)
  })
  it('anchor=fixed', () => {
    expect(computeDiffDays(ROW, cfg({ anchor: { kind: 'fixed', date: '2026-02-01' } }), '2026-01-11')).toBe(31)
  })
  it('anchor=column', () => {
    expect(computeDiffDays(ROW, cfg({ anchor: { kind: 'column', key: 'nextRevDate' } }), '2026-01-11')).toBe(30)
  })
  it('anchor 早于 target → 负数', () => {
    expect(computeDiffDays(ROW, cfg({ target: '立项日期' }), '2026-01-11')).toBe(-49)
  })
  it('target 空/坏/不存在 → null', () => {
    for (const t of ['empty', 'bad', '不存在的列']) {
      expect(computeDiffDays(ROW, cfg({ target: t }), '2026-01-11')).toBeNull()
    }
  })
  it('anchor=column 但该列取不到 → null', () => {
    expect(computeDiffDays(ROW, cfg({ anchor: { kind: 'column', key: 'bad' } }), '2026-01-11')).toBeNull()
  })
  it('跨夏令时/跨年仍为整数天(按 UTC 零点相减)', () => {
    expect(computeDiffDays({ d: '2025-12-31' }, { anchor: { kind: 'today' }, target: 'd' }, '2026-01-01')).toBe(1)
    expect(computeDiffDays({ d: '2026-03-01' }, { anchor: { kind: 'today' }, target: 'd' }, '2026-11-01')).toBe(245)
  })
})

describe('localToday', () => {
  it('取本地日期,不用 toISOString(那是 UTC,东八区凌晨会差一天)', () => {
    expect(localToday(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01')
    expect(localToday(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})
