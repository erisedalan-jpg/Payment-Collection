# 2B 回款看板重建设计（/panalysis 整页 PMIS 化）

> 状态：设计已与用户确认（2026-06-15），进入 spec。下一步 `superpowers:writing-plans`。
> 这是「回款看板重建程序」的 **2B**（承 2A 数据底座 f840147）。把 `/panalysis` 整页的回款分析从"云文档 rawNodes + 旧 6 态 + 金额三档"换骨为"PMIS 核心（paymentPmis/paymentNodes）+ 节点 3 态 + 多维可选"。
> 范围：**前端为主**（数据已由 2A 备齐，核心零后端改动）。版本 V1.2.0 → **V1.3.0**（整页级）。

## 0. 背景（2A → 2B）

2A 已落地（schema 已校验、真实数据跑通）：
- `Project.paymentPmis`（`ProjectPaymentPmis`）：`contract / actualTotal / paymentCount / paymentRatio / expectedTotal / nodeCount / reachedCount / delayedCount / lastPaymentDate / fromOrigin`。实际侧=项目级流水÷合同（售前合同/里程碑取原项目、流水本项目优先）。
- `AnalysisData.paymentNodes[pid]`（`PaymentNodePmis[]`）：`stage / planDate / actualDate / payRatio / expectedPayment / reached / status`，status ∈ **{已达成, 延期, 待达成}**。
- 真实数据：633 项目全有 paymentPmis；paymentRatio 非空 337/633（售前 183/309）。

`/panalysis`（`PayAnalysisView.vue`）现为 6 tab：`board`(多维看板) + `projects/nodes/plan/risk/integrity` 5 个分析 tab。**5 个分析 tab 全部建在 `filter.filteredNodes`（旧云 rawNodes，旧 6 态 nodeStatus、节点级 actualPayment、amountTier 三档）上**——正是要废弃的口径。`board` 经 `lib/pivot` 亦走 rawNodes→groupByProject 旧指标。

## 1. 已确认的四项边界决策（用户钦定 2026-06-15）

1. **范围**：`/panalysis` **整页**（含 board）口径全部 PMIS 化；**不动** `/payment`(总览 DashboardView)、`/calendar`、`/ledger`（独立运营页，留后续期）。跟进 `/followup` 属 2D。
2. **结构**：**保留多 tab 页**，逐 tab 换骨为 paymentPmis/paymentNodes 派生视图（"以项目清单为数据基础"）。
3. **主轴**：**多维可选**——顶部共享维度选择器 `部门(L4) / 阶段 / 金额档 / 进度态`，金额档由唯一主轴降为维度之一。
4. **数据质检 tab**：**撤销**，完整性信号降级为 `/governance` 一条**低优先告警**（数据已在 `summary[].incompleteData`，零新后端数据；若评估无价值则直接弃，由实现期 governance 接入时定）。

## 2. 维度与指标（全部从现有字段派生，零后端改动）

**维度派生**（新增纯函数，建议 `frontend/src/lib/paymentPmis.ts`）：
- `部门` = `project.orgL4`（空→`未指定`）。
- `阶段` = `projectPmis[pid].progress.项目阶段`（经 `data.data.projectPmis` map join；空→`未指定`）。
- `金额档` = 由 `paymentPmis.contract` 派生：`≥1_000_000 → 100万以上`；`[500_000, 1_000_000) → 50-100万`；`(0, 500_000) → 50万以下`；`null/0 → 未知`。阈值常量集中定义。
- `进度态` = 由 `paymentPmis.paymentRatio` 派生：`≥0.999 → 已全额`；`(0, 0.999) → 部分回款`；`==0 或 null（且 contract>0）→ 未回款`；无合同→`未知`。

**指标**（board + 各 tab 汇总条统一口径，单位元；展示按 `fmtWan` 转万）：
- `项目数` = count
- `合同总额Σ` = Σ `paymentPmis.contract`（null 计 0）
- `已回款Σ` = Σ `paymentPmis.actualTotal`（null 计 0）
- `计划回款Σ` = Σ `paymentPmis.expectedTotal`
- `待回款Σ` = Σ `max(contract - actualTotal, 0)`（项目级；contract/actual 缺按 0）
- `完成率` = `Σ已回 ÷ Σ合同`（加权；分母 0→null，展示 `-`）
- `延期节点数Σ` = Σ `paymentPmis.delayedCount`

> 完成率护栏：单项目率已在 2A 算好（`paymentPmis.paymentRatio`）；聚合用 Σ÷Σ 加权，**不要**对单项目率求平均。

## 3. 页结构与五个 tab

`PayAnalysisView.vue` 顶栏：tab 条不变（**质检项删除**，余 `多维看板/项目总览/回款节点/回款进度/风险项目`）；右侧"档位"SegToggle **换成共享维度选择器**（`部门/阶段/金额档/进度态`，作用于前 4 个 facet tab；board 用自己的 DimPicker，维度选择器对 board 隐藏或忽略）。

### Tab · 项目总览（清单底座视角）
- 项目级回款表（源 `projects[].paymentPmis`）：列 = 项目编号 / 项目名称 / 经理 / 部门 / 合同(万) / 已回款(万) / 完成率 / 计划回款(万) / 节点(N) / 达成(n) / 延期(n) / `fromOrigin`→"售前·取原项目"标。`.u-num` 挂数字列；完成率三态色（≥0.8 ok / ≥0.5 warn / <0.5 danger，对齐既有 `rateColor`）。
- 顶部按**选中维度**的单维汇总条：每组一行 `维度值 / 项目数 / 合同Σ / 已回Σ / 完成率 / 延期节点Σ`。
- 行点击 → 既有 D2 全局项目详情面板（`projectDetail store`，沿用 DataTable `row-click`）。
- 替换 `lib/projectsOverview.ts`（旧 `filterOverviewProjects`/`projectsOverviewSummary` 走 rawNodes）。

### Tab · 回款节点（计划时间线视角）
- 节点级表（源 `paymentNodes`，扁平化 `{pid, projectName, ...node}`）：列 = 项目 / 阶段 / 计划日 / 实际日 / 计划比例 / 计划金额(万) / 状态。状态三态**淡底深字**（已达成=ok / 延期=danger / 待达成=warn 或 mut，按 theme 状态 token）。
- 汇总条换 PMIS：`节点总数 / 已达成 / 延期 / 待达成 / 计划回款Σ(万)`。
- 可按选中维度筛/分组（维度 join 到节点所属项目）。
- 替换 `TierNodesTab.vue` + `dashboardStats.tierSummaryBar`（旧）。

### Tab · 回款进度（原"回款状态"，6 态 → 3 进度桶）
- **3 个互斥进度桶**（项目级，按派生`进度态`）：`已全额回款 / 部分回款 / 未回款`，每桶卡 `项目数 / 合同Σ / 已回Σ / 完成率`。
- 复用既有交叉筛选 `lib/crossFilter.ts` + `stores/crossFilter.ts` + `ColumnFilter.vue`（做项目表列筛联动；这套经 L-21 核实为回款专属，保留）。
- **延期不在此 tab**（归风险 tab，避免与进度桶重叠）。
- 替换 `PlanTab.vue` + `lib/planBoards.ts`（旧 6 看板 `PLAN_BOARDS`/`boardStats`/`planStatusCounts` 全废）。`PlanBoard.vue` 视情况复用或重写为进度桶卡。

### Tab · 风险项目（PMIS 风险三类）
- ① **延期节点**：`paymentNodes.status==='延期'`，按 `planDate` 升序（项目/阶段/计划日/计划金额）。
- ② **低回款项目**：`paymentRatio < 0.3` 且 `contract > 0`，按 contract 降序 Top10（项目/合同/已回/完成率）。
- ③ **超支项目**：复用 S2 `project.overspendAmount > 0`（项目/部门/超支金额）。
- 旧"加资源可提前/临期可提前"**删除**（PMIS 无此语义）。
- 替换 `RiskTab.vue` + `lib/riskGroups.ts`（旧 nearDue/canAdvance/highRisk 走 rawNodes）。

### Tab · 多维看板（board，迁 PMIS 指标）
- `排名 / 交叉 / 透视` 三模式保留（`BoardView.vue` + `lib/pivot.ts`）。
- **指标换 §2 PMIS 口径**（项目数/合同总额Σ/已回款Σ/计划回款Σ/待回款Σ/完成率/延期节点数Σ）；可加性指标（金额、计数）可堆叠，完成率不可加（NaN→`-`，沿用既有约定）。
- 维度沿用 `lib/pivot` DIMENSIONS（部门/阶段/经理/行业/…）+ 新增 `金额档/进度态`；分桶后**改按 `paymentPmis` 算指标**（不再 groupByProject(rawNodes)）。
- 下钻沿用 `BoardDrilldownModal` → D2 详情。

## 4. 数据质检 → governance

- `PayAnalysisView` 删 integrity tab、删 `TierIntegrityTab.vue` 引用；`nav.ts` `TIER_TABS` 去 `integrity`（该常量若仅此处用，连带清理）。
- `/governance`（`DataQualityView.vue` + `lib/governance.ts buildHealthReport`）：把"云文档完成%/里程碑达成缺失"接成**一条低优先告警**（沿用既有告警注册表模式，明细表+导出可选）。数据源 `summary[tier].incompleteData` 已存在。**若实现期判定低价值 → 直接弃，不强加**。

## 5. 数据来源切换（关键）

- 新视图**不再消费** `filter.filteredNodes`（rawNodes）。改消费 `data.data.projects`（含 `paymentPmis`）+ `data.data.paymentNodes` + `data.data.projectPmis`（取阶段）。
- 年份/视角（global/l4/pm）/纳管 过滤：现 `filterStore` 基于 rawNodes。2B 视图改为对 `projects[]` 过滤——
  - **视角**：按 `project.orgL4`（l4）/ `project.projectManager`（pm）过滤；global 全量。
  - **纳管**：`naguanExclude[projectId]` 过滤（与旧 `filterOverviewProjects` 一致）。
  - **年份**：旧按节点 planDate 落年份；PMIS 项目级无单一日期——**2B 默认不按年份过滤项目总览/进度/风险**（项目是持续态），节点 tab 可按 `planDate` 年份过滤（可选，YAGNI 优先不做，留待用户提）。
  - 建议在 `lib/paymentPmis.ts` 出 `filterProjects(projects, {viewMode, viewL4, viewPM, naguanOn, naguanExclude})` 纯函数，**不复用** filterNodes。

## 6. 测试

- **vitest 纯函数**（`lib/paymentPmis.ts`）：`deriveTier`（四档边界含 null/0）、`deriveProgress`（已全额/部分/未回款/未知边界含 ratio=null 有合同、ratio=1）、`projectPaymentRows`、`summaryByDim`（Σ÷Σ 加权、分母 0→null）、`paymentNodeRows`（扁平化+维度 join）、`progressBuckets`（互斥）、`pmisRiskGroups`（三类，排序/Top10/阈值边界）、board PMIS 指标聚合。
- **组件测试**：各 tab 薄渲染（空态不崩、列/汇总条字段、行点击触发详情面板）；维度选择器切换联动。
- **真实数据冒烟**：`python server.py` 跑通后人工核对——项目总览完成率与 2A `paymentRatio` 一致；节点 3 态计数 == Σ `paymentPmis.reachedCount/delayedCount`；board 合同总额Σ 与 /insight 同维同值（口径校验）。
- `bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。

## 7. 版本与不做

- 版本 **V1.3.0**（`frontend/src/version.ts` 单一来源）；`PROGRESS.md` 2B 项标完成 + SHA。无新增 py 模块（纯前端为主；governance 若接入告警走既有 `lib/governance.ts`）。
- **不做（YAGNI 边界）**：不动 `/payment` 总览 / `/calendar` / `/ledger`（仍旧云口径，后续期）；不动 `/followup`（2D）；不动 `rawNodes` / 旧 `payment`(ProjectPayment) / `filterNodes` / `dashboardStats.groupByProject`（旧链仍被 `/payment`·日历·台账消费，**保留并存**，2B 只在 `/panalysis` 内停止消费）；不做项目级年份过滤（项目持续态）；不做节点级现金分摊（2A 已定达成+项目流水口径）；不做标签筛选（2C）；不删旧 lib 文件除非确认无其他消费方（先 grep 引用再删）。

## 8. 实现注意（易踩坑）

- `crossFilter`/`ColumnFilter`/`PlanBoard` 经 L-21 核实为回款专属——可改写复用，但改前 grep 确认仅 `/panalysis` 链消费。
- 删旧 lib（projectsOverview/planBoards/riskGroups/tierSummaryBar）前**必须 grep 全仓引用**：`/payment`(DashboardView)、`/ledger`、`/calendar` 可能复用 `dashboardStats.groupByProject` 等——这些是 2B 范围外、需保留的消费方。只删 `/panalysis` 独占件。
- `nav.ts` `TIERS`/`TIER_TABS`/`TIER_BY_SLUG`：确认其他页是否引用（旧 redirect `/analysis/:tab`、侧栏）再调整。
- 设计令牌：新卡/表/状态色一律引 `theme.css` 令牌（状态三态淡底深字 `--ok-bg/--ok-text` 等），禁手写散值；数字列挂 `.u-num`；图表色走 `echartsTheme` 同源。
