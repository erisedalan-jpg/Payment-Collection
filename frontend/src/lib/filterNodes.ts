import type { RawNode } from '@/types/analysis'

export type ViewMode = 'global' | 'l4' | 'pm'

export interface FilterOpts {
  filterYear: string // 'all' | '2026' | 'upto2026' | '2026-Q1' | 'upto2026-Q1'
  viewMode: ViewMode
  viewL4: string
  viewPM: string
  naguanOn: boolean
  naguanExclude: Record<string, boolean>
}

const Q_RANGE: Record<string, [string, string]> = {
  Q1: ['01', '03'], Q2: ['04', '06'], Q3: ['07', '09'], Q4: ['10', '12'],
}

/** 忠实移植 app.js getFilteredNodes：视角 → 纳管 → 年份/季度/累计。
 *  无 planMonth 的节点在年/季筛选中被排除。 */
export function filterNodes(rawNodes: RawNode[], opts: FilterOpts): RawNode[] {
  let nodes = rawNodes
  if (opts.viewMode === 'l4' && opts.viewL4) nodes = nodes.filter((n) => n.orgL4 === opts.viewL4)
  if (opts.viewMode === 'pm' && opts.viewPM) nodes = nodes.filter((n) => n.projectManager === opts.viewPM)
  if (opts.naguanOn && opts.naguanExclude) nodes = nodes.filter((n) => !opts.naguanExclude[n.projectId])

  const fy = opts.filterYear
  if (fy === 'all') return nodes

  if (fy.includes('-Q')) {
    const isUpto = fy.startsWith('upto')
    const keyPart = isUpto ? fy.slice(4) : fy
    const [qYear, qn] = keyPart.split('-Q')
    const range = Q_RANGE['Q' + qn]
    if (!range) return nodes
    const mStart = `${qYear}-${range[0]}`
    const mEnd = `${qYear}-${range[1]}`
    if (isUpto) {
      return nodes.filter((n) => !!n.planMonth && n.planMonth <= mEnd)
    }
    return nodes.filter((n) => !!n.planMonth && n.planMonth >= mStart && n.planMonth <= mEnd)
  }

  if (fy.startsWith('upto')) {
    const endOfYear = `${fy.slice(4)}-12`
    return nodes.filter((n) => !!n.planMonth && n.planMonth <= endOfYear)
  }

  const startOfYear = `${fy}-01`
  const endOfYear = `${fy}-12`
  return nodes.filter((n) => !!n.planMonth && n.planMonth >= startOfYear && n.planMonth <= endOfYear)
}
