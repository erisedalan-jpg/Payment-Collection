# V3.2.1 设计：倚天明细表分页/全列筛选 + 五页图表下钻

> 设计文档（spec）。落成后交 `writing-plans` 生成实施计划。交流语言：简体中文。

**版本**：V3.2.1（Z 级，用户钦定；线上基线 V3.2.0）。
**性质**：纯前端。**不碰后端、不进数据管线、无口径改动、升级仅换 dist、无新增页面/路由/pageKey/依赖。**
**目标**：① 两张倚天明细表加分页 + 固定较大高度（解决"只显 3 行"）；② 两表全列列头筛选；③ 五页图表/卡片/表格加下钻——点击即跳到对应明细表并预设对应列筛选。

---

## 0. 全局约束

- **功能与数据口径零改动**：不改任何 API、`lib/yitian/*` 计算函数的返回口径、`yitianView` 语义；只加展示层的分页/筛选/下钻。
- **只引设计令牌不手写散值**；**不引入第 16 个色号**；light/dark 双主题；图表显式设色仍按 `settings.theme` 选浅/暗（V3.2.0 既有 `pal` 模式，本期新增图表点击不改配色）。
- **复用既有筛选基建，不另造轮子**：`components/ColumnFilter.vue` + `stores/crossFilter.ts` + `lib/crossFilter.ts`。
- **不破坏 crossFilter 既有 9 页用法**：对 `crossFilter.ts` 只做**通用**（非倚天专属）的最小扩展。
- 纯计算新增先测后写；下钻交互靠 typecheck+build+点击目验。

---

## 1. 现状基线（实现前的事实锚点）

- **两张明细表**都在页面靠下（图表下方），都用 V3.2.0 的 `DataTable ... sticky-header`。冻结表头高度＝`视口高 − 表格 getBoundingClientRect().top − 24`（`composables/useTableMaxHeight.ts`），表格靠下 → top 大 → 命中最小值 200px → **仅约 3 行可见**。两表当前**无分页**、一次性渲染全部行。
  - 合规 `问题明细`（`views/YitianComplianceView.vue`）：`rows` = `issueRows(...)` 派生，列 = 工作日/员工(empName)/L4/工时类型(type)/工时(hours)/客户(customer)/工单(workOrder)/状态(okText)/**问题(issueText)**/工作成果摘要(snippet)。卡片顶部现有「全部问题类型」`el-select`（`codeFilter` ref）在筛表 + 「导出」按钮。
  - 分析 `员工工时明细`（`views/YitianAnalyticsView.vue`）：`empRows` = `empStats(...)` 派生（每行含 id/name/l31/l4/hoursText/baseText/satText/diffText），列 = 工号/姓名/L3-1/L4/实际工时/基础工时/饱和度/差值。
- **筛选基建（`stores/crossFilter.ts` + `lib/crossFilter.ts` + `components/ColumnFilter.vue`）**：
  - store `filters: Record<tableId, TableFilters>`，**按 `tableId` 命名空间隔离**（给倚天两表各起唯一 tableId 即与主域 9 页互不干扰）。API：`setColumnFilter(tableId, colKey, selected[], totalCount, group?)`（selected 空→`{value:[]}`、等于 totalCount→清除、否则记录）、`clearColumn(tableId, colKey)`、`clearAll(tableId)`、`tableFilters(tableId)`。
  - `ColumnFilter.vue` props `{ tableId, colKey, sourceRows, group? }`：渲染列头 ▼，弹层多选唯一值，写 store。性能护栏 `persistent:false + v-if` 已内置。
  - `applyColumnFilters(rows, filters)`：多列取交集；`cfFormatValue` 处理空值→'空值'、日期、布尔、`RATIO_KEYS`→pct、否则 `String(val)`。**已有 `riskReasons` 数组列先例**（摊平 `.category` 而非 String 化整个数组）。
- **DataTable** `header-<key>` slot 已存在（`<slot :name="\`header-${col.key}\`" :col="col">`）——父视图可在列头填入「label + ColumnFilter」，无需改 DataTable 即可加列筛选。
- **ChartBox** 暴露 `@datapoint-click`（V3.2.0 五页均未用）；`yitianView` 共享 `start/end/weekMode/l4s`，跨页持久化。
- **/projects 分页范式**（V2.6.3 已定，本期复刻）：`filtered = applyColumnFilters(allRows, tableFilters(id))` → `paged = filtered.slice((cp-1)*50, cp*50)`，`watch(filtered)→cp=1`，表下 `el-pagination` +「共 N 条」。

---

## 2. 明细表：分页 + 固定高度

对合规 `问题明细`、分析 `员工工时明细` 两表：

- **分页**（复刻 /projects）：`pageSize = 50`；`currentPage` ref；`paged = filtered.slice((currentPage-1)*50, currentPage*50)`；`watch(filtered, () => currentPage = 1)`；表下方 `el-pagination`（layout `prev, pager, next`）+「共 {{ filtered.length }} 条」。DataTable `:rows` 由全量改为 `paged`。
- **固定较大高度**：`DataTable.vue` 新增 prop `maxHeightPx?: number`。当 `stickyHeader && maxHeightPx` 时，`tableMaxHeight` 直接返回 `maxHeightPx`（跳过 `useTableMaxHeight` 动态测量）；否则维持现有动态行为。两张明细表传 `:max-height-px="560"`（≈15 行 + 冻结表头 + 表内滚动看完本页 50 条 + 页码翻页）。
- `DataTable` 改动**向后兼容**：不传 `maxHeightPx` 时行为与 V3.2.0 完全一致（零回归）。

---

## 3. 明细表：全列列头筛选

### 3.1 tableId 与可筛列
- tableId：合规 `'yitian-compliance'`、分析 `'yitian-analytics'`（唯一，不与主域冲突）。
- **合规问题明细**：工作日/员工/L4/工时类型/工时/客户/工单/状态/**问题** 均加列头 `ColumnFilter`；**「工作成果摘要」(snippet) 不加**（自由长文本，逐行几乎唯一）。「问题」列按**问题类型**筛（见 3.3）。
- **员工工时明细**：工号/姓名/L3-1/L4/实际工时/基础工时/饱和度/差值 均加（数值列按格式化后字符串值多选，`cfFormatValue` 走 `String`）。

### 3.2 装配方式（不改 DataTable，用 header slot）
父视图为每个可筛列填 `#header-<key>` slot：
```vue
<template #header-l4="{ col }">
  {{ col.label }}
  <ColumnFilter table-id="yitian-compliance" col-key="l4" :source-rows="allRows" />
</template>
```
- `sourceRows` 传**未分页、未列筛选的全量行**（`ColumnFilter` 内部自己按其它列已选值级联算唯一值）。
- 视图计算：`filtered = applyColumnFilters(allRows, cf.tableFilters(tableId))` → `paged`（§2）。
- 顶部原「全部问题类型」`el-select` **移除**（并入「问题」列头筛选）；`codeFilter` ref 删除；「导出」按钮保留，导出按 `filtered`（当前筛选后全量，不受分页影响）。

### 3.3 「问题」列按类型筛（对 `crossFilter.ts` 做通用最小扩展）
- 需求：一行可含多个问题码（`issueText` 是多条拼接），「问题」列须按**问题类型**多选、命中任一即保留 → 数组成员匹配。
- **通用扩展**（非倚天专属，与 `riskReasons` 先例同位）：给 `lib/crossFilter.ts` 的 `cfUniqueValues` 与 `applyColumnFilters` 增一个**泛型数组分支**——在既有 `riskReasons` 特例之后，加 `Array.isArray(row[colKey])`：
  - `cfUniqueValues`：摊平所有行该列数组元素、`String(item)` 去重升序。
  - `applyColumnFilters`：该行数组元素的 `String` 与所选任一相等即保留。
  - 该分支**不改变主域现状**：主域可筛列无数组类型（数组列本就被 FILTERABLE 排除，`riskReasons` 走显式特例），故新分支只对新引入的数组列生效，零回归。
- 合规行新增字段 `issueTypes: string[] = codes.map(c => ISSUE_LABELS[c] ?? c)`（问题类型标签数组）。
- 「问题」列：**显示**仍用 `issueText`（`DataColumn.key='issueText'`，展示详细信息）；**筛选**的 `ColumnFilter` 用 `col-key="issueTypes"`（数组列，按类型）。二者分离——显示键与筛选键不同，`ColumnFilter` 接受显式 `colKey` prop，`applyColumnFilters` 按 `issueTypes` 匹配。

---

## 4. 五页图表/卡片下钻

### 4.1 统一模型
两张明细表是唯一下钻落点。点击任何可下钻元素 → **① 清空目标表筛选（`clearAll(tableId)`）② 设对应列筛选（`setColumnFilter`，单值替换式）③ 若跨页则先 `router.push` 带 query，目标页挂载读 query 后执行 ①②**。时间桶下钻设共享日期区间（明细表源数据本按 `view.start/end` 过滤，自动收窄）。图表本身保持总览视角不变。

### 4.2 机制
- **图表点击**：`<ChartBox @datapoint-click="onXxxClick">`。ECharts 回调 `params`：柱/饼取 `params.name`（类目名＝L4名/问题类型标签/员工名）；热力图取 `params.data = [xL4Index, yCodeIndex, count]` → 映射 `heatmap.l4s[x]` / `heatmap.codes[y]`；折线取 `params.name`（桶 key）+ `params.seriesName`（判定指标→目标页）。
- **表格行/KPI 卡/结构条**：`@row-click` / 卡片 `@click` / 段 `@click`。
- **同页下钻**（合规内部的问题码/L4/热力图、分析内部的员工/结构条）：不经 query，直接 `clearAll(tableId)` + `setColumnFilter(...)`（`totalCount` 传该列 `cfUniqueValues(allRows,colKey).length`，保证单值被记录为筛选）/ 或滚动到锚点。
- **跨页下钻**（总览/趋势/客户 → compliance/analytics）：`router.push({ path, query })`。实际跨页只需以下 4 个 query 参数（问题码、员工两类下钻都是同页，故不入 query）：
  - `dL4=<L4名>`（目标为 analytics，设 员工明细 `l4` 列筛选）
  - `dStart=<YYYY-MM-DD>&dEnd=<YYYY-MM-DD>`（时间桶下钻，设共享日期区间 `view.start/end`）
  - `dScroll=<neverfilled|diverging>`（总览 未填/加班 → analytics，滚动到指定区块，非列筛选）
  目标页（compliance 处理 `dStart/dEnd`；analytics 处理 `dL4/dStart/dEnd/dScroll`）在 `store.load()` 就绪后解析 query → 执行清空+设筛选/设区间/滚动 → `router.replace({ query: {} })` 清除 query（防刷新/后退重复触发）。
- **下钻辅助纯函数**（可测，只覆盖跨页 query 的 4 个参数）：`lib/yitian/drill.ts`
  - `parseDrillQuery(q: Record<string,any>): { l4?: string; start?: string; end?: string; scroll?: 'neverfilled' | 'diverging' }`（非法 scroll 值忽略）
  - `buildDrillQuery(d: { l4?: string; start?: string; end?: string; scroll?: string }): Record<string,string>`（供源页 `router.push`；空字段不编码）
  这两个纯函数先测后写；实际 `setColumnFilter`/router/scroll 的副作用在视图里（不进纯函数）。同页下钻（问题码/员工）不经此模块，视图内直接 `setColumnFilter`。

### 4.3 下钻映射表

| 源页面 | 元素 | 目标 | 预设 |
|---|---|---|---|
| **合规** | 问题分布柱（问题码） | 本页 问题明细 | issueTypes=[该类型标签] |
| 合规 | 问题按 L4 柱（L4） | 本页 问题明细 | l4=[该L4] |
| 合规 | 热力图格（码×L4） | 本页 问题明细 | issueTypes=[该类型] + l4=[该L4] |
| **分析** | 饱和度TOP柱 / 发散条 / 散点（员工） | 本页 员工明细 | id=[该员工工号]（单点） |
| 分析 | 人数结构条：达标/欠填/完全未填 | 本页 | 滚到 员工明细 / 未按时填写 / 完全未填 子区块 |
| **总览** | L4 组织工时柱 / 分层汇总表行 | 跳 /yitian/analytics | dL4=该L4 |
| 总览 | KPI 合规率环 | 跳 /yitian/compliance | （不带列筛选） |
| 总览 | KPI 未填人数 | 跳 /yitian/analytics | dScroll=neverfilled |
| 总览 | KPI 加班人数 | 跳 /yitian/analytics | dScroll=diverging |
| 总览 | KPI 总工时 / 平均饱和度 | 跳 /yitian/analytics | （不带列筛选） |
| **趋势** | 折线时间点（周/月/季桶） | 问题数/合规率→跳 /compliance；工时/饱和度/未填→跳 /analytics | dStart+dEnd=该桶起止 |
| **客户** | TOP1000柱 / 跨BG柱 / TOP1000表行（L4） | 跳 /yitian/analytics | dL4=该L4 |

- **单值替换式**：设某列筛选前先 `clearAll(目标tableId)`，保证只见下钻切片（不与遗留筛选求交致空表）。
- **员工单点取工号**：图表点击项须能取到该员工 `id`（散点数据元组加入 id；柱按 `dataIndex` 映射回排序数组取 id）——按 `id`（唯一）筛，避免同名歧义。

### 4.4 仍不做下钻（无对应明细列/视图，硬做即臆造）
总览「工时类型占比」饼、客户「TOP 客户排行」柱、客户「跨BG」饼、合规健康带 3 个计数卡。（如日后需要，另立诉求。）

---

## 5. 测试与验证

- **纯函数先测后写**：`lib/yitian/drill.ts` 的 `parseDrillQuery`/`buildDrillQuery`（往返、缺省、非法值）；`lib/crossFilter.ts` 泛型数组分支（`cfUniqueValues` 摊平去重、`applyColumnFilters` 成员匹配、不误伤既有 riskReasons/标量列）。
- **视图逻辑测试**：两表 `filtered`（applyColumnFilters 生效）+ `paged`（分页切片、watch 回第 1 页）；`DataTable` 传 `maxHeightPx` 时 `:max-height` 为该固定值、不传时零回归。
- **契约测试**：`crossFilter.ts` 改动后既有 `crossFilter` 相关测试保持绿。
- **点击目验**（本项目既定，puppeteer+系统 Chrome `--no-proxy-server`+admin 登录+数据自举）：逐条走下钻映射——点后落到对应表、列筛选/日期/滚动到位、图表未变；两表列头筛选可用、分页可翻、明细表约 15 行可见（不再 3 行）；light/dark；无 console 报错。
- 收尾 `bash verify.sh` 全绿。

---

## 6. 范围与非目标（YAGNI）

- **不做**：4.4 列出的无目标元素下钻；crossFilter 联动（`linkageOn`/`group` 不启用，倚天两表各自独立）；列显隐/列宽持久化（本期只加筛选与分页，不引 `useColumnPrefs`）；把下钻做成全局 `view.l4s`（用户钦定"部分筛选"＝列筛选，不动全页）。
- **不扩大改动面**：只动 `DataTable.vue`（+maxHeightPx）、`lib/crossFilter.ts`（+泛型数组分支）、`lib/yitian/drill.ts`（新）、五个倚天视图（`Yitian{Overview,Compliance,Analytics,Trend,Customer}View.vue`）、`version.ts`。其它页面/组件不碰。

---

## 7. 实现分解建议（供 writing-plans 参考）

1. **基建**：`crossFilter.ts` 泛型数组分支（先测）→ `DataTable.vue` `maxHeightPx`（先测）→ `lib/yitian/drill.ts` query 编解码（先测）。
2. **合规页**：问题明细分页 + 全列筛选（含 issueTypes）+ 移除顶部下拉 + 本页三处图表下钻。
3. **分析页**：员工明细分页 + 全列筛选 + 本页图表/结构条下钻（含滚动锚点）。
4. **总览页**：KPI 卡 + L4 柱 + 汇总行 → 跨页下钻（buildDrillQuery + router.push）。
5. **趋势页**：折线时间点 → 跨页下钻（按指标分流 compliance/analytics，带日期区间）。
6. **客户页**：L4 柱/行 → 跨页下钻。
7. **落地读取**：compliance / analytics 两页 `onMounted` 解析 drill query（清空+设筛选/区间/滚动+清 query）——此步是 2/3 的一部分，须在源页（4/5/6）之前或同批，保证跨页下钻端到端可用。
8. 收尾：`version.ts` V3.2.1 + PROGRESS + verify.sh。
