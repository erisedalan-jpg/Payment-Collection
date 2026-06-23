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
  // 遗留维度字段：manager/tier/progress 已从 PAY_BOARD_DIMENSIONS 移除，不可作为分组维度键传入
  // groupPayBoard；保留此处是为了兼容 BoardDrilldownModal 等既有消费方，请勿新增依赖此三字段的分组逻辑。
  manager: string
  industry: string
  tier: string
  progress: string
  projectLevel: string
  tags: string[]
  contract: number
  actualTotal: number
  expectedTotal: number
  remainingTotal: number
  delayedCount: number
  paymentRatio: number | null
  // 遗留字段：projectAmount 与 paymentStatus 同为旧维度退场后保留的冗余字段，仅供既有消费方读取。
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
  tagAssignments?: Record<string, string[]>,
): PayBoardRow[] {
  return projects.map((p) => {
    const pmis = p.paymentPmis ?? null
    const cust = (pmisMap?.[p.projectId]?.customer ?? {}) as Record<string, unknown>
    const stat = (pmisMap?.[p.projectId]?.status ?? {}) as Record<string, unknown>
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
      projectLevel: v(stat['项目级别']),
      tags: tagAssignments?.[p.projectId] ?? [],
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
  key: 'dept' | 'projectLevel' | 'industry' | 'stage' | 'tag'
  label: string
  multi?: boolean   // tag 为 true：分组时按标签炸开
}
export const PAY_BOARD_DIMENSIONS: PayBoardDimDef[] = [
  { key: 'dept', label: 'L4部门' },
  { key: 'projectLevel', label: '项目级别' },
  { key: 'industry', label: '行业' },
  { key: 'stage', label: '项目阶段' },
  { key: 'tag', label: '标签', multi: true },
]
export const PAY_BOARD_DIM_BY_KEY: Record<string, PayBoardDimDef> = Object.fromEntries(
  PAY_BOARD_DIMENSIONS.map((d) => [d.key, d]),
)

export type PayBoardMetricKey =
  | 'projectCount' | 'contractSum' | 'expectedSum' | 'rate' | 'delayedNodeSum'
export interface PayBoardMetricDef {
  key: PayBoardMetricKey
  label: string
  kind: 'count' | 'money' | 'rate'
}
export const PAY_BOARD_METRICS: PayBoardMetricDef[] = [
  { key: 'projectCount', label: '项目数', kind: 'count' },
  { key: 'contractSum', label: '合同总额', kind: 'money' },
  { key: 'expectedSum', label: '计划回款', kind: 'money' },
  { key: 'rate', label: '完成率', kind: 'rate' },
  { key: 'delayedNodeSum', label: '延期节点', kind: 'count' },
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
    rate: contractSum > 0 ? actualSum / contractSum : null,
    delayedNodeSum: grows.reduce((s, r) => s + r.delayedCount, 0),
  }
}

/** 取某行在某维的取值列表：multi 维(tag)可多值(空→['无标签'])，其余维恒单值 */
function dimValuesOf(row: PayBoardRow, def: PayBoardDimDef): string[] {
  if (def.multi) {
    const arr = row.tags
    return arr && arr.length ? arr : ['无标签']
  }
  const raw = (row as unknown as Record<string, unknown>)[def.key]
  return [raw == null || String(raw).trim() === '' ? '未指定' : String(raw)]
}

/** 按 1..N 维分桶(桶 key=各维取值 ' / ' 连接),算指标(加权完成率 Σ÷Σ);默认按项目数降序。
 *  含 multi 维(tag)时按各维取值笛卡尔积炸开,一行可计入多桶(标准多标签 faceting,组间重复计数);
 *  非 multi 维全程每行每维恰一值,笛卡尔积退化为现状(零回归)。 */
export function groupPayBoard(rows: PayBoardRow[], dimKeys: string[]): PayBoardGroup[] {
  const defs = dimKeys.map((k) => PAY_BOARD_DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, { values: string[]; rows: PayBoardRow[] }> = {}
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
    .map(([key, b]) => buildGroup(key, b.values, b.rows))
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

export type PayBoardSortKey = 'projectCount' | 'contractSum' | 'rate' | 'delayedNodeSum'
export const PAY_BOARD_SORTS: { key: PayBoardSortKey; label: string }[] = [
  { key: 'projectCount', label: '项目数' },
  { key: 'contractSum', label: '合同金额' },
  { key: 'rate', label: '完成率' },
  { key: 'delayedNodeSum', label: '延期节点' },
]

/** 按 key 降序排序分组副本;rate 为 null 视作 -Infinity(排末尾)。不改入参。 */
export function sortPayBoardGroups(groups: PayBoardGroup[], key: PayBoardSortKey): PayBoardGroup[] {
  const val = (g: PayBoardGroup): number => {
    const x = g[key]
    return x == null ? -Infinity : (x as number)
  }
  return [...groups].sort((a, b) => val(b) - val(a))
}
