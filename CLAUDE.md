# CLAUDE.md — 项目回款跟踪与管控平台

> 本文件是 AI 代理在本仓库工作的**指令层**（harness: Instructions）。
> 每次开始任务前先读本文件 + `PROGRESS.md`；完成后按"验证"一节跑 `verify.sh`，并更新 `PROGRESS.md`。
> 本项目使用 Claude Code，**以本文件为唯一代理指令入口**（不另设 AGENTS.md，避免多份说明漂移）。

## 1. 这是什么

> ⚠️ 重写进行中：前端正由原生 JS 迁移到 `frontend/` 下的 Vue3+Vite+TS（见"前端"节与 PROGRESS.md Phase B）。下方第 1-2 节对旧前端（app.js/analysis_data.js）的描述将在 Phase C 旧版删除后更新；后端数据现已输出 `data/analysis_data.json`（非 .js）。

一个**单机/内网离线**运行的项目回款（收款）跟踪看板工具。后端是纯 Python 标准库的本地 HTTP 服务，前端是原生 HTML/CSS/JS（无构建工具），数据源是 WPS 云文档。可用 PyInstaller 打包成单 exe 分发。

- 当前版本：**V5.9.1**（版本号见 `app.js`，改版本须同步更新，见"约定"）
- 访问地址：`http://localhost:8080`
- 交流语言：**简体中文**

## 2. 架构地图（按数据流）

```
WPS云文档 ──fetch_yundocs_full.py(Playwright抓取)──> yundocs_data/*.json,*.csv
                                                          │
                                          preprocess_data.py(清洗+计算指标)
                                                          │
                                                          v
                                              data/analysis_data.js   (前端唯一数据源, ~2.2MB)
                                                          │  <script> 注入全局 ANALYSIS_DATA
                                                          v
   index.html ──> app.js(全部前端逻辑, ~7900行) + lib/echarts + lib/xlsx
                                                          ▲
                              server.py(本地HTTP: 静态服务 + /api/*) ┘
```

| 文件 | 职责 |
|---|---|
| `server.py` | 本地 HTTP 服务：静态文件 + `/api/sync`(SSE) / `/api/import` / `/api/clear-data` / `/api/followup/*` / `/api/stop` |
| `fetch_yundocs_full.py` | 用 Playwright 打开 WPS 云文档，抓取各 Sheet → `yundocs_data/` |
| `preprocess_data.py` | **核心算法**：解析金额/日期/比例，计算看板/分层/分类指标 → `data/analysis_data.js` |
| `write_followup.py` | 把本地跟进记录回写到 WPS 云文档 |
| `app.js` | 前端全部逻辑（看板、日历、台账、跟进、图表、数据管理…），函数挂 `window`，靠内联 `onclick` 调用 |
| `data/followup_records.json` | 本地跟进记录持久化 |
| `停止服务.py/.bat/.command`、`*_启动.bat/.command` | 启停脚本（Windows / macOS） |

## 3. 运行 / 调试

```bash
# 开发模式启动（需 Python 3.8+；同步功能需 playwright + 浏览器）
python server.py            # 自动开浏览器，监听 8080
python server.py --stop     # 停止运行中的服务

# 同步功能依赖（首次）
pip install playwright && playwright install chromium
```

- 同步走 `/api/sync`（SSE 流式进度）；离线导入走 `/api/import`（上传从云文档导出的 xlsx）。
- 两者**互斥**，不能同时进行。

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
- 版本号需在 `app.js` 与展示处保持一致；改动功能时同步更新（详见 `PROGRESS.md` 的"版本"段）。
- 前端样式改动倾向于补充 CSS 完善表现，而非引入框架。

## 设计底层规范（展示形式）

> 约束**展示形式**(配色/排版/间距/卡片/圆角/阴影/动效/密度)，不规定展示内容。
> 令牌唯一落地于 `frontend/src/styles/theme.css`；页面只准引用令牌，**不准手写散值**。
> 完整取值表见 `docs/superpowers/specs/2026-06-10-design-foundation-design.md`。

- **配色**：蓝色系做基调(`--accent` 浅 `#325969`/暗 `#6C8FA9`)，light/dark 两套。**结构色与状态色分离**：状态语义色固定(已回款 `--ok #4E9A7C` / 待回款 `--warn #E0A23B` / 风险延期 `--danger #D24D5C`)，不随基调变。图表分类用 `--chart-1..8`。
- **8pt grid**：间距只取 `--sp-1..7`(4/8/12/16/24/32/48)，4px 仅内联半步。
- **排版严格层级**：六级 `--fs-1..6`(12/14/16/19/25/34 @中)，每级字号·字重·色锁定，不混用。
- **三档字号**：`--fs-base` 小14 / 中16(默认) / 大18，六级按 rem 整体缩放。
- **card 1 主 2 辅**：一卡 1 主信息(`--fs-6`/`--fs-5`，700，`--txt`)+ 最多 2 辅信息(`--fs-2`/`--fs-1`，`--sub`/`--mut`)；禁止一卡两个 700 大号主值。
- **统一卡片**：内边距 `--card-pad 20` / 卡间距 `--gap-card 16` / 卡内堆叠 `--gap-stack 12` / 区块 `--gap-section 24`。
- **圆角**：`--r-sm 6` / `--r-md 10` / `--r-lg 14` / `--r-full 999`。
- **阴影最多两层**：仅 `--shadow-1`(静置) / `--shadow-2`(悬浮)，每级 ≤2 层投影；扁平元素用边框，不加第三种阴影。
- **可访问性护栏**：muted 蓝/紫(`--accent`/`--accent2`/`--highlight`)不用于小号正文，仅用于大号粗体/图标/填充/图表/边框；小号文字用 `--txt`/`--sub`。
- **动效**：时长只用 `--dur-1 120ms`(状态反馈)/`--dur-2 200ms`(展开浮层)，缓动 `--ease`，尊重 `prefers-reduced-motion`。
- **表格密度**：单元格内边距纵 8 横 12，行高随字号档缩放，不另设密度开关。

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
- 改了前端，至少手动启动一次确认看板能加载、无 JS 报错（页面右下角会红条显示 `window.onerror`）。

## 7. 范围与完成定义（harness: Scope）

- **一次只做一个功能/修复**；动手前在 `PROGRESS.md` 标 `in_progress`。
- "完成"= 代码改完 **且** `verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
- 已知技术债与待办集中在 `PROGRESS.md`，不要顺手扩大改动面。

## 8. 已知重大技术债（详见 PROGRESS.md backlog）

- `server.py` 用单线程 `HTTPServer`，同步 SSE 期间会阻塞全站（含"停止同步"）。
- 服务绑定 `("", 8080)` = 所有网卡，无认证。
- `app.js` 7900 行单文件 + 140 处 innerHTML 拼接；`analysis_data.js` 以 `<script>` 全量加载。
- `index.html` 离线工具却外链 Google Fonts。
