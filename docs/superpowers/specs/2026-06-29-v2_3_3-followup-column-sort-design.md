# V2.3.3 设计：三跟进页列排序（重点项目进展 / 重点商机跟进 / 临时重点跟进）

> 状态：设计已与用户确认（2 决策：①排序列范围=所有列可排、长文本列除外；②排序口径=el-table 原生排序，最小改动）。
> 日期：2026-06-29　版本：V2.3.2 → **V2.3.3**（子页面级 Z 改动）。
> 交流语言：简体中文。沿用既有设计令牌/口径/打包约定（CLAUDE.md）。

## 0. 总览与全局约束

给三个「跟进类」页面的表格列开启**点表头排序**：`/projects/key`（重点项目进展）、`/opportunities/key`（重点商机跟进）、`/projects/temp`（临时重点跟进）。三页都用共享组件 `frontend/src/components/DataTable.vue` 渲染，该组件给每列绑 `:prop="col.key"` + `:sortable="!!col.sortable"`，**已接通 el-table 原生排序**（按行对象原始值排序，formatter 仅影响显示、不影响排序——已读源码核实）。现状只是大多数列未标 `sortable`，故点不动。本次 = 把可排序标记**扩展到「除长文本列外的所有列」**。

**核心机制事实（已核实，决定本次不写比较器）：**
- `DataTable.vue:48-52`：`<el-table-column :prop="col.key" :sortable="!!col.sortable" ...>`。`sortable` 传布尔 `true` → el-table **原生排序**，比较的是 `row[col.key]` 原始值，不是 formatter 输出。
- 因此数值列（`contractWan` `number|null`、`amountWan` `number`、`progress/paymentRatio/costRatio` 0–1 数值）、日期列（`followDate/expectedDate/bidDate/firstReg/lastUpdate` 为 `YYYY-MM-DD`/ISO 字符串）、`projectLevel/opportunityLevel`（P1–P4 字符串）**原生即排序正确**。
- 用户已接受的原生口径取舍：枚举列 `riskLevel`（高/中/低/无）、健康度、状态等按字符编码排（如「中<低<高」，非业务严重度）；中文文本按 UTF-16 编码、非拼音；空值/`null` 穿插在序列中（el-table 默认比较器对 null 既不大于也不小于数值，视为相等、保持原序）。**本次不做语义比较器、不做空值沉底。**

**全局约束（每个任务隐含遵守）：**
- 纯前端改动：**不改** `DataTable.vue`、`server.py`、`schema.py`、`preprocess_data.py`、任何行构造 lib（`keyProjects.ts`/`tempFollowup.ts`/`opportunityColumns.ts`）的数据逻辑。
- **不改共享的 `frontend/src/lib/opportunityColumns.ts`（`OPP_COLUMNS` 的 `sortable` 标记）**——它被 `/opportunities`（商机清单）页共用，改它会越界影响该页。本次商机侧的排序标记只在 `OpportunityFollowupView.vue` 本地施加。
- 不使用 emoji；设计令牌只引用 `theme.css` 变量（本次无新样式）。
- 版本单一来源 `frontend/src/version.ts`：`APP_VERSION='V2.3.3'`、`RELEASE_DATE='2026-06-29'`。
- 验证：`bash verify.sh` 全绿。新增纯函数先补测试再改实现（TDD）。

## 1. 排序列范围定义（哪些列「不可排」）

用户钦定的「长文本列」= 以下 4 个换行展示的大段文字列，**这些不可排**；**其余所有列一律可排**（含客户名称、商机名称/项目名称——它们虽 `wrap:true` 换行展示，但用户未将其列入排除清单，故可排）：

| key | 列标题 | 出现页面 |
|---|---|---|
| `weekProgress` | 本周工作进展 | 三页（跟进列） |
| `nextPlan` | 后续工作计划 | 三页（跟进列） |
| `remark` | 当前进展/风险说明/情况备注 | 仅商机跟进（来自 OPP_COLUMNS） |
| `mainProducts` | 主要涉及产品 | 仅商机跟进（来自 OPP_COLUMNS） |

> 注意：**不能用 `!wrap` 作为规则**。商机页 `customer`（客户名称）、`name`（商机名称/项目名称）在 `OPP_COLUMNS` 标了 `wrap:true`，但用户要求它们可排序。故用「显式排除上述 4 个 key」精确匹配用户定义。

## 2. 改动

### 2.1 新增共享工具 `frontend/src/lib/columnSort.ts`（新建）

```ts
import type { DataColumn } from '@/components/DataTable.vue'

/** 长文本列（大段换行文字），排序无意义，不开启排序。用户钦定 4 列。 */
export const NON_SORTABLE_KEYS = new Set<string>(['weekProgress', 'nextPlan', 'remark', 'mainProducts'])

/**
 * 给列集统一标记可排序：除长文本列(NON_SORTABLE_KEYS)外一律 sortable=true。
 * 其余字段原样保留;不改入参(返回新对象数组)。
 * 排序口径走 el-table 原生(按 row[col.key] 原始值),不附加比较器。
 */
export function withSortable(columns: DataColumn[]): DataColumn[] {
  return columns.map((c) => ({ ...c, sortable: !NON_SORTABLE_KEYS.has(c.key) }))
}
```

- 单一来源 + 单测，三页统一调用，避免排除规则在三处漂移。
- `withSortable` 覆盖每列的 `sortable`（无论原值），使非长文本列全部可排——这正是「所有列可排，长文本列除外」。

### 2.2 `frontend/src/views/KeyProjectsView.vue`

- 顶部 import 加：`import { withSortable } from '@/lib/columnSort'`（与 `useColumnPrefs` 等并列，约 `:11`）。
- `ALL_COLUMNS` 定义（`:66-82`）外包一层：
  ```ts
  const ALL_COLUMNS: DataColumn[] = withSortable([
    { key: 'projectId', label: '项目编号', width: 160 },
    // …原 14 列定义原样不动…
    { key: 'followBy', label: '跟进人', width: 120 },
  ])
  ```
- 效果：项目编号/客户/项目名/项目级别/项目经理/AR/SR/L4组织/合同金额(万)/风险/跟进日期/跟进人 全部可排；本周工作进展、后续工作计划 不可排。原有 `contractWan`/`followDate` 上的 `sortable: true` 内联标记可保留（`withSortable` 会覆盖为同值，无副作用），无需删。

### 2.3 `frontend/src/views/TempFollowupView.vue`

- 顶部 import 加：`import { withSortable } from '@/lib/columnSort'`。
- `ALL_COLUMNS` 定义（`:61-92`）外包一层 `withSortable([...])`，原 26 列定义原样不动。
- 效果：默认 14 列除「本周工作进展/后续工作计划」外全可排；额外列（阶段/项目类型/项目状态/健康度/完工%/回款完成率/消耗比/回款状态/TOP1000/象限/里程碑状态）也全部可排。

### 2.4 `frontend/src/views/OpportunityFollowupView.vue`

- 顶部 import 加：`import { withSortable } from '@/lib/columnSort'`。
- 对**最终合并后的** `ALL_COLUMNS`（`:68`）外包一层：
  ```ts
  const ALL_COLUMNS: DataColumn[] = withSortable([...OPP_COLUMNS.map(oppToDataColumn), ...FOLLOWUP_COLUMNS])
  ```
- **关键边界**：`withSortable` 只作用于本页本地合并数组，**不改 `opportunityColumns.ts / OPP_COLUMNS`**，因此 `/opportunities`（商机清单，`OpportunitiesView.vue`）页**完全不受影响**。`oppToDataColumn`（`:54-61`）保持原样（仍复制 `sortable: c.sortable`），由外层 `withSortable` 统一覆盖。
- 效果：L4组织/销售负责人/客户名称/行业归属/是否TOP1000/商机状态/主观预测/商机名称/预估金额(万)/商机级别/预估落单时间/是否重大POC/产品大类/是否含外包外采/FR负责人/FR能力匹配/交付资源匹配/是否需外区域支持/是否重点商机/是否提前介入/实际中标状态/中标日期/首次登记日期/最后更新日期/是否近7天更新/跟进日期/跟进人 全部可排；当前进展/风险说明/情况备注（remark）、主要涉及产品（mainProducts）、本周工作进展、后续工作计划 不可排。

## 3. 测试

### 3.1 新增 `frontend/src/lib/columnSort.test.ts`
- `withSortable` 给非长文本列设 `sortable:true`：传入 `[{key:'projectId',label:'项目编号'},{key:'contractWan',label:'合同',num:true}]` → 全部 `sortable===true`。
- `withSortable` 给 4 个长文本 key 设 `sortable:false`：传入 `weekProgress/nextPlan/remark/mainProducts` → 全部 `sortable===false`。
- 覆盖原值：传入 `{key:'weekProgress', sortable:true}`（原标可排）→ 输出 `sortable:false`（被规则覆盖）。
- 保留其它字段：传入带 `label/width/wrap/num/formatter/fixed` 的列 → 输出对应字段不变。
- 客户名称/商机名称可排（边界）：传入 `{key:'customer',wrap:true}`、`{key:'name',wrap:true}` → `sortable===true`（验证「wrap 但不在排除集 → 可排」）。
- 不改入参：断言返回的是新数组、新对象（入参对象 `sortable` 未被原地改写）。

### 3.2 现有 view 测试
- `KeyProjectsView.test.ts`、`TempFollowupView.test.ts`、`OpportunityFollowupView.test.ts` 现状**无** sortable/列数/caret 断言（已 grep 核实），加排序不破坏它们；`verify.sh` 跑通即可，无需改这三个测试文件。

## 4. 不动（明确边界）
- `frontend/src/components/DataTable.vue`（原生排序已接通，无需透传 sort-method）。
- `frontend/src/lib/opportunityColumns.ts`（`OPP_COLUMNS`，被 `/opportunities` 商机清单页共用）。
- `frontend/src/views/OpportunitiesView.vue`（商机清单页，非本次范围；它自有排序实现，不受本次影响）。
- 后端：`server.py`、`schema.py`、`preprocess_data.py`、各域解析。
- 各行构造 lib 的数据逻辑（`keyProjects.ts`/`tempFollowup.ts` 行字段、`opportunityColumns.ts` 列元数据）。
- 长文本 4 列（`weekProgress/nextPlan/remark/mainProducts`）保持不可排。
- 列偏好/选列/交叉筛选（`useColumnPrefs`、`crossFilter`）——排序与筛选分层，el-table 对已筛选的 `:data` 做视图层排序，二者互不干扰。

## 5. 影响与交付
- 三页所有非长文本列可点表头升/降序；单击表头单列排序（el-table 原生交互），无默认初始排序。
- 数值/日期/P1–P4 排序精确；枚举/中文文本按字符编码、空值穿插（用户已接受的原生口径）。
- `verify.sh` 全绿（前端 typecheck/vitest/build；后端 pytest 不受影响）。
- **纯前端、无 schema/preprocess/后端改动 → 升级不需点「更新数据」、无新依赖、无新页/无新 pageKey。** 打包按用户发话。

## 实现拆解（2 任务）
1. **WS-1 共享工具 + 测试**：新建 `lib/columnSort.ts`（`NON_SORTABLE_KEYS` + `withSortable`）+ `lib/columnSort.test.ts`（§3.1 全部用例，TDD 先红后绿）。
2. **WS-2 三页接入 + 版本 + 验证**：三个 View 各 import `withSortable` 并外包 `ALL_COLUMNS`；`version.ts` → V2.3.3；`PROGRESS.md` 记一行（本次纯前端、不需更新数据）；`bash verify.sh` 全绿。

WS-2 依赖 WS-1 的 `withSortable` 导出。
