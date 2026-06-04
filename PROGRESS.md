# PROGRESS.md — 开发进度与待办

> 本文件是 harness 的**状态层**（State）。跨会话续接的唯一进度来源。
> 规则：开工把要做的项标 `[~] 进行中`；完成改 `[x]` 并写一句结论；新发现的问题加到 Backlog。
> 配套机器可读清单见 `feature_list.json`。

- 当前版本：**V5.9.1**
- 最近更新：2026-06-04（B11 项目经理视图 完成）
- 维护语言：简体中文

---

## 版本（单一来源约定）

版本号目前散落在多处（`app.js` 版本变量、`index.html` 的 `?v=` 静态资源戳、本文件）。
**约定**：以本文件 + `app.js` 为准；发版时三处一起改。后续应改为构建时统一注入（见 Backlog H-7）。

---

## 已交付功能（V5.9.1，全部 = done）

详见 `feature_list.json`。概览：

- [x] 看板首页：汇总卡片、分层卡片、季度/月度待回款图、服务组排名、延期 Top10
- [x] 区间对比 / 回款日历 / 回款台账
- [x] 临期跟进：列表 + 跟进记录新增/编辑/删除 + 云文档异步回写 + 同步状态追踪
- [x] 业务分析（项目总览/回款节点/回款状态/风险项目/数据质检），各按 100万以上 / 50-100万 / 50万以下 三档
- [x] 项目经理视图、视角切换（L4 服务组 / 项目经理）、周期切换（年/季度）
- [x] 数据管理：云同步(SSE 进度)、离线 Excel 导入、清空数据、数据质量总览、纳管开关
- [x] 本地服务生命周期：自动开浏览器、端口占用清理、桌面快捷方式、停止服务

---

## 进行中

_（无）_

---

## Backlog（按优先级，来源：2026-06-03 代码评审 + harness 评估）

### 🔴 严重（小改动、高收益，建议优先）
- [x] **B-1** `server.py:1319` 改 `ThreadingHTTPServer`：解决同步 SSE 期间全站阻塞、"停止同步"失效。（A2 完成：ThreadingHTTPServer + create_server）
- [x] **B-2** `server.py:1319` 绑定 `127.0.0.1` 而非 `""`：避免局域网无认证访问/触发同步/清空数据。（A2 完成：绑定 127.0.0.1）
- [x] **B-3** `server.py:751` `os.environ.get('PROGRAMFILES(X86)')` 补默认值 `''`：缺该环境变量时会 TypeError 崩溃。（A2 完成：PROGRAMFILES(X86) 缺省值 + 可测）
- [ ] **B-4** `index.html:9` 改用本地 `fonts/google-fonts.css`，移除外链 Google Fonts：离线环境消除超时/字体闪烁。

### 🟠 高（后端健壮性）
- [x] **A2-debt** 继续消除硬编码（A1 遗留）：compute_dashboard/compute_tier_summary 中 ~15 处 nodeStatus 字符串改用 config.STATUS_*；tier 迭代/校验改用 config.TIER_LABELS；集成测试 process_below100_nodes 的时间依赖改注入 now。（A2 完成：status/tier 去硬编码 + now 注入）
- [x] **H-5** `sync_state/import_state/followup_sync_state` 多线程读写加锁（配合 B-1）。（A2 完成：followup_sync_state 加锁；sync_state/import_state 整体重赋值原子）
- [x] **H-6** `followup_sync_state` 只增不删，成功后清理，防内存缓慢增长。（A2 完成：_set_followup_state 限容）
- [ ] **H-7** `server.py:130 _get_node_action_date` 不再用正则扫 2.2MB 的 JS 文本；让 `preprocess_data.py` 额外输出结构化 JSON 供后端直接读。 (部分由 A1 完成：已输出结构化 analysis_data.json + schema 校验)
- [ ] **H-8** 抽取 `run_sync`/`run_import` 重复的"双模式 + 进度解析"为公共函数。 (部分由 A3 完成：解析逻辑已提取复用)
- [x] **A3** server.py API 契约与进度健壮性：统一错误响应 {success,code,message} 收口各 handler；进度解析提取为可测 classify_progress_line（run_sync/run_import 三处循环复用，含 ok/info 合并贴近原逻辑，H-8 部分达成）；跟进云写入串行锁 _write_followup_lock（防 WPS 并发覆盖）。
- [ ] **A4** Playwright 脚本健壮性（需浏览器/云文档手验）：fetch_yundocs_full.py 抓取分块超时/重试；write_followup.py 把手工引号/换行转义改为 json.dumps；脚本输出改 JSON 行协议（与 classify_progress_line 对接）。

### 🟡 中（前端架构，较大重构，需在测试保护下分步做）
- [ ] **M-9** `app.js` 按页面拆分 ES Modules，事件委托替代内联 `onclick`。
- [ ] **M-10** `data/analysis_data.js` 改为 `.json` + `fetch()` 加载。
- [ ] **M-11** 统一 innerHTML 渲染处的转义（140 处），降低 XSS 与重排。
- [ ] **M-12** `app.js` 清理 24% 空行（Prettier 一遍）。

### 🟦 Phase B 前端（Vue3+TS 重写）
- [x] **B1** 前端脚手架与基建：Vue3+Vite+TS 工程、由 schema.py 生成 analysis.ts（类型同源）、统一 API 客户端、数据加载 Pinia store、最小 shell、verify.sh 接入前端检查（typecheck+vitest+build）。
- [x] **B2** 布局骨架与全页面路由：uiStore（侧边栏折叠持久化）、集中导航配置、全页面路由（占位视图）、AppHeader/AppSidebar/AppLayout，App.vue 接入。
- [x] **B3** 筛选状态与控件：lib/filterNodes（忠实移植 getFilteredNodes）、filterStore（年份/视角/纳管 + filteredNodes/选项派生，取代散落全局）、FilterBar 接入 AppLayout。
- [x] **B4** 通用组件：DataTable（封装 el-table：列配置/格式化/排序/截断 tooltip）、ChartBox（封装 vue-echarts + ent 主题）、Modal（封装 el-dialog）；并加 Vitest 的 ResizeObserver/matchMedia 垫片 + vue-echarts 测试桩。
- [x] **B5** 看板首页（卡片部分）：lib/format + lib/dashboardStats（groupByProject/computeTierStats/computeDashboardSummary 忠实移植）、DashSummaryCards、TierCards、DashboardView 挂到 '/'（替换 HomeView）。
- [x] **B6** 看板首页（图表部分）：lib/dashboardCharts（季度/月度聚合 + 服务组排名 + 延期Top 忠实移植）、PendingBarChart、OrgRanking、DelayedTop，接入 DashboardView。看板首页完成。
- [x] **B7** 分层页外壳 + 回款节点(nodes) + 数据质检(integrity)：lib/cellFormat、tierSummaryBar、TierView（/tier/:tab/:tier）、TierNodesTab、TierIntegrityTab。点亮 nodes×3 + integrity×3 入口。
- [x] **B8** 分层页：项目总览(projects) + 风险(risk) tab：lib/projectsOverview、lib/riskGroups、format.fmtRatio、ProjectsOverviewTab、RiskTab，TierView 接入分发。点亮 projects×3 + risk×3 入口。
- [x] **B9** 分层页：回款状态(plan) 6 看板 + CF 筛选联动：lib/crossFilter、stores/crossFilter、lib/planBoards、ColumnFilter、PlanBoard、PlanTab，TierView 接入分发。点亮 plan×3 入口（分层页 5 tab×3 档全通）。
- [x] **B10** 回款台账(ledger)：lib/ledger（纳管-only 数据源/搜索过滤/汇总/分层/状态计数）、LedgerTable（项目表 + CF 列头 + 行展开下钻节点明细）、LedgerView（汇总/状态/分层三条 + 搜索/区间/状态筛选），路由 /ledger 接入。复用 B9 的 CF。
- [x] **B11** 项目经理视图(pmview)：lib/pmView（排名聚合/下钻数据/列定义）、PmRankingTable（排名表+行点击下钻）、PmDrilldownModal（Modal+负责项目表+延期节点表）、PmView，路由 /pmview 接入。
- [ ] **B12+** 回款日历 → 临期跟进 → 数据管理 → 区间对比/关于。
- [ ] **B-opt** 前端构建优化（Element Plus 按需导入 / manualChunks 拆包，解决 ~1MB chunk 警告）；npm audit 处理 json-schema-to-typescript 的 dev 依赖告警；DataTable 的 Excel 导出 + 列枚举筛选弹窗待页面需要时实现；看板图表点击钻取弹窗 + 延期项点击跳转项目节点；分层页列可见性持久化 UI、CF 列枚举筛选、Excel 导出、nodeStatus/tier 徽章配色、行点击钻取。

### 🟢 低
- [ ] **L-13** 收紧 CORS（去掉 `Access-Control-Allow-Origin: *`）。
- [ ] **L-14** `index.html:143` 硬编码内网地址改为配置项/留空。
- [ ] **L-15** 跨平台一致性：macOS 下 taskkill/netstat/快捷方式逻辑失效，明确提示或补实现。

### 🧰 Harness 自身（持续完善）
- [x] **HX-1** 建立 `CLAUDE.md`（指令层；以其为唯一代理入口，不设 AGENTS.md）
- [x] **HX-2** 建立 `PROGRESS.md` + `feature_list.json`（状态层）
- [x] **HX-3** `preprocess_data.py` 纯函数 pytest + `verify.sh`（验证层）
- [x] **HX-4** `init.sh`/`init.bat` 固化环境搭建（venv + 依赖 + playwright + 浏览器检测）
- [x] **HX-7** 基础设施：`git init` + `.gitignore` + `requirements.txt`/`requirements-dev.txt` + `ruff.toml`（ruff 接入 verify.sh，渐进式规则）
- [ ] **HX-5** 扩展验证：Playwright 端到端冒烟（页面可加载、看板有数）
- [ ] **HX-6** 为 `preprocess_data.py` 的计算函数（compute_dashboard 等）补集成测试（需小样本 fixture）。注：compute_* 已接收数据参数=可测，仅 `process_followup_records()` 需先解耦 I/O (部分由 A1 完成：compute_node_status 已单测；计算层 compute_dashboard/tier 集成测试起步)
- [ ] **HX-8** ruff 渐进式扩规则：存量整改后逐步打开 F401→E→I
- [x] **A1** 数据契约与配置地基：config.py + schema.py（pydantic 契约/校验/JSON Schema 导出）+ assign_tier/compute_node_status 纯函数 + 管道集成测试 + preprocess 输出校验后的 analysis_data.json

> 验证基线：`bash verify.sh` 四步全绿（py_compile + ruff + 75 项 pytest + 前端 typecheck/vitest/build）。

---

## 会话交接备注（Handoff）

### ✅ Plan B11 完成（2026-06-04）：项目经理视图(pmview)
- 分支 **`refactor/b11-pmview`** 全部 5 任务完成、`verify.sh` 全绿，待合并 master。
- 提交：计划 `4bd121d` / T1 `a05a9c9`(lib/pmView) / T2 `52ea719`(PmRankingTable) / T3 `45d7143`(PmDrilldownModal) / T4 `ee018c9`(PmView) + 本 PROGRESS/路由提交。
- 产物：`lib/pmView`（pmRanking 排名聚合 / pmDrilldown 下钻 / PM_PROJ_COLS+PM_DELAY_COLS）、`PmRankingTable`（排名表 + 行点击 select + 高亮）、`PmDrilldownModal`（复用 Modal + 两张 DataTable）、`PmView`（搜索 + 展开态 + 装配），路由 `/pmview` 由 PageStub 改 PmView。复用 B10 naguanFilter、groupByProject、B4 Modal/DataTable。
- 经规范+质量审查：可合并 ✓，无 Critical/Important（4 Minor 均可接受：as any 断言、保留完成率配色属多做无害）。
- 关键忠实性（已核对一致）：排名表聚合 **全量 rawNodes**（无纳管/年份/视角）、`totalAmount` 逐节点累加 projectAmount、未指定默认、完成率降序；下钻用 **纳管-only**（naguanFilter）+ groupByProject + 延期过滤 + slice(0,100)；列定义 8+8 与旧一致；行点击切换收起。
- 展示从简（已记录，非偏差）：下钻列可见性 UI、tier/status 徽章配色延后 B-opt；旧全屏遮罩改 Modal(el-dialog width 90%)。
- 整体进度：A1-A3 后端 ✅；B1-B11 前端 ✅（B11 待合并 master）。下一步 B12（回款日历）。

### ✅ Plan B10 完成（2026-06-04）：回款台账(ledger)
- 分支 **`refactor/b10-ledger`** 全部 4 任务完成、`verify.sh` 全绿（前端 typecheck/vitest/build），待合并 master。
- 提交：计划 `556e659` / T1 `55a7c51`(lib/ledger) / T2 `679ed9f`(LedgerTable) + `fdf240b`(下钻收起忠实修正) / T3 `49410d8`(LedgerView) + 本 PROGRESS/路由提交。
- 产物：`lib/ledger`、`components/LedgerTable`（项目表 + CF 列头 + 行展开下钻"回款节点明细"）、`views/LedgerView`（汇总/状态/分层三条 + 搜索/区间/状态筛选），路由 `/ledger` 由 PageStub 改 LedgerView。CF 复用 B9（单表 ledgerTable，无联动）。
- 经规范+质量审查：可合并 ✓，无 Critical/Important。审查发现并已修：旧版 filterLedger 每次过滤 `_expandedLedgerIdx=-1`（过滤即收起下钻），新版补 watch(props.projects) 重置 expandedIdx（`fdf240b`）。
- 关键忠实性（已核对一致）：台账数据源=**纳管-only**（`naguanFilter`，不含年份/视角，对应 `_filteredRawNodes`）；三组指标条基于搜索/区间/状态/CF 过滤后的 displayed 重算；区间过滤按 `nodes.some(tier)`、搜索四字段拼接；按 projectAmount 降序、slice(0,500)；CF 列枚举源=纳管过滤后全部项目 baseProjs；下钻字段与旧一致；待回款列=exp-act、完成率列=exp>0?act/exp:0。
- 展示从简（已记录，非偏差）：下钻只渲"回款节点明细"（项目全字段横行 + 列可见性 UI 延后 B-opt）；tier/status 徽章配色、导出 Excel 延后 B-opt；CF 修正旧版 `remainAmount`→`remainingAmount` 笔误。
- 范围：路线图原"台账/PM"已拆分——台账=B10 独立完成；**项目经理视图=B11**；日历/临期跟进/数据管理/对比/关于顺延 B12+。
- 整体进度：A1-A3 后端 ✅；B1-B10 前端 ✅（B10 待合并 master）。

### ✅ Plan B9 完成（2026-06-04）：分层页 回款状态(plan) + CF 联动
- 分支 **`refactor/b9-tier-plan-tab`** 全部 7 任务完成、`verify.sh` 全绿（36 文件 / 133 前端单测 + typecheck + build），待合并 master。
- 提交：计划 `dd3054c` / T1 `f25dd9d`(crossFilter 纯函数) / T2 `756a361`(crossFilter store) / T3 `21eba3f`(planBoards) / T4 `28c1ae4`(ColumnFilter) / T5 `3ec5fcb`(PlanBoard) / T6 `de72084`(PlanTab) + 本 PROGRESS/TierView 提交。
- 架构：把旧全局 `CF` 对象拆三层——纯函数 `lib/crossFilter`(格式化/去重/列过滤) + Pinia `stores/crossFilter`(各表筛选状态 + 联动开关 + 跨表同步) + 组件 `ColumnFilter`(列头▾下拉)；plan 计算纯函数化 `lib/planBoards`(6看板定义/单板统计/汇总求和/状态计数)；`PlanBoard`(单板) + `PlanTab`(汇总条+状态格+工具栏+6看板, 切档重置筛选)；TierView 分发 plan→PlanTab。分层页 5 个 tab×3 档全通。
- 三组件经规范+质量审查：可合并 ✓，无 Critical/Important（5 Minor 均可读性/B-opt：冗余 as 断言、行 index key、保留未用的 clearAll API）。逐行核对忠实移植：列枚举源=全量关联节点、汇总取 boardAgg 求和、状态计数取 combined(空回退 allNodes)、先按 status 过滤再 CF、slice(0,100)、6 看板顺序配色、navTier 重置。
- 展示从简取舍（已记录，非偏差）：CF 搜索的"即时自动勾选+即时 apply"简化为搜索仅过滤列表、统一「确定」apply；列可见性设置 UI / 导出 Excel / 状态卡点击下钻滚动+"来自看板下钻"高亮延后 B-opt，状态卡为纯计数展示。
- 下一步：B10+(台账/PM/日历/临期跟进/数据管理/对比/关于)、A4(Playwright 脚本)、C(打包)。
- 整体进度：A1-A3 后端 ✅；B1-B9 前端 ✅（B9 待合并 master）。

### ✅ Plan B8 完成（2026-06-04）：分层页 projects/risk
- 分支 **`refactor/b8-tier-projects-risk`** 全部 6 任务完成、`verify.sh` 全绿（110 前端单测），待最终整体审查 + 合并 master。
- 提交：Task1 `6229bd1`(fmtRatio) / Task2 `a3c84c0`(projectsOverview) / Task3 `339fe63`(ProjectsOverviewTab) / Task4 `8e2e870`+`30d8ab2`(riskGroups，含忠实性修正) / Task5 `9367f89`(RiskTab) / Task6 `39d632f`(TierView 接入) + 本 PROGRESS 提交。
- 产物：`lib/projectsOverview`、`lib/riskGroups`、`format.fmtRatio`、`ProjectsOverviewTab`、`RiskTab`，TierView 增加 projects/risk 分发。侧边栏"业务分析"下 projects×3 + risk×3 共 6 入口已点亮（连同 B7 的 nodes/integrity，目前 4 个 tab×3 档已通；仅 plan tab 留 B9）。
- 执行中一处技术判断：Task4 子代理为迁就测试给 highRisk 加了原版没有的 `projectAmount>0` 条件；根因是计划测试数据 P2/P3 完成率为 0（按忠实逻辑本应入 highRisk）。已还原为忠实实现 + 修正测试数据（`30d8ab2`）。
- 下一步：B9(plan 回款状态 6 看板，CF 联动)、B10+(台账/PM/日历/临期跟进/数据管理/对比/关于)、A4(Playwright 脚本)、C(打包)。
- 整体进度：A1-A3 后端 ✅；B1-B8 前端 ✅（B8 待合并 master）。

### 通用
- 测试只覆盖了 `preprocess_data.py` 的**纯函数**（解析层）；计算/聚合函数尚无测试（HX-6）。
- 改 `server.py`/脚本前务必读 `CLAUDE.md` 第 5 节"打包 vs 开发双模式"。
- 前端忠实移植自旧 `app.js`；改前端计算逻辑前对照旧函数，单测是迁移正确性护栏。
