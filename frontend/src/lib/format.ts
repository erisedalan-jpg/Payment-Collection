// 格式化工具（忠实移植 app.js fmt/fmtYuan/fmtWan/pct/pctToNum）
export function fmt(n: number | null | undefined, d = 1): string {
  return n != null ? Number(n).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '-'
}

export function fmtYuan(n: number | null | undefined): string {
  return n != null ? Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '-'
}

/** 元 → 万元（除以 10000），最多 2 位小数 */
export function fmtWan(yuan: number | null | undefined): string {
  return yuan != null ? Number(yuan / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 2 }) : '-'
}

/** 0~1 小数 → 百分数；≥1 原样×100；整数不留小数，否则保留 1 位；空值/'空值'/'' → '-'；已含 % 原样 */
export function pct(n: unknown): string {
  if (n === null || n === undefined || n === '空值' || n === '') return '-'
  if (typeof n === 'string' && n.includes('%')) return n
  const num = typeof n === 'number' ? n : parseFloat(String(n))
  if (isNaN(num)) return '-'
  const pctVal = num * 100
  if (pctVal === Math.round(pctVal)) return Math.round(pctVal) + '%'
  return pctVal.toFixed(1) + '%'
}

/** 百分比/裸数 → 0~1 小数；'空值'/''/null → null。"30%"→0.3, "30"→0.3, "0.3"→0.3 */
export function pctToNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (v === '空值') return null
  const s = String(v).trim()
  if (s === '') return null
  const m = s.match(/([\d.]+)\s*%?/)
  if (!m) return null
  const num = parseFloat(m[1])
  if (isNaN(num)) return null
  if (s.includes('%') || num > 1) return num / 100
  return num
}
