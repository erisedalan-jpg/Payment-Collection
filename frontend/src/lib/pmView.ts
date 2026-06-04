import type { RawNode } from '@/types/analysis'
import { groupByProject, type ProjectAgg } from './dashboardStats'
import { naguanFilter } from './ledger'

export interface PmColDef {
  key: string
  label: string
}

/** 忠实移植 getPmProjCols 默认列。 */
export const PM_PROJ_COLS: PmColDef[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'tier', label: '金额区间' },
  { key: 'orgL4', label: '服务组' },
  { key: 'projectManager', label: '项目经理' },
  { key: 'projectAmount', label: '项目金额' },
  { key: 'paymentStatus', label: '回款状态' },
  { key: 'paymentRatio', label: '完成率' },
]

/** 忠实移植 getPmDelayCols 默认列。 */
export const PM_DELAY_COLS: PmColDef[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'tier', label: '金额区间' },
  { key: 'milestone', label: '里程碑' },
  { key: 'planDate', label: '计划日期' },
  { key: 'expectedPayment', label: '计划回款' },
  { key: 'actualPaymentRatio', label: '实际比例' },
  { key: 'delayDays', label: '延期天数' },
]

export interface PmAgg {
  name: string
  projectCount: number
  totalAmount: number
  actualPayment: number
  expectedPayment: number
  remaining: number
  rate: number
  delayedCount: number
}

/**
 * 忠实移植 filterPmView：对全部 rawNodes（不做纳管/年份/视角过滤）按项目经理聚合，
 * search 子串过滤经理名，完成率降序。totalAmount 为逐节点累加 projectAmount（与旧版一致）。
 */
export function pmRanking(rawNodes: RawNode[], search: string): PmAgg[] {
  const q = (search || '').toLowerCase()
  const map: Record<
    string,
    {
      name: string
      projects: Set<string>
      totalAmount: number
      actualPayment: number
      expectedPayment: number
      delayedCount: number
    }
  > = {}
  for (const raw of rawNodes) {
    const n = raw as Record<string, any>
    const pm = n.projectManager || '未指定'
    if (!pm.toLowerCase().includes(q)) continue
    if (!map[pm])
      map[pm] = {
        name: pm,
        projects: new Set(),
        totalAmount: 0,
        actualPayment: 0,
        expectedPayment: 0,
        delayedCount: 0,
      }
    const m = map[pm]
    m.projects.add(n.projectId)
    m.totalAmount += n.projectAmount || 0
    if (n.isPaymentRelated) {
      m.actualPayment += n.actualPayment || 0
      m.expectedPayment += n.expectedPayment || 0
      if (n.nodeStatus === '延期') m.delayedCount++
    }
  }
  return Object.values(map)
    .map((m) => {
      const rate = m.expectedPayment > 0 ? m.actualPayment / m.expectedPayment : 0
      return {
        name: m.name,
        projectCount: m.projects.size,
        totalAmount: m.totalAmount,
        actualPayment: m.actualPayment,
        expectedPayment: m.expectedPayment,
        remaining: m.expectedPayment - m.actualPayment,
        rate,
        delayedCount: m.delayedCount,
      }
    })
    .sort((a, b) => b.rate - a.rate)
}

export interface PmDrilldownData {
  projects: ProjectAgg[]
  delayedNodes: RawNode[]
}

/** 忠实移植 renderPmDrilldown 的数据：纳管过滤后按经理筛选 → 项目聚合 + 延期节点。 */
export function pmDrilldown(
  rawNodes: RawNode[],
  pmName: string,
  naguanOn: boolean,
  naguanExclude: Record<string, boolean>,
): PmDrilldownData {
  const pmNodes = naguanFilter(rawNodes, naguanOn, naguanExclude).filter(
    (n) => ((n as Record<string, any>).projectManager || '未指定') === pmName,
  )
  const projects = groupByProject(pmNodes)
  const delayedNodes = pmNodes.filter(
    (n) =>
      (n as Record<string, any>).isPaymentRelated &&
      (n as Record<string, any>).nodeStatus === '延期',
  )
  return { projects, delayedNodes }
}
