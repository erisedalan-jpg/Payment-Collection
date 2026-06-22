# 数据管理界面调整：彻底移除 WPS + 双数据来源（页面导入 / 本地放置）

> 设计日期：2026-06-22 · 版本：V1.16.2 · 状态：待用户评审
> 驱动：平台将部署到 Ubuntu 服务器供多名管理人员使用；WPS 云文档已完全弃用。

## 1. 背景与目标

平台早期回款数据靠 WPS 云文档同步（Playwright 抓取）+ 离线导入里程碑 Excel。现核心回款源已切换为 PMIS 导出的 `input/collection_stages.csv`，WPS 仅剩历史残留。部署到服务器后，数据进入只需支持**两种场景**：

1. **页面导入**——管理员在「数据管理」页上传文件。
2. **本地放置**——服务器定时任务（cron）把文件投放到约定目录，管理员在页面点「更新数据」生效。

目标：把「数据管理」页围绕这两条路径重构，彻底拆除 WPS 同步与一切在线抓取入口，并补齐核心回款源 `collection_stages.csv` 在页面上的可见性与可上传性。

## 2. 决策记录（已与用户确认）

- **D1 — WPS 移除深度**：彻底删除，含数据源下线。不仅删 UI 与抓取机制，连 `preprocess` 读 `yundocs_data/` 的代码、`fetch_yundocs_full.py`、Playwright 依赖一并删除。
- **D2 — 本地放置机制**：复用现有 `input/` 与 `input/pmis/` 目录 + 手动「更新数据」（reprocess）。不新增独立投放区、不做文件监听/自动 reprocess（避免与单线程 SSE 阻塞耦合）。
- **D3 — PMIS 在线直链下载**：一并移除（虽用标准库 `urllib`、不依赖 Playwright，但只保留「页面上传 + 本地放置」两条路径，界面更聚焦）。
- **D4 — 死键处理**：`projectOverview` / `naguanMap` / `naguanExclude` 连 `schema.py`、前端 `analysis.ts`、`stores/data.ts` 一并删除（前端零消费）。

## 3. 数据血缘核查结论（删除前的安全依据）

对 yundocs（`yundocs_data/`）派生的全部输出键做了前后端消费方测绘：

| 输出键 | 来源 | 前端消费 | 处置 |
|---|---|---|---|
| `projectOverview.{projects,columns}` | yundocs「项目验收日期」sheet | 仅 `stores/data.ts` 兜底，无业务消费 | 删键 + 删 schema/类型 |
| `naguanMap` / `naguanExclude` | 同上「纳管」列 | 零消费（纳管已被项目标签取代） | 删键 + 删 schema/类型 |
| `classification` / `serviceGroups` | `compute_classification/compute_service_groups(project_overview)` | 后端算了但**从未序列化输出**，前端零消费 | 删除计算函数 |
| `followupRecords` | yundocs「回款跟进」sheet | 前端实时走 `/api/followup/*`（本地 `data/followup_records.json`），不读此快照键 | **保留键**，改为只读本地 json 重建（不再写 yundocs） |
| `tagSeed` | `derive_tag_seed(project_overview)`（yundocs 列） | server 仅用于**首次播种**本地标签库，此后本地为准 | 输出恒为 `{}`；删 `derive_tag_seed` 与 `TAG_SEED_*` |

**后端唯一隐藏硬依赖**：`pay_projects`（"回款项目"清单）当前由 `project_overview` 派生，喂给 `pmis.load_project_pmis`，用于 ①已关闭项目收录范围 ②数据治理「匹配/未匹配」指标。在建项目全量加载、**不受影响**。

> 关键修法（D1 的必要配套）：把 `pay_projects` **换源到 `collection_stages.csv` 的项目号集合**（在 `load_project_pmis` 调用前提前加载 collection_stages）。语义正确——"回款项目"本就该= 收款台账里的项目，正是新核心回款源；治理「匹配/未匹配」指标因此更准。

**死代码确认**：`process_below100_nodes` 及节点状态助手（旧 yundocs 回款节点路径）在 `main()` 中无调用点，随 yundocs 一并删除。

## 4. 范围：改动清单

### 4.1 前端 `frontend/src/views/DataView.vue`（页面重构）
围绕"两种数据来源"重排信息架构：

- **删除**整张「回款数据（WPS 云文档）」卡片（WPS 链接输入 / 云同步按钮 / 离线导入）。
- PMIS 卡片**删除**「在线下载（有链接项）」按钮、链接输入框与重置按钮；PMIS 卡片降为纯"上传 + 本地放置状态"。
- 新增/重排：
  - **数据来源说明**卡：用文字讲清两条路径——①页面上传 ②本地放置（cron 投放到服务器 `input/` 与 `input/pmis/`，明确列出目录路径）。
  - **数据文件清单与状态**卡（合并原 PMIS / input 两卡）：统一列出所有所需文件——PMIS 九表 + input 根（`组织架构.xlsx`/`A.xlsx`/`delivery_analysis.csv`/`payment_records.csv`/`profit_loss_*.csv`/`budget_data.csv`）+ **新增 `collection_stages.csv`**——每行展示最近修改时间，并支持页面上传。本地放置成功与否可凭 mtime 一眼核对。
  - **更新数据**卡：保留手动 reprocess（读 `input/` 全量重算）。
- **保留不动**：项目标签管理、按标签排除、人工数据导入/回滚、数据历史/回滚、清空数据。

### 4.2 前端 composables / 类型
- **删除**：`composables/useCloudSync.ts`、`composables/useExcelImport.ts`（及 `lib/excelImport.ts` 若仅服务于 WPS 离线导入）、对应 `*.test.ts`。
- `composables/usePmisSync.ts`：**删除** `loadLinks/saveLinks/download` 与 links/defaults 状态，仅保留 `upload` 与 `PMIS_FILE_NAMES`；同步精简其测试。
- `composables/useInputFiles.ts`：`INPUT_FILE_NAMES` **加入 `collection_stages.csv`**。
- `types/analysis.ts`：由 `npm run gen:types` 重新生成（随 schema 删 `projectOverview`/`naguanMap`/`naguanExclude`）。
- `stores/data.ts`：`clearBusinessData` 等处去掉对 `projectOverview` 的兜底引用。

### 4.3 后端 `server.py`
- **删除端点与 handler**：`/api/sync`、`/api/sync-status`、`/api/stop-sync`、`/api/import`、`/api/import-status`、`/api/stop-import`、`/api/pmis/download`、`/api/pmis/links`(GET/POST)。同步从 `_SUPER_ONLY_PATHS` 移除已删路径。删除相关 `sync_state`/`import_state`/子进程调度与 `fetch_yundocs_full.py` 调用分支（含 frozen 直跑分支）。
- `collect_file_status`：把 `collection_stages.csv` 纳入 input 根名单（与 `INPUT_UPLOAD_NAMES` 同源）。
- `is_valid_input_name` / 上传白名单：放行 `collection_stages.csv`，使其可经 `/api/inputs/upload` 页面上传。
- 标签首次播种 `_seed_tags_from_analysis`：保留（读 `tagSeed`，现恒为 `{}` → 新装机返回空 store 不落盘，管理员手动加标签）。

### 4.4 后端 `config.py`
- 删除：`SHEET_PAYMENT_NODES`/`SHEET_PROJECT_OVERVIEW`/`SHEET_FOLLOWUP`、`WPS_LINK_KEY`、`DEFAULT_LINKS`、`TAG_SEED_WHITELIST`/`TAG_SEED_COLUMNS`、Playwright 预导入块（`config.py:77-90` 的 frozen/dev 分支）。
- `INPUT_UPLOAD_NAMES`：加入 `COLLECTION_STAGES_FILE`。

### 4.5 后端 `preprocess_data.py`
- 删除：`load_sheet`、`process_project_overview`、`_overview_or_empty`、`compute_classification`、`compute_service_groups`、`process_below100_nodes` 及其节点状态助手、`derive_tag_seed`、`process_followup_records` 的 yundocs 读取部分、`INPUT_DIR = yundocs_data` 常量。
- `main()`：
  - 移除第 2/4/5 段（验收 sheet / 分类 / 服务组）与相关打印。
  - **`pay_projects` 换源**：提前 `collection_mod.load_collection_stages(...)`，`pay_projects = [{"projectId": pid} for pid in collection_stages]`（projectName 可空），传入 `load_project_pmis`；9f 段复用同一已加载的 `collection_stages`，避免重复加载。
  - `final_data` 删 `projectOverview`/`naguanMap`/`naguanExclude`；`tagSeed` 置 `{}`；`followupRecords` 改为读 `data/followup_records.json` 重建（按项目分组、每项目最近 5 条，只读不写，保护本地实时数据）。
- 删除 `fetch_yundocs_full.py`、`pmis_download.py` 两个脚本文件。

### 4.6 后端 `schema.py` + `data_scope.py`
- `schema.py`：删除 `class ProjectOverview`、`AnalysisData.projectOverview/naguanMap/naguanExclude`。`followupRecords`/`tagSeed` 保留。
- `data_scope.py`：从按 L4 裁切的键名单移除 `projectOverview`（及 naguan，如在列）；`tagSeed` 保留裁切。

### 4.7 测试（TDD 守护）+ 版本 + 文档
- **先改/补测试再改实现**：
  - 新增/改：`collect_file_status` 含 `collection_stages.csv`、`is_valid_input_name` 放行它、preprocess `pay_projects` 换源为 collection_stages、`followupRecords` 由本地 json 重建。
  - 删除：`test_server_sync*`/`test_*import*`（已删端点）、`test_tag_seed.py`、yundocs 相关 preprocess 测试、前端 `useCloudSync.test.ts`/`useExcelImport.test.ts`/`usePmisSync` 中 download 用例；修正 `test_data_scope.py`/`test_server_authz.py`/`test_server_tags.py` 对已删键/端点的断言。
- `frontend/src/version.ts` → `V1.16.2`，`RELEASE_DATE` → `2026-06-22`。
- 更新 `CLAUDE.md`（架构地图去 WPS/yundocs/Playwright；数据流图与文件职责表）、`PROGRESS.md`。

## 5. 不在本次范围（YAGNI / 另立条目）
- 自动监听投放目录 / 自动 reprocess（D2 已否决）。
- `/insight` 回款完成率口径归并（既有技术债，独立）。
- collection_stages 覆盖率治理告警（既有技术债，独立）。
- 前端代码分割 / JSON 去缩进等性能项（P1，独立）。
- 桌面快捷方式 / exe 文件名更名（随打包专项）。

## 6. 风险与回归守护
- **本地 followup 数据误清**：旧 `process_followup_records` 会用 yundocs 覆盖 `data/followup_records.json`。新实现**只读**该文件重建 `followupRecords` 输出键，绝不写入；并以专门测试锁定"reprocess 不改动本地 followup 文件"。
- **孤儿消费方**（见记忆 `field-rename-orphan-consumers`）：删 `projectOverview`/`naguan*` 后全仓 grep 残留消费方（含 `extra=allow` 掩盖项），逐一清理；以 `npm run typecheck` + 全量 vitest + pytest 收口。
- **frozen 打包路径**（CLAUDE §5）：删 Playwright 预导入与 `_run_script_direct('fetch_yundocs_full')` 时，开发/打包两条分支同改。
- **数据治理指标位移**：`pay_projects` 换源后，治理页「匹配/未匹配」基数由"yundocs 项目"变为"收款台账项目"——属预期改善，冒烟核对数字落在合理区间。

## 7. 完成判据
- `bash verify.sh` 全绿（语法 + ruff + pytest + 前端 typecheck/vitest/build）。
- 手动冒烟：`python server.py` + 前端 dev，「数据管理」页只剩两条路径；上传 `collection_stages.csv` 成功且 mtime 刷新；点「更新数据」重算后回款看板关键指标（达成率）落在合理区间、无 console 报错。
- `PROGRESS.md` 已更新，版本号 = V1.16.2。
