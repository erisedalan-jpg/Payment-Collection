# /insight/milestone 到期提醒表改造 设计文档（SP-4）

> 日期：2026-06-24　版本：V1.20.2（页内 Tab 局部改造，Z 位）
> 所属拆分：用户大需求(6 项)拆 4 子项目之 SP-4（末项）。SP-1 侧栏折叠 / SP-2 重点进展页 / SP-3 风险透视下钻 均已完成合 master。
> 状态：设计已与用户确认，待用户复核本 spec 后转 writing-plans。

## 1. 目标

把 `/insight/milestone`（里程碑管理）底部明细区「到期提醒」Tab（组件 `MilestoneReminderTab.vue`）从"固定三档时间窗 + 散装筛选条 + 只列未完成节点"改造为：

1. **时间段选择**替代固定三档（未来7天/30天/本季度 SegToggle）——起止日期选择器 + 快捷档，默认未来1个月。
2. **行口径升级为"含已完成"**：时间段内 `计划时间∈区间` 的全部里程碑节点都成行（不再跳过已完成），新增列标识完成状态。
3. **新增 3 列**：项目金额(万) / 实际完成时间 / 是否完成。
4. **照搬 /projects 表格栈**：选列（ColumnPicker，含上下移/重置/持久化）+ 逐列枚举筛选（ColumnFilter + crossFilter）+ 列排序（sortable）+ 按筛选导出 + 分页。
5. **汇总卡保留并改造**为含完成情况：到期节点总数 / 已完成 / 未完成 / 逾期未完成。

非目标：不动 MilestoneView 其它区块（KPI/图表）、不动「延期项目清单」「在建里程碑计划」两个 Tab、不动 /projects、不引入通用表格抽象组件。

## 2. 架构 / 改动面

复用 /projects 既有原语（方案 A，镜像 ProjectsView/KeyProjectsView），不新增共享抽象、不改 /projects：

| 文件 | 改动 |
|---|---|
| `frontend/src/components/MilestoneReminderTab.vue` | 重建为 /projects 式表格栈（时间段选择 + ColumnPicker + ColumnFilter + DataTable + 分页 + 导出 + 汇总卡） |
| `frontend/src/lib/milestoneDetailRows.ts` | 扩 `ReminderRow`/`buildReminderRows`（新口径 + 新字段 + 时间段边界入参）、改 `reminderStat`（含完成情况四项） |
| `frontend/src/components/MilestoneReminderTab.test.ts` | 重写/补测试 |
| `frontend/src/lib/milestoneDetailRows.test.ts` | 补/改到期提醒相关用例 |

复用既有（不改）：`useColumnPrefs`（列偏好持久化）、`ColumnPicker`、`ColumnFilter`、`crossFilter` store（`applyColumnFilters`/`cfUniqueValues`/`tableFilters`/`setColumnFilter`/`clearColumn`/`clearAll`/`hasFilters`）、`DataTable`、`exportRows`（`lib/exportXlsx`）。分页用本地态（`pageSize`/`currentPage`/`paged` + `watch(filtered)` 重置页码，镜像 ProjectsView），不用 `usePagedRows`。

## 3. 数据层（lib/milestoneDetailRows.ts）

### 3.1 行口径（含已完成）

`buildReminderRows(ps: MilestoneProject[], now: Date, range: { start: string; end: string } | null): ReminderRow[]`

- 签名由 `(ps, now, win: ReminderWin)` 改为 `(ps, now, range)`。`range` 为 `{start,end}`（YYYY-MM-DD 闭区间，作用于 planDate）；`range=null` 表示不限区间（全部到期节点）。
- 遍历每项目每节点：取 `pd = planDate.slice(0,10)`；`pd` 为空跳过；`range` 非空时 `pd<start || pd>end` 跳过；**不再 `if (actualDate) continue`**（已完成节点照常成行）。
- 每行字段（在原有基础上加 4 个）：
  - 原有：`projectId/projectName/projectType/manager/orgL3/orgL4/node/planDate/payStage/linked('是'|'否')/priority/priorityLabel/urgency('urgent'|'warn'|'')`。
  - 新增：`contract: number`（项目金额，取 `p.contract`）、`actualDate: string`（实际完成时间，`actualDate.slice(0,10)`，未完成为 `''`）、`done: '是' | '否'`（actualDate 非空=是）、`overdue: boolean`（`pd<今日 && !actualDate`，逾期未完成）。
  - `urgency` 含义不变（diff≤3→urgent、≤7→warn），仅对未完成节点有意义；已完成节点 `urgency=''`（不标紧迫色）。

### 3.2 汇总（reminderStat 改造）

`reminderStat(rows: ReminderRow[]): ReminderStat`，`ReminderStat = { total; done; undone; overdue }`：
- `total` = rows.length（到期节点总数）
- `done` = `done==='是'` 计数
- `undone` = `done==='否'` 计数
- `overdue` = `overdue===true` 计数（逾期未完成：planDate<今且未完成）

（不再用 within7/withinWeek；`now` 参数不再需要，逾期判定在行构建时已定。）

### 3.3 时间段边界

新增 `reminderRange(now: Date, preset: 'd7' | 'm1' | 'quarter'): { start: string; end: string }`，用现有 `reminderBounds`/`addDays`/`ymd`/`addMonths`（如无 addMonths 则用 Date 月运算）派生：
- `d7`：今 → 今+7天
- `m1`：今 → 今+1月（默认）
- `quarter`：本季度起 → 本季度止（沿用 `reminderBounds` 的 qs/qe）

start 一律取今日（向后看），quarter 用季度边界。自定义区间由 el-date-picker 直接给 {start,end}。

## 4. 时间段选择（MilestoneReminderTab.vue）

- 顶部工具栏：`el-date-picker` `type="daterange"` value-format `YYYY-MM-DD`（绑定本地 `range` ref）+ 三个快捷档按钮（未来7天 / 未来1个月 / 本季度），点击写入对应 `reminderRange` 结果。
- 默认进页 = 未来1个月（onMounted/初始 ref 设为 `reminderRange(now,'m1')`）。
- 清空选择器 → `range=null` → 全部到期节点。
- 区间过滤 planDate（在 `buildReminderRows` 内完成）。

## 5. 表格栈（列 / 筛选 / 排序 / 选列 / 分页）

### 5.1 全列（14）

| key | label | 默认可见 | 可筛选 | 可排序 | 备注 |
|---|---|---|---|---|---|
| projectId | 项目编号 | ✓ | | | 链接样式 |
| projectName | 项目名称 | ✓ | | | wrap |
| contract | 项目金额(万) | ✓ | | ✓ | formatter 元→万 |
| projectType | 项目类型 | | ✓ | | |
| manager | 项目经理 | ✓ | ✓ | | |
| orgL3 | L3部门 | | ✓ | | |
| orgL4 | L4部门 | ✓ | ✓ | | |
| node | 到期节点 | ✓ | ✓ | | |
| planDate | 计划时间 | ✓ | | ✓ | urgent/warn 标色 |
| actualDate | 实际完成时间 | ✓ | | ✓ | 未完成显 '-' |
| done | 是否完成 | ✓ | ✓ | | StatusBadge 是=ok/否=mut |
| payStage | 回款阶段 | | | | wrap |
| linked | 是否关联回款 | | ✓ | | StatusBadge |
| priorityLabel | 处置优先级 | ✓ | ✓ | | StatusBadge danger/warn/mut |

- `FILTERABLE = {projectType, manager, orgL3, orgL4, node, done, linked, priorityLabel}`（表头 ColumnFilter 枚举，值由 `cfUniqueValues(rows,key)` 派生）。
- 另留「编号/名称」搜索框（`el-input`，匹配 projectId/projectName 子串），作为非列枚举的特殊筛选（类比 ProjectsView 的 search）。
- 排序：contract / planDate / actualDate 挂 `sortable: true`（DataTable/el-table 原生列排序）。

### 5.2 选列 / 持久化 / 分页 / 行为

- `TABLE_ID = 'milestone-reminder'`；`useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)` 管列显隐与顺序；`ColumnPicker` 接 toggle/move-up/move-down/reset；`onToggle` 隐藏列时连带 `cf.clearColumn(TABLE_ID,key)`（镜像 ProjectsView）。
- 过滤链：`filtered = 关键词筛(applyColumnFilters(winRows, cf.tableFilters(TABLE_ID)))`；`winRows = buildReminderRows(projects, now, range)`。
- 分页：本地 `pageSize`(默认50)/`currentPage`，`paged = filtered.slice(...)`，`watch(filtered)` 重置页码；`el-pagination` 20/50/80/100。
- 行点击 → `router.push('/project/'+projectId)`。
- 「清除所有筛选」按钮：`cf.hasFilters(TABLE_ID)` 时显示，点 `cf.clearAll(TABLE_ID)`。
- 进页 `cf.clearAll(TABLE_ID)` 清残留（本 Tab 无深链需求，仅防跨导航残留）。

## 6. 汇总卡（保留改造）

表上方四张卡，按 `filtered`（当前筛选结果）实时算（`reminderStat(filtered)`）：到期节点总数 / 已完成 / 未完成 / 逾期未完成。沿用现有 `.mrt-stats`/`.mrt-card` 令牌样式；数字挂 `.u-num`；逾期未完成卡可用 danger 文字色。

## 7. 导出（按筛选导出）

- 工具栏「导出Excel」按钮：`exportRows('里程碑到期提醒_{filtered.length}条.xlsx', filtered.map(行→中文键对象))`，导出当前筛选后**全部行、全部数据列**（单表）。
- 列中文键覆盖 14 列（项目编号/项目名称/项目金额(万)/项目类型/项目经理/L3部门/L4部门/到期节点/计划时间/实际完成时间/是否完成/回款阶段/是否关联回款/处置优先级）。金额导出为万元数值。

## 8. 测试

- **lib/milestoneDetailRows（vitest）**：
  - `buildReminderRows` 含已完成：区间内已完成节点成行、`done='是'`/`actualDate` 填充；未完成 `done='否'`/`actualDate=''`。
  - `overdue` 派生：planDate<今且未完成=true；已完成或未来=false。
  - 区间边界：start/end 端点含（闭区间）；区间外不取；`range=null` 取全部。
  - `reminderRange` 三档（d7/m1/quarter）start=今、end 正确。
  - `reminderStat` 四项计数（total/done/undone/overdue）。
- **组件 MilestoneReminderTab（vitest）**：
  - 默认进页区间=未来1个月、表渲染；快捷档点击改区间；清空区间=全部。
  - ColumnPicker 选列（toggle 改可见列）；ColumnFilter 表头枚举筛选改 filtered；关键词搜索框筛 id/name；列排序 sortable 标记存在。
  - 汇总卡四项随 filtered 变。
  - 按筛选导出调用 `exportRows`（filtered 行数、列键正确）——spy 断言。
  - 行点击跳 `/project/:id`。
  - 空数据/空区间空态不报错。
- **验证**：`bash verify.sh` 全绿；手动冒烟：选区间/快捷档、开关列、表头筛选、排序、导出核条数与列。

## 9. 边界 / 错误

- 无到期节点（区间空或无数据）→ 空表 + 空态提示，不报错。
- 已完成节点 `urgency=''` 不标紧迫色；逾期未完成（overdue）计划时间列标 danger。
- 售前项目金额沿用 milestone 域 `p.contract`（与现有「在建里程碑计划」列同源；本期不改 milestone 合同口径）。
- 列偏好/筛选持久化 key 独立（TABLE_ID='milestone-reminder'），与 /projects、/payment 等表互不干扰。

## 10. 范围与版本

- 纯前端，无后端、无 schema、无核心口径改动；部署只需 dist。
- 版本 **V1.20.2**（`frontend/src/version.ts` 单一来源，Z 位），与累积未上线版本（V1.17.1~V1.20.1）一并待用户要求时打包。
- 禁止 emoji；commit 末尾 Co-Authored-By 行；spec/plan 文档写盘不 commit（沿用 SP-1..3 约定）。
