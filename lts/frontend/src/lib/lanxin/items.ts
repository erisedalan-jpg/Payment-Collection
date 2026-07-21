import { riskReasons } from '@/lib/riskReasons'
import type { Project, ProjectPmis } from '@/types/analysis'

/** 待推事项。前端只回答「哪些项目有什么异常」;「发给谁」由后端解析花名册决定。 */
export type PushItem = { kind: 'project'; projectId: string; reasons: string[] }

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
