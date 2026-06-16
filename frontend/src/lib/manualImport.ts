import * as XLSX from 'xlsx'
import { toStringMatrix } from './excelImport'

export interface ParsedWb { SheetNames: string[]; sheetRows: (name: string) => any[][] }

const MANUAL_SHEETS = ['项目标签', '跟进记录'] as const

/** 读 xlsx ArrayBuffer → workbook（复用 useExcelImport 同款 SheetJS 读法）。 */
export function readWorkbook(buf: ArrayBuffer): ParsedWb {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  return {
    SheetNames: wb.SheetNames,
    sheetRows: (name: string) =>
      XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }) as any[][],
  }
}

/** 只抽 项目标签/跟进记录 两 sheet 为字符串矩阵（含表头行），其它忽略。 */
export function parseManualSheets(wb: ParsedWb): Record<string, string[][]> {
  const out: Record<string, string[][]> = {}
  for (const name of MANUAL_SHEETS) {
    if (wb.SheetNames.includes(name)) out[name] = toStringMatrix(wb.sheetRows(name))
  }
  return out
}
