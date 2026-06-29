import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProgressRowBase, type KeyProjectRow, type ProgressRecord } from './keyProjects'
import { buildProjectRows, type ProjectRow } from './projectList'
import type { ScopeProjectInput } from './tempScope'

export interface TempRow extends KeyProjectRow {
  stage: string; projectType: string; projectStatus: string; health: string
  progress: number | null; costRatio: number | null; paymentRatio: number | null
  paymentStatus: string; top1000: string; quadrant: string
  paused: boolean; overspend: boolean; milestoneStatus: string
}

export function buildTempRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, ProgressRecord>,
  inScopeIds: Set<string>,
): TempRow[] {
  const prMap = new Map<string, ProjectRow>(buildProjectRows(projects, pmisMap).map((r) => [r.projectId, r]))
  return projects
    .filter((p) => inScopeIds.has(p.projectId))
    .map((p) => {
      const pmis = pmisMap[p.projectId]
      const base = buildProgressRowBase(p, pmis, current[p.projectId] ?? {}, pmisMap[p.relatedClosedId ?? ''])
      const pr = prMap.get(p.projectId)
      const prog = ((pmis ?? {}) as Record<string, any>).progress ?? {}
      return {
        ...base,
        stage: pr?.stage ?? '-',
        projectType: pr?.projectType ?? '-',
        projectStatus: pr?.projectStatus ?? '-',
        health: pr?.health ?? '无数据',
        progress: pr?.progress ?? null,
        costRatio: pr?.costRatio ?? null,
        paymentRatio: pr?.paymentRatio ?? null,
        paymentStatus: pr?.paymentStatus ?? '-',
        top1000: pr?.top1000 ?? '否',
        quadrant: pr?.quadrant ?? '',
        paused: pr?.paused ?? false,
        overspend: pr?.overspend ?? false,
        milestoneStatus: String(prog.里程碑进度状态 ?? '-'),
      }
    })
}

export function buildScopeInputs(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  paymentNodes: Record<string, any[]> | undefined,
  milestones: Record<string, any[]> | undefined,
): ScopeProjectInput[] {
  const prMap = new Map<string, ProjectRow>(buildProjectRows(projects, pmisMap).map((r) => [r.projectId, r]))
  const yn = (b: boolean) => (b ? '是' : '否')
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const team = m.team ?? {}, prog = m.progress ?? {}
    const pr = prMap.get(p.projectId)
    const contract = p.paymentPmis?.contract
    return {
      id: p.projectId,
      proj: {
        customer: pr?.customer ?? '-',
        projectManager: pr?.projectManager ?? '-',
        ar: String(team.AR ?? '-'),
        sr: String(team.SR ?? '-'),
        orgL4: pr?.orgL4 ?? '-',
        projectLevel: pr?.projectLevel ?? '-',
        projectType: pr?.projectType ?? '-',
        stage: pr?.stage ?? '-',
        projectStatus: pr?.projectStatus ?? '-',
        health: pr?.health ?? '无数据',
        riskLevel: pr?.riskLevel ?? '无',
        paymentStatus: pr?.paymentStatus ?? '-',
        top1000: pr?.top1000 ?? '否',
        quadrant: pr?.quadrant ?? '',
        paused: yn(!!pr?.paused),
        overspend: yn(!!pr?.overspend),
        isPresale: yn(!!pr?.isPresale),
        tags: pr?.tags ?? [],
        milestoneStatus: String(prog.里程碑进度状态 ?? '-'),
        contractWan: typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,
        progress: pr?.progress ?? null,
        costRatio: pr?.costRatio ?? null,
        paymentRatio: pr?.paymentRatio ?? null,
        openRisks: pr?.openRisks ?? 0,
        finalAcceptDate: String(prog.终验时间 ?? '').slice(0, 10),
      },
      nodes: (paymentNodes?.[p.projectId] ?? []) as any[],
      milestones: (milestones?.[p.projectId] ?? []) as any[],
    }
  })
}
