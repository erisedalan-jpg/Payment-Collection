# 设计文档 —— /insight/costdetail 改造 + 全站筛选 UX 修复（V2.5.4）

> 状态：brainstorming 已与用户确认 4 项口径（沿用 /projects 同口径 / 未超支=总+交付都不超支 / 大于5000=overspendAmount>5000 / 售前仅三列预算取原项目）。本稿待用户 spec 评审 → writing-plans。
> 目标版本 V2.5.4（Z 级·页内局部调整，纯前端，在线现 V2.5.3）。

## 0. 背景与目标

两件独立的事，合一份 spec、分两段实现各自验证：

- **Part 1**：`/insight/costdetail`（成本分析）取数与展示修正——四卡换口径、图与汇总表打磨、明细表加「交付成本状态」列、**修售前服务类项目预算取数异常**（现读自身空 cost→显示 0；改回退原项目）。
- **Part 2**：全站涉筛选表格的两个 UX 缺陷——①筛选某列后，其他列筛选项不随之收窄（仍列全量）；②点筛选图标会误触发表头排序。两者均改**共享组件 `ColumnFilter.vue`** 一处，覆盖全部 9 页。

**取数原则（用户钦定）**：如未特殊强调，数据与口径取自 `/projects`（`riskReasons`）与 `/project/:id`，单一来源；不在本页另起一套口径。

---

## Part 1 —— /insight/costdetail 改造

### 1.1 数据源与既有保留

- 行装配仍走 `lib/costAnalysis.ts buildCostRows(projects, pmis)`；`projects`=主域 `data.projects`，经 `baseProjects`（已接 `filter.excludeOn` 标签排除，**1.1「需支持 /data 标签排除」已满足，保留并回归核验**）。
- **保留不变**：超支项目分布图与 L4 汇总表的 `超支不足5k/超支大于5k`（±5000 档）、明细表旧「成本状态」列（±5000 档）。本次仅按下列条目改动，不改这三处的 ±5000 口径。

### 1.2 四张 KPI 卡（计数沿用 `riskReasons` 同口径）

`buildCostRows` 为每行补三个派生字段（由 `riskReasons(project, pmis)` 结果判定，**与 /projects、首页异常卡单一来源**）：
- `totalOverspend: boolean` = `riskReasons` 含 `总成本超支`（即 `overspendAmount>0` 或 `cost.项目超支` flag 或 `cost.消耗比>1`）
- `deliveryOverspend: boolean` = `riskReasons` 含 `交付成本超支`（`cost.交付超支` flag）
- `overspendAmount: number` = `project.overspendAmount ?? 0`

> 售前项目按 Q4：`riskReasons` 用售前**自身** project+pmis，故售前 `totalOverspend/deliveryOverspend` 均为否（自身 flag=否/0），不计入超支卡。异常项目（orgL4 空）`riskReasons` 短路只返 `数据异常`，故两超支均否、计入「未超支」（与 /projects 一致）。

`costKpis(rows)` 改为返回（**不再剔 XS**）：
| 卡名 | 取值 |
|---|---|
| 成本统计项目数 | `rows.length`（在建项目总数，含 XS/售前/异常） |
| 未超支 | `rows.filter(r => !r.totalOverspend && !r.deliveryOverspend).length` |
| 总成本超支数 | `rows.filter(r => r.totalOverspend).length`；**子内容** 标题「超支大于5000」、数字 `rows.filter(r => r.totalOverspend && r.overspendAmount > 5000).length` |
| 交付成本超支数 | `rows.filter(r => r.deliveryOverspend).length` |

- 卡片用 `MetricGrid`，子内容用 `MetricGrid` item 的 `sub` 字段（"超支大于5000: N"）。色：成本统计 `--txt`、未超支 `--ok`、总成本超支 `--danger`、交付成本超支 `--danger`（或 `--c-urgent` 区分，实现时定，仅状态色令牌）。
- **KPI 点击就地筛选明细表**：旧 `onKpiClick` 写 crossFilter `status` 列改为本地 `kpiFilter` 态（`'all'|'notOverspent'|'totalOverspend'|'deliveryOverspend'`）；明细 `filtered` 末段按 `kpiFilter` 过滤（成本统计→all 清空、未超支→`!total&&!delivery`、总成本超支→`total`、交付成本超支→`delivery`）。点已选卡再点或点成本统计卡复位。

### 1.3 超支项目分布图（`distOption`）

- 卡标题 `超支项目分布(按 L4,剔 XS)` → **`超支项目分布`**（去括号内容；底层 `costL4Dist` 仍剔 XS，不动计算）。
- **拉长图、收紧下方留白**：`ChartBox` 高度 300px → 约 420px（与右侧 L4 汇总表卡视觉等高）；`distOption.grid` 适配（`top`/`bottom` 调整减少空白，`legend` 仍 `top:0`）。具体像素实现时按真机微调，仅图形尺寸像素例外（设计令牌豁免）。

### 1.4 L4 部门成本情况汇总表 —— 支持选列

- 复用 `ColumnPicker.vue` + `useColumnPrefs`（与 /projects 同款），`TABLE_ID='cost-l4-summary'`。
- `L4_COLS` 全部列纳入可选；`DEFAULT_VISIBLE` = 现有全列；卡头加 `<ColumnPicker>`。
- `visibleColumns` 按 prefs 过滤后传 `DataTable`。无分页（汇总表行少，维持现状）。

### 1.5 项目成本明细表

#### 1.5.1 标题
`项目成本明细(按 L4 组织排序)` → **`项目成本明细`**（去括号及内容）。默认排序口径（先 L4 升序）不变，仅改显示文案。

#### 1.5.2 新增「交付成本状态」列（`deliveryStatus`）
位置：放在「剩余预算(元)」之后、两交付剩余列附近（实现时定，建议紧邻交付两列）。`buildCostRows` 计算 `deliveryStatus`，由 `deliveryDeptRemaining`(部门)、`deliveryOutsourceRemaining`(外包) 判定（**`<0`=超支、`≥0`=不超支，覆盖 =0**）：

| 部门剩余 | 外包剩余 | 交付成本状态 |
|---|---|---|
| ≥0 | ≥0 | 未超支 |
| <0 | ≥0 | 交付预算超支 |
| ≥0 | <0 | 交付外包超支 |
| <0 | <0 | 原厂外包均超支 |

- 用 `StatusBadge` 渲染（tone：未超支 `ok`、交付预算超支 `warn`、交付外包超支 `warn`、原厂外包均超支 `danger`；实现时定，状态色令牌）。
- **交付成本状态对所有行（含售前）一律由本表 `deliveryDeptRemaining`/`deliveryOutsourceRemaining` 两列计算**；这两列取自 `Project.deliveryCosts`（来源 `delivery_analysis.csv`，同 /project/:id，V2.5.1 已约定）。售前同样有真实 delivery_analysis 数据（实测 638 行全有 deliveryCosts，交付部门剩余非 0 的 573、交付外包剩余非 0 的 308），**非空**，故售前交付成本状态据其真实交付剩余判定，售前不特殊处理。

#### 1.5.3 售前服务类项目三列预算改取原项目（修取数异常）
`buildCostRows` 内，对 `project.isPresale && project.relatedClosedId && pmis[relatedClosedId]` 的行：
- `totalBudget` = `pmis[relatedClosedId].cost.总预算 ?? 0`（原项目总预算）
- `actualCost` = `(pmis[relatedClosedId].cost.核算 ?? 0) + (pmis[projectId].cost.核算 ?? 0)`（原项目核算 + 售前自身核算）
- `remaining` = `totalBudget - actualCost`（派生，不读 `cost.剩余预算`）

其余（非售前、或售前无 `relatedClosedId` 的 7 个）维持现状：读自身 `cost.{总预算,核算,剩余预算}`。
- **连带**：明细表旧「成本状态」列由 `costStatusOf(显示的 remaining)` 派生，故售前此列将反映原项目口径（自然一致，非额外改动）。新「交付成本状态」列与四卡超支判定仍按售前自身（Q4），不受此影响。
- 导出（`onExport`）随新列集同步（含交付成本状态、售前调整后的三列值）。

### 1.6 `lib/costAnalysis.ts` 改动汇总
- `CostRow` 加字段：`totalOverspend/deliveryOverspend: boolean`、`overspendAmount: number`、`deliveryStatus: '未超支'|'交付预算超支'|'交付外包超支'|'原厂外包均超支'`。
- `buildCostRows(projects, pmis)`：售前三列回退原项目；调用 `riskReasons` 派生超支布尔；计算 `deliveryStatus`。
- `costKpis(rows)`：返回 `{ total, notOverspent, totalOverspend, totalOverspendOver5k, deliveryOverspend }`（不剔 XS）。
- 新增纯函数 `deliveryStatusOf(deptRemain, outsourceRemain): string`（4 态，vitest 覆盖边界 含 =0）。
- `costL4Dist/costL4Summary/costStatusOf/isXs` 不变。

---

## Part 2 —— 全站筛选 UX 修复（`ColumnFilter.vue` 一处）

**覆盖页面（均经共享 `ColumnFilter`）**：/projects、/projects/closed、/opportunities、/insight/costdetail、/projects/key、/opportunities/key、/projects/temp、/risk、**/insight/milestone（其「到期提醒」tab `MilestoneReminderTab` 用 ColumnFilter）**。一处改，9 页生效；无需逐页改、无 milestone 特例。

### 2.1 级联筛选选项（选项随其他列筛选收窄）
- 现状：`uniques = cfUniqueValues(props.sourceRows, colKey)` —— 读**全量** `sourceRows`，选项不随其他列收窄。
- 改：选项从「被**其他列**筛选后的行」计算（排除本列自身的筛选）：
  ```
  otherFilters = { ...store.tableFilters(tableId) } 去掉 [colKey]
  scopedRows = applyColumnFilters(props.sourceRows, otherFilters)
  uniques = cfUniqueValues(scopedRows, colKey)
  ```
- `ColumnFilter.vue` 引入 `applyColumnFilters`（lib/crossFilter）；`apply()` 仍用 `uniques.length` 作 totalCount（= 跨其他列筛选后的可见值数，"全选可见=该列无约束"语义正确）。
- 打开弹层初始化 `selected`：现有筛选值 ∩ 当前可见 uniques（去掉已被其他列筛掉的陈旧值）；无现有筛选→全选可见。
- **不联动本列自身**（避免选了就把自己选项删空）：scopedRows 只排除本列。

### 2.2 点筛选不误触发排序
- 现状：`.cf-icon` 触发器在可排序表头内，点击冒泡到 el-table 表头 → 触发排序。
- 改：触发器 `@click.stop`（必要时 `@mousedown.stop`），阻断冒泡到表头排序；**确认 el-popover 仍能正常打开**（el-popover 监听 reference，stop 仅阻断向祖先 th 冒泡）。若 stop 影响 popover 打开，则用 `v-model:visible` 受控 + 在 `@click.stop` 里手动 toggle `visible`（备选方案，实现时取能同时满足"开弹层+不排序"者）。

---

## 测试

- **costAnalysis.test.ts**：`deliveryStatusOf` 4 态边界（含 =0 归不超支）；`buildCostRows` 售前三列回退原项目（总=原总预算、已核算=原核算+售前核算、剩余=总−已核算）、非售前不变、售前无 relatedClosedId 回退自身；`totalOverspend/deliveryOverspend` 与 riskReasons 一致；`costKpis` 新五值（不剔 XS、未超支=两维度皆否、大于5000=overspendAmount>5000）。
- **CostDetailView.test.ts**：四卡文案/取值（成本统计=总数含 XS、子内容大于5000）、KPI 点击就地筛选（总/交付/未超支/全部）、明细表交付成本状态列存在+渲染、L4 汇总选列、标题去括号、售前行三列取原项目值、导出列同步。
- **ColumnFilter.test.ts**：级联——设 A 列筛选后 B 列 `uniques` 仅含 A 筛选后行的 B 值；本列自身不被自己筛掉；`@click.stop` 不触发表头排序（或经视图层断言排序态不变）。
- **riskClassify/riskReasons 等既有测试**：不回归。

## 验证（harness）
- `bash verify.sh` 全绿（pytest + ruff + 前端 typecheck/vitest/build）。
- 真机冒烟（admin 登录，[[design-review-screenshot-harness]]）：
  - costdetail：四卡数值（真实数据核对 未超支+总超支∪交付超支=总数 关系、总超支=68/交付=39/大于5000 子数、成本统计=638）、售前行三列非 0、交付成本状态列、图拉长、L4 选列、零 console 错误。
  - 筛选：在 /projects 筛 L4=某组后，点项目经理筛选只列该组经理（级联生效）；点 ▼ 不排序。

## 已定边界（请 spec 评审确认）
1. 图（超支分布）与 L4 汇总表、明细旧「成本状态」列**保留 ±5000 口径**，仅四卡换总/交付口径（与卡不完全对齐，用户已认可）。
2. 交付成本状态：`=0` 归「不超支」侧（部门/外包剩余 `≥0` 视为不超支）。
3. 售前无 `relatedClosedId`（7 个）三列回退自身（0）。
4. 售前「交付成本状态」由本表两交付剩余列（`deliveryCosts`/delivery_analysis.csv，同 /project/:id，售前有真实非空数据）判定；「四卡超支判定」按售前自身字段；仅总预算/已核算/剩余三列显示取原项目（连带旧「成本状态」列随显示 remaining 反映原项目）。
5. 成本统计项目数 = 本页全部行（含 XS/售前/异常），不再剔 XS。
6. 明细表旧「成本状态」列**保留**（未要求删；如要删 spec 评审告知）。

## 不做（YAGNI）
- 不改后端 / schema / preprocess（纯前端）。
- 不动 /opportunities 的自有列集（OPP_COLUMNS）以外结构。
- 不把图/L4 汇总迁到总/交付口径（除非评审要求）。
- 命令面板、其他页面美化等不在本轮。
