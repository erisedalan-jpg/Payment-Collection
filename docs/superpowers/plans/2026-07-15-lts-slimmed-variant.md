# LTS 精简变体（`lts/` 自包含副本）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 master 工作树的 `lts/` 子目录产出一份「精简版整套可运行副本」（版本 `LTS-1.0.0`），彻底删除 7 个域，只保留核心项目+回款，master 代码零改动。

**Architecture:** 复制源树到 `lts/` → 删除被移除域的文件 → 编辑共享文件去悬挂引用（前端各文件簇 / 后端各文件簇可并行）→ 写 LTS 文档（CLAUDE/README/两部署手册）+ master 加 LTS 标记 → `cd lts && verify.sh` 全绿。

**Tech Stack:** Python 标准库 + pydantic（后端）；Vue3 + Vite + TS + Element Plus + vitest（前端）。

## Global Constraints

- **形态 B**：`lts/` 是自包含精简副本；**master 代码零改动**，唯一例外是根 `.gitignore`（加 lts 忽略）+ 根 `CLAUDE.md`（加 LTS 标记）。
- **版本 `LTS-1.0.0`**：`lts/frontend/src/version.ts`（`APP_VERSION='LTS-1.0.0'`、`RELEASE_DATE='2026-07-15'`）。
- **彻底删 7 域 + `followup_store`**：商机(/opportunities+board+key)、倚天工时(/yitian×5 + 后端 7 模块+管线+schema)、概算(/budget)、重点项目进展(/projects/key,/api/progress)、临时跟进(/projects/temp)、风险跟进(/risk)、回款重点跟进(/payment/key)。
- **`/data` 保留**，仅去倚天卡片（`YitianScopeCard`/`YitianStoreCard`/倚天上传/cookie）；**门户 portal 保留**。
- **移除路由不留 redirect**（catch-all 落总览）。
- **`lts/` 文档 LTS-only**：不出现 master / 被删功能字样；两部署手册（**本地部署验证** + **服务器部署**〈环境同 master：Ubuntu /pm + nginx:80 + systemd + `/opt/pmplatform`〉）。
- **不使用任何 emoji**；符号用 → ↓ ❌ ✕ ▾。
- **验证**：`cd lts && bash verify.sh` 全绿（后端 compileall+ruff+pytest 无已删引用；前端 typecheck/vitest/build 无悬挂 import）+ 冒烟保留页。
- 本计划任务多为**删除/去引用**（非 TDD 新增）：每任务的"测试"= 残留 grep 归零 + 该层合并编译/套件绿（控制者跑）。

## 被删除文件清单（Task 1 用）

**后端顶层 `*.py`（在 `lts/` 内删）**：`opportunities.py`、`opportunity_followup.py`、`temp_followup.py`、`risk_followup.py`、`payment_key_followup.py`、`followup_store.py`、`yitian.py`、`yitian_calendar.py`、`yitian_check.py`、`yitian_rules.py`、`yitian_settings.py`、`yitian_store.py`、`yitian_config.py`、`budget_config.py`、`budget_store.py`。

**后端测试（`lts/tests/` 内删）**：`test_opportunit*`、`test_opportunity*`、`test_temp*`、`test_risk*`（风险跟进相关，注意别误删保留的风险看板/主域测试 —— 按 grep 内容确认）、`test_payment_key*`、`test_followup_store*`、`test_yitian*`、`test_budget*`。

**前端 views（`lts/frontend/src/views/` 内删，含各 `.test.ts`）**：`OpportunitiesView`、`OpportunitiesBoardView`、`OpportunityFollowupView`、`KeyProjectsView`、`TempFollowupView`、`RiskFollowupView`、`PaymentKeyFollowupView`、`YitianOverviewView`、`YitianComplianceView`、`YitianAnalyticsView`、`YitianTrendView`、`YitianCustomerView`、`BudgetView`。

**前端 lib（含 `.test.ts`）**：`opportunitiesApi`、`opportunityBoard`、`opportunityColumns`、`opportunityFollowup`、`opportunityFollowupApi`、`opportunityScope`、`keyProjects`、`projectProgressApi`、`tempFollowup`、`tempScope`、`tempFollowupApi`、`riskRows`、`riskFollowupApi`、`paymentKeyFollowup`、`paymentKeyFollowupApi`、`budgetApi`、`lib/yitian/*`（整目录）、`lib/budget/*`（整目录）。

**前端 stores（含 `.test.ts`）**：`opportunities`、`opportunityFollowup`、`projectProgress`、`tempFollowup`、`riskFollowup`、`paymentKeyFollowup`、`yitian`、`yitianView`、`yitianSettings`、`budget`、`budgetConfig`。

**前端 components（含 `.test.ts`）**：`OpportunityEditDrawer`、`YitianToolbar`、`YitianScopeCard`、`YitianStoreCard`、`ScopeBuilder`、`components/budget/*`（整目录）。

**前端 types**：`types/yitian.ts`。

---

### Task 1: 脚手架 —— 复制源树到 `lts/` + 删除被移除文件 + 版本 + gitignore

**Files:**
- Create: `lts/`（整棵精简副本）
- Modify: `.gitignore`（根，加 lts 忽略）
- Set: `lts/frontend/src/version.ts`

- [ ] **Step 1: 复制源树到 `lts/`（排除 node_modules/dist 等）**

在仓库根运行（Git Bash）：
```bash
mkdir -p lts
# 后端顶层 py + 依赖 + 验证 + 打包脚本 + 图标/spec
cp *.py requirements.txt conftest.py verify.sh lts/
cp PaymentReviewApp.spec app_icon.ico app_logo.png lts/ 2>/dev/null || true
# 启停脚本(通配可能含中文名)
cp *.bat *.command *.vbs lts/ 2>/dev/null || true
# 目录:pmisdata、tests、fonts
cp -r pmisdata tests lts/
cp -r fonts lts/ 2>/dev/null || true
# frontend 排除 node_modules/dist(tar 管道可靠排除)
mkdir -p lts/frontend
(cd frontend && tar --exclude=node_modules --exclude=dist -cf - .) | (cd lts/frontend && tar -xf -)
```
Expected: `lts/server.py`、`lts/frontend/src/main.ts`、`lts/tests/`、`lts/pmisdata/` 存在；`lts/frontend/node_modules` 与 `lts/frontend/dist` **不**存在。校验：
```bash
ls lts/server.py lts/frontend/src/main.ts lts/verify.sh lts/pmisdata/config.json >/dev/null && echo "copy OK"
test ! -d lts/frontend/node_modules && test ! -d lts/frontend/dist && echo "excludes OK"
```

- [ ] **Step 2: 删除被移除域的文件（后端 + 测试 + 前端）**

```bash
cd lts
# 后端模块
rm -f opportunities.py opportunity_followup.py temp_followup.py risk_followup.py \
      payment_key_followup.py followup_store.py budget_config.py budget_store.py \
      yitian.py yitian_calendar.py yitian_check.py yitian_rules.py yitian_settings.py \
      yitian_store.py yitian_config.py
# 后端测试(按前缀,删后用 grep 复核未误删保留项)
rm -f tests/test_opportunit*.py tests/test_temp*.py tests/test_payment_key*.py \
      tests/test_followup_store*.py tests/test_yitian*.py tests/test_budget*.py \
      tests/test_risk_followup*.py
# 前端 views + tests
cd frontend/src/views
rm -f OpportunitiesView.* OpportunitiesBoardView.* OpportunityFollowupView.* \
      KeyProjectsView.* TempFollowupView.* RiskFollowupView.* PaymentKeyFollowupView.* \
      YitianOverviewView.* YitianComplianceView.* YitianAnalyticsView.* YitianTrendView.* \
      YitianCustomerView.* BudgetView.*
cd ../lib
rm -f opportunitiesApi.ts opportunityBoard.* opportunityColumns.* opportunityFollowup.* \
      opportunityFollowupApi.ts opportunityScope.* keyProjects.* projectProgressApi.ts \
      tempFollowup.* tempScope.* tempFollowupApi.ts riskRows.* riskFollowupApi.ts \
      paymentKeyFollowup.* paymentKeyFollowupApi.ts budgetApi.ts
rm -rf yitian budget
cd ../stores
rm -f opportunities.* opportunityFollowup.* projectProgress.* tempFollowup.* riskFollowup.* \
      paymentKeyFollowup.* yitian.* yitianView.* yitianSettings.* budget.* budgetConfig.*
cd ../components
rm -f OpportunityEditDrawer.* YitianToolbar.* YitianScopeCard.* YitianStoreCard.* ScopeBuilder.*
rm -rf budget
cd ../types && rm -f yitian.ts
cd ../../../..   # 回到仓库根
```
校验（残留应为 0）：
```bash
ls lts/opportunities.py lts/yitian.py lts/budget_config.py 2>/dev/null | wc -l   # 期望 0
ls lts/frontend/src/lib/yitian lts/frontend/src/lib/budget 2>/dev/null | wc -l   # 期望 0
```

- [ ] **Step 3: 设 LTS 版本号**

`lts/frontend/src/version.ts` 内容替换为：
```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'LTS-1.0.0'
export const RELEASE_DATE = '2026-07-15'
```

- [ ] **Step 4: 根 `.gitignore` 加 lts 忽略**

在仓库根 `.gitignore` 末尾追加：
```
# LTS 精简副本的构建产物与运行数据(源码入库,产物/数据不入库)
lts/frontend/node_modules/
lts/frontend/dist/
lts/data/
lts/input/
lts/release/
lts/build/
lts/**/__pycache__/
```

- [ ] **Step 5: 提交脚手架**

```bash
git add lts .gitignore
git commit -m "feat(lts): 脚手架 —— 复制精简副本到 lts/ + 删 7 域文件 + LTS-1.0.0 + gitignore"
```
> 注：此刻 `lts/` 的共享文件仍有对已删文件的悬挂引用（router/nav/server 等），**尚不能构建**，Task 2/3 修复。

---

### Task 2a: lts 前端去引用 —— 路由

**Files:** `lts/frontend/src/router/index.ts`

- [ ] **Step 1: 删除被移除路由 + 对应 import**

删除这 13 条路由定义：`/opportunities`、`/opportunities/board`、`/opportunities/key`、`/projects/key`、`/projects/temp`、`/risk`、`/payment/key`、`/yitian`、`/yitian/compliance`、`/yitian/analytics`、`/yitian/trend`、`/yitian/customer`、`/budget`。
删除顶部对应 `import`：`OpportunitiesView`、`OpportunitiesBoardView`、`OpportunityFollowupView`、`KeyProjectsView`、`TempFollowupView`、`PaymentKeyFollowupView`、`BudgetView`、`YitianOverviewView`、`YitianComplianceView`、`YitianAnalyticsView`、`YitianTrendView`、`YitianCustomerView`（`RiskFollowupView` 是懒加载 `() => import(...)`，随其路由行一并删）。
**保留**：`/insight/risk`（风险看板，非 /risk）、`/data`、catch-all overview。**不加任何 redirect**。

- [ ] **Step 2: 残留校验**

```bash
grep -nE "Opportunit|Yitian|Budget|KeyProjects|TempFollowup|PaymentKeyFollowup|RiskFollowupView|'/risk'|'/budget'|'/yitian'|'/opportunities'|'/projects/key'|'/projects/temp'|'/payment/key'" lts/frontend/src/router/index.ts
```
Expected: 无输出（0 残留）。

- [ ] **Step 3: 交控制者**（不各自 commit；控制者本波次结束跑合并前端 typecheck 后串行提交）

---

### Task 2b: lts 前端去引用 —— 侧栏导航 + 页面权限

**Files:** `lts/frontend/src/nav.ts`、`lts/frontend/src/lib/pageAccess.ts`、`lts/frontend/src/layout/AppSidebar.vue`

- [ ] **Step 1: `nav.ts` 删项/删组**

- `PROJECT_LINKS`：删 `{ label: '商机清单', to: '/opportunities', key: 'opportunities-progress' }`。
- `ANALYSIS_LINKS`：删 `{ label: '商机看板', to: '/opportunities/board', key: 'opportunities-board' }`。
- **整组删** `KEY_FOLLOWUP_LINKS`（5 项全去）。
- `PAYMENT_LINKS`：删 `{ label: '回款重点跟进', to: '/payment/key', key: 'payment-key' }`。
- **整组删** `YITIAN_LINKS`（5 项全去）。
- `TOOL_LINKS`：删 `{ label: '概算工具', to: '/budget', key: 'budget' }`。

- [ ] **Step 2: `pageAccess.ts` 同步**

- `PageKey` 联合类型删这 13 个：`opportunities-board`、`projects-key`、`opportunities-progress`、`temp-followup`、`opportunity-followup`、`risk-followup`、`payment-key`、`yitian`、`yitian-compliance`、`yitian-analytics`、`yitian-trend`、`yitian-customer`、`budget`。
- 顶部 `import { ... } from '@/nav'`：删 `KEY_FOLLOWUP_LINKS`、`YITIAN_LINKS`（已整组删）。
- `PAGE_OPTIONS` 的 spread：删 `...KEY_FOLLOWUP_LINKS`、`...YITIAN_LINKS`。
- 核对 `firstAllowedPath`（若在本文件）不返回已删 key 对应 path；若引用了已删 key 常量，改为保留集。

- [ ] **Step 3: `AppSidebar.vue` 同步**

若模板/脚本 import 或渲染了 `KEY_FOLLOWUP_LINKS`、`YITIAN_LINKS`（含其分区标题/nav-sub 块），删除对应 import 与整块渲染；`PROJECT_LINKS`/`ANALYSIS_LINKS`/`PAYMENT_LINKS`/`TOOL_LINKS` 渲染保留（项已在 nav.ts 收敛）。

- [ ] **Step 4: 残留校验**

```bash
grep -rnE "KEY_FOLLOWUP_LINKS|YITIAN_LINKS|opportunities-progress|opportunities-board|projects-key|temp-followup|opportunity-followup|risk-followup|payment-key|yitian|budget" lts/frontend/src/nav.ts lts/frontend/src/lib/pageAccess.ts lts/frontend/src/layout/AppSidebar.vue
```
Expected: 无输出。

- [ ] **Step 5: 交控制者**（不各自 commit）

---

### Task 2c: lts 前端去引用 —— `/data` 去倚天

**Files:** `lts/frontend/src/views/DataView.vue`、`lts/frontend/src/composables/useInputFiles.ts`、`lts/frontend/src/lib/cookieAgent.ts`

- [ ] **Step 1: `DataView.vue` 去倚天卡片/上传/cookie**

删除：`import YitianScopeCard`、`import YitianStoreCard` 及模板中这两个组件；倚天上传相关（`yitianInput`/`onUploadYitian`/`yitianUploadMsg` 及模板块）；倚天 cookie 相关（`fetchYitianCookie` import、`yitianStatus`/`yitianMsg`/`yitianErr`/`loadYitianStatus`/`onFetchYitianCookie` 及模板块、`/api/yitian/cookie` 调用）；`YITIAN_FILE_NAMES` 相关过滤引用。
**保留**：更新数据、PMIS 文件、项目域文件、项目标签、门户配置、维护与历史等其余全部。

- [ ] **Step 2: `useInputFiles.ts` 去 `YITIAN_FILE_NAMES`**

删除 `YITIAN_FILE_NAMES` 常量及其 export/使用（倚天两文件不再单独成组；若上传白名单含倚天文件名，一并删该白名单项）。

- [ ] **Step 3: `cookieAgent.ts` 去 `fetchYitianCookie`**

删除 `fetchYitianCookie` 函数及其 export；保留 `pingAgent`、`fetchPmisCookie`。

- [ ] **Step 4: 残留校验**

```bash
grep -rnE "Yitian|yitian|YITIAN_FILE_NAMES|fetchYitianCookie" lts/frontend/src/views/DataView.vue lts/frontend/src/composables/useInputFiles.ts lts/frontend/src/lib/cookieAgent.ts
```
Expected: 无输出。

- [ ] **Step 5: 交控制者**（不各自 commit）

---

### Task 2d: lts 前端去引用 —— 保留页悬挂引用清扫

**Files:** `lts/frontend/src/views/OverviewView.vue`、`lts/frontend/src/views/DataQualityView.vue`、及全 `lts/frontend/src` grep 命中的其它保留文件（`main.ts`、`App.vue`、`stores/*`、`lib/*`、`components/*`）

- [ ] **Step 1: 全域 grep 找保留文件里对已删域的悬挂引用**

```bash
grep -rnE "OpportunitiesView|OpportunitiesBoardView|OpportunityFollowupView|KeyProjectsView|TempFollowupView|RiskFollowupView|PaymentKeyFollowupView|Yitian[A-Z]|BudgetView|@/lib/opportunit|@/lib/keyProjects|@/lib/tempFollowup|@/lib/tempScope|@/lib/riskRows|@/lib/paymentKeyFollowup|@/lib/budget|@/lib/yitian|@/lib/projectProgressApi|@/stores/opportunit|@/stores/tempFollowup|@/stores/riskFollowup|@/stores/paymentKeyFollowup|@/stores/projectProgress|@/stores/yitian|@/stores/budget|components/ScopeBuilder|components/budget|OpportunityEditDrawer" lts/frontend/src --include=*.ts --include=*.vue | grep -v "/views/\(Opportunit\|Yitian\|Budget\|KeyProjects\|TempFollowup\|RiskFollowup\|PaymentKeyFollowup\)"
```
（第二个 grep 排除的是已删文件自身残影；实际已删文件不存在，故命中的都是**保留文件里的悬挂引用**。）

- [ ] **Step 2: 逐处清理**

- `OverviewView.vue`：若首页有商机/倚天/概算相关卡片、import、计算或跳转，删除对应块（保留项目/回款/异常/门户展示）。
- `DataQualityView.vue`（治理）：若引用倚天覆盖率告警或其它已删域，删除。
- 其它命中文件：删对应 import 与使用。
- **门户 portal 相关一律保留**（`PortalLaunchpad`/`portal` store/`portalApi` 不动）。

- [ ] **Step 3: 残留校验**：重跑 Step 1 grep，Expected 无输出。

- [ ] **Step 4: 交控制者**（不各自 commit）

> **波次 B 前端合并验证（控制者做）**：4 个前端任务(2a-2d)并行完成后，控制者跑：`cd lts/frontend && npm install && npm run typecheck && npm run test:run && npm run build`，全绿后串行提交 2a/2b/2c/2d（各 add 各自文件）。

---

### Task 3a: lts 后端去引用 —— `server.py`

**Files:** `lts/server.py`

- [ ] **Step 1: 删被移除域的 import**（约 35-45 行区）

删：`import opportunities as _opp`、`import temp_followup`、`import temp_followup as _temp`、`import opportunity_followup as _oppf`、`import risk_followup as _riskfu`、`import payment_key_followup as _paykey`、`import yitian_settings`、`import yitian_store`、`import yitian`、`import budget_config`、`import budget_store`。
**保留**：`audit`、`portal`、`pmis*`、`projects`、`collection_stages`、`milestones`、`profit`、`snapshots`、`data_history`、`manual_*`、`auth`、`data_scope`、`schema`、`config`、`preprocess` 相关。

- [ ] **Step 2: 删文件常量 + 其 load/save 函数**

删：`YITIAN_STORE_FILE`、`_YITIAN_PAGE_KEYS`、`BUDGET_CONFIG_FILE`、`BUDGET_ESTIMATES_FILE`、`PROGRESS_FILE`、`TEMP_FOLLOWUP_FILE`、`OPP_FOLLOWUP_FILE`、`RISK_FOLLOWUP_FILE`、`PAYMENT_KEY_*_FILE` 及其对应的 load/seed/atomic-write 辅助函数（如 progress/temp/opp/risk/payment-key store 的读写块）。

- [ ] **Step 3: 删 dispatch elif 块（GET/POST）+ handler 方法**

删所有 `elif parsed.path == '/api/...'` 及其 handler，路径前缀含：`/api/progress`、`/api/temp-followup`、`/api/opportunity-followup`、`/api/risk-followup`、`/api/payment-key-followup`、`/api/opportunities`、`/api/yitian`、`/api/budget`（含 `.../scope`、`.../update`、`.../archive`、`.../archive/delete`、`.../create`、`.../delete`、`.../import`、`/config`、`/estimates`、`/cookie`、`/data`、`/settings`、`/store`、`/store/clear`、`/store/delete-range` 等全部子路径）及对应 `handle_*` 方法。

- [ ] **Step 4: 删倚天管线辅助 + clear-data 分支 + 超管闸**

删：`_rebuild_yitian_data`、`_load_yitian_cached`、`_yitian_cache`、`_yitian_store_lock` 等倚天专用；`clear-data` 里清倚天累积库的分支；`_SUPER_ONLY_PATHS` 中的 `/api/budget/*` 写路径；`_YITIAN_PAGE_KEYS` 授权判断处。

- [ ] **Step 5: 残留校验 + 可导入**

```bash
grep -nE "opportunit|yitian|budget|temp_followup|risk_followup|payment_key|_paykey|_riskfu|_oppf|_temp\b|_opp\b|PROGRESS_FILE|/api/progress|TEMP_FOLLOWUP_FILE|OPP_FOLLOWUP_FILE|RISK_FOLLOWUP_FILE|YITIAN|BUDGET" lts/server.py
```
Expected: 无输出（注意 `reprocess_state["progress"]`、`download_state` 等含 "progress" 子串的是回款/更新进度、**属保留**——若上面 grep 命中它们，用更精确的 `/api/progress\b`、`PROGRESS_FILE`、`progress_store` 单独确认这些回款进度保留、项目进展 store 已删）。
```bash
cd lts && python -c "import server" && echo "server import OK"
```

- [ ] **Step 6: 交控制者**（不各自 commit）

---

### Task 3b: lts 后端去引用 —— 管线 / 契约 / 配置 / 审计

**Files:** `lts/preprocess_data.py`、`lts/schema.py`、`lts/config.py`、`lts/data_scope.py`、`lts/audit.py`

- [ ] **Step 1: `preprocess_data.py` 去倚天**

删 `import yitian as yitian_mod` 及倚天摄取/构建段（约 296-321：`yitian_mod.ingest`、`build_yitian_data`、`validate_and_write_yitian_json`、holidays 告警等整块）。保留主域管线。

- [ ] **Step 2: `schema.py` 去倚天**

删倚天相关 pydantic 模型与 `validate_and_write_yitian_json`（及其被 preprocess 引用处已在 Step 1 去除）。保留主域 `AnalysisData`/`validate_and_write_json` 及 `PmisStatus`（含 V3.2.2 的 `立项日期`）。

- [ ] **Step 3: `config.py` 去倚天常量**

删倚天专用常量（如 holidays 文件名、倚天目录/白名单常量）；保留主域常量（收款阶段文件、金额阈值等）。

- [ ] **Step 4: `data_scope.py` 去倚天**

删按 allowedL4 切倚天数据的相关键/分支（`data_scope` 只处理 analysis_data，倚天是独立 json，若本文件含倚天键则删）。

- [ ] **Step 5: `audit.py` 去已删域埋点**

`_ACTION_MAP`（或等价映射）删已删域动作项：`budget.*`、`yitian.*`、`opportunity*.*`、`temp-followup.*`、`risk-followup.*`、`payment-key-followup.*`、`progress.*`。保留登录/账号/portal/data/manual 等。

- [ ] **Step 6: 残留校验**

```bash
grep -nE "yitian|Yitian" lts/preprocess_data.py lts/schema.py lts/config.py lts/data_scope.py
grep -nE "budget|yitian|opportunit|temp-followup|risk-followup|payment-key|'progress'" lts/audit.py
cd lts && python -c "import preprocess_data, schema, config, data_scope, audit" && echo "backend import OK"
```
Expected: grep 无输出；import OK。

- [ ] **Step 7: 交控制者**（不各自 commit）

> **波次 B 后端合并验证（控制者做）**：3a/3b 并行完成后，控制者跑：`cd lts && python -m pytest -q`（已删测试后无残留失败）+ `python -m compileall -q .`，全绿后串行提交 3a/3b。

---

### Task 4a: lts 文档 —— `lts/CLAUDE.md`

**Files:** Create `lts/CLAUDE.md`

- [ ] **Step 1: 写 LTS 版 CLAUDE.md（LTS-only）**

仿 master `CLAUDE.md` 结构，但**只写 LTS 保留域**、**不提 master/被删功能**。必含小节：
1. **这是什么**：单机/内网离线的项目管理与回款跟踪平台（LTS 精简版）；版本 `LTS-1.0.0`；访问 `http://localhost:8080`；简体中文。
2. **架构地图（数据血缘）**：主域管线 `PMIS 9 表 + CSV → preprocess_data.py → data/analysis_data.json → 前端`；配置/存档/跟进/门户类经 `server.py /api/*`（**只列保留的**：followup_records/project_tags/portal/accounts/audit/events）。**不含**倚天脉络、不列已删模块。
3. **模块表**：只列保留后端 `server.py`/`preprocess_data.py`/`pmis*.py`/`projects.py`/`collection_stages.py`/`milestones.py`/`profit.py`/`schema.py`/`snapshots.py`/`data_history/manual_*`/`portal.py`/`auth/audit/data_scope`/`config/pmis_config`；前端 `router/views/components/lib/stores/charts`。
4. **运行/调试**：`python server.py`；`cd frontend && npm install/dev/build`；改 `schema.py` 跑 `gen:types`。
5. **关键约定**：不使用 emoji；回款口径（Σ流水÷Σ合同）；异常项目排除；设计令牌只引用不散写；版本单一来源 `frontend/src/version.ts`。
6. **打包模式 vs 开发模式** 两套路径注意（沿用 master 说明，措辞不提 master）。
7. **验证**：`bash verify.sh`。

- [ ] **Step 2: 校验无被删域字样**

```bash
grep -nE "商机|倚天|概算|opportunit|yitian|budget|重点项目进展|临时重点跟进|风险跟进|回款重点" lts/CLAUDE.md
```
Expected: 无输出。

- [ ] **Step 3: 交控制者**（不各自 commit）

---

### Task 4b: lts 文档 —— README + 两部署手册

**Files:** Create `lts/README.md`、`lts/deploy/本地部署验证手册.md`、`lts/deploy/服务器部署手册.md`

- [ ] **Step 1: `lts/README.md`（LTS-only）**

含：项目简介（精简版项目+回款跟踪平台，`LTS-1.0.0`）；功能清单（**仅保留项**：项目总览/在建/已关闭/详情/动态、项目分析 insight+里程碑+成本+风险看板+回款看板+日历、回款总览/项目/节点、数据治理、账号管理、数据管理 `/data`、首页门户、关于）；技术栈；快速开始（`python server.py` + `cd frontend && npm install && npm run build`）；数据更新方式（登录 → `/data` → 上传 PMIS/CSV → 点「更新数据」）；目录结构简述。不提 master/被删功能。

- [ ] **Step 2: `lts/deploy/本地部署验证手册.md`（本地部署 + 验证）**

面向开发/验收机（Windows/macOS/Linux）：
- 前置：Python 3.8+、Node 18+。
- 步骤：装依赖（`pip install -r requirements.txt`、`cd frontend && npm install`）→ 构建前端（`npm run build`）→ 起服务（`python server.py`，:8080 自动开浏览器）→ 首次准备数据（把 PMIS 9 表放 `input/pmis/`、CSV 放 `input/`、`组织架构.xlsx`/`A.xlsx`）→ 登录 → `/data` 点「更新数据」。
- **验证清单**：`bash verify.sh` 全绿；浏览器逐页打开保留页无 console 报错；回款达成率落在合理区间；`/data` 无倚天卡片、门户展示正常；已删路径（如 `/opportunities`、`/yitian`、`/budget`）访问落到总览而非报错。

- [ ] **Step 3: `lts/deploy/服务器部署手册.md`（服务器部署，环境同 master）**

面向 Ubuntu 服务器，**环境与 master 版本一致**：nginx:80 → app 127.0.0.1:8080、systemd 托管、目录 `/opt/pmplatform`、前端 `--base=/pm/` 构建。
- 步骤：上传代码到 `/opt/pmplatform` → Python venv + `pip install -r requirements.txt` → `cd frontend && npm ci && npx vite build --base=/pm/`（PowerShell/`MSYS_NO_PATHCONV=1` 防 `/pm/` 篡改，或直接在 Linux 上 bash 无此问题）→ 配置 systemd unit（示例 unit 文件）→ 配置 nginx（`/pm/` → `127.0.0.1:8080` 反代示例）→ 首次放数据 + 点「更新数据」→ 建超管账号。
- 运维：更新数据、备份 `data/`、日志、重启（`systemctl restart pmplatform`）、回滚。
- 安全提示：内网部署、绑定/认证、按 allowedL4 数据隔离说明。

- [ ] **Step 4: 校验无被删域字样**

```bash
grep -rnE "商机|倚天|概算|opportunit|yitian|budget" lts/README.md lts/deploy/
```
Expected: 无输出（"master" 亦不应出现）。

- [ ] **Step 5: 交控制者**（不各自 commit）

---

### Task 4c: master 根 `CLAUDE.md` 加 LTS 标记

**Files:** `CLAUDE.md`（仓库根，master 侧）

- [ ] **Step 1: 加一行 LTS 存在标记**

在根 `CLAUDE.md` 的 §1「这是什么」末尾（或产品名称条目附近）加一条：
```
- **LTS 精简变体**：`lts/` 目录为长期支持精简副本（版本 `LTS-1.0.0`，仅保留核心项目+回款，去商机/倚天/概算/重点跟进/概算等域），自带独立 `lts/CLAUDE.md` 与部署手册；master 全功能演进不受其影响。
```
（措辞按当前 CLAUDE.md 风格微调；**只加标记，不改 master 其它内容**。）

- [ ] **Step 2: 交控制者**（不各自 commit）

> **波次 C 文档合并（控制者做）**：4a/4b/4c 并行完成后，控制者串行提交（各 add 各自文件）。

---

### Task 5: 全量验证 + 冒烟 + 收尾

**Files:** （无新增，跑验证 + 修残留）

- [ ] **Step 1: `lts/` 全量 verify**

```bash
cd lts && bash verify.sh
```
Expected: `[PASS] verify.sh 全部通过`（后端 compileall+ruff+pytest；前端 typecheck/vitest/build 全绿、无悬挂 import）。若报错，定位残留悬挂引用并修（回到对应 2x/3x 任务范畴），再跑。

- [ ] **Step 2: 冒烟（本地起服务）**

```bash
cd lts && python server.py   # 后台起；或另窗口
```
核对：保留页（总览/项目/回款/分析/治理/账号/关于/`/data`）可加载；登录落地正常；`/data` 无倚天卡片、门户展示正常；访问 `/opportunities`、`/yitian`、`/budget` 落到总览（catch-all）不报错。

- [ ] **Step 3: master 侧不回归确认**

```bash
cd .. && git status --short   # 确认 master 的 *.py/frontend/src 未被改(只 lts/、.gitignore、CLAUDE.md 有改动)
```

- [ ] **Step 4: 提交收尾**（若 Step 1 有修残留）

```bash
git add lts
git commit -m "fix(lts): verify.sh 全绿 —— 清理残留悬挂引用"
```

---

## 执行方式（并行波次，用户授权 workflow/subagent 提速）

- **波次 A**：Task 1（脚手架，solo）。
- **波次 B**：Task 2a/2b/2c/2d/3a/3b（6 个去引用任务**并行**，改文件互不相交；各跑各自残留 grep、不各自 commit）。控制者：前端 4 任务后跑一次合并 `npm typecheck/test/build`、后端 2 任务后跑一次 `pytest/compileall`，全绿后**串行提交**。
- **波次 C**：Task 4a/4b/4c（文档 + master 标记，**并行**）。控制者串行提交。
- **波次 D**：Task 5（全量 verify + 冒烟 + 收尾）。
- 结束：opus 整支终审（重点查残留悬挂引用、门户/`/data` 保留是否完整、master 是否零代码改动、文档是否零 master 字样）。

可用 **Workflow** 编排波次 B 的 6 路并行 + 合并验证，进一步压墙钟。

## 自审记录

- **Spec 覆盖**：§2 产出→T1+T4；§3 复制清单→T1 Step1；§4 删除域→T1 Step2 + T2/T3 去引用；§5 共享文件编辑→T2a-d/T3a-b；§6 gitignore→T1 Step4；§7 文档→T4a/T4b（含两手册）；§8 master 标记→T4c；§9 打包→随 glob 自适应（T1 复制打包脚本，spec §9 说明）；§10 验证→T5。全覆盖。
- **/data 保留 + 门户保留**：T2c 只去倚天卡片、T2d 明确保留 portal。
- **master 零代码改动**：仅 .gitignore（T1）+ 根 CLAUDE.md 标记（T4c）；T5 Step3 显式校验。
- **两部署手册**：T4b Step2（本地验证）+ Step3（服务器，环境同 master）。
- **无占位符**：删除/去引用任务给精确目标 + 残留 grep 校验；文档任务给必含小节大纲 + 无被删域字样校验。
