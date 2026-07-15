export interface DrillQuery {
  l4?: string
  start?: string
  end?: string
  scroll?: 'neverfilled' | 'diverging'
}

const SCROLL_OK = new Set(['neverfilled', 'diverging'])

/** 源页编码：空字段不输出。 */
export function buildDrillQuery(d: DrillQuery): Record<string, string> {
  const q: Record<string, string> = {}
  if (d.l4) q.dL4 = d.l4
  if (d.start) q.dStart = d.start
  if (d.end) q.dEnd = d.end
  if (d.scroll) q.dScroll = d.scroll
  return q
}

function firstStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v) return v
  if (Array.isArray(v)) return firstStr(v[0])
  return undefined
}

/** 目标页解码：非法 scroll 忽略；数组 query 取首项。 */
export function parseDrillQuery(q: Record<string, any>): DrillQuery {
  const out: DrillQuery = {}
  const l4 = firstStr(q.dL4); if (l4) out.l4 = l4
  const start = firstStr(q.dStart); if (start) out.start = start
  const end = firstStr(q.dEnd); if (end) out.end = end
  const scroll = firstStr(q.dScroll); if (scroll && SCROLL_OK.has(scroll)) out.scroll = scroll as DrillQuery['scroll']
  return out
}
