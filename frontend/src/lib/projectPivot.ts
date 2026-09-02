import type { Project, ProjectPmis } from '@/types/analysis'
import type { CrossMatrix, PivotResult, PivotRow, PivotCol } from './pivot'
import { isAnomalous } from './anomaly'
import { aggregateRate } from './paymentRate'

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
  orgL4: string
  projectLevel: string
  overspend: string // '是' | '否'(维度用字符串值)
  paused: string    // '是' | '否'
  top1000: string   // '是' | '否'
  quadrant: string  // 象限 M1/M2/M3/M4 或 '未指定'
  contractAmount: number
  /** 流水净额(paymentPmis.actualTotal)。回款完成率的分子用它,与全站主口径同源;
   *  actualTotal 是【节点已收】,两者不是一回事,勿混用。 */
  recordTotal: number
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

/** 行保留全部项目；异常项目(isAnomalous)的回款列(expectedTotal/actualTotal/delayed)置 0/false，
 *  使其不污染回款指标聚合，但行本身与非回款列(成本/进度等)正常保留。 */
export function buildInsightRows(projects: Project[], pmisMap: Record<string, ProjectPmis>): InsightRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const prog = m.progress ?? {}
    const st = m.status ?? {}
    const risk = m.risk ?? {}
    const cost = m.cost ?? {}
    const cust = m.customer ?? {}
    const anomalous = isAnomalous(p)
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      manager: v(p.projectManager),
      stage: v(prog.项目阶段),
      projectStatus: v(st.项目状态),
      riskLevel: v(risk.最高等级, '无'),
      industry: v(cust.行业),
      signType: v(cust.签约单位),
      health: v(p.health?.overall, '无数据'),
      orgL4: v(p.orgL4),
      projectLevel: v(st.项目级别),
      overspend: cost.项目超支 === true ? '是' : '否',
      paused: st.是否暂停 === true ? '是' : '否',
      top1000: v(p.top1000, '否'),
      quadrant: v(p.quadrant),
      // 分母取 paymentPmis.contract(售前已回退到原项目),不取 customer.合同总额 ——
      // 后者对售前项目为空,而其节点已收照样计入分子,导致本页「回款完成率」系统性
      // 超过 100%(2026-08-03 实测全域 107.57%,11 个 L4 桶中 8 个 >100%,最高 424.9%)。
      // 生产 676 个在建项目里 373 个(55%)是售前,故这不是边角情形。
      contractAmount: Number(p.paymentPmis?.contract ?? 0),
      progress: typeof prog.完工进展 === 'number' ? prog.完工进展 : null,
      costRatio: typeof cost.消耗比 === 'number' ? cost.消耗比 : null,
      // 异常项目回款列置 0/false，不参与回款指标聚合
      expectedTotal: anomalous ? 0 : Number(p.payment?.expectedTotal ?? 0),
      actualTotal: anomalous ? 0 : Number(p.payment?.nodeActualTotal ?? 0),
      recordTotal: anomalous ? 0 : Number(p.paymentPmis?.actualTotal ?? 0),
      delayed: anomalous ? false : (p.payment?.delayedCount ?? 0) > 0,
    }
  })
}

export interface InsightDimDef {
  key: 'stage' | 'projectStatus' | 'riskLevel' | 'manager' | 'orgL4' | 'projectLevel' | 'industry' | 'signType' | 'health' | 'overspend' | 'paused' | 'top1000' | 'quadrant'
  label: string
}

// 当前 13 维:含服务组/项目级别/超支/暂停/TOP1000/象限等前端直取维,已去掉"评级"维。
export const INSIGHT_DIMENSIONS: InsightDimDef[] = [
  { key: 'stage', label: '阶段' },
  { key: 'projectStatus', label: '项目状态' },
  { key: 'riskLevel', label: '风险等级' },
  { key: 'manager', label: '项目经理' },
  { key: 'orgL4', label: '服务组' },
  { key: 'projectLevel', label: '项目级别' },
  { key: 'industry', label: '行业' },
  { key: 'signType', label: '签约单位' },
  { key: 'health', label: '健康度' },
  { key: 'overspend', label: '超支' },
  { key: 'paused', label: '暂停' },
  { key: 'top1000', label: 'TOP1000' },
  { key: 'quadrant', label: '象限' },
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
  { key: 'delayedProjects', label: '延期项目数', kind: 'count' },
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
    // 比率分子用流水净额、分母用合同 —— 与 CLAUDE.md 的全站统一口径同源。
    // 分子分母恒同一集合(contract>0);无合同的项目不进分子,治理页单列。见 lib/paymentRate.ts
    //
    // 这里【不】聚合 r.actualTotal(节点已收):本组既不返回它,InsightGroup 也没有这个字段,
    // 下钻弹窗只显示 recordTotal。原先有一行 `const act = ...` 连同一句「act 仍用于
    // 『已收金额』这类展示指标」的注释,但那个变量从来没被用过(V4.5.15 起即如此),
    // 注释是错的 —— 留着会让人以为节点口径在本页有出口。要加「已收金额」指标时,
    // 先决定它取流水还是节点,再在 InsightGroup 里正式加字段。
    const rated = aggregateRate(grows, (r) => r.contractAmount, (r) => r.recordTotal)
    const contractAmount = rated.contractSum
    return {
      key,
      values: defs.map((d) => grows[0][d.key]),
      rows: grows,
      projectCount: grows.length,
      contractAmount,
      avgProgress: avg(grows.map((r) => r.progress).filter((x): x is number => x != null)),
      avgCostRatio: avg(grows.map((r) => r.costRatio).filter((x): x is number => x != null)),
      paymentRatio: rated.rate,
      delayedProjects: grows.filter((r) => r.delayed).length,
    }
  })
  return groups.sort((a, b) => b.projectCount - a.projectCount)
}

const mv = (g: InsightGroup, k: InsightMetricKey): number => (g[k] ?? 0) as number

/** 矩阵/透视格值:桶存在但 rate 指标无数据(null)用 NaN 标记,展示层显 '-'(区别于真实 0%);
 *  桶不存在为 0(组件 has() 已置灰)。排序/合计仍走 mv(??0),NaN 不参与。 */
const cellVal = (g: InsightGroup | undefined, k: InsightMetricKey): number => {
  if (!g) return 0
  const v = g[k]
  return v == null ? NaN : (v as number)
}

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
  const cells = rws.map((rv) => cols.map((cv) => cellVal(index[rv]?.[cv], metricKey)))
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
  const cells = prows.map((r) => pcols.map((c) => cellVal(index[r.key]?.[c.key], metricKey)))
  return {
    rowDimLabels: rowDims.map((d) => INSIGHT_DIM_BY_KEY[d]?.label ?? d),
    colDimLabels: colDims.map((d) => INSIGHT_DIM_BY_KEY[d]?.label ?? d),
    rows: prows,
    cols: pcols,
    cells,
    index,
  }
}
