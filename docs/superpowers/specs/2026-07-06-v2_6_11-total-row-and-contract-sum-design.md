# V2.6.11 回款数据总计行 + 四跟进页合同金额合计 设计

> 版本：V2.6.11（Z 级，页内局部展示调整）
> 日期：2026-07-06
> 背景来源：用户提出两条展示层诉求——(1) `/payment` 页「回款数据」表最下方加一行总计（不随排序移动、恒在底部）；(2) `/projects/key`、`/projects/temp`、`/risk`、`/payment/key` 四页在「共X条」前加一个随筛选变化的合同金额合计值。

## 1. 目标与边界

- **纯前端展示层**：不改 `preprocess_data.py`/`pmis.py`/schema，不动任何回款/成本口径的分子分母来源，不新增页面/pageKey/依赖。
- **诉求1**：`/payment` 的「回款数据」表（`PaymentL4Table.vue`，L4组汇总）底部固定一行总计。计数/金额列 = Σ 表内各行；两列比率列**按口径重算**（不是把百分比相加）。总计行由 Element Plus `el-table` 原生 `show-summary` 渲染，天然固定表底、不参与排序。
- **诉求2**：四跟进页在页脚「共X条」前显示「合同金额合计 X 万」，取 `Σ contractWan`（当前已过滤、分页前的全量行），随列筛选/范围/数据集切换自动变化。
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
- 各页行均含 `contractWan: number | null`（万元，`Math.round(contract/1000)/10`；`contract` = `paymentPmis.contract`，售前回退原项目）：
  - `/projects/key` → `keyProjects.ts:55`
  - `/payment/key` → `paymentKeyFollowup.ts:49`
  - `/projects/temp` → `tempFollowup.ts:81`（行为 `{ proj: { contractWan } }` 结构，见 3.3 注意）
  - `/risk` → 行同样带 `contractWan`（拍平风险行，字段随项目）

### 3.2 纯函数 `sumContractWan`
新增 `frontend/src/lib/followupTotals.ts`：
```ts
/** 求和跟进页行的合同金额（万元，跳过 null，空集=0）。 */
export function sumContractWan(rows: { contractWan: number | null }[]): number {
  return rows.reduce((s, r) => s + (r.contractWan ?? 0), 0)
}
```
- 跳过 `null`；空数组 → 0。

### 3.3 各页接线
每页 `<script setup>` 加：
```ts
import { sumContractWan } from '@/lib/followupTotals'
import { fmt } from '@/lib/format'
const contractTotal = computed(() => sumContractWan(fp.filtered.value as { contractWan: number | null }[]))
```
页脚 `.kp-pager` 内的计数 span 改为（**保留「共 N 条」子串**，仅前置）：
```html
<span class="u-num">合同金额合计 {{ fmt(contractTotal, 1) }} 万 · 共 {{ fp.filtered.value.length }} 条</span>
```
- `fmt(n, 1)`（`format.ts:2`）= 千分位、固定 1 位小数，例：`合同金额合计 12,345.6 万 · 共 120 条`。
- 因 `fp.filtered` 随列筛选/范围/数据集变化，合计值随之联动。

**四页行对象顶层均有 `contractWan`（已确认）**：`KeyProjectRow`（`keyProjects.ts:16`）定义 `contractWan: number | null`；`TempRow extends KeyProjectRow`（`tempFollowup.ts:6`）、`PaymentKeyRow`（`paymentKeyFollowup.ts:13`）、`/risk` 拍平行同样在顶层带 `contractWan`；四页列定义均为 `{ key: 'contractWan' }` 且 formatter 生效，证明顶层可直接取值。故四页一律 `sumContractWan(fp.filtered.value)`，无需字段路径特判。（`tempScope.ts` 中的 `{ proj: { contractWan } }` 是范围引擎输入的中间态，与表格行无关。）

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
2. `followupTotals.test.ts`（新）`sumContractWan`：正常求和、跳过 `null`、空集=0、全 `null`=0。
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
