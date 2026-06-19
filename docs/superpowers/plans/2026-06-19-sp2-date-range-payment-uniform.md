# SP2 周期日期范围 + 回款口径统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"枚举周期"换成"起始-结束日期范围"并贯穿所有回款页面，统一回款口径（计划/待回款/延期=节点按计划日∈区间；已回款=流水按到账日∈区间；项目级页面按区间动态重算），纯前端。

**Architecture:** 新增 `lib/paymentRange.ts`（`inRange`/`actualInRange`/`paymentPmisInRange`/`hasActivityInRange`）；filter store 把 `filterYear` 换 `dateStart/dateEnd`+预设；各回款消费方改用区间口径。关键安全网：区间「全部」(`['','']`) ≡ 现状全时口径（契约/回归测试强制）。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus；vitest。

**Spec:** `docs/superpowers/specs/2026-06-19-sp2-date-range-payment-uniform-design.md`（口径权威）。

## Global Constraints

- 全程简体中文；**禁用任何 emoji**（符号只用 → ↓ ❌ ✕ ▾）。
- **禁止 `git add -A`/`.`**；逐路径 add。提交结尾恒一行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 纯前端：**不改** 后端/`schema.py`/`data/*.json`。节点 `data.paymentNodes`、流水逐笔 `data.paymentRecords[pid].records[]`（含 `date`=回款确认日、`amount`=付款金额）均已在前端数据。
- 版本单一来源 `frontend/src/version.ts`，本轮 `V1.11.0`（Y）。
- 样式只引用 theme.css 令牌，不手写散值。
- 跑测试 `cd frontend && npx vitest run <file>`；提交前 `npm run typecheck`；末任务 `bash verify.sh` 全绿。

## 口径细则（spec §3 派生，所有任务遵守）

- `inRange(date,start,end)`：两端皆空→true（全部，含空日期）；否则 date 非空且界内。
- **计划回款**=Σ节点 `expectedPayment`（计划日∈R）；**待回款**=Σ节点 `unpaidAmount`（计划日∈R）；**回款节点数**=count 节点（计划日∈R）；**延期项目数**=distinct 项目（节点 status=延期 且 计划日∈R）；**延期节点数**=count（同前不去重）。
- **已回款**=Σ流水 `amount`（回款确认日∈R）。
- **完成率**=已回款(R) ÷ 计划回款(R)，分母 0/缺→null。
- **项目数**=区间内有回款活动的项目数（节点计划日∈R 或 流水到账日∈R，限视角/排除后）。
- board 的旧异类口径收敛到上表：`pendingSum` 由「Σmax(合同−已回,0)」改「Σ节点未收(计划日∈R)」；`rate` 由「已回/合同」改「已回/计划」。
- **不变式**：R=`['','']`（全部）时，以上聚合数值 = 现状全时口径（节点全量 / 流水 total）。每个改动任务都要保留一条「全部」断言锁住此不变式。

---

### Task 1: paymentRange.ts 区间聚合核心

**Files:**
- Create: `frontend/src/lib/paymentRange.ts`
- Test: `frontend/src/lib/paymentRange.test.ts`

**Interfaces:**
- Produces（后续所有任务消费）：
  - `inRange(date: string, start: string, end: string): boolean`
  - `actualInRange(records: PaymentRecord[] | undefined, start: string, end: string): number`
  - `hasActivityInRange(nodes: PaymentNodePmis[] | undefined, records: PaymentRecord[] | undefined, start: string, end: string): boolean`
  - `interface RangePmis { contract; expectedTotal; actualTotal; remainingTotal; nodeCount; reachedCount; delayedCount; paymentRatio: number|null }`
  - `paymentPmisInRange(contract: number, nodes: PaymentNodePmis[]|undefined, records: PaymentRecord[]|undefined, start: string, end: string): RangePmis`

- [ ] **Step 1: 写失败测试 `paymentRange.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { inRange, actualInRange, hasActivityInRange, paymentPmisInRange } from './paymentRange'

const N = (planDate: string, exp: number, unpaid: number, status: string, reached = false) =>
  ({ planDate, expectedPayment: exp, unpaidAmount: unpaid, status, reached } as any)
const R = (date: string, amount: number) => ({ date, amount } as any)

describe('inRange', () => {
  it('全部(两端空)恒真,含空日期', () => {
    expect(inRange('', '', '')).toBe(true)
    expect(inRange('2026-03-01', '', '')).toBe(true)
  })
  it('限定区间:空日期排除,界内含端点', () => {
    expect(inRange('', '2026-01-01', '2026-12-31')).toBe(false)
    expect(inRange('2026-01-01', '2026-01-01', '2026-12-31')).toBe(true)
    expect(inRange('2026-12-31', '2026-01-01', '2026-12-31')).toBe(true)
    expect(inRange('2025-12-31', '2026-01-01', '2026-12-31')).toBe(false)
  })
  it('单端开放', () => {
    expect(inRange('2026-05-01', '2026-03-01', '')).toBe(true)
    expect(inRange('2026-02-01', '2026-03-01', '')).toBe(false)
    expect(inRange('2026-02-01', '', '2026-03-01')).toBe(true)
  })
})

describe('actualInRange', () => {
  it('按到账日窗求和;undefined→0', () => {
    expect(actualInRange(undefined, '', '')).toBe(0)
    const recs = [R('2026-02-10', 100), R('2026-05-10', 200), R('', 50)]
    expect(actualInRange(recs, '', '')).toBe(350)                       // 全部含空日期? 空日期 amount 计入全部
    expect(actualInRange(recs, '2026-01-01', '2026-03-31')).toBe(100)  // 仅 2/10
  })
})

describe('paymentPmisInRange', () => {
  const nodes = [N('2026-02-01', 1000, 1000, '延期'), N('2026-05-01', 500, 0, '已回款', true), N('2025-12-01', 300, 300, '待回款')]
  const recs = [R('2026-02-10', 400), R('2025-11-01', 100)]
  it('区间聚合(计划日筛节点,到账日筛流水)', () => {
    const r = paymentPmisInRange(2000, nodes, recs, '2026-01-01', '2026-12-31')
    expect(r.expectedTotal).toBe(1500)   // 1000+500(2025的300排除)
    expect(r.remainingTotal).toBe(1000)  // 1000+0
    expect(r.nodeCount).toBe(2)
    expect(r.reachedCount).toBe(1)
    expect(r.delayedCount).toBe(1)
    expect(r.actualTotal).toBe(400)      // 仅2/10(2025/11排除)
    expect(r.contract).toBe(2000)
    expect(r.paymentRatio).toBeCloseTo(400 / 1500, 4)
  })
  it('全部≡全量(不变式):expected=Σ全节点,actual=Σ全流水', () => {
    const r = paymentPmisInRange(2000, nodes, recs, '', '')
    expect(r.expectedTotal).toBe(1800)   // 1000+500+300
    expect(r.actualTotal).toBe(500)      // 400+100
    expect(r.delayedCount).toBe(1)
  })
})

describe('hasActivityInRange', () => {
  it('节点计划日或流水到账日落区间即真', () => {
    expect(hasActivityInRange([N('2026-02-01', 1, 1, '待回款')], [], '2026-01-01', '2026-12-31')).toBe(true)
    expect(hasActivityInRange([], [R('2026-02-10', 1)], '2026-01-01', '2026-12-31')).toBe(true)
    expect(hasActivityInRange([N('2025-01-01', 1, 1, '待回款')], [R('2025-01-01', 1)], '2026-01-01', '2026-12-31')).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认变红**

Run: `cd frontend && npx vitest run src/lib/paymentRange.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 `paymentRange.ts`**

```ts
import type { PaymentNodePmis, PaymentRecord } from '@/types/analysis'

/** 日期是否落入 [start,end]（含端点）。两端皆空=全部→恒真（含空日期）；否则要求 date 非空且界内。 */
export function inRange(date: string, start: string, end: string): boolean {
  if (!start && !end) return true
  return !!date && (!start || date >= start) && (!end || date <= end)
}

/** 流水按回款确认日窗求和（全部时含空日期记录）。 */
export function actualInRange(records: PaymentRecord[] | undefined, start: string, end: string): number {
  if (!records) return 0
  return records.reduce((s, r) => s + (inRange(String(r.date ?? ''), start, end) ? Number(r.amount ?? 0) : 0), 0)
}

/** 区间内是否有回款活动：节点计划日∈R 或 流水到账日∈R。 */
export function hasActivityInRange(
  nodes: PaymentNodePmis[] | undefined, records: PaymentRecord[] | undefined, start: string, end: string,
): boolean {
  if ((nodes ?? []).some((n) => inRange(String(n.planDate ?? ''), start, end))) return true
  return (records ?? []).some((r) => inRange(String(r.date ?? ''), start, end))
}

export interface RangePmis {
  contract: number
  expectedTotal: number
  actualTotal: number
  remainingTotal: number
  nodeCount: number
  reachedCount: number
  delayedCount: number
  paymentRatio: number | null
}

/** 区间版项目回款摘要：节点按计划日∈R，流水按到账日∈R；contract 静态传入。 */
export function paymentPmisInRange(
  contract: number, nodes: PaymentNodePmis[] | undefined, records: PaymentRecord[] | undefined,
  start: string, end: string,
): RangePmis {
  const ns = (nodes ?? []).filter((n) => inRange(String(n.planDate ?? ''), start, end))
  const expectedTotal = round2(ns.reduce((s, n) => s + Number(n.expectedPayment ?? 0), 0))
  const remainingTotal = round2(ns.reduce((s, n) => s + Number(n.unpaidAmount ?? 0), 0))
  const actualTotal = round2(actualInRange(records, start, end))
  return {
    contract,
    expectedTotal,
    actualTotal,
    remainingTotal,
    nodeCount: ns.length,
    reachedCount: ns.filter((n) => n.reached).length,
    delayedCount: ns.filter((n) => n.status === '延期').length,
    paymentRatio: expectedTotal > 0 ? round4(actualTotal / expectedTotal) : null,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000
```

- [ ] **Step 4: 跑测试确认变绿 + typecheck**

Run: `cd frontend && npx vitest run src/lib/paymentRange.test.ts && npm run typecheck`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/paymentRange.ts frontend/src/lib/paymentRange.test.ts
git commit -m "feat(payment): paymentRange 区间聚合核心(inRange/actualInRange/paymentPmisInRange)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: filter store 日期范围（默认「全部」过渡）

**Files:**
- Modify: `frontend/src/stores/filter.ts`
- Test: `frontend/src/stores/filter.test.ts`（若无则新建；有则扩）

**Interfaces:**
- Consumes: Task 1 `inRange`。
- Produces: store 暴露 `dateStart: Ref<string>`、`dateEnd: Ref<string>`、`setDateRange(start,end)`、`setPreset(key: 'month'|'quarter'|'year'|'all')`、`payRecordsAll`（`data.paymentRecords`）；`filteredPayNodes` 改按 `inRange(planDate, dateStart, dateEnd)`。**本任务默认 `dateStart=dateEnd=''`（全部）**——保证迁移期间既有数值不变；Task 13 再翻默认为本年度。
- 移除：`filterYear`、`yearOptions`、`buildYearOptions`、`setYear`。

- [ ] **Step 1: 扩/建 `filter.test.ts`（先红）**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFilterStore } from './filter'

beforeEach(() => setActivePinia(createPinia()))

describe('filter store 日期范围', () => {
  it('默认全部(两端空)', () => {
    const f = useFilterStore()
    expect(f.dateStart).toBe('')
    expect(f.dateEnd).toBe('')
  })
  it('setDateRange 写起止', () => {
    const f = useFilterStore()
    f.setDateRange('2026-01-01', '2026-03-31')
    expect(f.dateStart).toBe('2026-01-01')
    expect(f.dateEnd).toBe('2026-03-31')
  })
  it("setPreset('all') 清空区间", () => {
    const f = useFilterStore()
    f.setDateRange('2026-01-01', '2026-03-31')
    f.setPreset('all')
    expect(f.dateStart).toBe('')
    expect(f.dateEnd).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试确认变红**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts`
Expected: FAIL（dateStart 等不存在）。

- [ ] **Step 3: 改 `filter.ts`**

顶部加 `import { inRange } from '@/lib/paymentRange'`。

删除 `buildYearOptions`、`filterYear`、`yearOptions`、`setYear`。新增：
```ts
  const dateStart = ref('')
  const dateEnd = ref('')
  function setDateRange(start: string, end: string) { dateStart.value = start || ''; dateEnd.value = end || '' }
  function setPreset(key: 'month' | 'quarter' | 'year' | 'all') {
    if (key === 'all') { dateStart.value = ''; dateEnd.value = ''; return }
    const now = new Date()
    const y = now.getFullYear()
    const pad = (n: number) => String(n).padStart(2, '0')
    if (key === 'year') { dateStart.value = `${y}-01-01`; dateEnd.value = `${y}-12-31`; return }
    if (key === 'quarter') {
      const q = Math.floor(now.getMonth() / 3); const sm = q * 3 + 1
      dateStart.value = `${y}-${pad(sm)}-01`; dateEnd.value = `${y}-${pad(sm + 2)}-${pad(new Date(y, sm + 2, 0).getDate())}`; return
    }
    const m = now.getMonth() + 1
    dateStart.value = `${y}-${pad(m)}-01`; dateEnd.value = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`
  }
  const payRecordsAll = computed(() => data.data?.paymentRecords ?? {})
```
`filteredPayNodes` 内年份分支替换为：在传给 `filterPayNodes` 前或之后按 `inRange(r.planDate, dateStart.value, dateEnd.value)` 过滤（见 Task 4 对 `filterPayNodes` 的对应改造；本任务 store 侧把 `filterYear` 入参移除，date 过滤交由 `filterPayNodes` 新签名）。导出里把 `filterYear/yearOptions/setYear` 换为 `dateStart/dateEnd/setDateRange/setPreset/payRecordsAll`。

- [ ] **Step 4: 跑测试 + typecheck（会暴露下游引用 filterYear 的编译错）**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts && npm run typecheck`
Expected: filter.test PASS；typecheck 可能报下游（FilterBar/TrendCard 等仍引用 filterYear）——这些在 Task 3/4… 修复。**本步只需 filter.test 绿**；若 typecheck 错全部集中在"filterYear 不存在"的下游消费方，记录待后续任务修，不在本任务展开。

> 注：为避免本任务留下编译红，Task 2 与 Task 3、Task 4 的 filterPayNodes 改造**在同一分支连续推进**；若中途 typecheck 红仅限 filterYear 下游引用，属预期，到对应任务转绿。实现者如担心中间态，可把 Task 2+3+4 合并为一次提交序列后统一跑 typecheck。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/filter.ts frontend/src/stores/filter.test.ts
git commit -m "feat(filter): store 周期枚举→日期范围(dateStart/dateEnd+预设,默认全部过渡)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: FilterBar 日期范围 UI

**Files:**
- Modify: `frontend/src/layout/FilterBar.vue`
- Test: `frontend/src/layout/FilterBar.test.ts`（若有则改；无则可在本任务新建轻量测试）

**Interfaces:** Consumes Task 2 的 `dateStart/dateEnd/setDateRange/setPreset`。

- [ ] **Step 1: 改 `FilterBar.vue`**

把「周期」`<label>`（含 `data-test="year-select"` 的 `<select>`）整段替换为日期范围 + 预设：
```html
    <label class="fb-item">
      周期
      <el-date-picker data-test="date-range" :model-value="[f.dateStart, f.dateEnd]" type="daterange"
        value-format="YYYY-MM-DD" range-separator="至" start-placeholder="起" end-placeholder="止" size="small"
        @update:model-value="(v: any) => f.setDateRange(v?.[0] ?? '', v?.[1] ?? '')" />
      <span class="fb-presets">
        <button v-for="p in PRESETS" :key="p.key" type="button" class="fb-preset"
          @click="f.setPreset(p.key)">{{ p.label }}</button>
      </span>
    </label>
```
`<script setup>` 内删除 `year` computed（及其 get/set），加：
```ts
const PRESETS = [
  { key: 'month' as const, label: '本月' },
  { key: 'quarter' as const, label: '本季' },
  { key: 'year' as const, label: '本年' },
  { key: 'all' as const, label: '全部' },
] 
```
`<style scoped>` 加 `.fb-presets { display: inline-flex; gap: var(--sp-1); }` 与 `.fb-preset { padding: var(--sp-1) var(--sp-2); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); font-size: var(--fs-1); cursor: pointer; }`（hover 用 `var(--hover-tint)`）。视角部分不动。

- [ ] **Step 2: FilterBar 测试**

若存在 `FilterBar.test.ts` 且断言 `year-select`，改为断言 `date-range` 选择器存在与预设按钮（≥4 个 `.fb-preset`，点击「本年」后 `f.dateStart` 非空）。若不存在，新建该测试覆盖此两点。

- [ ] **Step 3: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/layout/FilterBar.test.ts && npm run typecheck`
Expected: FilterBar 相关 PASS（typecheck 余下 filterYear 下游错由后续任务清）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layout/FilterBar.vue frontend/src/layout/FilterBar.test.ts
git commit -m "feat(filter): FilterBar 周期改日期范围选择器+预设

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: filterPayNodes 区间化 + /payment 六 card 口径

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`（`filterPayNodes`、`payDashSummary`）
- Modify: `frontend/src/stores/filter.ts`（`filteredPayNodes` 调用新 `filterPayNodes`）
- Modify: `frontend/src/components/DashMetrics.vue`（消费已回款=流水、项目数=区间活动）
- Test: `frontend/src/lib/payDashboard.test.ts`、`frontend/src/components/DashMetrics.test.ts`

**Interfaces:** Consumes Task1 `inRange/actualInRange/hasActivityInRange`、Task2 `dateStart/dateEnd/payRecordsAll`。

- [ ] **Step 1: 改 `filterPayNodes` 签名（年份→区间）**

`payDashboard.ts`：`PayNodeFilterOpts` 把 `filterYear: string` 改为 `dateStart: string; dateEnd: string`；函数体年份分支整段替换为：
```ts
  // 计划日落区间(全部时不限)
  if (opts.dateStart || opts.dateEnd) ns = ns.filter((r) => inRange(r.planDate || '', opts.dateStart, opts.dateEnd))
  return ns
```
顶部 `import { inRange, actualInRange, hasActivityInRange } from './paymentRange'`。`stores/filter.ts` 的 `filteredPayNodes` 传 `{ ...,  dateStart: dateStart.value, dateEnd: dateEnd.value, ... }`（去掉 filterYear）。

- [ ] **Step 2: 改 `payDashSummary`（已回款→流水，项目数→区间活动）**

签名加流水与区间：`payDashSummary(rows, projects, opts, paymentRecords, paymentNodes, start, end)`（或封装一个 opts；保持调用方简单，建议显式参数）。改：
```ts
  // 先取在范围内项目(视角/排除/异常),流水与项目数都只在 inScope 上算,避免计入范围外项目
  const inScope = filterProjects(projects, opts)
  // 已回款=inScope 项目的流水(到账日∈R) Σ
  const totalActual = inScope.reduce((s, p) => s + actualInRange(paymentRecords?.[p.projectId]?.records, start, end), 0)
  // 计划/待回款来自已按计划日过滤的 rows(rows 已是 filteredPayNodes,含视角/排除/异常)
  const totalExpected = rows.reduce((s, r) => s + r.expectedPayment, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.unpaidAmount, 0)
  const delayedPids = new Set(rows.filter((r) => r.status === '延期').map((r) => r.projectId))
  // 项目数=inScope 中区间内有回款活动的项目
  const totalProjects = inScope.filter((p) => hasActivityInRange(paymentNodes?.[p.projectId], paymentRecords?.[p.projectId]?.records, start, end)).length
  return { relatedNodeCount: rows.length, totalProjects, totalExpected, totalActual, totalRemaining,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0, delayedProjects: delayedPids.size }
```
（`rate`=已回款/计划=totalActual/totalExpected，符合口径细则。`projects` 传 `data.projects` 原集，函数内 `filterProjects` 得 inScope；`rows` 传 `filteredPayNodes`。流水/项目数都只在 inScope 上算，与 rows 的范围一致。）

- [ ] **Step 3: 改 `DashMetrics.vue` 调用**

`payDashSummary(filter.filteredPayNodes, data.data?.projects ?? [], opts, filter.payRecordsAll, data.data?.paymentNodes, filter.dateStart, filter.dateEnd)`；6 个 card 取值键不变（totalProjects/relatedNodeCount/totalActual/totalRemaining/rate/delayedProjects），标签 V1.10.2 已就位。

- [ ] **Step 4: 测试（含「全部」不变式 + 区间 + 流水已回款）**

`payDashboard.test.ts`：把既有 `filterYear` 用例改 `dateStart/dateEnd`；新增：
```ts
  it('全部:已回款=Σ流水, 项目数=有活动项目(不变式)', () => {
    // 构造 projects + paymentRecords + paymentNodes, start=end=''
    // 断言 totalActual===Σ全部流水 amount, rate===totalActual/totalExpected
  })
  it('区间:已回款只计到账日∈R 的流水, 计划只计计划日∈R 的节点', () => { /* ... */ })
```
（实现者按文件既有 node()/fixture 风格补全，构造含 paymentRecords.records 的 fixture；断言数值。）
`DashMetrics.test.ts`：注入 paymentRecords，断言「已回款」显示流水汇总（万）、与节点已收脱钩。

- [ ] **Step 5: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/lib/payDashboard.test.ts src/components/DashMetrics.test.ts && npm run typecheck`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/payDashboard.ts frontend/src/stores/filter.ts frontend/src/components/DashMetrics.vue frontend/src/lib/payDashboard.test.ts frontend/src/components/DashMetrics.test.ts
git commit -m "feat(payment): filterPayNodes 区间化 + /payment 六card 已回款改流水/项目数改区间活动

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 服务组达成排名（OrgRanking）区间+流水

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`（`payOrgRanking` → 区间+流水按 L4）
- Modify: `frontend/src/components/OrgRanking.vue`
- Test: `frontend/src/lib/payDashboard.test.ts`、`frontend/src/components/OrgRanking.test.ts`（若有）

**Interfaces:** Consumes Task1 `actualInRange`；按 L4 聚合计划(节点)与已回款(流水)。

- [ ] **Step 1: 新增/改 `payOrgRankingInRange`**

新增函数（保留 `payOrgRanking` 或直接改其签名；推荐新签名）：
```ts
export function payOrgRanking(
  projects: Project[], paymentNodes: Record<string, PaymentNodePmis[]> | undefined,
  paymentRecords: Record<string, PaymentRecordsEntry> | undefined,
  start: string, end: string, sortBy: 'actualTotal' | 'achievementRate',
): OrgRank[] {
  const m: Record<string, OrgRank> = {}
  for (const p of projects) {
    const org = (p.orgL4 ?? '').trim() || '未指定'
    if (!m[org]) m[org] = { org, expectedTotal: 0, actualTotal: 0, actualTotalWan: 0, achievementRate: 0 }
    for (const n of paymentNodes?.[p.projectId] ?? []) if (inRange(n.planDate || '', start, end)) m[org].expectedTotal += Number(n.expectedPayment ?? 0)
    m[org].actualTotal += actualInRange(paymentRecords?.[p.projectId]?.records, start, end)
  }
  const list = Object.values(m).map((o) => ({ ...o, achievementRate: o.expectedTotal > 0 ? o.actualTotal / o.expectedTotal : 0, actualTotalWan: o.actualTotal / 10000 }))
  return list.sort((a, b) => b[sortBy] - a[sortBy])
}
```
（达成率=已回款/计划，与口径细则一致。projects 传已 filterProjects 后的集合，使视角/排除/异常生效。）

- [ ] **Step 2: 改 `OrgRanking.vue` 调用**

传 `filterProjects(data.data?.projects ?? [], opts)`、`data.data?.paymentNodes`、`filter.payRecordsAll`、`filter.dateStart`、`filter.dateEnd`、`sortBy`。其余（top8 slice 等）SP2 不动（SP3 再改展全部）。

- [ ] **Step 3: 测试**

`payDashboard.test.ts` 加 `payOrgRanking` 区间用例（两个 L4，断言计划=节点(计划日∈R)、已回款=流水(到账∈R)、达成率比值、排序）。OrgRanking.test 若有则同步调用签名。

- [ ] **Step 4: 跑测试 + typecheck → Commit**

```bash
git add frontend/src/lib/payDashboard.ts frontend/src/components/OrgRanking.vue frontend/src/lib/payDashboard.test.ts
git commit -m "feat(payment): 服务组达成排名 按区间+流水(计划=节点/已回=流水)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 金额档位 TierStrip 区间+流水

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`（`payTierStats` → 区间；已回款档位用流水）
- Modify: `frontend/src/components/TierStrip.vue`
- Test: `frontend/src/lib/payDashboard.test.ts`

**Interfaces:** 档位(tier)由项目合同派生；已回款按档位=Σ该档位项目流水(到账∈R)。

- [ ] **Step 1: 改 `payTierStats`**

档位聚合改为以项目为单位（tier 由 project 合同档定），计划/待回款/延期=该档位项目节点(计划日∈R)，已回款=Σ该档位项目流水(到账∈R)：
```ts
export function payTierStats(
  tier: string, projects: Project[], paymentNodes: Record<string, PaymentNodePmis[]> | undefined,
  paymentRecords: Record<string, PaymentRecordsEntry> | undefined, start: string, end: string,
): PayTierStat {
  const grp = projects.filter((p) => deriveTier(p.paymentPmis?.contract) === tier)
  let expected = 0, remaining = 0, nodeCnt = 0, delayed = 0, paid = 0, actual = 0
  for (const p of grp) {
    for (const n of paymentNodes?.[p.projectId] ?? []) if (inRange(n.planDate || '', start, end)) {
      expected += Number(n.expectedPayment ?? 0); remaining += Number(n.unpaidAmount ?? 0); nodeCnt++
      if (n.status === '延期') delayed++; if (n.status === '已回款') paid++
    }
    actual += actualInRange(paymentRecords?.[p.projectId]?.records, start, end)
  }
  return { projectCount: grp.length, relatedNodeCount: nodeCnt, expectedAmountWan: expected / 10000,
    actualAmountWan: actual / 10000, remainingAmountWan: remaining / 10000, delayedCount: delayed, paidCount: paid }
}
```
（`deriveTier` 从 paymentPmis 导入；`projects` 传已 filterProjects 集。）

- [ ] **Step 2: 改 `TierStrip.vue` 调用**（按 TIERS 调新签名，传 filterProjects 后项目 + nodes + records + 区间）。下钻 `BoardDrilldownModal` 接线不变（SP2 不动下钻；如其取数依赖旧 tierStats 字段，保持字段名一致即可）。

- [ ] **Step 3: 测试 + typecheck → Commit**

`payDashboard.test.ts` 加 `payTierStats` 区间用例（构造不同档位项目，断言已回款走流水、计划走节点）。
```bash
git add frontend/src/lib/payDashboard.ts frontend/src/components/TierStrip.vue frontend/src/lib/payDashboard.test.ts
git commit -m "feat(payment): 金额档位 TierStrip 按区间+流水

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 待回款趋势 TrendCard 数据接区间（视觉留 SP3）

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`（`payMonthlyTrend`/`payQuarterlyTrend` 去 filterYear 依赖，fill 骨架由区间推导）
- Modify: `frontend/src/components/TrendCard.vue`
- Test: `frontend/src/lib/payDashboard.test.ts`

**Interfaces:** 趋势仍是"未全额回款节点按计划月/季分桶的待回款(Σ未收)"；只把 fill 骨架的依据由 `filterYear` 换 `[dateStart,dateEnd]`。

- [ ] **Step 1: 改趋势函数签名**

`payMonthlyTrend(rows, start, end)` / `payQuarterlyTrend(rows, start, end)`：`rows` 已是 `filteredPayNodes`（计划日∈R）。fill 骨架：当 start 与 end 同年（或给定区间）时按区间内的月份/季度补零；否则用数据出现的桶。最简实现：
```ts
function fillKeysFromRange(start: string, end: string, granularity: 'month' | 'quarter'): string[] { /* 由 start..end 枚举月或季,空区间返回 [] */ }
```
（实现者写该纯函数：解析 start/end 的 YYYY-MM，按粒度枚举区间内键；两端空→[]。）`isSpecificYear`/旧 filterYear 分支删除。

- [ ] **Step 2: 改 `TrendCard.vue`** 传 `filter.dateStart/filter.dateEnd`（去 `filter.filterYear`）。视觉（柱宽/横滑）不动，归 SP3。

- [ ] **Step 3: 测试 + typecheck → Commit**

`payDashboard.test.ts`：趋势用例改区间入参；断言桶按区间补零、值=Σ未收。
```bash
git add frontend/src/lib/payDashboard.ts frontend/src/components/TrendCard.vue frontend/src/lib/payDashboard.test.ts
git commit -m "feat(payment): 待回款趋势数据接日期区间(视觉留SP3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: board 区间重算（paymentBoard + BoardView）

**Files:**
- Modify: `frontend/src/lib/paymentBoard.ts`（`buildPayBoardRows` 用 `paymentPmisInRange`；`PayBoardRow` 加 `remainingTotal`；`buildGroup.pendingSum`/`rate` 收敛口径）
- Modify: `frontend/src/views/BoardView.vue`（调用传 nodes/records/区间）
- Test: `frontend/src/lib/paymentBoard.test.ts`（若有）、`frontend/src/views/BoardView.test.ts`（若有）

**Interfaces:** Consumes Task1 `paymentPmisInRange`。

- [ ] **Step 1: 改 `buildPayBoardRows` 与 `PayBoardRow`**

`PayBoardRow` 加 `remainingTotal: number`。`buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, start, end)`：每项目 `const rp = paymentPmisInRange(p.paymentPmis?.contract ?? 0, paymentNodes?.[p.projectId], paymentRecords?.[p.projectId]?.records, start, end)`，行字段 `contract=rp.contract, actualTotal=rp.actualTotal, expectedTotal=rp.expectedTotal, remainingTotal=rp.remainingTotal, delayedCount=rp.delayedCount, paymentRatio=rp.paymentRatio`，`progress=deriveProgress(rp.contract, rp.paymentRatio)`。

- [ ] **Step 2: `buildGroup` 口径收敛**

```ts
  pendingSum: grows.reduce((s, r) => s + r.remainingTotal, 0),     // 改:节点未收(计划日∈R)
  rate: expectedSum > 0 ? actualSum / expectedSum : null,          // 改:已回款/计划(先算 expectedSum)
```
（把 `expectedSum` 计算提到 rate 之前；删除旧 `Math.max(contract-actual,0)` 与 `actualSum/contractSum`。）

- [ ] **Step 3: 改 `BoardView.vue`** `buildPayBoardRows(filterProjects(data.data?.projects ?? [], opts), projectPmis, data.data?.paymentNodes, filter.payRecordsAll, filter.dateStart, filter.dateEnd)`。排名/交叉/透视均消费新行，无需额外改。

- [ ] **Step 4: 测试（含「全部」不变式）+ typecheck → Commit**

`paymentBoard.test.ts`：构造 projects + nodes + records；断言 全部 下 actualSum=Σ流水、pendingSum=Σ节点未收、rate=actual/expected；区间下随之收窄。BoardView.test 若断言旧 rate(/合同) 数值则更新为新口径。
```bash
git add frontend/src/lib/paymentBoard.ts frontend/src/views/BoardView.vue frontend/src/lib/paymentBoard.test.ts
git commit -m "feat(payment): board 按区间重算(paymentPmisInRange)+待回款/完成率口径收敛

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 部门汇总（ProjectsOverviewTab + projectPaymentRows/summaryByDim）区间重算

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts`（`projectPaymentRows` 支持区间；`summaryByDim` 已回款随之）
- Modify: `frontend/src/components/ProjectsOverviewTab.vue`
- Test: `frontend/src/lib/paymentPmis.test.ts`

**Interfaces:** Consumes Task1 `paymentPmisInRange`。

- [ ] **Step 1: `projectPaymentRows` 加区间重算**

签名加 `paymentNodes/paymentRecords/start/end`；每项目用 `paymentPmisInRange` 覆盖 `contract/actualTotal/expectedTotal/nodeCount/reachedCount/delayedCount` 与派生 `paymentRatio/progress`，并加 `remainingTotal` 字段（`PayProjectRow` 新增 `remainingTotal: number`）。`deriveTier` 仍按合同；`overspendAmount/projectAmount` 不变。
```ts
export function projectPaymentRows(projects, pmisMap, paymentNodes?, paymentRecords?, start = '', end = ''): PayProjectRow[] {
  return projects.map((p) => {
    const rp = paymentPmisInRange(p.paymentPmis?.contract ?? 0, paymentNodes?.[p.projectId], paymentRecords?.[p.projectId]?.records, start, end)
    const progress = deriveProgress(rp.contract, rp.paymentRatio)
    // ...其余字段同现状,但 actualTotal=rp.actualTotal, expectedTotal=rp.expectedTotal, nodeCount=rp.nodeCount,
    //    reachedCount=rp.reachedCount, delayedCount=rp.delayedCount, paymentRatio=rp.paymentRatio, remainingTotal=rp.remainingTotal
  })
}
```
`summaryByDim` 不改逻辑（它对 rows 聚合）；因 rows 的 actualTotal 现为流水区间值，部门汇总「已回款」自动随之。`DimSummary` 如需「待回款」可加 `remainingSum: Σ remainingTotal`（ProjectsOverviewTab 若展示待回款列则用；当前部门汇总列为 项目数/合同/已回/完成率/延期节点，已回随流水，完成率= rate(已回/合同? 见下)）。
> 部门汇总完成率：`summaryByDim.rate` 当前=Σ已回÷Σ合同。按口径细则统一为 Σ已回÷Σ计划。改 `rate: expSum>0 ? actualSum/expSum : null`（新增 `expSum=Σ expectedTotal`）。

- [ ] **Step 2: 改 `ProjectsOverviewTab.vue`** 调用传 nodes/records/区间；列展示不变（数值随区间）。

- [ ] **Step 3: 测试 + typecheck → Commit**

`paymentPmis.test.ts`：`projectPaymentRows`/`summaryByDim` 区间用例 + 全部不变式（全部下 actualTotal=Σ流水、rate=已回/计划）。
```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/components/ProjectsOverviewTab.vue frontend/src/lib/paymentPmis.test.ts
git commit -m "feat(payment): 部门汇总/项目行 按区间重算(已回=流水,完成率=已回/计划)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 回款节点/进度/风险三 tab 区间化

**Files:**
- Modify: `frontend/src/components/TierNodesTab.vue`（节点表随 filteredPayNodes 区间——多数随 Task4 已自动；确认其 paymentNodeRows/filterProjects 取数经区间）
- Modify: `frontend/src/components/PlanTab.vue`、`frontend/src/lib/paymentPmis.ts` `progressBuckets`（消费 projectPaymentRows 区间行）
- Modify: `frontend/src/components/RiskTab.vue`、`paymentPmis.ts` `pmisRiskGroups`（延期节点随计划日∈R）
- Test: `frontend/src/lib/paymentPmis.test.ts`

**Interfaces:** 复用 Task9 的 `projectPaymentRows(区间)` 与 Task4 的 `filteredPayNodes`/`paymentNodeRows`。

- [ ] **Step 1: PlanTab/RiskTab/TierNodesTab 取数切区间**

三 tab 把 `projectPaymentRows(filterProjects(...), pmisMap)` 改为传 nodes/records/区间（Task9 新签名）；`paymentNodeRows` 用法处确保 node 集已按计划日∈R（经 filteredPayNodes 或对 paymentNodeRows 结果再 inRange 过滤）。`progressBuckets`/`pmisRiskGroups` 逻辑不变（消费区间行）。RiskTab 延期节点列表：对节点按 `inRange(planDate)` 过滤后再取 status=延期。

- [ ] **Step 2: 测试 + typecheck → Commit**

`paymentPmis.test.ts`：`progressBuckets`/`pmisRiskGroups` 用区间行的用例（确认延期/进度随区间）。
```bash
git add frontend/src/components/TierNodesTab.vue frontend/src/components/PlanTab.vue frontend/src/components/RiskTab.vue frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "feat(payment): 回款节点/进度/风险三tab 区间化

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 日历 + 台账区间化（CalendarView / LedgerView / ledger.ts）

**Files:**
- Modify: `frontend/src/views/CalendarView.vue`（节点取数随 filteredPayNodes 区间）
- Modify: `frontend/src/lib/ledger.ts`（`ledgerRows` 已回款改流水按到账∈R）
- Modify: `frontend/src/views/LedgerView.vue`
- Test: `frontend/src/lib/ledger.test.ts`、`frontend/src/views/LedgerView.test.ts`/`CalendarView.test.ts`（若有）

**Interfaces:** Consumes Task1 `actualInRange`。

- [ ] **Step 1: `ledgerRows` 已回款改流水**

签名加 `paymentRecords/start/end`；`actualPayment` 由 `Σnode.receivedAmount` 改 `actualInRange(paymentRecords?.[pid]?.records, start, end)`；`expectedPayment/remainingAmount` 仍 Σ节点（nodeRows 已按计划日∈R 过滤）；`paymentRatio=actualPayment/expectedPayment`。`ledgerSummaryPmis.totalAct` 随之=Σ流水。
> 注：`paymentStatus`(已全额/部分/未回款) 现按 actualPayment/expected 派生——流水化后仍按该比值，语义不变。

- [ ] **Step 2: 改 `LedgerView.vue`** 传 records+区间给 `ledgerRows`；`CalendarView.vue` 确认其节点取数经 `filteredPayNodes`（计划日∈R）。

- [ ] **Step 3: 测试 + typecheck → Commit**

`ledger.test.ts`：`ledgerRows` 已回款=流水区间、计划/未收=节点；全部不变式。
```bash
git add frontend/src/lib/ledger.ts frontend/src/views/LedgerView.vue frontend/src/views/CalendarView.vue frontend/src/lib/ledger.test.ts
git commit -m "feat(payment): 日历/台账区间化(台账已回款改流水)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 总览回款带 + computeKpis + InsightView 口径对齐

**Files:**
- Modify: `frontend/src/lib/overview.ts`（`paymentBand` 区间+已回款流水；`computeKpis` 回款达成率改流水+排除异常）
- Modify: `frontend/src/views/OverviewView.vue`（传区间/records）
- Modify: `frontend/src/lib/insight.ts`/`InsightView.vue` 回款列口径与异常排除对齐（关闭 SP1-followup backlog）
- Test: `frontend/src/lib/overview.test.ts`、相关 view 测试

**Interfaces:** Consumes Task1 `inRange/actualInRange`、SP1 `isAnomalous`（@/lib/anomaly）。

- [ ] **Step 1: `paymentBand` 区间+流水**

`paymentBand(rows, now, paymentRecords, start, end)`：`yearExpected/monthPending`（计划侧）按 `inRange(planDate)`（年/月仍可由 now 推；或直接用区间）；`yearActual` 改 `Σ actualInRange(records, start, end)`（按到账日）；`delayedTop` 节点先按 `inRange(planDate)` 再取延期。
> 设计取舍：回款带的"年度进度"在 SP2 下含义=当前区间进度（标题随之）；与全站日期一致。

- [ ] **Step 2: `computeKpis` 回款达成率**

「回款达成率」分子改 `Σ流水(全量)`、分母 `Σ计划`，并对 `isAnomalous` 项目排除（与回款看板一致）。关闭 PROGRESS「SP1-followup」第一点。

- [ ] **Step 3: InsightView 回款列**

`insight` 回款相关列（回款完成率/延期）对异常项目排除；与口径对齐（不加日期范围，/insight 非回款看板）。关闭「SP1-followup」第二点。

- [ ] **Step 4: 测试 + typecheck → Commit**

`overview.test.ts`：`paymentBand` 区间/流水用例（已回款=流水到账∈R）；`computeKpis` 排除异常+流水分子。InsightView/Overview view 测试随口径更新断言。
```bash
git add frontend/src/lib/overview.ts frontend/src/views/OverviewView.vue frontend/src/lib/insight.ts frontend/src/views/InsightView.vue frontend/src/lib/overview.test.ts
git commit -m "feat(payment): 总览回款带区间+流水, computeKpis/Insight 口径对齐并排除异常

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: 默认翻本年度 + 版本 V1.11.0 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/stores/filter.ts`（默认 `dateStart/dateEnd` 翻为本年度）
- Modify: 受默认影响的 view 测试（进页未设区间者现见本年度数据）
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 默认本年度**

`filter.ts` 把 `dateStart/dateEnd` 初值由 `''` 改为本年度（store 初始化时计算）：
```ts
  const _y = new Date().getFullYear()
  const dateStart = ref(`${_y}-01-01`)
  const dateEnd = ref(`${_y}-12-31`)
```
`filter.test.ts` 「默认全部」用例改为「默认本年度」（断言 dateStart=`${当年}-01-01`）。

- [ ] **Step 2: 修受默认影响的 view 测试**

凡进页未显式设区间、断言全时数值的 view 测试（DashMetrics/Board/Ledger/Overview/Calendar 等），改为在 mount 前 `f.setPreset('all')`（断言全时口径）或按本年度数据调整断言。逐个跑 `npx vitest run <file>` 修到绿。

- [ ] **Step 3: 版本 + PROGRESS**

`version.ts` → `V1.11.0`/`2026-06-19`。`PROGRESS.md`：当前版本 V1.11.0 + 最近更新；版本区加一条（合并 SHA 留 `<finishing 回填>`）；**移除/标记完成** backlog「SP1-followup」（computeKpis/InsightView 已对齐）。

- [ ] **Step 4: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（前端 typecheck/vitest/build + 后端 ruff/pytest）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/filter.ts frontend/src/stores/filter.test.ts frontend/src/version.ts PROGRESS.md <受影响的 view 测试文件...>
git commit -m "chore: SP2 默认本年度 + 版本 V1.11.0 + PROGRESS(日期范围/口径统一)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 验证总览（finishing 前）

- `bash verify.sh` 全绿。
- 手动：FilterBar 选区间/预设 → /payment 六card、board、部门汇总、趋势、日历、台账、总览带 全随区间变；切「全部」数值回到改前（不变式）；视角/排除与日期叠加正确；/projects·/closed 不受影响。
- 口径核对：同区间下 /payment「已回款」与 board「已回款」一致（均流水）；完成率=已回/计划；延期项目数/延期节点数各自正确。

## 自检遗留（计划者注）

- Task 2/3/4 中间态 typecheck 可能因下游仍引用 `filterYear` 而红——属预期，连续推进到 Task 4 转绿；实现者可视情把这三步的提交连续完成后再判 typecheck 全绿。
- 「全部≡现状」不变式是回归底线：每个聚合改动任务必须保留一条「全部」断言。
