import * as XLSX from 'xlsx'

/** 把行数组导出为 xlsx 下载。空数组不动作。 */
export function exportRows(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows || rows.length === 0) return
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}

/** 多 sheet 导出。sheets 空或全空不动作。 */
export function exportSheets(filename: string, sheets: { name: string; rows: Record<string, unknown>[] }[]): void {
  const valid = sheets.filter((s) => s.rows && s.rows.length)
  if (!valid.length) return
  const wb = XLSX.utils.book_new()
  for (const s of valid) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, filename)
}
