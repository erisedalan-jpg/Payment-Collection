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
  top1000: string
  quadrant: string
  projectStatus: string
  stage: string
  health: string
  riskMajorCats: string[]
  riskMinorCats: string[]
  riskLevel: RiskLevel
  openRisks: number
  contractAmount: number
}

/** 未关闭记录去重的某分类字段值;无未关闭风险→['无风险'];有未关闭但全空→['未分类'] */
function openCats(pmis: ProjectPmis | undefined, field: string): string[] {
  const open = openRecords(pmis)
  if (!open.length) return ['无风险']
  const cats = [...new Set(open.map((r) => String(r[field] ?? '').trim()).filter((x) => x))]
  return cats.length ? cats : ['未分类']
}

export function buildRiskRows(projects: Project[], pmisMap: Record<string, ProjectPmis>): RiskRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as ProjectPmis
    const st = (m.status ?? {}) as Record<string, unknown>
    const prog = (m.progress ?? {}) as Record<string, unknown>
    const cust = (m.customer ?? {}) as Record<string, unknown>
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      orgL4: v(p.orgL4),
      projectLevel: v(st['项目级别']),
      manager: v(p.projectManager),
      industry: v(cust['行业']),
      top1000: v(p.top1000, '否'),
      quadrant: v(p.quadrant),
      projectStatus: v(st['项目状态']),
      stage: v(prog['项目阶段']),
      health: v((p.health as { overall?: string } | undefined)?.overall, '无数据'),
      riskMajorCats: openCats(m, '风险大类'),
      riskMinorCats: openCats(m, '风险小类'),
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

export interface RiskDimDef { key: 'riskLevel' | 'orgL4' | 'projectLevel' | 'manager' | 'industry' | 'top1000' | 'quadrant'; label: string }
export const RISK_DIMENSIONS: RiskDimDef[] = [
  { key: 'riskLevel', label: '风险等级' },
  { key: 'orgL4', label: 'L4组织' },
  { key: 'projectLevel', label: '项目级别' },
  { key: 'manager', label: '项目经理' },
  { key: 'industry', label: '行业' },
  { key: 'top1000', label: 'TOP1000' },
  { key: 'quadrant', label: '象限' },
]

export type RiskMetricKey = 'projectCount' | 'hasRiskCount' | 'openRiskSum' | 'contractAmount'
export interface RiskMetricDef { key: RiskMetricKey; label: string; kind: 'count' | 'money' }
export const RISK_METRICS: RiskMetricDef[] = [
  { key: 'projectCount', label: '项目数', kind: 'count' },
  { key: 'hasRiskCount', label: '有风险项目数', kind: 'count' },
  { key: 'openRiskSum', label: '未关闭风险数', kind: 'count' },
  { key: 'contractAmount', label: '合同总额', kind: 'money' },
]

export interface RiskGroup {
  key: string
  rows: RiskRow[]
  projectCount: number
  hasRiskCount: number
  openRiskSum: number
  contractAmount: number
}

export function groupRisk(rows: RiskRow[], dimKey: RiskDimDef['key']): RiskGroup[] {
  const buckets: Record<string, RiskRow[]> = {}
  for (const r of rows) {
    const key = String(r[dimKey])
    ;(buckets[key] ||= []).push(r)
  }
  return Object.entries(buckets)
    .map(([key, grows]) => ({
      key,
      rows: grows,
      projectCount: grows.length,
      hasRiskCount: grows.filter((r) => r.riskLevel !== '无风险').length,
      openRiskSum: grows.reduce((s, r) => s + r.openRisks, 0),
      contractAmount: grows.reduce((s, r) => s + r.contractAmount, 0),
    }))
    .sort((a, b) => b.projectCount - a.projectCount)
}

export interface RiskOverviewRow {
  key: string
  高: number
  中: number
  低: number
  无风险: number
  total: number
  healthPct: number | null
}

export function riskOverview(rows: RiskRow[], dimKey: RiskDimDef['key']): RiskOverviewRow[] {
  const buckets: Record<string, RiskRow[]> = {}
  for (const r of rows) {
    const key = String(r[dimKey])
    ;(buckets[key] ||= []).push(r)
  }
  return Object.entries(buckets)
    .map(([key, grows]) => {
      const c = { 高: 0, 中: 0, 低: 0, 无风险: 0 }
      for (const r of grows) c[r.riskLevel]++
      const total = grows.length
      return { key, 高: c.高, 中: c.中, 低: c.低, 无风险: c.无风险, total, healthPct: total > 0 ? c.无风险 / total : null }
    })
    .sort((a, b) => b.total - a.total)
}
