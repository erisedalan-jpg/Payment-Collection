import type { Project, ProjectPmis, Paymentnodes, Paymentrecords } from '@/types/analysis'
import type { CrossMatrix, PivotResult, PivotRow, PivotCol } from './pivot'
import { deriveTier, deriveProgress, deriveDept, deriveStage } from './paymentPmis'
import { paymentPmisInRange } from './paymentRange'

// 回款看板透视(/board,2B):镜像 projectPivot(/insight 项目级透视),复用 lib/pivot 泛型结构类型;
// 数据底座改用 PMIS 项目级指标(paymentPmis),回款节点域 lib/pivot 不动。

const v = (raw: unknown, fallback = '未指定') => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? fallback : s
}

export interface PayBoardRow {
  projectId: string
  projectName: string
  orgL4: string
  projectManager: string
  dept: string
  stage: string
  manager: string
  industry: string
  tier: string
  progress: string
  contract: number
  actualTotal: number
  expectedTotal: number
  remainingTotal: number
  delayedCount: number
  paymentRatio: number | null
  projectAmount: number
  paymentStatus: string
}

export function buildPayBoardRows(
  projects: Project[],
  pmisMap?: Record<string, ProjectPmis>,
  paymentNodes?: Paymentnodes,
  paymentRecords?: Paymentrecords,
  start = '',
  end = '',
): PayBoardRow[] {
  return projects.map((p) => {
    const pmis = p.paymentPmis ?? null
    const cust = (pmisMap?.[p.projectId]?.customer ?? {}) as Record<string, unknown>
    const dept = deriveDept(p)
    const manager = v(p.projectManager)
    const rp = paymentPmisInRange(
      pmis?.contract ?? 0,
      paymentNodes?.[p.projectId],
      paymentRecords?.[p.projectId]?.records,
      start,
      end,
    )
    const progress = deriveProgress(rp.contract, rp.paymentRatio)
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      orgL4: dept,
      projectManager: manager,
      dept,
      stage: deriveStage(p.projectId, pmisMap),
      manager,
      industry: v(cust['行业']),
      tier: deriveTier(rp.contract),
      progress,
      contract: rp.contract,
      actualTotal: rp.actualTotal,
      expectedTotal: rp.expectedTotal,
      remainingTotal: rp.remainingTotal,
      delayedCount: rp.delayedCount,
      paymentRatio: rp.paymentRatio,
      projectAmount: rp.contract,
      paymentStatus: progress,
    }
  })
}

export interface PayBoardDimDef {
  key: 'dept' | 'stage' | 'manager' | 'industry' | 'tier' | 'progress'
  label: string
}
export const PAY_BOARD_DIMENSIONS: PayBoardDimDef[] = [
  { key: 'dept', label: '部门' },
  { key: 'stage', label: '阶段' },
  { key: 'manager', label: '项目经理' },
  { key: 'industry', label: '行业' },
  { key: 'tier', label: '金额档' },
  { key: 'progress', label: '进度态' },
]
export const PAY_BOARD_DIM_BY_KEY: Record<string, PayBoardDimDef> = Object.fromEntries(
  PAY_BOARD_DIMENSIONS.map((d) => [d.key, d]),
)

export type PayBoardMetricKey =
  | 'projectCount' | 'contractSum' | 'actualSum' | 'expectedSum' | 'pendingSum' | 'rate' | 'delayedNodeSum'
export interface PayBoardMetricDef {
  key: PayBoardMetricKey
  label: string
  kind: 'count' | 'money' | 'rate'
}
export const PAY_BOARD_METRICS: PayBoardMetricDef[] = [
  { key: 'projectCount', label: '项目数', kind: 'count' },
  { key: 'contractSum', label: '合同总额', kind: 'money' },
  { key: 'actualSum', label: '已回款', kind: 'money' },
  { key: 'expectedSum', label: '计划回款', kind: 'money' },
  { key: 'pendingSum', label: '待回款', kind: 'money' },
  { key: 'rate', label: '完成率', kind: 'rate' },
  { key: 'delayedNodeSum', label: '延期节点数', kind: 'count' },
]
export const PAY_BOARD_METRIC_BY_KEY: Record<string, PayBoardMetricDef> = Object.fromEntries(
  PAY_BOARD_METRICS.map((m) => [m.key, m]),
)

export interface PayBoardGroup {
  key: string
  values: string[]
  rows: PayBoardRow[]
  projectCount: number
  contractSum: number
  actualSum: number
  expectedSum: number
  pendingSum: number
  rate: number | null
  delayedNodeSum: number
}

function buildGroup(key: string, values: string[], grows: PayBoardRow[]): PayBoardGroup {
  const contractSum = grows.reduce((s, r) => s + r.contract, 0)
  const actualSum = grows.reduce((s, r) => s + r.actualTotal, 0)
  const expectedSum = grows.reduce((s, r) => s + r.expectedTotal, 0)
  return {
    key,
    values,
    rows: grows,
    projectCount: grows.length,
    contractSum,
    actualSum,
    expectedSum,
    pendingSum: grows.reduce((s, r) => s + r.remainingTotal, 0),
    rate: expectedSum > 0 ? actualSum / expectedSum : null,
    delayedNodeSum: grows.reduce((s, r) => s + r.delayedCount, 0),
  }
}

/** 按 1..N 维分桶(桶 key=各维取值以 " / " 连接),算 7 指标(加权完成率 Σ÷Σ);默认按项目数降序 */
export function groupPayBoard(rows: PayBoardRow[], dimKeys: string[]): PayBoardGroup[] {
  const defs = dimKeys.map((k) => PAY_BOARD_DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, PayBoardRow[]> = {}
  for (const r of rows) {
    const key = defs.map((d) => r[d.key]).join(' / ')
    ;(buckets[key] ||= []).push(r)
  }
  return Object.entries(buckets)
    .map(([key, grows]) => buildGroup(key, defs.map((d) => grows[0][d.key]), grows))
    .sort((a, b) => b.projectCount - a.projectCount)
}

const mv = (g: PayBoardGroup, k: PayBoardMetricKey): number => (g[k] ?? 0) as number

/** 矩阵/透视格值:桶存在但 rate 指标无数据(null)用 NaN 标记,展示层显 '-'(区别于真实 0%);
 *  桶不存在为 0。排序/合计仍走 mv(??0),NaN 不参与。 */
const cellVal = (g: PayBoardGroup | undefined, k: PayBoardMetricKey): number => {
  if (!g) return 0
  const x = g[k]
  return x == null ? NaN : (x as number)
}

/** 双维交叉(复用 pivot 泛型结构):行列按指标合计降序,rate 指标 null→0 计 */
export function payBoardCross(
  rows: PayBoardRow[], rowDim: string, colDim: string, metricKey: PayBoardMetricKey,
): CrossMatrix<PayBoardGroup> {
  const groups = groupPayBoard(rows, [rowDim, colDim])
  const index: Record<string, Record<string, PayBoardGroup>> = {}
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
  const cells = rws.map((rv) => cols.map((cv) => cellVal(index[rv]?.[cv], metricKey)))
  return { rows: rws, cols, cells, index }
}

/** 多行多列透视(colDims 空退化单列合计) */
export function payBoardPivot(
  rows: PayBoardRow[], rowDims: string[], colDims: string[], metricKey: PayBoardMetricKey,
): PivotResult<PayBoardGroup> {
  const rn = rowDims.length
  const full = groupPayBoard(rows, [...rowDims, ...colDims])
  const index: Record<string, Record<string, PayBoardGroup>> = {}
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
    rowDimLabels: rowDims.map((d) => PAY_BOARD_DIM_BY_KEY[d]?.label ?? d),
    colDimLabels: colDims.map((d) => PAY_BOARD_DIM_BY_KEY[d]?.label ?? d),
    rows: prows,
    cols: pcols,
    cells,
    index,
  }
}
