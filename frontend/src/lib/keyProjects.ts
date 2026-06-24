import type { Project, ProjectPmis } from '@/types/analysis'

const v = (raw: unknown, fallback = ''): string => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? fallback : s
}

export interface ProgressRecord {
  weekProgress?: string; weekProgressEditTime?: string; weekProgressEditBy?: string
  nextPlan?: string; nextPlanEditTime?: string; nextPlanEditBy?: string
}

export interface KeyProjectRow {
  projectId: string; customer: string; projectName: string; projectLevel: string
  projectManager: string; ar: string; sr: string; orgL4: string
  contractWan: number | null; riskLevel: string; openRisks: number
  weekProgress: string; weekProgressEditTime: string; weekProgressEditBy: string
  nextPlan: string; nextPlanEditTime: string; nextPlanEditBy: string
  followDate: string; followBy: string
}

/** 重点项目:TOP1000 大客户 且(合同>100万元 或 级别 P1)。合同已由 paymentPmis.contract 上游回退原项目(售前)。 */
export function isKeyProject(p: Project, pmis: ProjectPmis | undefined): boolean {
  if (p.top1000 !== '是') return false
  const contract = Number(p.paymentPmis?.contract ?? 0)
  const level = v((pmis?.status as Record<string, unknown> | undefined)?.['项目级别'])
  return contract > 1_000_000 || level === 'P1'
}

export function followDate(rec: ProgressRecord): string {
  const a = v(rec.weekProgressEditTime), b = v(rec.nextPlanEditTime)
  return a > b ? a : b
}
export function followBy(rec: ProgressRecord): string {
  const list = [v(rec.weekProgressEditBy), v(rec.nextPlanEditBy)].filter((x) => x)
  return [...new Set(list)].join('、')
}

export function buildKeyProjectRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, ProgressRecord>,
): KeyProjectRow[] {
  return projects
    .filter((p) => isKeyProject(p, pmisMap[p.projectId]))
    .map((p) => {
      const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
      const st = m.status ?? {}, risk = m.risk ?? {}, cust = m.customer ?? {}, team = m.team ?? {}
      const rec: ProgressRecord = current[p.projectId] ?? {}
      const contract = p.paymentPmis?.contract
      return {
        projectId: p.projectId,
        customer: v(cust.最终客户, '-'),
        projectName: p.projectName || p.projectId,
        projectLevel: v(st.项目级别, '-'),
        projectManager: v(p.projectManager, '-'),
        ar: v(team.AR, '-'),
        sr: v(team.SR, '-'),
        orgL4: v(p.orgL4, '-'),
        contractWan: typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,
        riskLevel: v(risk.最高等级, '无'),
        openRisks: Number(risk.未关闭风险数 ?? 0),
        weekProgress: v(rec.weekProgress),
        weekProgressEditTime: v(rec.weekProgressEditTime),
        weekProgressEditBy: v(rec.weekProgressEditBy),
        nextPlan: v(rec.nextPlan),
        nextPlanEditTime: v(rec.nextPlanEditTime),
        nextPlanEditBy: v(rec.nextPlanEditBy),
        followDate: followDate(rec),
        followBy: followBy(rec),
      }
    })
}
