# 3B 回款总览 /payment 换源（节点级收款阶段口径）设计

> 2026-06-17 立项。隶属「全局下线 rawNodes 旧口径程序」第②步（3A 详情页已合并 master）。
> 本期把回款总览页 `/payment`（DashboardView）从 rawNodes 旧口径换到 3A 的收款阶段口径，
> **纯前端、忠实换源**（4 组件视觉/指标不变，只换数据源与口径）。

## 背景与现状（已测绘证实）

- `/payment`（`DashboardView.vue`）装配 4 个子组件：DashMetrics / TierStrip / OrgRanking / TrendCard。
- 4 组件全部读 `filter.filteredNodes`（= `filterNodes(rawNodes, …)`，视角→纳管→年份过滤）→
  `lib/dashboardStats`（computeDashboardSummary / computeTierStats / groupByProject）+
  `lib/dashboardCharts`（rankByOrg / aggregateMonthly / aggregateQuarterly）。
- **后端 `dashboard` 对象前端未消费**（grep `data.dashboard` 无命中）→ 本期不动，留 3E 移除。
- `filter.filteredNodes`（rawNodes）还被 `/calendar`(3D) 用；`lib/dashboardStats.groupByProject` 还被 `/ledger`(3C) 用 → **本期都不动，留各自子项**。
- 2B 已建 `lib/paymentPmis.ts`（收款阶段/PMIS 口径构件），`/panalysis` 已用；其 `paymentNodeRows`/`PayNodeRow` 可复用但缺金额/经理字段（见下）。

## 目标

- `/payment` 4 组件改由收款阶段口径驱动（3A 的 `paymentNodes` + `projects[]`），状态用 3A 的 5 态。
- **忠实换源**：4 组件的视觉、指标卡、交互（含年份/视角/排除筛选）保持不变。
- 不碰后端、不碰 rawNodes 共享路径（`filteredNodes` / 旧 lib 函数留给 3C/3D）。

## 范围

**做**：扩展 `paymentPmis.ts`（节点行增 3 字段）；新增 `lib/payDashboard.ts`（收款阶段口径过滤+聚合）；
`stores/filter.ts` 加 2 个 computed；4 组件改调用源；配套测试；版本 V1.6.4。

**不做**：
- 不动后端（`compute_dashboard` / `dashboard` 对象 / preprocess）—— 3A 数据已够，3E 再删后端 rawNodes。
- 不动 `filter.filteredNodes`、`lib/filterNodes.ts`、`lib/dashboardStats.ts`、`lib/dashboardCharts.ts`（留给 /calendar 3D、/ledger 3C）。
- 不动 `filter.l4Options/pmOptions`（仍扫 rawNodes，3E 清理）。
- 不新增/删减指标卡，不重设计视觉（忠实换源）。

## 口径（用户 2026-06-17 钦定）

- **节点级收款阶段口径**：金额取收款阶段节点 `receivedAmount`(已收) / `expectedPayment`(计划) / `unpaidAmount`(未收)；
  完成率 = Σ已收 ÷ Σ计划。
- **状态 5 态**：节点 `status`（已回款 / 部分回款 / 质保期 / 延期 / 待回款），替换旧 6 态计数与配色。
- **筛选全保留**：年份/季度（按节点 `planDate` 月份）、视角（l4=部门 / pm=项目经理）、排除（excludedIds）对看板生效。
- **项目数**：按视角/排除过滤项目（`filterProjects`，不随年份，与现 DashMetrics 行为一致）；
  数据源**有意改用 `projects[]`（主域，收款阶段 join 的同一项目集）**，而非现 DashMetrics 的 `projectOverview.projects`——
  统一到收款阶段口径的项目域。两者计数若有微差属预期（口径切换），不视为回归。

## 数据流

```
paymentNodes + projects ──paymentNodeRows(扩展)──▸ PayNodeRow[](全量)
                            │ filterPayNodes(视角/排除/年份, 镜像 filterNodes)
                            ▾
                    filter.filteredPayNodes
        ┌──────────────┬──────────────┬──────────────┐
   payDashSummary   payTierStats   payOrgRanking   payMonthly/Quarterly
        ▾              ▾              ▾              ▾
    DashMetrics     TierStrip     OrgRanking     TrendCard
```

## 文件结构与职责

| 文件 | 改动 |
|---|---|
| `frontend/src/lib/paymentPmis.ts` | `PayNodeRow` + `paymentNodeRows` 追加 `receivedAmount/unpaidAmount/projectManager` |
| `frontend/src/lib/payDashboard.ts` | 新增：`filterPayNodes` + `payDashSummary` + `payTierStats` + `payOrgRanking` + `payMonthlyTrend` + `payQuarterlyTrend` |
| `frontend/src/stores/filter.ts` | 加 `payNodeRowsAll` + `filteredPayNodes` 两 computed（不动 filteredNodes） |
| `frontend/src/components/DashMetrics.vue` | 改读 `filteredPayNodes` + `payDashSummary`，6 卡不变 |
| `frontend/src/components/TierStrip.vue` | 改读 `filteredPayNodes` + `payTierStats`，下钻列收款阶段节点 |
| `frontend/src/components/OrgRanking.vue` | 改读 `filteredPayNodes` + `payOrgRanking` |
| `frontend/src/components/TrendCard.vue` | 改读 `filteredPayNodes` + `payMonthly/QuarterlyTrend` |
| 对应 `.test.ts` | 见"测试" |

## 接口设计

### 扩展 `PayNodeRow` + `paymentNodeRows`（paymentPmis.ts）

`PayNodeRow` 追加（现有字段保留）：

```ts
  receivedAmount: number
  unpaidAmount: number
  projectManager: string
```

`paymentNodeRows` 在 push 的对象里补：

```ts
        receivedAmount: n.receivedAmount ?? 0,
        unpaidAmount: n.unpaidAmount ?? 0,
        projectManager: (p.projectManager ?? '').trim() || '未指定',
```

（`PaymentNodePmis` 自 3A 起已有 `receivedAmount`/`unpaidAmount`；`projectManager` 取自 project。追加字段，
现有 `/panalysis` 消费方忽略新字段，向后兼容。）

### `lib/payDashboard.ts`（新模块）

收款阶段口径的过滤与聚合，**不复用** rawNodes 的 `filterNodes`/`dashboardStats`/`dashboardCharts`（那些留给 3C/3D）。

```ts
import type { Project } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
import { filterProjects, type FilterOpts as ProjFilterOpts } from './paymentPmis'

export interface PayNodeFilterOpts {
  filterYear: string
  viewMode: 'global' | 'l4' | 'pm'
  viewL4: string
  viewPM: string
  excludeActive: boolean
  excludedIds: Record<string, boolean>
}

const Q_RANGE: Record<string, [string, string]> = {
  Q1: ['01', '03'], Q2: ['04', '06'], Q3: ['07', '09'], Q4: ['10', '12'],
}

/** 镜像 lib/filterNodes：视角(dept/projectManager) → 排除 → 年份/季度(按 planDate 月份)。
 *  无 planDate 的节点在年/季筛选中被排除。 */
export function filterPayNodes(rows: PayNodeRow[], opts: PayNodeFilterOpts): PayNodeRow[] {
  let ns = rows
  if (opts.viewMode === 'l4' && opts.viewL4) ns = ns.filter((r) => r.dept === opts.viewL4)
  if (opts.viewMode === 'pm' && opts.viewPM) ns = ns.filter((r) => r.projectManager === opts.viewPM)
  if (opts.excludeActive && opts.excludedIds) ns = ns.filter((r) => !opts.excludedIds[r.projectId])
  const fy = opts.filterYear
  if (fy === 'all') return ns
  const month = (r: PayNodeRow) => (r.planDate || '').slice(0, 7)
  if (fy.includes('-Q')) {
    const keyPart = fy.startsWith('upto') ? fy.slice(4) : fy
    const [qYear, qn] = keyPart.split('-Q')
    const range = Q_RANGE['Q' + qn]
    if (!range) return ns
    const mStart = `${qYear}-${range[0]}`, mEnd = `${qYear}-${range[1]}`
    return ns.filter((r) => { const m = month(r); return !!m && m >= mStart && m <= mEnd })
  }
  if (fy.startsWith('upto')) {
    const end = `${fy.slice(4)}-12`
    return ns.filter((r) => { const m = month(r); return !!m && m <= end })
  }
  const start = `${fy}-01`, end = `${fy}-12`
  return ns.filter((r) => { const m = month(r); return !!m && m >= start && m <= end })
}

export interface PayDashSummary {
  totalProjects: number
  relatedNodeCount: number
  totalActual: number       // Σ已收(元)
  totalExpected: number     // Σ计划(元)
  totalRemaining: number    // Σ未收(元)
  rate: number              // Σ已收÷Σ计划 (0-1)
  delayedProjects: number   // 延期节点去重项目数
}

/** 看板指标。项目数按视角/排除过滤项目(不随年份,沿用现 DashMetrics 行为)。 */
export function payDashSummary(
  rows: PayNodeRow[], projects: Project[], opts: ProjFilterOpts,
): PayDashSummary {
  const totalActual = rows.reduce((s, r) => s + r.receivedAmount, 0)
  const totalExpected = rows.reduce((s, r) => s + r.expectedPayment, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.unpaidAmount, 0)
  const delayedPids = new Set(rows.filter((r) => r.status === '延期').map((r) => r.projectId))
  return {
    totalProjects: filterProjects(projects, opts).length,
    relatedNodeCount: rows.length,
    totalActual, totalExpected, totalRemaining,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0,
    delayedProjects: delayedPids.size,
  }
}

export interface PayTierStat {
  tier: string
  projectCount: number
  nodeCount: number
  expected: number
  actual: number
  remaining: number
  rate: number
  delayed: number          // 延期节点数
  paid: number             // 已回款节点数
}

/** 单档聚合(忠实替代 computeTierStats)。tier 为 deriveTier 的档名。 */
export function payTierStats(tier: string, rows: PayNodeRow[]): PayTierStat {
  const grp = rows.filter((r) => r.tier === tier)
  const expected = grp.reduce((s, r) => s + r.expectedPayment, 0)
  const actual = grp.reduce((s, r) => s + r.receivedAmount, 0)
  return {
    tier,
    projectCount: new Set(grp.map((r) => r.projectId)).size,
    nodeCount: grp.length,
    expected, actual,
    remaining: grp.reduce((s, r) => s + r.unpaidAmount, 0),
    rate: expected > 0 ? actual / expected : 0,
    delayed: grp.filter((r) => r.status === '延期').length,
    paid: grp.filter((r) => r.status === '已回款').length,
  }
}

export interface PayOrgRank {
  org: string
  expected: number
  actual: number
  rate: number
  nodeCount: number
}

/** 服务组(dept)达成排名。sortBy: 'actual' | 'rate'。返回降序全量(组件自行 slice Top8)。 */
export function payOrgRanking(rows: PayNodeRow[], sortBy: 'actual' | 'rate'): PayOrgRank[] {
  const map: Record<string, PayNodeRow[]> = {}
  for (const r of rows) (map[r.dept] ||= []).push(r)
  const out = Object.entries(map).map(([org, grp]) => {
    const expected = grp.reduce((s, r) => s + r.expectedPayment, 0)
    const actual = grp.reduce((s, r) => s + r.receivedAmount, 0)
    return { org, expected, actual, rate: expected > 0 ? actual / expected : 0, nodeCount: grp.length }
  })
  out.sort((a, b) => (sortBy === 'rate' ? b.rate - a.rate : b.actual - a.actual))
  return out
}

export interface TrendBucket { key: string; tiers: Record<string, number>; total: number }

/** 月度待回款趋势：按 planDate 月份分桶，待回款=Σunpaid(status≠已回款)，按 tier 分层。
 *  filterYear 仅决定展示哪些月(此处对已 filteredPayNodes 再无需过滤,直接全量桶;组件按年裁剪)。 */
export function payMonthlyTrend(rows: PayNodeRow[]): TrendBucket[] {
  return bucketTrend(rows, (r) => (r.planDate || '').slice(0, 7))
}

/** 季度待回款趋势：key 形如 '2026-Q1'。 */
export function payQuarterlyTrend(rows: PayNodeRow[]): TrendBucket[] {
  return bucketTrend(rows, (r) => {
    const m = (r.planDate || '').slice(0, 7)
    if (!m) return ''
    const [y, mm] = m.split('-')
    const q = Math.floor((Number(mm) - 1) / 3) + 1
    return `${y}-Q${q}`
  })
}

function bucketTrend(rows: PayNodeRow[], keyOf: (r: PayNodeRow) => string): TrendBucket[] {
  const map: Record<string, TrendBucket> = {}
  for (const r of rows) {
    if (r.status === '已回款') continue
    const key = keyOf(r)
    if (!key) continue
    const b = (map[key] ||= { key, tiers: {}, total: 0 })
    const amt = r.unpaidAmount
    b.tiers[r.tier] = (b.tiers[r.tier] ?? 0) + amt
    b.total += amt
  }
  return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
}
```

> **趋势与年份（明确口径，消歧义）**：`payMonthlyTrend`/`payQuarterlyTrend` 签名**只收 rows、不收 filterYear**——
> 入参就是已按年份过滤过的 `filteredPayNodes`，函数只对其分桶。展示范围 = 过滤后节点实际落到的月/季
> （年份='全部'时即全量月份，与"看板随年份收窄"一致）。月/季切换是 TrendCard 组件本地 ref，不入函数。
> 实现时**移除**对旧 `aggregateMonthly/Quarterly` 的 filterYear 传参形态，避免双重过滤。

### `stores/filter.ts` 增 2 computed

```ts
import { paymentNodeRows } from '@/lib/paymentPmis'
import { filterPayNodes } from '@/lib/payDashboard'

const payNodeRowsAll = computed(() =>
  paymentNodeRows(data.data?.paymentNodes, data.data?.projects ?? [], data.data?.projectPmis),
)
const filteredPayNodes = computed(() =>
  filterPayNodes(payNodeRowsAll.value, {
    filterYear: filterYear.value, viewMode: viewMode.value, viewL4: viewL4.value, viewPM: viewPM.value,
    excludeActive: excludeOn.value, excludedIds: excludedIds.value,
  }),
)
```

（`filteredNodes` 保留不动；新增二者一并 return 出去。）

### 4 组件改调用（视觉不变）

- **DashMetrics**：`summary = payDashSummary(filter.filteredPayNodes, data.data?.projects ?? [], { viewMode, viewL4, viewPM, excludeActive: excludeOn, excludedIds })`；6 张卡的取值键映射到 `PayDashSummary`（totalProjects / relatedNodeCount / totalActual / totalRemaining / rate / delayedProjects），金额 `fmtWan`、完成率 `pct`，色阶阈值不变。
- **TierStrip**：每档 `payTierStats(档名, filter.filteredPayNodes)`，进度条/项目数/延期计数取新结构；下钻弹窗改列该档的收款阶段节点（`filteredPayNodes.filter(r => r.tier===档名)`），列名沿用阶段/计划日/状态/金额。
- **OrgRanking**：`payOrgRanking(filter.filteredPayNodes, sortBy)`，取 `.slice(0, 8)`；列/排序切换不变。
- **TrendCard**：`payMonthlyTrend` / `payQuarterlyTrend(filter.filteredPayNodes)`，堆叠柱按 tier 分层，月/季切换不变。

## 测试

- `frontend/src/lib/payDashboard.test.ts`（新）：
  - `filterPayNodes`：视角(l4/pm)、排除、年份/季度（按 planDate 月份；无 planDate 被排除）各分支。
  - `payDashSummary`：金额 Σ已收/计划/未收、完成率、延期项目去重计数、项目数走 filterProjects。
  - `payTierStats`：单档聚合、5 态计数。
  - `payOrgRanking`：按 actual/rate 两种排序。
  - `payMonthlyTrend`/`payQuarterlyTrend`：按月/季分桶、已回款节点不计入待回款、tier 分层。
- `frontend/src/lib/paymentPmis.test.ts`（扩展）：`paymentNodeRows` 输出含 `receivedAmount/unpaidAmount/projectManager`，取自节点/项目。
- `frontend/src/stores/filter.test.ts`（扩展）：`filteredPayNodes` 随 filterYear/viewMode/excludedIds 变化。
- 4 组件 `.test.ts`：把夹具从 rawNodes 改为 `paymentNodes`+`projects`，断言指标/进度/排名/趋势按收款阶段口径渲染、状态 5 态。

## 版本与进度

- 单一来源 `frontend/src/version.ts` → **V1.6.4**（Z 级：既有页换数据源、视觉不变），RELEASE_DATE `2026-06-17`。
- `PROGRESS.md`：「全局下线 rawNodes 程序」②3B 记一条。

## 验证（声称完成前必跑）

```bash
bash verify.sh   # python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿
```

附加：`npm run dev` 或 build 后手验 `/payment` 看板能加载、6 卡/分层/排名/趋势有数、年份/视角/排除筛选生效、无 JS 报错。

## 取舍记录

- **纯前端换源**：3A 已产出 `paymentNodes`/`paymentPmis`，后端无需再动；后端 `dashboard` 对象前端未消费，留 3E 删，避免本期扩面。
- **新建 `payDashboard.ts` 而非改旧 `dashboardStats/dashboardCharts`**：旧函数仍服务 /ledger(3C)、/calendar(3D)，改签名会破坏它们；新旧并存到 3E 统一清。
- **不动 `filteredNodes`**：/calendar 仍用；给 /payment 单搭 `filteredPayNodes`，互不干扰。
- **节点级金额口径**（用户钦定）：保留年份筛选对看板生效；与详情页头部「流水÷合同」口径并存（平台本就双口径，节点明细 vs 项目流水）。
- **忠实换源**：4 组件视觉/指标卡不变，只换源与状态词表，降低回归面。
