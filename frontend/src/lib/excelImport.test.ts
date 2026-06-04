import { describe, it, expect } from 'vitest'
import { validateExt, REQUIRED_SHEETS, missingSheets, toStringMatrix } from './excelImport'

describe('validateExt', () => {
  it('仅 xlsx/xls', () => {
    expect(validateExt('a.xlsx')).toBe(true)
    expect(validateExt('a.XLS')).toBe(true)
    expect(validateExt('a.csv')).toBe(false)
    expect(validateExt('noext')).toBe(false)
  })
})

describe('missingSheets', () => {
  it('缺必需 Sheet 返回缺失项', () => {
    expect(missingSheets(['其他'])).toEqual(REQUIRED_SHEETS)
    expect(missingSheets(['项目回款节点（里程碑）清单', '其他'])).toEqual([])
  })
})

describe('toStringMatrix', () => {
  it('单元格转字符串，null/undefined→空串', () => {
    expect(toStringMatrix([[1, null, 'x'], [undefined, 0]])).toEqual([['1', '', 'x'], ['', '0']])
  })
})
