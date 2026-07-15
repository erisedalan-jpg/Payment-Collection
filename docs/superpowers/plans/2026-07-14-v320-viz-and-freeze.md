# V3.2.0 视觉增强实施计划（表格首行冻结 + 倚天域与 /data 重设计）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 14 张长表加 Element Plus 原生首行冻结；对倚天域 5 页 + `/data` 做视觉重设计（增可视化 / 重排信息架构），功能零改动。

**Architecture:** 首行冻结 = 一个动态测量视口可用高度的 composable + `DataTable.vue` 一个 `stickyHeader` 开关（默认关，14 张表 opt-in）+ `/opportunities` 裸 el-table 单独接同一 composable。可视化 = 在既有 `ChartBox`/`echartsTheme` 基建上扩注册若干图型，消费已存在的 `lib/yitian/*` 纯计算函数（含此前算好却没人用的 `countByL4`），新增极少纯函数（月/季分桶、TOP 客户、问题热力矩阵）全部先测后写。`/data` 走信息架构重排（按 PMIS / 项目域 / 倚天 / 标签 / 维护 拆分功能卡），不加图表。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus 2.9 + ECharts（经 `vue-echarts`）+ vitest。纯前端，无新增第三方依赖。

## Global Constraints

- **功能零改动**：不改任何 API 调用、业务口径、`data-test` 钩子、SSE 进度反馈、权限判定、上传白名单。
- **只引设计令牌，不手写散值**：颜色/间距/字号/圆角/阴影/动效引用 `frontend/src/styles/theme.css` 变量；违者被 `theme.tokens.test.ts` / `echartsTheme.tokens.test.ts` 拦下。
- **不引入第 16 个色号**：新可视化配色只取现有 `--chart-1..8` / 状态色 `--ok/--warn/--danger/--c-urgent` / 结构灰阶（经 `echartsTheme.ts` 已导出且已被契约测试锁定的常量 `CHART_LIGHT/DARK`、`STATUS_LIGHT/DARK`、`MUTED_LIGHT/DARK`）。**不新增任何颜色常量或 CSS 颜色变量。**
- **状态语义色固定**：合规/达标=`--ok`，提示（问题码 `HINT_` 前缀）=`--warn`，问题=`--danger`，紧急=`--c-urgent`。
- **双主题**：light/dark 都正确（`html.dark` class 切换）。所有图表经 `ChartBox`（自动按 `settings.theme` 切 `ent`/`ent-dark`），**禁止绕过 ChartBox 直接 new ECharts**。
- **canvas 读不到 CSS 变量**：任何新图型/新组件必须先在 `echartsTheme.ts` 的 `use([...])` 注册，否则运行时不渲染。
- **8pt 网格 / 卡片规范 / 两级阴影 / 六级字号**：遵守 `docs/superpowers/specs/2026-06-10-design-foundation-design.md`。
- **版本 V3.2.0**（Y 级，线上基线 V3.1.0）。纯前端，升级无需点「更新数据」、不碰后端。
- **UI 重设计任务验证方式**：jsdom 测不了 computed style / canvas 渲染（项目既有教训），故 UI 任务不写 vitest，靠 `npm run typecheck` + `npm run build` + puppeteer 截图目验（见附录 A）。纯函数任务照常 TDD。

---

## 文件结构（改动地图）

**新建：**
- `frontend/src/composables/useTableMaxHeight.ts` —— 动态测量表格视口可用高度，供首行冻结。
- `frontend/src/composables/useTableMaxHeight.test.ts` —— 纯计算部分单测。

**修改（纯函数层，先测后写）：**
- `frontend/src/lib/yitian/calendar.ts` (+`calendar.test.ts`) —— 新增 `monthBuckets` / `quarterBuckets`（DRY 抽 `bucketBy`，`weekBuckets` 一并改用）。
- `frontend/src/lib/yitian/customer.ts` (+`customer.test.ts`) —— 新增 `topCustomers`。
- `frontend/src/lib/yitian/compliance.ts` (+`compliance.test.ts`) —— 新增 `issueHeatmap`。

**修改（组件/基建）：**
- `frontend/src/components/DataTable.vue` —— 加 `stickyHeader` prop。
- `frontend/src/charts/echartsTheme.ts` —— 扩注册 scatter/heatmap/visualMap/markLine/markPoint/dataZoom。

**修改（14 张表接入首行冻结）：**
- `ProjectsView.vue` / `ClosedProjectsView.vue` / `OpportunitiesView.vue`(裸 el-table) / `MilestoneDelayedTab.vue` / `MilestoneReminderTab.vue` / `MilestonePlanTab.vue` / `CostDetailView.vue` / `KeyProjectsView.vue` / `OpportunityFollowupView.vue` / `TempFollowupView.vue` / `RiskFollowupView.vue` / `PaymentKeyFollowupView.vue` / `PayProjectsView.vue` / `PayNodesView.vue` / `YitianComplianceView.vue` / `YitianAnalyticsView.vue`。

**修改（6 页重设计）：**
- `YitianOverviewView.vue` / `YitianComplianceView.vue` / `YitianAnalyticsView.vue` / `YitianTrendView.vue` / `YitianCustomerView.vue` / `DataView.vue`。

**修改（收尾）：**
- `frontend/src/version.ts` / `PROGRESS.md`。

---

## Task 1: `useTableMaxHeight` composable

**Files:**
- Create: `frontend/src/composables/useTableMaxHeight.ts`
- Test: `frontend/src/composables/useTableMaxHeight.test.ts`

**Interfaces:**
- Produces:
  - `computeMaxHeight(rectTop: number, innerHeight: number, bottomGap: number, min: number): number`
  - `useTableMaxHeight(getEl: () => HTMLElement | null | undefined, opts?: { bottomGap?: number; min?: number; enabled?: () => boolean }): { maxHeight: Ref<number>; recompute: () => void }`

- [ ] **Step 1: 写失败测试**（纯计算函数）

```ts
// frontend/src/composables/useTableMaxHeight.test.ts
import { describe, it, expect } from 'vitest'
import { computeMaxHeight } from './useTableMaxHeight'

describe('computeMaxHeight', () => {
  it('可用高度 = 视口高 − 表格顶部 − 底部留白', () => {
    expect(computeMaxHeight(200, 900, 24, 200)).toBe(676) // 900-200-24
  })
  it('不低于最小高度(内容被挤到很矮时兜底)', () => {
    expect(computeMaxHeight(800, 900, 24, 200)).toBe(200) // 900-800-24=76 < 200
  })
  it('表格贴近视口顶部时给出接近满屏的高度', () => {
    expect(computeMaxHeight(0, 768, 24, 200)).toBe(744)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/composables/useTableMaxHeight.test.ts`
Expected: FAIL（`computeMaxHeight` 未定义）

- [ ] **Step 3: 实现**

```ts
// frontend/src/composables/useTableMaxHeight.ts
import { onActivated, onBeforeUnmount, onDeactivated, onMounted, nextTick, ref, type Ref } from 'vue'

/** 纯计算:视口可用高度 = 视口高 − 表格顶部距 − 底部留白,不低于 min。 */
export function computeMaxHeight(rectTop: number, innerHeight: number, bottomGap: number, min: number): number {
  return Math.max(min, innerHeight - rectTop - bottomGap)
}

/**
 * 动态测量目标元素在视口中的顶部位置,算出 el-table 的 max-height。
 * 随窗口 resize / keep-alive 激活 / 外部 recompute() 重算。enabled 为假时不计算(非冻结表零开销)。
 */
export function useTableMaxHeight(
  getEl: () => HTMLElement | null | undefined,
  opts: { bottomGap?: number; min?: number; enabled?: () => boolean } = {},
): { maxHeight: Ref<number>; recompute: () => void } {
  const bottomGap = opts.bottomGap ?? 24
  const min = opts.min ?? 200
  const maxHeight = ref(min)

  function recompute() {
    if (opts.enabled && !opts.enabled()) return
    const el = getEl()
    if (!el || typeof window === 'undefined') return
    const top = el.getBoundingClientRect().top
    maxHeight.value = computeMaxHeight(top, window.innerHeight, bottomGap, min)
  }

  const onResize = () => recompute()
  const addListener = () => { if (typeof window !== 'undefined') window.addEventListener('resize', onResize) }
  const removeListener = () => { if (typeof window !== 'undefined') window.removeEventListener('resize', onResize) }

  onMounted(() => { addListener(); nextTick(recompute) })
  onActivated(() => { addListener(); nextTick(recompute) }) // keep-alive 页重新激活时重算(非 keep-alive 下不触发)
  onDeactivated(removeListener)
  onBeforeUnmount(removeListener)

  return { maxHeight, recompute }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/composables/useTableMaxHeight.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/composables/useTableMaxHeight.ts frontend/src/composables/useTableMaxHeight.test.ts
git commit -m "feat(table): useTableMaxHeight 动态测量视口可用高度(首行冻结基建)"
```

---

## Task 2: `DataTable.vue` 加 `stickyHeader`

**Files:**
- Modify: `frontend/src/components/DataTable.vue`
- Test: `frontend/src/components/DataTable.test.ts`（若已存在则追加用例；否则新建）

**Interfaces:**
- Consumes: `useTableMaxHeight`（Task 1）
- Produces: `DataTable` 新增 prop `stickyHeader?: boolean`（默认 `false`）。为真时给内部 el-table 绑 `:max-height`（动态测量）→ 原生固定表头 + 表体内滚。默认关时行为与现状 100% 一致。

- [ ] **Step 1: 写失败测试**（零回归守卫 + 开启后有 max-height）

```ts
// frontend/src/components/DataTable.test.ts —— 追加(顶部已有的 import 沿用;若新建则补 import)
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ElTable } from 'element-plus'
import DataTable from './DataTable.vue'

const COLS = [{ key: 'a', label: 'A' }]
const ROWS = [{ a: 1 }, { a: 2 }]

describe('DataTable stickyHeader', () => {
  it('默认不设 max-height(零回归)', () => {
    const w = mount(DataTable, { props: { columns: COLS, rows: ROWS } })
    expect(w.findComponent(ElTable).props('maxHeight')).toBeUndefined()
  })
  it('开启后 el-table 拿到数字 max-height', async () => {
    const w = mount(DataTable, { props: { columns: COLS, rows: ROWS, stickyHeader: true } })
    await w.vm.$nextTick()
    expect(typeof w.findComponent(ElTable).props('maxHeight')).toBe('number')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: FAIL（stickyHeader 未定义 → 第二用例 maxHeight 仍 undefined）

- [ ] **Step 3: 实现**（改 `DataTable.vue`）

script 顶部 import 补：
```ts
import { computed, ref, nextTick, watch } from 'vue'
import { useTableMaxHeight } from '@/composables/useTableMaxHeight'
```
`defineProps` 泛型里追加一行（在 `defaultSort` 之后）：
```ts
    /** 首行冻结:为真时给 el-table 设动态 max-height,启用 EP 原生固定表头 + 表体内滚。默认关=零回归。 */
    stickyHeader?: boolean
```
`withDefaults` 第二参补 `stickyHeader: false`。
`onSortChange` 之后加：
```ts
const tableRef = ref<any>(null)
const { maxHeight, recompute } = useTableMaxHeight(
  () => tableRef.value?.$el as HTMLElement | undefined,
  { enabled: () => props.stickyHeader },
)
const tableMaxHeight = computed(() => (props.stickyHeader ? maxHeight.value : undefined))
// 数据变化(分页/筛选/排序切片)后表格高度可能变,重算一次
watch(() => props.rows, () => { if (props.stickyHeader) nextTick(recompute) }, { flush: 'post' })
```
template 里 `<el-table>` 加 `ref="tableRef"` 与 `:max-height="tableMaxHeight"`：
```vue
    <el-table
      ref="tableRef"
      :data="props.rows"
      border
      stripe
      style="width: 100%"
      :max-height="tableMaxHeight"
      :row-class-name="props.clickable ? 'dt-clickable-row' : ''"
      ...
```

- [ ] **Step 4: 跑测试确认通过 + 全量 DataTable 测试零回归**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: PASS（含既有全部用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DataTable.vue frontend/src/components/DataTable.test.ts
git commit -m "feat(table): DataTable 加 stickyHeader 开关(EP 原生固定表头,默认关)"
```

---

## Task 3: 13 张 DataTable 表接入 `sticky-header`

**Files（逐个加 `sticky-header` 到该页的目标 `<DataTable>`）:**
- `frontend/src/views/ProjectsView.vue`（主表）
- `frontend/src/views/ClosedProjectsView.vue`（主表）
- `frontend/src/components/MilestoneDelayedTab.vue`（延期项目清单）
- `frontend/src/components/MilestoneReminderTab.vue`（到期提醒）
- `frontend/src/components/MilestonePlanTab.vue`（在建里程碑计划）
- `frontend/src/views/CostDetailView.vue`（**明细表**；L4 汇总短表不动）
- `frontend/src/views/KeyProjectsView.vue`（主表）
- `frontend/src/views/OpportunityFollowupView.vue`（主表）
- `frontend/src/views/TempFollowupView.vue`（主表）
- `frontend/src/views/RiskFollowupView.vue`（主表）
- `frontend/src/views/PaymentKeyFollowupView.vue`（主表）
- `frontend/src/views/PayProjectsView.vue`（主表）
- `frontend/src/views/PayNodesView.vue`（主表）

**Interfaces:**
- Consumes: `DataTable` 的 `stickyHeader` prop（Task 2）

- [ ] **Step 1: 逐页在目标 `<DataTable ...>` 标签上加属性 `sticky-header`**

每处只加一个布尔属性，例如 `ProjectsView.vue`：
```vue
    <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable sticky-header
      :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange" @row-click="onRow">
```
`CostDetailView.vue`：只给**明细表**（原 L219 那张，长表）加，L4 汇总表（原 L205）**不加**。含 `RichTextCell` 的跟进页（Key/OpportunityFollowup/Temp/Risk/PaymentKey）在其唯一主 `<DataTable>` 上加，slot 内容不动。

- [ ] **Step 2: typecheck + build 确认无回归**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: 均通过（新增布尔属性不影响类型）

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "feat(table): 13 张长表接入首行冻结(sticky-header)"
```

> 视觉正确性（表头钉死、合计行留底、fixed 列同步）在附录 A 的截图目验里抽查。

---

## Task 4: `/opportunities` 裸 el-table 接入首行冻结

**Files:**
- Modify: `frontend/src/views/OpportunitiesView.vue`（裸 `<el-table>`，需列头筛选 + 多选列，不走 DataTable）

**Interfaces:**
- Consumes: `useTableMaxHeight`（Task 1）

- [ ] **Step 1: 接 composable 到裸 el-table**

script 内 import 与接线：
```ts
import { ref, nextTick, watch } from 'vue' // 若已 import ref/watch 则合并,勿重复
import { useTableMaxHeight } from '@/composables/useTableMaxHeight'
// ...
const oppTableRef = ref<any>(null)
const { maxHeight: oppMaxHeight, recompute: oppRecompute } = useTableMaxHeight(
  () => oppTableRef.value?.$el as HTMLElement | undefined,
)
watch(() => paged.value, () => nextTick(oppRecompute), { flush: 'post' })
```
template 里给 `<el-table>` 加 `ref` 与 `:max-height`（原 L228 附近）：
```vue
  <el-table ref="oppTableRef" :data="paged" border style="width: 100%" :max-height="oppMaxHeight"
    @selection-change="onSel" @sort-change="onSortChange" :default-sort="defaultSort">
```
（`paged` 是该视图现有的分页切片 computed；若名称不同以实际为准，watch 对应它。）

- [ ] **Step 2: typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: 通过

- [ ] **Step 3: 提交**

```bash
git add frontend/src/views/OpportunitiesView.vue
git commit -m "feat(table): /opportunities 裸 el-table 接入首行冻结"
```

---

## Task 5: `echartsTheme.ts` 扩注册图型

**Files:**
- Modify: `frontend/src/charts/echartsTheme.ts:1-7`

**Interfaces:**
- Produces: ECharts 全局注册 `ScatterChart` / `HeatmapChart` / `VisualMapComponent` / `MarkLineComponent` / `MarkPointComponent` / `DataZoomComponent`，供后续可视化任务使用。**不新增任何颜色常量**（配色复用已导出的 `CHART_*`/`STATUS_*`/`MUTED_*`）。

- [ ] **Step 1: 改 import 与 `use([...])`**

`echartsTheme.ts` 第 3–4 行两处 import 扩为：
```ts
import { BarChart, LineChart, PieChart, ScatterChart, HeatmapChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  VisualMapComponent, MarkLineComponent, MarkPointComponent, DataZoomComponent,
} from 'echarts/components'
```
第 7 行 `use([...])` 扩为：
```ts
use([
  CanvasRenderer, BarChart, LineChart, PieChart, ScatterChart, HeatmapChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  VisualMapComponent, MarkLineComponent, MarkPointComponent, DataZoomComponent,
])
```

- [ ] **Step 2: 契约测试与构建确认无回归**

Run: `cd frontend && npx vitest run src/charts/echartsTheme.tokens.test.ts && npm run build`
Expected: 契约测试 PASS（未新增颜色常量,断言不变）；build 通过（新模块正确注册）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/charts/echartsTheme.ts
git commit -m "feat(charts): 扩注册 scatter/heatmap/visualMap/markLine/markPoint/dataZoom"
```

---

## Task 6: `calendar.ts` 月/季分桶

**Files:**
- Modify: `frontend/src/lib/yitian/calendar.ts`
- Test: `frontend/src/lib/yitian/calendar.test.ts`（追加）

**Interfaces:**
- Consumes: 现有 `daysInRange`、`WeekBucket` 类型、`YitianDay`
- Produces:
  - `monthBuckets(days: YitianDay[], start: string, end: string): WeekBucket[]`（key='YYYY-MM'）
  - `quarterBuckets(days: YitianDay[], start: string, end: string): WeekBucket[]`（key='YYYY-Q1'..'Q4'）
  - 内部 `bucketBy(days, start, end, keyOf)`（DRY；`weekBuckets` 一并改用）

- [ ] **Step 1: 写失败测试**（追加到 `calendar.test.ts`，复用文件顶部 `DAYS` 夹具，另加跨月夹具）

```ts
import { monthBuckets, quarterBuckets } from './calendar'

const SPAN: YitianDay[] = [
  { d: '2025-12-31', workday: true,  isoWeek: '2026-W01', calcWeek: '2025-CW53' },
  { d: '2026-01-02', workday: true,  isoWeek: '2026-W01', calcWeek: '2026-CW01' },
  { d: '2026-02-16', workday: false, isoWeek: '2026-W08', calcWeek: '2026-CW08' },
  { d: '2026-04-01', workday: true,  isoWeek: '2026-W14', calcWeek: '2026-CW14' },
]

describe('monthBuckets', () => {
  it('按 YYYY-MM 分桶,起始日升序,工作日计数', () => {
    const b = monthBuckets(SPAN, '', '')
    expect(b.map((x) => x.key)).toEqual(['2025-12', '2026-01', '2026-02', '2026-04'])
    expect(b[0]).toMatchObject({ key: '2025-12', workdays: 1, start: '2025-12-31', end: '2025-12-31' })
    expect(b[2].workdays).toBe(0) // 2/16 是假
  })
  it('区间过滤后只留命中月', () => {
    expect(monthBuckets(SPAN, '2026-01-01', '2026-03-31').map((x) => x.key)).toEqual(['2026-01', '2026-02'])
  })
})

describe('quarterBuckets', () => {
  it('按 YYYY-Qn 分桶(1-3=Q1,4-6=Q2)', () => {
    const b = quarterBuckets(SPAN, '', '')
    expect(b.map((x) => x.key)).toEqual(['2025-Q4', '2026-Q1', '2026-Q2'])
    expect(b[1]).toMatchObject({ key: '2026-Q1', start: '2026-01-02', end: '2026-02-16', workdays: 1 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/calendar.test.ts`
Expected: FAIL（`monthBuckets`/`quarterBuckets` 未定义）

- [ ] **Step 3: 实现**（改 `calendar.ts`）

把现有 `weekBuckets` 主体抽成 `bucketBy`，三个分桶函数共用：
```ts
/** 通用分桶:按 keyOf(day) 分组,每桶带工作日数与起止日,按起始日升序。 */
function bucketBy(days: YitianDay[], start: string, end: string, keyOf: (d: YitianDay) => string): WeekBucket[] {
  const map = new Map<string, WeekBucket>()
  for (const d of daysInRange(days, start, end)) {
    const k = keyOf(d)
    const b = map.get(k)
    if (!b) map.set(k, { key: k, workdays: d.workday ? 1 : 0, start: d.d, end: d.d })
    else {
      if (d.workday) b.workdays += 1
      if (d.d < b.start) b.start = d.d
      if (d.d > b.end) b.end = d.d
    }
  }
  return [...map.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

export function weekBuckets(days: YitianDay[], start: string, end: string, mode: WeekMode): WeekBucket[] {
  return bucketBy(days, start, end, (d) => weekKeyOf(d, mode))
}

/** 按自然月分桶(key='YYYY-MM')。月/季与 iso/calc 周口径无关,不取 mode。 */
export function monthBuckets(days: YitianDay[], start: string, end: string): WeekBucket[] {
  return bucketBy(days, start, end, (d) => d.d.slice(0, 7))
}

/** 按季度分桶(key='YYYY-Qn';1-3 月=Q1,4-6=Q2,7-9=Q3,10-12=Q4)。 */
export function quarterBuckets(days: YitianDay[], start: string, end: string): WeekBucket[] {
  return bucketBy(days, start, end, (d) => `${d.d.slice(0, 4)}-Q${Math.floor((Number(d.d.slice(5, 7)) - 1) / 3) + 1}`)
}
```
（`weekBuckets` 改用 `bucketBy` 后语义不变，由既有 `weekBuckets` 用例守护。）

- [ ] **Step 4: 跑测试确认通过（含既有 weekBuckets 用例）**

Run: `cd frontend && npx vitest run src/lib/yitian/calendar.test.ts`
Expected: PASS（新旧全绿）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/calendar.ts frontend/src/lib/yitian/calendar.test.ts
git commit -m "feat(yitian): calendar 月/季分桶(DRY bucketBy)"
```

---

## Task 7: `customer.ts` TOP 客户排行

**Files:**
- Modify: `frontend/src/lib/yitian/customer.ts`
- Test: `frontend/src/lib/yitian/customer.test.ts`（追加）

**Interfaces:**
- Consumes: 现有 `selectEntries`（来自 `./metrics`，本文件已 import）、`data.dims.customers`、`YitianEntry.cu`
- Produces: `topCustomers(data: YitianData, start: string, end: string, l4s: string[], n: number): { name: string; hours: number }[]`（按客户聚合工时降序取前 n；无客户名的行不计）

- [ ] **Step 1: 写失败测试**（追加到 `customer.test.ts`，复用文件顶部 `DATA` 夹具）

```ts
import { topCustomers } from './customer'

describe('topCustomers', () => {
  it('按客户聚合工时降序取前 n(含管理类等所有带客户名的行)', () => {
    // 夹具:大客户 = A1 项目类6h + A2 售前类4h = 10;小客户 = A1 项目类2h = 2
    const t = topCustomers(DATA, S, E, [], 5)
    expect(t).toEqual([{ name: '大客户', hours: 10 }, { name: '小客户', hours: 2 }])
  })
  it('n 截断', () => {
    expect(topCustomers(DATA, S, E, [], 1)).toEqual([{ name: '大客户', hours: 10 }])
  })
  it('无客户名(cu=null)的行不计', () => {
    // 夹具里 A1 管理类 8h 的 cu=null,不应出现在排行里
    const names = topCustomers(DATA, S, E, [], 5).map((x) => x.name)
    expect(names).not.toContain('')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/customer.test.ts`
Expected: FAIL（`topCustomers` 未定义）

- [ ] **Step 3: 实现**（追加到 `customer.ts` 末尾）

```ts
/** TOP 客户排行:按 entries.cu → dims.customers 聚合工时,降序取前 n。无客户名的行(cu=null)不计。 */
export function topCustomers(
  data: YitianData, start: string, end: string, l4s: string[], n: number,
): { name: string; hours: number }[] {
  const acc = new Map<string, number>()
  for (const e of selectEntries(data, start, end, l4s)) {
    if (e.cu === null || e.cu === undefined) continue
    const name = data.dims.customers[e.cu] ?? ''
    if (!name) continue
    acc.set(name, (acc.get(name) ?? 0) + e.h)
  }
  return [...acc.entries()]
    .map(([name, hours]) => ({ name, hours }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, n)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/yitian/customer.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/customer.ts frontend/src/lib/yitian/customer.test.ts
git commit -m "feat(yitian): customer topCustomers TOP 客户排行"
```

---

## Task 8: /yitian 总览重设计（增强）

**Files:**
- Modify: `frontend/src/views/YitianOverviewView.vue`

**Interfaces:**
- Consumes: `kpi() / complianceRate() / orgSummary() / typeHours()`（`lib/yitian/metrics`，均现成）、`RatioRing`、`ChartBox`、`MetricGrid`、`DataTable`

**结构要求（功能与数据源不变，只重排展示 + 增图）：**
1. 顶部 KPI 带保留 `MetricGrid` 五项；给「合规率」项改用 `RatioRing`（值域 0–1 天然适配；饱和度**不用** RatioRing，因其可 >1）。其余项守「1 主 + 至多 2 辅」。
2. 新增「L4 组织工时」横向柱：实际工时 vs 基础工时**分组柱**，置于「分层汇总」表**上方**；表保留。
3. 「工时类型占比」保留环形饼，**删除**与之同数据的重复柱图（信息冗余）。

- [ ] **Step 1: 加「L4 组织工时」分组柱 option builder**

用 `orgSummary(data, view.start, view.end, view.l4s).filter(r => r.level === 'l4')` 取 L4 行。option（横向分组柱，实际 vs 基础）：
```ts
function orgBarOption(l4Rows: { name: string; hours: number; base: number }[]) {
  const rows = [...l4Rows].sort((a, b) => a.hours - b.hours) // 横向柱自下而上,升序读得顺
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0 },
    grid: { left: 8, right: 24, top: 16, bottom: 40, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows.map((r) => r.name) },
    series: [
      { name: '实际工时', type: 'bar', data: rows.map((r) => Number(r.hours.toFixed(1))) },
      { name: '基础工时', type: 'bar', data: rows.map((r) => Number(r.base.toFixed(1))) },
    ],
  }
}
```
挂 `<ChartBox :option="orgBarOption(...)" height="360px" />`（L4 多时可按行数放大高度）。

- [ ] **Step 2: 合规率 RatioRing 接入 + 删冗余柱**

「合规率」卡内放 `<RatioRing :ratio="kpi.complianceRate" label="合规率" />`（RatioRing 的 prop 是 `ratio: number | null`，**原生处理 null**——显示 `fmtRatio(null)` 即 '-'、色转 `--mut`，无需 `?? 0`，与全站 null→'-' 口径一致）。删除模板里与饼图同源的那张类型占比柱。

- [ ] **Step 3: 版式令牌自检**

确认新增卡片用 `--card/--line/--r-lg/--card-pad/--shadow-1`、间距 `--gap-*`、标题 `--fs-3`；无手写颜色/像素散值。

- [ ] **Step 4: typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: 通过

- [ ] **Step 5: 提交 + 截图目验（附录 A）**

```bash
git add frontend/src/views/YitianOverviewView.vue
git commit -m "redesign(yitian): 总览 合规率环形 + L4 组织工时分组柱,删冗余柱"
```
目验 `/yitian`：light/dark 双主题、KPI 环形正确、组织柱渲染、无 console 报错。

---

## Task 9: /yitian/compliance 重设计（含 `issueHeatmap` 纯函数）

**Files:**
- Modify: `frontend/src/lib/yitian/compliance.ts`（+ `compliance.test.ts` 追加）
- Modify: `frontend/src/views/YitianComplianceView.vue`

**Interfaces:**
- Consumes: `issueRows() / countByCode() / countByL4()`（现成，`lib/yitian/compliance`）、`kpi()`（`lib/yitian/metrics`，取 `complianceRate` 喂 RatioRing；调用签名 `kpi(data, view.start, view.end, view.l4s, settings.settings.excludedTypes)`）、`ChartBox`、`RatioRing`、`MetricGrid`、`DataTable`
- Produces: `issueHeatmap(rows: IssueRow[]): { codes: { code: string; label: string }[]; l4s: string[]; cells: [number, number, number][]; max: number }`（ECharts heatmap 用 `[xL4Index, yCodeIndex, count]`）

- [ ] **Step 1: 写失败测试**（`compliance.test.ts` 追加；复用其现有夹具风格构造 `IssueRow[]` 或直接 `issueRows(DATA,...)`）

```ts
import { issueHeatmap } from './compliance'
import type { IssueRow } from './compliance'

const R: IssueRow[] = [
  { date: '', empId: '', empName: '', l4: '银行组', l31: '', type: '', customer: '', workOrder: '', hours: 0, ok: 2, codes: ['MISS_SUMMARY', 'MISS_NEXT'], msgs: [], snippet: '' },
  { date: '', empId: '', empName: '', l4: '银行组', l31: '', type: '', customer: '', workOrder: '', hours: 0, ok: 2, codes: ['MISS_SUMMARY'], msgs: [], snippet: '' },
  { date: '', empId: '', empName: '', l4: '浙江组', l31: '', type: '', customer: '', workOrder: '', hours: 0, ok: 1, codes: ['MISS_NEXT'], msgs: [], snippet: '' },
]

describe('issueHeatmap', () => {
  const h = issueHeatmap(R)
  it('码轴按问题码计数降序', () => {
    expect(h.codes.map((c) => c.code)).toEqual(['MISS_SUMMARY', 'MISS_NEXT']) // 2 vs 2? 见下:MISS_SUMMARY=2,MISS_NEXT=2
  })
  it('L4 轴按问题行数降序', () => {
    expect(h.l4s).toEqual(['银行组', '浙江组']) // 银行组2行 > 浙江组1行
  })
  it('cells 为 [l4Index, codeIndex, count],max 正确', () => {
    // 银行组(x=0) × MISS_SUMMARY(y=0) = 2
    const bankSummary = h.cells.find((c) => c[0] === 0 && c[1] === 0)
    expect(bankSummary?.[2]).toBe(2)
    expect(h.max).toBe(2)
  })
})
```
> 注：夹具里 MISS_SUMMARY 出现 2 次、MISS_NEXT 2 次，`countByCode` 同数时按其现有实现的 `Object.entries` 顺序稳定（先出现者在前=MISS_SUMMARY）；断言与实现一致即可，如实现顺序不同则按实际调整该断言。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/compliance.test.ts`
Expected: FAIL（`issueHeatmap` 未定义）

- [ ] **Step 3: 实现 `issueHeatmap`**（追加到 `compliance.ts` 末尾）

```ts
export interface IssueHeatmap {
  codes: { code: string; label: string }[]
  l4s: string[]
  cells: [number, number, number][] // [xL4Index, yCodeIndex, count]
  max: number
}

/** 问题码 × L4 热力矩阵。码轴取 countByCode 顺序、L4 轴取 countByL4 顺序(均降序)。 */
export function issueHeatmap(rows: IssueRow[]): IssueHeatmap {
  const codeOrder = countByCode(rows)
  const l4Order = countByL4(rows)
  const codeIdx = new Map(codeOrder.map((c, i) => [c.code, i]))
  const l4Idx = new Map(l4Order.map((r, i) => [r.l4, i]))
  const acc = new Map<string, number>()
  for (const r of rows) {
    const li = l4Idx.get(r.l4)
    if (li === undefined) continue
    for (const c of r.codes) {
      const ci = codeIdx.get(c)
      if (ci === undefined) continue
      acc.set(ci + '|' + li, (acc.get(ci + '|' + li) ?? 0) + 1)
    }
  }
  let max = 0
  const cells: [number, number, number][] = []
  for (const [k, v] of acc) {
    const [ci, li] = k.split('|').map(Number)
    cells.push([li, ci, v])
    if (v > max) max = v
  }
  return { codes: codeOrder.map((c) => ({ code: c.code, label: c.label })), l4s: l4Order.map((r) => r.l4), cells, max }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/yitian/compliance.test.ts`
Expected: PASS

- [ ] **Step 5: 视图重设计**（改 `YitianComplianceView.vue`）

结构（功能不变：保留顶部问题码多选筛选 + 导出按钮、保留问题明细表）：
1. 顶部健康带：大号 `<RatioRing :ratio="kpi.complianceRate" label="合规率" :size="140" />`（prop 是 `ratio: number | null`，原生处理 null）+ `MetricGrid`（总问题数 / 问题人次 / 涉及组织数，取自 `issueRows` 派生：行数、去重工号数、去重 L4 数）。
2. 「问题分布」把手写 `<ul>` pill 列表换成横向柱（`countByCode` 降序）：
```ts
function codeBarOption(codes: { label: string; code: string; count: number }[]) {
  const rows = [...codes].sort((a, b) => a.count - b.count)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows.map((r) => r.label) },
    series: [{
      type: 'bar',
      data: rows.map((r) => ({
        value: r.count,
        itemStyle: { color: r.code.startsWith('HINT_') ? STATUS_LIGHT.warn : STATUS_LIGHT.danger },
      })),
    }],
  }
}
```
（`STATUS_LIGHT` 从 `@/charts/echartsTheme` import；暗色下柱色由 ChartBox 主题总色板托底、逐条 itemStyle 仍取 warn/danger 语义色——warn/danger 在 STATUS_LIGHT/DARK 值接近，语义一致，可接受。）
3. 新增「问题按 L4 组织分布」横向柱（消费 `countByL4`，与 codeBarOption 同构，series 无需状态色，用主题默认色）。
4. 新增「问题码 × L4 热力图」：
```ts
function heatmapOption(h: IssueHeatmap) {
  return {
    tooltip: { position: 'top' },
    grid: { left: 8, right: 8, top: 8, bottom: 60, containLabel: true },
    xAxis: { type: 'category', data: h.l4s, axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'category', data: h.codes.map((c) => c.label) },
    visualMap: {
      min: 0, max: Math.max(1, h.max), calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
      inRange: { color: [STRUCT_LIGHT.card, STATUS_LIGHT.warn, STATUS_LIGHT.danger] },
    },
    series: [{ type: 'heatmap', data: h.cells, label: { show: true } }],
  }
}
```
（色阶 `[card, warn, danger]` 三档全取已导出常量，不新增颜色；`STRUCT_LIGHT` 从 echartsTheme import。）
5. 「问题明细」大 `<DataTable>` 保留 —— **Task 3 已给它加过 `sticky-header`**，本任务不重复加，只确保重排后它仍在。

- [ ] **Step 6: typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: 通过

- [ ] **Step 7: 提交 + 截图目验（附录 A）**

```bash
git add frontend/src/lib/yitian/compliance.ts frontend/src/lib/yitian/compliance.test.ts frontend/src/views/YitianComplianceView.vue
git commit -m "redesign(yitian): 合规页 健康带+问题分布柱+按L4分布+码×L4热力图"
```
目验 `/yitian/compliance`：热力图/柱正确渲染、warn/danger 语义色对、导出与多选筛选仍工作、light/dark、无 console 报错。

---

## Task 10: /yitian/analytics 重设计

**Files:**
- Modify: `frontend/src/views/YitianAnalyticsView.vue`

**Interfaces:**
- Consumes: `empStats() / saturationTop() / unfilledList() / neverFilledList()`（现成，`EmpStat` 有 `hours/base/sat/diff/filled`）、`ChartBox`、`HealthSegmentBar`、`DataTable`

**结构（4 张表保留、下移；图在上）：**
1. 顶部人数结构：`HealthSegmentBar` 三段——达标（`diff>=0 && filled`）/ 欠填（`filled && diff<0`）/ 完全未填（`!filled`）。段数取自 `empStats`。
2. 「饱和度 TOP10」横向柱 + 基础工时 `markLine` 参考线（`saturationTop(stats,10)`）。
3. **加班/欠填发散条形**（正=加班=`STATUS.danger`、负=欠填=`STATUS.warn`）。
4. **饱和度分布散点**（x=实际工时、y=饱和度）。
5. 原 4 张 `<DataTable>` 保留（员工工时明细表 Task 3 已加 `sticky-header`）。

- [ ] **Step 1: 三个 option builder**

```ts
import { STATUS_LIGHT } from '@/charts/echartsTheme'

// 饱和度 TOP10:横向柱 + 基础工时均值参考线
function satTopOption(top: EmpStat[]) {
  const rows = [...top].sort((a, b) => a.hours - b.hours)
  const base = rows[0]?.base ?? 0
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows.map((r) => r.name) },
    series: [{
      type: 'bar', data: rows.map((r) => Number(r.hours.toFixed(1))),
      markLine: { symbol: 'none', data: [{ xAxis: Number(base.toFixed(1)), name: '基础工时' }], label: { formatter: '基础 {c}h' } },
    }],
  }
}

// 加班/欠填发散条形:正=加班(danger),负=欠填(warn)
function divergingOption(stats: EmpStat[]) {
  const rows = stats.filter((s) => s.filled).sort((a, b) => a.diff - b.diff)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v}h` },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rows.map((r) => r.name) },
    series: [{
      type: 'bar',
      data: rows.map((r) => ({
        value: Number(r.diff.toFixed(1)),
        itemStyle: { color: r.diff >= 0 ? STATUS_LIGHT.danger : STATUS_LIGHT.warn },
      })),
    }],
  }
}

// 饱和度分布散点:x=实际工时,y=饱和度(百分比)
function scatterOption(stats: EmpStat[]) {
  const pts = stats.filter((s) => s.filled && s.sat !== null).map((s) => [Number(s.hours.toFixed(1)), Number(((s.sat as number) * 100).toFixed(1)), s.name])
  return {
    tooltip: { formatter: (p: any) => `${p.value[2]}<br/>工时 ${p.value[0]}h · 饱和度 ${p.value[1]}%` },
    grid: { left: 48, right: 24, top: 16, bottom: 40 },
    xAxis: { type: 'value', name: '实际工时(h)' },
    yAxis: { type: 'value', name: '饱和度(%)' },
    series: [{ type: 'scatter', symbolSize: 10, data: pts }],
  }
}
```

- [ ] **Step 2: 视图重排**

上方三图卡（饱和度 TOP10 / 发散条形 / 散点）+ 顶部 `HealthSegmentBar`；下方保留原 4 张表。用现有 `.yt-grid`/`.yt-card` 版式令牌。

- [ ] **Step 3: typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: 通过

- [ ] **Step 4: 提交 + 截图目验（附录 A）**

```bash
git add frontend/src/views/YitianAnalyticsView.vue
git commit -m "redesign(yitian): 分析页 人数结构条+饱和度TOP柱+加班欠填发散条+饱和度散点"
```
目验 `/yitian/analytics`：散点/发散条渲染、正负双色语义对、参考线在位、light/dark、无报错。

---

## Task 11: /yitian/trend 重设计（周/月/季 + 强化）

**Files:**
- Modify: `frontend/src/views/YitianTrendView.vue`

**Interfaces:**
- Consumes: `weekBuckets`（现有）+ `monthBuckets` / `quarterBuckets`（Task 6）、`SegToggle`、现有逐桶指标逻辑

**结构（功能不变，增粒度切换与图强化）：**
1. 顶部加 `SegToggle` 周/月/季（**局部 ref，不入 yitianView store**）。
2. `series` 的 `buckets` 来源改为按粒度选择。
3. 折线加 `markLine`(均值) + `markPoint`(峰谷) + 共享 `dataZoom`。
4. 「总工时 + 合规率」合成一张**双轴**折线（减一张卡）。
5. 类型占比堆叠柱加**百分比堆叠**（各桶归一到 100%）。

- [ ] **Step 1: 粒度切换**

script 顶部 import 补 `monthBuckets, quarterBuckets`、`SegToggle`、`ref`；加：
```ts
const gran = ref<'week' | 'month' | 'quarter'>('week')
const GRAN_OPTS = [{ value: 'week', label: '周' }, { value: 'month', label: '月' }, { value: 'quarter', label: '季' }]
```
`series` computed 里把 `const buckets = weekBuckets(data.days, view.start, view.end, view.weekMode)` 换成：
```ts
  const buckets =
    gran.value === 'month' ? monthBuckets(data.days, view.start, view.end)
    : gran.value === 'quarter' ? quarterBuckets(data.days, view.start, view.end)
    : weekBuckets(data.days, view.start, view.end, view.weekMode)
```
（其余逐桶逻辑不变；`out.weeks = buckets.map(b => b.key)` 保持。）template 顶部 `<YitianToolbar>` 下加 `<SegToggle v-model="gran" :options="GRAN_OPTS" />`。

- [ ] **Step 2: 折线强化 + 双轴合并 + 百分比堆叠**

`lineOption` 增强（加 markLine/markPoint/dataZoom；markLine/markPoint 不显式设色，继承系列色以保证暗色正确）：
```ts
function lineOption(name: string, data: (number | null)[], unit = '') {
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v: number) => `${v}${unit}` },
    grid: { left: 48, right: 16, top: 24, bottom: 56 },
    xAxis: { type: 'category', data: series.value.weeks },
    yAxis: { type: 'value' },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 20 }],
    series: [{
      name, type: 'line', smooth: true, data,
      markPoint: { data: [{ type: 'max', name: '峰' }, { type: 'min', name: '谷' }], symbolSize: 36 },
      markLine: { symbol: 'none', data: [{ type: 'average', name: '均值' }] },
    }],
  }
}
```
把原「总工时趋势」「合规率趋势」两张单图，合成一张双轴：
```ts
const hoursOkRateOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { bottom: 0 },
  grid: { left: 48, right: 48, top: 24, bottom: 56 },
  xAxis: { type: 'category', data: series.value.weeks },
  yAxis: [{ type: 'value', name: 'h' }, { type: 'value', name: '%', max: 100 }],
  dataZoom: [{ type: 'inside' }, { type: 'slider', height: 16, bottom: 20 }],
  series: [
    { name: '总工时', type: 'line', smooth: true, yAxisIndex: 0, data: series.value.hours },
    { name: '合规率', type: 'line', smooth: true, yAxisIndex: 1, connectNulls: false, data: series.value.okRate },
  ],
}))
```
`charts` computed 里删掉原「总工时趋势」「合规率趋势」两项，改列一项 `{ title: '总工时 / 合规率趋势', option: hoursOkRateOption.value }`；其余四张单图（问题数/加班/饱和度/未填）沿用增强后的 `lineOption`。
类型占比堆叠柱改**百分比堆叠**（逐桶归一到 100%），替换原 `charts` 里那张堆叠柱的 option：
```ts
const typePercentOption = computed(() => {
  const stacks = series.value.typeStack
  const weeks = series.value.weeks
  const totals = weeks.map((_, bi) => stacks.reduce((s, st) => s + (st.data[bi] ?? 0), 0)) // 逐桶总和
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 48, right: 16, top: 24, bottom: 56 },
    xAxis: { type: 'category', data: weeks },
    yAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    series: stacks.map((st) => ({
      name: st.name, type: 'bar', stack: 'total',
      data: st.data.map((v, bi) => (totals[bi] > 0 ? Number(((v / totals[bi]) * 100).toFixed(1)) : 0)),
    })),
  }
})
```
原「工时类型占比趋势」项的 option 换成 `typePercentOption.value`，标题改「工时类型占比趋势（百分比）」。

- [ ] **Step 3: typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: 通过

- [ ] **Step 4: 提交 + 截图目验（附录 A）**

```bash
git add frontend/src/views/YitianTrendView.vue
git commit -m "redesign(yitian): 趋势页 周/月/季切换 + 均值线/峰谷/缩放 + 工时合规率双轴 + 百分比堆叠"
```
目验 `/yitian/trend`：切周/月/季数据正确变化、dataZoom 可拖、双轴对齐、合规率 null 断线（非跌 0）、light/dark、无报错。

---

## Task 12: /yitian/customer 重设计

**Files:**
- Modify: `frontend/src/views/YitianCustomerView.vue`

**Interfaces:**
- Consumes: `top1000ByL4() / top1000TotalsRow() / bgSupport()`（现成）+ `topCustomers()`（Task 7）、`ChartBox`、`DataTable`

**结构（表保留）：**
1. 「TOP1000 大客户支持」加各 L4 **横向堆叠柱**（TOP1000 工时 vs 其余客户类工时 = `hours - topHours`），带占比标签；下方保留原表。
2. 「跨 BG 支持」保留环形饼，补一张本/跨 BG × L4 分组柱（可选，若数据到位）。
3. 新增「TOP 客户排行」横向柱（`topCustomers(data, view.start, view.end, view.l4s, 10)`）。

- [ ] **Step 1: 两个 option builder**

```ts
// TOP1000 vs 其余:各 L4 横向堆叠柱
function top1000StackOption(rows: { l4: string; hours: number; topHours: number }[]) {
  const rs = [...rows].sort((a, b) => a.hours - b.hours)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0 },
    grid: { left: 8, right: 24, top: 8, bottom: 40, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rs.map((r) => r.l4) },
    series: [
      { name: 'TOP1000', type: 'bar', stack: 'x', data: rs.map((r) => Number(r.topHours.toFixed(1))) },
      { name: '其余客户', type: 'bar', stack: 'x', data: rs.map((r) => Number((r.hours - r.topHours).toFixed(1))) },
    ],
  }
}

// TOP 客户排行:横向柱
function topCustOption(list: { name: string; hours: number }[]) {
  const rs = [...list].sort((a, b) => a.hours - b.hours)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v}h` },
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rs.map((r) => r.name) },
    series: [{ type: 'bar', data: rs.map((r) => Number(r.hours.toFixed(1))) }],
  }
}
```

- [ ] **Step 2: 视图接入**（图 + 保留原表/饼）

- [ ] **Step 3: typecheck + build**

Run: `cd frontend && npm run typecheck && npm run build`
Expected: 通过

- [ ] **Step 4: 提交 + 截图目验（附录 A）**

```bash
git add frontend/src/views/YitianCustomerView.vue
git commit -m "redesign(yitian): 客户页 TOP1000堆叠柱 + TOP客户排行 + 跨BG分组柱"
```
目验 `/yitian/customer`：堆叠柱占比对、TOP 客户排行正确、饼保留、light/dark、无报错。

---

## Task 13: /data 信息架构重排（不加图表）

**Files:**
- Modify: `frontend/src/views/DataView.vue`

**Interfaces:**
- Consumes: 现有全部 composable/api（`useReprocess / usePmisDownload / usePmisSync / useInputFiles / useFileStatus / useDataHistory / manualApi / cookieAgent`）、`DataStatusBar`、`PortalConfigCard`、`YitianScopeCard`、`YitianStoreCard`

**重排要求（功能/API/data-test/SSE/权限一个不动，只重组版面）：**
从「流程轴」（获取→更新→维护 accordion）改为**按功能域拆分的功能卡**：
1. 顶部保留 `DataStatusBar` 状态条；「更新看板」(reprocess 主按钮 + SSE 进度条) 提为显眼主操作区。
2. **PMIS 域卡**：cookie 获取/推送 + 下载(SSE) + PMIS 九表上传 + 文件状态。
3. **项目域文件卡**：input/ 根文件上传 + 文件状态。
4. **倚天工时域卡**：倚天文件上传 + cookie + 合规范围(超管 `YitianScopeCard`) + 累积数据(超管 `YitianStoreCard`)。
5. **项目标签卡**：标签库编辑。
6. **维护与历史卡**：人工导入/回滚 + 数据历史/回滚 + 门户(超管 `PortalConfigCard`) + 清空数据。

**硬约束（重排时逐条核对，不得丢失）：**
- 11 个 `data-test` 钩子全部保留（`files-card` / `manual-import-card` 等，重排前 grep 记下清单，重排后 grep 校验数量与名称一致）。
- 两处 SSE 进度条（reprocess / pmis download）标记 `.dv-progress > .dv-bar > .dv-bar-fill` + `.dv-msg` 结构与绑定不变。
- 超管可见性判定（门户/合规范围/累积数据/清空）不变。
- 上传白名单、所有按钮的 handler 绑定不变。

- [ ] **Step 1: 重排前记录基线**

```bash
cd frontend && grep -o 'data-test="[^"]*"' src/views/DataView.vue | sort > /tmp/dv-datatest-before.txt
cat /tmp/dv-datatest-before.txt
```

- [ ] **Step 2: 重排模板为六大功能卡**（保留全部 script 逻辑与 handler；只动 template 分组与 style；把控件按上面 1–6 归位；次要项可用局部 `el-collapse` 承载）

- [ ] **Step 3: 校验 data-test 零丢失**

```bash
cd frontend && grep -o 'data-test="[^"]*"' src/views/DataView.vue | sort > /tmp/dv-datatest-after.txt
diff /tmp/dv-datatest-before.txt /tmp/dv-datatest-after.txt && echo "data-test 完全一致"
```
Expected: 无差异输出 + "data-test 完全一致"

- [ ] **Step 4: typecheck + build + 既有 DataView 相关测试**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/DataView && npm run build`
Expected: 通过（若无 DataView 专门测试则 vitest 命令跳过、以 typecheck+build 为准）

- [ ] **Step 5: 提交 + 截图目验（附录 A）**

```bash
git add frontend/src/views/DataView.vue
git commit -m "redesign(data): 数据管理页按功能域重排(PMIS/项目域/倚天/标签/维护)"
```
目验 `/data`：六大功能卡分区清晰、更新数据 SSE 进度可见、上传/回滚/清空可用、超管项对普通管理员隐藏、light/dark、无报错。

---

## Task 14: 版本号 + PROGRESS + 收尾验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：`APP_VERSION = 'V3.2.0'`、`RELEASE_DATE = '2026-07-14'`（沿用文件现有常量名，仅改值）。

- [ ] **Step 2: PROGRESS.md 记版本状态**

在版本史顶部追加 V3.2.0 条目：首行冻结（14 表）+ 倚天 5 页重设计 + /data IA 重排；纯前端、升级无需点更新数据；列已知取舍（表内滚动不进滚动记忆）。

- [ ] **Step 3: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V3.2.0 版本号 + PROGRESS 版本状态"
```

---

## 附录 A：截图目验流程（UI 任务收尾统一走）

项目既定设计评审方式（见记忆 design-review-screenshot-harness）：puppeteer-core 驱动系统 Chrome。要点：
- 启动 `python server.py`(:8080) + `cd frontend && npm run dev`(:5173) 或用构建产物；puppeteer-core 启动**必带 `--no-proxy-server`**（本机代理劫持 localhost）。
- admin/wxtnb 登录 → 先 goto `/` 等「数据已同步」自举 store。
- 逐页截图：`/yitian`、`/yitian/compliance`、`/yitian/analytics`、`/yitian/trend`、`/yitian/customer`、`/data`，**light + dark 各一张**；抽查 2–3 张首行冻结表滚动时表头钉死。
- 判据：无 console 报错；新图型（散点/热力/发散条/双轴/dataZoom/堆叠）正确渲染；状态语义色正确；版式不贴边、不溢出横向滚动。
- puppeteer-core 用完卸载，别留进 `frontend/package.json`。

## 附录 B：执行顺序与依赖

- Task 1→2→3→4 首行冻结链（2 依赖 1；3、4 依赖 2/1）。可先整块完成、独立低风险。
- Task 5（注册）在任何用新图型的页（9/10/11）之前。
- Task 6 在 Task 11 之前；Task 7 在 Task 12 之前。
- Task 8–13 六页彼此独立，任意顺序；各自结束截图目验。
- Task 14 最后。
