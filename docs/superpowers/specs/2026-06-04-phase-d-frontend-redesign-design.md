# Phase D 前端展示重构 设计文档

> 状态：已与用户确认（2026-06-04 brainstorming）。可视化草图保存在 `.superpowers/brainstorm/8158-1780578407/content/`（calendar-layouts / calendar-combined / calendar-polished / calendar-light / overview-ia / home-v2 / home-light）。
> 本文档是 Phase D 的设计基线（spec），下一步由 writing-plans 拆成多个可执行 plan（D1、D2…），沿用 B 阶段"用户说『开始写 Plan Dx』→ subagent-driven-development → finishing-a-development-branch"的执行节奏。

## 1. 背景与目标

B1-B18 已把旧 `app.js` **忠实移植**到 Vue3+TS 前端。Phase D 在此基础上**主动重新设计整体展示形式**（不再以"像旧版"为目标），减少冗余、增强多维分析与下钻体验，并补齐主题/字号/响应式三项全局能力。

**与"忠实移植"的关系（重要）：** Phase D 改的是**展示与信息架构**；底层**业务计算口径仍然忠实**——已有的纯函数计算库（`lib/dashboardStats`、`lib/dashboardCharts`、`lib/calendar`、`lib/pmView`、`lib/ledger`、`lib/planBoards` 等）继续作为数据来源复用或在其上聚合，不改金额/日期/比例/状态的算法。新增的聚合在 `lib/pivot` 中实现并单测。

**本次范围：** 前端重构线（用户提的第 1-4 项 + 三项全局要求）。后端/打包线（C 打包、A4 Playwright 脚本健壮性）已在 PROGRESS Backlog 有定义，**Phase D 形态稳定后再单独排 plan**，不在本设计内。

## 2. 已确认的设计决策

| # | 决策 | 取舍 |
|---|---|---|
| 1 | **三档整合**：金额档位（100万以上/50-100/50以下）不再是导航分叉，降为**页内可选筛选 + 表格列徽章**。"业务分析"从 5 tab × 3 档 = 15 入口收成 **5 个统一页**。 | 信息不丢，去冗余 |
| 2 | **区间对比页重做为"多维看板"**：可按任意维度对比/排名，金额档位只是其中一个维度。 | 一页多用 |
| 3 | **多维看板吸收"项目经理视图"**：pmview 成为"项目经理"维度的特例，**删除 pmview 独立入口**。 | 去冗余 |
| 4 | **多维看板三层灵活度全做**（增量交付）：单维透视（核心）→ 双维交叉 → N 维透视表，三层共享底层 `lib/pivot` 聚合引擎。 | 架构一次设计、分 plan 交付 |
| 5 | **可用维度**：项目经理(projectManager)、L4 部门(orgL4)、L3 部门(orgL3)、项目类型(projectType)、签约单位(signUnit)、金额档位(tier)、节点状态(nodeStatus)、是否延期、计划季度/月度。**"销售"维度本期不做**（数据源无该字段，待 WPS 补列后再加）。 | 数据硬约束 |
| 6 | **项目数据下钻**：做**全局统一"项目详情"面板**（抽屉/弹窗）。任意页面点任意项目都开同一面板，展示项目全字段 + 其回款节点 + 跟进记录。 | 体验一致、逻辑复用 |
| 7 | **页间跳转携带上下文**：点服务组/状态/延期项 → 跳到目标页并自动预填对应筛选。 | 联动顺畅 |
| 8 | **回款日历重做 = A+B+C 三合一**：年度热力条(C) + 视图切换 tab[网格/议程列表](B) + 网格内富日格 + 选中日明细(A)，共享筛选。 | 一个页面三层包装 |
| 9 | **全局三能力**：① 响应式自适应；② 明/暗双主题；③ 字号小/中/大三档。统一 CSS 变量 + `settings` store（localStorage 持久化）+ 右上"显示设置"入口，全站生效。 | 全局地基 |
| 10 | **看板首页重做**：6 指标 + 金额档位"一条堆叠条"（替代三张档位卡）+ 服务组达成排名（点行带筛选跳多维看板）+ 待回款趋势卡（月度/季度切换按钮）+ 延期 Top 卡（按天数/按金额切换按钮，点项目开详情面板）。 | 整体形态收口 |

## 3. 重构后信息架构（侧边栏）

```
概览
  看板首页        /                重做（决策10）
  回款日历        /calendar         重做（决策8）
  临期跟进        /followup         保留
  回款台账        /ledger           保留（档位降为筛选/列，见决策1）
分析
  多维看板        /board            新（吸收 区间对比 + 项目经理视图；决策2/3/4）
  业务分析        /analysis/:tab    5 个统一页（决策1）
管理
  数据管理        /data             保留
  关于产品        /about            保留
顶部全局：筛选条（年/季、视角、维度、纳管） + 右上显示设置（主题 / 字号）
全局浮层：项目详情面板（决策6），任意页可唤起
```

**移除的路由/入口：** `/compare`（并入 /board）、`/pmview`（并入 /board）、`/tier/:tab/:tier` 的"按档位三入口"（改为 `/analysis/:tab` 单页 + 页内档位筛选）。

## 4. 架构与新增/改动单元

### 4.1 全局地基（决策 9）
- `src/styles/theme.css`（或扩展现有全局样式）：定义两套 CSS 变量（`--bg/--card/--card2/--line/--line2/--txt/--sub/--mut/--accent/--cyan` 等），`:root` 为浅色，`html.dark` 覆盖为深色。尺寸用变量 `--fs-base`（14/15/16px 对应小/中/大），组件内尺寸尽量用 `rem`/相对单位。
- `src/stores/settings.ts`：`theme: 'light'|'dark'`、`fontScale: 'sm'|'md'|'lg'`，持久化到 localStorage；提供 `applyTheme()`（切 `html.dark` class）与 `applyFontScale()`（设 `--fs-base`）。可选"跟随系统"。
- `src/charts/echartsTheme.ts`：扩出明/暗两套主题对象，`ChartBox` 按 `settings.theme` 选用并在切换时重渲。
- `src/components/DisplaySettings.vue`：右上角入口（主题开关 + 字号三档分段控件），接 settings store。挂到 `AppHeader`。
- 响应式：布局用 `grid` + `fr`/`minmax`/`clamp()`；关键断点（侧栏折叠、metrics 列数 6→3→2、双列卡片→单列、日历网格）用媒体/容器查询；图表开 `autoresize`。

### 4.2 全局项目详情面板（决策 6/7）
- `src/components/ProjectDetailDrawer.vue`：基于 `el-drawer`/`Modal`，入参 `projectId`；汇总该项目全部节点（复用 `groupByProject`/`naguanFilter`），展示项目字段 + 节点明细表（复用 `DataTable`）+ 跟进记录（复用 `lib/followupApi`/`FollowupRecords`，只读或可写按现有权限）。
- `src/stores/projectDetail.ts`：全局单例状态 `openProject(id)` / `close()`，任意组件调用即弹面板。
- `src/lib/navContext.ts`：封装"带筛选跳转"——把目标筛选（年份/视角/维度/状态/区间）写入 filterStore/crossFilter 后 `router.push` 到目标页。供首页排名、延期项、图表点击调用。

### 4.3 多维看板（决策 2/3/4）
- `src/lib/pivot.ts`（核心新增，纯函数 + 单测）：`groupByDims(nodes, dims[])` 按 1..N 个维度分组；每组算指标（项目数/计划金额/已回款/待回款/完成率/延期数/延期率）。单维/双维/N 维共用。维度取值器 `DIMENSIONS`（key→取值函数 + 标签），含 tier/nodeStatus/季度等派生维度。
- `src/views/BoardView.vue`（`/board`）：顶部维度选择器；**单维**模式 = 排名榜 + 对比图（ECharts）+ 行点击下钻（项目详情面板）。吸收原 `区间对比`（维度=金额档位时即旧 compare 的对比）与原 `项目经理视图`（维度=项目经理时即旧 pmview 的排名+下钻）。
- 双维交叉：在单维基础上加"次维度"，输出交叉矩阵/分组堆叠图（后续 plan）。
- N 维透视表：自选行/列/指标的透视表（后续 plan）。

### 4.4 回款日历重做（决策 8）
- 复用 `src/lib/calendar.ts` 计算层（双数据源口径、月网格生成、临期等已忠实实现）；新增/改组件：
  - `CalYearHeat.vue`（C）：12 月热力条，颜色映射当月待回款金额，点月份聚焦。
  - `CalView` 视图切换：`网格` / `议程列表`。
  - 网格（A）：富日格（金额/笔数/状态点）替换旧"纯文字 title 悬浮"；`CalDayDetail.vue` 选中日明细抽屉/侧栏，点项目开详情面板。
  - `CalAgenda.vue`（B）：按日期升序平铺的议程列表视图。
  - 字体整体放大一档（基准约 14px，吃全局字号变量）。

### 4.5 业务分析三档整合（决策 1）
- `src/views/AnalysisView.vue`（`/analysis/:tab`，tab ∈ projects/nodes/plan/risk/integrity）：单页承载 5 个 tab，去掉档位三入口。
- 复用各 tab 现有组件（`ProjectsOverviewTab`/`TierNodesTab`/`PlanTab`/`RiskTab`/`TierIntegrityTab`）与 `lib`，把"按档位预过滤"改为**页内档位筛选器（默认全部）+ 表格档位列徽章**；统计指标随档位筛选重算。

### 4.6 看板首页重做（决策 10）
- 复用 `lib/dashboardStats`（汇总/分层）、`lib/dashboardCharts`（月度聚合、服务组排名、延期 Top）；新增季度聚合与"延期按金额排序"的派生（在 `lib/dashboardCharts` 增纯函数 + 单测）。
- 组件：`DashMetrics`（6 指标）、`TierStrip`（统一档位堆叠条，替代 `TierCards`）、`OrgRanking`（行点击带筛选跳 /board）、`TrendCard`（月度/季度切换）、`DelayTopCard`（按天数/按金额切换 + 点项目开详情面板）。

## 5. 拆分为 Plan（建议顺序，writing-plans 逐个细化）

| Plan | 内容 | 依赖 |
|---|---|---|
| **D1** | 全局地基：CSS 变量双主题 + settings store + 字号三档 + DisplaySettings 入口 + echarts 双主题 + 响应式基线 | — |
| **D2** | 全局项目详情面板 + 上下文跳转机制（projectDetail store / ProjectDetailDrawer / navContext） | D1 |
| **D3** | 看板首页重做（指标 + 档位条 + 排名跳转 + 趋势月/季切换 + 延期天数/金额切换 + 详情面板接入） | D1, D2 |
| **D4** | 多维看板·单维核心（lib/pivot + BoardView 单维），吸收 compare + pmview，删旧入口/路由 | D1, D2 |
| **D5** | 多维看板·双维交叉 | D4 |
| **D6** | 多维看板·N 维透视表 | D4 |
| **D7** | 回款日历重做 A（富日格 + 选中日明细 + 主题适配 + 字号放大） | D1, D2 |
| **D8** | 回款日历 B（议程列表视图切换） | D7 |
| **D9** | 回款日历 C（年度热力条 + 月度下钻联动） | D7 |
| **D10** | 业务分析三档整合（/analysis/:tab 单页 + 档位筛选/列徽章，删 15 入口） | D1 |

> 顺序非强制，但 D1 必须最先（其余组件都吃主题/字号变量）；D2 早做，后续页面的下钻/跳转都复用。每个 plan 自身 `verify.sh` 全绿才算完成。

## 6. 数据与口径约束

- **维度字段**：仅用现有 `projectManager/orgL4/orgL3/projectType/signUnit` + 派生（tier/nodeStatus/季度）。**销售维度不做**，待数据源补列（属后端/抓取改动，跨出 Phase D）。
- **计算口径忠实**：复用现有 `lib/*` 计算，金额/日期/比例/状态算法不改；新增聚合（pivot、季度趋势、延期按金额）写纯函数 + 单测，作为迁移正确性护栏。
- **数据源口径沿用各页既有约定**：如台账/多维看板下钻用纳管口径、首页汇总用 filteredNodes 等，重构不擅自改口径。

## 7. 范围之外（本设计不含）

- C 打包（dist 接入 server.py + PyInstaller）、A4 Playwright 脚本健壮性 —— 形态稳定后单独排 plan。
- 销售维度及其所需的数据源/抓取改动。
- B-opt 中与本次无直接关系的项（如 Excel 导出、manualChunks 拆包），按需在相应 plan 内顺带或留待 B-opt。

## 8. 验证

- 每个 Plan 完成的定义：代码改完 + `bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）+ PROGRESS 更新。
- 新增纯函数（lib/pivot、季度聚合、延期按金额、维度取值器）必须有 Vitest 覆盖。
- 主题/字号切换、响应式断点、详情面板唤起、跳转带筛选等交互，至少手动启动一次确认无 JS 报错。

## 9. 约定遵循（CLAUDE.md）

- 简体中文沟通；无 emoji（用 → ↓ ❌ ✕ ▾）；术语"邮件推动"；跟进表单仅 记录编号/项目编号/项目名称 只读、无 amountTier；版本号单一来源（`version.ts`，发版同步）；偏好补 CSS 而非引框架（本次新增主题/响应式均为 CSS 变量方案，符合）；一次一个 plan；提交信息结尾 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
