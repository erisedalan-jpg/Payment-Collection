# 项目回款跟踪与管控平台 — 整体重构设计（Spec）

- 日期：2026-06-03
- 状态：已与用户确认方向，待 spec 评审
- 目标版本：新版（V6，工作代号）

## 决策摘要（已与用户确认）

| 决策 | 结论 |
|---|---|
| 本次性质 | **彻底整体重构**；老版本已备份、可在别处使用，**不需保活、不需重构期可用、不考虑老版收益** |
| 重心 | **可迭代性**（以后改得快、改得安全）优先 |
| 前端 | **Vue 3 + Vite + TypeScript** 组件化重写 |
| 状态管理 | Pinia |
| 路由 | Vue Router |
| 组件库 | **Element Plus**（打底）+ 关键 UI 自建（图表/日历/侧边 dock） |
| 图表 | vue-echarts 封装 ECharts |
| 前端测试 | Vitest（+ 可选 Playwright e2e 冒烟） |
| 后端 | **保留 Python**（stdlib HTTP 服务 + Playwright 抓取），作为新版一部分一并重写/加固 |
| 数据契约 | 单一真相：`schema.py`（pydantic）→ 导出 JSON Schema → 生成前端 TS 类型 |
| 数据加载 | preprocess 只输出 `data/analysis_data.json`，前端 `fetch` 加载（弃用全局 `var ANALYSIS_DATA`） |
| 迁移方式 | 全量重写，新版完成后即唯一版本；旧 `app.js/index.html/style.css` 删除（仅存 git 历史） |

## 1. 背景与目标

现状：单机/内网离线运行的回款跟踪看板。后端 Python stdlib HTTP（`server.py`）+ Playwright 抓取 WPS 云文档（`fetch_yundocs_full.py`）+ 数据清洗（`preprocess_data.py` → `data/analysis_data.js`）+ 原生前端（`app.js` 7886 行单文件 + `index.html` + `style.css`）+ 云文档回写（`write_followup.py`）。可 PyInstaller 打包为单 exe。

核心问题（已通过深度代码审查确认）：

- **前端不可维护**：`app.js` 7886 行单文件、~30+ 散落全局变量、~140 处 `innerHTML` 全量重建、10+ 处重复表格渲染、手工转义导致的 XSS 隐患、6 处各自硬编码的 `fetch`、内联 `onclick` 依赖全局函数。
- **无显式数据契约**：`analysis_data.js` 的结构是前后端隐式约定，改字段易静默出错。
- **硬编码分散**：Sheet 名、列名、tier 阈值、状态枚举、Excel 序列号阈值散落各处。
- **后端缺陷**：单线程 `HTTPServer`（同步 SSE 期间全站阻塞）、绑定所有网卡无认证、`PROGRAMFILES(X86)` 取值崩溃点、靠扫 `[OK]/[ERROR]` 字符串判断进度（脆弱）。
- **管道脆弱**：`write_followup.py` 每次重启浏览器、并发写云文档有覆盖风险、引号/换行手工转义不完整；`fetch` 大表降级到逐单元格读取（极慢）。
- **零自动化验证地基**（已在 harness 阶段补了纯函数测试 + verify.sh，本次继续扩展）。

目标：以"可迭代性"为第一目标，重建为模块化、类型安全、有测试护栏、契约显式、配置集中的新版本。

## 2. 范围与非目标

**范围**：前端全量 Vue 化重写；后端 `server.py`/`preprocess_data.py`/`fetch_yundocs_full.py`/`write_followup.py` 重写加固；数据契约显式化；配置集中化；测试与打包链路改造。

**非目标**：
- 不更换后端语言/架构（仍是 Python stdlib 服务 + Playwright）。
- 不引入数据库（仍是文件驱动：云文档 → JSON → 前端）。
- 不做用户认证体系（仍是单机/内网工具；仅绑定 127.0.0.1 收敛暴露面）。
- 不保证与老版本的兼容/共存。

## 3. 总体架构

```
开发期：
  Vite dev(:5173) ── /api 代理 ──> Python server.py(:8080)   # 仅 /api
  Vue app ── fetch ──> /data/analysis_data.json

生产 / 打包：
  npm run build → frontend/dist/
  server.py（STATIC_DIR → frontend/dist）同时服务静态页与 /api
  PyInstaller 打包 dist/ + *.py + 资源
  数据流：WPS云文档 ─fetch_yundocs─> yundocs_data/*.json ─preprocess─> data/analysis_data.json ─> 前端
```

离线/双击/可打包能力保留：dist 为纯静态产物，字体已本地化，运行时不需要 Node。

## 4. 数据契约（单一真相）

权威源：`schema.py`（pydantic 模型）。`preprocess_data.py` 末尾用其校验后写出 `data/analysis_data.json`（不合规即报错 → 数据问题变为可自动捕获）。由 pydantic 导出 JSON Schema，再用 `json-schema-to-typescript` 生成 `frontend/src/types/analysis.ts` —— **前后端类型同源**。

顶层结构 `AnalysisData`（已通过逆向还原，Phase A 在 `schema.py` 完整固化）：

| 键 | 形状 | 含义 |
|---|---|---|
| `meta` | `{lastUpdate, totalProjects, totalPaymentNodes}` | 元数据 |
| `dashboard` | 见下 | 看板首页全量聚合 |
| `summary` | `{ "100万以上"|"50-100万"|"50万以下": TierSummary }` | 分层汇总 |
| `rawNodes` | `RawNode[]` | 所有回款节点（核心数据，~2000 条） |
| `projectOverview` | `{projects[], columns[]}` | 项目总览 + 动态列配置 |
| `naguanMap` / `naguanExclude` | `{projectId: bool}` | 纳管映射 / 排除集合 |
| `displayColumns` | `{tier: Col[]}` | 各 tier 表格列配置 |
| `followupRecords` | `{projectId: Record[]}` | 按项目分组的跟进记录（每项目最近 5 条） |

`dashboard` 关键字段：计数（`totalProjectCount/totalPaymentNodes/totalPaidNodes` + 6 状态计数）、金额（`totalExpected/Actual/Pending(Payment|Wan)`、`totalCompletionRate`）、`monthlyPlan{YYYY-MM:{count,amountWan,nodes[]}}`、`orgRanking[]`、`delayedTop5[]`、`classification[]`、`serviceGroups[]`、`tierProjectCounts{}`。

`RawNode`（~38 字段，按组）：
- 标识/项目：`source, tier, projectId, projectName, orgL3, orgL4, projectManager, projectType, projectAmount, amountTier`
- 节点：`nodeName, planDate, planMonth, planQuarter, actualDate, completionStatus`
- 回款：`isPaymentRelated, planPaymentRatio("70%"), actualPaymentRatio, expectedPayment(元), actualPayment(元)`
- 完成度/里程碑：`projectCompletion, isMilestoneAchieved, expectedMilestoneDate`
- 资源/卡点/动作：`canAdvance, advanceDetail, blocker, blockerOwner, nextAction, nextActionDate`
- 备注/签约：`remarks, remarks2, signUnit`
- 计算字段：`nodeStatus(6 枚举), delayDays`
- 纳管/跟进：`纳管, followupRecords[]`

`nodeStatus` 6 枚举（判定优先级，详见现 `preprocess_data.py:272-350`，Phase A 抽为 `compute_node_status` 纯函数）：加资源可提前 / 达到回款条件 / 已提前回款 / 已全额回款 / 延期 / 正常实施中。

比例语义（重要）：WPS API 返回 Excel 内部小数（70%→0.7、101%→1.01）。`parse_ratio` 返回 0~1 用于计算；`parse_ratio_raw` 返回展示用 "70%" 字符串。此语义在新版保持不变。

## 5. 仓库目标结构

```
Payment Collection/
├── frontend/                      # Vue3 + Vite + TS（新版前端）
│   ├── src/
│   │   ├── main.ts  App.vue
│   │   ├── router/                # Vue Router
│   │   ├── stores/                # Pinia: data / filter / ui / followup
│   │   ├── api/client.ts          # 统一 HTTP 客户端（baseUrl/错误/SSE/轮询）
│   │   ├── types/analysis.ts      # 由 schema.py 生成
│   │   ├── components/            # DataTable / ChartBox / Modal / FilterPopup ...
│   │   ├── composables/           # 年份·视角·纳管过滤、列配置
│   │   ├── charts/                # echarts 主题 + vue-echarts 封装
│   │   └── pages/                 # dashboard/tier/ledger/calendar/followup/data/compare/about
│   ├── package.json  vite.config.ts  vitest.config.ts  tsconfig.json
├── schema.py                      # 新增：pydantic 数据契约（权威源）
├── config.py                      # 新增：Sheet名/列名/tier阈值/状态枚举/序列号阈值
├── server.py                      # 重写加固
├── preprocess_data.py             # 重构：解耦I/O、抽纯函数、输出 JSON、schema 校验
├── fetch_yundocs_full.py          # 加固：抓取性能/健壮性
├── write_followup.py              # 加固：并发队列 + JSON 转义
├── tests/                         # pytest：纯函数 + compute_* 集成 + schema 校验
│   └── fixtures/                  # 脱敏小样本 yundocs_data
├── data/                          # analysis_data.json（生成物，gitignore）
├── yundocs_data/                  # 抓取物（gitignore）
├── CLAUDE.md PROGRESS.md feature_list.json verify.sh init.sh ...   # harness（更新）
└── PaymentReviewApp.spec          # 打包 dist/
（删除：app.js / index.html / style.css —— 仅存 git 历史）
```

## 6. 阶段路线图

每阶段结束须 `verify.sh` 全绿；前端阶段额外 `npm run typecheck && vitest run && npm run build`。

### Phase A — 后端重构与契约地基

任务：
1. `schema.py`：pydantic 定义 `AnalysisData/RawNode/Dashboard/TierSummary/...` 完整契约。
2. `config.py`：集中 Sheet 名、列名映射、tier 阈值（100万/50万）、`NODE_STATUSES`、Excel 序列号阈值（40000/60000）。
3. `preprocess_data.py` 重构：
   - 抽纯函数 `assign_tier(amount)`、`compute_node_status(...)→(status, delayDays)`、`count_nodes_by_status(nodes)`、`is_empty_val(v)`。
   - 解耦 I/O：`load_sheet` / `process_followup_records` / 写文件从计算逻辑分离，便于注入测试。
   - 末尾 pydantic 校验后**只写** `data/analysis_data.json`。
4. `server.py` 重写加固：`ThreadingHTTPServer`；绑定 `127.0.0.1`；修 `PROGRAMFILES(X86)` 崩溃点；统一错误结构 `{success, code, message}`；同步/导入进度改为结构化（退出码 + 末行 JSON）替代 `[OK]/[ERROR]` 关键字解析；线程共享状态加锁；`followup_sync_state` 成功后清理。
5. `fetch_yundocs_full.py`：分块读取超时控制、减少逐单元格回退、失败重试/截图。
6. `write_followup.py`：单线程串行队列（避免并发覆盖）、改 `json.dumps` 传值替代手工引号转义。
7. 测试：`compute_*` 集成测试（`tests/fixtures/` 脱敏样本）+ schema 往返校验测试。
8. 由 `schema.py` 导出 JSON Schema，生成 `frontend/src/types/analysis.ts`（脚本化，纳入 verify）。

交付/验收：`python preprocess_data.py` 产出通过 schema 校验的 `analysis_data.json`；pytest 扩展全绿；server 端 API 手测可用；前端类型文件生成成功。

### Phase B — 前端 Vue 重写

子里程碑（先基建+简单页，后复杂页）：
1. **基建**：Vite+Vue+TS+Pinia+Router+Element Plus+vue-echarts 脚手架；`dataStore`（fetch analysis_data.json）；布局（header / sidebar / 年份·视角 dock）；通用 `<DataTable>`（封装 el-table：列配置/枚举筛选/导出/截断 tooltip）、`<ChartBox>`（vue-echarts + 自定义图例）、`<Modal>`、`api/client.ts`。
2. **看板首页**（打通图表 + 卡片 + 数据流）。
3. **分层 tier 五页**（项目总览/回款节点/回款状态/风险/数据质检，复用 DataTable + 下钻）。
4. **回款台账 / 项目经理视图**。
5. **回款日历**。
6. **临期跟进**（最复杂：CRUD + 云同步轮询）。
7. **数据管理**（同步 SSE / 导入轮询 / 数据质检 / 纳管开关）。
8. **区间对比 / 关于**。

状态：`filterStore`（年份/视角/纳管，替代散落全局 + `CF` 列筛选）、`uiStore`（侧边栏/dock）、`followupStore`。

安全：Vue 模板默认转义，系统性消除 innerHTML 手工转义 XSS。

交付/验收：各页与原功能对齐（功能/展示可按需调整，已获用户许可）；Vitest 单元 + 组件测试；`npm run build` 通过。

### Phase C — 集成 / 打包 / 验证

任务：
1. `server.py` `STATIC_DIR` → `frontend/dist`；删除旧 `app.js/index.html/style.css`。
2. `PaymentReviewApp.spec`：`datas` 打包 `dist/` 整目录 + 必要资源。
3. `init.sh`/`init.bat`：增加 node 依赖安装（`npm ci`）与 `npm run build`。
4. `verify.sh`：增加前端 `typecheck + vitest run + build` 步骤。
5. Playwright 端到端冒烟（页面加载、看板有数、关键交互无报错）。
6. 更新 `CLAUDE.md`/`PROGRESS.md`/`feature_list.json`。

交付/验收：单条 `verify.sh` 覆盖前后端全绿；PyInstaller 产出 exe 可离线启动并展示数据。

## 7. 测试策略

- 后端：现有 41 纯函数测试 + `compute_*` 集成测试（fixtures）+ schema 校验测试。
- 前端：Vitest 单元（纯函数 / composables / store）+ 组件测试（DataTable / 格式化）。
- 端到端：Playwright 冒烟（可选但建议，项目已装 playwright）。
- 闸门：`verify.sh` = py_compile + ruff + pytest +（前端）typecheck + vitest + build。

## 8. 风险与回滚

- **风险**：Vue 全量重写工作量大、周期长。缓解：按页面子里程碑增量验收；后端 Phase A 先行，前端有类型 + 测试护栏。
- **风险**：PyInstaller 打包 SPA 静态资源路径问题。缓解：Phase C 早做一次打包冒烟，验证 `STATIC_DIR`/相对路径。
- **回滚**：老版本已在 git 历史与外部备份，必要时可取回；本次不要求平滑回滚。

## 9. 未决 / 待评审

- 组件库锁定 Element Plus（已确认）；如实测 `el-table` 不满足复杂列筛选，备选 Naive UI `n-data-table`。
- TS 类型是否走 codegen（`json-schema-to-typescript`）vs 手维护——本 spec 采用 codegen，若 CI/构建摩擦过大可降级。
- 是否纳入 Playwright e2e 为强制闸门（本 spec 列为建议）。
- 后端是否拆分 `backend/` 子目录（本 spec 暂保持 Python 文件在根，减少 PyInstaller spec 改动）。
