# SP2 周期日期范围 + 回款口径统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"枚举周期"换成"起始-结束日期范围"并贯穿所有回款页面，统一回款口径（计划/待回款/延期=节点按计划日∈区间；已回款=流水按到账日∈区间；项目级页面按区间动态重算），纯前端。

**Architecture:** 新增 `lib/paymentRange.ts`（区间聚合纯函数）；filter store 把 `filterYear` 换 `dateStart/dateEnd`+预设；各回款消费方改用区间口径。**绿色可保策略**：先做原子"筛选基座"（移除 filterYear 的所有直接引用，默认区间「全部」≡现状），再逐消费方叠加口径改动；末任务把默认翻为本年度。关键安全网：区间「全部」(`['','']`) ≡ 现状全时口径（回归测试强制）。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus；vitest。

**Spec:** `docs/superpowers/specs/2026-06-19-sp2-date-range-payment-uniform-design.md`（口径权威）。

## Global Constraints

- 全程简体中文；**禁用任何 emoji**（符号只用 → ↓ ❌ ✕ ▾）。
- **禁止 `git add -A`/`.`**；逐路径 add。提交结尾恒一行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 纯前端：**不改** 后端/`schema.py`/`data/*.json`。节点 `data.paymentNodes`、流水逐笔 `data.paymentRecords[pid].records[]`（含 `date`=回款确认日、`amount`=付款金额）均已在前端数据。
- 版本单一来源 `frontend/src/version.ts`，本轮 `V1.11.0`（Y）。
- 样式只引用 theme.css 令牌，不手写散值。
- 跑测试 `cd frontend && npx vitest run <file>`；提交前 `npm run typecheck`；**每个任务结束须前端 typecheck + 相关 vitest 全绿**（绿色可保策略保证可行）；末任务 `bash verify.sh` 全绿。

## 口径细则（spec §3 派生，所有任务遵守）

- `inRange(date,start,end)`：两端皆空→true（全部，含空日期）；否则 date 非空且界内。
- **计划回款**=Σ节点 `expectedPayment`（计划日∈R）；**待回款**=Σ节点 `unpaidAmount`（计划日∈R）；**回款节点数**=count 节点（计划日∈R）；**延期项目数**=distinct 项目（节点 status=延期 且 计划日∈R）；**延期节点数**=count（同前不去重）。
- **已回款**=Σ流水 `amount`（回款确认日∈R）。
- **完成率**=已回款(R) ÷ 计划回款(R)，分母 0/缺→null。
- **项目数**=区间内有回款活动的项目数（节点计划日∈R 或 流水到账日∈R，限视角/排除后）。
- board 旧异类口径收敛：`pendingSum` 由「Σmax(合同−已回,0)」改「Σ节点未收(计划日∈R)」；`rate` 由「已回/合同」改「已回/计划」。部门汇总 `summaryByDim.rate` 同改为「已回/计划」。
- **不变式**：R=`['','']`（全部）时，以上聚合数值 = 现状全时口径（节点全量 / 流水 total）。每个聚合改动任务保留一条「全部」断言锁住此不变式。
- **已回款只在 inScope（filterProjects 后：视角/排除/异常）项目上求和**，不计范围外项目。

---

### Task 1: paymentRange.ts 区间聚合核心 [已完成 commit 22447b9]

新增 `frontend/src/lib/paymentRange.ts` + test。导出：
- `inRange(date: string, start: string, end: string): boolean`
- `actualInRange(records: PaymentRecord[] | undefined, start: string, end: string): number`
- `hasActivityInRange(nodes: PaymentNodePmis[]|undefined, records: PaymentRecord[]|undefined, start: string, end: string): boolean`
- `interface RangePmis { contract; expectedTotal; actualTotal; remainingTotal; nodeCount; reachedCount; delayedCount; paymentRatio: number|null }`
- `paymentPmisInRange(contract: number, nodes, records, start, end): RangePmis`

（本任务已交付并审查通过，后续任务直接 import 上述函数。）

---

### Task 2: 筛选基座（原子，保持全绿）

一次性移除 `filterYear` 的所有直接引用，换成日期范围；**默认区间「全部」`['','']`（≡ 现状 filterYear='all'，节点全量），故整套既有数值不变、测试保持绿**。本任务**不改**任何回款金额口径（已回款仍走节点已收，待 Task 3+ 改）。

**Files:**
- Modify: `frontend/src/stores/filter.ts`（filterYear→dateStart/dateEnd+预设+payRecordsAll；filteredPayNodes 用 inRange）
- Modify: `frontend/src/lib/payDashboard.ts`（`filterPayNodes` 年份→区间；`payMonthlyTrend`/`payQuarterlyTrend` filterYear→dateStart/dateEnd）
- Modify: `frontend/src/layout/FilterBar.vue`（周期 select→日期范围选择器+预设）
- Modify: `frontend/src/components/TrendCard.vue`（传 dateStart/dateEnd，去 filterYear）
- Test: `frontend/src/stores/filter.test.ts`、`frontend/src/lib/payDashboard.test.ts`、`frontend/src/layout/FilterBar.test.ts`（若有）

**Interfaces:**
- Consumes: Task1 `inRange`。
- Produces: store `dateStart/dateEnd/setDateRange/setPreset/payRecordsAll`；`filterPayNodes(rows, {dateStart,dateEnd,viewMode,viewL4,viewPM,excludeActive,excludedIds})`；趋势函数 `payMonthlyTrend(rows,start,end)`/`payQuarterlyTrend(rows,start,end)`。

- [ ] **Step 1: 确认 filterYear 直接引用面**

Run: `cd frontend && git grep -n "filterYear\|yearOptions\|setYear" -- src`
预期命中：filter.ts / FilterBar.vue / payDashboard.ts(filterPayNodes,trends) / TrendCard.vue + 对应测试。本任务覆盖全部命中；若有命中未列在 Files 上，一并纳入（保证移除后无残留引用）。

- [ ] **Step 2: 改 `filter.ts`（先红 store 测试）**

顶部 `import { inRange } from '@/lib/paymentRange'`。删 `buildYearOptions/filterYear/yearOptions/setYear`。加：
```ts
  const dateStart = ref('')   // 本任务默认「全部」过渡;Task 11 翻本年度
  const dateEnd = ref('')
  function setDateRange(start: string, end: string) { dateStart.value = start || ''; dateEnd.value = end || '' }
  function setPreset(key: 'month' | 'quarter' | 'year' | 'all') {
    if (key === 'all') { dateStart.value = ''; dateEnd.value = ''; return }
    const now = new Date(); const y = now.getFullYear(); const pad = (n: number) => String(n).padStart(2, '0')
    if (key === 'year') { dateStart.value = `${y}-01-01`; dateEnd.value = `${y}-12-31`; return }
    if (key === 'quarter') { const q = Math.floor(now.getMonth() / 3); const sm = q * 3 + 1
      dateStart.value = `${y}-${pad(sm)}-01`; dateEnd.value = `${y}-${pad(sm + 2)}-${pad(new Date(y, sm + 2, 0).getDate())}`; return }
    const m = now.getMonth() + 1; dateStart.value = `${y}-${pad(m)}-01`; dateEnd.value = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`
  }
  const payRecordsAll = computed(() => data.data?.paymentRecords ?? {})
```
`filteredPayNodes` 调 `filterPayNodes(payNodeRowsAll.value, { dateStart: dateStart.value, dateEnd: dateEnd.value, viewMode: viewMode.value, viewL4: viewL4.value, viewPM: viewPM.value, excludeActive: excludeOn.value, excludedIds: excludedIds.value })`。导出加 `dateStart,dateEnd,setDateRange,setPreset,payRecordsAll`，去 `filterYear,yearOptions,setYear`。

`filter.test.ts`：把 filterYear 用例改 dateStart/dateEnd（默认两端空；setDateRange 写值；setPreset('all') 清空；setPreset('year') 写本年度起止非空）。

- [ ] **Step 3: 改 `payDashboard.ts` filterPayNodes + 趋势函数**

顶部 `import { inRange } from './paymentRange'`。`PayNodeFilterOpts`：`filterYear: string` → `dateStart: string; dateEnd: string`。函数体年份分支整段（`const fy = opts.filterYear` 起至末）替换为：
```ts
  if (opts.dateStart || opts.dateEnd) return ns.filter((r) => inRange(r.planDate || '', opts.dateStart, opts.dateEnd))
  return ns
```
趋势：`payMonthlyTrend(rows, start, end)`/`payQuarterlyTrend(rows, start, end)`，去 `filterYear`/`isSpecificYear`；新增纯函数 `fillKeysFromRange(start, end, gran: 'month'|'quarter'): string[]`（解析 start/end 的 `YYYY-MM`，按粒度枚举区间内键，两端任一为空→`[]`）；fill 用它。
```ts
function fillKeysFromRange(start: string, end: string, gran: 'month' | 'quarter'): string[] {
  if (!start || !end) return []
  const sy = +start.slice(0, 4), sm = +start.slice(5, 7), ey = +end.slice(0, 4), em = +end.slice(5, 7)
  const out: string[] = []
  if (gran === 'month') {
    for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (m = 1, y++) : m++) out.push(`${y}-${String(m).padStart(2, '0')}`)
  } else {
    const sq = Math.floor((sm - 1) / 3), eq = Math.floor((em - 1) / 3)
    for (let y = sy, q = sq; y < ey || (y === ey && q <= eq); q === 3 ? (q = 0, y++) : q++) out.push(`${y}-Q${q + 1}`)
  }
  return out
}
export function payQuarterlyTrend(rows: PayNodeRow[], start: string, end: string): PeriodSeries {
  return buildPaySeries(rows, quarterOf, fillKeysFromRange(start, end, 'quarter'))
}
export function payMonthlyTrend(rows: PayNodeRow[], start: string, end: string): PeriodSeries {
  return buildPaySeries(rows, (m) => m, fillKeysFromRange(start, end, 'month'))
}
```
`payDashboard.test.ts`：filterPayNodes 的 filterYear 用例改 dateStart/dateEnd（区间过滤、全部不过滤、空 planDate 在限定区间排除）；趋势用例改区间入参（断言区间补零、值=Σ未收）。**payDashSummary 本任务不改**（已回款仍节点已收）——其既有测试应保持绿。

- [ ] **Step 4: 改 `FilterBar.vue`**

周期 `<label>`（含 `data-test="year-select"`）整段换：
```html
    <label class="fb-item">
      周期
      <el-date-picker data-test="date-range" :model-value="[f.dateStart, f.dateEnd]" type="daterange"
        value-format="YYYY-MM-DD" range-separator="至" start-placeholder="起" end-placeholder="止" size="small"
        @update:model-value="(v: any) => f.setDateRange(v?.[0] ?? '', v?.[1] ?? '')" />
      <span class="fb-presets">
        <button v-for="p in PRESETS" :key="p.key" type="button" class="fb-preset" @click="f.setPreset(p.key)">{{ p.label }}</button>
      </span>
    </label>
```
`<script setup>` 删 `year` computed，加 `const PRESETS = [{key:'month',label:'本月'},{key:'quarter',label:'本季'},{key:'year',label:'本年'},{key:'all',label:'全部'}] as const`。样式加 `.fb-presets{display:inline-flex;gap:var(--sp-1)}` `.fb-preset{padding:var(--sp-1) var(--sp-2);border:1px solid var(--line2);border-radius:var(--r-sm);background:var(--card2);color:var(--sub);font-size:var(--fs-1);cursor:pointer}`。视角部分不动。FilterBar.test 若断言 year-select 改为断言 date-range + ≥4 预设按钮。

- [ ] **Step 5: 改 `TrendCard.vue`** 传 `filter.dateStart, filter.dateEnd` 给趋势函数（去 `filter.filterYear`）；视觉不动。

- [ ] **Step 6: 全绿验证**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts src/lib/payDashboard.test.ts src/layout/FilterBar.test.ts && npm run typecheck`
Expected: PASS；`git grep -n filterYear -- src` 无残留。**默认「全部」下其它 view 测试不受影响**（≡现状），可抽跑 `npx vitest run src/components/DashMetrics.test.ts src/views/BoardView.test.ts` 确认仍绿。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/stores/filter.ts frontend/src/stores/filter.test.ts frontend/src/lib/payDashboard.ts frontend/src/lib/payDashboard.test.ts frontend/src/layout/FilterBar.vue frontend/src/layout/FilterBar.test.ts frontend/src/components/TrendCard.vue
git commit -m "feat(filter): 筛选基座 周期枚举→日期范围(默认全部≡现状, filterPayNodes/趋势/FilterBar 区间化)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: /payment 六 card 口径（已回款→流水/项目数→活动/完成率→已回计划）

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`（`payDashSummary`）
- Modify: `frontend/src/components/DashMetrics.vue`
- Test: `frontend/src/lib/payDashboard.test.ts`、`frontend/src/components/DashMetrics.test.ts`

**Interfaces:** Consumes Task1 `actualInRange/hasActivityInRange`、Task2 `dateStart/dateEnd/payRecordsAll`、既有 `filterProjects`。

- [ ] **Step 1: 改 `payDashSummary` 签名与口径（先红测试）**

新签名 `payDashSummary(rows, projects, opts, paymentRecords, paymentNodes, start, end)`。体：
```ts
  const inScope = filterProjects(projects, opts)
  const totalActual = inScope.reduce((s, p) => s + actualInRange(paymentRecords?.[p.projectId]?.records, start, end), 0)
  const totalExpected = rows.reduce((s, r) => s + r.expectedPayment, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.unpaidAmount, 0)
  const delayedPids = new Set(rows.filter((r) => r.status === '延期').map((r) => r.projectId))
  const totalProjects = inScope.filter((p) => hasActivityInRange(paymentNodes?.[p.projectId], paymentRecords?.[p.projectId]?.records, start, end)).length
  return { relatedNodeCount: rows.length, totalProjects, totalExpected, totalActual, totalRemaining,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0, delayedProjects: delayedPids.size }
```
顶部 import `actualInRange, hasActivityInRange`。

- [ ] **Step 2: 改 `DashMetrics.vue`**

`payDashSummary(filter.filteredPayNodes, data.data?.projects ?? [], opts, filter.payRecordsAll, data.data?.paymentNodes, filter.dateStart, filter.dateEnd)`。6 card 键不变（标签 V1.10.2 已就位）。

- [ ] **Step 3: 测试**

`payDashboard.test.ts`：payDashSummary 用例改新签名；新增——`全部`下 totalActual=Σ全流水(inScope)、rate=totalActual/totalExpected（不变式）；区间下已回款只计到账∈R 流水、项目数=有活动项目。构造含 paymentRecords.records 与 paymentNodes 的 fixture（沿用文件既有 node() 风格）。
`DashMetrics.test.ts`：注入 paymentRecords，断言已回款显示流水汇总、与节点已收脱钩。

- [ ] **Step 4: 全绿 + Commit**

```bash
cd frontend && npx vitest run src/lib/payDashboard.test.ts src/components/DashMetrics.test.ts && npm run typecheck
```
```bash
git add frontend/src/lib/payDashboard.ts frontend/src/components/DashMetrics.vue frontend/src/lib/payDashboard.test.ts frontend/src/components/DashMetrics.test.ts
git commit -m "feat(payment): /payment 六card 已回款改流水/项目数改区间活动/完成率改已回计划

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 服务组达成排名 区间+流水

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`（`payOrgRanking`）
- Modify: `frontend/src/components/OrgRanking.vue`
- Test: `frontend/src/lib/payDashboard.test.ts`

**Interfaces:** Consumes Task1 `inRange/actualInRange`。

- [ ] **Step 1: 改 `payOrgRanking`（先红）**

```ts
export function payOrgRanking(
  projects: Project[], paymentNodes: Record<string, PaymentNodePmis[]> | undefined,
  paymentRecords: Record<string, PaymentRecordsEntry> | undefined, start: string, end: string,
  sortBy: 'actualTotal' | 'achievementRate',
): OrgRank[] {
  const m: Record<string, OrgRank> = {}
  for (const p of projects) {
    const org = (p.orgL4 ?? '').trim() || '未指定'
    if (!m[org]) m[org] = { org, expectedTotal: 0, actualTotal: 0, actualTotalWan: 0, achievementRate: 0 }
    for (const n of paymentNodes?.[p.projectId] ?? []) if (inRange(n.planDate || '', start, end)) m[org].expectedTotal += Number(n.expectedPayment ?? 0)
    m[org].actualTotal += actualInRange(paymentRecords?.[p.projectId]?.records, start, end)
  }
  return Object.values(m).map((o) => ({ ...o, achievementRate: o.expectedTotal > 0 ? o.actualTotal / o.expectedTotal : 0, actualTotalWan: o.actualTotal / 10000 }))
    .sort((a, b) => b[sortBy] - a[sortBy])
}
```
（达成率=已回/计划。需 import 类型 `PaymentNodePmis`/`PaymentRecordsEntry`。）

- [ ] **Step 2: 改 `OrgRanking.vue`** 传 `filterProjects(data.data?.projects ?? [], opts)`、`data.data?.paymentNodes`、`filter.payRecordsAll`、`filter.dateStart`、`filter.dateEnd`、`sortBy`。top8 slice 不动（SP3 改）。

- [ ] **Step 3: 测试 + 全绿 + Commit**

`payDashboard.test.ts` 加 payOrgRanking 区间用例（两 L4，计划=节点(计划日∈R)、已回=流水(到账∈R)、达成率、排序；全部不变式）。
```bash
git add frontend/src/lib/payDashboard.ts frontend/src/components/OrgRanking.vue frontend/src/lib/payDashboard.test.ts
git commit -m "feat(payment): 服务组达成排名 按区间+流水

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 金额档位 TierStrip 区间+流水

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`（`payTierStats`）
- Modify: `frontend/src/components/TierStrip.vue`
- Test: `frontend/src/lib/payDashboard.test.ts`

- [ ] **Step 1: 改 `payTierStats`（先红）**

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
（`deriveTier` 从 paymentPmis import；import 类型。）

- [ ] **Step 2: 改 `TierStrip.vue`** 按 TIERS 调新签名（传 filterProjects 后项目 + nodes + records + 区间）。下钻 `BoardDrilldownModal` 接线不动（字段名保持一致）。

- [ ] **Step 3: 测试 + 全绿 + Commit**

`payDashboard.test.ts` 加 payTierStats 区间用例（不同档位，已回走流水、计划走节点；全部不变式）。
```bash
git add frontend/src/lib/payDashboard.ts frontend/src/components/TierStrip.vue frontend/src/lib/payDashboard.test.ts
git commit -m "feat(payment): 金额档位 TierStrip 按区间+流水

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: board 区间重算 + 待回款/完成率口径收敛

**Files:**
- Modify: `frontend/src/lib/paymentBoard.ts`（`PayBoardRow` 加 `remainingTotal`；`buildPayBoardRows` 用 `paymentPmisInRange`；`buildGroup` pendingSum/rate 收敛）
- Modify: `frontend/src/views/BoardView.vue`
- Test: `frontend/src/lib/paymentBoard.test.ts`（若有）、`frontend/src/views/BoardView.test.ts`（若有）

**Interfaces:** Consumes Task1 `paymentPmisInRange`。

- [ ] **Step 1: 改 `paymentBoard.ts`（先红）**

`PayBoardRow` 加 `remainingTotal: number`。`buildPayBoardRows(projects, pmisMap, paymentNodes, paymentRecords, start, end)`：每项目 `const rp = paymentPmisInRange(p.paymentPmis?.contract ?? 0, paymentNodes?.[p.projectId], paymentRecords?.[p.projectId]?.records, start, end)`；行 `contract=rp.contract, actualTotal=rp.actualTotal, expectedTotal=rp.expectedTotal, remainingTotal=rp.remainingTotal, delayedCount=rp.delayedCount, paymentRatio=rp.paymentRatio, progress=deriveProgress(rp.contract, rp.paymentRatio)`，`projectAmount/paymentStatus` 随之。`buildGroup`：
```ts
  const expectedSum = grows.reduce((s, r) => s + r.expectedTotal, 0)
  ...
  pendingSum: grows.reduce((s, r) => s + r.remainingTotal, 0),   // 改:节点未收(计划日∈R)
  rate: expectedSum > 0 ? actualSum / expectedSum : null,        // 改:已回/计划
```
（删旧 `Math.max(contract-actual,0)` 与 `actualSum/contractSum`；保留其余指标。）

- [ ] **Step 2: 改 `BoardView.vue`** `buildPayBoardRows(filterProjects(data.data?.projects ?? [], opts), projectPmis, data.data?.paymentNodes, filter.payRecordsAll, filter.dateStart, filter.dateEnd)`。

- [ ] **Step 3: 测试 + 全绿 + Commit**

`paymentBoard.test.ts`：构造 projects+nodes+records；全部下 actualSum=Σ流水、pendingSum=Σ节点未收、rate=actual/expected；区间收窄。BoardView.test 若断言旧 rate(/合同) 数值则更新为新口径。
```bash
git add frontend/src/lib/paymentBoard.ts frontend/src/views/BoardView.vue frontend/src/lib/paymentBoard.test.ts
git commit -m "feat(payment): board 按区间重算(paymentPmisInRange)+待回款/完成率口径收敛

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 部门汇总/项目行 区间重算

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts`（`PayProjectRow` 加 `remainingTotal`；`projectPaymentRows` 加区间重算；`summaryByDim.rate` 改已回/计划，加 `remainingSum`）
- Modify: `frontend/src/components/ProjectsOverviewTab.vue`
- Test: `frontend/src/lib/paymentPmis.test.ts`

**Interfaces:** Consumes Task1 `paymentPmisInRange`。

- [ ] **Step 1: 改 `projectPaymentRows`（先红）**

`PayProjectRow` 加 `remainingTotal: number`。`projectPaymentRows(projects, pmisMap, paymentNodes?, paymentRecords?, start = '', end = '')`：每项目 `const rp = paymentPmisInRange(p.paymentPmis?.contract ?? 0, paymentNodes?.[p.projectId], paymentRecords?.[p.projectId]?.records, start, end)`，字段 `actualTotal=rp.actualTotal, expectedTotal=rp.expectedTotal, nodeCount=rp.nodeCount, reachedCount=rp.reachedCount, delayedCount=rp.delayedCount, paymentRatio=rp.paymentRatio, remainingTotal=rp.remainingTotal, contract=rp.contract`，`progress=deriveProgress(rp.contract, rp.paymentRatio)`；`overspendAmount/projectAmount/tier/dept/stage` 不变。`DimSummary` 加 `remainingSum: number`；`summaryByDim`：
```ts
  const expSum = grp.reduce((s, r) => s + r.expectedTotal, 0)
  ...
  rate: expSum > 0 ? actualSum / expSum : null,            // 改:已回/计划
  remainingSum: grp.reduce((s, r) => s + r.remainingTotal, 0),
```

- [ ] **Step 2: 改 `ProjectsOverviewTab.vue`** 调用传 nodes/records/区间；列展示不变（数值随区间）。

- [ ] **Step 3: 测试 + 全绿 + Commit**

`paymentPmis.test.ts`：projectPaymentRows/summaryByDim 区间用例 + 全部不变式（全部下 actualTotal=Σ流水、rate=已回/计划）。
```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/components/ProjectsOverviewTab.vue frontend/src/lib/paymentPmis.test.ts
git commit -m "feat(payment): 部门汇总/项目行 按区间重算(已回=流水,完成率=已回/计划)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 回款节点/进度/风险三 tab 区间化

**Files:**
- Modify: `frontend/src/components/TierNodesTab.vue`、`frontend/src/components/PlanTab.vue`、`frontend/src/components/RiskTab.vue`
- Modify: `frontend/src/lib/paymentPmis.ts`（`pmisRiskGroups` 延期节点按计划日∈R；`progressBuckets` 消费区间行——逻辑不变）
- Test: `frontend/src/lib/paymentPmis.test.ts`

**Interfaces:** 复用 Task7 `projectPaymentRows(区间)` 与 Task2 `filteredPayNodes`。

- [ ] **Step 1: 三 tab 取数切区间**

PlanTab/RiskTab/TierNodesTab 把 `projectPaymentRows(filterProjects(...), pmisMap)` 改为传 nodes/records/区间（Task7 新签名）。节点级取数（`paymentNodeRows`/`filteredPayNodes`）确保节点已按计划日∈R（TierNodesTab/RiskTab 延期列表：先 `inRange(planDate)` 再取 status=延期）。`pmisRiskGroups(rows, nodeRows)` 中 nodeRows 传已按计划日∈R 过滤者。`progressBuckets` 不改（消费区间行）。

- [ ] **Step 2: 测试 + 全绿 + Commit**

`paymentPmis.test.ts`：progressBuckets/pmisRiskGroups 用区间行用例（延期/进度随区间）。
```bash
git add frontend/src/components/TierNodesTab.vue frontend/src/components/PlanTab.vue frontend/src/components/RiskTab.vue frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "feat(payment): 回款节点/进度/风险三tab 区间化

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 日历 + 台账区间化（CalendarView / LedgerView / ledger.ts）

**Files:**
- Modify: `frontend/src/lib/ledger.ts`（`ledgerRows` 已回款改流水）
- Modify: `frontend/src/views/LedgerView.vue`、`frontend/src/views/CalendarView.vue`
- Test: `frontend/src/lib/ledger.test.ts`、相关 view 测试（若断言数值）

**Interfaces:** Consumes Task1 `actualInRange`。

- [ ] **Step 1: 改 `ledgerRows`（先红）**

`ledgerRows(nodeRows, projects, paymentRecords?, start = '', end = '')`：`actualPayment` 由 `Σnode.receivedAmount` 改 `actualInRange(paymentRecords?.[pid]?.records, start, end)`；`expectedPayment/remainingAmount` 仍 Σ节点（nodeRows 已按计划日∈R）；`paymentRatio=actualPayment/expectedPayment`；`paymentStatus` 仍按该比值。`ledgerSummaryPmis.totalAct` 随之=Σ流水。

- [ ] **Step 2: 改 `LedgerView.vue`** 传 records+区间给 `ledgerRows`；`CalendarView.vue` 确认节点取数经 `filteredPayNodes`（计划日∈R）。

- [ ] **Step 3: 测试 + 全绿 + Commit**

`ledger.test.ts`：ledgerRows 已回款=流水区间、计划/未收=节点；全部不变式。
```bash
git add frontend/src/lib/ledger.ts frontend/src/views/LedgerView.vue frontend/src/views/CalendarView.vue frontend/src/lib/ledger.test.ts
git commit -m "feat(payment): 日历/台账区间化(台账已回款改流水)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 总览回款带 + computeKpis + InsightView 口径对齐

**Files:**
- Modify: `frontend/src/lib/overview.ts`（`paymentBand` 区间+流水；`computeKpis` 回款达成率改流水+排除异常）
- Modify: `frontend/src/views/OverviewView.vue`
- Modify: `frontend/src/lib/insight.ts`/`frontend/src/views/InsightView.vue`（回款列口径+排除异常）
- Test: `frontend/src/lib/overview.test.ts`、相关 view 测试

**Interfaces:** Consumes Task1 `inRange/actualInRange`、SP1 `isAnomalous`（@/lib/anomaly）。

- [ ] **Step 1: `paymentBand` 区间+流水（先红）**

`paymentBand(rows, now, paymentRecords, start, end)`：`yearExpected/monthPending`（计划侧）按 `inRange(planDate)`（用区间；若区间空则退化全时如现状）；`yearActual` 改 `Σ actualInRange(records, start, end)`；`delayedTop` 节点先 `inRange(planDate)` 再取延期。

- [ ] **Step 2: `computeKpis` 回款达成率** 分子 Σ流水(排除 isAnomalous 项目)、分母 Σ计划；关闭 SP1-followup 第一点。

- [ ] **Step 3: InsightView 回款列** 回款完成率/延期列对 `isAnomalous` 项目排除；不加日期范围（/insight 非回款看板）。关闭 SP1-followup 第二点。

- [ ] **Step 4: 测试 + 全绿 + Commit**

`overview.test.ts`：paymentBand 区间/流水用例（已回款=流水到账∈R）；computeKpis 排除异常+流水分子。Overview/Insight view 测试随口径更新断言。
```bash
git add frontend/src/lib/overview.ts frontend/src/views/OverviewView.vue frontend/src/lib/insight.ts frontend/src/views/InsightView.vue frontend/src/lib/overview.test.ts
git commit -m "feat(payment): 总览回款带区间+流水, computeKpis/Insight 口径对齐并排除异常

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 默认翻本年度 + 版本 V1.11.0 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/stores/filter.ts`（默认 dateStart/dateEnd 翻本年度）
- Modify: `frontend/src/stores/filter.test.ts` + 受默认影响的 view 测试
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 默认本年度**

```ts
  const _y = new Date().getFullYear()
  const dateStart = ref(`${_y}-01-01`)
  const dateEnd = ref(`${_y}-12-31`)
```
`filter.test.ts`「默认全部」用例改「默认本年度」（dateStart=`${当年}-01-01`）。

- [ ] **Step 2: 修受默认影响的 view 测试**

进页未显式设区间、断言全时数值的 view 测试（DashMetrics/BoardView/Ledger/Overview/Calendar 等），在 mount 前 `f.setPreset('all')`（断言全时口径）或按本年度数据调整断言。逐个 `npx vitest run <file>` 修到绿。

- [ ] **Step 3: 版本 + PROGRESS**

`version.ts` → `V1.11.0`/`2026-06-19`。`PROGRESS.md`：当前版本 V1.11.0 + 最近更新；版本区加一条（合并 SHA 留 `<finishing 回填>`）；标记完成/移除 backlog「SP1-followup」（computeKpis/InsightView 已对齐）。

- [ ] **Step 4: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（前端 typecheck/vitest/build + 后端 ruff/pytest）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/filter.ts frontend/src/stores/filter.test.ts frontend/src/version.ts PROGRESS.md <受影响 view 测试...>
git commit -m "chore: SP2 默认本年度 + 版本 V1.11.0 + PROGRESS(日期范围/口径统一)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 验证总览（finishing 前）

- `bash verify.sh` 全绿。
- 手动：FilterBar 选区间/预设 → /payment 六card、board、部门汇总、趋势、日历、台账、总览带 全随区间变；切「全部」数值回到改前（不变式）；视角/排除与日期叠加正确；/projects·/closed 不受影响。
- 口径核对：同区间下 /payment「已回款」与 board「已回款」一致（均流水）；完成率=已回/计划；延期项目数/延期节点数各自正确。

## 自检遗留（计划者注）

- 绿色可保策略：Task 2（筛选基座）默认「全部」≡现状，确保移除 filterYear 后整套测试不破；其后各任务只换数据源/口径、不动 filterYear。**每个聚合改动任务必保留一条「全部」断言**（回归底线）。Task 11 翻默认本年度并统一修受影响 view 测试。
