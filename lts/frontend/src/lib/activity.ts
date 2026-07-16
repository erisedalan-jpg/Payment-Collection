import type { Event } from '@/types/analysis'

export interface ActivityFilters {
  domain: string // '' | 'project' | 'payment'
  query: string
  types: string[] // 选中的事件类型，空数组=全部
  l4: string // 选中的 L4 组织，''=全部
}

export interface DayGroup {
  date: string
  items: Event[]
}

/**
 * 过滤事件列表。
 * @param events 事件数组（新在前）
 * @param f 筛选条件
 * @param pidL4 可选，projectId → orgL4 映射，用于 L4 组织筛选
 */
export function filterEvents(
  events: Event[],
  f: ActivityFilters,
  pidL4?: Record<string, string>,
): Event[] {
  const q = (f.query || '').trim().toLowerCase()
  return events.filter((e) => {
    // domain 过滤
    if (f.domain && e.domain !== f.domain) return false
    // 文本搜索
    if (q && ![e.projectName, e.projectId, e.summary, e.type]
      .some((s) => String(s || '').toLowerCase().includes(q))) return false
    // 事件类型过滤（空数组=全部）
    if (f.types.length > 0 && !f.types.includes(e.type)) return false
    // L4 组织过滤（''=全部；无 pidL4 映射或 projectId 缺失时 orgL4 视作 ''）
    if (f.l4 !== '') {
      const orgL4 = (e.projectId && pidL4?.[e.projectId]) ? pidL4[e.projectId] : ''
      if (orgL4 !== f.l4) return false
    }
    return true
  })
}

/** 按日分组，保持输入顺序（events 内嵌即新在前） */
export function groupEventsByDate(events: Event[]): DayGroup[] {
  const out: DayGroup[] = []
  for (const e of events) {
    const last = out[out.length - 1]
    if (last && last.date === e.date) last.items.push(e)
    else out.push({ date: String(e.date), items: [e] })
  }
  return out
}

/**
 * 返回事件中出现过的去重类型列表，按中文字典序稳定排序，用于类型筛选下拉选项。
 */
export function distinctEventTypes(events: Event[]): string[] {
  const set = new Set<string>()
  for (const e of events) {
    if (e.type) set.add(e.type)
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-CN'))
}
