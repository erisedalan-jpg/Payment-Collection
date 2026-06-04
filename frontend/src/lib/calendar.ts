import type { RawNode } from '@/types/analysis'
import { getNodeRemaining } from './riskGroups'
import { pctToNum } from './format'

type N = Record<string, any>

/** 忠实移植 _calExcludePaid：排除已全额回款、已提前回款。 */
export function calExcludePaid(nodes: RawNode[]): RawNode[] {
  return nodes.filter((n) => {
    const s = (n as N).nodeStatus
    return s !== '已全额回款' && s !== '已提前回款'
  })
}

export interface CalFilters {
  orgL3: string
  orgL4: string
  pm: string
}

/** 三筛选下拉选项（来自 related && planDate 节点，升序去重）。 */
export function calFilterOptions(nodes: RawNode[]): { orgL3: string[]; orgL4: string[]; pm: string[] } {
  const l3 = new Set<string>()
  const l4 = new Set<string>()
  const pm = new Set<string>()
  for (const raw of nodes) {
    const n = raw as N
    if (!n.isPaymentRelated || !n.planDate) continue
    if (n.orgL3) l3.add(n.orgL3)
    if (n.orgL4) l4.add(n.orgL4)
    if (n.projectManager) pm.add(n.projectManager)
  }
  const zhSort = (a: string, b: string) => a.localeCompare(b, 'zh')
  return { orgL3: [...l3].sort(zhSort), orgL4: [...l4].sort(zhSort), pm: [...pm].sort(zhSort) }
}

/** 应用 orgL3/orgL4/PM 三筛选。 */
export function applyCalFilters(nodes: RawNode[], f: CalFilters): RawNode[] {
  let out = nodes
  if (f.orgL3) out = out.filter((n) => (n as N).orgL3 === f.orgL3)
  if (f.orgL4) out = out.filter((n) => (n as N).orgL4 === f.orgL4)
  if (f.pm) out = out.filter((n) => (n as N).projectManager === f.pm)
  return out
}

export interface CalDashboard {
  mRemaining: number
  mActual: number
  upcoming7: number
  mCount: number
  delayed: number
}
/**
 * 忠实移植 renderCalDashboard：数据源为 getFilteredNodes（年份/视角/纳管），再叠加日历三筛选。
 * "当月"= now 的真实年月（与所看月份无关）；upcoming7 = planDate 距今 0..7 天。now 注入。
 */
export function calDashboardStats(filteredNodes: RawNode[], f: CalFilters, now: Date): CalDashboard {
  let nodes = filteredNodes.filter((n) => (n as N).isPaymentRelated && (n as N).planDate)
  nodes = applyCalFilters(nodes, f)
  const nowY = now.getFullYear()
  const nowM = now.getMonth()
  let mExp = 0
  let mAct = 0
  let mCnt = 0
  let up = 0
  let del = 0
  for (const raw of nodes) {
    const n = raw as N
    const pd: string = n.planDate
    if (!pd || pd.length < 10) continue
    const py = parseInt(pd.substring(0, 4))
    const pm = parseInt(pd.substring(5, 7)) - 1
    const diff = Math.ceil((new Date(pd.substring(0, 10)).getTime() - now.getTime()) / 86400000)
    if (diff >= 0 && diff <= 7) up++
    if (n.nodeStatus === '延期') del++
    if (py === nowY && pm === nowM) {
      mCnt++
      mExp += n.expectedPayment || 0
      mAct += n.actualPayment || 0
    }
  }
  return { mRemaining: mExp - mAct, mActual: mAct, upcoming7: up, mCount: mCnt, delayed: del }
}

export interface CalDayData {
  total: number
  delayed: number
  onTime: number
  advance: number
  canAdvance: number
  reachedCondition: number
  fullPaid: number
  pending: number
}
/** 忠实移植 renderCalPage 的 _calPageDateData：按日期统计各状态计数（输入应为 related&&planDate 节点）。 */
export function calDateData(nodes: RawNode[]): Record<string, CalDayData> {
  const map: Record<string, CalDayData> = {}
  for (const raw of nodes) {
    const n = raw as N
    if (!n.isPaymentRelated || !n.planDate) continue
    const d = String(n.planDate).slice(0, 10)
    if (!map[d])
      map[d] = { total: 0, delayed: 0, onTime: 0, advance: 0, canAdvance: 0, reachedCondition: 0, fullPaid: 0, pending: 0 }
    const dd = map[d]
    dd.total++
    const s = n.nodeStatus
    if (s === '延期') dd.delayed++
    else if (s === '正常实施中') dd.onTime++
    else if (s === '已提前回款') dd.advance++
    else if (s === '加资源可提前') dd.canAdvance++
    else if (s === '达到回款条件') dd.reachedCondition++
    else if (s === '已全额回款') dd.fullPaid++
    else dd.pending++
  }
  return map
}

export interface CalCell {
  day: number
  dateStr: string
  otherMonth: boolean
  isToday: boolean
  isWeekend: boolean
  statusClass: string
  count: number
}
/** 忠实移植 buildMonthHtml 的格子计算（含上/下月补位）；statusClass 取状态优先级或 mixed。today 注入。 */
export function calMonthGrid(
  year: number,
  month: number,
  dateData: Record<string, CalDayData>,
  today: Date,
): CalCell[] {
  const cells: CalCell[] = []
  const dow = new Date(year, month, 1).getDay()
  const startOff = dow === 0 ? 6 : dow - 1
  const dim = new Date(year, month + 1, 0).getDate()
  const prevDim = new Date(year, month, 0).getDate()
  for (let i = 0; i < startOff; i++)
    cells.push({ day: prevDim - startOff + i + 1, dateStr: '', otherMonth: true, isToday: false, isWeekend: false, statusClass: '', count: 0 })
  for (let d = 1; d <= dim; d++) {
    const ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const dowD = new Date(year, month, d).getDay()
    const isWeekend = dowD === 0 || dowD === 6
    const dd = dateData[ds]
    const count = dd ? dd.total : 0
    const isToday = year === today.getFullYear() && month === today.getMonth() && d === today.getDate()
    let statusClass = ''
    if (count > 0 && dd) {
      const sc =
        (dd.delayed > 0 ? 1 : 0) +
        (dd.onTime > 0 ? 1 : 0) +
        (dd.advance > 0 ? 1 : 0) +
        (dd.canAdvance > 0 ? 1 : 0) +
        (dd.reachedCondition > 0 ? 1 : 0) +
        (dd.fullPaid > 0 ? 1 : 0) +
        (dd.pending > 0 ? 1 : 0)
      if (sc > 1) statusClass = 'mixed'
      else if (dd.delayed > 0) statusClass = 'delayed'
      else if (dd.onTime > 0) statusClass = 'ontime'
      else if (dd.advance > 0) statusClass = 'advance'
      else if (dd.canAdvance > 0) statusClass = 'canadvance'
      else if (dd.reachedCondition > 0) statusClass = 'reached'
      else if (dd.fullPaid > 0) statusClass = 'fullpaid'
      else statusClass = 'pending'
    }
    cells.push({ day: d, dateStr: ds, otherMonth: false, isToday, isWeekend, statusClass, count })
  }
  const total = startOff + dim
  const rem = total % 7 === 0 ? 0 : 7 - (total % 7)
  for (let i = 1; i <= rem; i++)
    cells.push({ day: i, dateStr: '', otherMonth: true, isToday: false, isWeekend: false, statusClass: '', count: 0 })
  return cells
}

/** 列表节点：selectedDate 优先，否则当前双月(month + 下一月)。输入 naguanNodes（纳管-only）。 */
export function calListNodes(
  naguanNodes: RawNode[],
  f: CalFilters,
  view: { year: number; month: number; selectedDate: string },
): RawNode[] {
  let nodes = applyCalFilters(
    calExcludePaid(naguanNodes.filter((n) => (n as N).isPaymentRelated && (n as N).planDate)),
    f,
  )
  const { year, month, selectedDate } = view
  let y2 = year
  let m2 = month + 1
  if (m2 > 11) {
    m2 = 0
    y2 = year + 1
  }
  const p1 = year + '-' + String(month + 1).padStart(2, '0')
  const p2 = y2 + '-' + String(m2 + 1).padStart(2, '0')
  if (selectedDate) nodes = nodes.filter((n) => String((n as N).planDate).startsWith(selectedDate))
  else nodes = nodes.filter((n) => String((n as N).planDate).startsWith(p1) || String((n as N).planDate).startsWith(p2))
  return [...nodes].sort((a, b) =>
    String((a as N).planDate || '').localeCompare(String((b as N).planDate || '')),
  )
}

export interface CalListGroup {
  key: string
  color: string
  nodes: RawNode[]
  subRemaining: number
}
const LIST_STATUS_ORDER = [
  { key: '加资源可提前', color: '#6366F1' },
  { key: '达到回款条件', color: '#F59E0B' },
  { key: '延期', color: '#EF4444' },
  { key: '正常实施中', color: '#3B82F6' },
  { key: '待确定', color: '#94A3B8' },
]
/** 忠实移植 renderCalList 的状态分组（顺序固定，空组略过，subRemaining=组内待回款合计元）。 */
export function calListGroups(nodes: RawNode[]): CalListGroup[] {
  const groups: CalListGroup[] = []
  for (const sg of LIST_STATUS_ORDER) {
    const g = nodes.filter((n) => (n as N).nodeStatus === sg.key)
    if (!g.length) continue
    groups.push({
      key: sg.key,
      color: sg.color,
      nodes: g,
      subRemaining: g.reduce((s, n) => s + getNodeRemaining(n as N), 0),
    })
  }
  return groups
}

export interface CalUpcoming {
  up15: RawNode[]
  up30: RawNode[]
}
/** 忠实移植 renderCalUpcoming：up15=[now,now+15] 未满额；up30=(now,now+30] 未满额。now 注入。输入 naguanNodes。 */
export function calUpcoming(naguanNodes: RawNode[], f: CalFilters, now: Date): CalUpcoming {
  const all = applyCalFilters(
    calExcludePaid(naguanNodes.filter((n) => (n as N).isPaymentRelated && (n as N).planDate)),
    f,
  )
  const d15 = new Date(now.getTime() + 15 * 864e5)
  const d30 = new Date(now.getTime() + 30 * 864e5)
  const notPaid = (n: N) => {
    const ar = pctToNum(n.actualPaymentRatio)
    return !(ar !== null && ar >= 1)
  }
  const byDate = (a: RawNode, b: RawNode) =>
    String((a as N).planDate || '').localeCompare(String((b as N).planDate || ''))
  const up15 = all
    .filter((n) => {
      if (!notPaid(n as N)) return false
      const d = new Date((n as N).planDate)
      return d >= now && d <= d15
    })
    .sort(byDate)
  const up30 = all
    .filter((n) => {
      if (!notPaid(n as N)) return false
      const d = new Date((n as N).planDate)
      return d > now && d <= d30
    })
    .sort(byDate)
  return { up15, up30 }
}

const TOOLTIP_LABELS: [keyof CalDayData, string][] = [
  ['delayed', '延期'],
  ['onTime', '正常实施中'],
  ['advance', '已提前回款'],
  ['canAdvance', '加资源可提前'],
  ['reachedCondition', '达到回款条件'],
  ['fullPaid', '已全额回款'],
  ['pending', '待确定'],
]
/** 网格格子悬浮文本（展示从简：替代旧版深色富提示）。 */
export function calDayTooltipText(dd: CalDayData): string {
  const parts = TOOLTIP_LABELS.filter(([k]) => dd[k] > 0).map(([k, label]) => `${label} ${dd[k]}`)
  return parts.join('，') + `，合计 ${dd.total}`
}
