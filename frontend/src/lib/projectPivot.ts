import type { Project, ProjectPmis } from '@/types/analysis'
import type { CrossMatrix, PivotResult, PivotRow, PivotCol } from './pivot'

// 项目域透视(/insight,spec 4.5):与 lib/pivot(回款节点域)并行,复用其泛型结构类型;
// 回款域 groupByDims/PivotGroup 不动,P6 归并期再议统一。

export interface InsightRow {
  projectId: string
  projectName: string
  manager: string
  stage: string
  projectStatus: string
  riskLevel: string
  industry: string
  signType: string
  health: string
  contractAmount: number
  progress: number | null
  costRatio: number | null
  expectedTotal: number
  actualTotal: number
  delayed: boolean
}

const v = (raw: unknown, fallback = '未指定') => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? fallback : s
}

export function buildInsightRows(projects: Project[], pmisMap: Record<string, ProjectPmis>): InsightRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const prog = m.progress ?? {}
    const st = m.status ?? {}
    const risk = m.risk ?? {}
    const cost = m.cost ?? {}
    const cust = m.customer ?? {}
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      manager: v(p.projectManager),
      stage: v(prog.项目阶段),
      projectStatus: v(st.项目状态),
      riskLevel: v(risk.最高等级, '无'),
      industry: v(cust.行业),
      signType: v(cust.签约形式),
      health: v(p.health?.overall, '无数据'),
      contractAmount: Number(cust.合同总额 ?? 0),
      progress: typeof prog.完工进展 === 'number' ? prog.完工进展 : null,
      costRatio: typeof cost.消耗比 === 'number' ? cost.消耗比 : null,
      expectedTotal: Number(p.payment?.expectedTotal ?? 0),
      actualTotal: Number(p.payment?.actualTotal ?? 0),
      delayed: (p.payment?.delayedCount ?? 0) > 0,
    }
  })
}

export interface InsightDimDef {
  key: 'stage' | 'projectStatus' | 'riskLevel' | 'manager' | 'industry' | 'signType' | 'health'
  label: string
}

export const INSIGHT_DIMENSIONS: InsightDimDef[] = [
  { key: 'stage', label: '阶段' },
  { key: 'projectStatus', label: '项目状态' },
  { key: 'riskLevel', label: '风险等级' },
  { key: 'manager', label: '项目经理' },
  { key: 'industry', label: '行业' },
  { key: 'signType', label: '签约形式' },
  { key: 'health', label: '健康度' },
]

export const INSIGHT_DIM_BY_KEY: Record<string, InsightDimDef> = Object.fromEntries(
  INSIGHT_DIMENSIONS.map((d) => [d.key, d]),
)

export type InsightMetricKey =
  | 'projectCount' | 'contractAmount' | 'avgProgress' | 'avgCostRatio' | 'paymentRatio' | 'delayedProjects'

export interface InsightMetricDef {
  key: InsightMetricKey
  label: string
  kind: 'money' | 'count' | 'rate'
}

export const INSIGHT_METRICS: InsightMetricDef[] = [
  { key: 'projectCount', label: '项目数', kind: 'count' },
  { key: 'contractAmount', label: '合同总额', kind: 'money' },
  { key: 'avgProgress', label: '平均完工', kind: 'rate' },
  { key: 'avgCostRatio', label: '平均消耗比', kind: 'rate' },
  { key: 'paymentRatio', label: '回款完成率', kind: 'rate' },
  { key: 'delayedProjects', label: '延期项目', kind: 'count' },
]

export const INSIGHT_METRIC_BY_KEY: Record<string, InsightMetricDef> = Object.fromEntries(
  INSIGHT_METRICS.map((m) => [m.key, m]),
)

export interface InsightGroup {
  key: string
  values: string[]
  rows: InsightRow[]
  projectCount: number
  contractAmount: number
  avgProgress: number | null
  avgCostRatio: number | null
  paymentRatio: number | null
  delayedProjects: number
}

function avg(nums: number[]): number | null {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null
}

/** 按 1..N 维分桶(桶 key=各维取值以 " / " 连接),算 6 指标;默认按项目数降序 */
export function groupInsight(rows: InsightRow[], dimKeys: string[]): InsightGroup[] {
  const defs = dimKeys.map((k) => INSIGHT_DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, InsightRow[]> = {}
  for (const r of rows) {
    const key = defs.map((d) => r[d.key]).join(' / ')
    ;(buckets[key] ||= []).push(r)
  }
  const groups = Object.entries(buckets).map(([key, grows]) => {
    const exp = grows.reduce((s, r) => s + r.expectedTotal, 0)
    const act = grows.reduce((s, r) => s + r.actualTotal, 0)
    return {
      key,
      values: defs.map((d) => grows[0][d.key]),
      rows: grows,
      projectCount: grows.length,
      contractAmount: grows.reduce((s, r) => s + r.contractAmount, 0),
      avgProgress: avg(grows.map((r) => r.progress).filter((x): x is number => x != null)),
      avgCostRatio: avg(grows.map((r) => r.costRatio).filter((x): x is number => x != null)),
      paymentRatio: exp > 0 ? act / exp : null,
      delayedProjects: grows.filter((r) => r.delayed).length,
    }
  })
  return groups.sort((a, b) => b.projectCount - a.projectCount)
}

const mv = (g: InsightGroup, k: InsightMetricKey): number => (g[k] ?? 0) as number

/** 双维交叉(复用 pivot 泛型结构):行列按指标合计降序,rate 指标 null→0 计 */
export function insightCross(
  rows: InsightRow[], rowDim: string, colDim: string, metricKey: InsightMetricKey,
): CrossMatrix<InsightGroup> {
  const groups = groupInsight(rows, [rowDim, colDim])
  const index: Record<string, Record<string, InsightGroup>> = {}
  const rowTot: Record<string, number> = {}
  const colTot: Record<string, number> = {}
  for (const g of groups) {
    const [rv, cv] = g.values
    const val = mv(g, metricKey)
    ;(index[rv] ||= {})[cv] = g
    rowTot[rv] = (rowTot[rv] || 0) + val
    colTot[cv] = (colTot[cv] || 0) + val
  }
  const rws = Object.keys(rowTot).sort((a, b) => rowTot[b] - rowTot[a])
  const cols = Object.keys(colTot).sort((a, b) => colTot[b] - colTot[a])
  const cells = rws.map((rv) => cols.map((cv) => (index[rv]?.[cv] ? mv(index[rv][cv], metricKey) : 0)))
  return { rows: rws, cols, cells, index }
}

/** 多行多列透视(colDims 空退化单列合计) */
export function insightPivot(
  rows: InsightRow[], rowDims: string[], colDims: string[], metricKey: InsightMetricKey,
): PivotResult<InsightGroup> {
  const rn = rowDims.length
  const full = groupInsight(rows, [...rowDims, ...colDims])
  const index: Record<string, Record<string, InsightGroup>> = {}
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
  const cells = prows.map((r) => pcols.map((c) => (index[r.key]?.[c.key] ? mv(index[r.key][c.key], metricKey) : 0)))
  return {
    rowDimLabels: rowDims.map((d) => INSIGHT_DIM_BY_KEY[d]?.label ?? d),
    colDimLabels: colDims.map((d) => INSIGHT_DIM_BY_KEY[d]?.label ?? d),
    rows: prows,
    cols: pcols,
    cells,
    index,
  }
}
