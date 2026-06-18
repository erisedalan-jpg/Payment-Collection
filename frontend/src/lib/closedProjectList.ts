import type { ClosedProject } from '@/types/analysis'

// 已关闭项目清单行：closedProjects[] 扁平化展示模型(轻量,无回款/健康)
export interface ClosedRow {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  orgL3_1: string
  customer: string
  signParty: string
  contractAmount: number | null
  industry: string
  projectType: string
  projectLevel: string
  rating: string
  stage: string
  projectStatus: string
  closedAt: string
  costRatio: number | null
  overspend: boolean
}

export interface ClosedFilters {
  search: string
}

const v = (x: unknown): string => (x == null ? '' : String(x)).trim()

export function buildClosedRows(closed: ClosedProject[]): ClosedRow[] {
  return (closed ?? []).map((p) => ({
    projectId: p.projectId,
    projectName: v(p.projectName),
    projectManager: v(p.projectManager),
    orgL4: v(p.orgL4),
    orgL3_1: v(p.orgL3_1),
    customer: v(p.customer?.最终客户),
    signParty: v(p.customer?.签约单位),
    contractAmount: (p.customer?.合同总额 ?? null) as number | null,
    industry: v(p.customer?.行业),
    projectType: v(p.status?.项目类型),
    projectLevel: v(p.status?.项目级别),
    rating: v(p.status?.评级),
    stage: v(p.progress?.项目阶段),
    projectStatus: v(p.status?.项目状态),
    closedAt: v(p.closeInfo?.关闭时间),
    costRatio: (p.cost?.消耗比 ?? null) as number | null,
    overspend: p.cost?.项目超支 === true,
  }))
}

export function filterClosedRows(rows: ClosedRow[], f: ClosedFilters): ClosedRow[] {
  const kw = f.search.trim().toLowerCase()
  if (!kw) return rows
  return rows.filter((r) =>
    [r.projectName, r.projectId, r.customer, r.projectManager].some((x) => x.toLowerCase().includes(kw)),
  )
}
