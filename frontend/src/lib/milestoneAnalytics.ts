import type { Project, ProjectPmis, MilestoneItem } from '@/types/analysis'

export type MilestoneStatus = '正常' | '延期' | '严重延期' | '未发布'

export interface MilestoneProject {
  projectId: string
  projectName: string
  manager: string
  orgL4: string
  orgL3_1: string
  projectType: string
  contract: number
  status: MilestoneStatus
  nodes: MilestoneItem[]
}

export interface ExcludeOpts { excludeOn?: boolean; excludedIds?: Record<string, boolean> }
export interface StatusKpis { total: number; normal: number; delayed: number; severe: number; unpublished: number }

/** PMIS 里程碑进度状态归一：超期未发布/空/null/未知 → 未发布。 */
export function normalizeStatus(raw: string | null | undefined): MilestoneStatus {
  const s = (raw ?? '').trim()
  if (s === '正常') return '正常'
  if (s === '延期') return '延期'
  if (s === '严重延期') return '严重延期'
  return '未发布'
}

/** 本项目号节点优先；为空且售前则回退原项目号(relatedClosedId)。 */
function nodesFor(p: Project, ms: Record<string, MilestoneItem[]>): MilestoneItem[] {
  const own = ms[p.projectId]
  if (own && own.length) return own
  if (p.isPresale && p.relatedClosedId) return ms[p.relatedClosedId] ?? []
  return []
}

/** 装配主域里程碑视图；excludeOn 时剔除 excludedIds 命中的项目。 */
export function buildMilestoneProjects(
  projects: Project[],
  pmis: Record<string, ProjectPmis>,
  milestones: Record<string, MilestoneItem[]>,
  opts: ExcludeOpts = {},
): MilestoneProject[] {
  const excl = opts.excludeOn ? (opts.excludedIds ?? {}) : {}
  const out: MilestoneProject[] = []
  for (const p of projects) {
    if (excl[p.projectId]) continue
    const m = (pmis[p.projectId] ?? {}) as any
    out.push({
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      manager: (p.projectManager ?? '').trim(),
      orgL4: (p.orgL4 ?? '').trim(),
      orgL3_1: (p.orgL3_1 ?? '').trim(),
      projectType: (m.status?.项目类型 ?? '').trim(),
      contract: Number(p.paymentPmis?.contract ?? 0),
      status: normalizeStatus(m.progress?.里程碑进度状态),
      nodes: nodesFor(p, milestones),
    })
  }
  return out
}

export function statusKpis(ps: MilestoneProject[]): StatusKpis {
  const k: StatusKpis = { total: ps.length, normal: 0, delayed: 0, severe: 0, unpublished: 0 }
  for (const p of ps) {
    if (p.status === '正常') k.normal++
    else if (p.status === '延期') k.delayed++
    else if (p.status === '严重延期') k.severe++
    else k.unpublished++
  }
  return k
}
