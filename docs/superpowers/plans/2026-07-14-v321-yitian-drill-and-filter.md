# V3.2.1 实施计划：倚天明细表分页/全列筛选 + 五页图表下钻

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 两张倚天明细表加分页+固定高度+全列筛选；五页图表/卡片/表格加下钻，点击即落到对应明细表并预设对应列筛选。

**Architecture:** 复用 `/projects` 的筛选+分页范式（`crossFilter` store 按 tableId 隔离 + `ColumnFilter` header slot + `applyColumnFilters` + `el-pagination`）。两张明细表各起唯一 tableId。「问题」列按类型多选＝给 `crossFilter.ts` 加一个通用「数组列成员匹配」分支（与既有 `riskReasons` 先例同位）。下钻：同页直接 `setColumnFilter`；跨页 `router.push` 带 4 个 query 参数（`dL4/dStart/dEnd/dScroll`），目标页读后清 query。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus + ECharts + vitest。纯前端，无新增依赖。

## Global Constraints

- **功能与数据口径零改动**：不改 API、`lib/yitian/*` 计算返回口径、`yitianView` 语义；只加展示层分页/筛选/下钻。
- **复用既有基建不另造**：`components/ColumnFilter.vue` / `stores/crossFilter.ts` / `lib/crossFilter.ts`。
- **不破坏 crossFilter 既有 9 页用法**：只做通用（非倚天专属）最小扩展。
- **只引设计令牌不手写散值**；不引入第 16 个色号；light/dark 双主题；图表显式设色沿用 V3.2.0 的 `pal`（本期不动配色）。
- **单值替换式下钻**：设列筛选前先 `clearAll(目标tableId)`，只见下钻切片。
- 纯函数先测后写；视图交互靠 typecheck+build+点击目验。
- **版本 V3.2.1**（Z 级，基线 V3.2.0）。升级仅换 dist。

---

## 文件结构（改动地图）

**新建：**
- `frontend/src/lib/yitian/drill.ts`（+`drill.test.ts`）—— 下钻 query 编解码纯函数。

**修改（基建，先测后写）：**
- `frontend/src/lib/crossFilter.ts`（+`crossFilter.test.ts` 追加）—— 通用数组列分支。
- `frontend/src/components/DataTable.vue`（+`DataTable.test.ts` 追加）—— `maxHeightPx` prop。
- `frontend/src/components/HealthSegmentBar.vue` —— 加向后兼容的 `seg-click` emit（Task 5 用）。

**修改（五个倚天视图）：**
- `YitianComplianceView.vue`（分页+全列筛选+issueTypes+同页下钻+落地读 query）
- `YitianAnalyticsView.vue`（分页+全列筛选+同页下钻+滚动锚点+落地读 query）
- `YitianOverviewView.vue` / `YitianTrendView.vue` / `YitianCustomerView.vue`（跨页下钻）

**修改（收尾）：** `frontend/src/version.ts` / `PROGRESS.md`。

---

## Task 1: `crossFilter.ts` 通用数组列分支

**Files:**
- Modify: `frontend/src/lib/crossFilter.ts`
- Test: `frontend/src/lib/crossFilter.test.ts`（追加；若不存在则新建）

**Interfaces:**
- Produces: `cfUniqueValues`/`applyColumnFilters` 支持「值为数组」的列（元素级去重 + 成员匹配），供倚天「问题类型」列（`string[]`）筛选。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/crossFilter.test.ts —— 追加(若新建则补 import)
import { describe, it, expect } from 'vitest'
import { cfUniqueValues, applyColumnFilters } from './crossFilter'

describe('通用数组列筛选', () => {
  const rows = [{ code: ['A', 'B'] }, { code: ['A'] }, { code: [] }, { code: ['C'] }]
  it('cfUniqueValues 摊平去重升序', () => {
    expect(cfUniqueValues(rows, 'code').map((u) => u.display)).toEqual(['A', 'B', 'C'])
  })
  it('applyColumnFilters 元素成员匹配', () => {
    expect(applyColumnFilters(rows, { code: { value: ['A'] } })).toEqual([{ code: ['A', 'B'] }, { code: ['A'] }])
  })
  it('多选取并集', () => {
    expect(applyColumnFilters(rows, { code: { value: ['B', 'C'] } })).toEqual([{ code: ['A', 'B'] }, { code: ['C'] }])
  })
  it('不误伤标量列', () => {
    const s = [{ x: '1' }, { x: '2' }]
    expect(applyColumnFilters(s, { x: { value: ['1'] } })).toEqual([{ x: '1' }])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/crossFilter.test.ts`
Expected: FAIL（数组列走 String 化路径，去重/匹配结果不符）

- [ ] **Step 3: 实现**（改 `crossFilter.ts`）

`cfUniqueValues` 里，在 `riskReasons` 特例 `if` 之后、`uvMap` 逻辑之前，加：
```ts
  // 通用数组列(如倚天「问题类型」string[]):元素级去重。放在 riskReasons 特例后;
  // 主域可筛列无数组类型(数组列本被 FILTERABLE 排除),故此分支只对新引入的数组列生效,零回归。
  if (rows.some((r) => Array.isArray(r[colKey]))) {
    const set = new Set<string>()
    for (const r of rows) {
      const v = r[colKey]
      if (Array.isArray(v)) for (const item of v) set.add(String(item))
    }
    return [...set].sort().map((display) => ({ display, raw: display }))
  }
```
`applyColumnFilters` 里，在 `riskReasons` 分支之后、`const cv = row[ck]` 标量逻辑之前，加：
```ts
      const cv0 = row[ck]
      if (Array.isArray(cv0)) {
        const strs = cv0.map((x) => String(x))
        if (!sel.some((s) => strs.includes(s))) return false
        continue
      }
```
（注意：`applyColumnFilters` 现有 `const cv = row[ck]` 那行保留在标量分支；新分支用 `cv0` 避免重复声明，或把标量分支的 `row[ck]` 复用——实现时二选一，保证 `riskReasons` 与标量两条既有分支行为不变。）

- [ ] **Step 4: 跑测试确认通过（含既有 crossFilter 用例全绿）**

Run: `cd frontend && npx vitest run src/lib/crossFilter.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/crossFilter.ts frontend/src/lib/crossFilter.test.ts
git commit -m "feat(crossFilter): 通用数组列成员匹配分支(供倚天问题类型列筛选)"
```

---

## Task 2: `DataTable.vue` 加 `maxHeightPx`

**Files:**
- Modify: `frontend/src/components/DataTable.vue`
- Test: `frontend/src/components/DataTable.test.ts`（追加）

**Interfaces:**
- Consumes: 现有 `stickyHeader` + `useTableMaxHeight`（V3.2.0）
- Produces: 新增 prop `maxHeightPx?: number`；`stickyHeader && maxHeightPx` 时用该固定值（跳过动态测量），否则维持现有动态行为。不传时零回归。

- [ ] **Step 1: 写失败测试**（追加）

```ts
// DataTable.test.ts 追加(沿用文件已有 mount/ElementPlus/ElTable import)
describe('DataTable maxHeightPx', () => {
  const COLS = [{ key: 'a', label: 'A' }]
  const ROWS = [{ a: 1 }]
  it('stickyHeader + maxHeightPx 用固定值', async () => {
    const w = mount(DataTable, { props: { columns: COLS, rows: ROWS, stickyHeader: true, maxHeightPx: 560 }, global: { plugins: [ElementPlus] } })
    await w.vm.$nextTick()
    expect(w.findComponent({ name: 'ElTable' }).props('maxHeight')).toBe(560)
  })
  it('无 stickyHeader 时 maxHeightPx 不生效(零回归)', () => {
    const w = mount(DataTable, { props: { columns: COLS, rows: ROWS, maxHeightPx: 560 }, global: { plugins: [ElementPlus] } })
    expect(w.findComponent({ name: 'ElTable' }).props('maxHeight')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: FAIL（maxHeightPx 未定义 → 第一用例得到动态值而非 560）

- [ ] **Step 3: 实现**（改 `DataTable.vue`）

`defineProps` 泛型追加：
```ts
    /** 首行冻结时的固定 max-height(px);设了就用它、跳过动态测量。仅在 stickyHeader 为真时生效。 */
    maxHeightPx?: number
```
`tableMaxHeight` computed 改为：
```ts
const tableMaxHeight = computed(() => {
  if (!props.stickyHeader) return undefined
  return props.maxHeightPx ?? maxHeight.value
})
```

- [ ] **Step 4: 跑测试确认通过（含既有 DataTable 用例）**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/DataTable.vue frontend/src/components/DataTable.test.ts
git commit -m "feat(table): DataTable 加 maxHeightPx 固定高度覆盖(明细表用)"
```

---

## Task 3: `lib/yitian/drill.ts` 跨页下钻 query 编解码

**Files:**
- Create: `frontend/src/lib/yitian/drill.ts`
- Test: `frontend/src/lib/yitian/drill.test.ts`

**Interfaces:**
- Produces:
  - `interface DrillQuery { l4?: string; start?: string; end?: string; scroll?: 'neverfilled' | 'diverging' }`
  - `buildDrillQuery(d: DrillQuery): Record<string, string>`（源页编码；空字段不输出）
  - `parseDrillQuery(q: Record<string, any>): DrillQuery`（目标页解码；非法 scroll 忽略；数组 query 取首项）

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/yitian/drill.test.ts
import { describe, it, expect } from 'vitest'
import { buildDrillQuery, parseDrillQuery } from './drill'

describe('drill query 编解码', () => {
  it('build 只输出非空字段', () => {
    expect(buildDrillQuery({ l4: '银行组' })).toEqual({ dL4: '银行组' })
    expect(buildDrillQuery({ start: '2026-01-01', end: '2026-01-31' })).toEqual({ dStart: '2026-01-01', dEnd: '2026-01-31' })
    expect(buildDrillQuery({ scroll: 'neverfilled' })).toEqual({ dScroll: 'neverfilled' })
    expect(buildDrillQuery({})).toEqual({})
  })
  it('parse 往返一致', () => {
    const d = { l4: '银行组', start: '2026-01-01', end: '2026-01-31' }
    expect(parseDrillQuery(buildDrillQuery(d))).toEqual(d)
  })
  it('parse 忽略非法 scroll', () => {
    expect(parseDrillQuery({ dScroll: 'bogus' })).toEqual({})
    expect(parseDrillQuery({ dScroll: 'diverging' })).toEqual({ scroll: 'diverging' })
  })
  it('parse 数组 query 取首项、空对象得空', () => {
    expect(parseDrillQuery({ dL4: ['银行组', 'x'] })).toEqual({ l4: '银行组' })
    expect(parseDrillQuery({})).toEqual({})
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/yitian/drill.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// frontend/src/lib/yitian/drill.ts
export interface DrillQuery {
  l4?: string
  start?: string
  end?: string
  scroll?: 'neverfilled' | 'diverging'
}

const SCROLL_OK = new Set(['neverfilled', 'diverging'])

/** 源页编码：空字段不输出。 */
export function buildDrillQuery(d: DrillQuery): Record<string, string> {
  const q: Record<string, string> = {}
  if (d.l4) q.dL4 = d.l4
  if (d.start) q.dStart = d.start
  if (d.end) q.dEnd = d.end
  if (d.scroll) q.dScroll = d.scroll
  return q
}

function firstStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v) return v
  if (Array.isArray(v)) return firstStr(v[0])
  return undefined
}

/** 目标页解码：非法 scroll 忽略；数组 query 取首项。 */
export function parseDrillQuery(q: Record<string, any>): DrillQuery {
  const out: DrillQuery = {}
  const l4 = firstStr(q.dL4); if (l4) out.l4 = l4
  const start = firstStr(q.dStart); if (start) out.start = start
  const end = firstStr(q.dEnd); if (end) out.end = end
  const scroll = firstStr(q.dScroll); if (scroll && SCROLL_OK.has(scroll)) out.scroll = scroll as DrillQuery['scroll']
  return out
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/yitian/drill.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/yitian/drill.ts frontend/src/lib/yitian/drill.test.ts
git commit -m "feat(yitian): drill query 编解码(跨页下钻)"
```

---

## Task 4: 合规页 —— 分页 + 全列筛选 + 同页下钻 + 落地读 query

**Files:**
- Modify: `frontend/src/views/YitianComplianceView.vue`

**Interfaces:**
- Consumes: `crossFilter` 数组分支（Task 1）、`DataTable.maxHeightPx`（Task 2）、`parseDrillQuery`（Task 3）、现成 `ColumnFilter`/`applyColumnFilters`/`cfUniqueValues`。

**要点**：`tableId='yitian-compliance'`；移除顶部「全部问题类型」`el-select` 与 `codeFilter` ref；「问题」列显示 `issueText`、筛选走 `issueTypes`（`string[]`）；分页复刻 /projects；三处图表加 `@datapoint-click`；`onMounted` 读 drill query 设日期区间。

- [ ] **Step 1: script 改造**

import 增补：
```ts
import { ref, computed, onMounted } from 'vue' // 合并已有
import { useRoute, useRouter } from 'vue-router'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters, cfUniqueValues } from '@/lib/crossFilter'
import ColumnFilter from '@/components/ColumnFilter.vue'
import { parseDrillQuery } from '@/lib/yitian/drill'
```
常量与 store：
```ts
const TABLE_ID = 'yitian-compliance'
const cf = useCrossFilterStore()
const route = useRoute()
const router = useRouter()
```
`allRows` 计算里给每行加 `issueTypes`（问题类型标签数组，供「问题」列按类型筛）——改现有 `rows` computed（注意：现有 `rows` 依赖已删的 `codeFilter`，改为纯派生 + issueTypes）：
```ts
// 全量派生行(含 issueTypes 供列筛选);列筛选交给 applyColumnFilters,不再本地 codeFilter。
const allDetailRows = computed(() =>
  allRows.value.map((r) => ({
    ...r,
    okText: r.ok === 2 ? '问题' : '提示',
    issueText: r.msgs.length ? r.msgs.join('；') : r.codes.map((c) => ISSUE_LABELS[c] ?? c).join('；'),
    issueTypes: r.codes.map((c) => ISSUE_LABELS[c] ?? c),
  })))
const filtered = computed(() => applyColumnFilters(allDetailRows.value, cf.tableFilters(TABLE_ID)))
```
删除 `const codeFilter = ref<string[]>([])`、`codeOptions`、旧 `rows` computed（`codeDist`/`l4Dist`/`heatmap` 仍基于 `allRows`，不动）。`onExport` 的数据源由 `rows.value` 改 `filtered.value`。`defineExpose` 去掉 `codeFilter`/`rows`、加 `filtered`。
FILTERABLE + 分页：
```ts
const FILTERABLE = new Set(['date', 'empName', 'l4', 'type', 'hours', 'customer', 'workOrder', 'okText']) // issueText 单列特殊(见模板);snippet 不筛
const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })
```
同页下钻处理器：
```ts
function drillTable(setters: { col: string; val: string }[]) {
  cf.clearAll(TABLE_ID)
  for (const s of setters) cf.setColumnFilter(TABLE_ID, s.col, [s.val], cfUniqueValues(allDetailRows.value, s.col).length)
}
function onCodeBarClick(p: any) { if (p?.name) drillTable([{ col: 'issueTypes', val: p.name }]) }        // p.name = 问题类型标签
function onL4BarClick(p: any) { if (p?.name) drillTable([{ col: 'l4', val: p.name }]) }
function onHeatmapClick(p: any) {
  const d = p?.data as [number, number, number] | undefined
  if (!d) return
  const l4 = heatmap.value.l4s[d[0]]; const code = heatmap.value.codes[d[1]]?.label
  drillTable([{ col: 'l4', val: l4 }, { col: 'issueTypes', val: code }])
}
```
落地读 query（趋势→本页带日期区间）：
```ts
onMounted(() => {
  const d = parseDrillQuery(route.query)
  if (d.start && d.end) { view.start = d.start; view.end = d.end }
  if (Object.keys(route.query).length) router.replace({ query: {} })
})
```

- [ ] **Step 2: 模板改造**

移除顶部 `el-select`（保留导出按钮）；给「问题分布/按L4/热力图」三个 `<ChartBox>` 加 `@datapoint-click`；「问题明细」表接分页+全列筛选+固定高度。关键片段：
```vue
<ChartBox v-else :option="codeBarChartOption" :height="codeBarHeight" @datapoint-click="onCodeBarClick" />
...
<ChartBox v-else :option="l4BarChartOption" :height="l4BarHeight" @datapoint-click="onL4BarClick" />
...
<ChartBox v-else :option="heatmapChartOption" :height="heatmapHeight" @datapoint-click="onHeatmapClick" />
...
<section class="yt-card">
  <div class="yt-head">
    <h3 class="yt-h">问题明细</h3>
    <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
  </div>
  <DataTable :columns="cols" :rows="paged" sticky-header :max-height-px="560">
    <template v-for="col in cols" :key="col.key" #[`header-${col.key}`]="{ col: c }">
      <span class="yt-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="allDetailRows" /><ColumnFilter v-else-if="c.key === 'issueText'" :table-id="TABLE_ID" col-key="issueTypes" :source-rows="allDetailRows" /></span>
    </template>
  </DataTable>
  <div class="yt-pager">
    <span class="yt-total u-num">共 {{ filtered.length }} 条</span>
    <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :total="filtered.length" layout="prev, pager, next" size="small" background />
  </div>
</section>
```
补 `.yt-th{display:inline-flex;align-items:center;gap:var(--sp-1)}` `.yt-pager{display:flex;justify-content:flex-end;align-items:center;gap:var(--sp-3);margin-top:var(--sp-3)}` `.yt-total{font-size:var(--fs-1);color:var(--sub)}`（引令牌）。

- [ ] **Step 3: 校验**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/YitianComplianceView.test.ts && npm run build`
Expected: 通过（既有 view 测试若因删 codeFilter 报错，据实更新断言对齐新结构，不得空断言）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/YitianComplianceView.vue frontend/src/views/YitianComplianceView.test.ts
git commit -m "feat(yitian): 合规明细分页+全列筛选(问题按类型)+图表下钻+落地读query"
```

---

## Task 5: 分析页 —— 分页 + 全列筛选 + 同页下钻 + 滚动锚点 + 落地读 query

**Files:**
- Modify: `frontend/src/views/YitianAnalyticsView.vue`
- Modify: `frontend/src/components/HealthSegmentBar.vue`（加向后兼容 `seg-click` emit）

**Interfaces:**
- Consumes: Task 1/2/3 产出；现成 `ColumnFilter`/`applyColumnFilters`/`cfUniqueValues`。

- [ ] **Step 1: `HealthSegmentBar.vue` 加 `seg-click`（向后兼容）**

script 加 `const emit = defineEmits<{ 'seg-click': [string] }>()`。模板 legend `<component>`：无 `to` 时渲染为可点（emit key）、有 `to` 时仍 RouterLink（既有用法不变）：
```vue
<component :is="s.to ? 'RouterLink' : 'span'" v-for="s in shown" :key="s.key"
  class="hsb-leg" :class="{ 'hsb-leg--link': s.to || true }" :to="s.to"
  @click="!s.to && emit('seg-click', s.key)">
```
（`hsb-leg--link` 一律给悬停手感；有 `to` 走 RouterLink 不受 emit 影响，其它页零回归。）

- [ ] **Step 2: 分析页 script**

import 增补同 Task 4（`useRoute/useRouter`、`useCrossFilterStore`、`applyColumnFilters/cfUniqueValues`、`ColumnFilter`、`parseDrillQuery`）+ `nextTick`。常量：
```ts
const TABLE_ID = 'yitian-analytics'
const cf = useCrossFilterStore()
const route = useRoute(); const router = useRouter()
const FILTERABLE = new Set(['id', 'name', 'l31', 'l4', 'hoursText', 'baseText', 'satText', 'diffText'])
```
`empRows` 保留（即全量 `allDetailRows`）；分页：
```ts
const filtered = computed(() => applyColumnFilters(empRows.value, cf.tableFilters(TABLE_ID)))
const pageSize = ref(50); const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })
```
员工单点下钻（按工号）+ 结构段滚动 + KPI 落地滚动：
```ts
function scrollTo(id: string) { nextTick(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })) }
function drillEmp(name: string) {
  const emp = stats.value.find((s) => s.name === name)
  if (!emp) return
  cf.clearAll(TABLE_ID)
  cf.setColumnFilter(TABLE_ID, 'id', [emp.id], cfUniqueValues(empRows.value, 'id').length)
  scrollTo('yt-emp')
}
function onEmpChartClick(p: any) { const name = p?.name ?? p?.value?.[2]; if (name) drillEmp(String(name)) } // 柱=name;散点=value[2]
function onSegClick(key: string) { scrollTo(key === 'never' ? 'yt-neverfilled' : key === 'under' ? 'yt-unfilled' : 'yt-emp') }
onMounted(() => {
  const d = parseDrillQuery(route.query)
  if (d.l4) { cf.clearAll(TABLE_ID); cf.setColumnFilter(TABLE_ID, 'l4', [d.l4], cfUniqueValues(empRows.value, 'l4').length) }
  if (d.start && d.end) { view.start = d.start; view.end = d.end }
  if (d.scroll) scrollTo(d.scroll === 'neverfilled' ? 'yt-neverfilled' : 'yt-diverging')
  if (Object.keys(route.query).length) router.replace({ query: {} })
})
```
（注意：`empRows` 已存在，勿重复；`stats` 已存在。`store.load()` 惰性——若首帧 `stats` 空，落地滚动的锚点可能未渲染，`nextTick` + 元素存在判空已容错；日期区间/列筛选设置早于数据到达也无碍，`filtered` 随 `empRows` 到达自动应用。）

- [ ] **Step 3: 分析页模板**

三个员工级图表加 `@datapoint-click="onEmpChartClick"`；`HealthSegmentBar` 加 `@seg-click="onSegClick"`；给相关 `<section>` 加锚点 id：加班/欠填图 `id="yt-diverging"`、未按时填写表 `id="yt-unfilled"`、完全未填表 `id="yt-neverfilled"`、员工明细 `id="yt-emp"`；员工明细表接分页+全列筛选+固定高度（同 Task 4 的 DataTable/header/pager 片段，`tableId`/`FILTERABLE`/`cols=empCols`/`source-rows=empRows` 对应替换；无 issueText 特例）。

- [ ] **Step 4: 校验**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/YitianAnalyticsView.test.ts src/components/HealthSegmentBar.test.ts && npm run build`
Expected: 通过（HealthSegmentBar 既有测试须仍绿——`to` 用法不变；view 测试据实对齐）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/YitianAnalyticsView.vue frontend/src/components/HealthSegmentBar.vue frontend/src/views/YitianAnalyticsView.test.ts
git commit -m "feat(yitian): 员工明细分页+全列筛选+员工单点/结构段下钻+落地读query"
```

---

## Task 6: 总览页 —— 跨页下钻

**Files:**
- Modify: `frontend/src/views/YitianOverviewView.vue`

**Interfaces:**
- Consumes: `buildDrillQuery`（Task 3）；依赖 Task 4/5 的落地读取端已在（跨页 e2e 才通）。

- [ ] **Step 1: script**

```ts
import { useRouter } from 'vue-router'
import { buildDrillQuery } from '@/lib/yitian/drill'
const router = useRouter()
function goAnalytics(q: Record<string, string> = {}) { router.push({ path: '/yitian/analytics', query: q }) }
function onOrgBarClick(p: any) { if (p?.name) goAnalytics(buildDrillQuery({ l4: p.name })) }   // L4 柱
function onOrgRow(row: any) { if (row?.name) goAnalytics(buildDrillQuery({ l4: row.name })) }   // 分层汇总行(orgRows 的 name=L4)
function goCompliance() { router.push('/yitian/compliance') }
```
KPI 卡点击：`MetricGrid` 每项支持 `clickable?: boolean`，点击 emit `item-click` 带**索引 i**。做法：在 `metrics` computed 里给每项加 `clickable: true`；`onKpiClick(i)` 按该项 `k` 分流（**按标签而非索引，稳**）：
```ts
function onKpiClick(i: number) {
  const k = metrics.value[i]?.k ?? ''
  if (k.includes('未填')) goAnalytics(buildDrillQuery({ scroll: 'neverfilled' }))
  else if (k.includes('加班')) goAnalytics(buildDrillQuery({ scroll: 'diverging' }))
  else goAnalytics() // 总工时 / 平均饱和度
}
```
合规率是独立的 `RatioRing`（不在 metrics 里）——外层 `.yt-ring-card` 加 `@click="goCompliance"` + `style="cursor:pointer"`。

- [ ] **Step 2: 模板**

L4 组织工时柱 `<ChartBox @datapoint-click="onOrgBarClick">`；分层汇总 `<DataTable clickable @row-click="onOrgRow">`；KPI 网格 `<MetricGrid :items="metrics" @item-click="onKpiClick" ... />`（metrics 各项已带 `clickable:true`）；RatioRing 外层 `.yt-ring-card` 加 `@click="goCompliance"` + `cursor:pointer`。

- [ ] **Step 3: 校验**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/YitianOverviewView.test.ts && npm run build`
Expected: 通过（view 测试据实对齐）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/YitianOverviewView.vue frontend/src/views/YitianOverviewView.test.ts
git commit -m "feat(yitian): 总览 KPI/L4柱/汇总行跨页下钻"
```

---

## Task 7: 趋势页 —— 跨页下钻（按指标分流 + 日期区间）

**Files:**
- Modify: `frontend/src/views/YitianTrendView.vue`

**Interfaces:**
- Consumes: `buildDrillQuery`（Task 3）；现有 `buckets`（周/月/季）与 `series.weeks`（桶 key 数组）。

- [ ] **Step 1: script**

```ts
import { useRouter } from 'vue-router'
import { buildDrillQuery } from '@/lib/yitian/drill'
const router = useRouter()
// 指标→目标页:问题数/合规率→compliance;工时/饱和度/未填/总工时→analytics(见 onTrendClick 内联判定)
function bucketRangeByKey(key: string): { start: string; end: string } | null {
  const b = bucketsList.value.find((x) => x.key === key)   // bucketsList = 当前粒度的 WeekBucket[](复用 series 计算里的 buckets;需 expose 或重取)
  return b ? { start: b.start, end: b.end } : null
}
function onTrendClick(p: any) {
  const r = bucketRangeByKey(String(p?.name ?? ''))
  if (!r) return
  const toCompliance = p?.seriesName === '问题数' || p?.seriesName === '合规率'
  const q = buildDrillQuery({ start: r.start, end: r.end })
  router.push({ path: toCompliance ? '/yitian/compliance' : '/yitian/analytics', query: q })
}
```
**实现注意**：需要「桶 key → {start,end}」。现有 `series` computed 内部算了 `buckets`（`WeekBucket[]`，含 `key/start/end`），但只暴露了 `weeks=buckets.map(b=>b.key)`。改：把 `buckets` 提为一个独立 computed `bucketsList`（`weekBuckets/monthBuckets/quarterBuckets` 按 `gran` 选，与 series 内同源），`series` 复用它，`onTrendClick` 也用它。`seriesName` 判定按各折线 option 里 `series[0].name` 的**真实值**对齐（问题数/合规率/总工时/加班工时/饱和度/未填人数；双轴图 seriesName 为「总工时」「合规率」）。**总工时归 analytics**（工时明细在 analytics），故 `toCompliance` 仅 `问题数`/`合规率`。

- [ ] **Step 2: 模板**

每张折线/双轴 `<ChartBox @datapoint-click="onTrendClick">`（百分比堆叠柱可不加下钻——按 series.name 无对应明细，`onTrendClick` 里 bucketRangeByKey 命中即可，非时间点则忽略）。

- [ ] **Step 3: 校验**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/YitianTrendView.test.ts && npm run build`
Expected: 通过（view 测试据实对齐；`bucketsList` 提取后 `series` 语义不变，既有断言应仍绿）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/YitianTrendView.vue frontend/src/views/YitianTrendView.test.ts
git commit -m "feat(yitian): 趋势时间点跨页下钻(按指标分流+日期区间)"
```

---

## Task 8: 客户页 —— 跨页下钻

**Files:**
- Modify: `frontend/src/views/YitianCustomerView.vue`

**Interfaces:**
- Consumes: `buildDrillQuery`（Task 3）。TOP1000/跨BG 柱与 TOP1000 表的类目/行 name=L4。

- [ ] **Step 1: script**

```ts
import { useRouter } from 'vue-router'
import { buildDrillQuery } from '@/lib/yitian/drill'
const router = useRouter()
function goAnalyticsL4(l4: string) { router.push({ path: '/yitian/analytics', query: buildDrillQuery({ l4 }) }) }
function onL4BarClick(p: any) { if (p?.name) goAnalyticsL4(p.name) }
function onTop1000Row(row: any) { if (row?.l4) goAnalyticsL4(row.l4) }
```

- [ ] **Step 2: 模板**

TOP1000 堆叠柱、跨BG 分组柱 `<ChartBox @datapoint-click="onL4BarClick">`；TOP1000 表 `<DataTable clickable @row-click="onTop1000Row">`。（TOP 客户排行柱、跨BG 饼**不加**——无 L4 目标，见 spec 4.4。）

- [ ] **Step 3: 校验**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/YitianCustomerView.test.ts && npm run build`
Expected: 通过。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/views/YitianCustomerView.vue frontend/src/views/YitianCustomerView.test.ts
git commit -m "feat(yitian): 客户 L4 柱/行跨页下钻"
```

---

## Task 9: 版本号 + PROGRESS + 收尾验证

**Files:**
- Modify: `frontend/src/version.ts` / `PROGRESS.md`

- [ ] **Step 1: 版本号** `APP_VERSION='V3.2.1'`、`RELEASE_DATE='2026-07-14'`。
- [ ] **Step 2: PROGRESS.md** 顶部加 V3.2.1 条目（两明细表分页+全列筛选、五页下钻；纯前端；已知取舍：时间桶下钻改共享日期区间会影响其它页）。
- [ ] **Step 3: 全量验证** `bash verify.sh` 全绿。
- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V3.2.1 版本号 + PROGRESS"
```

---

## 附录 A：点击目验（UI 收尾统一走）

puppeteer-core 驱动系统 Chrome（`--no-proxy-server`）、admin/wxtnb 登录、先 goto `/` 等数据同步。逐条走 spec §4.3 映射：
- 两明细表：列头筛选可用、分页可翻、约 15 行可见（不再 3 行）、清除所有筛选可用。
- 同页下钻：合规点问题码柱/L4柱/热力图格 → 明细表对应收窄；分析点员工图 → 明细筛到该人 + 滚到明细。
- 跨页下钻：总览 KPI/L4柱/汇总行 → analytics 且 L4/滚动到位；总览合规率环 → compliance；趋势点 → 对应页且日期区间变；客户 L4 → analytics 且 L4 筛选。
- 目标页读完 query 后地址栏 query 已清；light/dark；无 console 报错。

## 附录 B：执行顺序与并行（可用 subagent 并行独立任务）

- **Phase A（基建，3 文件互不相交，可并行）**：Task 1（crossFilter）、Task 2（DataTable）、Task 3（drill.ts）。
- **Phase B（明细表，2 视图互不相交，可并行；均依赖 A）**：Task 4（合规）、Task 5（分析）。
- **Phase C（源页，3 视图互不相交，可并行；依赖 A 的 buildDrillQuery + B 的落地读取端）**：Task 6（总览）、Task 7（趋势）、Task 8（客户）。
- **Phase D**：Task 9（收尾，串行最后）。
- 并行子代理须**各改各的文件、各跑各自 targeted vitest、不各自 commit**（由控制者串行审查后提交，避免 git 索引锁竞争）；或每阶段内串行提交。
