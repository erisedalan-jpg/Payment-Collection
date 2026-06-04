import type { RawNode } from '@/types/analysis'
import { pctToNum } from './format'

type N = Record<string, any>

export interface FuFlag {
  flw?: boolean
  st?: string
  fb?: string
}
export type FuData = Record<string, FuFlag>

const FU_KEY = 'fu_data'
/** 读取本地跟进标记（忠实移植 _fuData，localStorage 'fu_data'；异常返回空对象）。 */
export function loadFuData(): FuData {
  try {
    return JSON.parse(localStorage.getItem(FU_KEY) || '{}')
  } catch {
    return {}
  }
}

export interface DeptStat {
  name: string
  total: number
  d7: number
  d15: number
  d30: number
  delay: number
  flw: number
  d7flw: number
  d15flw: number
  d30flw: number
  delayFlw: number
}
/** 忠实移植 initFollowup 的 deptMap 计算 + 排序（delay→d7→d15→d30 降序）。today 注入。 */
export function followupDeptStats(relatedNodes: RawNode[], fuData: FuData, today: Date): DeptStat[] {
  const map: Record<string, DeptStat> = {}
  for (const raw of relatedNodes) {
    const n = raw as N
    const dept = n.orgL4 || '未分配'
    const pid = n.projectId || ''
    if (!map[dept])
      map[dept] = { name: dept, d30: 0, d15: 0, d7: 0, delay: 0, flw: 0, total: 0, d7flw: 0, d15flw: 0, d30flw: 0, delayFlw: 0 }
    const m = map[dept]
    m.total++
    const isFlw = !!(fuData[pid] && fuData[pid].flw)
    if (n.nodeStatus === '延期') {
      m.delay++
      if (isFlw) {
        m.flw++
        m.delayFlw++
      }
    }
    if (!n.planDate) continue
    const ar = pctToNum(n.actualPaymentRatio)
    if (ar !== null && ar >= 1) continue
    const d = new Date(n.planDate)
    if (d < today) continue
    const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
    if (diff <= 7) {
      m.d7++
      if (isFlw) {
        m.flw++
        m.d7flw++
      }
    } else if (diff <= 15) {
      m.d15++
      if (isFlw) {
        m.flw++
        m.d15flw++
      }
    } else if (diff <= 30) {
      m.d30++
      if (isFlw) {
        m.flw++
        m.d30flw++
      }
    }
  }
  return Object.values(map).sort((a, b) => {
    if (b.delay !== a.delay) return b.delay - a.delay
    if (b.d7 !== a.d7) return b.d7 - a.d7
    if (b.d15 !== a.d15) return b.d15 - a.d15
    return b.d30 - a.d30
  })
}

export interface FollowupTotals {
  urgent: number
  d15: number
  d30: number
  delayed: number
  totalFlw: number
  totalNotFlw: number
}
/** 忠实移植 6 统计卡的汇总。 */
export function followupTotals(stats: DeptStat[]): FollowupTotals {
  const delayed = stats.reduce((s, d) => s + d.delay, 0)
  const urgent = stats.reduce((s, d) => s + d.d7, 0)
  const d15 = stats.reduce((s, d) => s + d.d15, 0)
  const d30 = stats.reduce((s, d) => s + d.d30, 0)
  const totalFlw = stats.reduce((s, d) => s + d.flw, 0)
  const signalBase = delayed + urgent + d15 + d30
  return { urgent, d15, d30, delayed, totalFlw, totalNotFlw: Math.max(0, signalBase - totalFlw) }
}

export interface QuarterStat {
  quarter: number
  nodeCount: number
  projectCount: number
  expected: number
  actual: number
}
/** 忠实移植季度概览：按 planDate 月份分 Q1-Q4，统计节点/项目数(去重)/计划/实际。 */
export function followupQuarters(relatedNodes: RawNode[]): QuarterStat[] {
  const q = [0, 1, 2, 3].map(() => ({ nodeCount: 0, pids: new Set<string>(), expected: 0, actual: 0 }))
  for (const raw of relatedNodes) {
    const n = raw as N
    if (!n.planDate || String(n.planDate).length < 7) continue
    const pm = parseInt(String(n.planDate).substring(5, 7))
    const qi = pm <= 3 ? 0 : pm <= 6 ? 1 : pm <= 9 ? 2 : 3
    q[qi].nodeCount++
    q[qi].pids.add(n.projectId)
    q[qi].expected += n.expectedPayment || 0
    q[qi].actual += n.actualPayment || 0
  }
  return q.map((x, i) => ({
    quarter: i + 1,
    nodeCount: x.nodeCount,
    projectCount: x.pids.size,
    expected: x.expected,
    actual: x.actual,
  }))
}

/** 季度标题前缀（忠实移植 cyclePrefix 主分支；季度类 filterYear 取父年度标签）。 */
export function cycleLabel(filterYear: string, curYear: number): string {
  const m: Record<string, string> = {
    all: '全部',
    [String(curYear)]: '本年度',
    [String(curYear + 1)]: '下一年度',
    ['upto' + curYear]: '至本年度',
    ['upto' + String(curYear + 1)]: '至下一年度',
  }
  if (m[filterYear]) return m[filterYear]
  if (filterYear.indexOf('upto') === 0 && filterYear.indexOf('-Q') >= 0) {
    const bu = filterYear.substring(4).split('-Q')[0]
    return m['upto' + bu] || filterYear
  }
  if (filterYear.indexOf('-Q') >= 0) {
    const base = filterYear.split('-Q')[0]
    return m[base] || base
  }
  return filterYear
}
