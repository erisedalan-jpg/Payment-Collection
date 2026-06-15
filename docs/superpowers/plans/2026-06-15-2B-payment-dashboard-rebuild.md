# 2B 回款看板重建（/panalysis 整页 PMIS 化）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/panalysis` 整页（多维看板 + 4 个 facet tab）的回款分析口径从"云文档 rawNodes + 旧 6 态 + 金额三档"换骨为"PMIS 核心（`projects[].paymentPmis` / `paymentNodes`）+ 节点 3 态 + 多维可选"，并撤销数据质检 tab。

**Architecture:** 新增两个项目级纯函数库 `lib/paymentPmis.ts`（facet tab 派生/汇总/过滤）与 `lib/paymentBoard.ts`（board PMIS 透视，镜像现有 `lib/projectPivot.ts` 结构、复用 `lib/pivot.ts` 泛型类型 `CrossMatrix<T>/PivotResult<T>`）。前 4 个 facet tab 与 board 全部改消费 `data.data.projects`（含 `paymentPmis`）+ `data.data.paymentNodes` + `data.data.projectPmis`，不再消费 `filter.filteredNodes`(rawNodes)。视角/纳管过滤改对 `projects[]` 做（新 `filterProjects`，不复用 `filterNodes`）。旧 `/panalysis` 独占件（`projectsOverview.ts` / `planBoards.ts` / `riskGroups()` / `tierSummaryBar()` / `TierIntegrityTab.vue` / `PlanBoard.vue`）删除前先 grep 全仓确认无其他消费方；`/payment`·`/calendar`·`/ledger` 仍消费的旧链（`getNodeRemaining` / `groupByProject` / `crossFilter` / `ColumnFilter`）保留并存。

**Tech Stack:** Vue3 + Vite + TS（`frontend/`）、Pinia、Element Plus、ECharts（vue-echarts）、Vitest + @vue/test-utils；后端零改动（数据由 2A `f840147` 备齐）。

**版本：** `frontend/src/version.ts` 单一来源 **V1.2.0 → V1.3.0**（整页级）。

---

## 关键事实（已核实，落地必须照此）

数据契约（精确字段，来源 `schema.py` + `frontend/src/types/analysis.ts`）：

- `Project`：`projectId: string`（必填）、`projectName?: string`、`projectManager?: string`、`orgL4?: string`、`overspendAmount?: number | null`、`paymentPmis?: ProjectPaymentPmis | null`。
- `ProjectPaymentPmis`：`contract?: number | null`、`actualTotal?: number | null`、`paymentCount?: number`、`paymentRatio?: number | null`、`expectedTotal?: number`、`nodeCount?: number`、`reachedCount?: number`、`delayedCount?: number`、`lastPaymentDate?: string`、`fromOrigin?: boolean`。
- `PaymentNodePmis`：`stage: string`（必填）、`planDate?: string`、`actualDate?: string`、`payRatio?: number | null`、`expectedPayment?: number`、`reached?: boolean`、`status?: string`。**`status` 取值仅 `'已达成' | '延期' | '待达成'`**（来源 `projects.py:137-142 _node_status`）。
- `AnalysisData.paymentNodes?: Record<string, PaymentNodePmis[]>`（键 = `projectId`）。
- `AnalysisData.projectPmis?: Record<string, ProjectPmis>`（键 = `projectId`）；阶段访问路径 **`projectPmis[pid].progress.项目阶段`**（中文键，`schema.py:65 PmisProgress.项目阶段: Optional[str]`）；行业 `projectPmis[pid].customer.行业`。
- `AnalysisData.naguanExclude?: Record<string, boolean>`（键 = `projectId`；`true` 表示排除）。

Store / 工具（精确签名，来源核实）：

- `useDataStore()`（`stores/data.ts`）：`data.data?.projects` / `data.data?.paymentNodes` / `data.data?.projectPmis` / `data.data?.naguanExclude`。
- `useFilterStore()`（`stores/filter.ts`）：`viewMode: 'global'|'l4'|'pm'`、`viewL4: string`、`viewPM: string`、`naguanOn: boolean`（**注意：本页不再用 `filteredNodes` / `filterYear`**）。
- `useProjectDetailStore()`（`stores/projectDetail.ts`）：`open(id: string)` 打开 D2 全局详情面板。
- `lib/format.ts`：`fmtWan(yuan: number|null|undefined): string`（元→万）、`fmtRatio(v: unknown, nullLabel='-'): string`、`pct(n: unknown): string`。
- `DataTable.vue`：`props { columns: DataColumn[]; rows: Record<string,any>[]; showCount?; clickable? }`；`emit('row-click', row)`；**已有具名插槽 `#cell-<key>` 与 `#header-<key>`**（用于完成率三态色、状态徽章渲染，无需改 DataTable）。`DataColumn { key; label; width?; sortable?; formatter?(value,row): string }`。
- 设计令牌（`styles/theme.css`，明/暗双套已定义）：卡面 `--card`/次面 `--card2`、边框 `--line`、文字 `--txt`/`--sub`/`--mut`、状态淡底深字 `--ok-bg`/`--ok-text`、`--warn-bg`/`--warn-text`、`--danger-bg`/`--danger-text`、间距 `--gap-section`/`--gap-card`/`--card-pad`/`--sp-1..7`、圆角 `--r-sm`/`--r-md`、数字列工具类 `.u-num`。

消费方普查结论（删除前已 grep 全仓核实）：

- **可删（/panalysis 独占）**：`lib/projectsOverview.ts`（仅 `ProjectsOverviewTab`）、`lib/planBoards.ts`（仅 `PlanTab`/`PlanBoard`）、`components/TierIntegrityTab.vue`、`components/PlanBoard.vue`、`lib/dashboardStats.ts` 的 `tierSummaryBar`（仅 `PayAnalysisView`）、`lib/riskGroups.ts` 的 `riskGroups()`（仅 `RiskTab`）、`lib/pivot.ts` 的节点级函数 `DIMENSIONS/METRICS/groupByDims/crossMatrix/pivotTable/DIM_BY_KEY/METRIC_BY_KEY/PivotGroup`（仅 `BoardView`）。
- **必须保留（其他页共享，勿删）**：`lib/riskGroups.ts` 的 `getNodeRemaining`（被 `/calendar`/`/ledger`/`dashboardSignals`）、`lib/dashboardStats.ts` 的 `groupByProject`/`ProjectAgg`/`computeTierStats`/`computeDashboardSummary`（被 `/ledger`/`/insight`/`/dashboard`/`pivot`/`projectDetail`）、`lib/pivot.ts` 的泛型**类型** `CrossMatrix`/`PivotResult`/`PivotRow`/`PivotCol`（被 `projectPivot.ts`/`BoardMatrix`/`PivotTable`）、`lib/crossFilter.ts` + `stores/crossFilter.ts` + `ColumnFilter.vue`（被 `/ledger`）、`nav.ts` 的 `TIERS`（被 `/dashboard` `TierStrip`）。

---

## File Structure

新增：
- `frontend/src/lib/paymentPmis.ts` — facet tab 纯函数：常量阈值、`deriveTier/deriveProgress/deriveDept/deriveStage/rateColorPmis`、`PAY_FACET_DIMS`、`filterProjects`、`projectPaymentRows`、`summaryByDim`、`paymentNodeRows`、`nodeSummary`、`progressBuckets`、`pmisRiskGroups`。
- `frontend/src/lib/paymentPmis.test.ts` — 上述纯函数单测。
- `frontend/src/lib/paymentBoard.ts` — board PMIS 透视：`PayBoardRow`、`buildPayBoardRows`、`PAY_BOARD_DIMENSIONS`、`PAY_BOARD_METRICS`、`PayBoardGroup`、`groupPayBoard`、`payBoardCross`、`payBoardPivot`（镜像 `lib/projectPivot.ts`，复用 `pivot.ts` 泛型类型）。
- `frontend/src/lib/paymentBoard.test.ts` — board 透视单测。

改写（保留文件名 + slug，换骨内部）：
- `frontend/src/components/ProjectsOverviewTab.vue`（+ `.test.ts`）— props `{ dim }`，消费 `projectPaymentRows`/`summaryByDim`，行点击唤起 D2。
- `frontend/src/components/TierNodesTab.vue`（+ `.test.ts`）— props `{ dim }`，消费 `paymentNodeRows`/`nodeSummary`，状态三态徽章。
- `frontend/src/components/PlanTab.vue`（+ `.test.ts`）— 重命名语义为"回款进度"，3 互斥进度桶 + 项目表（复用 `crossFilter`/`ColumnFilter`），删 `PlanBoard` 依赖。
- `frontend/src/components/RiskTab.vue`（+ `.test.ts`）— PMIS 风险三类（延期节点/低回款/超支）。
- `frontend/src/views/PayAnalysisView.vue`（+ 若有 `.test.ts`）— tab 条删 integrity，右侧档位 SegToggle 换共享维度选择器（`PAY_FACET_DIMS`），删 `tierSummaryBar`。
- `frontend/src/views/BoardView.vue`（+ `.test.ts`）— 改消费 `paymentBoard`（`buildPayBoardRows` + `filterProjects` + `groupPayBoard`/`payBoardCross`/`payBoardPivot`）。
- `frontend/src/components/BoardDrilldownModal.vue` — `projects` prop 类型由 `ProjectAgg[]` 放宽为 `Record<string, any>[]`（兼容 PMIS 下钻行 + `TierStrip` 旧用法）。
- `frontend/src/lib/pivot.ts`（+ `.test.ts`）— 删节点级函数，保留泛型类型。
- `frontend/src/lib/dashboardStats.ts`（+ `.test.ts`）— 删 `tierSummaryBar`（保留其余）。
- `frontend/src/lib/riskGroups.ts`（+ `.test.ts`）— 删 `riskGroups()`/`RiskGroups`（保留 `getNodeRemaining`）。
- `frontend/src/nav.ts` — `TIER_TABS` 去 `integrity`（若 `TIER_TABS`/`TIER_BY_SLUG` 仅 `/panalysis` 用，连带清理）。
- `frontend/src/version.ts` — V1.2.0 → V1.3.0。

删除：
- `frontend/src/lib/projectsOverview.ts`（+ `.test.ts`）
- `frontend/src/lib/planBoards.ts`（+ `.test.ts`）
- `frontend/src/components/TierIntegrityTab.vue`（+ `.test.ts`）
- `frontend/src/components/PlanBoard.vue`（+ `.test.ts`）

**不做（YAGNI 边界，照 spec §7）**：不动 `/payment` 总览 / `/calendar` / `/ledger` / `/followup`；不动 `rawNodes` / 旧 `payment`(ProjectPayment) / `filterNodes` / `dashboardStats.groupByProject`；不做项目级年份过滤（项目持续态）、节点级现金分摊、标签筛选（2C）；**数据质检 → governance 低优先告警暂不接入**（spec §4 授权"低价值可弃"；integrity tab 信息保留在 `summary[].incompleteData` 数据中，本期仅删 tab，不新增 governance 告警，留作后续可选）。

---

## Task 1: `lib/paymentPmis.ts`（派生 / 过滤 / 项目行 / 单维汇总）

**难度：核心算法 → opus。**

**Files:**
- Create: `frontend/src/lib/paymentPmis.ts`
- Test: `frontend/src/lib/paymentPmis.test.ts`

- [ ] **Step 1: 写失败测试（派生函数 + 过滤 + 项目行 + 单维汇总）**

`frontend/src/lib/paymentPmis.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Project, ProjectPaymentPmis, ProjectPmis } from '@/types/analysis'
import {
  TIER_HIGH, TIER_MID, deriveTier, deriveProgress, deriveDept, deriveStage,
  rateColorPmis, PAY_FACET_DIMS, filterProjects, projectPaymentRows, summaryByDim,
} from './paymentPmis'

const pm = (o: Partial<ProjectPaymentPmis>): ProjectPaymentPmis => ({ ...o })
const proj = (o: Partial<Project>): Project => ({ projectId: 'P0', ...o } as Project)

describe('deriveTier（金额档四档边界）', () => {
  it('≥100万 → 100万以上', () => {
    expect(deriveTier(TIER_HIGH)).toBe('100万以上')
    expect(deriveTier(2_000_000)).toBe('100万以上')
  })
  it('[50万,100万) → 50-100万', () => {
    expect(deriveTier(TIER_MID)).toBe('50-100万')
    expect(deriveTier(999_999)).toBe('50-100万')
  })
  it('(0,50万) → 50万以下', () => {
    expect(deriveTier(1)).toBe('50万以下')
    expect(deriveTier(499_999)).toBe('50万以下')
  })
  it('null/0/负 → 未知', () => {
    expect(deriveTier(null)).toBe('未知')
    expect(deriveTier(undefined)).toBe('未知')
    expect(deriveTier(0)).toBe('未知')
  })
})

describe('deriveProgress（进度态边界）', () => {
  it('ratio≥0.999 → 已全额回款（含>1 超额）', () => {
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 0.999 }))).toBe('已全额回款')
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 1 }))).toBe('已全额回款')
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 1.05 }))).toBe('已全额回款')
  })
  it('0<ratio<0.999 → 部分回款', () => {
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 0.5 }))).toBe('部分回款')
  })
  it('ratio==0 或 null 且 contract>0 → 未回款', () => {
    expect(deriveProgress(pm({ contract: 100, paymentRatio: 0 }))).toBe('未回款')
    expect(deriveProgress(pm({ contract: 100, paymentRatio: null }))).toBe('未回款')
  })
  it('无合同 / 无 pmis → 未知', () => {
    expect(deriveProgress(pm({ contract: null, paymentRatio: null }))).toBe('未知')
    expect(deriveProgress(pm({ contract: 0, paymentRatio: 0 }))).toBe('未知')
    expect(deriveProgress(null)).toBe('未知')
    expect(deriveProgress(undefined)).toBe('未知')
  })
})

describe('deriveDept / deriveStage', () => {
  it('部门取 orgL4，空→未指定', () => {
    expect(deriveDept(proj({ orgL4: '交付一组' }))).toBe('交付一组')
    expect(deriveDept(proj({ orgL4: '' }))).toBe('未指定')
    expect(deriveDept(proj({}))).toBe('未指定')
  })
  it('阶段取 projectPmis[pid].progress.项目阶段，空/缺→未指定', () => {
    const map: Record<string, ProjectPmis> = {
      P1: { progress: { 项目阶段: '实施' } } as ProjectPmis,
      P2: { progress: {} } as ProjectPmis,
    }
    expect(deriveStage('P1', map)).toBe('实施')
    expect(deriveStage('P2', map)).toBe('未指定')
    expect(deriveStage('P3', map)).toBe('未指定')
    expect(deriveStage('P1', undefined)).toBe('未指定')
  })
})

describe('rateColorPmis（完成率三态色，对齐既有 0.8/0.5 阈值，输出令牌）', () => {
  it('≥0.8 → ok-text；≥0.5 → warn-text；<0.5 → danger-text；null → mut', () => {
    expect(rateColorPmis(0.8)).toBe('var(--ok-text)')
    expect(rateColorPmis(0.5)).toBe('var(--warn-text)')
    expect(rateColorPmis(0.49)).toBe('var(--danger-text)')
    expect(rateColorPmis(null)).toBe('var(--mut)')
  })
})

describe('PAY_FACET_DIMS', () => {
  it('四维：部门/阶段/金额档/进度态', () => {
    expect(PAY_FACET_DIMS.map((d) => d.key)).toEqual(['dept', 'stage', 'tier', 'progress'])
  })
})

describe('filterProjects（视角/纳管，不复用 filterNodes）', () => {
  const ps = [
    proj({ projectId: 'A', orgL4: '组1', projectManager: '张三' }),
    proj({ projectId: 'B', orgL4: '组2', projectManager: '李四' }),
    proj({ projectId: 'C', orgL4: '组1', projectManager: '李四' }),
  ]
  const base = { viewMode: 'global' as const, viewL4: '', viewPM: '', naguanOn: false, naguanExclude: {} }
  it('global 全量', () => {
    expect(filterProjects(ps, base).map((p) => p.projectId)).toEqual(['A', 'B', 'C'])
  })
  it('l4 视角按 orgL4', () => {
    expect(filterProjects(ps, { ...base, viewMode: 'l4', viewL4: '组1' }).map((p) => p.projectId)).toEqual(['A', 'C'])
  })
  it('pm 视角按 projectManager', () => {
    expect(filterProjects(ps, { ...base, viewMode: 'pm', viewPM: '李四' }).map((p) => p.projectId)).toEqual(['B', 'C'])
  })
  it('纳管开启排除 naguanExclude', () => {
    expect(filterProjects(ps, { ...base, naguanOn: true, naguanExclude: { B: true } }).map((p) => p.projectId)).toEqual(['A', 'C'])
  })
  it('纳管关闭不排除', () => {
    expect(filterProjects(ps, { ...base, naguanOn: false, naguanExclude: { B: true } }).length).toBe(3)
  })
})

describe('projectPaymentRows / summaryByDim', () => {
  const ps = [
    proj({ projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1',
      overspendAmount: 0, paymentPmis: pm({ contract: 2_000_000, actualTotal: 1_000_000, paymentRatio: 0.5, expectedTotal: 1_500_000, nodeCount: 3, reachedCount: 1, delayedCount: 1, fromOrigin: false }) }),
    proj({ projectId: 'B', projectName: '乙', projectManager: '李四', orgL4: '组1',
      overspendAmount: 5000, paymentPmis: pm({ contract: 1_000_000, actualTotal: 1_000_000, paymentRatio: 1, expectedTotal: 1_000_000, nodeCount: 2, reachedCount: 2, delayedCount: 0, fromOrigin: true }) }),
  ]
  const map: Record<string, ProjectPmis> = { A: { progress: { 项目阶段: '实施' } } as ProjectPmis }
  it('行字段映射齐全（含派生维度与下钻兼容列）', () => {
    const rows = projectPaymentRows(ps, map)
    const a = rows.find((r) => r.projectId === 'A')!
    expect(a).toMatchObject({
      projectName: '甲', projectManager: '张三', dept: '组1', stage: '实施',
      tier: '100万以上', progress: '部分回款', contract: 2_000_000, actualTotal: 1_000_000,
      paymentRatio: 0.5, expectedTotal: 1_500_000, nodeCount: 3, reachedCount: 1, delayedCount: 1,
      fromOrigin: false, projectAmount: 2_000_000, paymentStatus: '部分回款', orgL4: '组1',
    })
    const b = rows.find((r) => r.projectId === 'B')!
    expect(b.stage).toBe('未指定')          // map 无 B
    expect(b.progress).toBe('已全额回款')
  })
  it('contract/actualTotal/paymentRatio 缺失按 0/null', () => {
    const rows = projectPaymentRows([proj({ projectId: 'X', paymentPmis: null })], {})
    expect(rows[0]).toMatchObject({ contract: 0, actualTotal: 0, paymentRatio: null, tier: '未知', progress: '未知' })
  })
  it('summaryByDim 按 dept 加权完成率（Σ÷Σ，非单项目率平均），按合同Σ降序', () => {
    const rows = projectPaymentRows(ps, map)
    const s = summaryByDim(rows, 'dept')
    expect(s).toHaveLength(1)               // 同组1
    expect(s[0]).toMatchObject({ value: '组1', projectCount: 2, contractSum: 3_000_000, actualSum: 2_000_000, delayedNodeSum: 1 })
    expect(s[0].rate).toBeCloseTo(2_000_000 / 3_000_000, 6)  // 加权
  })
  it('summaryByDim 分母 0 → rate null', () => {
    const rows = projectPaymentRows([proj({ projectId: 'Z', orgL4: '组9', paymentPmis: pm({ contract: 0 }) })], {})
    expect(summaryByDim(rows, 'dept')[0].rate).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: FAIL（`Cannot find module './paymentPmis'`）

- [ ] **Step 3: 实现 `lib/paymentPmis.ts`（本任务范围函数）**

```ts
import type { Project, ProjectPaymentPmis, ProjectPmis } from '@/types/analysis'

// ── 阈值常量（集中定义，spec §2）──
export const TIER_HIGH = 1_000_000
export const TIER_MID = 500_000
export const RATE_OK = 0.8
export const RATE_WARN = 0.5

// ── 维度派生 ──
/** 金额档：由 paymentPmis.contract 派生（spec §2）。 */
export function deriveTier(contract: number | null | undefined): string {
  if (contract == null || contract <= 0) return '未知'
  if (contract >= TIER_HIGH) return '100万以上'
  if (contract >= TIER_MID) return '50-100万'
  return '50万以下'
}

/** 进度态：由 paymentPmis.paymentRatio 派生（spec §2）。无合同→未知；ratio 0/null 且有合同→未回款。 */
export function deriveProgress(pmis: ProjectPaymentPmis | null | undefined): string {
  const c = pmis?.contract
  if (c == null || c <= 0) return '未知'
  const r = pmis?.paymentRatio
  if (r == null || r <= 0) return '未回款'
  if (r >= 0.999) return '已全额回款'
  return '部分回款'
}

/** 部门：project.orgL4（空→未指定）。 */
export function deriveDept(p: Project): string {
  const s = (p.orgL4 ?? '').trim()
  return s === '' ? '未指定' : s
}

/** 阶段：projectPmis[pid].progress.项目阶段（空/缺→未指定）。 */
export function deriveStage(pid: string, pmisMap: Record<string, ProjectPmis> | undefined): string {
  const s = String((pmisMap?.[pid]?.progress as Record<string, unknown> | undefined)?.['项目阶段'] ?? '').trim()
  return s === '' ? '未指定' : s
}

/** 完成率三态色（对齐既有 0.8/0.5 阈值，输出 theme 令牌；null→mut）。 */
export function rateColorPmis(r: number | null | undefined): string {
  if (r == null) return 'var(--mut)'
  if (r >= RATE_OK) return 'var(--ok-text)'
  if (r >= RATE_WARN) return 'var(--warn-text)'
  return 'var(--danger-text)'
}

// ── 共享维度选择器（前 4 个 facet tab）──
export interface PayDimDef { key: 'dept' | 'stage' | 'tier' | 'progress'; label: string }
export const PAY_FACET_DIMS: PayDimDef[] = [
  { key: 'dept', label: '部门' },
  { key: 'stage', label: '阶段' },
  { key: 'tier', label: '金额档' },
  { key: 'progress', label: '进度态' },
]

// ── 视角/纳管过滤（对 projects[]，不复用 filterNodes；spec §5）──
export interface FilterOpts {
  viewMode: 'global' | 'l4' | 'pm'
  viewL4: string
  viewPM: string
  naguanOn: boolean
  naguanExclude: Record<string, boolean>
}
export function filterProjects(projects: Project[], opts: FilterOpts): Project[] {
  return projects.filter((p) => {
    if (opts.naguanOn && opts.naguanExclude && opts.naguanExclude[p.projectId]) return false
    if (opts.viewMode === 'l4' && opts.viewL4) return (p.orgL4 ?? '') === opts.viewL4
    if (opts.viewMode === 'pm' && opts.viewPM) return (p.projectManager ?? '') === opts.viewPM
    return true
  })
}

// ── 项目级回款行（项目总览表底座 + 维度 + 下钻兼容列）──
export interface PayProjectRow {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  dept: string
  stage: string
  tier: string
  progress: string
  contract: number
  actualTotal: number
  paymentRatio: number | null
  expectedTotal: number
  nodeCount: number
  reachedCount: number
  delayedCount: number
  fromOrigin: boolean
  overspendAmount: number
  projectAmount: number // = contract（BoardDrilldownModal 列）
  paymentStatus: string // = progress（BoardDrilldownModal 列）
}

export function projectPaymentRows(
  projects: Project[],
  pmisMap?: Record<string, ProjectPmis>,
): PayProjectRow[] {
  return projects.map((p) => {
    const pm = p.paymentPmis ?? null
    const contract = pm?.contract ?? 0
    const actualTotal = pm?.actualTotal ?? 0
    const paymentRatio = pm?.paymentRatio ?? null
    const dept = deriveDept(p)
    const tier = deriveTier(pm?.contract)
    const progress = deriveProgress(pm)
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      projectManager: (p.projectManager ?? '').trim() || '未指定',
      orgL4: dept,
      dept,
      stage: deriveStage(p.projectId, pmisMap),
      tier,
      progress,
      contract,
      actualTotal,
      paymentRatio,
      expectedTotal: pm?.expectedTotal ?? 0,
      nodeCount: pm?.nodeCount ?? 0,
      reachedCount: pm?.reachedCount ?? 0,
      delayedCount: pm?.delayedCount ?? 0,
      fromOrigin: pm?.fromOrigin ?? false,
      overspendAmount: p.overspendAmount ?? 0,
      projectAmount: contract,
      paymentStatus: progress,
    }
  })
}

// ── 单维汇总（spec §2 指标；加权完成率 Σ÷Σ）──
export interface DimSummary {
  value: string
  projectCount: number
  contractSum: number
  actualSum: number
  rate: number | null
  delayedNodeSum: number
}
export function summaryByDim(rows: PayProjectRow[], dimKey: string): DimSummary[] {
  const buckets: Record<string, PayProjectRow[]> = {}
  for (const r of rows) {
    const v = String((r as Record<string, unknown>)[dimKey] ?? '未指定')
    ;(buckets[v] ||= []).push(r)
  }
  return Object.entries(buckets)
    .map(([value, grp]) => {
      const contractSum = grp.reduce((s, r) => s + r.contract, 0)
      const actualSum = grp.reduce((s, r) => s + r.actualTotal, 0)
      return {
        value,
        projectCount: grp.length,
        contractSum,
        actualSum,
        rate: contractSum > 0 ? actualSum / contractSum : null,
        delayedNodeSum: grp.reduce((s, r) => s + r.delayedCount, 0),
      }
    })
    .sort((a, b) => b.contractSum - a.contractSum)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无新错误（Task 2 的函数尚未实现，本任务测试只导入本任务函数）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "feat(2b): paymentPmis 派生/过滤/项目行/单维汇总纯函数"
```

---

## Task 2: `lib/paymentPmis.ts`（节点行 / 节点汇总 / 进度桶 / 风险三类）

**难度：核心算法 → opus。** 续写同一文件，追加函数与测试。

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts`（追加）
- Modify: `frontend/src/lib/paymentPmis.test.ts`（追加 describe 块）

- [ ] **Step 1: 追加失败测试**

在 `paymentPmis.test.ts` 顶部 import 增补：

```ts
import {
  paymentNodeRows, nodeSummary, progressBuckets, pmisRiskGroups,
} from './paymentPmis'
import type { PaymentNodePmis } from '@/types/analysis'
```

文件末尾追加：

```ts
describe('paymentNodeRows（扁平化 + 维度 join 到所属项目）', () => {
  const projects = [
    proj({ projectId: 'A', projectName: '甲', orgL4: '组1', paymentPmis: pm({ contract: 2_000_000, paymentRatio: 0.5 }) }),
  ]
  const pmisMap: Record<string, ProjectPmis> = { A: { progress: { 项目阶段: '实施' } } as ProjectPmis }
  const nodes: Record<string, PaymentNodePmis[]> = {
    A: [
      { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.7, expectedPayment: 1_400_000, reached: true, status: '已达成' },
      { stage: '终验', planDate: '2026-03-01', actualDate: '', payRatio: 0.3, expectedPayment: 600_000, reached: false, status: '延期' },
    ],
    GHOST: [{ stage: '到货', status: '待达成' } as PaymentNodePmis], // 不在 projects → 应跳过
  }
  it('仅在册项目的节点入表，带 dept/projStage/tier/progress', () => {
    const rows = paymentNodeRows(nodes, projects, pmisMap)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ projectId: 'A', projectName: '甲', stage: '到货', status: '已达成', dept: '组1', projStage: '实施', tier: '100万以上', progress: '部分回款' })
    expect(rows.every((r) => r.projectId === 'A')).toBe(true)
  })
  it('paymentNodes 缺失 → 空数组', () => {
    expect(paymentNodeRows(undefined, projects, pmisMap)).toEqual([])
  })
})

describe('nodeSummary（节点三态计数 + 计划回款Σ）', () => {
  it('按 status 计数，expectedTotal 求和', () => {
    const projects = [proj({ projectId: 'A', paymentPmis: pm({ contract: 100 }) })]
    const nodes: Record<string, PaymentNodePmis[]> = {
      A: [
        { stage: '到货', status: '已达成', expectedPayment: 70 } as PaymentNodePmis,
        { stage: '终验', status: '延期', expectedPayment: 30 } as PaymentNodePmis,
        { stage: '驻场', status: '待达成', expectedPayment: 10 } as PaymentNodePmis,
      ],
    }
    const s = nodeSummary(paymentNodeRows(nodes, projects, {}))
    expect(s).toEqual({ total: 3, reached: 1, delayed: 1, pending: 1, expectedTotal: 110 })
  })
})

describe('progressBuckets（3 互斥桶，未知单列计数）', () => {
  it('已全额/部分/未回款三桶按固定序，未知不入桶', () => {
    const rows = projectPaymentRows([
      proj({ projectId: 'A', paymentPmis: pm({ contract: 100, paymentRatio: 1, actualTotal: 100 }) }),
      proj({ projectId: 'B', paymentPmis: pm({ contract: 100, paymentRatio: 0.5, actualTotal: 50 }) }),
      proj({ projectId: 'C', paymentPmis: pm({ contract: 100, paymentRatio: 0, actualTotal: 0 }) }),
      proj({ projectId: 'D', paymentPmis: pm({ contract: 0 }) }), // 未知
    ], {})
    const { buckets, unknown } = progressBuckets(rows)
    expect(buckets.map((b) => b.key)).toEqual(['已全额回款', '部分回款', '未回款'])
    expect(buckets.map((b) => b.projectCount)).toEqual([1, 1, 1])
    expect(buckets[1].rate).toBeCloseTo(0.5, 6)
    expect(unknown).toBe(1)
  })
})

describe('pmisRiskGroups（PMIS 风险三类）', () => {
  const projects = [
    proj({ projectId: 'A', projectName: '甲', orgL4: '组1', overspendAmount: 8000, paymentPmis: pm({ contract: 3_000_000, paymentRatio: 0.1, actualTotal: 300_000 }) }),
    proj({ projectId: 'B', projectName: '乙', orgL4: '组2', overspendAmount: 0, paymentPmis: pm({ contract: 1_000_000, paymentRatio: 0.9, actualTotal: 900_000 }) }),
    proj({ projectId: 'C', projectName: '丙', orgL4: '组3', overspendAmount: 3000, paymentPmis: pm({ contract: 500_000, paymentRatio: null, actualTotal: 0 }) }),
  ]
  const nodes: Record<string, PaymentNodePmis[]> = {
    A: [{ stage: '终验', planDate: '2026-05-01', status: '延期', expectedPayment: 100 } as PaymentNodePmis],
    B: [{ stage: '到货', planDate: '2026-02-01', status: '延期', expectedPayment: 50 } as PaymentNodePmis],
  }
  it('延期节点按 planDate 升序；低回款<0.3 且 contract>0 按 contract 降序 Top10；超支>0 按金额降序', () => {
    const rows = projectPaymentRows(projects, {})
    const g = pmisRiskGroups(rows, paymentNodeRows(nodes, projects, {}))
    expect(g.delayedNodes.map((n) => n.projectId)).toEqual(['B', 'A']) // 2026-02 < 2026-05
    expect(g.lowPayment.map((r) => r.projectId)).toEqual(['A', 'C'])   // 0.1 与 null(=0) <0.3；A 合同更大在前
    expect(g.overspend.map((r) => r.projectId)).toEqual(['A', 'C'])    // 8000 > 3000
    expect(g.overspend.map((r) => r.overspendAmount)).toEqual([8000, 3000])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: FAIL（新函数未定义）

- [ ] **Step 3: 追加实现到 `lib/paymentPmis.ts`**

```ts
// ── 节点级回款行（扁平化 + 维度 join；spec §3 回款节点 tab）──
export interface PayNodeRow {
  projectId: string
  projectName: string
  stage: string
  planDate: string
  actualDate: string
  payRatio: number | null
  expectedPayment: number
  status: string
  dept: string
  projStage: string
  tier: string
  progress: string
}

export function paymentNodeRows(
  paymentNodes: Record<string, import('@/types/analysis').PaymentNodePmis[]> | undefined,
  projects: Project[],
  pmisMap?: Record<string, ProjectPmis>,
): PayNodeRow[] {
  if (!paymentNodes) return []
  const byId = new Map(projects.map((p) => [p.projectId, p]))
  const rows: PayNodeRow[] = []
  for (const [pid, nodes] of Object.entries(paymentNodes)) {
    const p = byId.get(pid)
    if (!p) continue // 仅在册（已过滤）项目的节点入表，让视角/纳管过滤流向节点 tab
    const dept = deriveDept(p)
    const tier = deriveTier(p.paymentPmis?.contract)
    const progress = deriveProgress(p.paymentPmis ?? null)
    const projStage = deriveStage(pid, pmisMap)
    for (const n of nodes) {
      rows.push({
        projectId: pid,
        projectName: p.projectName || pid,
        stage: n.stage,
        planDate: n.planDate || '',
        actualDate: n.actualDate || '',
        payRatio: n.payRatio ?? null,
        expectedPayment: n.expectedPayment ?? 0,
        status: n.status || '',
        dept,
        projStage,
        tier,
        progress,
      })
    }
  }
  return rows
}

export interface NodeSummary {
  total: number
  reached: number
  delayed: number
  pending: number
  expectedTotal: number
}
export function nodeSummary(rows: PayNodeRow[]): NodeSummary {
  return {
    total: rows.length,
    reached: rows.filter((r) => r.status === '已达成').length,
    delayed: rows.filter((r) => r.status === '延期').length,
    pending: rows.filter((r) => r.status === '待达成').length,
    expectedTotal: rows.reduce((s, r) => s + r.expectedPayment, 0),
  }
}

// ── 进度桶（项目级 3 互斥桶；spec §3 回款进度 tab）──
const PROGRESS_ORDER = ['已全额回款', '部分回款', '未回款'] as const
export interface ProgressBucket {
  key: string
  projectCount: number
  contractSum: number
  actualSum: number
  rate: number | null
}
export function progressBuckets(rows: PayProjectRow[]): { buckets: ProgressBucket[]; unknown: number } {
  let unknown = 0
  const map: Record<string, PayProjectRow[]> = {}
  for (const r of rows) {
    if (r.progress === '未知') { unknown++; continue }
    ;(map[r.progress] ||= []).push(r)
  }
  const buckets = PROGRESS_ORDER.map((key) => {
    const grp = map[key] || []
    const contractSum = grp.reduce((s, r) => s + r.contract, 0)
    const actualSum = grp.reduce((s, r) => s + r.actualTotal, 0)
    return { key, projectCount: grp.length, contractSum, actualSum, rate: contractSum > 0 ? actualSum / contractSum : null }
  })
  return { buckets, unknown }
}

// ── 风险三类（spec §3 风险项目 tab）──
export interface PmisRiskGroups {
  delayedNodes: PayNodeRow[]
  lowPayment: PayProjectRow[]
  overspend: PayProjectRow[]
}
export function pmisRiskGroups(rows: PayProjectRow[], nodeRows: PayNodeRow[]): PmisRiskGroups {
  const delayedNodes = nodeRows
    .filter((n) => n.status === '延期')
    .sort((a, b) => (a.planDate || '').localeCompare(b.planDate || ''))
  const lowPayment = rows
    .filter((r) => r.contract > 0 && (r.paymentRatio ?? 0) < 0.3)
    .sort((a, b) => b.contract - a.contract)
    .slice(0, 10)
  const overspend = rows
    .filter((r) => r.overspendAmount > 0)
    .sort((a, b) => b.overspendAmount - a.overspendAmount)
  return { delayedNodes, lowPayment, overspend }
}
```

- [ ] **Step 4: 运行测试确认全通过**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: PASS（Task 1 + Task 2 全部 describe）

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无新错误

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "feat(2b): paymentPmis 节点行/节点汇总/进度桶/风险三类纯函数"
```

---

## Task 3: `lib/paymentBoard.ts`（board PMIS 透视，镜像 projectPivot）

**难度：核心算法 → opus。** 结构镜像 `frontend/src/lib/projectPivot.ts`（先读它做模板），复用 `pivot.ts` 的泛型 `CrossMatrix<T>/PivotResult<T>/PivotRow/PivotCol`。指标含 1 个不可加项（完成率 rate，NaN 标记 → 展示 `-`）。

**Files:**
- Create: `frontend/src/lib/paymentBoard.ts`
- Test: `frontend/src/lib/paymentBoard.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/paymentBoard.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Project, ProjectPaymentPmis, ProjectPmis } from '@/types/analysis'
import {
  buildPayBoardRows, PAY_BOARD_DIMENSIONS, PAY_BOARD_METRICS,
  groupPayBoard, payBoardCross, payBoardPivot,
} from './paymentBoard'

const pm = (o: Partial<ProjectPaymentPmis>): ProjectPaymentPmis => ({ ...o })
const proj = (o: Partial<Project>): Project => ({ projectId: 'P0', ...o } as Project)

const projects: Project[] = [
  proj({ projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1',
    paymentPmis: pm({ contract: 2_000_000, actualTotal: 1_000_000, paymentRatio: 0.5, expectedTotal: 1_500_000, delayedCount: 1 }) }),
  proj({ projectId: 'B', projectName: '乙', projectManager: '李四', orgL4: '组1',
    paymentPmis: pm({ contract: 1_000_000, actualTotal: 1_000_000, paymentRatio: 1, expectedTotal: 1_000_000, delayedCount: 0 }) }),
  proj({ projectId: 'C', projectName: '丙', projectManager: '李四', orgL4: '组2',
    paymentPmis: pm({ contract: 0, actualTotal: 0, paymentRatio: null, expectedTotal: 0, delayedCount: 0 }) }),
]
const pmisMap: Record<string, ProjectPmis> = {
  A: { progress: { 项目阶段: '实施' }, customer: { 行业: '银行' } } as unknown as ProjectPmis,
}

describe('PAY_BOARD_DIMENSIONS / PAY_BOARD_METRICS', () => {
  it('维度含部门/阶段/经理/行业/金额档/进度态', () => {
    expect(PAY_BOARD_DIMENSIONS.map((d) => d.key)).toEqual(['dept', 'stage', 'manager', 'industry', 'tier', 'progress'])
  })
  it('指标 7 项，仅 rate 为 kind=rate（不可加）', () => {
    expect(PAY_BOARD_METRICS.map((m) => m.key)).toEqual(['projectCount', 'contractSum', 'actualSum', 'expectedSum', 'pendingSum', 'rate', 'delayedNodeSum'])
    expect(PAY_BOARD_METRICS.filter((m) => m.kind === 'rate').map((m) => m.key)).toEqual(['rate'])
  })
})

describe('buildPayBoardRows', () => {
  it('维度字段 + 指标基 + 下钻兼容列', () => {
    const rows = buildPayBoardRows(projects, pmisMap)
    const a = rows.find((r) => r.projectId === 'A')!
    expect(a).toMatchObject({
      dept: '组1', stage: '实施', manager: '张三', industry: '银行', tier: '100万以上', progress: '部分回款',
      contract: 2_000_000, actualTotal: 1_000_000, expectedTotal: 1_500_000, delayedCount: 1, paymentRatio: 0.5,
      projectAmount: 2_000_000, paymentStatus: '部分回款', orgL4: '组1', projectManager: '张三',
    })
    const b = rows.find((r) => r.projectId === 'B')!
    expect(b).toMatchObject({ stage: '未指定', industry: '未指定' }) // pmisMap 无 B
  })
})

describe('groupPayBoard（单维分桶 + 7 指标，加权完成率 Σ÷Σ）', () => {
  it('按 dept：组1 合计；待回款Σ=Σmax(contract-actual,0)', () => {
    const g = groupPayBoard(buildPayBoardRows(projects, pmisMap), ['dept'])
    const g1 = g.find((x) => x.key === '组1')!
    expect(g1).toMatchObject({ projectCount: 2, contractSum: 3_000_000, actualSum: 2_000_000, expectedSum: 2_500_000, delayedNodeSum: 1 })
    expect(g1.pendingSum).toBe(1_000_000)            // A:1e6 待回, B:0
    expect(g1.rate).toBeCloseTo(2_000_000 / 3_000_000, 6)
    const g2 = g.find((x) => x.key === '组2')!
    expect(g2.rate).toBeNull()                       // contractSum 0 → null
  })
  it('默认按项目数降序', () => {
    const g = groupPayBoard(buildPayBoardRows(projects, pmisMap), ['dept'])
    expect(g[0].projectCount).toBeGreaterThanOrEqual(g[g.length - 1].projectCount)
  })
})

describe('payBoardCross / payBoardPivot（复用泛型结构；rate 无数据→NaN 单元格）', () => {
  it('cross 返回 rows/cols/cells/index', () => {
    const m = payBoardCross(buildPayBoardRows(projects, pmisMap), 'dept', 'progress', 'contractSum')
    expect(m.rows.length).toBeGreaterThan(0)
    expect(Array.isArray(m.cells)).toBe(true)
  })
  it('pivot 多行多列；colDims 空退化单列合计', () => {
    const r = payBoardPivot(buildPayBoardRows(projects, pmisMap), ['dept'], [], 'projectCount')
    expect(r.cols).toHaveLength(1)
    expect(r.cols[0].label).toBe('合计')
  })
  it('rate 指标空桶单元格为 NaN（展示层显 -）', () => {
    const m = payBoardCross(buildPayBoardRows(projects, pmisMap), 'dept', 'progress', 'rate')
    const hasNaN = m.cells.flat().some((v) => Number.isNaN(v))
    expect(hasNaN).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentBoard.test.ts`
Expected: FAIL（`Cannot find module './paymentBoard'`）

- [ ] **Step 3: 实现 `lib/paymentBoard.ts`**

> 实现要点：复制 `lib/projectPivot.ts` 的 `groupInsight/insightCross/insightPivot` 三函数骨架（分桶 key=各维取值 ` / ` 连接、`cellVal` 对 null 返回 `NaN`、`mv` 用 `?? 0`），把 `InsightRow/InsightGroup/INSIGHT_*` 换成下方 PMIS 版本。

```ts
import type { Project, ProjectPmis } from '@/types/analysis'
import type { CrossMatrix, PivotResult, PivotRow, PivotCol } from './pivot'
import { deriveTier, deriveProgress, deriveDept, deriveStage } from './paymentPmis'

const v = (raw: unknown, fallback = '未指定') => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? fallback : s
}

export interface PayBoardRow {
  projectId: string
  projectName: string
  orgL4: string
  projectManager: string
  // 维度（字段名 = 维度 key，供 r[dimKey] 取值）
  dept: string
  stage: string
  manager: string
  industry: string
  tier: string
  progress: string
  // 指标基
  contract: number
  actualTotal: number
  expectedTotal: number
  delayedCount: number
  paymentRatio: number | null
  // 下钻兼容列（BoardDrilldownModal）
  projectAmount: number
  paymentStatus: string
}

export function buildPayBoardRows(projects: Project[], pmisMap?: Record<string, ProjectPmis>): PayBoardRow[] {
  return projects.map((p) => {
    const pmis = p.paymentPmis ?? null
    const cust = (pmisMap?.[p.projectId]?.customer ?? {}) as Record<string, unknown>
    const contract = pmis?.contract ?? 0
    const dept = deriveDept(p)
    const progress = deriveProgress(pmis)
    const manager = v(p.projectManager)
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      orgL4: dept,
      projectManager: manager,
      dept,
      stage: deriveStage(p.projectId, pmisMap),
      manager,
      industry: v(cust['行业']),
      tier: deriveTier(pmis?.contract),
      progress,
      contract,
      actualTotal: pmis?.actualTotal ?? 0,
      expectedTotal: pmis?.expectedTotal ?? 0,
      delayedCount: pmis?.delayedCount ?? 0,
      paymentRatio: pmis?.paymentRatio ?? null,
      projectAmount: contract,
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
  return {
    key,
    values,
    rows: grows,
    projectCount: grows.length,
    contractSum,
    actualSum,
    expectedSum: grows.reduce((s, r) => s + r.expectedTotal, 0),
    pendingSum: grows.reduce((s, r) => s + Math.max(r.contract - r.actualTotal, 0), 0),
    rate: contractSum > 0 ? actualSum / contractSum : null,
    delayedNodeSum: grows.reduce((s, r) => s + r.delayedCount, 0),
  }
}

/** 按 1..N 维分桶（桶 key=各维取值 " / " 连接），算 7 指标；默认按项目数降序。 */
export function groupPayBoard(rows: PayBoardRow[], dimKeys: string[]): PayBoardGroup[] {
  const defs = dimKeys.map((k) => PAY_BOARD_DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, PayBoardRow[]> = {}
  for (const r of rows) {
    const key = defs.map((d) => (r as Record<string, unknown>)[d.key]).join(' / ')
    ;(buckets[key] ||= []).push(r)
  }
  return Object.entries(buckets)
    .map(([key, grows]) => buildGroup(key, defs.map((d) => String((grows[0] as Record<string, unknown>)[d.key])), grows))
    .sort((a, b) => b.projectCount - a.projectCount)
}

const mv = (g: PayBoardGroup, k: PayBoardMetricKey): number => (g[k] ?? 0) as number
const cellVal = (g: PayBoardGroup | undefined, k: PayBoardMetricKey): number => {
  if (!g) return 0
  const x = g[k]
  return x == null ? NaN : (x as number)
}

/** 双维交叉（复用 pivot 泛型结构）：行列按指标合计降序，rate null→0 计合计。 */
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

/** 多行多列透视（colDims 空退化单列合计）。 */
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
```

> 注：若 `pivot.ts` 的 `CrossMatrix`/`PivotResult` 含未在上方构造的可选字段（如 `rowDimLabels`），以 `projectPivot.ts` 实际返回结构为准对齐（它是同一类型的现成消费者）。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentBoard.test.ts`
Expected: PASS

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无新错误

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/paymentBoard.ts frontend/src/lib/paymentBoard.test.ts
git commit -m "feat(2b): paymentBoard PMIS 透视(镜像 projectPivot,复用泛型类型)"
```

---

## Task 4: `ProjectsOverviewTab.vue` 换骨（项目总览）

**难度：常规组件 → sonnet。**

**Files:**
- Modify: `frontend/src/components/ProjectsOverviewTab.vue`（整体重写）
- Modify: `frontend/src/components/ProjectsOverviewTab.test.ts`（整体重写）

- [ ] **Step 1: 写失败测试（薄渲染）**

> 挂载样板（createPinia + seed dataStore.data）请照重写前的 `ProjectsOverviewTab.test.ts` 原样式；断言改为下方。

`frontend/src/components/ProjectsOverviewTab.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import ProjectsOverviewTab from './ProjectsOverviewTab.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [
      { projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1',
        paymentPmis: { contract: 2_000_000, actualTotal: 1_000_000, paymentRatio: 0.5, expectedTotal: 1_500_000, nodeCount: 3, reachedCount: 1, delayedCount: 1, fromOrigin: false } },
    ],
    projectPmis: { A: { progress: { 项目阶段: '实施' } } },
    naguanExclude: {},
  } as any
}

describe('ProjectsOverviewTab', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('渲染项目行与维度汇总，行可点击', () => {
    seed()
    const w = mount(ProjectsOverviewTab, { props: { dim: 'dept' } })
    expect(w.text()).toContain('甲')
    expect(w.text()).toContain('部门汇总')
    expect(w.text()).toContain('组1')
  })
  it('空数据不崩', () => {
    const data = useDataStore(); data.data = { projects: [], projectPmis: {}, naguanExclude: {} } as any
    const w = mount(ProjectsOverviewTab, { props: { dim: 'tier' } })
    expect(w.exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/ProjectsOverviewTab.test.ts`
Expected: FAIL（旧组件断言不符 / 引用旧 lib）

- [ ] **Step 3: 重写 `ProjectsOverviewTab.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { fmtWan, fmtRatio } from '@/lib/format'
import { projectPaymentRows, summaryByDim, filterProjects, rateColorPmis, PAY_FACET_DIMS } from '@/lib/paymentPmis'

const props = defineProps<{ dim: string }>()
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()

const rows = computed(() =>
  projectPaymentRows(
    filterProjects(data.data?.projects ?? [], {
      viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
      naguanOn: filter.naguanOn, naguanExclude: data.data?.naguanExclude ?? {},
    }),
    data.data?.projectPmis ?? {},
  ),
)
const summary = computed(() => summaryByDim(rows.value, props.dim))
const dimLabel = computed(() => PAY_FACET_DIMS.find((d) => d.key === props.dim)?.label ?? '维度')

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'projectManager', label: '经理' },
  { key: 'dept', label: '部门' },
  { key: 'contract', label: '合同(万)', sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'actualTotal', label: '已回款(万)', sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'paymentRatio', label: '完成率', sortable: true },
  { key: 'expectedTotal', label: '计划回款(万)', formatter: (v) => fmtWan(v) },
  { key: 'nodeCount', label: '节点' },
  { key: 'reachedCount', label: '达成' },
  { key: 'delayedCount', label: '延期' },
  { key: 'fromOrigin', label: '来源', formatter: (v) => (v ? '售前·取原项目' : '') },
]
function onRow(row: Record<string, any>) { pd.open(row.projectId) }
</script>

<template>
  <div class="pov-tab">
    <section class="dim-summary">
      <div class="ds-head">{{ dimLabel }}汇总</div>
      <table class="ds-table u-num">
        <thead>
          <tr><th>{{ dimLabel }}</th><th>项目数</th><th>合同Σ(万)</th><th>已回Σ(万)</th><th>完成率</th><th>延期节点Σ</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in summary" :key="s.value">
            <td class="ds-val">{{ s.value }}</td>
            <td>{{ s.projectCount }}</td>
            <td>{{ fmtWan(s.contractSum) }}</td>
            <td>{{ fmtWan(s.actualSum) }}</td>
            <td :style="{ color: rateColorPmis(s.rate) }">{{ fmtRatio(s.rate) }}</td>
            <td>{{ s.delayedNodeSum }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <DataTable :columns="COLS" :rows="rows" clickable @row-click="onRow">
      <template #cell-paymentRatio="{ value }">
        <span class="u-num" :style="{ color: rateColorPmis(value) }">{{ fmtRatio(value) }}</span>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.dim-summary { margin-bottom: var(--gap-section); }
.ds-head { font-size: var(--fs-2); color: var(--sub); margin-bottom: var(--sp-2); }
.ds-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.ds-table th, .ds-table td { border: 1px solid var(--line); padding: 8px 12px; text-align: right; }
.ds-table th:first-child, .ds-table td.ds-val { text-align: left; }
.ds-table th { background: var(--card2); color: var(--sub); font-weight: 600; }
.ds-table td { color: var(--txt); }
</style>
```

- [ ] **Step 4: 运行测试确认通过 + typecheck**

Run: `cd frontend && npx vitest run src/components/ProjectsOverviewTab.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProjectsOverviewTab.vue frontend/src/components/ProjectsOverviewTab.test.ts
git commit -m "feat(2b): 项目总览 tab 换骨为 paymentPmis 项目行+单维汇总+行下钻详情"
```

---

## Task 5: `TierNodesTab.vue` 换骨（回款节点）

**难度：常规组件 → sonnet。** 节点级表，状态三态淡底深字徽章（`已达成=ok / 延期=danger / 待达成=warn`）。

**Files:**
- Modify: `frontend/src/components/TierNodesTab.vue`（整体重写）
- Modify: `frontend/src/components/TierNodesTab.test.ts`（整体重写）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import TierNodesTab from './TierNodesTab.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [{ projectId: 'A', projectName: '甲', orgL4: '组1', paymentPmis: { contract: 2_000_000, paymentRatio: 0.5 } }],
    paymentNodes: { A: [
      { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.7, expectedPayment: 1_400_000, reached: true, status: '已达成' },
      { stage: '终验', planDate: '2026-03-01', actualDate: '', payRatio: 0.3, expectedPayment: 600_000, reached: false, status: '延期' },
    ] },
    projectPmis: { A: { progress: { 项目阶段: '实施' } } },
    naguanExclude: {},
  } as any
}

describe('TierNodesTab', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('渲染节点行 + 汇总条(总数/已达成/延期/待达成) + 状态徽章', () => {
    seed()
    const w = mount(TierNodesTab, { props: { dim: 'dept' } })
    expect(w.text()).toContain('到货')
    expect(w.text()).toContain('节点总数')
    expect(w.text()).toContain('已达成')
    expect(w.text()).toContain('延期')
  })
  it('空数据不崩', () => {
    const data = useDataStore(); data.data = { projects: [], paymentNodes: {}, projectPmis: {}, naguanExclude: {} } as any
    expect(mount(TierNodesTab, { props: { dim: 'tier' } }).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 确认失败**

Run: `cd frontend && npx vitest run src/components/TierNodesTab.test.ts`
Expected: FAIL

- [ ] **Step 3: 重写 `TierNodesTab.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { fmtWan, fmtRatio } from '@/lib/format'
import { paymentNodeRows, nodeSummary, filterProjects } from '@/lib/paymentPmis'

defineProps<{ dim: string }>()
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()

const rows = computed(() => {
  const ps = filterProjects(data.data?.projects ?? [], {
    viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
    naguanOn: filter.naguanOn, naguanExclude: data.data?.naguanExclude ?? {},
  })
  return paymentNodeRows(data.data?.paymentNodes, ps, data.data?.projectPmis ?? {})
})
const sum = computed(() => nodeSummary(rows.value))

const COLS: DataColumn[] = [
  { key: 'projectName', label: '项目' },
  { key: 'stage', label: '阶段' },
  { key: 'planDate', label: '计划日' },
  { key: 'actualDate', label: '实际日' },
  { key: 'payRatio', label: '计划比例', formatter: (v) => fmtRatio(v) },
  { key: 'expectedPayment', label: '计划金额(万)', sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'status', label: '状态' },
]
const STATUS_CLASS: Record<string, string> = { 已达成: 'st-ok', 延期: 'st-danger', 待达成: 'st-warn' }
function onRow(row: Record<string, any>) { pd.open(row.projectId) }
</script>

<template>
  <div class="nodes-tab">
    <section class="nsum u-num">
      <div class="ns"><span class="ns-l">节点总数</span><span class="ns-v">{{ sum.total }}</span></div>
      <div class="ns"><span class="ns-l">已达成</span><span class="ns-v" style="color:var(--ok-text)">{{ sum.reached }}</span></div>
      <div class="ns"><span class="ns-l">延期</span><span class="ns-v" style="color:var(--danger-text)">{{ sum.delayed }}</span></div>
      <div class="ns"><span class="ns-l">待达成</span><span class="ns-v" style="color:var(--warn-text)">{{ sum.pending }}</span></div>
      <div class="ns"><span class="ns-l">计划回款Σ(万)</span><span class="ns-v">{{ fmtWan(sum.expectedTotal) }}</span></div>
    </section>
    <DataTable :columns="COLS" :rows="rows" clickable @row-click="onRow">
      <template #cell-status="{ value }">
        <span class="st-badge" :class="STATUS_CLASS[value] || 'st-warn'">{{ value }}</span>
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.nsum { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-card); margin-bottom: var(--gap-section); }
.ns { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); display: flex; flex-direction: column; gap: var(--sp-1); }
.ns-l { font-size: var(--fs-1); color: var(--mut); }
.ns-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); }
.st-badge { padding: 2px 8px; border-radius: var(--r-sm); font-size: var(--fs-1); }
.st-ok { background: var(--ok-bg); color: var(--ok-text); }
.st-danger { background: var(--danger-bg); color: var(--danger-text); }
.st-warn { background: var(--warn-bg); color: var(--warn-text); }
</style>
```

- [ ] **Step 4: 测试 + typecheck**

Run: `cd frontend && npx vitest run src/components/TierNodesTab.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TierNodesTab.vue frontend/src/components/TierNodesTab.test.ts
git commit -m "feat(2b): 回款节点 tab 换骨为 paymentNodes 节点表+三态徽章+PMIS 汇总条"
```

---

## Task 6: `PlanTab.vue` → 回款进度（3 进度桶 + 项目表 + 交叉筛选）；删 `PlanBoard.vue`

**难度：易踩坑（CF 集成）→ opus。** 3 互斥进度桶卡 + 项目表（复用 `crossFilter`/`stores/crossFilter`/`ColumnFilter` 做列筛联动，照 `LedgerTable.vue` 的原生表+`ColumnFilter` 表头模式）。**延期不在此 tab**（归风险 tab）。

**Files:**
- Modify: `frontend/src/components/PlanTab.vue`（整体重写）
- Modify: `frontend/src/components/PlanTab.test.ts`（整体重写）
- Delete: `frontend/src/components/PlanBoard.vue` + `frontend/src/components/PlanBoard.test.ts`（Task 10 统一删；本任务先解除引用）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import PlanTab from './PlanTab.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [
      { projectId: 'A', projectName: '甲', orgL4: '组1', paymentPmis: { contract: 100, actualTotal: 100, paymentRatio: 1 } },
      { projectId: 'B', projectName: '乙', orgL4: '组1', paymentPmis: { contract: 100, actualTotal: 50, paymentRatio: 0.5 } },
      { projectId: 'C', projectName: '丙', orgL4: '组2', paymentPmis: { contract: 100, actualTotal: 0, paymentRatio: 0 } },
    ],
    projectPmis: {}, naguanExclude: {},
  } as any
}

describe('PlanTab(回款进度)', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('渲染 3 进度桶卡（已全额/部分/未回款）', () => {
    seed()
    const w = mount(PlanTab, { props: { dim: 'dept' } })
    expect(w.text()).toContain('已全额回款')
    expect(w.text()).toContain('部分回款')
    expect(w.text()).toContain('未回款')
  })
  it('空数据不崩', () => {
    const data = useDataStore(); data.data = { projects: [], projectPmis: {}, naguanExclude: {} } as any
    expect(mount(PlanTab, { props: { dim: 'tier' } }).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 确认失败**

Run: `cd frontend && npx vitest run src/components/PlanTab.test.ts`
Expected: FAIL

- [ ] **Step 3: 重写 `PlanTab.vue`**

> 列筛集成照 `LedgerTable.vue`：原生 `<table>` 表头嵌 `<ColumnFilter :table-id :col-key :source-rows :group />`，表体 `applyColumnFilters(rows, cfStore.filtersFor(tableId))`。CF store 用法以 `LedgerTable.vue`/`stores/crossFilter.ts` 实际 API 为准（先读它确认 `filtersFor`/字段名）。

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters } from '@/lib/crossFilter'
import ColumnFilter from './ColumnFilter.vue'
import { formatCellValue } from '@/lib/cellFormat'
import { fmtWan, fmtRatio } from '@/lib/format'
import { projectPaymentRows, progressBuckets, filterProjects, rateColorPmis } from '@/lib/paymentPmis'

defineProps<{ dim: string }>()
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()
const cf = useCrossFilterStore()
const TABLE_ID = 'panalysis-progress'

const rows = computed(() =>
  projectPaymentRows(
    filterProjects(data.data?.projects ?? [], {
      viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
      naguanOn: filter.naguanOn, naguanExclude: data.data?.naguanExclude ?? {},
    }),
    data.data?.projectPmis ?? {},
  ),
)
const buckets = computed(() => progressBuckets(rows.value))

const COLS = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'dept', label: '部门' },
  { key: 'progress', label: '进度态' },
  { key: 'contract', label: '合同(万)' },
  { key: 'actualTotal', label: '已回款(万)' },
  { key: 'paymentRatio', label: '完成率' },
]
// 列筛后行（API 名以 stores/crossFilter.ts 实际为准）
const filteredRows = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)))
const fmtCol = (key: string, v: any) =>
  key === 'contract' || key === 'actualTotal' ? fmtWan(v) : key === 'paymentRatio' ? fmtRatio(v) : formatCellValue(v, key)
function onRow(r: Record<string, any>) { pd.open(r.projectId) }
</script>

<template>
  <div class="progress-tab">
    <section class="buckets">
      <div v-for="b in buckets.buckets" :key="b.key" class="bk" :class="`bk-${b.key}`">
        <div class="bk-title">{{ b.key }}</div>
        <div class="bk-main u-num">{{ b.projectCount }}<span class="bk-unit"> 个</span></div>
        <div class="bk-sub u-num">
          合同Σ {{ fmtWan(b.contractSum) }} 万 · 已回Σ {{ fmtWan(b.actualSum) }} 万 ·
          完成率 <span :style="{ color: rateColorPmis(b.rate) }">{{ fmtRatio(b.rate) }}</span>
        </div>
      </div>
      <div v-if="buckets.unknown" class="bk-unknown">另有 {{ buckets.unknown }} 个项目无合同（未知，不计入进度桶）</div>
    </section>

    <div class="cf-bar">共 {{ filteredRows.length }} / {{ rows.length }} 个项目<button class="cf-clear" @click="cf.clear(TABLE_ID)">清除筛选</button></div>
    <div class="tbl-wrap">
      <table class="ptbl u-num">
        <thead>
          <tr>
            <th v-for="c in COLS" :key="c.key">
              <span class="th-l">{{ c.label }}</span>
              <ColumnFilter :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" :group="[]" />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in filteredRows.slice(0, 300)" :key="r.projectId" class="prow" @click="onRow(r)">
            <td v-for="c in COLS" :key="c.key" :style="c.key === 'paymentRatio' ? { color: rateColorPmis(r.paymentRatio) } : undefined">
              {{ fmtCol(c.key, r[c.key]) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.buckets { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--gap-card); margin-bottom: var(--gap-section); }
.bk { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.bk-title { font-size: var(--fs-2); color: var(--sub); margin-bottom: var(--sp-1); }
.bk-main { font-size: var(--fs-6); font-weight: 700; color: var(--txt); }
.bk-unit { font-size: var(--fs-2); color: var(--mut); font-weight: 400; }
.bk-sub { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-1); }
.bk-unknown { grid-column: 1 / -1; font-size: var(--fs-1); color: var(--mut); }
.cf-bar { display: flex; align-items: center; gap: var(--sp-3); font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-2); }
.cf-clear { font-size: var(--fs-1); color: var(--accent); background: none; border: none; cursor: pointer; }
.tbl-wrap { overflow-x: auto; }
.ptbl { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.ptbl th, .ptbl td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; white-space: nowrap; }
.ptbl th { background: var(--card2); color: var(--sub); }
.prow { cursor: pointer; }
.prow:hover { background: var(--hover-tint); }
</style>
```

> **CF API 校准**：`cf.tableFilters(TABLE_ID)` / `cf.clear(TABLE_ID)` 是占位名 —— 实现前先读 `stores/crossFilter.ts` 与 `LedgerTable.vue` 确认真实方法名（如 `filtersFor`/`reset`/`clearTable`），并据实改 `applyColumnFilters` 第二参与按钮调用。`ColumnFilter` 的 props（`table-id`/`col-key`/`source-rows`/`group`）照 `PlanBoard.vue` 旧用法。

- [ ] **Step 4: 测试 + typecheck**

Run: `cd frontend && npx vitest run src/components/PlanTab.test.ts && npm run typecheck`
Expected: PASS（若 CF store API 名不符，先校准再跑）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PlanTab.vue frontend/src/components/PlanTab.test.ts
git commit -m "feat(2b): 回款进度 tab 重写为 3 进度桶+项目表(复用 crossFilter 列筛)"
```

---

## Task 7: `RiskTab.vue` 换骨（PMIS 风险三类）

**难度：常规组件 → sonnet。** 三块：① 延期节点（按 planDate 升序）② 低回款项目（ratio<0.3 且 contract>0，Top10）③ 超支项目（overspendAmount>0）。删旧"加资源可提前/临期可提前"。

**Files:**
- Modify: `frontend/src/components/RiskTab.vue`（整体重写）
- Modify: `frontend/src/components/RiskTab.test.ts`（整体重写）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import RiskTab from './RiskTab.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [
      { projectId: 'A', projectName: '甲', orgL4: '组1', overspendAmount: 8000, paymentPmis: { contract: 3_000_000, paymentRatio: 0.1, actualTotal: 300_000 } },
      { projectId: 'B', projectName: '乙', orgL4: '组2', overspendAmount: 0, paymentPmis: { contract: 1_000_000, paymentRatio: 0.9, actualTotal: 900_000 } },
    ],
    paymentNodes: { A: [{ stage: '终验', planDate: '2026-05-01', status: '延期', expectedPayment: 100 }] },
    projectPmis: {}, naguanExclude: {},
  } as any
}

describe('RiskTab(PMIS 风险三类)', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('渲染三组标题与命中项', () => {
    seed()
    const w = mount(RiskTab, { props: { dim: 'dept' } })
    expect(w.text()).toContain('延期节点')
    expect(w.text()).toContain('低回款项目')
    expect(w.text()).toContain('超支项目')
    expect(w.text()).toContain('甲')
  })
  it('空数据不崩', () => {
    const data = useDataStore(); data.data = { projects: [], paymentNodes: {}, projectPmis: {}, naguanExclude: {} } as any
    expect(mount(RiskTab, { props: { dim: 'tier' } }).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 确认失败**

Run: `cd frontend && npx vitest run src/components/RiskTab.test.ts`
Expected: FAIL

- [ ] **Step 3: 重写 `RiskTab.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { fmtWan, fmtRatio, fmtYuan } from '@/lib/format'
import { projectPaymentRows, paymentNodeRows, pmisRiskGroups, filterProjects, rateColorPmis } from '@/lib/paymentPmis'

defineProps<{ dim: string }>()
const data = useDataStore()
const filter = useFilterStore()
const pd = useProjectDetailStore()

const ctx = computed(() => {
  const ps = filterProjects(data.data?.projects ?? [], {
    viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
    naguanOn: filter.naguanOn, naguanExclude: data.data?.naguanExclude ?? {},
  })
  const rows = projectPaymentRows(ps, data.data?.projectPmis ?? {})
  const nodeRows = paymentNodeRows(data.data?.paymentNodes, ps, data.data?.projectPmis ?? {})
  return pmisRiskGroups(rows, nodeRows)
})

const NODE_COLS: DataColumn[] = [
  { key: 'projectName', label: '项目' },
  { key: 'stage', label: '阶段' },
  { key: 'planDate', label: '计划日' },
  { key: 'expectedPayment', label: '计划金额(万)', formatter: (v) => fmtWan(v) },
]
const LOW_COLS: DataColumn[] = [
  { key: 'projectName', label: '项目' },
  { key: 'contract', label: '合同(万)', formatter: (v) => fmtWan(v) },
  { key: 'actualTotal', label: '已回(万)', formatter: (v) => fmtWan(v) },
  { key: 'paymentRatio', label: '完成率' },
]
const OVER_COLS: DataColumn[] = [
  { key: 'projectName', label: '项目' },
  { key: 'dept', label: '部门' },
  { key: 'overspendAmount', label: '超支金额(元)', formatter: (v) => fmtYuan(v) },
]
function onRow(r: Record<string, any>) { pd.open(r.projectId) }
</script>

<template>
  <div class="risk-tab">
    <section class="rg">
      <h3 class="rg-h">延期节点（{{ ctx.delayedNodes.length }}）</h3>
      <DataTable :columns="NODE_COLS" :rows="ctx.delayedNodes" clickable @row-click="onRow" />
    </section>
    <section class="rg">
      <h3 class="rg-h">低回款项目（完成率&lt;30% 且有合同，Top10）</h3>
      <DataTable :columns="LOW_COLS" :rows="ctx.lowPayment" clickable @row-click="onRow">
        <template #cell-paymentRatio="{ value }">
          <span class="u-num" :style="{ color: rateColorPmis(value) }">{{ fmtRatio(value) }}</span>
        </template>
      </DataTable>
    </section>
    <section class="rg">
      <h3 class="rg-h">超支项目（{{ ctx.overspend.length }}）</h3>
      <DataTable :columns="OVER_COLS" :rows="ctx.overspend" clickable @row-click="onRow" />
    </section>
  </div>
</template>

<style scoped>
.rg { margin-bottom: var(--gap-section); }
.rg-h { font-size: var(--fs-3); color: var(--txt); font-weight: 700; margin: 0 0 var(--sp-2); }
</style>
```

> 注：若 `fmtYuan` 不存在则用 `formatCellValue(v, 'overspendAmount')` 或 `(v) => String(v)`；实现前确认 `lib/format.ts` 导出（核实见关键事实）。

- [ ] **Step 4: 测试 + typecheck**

Run: `cd frontend && npx vitest run src/components/RiskTab.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/RiskTab.vue frontend/src/components/RiskTab.test.ts
git commit -m "feat(2b): 风险项目 tab 换骨为 PMIS 风险三类(延期节点/低回款/超支)"
```

---

## Task 8: `BoardView.vue` 改消费 paymentBoard + `BoardDrilldownModal` 放宽 prop

**难度：易踩坑（共享组件 + board 接线）→ opus。**

**Files:**
- Modify: `frontend/src/components/BoardDrilldownModal.vue:8-12`（`projects` 类型放宽）
- Modify: `frontend/src/views/BoardView.vue`（数据源切 paymentBoard）
- Modify: `frontend/src/views/BoardView.test.ts`（断言对齐）

- [ ] **Step 1: 放宽 `BoardDrilldownModal` prop（不破 TierStrip）**

把 `frontend/src/components/BoardDrilldownModal.vue` 第 6 行 `import type { ProjectAgg } ...` 删除，第 8-12 行改：

```ts
const props = defineProps<{
  modelValue: boolean
  title: string
  projects: Record<string, any>[]
}>()
```

（`ProjectAgg[]` 可赋给 `Record<string, any>[]`，`TierStrip` 旧用法保持兼容；列读取 `row[key]` 与 `pd.open(row.projectId)` 不变。）

- [ ] **Step 2: 改写 `BoardView.vue` 数据源（核心）**

先读 `BoardView.vue` 全文。把 `@/lib/pivot` 的导入替换为 `@/lib/paymentBoard`，把 `filter.filteredNodes` 替换为"`filterProjects(projects)` → `buildPayBoardRows`"，三模式函数对应替换：

- 导入：
```ts
import {
  PAY_BOARD_DIMENSIONS as DIMENSIONS, PAY_BOARD_METRICS as METRICS, PAY_BOARD_METRIC_BY_KEY as METRIC_BY_KEY,
  buildPayBoardRows, groupPayBoard, payBoardCross, payBoardPivot, type PayBoardGroup,
} from '@/lib/paymentBoard'
import { filterProjects } from '@/lib/paymentPmis'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
```
- 行源：
```ts
const data = useDataStore()
const filter = useFilterStore()
const boardRows = computed(() =>
  buildPayBoardRows(
    filterProjects(data.data?.projects ?? [], {
      viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
      naguanOn: filter.naguanOn, naguanExclude: data.data?.naguanExclude ?? {},
    }),
    data.data?.projectPmis ?? {},
  ),
)
```
- 三模式：`groupByDims(filter.filteredNodes, [dimKey])` → `groupPayBoard(boardRows.value, [dimKey])`；`crossMatrix(...)` → `payBoardCross(boardRows.value, rowDim, colDim, metricKey)`；`pivotTable(...)` → `payBoardPivot(boardRows.value, rowDims, colDims, metricKey)`。
- 下钻：`BoardDrilldownModal :projects` 传当前组 `drillGroup?.rows`（`PayBoardGroup.rows` 为 `PayBoardRow[]`，含 `projectId/projectName/tier/orgL4/projectManager/projectAmount/paymentStatus/paymentRatio` —— 与 `BoardDrilldownModal` 列对齐）。
- 指标可加性：堆叠图判定改 `METRIC_BY_KEY[metricKey].kind !== 'rate'`（金额/计数可堆叠，完成率不可加，NaN→`-` 沿用既有展示）。
- `PivotGroup` 类型引用全部改 `PayBoardGroup`。

> 保留 BoardView 的三模式 UI/SegToggle/DimPicker/图表/下钻交互骨架不变，仅换数据源与维度/指标常量。`DimPicker` 接 `DIMENSIONS`（现为 PAY_BOARD_DIMENSIONS）。

- [ ] **Step 3: 对齐 `BoardView.test.ts`**

读旧测试，把"喂 `filteredNodes`/旧维度/旧指标"的 seed 改为 seed `dataStore.data.projects`（带 `paymentPmis`）+ `projectPmis`，断言维度标签（部门/阶段/金额档/进度态…）与指标标签（合同总额/已回款/完成率…）出现、排名表渲染、下钻弹窗打开。挂载样板照旧测试。

- [ ] **Step 4: 运行测试 + typecheck**

Run: `cd frontend && npx vitest run src/views/BoardView.test.ts src/components/BoardDrilldownModal.test.ts && npm run typecheck`
Expected: PASS（`BoardDrilldownModal.test.ts` 若断言 `ProjectAgg` 类型需同步放宽）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/BoardView.vue frontend/src/views/BoardView.test.ts frontend/src/components/BoardDrilldownModal.vue
git commit -m "feat(2b): 多维看板 board 切 paymentBoard PMIS 指标(项目级);下钻 modal 放宽 prop"
```

---

## Task 9: `PayAnalysisView.vue` 外壳——删质检 tab + 共享维度选择器 + 去 tierSummaryBar

**难度：常规 → sonnet（接线密集，主循环可亲做）。**

**Files:**
- Modify: `frontend/src/views/PayAnalysisView.vue`
- Modify: `frontend/src/nav.ts`（`TIER_TABS` 去 `integrity`）
- Test: 若存在 `frontend/src/views/PayAnalysisView.test.ts` 则对齐；否则新增最小渲染测试

- [ ] **Step 1: 改 `nav.ts` `TIER_TABS` 去 integrity**

读 `nav.ts`，从 `TIER_TABS` 数组移除 `integrity` 项（保留 board/projects/nodes/plan/risk）。`TIERS` 不动（`/dashboard` `TierStrip` 仍用）。

- [ ] **Step 2: 改 `PayAnalysisView.vue`**

照下列改（保 6→5 tab、删档位 SegToggle、加共享维度选择器、删 `tierSummaryBar`）：

- `TABS` 常量删 `{ tab: 'integrity', ... }`，余 `board(多维看板)/projects(项目总览)/nodes(回款节点)/plan(回款进度)/risk(风险项目)`（`plan` 标签文案改"回款进度"）。
- 删 `import { tierSummaryBar } from '@/lib/dashboardStats'`、删 `import { TIERS } from '@/nav'`、删 `tier` ref 与 `TIER_OPTS`、删 nodes 汇总条（已移入 `TierNodesTab`）。
- 删 `import TierIntegrityTab` 与其 `<TierIntegrityTab>` 分支。
- 新增共享维度选择器：
```ts
import { PAY_FACET_DIMS } from '@/lib/paymentPmis'
const dim = ref<'dept' | 'stage' | 'tier' | 'progress'>('dept')
```
顶栏右侧（仅 `tab !== 'board'` 时显示）：
```vue
<SegToggle v-if="tab !== 'board'" v-model="dim" :options="PAY_FACET_DIMS.map((d) => ({ value: d.key, label: d.label }))" />
```
- 四个 facet tab 传 `:dim="dim"`（替原 `:tier="tier"`）：`<ProjectsOverviewTab :dim="dim" />` / `<TierNodesTab :dim="dim" />` / `<PlanTab :dim="dim" />` / `<RiskTab :dim="dim" />`。`<BoardView />` 不传 dim（自带 DimPicker）。

> `SegToggle` 的 `v-model`/`options` 用法以现有 `BoardView`/`DashboardView` 调用为准。

- [ ] **Step 3: 渲染测试**

新增/对齐 `frontend/src/views/PayAnalysisView.test.ts`：mount，断言 tab 条含"多维看板/项目总览/回款节点/回款进度/风险项目"、**不含"数据质检"**；切到非 board tab 时维度选择器（部门/阶段/金额档/进度态）出现。挂载需 stub router-link / seed 最小 dataStore（照仓库现有 view 测试样板）。

- [ ] **Step 4: 运行测试 + typecheck**

Run: `cd frontend && npx vitest run src/views/PayAnalysisView.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/PayAnalysisView.vue frontend/src/nav.ts frontend/src/views/PayAnalysisView.test.ts
git commit -m "feat(2b): PayAnalysisView 删质检 tab+共享维度选择器(部门/阶段/金额档/进度态)+去 tierSummaryBar"
```

---

## Task 10: 清理删除——旧 lib/组件 + 函数剥离 + pivot 收为类型 + nav 收尾

**难度：易踩坑（删前 grep 全仓）→ opus。** 每步删除前先 grep 确认无残余引用（生产 + 测试）。

**Files:**
- Delete: `frontend/src/lib/projectsOverview.ts` + `.test.ts`
- Delete: `frontend/src/lib/planBoards.ts` + `.test.ts`
- Delete: `frontend/src/components/TierIntegrityTab.vue` + `.test.ts`
- Delete: `frontend/src/components/PlanBoard.vue` + `.test.ts`
- Modify: `frontend/src/lib/riskGroups.ts` + `.test.ts`（删 `riskGroups()`/`RiskGroups`，留 `getNodeRemaining`）
- Modify: `frontend/src/lib/dashboardStats.ts` + `.test.ts`（删 `tierSummaryBar`/`TierSummaryBar`）
- Modify: `frontend/src/lib/pivot.ts` + `.test.ts`（删节点级函数，留泛型类型）

- [ ] **Step 1: grep 守门（确认独占件零残余引用）**

Run（应只剩定义处/自身测试/被删文件互引）：
```bash
cd frontend && for s in projectsOverview planBoards TierIntegrityTab PlanBoard 'riskGroups\b' tierSummaryBar; do echo "== $s =="; grep -rn "$s" src --include=*.ts --include=*.vue | grep -v '.test.ts'; done
grep -rn "from '@/lib/pivot'" src --include=*.ts --include=*.vue | grep -v '.test.ts'
```
Expected: `projectsOverview/planBoards/TierIntegrityTab/PlanBoard/riskGroups()/tierSummaryBar` 仅出现在各自定义文件（已无 prod 消费方，因 Task 4-9 已切走）；`pivot` 仅 `projectPivot.ts`(类型)、`BoardMatrix.vue`(类型)、`PivotTable.vue`(类型) 引用，**`BoardView.vue` 已不再引用**。若仍有 prod 引用 → 回对应 Task 修复，不强删。

- [ ] **Step 2: 删 4 个独占文件**

```bash
cd frontend && git rm src/lib/projectsOverview.ts src/lib/projectsOverview.test.ts \
  src/lib/planBoards.ts src/lib/planBoards.test.ts \
  src/components/TierIntegrityTab.vue src/components/TierIntegrityTab.test.ts \
  src/components/PlanBoard.vue src/components/PlanBoard.test.ts
```

- [ ] **Step 3: 剥离 `riskGroups()`（保 `getNodeRemaining`）**

`riskGroups.ts` 删 `riskGroups` 函数与 `RiskGroups` interface（及其内部对 `groupByProject` 的 import 若仅 riskGroups 用则一并删）；保留 `getNodeRemaining`。`riskGroups.test.ts` 删 `riskGroups` 相关 describe，保 `getNodeRemaining` 测试。

- [ ] **Step 4: 剥离 `tierSummaryBar`**

`dashboardStats.ts` 删 `tierSummaryBar` 函数与 `TierSummaryBar` interface；其余（`groupByProject/ProjectAgg/computeTierStats/computeDashboardSummary/DashSummary`）不动。`dashboardStats.test.ts` 删 `tierSummaryBar` 相关 describe。

- [ ] **Step 5: `pivot.ts` 收为泛型类型模块**

`pivot.ts` 删节点级函数与常量（`DIMENSIONS/METRICS/groupByDims/crossMatrix/pivotTable/DIM_BY_KEY/METRIC_BY_KEY` 及内部 `groupByProject` import、`PivotGroup` interface、`DimDef/MetricDef` 若仅这些函数用）；**保留并导出** `CrossMatrix`/`PivotResult`/`PivotRow`/`PivotCol`（被 `projectPivot.ts`/`BoardMatrix.vue`/`PivotTable.vue` 消费）。删 `pivot.test.ts` 中针对已删函数的 describe（若整文件只测函数则 `git rm` 该测试文件）。

- [ ] **Step 6: nav 收尾**

确认 `TIER_TABS`/`TIER_BY_SLUG` 经 Step 1 grep 后若仅 `PayAnalysisView`/已删件用，则清掉 `integrity` 残留与无人引用的 `TIER_BY_SLUG`（`TIERS` 必留）。

- [ ] **Step 7: 全量前端验证**

Run: `cd frontend && npm run typecheck && npx vitest run`
Expected: PASS（无悬空 import；全部 vitest 绿）

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src
git commit -m "chore(2b): 删 /panalysis 独占旧件(projectsOverview/planBoards/TierIntegrity/PlanBoard);剥离 riskGroups()/tierSummaryBar;pivot 收为泛型类型"
```

---

## Task 11: 版本 V1.3.0 + 全量验证 + 真实数据冒烟 + PROGRESS

**难度：机械 + 核实 → 主循环。**

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 版本号**

`frontend/src/version.ts`：`APP_VERSION = 'V1.3.0'`（`RELEASE_DATE` 保 `'2026-06-15'` 或当日）。

- [ ] **Step 2: 全量 verify**

Run: `bash verify.sh`
Expected: 四步全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。

- [ ] **Step 3: 真实数据冒烟（人工核对口径，spec §6）**

Run: `python server.py`（另起，:8080）→ `cd frontend && npm run dev`（:5173）→ 打开 `/panalysis`：
- 项目总览：某项目"完成率"列 == 2A `paymentPmis.paymentRatio`（抽样一致）。
- 回款节点：汇总条"已达成/延期/待达成"计数 == Σ `paymentPmis.reachedCount` / Σ `delayedCount` / 余数。
- 多维看板：某维度"合同总额Σ"与 `/insight` 同维"合同总额"同值（口径校验，注意 /insight 合同来源 `customer.合同总额`、本页来源 `paymentPmis.contract`，**若两源本就不同口径则记录差异而非强对齐**）。
- 五 tab 切换、维度选择器联动、行点击唤起 D2 详情面板、board 三模式 + 下钻均正常；页面右下角无 `window.onerror` 红条。

> 冒烟由用户执行确认；将结果记入 commit/PROGRESS。

- [ ] **Step 4: 更新 `PROGRESS.md`**

- 头部"当前版本"→ **V1.3.0**、"最近更新"补 2B 一句。
- 第 43 行 2B 项：`→③2B 回款看板重建` 标完成（`[x]` 子项或追加"2B 已合并 master(SHA)"），写一句结论（整页 PMIS 化、5 tab 换骨、删独占旧件、数据质检降级待后续）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(2b): 版本 V1.3.0 + PROGRESS(2B 回款看板重建/panalysis 整页 PMIS 化)"
```

---

## 合并（finishing-a-development-branch）

全部任务完成且 `bash verify.sh` 全绿后，用 **superpowers:finishing-a-development-branch** 的**选项 1（合回 master）**：`git checkout master && git merge --no-ff feat/phase-2b-payment-dashboard`，并补 PROGRESS 合并 SHA。

---

## Self-Review（写完计划后自查）

**1. Spec 覆盖**：
- §1 四边界决策：范围整页 PMIS 化(Task 4-9)✓ / 保留多 tab(Task 9)✓ / 多维可选共享选择器(Task 9 + PAY_FACET_DIMS)✓ / 数据质检撤销降级(Task 9 删 tab + governance 留后续，已在"不做"说明)✓。
- §2 维度与指标：deriveTier/Progress/Dept/Stage + 7 指标 Σ÷Σ 加权(Task 1/3)✓。
- §3 五 tab：项目总览(T4)/回款节点(T5)/回款进度(T6)/风险项目(T7)/多维看板(T8)✓。
- §5 数据源切换 filterProjects 不复用 filterNodes(Task 1)✓；年份不过滤项目(已在"不做")✓。
- §6 测试：vitest 纯函数(T1-3) + 组件薄渲染(T4-9) + 真实数据冒烟(T11)✓。
- §7 版本 V1.3.0 + 不做边界✓。§8 删前 grep + 令牌(T10 + 各组件 CSS 用令牌)✓。

**2. 占位扫描**：无 TBD/TODO；CF store API 名(T6)、SegToggle 用法(T9)、BoardView 旧测试样板(T8)标注"以实际文件为准"——均为对**现有可读文件**的校准指引，非占位。

**3. 类型一致**：`PayProjectRow`/`PayNodeRow`/`PayBoardRow` 字段在跨 Task 引用一致；进度态值 `已全额回款/部分回款/未回款/未知` 在 `deriveProgress`(T1)与 `progressBuckets`(T2)一致；节点状态 `已达成/延期/待达成` 在 `paymentNodeRows`/`nodeSummary`/`pmisRiskGroups`/`TierNodesTab` 一致；`BoardDrilldownModal` 列键(`projectId/projectName/tier/orgL4/projectManager/projectAmount/paymentStatus/paymentRatio`)与 `PayBoardRow`/`PayProjectRow` 字段对齐✓。
