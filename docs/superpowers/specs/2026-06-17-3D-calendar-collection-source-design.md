# 3D 回款日历 /calendar 换源（节点级收款阶段口径）设计

> 2026-06-17 立项。隶属「全局下线 rawNodes 旧口径程序」第④步（3A 详情页、3B 回款总览、3C 台账已合并 master）。
> 把回款日历 `/calendar`（CalendarView）从 rawNodes 旧口径换到 3A 收款阶段口径。
> 与前三期不同：**需后端小改**——日历的 orgL3(PM L3-1部门) 筛选在收款阶段/projects 域无对应，
> 经用户确认从 `组织架构.xlsx` 按项目经理姓名查得，故新增 `Project.orgL3`。

## 背景与现状（已测绘证实）

- `/calendar`（`CalendarView.vue`）是 rawNodes 依赖最重的页：
  - `rawNodes` → `excludeFilter`（纳管排除）→ `excludedNodes`，喂 `lib/calendar.ts` 绝大多数函数；
  - `filter.filteredNodes`（年份/视角过滤的 rawNodes）→ `calDashboardStats`（仅 dashboard 这一路混用）。
- `lib/calendar.ts` 函数（均消费 RawNode）：`calExcludePaid` / `calFilterOptions` / `applyCalFilters` /
  `calDashboardStats` / `calDateData` / `calMonthGrid` / `calListNodes` / `calListGroups` / `calUpcoming` /
  `calAgendaGroups` / `calYearHeat` / `calDayTooltipText`。消费字段：planDate / isPaymentRelated /
  nodeStatus(旧 7 态) / expectedPayment / actualPayment / actualPaymentRatio / orgL3 / orgL4 / projectManager。
- 5 个组件：CalGrid（statusClass 着色）/ CalDayDetail（按状态分组）/ CalNodeTable（节点表，含 nodeStatus 列）/
  CalAgenda（按日期分组）/ CalYearHeat（按月待回款热力）。
- `lib/calendar.ts` 为日历专用（仅 CalendarView 使用）→ 可**就地换源**。
- `excludeFilter`(lib/ledger) 仅剩 CalendarView 使用；本期改为按 excludedIds 内联过滤、不再依赖它（留 3E 清）。
- **`filter.filteredNodes` 本期后将无任何消费方**（3B 已迁 /payment）→ 留 3E 删。
- orgL3 来源：`组织架构.xlsx`（`read_org_names` 同源行已含「新L3-1组织」列；现仅返回姓名集/L4集，未建姓名→L3-1 映射）。projects[] 的 orgL4 来自 PMIS `team.L4部门`。

## 目标

- CalendarView 改由收款阶段口径驱动（3A 的 `paymentNodes` + `projects`），金额节点级、状态 5 态。
- 保留日历全部能力：年月导航、年度热力、网格/议程双视图、日详情、即将到期、orgL3/orgL4/pm 三筛、dashboard 5 卡。
- 彻底移除 CalendarView 的 rawNodes 依赖（`excludeFilter` + `filteredNodes` 两路皆脱离）。

## 口径（用户 2026-06-17 钦定）

- **金额节点级收款阶段**（对齐 3B/3C）：待回款=`unpaidAmount`、已回款=`receivedAmount`、计划=`expectedPayment`。
- **状态 5 态**：节点 `status`（已回款/部分回款/质保期/延期/待回款）。日历沿用"排除已全额"语义 → **排除 `status==='已回款'`**，相关节点为 **待回款/部分回款/质保期/延期 4 态**，用于网格着色、日详情分组、节点表状态列。
- **orgL3 保留**：从 `组织架构.xlsx` 按 `projectManager` 姓名查「新L3-1组织」；orgL4 仍取 PMIS `project.orgL4`（两个独立筛选，源不同不影响）。

## 范围

**做**：后端 `projects.py`/`schema.py` 加 `Project.orgL3`（组织架构经理→L3-1）；重生成 TS；`paymentPmis.PayNodeRow += orgL3`；`lib/calendar.ts` 就地换源（全部函数改吃 PayNodeRow，状态 5 态、金额节点级）；`CalendarView.vue` 换数据源（删 excludeFilter+filteredNodes 两路）；5 个 Cal* 组件字段适配；配套测试；版本 V1.6.6。

**不做**：
- 不动其它页面。
- 不删 `filter.filteredNodes`、`lib/filterNodes.ts`、`lib/ledger.excludeFilter`、`lib/dashboardStats`/`dashboardCharts`、旧 ledger ProjectAgg 函数（本期后多为死代码，留 3E 随后端 rawNodes 统一清）。
- 不改 orgL4 来源（仍 PMIS）；不做 orgL3/orgL4 层级嵌套校验（独立下拉）。

## 文件结构与职责

| 文件 | 改动 |
|---|---|
| `projects.py` | 新增「姓名→新L3-1组织」映射读取；`build_projects` 给项目加 `orgL3` |
| `schema.py` | `Project += orgL3: str = ""` |
| `frontend/src/types/analysis.ts` | `npm run gen:types` 重生成 |
| `frontend/src/lib/paymentPmis.ts` | `PayNodeRow += orgL3`；`paymentNodeRows` 填充（取 `project.orgL3`） |
| `frontend/src/lib/calendar.ts` | 全部 cal* 函数就地换源到 PayNodeRow（状态 5 态、金额节点级、4 态桶） |
| `frontend/src/views/CalendarView.vue` | 数据源换收款阶段；删 excludeFilter+filteredNodes 两路 |
| `frontend/src/components/Cal{Grid,DayDetail,NodeTable,Agenda,YearHeat}.vue` | 字段适配（status/stage/actualRatio/unpaid/received） |
| 对应 `.test.ts` | 见"测试" |

## 接口与改法

### 后端 orgL3

- `projects.py`：新增 `read_org_l3_map(path) -> Dict[str, str]`（姓名→新L3-1组织，与 `read_org_names` 同样按"表头含工号"选 sheet、按 `新L3组织 == DEPT_L3` 过滤）。`load_dept_projects` 读取该映射并传入 `build_projects`；`build_projects` 在项目 dict 加：

```python
"orgL3": org_l3_map.get(manager, ""),
```

- `schema.py` `Project` 增（置于 `orgL4` 后）：

```python
orgL3: str = ""
```

- 改后运行 `cd frontend && npm run gen:types`。

### 前端 PayNodeRow

- `PayNodeRow += orgL3: string`；`paymentNodeRows` 在 join project 时取 `orgL3: (p.orgL3 ?? '').trim()`（与 `dept` 同源 project）。

### lib/calendar.ts（就地换源；输入类型 RawNode → PayNodeRow）

- **节点筛选基础**：日历不再有 `isPaymentRelated`（收款阶段节点天然都是回款节点）；空 `planDate` 仍跳过（沿用 `!pd || pd.length < 10`）。
- `calExcludePaid(rows)` → `rows.filter(r => r.status !== '已回款')`。
- `calFilterOptions(rows)` → `{ orgL3:[…r.orgL3], orgL4:[…r.dept], pm:[…r.projectManager] }`（去重非空）。
- `applyCalFilters(rows, f)` → 按 `r.orgL3===f.orgL3` / `r.dept===f.orgL4` / `r.projectManager===f.pm`。
- `calDashboardStats(rows, f, now)` → 当月(now 月)：`mRemaining=Σunpaid`、`mActual=Σreceived`、`mCount`、`delayed=count(status==='延期')`、`upcoming7=count(planDate∈[今,+7] 且 status!=='已回款')`。
- `calDateData(rows)` → 每日 `{ count, remaining:Σunpaid, 按 4 态计数 }`（桶：`待回款/部分回款/质保期/延期`）。
- `calMonthGrid` `statusClass` 着色优先级（4 态）：`延期 > 待回款 > 部分回款 > 质保期`（映射现有 danger/pending/… 色）。
- `calListNodes`/`calListGroups` → 列表按 planDate 取、分组用 4 态（`LIST_STATUS_ORDER = ['延期','待回款','部分回款','质保期']`）。
- `calUpcoming(rows, f, now)` → 15/30 天内、`status!=='已回款'`、按 planDate。
- `calAgendaGroups`/`calYearHeat` → 金额=Σunpaid（`getNodeRemaining` 旧依赖删，直接用 `r.unpaidAmount`）。

### CalendarView.vue

```ts
const allNodes = computed(() =>
  paymentNodeRows(data.data?.paymentNodes, data.data?.projects ?? [], data.data?.projectPmis))
const baseNodes = computed(() =>
  filter.excludeOn ? allNodes.value.filter((n) => !filter.excludedIds[n.projectId]) : allNodes.value)
// options / dashboard / grid / list / upcoming / heat 全部基于 baseNodes(+calFilters)，删 excludeFilter 与 filter.filteredNodes
```
dashboard 也改吃 `baseNodes`（经 calFilters）——日历的"当月"由 `now` 决定，与全局年份无关，本就不该走 filteredNodes。

### 5 个 Cal* 组件字段适配

- 节点名：`milestone || stageName || nodeName` → `stage`。
- 状态：`nodeStatus` → `status`（5 态文案/着色）。
- 实际比例：`actualPaymentRatio` → `actualRatio`。
- 待回款：`expectedPayment - actualPayment` → `unpaidAmount`；已回款列 → `receivedAmount`。
- CalNodeTable 列：项目编号/名称/tier/服务组(dept)/经理/状态(5 态)/阶段/计划日/实际比例/计划金额(expectedPayment)/已收(receivedAmount)/未收(unpaidAmount)。
- CalGrid statusClass、CalDayDetail 分组、CalDayData 桶：4 态。

## 测试

- `tests/test_projects.py`：`read_org_l3_map` 按姓名映射 L3-1、按 DEPT_L3 过滤；`build_projects`/load 输出项目带 `orgL3`（经理命中映射）。
- `frontend/src/lib/paymentPmis.test.ts`：`paymentNodeRows` 输出含 `orgL3`（取自 project）。
- `frontend/src/lib/calendar.test.ts`：换收款阶段夹具，测 `calExcludePaid`(排已回款)、`calFilterOptions`(orgL3/orgL4/pm)、`calDashboardStats`(当月 Σ未收/已收/延期/7天)、`calDateData`(4 态桶+Σ未收)、`calListGroups`(4 态分组)、`calUpcoming`(status≠已回款+15/30天)、`calYearHeat`(Σ未收)。
- `frontend/src/views/CalendarView.test.ts`：夹具换收款阶段，断言 DASH 5 卡、网格/即将到期渲染、orgL3 筛选可选。
- 5 个 Cal* 组件 `.test.ts`（按现有者）：夹具换收款阶段字段，断言节点名=stage、状态 5 态、金额=已收/未收。

## 验证（声称完成前必跑）

```bash
bash verify.sh   # python 编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿
```

附加：`python preprocess_data.py` 确认产物项目带 `orgL3`、schema 通过；build 后手验 `/calendar`：5 卡/年热力/网格+议程/日详情/即将到期/三筛(含 orgL3)/无 JS 报错。

## 版本与进度

- `frontend/src/version.ts` → **V1.6.6**（Z 级：既有页换源 + 后端加字段 + 状态/筛选局部变），RELEASE_DATE `2026-06-17`。
- `PROGRESS.md`：「全局下线 rawNodes 程序」④3D 记一条。

## 取舍记录

- **后端加 `Project.orgL3`**：用户确认 orgL3 在组织架构、按经理姓名可查；orgL4 仍取 PMIS（保持与 3B/3C 一致，不平台级改动），两筛独立下拉、源不同无碍。
- **就地换源 lib/calendar.ts**：日历专用，无共享，故直接改而非新建并存（区别于 3B 的 payDashboard）。
- **金额节点级、状态 5 态**（对齐 3A/3B/3C、用户钦定）：日历排已回款 → 4 态着色。
- **删 CalendarView 的 excludeFilter+filteredNodes 两路**：3D 后 `filteredNodes` 全站无消费方、`excludeFilter` 仅死引用，连同旧 lib 一并留 3E 清。
