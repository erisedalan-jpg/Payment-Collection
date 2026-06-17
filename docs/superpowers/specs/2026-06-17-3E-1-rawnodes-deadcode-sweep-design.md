# 3E-1 rawNodes 死代码清扫设计（纯前端、零行为变更）

> 2026-06-17 立项。隶属「全局下线 rawNodes 旧口径程序」第⑤步（3E）。
> 3A 详情页回款 tab、3B /payment 概览、3C /ledger 台账、3D /calendar 日历已合并 master。
> **审计发现 3E 远大于"删后端 rawNodes"**：除可直接删的死代码外，仍有 6+ 处**活 rawNodes 消费方**（概览回款带 paymentBand / 详情页骨架 buildProjectPage+原项目 closedNodes / 详情抽屉 buildProjectDetail / 全局筛选 l4Options·pmOptions / 治理 governance / 后端 node_action·snapshots·schema）未换源。
> 故用户钦定 3E **分阶段程序**：**3E-1 死代码清扫（本 spec）→ 3E-2 前端活消费换源 → 3E-3 后端移除 rawNodes + RawNode 类型**。各自 spec→plan→实现，每步可验证。
> 本 spec 只覆盖 **3E-1**：删除"零活运行期消费方"的前端死代码，**不改任何后端、不动任何仍有活消费方的符号**。

## 背景与现状（两轮审计证实）

3A-3D 是**按 tab/区块**换源，留下两类 rawNodes 关联代码：

- **(A) 真死代码**：无任何活运行期消费方（仅被自身单测引用，或仅被"另一处死代码"引用）。这是 3E-1 的清扫对象。
- **(B) 活消费方**：仍在服务真实页面/后端，删 rawNodes 前必须先换源。**3E-1 全部保留**，留给 3E-2（前端）/3E-3（后端）。

## 目标

- 删除前端 (A) 类死代码 + 其单测，使代码库不再保留 rawNodes 旧口径的死分支。
- **零行为变更**：所有删除项运行期无消费方；唯一"非纯删除"动作是一处类型搬迁（type-only）。
- 不触碰任何 (B) 活消费方、不触碰后端。

## 口径

无新口径。3E-1 不引入/改变任何计算口径，纯删除 + 一处类型 import 重定向。

## 范围

### 做（删除，连带各自单测）

| 删除符号 | 位置 | 删因（零活消费）|
|---|---|---|
| `filteredNodes` computed | `stores/filter.ts` | 无任何 Vue 组件消费（3B-3D 各页已脱离）|
| `filterNodes` 函数 | `lib/filterNodes.ts`（**文件保留**）| 唯一调用者是 `filteredNodes`，删后无调用者 |
| `excludeFilter` | `lib/ledger.ts` | 3D 后 CalendarView 已内联 excludedIds，无消费方 |
| `filterLedgerProjects` / `ledgerSummary` / `ledgerTierStats` / `ledgerStatusCounts` | `lib/ledger.ts`（旧 ProjectAgg 版）| 3C 后 LedgerView 已用 `*Pmis`/`filterLedgerRows`/`ledgerRows` |
| `computeTierStats` / `computeDashboardSummary` / `DashSummary` 接口 | `lib/dashboardStats.ts`（**文件保留**）| 仅测试引用 |
| **整文件** `lib/dashboardCharts.ts`（`aggregateQuarterly`/`aggregateMonthly`/`rankByOrg`/`delayedTopProjects` 全死）| — | 仅测试引用其函数；唯一活引用见下"类型搬迁" |
| `pivot.ts` 函数层（`groupByDims`/`crossMatrix`/`pivotTable`/`DIMENSIONS`/`METRICS`/`DIM_BY_KEY`/`METRIC_BY_KEY`）| `lib/pivot.ts`（**文件保留**）| BoardView/InsightView 用 `paymentBoard`/`projectPivot` 同名函数，不调用 pivot.ts 函数 |

连带删除/改写的测试：`filter.test.ts`（filteredNodes 块）、`filterNodes.test.ts`、`ledger.test.ts`（旧 5 函数块，保留 `*Pmis`/`ledgerRows`/`filterLedgerRows` 块）、`dashboardStats.test.ts`（两死函数块，保留 groupByProject 测试若有）、`dashboardCharts.test.ts`（整删）、`pivot.test.ts`（整删）。

### 类型搬迁（删 dashboardCharts.ts 的前置，approach A）

`PendingBarChart.vue` 当前 `import type { PeriodSeries }` 自 `dashboardCharts.ts`，但其数据实由 3B 的 `payDashboard.ts` 提供（3B 曾记"PeriodSeries/OrgRank 接口重复留 3E 统一清"）。3E-1：
- 确保 `PeriodSeries`（及若 PendingBarChart 还引 `OrgRank` 等）在 `payDashboard.ts` 有等价定义（已重复定义则直接复用；若仅 dashboardCharts.ts 定义则并入 payDashboard.ts）。
- `PendingBarChart.vue` 改 import 自 `payDashboard.ts`。
- 确认无其它活文件 import 自 dashboardCharts.ts 后，整删该文件——同时消除 3B 遗留的重复类型定义。

### 不做（全部保留，留 3E-2/3E-3）

- **保留符号**：`groupByProject`、`ProjectAgg`（被 `pivot.ts`/`projectDetail.ts` 活用）；`ViewMode`（被 `stores/filter.ts` 的活 viewMode 视角状态用）；`pivot.ts` 类型层（`CrossMatrix`/`PivotResult`/`PivotRow`/`PivotCol`，被 BoardMatrix/PivotTable/projectPivot/paymentBoard 活用）；`filterNodes.ts`/`dashboardStats.ts`/`pivot.ts` 三文件本体（各含上述活符号）。
- **保留 (B) 活消费方**（3E-2 换源）：`paymentBand`(overview.ts→OverviewView)、`buildProjectPage`/closedNodes(projectPage.ts→ProjectDetailView)、`buildProjectDetail`(projectDetail.ts→ProjectDetailDrawer)、`l4Options`/`pmOptions`(filter.ts→FilterBar)、`governance.ts` yundocsOk。
- **不动后端**（3E-3）：`rawNodes` JSON 键、`schema.AnalysisData.rawNodes`、`server.py node_action_date_from_data`、`snapshots.build_snapshot`、`RawNode` 类型（前端类型本体，待活消费链路清完才能删）。
- **不动** `closedNodes` 可行性问题（其数据是否存在于收款阶段源）——留 3E-2/3E-3 对应阶段"先调研再定"。

## 文件结构与职责

| 文件 | 改动 |
|---|---|
| `frontend/src/stores/filter.ts` | 删 `filteredNodes` computed（保留 viewMode/ViewMode/l4Options/pmOptions/excludeOn/excludedIds 等）|
| `frontend/src/lib/filterNodes.ts` | 删 `filterNodes` 函数（保留 `ViewMode` 导出）|
| `frontend/src/lib/ledger.ts` | 删 `excludeFilter`/`filterLedgerProjects`/`ledgerSummary`/`ledgerTierStats`/`ledgerStatusCounts`（保留 `ledgerRows`/`filterLedgerRows`/`*Pmis`）|
| `frontend/src/lib/dashboardStats.ts` | 删 `computeTierStats`/`computeDashboardSummary`/`DashSummary`（保留 `groupByProject`/`ProjectAgg`）|
| `frontend/src/lib/dashboardCharts.ts` | **整文件删除**（类型搬迁后）|
| `frontend/src/lib/payDashboard.ts` | 收纳 `PeriodSeries`（及必要的 `OrgRank`）类型定义（消除重复）|
| `frontend/src/components/PendingBarChart.vue` | `PeriodSeries` import 改自 `payDashboard.ts` |
| `frontend/src/lib/pivot.ts` | 删函数层（保留类型层 + 类型所需的最小 import）|
| 对应 `.test.ts` | 见"范围"内测试清单 |

## 接口与改法

- 删除均为"移除导出 + 移除其单测/单测块"。删一个符号后，先 `grep` 全仓确认零活 import，再删，避免误伤。
- `pivot.ts`：删函数后若 `RawNode`/`groupByProject` 等 import 变为未用，一并清掉未用 import（保留类型层及其依赖）。
- `dashboardStats.ts`：删两死函数与 `DashSummary` 后，保留 `groupByProject`/`ProjectAgg` 及其依赖 import（`RawNode` 等仍被 groupByProject 用）。
- 类型搬迁（approach A）：以 `payDashboard.ts` 为 `PeriodSeries`（/`OrgRank`）唯一定义点；删 dashboardCharts.ts 前确认全仓对其零引用。

## 测试

- **TDD 不完全适用**（删除型）：策略为"删符号 + 删/改其测试 + 跑全量回归证明无破坏"。
- 每删一组：`grep` 证零活 import → 删实现 → 删/改对应测试 → `npx vitest run`（相关文件）绿。
- 类型搬迁后 `PendingBarChart` 相关测试（若有）仍绿。
- 终局 `npm run typecheck` + `npm run test:run` + `npm run build` 全绿 = 零行为变更佐证（活页面测试不变即未回归）。
- 后端 `pytest` 不应受影响（未动后端），verify.sh 一并跑作护栏。

## 验证（声称完成前必跑）

```bash
bash verify.sh   # python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿
```

附加：构建后手验关键页无 JS 报错（概览/详情/台账/日历/看板/洞察）——确认删除未误伤活页面。

## 版本与进度

- `frontend/src/version.ts` → **V1.6.7**（Z 级：纯删死代码 + 一处类型搬迁，零行为变更）。
- `PROGRESS.md`：「全局下线 rawNodes 程序」⑤ 下记 3E-1 一条；标注 3E-2/3E-3 待开及各自范围。

## 取舍记录

- **分阶段（用户钦定）**：3E 实含和 3A-3D 同量级的"活消费换源"（3E-2）+ 后端移除（3E-3），不能当一次性删代码。3E-1 先做安全的死代码清扫——零风险、零行为变更、立即缩小代码面，为后续换源减少干扰。
- **approach A（PeriodSeries 并入 payDashboard.ts）**：顺手消除 3B 显式遗留的重复类型定义，使 dashboardCharts.ts 可整删；优于留近空文件（C）或新增中立文件（B）。
- **删除型不强行套 TDD 红绿**：以"全量回归全绿 + 活页面测试不变"作为零行为变更的证据，比为删除补构造性失败测试更诚实。
- **closedNodes 可行性悬置**：是否能完全脱离 rawNodes 取决于收款阶段源是否含已关闭原项目节点，属 3E-2/3E-3 调研项，不在 3E-1。
