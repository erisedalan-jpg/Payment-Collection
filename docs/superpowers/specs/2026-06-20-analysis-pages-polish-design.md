# 分析页交付后打磨 设计（V1.16.1，Z 级）

> 三项独立的纯前端调整，打磨 `/insight` 整合后交付的页面 + 三个回款子页。
> 数据全部取自现有 `data/analysis_data.json`；遵循现配色/字体/`theme.css` 令牌；不引入新框架。
> 一份 spec → 一份 plan，subagent-driven 执行，每功能切片为独立可测任务。

## 0. 背景与范围

`/insight` 项目分析中心整合（SP-A~SP-C）已收官并合入 master。本轮处理交付后用户反馈的三项打磨：

1. `/payment/{projects,nodes,plan}` 三页加载慢 → 改为类似 `/projects` 的可翻页界面。
2. `/insight/{milestone,costdetail}` 的 KPI card 不支持点击 → 增加点击下钻（**页面自适应**，用户已选定）。
3. `/insight/costdetail` 的 L4 部门成本情况汇总表不支持排序 → 支持排序，并新增四列：剩余预算 / 交付部门剩余预算 / 交付外包剩余预算 / 合同总额。

**已定决策（用户确认）**：① 回款页默认页大小 **50**（同 `/projects`）；② L4 四列金额单位用**万**（部门级聚合，避免「元」长数字）。

**非目标**：不改后端/管线/schema；不改三页的取数口径与现有筛选/汇总语义；不动 `/insight` 其他页。

## 1. 全局约束（写入 plan 的 Global Constraints，逐字遵循）

- 不使用任何 emoji；需要符号用 `→ ↓ ❌ ✕ ▾`。
- 样式只引用 `frontend/src/styles/theme.css` 令牌，不手写散值。
- 表格数字列必须挂 `.u-num`（tabular-nums）。
- 版本 Z 级 → `frontend/src/version.ts` 改为 `V1.16.1`（单一来源，只改此处）。
- 金额展示：部门级聚合用 `fmtWan`（万）；既有「元」列不动。
- 提交逐文件 `git add`，禁止 `git add -A/.`；commit message 结尾恒含
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- `data/analysis_data.json` 是 gitignored 产物，不提交。

## 2. 功能 1：三回款页分页

### 2.1 现状（根因）
- `PayProjectsView.vue`：`<DataTable :rows="rows">` 全量渲染（rows ≈ 在建项目数，数百）。
- `PayNodesView.vue`：`<DataTable :rows="rows">` 全量渲染（rows ≈ 全部回款节点，可上千）。
- `PayPlanView.vue`：手写 `<table>`，`filteredRows.slice(0, 300)` —— 渲染上限 300 且**静默截断**，超 300 行不可见。

慢的根因是 el-table / DOM 一次性渲染全部行。

### 2.2 改法（复用既有件，DRY）
统一复用 `frontend/src/lib/usePagedRows.ts`（签名 `usePagedRows(source, size=50) → { paged, currentPage, pageSize }`，source 变更自动回第 1 页）+ `/projects` 的 `el-pagination` 形态。

**PayProjectsView.vue**：
- `const { paged, currentPage, pageSize } = usePagedRows(rows, 50)`
- `<DataTable :rows="paged" ...>`（其余 props/slot 不变）。
- 表下方加分页条：`共 {{ rows.length }} 条` + `<el-pagination v-model:current-page v-model:page-size :page-sizes="[20,50,80,100]" :total="rows.length" layout="sizes, prev, pager, next" size="small" background />`。

**PayNodesView.vue**：
- 上方 `节点汇总`（`sum`）与 `维度分组`（`byDim`）仍对**全集** `rows` 聚合，不变。
- `const { paged, currentPage, pageSize } = usePagedRows(rows, 50)`
- 底部 `<DataTable :rows="paged" ...>` + 分页条（`:total="rows.length"`）。

**PayPlanView.vue**：
- 保留手写表头（含 `ColumnFilter`，跨筛选语义不动）。
- `const { paged, currentPage, pageSize } = usePagedRows(filteredRows, 50)`
- `<tbody>` 改为 `v-for="r in paged"`（删除 `filteredRows.slice(0, 300)`，消除 300 静默截断）。
- 既有 `cf-bar` 文案 `共 {{ filteredRows.length }} / {{ rows.length }} 个项目` 保留；其下加分页条（`:total="filteredRows.length"`）。

分页条样式复用 `/projects` 的 `.pv-pager`（或各页 scoped 等价类），不新增令牌。

### 2.3 测试
- `usePagedRows` 已有单测，不重复。
- 每页补一条 vitest：mock data store 给 N（>pageSize）行，断言 `findComponent(DataTable).props('rows').length <= pageSize`，且分页条 `total` = 全集长度。PayPlan 断言 `tbody tr` 数 ≤ pageSize（手写表）。
- el-table 行内容 jsdom 异步渲染 → DataTable 断言走 `props('rows')` 而非 `w.text()`。

## 3. 功能 2：KPI card 点击下钻（页面自适应）

### 3.1 MetricGrid 通用化（向后兼容）
`frontend/src/components/MetricGrid.vue`：
- item 类型加可选 `clickable?: boolean`。
- 当 `it.clickable` 为真：卡片挂 `mg-card--clickable`（cursor pointer + `--hover-tint` hover 态），`@click` 触发 `emit('item-click', index)`。
- 未设 `clickable` 的卡片无交互（既有 ProjectsView/其他用法不受影响）。
- emits：`{ 'item-click': [number] }`（传 item 索引）。

### 3.2 成本页就地下钻（CostDetailView.vue）
- `kpiItems` 四项加 `clickable: true`，并定义索引 → 状态映射：
  - 0 `成本统计项目数` → 清空 `fStatus`（看全部）。
  - 1 `未超支` → `fStatus = ['未超支']`。
  - 2 `超支不足5K` → `fStatus = ['超支不足5k']`（**注意**：KPI 文案大写 `5K`，行/筛选状态值小写 `5k`，须显式映射，不能直接用 KPI 文案）。
  - 3 `超支大于5K` → `fStatus = ['超支大于5k']`。
- 点击后平滑滚动到明细表：给「项目成本明细」卡片加 `ref`（如 `detailCardRef`），`onKpiClick` 末尾 `detailCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })`。
- 映射用常量数组 `KPI_STATUS = [null, '未超支', '超支不足5k', '超支大于5k']`，`onKpiClick(i)`：`fStatus.value = KPI_STATUS[i] ? [KPI_STATUS[i]] : []`，再滚动。

### 3.3 里程碑页弹窗下钻（MilestoneView.vue + 新组件 + 新纯函数）
- 新纯函数 `milestoneProjectsByStatus(ps: MilestoneProject[], status: MilestoneStatus | null): MilestoneStatusRow[]`（在 `lib/milestoneAnalytics.ts`）：
  - `status` 为 `null` → 返回全部；否则筛 `p.status === status`。
  - 返回行：`{ projectId, projectName, manager, orgL4, contract, status }`（直接取自 `MilestoneProject`）。
  - 类型 `export interface MilestoneStatusRow { projectId: string; projectName: string; manager: string; orgL4: string; contract: number; status: MilestoneStatus }`。
- 新组件 `frontend/src/components/MilestoneStatusModal.vue`（仿 `MilestoneDrillModal` 结构，wrap `Modal` + `DataTable`）：
  - props `{ modelValue: boolean; title: string; rows: MilestoneStatusRow[] }`，emit `update:modelValue`。
  - 列：编号(140) / 名称(wrap) / 经理(80) / L4(110) / 合同(万, num, `fmtWan`) / 状态(90)。
  - 行可点 → `router.push('/project/' + projectId)` 并关弹窗（同 MilestoneDrillModal）。
- `MilestoneView.vue`：
  - `kpiItems` 五项加 `clickable: true`。
  - 索引 → 状态映射 `KPI_STATUS = [null, '正常', '延期', '严重延期', '未发布']`（0=项目总数→全部）。
  - `onKpiClick(i)`：`statusRows.value = milestoneProjectsByStatus(mps.value, KPI_STATUS[i])`；`statusTitle.value = kpiItems.value[i].k`（如「严重延期」）；`statusOpen.value = true`。
  - 模板加 `<MilestoneStatusModal v-model="statusOpen" :title="statusTitle" :rows="statusRows" />`。

### 3.4 测试
- `MetricGrid`：clickable item 点击 emit `item-click` 带正确索引；非 clickable item 点击不 emit。
- `milestoneProjectsByStatus`：fixture 多状态项目，断言 `null` 返回全部、指定状态只返回该状态、行字段映射正确。
- `CostDetailView`：点 KPI[3] 后 `findComponent(DataTable, 明细)` 的 `rows` 仅含 `超支大于5k`（或断言 `fStatus`）；点 KPI[0] 后恢复全部。滚动调用可不测（jsdom 无布局）。
- `MilestoneView`：点 KPI[3] 后 `MilestoneStatusModal` 的 `modelValue=true` 且 `rows` 仅含严重延期项目。

## 4. 功能 3：L4 成本汇总排序 + 四列

### 4.1 数据来源（已用真实数据核实可得）
- 合同总额：`Project.paymentPmis.contract`（= 现 `CostRow.amount`）。
- 剩余预算：`ProjectPmis.cost.剩余预算`（= 现 `CostRow.remaining`）。
- 交付部门剩余预算：`Project.deliveryCosts[]` 中 `类别 === '交付部门人工成本'` 的 `剩余预算`。
- 交付外包剩余预算：`Project.deliveryCosts[]` 中 `类别 === '交付外包服务成本'` 的 `剩余预算`。

`deliveryCosts` 挂在 `Project`（非 ProjectPmis）：`DeliveryCostItem { 类别, 预算金额?, 实际发生?, 剩余预算? }`。

### 4.2 `lib/costAnalysis.ts`
- `CostRow` 扩展两字段：`deliveryDeptRemaining: number`、`deliveryOutsourceRemaining: number`。
- `buildCostRows` 每行装配（`p.deliveryCosts` 缺失/找不到类别 → 0）：
  ```
  const dc = p.deliveryCosts ?? []
  const findRem = (cat: string) => Number(dc.find((c) => c.类别 === cat)?.剩余预算 ?? 0)
  deliveryDeptRemaining: findRem('交付部门人工成本'),
  deliveryOutsourceRemaining: findRem('交付外包服务成本'),
  ```
- `CostL4Summary` 扩展四字段：`contractTotal: number`、`remainingTotal: number`、`deliveryDeptRemaining: number`、`deliveryOutsourceRemaining: number`。
- `costL4Summary` 累加（沿用 `if (r.xs) continue` 剔除）：
  ```
  m[d].contractTotal += r.amount
  m[d].remainingTotal += r.remaining
  m[d].deliveryDeptRemaining += r.deliveryDeptRemaining
  m[d].deliveryOutsourceRemaining += r.deliveryOutsourceRemaining
  ```
  四字段初值 0；现有 `over5kRatio` 计算与 `localeCompare` 排序不变。

### 4.3 `CostDetailView.vue` L4 表
- `import { fmtWan } from '@/lib/format'`。
- `L4_COLS` 现有列加 `sortable: true`（orgL4/total/normal/under5k/over5k/over5kRatio）。
- 追加四列（`num: true, sortable: true, formatter: fmtWan`）：
  - `{ key: 'contractTotal', label: '合同总额(万)', width: 120, num: true, sortable: true, formatter: fmtWan }`
  - `{ key: 'remainingTotal', label: '剩余预算(万)', width: 120, num: true, sortable: true, formatter: fmtWan }`
  - `{ key: 'deliveryDeptRemaining', label: '交付部门剩余(万)', width: 130, num: true, sortable: true, formatter: fmtWan }`
  - `{ key: 'deliveryOutsourceRemaining', label: '交付外包剩余(万)', width: 130, num: true, sortable: true, formatter: fmtWan }`
- el-table 内建排序按 `row[prop]` 数值排序（字段是 number），`l4Rows` 全集~15 行无外部分页，直接生效。
- `over5kRatio` 列保留自定义 slot（染色），新增四列走默认 slot + formatter（DataTable 默认 slot 应用 formatter，不踩 `#cell` slot 绕过 formatter 的坑）。

### 4.4 测试
- `costAnalysis.test.ts` append：fixture 给项目带 `deliveryCosts`（含两类别 + 缺类别 + 无 deliveryCosts 各一）与 `paymentPmis.contract`；断言：
  - `buildCostRows` 行的 `deliveryDeptRemaining`/`deliveryOutsourceRemaining` 取值正确、缺失为 0。
  - `costL4Summary` 的 `contractTotal`/`remainingTotal`/两项交付剩余按 L4 求和正确、剔 XS。
- 排序为 el-table 内建行为，不单测（仅断言列带 `sortable: true` 可选）。

## 5. 文件清单

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/views/PayProjectsView.vue` | 改 | 接 usePagedRows + 分页条 |
| `frontend/src/views/PayNodesView.vue` | 改 | 接 usePagedRows + 分页条（汇总仍全集） |
| `frontend/src/views/PayPlanView.vue` | 改 | paged 替 slice(300) + 分页条 |
| `frontend/src/components/MetricGrid.vue` | 改 | 可选 clickable + item-click |
| `frontend/src/components/MilestoneStatusModal.vue` | 建 | 状态项目清单弹窗 |
| `frontend/src/lib/milestoneAnalytics.ts` | 改 | 加 `milestoneProjectsByStatus` + 类型 |
| `frontend/src/views/MilestoneView.vue` | 改 | KPI clickable → 弹窗 |
| `frontend/src/lib/costAnalysis.ts` | 改 | CostRow/CostL4Summary 四字段 + 装配/求和 |
| `frontend/src/views/CostDetailView.vue` | 改 | KPI clickable → 就地筛选+滚动；L4 表排序+四列 |
| `frontend/src/version.ts` | 改 | V1.16.1 |
| 对应 `*.test.ts` | 改/建 | 各功能 vitest |

## 6. 验证

`bash verify.sh` 全绿（typecheck + vitest + build）。手动冒烟：三回款页可翻页且首屏快；两分析页 KPI 可点下钻；L4 表可点列头排序、四列数值合理（万）。

## 7. 真实数据锚点

- `deliveryCosts` 类别值含 `交付外包服务成本`/`交付部门人工成本`（见 `config.py:89` 七类成本、`ProjectDetailView.vue:67` DELIVERY_OVER_CATS）。
- 成本状态值域三档由 `costStatusOf`（±5000）产出，行状态用小写 `5k`。
- 里程碑状态值域：正常/延期/严重延期/未发布（`normalizeStatus`，空归未发布）。
