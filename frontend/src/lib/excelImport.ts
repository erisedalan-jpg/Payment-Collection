/** 离线导入必需的 Sheet 页（V5.9：所有层级合并到一张表）。忠实移植 REQUIRED_SHEET_NAMES。 */
export const REQUIRED_SHEETS = ['项目回款节点（里程碑）清单']

/** 扩展名校验：仅 .xlsx / .xls。 */
export function validateExt(filename: string): boolean {
  const ext = (filename.split('.').pop() || '').toLowerCase()
  return ext === 'xlsx' || ext === 'xls'
}

/** 缺失的必需 Sheet 名列表。 */
export function missingSheets(sheetNames: string[]): string[] {
  return REQUIRED_SHEETS.filter((n) => !sheetNames.includes(n))
}

/** 二维数组单元格转字符串（null/undefined→''），与 fetch_yundocs_full.py 输出格式一致。 */
export function toStringMatrix(rows: any[][]): string[][] {
  return rows.map((row) => row.map((cell) => (cell !== null && cell !== undefined ? String(cell) : '')))
}
