export type DiffAnchor =
  | { kind: 'today' }
  | { kind: 'fixed'; date: string }      // 'YYYY-MM-DD'
  | { kind: 'column'; key: string }

export interface DiffConfig {
  anchor: DiffAnchor
  target: string                          // 指定列的 key
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2})/
const DAY_MS = 86400000

/** 取行上某 key 的日期并规整为 'YYYY-MM-DD';取不到/非日期 → null。 */
export function pickDate(row: Record<string, any>, key: string): string | null {
  const v = row?.[key]
  if (v === null || v === undefined || v === '') return null
  const m = DATE_RE.exec(String(v))
  return m ? m[1] : null
}

/** 'YYYY-MM-DD' → UTC 零点毫秒。按 UTC 解析:两端同基准相减,
 *  避免本地时区/夏令时导致的 off-by-one(V3.0.0 踩过时区 off-by-one)。 */
function utcMs(d: string): number | null {
  const m = DATE_RE.exec(d)
  if (!m) return null
  const t = Date.parse(m[1] + 'T00:00:00Z')
  return Number.isNaN(t) ? null : t
}

/** 本地时区的今天 'YYYY-MM-DD'。不用 toISOString —— 那是 UTC,东八区凌晨会差一天。 */
export function localToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** anchor − target 的自然日天数差;任一端取不到 → null(前端显示 '-')。 */
export function computeDiffDays(
  row: Record<string, any>, cfg: DiffConfig, today: string,
): number | null {
  if (!cfg || !cfg.anchor || !cfg.target) return null
  const targetD = pickDate(row, cfg.target)
  if (!targetD) return null
  let anchorD: string | null
  if (cfg.anchor.kind === 'today') anchorD = today
  else if (cfg.anchor.kind === 'fixed') anchorD = cfg.anchor.date || null
  else anchorD = pickDate(row, cfg.anchor.key)
  if (!anchorD) return null
  const a = utcMs(anchorD)
  const b = utcMs(targetD)
  if (a === null || b === null) return null
  return Math.round((a - b) / DAY_MS)
}
