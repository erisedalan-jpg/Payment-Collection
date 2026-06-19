# SP5 /payment/board 多维看板重做 设计

> 大需求 5 子项目中的 **SP5**（收官）。依赖 SP1（异常排除）、SP2（日期范围+流水口径，V1.11.0）、SP3（/payment 重做，V1.12.0）、SP4（路由拆分 /payment/board，V1.13.0）均已合并。
> 对应原始需求 B-board：排名维度调整为 L4部门/项目级别/行业/项目阶段/标签；去「排序」描述；指标改为 项目数/合同总额/计划回款/完成率/延期节点；柱状图按选项展示数字（已回/待回柱内、总计柱上）；交叉/透视维度同步。

**日期:** 2026-06-19
**版本:** V1.14.0（Y 级：/payment/board 整页重设计）
**范围:** `/payment/board`（`BoardView.vue` + `lib/paymentBoard.ts`）的维度集、指标集、排名模式排序与表格、柱状图数字、标签多值分组、交叉/透视维度同步。**纯前端**，不动任何回款计算口径与数据层（金额/完成率/延期沿用 SP2/SP3 区间口径）。

---

## 1. 已敲定决策（brainstorm）

1. **维度集 5 维**：L4部门(dept) / 项目级别(projectLevel，新) / 行业(industry) / 项目阶段(stage) / 标签(tag，新、多值)；移除 项目经理(manager)/金额档(tier)/进度态(progress)。三模式（排名/交叉/透视）共用同一维度集。
2. **去「排序」**：删排名模式独立「排序」SegToggle；排名表改用 `DataTable`，**列头可点排序**，默认按项目数降序（用户选「表头点击排序」）。
3. **标签多值分组**：含 `tag` 维时按标签炸开，一项目计入它每个标签的组（**标准多标签 faceting，组间重复计数**），空标签归「无标签」组（用户选「计入每个标签组(标准)」）。
4. **指标集 5 项**：项目数/合同总额/计划回款/完成率/延期节点（去「已回款」「待回款」）。
5. **单维表仅五指标**：排名表列 = 维度名 + 5 指标；「已回款/待回款」不再单列，只在柱状图展现（用户选「表仅五指标，已回/待回只进图」）。
6. 我方拍板（已获批）：DataTable 替自绘表拿表头排序；柱状图按计划回款降序取 Top 15、整数万；deep-link 加 `orgL4→dept` 别名；版本 V1.14.0。

---

## 2. 数据层（`lib/paymentBoard.ts`）

### 2.1 PayBoardRow 扩字段
`PayBoardRow` 新增两字段（其余字段不动；manager/tier/progress 等保留以免牵动 BoardDrilldownModal 等消费方）：
- `projectLevel: string` —— `v(pmisMap?.[p.projectId]?.status?.['项目级别'])`（兜底「未指定」）。
- `tags: string[]` —— 由 `buildPayBoardRows` 新入参 `tagAssignments?: Record<string, string[]>` 注入：`(tagAssignments?.[p.projectId] ?? [])`。

`buildPayBoardRows` 签名追加末位可选参数：
```ts
export function buildPayBoardRows(
  projects, pmisMap?, paymentNodes?, paymentRecords?, start='', end='',
  tagAssignments?: Record<string, string[]>,
): PayBoardRow[]
```
（追加式，现有调用不破；BoardView 传入 `projectTags.assignments`。）

### 2.2 维度定义
```ts
export interface PayBoardDimDef {
  key: 'dept' | 'projectLevel' | 'industry' | 'stage' | 'tag'
  label: string
  multi?: boolean   // tag 为 true：分组时炸开
}
export const PAY_BOARD_DIMENSIONS: PayBoardDimDef[] = [
  { key: 'dept', label: 'L4部门' },
  { key: 'projectLevel', label: '项目级别' },
  { key: 'industry', label: '行业' },
  { key: 'stage', label: '项目阶段' },
  { key: 'tag', label: '标签', multi: true },
]
```
`PAY_BOARD_DIM_BY_KEY` 同步重建。

### 2.3 指标定义
```ts
export type PayBoardMetricKey =
  | 'projectCount' | 'contractSum' | 'expectedSum' | 'rate' | 'delayedNodeSum'
export const PAY_BOARD_METRICS: PayBoardMetricDef[] = [
  { key: 'projectCount', label: '项目数', kind: 'count' },
  { key: 'contractSum', label: '合同总额', kind: 'money' },
  { key: 'expectedSum', label: '计划回款', kind: 'money' },
  { key: 'rate', label: '完成率', kind: 'rate' },
  { key: 'delayedNodeSum', label: '延期节点', kind: 'count' },
]
```
`PayBoardGroup` 接口保留 `actualSum`/`pendingSum` 字段（柱状图单维仍用，buildGroup 继续算），仅从指标**选择器**列表移除二者。

### 2.4 标签多值分组（`groupPayBoard` 改造）
当前 `groupPayBoard` 按 `r[d.key]`（标量）取桶 key。改造为对 `multi` 维炸开：

- 对每行，按各分维生成"取值组合"列表：非 multi 维 → 单值 `[String(r[key])]`；multi 维(tag) → `r.tags.length ? r.tags : ['无标签']`。
- 多维时取各维取值的**笛卡尔积**，行计入每个组合桶（含 tag 时同一行进多桶 → 重复计数，符合决策）。
- 桶 key = 组合各值 `' / '` 连接；`values` = 该组合各维取值。
- 排序与现状一致（默认 projectCount 降序）。

实现要点：抽一个 `dimValuesOf(row, def): string[]` 助手；`groupPayBoard` 内对每行做组合展开后入桶。非 multi 维全程行为不变（每行每维恰一值，笛卡尔积退化为现状），保证旧维度零回归。

`payBoardCross`/`payBoardPivot` 复用 `groupPayBoard`，故 tag 维炸开对二者自动生效，无需各自改。

### 2.5 deep-link 别名
BoardView `initDim` 计算时，先把 `route.query.dim === 'orgL4'` 归一为 `'dept'`，再校验是否属 `DIMENSIONS`，否则默认 `'dept'`。

---

## 3. 视图层（`views/BoardView.vue`）

### 3.1 工具栏
- 排名模式：模式 + 维度（删「排序」SegToggle 及 `SORT_OPTS`/`sortKey`）。
- 交叉模式：模式 + 维度 + 次维度 + 指标（指标选项同步为新 5 项）。
- 透视模式：模式 + 行维度 + 列维度 + 指标。
- 维度/次维度/行列维度选项均来自新 `DIM_OPTS`（5 维含标签）。

### 3.2 排名表 → DataTable
单维表由自绘 `.bv-table` grid 改 `DataTable`（与 ProjectsOverview/PaymentL4Table 同构，拿表头排序）：
- 列：`value`(维度名，左对齐) / `projectCount`(项目数) / `contractSum`(合同总额(万)，sortable，fmtWan) / `expectedSum`(计划回款(万)，sortable，fmtWan) / `rate`(完成率，sortable) / `delayedNodeSum`(延期节点，sortable)。数字列 `num: true`。
- 行数据 = `groups`（每个 PayBoardGroup，映射出 `value: g.key` 字段供首列）。
- `clickable` + `@row-click` → `openDrill(对应 group)`（按 row 的 key 回查 group，或直接把 group 作为 row 对象）。
- `#cell-rate`：`fmtRatio(v)` + `rateColorPmis(v)` 染色（与 ProjectsOverviewTab/PaymentL4Table 同构，统一用 fmtRatio 而非旧 pct）；`#cell-delayedNodeSum`：`>0` 红字（`var(--danger)`）。
- 默认排序：项目数降序（DataTable 默认或初始 sort）。

### 3.3 柱状图（排名模式）
保留「已回款/待回款」堆叠柱（绿/黄状态色），新增数字 label：
- 数据预算：先按 `expectedSum` 降序取 `top = groups.slice(0,15)`，预算三个整数万数组 `paidArr[i]=Math.round(g.actualSum/10000)`、`pendingArr[i]=Math.round(g.pendingSum/10000)`、`totalArr[i]=paidArr[i]+pendingArr[i]`。
- 已回款 series：`label { show: true, position: 'inside' }`，显示该段值（绿段内）。
- 待回款 series：`label { show: true, position: 'inside' }`，显示该段值（黄段内）。
- 总计 label：在**待回款（顶层 series）**加 `label.position: 'top'`，`formatter: (p) => String(totalArr[p.dataIndex])`，于柱顶显示 `已回+待回` 总计整数万。（ECharts 堆叠柱无内建总计，故顶层 series 用预算 `totalArr` 经 dataIndex 取值。）
- 金额单位整数万：`Math.round(sum/10000)`；y 轴名「金额(万)」。
- 取数：按 `expectedSum`（计划回款）降序 Top 15。
- 标签维度下 x 轴类目可能较多 → 维持现有 `axisLabel rotate`；（横滑非本轮硬性要求，Top15 截断已控宽度）。

### 3.4 标签 store 接入
BoardView `onMounted` 确保 `projectTags` 已加载：`if (!projectTags.loaded) await projectTags.load()`；`boardRows` computed 把 `projectTags.assignments` 作第 7 参传入 `buildPayBoardRows`。

---

## 4. 版本 / 测试 / 边界 / 验证

- 版本：`frontend/src/version.ts` → `V1.14.0` / `2026-06-19`。
- 测试：
  - `paymentBoard.test`：新 5 维定义（标签 multi）、新 5 指标定义；`buildPayBoardRows` 派生 `projectLevel`、注入 `tags`；**`groupPayBoard` tag 炸开**——多标签项目计入多组、无标签归「无标签」、各组 projectCount 之和 > 总项目数（验证多计数）、非 tag 维零回归（仍每项目一桶）；`payBoardCross`/`payBoardPivot` 以 tag 维参与时炸开。
  - `BoardView.test`：排名模式无「排序」控件（`data-test=seg-actualSum` 等不存在）；单维表为 DataTable 且数字列头可排序（角标存在）；柱状图 option 含已回/待回/总计数字 label；维度 SegToggle 含「标签」项且选中后表/图渲染；deep-link `?dim=orgL4` 落 dept。
- 验证：`bash verify.sh` 全绿；手动 /payment/board 切三模式、切五维（含标签，验证多标签项目重复计入、无标签组）、表头排序、柱顶总计数字、交叉/透视含标签维。
- 边界（不在本轮）：标签维下钻组的项目去重展示（BoardDrilldownModal 按组 rows，多标签项目在不同标签组各自出现，符合多计数语义，不额外去重）；金额档/进度态/项目经理维度退场不再提供；后端/schema 变更（纯前端）。

> 「全部≡现状」延续：日期区间口径与金额/完成率/延期计算完全沿用 SP2/SP3，本轮只改维度/指标/分组/展示。
