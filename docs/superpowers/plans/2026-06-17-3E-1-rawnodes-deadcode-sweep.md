# 3E-1 rawNodes 死代码清扫 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除前端 rawNodes 旧口径中"零活运行期消费方"的死代码及其单测，零行为变更。

**Architecture:** 删除型任务——逐组"grep 证零活 import → 删符号 + 清未用 import → 删/裁其单测 → vitest+typecheck 绿"。唯一非纯删除是一处类型 import 重定向（`PendingBarChart` 的 `PeriodSeries` 从 dashboardCharts.ts 改指 payDashboard.ts），使 dashboardCharts.ts 可整删。后端零触碰。

**Tech Stack:** Vue3 + TS + Pinia + Vitest（前端，`frontend/`）。

参考 spec：`docs/superpowers/specs/2026-06-17-3E-1-rawnodes-deadcode-sweep-design.md`

## Global Constraints
- **零行为变更**：所有删除项运行期无消费方；类型重定向为 type-only。删一个符号前先 `grep` 全仓确认零活 import，再删。
- 简体中文沟通/注释；不用 emoji（用 → ↓ ❌ ✕ ▾）。
- 提交信息两个 -m，结尾固定：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- **严禁 `git add -A`／`git add .`**：仓库根「看板数据取值条件与计算公式.md」未跟踪必须排除，只用显式路径。
- 前端命令在 `frontend/` 下；**不动后端**（rawNodes JSON 键/schema/server.py/snapshots 全留 3E-3）。
- 版本单一来源 `frontend/src/version.ts` → V1.6.7。

**关键背景事实（两轮审计 + grep 证实）：**
- **删（零活消费）**：`filteredNodes`(filter.ts computed)、`filterNodes`(filterNodes.ts 函数)、`excludeFilter`/`filterLedgerProjects`/`ledgerSummary`/`ledgerTierStats`/`ledgerStatusCounts`(ledger.ts 旧 ProjectAgg 版)、`computeTierStats`/`computeDashboardSummary`/`DashSummary`(dashboardStats.ts)、**整文件 dashboardCharts.ts**、`pivot.ts` 函数层(`groupByDims`/`crossMatrix`/`pivotTable`/`DIMENSIONS`/`METRICS`/`DIM_BY_KEY`/`METRIC_BY_KEY`)。
- **留（被活消费方挡住）**：`groupByProject`/`ProjectAgg`(dashboardStats.ts，被 pivot.ts/projectDetail.ts 活用)、`ViewMode`(filterNodes.ts，被 filter store viewMode 视角状态活用)、`pivot.ts` 类型层(`CrossMatrix`/`PivotResult`/`PivotRow`/`PivotCol`，被 BoardMatrix/PivotTable/projectPivot/paymentBoard 活用)、`ledger.ts` 收款阶段函数(`ledgerRows`/`filterLedgerRows`/`ledgerSummaryPmis`/`ledgerTierStatsPmis`/`ledgerStatusCountsPmis`)、`filterNodes.ts`/`dashboardStats.ts`/`pivot.ts` 三文件本体。
- `PeriodSeries`/`OrgRank` 在 `payDashboard.ts`(120/95 行) 与 `dashboardCharts.ts`(20/77 行) **各有独立定义**（3B 遗留重复）。唯一从 dashboardCharts.ts import 类型的活文件是 `PendingBarChart.vue:4`(`import type { PeriodSeries }`，第 8 行用 `PeriodSeries['series']`)；其数据实由 payDashboard.ts 的 `payMonthlyTrend`/`payQuarterlyTrend` 提供。
- `ledger.test.ts`：前半(约 1-76 行)是旧 5 函数的 `import`+5 个 describe 块（删）；后半(约 78 行起 `ledgerRows`/`filterLedgerRows`/`ledgerSummaryPmis...`)是收款阶段测试（**保留**）。

---

### Task 1: 删 filteredNodes + filterNodes 函数

**Files:**
- Modify: `frontend/src/stores/filter.ts`（删 `filteredNodes` computed + 其对 `filterNodes` 的 import）
- Modify: `frontend/src/lib/filterNodes.ts`（删 `filterNodes` 函数，**保留 `ViewMode` 导出**）
- Modify: `frontend/src/stores/filter.test.ts`（删 `filteredNodes` 测试块）
- Delete: `frontend/src/lib/filterNodes.test.ts`（测的是 `filterNodes` 函数；若该文件还测 ViewMode 之外别的活符号则改为只删 filterNodes 块——先读确认）

**Interfaces:**
- 留：`ViewMode`（filterNodes.ts 导出，filter store `viewMode` 状态用）；filter store 其余（viewMode/excludeOn/excludedIds/l4Options/pmOptions/filteredPayNodes）不动。

- [ ] **Step 1: grep 证零活消费**

Run: `cd frontend && grep -rnE "filteredNodes|filterNodes\b" src --include=*.vue --include=*.ts | grep -v "filteredPayNodes"`
预期：`filteredNodes` 仅出现在 `stores/filter.ts`(定义)与 `stores/filter.test.ts`；`filterNodes`(函数)仅出现在 `lib/filterNodes.ts`(定义)、`stores/filter.ts`(import+filteredNodes 内调用)、`lib/filterNodes.test.ts`。无任何 .vue 消费 → 确认死。

- [ ] **Step 2: 读 filterNodes.ts 与 filter.test.ts 确认结构**

Run: `cd frontend && cat src/lib/filterNodes.ts && echo "=== TEST ===" && sed -n '1,60p' src/stores/filter.test.ts`
确认 `ViewMode` 在 filterNodes.ts 的定义位置、`filterNodes` 函数范围、filter.test.ts 中 filteredNodes 的 describe 块边界。

- [ ] **Step 3: 删除**
- `filterNodes.ts`：删 `filterNodes` 函数及其专用 import（如 `RawNode`，若删后未用）；保留并仍 `export` `ViewMode`。
- `filter.ts`：删 `filteredNodes` computed；其 import 行从 `import { filterNodes, ViewMode }`（或类似）改为只留 `ViewMode`（`import type { ViewMode } from '@/lib/filterNodes'`，按原写法保形）。
- `filter.test.ts`：删 `filteredNodes` 的 describe/it 块（其余 l4Options/pmOptions/viewMode/exclude 测试保留）。
- `filterNodes.test.ts`：若整文件只测 `filterNodes` 函数 → 删整文件；若另含活符号测试 → 只删 filterNodes 块。

- [ ] **Step 4: 跑测试 + 类型**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts && npm run typecheck`
预期：filter.test 绿；typecheck 无报错（ViewMode 仍可解析）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/filter.ts frontend/src/lib/filterNodes.ts frontend/src/stores/filter.test.ts
git rm frontend/src/lib/filterNodes.test.ts   # 若整删；否则改为 git add 该文件
git commit -m "chore(3e-1): 删死代码 filteredNodes + filterNodes 函数(保留 ViewMode)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 删 ledger.ts 旧 ProjectAgg 函数

**Files:**
- Modify: `frontend/src/lib/ledger.ts`（删 `excludeFilter`/`filterLedgerProjects`/`ledgerSummary`/`ledgerTierStats`/`ledgerStatusCounts`，保留 `ledgerRows`/`filterLedgerRows`/`ledgerSummaryPmis`/`ledgerTierStatsPmis`/`ledgerStatusCountsPmis`）
- Modify: `frontend/src/lib/ledger.test.ts`（删前半旧 5 函数的 import + 5 个 describe 块，保留收款阶段块）

**Interfaces:**
- 留：收款阶段 ledger 函数（LedgerView 活用，3C）。

- [ ] **Step 1: grep 证零活消费**

Run: `cd frontend && grep -rnE "excludeFilter|filterLedgerProjects|ledgerSummary\b|ledgerTierStats\b|ledgerStatusCounts\b" src --include=*.vue --include=*.ts`
预期：仅出现在 `lib/ledger.ts`(定义)与 `lib/ledger.test.ts`。注意用 `\b` 区分 `ledgerSummary` vs `ledgerSummaryPmis`（后者保留）。无 .vue/.ts 活消费 → 死。

- [ ] **Step 2: 读 ledger.ts 确认边界**

Run: `cd frontend && grep -nE "^export (function|interface|const)|^function|^interface" src/lib/ledger.ts`
确认 5 个待删函数与保留函数/类型(`ProjectAgg`? 注意 `groupByProject`/`ProjectAgg` 在 dashboardStats.ts 不在此)的行边界与各自依赖 import。

- [ ] **Step 3: 删除**
- `ledger.ts`：删 5 函数及删后未用的 import（如 `RawNode`、`groupByProject` 等——逐个确认保留函数是否仍需，需则留）。
- `ledger.test.ts`：删顶部 `import { excludeFilter, filterLedgerProjects, ledgerSummary, ledgerTierStats, ledgerStatusCounts } from './ledger'` 与对应 5 个 describe 块（约 1-76 行）；保留 `ledgerRows`/`filterLedgerRows`/`ledgerSummaryPmis...` 的 import 与 describe 块。

- [ ] **Step 4: 跑测试 + 类型**

Run: `cd frontend && npx vitest run src/lib/ledger.test.ts && npm run typecheck`
预期：保留的收款阶段块全绿；typecheck 无报错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/ledger.ts frontend/src/lib/ledger.test.ts
git commit -m "chore(3e-1): 删 ledger 旧 ProjectAgg 死函数(保留收款阶段函数)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 删 dashboardStats.ts 死函数（保留 groupByProject/ProjectAgg）

**Files:**
- Modify: `frontend/src/lib/dashboardStats.ts`（删 `computeTierStats`/`computeDashboardSummary`/`DashSummary`，**保留 `groupByProject`/`ProjectAgg`**）
- Modify: `frontend/src/lib/dashboardStats.test.ts`（删两死函数的测试块，保留 groupByProject 测试若有）

**Interfaces:**
- 留：`groupByProject`/`ProjectAgg`（pivot.ts、projectDetail.ts 活用）。

- [ ] **Step 1: grep 证零活消费**

Run: `cd frontend && grep -rnE "computeTierStats|computeDashboardSummary|DashSummary" src --include=*.vue --include=*.ts`
预期：仅 `lib/dashboardStats.ts`(定义) 与 `lib/dashboardStats.test.ts`。注意 `DashSummary`(dashboardStats) 与 payDashboard 的 `DashSummary` 同名但不同文件——确认无活文件从 dashboardStats import `DashSummary`。无活消费 → 死。

- [ ] **Step 2: 读 dashboardStats.ts 确认边界**

Run: `cd frontend && grep -nE "^export (function|interface|const)|^import" src/lib/dashboardStats.ts`
确认待删 3 符号与保留 `groupByProject`/`ProjectAgg` 的边界；记下删后哪些 import（如 `ViewMode`、`RawNode`）变未用。

- [ ] **Step 3: 删除**
- 删 `computeTierStats`/`computeDashboardSummary`/`DashSummary`；删因此未用的 import（如 `ViewMode` 若仅这两函数用——`groupByProject` 通常不需 ViewMode）。
- 保留 `groupByProject`/`ProjectAgg` 及其依赖 import（如 `RawNode`，groupByProject 仍需）。
- `dashboardStats.test.ts`：删 `computeTierStats`/`computeDashboardSummary` 的 describe 块（保留 groupByProject 测试若有；若整文件只测两死函数则整删）。

- [ ] **Step 4: 跑测试 + 类型**

Run: `cd frontend && npx vitest run src/lib/dashboardStats.test.ts && npm run typecheck`
预期：绿（若整删测试文件则跳过 vitest 该文件，仅 typecheck）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/dashboardStats.ts frontend/src/lib/dashboardStats.test.ts
git commit -m "chore(3e-1): 删 dashboardStats 死函数(保留 groupByProject/ProjectAgg)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 整删 dashboardCharts.ts（approach A 类型重定向）

**Files:**
- Modify: `frontend/src/components/PendingBarChart.vue`（`PeriodSeries` import 改自 payDashboard.ts）
- Delete: `frontend/src/lib/dashboardCharts.ts`、`frontend/src/lib/dashboardCharts.test.ts`

**Interfaces:**
- Consumes: `payDashboard.ts` 的 `PeriodSeries`(120 行已定义)。

- [ ] **Step 1: grep 证 dashboardCharts 仅一处类型 import**

Run: `cd frontend && grep -rnE "from '@/lib/dashboardCharts'|from \"./dashboardCharts\"|from '\\./dashboardCharts'" src --include=*.vue --include=*.ts`
预期：仅 `components/PendingBarChart.vue:4`（`import type { PeriodSeries } from '@/lib/dashboardCharts'`）。其余对 `aggregateQuarterly/aggregateMonthly/rankByOrg/delayedTopProjects/OrgRank` 的引用应仅在 dashboardCharts.ts 自身与 dashboardCharts.test.ts。

- [ ] **Step 2: 重定向 PendingBarChart import**

`PendingBarChart.vue` 第 4 行改为：
```ts
import type { PeriodSeries } from '@/lib/payDashboard'
```
（第 8 行 `series: PeriodSeries['series']` 不动——payDashboard 的 PeriodSeries 同含 `series` 字段，结构兼容。）

- [ ] **Step 3: 删文件**

```bash
cd frontend && git rm src/lib/dashboardCharts.ts src/lib/dashboardCharts.test.ts
```

- [ ] **Step 4: 类型 + 相关测试 + 构建**

Run: `cd frontend && npm run typecheck && npx vitest run src/components/PendingBarChart.test.ts 2>/dev/null; npx vitest run`
预期：typecheck 无报错（PendingBarChart 解析到 payDashboard.PeriodSeries）；全量 vitest 绿（dashboardCharts.test 已删、无其它引用）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/PendingBarChart.vue
git commit -m "chore(3e-1): 整删 dashboardCharts.ts(PendingBarChart 改指 payDashboard.PeriodSeries)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
（`git rm` 的删除已暂存，与 import 改动同提交。）

---

### Task 5: 删 pivot.ts 函数层（保留类型层）

**Files:**
- Modify: `frontend/src/lib/pivot.ts`（删 `groupByDims`/`crossMatrix`/`pivotTable`/`DIMENSIONS`/`METRICS`/`DIM_BY_KEY`/`METRIC_BY_KEY` 及删后未用 import；**保留类型 `CrossMatrix`/`PivotResult`/`PivotRow`/`PivotCol`**）
- Delete: `frontend/src/lib/pivot.test.ts`（测的是 pivot 函数层）

**Interfaces:**
- 留：pivot 类型层（BoardMatrix.vue/PivotTable.vue/projectPivot.ts/paymentBoard.ts `import type` 活用）。

- [ ] **Step 1: grep 证函数层零活消费、类型层有活消费**

Run: `cd frontend && grep -rnE "from '@/lib/pivot'|from '\\./pivot'" src --include=*.vue --include=*.ts`
然后看每个 importer 取的是函数(groupByDims/crossMatrix/pivotTable/DIMENSIONS/METRICS)还是类型(CrossMatrix/PivotResult/PivotRow/PivotCol)。
预期：活文件(BoardMatrix/PivotTable/projectPivot/paymentBoard)只 `import type` 类型；函数仅 pivot.ts 内部 + pivot.test.ts 用。确认后删函数。

- [ ] **Step 2: 读 pivot.ts 确认类型/函数边界**

Run: `cd frontend && grep -nE "^export (interface|type|function|const)|^import" src/lib/pivot.ts`
记下类型块(保留)、函数块(删)、及函数专用 import(如 `RawNode`/`groupByProject`/`ProjectAgg`——删函数后若类型层不需则一并删 import)。

- [ ] **Step 3: 删除**
- 删 7 个函数/常量(`groupByDims`/`crossMatrix`/`pivotTable`/`DIMENSIONS`/`METRICS`/`DIM_BY_KEY`/`METRIC_BY_KEY`)及删后未用的 import。
- 保留 `CrossMatrix`/`PivotResult`/`PivotRow`/`PivotCol` 类型定义及其仍需的依赖。
- 删 `pivot.test.ts` 整文件。

- [ ] **Step 4: 类型 + 全量测试**

Run: `cd frontend && npm run typecheck && npx vitest run`
预期：typecheck 绿（4 个活文件仍能 import 类型）；vitest 绿（pivot.test 已删）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/pivot.ts
git rm frontend/src/lib/pivot.test.ts
git commit -m "chore(3e-1): 删 pivot 函数层(保留类型层供看板/洞察)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 版本 V1.6.7 + PROGRESS + 全量验证

**Files:** Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 升版本** — `frontend/src/version.ts`：
```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.6.7'
export const RELEASE_DATE = '2026-06-17'
```

- [ ] **Step 2: 更新 PROGRESS.md** — 在「全局下线 rawNodes 程序」⑤ 处把"⑤ 3E 移除后端 rawNodes 待开"展开为 3E 分阶段，并记 3E-1 已做：

```markdown
⑤**3E 分阶段（审计发现 3E 远大于"删后端 rawNodes"：另有 6+ 活 rawNodes 消费方未换源）**：**3E-1 死代码清扫（spec/plan 2026-06-17-3E-1-rawnodes-deadcode-sweep，V1.6.7，feat/3e-1-deadcode-sweep）**——纯前端零行为变更，删 `filteredNodes`/`filterNodes` 函数/ledger 旧 ProjectAgg 5 函数/dashboardStats 两死函数+DashSummary/整文件 dashboardCharts.ts/pivot 函数层及各自单测；approach A：PendingBarChart 的 PeriodSeries 改指 payDashboard.ts(消除 3B 遗留重复)后整删 dashboardCharts.ts。**保留**(被活消费挡)：groupByProject/ProjectAgg、ViewMode、pivot 类型层、收款阶段 ledger 函数。verify.sh 全绿。**3E-2 前端活消费换源待开**：paymentBand(概览 OverviewView)/buildProjectPage+原项目 closedNodes(详情页)/buildProjectDetail(详情抽屉)/l4Options·pmOptions(全局筛选 FilterBar)/governance yundocsOk 改吃 paymentNodes·projects；closedNodes 能否脱离 rawNodes 需先调研(收款阶段源是否含已关闭原项目节点)。**3E-3 后端移除待开**：rawNodes JSON 键 + schema.AnalysisData.rawNodes + server.node_action_date_from_data + snapshots.build_snapshot 换源，最后删 RawNode 类型。
```

- [ ] **Step 3: 全量 verify.sh**

Run: `bash verify.sh`
预期：python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿（后端未动，pytest 应原样通过）。

- [ ] **Step 4: 手验（建议）** — build 后手开关键页确认删除未误伤：概览/详情(含抽屉+原项目 tab)/台账/日历/看板/洞察 无 JS 报错。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(3e-1): 版本 V1.6.7 + PROGRESS(3E 分阶段/3E-1 死代码清扫)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- 6 任务全部提交；`bash verify.sh` 全绿。
- 前端不再含 `filteredNodes`/`filterNodes` 函数/ledger 旧 ProjectAgg 5 函数/dashboardStats 两死函数+DashSummary/dashboardCharts.ts/pivot 函数层。
- 保留符号(groupByProject/ProjectAgg/ViewMode/pivot 类型层/收款阶段 ledger 函数)与全部后端代码未动。
- 零行为变更：活页面测试不变且全绿 = 无回归佐证。
- 版本 V1.6.7；PROGRESS 记 3E-1 + 标注 3E-2/3E-3 范围。
- 未触碰：后端任何文件、仓库根未跟踪文件、任何 (B) 活消费方。
