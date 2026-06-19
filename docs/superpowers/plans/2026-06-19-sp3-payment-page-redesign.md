# SP3 /payment 页面重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重排 /payment：新增按 L4 的综合回款数据表格（合并 B3/B6），OrgRanking 展全部 L4，TrendCard 整数万 + 横滑，去掉 TierStrip，从 ProjectsOverviewTab 迁出部门汇总。

**Architecture:** 数据层加 `delayedAmount` 与 L4 汇总新字段（加性，不破坏现有）；新建 `PaymentL4Table.vue`；改 OrgRanking/TrendCard/PendingBarChart；DashboardView 布局重排；ProjectsOverviewTab 删部门汇总。纯前端，复用 SP2 区间口径。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus + ECharts；vitest。

**Spec:** `docs/superpowers/specs/2026-06-19-sp3-payment-page-redesign-design.md`（口径/列集权威）。

## Global Constraints

- 全程简体中文；**禁用任何 emoji**（符号只用 → ↓ ❌ ✕ ▾）。
- **禁止 `git add -A`/`.`**；逐路径 add。提交结尾恒一行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 纯前端：不改后端/schema/数据。复用 SP2 `lib/paymentRange.ts`/`projectPaymentRows`/filter store `dateStart/dateEnd/payRecordsAll/filteredProjects`。
- 样式只引用 theme.css 令牌，不手写散值（本轮把 DashboardView 既有散值 14px/12px/14px 归令牌）。
- 金额列挂 `.u-num`；完成率/比例用 `fmtRatio`；金额用 `fmtWan`（`@/lib/format`）。
- 「全部≡现状」不变式延续：新聚合字段在 `dateStart=dateEnd=''` 下 = 全量口径；每数据任务保留一条「全部」断言。
- 版本单一来源 `frontend/src/version.ts`，本轮 `V1.12.0`（Y）。
- 每任务结束 typecheck + 相关 vitest 全绿；末任务 `bash verify.sh` 全绿。

---

### Task 1: 数据层 — delayedAmount + L4 汇总新字段

**Files:**
- Modify: `frontend/src/lib/paymentRange.ts`（`RangePmis` + `paymentPmisInRange` 加 `delayedAmount`）
- Modify: `frontend/src/lib/paymentPmis.ts`（`PayProjectRow` 加 `delayedAmount`；`projectPaymentRows` 填；`DimSummary` 加 4 字段；`summaryByDim` 计算）
- Test: `frontend/src/lib/paymentRange.test.ts`、`frontend/src/lib/paymentPmis.test.ts`

**Interfaces:**
- Produces: `RangePmis.delayedAmount: number`；`PayProjectRow.delayedAmount: number`；`DimSummary` 加 `nodeSum/reachedSum/delayedProjectCount/delayedAmountSum: number`。

- [ ] **Step 1: 扩 `paymentRange.test.ts`（先红）**

在 `paymentPmisInRange` describe 加：
```ts
  it('delayedAmount=Σ延期节点未收(计划日∈R)', () => {
    const nodes = [
      N('2026-02-01', 1000, 1000, '延期'),
      N('2026-03-01', 500, 200, '延期'),
      N('2026-04-01', 300, 300, '待回款'),
    ]
    const r = paymentPmisInRange(2000, nodes, [], '2026-01-01', '2026-12-31')
    expect(r.delayedAmount).toBe(1200)   // 1000+200(待回款300不计)
  })
  it('全部不变式:delayedAmount=Σ全延期节点未收', () => {
    const nodes = [N('2026-02-01', 1000, 1000, '延期'), N('2025-12-01', 500, 500, '延期')]
    expect(paymentPmisInRange(0, nodes, [], '', '').delayedAmount).toBe(1500)
  })
```
（`N(planDate,exp,unpaid,status)` 沿用该文件既有 helper。）

- [ ] **Step 2: 跑测试确认红**

Run: `cd frontend && npx vitest run src/lib/paymentRange.test.ts`
Expected: FAIL（delayedAmount 不存在）。

- [ ] **Step 3: 改 `paymentRange.ts`**

`RangePmis` 接口加 `delayedAmount: number`。`paymentPmisInRange` 在 `ns` 过滤后加：
```ts
  const delayedAmount = round2(ns.filter((n) => n.status === '延期').reduce((s, n) => s + Number(n.unpaidAmount ?? 0), 0))
```
返回对象加 `delayedAmount,`。

- [ ] **Step 4: 扩 `paymentPmis.test.ts`（先红）**

`projectPaymentRows` 用例断言 `delayedAmount`（构造一个含延期节点的项目，断言行 `delayedAmount`）；`summaryByDim` 用例断言新 4 字段：
```ts
  it('summaryByDim 新增 nodeSum/reachedSum/delayedProjectCount/delayedAmountSum', () => {
    const rows = projectPaymentRows(ps, map, payNodes, payRec)
    const s = summaryByDim(rows, 'dept')[0]
    expect(s.nodeSum).toBeGreaterThanOrEqual(0)
    expect(s.reachedSum).toBeGreaterThanOrEqual(0)
    expect(typeof s.delayedProjectCount).toBe('number')
    expect(typeof s.delayedAmountSum).toBe('number')
  })
```
（实现者按文件既有 fixture 给具体期望值；含一条「全部」不变式断言新字段=全量。）

- [ ] **Step 5: 改 `paymentPmis.ts`**

`PayProjectRow` 加 `delayedAmount: number`；`projectPaymentRows` 返回对象加 `delayedAmount: rp.delayedAmount,`。
`DimSummary` 加 `nodeSum: number; reachedSum: number; delayedProjectCount: number; delayedAmountSum: number`。`summaryByDim` 的 map 内加：
```ts
        nodeSum: grp.reduce((s, r) => s + r.nodeCount, 0),
        reachedSum: grp.reduce((s, r) => s + r.reachedCount, 0),
        delayedProjectCount: grp.filter((r) => r.delayedCount > 0).length,
        delayedAmountSum: grp.reduce((s, r) => s + r.delayedAmount, 0),
```

- [ ] **Step 6: 跑测试 + typecheck → Commit**

Run: `cd frontend && npx vitest run src/lib/paymentRange.test.ts src/lib/paymentPmis.test.ts && npm run typecheck`
Expected: PASS。
```bash
git add frontend/src/lib/paymentRange.ts frontend/src/lib/paymentPmis.ts frontend/src/lib/paymentRange.test.ts frontend/src/lib/paymentPmis.test.ts
git commit -m "feat(payment): 数据层加 delayedAmount + L4 汇总 nodeSum/reachedSum/延期项目数/延期金额

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 回款数据表格组件 PaymentL4Table.vue

**Files:**
- Create: `frontend/src/components/PaymentL4Table.vue`
- Test: `frontend/src/components/PaymentL4Table.test.ts`

**Interfaces:**
- Consumes: Task1 的 `summaryByDim` 新字段；`projectPaymentRows`/`filterProjects`(paymentPmis)；filter store `dateStart/dateEnd/payRecordsAll/filteredProjects`；`DataTable`（`DataColumn`：key/label/width/sortable/formatter）。

- [ ] **Step 1: 写组件 `PaymentL4Table.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { projectPaymentRows, summaryByDim, filterProjects } from '@/lib/paymentPmis'
import { fmtWan, fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'

const data = useDataStore()
const filter = useFilterStore()

const rows = computed(() => {
  const opts = { viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM, excludeActive: filter.excludeOn, excludedIds: filter.excludedIds }
  const pr = projectPaymentRows(
    filterProjects(data.data?.projects ?? [], opts),
    data.data?.projectPmis ?? {},
    data.data?.paymentNodes, filter.payRecordsAll, filter.dateStart, filter.dateEnd,
  )
  return summaryByDim(pr, 'dept').map((s) => ({ ...s, reachedRatio: s.nodeSum > 0 ? s.reachedSum / s.nodeSum : null }))
})

const COLUMNS: DataColumn[] = [
  { key: 'value', label: 'L4组', width: 130 },
  { key: 'projectCount', label: '项目数', width: 84, sortable: true },
  { key: 'contractSum', label: '合同额(万)', width: 110, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'actualSum', label: '已回款(万)', width: 110, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'rate', label: '回款额完成率', width: 110, sortable: true, formatter: (v) => fmtRatio(v as number | null) },
  { key: 'delayedProjectCount', label: '延期项目数', width: 96, sortable: true },
  { key: 'delayedNodeSum', label: '延期节点', width: 90, sortable: true },
  { key: 'delayedAmountSum', label: '延期金额(万)', width: 110, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'nodeSum', label: '回款节点数', width: 100, sortable: true },
  { key: 'reachedSum', label: '完成节点数', width: 100, sortable: true },
  { key: 'reachedRatio', label: '完成节点比例', width: 110, sortable: true, formatter: (v) => fmtRatio(v as number | null) },
]
</script>

<template>
  <div class="pl4">
    <h3 class="pl4-title">回款数据（按 L4 服务组）</h3>
    <div v-if="!rows.length" class="pl4-empty">暂无数据</div>
    <div v-else class="pl4-scroll">
      <DataTable :columns="COLUMNS" :rows="rows" :show-count="false" />
    </div>
  </div>
</template>

<style scoped>
.pl4-title { font-size: var(--fs-4); font-weight: 600; color: var(--txt); margin: 0 0 var(--sp-3); }
.pl4-empty { color: var(--mut); padding: var(--sp-5) 0; text-align: center; }
.pl4-scroll { overflow-x: auto; }
</style>
```
（`fmtWan` 若不接受 null/做整数万格式以 `@/lib/format` 实际签名为准微调；`DataColumn` 形态以 DataTable.vue 实际为准。）

- [ ] **Step 2: 写组件测试 `PaymentL4Table.test.ts`**

挂载（注入 data store：含 2 个不同 orgL4 的项目 + paymentNodes + paymentRecords；setActivePinia + `useFilterStore().setPreset('all')` 保全时口径），断言：11 个列名渲染；按 L4 分组行数正确；可点表头排序（或断言 sortable 列存在）；空数据空态。沿用项目既有 DataTable 测试挂载风格（ElementPlus 插件）。

- [ ] **Step 3: 跑测试 + typecheck → Commit**

```bash
git add frontend/src/components/PaymentL4Table.vue frontend/src/components/PaymentL4Table.test.ts
git commit -m "feat(payment): 新增 PaymentL4Table 按L4回款数据表(11列可排序,区间联动)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: OrgRanking 展全部 L4

**Files:**
- Modify: `frontend/src/components/OrgRanking.vue`
- Test: `frontend/src/components/OrgRanking.test.ts`

- [ ] **Step 1: 扩测试（先红）**

注入 >8 个不同 orgL4 的项目（如 10 个），断言渲染行数 = 10（不被截断到 8）。沿用文件既有挂载 + `setPreset('all')`。

- [ ] **Step 2: 改 `OrgRanking.vue`**

去掉 `.slice(0, 8)`（排名 computed 直接用全量 `payOrgRanking(...)` 结果）。列表容器加滚动样式：`.org-list { max-height: 360px; overflow-y: auto; }`（高度用具体或令牌；若已有列表类则在其上加 max-height/overflow）。

- [ ] **Step 3: 跑测试 + typecheck → Commit**

```bash
git add frontend/src/components/OrgRanking.vue frontend/src/components/OrgRanking.test.ts
git commit -m "feat(payment): 服务组达成排名展示全部L4(去top8+卡内滚动)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: TrendCard 整数万 + PendingBarChart 横滑

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`（`buildPaySeries` 产出 data 取整）
- Modify: `frontend/src/components/PendingBarChart.vue`（横滑容器）
- Test: `frontend/src/lib/payDashboard.test.ts`、`frontend/src/components/PendingBarChart.test.ts`

- [ ] **Step 1: 扩趋势测试（先红）**

`payDashboard.test.ts` 趋势用例：构造 unpaidAmount 含小数（如 123456 元 → 12.3456 万），断言桶值为**整数万**（13，四舍五入）。

- [ ] **Step 2: 改 `buildPaySeries` 取整**

`payDashboard.ts buildPaySeries` 末尾 `series: TIER_KEYS.map((t) => ({ tier: t, data: categories.map((c) => byTier[t][c] || 0) }))` 改为 `data: categories.map((c) => Math.round(byTier[t][c] || 0))`。（按桶汇总后取整，非逐节点。）

- [ ] **Step 3: PendingBarChart 横滑**

`PendingBarChart.vue` 把 `<ChartBox .../>` 包进横滑容器：
```html
<template>
  <div class="pbc-scroll">
    <div class="pbc-inner" :style="{ minWidth: `max(100%, ${Math.max(props.categories.length, 1) * 48}px)` }">
      <ChartBox :option="option" :height="height || '300px'" />
    </div>
  </div>
</template>
```
样式 `.pbc-scroll { overflow-x: auto; } .pbc-inner { height: 100%; }`。若 ChartBox 不随内层宽度 resize，则在 `pbc-inner` 上确保 ChartBox 容器宽度 = min-width（ChartBox 内部应有 resize 观察；如无，实现者补一次 resize 触发）。`PendingBarChart.test.ts` 加断言：`.pbc-scroll` 存在、`pbc-inner` min-width 随 categories 数增大。

- [ ] **Step 4: 跑测试 + typecheck → Commit**

```bash
git add frontend/src/lib/payDashboard.ts frontend/src/components/PendingBarChart.vue frontend/src/lib/payDashboard.test.ts frontend/src/components/PendingBarChart.test.ts
git commit -m "feat(payment): 待回款趋势整数万 + 柱状图横向滑动

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: DashboardView 布局重排（接入表格 + 去 TierStrip）

**Files:**
- Modify: `frontend/src/views/DashboardView.vue`
- Test: `frontend/src/views/DashboardView.test.ts`（若无则新建轻量）

**Interfaces:** Consumes Task2 `PaymentL4Table`、Task3 `OrgRanking`、Task4 `TrendCard`。

- [ ] **Step 1: 改 `DashboardView.vue`**

去 `TierStrip` import 与卡片；引入 `PaymentL4Table`。模板：
```html
    <template v-else-if="data.data">
      <DashMetrics />
      <section class="dash-card dash-block"><PaymentL4Table /></section>
      <div class="dash-grid">
        <section class="dash-card"><TrendCard /></section>
        <section class="dash-card"><OrgRanking /></section>
      </div>
    </template>
```
样式归令牌：`.dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--gap-card); margin-top: var(--gap-card); }`、`.dash-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-lg); padding: var(--card-pad); min-width: 0; }`、`.dash-block { margin-top: var(--gap-card); }`、`.dashboard { padding: var(--sp-4); }`、窄屏 `@media (max-width: 900px) { .dash-grid { grid-template-columns: 1fr; } }`。

- [ ] **Step 2: 测试**

`DashboardView.test.ts`：mount（注入 data + `setPreset('all')`，stub 子组件或提供最小数据），断言：含 PaymentL4Table（如 `回款数据（按 L4` 标题或组件存在）、不含 TierStrip（金额档位相关文案/组件不出现）、TrendCard 与 OrgRanking 同在 `.dash-grid` 下。

- [ ] **Step 3: 跑测试 + typecheck → Commit**

```bash
git add frontend/src/views/DashboardView.vue frontend/src/views/DashboardView.test.ts
git commit -m "feat(payment): /payment 布局重排(回款数据表整宽 + 趋势|排名各半, 去TierStrip)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: ProjectsOverviewTab 迁出部门汇总

**Files:**
- Modify: `frontend/src/components/ProjectsOverviewTab.vue`
- Test: `frontend/src/components/ProjectsOverviewTab.test.ts`（若有）

- [ ] **Step 1: 改 `ProjectsOverviewTab.vue`**

删除「部门汇总」section（模板里的汇总表块 + 其 `summaryByDim` 计算/import，如明细不再用 summaryByDim）。**保留**下方明细 `DataTable` 及其相关逻辑。维度选择器若仅服务于部门汇总则一并删；若明细也用则保留。

- [ ] **Step 2: 测试**

`ProjectsOverviewTab.test.ts`（若有）：断言部门汇总相关文案/元素不再出现、明细表仍渲染。若无测试则新建轻量断言明细存在。

- [ ] **Step 3: 跑测试 + typecheck → Commit**

```bash
git add frontend/src/components/ProjectsOverviewTab.vue frontend/src/components/ProjectsOverviewTab.test.ts
git commit -m "refactor(payment): 部门汇总迁出 ProjectsOverviewTab(保留明细)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 版本 V1.12.0 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 改 `version.ts`** → `APP_VERSION='V1.12.0'`、`RELEASE_DATE='2026-06-19'`。

- [ ] **Step 2: PROGRESS.md** 当前版本 V1.12.0 + 最近更新；版本区加一条（合并 SHA 留 `<finishing 回填>` 占位）记 SP3 /payment 重做。

- [ ] **Step 3: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（前端 typecheck/vitest/build + 后端 ruff/pytest）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: 版本 V1.12.0 + PROGRESS(SP3 /payment 页面重做)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 验证总览（finishing 前）

- `bash verify.sh` 全绿。
- 手动 /payment：6 卡 / 回款数据表(按 L4，11 列可排序，整宽) / [待回款趋势 | 服务组达成排名 各半]；选区间/视角 → 表格·趋势·排名联动，切「全部」回现状；TierStrip 不再出现；趋势整数万 + 横滑；OrgRanking 展全部 L4；/panalysis/projects 仅剩明细。
