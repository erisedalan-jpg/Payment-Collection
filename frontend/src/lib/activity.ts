import type { Event } from '@/types/analysis'

export interface ActivityFilters {
  domain: string // '' | 'project' | 'payment'
  query: string
}

export interface DayGroup {
  date: string
  items: Event[]
}

export function filterEvents(events: Event[], f: ActivityFilters): Event[] {
  const q = (f.query || '').trim().toLowerCase()
  return events.filter((e) => {
    if (f.domain && e.domain !== f.domain) return false
    if (q && ![e.projectName, e.projectId, e.summary, e.type]
      .some((s) => String(s || '').toLowerCase().includes(q))) return false
    return true
  })
}

/** 按日分组,保持输入顺序(events 内嵌即新在前) */
export function groupEventsByDate(events: Event[]): DayGroup[] {
  const out: DayGroup[] = []
  for (const e of events) {
    const last = out[out.length - 1]
    if (last && last.date === e.date) last.items.push(e)
    else out.push({ date: String(e.date), items: [e] })
  }
  return out
}
