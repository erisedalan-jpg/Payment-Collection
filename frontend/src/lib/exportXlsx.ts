import * as XLSX from 'xlsx'

/** 把行数组导出为 xlsx 下载。空数组不动作。 */
export function exportRows(filename: string, rows: Record<string, any>[]): void {
  if (!rows || rows.length === 0) return
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}
