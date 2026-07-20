# /insight 项目分析中心整合 — 设计文档（已批准）

> 状态：**设计已通过用户确认（2026-06-19），待下次对话执行**。下一步是对 **SP-A** 调用 superpowers:writing-plans 生成实现计划。
> 目标版本：**V1.16.0**（整页级：新增 2 页 + 迁移 2 页 + 导航重组）。

**Goal：** 把同事的"项目数据运营工具"系统中的**里程碑管理**、**成本分析**两个看板整合进当前平台，并把 `/insight` 重构为"项目分析"主入口，下挂 5 个分析子页；数据完全取自现有数据源，配色/字体/架构完全遵循当前系统。

**Architecture：** 沿用现有"平铺独立路由 + per-route meta + nav.ts 二级缩进菜单"模式，不引入嵌套 router-view、不引入新框架。两个新页是**对方页面的忠实展现移植**，但所有数据从我方 `analysis_data.json` 提取（字段映射见第 4、5 节）。两个回款页（board/calendar）仅迁移路由位置，功能不变。分 3 个子项目顺序交付，每个独立 `verify.sh` 全绿可交付。

**关键决策（用户 2026-06-19 拍板）：**
1. 成本分析页 = **忠实复刻对方"预算超支预警"**（纯计数 KPI + 超支分布 + 明细表），超支三档用 `cost.剩余预算 ±5000` 复刻对方口径。不照搬对方"已剔除老OA迁移项目3个"静态文案（无代码依据）。
2. 里程碑状态 = **直接用现成 `progress.里程碑进度状态` 字段**（与对方同源同值：正常/延期/严重延期/超期未发布；空值归"未发布"）。不自行从节点日期派生。
3. 交付节奏 = **拆 3 个子项目顺序做**（SP-A 路由/导航 → SP-B 里程碑页 → SP-C 成本页）。

---

## 1. 目标信息架构（路由 + 导航）

```
项目分析  （导航分区，主入口 /insight）
 ├ /insight             项目多维分析   （现 InsightView，默认页，hideFilter:true）
 ├ /insight/milestone   里程碑管理     （新建，hideFilter:true，自带页内工具栏）
 ├ /insight/costdetail  成本分析       （新建，hideFilter:true，自带页内工具栏）
 ├ /insight/board       回款多维分析   （迁自 /payment/board，hideFilter:false 带全局 FilterBar）
 └ /insight/calendar    回款日历       （迁自 /calendar，hideFilter:false 带全局 FilterBar）
```

- **导航（nav.ts）**：board/calendar 从"回款 重点子域"组（PAYMENT_LINKS）**移除**，并入"项目分析"组（PROJECT_LINKS 或新分区），二级缩进平铺链接（`.nav-sub` 样式，与 payment 子域一致）。
- **redirect 兼容（router/index.ts）**：`/payment/board → /insight/board`、`/calendar → /insight/calendar`；既有 `/board`、`/panalysis/:tab?`、`/analysis/:tab` 级联指向新路径；**全部保 query**（board 依赖 `?dim=`）。
- **路由仍平铺**：5 条各带自己的 `meta.title/meta.hideFilter`。注意现有硬约束：回款子页禁止引入 `/payment/:param` 通配（会遮蔽 `/payment` DashboardView）；`/insight/:param` 同理须用精确路径。
- **版本**：完成时定 V1.16.0（`frontend/src/version.ts` 单一来源）。

---

## 2. 三个子项目（边界 + 顺序 + 交付物）

### SP-A 路由/导航重构（先做，搭骨架）
- `frontend/src/router/index.ts`：迁移 board(`pay-board`)/calendar 到 `/insight/board`、`/insight/calendar`；新增 `/insight/milestone`、`/insight/costdetail` → 先指向**占位 stub 视图**（"建设中"，保证 SP-A 独立 verify 全绿）；新增/级联 redirect；各 meta 设 title 与 hideFilter。
- `frontend/src/nav.ts`：项目分析组改为 5 个二级链接（项目多维分析/里程碑管理/成本分析/回款多维分析/回款日历）；PAYMENT_LINKS 移除 board/calendar 两条。
- `frontend/src/lib/navContext.ts:5`：`goBoard()` 路径 `/payment/board` → `/insight/board`（被 OrgRanking.vue 经 goBoard 调用）。
- 同步修测试断言（会变红）：`router/index.test.ts`、`navContext.test.ts`、`OrgRanking.test.ts`、`AppSidebar.test.ts`、`CalendarView.test.ts`、`BoardView.test.ts`。
- **交付物**：5 页可达、菜单结构正确、board/calendar 新位置功能不变、旧链接 redirect 生效（保 query）、verify 全绿。

### SP-B 里程碑管理页 `/insight/milestone`
- 新增 `frontend/src/lib/milestoneAnalytics.ts`（纯计算口径）+ `frontend/src/views/MilestoneView.vue` + 必要子组件；替换 SP-A 的 stub。
- 区块（忠实对方，从上到下）：5 状态 KPI 卡 → 到期提醒图(横向堆叠条) + 终验完成情况图(项目数/金额双柱，年份+季月切换) → 部门异常分布堆叠柱(Top15 L4) + 部门里程碑合规率折线 → 关键节点分布折线(月度多系列，可下钻) → 3 tab(延期清单 / 到期提醒 / 在建里程碑计划)。
- 数据映射见第 4 节。
- **交付物**：页面完整、口径冒烟核对、vitest 单测覆盖 lib、verify 全绿。

### SP-C 成本分析页 `/insight/costdetail`
- 新增 `frontend/src/lib/costAnalytics.ts` + `frontend/src/views/CostDetailView.vue`；替换 SP-A 的 stub。
- 区块（忠实超支预警）：4 计数 KPI(成本统计项目数/未超支/超支不足5k/超支大于5k) + 超支项目分布堆叠柱(按 L4，两系列：不足5k/大于5k) + L4 成本情况汇总表 + 项目成本明细表(13 列) + 筛选(L3/L3-1/L4/成本状态/类型/经理多选 + 搜索) + 导出。
- 数据映射见第 5 节。
- **交付物**：同 SP-B。

---

## 3. 设计规范遵循（展示形式）

- **令牌单一来源**：全部走 `frontend/src/styles/theme.css`（CSS 变量）+ `frontend/src/charts/echartsTheme.ts`（canvas 同源）；页面只引用令牌、**禁手写散值**。
- **图表挂主题**：统一经 `frontend/src/charts/ChartBox.vue` 包装 `vue-echarts`（读 settingsStore.theme 自动 light/dark），页面只传 `:option`。
- **状态色映射**（结构色与状态色分离）：
  - 里程碑：正常→`--ok`、延期→`--warn`、严重延期→`--danger`、未发布→`--mut`/中性灰。
  - 成本：未超支→`--ok`、超支不足5k→`--warn`、超支大于5k→`--danger`。
  - 表达状态的图表系列必须用状态色；分类维度用 `--chart-1..8`。
- **复用组件**：`DataTable`（明细/汇总表，支持 fixed 列、num 列自动 `.u-num`、formatter、cell 插槽、row-click）、`ChartBox`（图）、`SegToggle`（tab 模式切换）、`DashMetrics` 卡片范式（KPI；当前写死回款指标，新页需新建/泛化卡片，沿用其 `.u-grid-auto` + `--fs-5` 大值范式）、下钻复用 `InsightDrillModal` 模式。
- **数字排版**：金额/百分比/计数列挂 `.u-num`（tabular-nums）。
- **8pt grid / 卡片 / 圆角 / 阴影 / 字号六级**：严格遵循 CLAUDE.md「设计底层规范」。

---

## 4. SP-B 里程碑页 — 数据映射（我方字段）

我方主域 `projects`（624 个，已是 PMIS 在建 ∩ 组织架构交付三部）。对方多处硬编码"仅交付实施三部"，我方天然吻合，全页基于 `projects` 即可。售前节点本项目号优先、缺回退原项目号（沿用 `_collection_nodes_for` 既有约定）。

| 区块 | 我方数据来源 | 口径 |
|---|---|---|
| 5 状态 KPI | `projectPmis[pid].progress.里程碑进度状态` | 正常/延期/严重延期/超期未发布；**空值(None)归"未发布"**（对齐对方"超期未发布"并入"未发布里程碑"显示）。占比 = 各态数 / 主域总数 |
| 到期提醒图(7天/30天/季度 × 高/中/低) | `projectMilestones[pid]` 各节点 | 节点 `planDate∈窗口` 且 `actualDate` 空（未完成）→ 到期节点；累计桶(7天⊂30天⊂季度)；优先级用现成 `MilestoneItem.priority`(high/mid/low) |
| 终验完成情况(项目数+金额双柱) | 节点 `name∈{终验, 服务完成}` 的 planDate/actualDate；金额 = `paymentPmis.contract` | 按计划终验(优先)/计划服务完成时间分季/月桶 → 计划数/计划金额；实际终验或实际服务完成非空 → 实际完成数/金额（归同一计划桶）。金额 ÷10000 万元。年份下拉 + 季/月切换 |
| 部门异常分布(堆叠柱 Top15) | `orgL4` × 状态 | 按 L4 聚合 延期+严重延期+未发布 计数，取异常数 Top15 |
| 部门合规率折线 | `orgL4` × 状态 | 合规率 = 正常数 / 部门主域总数 ×100（与上图同 Top15 L4 序） |
| 关键节点分布(月度多系列折线，下钻) | 节点 name + planDate + `payStage` | 到货/初验需 `payStage` 非空才计数(对应"关联回款阶段")、终验/服务完成需 planDate 非空；按计划日期月份分布；年份筛选；点折线点 → 下钻到 tab③ 按 节点类型+月份+年份 过滤 |
| tab① 延期清单(项目级) | projects + 状态 | 状态≠正常的项目；列：编号(链 `/project/:id`)/名称/类型/L3/L4/经理/状态徽章/延期节点；表头排序、导出 |
| tab② 到期提醒(节点级) | projectMilestones 展开 | 每到期节点一行；列含 计划时间(紧急度染色)/回款阶段/是否关联回款/处置优先级；时间窗按钮+多选筛选+分页 |
| tab③ 在建里程碑计划(项目级宽表) | projectMilestones 全节点 + 项目元信息 | 每项目一行展开 13 类节点的计划/实际日期；搜索/重置/导出/分页；下钻进入时按条件过滤 |

**节点名值域（我方实测）**：项目关闭/项目启动/到货/服务进场/交付完工/初验/项目完工（服务离场）/终验/服务完成/实物点验/节点成果确认/驻场。

---

## 5. SP-C 成本页 — 数据映射（我方字段）

| 区块 | 我方数据来源 | 口径 |
|---|---|---|
| costStatus 三档 | `projectPmis[pid].cost.剩余预算`（621 非空；亦可用 `overspendAmount`） | `剩余预算 < -5000`→超支大于5k；`-5000 ≤ <0`→超支不足5k；`≥0`→未超支（对齐对方 ±5000 阈值） |
| 4 计数 KPI | 上述 costStatus 计数 | 成本统计项目数 / 未超支 / 超支不足5k / 超支大于5k；统计基数剔 XS 前缀项目(若有) |
| 超支分布堆叠柱(按 L4) | `orgL4` × costStatus | 两系列：超支不足5k(`--warn`) / 超支大于5k(`--danger`)；按部门计数 |
| L4 成本汇总表 | `orgL4` 分组 | 列：L4/项目总数/未超支/不足5k/大于5k/超支占比(=大于5k数/总数)；剔 XS |
| 项目成本明细表(13 列) | projects + cost | 序号/编号/名称/类型/L3/L3-1/L4/经理/项目金额(`contract`)/成本状态/总预算(`cost.总预算`)/已核算(`cost.核算`)/剩余预算(`cost.剩余预算`，<0 红≥0 绿)；表头排序；分页 20；XS 在明细表保留 |
| 筛选 + 导出 | — | L3/L3-1/L4/成本状态/类型 多选 + 经理文本 + 搜索；导出统一带当前筛选（修正对方"导出无视筛选"的小缺陷） |

**口径取舍说明**：我方 `cost.成本状态`(正常/黄色预警/红色预警) 与对方 ±5000 三档语义不同，本页**按用户决策用 ±5000 复刻对方展现**，不用我方现成成本状态体系。我方独有的 `projectProfit`(毛利率/收入/毛利，621 全覆盖) **本期不接入**（用户选"忠实复刻"，YAGNI；留作后续增强空间，记 backlog）。

---

## 6. 测试策略

- 每个 SP 完成 `bash verify.sh` 全绿（前端 typecheck + vitest + build；后端 ruff + pytest）。
- SP-A：补/改 6 个受影响测试文件断言。
- SP-B/SP-C：`milestoneAnalytics.ts` / `costAnalytics.ts` 纯计算口径写 vitest 单测（含边界：空状态归未发布、±5000 边界、售前节点回退、空合同金额）；用真实数据冒烟核对关键指标（状态分布、超支档计数、终验完成桶）。
- 改 `schema.py` 概率低（数据字段均已存在）；若需新增派生字段，先补 pytest 再改实现，并 `npm run gen:types`。

---

## 7. 数据可得性核查结论（2026-06-19，避免下次重复分析）

对方系统 = 独立的 Node.js/Express + 原生 HTML 子项目（`项目数据运营工具/项目数据自动统计系统/`），数据源为本地 9 张 xlsx，无外部 API。我方对照核查：

- **里程碑状态**：`progress.里程碑进度状态` 实测主域值域 正常331/严重延期258/延期8/超期未发布7/空20 → 同源同值，直接可用。
- **里程碑节点**：`projectMilestones` 805 项目（含售前原项目），13 类节点含计划+实际日期 + `payStage`(关联回款阶段) + `priority` → 齐全。
- **成本超支**：`cost.{总预算,核算,剩余预算,消耗比,项目超支,交付超支,成本状态}` + `overspendAmount`(621 非空) → 可完整复刻。
- **损益毛利**：`projectProfit` 621 项目**全部**含 预算收入/预算成本/实际成本/成本消耗率/预算毛利/实际毛利/预算毛利率/剩余预算 + 科目树 `rows`/`bridge` → 我方独有更全（本期不接入）。
- **维度**：orgL4/orgL3_1、`PmisStatus.{项目级别,项目类型,项目状态,评级}`、`PmisCustomer.行业`、`PmisProgress.项目阶段` 等齐全。

对方页面**不存在**的东西（plans 文件名误导）：无甘特图、无三级手风琴、无延期天数计算（`delayDaysRange` 是死代码）。

---

## 8. 现有相关代码索引（迁移/复用锚点）

- 路由：`frontend/src/router/index.ts`（全静态 import，无懒加载；redirect 在 :48-51；硬约束注释 :42）。
- 菜单：`frontend/src/nav.ts`（PROJECT_LINKS / PAYMENT_LINKS / TOOL_LINKS）渲染于 `frontend/src/layout/AppSidebar.vue`。
- /insight：`frontend/src/views/InsightView.vue` + `frontend/src/lib/projectPivot.ts`（11 维 6 指标；可扩展项目级别/项目类型维度——schema 已有）。
- board：`frontend/src/views/BoardView.vue` + `frontend/src/lib/paymentBoard.ts`。
- calendar：`frontend/src/views/CalendarView.vue` + `frontend/src/lib/calendar.ts`（自带页内年/月/三下拉筛选 + 消费全局 FilterBar 日期）。
- 程序化跳转：`frontend/src/lib/navContext.ts:5` `goBoard()`，调用方 `frontend/src/components/OrgRanking.vue:57`。
- 复用件：`DataTable.vue` / `ChartBox.vue` / `SegToggle.vue` / `DashMetrics.vue` / `DimPicker.vue` / `BoardMatrix.vue` / `PivotTable.vue` / `InsightDrillModal.vue` / `MilestoneTable.vue` / `ProfitTree.vue`。
- 主题：`frontend/src/charts/echartsTheme.ts`（STATUS_LIGHT/DARK、CHART_LIGHT/DARK；契约测试 `echartsTheme.tokens.test.ts` 强制与 theme.css 一致）。

---

## 9. 下一步

下次对话从这里继续：对 **SP-A** 调用 `superpowers:writing-plans` 生成实现计划 → `superpowers:subagent-driven-development` 执行（用户已授权多代理/workflow 提效）。SP-B、SP-C 各自在轮到时走 spec→plan→实现 循环（本文档第 4、5 节已是其 spec 主体）。
