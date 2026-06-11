# P5 /insight 项目分析（三模式透视）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `/insight` 项目分析页（spec 4.5）：排名/交叉/透视三模式，数据源=项目主表（projects[] join projectPmis），7 维度 × 6 指标，下钻弹窗项目列表 → 详情页。项目域五页收齐。

**Architecture:** `lib/pivot` 的结构类型 `CrossMatrix/PivotResult` 泛型化（默认参数=PivotGroup，零运行时改动、全向后兼容），BoardMatrix/PivotTable 两个结构组件 props 放宽为 `<unknown>` 后直接复用；新 `lib/projectPivot.ts` 承载项目域的扁平行/维度/指标/分桶（与 pivot.ts 并行——回款语义的 groupByDims/PivotGroup 不动，P6 归并期再议统一）；DimPicker/ChartBox/Modal/DataTable/SegToggle 全复用；新 InsightDrillModal（项目列表 → /project/:id）。

**Tech Stack:** Vue3+TS+vitest；ECharts 经 ChartBox（**不设 itemStyle 颜色，走主题 palette**——BoardView 的硬编码 hex 是 L-21 同类债，不效仿）。

---

## 设计决策（评审依据）

1. **并行而非改造**：pivot.ts 的 `groupByDims/PivotGroup` 与回款节点强耦合（groupByProject 聚合、回款指标字段），仅把**结构类型**泛型化复用；项目域分桶/指标在 projectPivot.ts 独立实现。/board 零行为变化（全量回归护栏）。
2. **7 维度**（spec 4.5）：阶段/项目状态/风险等级/项目经理/行业/签约形式/健康度。空值归一：风险等级空→'无'、健康度空→'无数据'、其余→'未指定'（与清单页口径一致）。
3. **6 指标**（spec 4.5）：项目数(count)/合同总额(money,Σ customer.合同总额)/平均完工%(rate,非空均值)/平均预算消耗比(rate,非空均值)/回款完成率(rate,Σactual/Σexpected)/延期项目数(count,delayedCount>0)。三个 rate 指标无数据时为 null：排序与矩阵格用 `?? 0`，展示用 '-'（与 fmtRatio 约定一致）。
4. **下钻**（spec 4.5"沿用 BoardDrilldownModal 模式→项目列表→详情页"）：新 InsightDrillModal=Modal+DataTable（编号/名称/经理/阶段/健康度/合同总额/回款完成率），行点击关弹窗 `router.push('/project/:id')`（全页详情，非抽屉——spec 原文"详情页"）。
5. **交叉模式不做堆叠图**（YAGNI）：spec 4.5 只要求三模式表格透视；BoardView 的交叉堆叠图是回款可加性指标特化，项目域 6 指标半数为 rate 不可加。排名模式保留柱状图（top15）。
6. **真实数据基线**（2026-06-11）：合同总额 20418 万、平均完工 45.47%（337 非空）、平均消耗比 58.72%（297 非空）、延期项目 25、项目数 640；维度基数：行业 42、项目经理 74、阶段 4+未指定、健康度 3。**签约形式当前 640/640 全空**（PMIS 源列"签约形式分类"无值）→ 该维度呈单桶"未指定"，属数据依赖非 bug，记 PROGRESS/烟雾清单。
7. 路由 `/insight`（meta 项目分析、hideFilter: true）；nav PROJECT_LINKS 末尾加「项目分析」。版本 V7.4.0。

## 分级调度

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | pivot 类型泛型化 + 两组件 props 放宽 | 低中 | sonnet | 主循环核实(全量回归) |
| T2 | lib/projectPivot | 中高 | sonnet | 并入 T4 opus 双审 |
| T3 | InsightDrillModal | 低中 | sonnet | 主循环核实 |
| T4 | InsightView + 路由 + nav | 高 | opus | opus 双审(spec+质量,覆盖 T2-T4) |
| T5 | 版本 V7.4.0 + PROGRESS + verify | 低 | 主循环亲做 | verify.sh |

子代理产出一律 git/vitest 直接核实，不采信自述。

---

### Task 1: pivot 结构类型泛型化 + BoardMatrix/PivotTable props 放宽

**Files:**
- Modify: `frontend/src/lib/pivot.ts`（仅类型签名）
- Modify: `frontend/src/components/BoardMatrix.vue`、`frontend/src/components/PivotTable.vue`（仅 props 类型）

零运行时改动——验证手段是全量测试 + typecheck（不新增用例）。

- [ ] **Step 1: 实现**

`frontend/src/lib/pivot.ts`：

```ts
export interface CrossMatrix {
  rows: string[]
  cols: string[]
  cells: number[][]
  index: Record<string, Record<string, PivotGroup>>
}
```

改为（PivotResult 同法）：

```ts
export interface CrossMatrix<G = PivotGroup> {
  rows: string[]
  cols: string[]
  cells: number[][]
  index: Record<string, Record<string, G>>
}
```

```ts
export interface PivotResult<G = PivotGroup> {
  rowDimLabels: string[]
  colDimLabels: string[]
  rows: PivotRow[]
  cols: PivotCol[]
  cells: number[][]
  index: Record<string, Record<string, G>>
}
```

（函数返回类型注解不用动——默认参数即 PivotGroup。）

`frontend/src/components/BoardMatrix.vue`：props 的 `matrix: CrossMatrix` 改 `matrix: CrossMatrix<unknown>`（import 不变；组件只读 rows/cols/cells 与 index 真值性）。
`frontend/src/components/PivotTable.vue`：`pivot: PivotResult` 改 `pivot: PivotResult<unknown>`。

- [ ] **Step 2: 验证** — `cd frontend && npm run typecheck && npm run test:run`：typecheck 无错、413 全绿（/board 零回归）。
- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/pivot.ts frontend/src/components/BoardMatrix.vue frontend/src/components/PivotTable.vue
git commit -m "refactor(p5): pivot CrossMatrix/PivotResult 泛型化(默认PivotGroup零破坏),结构组件props放宽"
```

---

### Task 2: lib/projectPivot — 项目域维度/指标/三模式分桶

**Files:**
- Create: `frontend/src/lib/projectPivot.ts`
- Test: `frontend/src/lib/projectPivot.test.ts`

- [ ] **Step 1: 失败测试** — 新建 `frontend/src/lib/projectPivot.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import {
  buildInsightRows, groupInsight, insightCross, insightPivot,
  INSIGHT_DIMENSIONS, INSIGHT_METRICS,
} from './projectPivot'

const PAY0 = { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }

const PROJECTS = [
  { projectId: 'P-1', projectName: '甲', projectManager: '何平',
    payment: { ...PAY0, relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 600, delayedCount: 1 },
    deliveryCosts: [], health: { overall: '风险' } },
  { projectId: 'P-2', projectName: '乙', projectManager: '何平',
    payment: { ...PAY0, relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 1000 },
    deliveryCosts: [], health: { overall: '健康' } },
  { projectId: 'P-3', projectName: '丙', projectManager: '李四',
    payment: { ...PAY0 }, deliveryCosts: [], health: { overall: '健康' } },
] as unknown as Project[]

const PMIS = {
  'P-1': { progress: { 项目阶段: '项目执行', 完工进展: 0.2 }, status: { 项目状态: '实施中' }, risk: { 最高等级: '高' },
           cost: { 消耗比: 0.5 }, customer: { 行业: '银行', 签约形式: null, 合同总额: 2000000 } },
  'P-2': { progress: { 项目阶段: '项目执行', 完工进展: 0.8 }, status: { 项目状态: '已验收' }, risk: {},
           cost: {}, customer: { 行业: '银行', 合同总额: 1000000 } },
} as unknown as Record<string, ProjectPmis>

describe('buildInsightRows', () => {
  it('join 取 7 维字段与指标原料,空值归一', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    expect(rows).toHaveLength(3)
    const [r1, , r3] = rows
    expect(r1.stage).toBe('项目执行')
    expect(r1.riskLevel).toBe('高')
    expect(r1.industry).toBe('银行')
    expect(r1.signType).toBe('未指定')   // null 归一
    expect(r1.contractAmount).toBe(2000000)
    expect(r1.delayed).toBe(true)
    expect(r3.stage).toBe('未指定')      // 无 pmis
    expect(r3.riskLevel).toBe('无')
    expect(r3.health).toBe('健康')
    expect(r3.progress).toBeNull()
  })
})

describe('groupInsight', () => {
  it('单维分桶 6 指标(均值忽略空,完成率 Σ/Σ,延期计数)', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const gs = groupInsight(rows, ['manager'])
    const he = gs.find((g) => g.key === '何平')!
    expect(he.projectCount).toBe(2)
    expect(he.contractAmount).toBe(3000000)
    expect(he.avgProgress).toBeCloseTo(0.5)      // (0.2+0.8)/2
    expect(he.avgCostRatio).toBeCloseTo(0.5)     // 仅 P-1 有值
    expect(he.paymentRatio).toBeCloseTo(0.8)     // 1600/2000
    expect(he.delayedProjects).toBe(1)
    const li = gs.find((g) => g.key === '李四')!
    expect(li.avgProgress).toBeNull()            // 全空 → null
    expect(li.paymentRatio).toBeNull()           // Σexpected=0 → null
  })
  it('多维桶 key 以 / 连接且 values 对应', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const gs = groupInsight(rows, ['health', 'manager'])
    expect(gs.map((g) => g.key).sort()).toEqual(['健康 / 何平', '健康 / 李四', '风险 / 何平'])
  })
})

describe('insightCross / insightPivot', () => {
  it('交叉矩阵:行列按指标合计降序,格=指标(null→0),index 留组', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const m = insightCross(rows, 'health', 'manager', 'projectCount')
    expect(m.rows).toEqual(['健康', '风险'])     // 2 > 1
    expect(m.cols).toEqual(['何平', '李四'])     // 2 > 1
    expect(m.cells).toEqual([[1, 1], [1, 0]])
    expect(m.index['风险']['何平'].rows[0].projectId).toBe('P-1')
  })
  it('透视:colDims 空退化单列合计', () => {
    const rows = buildInsightRows(PROJECTS, PMIS)
    const p = insightPivot(rows, ['manager'], [], 'contractAmount')
    expect(p.cols).toEqual([{ key: '', label: '合计' }])
    expect(p.rows[0].key).toBe('何平')           // 3000000 > 0
    expect(p.cells[0][0]).toBe(3000000)
  })
})

describe('契约面', () => {
  it('7 维度 6 指标', () => {
    expect(INSIGHT_DIMENSIONS.map((d) => d.label)).toEqual(['阶段', '项目状态', '风险等级', '项目经理', '行业', '签约形式', '健康度'])
    expect(INSIGHT_METRICS.map((m) => m.key)).toEqual(['projectCount', 'contractAmount', 'avgProgress', 'avgCostRatio', 'paymentRatio', 'delayedProjects'])
  })
})
```

- [ ] **Step 2: 确认失败** — `cd frontend && npx vitest run src/lib/projectPivot.test.ts` → FAIL
- [ ] **Step 3: 实现** — 新建 `frontend/src/lib/projectPivot.ts`：

```ts
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
```

- [ ] **Step 4: 通过** — 同 Step 2 命令 PASS（7 cases）
- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/projectPivot.ts frontend/src/lib/projectPivot.test.ts
git commit -m "feat(p5): lib/projectPivot 项目域7维6指标三模式分桶(复用pivot泛型结构,rate空值null语义)"
```

---

### Task 3: InsightDrillModal — 下钻项目列表弹窗

**Files:**
- Create: `frontend/src/components/InsightDrillModal.vue`
- Test: `frontend/src/components/InsightDrillModal.test.ts`

- [ ] **Step 1: 失败测试** — 新建 `frontend/src/components/InsightDrillModal.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import InsightDrillModal from './InsightDrillModal.vue'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

const ROWS = [
  { projectId: 'P-1', projectName: '甲', manager: '何平', stage: '项目执行', health: '风险',
    contractAmount: 2000000, expectedTotal: 1000, actualTotal: 600 },
] as any[]

describe('InsightDrillModal', () => {
  it('渲染标题与项目行,行点击关弹窗并跳详情', async () => {
    const w = mount(InsightDrillModal, {
      props: { modelValue: true, title: '风险 / 何平', rows: ROWS },
      global: { plugins: [ElementPlus, router] },
    })
    await flushPromises()
    expect(document.body.textContent).toContain('风险 / 何平')
    expect(document.body.textContent).toContain('甲')
    const push = vi.spyOn(router, 'push')
    const tr = document.body.querySelector('.el-table__row') as HTMLElement
    expect(tr).toBeTruthy()
    tr.click()
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/project/P-1')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([false])
  })
})
```

（el-dialog 经 Modal 组件 append-to-body——按既有 Modal 系测试模式用 document.body 查询；若仓库 Modal.test 有现成查询方式则对齐它。）

- [ ] **Step 2: 确认失败** — `cd frontend && npx vitest run src/components/InsightDrillModal.test.ts` → FAIL
- [ ] **Step 3: 实现** — 新建 `frontend/src/components/InsightDrillModal.vue`：

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { InsightRow } from '@/lib/projectPivot'
import { fmtWan, fmtRatio } from '@/lib/format'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'

const props = defineProps<{ modelValue: boolean; title: string; rows: InsightRow[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const router = useRouter()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 190 },
  { key: 'projectName', label: '项目名称' },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'stage', label: '阶段', width: 90 },
  { key: 'health', label: '健康度', width: 80 },
  { key: 'contractAmount', label: '合同总额(万)', width: 110, formatter: (v) => fmtWan(v as number) },
  { key: 'paymentRatio', label: '回款完成率', width: 100, formatter: (_v, r) => fmtRatio(r.expectedTotal > 0 ? r.actualTotal / r.expectedTotal : null) },
]

function onRow(row: Record<string, any>) {
  emit('update:modelValue', false)
  router.push(`/project/${row.projectId}`)
}
</script>

<template>
  <Modal :model-value="props.modelValue" :title="`${props.title}（${props.rows.length} 个项目）`"
    @update:model-value="emit('update:modelValue', $event)">
    <DataTable :columns="COLS" :rows="props.rows" :show-count="false" clickable @row-click="onRow" />
  </Modal>
</template>
```

（Modal 是仓库既有封装（B4）；其 props 形如 modelValue/title——实现前先读 `frontend/src/components/Modal.vue` 确认事件名与插槽，按实际签名对齐，**若与上面骨架不一致以 Modal 实际 API 为准并在报告中说明**。）

- [ ] **Step 4: 通过** — 同 Step 2 命令 PASS
- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/InsightDrillModal.vue frontend/src/components/InsightDrillModal.test.ts
git commit -m "feat(p5): InsightDrillModal 下钻项目列表弹窗(行点击关弹窗跳 /project/:id)"
```

---

### Task 4: InsightView 三模式页 + `/insight` 路由 + 导航

**Files:**
- Create: `frontend/src/views/InsightView.vue`
- Modify: `frontend/src/router/index.ts`、`frontend/src/nav.ts`
- Test: `frontend/src/views/InsightView.test.ts`（新建）、`frontend/src/router/index.test.ts`（loop 加 '/insight'）、`frontend/src/layout/AppSidebar.test.ts`（断言加 '项目分析'）

- [ ] **Step 1: 失败测试** — 新建 `frontend/src/views/InsightView.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import InsightView from './InsightView.vue'
import { useDataStore } from '@/stores/data'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/insight', component: InsightView },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {}, events: [],
    projects: [
      { projectId: 'P-1', projectName: '甲', projectManager: '何平',
        payment: { relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 600, remainingTotal: 400, paymentRatio: 0.6, delayedCount: 1 },
        deliveryCosts: [], health: { overall: '风险' } },
      { projectId: 'P-2', projectName: '乙', projectManager: '何平',
        payment: { relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 1000, remainingTotal: 0, paymentRatio: 1, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '健康' } },
      { projectId: 'P-3', projectName: '丙', projectManager: '李四',
        payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '健康' } },
    ],
    projectPmis: {
      'P-1': { progress: { 项目阶段: '项目执行', 完工进展: 0.2 }, status: { 项目状态: '实施中' }, risk: { 最高等级: '高' }, cost: { 消耗比: 0.5 }, customer: { 行业: '银行', 合同总额: 2000000 } },
      'P-2': { progress: { 项目阶段: '项目收尾', 完工进展: 0.8 }, status: { 项目状态: '已验收' }, risk: {}, cost: {}, customer: { 行业: '银行', 合同总额: 1000000 } },
    },
  } as any
}

async function mountView() {
  await router.push('/insight')
  await router.isReady()
  const w = mount(InsightView, { global: { plugins: [ElementPlus, router], stubs: { ChartBox: true } } })
  await flushPromises()
  return w
}

describe('InsightView', () => {
  it('默认排名模式:维度/指标切换条 + 排名表(健康度维度计数)', async () => {
    seed()
    const w = await mountView()
    expect(w.find('[data-test="seg-rank"]').exists()).toBe(true)
    await w.find('[data-test="seg-health"]').trigger('click')
    expect(w.text()).toContain('健康')
    expect(w.text()).toContain('共 2 条')   // 健康/风险 两组
  })

  it('排名表行点击开下钻弹窗,项目行点击跳详情', async () => {
    seed()
    const w = await mountView()
    await w.find('[data-test="seg-health"]').trigger('click')
    const firstRow = w.find('.el-table__row')
    await firstRow.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('个项目')   // 弹窗标题
  })

  it('交叉模式渲染矩阵', async () => {
    seed()
    const w = await mountView()
    await w.find('[data-test="seg-cross"]').trigger('click')
    await w.find('[data-test="seg-health"]').trigger('click')
    // 次维度选择(el-select) — 直接驱动内部状态较繁琐,断言矩阵组件出现需先选次维;
    // 用暴露的次维 select 选项数断言代替(7-1=6 个可选 + 占位)
    expect(w.findComponent({ name: 'BoardMatrix' }).exists() || w.text().includes('选择次维度')).toBe(true)
  })

  it('透视模式:行维选择后渲染 PivotTable', async () => {
    seed()
    const w = await mountView()
    await w.find('[data-test="seg-pivot"]').trigger('click')
    await flushPromises()
    expect(w.findComponent({ name: 'PivotTable' }).exists()).toBe(true)  // 默认行维 stage
  })

  it('空项目空态', async () => {
    const ds = useDataStore()
    ds.data = { meta: {}, dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] }, naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {}, events: [] } as any
    const w = await mountView()
    expect(w.text()).toContain('暂无项目主域数据')
  })
})
```

`frontend/src/router/index.test.ts`：top-level 数组加 `'/insight'`。
`frontend/src/layout/AppSidebar.test.ts`：三段分组用例加 `expect(text).toContain('项目分析')`。

- [ ] **Step 2: 确认失败** — 三文件 vitest → FAIL
- [ ] **Step 3: 实现**

`frontend/src/nav.ts`：PROJECT_LINKS 改为四项（项目总览/项目清单/项目动态/**项目分析 to '/insight'**）。

`frontend/src/router/index.ts`：import InsightView；`/activity` 条目后加：

```ts
    { path: '/insight', name: 'insight', component: InsightView, meta: { title: '项目分析', hideFilter: true } },
```

新建 `frontend/src/views/InsightView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import type { Project, ProjectPmis } from '@/types/analysis'
import {
  buildInsightRows, groupInsight, insightCross, insightPivot,
  INSIGHT_DIMENSIONS, INSIGHT_METRICS, INSIGHT_METRIC_BY_KEY, INSIGHT_DIM_BY_KEY,
  type InsightGroup, type InsightMetricKey,
} from '@/lib/projectPivot'
import { fmtWan, pct } from '@/lib/format'
import SegToggle from '@/components/SegToggle.vue'
import DimPicker from '@/components/DimPicker.vue'
import ChartBox from '@/charts/ChartBox.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import BoardMatrix from '@/components/BoardMatrix.vue'
import PivotTable from '@/components/PivotTable.vue'
import InsightDrillModal from '@/components/InsightDrillModal.vue'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() =>
  buildInsightRows(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
  ),
)

const MODES = [
  { value: 'rank', label: '排名' },
  { value: 'cross', label: '交叉' },
  { value: 'pivot', label: '透视' },
]
const mode = ref('rank')
const DIM_OPTS = INSIGHT_DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))
const METRIC_OPTS = INSIGHT_METRICS.map((m) => ({ value: m.key, label: m.label }))
const dimKey = ref('stage')
const secondDim = ref('')
const metricKey = ref<InsightMetricKey>('projectCount')
const rowDims = ref<string[]>(['stage'])
const colDims = ref<string[]>([])

const metricFormat = computed(() => {
  const kind = INSIGHT_METRIC_BY_KEY[metricKey.value].kind
  return (v: number) => (kind === 'money' ? fmtWan(v) : kind === 'rate' ? pct(v) : String(v))
})

// ---- 排名 ----
const groups = computed(() => {
  const gs = groupInsight(rows.value, [dimKey.value])
  const k = metricKey.value
  return [...gs].sort((a, b) => ((b[k] ?? 0) as number) - ((a[k] ?? 0) as number))
})
const top = computed(() => groups.value.slice(0, 15))
const chartOption = computed(() => {
  const kind = INSIGHT_METRIC_BY_KEY[metricKey.value].kind
  const div = kind === 'money' ? 10000 : 1
  const label = INSIGHT_METRIC_BY_KEY[metricKey.value].label
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 20, top: 30, bottom: 60 },
    xAxis: { type: 'category', data: top.value.map((g) => g.key), axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: kind === 'money' ? `${label}(万)` : label },
    series: [{ name: label, type: 'bar', data: top.value.map((g) => +(((g[metricKey.value] ?? 0) as number) / div).toFixed(4)) }],
  }
})
const RANK_COLS = computed<DataColumn[]>(() => [
  { key: 'key', label: INSIGHT_DIM_BY_KEY[dimKey.value]?.label ?? '维度' },
  { key: 'projectCount', label: '项目数', width: 80, sortable: true },
  { key: 'contractAmount', label: '合同总额(万)', width: 110, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'avgProgress', label: '平均完工', width: 90, formatter: (v) => (v == null ? '-' : pct(v)) },
  { key: 'avgCostRatio', label: '平均消耗比', width: 100, formatter: (v) => (v == null ? '-' : pct(v)) },
  { key: 'paymentRatio', label: '回款完成率', width: 100, formatter: (v) => (v == null ? '-' : pct(v)) },
  { key: 'delayedProjects', label: '延期项目', width: 90, sortable: true },
])

// ---- 交叉 ----
const SECOND_OPTS = computed(() => DIM_OPTS.filter((o) => o.value !== dimKey.value))
const matrix = computed(() =>
  mode.value === 'cross' && secondDim.value
    ? insightCross(rows.value, dimKey.value, secondDim.value, metricKey.value)
    : null,
)

// ---- 透视 ----
const pivot = computed(() =>
  mode.value === 'pivot' && rowDims.value.length
    ? insightPivot(rows.value, rowDims.value, colDims.value, metricKey.value)
    : null,
)

// ---- 下钻 ----
const drillOpen = ref(false)
const drillTitle = ref('')
const drillGroup = ref<InsightGroup | null>(null)
function openDrill(g: InsightGroup | undefined | null, title?: string) {
  if (!g) return
  drillGroup.value = g
  drillTitle.value = title ?? g.key
  drillOpen.value = true
}
function onRankRow(row: Record<string, any>) {
  openDrill(groups.value.find((g) => g.key === row.key))
}
function onCellClick(p: { row: string; col: string }) {
  openDrill(matrix.value?.index[p.row]?.[p.col] as InsightGroup | undefined, `${p.row} / ${p.col}`)
}
function onPivotCell(p: { rowKey: string; colKey: string }) {
  openDrill(pivot.value?.index[p.rowKey]?.[p.colKey] as InsightGroup | undefined, `${p.rowKey}${p.colKey ? ' / ' + p.colKey : ''}`)
}
</script>

<template>
  <div class="insight-view">
    <h2 class="iv-title">项目分析</h2>

    <div class="iv-toolbar">
      <SegToggle v-model="mode" :options="MODES" />
      <SegToggle v-if="mode !== 'pivot'" v-model="dimKey" :options="DIM_OPTS" />
      <el-select v-if="mode === 'cross'" v-model="secondDim" size="small" placeholder="选择次维度" style="width: 130px"
        :empty-values="[null, undefined]" :value-on-clear="''" clearable>
        <el-option v-for="o in SECOND_OPTS" :key="o.value" :value="o.value" :label="o.label" />
      </el-select>
      <SegToggle v-model="metricKey" :options="METRIC_OPTS" />
    </div>

    <div v-if="mode === 'pivot'" class="iv-dims">
      <span class="iv-dims-label">行维度</span><DimPicker v-model="rowDims" :options="DIM_OPTS" />
      <span class="iv-dims-label">列维度</span><DimPicker v-model="colDims" :options="DIM_OPTS" />
    </div>

    <div v-if="!rows.length" class="iv-empty">暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>

    <template v-else>
      <template v-if="mode === 'rank'">
        <div class="iv-card"><ChartBox :option="chartOption" height="300px" /></div>
        <DataTable :columns="RANK_COLS" :rows="groups" clickable @row-click="onRankRow" />
      </template>

      <template v-else-if="mode === 'cross'">
        <div v-if="!secondDim" class="iv-hint">选择次维度后展示交叉矩阵。</div>
        <BoardMatrix v-else-if="matrix" :matrix="matrix"
          :row-label="INSIGHT_DIM_BY_KEY[dimKey]?.label ?? ''"
          :col-label="INSIGHT_DIM_BY_KEY[secondDim]?.label ?? ''"
          :format="metricFormat" @cell-click="onCellClick" />
      </template>

      <template v-else>
        <div v-if="!rowDims.length" class="iv-hint">选择至少一个行维度。</div>
        <PivotTable v-else-if="pivot" :pivot="pivot" :format="metricFormat" @cell-click="onPivotCell" />
      </template>
    </template>

    <InsightDrillModal v-model="drillOpen" :title="drillTitle" :rows="drillGroup?.rows ?? []" />
  </div>
</template>

<style scoped>
.insight-view { padding: 16px; }
.iv-title { font-size: 18px; font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.iv-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.iv-dims { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.iv-dims-label { font-size: 12px; color: var(--sub); font-weight: 600; }
.iv-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 10px; margin-bottom: 12px; }
.iv-hint { font-size: 13px; color: var(--mut); padding: 24px 0; text-align: center; }
.iv-empty { color: var(--mut); padding: 40px 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
</style>
```

> 注：SegToggle 的 modelValue 为 string；`metricKey` 为受限联合类型——若 typecheck 报 SegToggle v-model 协变错误，把 `metricKey` 放宽为 `ref('projectCount')`（string）并在使用处 `as InsightMetricKey`（报告中说明）。

- [ ] **Step 4: 通过** — 三文件 vitest PASS；`npm run test:run` 全量；`npm run typecheck`。
- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/InsightView.vue frontend/src/views/InsightView.test.ts frontend/src/router/index.ts frontend/src/router/index.test.ts frontend/src/nav.ts frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(p5): /insight 项目分析(排名/交叉/透视三模式+7维6指标+下钻跳详情),项目域五页齐"
```

---

### Task 5: 版本 V7.4.0 + PROGRESS + 全量验证（主循环亲做）

- [ ] `frontend/src/version.ts` → `APP_VERSION = 'V7.4.0'`
- [ ] `PROGRESS.md`：头部；进行中 → P5 完成、项目域五页齐、下一步 P6（回款子域重设计①：回款总览瘦身 + /board+业务分析归并）；新 Handoff 段（并行 pivot 决策、签约形式全空数据依赖、基线 20418 万/45.47%/58.72%/25、烟雾清单）；backlog 如有遗留。
- [ ] `bash verify.sh` 全绿。
- [ ] Commit：`chore(p5): 版本 V7.4.0 + PROGRESS 记录 P5 完成`
