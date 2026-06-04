import type { RawNode } from '@/types/analysis'
import { pctToNum } from './format'
import type { FuData } from './followup'

type N = Record<string, any>

export interface FuProject {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  projectAmount: number
  projectAmountWan: number
  earliestPlanDate: string
  completion: string
  nodeStatuses: string[]
  nodes: RawNode[]
  flw: boolean
}

/** 忠实移植 _fuDeptProjects：某部门(orgL4||未分配)的项目聚合。relatedNodes=getFilteredNodes().filter(isPaymentRelated)。 */
export function followupDeptProjects(relatedNodes: RawNode[], deptName: string, fuData: FuData): FuProject[] {
  const nodes = relatedNodes.filter((n) => ((n as N).orgL4 || '未分配') === deptName)
  const map: Record<string, any> = {}
  for (const raw of nodes) {
    const n = raw as N
    const pid = n.projectId || ''
    if (!pid) continue
    if (!map[pid])
      map[pid] = {
        projectId: pid,
        projectName: n.projectName || '',
        projectManager: n.projectManager || '',
        orgL4: n.orgL4 || deptName,
        projectAmount: n.projectAmount || 0,
        nodes: [],
        earliestPlanDate: '',
        _maxCompletion: 0,
        completion: '',
      }
    const p = map[pid]
    p.nodes.push(raw)
    if (n.planDate) {
      if (!p.earliestPlanDate || n.planDate < p.earliestPlanDate) p.earliestPlanDate = n.planDate
    }
    if (n.projectCompletion && n.projectCompletion !== '空值') {
      const cp = pctToNum(n.projectCompletion) || 0
      if (cp > p._maxCompletion) {
        p._maxCompletion = cp
        p.completion = n.projectCompletion
      }
    }
  }
  return Object.values(map).map((p: any) => ({
    projectId: p.projectId,
    projectName: p.projectName,
    projectManager: p.projectManager,
    orgL4: p.orgL4,
    projectAmount: p.projectAmount,
    projectAmountWan: Math.round(((p.projectAmount || 0) / 10000) * 100) / 100,
    earliestPlanDate: p.earliestPlanDate || '-',
    completion: p.completion || '-',
    nodeStatuses: p.nodes.map((n: N) => n.nodeStatus).filter(Boolean),
    nodes: p.nodes,
    flw: !!(fuData[p.projectId] && fuData[p.projectId].flw),
  }))
}

/** 忠实移植 _openFuExpand 的 timeWin 节点过滤（delay/d7/d15/d30/空=全部）。today 注入。 */
export function deptWindowNodes(
  relatedNodes: RawNode[],
  deptName: string,
  timeWin: string,
  today: Date,
): RawNode[] {
  const nodes = relatedNodes.filter((n) => ((n as N).orgL4 || '未分配') === deptName)
  return nodes.filter((raw) => {
    const n = raw as N
    if (timeWin === 'delay') return n.nodeStatus === '延期'
    if (!timeWin) return true
    if (!n.planDate) return false
    const ar = pctToNum(n.actualPaymentRatio)
    if (ar !== null && ar >= 1) return false
    const d = new Date(n.planDate)
    if (d < today) return false
    const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
    if (timeWin === 'd7') return diff <= 7
    if (timeWin === 'd15') return diff <= 15
    if (timeWin === 'd30') return diff <= 30
    return true
  })
}

export interface Urgency {
  delay: number
  d7: number
  d15: number
  d30: number
}
/** 忠实移植 _openFuExpand 的紧迫度统计（基于已 timeWin 过滤的节点）。today 注入。 */
export function deptUrgency(windowNodes: RawNode[], today: Date): Urgency {
  const u: Urgency = { delay: 0, d7: 0, d15: 0, d30: 0 }
  for (const raw of windowNodes) {
    const n = raw as N
    if (n.nodeStatus === '延期') u.delay++
    else if (n.planDate) {
      const d = new Date(n.planDate)
      const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
      if (diff <= 7) u.d7++
      else if (diff <= 15) u.d15++
      else if (diff <= 30) u.d30++
    }
  }
  return u
}

/** 忠实移植 _renderFuRight 的下拉过滤（all/flw/noflw/7d/15d）。today 注入。 */
export function applyProjDropdown(projs: FuProject[], fval: string, today: Date): FuProject[] {
  if (fval === 'flw') return projs.filter((p) => p.flw)
  if (fval === 'noflw') return projs.filter((p) => !p.flw)
  if (fval === '7d' || fval === '15d')
    return projs.filter((p) =>
      p.nodes.some((raw) => {
        const n = raw as N
        if (!n.planDate) return false
        const ar = pctToNum(n.actualPaymentRatio)
        if (ar !== null && ar >= 1) return false
        const d = new Date(n.planDate)
        if (d < today) return false
        const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
        return fval === '7d' ? diff <= 7 : diff <= 15
      }),
    )
  return projs
}

/** 待跟进节点（实际回款<1 或缺，忠实移植 _renderFuNodeTable 过滤）。 */
export function pendingNodes(nodes: RawNode[]): RawNode[] {
  return nodes.filter((raw) => {
    const ar = pctToNum((raw as N).actualPaymentRatio)
    return ar === null || ar < 1
  })
}
