import type { Project, ProjectPmis } from '@/types/analysis'

export type RiskLevel = '高' | '中' | '低' | '无风险'
const RISK_RANK: Record<string, number> = { 高: 3, 中: 2, 低: 1 }

const v = (raw: unknown, fallback = '未指定'): string => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? fallback : s
}

/** 未关闭风险记录(风险状态不含"已关闭") */
function openRecords(pmis: ProjectPmis | undefined): Array<Record<string, unknown>> {
  const recs = (pmis?.riskRecords ?? []) as Array<Record<string, unknown>>
  return recs.filter((r) => !String(r['风险状态'] ?? '').includes('已关闭'))
}

export function openRiskCount(pmis: ProjectPmis | undefined): number {
  return openRecords(pmis).length
}

/** 仅看未关闭风险:取未关闭记录里最高等级(高>中>低);无未关闭分级风险→无风险 */
export function projectRiskLevel(pmis: ProjectPmis | undefined): RiskLevel {
  let best = 0
  for (const r of openRecords(pmis)) {
    const rank = RISK_RANK[String(r['风险等级'] ?? '').trim()] ?? 0
    if (rank > best) best = rank
  }
  return best === 3 ? '高' : best === 2 ? '中' : best === 1 ? '低' : '无风险'
}

export interface RiskRow {
  projectId: string
  projectName: string
  orgL4: string
  projectLevel: string
  manager: string
  industry: string
  riskLevel: RiskLevel
  openRisks: number
  contractAmount: number
}

export function buildRiskRows(projects: Project[], pmisMap: Record<string, ProjectPmis>): RiskRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as ProjectPmis
    const st = (m.status ?? {}) as Record<string, unknown>
    const cust = (m.customer ?? {}) as Record<string, unknown>
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      orgL4: v(p.orgL4),
      projectLevel: v(st['项目级别']),
      manager: v(p.projectManager),
      industry: v(cust['行业']),
      riskLevel: projectRiskLevel(m),
      openRisks: openRiskCount(m),
      contractAmount: Number(cust['合同总额'] ?? 0),
    }
  })
}

export interface RiskSummary {
  total: number
  noRisk: number
  high: number
  mid: number
  low: number
  hasRisk: number
  healthPct: number | null
}

export function riskSummary(rows: RiskRow[]): RiskSummary {
  let noRisk = 0, high = 0, mid = 0, low = 0
  for (const r of rows) {
    if (r.riskLevel === '高') high++
    else if (r.riskLevel === '中') mid++
    else if (r.riskLevel === '低') low++
    else noRisk++
  }
  const total = rows.length
  const hasRisk = high + mid + low
  return { total, noRisk, high, mid, low, hasRisk, healthPct: total > 0 ? noRisk / total : null }
}
