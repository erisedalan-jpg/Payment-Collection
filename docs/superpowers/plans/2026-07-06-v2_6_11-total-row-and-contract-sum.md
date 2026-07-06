# V2.6.11 回款数据总计行 + 四跟进页合同金额合计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `/payment`「回款数据」L4 汇总表加一行恒在表底、不随排序移动的总计；给 `/projects/key`、`/projects/temp`、`/risk`、`/payment/key` 四页在「共X条」前加一个随筛选联动的合同金额合计。

**Architecture:** 纯前端展示层。诉求1 = 纯函数 `l4SummaryRow`（口径重算比率列）+ `DataTable` 开放 opt-in `show-summary` 透传 + `PaymentL4Table` 接线。诉求2 = 纯函数 `sumDistinctContractWan`（按 projectId 去重求和）+ 四页页脚接线。不改后端/schema/口径来源。

**Tech Stack:** Vue3 + TS + Element Plus（`el-table` 原生 `show-summary`）+ Vitest。

## Global Constraints

- 交流与文案用**简体中文**；**不使用任何 emoji**（需符号用 `→ ↓ ❌ ✕ ▾`）。
- 版本单一来源 `frontend/src/version.ts`；本期 Z 级 → **V2.6.11**，从 V2.6.10 增量。
- **纯前端改动，升级无需点「更新数据」**（不改 `preprocess_data.py`/schema）。
- 表格数字列必须挂 `.u-num`（`DataTable` 已按 `col.num` 处理，本期不新增数字列）。
- 完成率/达成率口径 = Σ流水净额 ÷ Σ合同；总计行比率列按此重算，**不得把百分比相加**。
- `DataTable` 有 22+ 处调用方，新增能力必须 **opt-in、默认关**，不得影响既有用法。
- 页脚必须**保留「共 N 条」子串**（现有测试断言 `toContain('共 51 条')`/`共 55 条`），只在其前追加。
- 完成定义：代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。

---

### Task 1: 纯函数 `l4SummaryRow`（回款数据表总计口径）

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts`（在 `summaryByDim` 之后追加）
- Test: `frontend/src/lib/paymentPmis.test.ts`（追加一个 describe）

**Interfaces:**
- Consumes: `DimSummary`（已存在，`paymentPmis.ts:165`，字段 `value, projectCount, contractSum, actualSum, rate, delayedNodeSum, remainingSum, nodeSum, reachedSum, delayedProjectCount, delayedAmountSum`）。
- Produces: `export interface L4SummaryTotals { projectCount, contractSum, actualSum, rate: number|null, delayedProjectCount, delayedNodeSum, delayedAmountSum, nodeSum, reachedSum, reachedRatio: number|null }` 与 `export function l4SummaryRow(rows: DimSummary[]): L4SummaryTotals`。Task 3 消费。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/paymentPmis.test.ts` 末尾追加（文件顶部若尚未从 `./paymentPmis` 引入 `l4SummaryRow` 与类型，在其现有 import 中补上 `l4SummaryRow`、`type DimSummary`）：

```ts
describe('l4SummaryRow 回款数据表总计', () => {
  const mk = (o: Partial<DimSummary>): DimSummary => ({
    value: 'X', projectCount: 0, contractSum: 0, actualSum: 0, rate: null,
    delayedNodeSum: 0, remainingSum: 0, nodeSum: 0, reachedSum: 0,
    delayedProjectCount: 0, delayedAmountSum: 0, ...o,
  })

  it('计数/金额列求和，比率列按口径重算(非百分比相加)', () => {
    const rows: DimSummary[] = [
      mk({ value: 'A', projectCount: 2, contractSum: 1_000_000, actualSum: 600_000, rate: 0.6, delayedNodeSum: 1, nodeSum: 4, reachedSum: 2, delayedProjectCount: 1, delayedAmountSum: 50_000 }),
      mk({ value: 'B', projectCount: 3, contractSum: 3_000_000, actualSum: 900_000, rate: 0.3, delayedNodeSum: 2, nodeSum: 6, reachedSum: 3, delayedProjectCount: 2, delayedAmountSum: 150_000 }),
    ]
    const t = l4SummaryRow(rows)
    expect(t.projectCount).toBe(5)
    expect(t.contractSum).toBe(4_000_000)
    expect(t.actualSum).toBe(1_500_000)
    expect(t.rate).toBeCloseTo(0.375)          // 1_500_000/4_000_000，不是 0.6+0.3
    expect(t.delayedProjectCount).toBe(3)
    expect(t.delayedNodeSum).toBe(3)
    expect(t.delayedAmountSum).toBe(200_000)
    expect(t.nodeSum).toBe(10)
    expect(t.reachedSum).toBe(5)
    expect(t.reachedRatio).toBeCloseTo(0.5)     // 5/10
  })

  it('分母为 0 时比率为 null', () => {
    const t = l4SummaryRow([mk({ contractSum: 0, actualSum: 0, nodeSum: 0, reachedSum: 0 })])
    expect(t.rate).toBeNull()
    expect(t.reachedRatio).toBeNull()
  })

  it('空输入 → 全 0、两比率 null', () => {
    const t = l4SummaryRow([])
    expect(t.contractSum).toBe(0)
    expect(t.projectCount).toBe(0)
    expect(t.rate).toBeNull()
    expect(t.reachedRatio).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: FAIL —— `l4SummaryRow is not a function` / 未导出。

- [ ] **Step 3: 实现 `l4SummaryRow`**

在 `frontend/src/lib/paymentPmis.ts` 的 `summaryByDim` 函数之后追加：

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

/** 回款数据表(L4汇总)总计行：计数/金额列 Σ；两比率列按口径重算(Σ分子÷Σ分母，分母0→null)。 */
export function l4SummaryRow(rows: DimSummary[]): L4SummaryTotals {
  const contractSum = rows.reduce((s, r) => s + r.contractSum, 0)
  const actualSum = rows.reduce((s, r) => s + r.actualSum, 0)
  const nodeSum = rows.reduce((s, r) => s + r.nodeSum, 0)
  const reachedSum = rows.reduce((s, r) => s + r.reachedSum, 0)
  return {
    projectCount: rows.reduce((s, r) => s + r.projectCount, 0),
    contractSum,
    actualSum,
    rate: contractSum > 0 ? actualSum / contractSum : null,       // Σ已回款 ÷ Σ合同
    delayedProjectCount: rows.reduce((s, r) => s + r.delayedProjectCount, 0),
    delayedNodeSum: rows.reduce((s, r) => s + r.delayedNodeSum, 0),
    delayedAmountSum: rows.reduce((s, r) => s + r.delayedAmountSum, 0),
    nodeSum,
    reachedSum,
    reachedRatio: nodeSum > 0 ? reachedSum / nodeSum : null,      // Σ完成节点 ÷ Σ回款节点
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: PASS（新 3 例 + 既有例全绿）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "feat(payment): l4SummaryRow 回款数据表总计口径(比率列重算) (V2.6.11)"
```

---

### Task 2: `DataTable` 开放 opt-in `show-summary`

**Files:**
- Modify: `frontend/src/components/DataTable.vue`
- Test: `frontend/src/components/DataTable.test.ts`（追加一个 describe）

**Interfaces:**
- Produces: `DataTable` 新增两个可选 prop —— `showSummary?: boolean`（默认 `false`）与 `summaryMethod?: (ctx: { columns: { property: string }[]; data: Record<string, any>[] }) => string[]`，透传给 `el-table` 的 `show-summary` / `summary-method`。Task 3 消费。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/components/DataTable.test.ts` 末尾追加：

```ts
describe('DataTable show-summary', () => {
  const cols: DataColumn[] = [
    { key: 'name', label: '名称' },
    { key: 'amount', label: '金额', num: true },
  ]
  const rows2 = [{ name: 'A', amount: 100 }, { name: 'B', amount: 200 }]

  it('showSummary + summaryMethod 渲染表底汇总行', async () => {
    const w = mount(DataTable, {
      props: {
        columns: cols, rows: rows2, showCount: false, showSummary: true,
        summaryMethod: ({ columns }: { columns: { property: string }[] }) =>
          columns.map((c) => (c.property === 'name' ? '合计' : c.property === 'amount' ? '300' : '')),
      },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).toContain('合计')
    expect(w.text()).toContain('300')
  })

  it('默认(showSummary 未传)不渲染汇总行', async () => {
    const w = mount(DataTable, {
      props: { columns: cols, rows: rows2, showCount: false },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).not.toContain('合计')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: FAIL —— 未透传 `show-summary`，汇总行不渲染，`toContain('合计')` 失败。

- [ ] **Step 3: 实现透传**

`frontend/src/components/DataTable.vue`：在 `defineProps` 泛型对象里、`externalSort?: boolean` 之后追加两行 prop：

```ts
    externalSort?: boolean
    /** opt-in 表底汇总行(el-table 原生 show-summary，恒在表底、不随排序移动)；默认关，不影响既有调用方 */
    showSummary?: boolean
    summaryMethod?: (ctx: { columns: { property: string }[]; data: Record<string, any>[] }) => string[]
```

把 `withDefaults` 的第二参数由 `{ showCount: true, clickable: false, externalSort: false }` 改为：

```ts
  { showCount: true, clickable: false, externalSort: false, showSummary: false },
```

在模板 `<el-table` 开标签内（`@sort-change="onSortChange"` 之后）追加两个绑定：

```html
      @sort-change="onSortChange"
      :show-summary="props.showSummary"
      :summary-method="props.summaryMethod"
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: PASS（新 2 例 + 既有例全绿）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DataTable.vue frontend/src/components/DataTable.test.ts
git commit -m "feat(table): DataTable 开放 opt-in show-summary 透传(默认关) (V2.6.11)"
```

---

### Task 3: `PaymentL4Table` 接线总计行

**Files:**
- Modify: `frontend/src/components/PaymentL4Table.vue`

**Interfaces:**
- Consumes: Task 1 的 `l4SummaryRow`（来自 `@/lib/paymentPmis`）；Task 2 的 `DataTable` `show-summary`/`summary-method`；已有 `fmtWan`、`fmtRatio`（`@/lib/format`，本文件已 import）。

- [ ] **Step 1: 引入 `l4SummaryRow`**

`frontend/src/components/PaymentL4Table.vue` 第 5 行现为：
```ts
import { projectPaymentRows, summaryByDim, filterProjects } from '@/lib/paymentPmis'
```
改为：
```ts
import { projectPaymentRows, summaryByDim, filterProjects, l4SummaryRow } from '@/lib/paymentPmis'
```

- [ ] **Step 2: 加总计计算与 `summaryMethod`**

在 `const COLUMNS: DataColumn[] = [ ... ]`（`PaymentL4Table.vue:34-46`）之后、`</script>` 之前追加：

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

（`computed` 已在本文件第 2 行 `import { computed } from 'vue'` 引入，无需改 import。）

- [ ] **Step 3: 模板传入 summary**

`PaymentL4Table.vue` 模板中的：
```html
      <DataTable :columns="COLUMNS" :rows="rows" :show-count="false" />
```
改为：
```html
      <DataTable :columns="COLUMNS" :rows="rows" :show-count="false" :show-summary="true" :summary-method="summaryMethod" />
```

- [ ] **Step 4: 类型检查 + 回归 + 构建**

Run: `cd frontend && npm run typecheck && npx vitest run && npm run build`
Expected: typecheck 无错；vitest 全绿（无回归）；build 成功。
（本任务逻辑口径已由 Task 1 `l4SummaryRow` 单测覆盖；此处为接线，门槛=类型+回归+构建，另加 Step 5 真机冒烟。）

- [ ] **Step 5: 真机冒烟（人工）**

`python server.py`（:8080）+ `cd frontend && npm run dev`，打开 `/payment`：「回款数据」表最下方出现一行「合计」，合同额/已回款为各行之和，完成率≈Σ已回款/Σ合同（非各行百分比相加），点任意列排序时合计行**始终在表底不动**。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/PaymentL4Table.vue
git commit -m "feat(payment): /payment 回款数据表底部总计行(比率列口径重算) (V2.6.11)"
```

---

### Task 4: 纯函数 `sumDistinctContractWan`（四页合同金额合计）

**Files:**
- Create: `frontend/src/lib/followupTotals.ts`
- Test: `frontend/src/lib/followupTotals.test.ts`

**Interfaces:**
- Produces: `export function sumDistinctContractWan(rows: Array<Record<string, unknown>>, valueKey: string): number` —— 按 `projectId` 去重后，对每个项目取一次 `rows[valueKey]`（万）数值求和；跳过非数值；无 `projectId` 的行各自独立计入；空集=0。Task 5 消费。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/followupTotals.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { sumDistinctContractWan } from './followupTotals'

describe('sumDistinctContractWan', () => {
  it('三页形态：每行唯一 projectId + contractWan，正常求和、跳过 null', () => {
    const rows = [
      { projectId: 'A', contractWan: 100 },
      { projectId: 'B', contractWan: 200.5 },
      { projectId: 'C', contractWan: null },
    ]
    expect(sumDistinctContractWan(rows, 'contractWan')).toBeCloseTo(300.5)
  })

  it('risk 形态：同一 projectId 多行，每项目只计一次；valueKey=项目金额', () => {
    const rows = [
      { projectId: 'A', '项目金额': 100 },   // 项目 A 两条风险
      { projectId: 'A', '项目金额': 100 },
      { projectId: 'B', '项目金额': 50 },
    ]
    expect(sumDistinctContractWan(rows, '项目金额')).toBe(150) // 100 + 50，A 不重复计
  })

  it('空集=0', () => {
    expect(sumDistinctContractWan([], 'contractWan')).toBe(0)
  })

  it('无 projectId 的行各自独立计入', () => {
    const rows = [{ contractWan: 10 }, { contractWan: 20 }]
    expect(sumDistinctContractWan(rows, 'contractWan')).toBe(30)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/followupTotals.test.ts`
Expected: FAIL —— 模块不存在 / 未导出。

- [ ] **Step 3: 实现**

创建 `frontend/src/lib/followupTotals.ts`：

```ts
/** 跟进页页脚合同金额合计：按 projectId 去重后，对每个项目取一次 valueKey(万) 数值求和。
 *  - key/temp/payment-key：valueKey='contractWan'，一行一项目 → 去重为恒等。
 *  - risk：valueKey='项目金额'，一项目多条风险 → 每项目只计一次(用户钦定)。
 *  跳过非数值(null/undefined)；无 projectId 的行各自独立计入；空集=0。 */
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

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/followupTotals.test.ts`
Expected: PASS（4 例全绿）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/followupTotals.ts frontend/src/lib/followupTotals.test.ts
git commit -m "feat(followup): sumDistinctContractWan 按项目去重合同金额合计 (V2.6.11)"
```

---

### Task 5: 四跟进页页脚接线合同金额合计

**Files:**
- Modify: `frontend/src/views/KeyProjectsView.vue`
- Modify: `frontend/src/views/TempFollowupView.vue`
- Modify: `frontend/src/views/RiskFollowupView.vue`
- Modify: `frontend/src/views/PaymentKeyFollowupView.vue`
- Test: `frontend/src/views/KeyProjectsView.test.ts` / `TempFollowupView.test.ts` / `RiskFollowupView.test.ts` / `PaymentKeyFollowupView.test.ts`（各加一条轻断言）

**Interfaces:**
- Consumes: Task 4 的 `sumDistinctContractWan`（`@/lib/followupTotals`）；`fmt`（`@/lib/format`）；各页已有的 `fp.filtered`（`useFollowupPage` 返回）。
- 四页 `<script setup>` 第 2 行均为 `import { computed, onMounted, reactive, ref } from 'vue'`（`computed` 已就绪）；四页当前均**未** import `@/lib/format`，需新增该 import。

- [ ] **Step 1: `KeyProjectsView.vue` 接线**

在 `<script setup>` 顶部 import 区追加两行：
```ts
import { sumDistinctContractWan } from '@/lib/followupTotals'
import { fmt } from '@/lib/format'
```
在 `const fp = useFollowupPage(...)` 之后追加：
```ts
const contractTotal = computed(() => sumDistinctContractWan(fp.filtered.value as Array<Record<string, unknown>>, 'contractWan'))
```
模板中 `<span class="u-num">共 {{ fp.filtered.value.length }} 条</span>` 改为：
```html
<span class="u-num">合同金额合计 {{ fmt(contractTotal, 1) }} 万 · 共 {{ fp.filtered.value.length }} 条</span>
```

- [ ] **Step 2: `TempFollowupView.vue` 接线**

同 Step 1，import 两行 + `contractTotal`（valueKey 仍 `'contractWan'`）+ 同样的 span 替换。

- [ ] **Step 3: `PaymentKeyFollowupView.vue` 接线**

同 Step 1，import 两行 + `contractTotal`（valueKey 仍 `'contractWan'`）+ 同样的 span 替换。

- [ ] **Step 4: `RiskFollowupView.vue` 接线（valueKey 用 `'项目金额'`）**

import 两行同上；`contractTotal` 用 `'项目金额'`：
```ts
const contractTotal = computed(() => sumDistinctContractWan(fp.filtered.value as Array<Record<string, unknown>>, '项目金额'))
```
模板中 `<span class="u-num">共 {{ fp.filtered.value.length }} 条</span>` 改为（标签仍「合同金额合计」，四页统一）：
```html
<span class="u-num">合同金额合计 {{ fmt(contractTotal, 1) }} 万 · 共 {{ fp.filtered.value.length }} 条</span>
```

- [ ] **Step 5: 四页各加一条轻断言**

在四个对应 `*.test.ts` 里、已断言 `共 51 条`/`共 55 条` 的同一测试内追加一行（不绑定具体金额，避免脆弱）：
```ts
expect(w.text()).toContain('合同金额合计')
```
（既有 `共 N 条` 断言保持不变，因新文案保留该子串，应仍通过。）

- [ ] **Step 6: 跑四页测试 + 类型检查**

Run: `cd frontend && npx vitest run src/views/KeyProjectsView.test.ts src/views/TempFollowupView.test.ts src/views/RiskFollowupView.test.ts src/views/PaymentKeyFollowupView.test.ts && npm run typecheck`
Expected: 四页测试全绿（含新 `合同金额合计` 断言与既有 `共 N 条` 断言）；typecheck 无错。

- [ ] **Step 7: 真机冒烟（人工）**

四页页脚显示「合同金额合计 X 万 · 共 N 条」；在任一页做列筛选，合计随可见行变化；`/risk` 对同一项目多条风险只计一次合同额。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/views/KeyProjectsView.vue frontend/src/views/TempFollowupView.vue frontend/src/views/RiskFollowupView.vue frontend/src/views/PaymentKeyFollowupView.vue frontend/src/views/KeyProjectsView.test.ts frontend/src/views/TempFollowupView.test.ts frontend/src/views/RiskFollowupView.test.ts frontend/src/views/PaymentKeyFollowupView.test.ts
git commit -m "feat(followup): 四跟进页页脚加合同金额合计(随筛选联动，/risk 按项目去重) (V2.6.11)"
```

---

### Task 6: bump V2.6.11 + verify 全绿 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts` 改为：
```ts
export const APP_VERSION = 'V2.6.11'
export const RELEASE_DATE = '2026-07-06'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法 + ruff + pytest + 前端 typecheck/vitest/build）。若前端未跑到，另跑 `cd frontend && npm run typecheck && npx vitest run && npm run build`。

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md` 顶部版本史处新增 V2.6.11 条目，一句话概述：`/payment` 回款数据表底部总计行（比率列口径重算）+ 四跟进页页脚合同金额合计（随筛选联动，`/risk` 按项目去重）；纯前端、升级无需点更新数据。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: bump V2.6.11 + PROGRESS(回款数据总计行+四页合同金额合计)"
```

---

## 打包（控制者收尾，PowerShell）

> 非实现任务；四任务全绿合 master 后由控制者执行，照 V2.6.10 惯例。

- 合 `master`：`git checkout master && git merge --no-ff <feat 分支>`。
- **PowerShell** 构建 /pm 版：`cd frontend; npx vite build --base=/pm/`，校验 `dist/index.html` 引用 `="/pm/assets`（Git Bash 会篡改 `--base=/pm/`，必须 PowerShell）。
- 写 `deploy/升级手册-V2.6.11.md`（从 V2.6.10 增量；**头号注意=纯前端、升级无需点「更新数据」**，覆盖 dist + 后端 .py 后强刷即可；无新页/pageKey/依赖）。
- `python make_update_zip.py` 出 `release/pmplatform-update-V2.6.11.zip`。
- **构建后重建默认 dist**：`cd frontend; npx vite build`（校验 `="/assets`），否则本地 :8080 白屏。

---

## Self-Review

**Spec 覆盖：**
- 诉求1（总计行、比率列重算、恒表底不随排序）→ Task 1（口径）+ Task 2（能力）+ Task 3（接线）。✓
- 诉求2（四页合同金额合计、随筛选、四页标签统一、`/risk` 按项目去重）→ Task 4（去重求和）+ Task 5（四页接线，risk 用 `项目金额`）。✓
- 版本/验证/打包 → Task 6 + 打包段。✓

**Placeholder 扫描：** 无 TBD/TODO；每个改代码步骤均含完整代码块与确切命令。✓

**类型一致：** `l4SummaryRow(rows: DimSummary[]): L4SummaryTotals`（Task 1 产出）在 Task 3 以 `l4SummaryRow(rows.value)` 消费，字段名 `rate/reachedRatio/contractSum/...` 与 `summaryMethod` 内 `disp` 映射逐一对齐；`sumDistinctContractWan(rows, valueKey)`（Task 4 产出）在 Task 5 四页以 `'contractWan'`/`'项目金额'` 消费，签名一致。✓
