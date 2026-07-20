# SP-B2 里程碑管理页（明细半·三张表）— 设计文档

> 状态：自主执行（用户 2026-06-20 授权直至 SP-C 完成、按推荐执行、不逐步确认）。父设计 `…/2026-06-19-insight-analysis-hub-integration-design.md` §4 tab①②③；SP-B1 已合入 master(603dc0f)。
> 目标版本：V1.16.0（同整合，不再 bump）。

**Goal：** 在 `/insight/milestone`（SP-B1 概览的下方）补齐同事 `milestone.html` 的三张明细表 tab——**延期项目清单 / 里程碑到期提醒（节点级） / 在建项目里程碑计划（宽表）**，各含工具栏多筛选、客户端分页、Excel 导出，数据全取自我方 `analysis_data.json`。

**Architecture：** 复用 `DataTable`/`SegToggle`/`exportXlsx`/`cfUniqueValues`；纯计算（行构造）集中在新 `lib/milestoneDetailRows.ts`（全 vitest 覆盖）；分页 DRY 到新 `lib/usePagedRows.ts` 组合式；三张表各拆独立组件 `MilestoneDelayedTab.vue` / `MilestoneReminderTab.vue` / `MilestonePlanTab.vue`，`MilestoneView.vue` 下方加 `SegToggle` + 三段条件渲染。`buildMilestoneProjects` 增 `orgL3` 字段（加 team.L3部门，向后兼容）。

---

## 1. 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/lib/milestoneAnalytics.ts` | 改 | `MilestoneProject` 增 `orgL3: string`；`buildMilestoneProjects` 填 `orgL3 = projectPmis[pid].team?.L3部门`（trim，缺为 ''） |
| `frontend/src/lib/milestoneDetailRows.ts` | 新建 | `buildDelayedRows(ps, now)` / `buildReminderRows(ps, now, win)` / `buildPlanRows(ps)` + 行类型 + 私有 `ymdStr`/节点日期助手 |
| `frontend/src/lib/usePagedRows.ts` | 新建 | 组合式 `usePagedRows(source: Ref<any[]>, size=50)` → `{ paged, currentPage, pageSize }`，source 变更重置页码 |
| `frontend/src/components/MilestoneDelayedTab.vue` | 新建 | tab① 延期清单：状态汇总条 + 工具栏(状态/ L4 多选 + 经理/关键词文本 + 重置/导出) + 表 + 分页 |
| `frontend/src/components/MilestoneReminderTab.vue` | 新建 | tab② 到期提醒：时间窗按钮 + 4 统计卡 + 工具栏(L4/节点/优先级 多选 + 经理/关键词 + 重置/导出) + 表 + 分页 |
| `frontend/src/components/MilestonePlanTab.vue` | 新建 | tab③ 在建计划宽表：关键词 + 重置/导出 + 横滚宽表 + 分页 |
| `frontend/src/views/MilestoneView.vue` | 改 | 图表下方加 `SegToggle`(三 tab) + 三段 `<MilestoneXxxTab>` |
| 复用（不改） | — | `DataTable` / `SegToggle` / `lib/exportXlsx`(exportRows) / `lib/crossFilter`(cfUniqueValues) / `lib/format` / `useDataStore` / `useFilterStore`(剔除) |

---

## 2. 域与剔除（同 SP-B1）

三张表的数据域 = SP-B1 的 `mps`（`buildMilestoneProjects(projects, projectPmis, projectMilestones, {excludeOn, excludedIds})`，含售前节点回退 + 全局标签剔除）。`MilestoneView` 已有 `mps` computed，把它作为 prop 传给三个 tab 组件（`:projects="mps"`），并把 `now`（`new Date()`）传给需要的 tab（延期/到期）。剔除控件已在概览工具栏，明细表随 `mps` 自动同步。

`buildMilestoneProjects` 增 `orgL3`（team.L3部门），供 tab 列「L3部门」。`orgL4`/`orgL3_1`/`manager`/`projectType` 已在 `MilestoneProject`。

---

## 3. 行构造口径（`lib/milestoneDetailRows.ts`，纯函数）

**今日串** `ymdStr(now)` = `YYYY-MM-DD`；节点取 `node.planDate.slice(0,10)`。

### tab① `buildDelayedRows(ps, now)` → `DelayedRow[]`
- 取 `status !== '正常'` 的项目（即 延期/严重延期/未发布）。
- 行字段：`projectId / projectName / projectType / orgL3 / orgL4 / manager / status(MilestoneStatus) / delayedNodes(string)`。
- **`delayedNodes`（用户决策派生口径）** = 该项目 `nodes` 中 `planDate.slice(0,10) < ymdStr(now)` 且 `actualDate` 空 的 `name`，去重后以 `、` 连接；无则 `'-'`。

### tab② `buildReminderRows(ps, now, win)` → `ReminderRow[]`（`win: '7d'|'30d'|'quarter'`）
- 对每个项目每个**未完成且 planDate∈窗口**的节点产生一行（窗口定义同 SP-B1 `reminderBuckets`：7d=[今,今+7]、30d=[今,今+30]、quarter=[季初,季末]；`actualDate` 非空跳过）。
- 行字段：`projectId / projectName / projectType / manager / orgL3 / orgL4 / node(name) / planDate / payStage / linked('是'|'否'=payStage 非空) / priority('high'|'mid'|'low') / priorityLabel('高'|'中'|'低') / urgency('urgent'|'warn'|'')`。
- `urgency`：`diff = 日差(planDate - 今)`；`diff<=3`→`'urgent'`、`<=7`→`'warn'`、否则 `''`（列染色用）。
- 同时导出 `reminderStat(ps, now, win)` → `{ projectCount, nodeCount, within7, withinWeek }`：项目数=去重 pid、节点数=行数、within7=planDate∈[今,今+7] 计数、withinWeek=planDate∈[今,本周末] 计数。

### tab③ `buildPlanRows(ps)` → `PlanRow[]`
- 每个项目一行（全部 `ps`，即在建主域）。
- 元字段：`projectId / projectName / contract(项目金额,元) / orgL3 / orgL3_1 / orgL4 / manager / projectType`。
- 12 节点类型动态列（我方实测值域）：`NODE_TYPES = ['项目启动','到货','服务进场','交付完工','初验','项目完工（服务离场）','终验','项目关闭','驻场','实物点验','服务完成','节点成果确认']`，每类型两列 `计划_<type>` / `实际_<type>` = 该项目同名节点的 planDate / actualDate（取首个匹配，slice(0,10)，空为 ''）→ 24 列。导出 `NODE_TYPES` 常量供组件生成列。

---

## 4. 三个 tab 组件（忠实对方）

公共：工具栏多筛选用内联 `el-select multiple collapse-tags clearable`（选项 `cfUniqueValues(rows,key)` 或固定枚举）+ `el-input` 文本；分页用 `usePagedRows`；导出用 `exportRows(filename, filteredRows)`（**导出当前筛选全量、非仅当前页**）；表格列编号项目→`#cell-projectId` 渲染可点链跳 `/project/:id`（用 `useRouter`）。状态/优先级徽章用「淡底深字」三态（`--ok-bg/--ok-text` 等，对齐 CLAUDE.md 状态三态）。

### tab① 延期清单
- 顶部状态汇总条：四块 正常/延期/严重延期/未发布 计数（基于传入 `projects` 全量 `statusKpis`，不随筛选变——对齐对方 summaryBar）。
- 工具栏：里程碑状态(multi，枚举 延期/严重延期/未发布，默认全选) + L4(multi) + 项目经理(text 模糊) + 关键词(text 配编号/名称) + 重置 + 导出。
- 列：项目编号(链)/项目名称/项目类型/L3部门/L4部门/项目经理/里程碑状态(徽章)/延期节点。分页 50。

### tab② 到期提醒
- 时间窗用 `SegToggle v-model="win"`（`options` 值 `7d|30d|quarter`，`data-test="seg-7d|seg-30d|seg-quarter"`，标签 未来7天/未来30天/本季度，默认 `7d`）。
- 4 统计卡（`reminderStat`）：待提醒项目数/到期节点总数/7天内到期/本周到期。
- 工具栏：L4(multi) + 到期节点(multi，选项=当前 rows 的 node 去重) + 处置优先级(multi 高/中/低) + 项目经理(text) + 关键词(text) + 重置 + 导出。
- 列：序号/项目编号(链)/项目名称/项目类型/项目经理/L3部门/L4部门/到期节点(徽章)/计划时间(按 urgency 染色)/回款阶段/是否关联回款(是绿/否灰)/处置优先级(高红中黄低蓝徽章)。分页 50（页大小 20/50/100）。

### tab③ 在建里程碑计划（宽表）
- 工具栏：关键词(配编号/名称) + 重置 + 导出。
- 列：序号/项目编号(链)/项目名称/项目金额(`¥` 右对齐,`.u-num`)/L3部门/L3-1部门/L4部门/项目经理/项目类型 + 24 动态日期列（每类型 计划/实际）。`项目名称` 列 `fixed:'left'`；外层 `.ms-scroll{overflow-x:auto}` 横滚（宽表 min-width 大）。空值显 `-`。分页 50（50/100）。

---

## 5. MilestoneView 接线
- 图表区下方加 `SegToggle v-model="tab"`，`TAB_OPTS=[{value:'delayed',label:'延期项目清单'},{value:'reminder',label:'到期提醒'},{value:'plan',label:'在建里程碑计划'}]`，默认 `'delayed'`。
- 三段 `v-if="tab==='…'"` 渲染对应组件，传 `:projects="mps"`（延期/到期再传 `:now="now"`，`now` 为 `MilestoneView` 内 `new Date()`）。
- 图 E 点击下钻当前打开 modal（SP-B1）；本期**可选**把下钻改为「切到 plan tab」——为降耦合与稳定，本期**保持 modal 不变**，记 backlog（对方是跳 Tab3，本平台 modal 已满足查看，差异可接受）。

---

## 6. 设计规范 / 测试
- 仅 theme.css 令牌；状态/优先级徽章用三态淡底深字；金额/日期/计数列挂 `.u-num`；无 emoji；无散值。
- `milestoneDetailRows.test.ts`：三 row-builder 全口径（延期节点派生、未完成+窗口过滤、宽表节点日期映射、售前节点经 mps 已回退、空值）；`usePagedRows.test.ts`（切片、源变更重置页码）；`buildMilestoneProjects` orgL3 字段（改 SP-B1 测试）；三个 tab 组件挂载冒烟（筛选改变行数、分页、导出触发、链接列、徽章）。
- 真实数据冒烟：三表行数/筛选/分页/导出合理。`bash verify.sh` 全绿。

## 7. 真实数据锚点（沿用 SP-B1 §10 + 本期）
- 主域 624；里程碑状态 正常331/严重延期258/延期8/未发布27；节点 4879/项目 805；节点名值域 12 类（见 §3 NODE_TYPES，对方 13 类含「节点成果确认」我方实测亦有）。
- `team.L3部门` 经 `projectPmis[pid].team` 取（实测存在）。
