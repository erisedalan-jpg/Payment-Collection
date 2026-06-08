import type { RawNode } from '@/types/analysis'
import { groupByProject, type ProjectAgg } from './dashboardStats'

export interface DimDef {
  key: string
  label: string
  valueOf: (n: Record<string, any>) => string
}

const v = (raw: unknown) => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? '未指定' : s
}

export const DIMENSIONS: DimDef[] = [
  { key: 'orgL4', label: '服务组(L4)', valueOf: (n) => v(n.orgL4) },
  { key: 'orgL3', label: 'L3部门', valueOf: (n) => v(n.orgL3) },
  { key: 'projectManager', label: '项目经理', valueOf: (n) => v(n.projectManager) },
  { key: 'projectType', label: '项目类型', valueOf: (n) => v(n.projectType) },
  { key: 'signUnit', label: '签约单位', valueOf: (n) => v(n.signUnit) },
  { key: 'tier', label: '金额档位', valueOf: (n) => v(n.tier) },
]

export const DIM_BY_KEY: Record<string, DimDef> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.key, d]),
)

export interface PivotGroup {
  key: string
  values: string[]
  projectCount: number
  expectedAmount: number
  actualAmount: number
  remainingAmount: number
  completionRate: number
  delayedCount: number
  delayRate: number
  projects: ProjectAgg[]
}

/** 按 1..N 个维度分桶（桶 key = 各维取值以 " / " 连接），每桶用 groupByProject 算项目级指标。
 *  默认按已回款金额降序。本期单维使用，接口 N 维可扩展。 */
export function groupByDims(nodes: RawNode[], dimKeys: string[]): PivotGroup[] {
  const defs = dimKeys.map((k) => DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, RawNode[]> = {}
  for (const raw of nodes) {
    const n = raw as Record<string, any>
    const key = defs.map((d) => d.valueOf(n)).join(' / ')
    ;(buckets[key] ||= []).push(raw)
  }
  const groups = Object.entries(buckets).map(([key, gnodes]) => {
    const first = gnodes[0] as Record<string, any>
    const projects = groupByProject(gnodes)
    const expectedAmount = projects.reduce((s, p) => s + (p.expectedPayment || 0), 0)
    const actualAmount = projects.reduce((s, p) => s + (p.actualPayment || 0), 0)
    const delayedCount = projects.filter((p) => p.paymentStatus === '延期').length
    const projectCount = projects.length
    return {
      key,
      values: defs.map((d) => d.valueOf(first)),
      projectCount,
      expectedAmount,
      actualAmount,
      remainingAmount: expectedAmount - actualAmount,
      completionRate: expectedAmount > 0 ? actualAmount / expectedAmount : 0,
      delayedCount,
      delayRate: projectCount > 0 ? delayedCount / projectCount : 0,
      projects,
    }
  })
  return groups.sort((a, b) => b.actualAmount - a.actualAmount)
}

export interface MetricDef {
  key: 'actualAmount' | 'expectedAmount' | 'remainingAmount' | 'completionRate' | 'projectCount' | 'delayedCount'
  label: string
  kind: 'money' | 'count' | 'rate'
}

export const METRICS: MetricDef[] = [
  { key: 'actualAmount', label: '已回款', kind: 'money' },
  { key: 'expectedAmount', label: '计划回款', kind: 'money' },
  { key: 'remainingAmount', label: '待回款', kind: 'money' },
  { key: 'completionRate', label: '完成率', kind: 'rate' },
  { key: 'projectCount', label: '项目数', kind: 'count' },
  { key: 'delayedCount', label: '延期数', kind: 'count' },
]

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
)

export interface CrossMatrix {
  rows: string[]
  cols: string[]
  cells: number[][]
  index: Record<string, Record<string, PivotGroup>>
}

/** 双维透视：行=rowDim 取值、列=colDim 取值、格=所选指标值（无该交叉组则 0）。
 *  行/列按各自指标合计降序。index 保留每格 PivotGroup 供下钻。 */
export function crossMatrix(
  nodes: RawNode[],
  rowDim: string,
  colDim: string,
  metricKey: MetricDef['key'],
): CrossMatrix {
  const groups = groupByDims(nodes, [rowDim, colDim])
  const index: Record<string, Record<string, PivotGroup>> = {}
  const rowTotals: Record<string, number> = {}
  const colTotals: Record<string, number> = {}
  for (const g of groups) {
    const [rv, cv] = g.values
    const val = g[metricKey] as number
    ;(index[rv] ||= {})[cv] = g
    rowTotals[rv] = (rowTotals[rv] || 0) + val
    colTotals[cv] = (colTotals[cv] || 0) + val
  }
  const rows = Object.keys(rowTotals).sort((a, b) => rowTotals[b] - rowTotals[a])
  const cols = Object.keys(colTotals).sort((a, b) => colTotals[b] - colTotals[a])
  const cells = rows.map((rv) => cols.map((cv) => (index[rv]?.[cv]?.[metricKey] as number) ?? 0))
  return { rows, cols, cells, index }
}

export interface PivotRow {
  tuple: string[]
  key: string
}
export interface PivotCol {
  label: string
  key: string
}
export interface PivotResult {
  rowDimLabels: string[]
  colDimLabels: string[]
  rows: PivotRow[]
  cols: PivotCol[]
  cells: number[][]
  index: Record<string, Record<string, PivotGroup>>
}

/** 多行多列透视：行=rowDims 组合、列=colDims 组合、格=metric;按行/列指标合计降序。
 *  colDims 为空时列退化为单列「合计」。index 保留每格 PivotGroup 供下钻。 */
export function pivotTable(
  nodes: RawNode[],
  rowDims: string[],
  colDims: string[],
  metricKey: MetricDef['key'],
): PivotResult {
  const rn = rowDims.length
  const full = groupByDims(nodes, [...rowDims, ...colDims])
  const index: Record<string, Record<string, PivotGroup>> = {}
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
    const v = g[metricKey] as number
    rowTot[rk] = (rowTot[rk] || 0) + v
    colTot[ck] = (colTot[ck] || 0) + v
  }
  const rowKeys = [...rowMap.keys()].sort((a, b) => rowTot[b] - rowTot[a])
  const colKeys = [...colMap.keys()].sort((a, b) => colTot[b] - colTot[a])
  const rows: PivotRow[] = rowKeys.map((k) => ({ key: k, tuple: rowMap.get(k)! }))
  const cols: PivotCol[] = colKeys.map((k) => ({ key: k, label: colDims.length ? k : '合计' }))
  const cells = rows.map((r) => cols.map((c) => (index[r.key]?.[c.key]?.[metricKey] as number) ?? 0))
  return {
    rowDimLabels: rowDims.map((d) => DIM_BY_KEY[d]?.label ?? d),
    colDimLabels: colDims.map((d) => DIM_BY_KEY[d]?.label ?? d),
    rows,
    cols,
    cells,
    index,
  }
}
