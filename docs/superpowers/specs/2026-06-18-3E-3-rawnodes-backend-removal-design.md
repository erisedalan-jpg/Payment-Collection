# 3E-3 后端移除 rawNodes 设计（rawNodes 下线程序收官）

> 2026-06-18 立项。隶属「全局下线 rawNodes 旧口径程序」第⑤步（3E）第三/收官子步。
> 前序：3A 详情页、3B /payment、3C /ledger、3D /calendar、3E-1 死代码清扫、3E-2 前端活消费换源，均已合并 master，**前端契约已不依赖 rawNodes 数据**。
> 本 spec：**完全 purge** 后端 `rawNodes`/`all_nodes`/WPS「项目回款节点（里程碑）清单」sheet——截停该 sheet 加载，删 all_nodes 整条派生链，把仍依赖它的活功能全换收款阶段(collection_stages/paymentNodes)口径，并删 `RawNode` 类型与前端残留。

## 背景与现状（3E-3 调研证实）

`all_nodes`（WPS 回款节点 sheet，`preprocess_data.py` `load_sheet(config.SHEET_PAYMENT_NODES)`）深植后端，远不止 `final_data["rawNodes"]` 产出：

| all_nodes 派生物 | 前端消费 | 调研结论 |
|---|---|---|
| `rawNodes` JSON 键 | 否（3A-3E-2 已脱离） | 删 |
| `dashboard`(`compute_dashboard`)/`summary`(`compute_tier_summary`) | **否**（活代码零消费） | 死产出，连带删 |
| `displayColumns` | **否**（grep 仅命中类型+注释，无活读取） | 死产出，连带删 |
| `meta.totalPaymentNodes` = len(all_nodes isPaymentRelated) | 是（治理页"节点行数"） | 换源=paymentNodes 计数 |
| `projects[*].payment`(`aggregate_payment`) | 是（详情页回款完成率 + `health.paymentAbnormal`） | 换源到 paymentPmis 收款阶段聚合 |
| `pay_projects`/`build_projects(all_nodes)`（PMIS 匹配 + 名称回填 + dirty 检测） | 间接 | 换源到 collection_stages/project_overview/paymentNodes |
| `node_action_date_from_data`（跟进自动填充 nextActionDate） | 是（/api/followup/create） | **抛弃**（collection_stages 无 nextActionDate） |
| `snapshots.build_snapshot`（稳定键 `projectId\|nodeName#k`） | 是（事件 diff） | 换 `projectId\|stage`、吃 paymentNodes、主域范围 |

`RawNode` 类型：`schema.py` `RawNode`/`Rawnodes`/`AnalysisData.rawNodes`；前端 `types/analysis.ts`(自生成) + 僵尸 `lib/dataQuality.ts`/`lib/dashboardSignals.ts`（接 `RawNode[]` 但无活调用方）+ `stores/data.ts` 的 `rawNodes:[]` 占位 + `overview.test.ts` 死 import。

**双路径（CLAUDE.md §5）**：调研确认 rawNodes 相关代码**无 frozen 分支**（`node_action_date_from_data` 纯函数、`snapshots.py` 无 frozen、preprocess all_nodes 计算不在 frozen 分支内）。但 preprocess/server 改动仍须按"打包 vs 开发"双路径原则审视。

## 目标

- 后端不再加载 WPS 回款节点 sheet、不再构建 all_nodes、不再产出 `rawNodes`/`dashboard`/`summary`/`displayColumns`。
- 仍活的 5 处（totalPaymentNodes/projects.payment/paymentAbnormal/pay_projects·build_projects/snapshots）换收款阶段口径；node_action 跟进自动填充抛弃。
- `RawNode` 类型与前端残留（僵尸函数/占位/死 import）清除。
- `verify.sh` 全绿；真实数据冒烟产物结构正确。

## 口径决策（用户 2026-06-18 钦定）

- **G1 nextActionDate**：**抛弃自动填充**。删 `node_action_date_from_data`/`_get_node_action_date`；跟进新建不再自动默认「节点动作完成时间」「下次跟进计划日期」（用户手填或留空）。
- **G2 snapshots**：稳定键改 `projectId|stage`、吃 paymentNodes、主域范围；**首次切换前手动清空 `data/snapshots/`，以收款阶段重建基线、不出假事件**（一次性运维步骤，写入提交说明并提醒用户）。
- **G3 totalPaymentNodes**：换源 = 主域 paymentNodes 节点计数（语义由"云文档全量回款行"变"主域收款阶段数"，已接受）。
- **G5 projects.payment**：详情页回款完成率 + `health.paymentAbnormal` 换 paymentPmis 收款阶段聚合（值可能微变，口径对齐）；删 `projects[*].payment` 旧字段与 `aggregate_payment`。
- **dashboard/summary/displayColumns**：连带删（前端零消费）。

## 范围

### 做（后端）
1. `snapshots.py` `build_snapshot`：节点稳定键 `projectId|nodeName#k` → `projectId|stage`，入参从 raw_nodes 改 paymentNodes（主域收款阶段节点，仅含 planDate/receivedAmount/status/stage 等）；`run_snapshot_pipeline` 改传 paymentNodes（不再传 `final_data["rawNodes"]`）。事件类型（到账/延期/计划日变更）由收款阶段字段 diff。
2. `server.py`：删 `node_action_date_from_data` + `_get_node_action_date`；`handle_followup_create` 去掉两处自动填充（节点动作完成时间/下次跟进计划日期默认值）。
3. `preprocess_data.py`：
   - 删 `load_sheet(SHEET_PAYMENT_NODES)` 段与 all_nodes 构建（§1）；删 all_nodes 的 naguan/followup/dirty 三关联循环（§3/§9/§9b）。
   - 删 `final_data["rawNodes"]`、`final_data["dashboard"]`、`final_data["summary"]`、`final_data["displayColumns"]` 产出；删 `compute_dashboard`/`compute_tier_summary` 函数。
   - `meta.totalPaymentNodes` 换源 = Σ len(paymentNodes[pid])（主域收款阶段节点计数）；`meta.totalProjects` 保持（project_overview 长度）。
   - dirty 检测（actualPaymentRatio>1）换源到 paymentNodes（actualRatio>1）或并入收款阶段已有校验。
   - `pay_projects` 改由 collection_stages 项目集 / project_overview 取；`build_projects` 去 all_nodes 参数（名称回填改用 PMIS/overview 既有 projectName；回款聚合改 paymentPmis）。
4. `projects.py`：`build_projects` 去 all_nodes 参数；删 `aggregate_payment`（旧 all_nodes 聚合）与 `projects[*].payment` 字段；`health.paymentAbnormal` 判定改用 paymentPmis（收款阶段完成率阈值）。
5. `schema.py`：删 `RawNode` 模型、`Rawnodes` alias、`AnalysisData.rawNodes`/`dashboard`/`summary`/`displayColumns` 字段、`Project.payment`（旧）字段。

### 做（前端）
6. `frontend/src/views/ProjectDetailView.vue`：回款完成率指标从 `projects[*].payment` 换 `paymentPmis`（收款阶段完成率）。
7. `npm run gen:types`：重生成 `analysis.ts`（`RawNode`/`Rawnodes`/`dashboard`/`summary`/`displayColumns`/`Project.payment` 随 schema 消失）。
8. 删前端僵尸：`lib/dataQuality.ts`（`dataQualityRows`/`dataQualityDrill`/`scopeNodes` 等接 RawNode[] 无活调用方——先 grep 复核零活消费，连带 `dataQuality.test.ts` 与 `DataQualityTable.vue` 若仅引其死类型）、`lib/dashboardSignals.ts`（`dashboardSignals` 僵尸，先 grep 复核）；`stores/data.ts` 删 `rawNodes:[]`（及 dashboard/summary/displayColumns 占位）；`overview.test.ts` 删死 RawNode import。

### 不做
- 不动 WPS 同步本身（fetch_yundocs_full.py 仍抓其它 sheet；仅 preprocess 停用回款节点 sheet）。
- 不改收款阶段口径/计算；不动已换源页面（仅 ProjectDetailView 回款完成率一处口径换）。
- 不新增 nextActionDate 替代源（G1 抛弃）。
- 不保留任何 all_nodes/rawNodes 内部残留。

## 文件结构与职责

| 文件 | 改动 |
|---|---|
| `snapshots.py` | build_snapshot 节点键换 `projectId\|stage`、吃 paymentNodes |
| `server.py` | 删 node_action_date_from_data/_get_node_action_date；跟进创建去自动填充 |
| `preprocess_data.py` | 删 all_nodes 链 + rawNodes/dashboard/summary/displayColumns 产出 + 两 compute 函数；totalPaymentNodes/dirty/pay_projects 换源；build_projects 去参 |
| `projects.py` | build_projects 去 all_nodes；删 aggregate_payment/Project.payment；paymentAbnormal 换 paymentPmis |
| `schema.py` | 删 RawNode/Rawnodes/rawNodes/dashboard/summary/displayColumns/Project.payment |
| `frontend/src/types/analysis.ts` | gen:types 重生成 |
| `frontend/src/views/ProjectDetailView.vue` | 回款完成率换 paymentPmis |
| `frontend/src/lib/dataQuality.ts`、`lib/dashboardSignals.ts` | 整删（僵尸，先 grep 复核） |
| `frontend/src/stores/data.ts` | 删 rawNodes/dashboard/summary/displayColumns 占位 |
| 各 `tests/test_*.py`、前端 `*.test.ts` | 见"测试" |

## 接口与改法（关键点）

- **snapshots**：`build_snapshot(snapshot_dir, payment_nodes, ...)`——payment_nodes 为 `{pid: PaymentNodePmis[]}`；节点循环按 `pid` + `stage` 计数生成 `f"{pid}|{stage}#{k}"`，存 `{pid, pname, node=stage, status, planDate, actual=receivedAmount, expected=expectedPayment}`。事件 diff 逻辑（到账/延期/计划日）字段名同步换（actualPayment→receivedAmount、nodeStatus→status）。
- **totalPaymentNodes**：`sum(len(v) for v in payment_nodes.values())`。
- **projects.payment / paymentAbnormal**：消费方改读 `paymentPmis`（已存在，3A 产出，含 contract/收款阶段聚合）；`paymentAbnormal` 用收款阶段完成率阈值（沿用 compute_health 现有阈值常量，仅换数据源）。
- **build_projects**：签名去 `all_nodes`；项目名称回填若原依赖 all_nodes 的 projectName，改用 PMIS team/overview 的项目名称（已有）。
- **跟进创建**：`handle_followup_create` 删两处 `node_action_date` 赋值；记录仍正常保存（其它字段不变，符合"表单只 3 只读字段"约定）。

## 测试

- `tests/test_snapshots.py`、`tests/test_preprocess_snapshots.py`：夹具从 all_nodes 格式换 paymentNodes 格式；断言稳定键 `projectId|stage`、事件 diff 正确。
- `tests/test_server_node_action.py`：`node_action_date_from_data` 删除 → 该测试整删；`tests/test_followup_local.py` 去掉对自动填充的断言/mock（记录保存仍测）。
- `tests/test_schema.py`：最小有效数据 fixture 去 rawNodes/dashboard/summary/displayColumns/payment 字段。
- `tests/test_projects.py`：build_projects 去 all_nodes 参数；paymentAbnormal 用 paymentPmis 夹具断言；删 aggregate_payment 测试。
- `tests/test_preprocess*.py`：产物不含 rawNodes/dashboard/summary/displayColumns；totalPaymentNodes=paymentNodes 计数。
- 前端：`ProjectDetailView.test.ts` 回款完成率断言换 paymentPmis 口径；删僵尸后 `dataQuality.test.ts` 同删；`overview.test.ts` 去死 import；全量 `npm run typecheck`+`npx vitest run`+`npm run build` 绿。
- **删除/换源型任务一律跑全量回归**（pytest 全量 + 前端全量 vitest），不只本文件（3E-2 教训）。

## 验证（声称完成前必跑）

```bash
bash verify.sh   # python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python preprocess_data.py   # 产物冒烟:不含 rawNodes/dashboard/summary/displayColumns;schema 通过
```

附加：产物冒烟确认 `meta.totalPaymentNodes` 合理（主域收款阶段数）、`projects[*]` 无 `payment` 旧字段、快照管线不报错；手验治理页"节点行数"、详情页回款完成率、跟进新建（两字段不再自动填）。

## 上线运维步骤（G2，必须）

发布本版前**手动清空 `data/snapshots/` 目录**（删除旧基线）。下次 `preprocess_data.py` 以收款阶段重建快照基线、`data/events.json` 不出假事件；事件历史从此重起。写入提交说明并明确提醒用户执行。

## 版本与进度

- `frontend/src/version.ts` → **V1.6.9**（Z 级：纯后端口径/契约简化 + 前端死代码清除，无页面增改）。
- `PROGRESS.md`：「全局下线 rawNodes 程序」⑤ 下记 3E-3 一条 + **程序整体收官**标记。

## 取舍记录

- **完全 purge（用户钦定）**：用户选择截停 WPS 回款节点 sheet 全换收款阶段，并逐项确认缺口处置。彻底消除旧口径，代价是 nextActionDate 自动填充与 WPS 全量节点粒度。
- **G1 抛弃 nextActionDate**：collection_stages 无该字段，保留需续依赖 WPS sheet（违"全换"）；自动填充仅便利默认，抛弃换彻底。
- **G2 清空快照重建**：稳定键换 stage 与旧 nodeName 不兼容，不重建会假事件风暴；一次性运维清空最简明。
- **G3/G5 换收款阶段**：与已换源的台账/总览/日历全线一致；totalPaymentNodes 数字变小、详情页回款完成率值微变属口径对齐。
- **dashboard/summary/displayColumns 连带删**：前端零消费的死产出，留着只增 all_nodes 内部依赖与 JSON 体积。
- **无 frozen 牵连**：调研确认 rawNodes 相关无打包分支，降低双路径风险；但 preprocess/server 改动仍按双路径原则审视。
