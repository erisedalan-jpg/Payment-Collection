import type { RawNode } from '@/types/analysis'

export interface PlanBoardDef {
  key: string
  label: string
  color: string
  status: string
}

/** 忠实移植 renderPlan 的 6 看板定义（顺序与配色一致）。 */
export const PLAN_BOARDS: PlanBoardDef[] = [
  { key: 'canAdvance', label: '加资源可提前', color: 'var(--primary, #4f46e5)', status: '加资源可提前' },
  { key: 'reachedCondition', label: '达到回款条件', color: '#F59E0B', status: '达到回款条件' },
  { key: 'advance', label: '已提前回款', color: '#059669', status: '已提前回款' },
  { key: 'fullPaid', label: '已全额回款', color: '#10B981', status: '已全额回款' },
  { key: 'delayed', label: '延期', color: 'var(--red, #ef4444)', status: '延期' },
  { key: 'onTime', label: '正常实施中', color: 'var(--blue, #3b82f6)', status: '正常实施中' },
]

export interface BoardStats {
  count: number
  totalExp: number
  totalAct: number
  remaining: number
  rate: number
}

/** 单看板统计（元）。忠实移植 renderPlanBoards 的 per-board 计算。 */
export function boardStats(nodes: RawNode[]): BoardStats {
  let totalExp = 0
  let totalAct = 0
  for (const n of nodes) {
    const r = n as Record<string, any>
    totalExp += r.expectedPayment || 0
    totalAct += r.actualPayment || 0
  }
  return {
    count: nodes.length,
    totalExp,
    totalAct,
    remaining: totalExp - totalAct,
    rate: totalExp > 0 ? totalAct / totalExp : 0,
  }
}

export interface PlanSummary {
  totalExp: number
  totalAct: number
  totalRem: number
  rate: number
}

/** 汇总条总计（元）。忠实移植 updatePlanSummary 的 boardAgg 路径：跨 6 看板(已CF过滤)求和。 */
export function planSummaryTotals(boardsNodes: RawNode[][]): PlanSummary {
  let totalExp = 0
  let totalAct = 0
  let totalRem = 0
  for (const nodes of boardsNodes) {
    for (const n of nodes) {
      const r = n as Record<string, any>
      totalExp += r.expectedPayment || 0
      totalAct += r.actualPayment || 0
      totalRem += (r.expectedPayment || 0) - (r.actualPayment || 0)
    }
  }
  return { totalExp, totalAct, totalRem, rate: totalExp > 0 ? totalAct / totalExp : 0 }
}

export interface StatusCounts {
  canAdvance: number
  reachedCondition: number
  advance: number
  fullPaid: number
  delayed: number
  onTime: number
}

/** 状态计数（节点级，按 nodeStatus）。忠实移植 updatePlanSummary 的 6 个计数。 */
export function planStatusCounts(related: RawNode[]): StatusCounts {
  const c = (s: string) => related.filter((n) => (n as Record<string, any>).nodeStatus === s).length
  return {
    canAdvance: c('加资源可提前'),
    reachedCondition: c('达到回款条件'),
    advance: c('已提前回款'),
    fullPaid: c('已全额回款'),
    delayed: c('延期'),
    onTime: c('正常实施中'),
  }
}
