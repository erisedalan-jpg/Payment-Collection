import type { PayNodeRow } from './paymentPmis'

/** 排除已回款节点(日历只关心未结清的)。 */
export function calExcludePaid(nodes: PayNodeRow[]): PayNodeRow[] {
  return nodes.filter((n) => n.status !== '已回款')
}

export interface CalFilters { orgL3_1: string; orgL4: string; pm: string }

/** 三筛选下拉选项(有 planDate 的节点,升序去重)。orgL4 取 dept。 */
export function calFilterOptions(nodes: PayNodeRow[]): { orgL3_1: string[]; orgL4: string[]; pm: string[] } {
  const l3 = new Set<string>(), l4 = new Set<string>(), pm = new Set<string>()
  for (const n of nodes) {
    if (!n.planDate) continue
    if (n.orgL3_1) l3.add(n.orgL3_1)
    if (n.dept) l4.add(n.dept)
    if (n.projectManager) pm.add(n.projectManager)
  }
  return { orgL3_1: [...l3].sort(), orgL4: [...l4].sort(), pm: [...pm].sort() }
}

/** 应用 orgL3_1/orgL4(dept)/PM 三筛选。 */
export function applyCalFilters(nodes: PayNodeRow[], f: CalFilters): PayNodeRow[] {
  let out = nodes
  if (f.orgL3_1) out = out.filter((n) => n.orgL3_1 === f.orgL3_1)
  if (f.orgL4) out = out.filter((n) => n.dept === f.orgL4)
  if (f.pm) out = out.filter((n) => n.projectManager === f.pm)
  return out
}

export interface CalDashboard { mRemaining: number; mActual: number; upcoming7: number; mCount: number; delayed: number }
/** 当月(now 月)待回款=Σ未收/已回款=Σ已收/笔数；延期=count(延期)；upcoming7=planDate 距今 0..7 天且未结清。 */
export function calDashboardStats(nodes: PayNodeRow[], f: CalFilters, now: Date): CalDashboard {
  const ns = applyCalFilters(nodes.filter((n) => n.planDate), f)
  const nowY = now.getFullYear(), nowM = now.getMonth()
  let mRem = 0, mAct = 0, mCnt = 0, up = 0, del = 0
  for (const n of ns) {
    const pd = n.planDate
    if (!pd || pd.length < 10) continue
    const py = parseInt(pd.substring(0, 4)), pmo = parseInt(pd.substring(5, 7)) - 1
    const diff = Math.ceil((new Date(pd.substring(0, 10)).getTime() - now.getTime()) / 86400000)
    if (diff >= 0 && diff <= 7 && n.status !== '已回款') up++
    if (n.status === '延期') del++
    if (py === nowY && pmo === nowM) { mCnt++; mRem += n.unpaidAmount; mAct += n.receivedAmount }
  }
  return { mRemaining: mRem, mActual: mAct, upcoming7: up, mCount: mCnt, delayed: del }
}

export interface CalDayData { total: number; delayed: number; pending: number; partial: number; warranty: number; remaining: number }
/** 按日期统计 4 态计数 + Σ未收(输入应为已排已回款的节点)。 */
export function calDateData(nodes: PayNodeRow[]): Record<string, CalDayData> {
  const map: Record<string, CalDayData> = {}
  for (const n of nodes) {
    if (!n.planDate) continue
    const d = String(n.planDate).slice(0, 10)
    if (!map[d]) map[d] = { total: 0, delayed: 0, pending: 0, partial: 0, warranty: 0, remaining: 0 }
    const dd = map[d]
    dd.total++
    dd.remaining += n.unpaidAmount
    const s = n.status
    if (s === '延期') dd.delayed++
    else if (s === '部分回款') dd.partial++
    else if (s === '质保期') dd.warranty++
    else dd.pending++
  }
  return map
}

export interface CalCell { day: number; dateStr: string; otherMonth: boolean; isToday: boolean; isWeekend: boolean; statusClass: string; count: number; remaining: number }
/** 月份格子(含补位)；statusClass 4 态优先级或 mixed。 */
export function calMonthGrid(year: number, month: number, dateData: Record<string, CalDayData>, today: Date): CalCell[] {
  const cells: CalCell[] = []
  const dow = new Date(year, month, 1).getDay()
  const startOff = dow === 0 ? 6 : dow - 1
  const dim = new Date(year, month + 1, 0).getDate()
  const prevDim = new Date(year, month, 0).getDate()
  for (let i = 0; i < startOff; i++)
    cells.push({ day: prevDim - startOff + i + 1, dateStr: '', otherMonth: true, isToday: false, isWeekend: false, statusClass: '', count: 0, remaining: 0 })
  for (let d = 1; d <= dim; d++) {
    const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const dowD = new Date(year, month, d).getDay()
    const isWeekend = dowD === 0 || dowD === 6
    const dd = dateData[ds]
    const count = dd ? dd.total : 0
    const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate()
    let statusClass = ''
    if (count > 0 && dd) {
      const sc = (dd.delayed > 0 ? 1 : 0) + (dd.pending > 0 ? 1 : 0) + (dd.partial > 0 ? 1 : 0) + (dd.warranty > 0 ? 1 : 0)
      if (sc > 1) statusClass = 'mixed'
      else if (dd.delayed > 0) statusClass = 'delayed'
      else if (dd.pending > 0) statusClass = 'pending'
      else if (dd.partial > 0) statusClass = 'partial'
      else statusClass = 'warranty'
    }
    cells.push({ day: d, dateStr: ds, otherMonth: false, isToday, isWeekend, statusClass, count, remaining: dd ? dd.remaining : 0 })
  }
  const total = startOff + dim
  const rem = total % 7 === 0 ? 0 : 7 - (total % 7)
  for (let i = 1; i <= rem; i++)
    cells.push({ day: i, dateStr: '', otherMonth: true, isToday: false, isWeekend: false, statusClass: '', count: 0, remaining: 0 })
  return cells
}

/** 列表节点：selectedDate 优先,否则当前双月。输入纳管节点(PayNodeRow)。 */
export function calListNodes(naguanNodes: PayNodeRow[], f: CalFilters, view: { year: number; month: number; selectedDate: string }): PayNodeRow[] {
  let nodes = applyCalFilters(calExcludePaid(naguanNodes.filter((n) => n.planDate)), f)
  const { year, month, selectedDate } = view
  let y2 = year, m2 = month + 1
  if (m2 > 11) { m2 = 0; y2 = year + 1 }
  const p1 = year + '-' + String(month + 1).padStart(2, '0')
  const p2 = y2 + '-' + String(m2 + 1).padStart(2, '0')
  if (selectedDate) nodes = nodes.filter((n) => String(n.planDate).startsWith(selectedDate))
  else nodes = nodes.filter((n) => String(n.planDate).startsWith(p1) || String(n.planDate).startsWith(p2))
  return [...nodes].sort((a, b) => String(a.planDate || '').localeCompare(String(b.planDate || '')))
}

export interface CalListGroup { key: string; color: string; nodes: PayNodeRow[]; subRemaining: number }
const LIST_STATUS_ORDER = [
  { key: '延期', color: 'var(--danger)' },
  { key: '待回款', color: 'var(--mut)' },
  { key: '部分回款', color: 'var(--c-plan)' },
  { key: '质保期', color: 'var(--warn)' },
]
/** 按 4 态分组(顺序固定,空组略,subRemaining=Σ未收)。 */
export function calListGroups(nodes: PayNodeRow[]): CalListGroup[] {
  const groups: CalListGroup[] = []
  for (const sg of LIST_STATUS_ORDER) {
    const g = nodes.filter((n) => n.status === sg.key)
    if (!g.length) continue
    groups.push({ key: sg.key, color: sg.color, nodes: g, subRemaining: g.reduce((s, n) => s + n.unpaidAmount, 0) })
  }
  return groups
}

export interface CalUpcoming { up15: PayNodeRow[]; up30: PayNodeRow[] }
/** up15=[now,now+15] 未结清；up30=(now,now+30] 未结清(已排已回款)。 */
export function calUpcoming(naguanNodes: PayNodeRow[], f: CalFilters, now: Date): CalUpcoming {
  const all = applyCalFilters(calExcludePaid(naguanNodes.filter((n) => n.planDate)), f)
  const d15 = new Date(now.getTime() + 15 * 864e5)
  const d30 = new Date(now.getTime() + 30 * 864e5)
  const byDate = (a: PayNodeRow, b: PayNodeRow) => String(a.planDate || '').localeCompare(String(b.planDate || ''))
  const up15 = all.filter((n) => { const d = new Date(n.planDate); return d >= now && d <= d15 }).sort(byDate)
  const up30 = all.filter((n) => { const d = new Date(n.planDate); return d > d15 && d <= d30 }).sort(byDate)
  return { up15, up30 }
}

const TOOLTIP_LABELS: [keyof CalDayData, string][] = [
  ['delayed', '延期'], ['pending', '待回款'], ['partial', '部分回款'], ['warranty', '质保期'],
]
/** 网格格子悬浮文本。 */
export function calDayTooltipText(dd: CalDayData): string {
  const parts = TOOLTIP_LABELS.filter(([k]) => (dd[k] as number) > 0).map(([k, label]) => `${label} ${dd[k]}`)
  return parts.join('，') + `，合计 ${dd.total}`
}

export interface CalAgendaGroup { date: string; nodes: PayNodeRow[]; subRemaining: number }
/** 议程按 planDate(到日)分组、升序,每组 Σ未收。 */
export function calAgendaGroups(nodes: PayNodeRow[]): CalAgendaGroup[] {
  const map: Record<string, PayNodeRow[]> = {}
  for (const n of nodes) {
    const d = String(n.planDate || '').slice(0, 10)
    if (!d) continue
    ;(map[d] ||= []).push(n)
  }
  return Object.keys(map).sort().map((d) => ({ date: d, nodes: map[d], subRemaining: map[d].reduce((s, n) => s + n.unpaidAmount, 0) }))
}

export interface CalYearHeatCell { month: number; remaining: number; count: number }
/** 指定年 12 月各自 Σ未收 与节点数。 */
export function calYearHeat(nodes: PayNodeRow[], year: number): CalYearHeatCell[] {
  const out: CalYearHeatCell[] = Array.from({ length: 12 }, (_, m) => ({ month: m, remaining: 0, count: 0 }))
  for (const n of nodes) {
    const pd = String(n.planDate || '')
    if (pd.length < 7) continue
    if (parseInt(pd.slice(0, 4)) !== year) continue
    const m = parseInt(pd.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    out[m].remaining += n.unpaidAmount
    out[m].count++
  }
  return out
}
