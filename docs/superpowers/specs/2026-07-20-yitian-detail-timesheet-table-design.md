# 设计：倚天工时明细表 `/yitian/detail`

日期：2026-07-20
版本：**V4.1.0**（Y 级：新增整页 + 路由 `/yitian/detail`）
基线：V4.0.5（已上线）

---

## 1. 目标与定位

在倚天工时域新增一张**逐条工时明细表**，形如 `/projects` 项目清单页的交互形态（选列菜单 + 表头枚举筛选 + 横向滚动 + 按登录用户持久化），直接铺开倚天**基础明细数据**。

- 路由：`/yitian/detail`，name `yitian-detail`，标题「工时明细」
- 导航位置：`nav.ts` 倚天分组中，插在 **倚天工时总览(`/yitian`)** 与 **工时合规检查(`/yitian/compliance`)** 之间
- 一行 = 一条工时记录（当前累积库约 1129 行，逐周增长）

为什么放这里：明细表是"总览（宏观指标）"与"合规检查（聚焦异常）"之间的中间粒度——用户先看总览、再翻明细、最后钻异常，动线自然；且明细自带合规状态列，与下方合规检查页互补。

## 2. 基础数据模型（已核实）

数据源 = `useYitianStore` 的 `YitianData`（`data/yitian_data.json`，后端已按 `allowedL4` 切分下发）。每条 `YitianEntry` + join 可还原出一行明细：

| 明细字段 | 来源 | 还原方式 |
|---|---|---|
| 日期 | `e.d` | 直取（YYYY-MM-DD） |
| 员工 | `e.e` → `roster` | `Map(roster.id→item).name` |
| L2/L3/L3-1/L4/序列 | `roster` item | `l2/l3/l31/l4/category` |
| 工时类型 | `e.t` | `dims.types[e.t]`（null→''） |
| 工时数 | `e.h` | 直取（number） |
| 工作类型三 | `e.wt` | `dims.workTypes[e.wt]` |
| 客户 | `e.cu` | `dims.customers[e.cu]` |
| 产品线 | `e.pl` | `dims.products[e.pl]` |
| 产品名 | `e.pn` | `dims.productNames[e.pn]` |
| 项目类型 | `e.pt` | `dims.projectTypes[e.pt]` |
| 服务方式 | `e.sm` | `dims.serviceModes[e.sm]` |
| 销售L2 | `e.bg` | `dims.salesL2[e.bg]` |
| 工单号 | `e.wo` | 直取 |
| 是否TOP客户 | `e.top` | 直取（bool） |
| 合规状态 | `e.ok` | 0=合规 / 1=提示 / 2=问题 |
| 问题原因 | `e.iss` + `issues[]` | 见下 |

**问题原因还原**：`issues[]` 每项 `{i, codes, msgs, snippet}`，`i` 是对应 `entries` 的下标。构建 `Map(issue.i → issue)`，明细行按自身下标查得 `msgs`（问题/提示行才有），拼接成「问题原因」串；`snippet`（仅 ok=2 问题行有的 120 字工作成果摘要）作为该单元格 tooltip。**工作成果正文不下发、不显示**（隐私）。

## 3. 架构与复用锚点

分两层，与既有倚天页 + `/projects` 完全同构：

- **数据层**（纯函数，新建 `frontend/src/lib/yitian/detail.ts`，TDD）：还原 + 过滤 + 汇总 + 导出行构建
- **视图层**（新建 `frontend/src/views/YitianDetailView.vue`）：复刻 `ProjectsView.vue` 的选列/筛选/横滚/持久化骨架

复用现成件（不重造）：

| 复用 | 来源 | 用途 |
|---|---|---|
| `DataTable` | `@/components/DataTable.vue` | 表格（`sticky-header`、列 `fixed`、排序、`.u-num`） |
| `ColumnPicker` | `@/components/ColumnPicker.vue` | 选列菜单（显隐 + 排序） |
| `ColumnFilter` | `@/components/ColumnFilter.vue` | 表头枚举筛选（挂列头 span） |
| `useColumnPrefs(viewKey, allKeys, defaultVisible)` | `@/lib/useColumnPrefs` | 选列持久化，返回 `{ visibleKeys, ... }` |
| `usePersistentSort` | `@/lib/usePersistentSort` | 排序持久化 |
| `useViewScrollMemory` | `@/lib/useViewScrollMemory` | 滚动记忆 |
| `userScopedKey` | `@/lib/userScopedKey` | 持久化 key 加登录账号前缀 |
| `useCrossFilterStore` + `applyColumnFilters` / `cfUniqueValues` | `@/stores/crossFilter` / `@/lib/crossFilter` | 表头筛选联动 |
| `exportSheets(filename, sheets)` | `@/lib/exportXlsx` | 导出 xlsx（`sheets: {name, rows: Record<string,unknown>[]}[]`） |
| `rosterL4Map` | `@/lib/yitian/metrics` | roster→L4 映射（已有，明细行 L4 复用） |
| `useYitianStore` | `@/stores/yitian` | 惰性加载 YitianData |

码表还原范式已在 `lib/yitian/compliance.ts` 落地（`byId = new Map(roster.map(p=>[p.id,p]))`、`data.dims.types[e.t] ?? ''`），`detail.ts` 沿用同一写法。

## 4. 数据层 `lib/yitian/detail.ts`（纯函数）

```
DetailRow = {
  date, empId, empName, l2, l3, l31, l4, category,
  type, hours, workType3, customer, productLine, productName,
  projectType, serviceMode, salesL2, workOrder, top,
  ok /*0|1|2*/, issueReason /*string*/, snippet /*string, tooltip*/
}

buildDetailRows(data: YitianData): DetailRow[]
  - Map(roster.id→item) join 员工/组织各级/序列
  - dims 码表还原各维度（null/undefined → ''）
  - Map(issue.i→issue) 拼 issueReason（msgs join '；'）、snippet
  - roster 缺失的 empId（理论不会，droppedRows 已在后端剔离域外/离职）→ empName='' 兜底，不崩

filterDetailRows(rows, { start?, end?, onlyIssues? }): DetailRow[]
  - 日期闭区间 [start, end]（空=不限）
  - onlyIssues=true → 仅 ok !== 0

detailSummary(rows): { count, totalHours, ok, warn, issue }
  - count=行数；totalHours=Σhours（保留 2 位）；ok/warn/issue = ok∈{0,1,2} 分桶计数

buildDetailSheetRows(rows, visibleCols): Record<string, unknown>[]
  - 按当前可见列顺序，用中文列名作键，构建导出行（不含 snippet 正文）
```

全部纯函数，无 IO，无响应式依赖 → 直接 vitest。

## 5. 列设计

`ALL_KEYS`（全列，供选列菜单）：
`date, empName, l4, l3, l31, l2, category, type, hours, workType3, customer, productLine, productName, projectType, serviceMode, salesL2, workOrder, top, ok, issueReason`

`DEFAULT_VISIBLE`（首次默认显示）：
`date, empName, l4, type, hours, customer, workOrder, ok, issueReason`

默认隐藏（选列可开）：`l2, l3, l31, category, workType3, productLine, productName, projectType, serviceMode, salesL2, top`

- **表头 `ColumnFilter`（`FILTERABLE`，低基数枚举列）**：`l4, l2, l3, l31, category, type, workType3, projectType, serviceMode, salesL2, top, ok`。**不挂**：`date`（区间筛选在顶部）、`empName` / `customer` / `productLine` / `productName`（高基数，靠搜索/排序）、`hours`（数值）、`workOrder` / `issueReason`（自由文本）。
  - 注：`customer`/`empName` 基数是否挂 `ColumnFilter` 以 `/projects` 现状为准（其超长枚举列已挂但列表长）；本页默认不挂高基数列，保持轻量，日后需要再补。
- **合规状态列（ok）**：「淡底+深字」三态徽章——合规=中性(`--sub`/`--mut` 底)、提示=`--warn-bg`+`--warn-text`、问题=`--danger-bg`+`--danger-text`，遵循设计规范三态（禁止实底+小号白字）。
- **工时数（hours）**：右对齐 + `.u-num`（tabular-nums）。
- **问题原因（issueReason）**：`wrap` 或 tooltip 截断；单元格 tooltip 显示 `snippet`（若有）。
- **日期列**默认排序倒序（`usePersistentSort` 默认 `{ prop: 'date', order: 'descending' }`）。
- `TABLE_ID = 'yitian-detail'`；`useColumnPrefs(userScopedKey(TABLE_ID), ALL_KEYS, DEFAULT_VISIBLE)`。
- 横滚：外层 `.overflow-x: auto`；员工列可 `fixed: 'left'`（可选，与 /projects 一致）。

## 6. 顶部辅助区

自上而下：

1. **汇总条**：总条数 / 总工时 / 合规·提示·问题三态计数——取自 `detailSummary(filtered)`，随筛选实时更新（数字挂 `.u-num`）。
2. **日期区间选择**：`el-date-picker` range，默认空=全时口径（回归安全网：全时=不限）。
3. **「仅看异常」开关**：`el-switch`，开=`onlyIssues`（`ok !== 0`），一键聚焦提示+问题行。
4. **导出按钮**：见 §7。

顶部筛选（日期 + 仅异常）与表头 `ColumnFilter` 叠加：`filtered = filterDetailRows(applyColumnFilters(rows, cf), {start, end, onlyIssues})`。

## 7. 导出

- 顶部「导出」按钮 → `exportSheets('工时明细.xlsx', [{ name: '工时明细', rows: buildDetailSheetRows(filtered, visibleCols) }])`。
- 导出 = **当前筛选后的行 × 当前可见列**（遵循 /projects「所见即所导」）。
- 导出**不含**工作成果正文/snippet（隐私）；「问题原因」（msgs 拼接，非正文）随导出。
- 空结果 → toast 提示「无可导出数据」，不产空文件。

## 8. L4 数据隔离

`yitian_data.json` 后端已按 `allowedL4`（`data_scope`）切分下发，`data.roster` 与 `data.entries` 本就只含当前用户可见 L4 范围，超管见全量。明细表直接消费，**前端无需二次过滤**（与合规检查页一致；`rosterL4Map` 仅用于给行贴 L4 标签，非过滤闸门）。

## 9. store / 加载 / 三态

- 复用 `useYitianStore`：进页 `onMounted` 调 `load()`（惰性，已有数据不重拉），与其他倚天页一致。
- 三态占位：`loading` → 骨架/加载中；`data === null || entries 空` → 空态「暂无工时数据，请在数据管理导入工时并更新」；`error` → 错误提示。

## 10. 视图组件结构 `YitianDetailView.vue`

镜像 `ProjectsView.vue`：
- setup：load 数据 → `rows = computed(buildDetailRows(data))` → `filtered = computed(filterDetailRows(applyColumnFilters(rows, cf.tableFilters(TABLE_ID)), {start,end,onlyIssues}))` → `summary = computed(detailSummary(filtered))`。
- 模板：辅助区（汇总/日期/仅异常/导出）→ `.yd-scroll`（横滚）内 `DataTable`（`:columns="visibleColumns"` `:rows="filtered"` `sticky-header` `:default-sort` `@sort-change`），表头 span 内按 `FILTERABLE` 挂 `ColumnFilter`，右上角 `ColumnPicker`。
- `visibleColumns = computed` 按 `prefs.visibleKeys` 从 `ALL_COLUMNS` 过滤并保序。
- **行数/分页**：明细约 1129 行且逐周增长。首版直接全量渲染 `filtered`（el-table，与合规检查页量级相当）；若手动冒烟发现首屏顿感，按 `/projects` 加分页（`paged` + `el-pagination`），排序/筛选/导出仍作用于全量 `filtered`（分页只切显示片段）。实现时按性能实测定，属可选优化不阻断验收。

## 11. 路由与导航

- `router/index.ts`：在 `/yitian` 与 `/yitian/compliance` 之间插
  `{ path: '/yitian/detail', name: 'yitian-detail', component: YitianDetailView, meta: { title: '工时明细', hideFilter: true, pageKey: 'yitian-detail' } }`
  （精确路径，勿引入 `/yitian/:param` 通配以免遮蔽）。
- `nav.ts`：倚天分组在 `{ label:'倚天工时总览' }` 与 `{ label:'工时合规检查' }` 之间插
  `{ label: '工时明细', to: '/yitian/detail', key: 'yitian-detail' }`。

## 12. 测试计划

- `lib/yitian/detail.test.ts`（纯函数）：
  - `buildDetailRows`：码表还原（含 null 码→''）、roster join（含缺失兜底）、问题原因拼接（issues.i 对齐）、snippet 仅问题行、top/hours 直取
  - `filterDetailRows`：日期区间闭边界、空区间=全量、`onlyIssues` 只留 ok≠0
  - `detailSummary`：count/totalHours/三态计数
  - `buildDetailSheetRows`：按可见列构建、不含 snippet
- `views/YitianDetailView.test.ts`：路由解析到本组件（非 PageStub）、渲染行数、切「仅看异常」行数变化、选列显隐、汇总随筛选更新
- `router/index.test.ts`：加 `/yitian/detail` 解析到 `YitianDetailView`（`__name` 断言）+ 纳入可解析路径清单
- `verify.sh` 全绿（typecheck + vitest + build + pytest）+ 手动启动冒烟（`python server.py` + `npm run dev`，核对明细行数 ≈ meta.rows、合规三态计数与合规检查页一致）

## 13. 版本

新增整页 = **Y 级**：`frontend/src/version.ts` 由 V4.0.5 → **V4.1.0**（单一来源，只改此处；`RELEASE_DATE` 同步）。X 位不动，无需大版本确认。

## 14. YAGNI / 不做

- 不下发/不显示工作成果正文（仅问题行 snippet 作 tooltip）
- 不做行下钻弹窗（明细已是最细粒度；员工/客户维度聚合去统计分析/客户支持页）
- 不改后端、不改累积库、不改 schema（数据现成，全部还原发生在前端）
- 不做跨页 FilterBar（`hideFilter: true`，筛选全在页内，与倚天其他页一致）

## 15. 验收标准

- `/yitian/detail` 可访问，导航在总览与合规检查之间
- 明细逐行还原正确（抽样核对：某员工某日某工单的类型/客户/工时/合规状态与源一致）
- 选列/表头筛选/横滚/排序/滚动记忆按登录用户持久化，行为与 /projects 一致
- 顶部汇总随筛选实时更新；日期区间与「仅看异常」正确过滤
- 导出 xlsx = 当前筛选 × 可见列、不含正文
- L4 隔离：非超管账号只见其 allowedL4 范围的行
- `verify.sh` 全绿
