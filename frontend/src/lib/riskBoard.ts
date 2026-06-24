import type { Project, ProjectPmis } from '@/types/analysis'
import type { PivotResult, PivotRow, PivotCol } from './pivot'

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

export interface RiskDimDef {
  key: 'riskLevel' | 'riskMajorCats' | 'riskMinorCats' | 'orgL4' | 'projectLevel' | 'manager' | 'industry' | 'top1000' | 'quadrant' | 'projectStatus' | 'stage' | 'health'
  label: string
  category: 'risk' | 'project'
  multi?: boolean
}
export const RISK_DIMENSIONS: RiskDimDef[] = [
  { key: 'riskLevel', label: '风险等级', category: 'risk' },
  { key: 'riskMajorCats', label: '风险大类', category: 'risk', multi: true },
  { key: 'riskMinorCats', label: '风险小类', category: 'risk', multi: true },
  { key: 'orgL4', label: 'L4组织', category: 'project' },
  { key: 'projectLevel', label: '项目级别', category: 'project' },
  { key: 'manager', label: '项目经理', category: 'project' },
  { key: 'industry', label: '行业', category: 'project' },
  { key: 'top1000', label: 'TOP1000', category: 'project' },
  { key: 'quadrant', label: '象限', category: 'project' },
  { key: 'projectStatus', label: '项目状态', category: 'project' },
  { key: 'stage', label: '项目阶段', category: 'project' },
  { key: 'health', label: '健康度', category: 'project' },
]
export const RISK_DIM_BY_KEY: Record<string, RiskDimDef> = Object.fromEntries(
  RISK_DIMENSIONS.map((d) => [d.key, d]),
)

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
  values: string[]
  rows: RiskRow[]
  projectCount: number
  hasRiskCount: number
  openRiskSum: number
  contractAmount: number
}

/** 取某行在某维的取值列表:multi 维返数组(buildRiskRows 已保证非空),单值维返 [值或'未指定'] */
function dimValuesOf(row: RiskRow, def: RiskDimDef): string[] {
  if (def.multi) {
    const arr = (row as unknown as Record<string, unknown>)[def.key] as string[] | undefined
    return arr && arr.length ? arr : ['未分类']
  }
  const raw = (row as unknown as Record<string, unknown>)[def.key]
  return [raw == null || String(raw).trim() === '' ? '未指定' : String(raw)]
}

function buildRiskGroup(key: string, values: string[], grows: RiskRow[]): RiskGroup {
  return {
    key, values, rows: grows,
    projectCount: grows.length,
    hasRiskCount: grows.filter((r) => r.riskLevel !== '无风险').length,
    openRiskSum: grows.reduce((s, r) => s + r.openRisks, 0),
    contractAmount: grows.reduce((s, r) => s + r.contractAmount, 0),
  }
}

/** 按 1..N 维分桶(桶 key=各维取值 ' / ' 连接);含 multi 维按笛卡尔积炸开(一行可计入多桶,组间重复计数);默认按项目数降序 */
export function groupRiskDims(rows: RiskRow[], dimKeys: string[]): RiskGroup[] {
  const defs = dimKeys.map((k) => RISK_DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, { values: string[]; rows: RiskRow[] }> = {}
  for (const r of rows) {
    let combos: string[][] = [[]]
    for (const d of defs) {
      const vals = dimValuesOf(r, d)
      combos = combos.flatMap((c) => vals.map((val) => [...c, val]))
    }
    for (const combo of combos) {
      const key = combo.join(' / ')
      ;(buckets[key] ||= { values: combo, rows: [] }).rows.push(r)
    }
  }
  return Object.entries(buckets)
    .map(([key, b]) => buildRiskGroup(key, b.values, b.rows))
    .sort((a, b) => b.projectCount - a.projectCount)
}

/** 单维分桶(风险统计分析用);多值维自动炸开 */
export function groupRisk(rows: RiskRow[], dimKey: RiskDimDef['key']): RiskGroup[] {
  return groupRiskDims(rows, [dimKey])
}

const mv = (g: RiskGroup, k: RiskMetricKey): number => (g[k] ?? 0) as number
/** 桶存在但指标 null→NaN(展示 '-');桶不存在为 0 */
const cellVal = (g: RiskGroup | undefined, k: RiskMetricKey): number => {
  if (!g) return 0
  const x = g[k]
  return x == null ? NaN : (x as number)
}

/** 多行多列透视(colDims 空退化单列合计),镜像 payBoardPivot */
export function riskPivot(
  rows: RiskRow[], rowDims: string[], colDims: string[], metricKey: RiskMetricKey,
): PivotResult<RiskGroup> {
  const rn = rowDims.length
  const full = groupRiskDims(rows, [...rowDims, ...colDims])
  const index: Record<string, Record<string, RiskGroup>> = {}
  const rowMap = new Map<string, string[]>()
  const colMap = new Map<string, string[]>()
  const rowTot: Record<string, number> = {}
  const colTot: Record<string, number> = {}
  for (const g of full) {
    const rowVals = g.values.slice(0, rn)
    const colVals = g.values.slice(rn)
    const rk = rowVals.join(' / ')
    const ck = colVals.join(' / ')
    rowMap.set(rk, rowVals)
    colMap.set(ck, colVals)
    ;(index[rk] ||= {})[ck] = g
    const val = mv(g, metricKey)
    rowTot[rk] = (rowTot[rk] || 0) + val
    colTot[ck] = (colTot[ck] || 0) + val
  }
  const rowKeys = [...rowMap.keys()].sort((a, b) => rowTot[b] - rowTot[a])
  const colKeys = [...colMap.keys()].sort((a, b) => colTot[b] - colTot[a])
  const prows: PivotRow[] = rowKeys.map((k) => ({ key: k, tuple: rowMap.get(k)! }))
  const pcols: PivotCol[] = colKeys.map((k) => ({ key: k, label: colDims.length ? k : '合计' }))
  const cells = prows.map((r) => pcols.map((c) => cellVal(index[r.key]?.[c.key], metricKey)))
  return {
    rowDimLabels: rowDims.map((d) => RISK_DIM_BY_KEY[d]?.label ?? d),
    colDimLabels: colDims.map((d) => RISK_DIM_BY_KEY[d]?.label ?? d),
    rows: prows, cols: pcols, cells, index,
  }
}

