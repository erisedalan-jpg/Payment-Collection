import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, type ProjectRow } from './projectList'
export { buildScopeInputs } from './tempFollowup' // 复用范围输入构建

export interface PaymentKeyRecord {
  followAction?: string; followActionEditTime?: string; followActionEditBy?: string
  revConclusion?: string; revConclusionEditTime?: string; revConclusionEditBy?: string
  nextRevDate?: string; nextRevDateEditTime?: string; nextRevDateEditBy?: string
}

export interface PaymentKeyRow {
  projectId: string; customer: string; projectName: string; projectManager: string
  orgL4: string; projectLevel: string; contractWan: number | null
  paymentRatio: number | null; paymentStatus: string; riskLevel: string; openRisks: number
  stage: string; projectType: string; projectStatus: string; health: string
  top1000: string; quadrant: string
  followAction: string; followActionEditTime: string; followActionEditBy: string
  revConclusion: string; revConclusionEditTime: string; revConclusionEditBy: string
  nextRevDate: string; nextRevDateEditTime: string; nextRevDateEditBy: string
  followDate: string; followBy: string
}

const v = (raw: unknown, fb = ''): string => { const s = raw == null ? '' : String(raw).trim(); return s === '' ? fb : s }

export function payFollowDate(rec: PaymentKeyRecord): string {
  return [v(rec.followActionEditTime), v(rec.revConclusionEditTime), v(rec.nextRevDateEditTime)].sort().pop() || ''
}
export function payFollowBy(rec: PaymentKeyRecord): string {
  const list = [v(rec.followActionEditBy), v(rec.revConclusionEditBy), v(rec.nextRevDateEditBy)].filter((x) => x)
  return [...new Set(list)].join('、')
}

export function buildPaymentKeyRows(
  projects: Project[], pmisMap: Record<string, ProjectPmis>,
  current: Record<string, PaymentKeyRecord>, inScopeIds: Set<string>,
): PaymentKeyRow[] {
  const prMap = new Map<string, ProjectRow>(buildProjectRows(projects, pmisMap).map((r) => [r.projectId, r]))
  return projects.filter((p) => inScopeIds.has(p.projectId)).map((p) => {
    const pr = prMap.get(p.projectId)
    const rec = current[p.projectId] ?? {}
    const contract = p.paymentPmis?.contract
    return {
      projectId: p.projectId,
      customer: pr?.customer ?? '-',
      projectName: p.projectName || p.projectId,
      projectManager: pr?.projectManager ?? '-',
      orgL4: pr?.orgL4 ?? '-',
      projectLevel: pr?.projectLevel ?? '-',
      contractWan: typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,
      paymentRatio: pr?.paymentRatio ?? null,
      paymentStatus: pr?.paymentStatus ?? '-',
      riskLevel: pr?.riskLevel ?? '无',
      openRisks: pr?.openRisks ?? 0,
      stage: pr?.stage ?? '-',
      projectType: pr?.projectType ?? '-',
      projectStatus: pr?.projectStatus ?? '-',
      health: pr?.health ?? '无数据',
      top1000: pr?.top1000 ?? '否',
      quadrant: pr?.quadrant ?? '',
      followAction: v(rec.followAction), followActionEditTime: v(rec.followActionEditTime), followActionEditBy: v(rec.followActionEditBy),
      revConclusion: v(rec.revConclusion), revConclusionEditTime: v(rec.revConclusionEditTime), revConclusionEditBy: v(rec.revConclusionEditBy),
      nextRevDate: v(rec.nextRevDate), nextRevDateEditTime: v(rec.nextRevDateEditTime), nextRevDateEditBy: v(rec.nextRevDateEditBy),
      followDate: payFollowDate(rec), followBy: payFollowBy(rec),
    }
  })
}
