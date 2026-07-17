import { riskReasons } from '@/lib/riskReasons'
import { ISSUE_LABELS, type IssueRow } from '@/lib/yitian/compliance'
import type { Project, ProjectPmis } from '@/types/analysis'

/** 待推事项。前端只回答「哪些项目/工时行有什么异常」;「发给谁」由后端解析花名册决定
 *  —— 后端不接受前端传来的 staffId,前端出错最多是算错异常,不会推给错的人。 */
export type PushItem =
  | { kind: 'project'; projectId: string; reasons: string[] }
  | { kind: 'timesheet'; employId: string; issues: { code: string; label: string; count: number }[] }

/** 项目关注原因 → 事项。口径复用 riskReasons(单一来源),此处只做「配置勾选」过滤。 */
export function projectItems(
  projects: Project[],
  projectPmis: Record<string, ProjectPmis>,
  allowedReasons: string[],
): PushItem[] {
  const allow = new Set(allowedReasons)
  const out: PushItem[] = []
  for (const p of projects) {
    const reasons = riskReasons(p, projectPmis[p.projectId])
      .map((r) => r.category as string)
      .filter((c) => allow.has(c))
    if (reasons.length) out.push({ kind: 'project', projectId: p.projectId, reasons })
  }
  return out
}

/** 工时问题 → 事项。按工号聚合、按问题码计数;label 一并带上,后端组卡不必再查表。 */
export function timesheetItems(rows: IssueRow[], allowedCodes: string[]): PushItem[] {
  const allow = new Set(allowedCodes)
  const byEmp = new Map<string, Map<string, number>>()
  for (const r of rows) {
    for (const code of r.codes) {
      if (!allow.has(code)) continue
      const m = byEmp.get(r.empId) ?? new Map<string, number>()
      m.set(code, (m.get(code) ?? 0) + 1)
      byEmp.set(r.empId, m)
    }
  }
  return [...byEmp.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([employId, m]) => ({
      kind: 'timesheet' as const,
      employId,
      issues: [...m.entries()].map(([code, count]) => ({
        code, label: ISSUE_LABELS[code] ?? code, count,
      })),
    }))
}
