# 3E-2 前端活 rawNodes 消费方换源设计

> 2026-06-17 立项。隶属「全局下线 rawNodes 旧口径程序」第⑤步（3E）第二子步。
> 前序：3A 详情页回款 tab、3B /payment 概览、3C /ledger 台账、3D /calendar 日历、3E-1 前端死代码清扫，均已合并 master。
> 本 spec：把 3A-3D **未覆盖到的、仍在服务真实页面的 5 个活 rawNodes 消费方** 全部脱离 rawNodes、改吃收款阶段口径(`paymentNodes`/`projects`)，为 **3E-3 删后端 rawNodes** 扫清前端。

## 背景与现状（两轮审计 + closedNodes 专项调研证实）

3A-3D 按 tab/区块换源，遗留 5 个活 rawNodes 消费方（前端唯一仍读 `data.data.rawNodes` 的数据消费点；其余仅 import `RawNode` 类型者随 3E-3 删类型时处理）：

| 消费方 | 位置 | 现状 |
|---|---|---|
| `l4Options`/`pmOptions` | `stores/filter.ts:43-59` | 从 rawNodes 去重收集 orgL4/projectManager，供 FilterBar 服务组/经理视角下拉 |
| `yundocsOk` | `lib/governance.ts:58` | `rawNodes.length>0` 作"云文档主数据已就绪"最高优先红色告警开关 |
| `paymentBand` | `lib/overview.ts:78-111` → `OverviewView.vue`(首页 `/` 项目总览，**非** /payment) | 首页"回款重点带"：年度计划/实际、本月待回、7天临期数、延期 Top3 |
| `buildProjectDetail` | `lib/projectDetail.ts` → `ProjectDetailDrawer.vue`(跨页快速下钻抽屉) | 全量 rawNodes→`groupByProject`(摘要 6 态)+ 节点明细表(含 delayDays) |
| `buildProjectPage` | `lib/projectPage.ts` → `ProjectDetailView.vue` | rawNodes 产 `nodes`(当前项目，**已无渲染消费方**：主回款 tab 3A 已走 paymentNodes)+ `closedNodes`(原项目 tab，**恒空**) |

**closedNodes 专项调研结论**：`closedNodes` 自 2026-06-11 引入起对全部 296 个售前项目恒为空（`relatedClosedId` 指向 PMIS 已关闭项目，与 WPS 回款节点 sheet 的项目编号体系**零交集**），其 DataTable 受 `v-if="closedNodes.length"` 守卫**从不渲染**；"原项目"tab 实际显示的是 `originMilestones`(PMIS) + `originInfo`(closedPmis)，与 rawNodes 无关。判定为结构性死功能，下线无损。

## 目标

- 5 个活消费方全部改吃收款阶段口径，**前端不再有 `data.data.rawNodes` 数据消费点**（除 `data.ts` clearData 占位与 `RawNode` 类型本体，两者绑定 schema、随 3E-3 删）。
- 口径与已换源的兄弟页一致：金额节点级、状态收款阶段口径、复用 3B/3C 既有构件。
- 换源后产生的死代码（`groupByProject`/`ProjectAgg`/`dashboardStats.ts`）一并清除。

## 口径（用户 2026-06-17 钦定）

- **详情抽屉全面对齐 3C 台账**：摘要用 `projects`+`paymentPmis` 按项目聚合（进度 3 态 已全额/部分/未回款 + 延期正交，同 3C `ledgerRows`）；节点明细表用收款阶段列（阶段/计划日/已收/未收/实际比例/状态 5 态），**去 delayDays 列**、`nodeName`→`stage`。
- **governance 信号**：`yundocsOk = (data.projects?.length ?? 0) > 0`（项目主域已建立；不依赖手工投放的 collection_stages，不误报）。
- **paymentBand 延期 Top3 标识**：`nodeName`→`stage`（收款阶段名，如"验收款/预付款"；与 3C/3D 节点表一致）。
- **金额**：年度/本月/项目级均节点级——计划=`expectedPayment`、已收=`receivedAmount`、未收=`unpaidAmount`、完成率=Σ已收÷Σ计划。

## 范围

### 做

1. **`stores/filter.ts`**：`l4Options`/`pmOptions` 的数据源从 `data.data?.rawNodes` 改 `data.data?.projects`，字段 `orgL4`/`projectManager` 不变。
2. **`lib/governance.ts`**：`yundocsOk` 改 `(data.projects?.length ?? 0) > 0`。
3. **`lib/overview.ts` `paymentBand`**：函数签名改吃 `PayNodeRow[]`；`yearExpected/yearActual`(按 planDate 年份 Σexpected/Σreceived)、`monthPending`(当月 Σunpaid)、`dueSoon7`(planDate∈[今,+7] 且 status≠已回款 计数)、`delayedTop`(status==='延期' 按 unpaidAmount 降序 Top3，标识用 `stage`)。`OverviewView.vue`：传 `paymentNodeRows(data.data?.paymentNodes, data.data?.projects ?? [], data.data?.projectPmis)`；延期 Top3 模板 `t.nodeName`→`t.stage`。
4. **`lib/projectDetail.ts` `buildProjectDetail` + `ProjectDetailDrawer.vue`**：`buildProjectDetail` 改签名吃 `paymentNodes`/`projects`/`projectPmis`/`projectId`，内部用 `paymentNodeRows` 取该项目 PayNodeRow[]，**复用 3C `ledgerRows` 聚合取目标 projectId 的行**作摘要（`LedgerProjectRow`：projectId/projectName/projectManager/orgL4/tier/projectAmount/expectedPayment/actualPayment/remainingAmount/paymentRatio/paymentStatus(进度3态)/delayed/nodes），返回 `{ project: <该行>, nodes: PayNodeRow[] }`。`ProjectDetailDrawer.vue`：摘要字段映射到 LedgerProjectRow（旧 `projectType` 列若 projects/paymentPmis 无对应则随换源去除——plan 核实字段可得性）；`NODE_COLS` 改收款阶段列（阶段=stage/计划日=planDate/已收=receivedAmount/未收=unpaidAmount/实际比例=actualRatio/状态=status），去 delayDays。
5. **`lib/projectPage.ts` `buildProjectPage` + `ProjectDetailView.vue`**：去掉 `rawNodes` 参数与 `ProjectPageData` 的 `nodes`/`closedNodes` 字段；`ProjectDetailView.vue` 移除"原项目"tab 内 `page.closedNodes` 的 `<DataTable>`（保留 originMilestones/originInfo），删 `NODE_COLS` 若仅该表用。
6. **连带死代码清除**：详情抽屉脱离后，`lib/dashboardStats.ts` 的 `groupByProject`/`ProjectAgg` 再无活消费方（3E-1 曾为抽屉特意保留）→ 删 `groupByProject`/`ProjectAgg`，`dashboardStats.ts` 至此应空文件 → 整删（删前 grep 复核零活 import）；连带删其残余测试。

### 不做（留 3E-3）

- 后端：`rawNodes` JSON 键、`schema.AnalysisData.rawNodes`、`server.py node_action_date_from_data`、`snapshots.build_snapshot`。
- 前端 `RawNode` 类型本体（`types/analysis.ts` 自 schema 生成）、`stores/data.ts` 的 `rawNodes:[]` clearData 占位——两者绑定 schema rawNodes 键，3E-3 删后端时一并清。
- 不给后端 `PaymentNodePmis` 新增 `delayDays`（抽屉对齐 3C 用 status=延期，不要延期天数列）。
- 不改 collection_stages 手工投放流程；不动其它已换源页面。

## 文件结构与职责

| 文件 | 改动 |
|---|---|
| `frontend/src/stores/filter.ts` | l4Options/pmOptions 数据源 rawNodes→projects |
| `frontend/src/lib/governance.ts` | yundocsOk 改 projects.length>0 |
| `frontend/src/lib/overview.ts` | paymentBand 重写吃 PayNodeRow[] |
| `frontend/src/views/OverviewView.vue` | paymentBand 入参换 paymentNodeRows；延期 Top3 标识 nodeName→stage |
| `frontend/src/lib/projectDetail.ts` | buildProjectDetail 重写吃收款阶段、复用 ledgerRows 聚合 |
| `frontend/src/components/ProjectDetailDrawer.vue` | 摘要映射 LedgerProjectRow、节点表换收款阶段列、去 delayDays |
| `frontend/src/lib/projectPage.ts` | buildProjectPage 去 rawNodes 参数 + nodes/closedNodes 字段 |
| `frontend/src/views/ProjectDetailView.vue` | 移除原项目 tab 的 closedNodes DataTable |
| `frontend/src/lib/dashboardStats.ts` | 删 groupByProject/ProjectAgg → 整删文件 |
| 对应 `.test.ts` | 见"测试" |

## 接口与改法

- 收款阶段构件复用：`paymentNodeRows(paymentNodes, projects, projectPmis) → PayNodeRow[]`（lib/paymentPmis）；`ledgerRows(payNodeRows, projects) → LedgerProjectRow[]`（lib/ledger，3C）。
- `paymentBand` 返回结构 `PaymentBand` 不变（yearExpected/yearActual/monthPending/dueSoon7/delayedTop），仅内部口径与 delayedTop item 的标识字段(stage)调整；OverviewView 模板除 `t.nodeName→t.stage` 外不动。
- `buildProjectDetail` 取目标项目行：`ledgerRows(rows, projects).find(r => r.projectId === projectId)`（rows 为全量 paymentNodeRows，或先按 projectId 过滤再聚合——plan 定）；找不到返回空摘要 + 空 nodes（与旧"项目不存在"行为对齐）。
- 删 `groupByProject`/`ProjectAgg` 前 grep 复核：3E-1 已删 pivot 函数层（其曾用 groupByProject），此时仅 projectDetail.ts 引用；本期 4 改完后应零活 import。

## 测试

- `filter.test.ts`：l4Options/pmOptions 用 `projects` 夹具断言去重值域（移除/改写原 rawNodes 夹具）。
- `governance`/`dataQuality.test.ts`：补 `rawNodes=[]` 但 `projects` 非空 → `yundocsOk=true`、verdict 非红 的用例；及 projects 空 → 红色告警。
- `overview.test.ts`：换 PayNodeRow 夹具，测 paymentBand 年度/本月/7天/延期Top3(stage 标识、status==='延期'、按 unpaidAmount 降序)。
- `projectDetail` + `ProjectDetailDrawer`：新建/改测试——摘要取 3C 口径(进度3态+延期)、节点表渲染收款阶段列(阶段/已收/未收/实际比例/状态5态)、无 delayDays。
- `ProjectDetailView`(原项目 tab)：断言不再渲染 closedNodes 表、originMilestones 照常。
- 删 `groupByProject`/`dashboardStats.ts` 后其残余测试同删。
- 全量回归：`npm run typecheck` + `npx vitest run` + `npm run build` 全绿；后端 `pytest` 不受影响。

## 验证（声称完成前必跑）

```bash
bash verify.sh   # python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿
```

附加：构建后手验 `/`(首页回款带)、`/project/:id`(详情页 + 原项目 tab)、详情抽屉(列表下钻)、`/governance`、FilterBar 服务组/经理下拉——确认换源无回归、无 JS 报错。

## 版本与进度

- `frontend/src/version.ts` → **V1.6.8**（Z 级：多页活消费换源 + 连带死代码清除，无新页面）。
- `PROGRESS.md`：「全局下线 rawNodes 程序」⑤ 下记 3E-2 一条；更新 3E-3 待开范围（此后前端仅余 RawNode 类型 + data.ts 占位绑定 schema）。

## 取舍记录

- **详情抽屉全面对齐 3C 台账（用户钦定）**：抽屉与全页详情/台账/日历同口径（进度3态+延期、收款阶段节点列），复用 `ledgerRows`，避免再造聚合、避免口径分裂。
- **去 delayDays（用户钦定）**：收款阶段以 status=延期 表达延期，不引入延期天数列；与 3C/3D 一致，且不必为此给后端 PaymentNodePmis 加字段。
- **governance 用 projects.length（用户钦定）**：项目主域信号，不依赖手工投放的 collection_stages，避免未投放时误报红色告警。
- **closedNodes 下线（Path B，调研支撑）**：恒空死功能，下线无损当前显示；详见专项调研。
- **连带删 groupByProject/dashboardStats.ts**：换源后即死，本期清，避免遗留到 3E-3 增加后端移除的牵连面。
- **RawNode 类型 / data.ts 占位留 3E-3**：绑定 schema rawNodes 键，须与后端移除同步，单独提前删会造成 schema 与 TS 不一致。
