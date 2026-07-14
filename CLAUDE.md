# CLAUDE.md — 项目管理平台

> 本文件是 AI 代理在本仓库工作的**指令层**（harness: Instructions）。
> 每次开始任务前先读本文件 + `PROGRESS.md`；完成后按"验证"一节跑 `verify.sh`，并更新 `PROGRESS.md`。
> 本项目使用 Claude Code，**以本文件为唯一代理指令入口**（不另设 AGENTS.md，避免多份说明漂移）。

## 1. 这是什么

一个**单机/内网离线**运行的项目管理与回款（收款）跟踪看板。后端是纯 Python 标准库的本地 HTTP 服务（`server.py`），前端是 `frontend/` 下的 **Vue3 + Vite + TS + Pinia + Element Plus + ECharts**（旧原生 JS 前端 app.js/index.html/analysis_data.js 已退役删除；后端输出 `data/analysis_data.json`）。数据来源 = PMIS 导出 + CSV，经页面上传或本地放置进入 `input/`（PMIS 9 表放 `input/pmis/`，收款阶段/回款流水/预算等 CSV 放 `input/`），`组织架构.xlsx` 决定项目花名册，`A.xlsx` 售前↔原项目映射；点「更新数据」（`/api/reprocess`）生效。可用 PyInstaller 打包成单 exe 分发。

- 当前版本：见 `frontend/src/version.ts`（撰写时 **V1.15.0**；单一来源，改版本只改此处，本文件不逐版同步）；版本史/各期结论见 `PROGRESS.md`
- 产品名称：**项目管理平台**（2026-06-12 起；桌面快捷方式/.vbs/.bat/exe 文件名仍为旧名「项目回款跟踪与管控平台」，随下次打包专项更名）
- 访问地址：`http://localhost:8080`
- 交流语言：**简体中文**

## 2. 架构地图（按数据流）

```
PMIS 9 表(input/pmis/*.xlsx) ┐
组织架构.xlsx / A.xlsx(售前映射) │
收款阶段 collection_stages.csv  ├─ preprocess_data.py(各域解析+计算+快照diff)
回款流水 payment_records.csv    │     模块: pmis/projects/collection_stages/
预算 profit_loss_*/budget/delivery┘           milestones/profit/snapshots
                                                     │
                                                     v
                                   data/analysis_data.json  (前端唯一数据源, 经 schema 校验)
                                                     │  fetch('/data/analysis_data.json')
                                                     v
   frontend/ Vue3+Vite+TS (router / views / components / lib(纯计算口径) / stores / charts) + ECharts + xlsx
                                                     ▲
        server.py(本地HTTP: 静态 + /data + /api/*) ┘
```

| 文件/目录 | 职责 |
|---|---|
| `server.py` | 本地 HTTP：静态 + `/data` + `/api/reprocess`(更新数据,SSE) / `/api/inputs/upload`(文件上传) / `/api/pmis/upload`(PMIS 包上传) / `/api/files/status`(文件状态) / `/api/clear-data` / `/api/followup/*` / `/api/tags` / `/api/manual/*` / 历史回滚 / `/api/stop` |
| `preprocess_data.py` | **核心管线**：摄取各源→项目主域/回款/健康/治理指标→`data/analysis_data.json`（经 schema 校验）；末段 9f 系统核心口径回款回填 |
| `pmis.py` / `projects.py` / `collection_stages.py` / `milestones.py` / `profit.py` | 各数据域解析：PMIS 项目域 / 主域 join / 收款阶段节点 / 里程碑 / 预算流水 |
| `schema.py` | pydantic 数据契约 + 导出 JSON Schema 供前端 `npm run gen:types` |
| `snapshots.py` | 快照 diff → 事件流/周期对比（项目动态） |
| `data_history.py` / `manual_history.py` / `manual_import.py` | 数据历史快照回滚 / 人工数据备份与导入 |
| `budget_config.py` / `budget_store.py` | 概算工具:费率与目录配置(超管可配) / 报价存档(按账号隔离 + 费率快照) |
| `frontend/` | Vue3 前端：`router/`(路由) `views/`(页面) `components/` `lib/`(纯计算口径) `stores/`(Pinia) `charts/` `styles/theme.css`(设计令牌单一落地) |
| `data/followup_records.json` / `data/project_tags.json` | 本地跟进记录 / 项目标签持久化 |
| `input/` | 数据源输入（PMIS xlsx + CSV），经页面上传或本地放置；点「更新数据」生效 |
| `停止服务.py/.bat/.command`、`*_启动.bat/.command` | 启停脚本（Windows / macOS） |

## 3. 运行 / 调试

```bash
# 开发模式启动（需 Python 3.8+）
python server.py            # 自动开浏览器，监听 8080
python server.py --stop     # 停止运行中的服务
```

- 数据更新走页面上传（`/api/inputs/upload` / `/api/pmis/upload`）或本地放置文件到 `input/` 与 `input/pmis/`，再点「更新数据」（`/api/reprocess`，SSE 流式进度）。
- 无 WPS/在线下载/Playwright 依赖（已于 V1.16.2 彻底移除）。

## 前端（Vue3 + Vite，frontend/）
- 安装：`cd frontend && npm install`
- 开发：先 `python server.py`(:8080) 提供 /api 与 /data，再 `cd frontend && npm run dev`(:5173，已代理 /api、/data)
- 类型同源：改了 `schema.py` 后运行 `cd frontend && npm run gen:types` 重新生成 `src/types/analysis.ts`
- 测试/构建：`npm run test:run` / `npm run typecheck` / `npm run build`（dist/ 由 Phase C 接入 server.py 与打包）

## 4. 关键约定（违反会被用户打回，来源：`.clinerules/memories.md`）

- **不使用任何 emoji** 装饰；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- 跟进类型术语用"**邮件推动**"（不是"邮件催收"）。
- 跟进记录表单只保留 `记录编号 / 项目编号 / 项目名称` 三个只读字段，**不要**金额区间(amountTier)字段（前后端都不传）。
- 云同步操作必须有**明确进度反馈**，不能让用户对成功与否无感知。
- **版本策略（2026-06-12 起，用户钦定）**：三位版本 `VX.Y.Z`——X（大版本）调整**须用户确认**；Y=整页级调整（新增页面/整页重设计）；Z=子页面、下钻页、页内局部调整。单一来源 `frontend/src/version.ts`，改版本只改此处。
- 前端样式改动倾向于补充 CSS 完善表现，而非引入框架。

### 回款口径约定（2026-06-19 起，V1.15.0；改任一处先全仓核对）
- **回款达成率/完成率全站统一口径 = Σ流水净额 ÷ Σ合同总额**。分子=`payment_records` 流水（逐笔严格全加、**含负值/红冲、不取绝对值**）；分母=`paymentPmis.contract`（合同总额，售前回退原项目）。合同≤0 → 比率 `null`（前端显 "-"）。后端项目级 `payment.paymentRatio` 由 9f 用 `payment_ratio_from_records(流水, 合同)` 设置（`aggregate_payment_pmis` 自身 paymentRatio=None）；前端各聚合 rate 分母均为 Σ合同。**例外（已记技术债）**：`/insight` 项目分析的"回款完成率"仍用 节点已收/PMIS合同总额，与主口径不同源。
- **回款数据核心源 = `input/collection_stages.csv`**（PMIS 收款阶段台账导出，已入"数据更新"流程）。售前项目收款阶段节点**按本项目号优先取、缺再回退原项目号**（`_collection_nodes_for`）；台账把售前节点挂在本项目号下。
- **异常项目（`orgL4` 空）排除出回款统计**（`lib/anomaly.isAnomalous`）：回款看板硬排除、治理页告警、项目清单标「数据异常」。
- **回款节点只为在建主域（`dept_projects`=PMIS 在建∩组织架构交付三部）及售前原项目构建**；已关闭/域外项目的收款阶段不进在建回款看板（设计边界，非缺陷）。
- **回款子域路由**：`/payment`(总览) + `/payment/{board,projects,nodes,plan,risk}`（V1.13.0 由旧 `/panalysis` 拆分；旧路径仍 redirect 兼容）。
- **日期区间口径（V1.11.0）**：FilterBar 起止日期，计划侧按节点 planDate∈区间、已回款按流水到账日∈区间；"全部"区间≡全时口径（回归安全网）。

### 概算工具口径（2026-07-13 起，V3.1.0）
- **成本比例 = 销售下单金额（含税）÷ 项目金额**，即 `总成本 × (1 + 毛利率) ÷ (项目金额万元 × 10000)`。原工具此处**漏乘 `(1 + 毛利率)`**（页面文案对、代码错），V3.1.0 已修正 —— 同一份报价的比例比原工具高约 13%（选 6% 档时高 6%），**旧口径落在 13.28%~15% 的报价会翻成「偏高」并强制填异常说明**。
- **物料单价与毛利率解耦**：单价只有一套，毛利率只作为 `(1 + margin)` 的乘数（原工具选 6% 时会静默回退用 13% 的单价表）。
- **费率快照**：每条存档冻结当时的完整费率配置；打开旧档用它自己的快照算 —— **报价是要拿去 CRM 上单的对外产物，必须可复现**。改费率不会改写历史报价。
- 费率/系数/阈值/产品目录/服务目录/物料/PM阶段模板**全部超管可配**（`data/budget_config.json`，`/budget` 页内抽屉），改完立即生效、**无需点「更新数据」**（本域不进数据管线）。

## 设计底层规范（展示形式）

> 约束**展示形式**(配色/排版/间距/卡片/圆角/阴影/动效/密度)，不规定展示内容。
> 令牌落地于 `frontend/src/styles/theme.css`(CSS 唯一落地)与 `frontend/src/charts/echartsTheme.ts`(canvas 同源桥接，契约测试强制一致)；页面只准引用令牌，**不准手写散值**。
> 完整取值表见 `docs/superpowers/specs/2026-06-10-design-foundation-design.md`。

- **配色**：以钦定品牌色板为唯一来源(蓝色系做基调,`--accent` 浅 `#0D3A69`/暗 `#7891AC`)，light/dark 两套；结构灰阶由 4 个黑白中性色(柔纸白/米白/炭黑/深海石)明度·透明度派生,全站不引入第 16 个色号。**结构色与状态色分离**：状态语义色固定(已回款 `--ok #6ECC54` / 待回款 `--warn #F9D46C` / 风险延期 `--danger #C8161D` / 可提前 `--c-advance` 浅 青绿`#018B8D`/暗 蓝绿`#71E2D1`)，不随基调变。图表分类用 `--chart-1..8`，表达回款状态的图表系列必须用状态色。
- **状态三态**：带文字的状态标识一律「淡底+深字」(`--ok-bg`+`--ok-text` 等，warn/danger/urgent/advance 同构)；实底 100% 状态色只用于无文字色块；禁止实底+小号白字。
- **8pt grid**：间距只取 `--sp-1..7`(4/8/12/16/24/32/48)，4px 仅内联半步。
- **排版严格层级**：六级 `--fs-1..6`(12/14/16/19/25/34 @16基准)，每级字号·字重·色锁定，不混用。
- **三档字号**：`--fs-base` 小16 / 中18(默认) / 大20（2026-06-15 三档统一+2），六级按 rem 整体缩放。
- **card 1 主 2 辅**：一卡 1 主信息(`--fs-6`/`--fs-5`，700，`--txt`)+ 最多 2 辅信息(`--fs-2`/`--fs-1`，`--sub`/`--mut`)；禁止一卡两个 700 大号主值。
- **统一卡片**：内边距 `--card-pad 20` / 卡间距 `--gap-card 16` / 卡内堆叠 `--gap-stack 12` / 区块 `--gap-section 24`。
- **圆角**：`--r-sm 6` / `--r-md 10` / `--r-lg 14` / `--r-full 999`。
- **阴影最多两层**：仅 `--shadow-1`(静置) / `--shadow-2`(悬浮)，每级 ≤2 层投影；扁平元素用边框，不加第三种阴影。
- **可访问性护栏**：muted 蓝/紫(`--accent`/`--accent2`/`--highlight`)不用于小号正文，仅用于大号粗体/图标/填充/图表/边框；小号文字用 `--txt`/`--sub`。
- **交互状态**：自绘交互件五态齐全(default/hover/selected/disabled/focus)，hover 用 `--hover-tint`、选中用 `--selected-tint`、禁用用 `--disabled-opacity .45`，focus 用全局 `:focus-visible` 规则。
- **动效**：时长只用 `--dur-1 120ms`(状态反馈)/`--dur-2 200ms`(展开浮层)，缓动 `--ease`，尊重 `prefers-reduced-motion`。
- **表格密度**：单元格内边距纵 8 横 12，行高随字号档缩放，不另设密度开关。
- **数字排版**：金额/百分比/KPI/表格数字列必须挂 `.u-num`(tabular-nums)；行高三档 `--lh-tight 1.15`/`--lh-dense 1.4`/`--lh-base 1.6`；大写+字距(`--ls-wide`)仅限拉丁/数字标签，中文不大写不加字距。
- **字体**：`--font-sans` 系统栈(无 Inter)，body 与 ECharts 同源；前端**禁止外链字体**。
- **z-index**：自绘浮层只用 `--z-sticky 100`/`--z-panel 1500`/`--z-toast 4000` 三级，弹窗抽屉优先用 Element Plus；禁止散写数字。
- **断点**：窄屏 `<=768px` / 常规 `<=1200px`(文档常量，优先靠 `.u-grid-auto` 自动换列少写断点)。

## 5. ⚠️ 最易踩坑：打包模式 vs 开发模式

`server.py` / 各脚本里大量 `if getattr(sys, 'frozen', False):` 分支，**两套代码路径必须同时维护**：
- **开发模式**：用 `subprocess` 调子脚本，可解析 `[OK]/[INFO]/[WARN]/[ERROR]` 进度。
- **打包模式(frozen)**：目标机无 Python，改为 `_run_script_direct()` 进程内 `importlib` 直接执行；路径基于 `sys._MEIPASS`(静态) 与 `sys.executable` 目录(数据)。

改任何"调用脚本/读写文件路径"的逻辑时，**两条分支都要改**，否则 exe 版会坏而本地测不出来。

## 6. 验证（harness: Verification — 声称完成前必须执行）

```bash
bash verify.sh          # 语法编译 + ruff + pytest + 前端 typecheck/vitest/build，全绿才算 done
# 或单独跑：
python -m pytest -q
```

- `preprocess_data.py` 的纯函数（金额/日期/比例解析）有 pytest 覆盖，见 `tests/`。
- 改了 `preprocess_data.py` 的计算逻辑，**先补/改测试再改实现**。
- 改了前端，至少手动启动一次（`python server.py` + `cd frontend && npm run dev`）确认相关页面能加载、无 console 报错；改口径/数据层时用真实数据冒烟核对关键指标（如回款达成率落在合理区间）。

## 7. 范围与完成定义（harness: Scope）

- **一次只做一个功能/修复**；动手前在 `PROGRESS.md` 标 `in_progress`。
- "完成"= 代码改完 **且** `verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
- 已知技术债与待办集中在 `PROGRESS.md`，不要顺手扩大改动面。

## 8. 已知重大技术债（详见 PROGRESS.md backlog）

- `server.py` 用单线程 `HTTPServer`，同步/更新 SSE 期间会阻塞全站（含"停止"）。
- 服务绑定 `("", 8080)` = 所有网卡，无认证。
- `data/analysis_data.json` 全量 fetch（~2MB），前端一次性加载；vite 构建产物单 chunk >500KB（未做代码分割）。
- `/insight` 项目分析"回款完成率"口径（节点已收/PMIS合同）与主域口径（流水/合同）不同源，待归并统一。
- `collection_stages.csv` 导出端覆盖风险：导出脚本若漏在建项目则其回款节点静默缺失（无校验告警）——建议加"在建项目收款阶段覆盖率"治理告警。
