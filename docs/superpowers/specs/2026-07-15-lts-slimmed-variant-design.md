# LTS 精简变体（`lts/` 自包含副本）—— 设计文档

> 状态：已与用户 brainstorm 定稿（2026-07-15）。下一步：writing-plans。
> 形态：**形态 B —— 在 master 工作树的 `lts/` 子目录放一份「精简版整套可运行副本」**，master 自身代码零改动。
> 版本：`LTS-1.0.0`（`lts/frontend/src/version.ts`，独立计数，与 master 版本脱钩）。

## 1. 背景与目标

master 全功能平台已含项目/回款/商机/概算/倚天工时/门户等多域。需要一个**精简、稳定、长期支持（LTS）**的变体，只保留**核心项目 + 回款跟踪**，供只需核心功能的部署使用。

**用户钦定的形态（4 个决定）**：
1. **删除深度 = 彻底删**（前端 + 后端 + 端点 + 管线 + 数据文件 + 测试）。
2. **`/data` 页保留**，只删其中的**倚天工时域部分**（累积库/合规范围/cookie 卡片）；数据更新、上传、PMIS、标签、门户配置、历史全留。
3. **门户 portal 保留**（首页 Launchpad 展示 + `/data` 配置，均不受影响）。
4. **版本 = 独立 `LTS-1.0.0`**。
5. **产出形态 = `lts/` 子目录整套精简副本**（含 `pmisdata/`），master 代码不动、根 `CLAUDE.md` 仅加一行 LTS 存在标记。

**已知代价（用户已知悉）**：仓库里从此有两份代码（master 全功能 + `lts/` 精简），两边后续各自维护/同步。

## 2. 产出总览

- 新建 `lts/` = 平台精简版整套可运行副本（`cd lts && bash verify.sh` 全绿、可构建部署）。
- `lts/CLAUDE.md` + `lts/README.md` + `lts/deploy/部署手册.md`（**LTS-only，不出现 master / 被删功能字样**）。
- `lts/frontend/src/version.ts` → `LTS-1.0.0`。
- 根 `.gitignore` 增 `lts/` 构建产物/运行数据条目。
- master 根 `CLAUDE.md` 加一行：存在 LTS 精简变体，见 `lts/`（master 唯一改动）。

## 3. 复制进 `lts/` 的内容（可运行所需源）

**复制（保留原相对结构到 `lts/` 下）**：
- 全部后端 `*.py`（顶层）+ `requirements.txt` + `conftest.py`。
- `frontend/`（`src/`、`public/`〈若有〉、`package.json`、`package-lock.json`、`tsconfig*.json`、`vite.config.ts`、`vitest.config.ts`〈若有〉、`index.html`、`.npmrc`/env〈若有〉）。
- `tests/`。
- `pmisdata/`（下载流水线脚本 + `config.json` + `A.xlsx` + 桥接表）。
- `verify.sh`。
- 启停脚本（`*_启动.bat/.command`、`停止服务.py/.bat/.command`、`init.bat/.sh`）。
- 打包脚本 `make_update_zip.py` / `make_deploy_zip.py`、`PaymentReviewApp.spec`、`app_icon.ico` / `app_logo.png` / `fonts/`（供 LTS 独立打包；见 §9 打包适配）。

**不复制**：`node_modules/`、`dist/`、`build/`、真实 `data/`、`input/`、`.git/`、`.claude/`、`.superpowers/`、`docs/`、`release/`、`log/`、`report/`、`__pycache__/`、`yitian-analyze/`、`yitian/`、`yundocs_data/`、`项目数据运营工具/`、`client/`、各 `*.zip`、`demo.html`、`CostBudgetEstimate.html`、`nul`、`oppoboard.pdf`、`feature_list.json`（LTS 不维护该机器清单）、`PROGRESS.md`、根 `CLAUDE.md`（`lts/` 自带新的）。

> `data/`、`input/` 为运行时目录，`lts/` 不带真实业务数据；运行/部署时按 `lts/deploy/部署手册.md` 建立并放入。

## 4. `lts/` 内彻底删除的域（前端 + 后端 + 端点 + 管线 + 测试）

复制完成后，在 `lts/` 内删除以下文件并编辑共享文件去引用（master 侧全部保持不动）。

### 4.1 商机域
- 前端：`views/{OpportunitiesView,OpportunitiesBoardView,OpportunityFollowupView}.vue`（+ `.test.ts`）；`components/OpportunityEditDrawer.vue`（+test）；`lib/{opportunitiesApi,opportunityBoard,opportunityColumns,opportunityFollowup,opportunityFollowupApi,opportunityScope}.ts`（+各 test）；`stores/{opportunities,opportunityFollowup}.ts`（+test）。
- 后端：`opportunities.py`、`opportunity_followup.py`（+ `tests/test_opportunit*`、`tests/test_*opportunity*`）。
- 端点（`server.py`）：`/api/opportunities/*`、`/api/opportunity-followup/*` 及其 handler、文件常量、`data/opportunities.json`·`opportunity_followup` 读写。

### 4.2 倚天工时域
- 前端：`views/Yitian{Overview,Compliance,Analytics,Trend,Customer}View.vue`（+test）；`components/{YitianToolbar,YitianScopeCard,YitianStoreCard}.vue`（+test）；`lib/yitian/*`（calendar/compliance/customer/drill/metrics + test）；`lib/yitianApi.ts`；`stores/{yitian,yitianView,yitianSettings}.ts`（+test）；`types/yitian.ts`。
- 后端：`yitian.py`、`yitian_calendar.py`、`yitian_check.py`、`yitian_rules.py`、`yitian_settings.py`、`yitian_store.py`、`yitian_config.py`（+ `tests/test_yitian*`）。
- 端点/管线：`server.py` 的 `/api/yitian/*`、`_rebuild_yitian_data`、`_load_yitian_cached`、`YITIAN_STORE_FILE`、`_YITIAN_PAGE_KEYS`、clear-data 的倚天分支；`preprocess_data.py` 倚天摄取/构建段（`yitian_mod.ingest`/`build_yitian_data`，约 296–321）；`schema.py` 倚天模型 + `validate_and_write_yitian_json`；`data_scope.py` 倚天键；`config.py` 倚天常量；`input/yitian/`（不复制，无需删）。
- `/data`（保留页）：`views/DataView.vue` 移除 `YitianScopeCard`/`YitianStoreCard`/倚天上传块/`onFetchYitianCookie`/`loadYitianStatus`；`lib/cookieAgent.ts` 的 `fetchYitianCookie`；`composables/useInputFiles.ts` 的 `YITIAN_FILE_NAMES` 过滤。

### 4.3 概算工具域
- 前端：`views/BudgetView.vue`（+test）；`components/budget/*`（10+ 组件 + test）；`lib/budget/*`（calc/crmText/exportEstimate/salesOrder/status/types + test）；`lib/budgetApi.ts`；`stores/{budget,budgetConfig}.ts`（+test）。
- 后端：`budget_config.py`、`budget_store.py`（+ `tests/test_budget*`）。
- 端点：`server.py` 的 `/api/budget/*` 及 handler、`_SUPER_ONLY_PATHS` 中的 budget 写路径、`data/budget_*.json` 读写。

### 4.4 重点项目进展 `/projects/key`
- 前端：`views/KeyProjectsView.vue`（+test）；`lib/keyProjects.ts`（+test）、`lib/projectProgressApi.ts`；`stores/projectProgress.ts`（+test）。
- 后端：`server.py` 的 `/api/progress/*`（handle_progress_*）、`PROGRESS_FILE`、`data/project_progress.json` 读写、load 播种。

### 4.5 临时重点跟进 `/projects/temp`
- 前端：`views/TempFollowupView.vue`（+test）；`lib/{tempFollowup,tempScope,tempFollowupApi}.ts`（+test）；`stores/tempFollowup.ts`（+test）。
- 后端：`temp_followup.py`（+ `tests/test_temp*`）；`server.py` 的 `/api/temp-followup/*`、文件常量、读写。

### 4.6 风险跟进 `/risk`
- 前端：`views/RiskFollowupView.vue`（+test）；`lib/{riskRows,riskFollowupApi}.ts`（+test）；`stores/riskFollowup.ts`。
- 后端：`risk_followup.py`（+ `tests/test_risk*`）；`server.py` 的 `/api/risk-followup/*`、文件常量、读写。

### 4.7 回款重点跟进 `/payment/key`
- 前端：`views/PaymentKeyFollowupView.vue`（+test）；`lib/{paymentKeyFollowup,paymentKeyFollowupApi}.ts`（+test）；`stores/paymentKeyFollowup.ts`（+test）。
- 后端：`payment_key_followup.py`（+ `tests/test_payment_key*`）；`server.py` 的 `/api/payment-key-followup/*`、文件常量、读写。

### 4.8 共享底座
- `followup_store.py`（+ `tests/test_*followup_store*`）：仅被 §4.1/4.5/4.6/4.7 四个跟进域消费，一并删。
- `components/ScopeBuilder.vue`（+test）：仅被上述跟进域使用；确认无保留页消费后删（计划核实）。

## 5. `lts/` 内编辑的共享文件（去悬挂引用）

| 文件 | 编辑 |
|---|---|
| `frontend/src/router/index.ts` | 删 13 条被移除路由 + 对应 import；保留 catch-all（已删路径落总览）；不留 redirect |
| `frontend/src/nav.ts` | 删 `KEY_FOLLOWUP_LINKS`、`YITIAN_LINKS` 两组；`PROJECT_LINKS`/`ANALYSIS_LINKS`/`PAYMENT_LINKS`/`TOOL_LINKS` 内删 projects-key/temp、opportunities-board、payment-key、budget 等项 |
| `frontend/src/layout/AppSidebar.vue` | 随 nav 组变更清理（若硬引用了删除的组/项） |
| `frontend/src/lib/pageAccess.ts` | `PageKey` 联合类型删 13 个已删 key；`PAGE_OPTIONS` 随 nav 自动收敛；核对 `firstAllowedPath` 不指向已删页 |
| `server.py` | 删 §4 各域端点 dispatch + handler + 文件常量 + 读写 + 播种 + 倚天管线钩子 + clear-data 分支 + `_SUPER_ONLY_PATHS`/`_YITIAN_PAGE_KEYS` 相关 |
| `preprocess_data.py` | 删倚天摄取/构建段（约 296–321）+ `import yitian` |
| `schema.py` | 删倚天模型 + `validate_and_write_yitian_json` |
| `data_scope.py` | 删倚天相关键处理 |
| `config.py` | 删倚天常量 |
| `frontend/src/views/DataView.vue` | 去倚天卡片/上传/cookie（§4.2） |
| `frontend/src/composables/useInputFiles.ts` | 去 `YITIAN_FILE_NAMES` |
| `frontend/src/lib/cookieAgent.ts` | 去 `fetchYitianCookie` |
| 总览首页 `views/OverviewView.vue`、`views/DataQualityView.vue`（治理）等保留页 | grep 清理对已删域（商机/倚天/概算/各 followup）的悬挂 import 与引用 |
| `audit.py` | 删已删域的 `_ACTION_MAP` 埋点项（budget/yitian/opportunity/各 followup） |

> **保留域**：登录/改密、总览首页（含门户）、项目（在建/详情/已关闭/详情/动态/分析 insight+里程碑+成本+风险看板+回款看板+日历）、回款（总览/项目/节点）、数据治理、账号管理、关于、`/data`（去倚天部分）。

## 6. `.gitignore`（根，master 侧）

追加，防 `lts/` 构建产物与运行数据入库：
```
lts/frontend/node_modules/
lts/frontend/dist/
lts/data/
lts/input/
lts/release/
lts/build/
lts/**/__pycache__/
```

## 7. `lts/` 文档（LTS-only）

- **`lts/CLAUDE.md`**：仿 master CLAUDE.md 结构（指令层 + 数据血缘 + 模块表 + 约定 + 验证），但**只写 LTS 保留域**（项目/回款/治理/门户/数据管理），数据血缘去掉倚天脉络与商机/概算/跟进模块，模块表只列保留的后端 py。不提 master、不提被删功能。
- **`lts/README.md`**：这个精简平台是什么、能装/能跑（`python server.py` + `cd frontend && npm install/build`）、功能清单（仅保留项）、更新数据方式（`/data`「更新数据」）。
- **`lts/deploy/部署手册.md`**：全新独立部署步骤（Ubuntu /pm + nginx + systemd，或本地/exe），不引用 master 手册。

## 8. master 侧改动（唯一）

根 `CLAUDE.md` 在 §1 或顶部加一行标记：存在 LTS 精简变体（`lts/`，版本 `LTS-1.0.0`，保留核心项目+回款、去商机/倚天/概算/重点跟进），其架构见 `lts/CLAUDE.md`。**master 其余零改动、代码零改动。**

## 9. 打包适配（LTS 独立打包，plan 处理）

- `make_update_zip.py` / `make_deploy_zip.py` 用 `glob('*.py')` 纳入后端，**自动适配**已删模块（少了就少打），版本取自 `version.ts`（→ `LTS-1.0.0`）。
- `PaymentReviewApp.spec`（PyInstaller）若硬编码 hiddenimports 含已删模块，需在 `lts/` 内删对应项（plan 核对）。
- LTS 打包产物命名随 `LTS-1.0.0`。

## 10. 验证

- `cd lts && bash verify.sh` 全绿：
  - 后端 `python -m compileall` + `ruff` + `pytest`（无对已删模块的 import/引用；删测试后无残留）。
  - 前端 `npm install`（首次）+ `typecheck`（无悬挂 import）+ `vitest`（删测试后无残留引用）+ `build`（无未解析模块）。
- 冒烟：`cd lts && python server.py` 起服务，保留页均可加载、登录落地正常、`/data` 无倚天部分其余正常、门户展示正常。
- master 侧不回归：master 代码零改动，根 `CLAUDE.md` 加标记不影响运行。

## 11. 涉及范围小结

- **新增**：`lts/`（整套精简副本 + 3 文档）。
- **master 改**：根 `.gitignore`（加 lts 忽略）、根 `CLAUDE.md`（加标记）。**master 代码零改动。**
- **不改**：master 的任何 `*.py` / `frontend/src` / 现有功能。

## 12. 执行方式

writing-plans 后用 subagent-driven-development。天然分阶段：① 脚手架（复制 + 删文件 + gitignore）→ ② 共享文件去引用（前端 router/nav/pageAccess/DataView 等 + 后端 server/preprocess/schema/config/data_scope/audit，可按前后端并行）→ ③ 文档（lts CLAUDE/README/部署手册 + master 标记）→ ④ `cd lts && verify.sh` 全绿 + 冒烟。控制者串行审查提交 + opus 终审。
