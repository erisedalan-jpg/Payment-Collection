import * as XLSX from 'xlsx'

export interface ParsedWb { SheetNames: string[]; sheetRows: (name: string) => any[][] }

const MANUAL_SHEETS = ['项目标签', '跟进记录'] as const

/** 二维数组单元格转字符串（null/undefined→''）。 */
function toStringMatrix(rows: any[][]): string[][] {
  return rows.map((row) => row.map((cell) => (cell !== null && cell !== undefined ? String(cell) : '')))
}

/** 读 xlsx ArrayBuffer → workbook。 */
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
