import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}))

import * as XLSX from 'xlsx'
import { exportRows } from './exportXlsx'

describe('exportRows', () => {
  beforeEach(() => vi.clearAllMocks())
  it('builds a sheet and writes a file', () => {
    exportRows('未匹配.xlsx', [{ a: 1 }])
    expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith([{ a: 1 }])
    expect(XLSX.writeFile).toHaveBeenCalled()
  })
  it('no-ops on empty rows', () => {
    exportRows('x.xlsx', [])
    expect(XLSX.writeFile).not.toHaveBeenCalled()
  })
})
