import { describe, it, expect } from 'vitest'
import { daysInRange, workdayCount, weekKeyOf, weekBuckets, dataRange } from './calendar'
import type { YitianDay } from '@/types/yitian'

// 2026-06-01(周一) ~ 2026-06-07(周日);6/3 设为法定假(workday=false)
const DAYS: YitianDay[] = [
  { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  { d: '2026-06-03', workday: false, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  { d: '2026-06-04', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  { d: '2026-06-05', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
  { d: '2026-06-06', workday: false, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
  { d: '2026-06-07', workday: false, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
]

describe('daysInRange', () => {
  it('闭区间过滤', () => {
    expect(daysInRange(DAYS, '2026-06-02', '2026-06-04').map((d) => d.d))
      .toEqual(['2026-06-02', '2026-06-03', '2026-06-04'])
  })
  it('空区间视为全时', () => {
    expect(daysInRange(DAYS, '', '')).toHaveLength(7)
  })
})

describe('workdayCount', () => {
  it('只数 workday=true', () => {
    expect(workdayCount(DAYS, '2026-06-01', '2026-06-07')).toBe(4)
  })
  it('法定假不计入', () => {
    expect(workdayCount(DAYS, '2026-06-03', '2026-06-03')).toBe(0)
  })
})

describe('weekKeyOf / weekBuckets', () => {
  it('iso 与 calc 取不同字段', () => {
    expect(weekKeyOf(DAYS[4], 'iso')).toBe('2026-W23')
    expect(weekKeyOf(DAYS[4], 'calc')).toBe('2026-CW24')
  })
  it('iso 口径全周一桶', () => {
    const b = weekBuckets(DAYS, '2026-06-01', '2026-06-07', 'iso')
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ key: '2026-W23', workdays: 4, start: '2026-06-01', end: '2026-06-07' })
  })
  it('calc 口径周五切桶', () => {
    const b = weekBuckets(DAYS, '2026-06-01', '2026-06-07', 'calc')
    expect(b.map((x) => x.key)).toEqual(['2026-CW23', '2026-CW24'])
    expect(b[0].workdays).toBe(3)   // 6/1,6/2,6/4
    expect(b[1].workdays).toBe(1)   // 6/5
  })
  it('两种口径工作日总数一致(切法不同不改变总量)', () => {
    const sum = (m: 'iso' | 'calc') =>
      weekBuckets(DAYS, '2026-06-01', '2026-06-07', m).reduce((s, b) => s + b.workdays, 0)
    expect(sum('iso')).toBe(sum('calc'))
  })
})

describe('dataRange', () => {
  it('数据跨度', () => {
    expect(dataRange(DAYS)).toEqual({ start: '2026-06-01', end: '2026-06-07' })
  })
  it('空数据跨度为空串', () => {
    expect(dataRange([])).toEqual({ start: '', end: '' })
  })
})
