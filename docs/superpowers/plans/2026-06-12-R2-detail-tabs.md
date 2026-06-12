# R2 详情页三 tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** /project/:id 消费 R1 三新键——进度里程碑双层（项目里程碑优先级三色 + 回款里程碑保留）、预算核算科目树表（含概算/核算列+售前桥接块）、新「回款数据」流水 tab。版本 V7.8.0。

**Architecture:** 两个新展示组件（MilestoneTable 纯表格行级三色淡底、ProfitTree 科目树折叠表）+ 纯函数 lib/profitTree.ts（可见性/子节点/比率行判定）；ProjectDetailView 只做装配。零后端改动。母 spec：`2026-06-12-R-batch-data-expansion-design.md` §3。

**Tech Stack:** Vue3+TS+Vitest；类型已生成（analysis.ts: MilestoneItem/PaymentRecordsEntry/ProjectProfit/ProfitRow/BridgeProfit + AnalysisData.projectMilestones/paymentRecords/projectProfit）。分支 `feat/phase-r2-detail-tabs`。

## 实测事实（写代码前必读）

- 数据形状：`projectMilestones[pid] = [{name, planDate, actualDate, payStage, pct(0-100,当前真实全空), priority('high'|'mid'|'low')}]`（已按业务顺序、全空类目已剪）；`paymentRecords[pid] = {total, count, lastDate, records[{type,serial,payer,amount(元),date,claimer,orderNo,currency,rate,note}]}`（records 新→旧）；`projectProfit[pid] = {summary{预算收入,预算成本,实际成本,成本消耗率,预算毛利,实际毛利,预算毛利率,剩余预算}, rows[{code,name,level,budget,estimate,final,actual,remaining,rate}], bridge{ssId,summary{预算收入,预算成本,预算毛利,预算毛利率,实际成本},rows} | null}`。
- **毛利率行陷阱**：code '4'（direct）/'3.2' 同类行的 budget/estimate/final/actual/remaining 是**比率**（0.8888 等），不能 fmtWan——`name.includes('率')` 走 fmtRatio。
- 科目层级：level=code 中点数+1（1/2/2.1/2.1.1）；现数据最深 3 级。展开规则（用户决策）：一级+二级恒显，三级仅当**直接父码**在展开集合中显示；默认展开集合 `['2.2','2.3']`（覆盖交付外包 2.2.2 / 交付部门人工 2.3.2 等现 delivery 已展示类目）。
- 格式器：`fmtWan(元→万)`、`fmtYuan`、`fmtRatio` 在 `@/lib/format`。
- ProjectDetailView 现状：TABS 4 项（payment/progress/risk/cost）+ 售前条件 origin；各 tab 是 `<section v-else-if>`；chips 模式 `pd-chips/pd-chip`；区块标题 `pd-section-title`；空态 `pd-note`。fixture 见 ProjectDetailView.test.ts seed（P-1 普通 / P-2 售前→OLD-9）。
- 行级三色淡底+深字符合规范 V2 状态三态（高 --danger-bg/--danger-text，中 --warn-bg/--warn-text（棕→琥珀），低 --ok-bg/--ok-text）。

## 分级调度

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | lib/profitTree.ts + MilestoneTable.vue + ProfitTree.vue + 三测试（逐字） | 中 | sonnet | 主循环核验 |
| T2 | ProjectDetailView 三 tab 接入 + 原项目里程碑块 + 测试扩展 | 高（装配集成） | opus | 主循环真实数据目检 |
| T3 | 版本 V7.8.0 + PROGRESS + verify + 终审 | 低 | 主循环 | opus 终审 |

---

### Task 1: 展示组件与纯函数（lib/profitTree + MilestoneTable + ProfitTree）

**Files:**
- Create: `frontend/src/lib/profitTree.ts`、`frontend/src/lib/profitTree.test.ts`
- Create: `frontend/src/components/MilestoneTable.vue`、`frontend/src/components/MilestoneTable.test.ts`
- Create: `frontend/src/components/ProfitTree.vue`、`frontend/src/components/ProfitTree.test.ts`

- [ ] **Step 1: 写失败测试 frontend/src/lib/profitTree.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_OPEN, hasChildren, visibleRows, isRateRow } from './profitTree'
import type { ProfitRow } from '@/types/analysis'

const R = (code: string, name: string, level: number): ProfitRow => ({ code, name, level } as ProfitRow)
const ROWS = [
  R('1', '项目收入', 1),
  R('2', '项目成本', 1),
  R('2.1', '产品、商品成本', 2),
  R('2.1.1', '自有产品成本', 3),
  R('2.2', '外包服务成本', 2),
  R('2.2.2', '交付外包服务成本', 3),
  R('2.3', '人工成本', 2),
  R('2.3.2', '交付部门人工成本', 3),
  R('4', '项目毛利率', 1),
]

describe('profitTree', () => {
  it('hasChildren: 有直接/间接子码', () => {
    expect(hasChildren(ROWS, ROWS[1])).toBe(true)    // 2 → 2.1...
    expect(hasChildren(ROWS, ROWS[2])).toBe(true)    // 2.1 → 2.1.1
    expect(hasChildren(ROWS, ROWS[0])).toBe(false)   // 1
  })

  it('visibleRows: 一二级恒显,三级仅父码展开时显示;默认展开 2.2/2.3', () => {
    const v = visibleRows(ROWS, new Set(DEFAULT_OPEN)).map((r) => r.code)
    expect(v).toContain('2.2.2')
    expect(v).toContain('2.3.2')
    expect(v).not.toContain('2.1.1')   // 2.1 未展开
    expect(v).toContain('2.1')
    expect(v).toContain('4')
  })

  it('visibleRows: 展开 2.1 后 2.1.1 出现', () => {
    const v = visibleRows(ROWS, new Set([...DEFAULT_OPEN, '2.1'])).map((r) => r.code)
    expect(v).toContain('2.1.1')
  })

  it('isRateRow: 名称含率', () => {
    expect(isRateRow(R('4', '项目毛利率', 1))).toBe(true)
    expect(isRateRow(R('1', '项目收入', 1))).toBe(false)
  })
})
```

- [ ] **Step 2: 跑红**

Run: `cd frontend && npx vitest run src/lib/profitTree.test.ts` → FAIL（模块不存在）

- [ ] **Step 3: 实现 frontend/src/lib/profitTree.ts**

```ts
import type { ProfitRow } from '@/types/analysis'

// 预算核算科目树折叠逻辑(R2 spec §3):一级+二级恒显,三级仅直接父码展开时显示。
// 默认展开 2.2/2.3——覆盖现 delivery 已展示的 交付外包(2.2.2)/交付部门人工(2.3.2) 等类目(用户决策)。
export const DEFAULT_OPEN = ['2.2', '2.3']

export function hasChildren(rows: ProfitRow[], row: ProfitRow): boolean {
  return rows.some((r) => r.code.startsWith(row.code + '.'))
}

export function visibleRows(rows: ProfitRow[], open: Set<string>): ProfitRow[] {
  return rows.filter((r) => {
    if ((r.level ?? 1) <= 2) return true
    const parent = r.code.slice(0, r.code.lastIndexOf('.'))
    return open.has(parent)
  })
}

/** 毛利率类行(值为 0-1 比率,不能按万元格式化) */
export function isRateRow(row: ProfitRow): boolean {
  return (row.name || '').includes('率')
}
```

Run: `npx vitest run src/lib/profitTree.test.ts` → PASS 4 项

- [ ] **Step 4: 写失败测试 frontend/src/components/MilestoneTable.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MilestoneTable from './MilestoneTable.vue'

const ITEMS = [
  { name: '终验', planDate: '2026-07-01', actualDate: '', payStage: '终验款，100.00%', pct: null, priority: 'high' },
  { name: '项目关闭', planDate: '2026-08-01', actualDate: '2026-06-12', payStage: '', pct: null, priority: 'mid' },
  { name: '到货', planDate: '2026-06-19', actualDate: '', payStage: '', pct: null, priority: 'low' },
] as any

describe('MilestoneTable', () => {
  it('行级三色 class + 列内容 + 完成状态', () => {
    const w = mount(MilestoneTable, { props: { items: ITEMS } })
    const trs = w.findAll('tbody tr')
    expect(trs).toHaveLength(3)
    expect(trs[0].classes()).toContain('ms-high')
    expect(trs[1].classes()).toContain('ms-mid')
    expect(trs[2].classes()).toContain('ms-low')
    expect(trs[0].text()).toContain('终验款，100.00%')
    expect(trs[0].text()).toContain('未完成')
    expect(trs[1].text()).toContain('已完成')   // 有实际时间
    expect(trs[2].text()).toContain('2026-06-19')
  })
})
```

- [ ] **Step 5: 跑红后实现 frontend/src/components/MilestoneTable.vue**

```vue
<script setup lang="ts">
import type { MilestoneItem } from '@/types/analysis'

// 项目里程碑表(R2 spec §3):行级三段优先级淡底+深字(高 danger/中 warn/低 ok,规范 V2 状态三态)
const props = defineProps<{ items: MilestoneItem[] }>()
const done = (i: MilestoneItem) => !!i.actualDate
</script>

<template>
  <table class="ms-table">
    <thead>
      <tr><th>里程碑</th><th>计划时间</th><th>实际时间</th><th>关联回款阶段</th><th>状态</th></tr>
    </thead>
    <tbody>
      <tr v-for="(i, idx) in props.items" :key="idx" :class="`ms-${i.priority}`">
        <td class="ms-name">{{ i.name }}</td>
        <td class="u-num">{{ i.planDate || '-' }}</td>
        <td class="u-num">{{ i.actualDate || '-' }}</td>
        <td>{{ i.payStage || '-' }}</td>
        <td><span class="ms-status" :class="{ done: done(i) }">{{ done(i) ? '已完成' : '未完成' }}</span></td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.ms-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.ms-table th, .ms-table td { padding: var(--sp-2) var(--sp-3); text-align: left; border-bottom: 1px solid var(--line); }
.ms-table th { color: var(--sub); font-weight: 600; font-size: var(--fs-1); }
.ms-high td { background: var(--danger-bg); }
.ms-high .ms-name { color: var(--danger-text); font-weight: 600; }
.ms-mid td { background: var(--warn-bg); }
.ms-mid .ms-name { color: var(--warn-text); font-weight: 600; }
.ms-low td { background: var(--ok-bg); }
.ms-low .ms-name { color: var(--ok-text); font-weight: 600; }
.ms-status { color: var(--mut); font-size: var(--fs-1); }
.ms-status.done { color: var(--ok-text); font-weight: 600; }
</style>
```

Run: `npx vitest run src/components/MilestoneTable.test.ts` → PASS

- [ ] **Step 6: 写失败测试 frontend/src/components/ProfitTree.test.ts**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ProfitTree from './ProfitTree.vue'

const ROWS = [
  { code: '1', name: '项目收入', level: 1, budget: 1000000, estimate: 900000, final: 950000, actual: 0, remaining: 1000000, rate: 0 },
  { code: '2.1', name: '产品、商品成本', level: 2, budget: 100000, estimate: null, final: null, actual: 50000, remaining: 50000, rate: 0.5 },
  { code: '2.1.1', name: '自有产品成本', level: 3, budget: 80000, estimate: null, final: null, actual: 40000, remaining: 40000, rate: 0.5 },
  { code: '2.3', name: '人工成本', level: 2, budget: 200000, estimate: null, final: null, actual: 0, remaining: 200000, rate: 0 },
  { code: '2.3.2', name: '交付部门人工成本', level: 3, budget: 150000, estimate: null, final: null, actual: 0, remaining: 150000, rate: 0 },
  { code: '4', name: '项目毛利率', level: 1, budget: 0.8888, estimate: 0.9, final: null, actual: 0, remaining: null, rate: null },
] as any

describe('ProfitTree', () => {
  it('默认:2.3.2 可见(默认展开),2.1.1 折叠;万元与比率行格式', () => {
    const w = mount(ProfitTree, { props: { rows: ROWS } })
    const txt = w.text()
    expect(txt).toContain('交付部门人工成本')
    expect(txt).not.toContain('自有产品成本')
    expect(txt).toContain('100')        // 1000000 元 → 100 万(收入行 budget)
    expect(txt).toContain('88.9%')      // 毛利率行按比率格式化(fmtRatio 0.8888 → 88.9%)
    expect(txt).toContain('90%')        // 毛利率 estimate 0.9
  })

  it('点击 2.1 展开后 2.1.1 出现,再点收起', async () => {
    const w = mount(ProfitTree, { props: { rows: ROWS } })
    const row21 = w.findAll('tbody tr').find((tr) => tr.text().includes('产品、商品成本'))!
    await row21.find('button.pt-toggle').trigger('click')
    expect(w.text()).toContain('自有产品成本')
    await w.findAll('tbody tr').find((tr) => tr.text().includes('产品、商品成本'))!.find('button.pt-toggle').trigger('click')
    expect(w.text()).not.toContain('自有产品成本')
  })

  it('无子码的行不渲染折叠钮', () => {
    const w = mount(ProfitTree, { props: { rows: ROWS } })
    const row1 = w.findAll('tbody tr').find((tr) => tr.text().includes('项目收入'))!
    expect(row1.find('button.pt-toggle').exists()).toBe(false)
  })
})
```

- [ ] **Step 7: 跑红后实现 frontend/src/components/ProfitTree.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { ProfitRow } from '@/types/analysis'
import { DEFAULT_OPEN, hasChildren, visibleRows, isRateRow } from '@/lib/profitTree'
import { fmtWan, fmtRatio } from '@/lib/format'

// 预算核算科目树(R2 spec §3):列=预算/概算/核算(budget_data)/实际发生/剩余/消耗率;毛利率行按比率格式化
const props = defineProps<{ rows: ProfitRow[] }>()
const open = ref(new Set(DEFAULT_OPEN))
function toggle(code: string) {
  const s = new Set(open.value)
  if (s.has(code)) s.delete(code)
  else s.add(code)
  open.value = s
}
const money = (r: ProfitRow, v: number | null | undefined) => (isRateRow(r) ? fmtRatio(v) : fmtWan(v))
</script>

<template>
  <table class="pt-table">
    <thead>
      <tr><th>科目</th><th>预算(万)</th><th>概算(万)</th><th>核算(万)</th><th>实际发生(万)</th><th>剩余(万)</th><th>消耗率</th></tr>
    </thead>
    <tbody>
      <tr v-for="r in visibleRows(props.rows, open)" :key="r.code + r.name" :class="`pt-l${r.level ?? 1}`">
        <td class="pt-name" :style="{ paddingLeft: `calc(var(--sp-3) + ${(r.level ?? 1) - 1} * 16px)` }">
          <button v-if="hasChildren(props.rows, r)" class="pt-toggle" :class="{ open: open.has(r.code) }" @click="toggle(r.code)">▾</button>
          <span>{{ r.code }} {{ r.name }}</span>
        </td>
        <td class="u-num">{{ money(r, r.budget) }}</td>
        <td class="u-num">{{ money(r, r.estimate) }}</td>
        <td class="u-num">{{ money(r, r.final) }}</td>
        <td class="u-num">{{ money(r, r.actual) }}</td>
        <td class="u-num">{{ money(r, r.remaining) }}</td>
        <td class="u-num">{{ fmtRatio(r.rate) }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.pt-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.pt-table th, .pt-table td { padding: var(--sp-2) var(--sp-3); text-align: right; border-bottom: 1px solid var(--line); color: var(--txt); }
.pt-table th { color: var(--sub); font-weight: 600; font-size: var(--fs-1); }
.pt-table th:first-child, .pt-table td:first-child { text-align: left; }
.pt-l1 { font-weight: 700; background: var(--card2); }
.pt-l2 { font-weight: 600; }
.pt-l3 { color: var(--sub); }
.pt-toggle { background: none; border: none; cursor: pointer; color: var(--mut); padding: 0 var(--sp-1); transition: transform var(--dur-1) var(--ease); display: inline-block; }
.pt-toggle:not(.open) { transform: rotate(-90deg); }
</style>
```

Run: `npx vitest run src/components/ProfitTree.test.ts src/components/MilestoneTable.test.ts src/lib/profitTree.test.ts` → PASS 8 项

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/profitTree.ts frontend/src/lib/profitTree.test.ts frontend/src/components/MilestoneTable.vue frontend/src/components/MilestoneTable.test.ts frontend/src/components/ProfitTree.vue frontend/src/components/ProfitTree.test.ts
git commit -m "feat(r2): 里程碑三色表 MilestoneTable + 科目树折叠表 ProfitTree(毛利率行比率格式化,默认展开 2.2/2.3)"
```

---

### Task 2: ProjectDetailView 三 tab 接入（依赖 T1）

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue`（script 44-53 区 TABS、76-91 进度区、108-124 成本区、131-142 原项目区；template 184-232 各 section）
- Modify: `frontend/src/views/ProjectDetailView.test.ts`（seed + 新用例）

- [ ] **Step 1: seed 扩展（fixture，跑红前置）**

ProjectDetailView.test.ts 的 seed `events:` 之前插入：

```ts
    projectMilestones: {
      'P-1': [
        { name: '到货', planDate: '2026-06-19', actualDate: '', payStage: '到货款1，70.00%', pct: null, priority: 'high' },
        { name: '终验', planDate: '2026-07-01', actualDate: '', payStage: '', pct: null, priority: 'high' },
        { name: '项目关闭', planDate: '2026-08-01', actualDate: '', payStage: '', pct: null, priority: 'mid' },
      ],
      'OLD-9': [
        { name: '服务完成', planDate: '2024-01-01', actualDate: '2024-01-02', payStage: '', pct: null, priority: 'high' },
      ],
    },
    paymentRecords: {
      'P-1': { total: 3250, count: 2, lastDate: '2026-06-04', records: [
        { type: '实际回款', serial: 'BANK-1', payer: '某公司', amount: 2250, date: '2026-06-04', claimer: '马春艳', orderNo: 'N-1', currency: 'CNY', rate: 1, note: '' },
        { type: '实际回款', serial: 'BANK-2', payer: '某公司', amount: 1000, date: '2026-05-27', claimer: '赵岩', orderNo: 'N-2', currency: 'USD', rate: 7.1, note: '' },
      ] },
    },
    projectProfit: {
      'P-1': { summary: { 预算收入: 1000000, 预算成本: 600000, 实际成本: 200000, 成本消耗率: 0.33, 预算毛利: 400000, 实际毛利: 100000, 预算毛利率: 0.4, 剩余预算: 400000 },
        rows: [
          { code: '1', name: '项目收入', level: 1, budget: 1000000, estimate: 900000, final: 950000, actual: 0, remaining: 1000000, rate: 0 },
          { code: '2.1', name: '产品、商品成本', level: 2, budget: 100000, estimate: null, final: null, actual: 50000, remaining: 50000, rate: 0.5 },
          { code: '2.1.1', name: '自有产品成本', level: 3, budget: 80000, estimate: null, final: null, actual: 40000, remaining: 40000, rate: 0.5 },
          { code: '2.3', name: '人工成本', level: 2, budget: 200000, estimate: null, final: null, actual: 0, remaining: 200000, rate: 0 },
          { code: '2.3.2', name: '交付部门人工成本', level: 3, budget: 150000, estimate: null, final: null, actual: 0, remaining: 150000, rate: 0 },
        ], bridge: null },
      'P-2': { summary: { 预算收入: null, 预算成本: null, 实际成本: null, 成本消耗率: null, 预算毛利: null, 实际毛利: null, 预算毛利率: null, 剩余预算: null },
        rows: [], bridge: { ssId: 'OLD-9', summary: { 预算收入: 500000, 预算成本: 300000, 预算毛利: 200000, 预算毛利率: 0.4, 实际成本: 250000 },
          rows: [{ code: '1', name: '项目收入', level: 1, budget: 500000, estimate: null, final: null, actual: 0, remaining: 500000, rate: 0 }] } },
    },
```

- [ ] **Step 2: 新用例（跑红）**

原「进度里程碑 tab」用例标题改为 `'进度里程碑 tab:项目里程碑三色表+回款里程碑保留(R2)'`，**其原断言 `expect(w.text()).toContain('里程碑明细')` 删除**（标题已更名为「回款里程碑」），其余原断言（初验款/未到期/2026-03-01）保留，追加：

```ts
    expect(w.text()).toContain('项目里程碑')
    expect(w.find('tr.ms-high').exists()).toBe(true)
    expect(w.text()).toContain('到货款1，70.00%')
    expect(w.text()).toContain('回款里程碑')
```

新增用例（「切风险 tab」用例之前插入）：

```ts
  it('回款数据 tab:流水汇总 chips+明细表+非 CNY 汇率(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '回款数据')!.trigger('click')
    expect(w.text()).toContain('累计回款(万)')
    expect(w.text()).toContain('BANK-1')
    expect(w.text()).toContain('马春艳')
    expect(w.text()).toContain('USD(汇率 7.1)')
  })

  it('回款数据 tab:无流水显示未提供空态(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    await w.findAll('.pd-tab').find((b) => b.text() === '回款数据')!.trigger('click')
    expect(w.text()).toContain('未提供回款流水数据')
  })

  it('预算核算 tab:全预算汇总+科目树(默认展开 2.3 折叠 2.1)+PMIS/delivery 保留(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '预算核算')!.trigger('click')
    expect(w.text()).toContain('预算收入(万)')
    expect(w.text()).toContain('交付部门人工成本')      // 2.3.2 默认可见
    expect(w.text()).not.toContain('自有产品成本')       // 2.1.1 默认折叠
    expect(w.text()).toContain('概算')
    expect(w.text()).toContain('内部人员成本')           // delivery 明细保留
    expect(w.text()).toContain('总预算(万)')             // PMIS 汇总保留
  })

  it('售前项目预算核算 tab:桥接原项目块(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    await w.findAll('.pd-tab').find((b) => b.text() === '预算核算')!.trigger('click')
    expect(w.text()).toContain('原项目预算核算')
    expect(w.text()).toContain('OLD-9')
    expect(w.text()).toContain('不计入当前汇总')
  })

  it('售前原项目 tab:原项目里程碑块(R2)', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    await w.findAll('.pd-tab').find((b) => b.text() === '原项目')!.trigger('click')
    expect(w.text()).toContain('原项目里程碑')
    expect(w.text()).toContain('服务完成')
  })
```

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts` → FAIL（无回款数据 tab 等）

- [ ] **Step 3: ProjectDetailView.vue script 扩展**

import 区（第 5-12 行）：type import 追加 `MilestoneItem, PaymentRecordsEntry, ProjectProfit`；`fmtWan, fmtRatio` 行追加 `fmtYuan`；组件 import 追加：

```ts
import MilestoneTable from '@/components/MilestoneTable.vue'
import ProfitTree from '@/components/ProfitTree.vue'
```

TABS（44-49 行）改为五项：

```ts
const TABS = [
  { key: 'payment', label: '回款' },
  { key: 'payrec', label: '回款数据' },
  { key: 'progress', label: '进度里程碑' },
  { key: 'risk', label: '风险' },
  { key: 'cost', label: '预算核算' },
]
```

「—— 进度里程碑 ——」注释块（76-91 行）之后追加：

```ts
// —— R2:项目里程碑(PMIS 里程碑两表)/回款流水/全预算 ——
const myMilestones = computed(() =>
  ((data.data?.projectMilestones ?? {}) as Record<string, MilestoneItem[]>)[p.value?.projectId || ''] ?? [])
const originMilestones = computed(() =>
  ((data.data?.projectMilestones ?? {}) as Record<string, MilestoneItem[]>)[page.value.closedId || ''] ?? [])

const payRec = computed(() =>
  ((data.data?.paymentRecords ?? {}) as Record<string, PaymentRecordsEntry>)[p.value?.projectId || ''] ?? null)
const payRecSummary = computed(() => [
  { k: '累计回款(万)', v: fmtWan(payRec.value?.total) },
  { k: '回款笔数', v: String(payRec.value?.count ?? 0) },
  { k: '最近回款日', v: payRec.value?.lastDate || '-' },
])
const PAYREC_COLS: DataColumn[] = [
  { key: 'type', label: '回款类型', width: 100 },
  { key: 'amount', label: '付款金额(元)', width: 130, formatter: (v) => fmtYuan(v as number) },
  { key: 'date', label: '回款确认日期', width: 120 },
  { key: 'payer', label: '回款单位' },
  { key: 'serial', label: '收款流水号', width: 150 },
  { key: 'claimer', label: '认领人', width: 90 },
  { key: 'currency', label: '币种', width: 120, formatter: (v, r) => (!v || v === 'CNY' ? 'CNY' : `${v}(汇率 ${r.rate ?? '-'})`) },
]

const profit = computed(() =>
  ((data.data?.projectProfit ?? {}) as Record<string, ProjectProfit>)[p.value?.projectId || ''] ?? null)
const profitSummary = computed(() => {
  const s = (profit.value?.summary ?? {}) as Record<string, number | null>
  return [
    { k: '预算收入(万)', v: fmtWan(s.预算收入) },
    { k: '实际成本(万)', v: fmtWan(s.实际成本) },
    { k: '预算毛利(万)', v: fmtWan(s.预算毛利) },
    { k: '预算毛利率', v: fmtRatio(s.预算毛利率) },
  ]
})
const bridge = computed(() => profit.value?.bridge ?? null)
const bridgeSummary = computed(() => {
  const s = (bridge.value?.summary ?? {}) as Record<string, number | null>
  return [
    { k: '预算收入(万)', v: fmtWan(s.预算收入) },
    { k: '预算成本(万)', v: fmtWan(s.预算成本) },
    { k: '实际成本(万)', v: fmtWan(s.实际成本) },
    { k: '预算毛利率', v: fmtRatio(s.预算毛利率) },
  ]
})
```

- [ ] **Step 4: template 改造**

回款 section（`tab === 'payment'`）之后插入：

```html
          <section v-else-if="tab === 'payrec'" class="pd-section">
            <template v-if="payRec">
              <div class="pd-chips">
                <div v-for="it in payRecSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
              </div>
              <div class="pd-note">出处：payment_records.csv（PMIS 回款流水）。</div>
              <DataTable :columns="PAYREC_COLS" :rows="payRec.records" />
            </template>
            <div v-else class="pd-note">未提供回款流水数据（input/payment_records.csv），或该项目暂无回款记录。</div>
          </section>
```

进度 section（`tab === 'progress'`）的「里程碑明细」标题与表格替换为双层：

```html
            <div class="pd-section-title">项目里程碑（来源：PMIS 里程碑计划；行色=优先级 红高/棕中/绿低）</div>
            <MilestoneTable v-if="myMilestones.length" :items="myMilestones" />
            <div v-else class="pd-note">未提供项目里程碑数据（input/pmis/ 里程碑两表）。</div>
            <div class="pd-section-title">回款里程碑（来源：项目回款节点（里程碑）清单）</div>
            <DataTable v-if="page.nodes.length" :columns="MILESTONE_COLS" :rows="page.nodes" :show-count="false" />
            <div v-else class="pd-note">无里程碑节点记录。</div>
```

成本 section（`tab === 'cost'`）整体替换为（保留原 PMIS chips/delivery 表于底部）：

```html
          <section v-else-if="tab === 'cost'" class="pd-section">
            <template v-if="profit">
              <div class="pd-chips">
                <div v-for="it in profitSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
              </div>
              <div class="pd-note">全预算出处：profit_loss_direct.csv；概算/核算列出处：budget_data.csv。</div>
              <ProfitTree :rows="profit.rows" />
              <template v-if="bridge">
                <div class="pd-section-title">原项目预算核算（桥接 {{ bridge.ssId || '-' }}，不计入当前汇总）</div>
                <div class="pd-chips">
                  <div v-for="it in bridgeSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
                </div>
                <ProfitTree :rows="bridge.rows" />
              </template>
            </template>
            <div v-else class="pd-note">未提供全预算数据（input/profit_loss_direct.csv）。</div>
            <div class="pd-section-title">PMIS 汇总与交付明细</div>
            <div class="pd-chips">
              <div v-for="it in costSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <div class="pd-note">汇总出处：PMIS《项目状态信息数据》（消耗比=项目核算÷项目总预算）；下方明细出处：delivery_analysis.csv，两者口径独立。</div>
            <DataTable v-if="costRows.length" :columns="COST_COLS" :rows="costRows" :show-count="false" />
            <div v-else class="pd-note">未提供预算核算明细（delivery_analysis.csv）。</div>
          </section>
```

原项目 section（`tab === 'origin'`）的 closedNodes `</template>` 块内末尾追加：

```html
              <template v-if="originMilestones.length">
                <div class="pd-section-title">原项目里程碑（不计入当前汇总）</div>
                <MilestoneTable :items="originMilestones" />
              </template>
```

（注意放在 `v-else（page.closedId 存在）` 的 template 内、原项目回款节点块之后。）

- [ ] **Step 5: 跑绿 + 全量**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts` → PASS（原 11 例+新 5 例=16）
Run: `cd frontend && npm run test:run 2>&1 | tail -3 && npm run typecheck` → 全绿

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(r2): 详情页三 tab——进度里程碑双层(项目里程碑三色+回款里程碑)/预算核算科目树+桥接块/回款数据流水,原项目里程碑块"
```

---

### Task 3: 版本 + PROGRESS + verify + 终审（主循环）

- [ ] **Step 1**: `frontend/src/version.ts` → `V7.8.0`
- [ ] **Step 2**: PROGRESS.md——头部版本/最近更新；「进行中」Phase R：R1 已合并、R2 完成待合并、下一期 R3；Handoff R2 条目（三 tab 结构、毛利率行比率格式化决策、默认展开 2.2/2.3、烟雾清单：① P-1 类项目进度里程碑双层与三色 ② 回款数据 tab 流水与非 CNY 汇率 ③ 预算核算科目树展开/折叠与概算核算列 ④ 售前项目桥接块与原项目里程碑 ⑤ 缺数据项目空态不崩）。
- [ ] **Step 3**: `bash verify.sh` 全绿
- [ ] **Step 4**: Commit `chore(r2): 版本 V7.8.0 + PROGRESS 记录 R2 完成`；opus 整体终审（diff master..HEAD 对照母 spec §3 + 真实数据目检关键项目）；终审过后 finishing-a-development-branch 四选项菜单。
