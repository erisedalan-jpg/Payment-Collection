import type { RawNode } from '@/types/analysis'

export type OverviewProject = Record<string, any>

/** 忠实移植 renderTier：项目总览按 amountTier 过滤；纳管开启时排除 naguanExclude。 */
export function filterOverviewProjects(
  projects: OverviewProject[],
  tier: string,
  naguanOn: boolean,
  naguanExclude: Record<string, boolean>,
): OverviewProject[] {
  return projects.filter((p) => {
    if (naguanOn && naguanExclude && naguanExclude[p.projectId as string]) return false
    return p.amountTier === tier
  })
}

export interface ProjectsOverviewSummary {
  projectCount: number
  nodeCount: number
  totalActual: number
  totalRemaining: number
  rate: number
  adv: number
  reached: number
  delayed: number
}

/** 忠实移植 renderTier 项目总览汇总：仅统计 displayProjects 内的关联回款节点（单位元）。 */
export function projectsOverviewSummary(
  displayProjects: OverviewProject[],
  filteredNodes: RawNode[],
): ProjectsOverviewSummary {
  const pids = new Set(displayProjects.map((p) => p.projectId as string))
  const ovNodes = filteredNodes.filter((raw) => {
    const n = raw as Record<string, any>
    return n.isPaymentRelated && pids.has(n.projectId)
  })
  const expected = ovNodes.reduce((s, n) => s + ((n as Record<string, any>).expectedPayment || 0), 0)
  const actual = ovNodes.reduce((s, n) => s + ((n as Record<string, any>).actualPayment || 0), 0)
  const byStatus = (st: string) => ovNodes.filter((n) => (n as Record<string, any>).nodeStatus === st).length
  return {
    projectCount: displayProjects.length,
    nodeCount: ovNodes.length,
    totalActual: actual,
    totalRemaining: expected - actual,
    rate: expected > 0 ? actual / expected : 0,
    adv: byStatus('加资源可提前'),
    reached: byStatus('达到回款条件'),
    delayed: byStatus('延期'),
  }
}
