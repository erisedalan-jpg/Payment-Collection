import { describe, it, expect } from 'vitest'
import { formatCellValue, isDateKey, excelDate } from './cellFormat'

describe('isDateKey', () => {
  it('matches date-ish keys', () => {
    expect(isDateKey('planDate')).toBe(true)
    expect(isDateKey('该节点计划完成时间')).toBe(true)
    expect(isDateKey('projectName')).toBe(false)
  })
})

describe('excelDate', () => {
  it('converts excel serial in range to YYYY-MM-DD', () => {
    expect(excelDate(43831)).toBe('2020-01-01')
  })
  it('returns null for out-of-range / non-serial', () => {
    expect(excelDate(100)).toBeNull()
    expect(excelDate('abc')).toBeNull()
  })
})

describe('formatCellValue', () => {
  it('empty → -', () => {
    expect(formatCellValue('', 'projectName')).toBe('-')
    expect(formatCellValue(null, 'x')).toBe('-')
  })
  it('amounts → fmtYuan', () => {
    expect(formatCellValue(1234.5, 'expectedPayment')).toBe('1,234.5')
  })
  it('ratio keys → pct', () => {
    expect(formatCellValue(0.8, 'actualPaymentRatio')).toBe('80%')
    expect(formatCellValue('70%', 'planPaymentRatio')).toBe('70%')
  })
  it('boolean-ish keys → 是/否', () => {
    expect(formatCellValue('是', 'isPaymentRelated')).toBe('是')
    expect(formatCellValue('', 'isPaymentRelated')).toBe('-')
    expect(formatCellValue('否', 'canAdvance')).toBe('否')
  })
  it('纳管 → 是/否/-', () => {
    expect(formatCellValue('否', '纳管')).toBe('否')
    expect(formatCellValue('是', '纳管')).toBe('是')
  })
  it('delayDays → N天', () => {
    expect(formatCellValue(5, 'delayDays')).toBe('5天')
  })
  it('nodeStatus → plain label', () => {
    expect(formatCellValue('延期', 'nodeStatus')).toBe('延期')
  })
  it('plain text collapses newlines', () => {
    expect(formatCellValue('a\nb', 'remarks')).toBe('a b')
  })
})
