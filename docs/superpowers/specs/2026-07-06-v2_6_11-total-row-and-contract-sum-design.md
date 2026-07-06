# V2.6.11 回款数据总计行 + 四跟进页合同金额合计 设计

> 版本：V2.6.11（Z 级，页内局部展示调整）
> 日期：2026-07-06
> 背景来源：用户提出两条展示层诉求——(1) `/payment` 页「回款数据」表最下方加一行总计（不随排序移动、恒在底部）；(2) `/projects/key`、`/projects/temp`、`/risk`、`/payment/key` 四页在「共X条」前加一个随筛选变化的合同金额合计值。

## 1. 目标与边界

- **纯前端展示层**：不改 `preprocess_data.py`/`pmis.py`/schema，不动任何回款/成本口径的分子分母来源，不新增页面/pageKey/依赖。
- **诉求1**：`/payment` 的「回款数据」表（`PaymentL4Table.vue`，L4组汇总）底部固定一行总计。计数/金额列 = Σ 表内各行；两列比率列**按口径重算**（不是把百分比相加）。总计行由 Element Plus `el-table` 原生 `show-summary` 渲染，天然固定表底、不参与排序。
- **诉求2**：四跟进页在页脚「共X条」前显示「合同金额合计 X 万」（四页标签统一），对当前已过滤、分页前的全量行按 `projectId` 去重后求和合同金额（万），随列筛选/范围/数据集切换自动变化。三页一行一项目、去重为恒等；`/risk` 一行一条风险、按项目去重每项目只计一次（用户钦定）。
- **升级**：纯前端 dist，**无需点「更新数据」**（不改 preprocess，`analysis_data.json` 不变）。

## 2. 诉求1：回款数据表总计行

### 2.1 现状锚点
- `/payment` → `DashboardView.vue` → `DashMetrics`（6 卡）+ `PaymentL4Table`（标题「回款数据」）+ `NoStageProjectsTable`。目标表是 **`PaymentL4Table.vue`**。
- `PaymentL4Table` 用 `DataTable.vue`（封装 `el-table`）。rows 来自 `summaryByDim(pr, 'dept')`（`paymentPmis.ts:178`，返回 `DimSummary[]`），并在视图内补 `reachedRatio = nodeSum>0 ? reachedSum/nodeSum : null`。
- 11 列（`PaymentL4Table.vue:34-46`）：`value`(L4组) / `projectCount`(项目数) / `contractSum`(合同额万) / `actualSum`(已回款万) / `rate`(回款额完成率) / `delayedProjectCount`(延期项目数) / `delayedNodeSum`(延期节点) / `delayedAmountSum`(延期金额万) / `nodeSum`(回款节点数) / `reachedSum`(完成节点数) / `reachedRatio`(完成节点比例)。
- `DimSummary`（`paymentPmis.ts:165-177`）字段：`value, projectCount, contractSum, actualSum, rate, delayedNodeSum, remainingSum, nodeSum, reachedSum, delayedProjectCount, delayedAmountSum`（`remainingSum` 不在表列内，忽略）。
- 此表无分页；`DataTable` 拿到的 `rows` = 全部 L4 组行。

### 2.2 纯函数 `l4SummaryRow`
新增到 `frontend/src/lib/paymentPmis.ts`（紧邻 `summaryByDim`），对 `DimSummary[]` 求总计，返回**原始数值对象**（格式化留给视图，便于单测）：

```ts
export interface L4SummaryTotals {
  projectCount: number
  contractSum: number
  actualSum: number
  rate: number | null
  delayedProjectCount: number
  delayedNodeSum: number
  delayedAmountSum: number
  nodeSum: number
  reachedSum: number
  reachedRatio: number | null
}

export function l4SummaryRow(rows: DimSummary[]): L4SummaryTotals {
  const contractSum = rows.reduce((s, r) => s + r.contractSum, 0)
  const actualSum = rows.reduce((s, r) => s + r.actualSum, 0)
  const nodeSum = rows.reduce((s, r) => s + r.nodeSum, 0)
  const reachedSum = rows.reduce((s, r) => s + r.reachedSum, 0)
  return {
    projectCount: rows.reduce((s, r) => s + r.projectCount, 0),
    contractSum,
    actualSum,
    rate: contractSum > 0 ? actualSum / contractSum : null,   // Σ已回款 ÷ Σ合同（同全站完成率口径）
    delayedProjectCount: rows.reduce((s, r) => s + r.delayedProjectCount, 0),
    delayedNodeSum: rows.reduce((s, r) => s + r.delayedNodeSum, 0),
    delayedAmountSum: rows.reduce((s, r) => s + r.delayedAmountSum, 0),
    nodeSum,
    reachedSum,
    reachedRatio: nodeSum > 0 ? reachedSum / nodeSum : null,   // Σ完成节点 ÷ Σ回款节点
  }
}
```

- **比率列重算**：`rate` 与 `reachedRatio` 由 Σ分子/Σ分母重算，绝不相加百分比；分母为 0 → `null`（前端 `fmtRatio` 显 `-`）。
- **加和无重复**：每个项目在 `summaryByDim(_,'dept')` 中唯一归属一个 L4 桶，故 `projectCount`/`delayedProjectCount` 直接 Σ 即为全量去重后的总数。
- 空输入 → 各 Σ=0、两比率=`null`。

### 2.3 `DataTable.vue` 开放 `show-summary`（opt-in、默认关）
`DataTable` 现有 22+ 处调用，改动必须**默认不影响既有用法**。新增两个可选 prop 透传给 `el-table`：

```ts
showSummary?: boolean   // 默认 false
summaryMethod?: (ctx: { columns: any[]; data: any[] }) => string[]   // el-table 原生 summary-method 签名
```

`withDefaults` 加 `showSummary: false`。模板 `<el-table>` 增：
```html
:show-summary="props.showSummary"
:summary-method="props.summaryMethod"
```
- `showSummary` 为 `false` 时 `el-table` 不渲染汇总行，`summaryMethod` 不被调用 → 其余 22+ 处零影响。
- `el-table` 的汇总行始终渲染在表体底部、独立于排序，天然满足「不随排序改变、默认最下方」。

### 2.4 `PaymentL4Table.vue` 接线
- 引入 `l4SummaryRow`、`fmtWan`、`fmtRatio`。
- 计算总计并组装逐列展示串（`el-table` 的 `summary-method` 收到 `{ columns }`，`columns[i].property` 即列 `key`）：

```ts
const totals = computed(() => l4SummaryRow(rows.value))
function summaryMethod({ columns }: { columns: { property: string }[] }): string[] {
  const t = totals.value
  const disp: Record<string, string> = {
    value: '合计',
    projectCount: String(t.projectCount),
    contractSum: fmtWan(t.contractSum),
    actualSum: fmtWan(t.actualSum),
    rate: fmtRatio(t.rate),
    delayedProjectCount: String(t.delayedProjectCount),
    delayedNodeSum: String(t.delayedNodeSum),
    delayedAmountSum: fmtWan(t.delayedAmountSum),
    nodeSum: String(t.nodeSum),
    reachedSum: String(t.reachedSum),
    reachedRatio: fmtRatio(t.reachedRatio),
  }
  return columns.map((c) => disp[c.property] ?? '')
}
```

- 模板：`<DataTable :columns="COLUMNS" :rows="rows" :show-count="false" :show-summary="true" :summary-method="summaryMethod" />`。
- 首列显「合计」，与 `el-table` 默认 `sum-text` 语义一致；金额列 `fmtWan`（Σ为元、÷万），比率列 `fmtRatio`。
- 空表时 `PaymentL4Table` 现有 `v-if="!rows.length"` 分支照旧显「暂无数据」，不渲染表与总计。

## 3. 诉求2：四跟进页合同金额合计

### 3.1 现状锚点
四页均用 `useFollowupPage`（`composables/useFollowupPage.ts`），页脚结构一致（`.kp-pager`）：
```html
<div v-if="fp.filtered.value.length" class="kp-pager">
  <span class="u-num">共 {{ fp.filtered.value.length }} 条</span>
  <el-pagination ... />
</div>
```
- `fp.filtered` = 应用列筛选/范围/数据集（当前 vs 历史）后的**全量行、分页前**（`useFollowupPage.ts:35`）。
- **行粒度与金额字段两类（关键差异）**：
  - **一行一个项目**的三页，金额字段为顶层 `contractWan: number | null`（万元，`Math.round(contract/1000)/10`，`contract = paymentPmis.contract`，售前回退原项目）：`/projects/key`(`keyProjects.ts:55`) / `/payment/key`(`paymentKeyFollowup.ts:49`) / `/projects/temp`(`TempRow extends KeyProjectRow`，`tempFollowup.ts`)。
  - **一行一条风险记录**的 `/risk`：`buildRiskRows` 按 项目×风险记录 拍平（`riskRows.ts:37`），同一项目有多条风险即多行；金额字段为中文键 **`项目金额`**（万元，`Math.round(paymentPmis.contract/1000)/10`，`riskRows.ts:43`——与 `contractWan` **同源同公式**，仅列名不同，列标签「项目金额(万)」）。「共N条」= 风险条数。
- **四页行均有顶层 `projectId`**：`keyProjects.ts:14` / `paymentKeyFollowup.ts:12` / `TempRow` 继承 / `riskRows.ts:39`——去重求和以此为键。

### 3.2 纯函数 `sumDistinctContractWan`
新增 `frontend/src/lib/followupTotals.ts`。语义统一为「**当前筛选后所见的不同项目，各取一次金额（万）求和**」——三页一行一项目时去重为恒等，`/risk` 一项目多行时每项目只计一次（用户钦定）：
```ts
/** 跟进页页脚合同金额合计：按 projectId 去重后，对每个项目取一次 valueKey(万) 数值求和。
 *  - key/temp/payment-key：valueKey='contractWan'，行本就一项目一行，去重为恒等。
 *  - risk：valueKey='项目金额'，一项目多条风险 → 每项目只计一次。
 *  跳过非数值（null/undefined）；无 projectId 的行各自独立计入；空集=0。 */
export function sumDistinctContractWan(rows: Array<Record<string, unknown>>, valueKey: string): number {
  const seen = new Set<string>()
  let sum = 0
  for (const r of rows) {
    const id = String(r.projectId ?? '')
    if (id) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    const v = r[valueKey]
    if (typeof v === 'number') sum += v
  }
  return sum
}
```

### 3.3 各页接线
三页（`/projects/key`、`/projects/temp`、`/payment/key`）`<script setup>` 加：
```ts
import { sumDistinctContractWan } from '@/lib/followupTotals'
import { fmt } from '@/lib/format'
const contractTotal = computed(() => sumDistinctContractWan(fp.filtered.value as Array<Record<string, unknown>>, 'contractWan'))
```
`/risk` 页 valueKey 改为 `'项目金额'`：
```ts
const contractTotal = computed(() => sumDistinctContractWan(fp.filtered.value as Array<Record<string, unknown>>, '项目金额'))
```
四页页脚 `.kp-pager` 内的计数 span 统一改为（**保留「共 N 条」子串，仅前置；四页标签统一「合同金额合计」**）：
```html
<span class="u-num">合同金额合计 {{ fmt(contractTotal, 1) }} 万 · 共 {{ fp.filtered.value.length }} 条</span>
```
- `fmt(n, 1)`（`format.ts:2`）= 千分位、固定 1 位小数，例：`合同金额合计 12,345.6 万 · 共 120 条`。
- 因 `fp.filtered` 随列筛选/范围/数据集变化，合计值随之联动。

**`/risk` 去重语义（用户钦定）**：`/risk` 一行一条风险，`共 N 条`=风险条数；合同金额合计按 `projectId` 去重、每项目的 `项目金额` 只计一次，故其合计对应的是「不同项目数」的合同额、通常 < N（与另三页 1 项目 1 行、合计对应 N 个项目不同）。这是刻意选择，非缺陷。

## 4. 影响面

- **诉求1**：仅 `/payment`「回款数据」表新增一行总计；`DataTable` 其余调用方因 `showSummary` 默认 `false` 完全不受影响。
- **诉求2**：四页页脚文案在「共N条」前增一段；`共 N 条` 子串保留 → 现有断言 `toContain('共 51 条')`/`toContain('共 55 条')`（`KeyProjectsView/TempFollowupView/PaymentKeyFollowupView/RiskFollowupView` 各 test）**不受破坏**。
- 无后端、无口径、无数据结构变化。

## 5. 测试与验证

**新增单测：**
1. `paymentPmis.test.ts` 加 `l4SummaryRow`：
   - 多行 Σ 正确（projectCount/contractSum/actualSum/各节点/金额）；
   - `rate` = Σactual/Σcontract（重算，非百分比相加）；`reachedRatio` = Σreached/Σnode；
   - `contractSum=0` → `rate=null`；`nodeSum=0` → `reachedRatio=null`；
   - 空输入 → 全 0、两比率 `null`。
2. `followupTotals.test.ts`（新）`sumDistinctContractWan`：三页形态（每行唯一 projectId + `contractWan`）正常求和、跳过 `null`、空集=0；`/risk` 形态（同一 projectId 多行 + `项目金额`）每项目只计一次、不同项目相加、`valueKey='项目金额'` 生效；无 `projectId` 行各自独立计入。
3. `DataTable.test.ts` 加：`showSummary=true` + `summaryMethod` 时渲染汇总行、含预期总计文本；`showSummary` 默认关时不渲染汇总行。

**视图侧：** 四页各加一条轻断言 `expect(w.text()).toContain('合同金额合计')`（仅验标签出现，不绑定具体金额，避免脆弱）。既有 `共 N 条` 断言保持不变、应仍通过。

**回归验证：** `bash verify.sh` 全绿（ruff + pytest + 前端 typecheck/vitest/build）。真机 `python server.py` + `npm run dev` 冒烟：`/payment` 表底出现「合计」行且比率合理；四页页脚显示「合同金额合计…万 · 共…条」，切换列筛选时合计随之变化。

## 6. 版本与打包

- 版本：**V2.6.11**（Z 级，`frontend/src/version.ts` 单一来源，从 V2.6.10 增量）。
- 纯前端改动，**升级无需点「更新数据」**；收尾出增量更新包（从 V2.6.10 增量）+ 升级手册。

## 7. 不做什么（明确排除）

- 不改 `NoStageProjectsTable`（诉求1只针对「回款数据」L4 汇总表）。
- 不给 `DataTable` 其它调用方默认开启 summary。
- 不重构既有列 formatter、不改 `contractWan` 口径来源（售前回退原项目保持不变）。
- 不动 preprocess/schema/后端。
