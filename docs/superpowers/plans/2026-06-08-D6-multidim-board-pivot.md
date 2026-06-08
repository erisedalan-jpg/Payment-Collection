# D6 多维看板·N 维透视表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 多维看板第三层：自选「行维度(多, 有序)」「列维度(多, 有序)」「指标」的透视表，格=该指标、点格下钻该交叉组项目 → D2 详情。作为 BoardView 第三模式「透视」（与"排名/交叉"并列）。

**Architecture:** 复用已就绪的 `groupByDims`（N 维）。`lib/pivot` 新增 `pivotTable(nodes, rowDims[], colDims[], metricKey)`：对 `[...rowDims,...colDims]` 分组后按行元组/列元组透视成 `rows/cols/cells + index`（D5 `crossMatrix` 的多行多列泛化）。新增 `DimPicker`（有序多选 chips）与 `PivotTable`（渲染表 + 格点击）。`BoardView` 引入显式 `mode`（single/cross/pivot）三模式选择器，按模式渲染对应控件与主体;透视格点击复用 `openDrill`→`BoardDrilldownModal`→D2 详情。计算口径忠实复用 groupByDims/groupByProject，不改算法。

**Tech Stack:** Vue3 `<script setup lang="ts">` + Pinia + vue-echarts + Vitest。

---

## 背景与范围

Phase D spec §4.3：「N 维透视表：自选行/列/指标的透视表」。用户选定形态=**自选行×列 + 单指标（真透视）**，放入 BoardView 第三模式。

**已就绪依赖：**
- `lib/pivot.ts`：`DIMENSIONS`/`DIM_BY_KEY`、`groupByDims(nodes, dimKeys[]) → PivotGroup[]`（`PivotGroup.values` 为各维取值数组、含指标 + `projects`）、`METRICS`/`METRIC_BY_KEY`、`crossMatrix`（D5）。
- `views/BoardView.vue`（D4 单维 + D5 双维交叉）：当前 single/cross 由 `secondDim` 是否为空隐式区分;含 `groups/top/chartOption`(单维)、`matrix/metricKind/metricFormat/crossChartOption/onCellClick`(交叉)、`drillOpen/drillGroup/openDrill`、`defineExpose({drillOpen})`。
- `components/SegToggle.vue`（单选）、`BoardMatrix.vue`（D5 矩阵）、`BoardDrilldownModal.vue`（组内项目→D2 详情）。
- `lib/format`：`fmtWan/pct`。D2.5 `v-activate` 指令（绑定 false 跳过）。
- 测试范式：`setActivePinia(createPinia())` + `useDataStore().data` 种子;BoardView 测试 `vi.mock('vue-router')` + stub `BoardDrilldownModal`。

**本计划新建/改：**
- 改 `lib/pivot.ts`：加 `PivotResult`/`pivotTable`（+ 测试追加）。
- 新建 `components/DimPicker.vue`（+ 测试）、`components/PivotTable.vue`（+ 测试）。
- 改(重写) `views/BoardView.vue`：三模式 + 透视控件/主体（+ 测试重写，覆盖 single/cross/pivot）。

**模式重构说明（重要）：** 当前 cross 由 `secondDim!==''` 隐式触发。D6 改为**显式 `mode`**（排名/交叉/透视）。因此 D5 的两个 cross 测试需更新为"先切到交叉模式再选次维度"。single/cross 的计算与渲染逻辑本身不变，仅改由 `mode` 门控。

**YAGNI 边界：** 透视为表格（不出 N×N 图，避免不可读）;列维度为多选但表头用"组合标签"（`a / b`）非合并多层表头;无小计/总计行（保持简单，后续可加）。

## 约定（CLAUDE.md）

- 简体中文;**无 emoji**。CSS 用主题 token;ECharts 配置层颜色用 hex（与既有一致）。尺寸优先 `var(--fs-*)`。
- 下钻入口非语义可点击元素用 `v-activate`。
- 计算口径忠实复用 groupByDims/groupByProject，不改算法;新增纯函数有 Vitest。
- 提交信息结尾：
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: lib/pivot — pivotTable 多行多列透视

**Files:**
- Modify: `frontend/src/lib/pivot.ts`（追加 `PivotResult`/`PivotRow`/`PivotCol`/`pivotTable`）
- Test: `frontend/src/lib/pivot.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试**

在 `frontend/src/lib/pivot.test.ts` 末尾追加（`pivotTable` 加入顶部 import，或本段新增 import 行）：

```ts
import { pivotTable } from './pivot'

describe('pivotTable 多行多列透视', () => {
  const X: any[] = [
    { projectId: 'A', orgL4: '北京', projectManager: '张三', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 1000000, actualPayment: 600000 },
    { projectId: 'B', orgL4: '北京', projectManager: '李四', tier: '50万以下', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 200000, actualPayment: 100000 },
    { projectId: 'C', orgL4: '上海', projectManager: '王五', tier: '50万以下', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 400000, actualPayment: 300000 },
  ]

  it('行=orgL4×projectManager、列=tier、指标=已回款', () => {
    const p = pivotTable(X, ['orgL4', 'projectManager'], ['tier'], 'actualAmount')
    expect(p.rowDimLabels).toEqual(['服务组(L4)', '项目经理'])
    expect(p.colDimLabels).toEqual(['金额档位'])
    // 行元组（两列）
    expect(p.rows.map((r) => r.tuple)).toEqual([
      ['北京', '张三'],
      ['上海', '王五'],
      ['北京', '李四'],
    ]) // 按行合计已回款降序：张三600 > 王五300 > 李四100
    // 列：100万以上(600) > 50万以下(400)
    expect(p.cols.map((c) => c.label)).toEqual(['100万以上', '50万以下'])
    // 张三×100万以上 = 600000；张三×50万以下 = 0
    expect(p.cells[0]).toEqual([600000, 0])
    expect(p.index['北京 / 张三']['100万以上'].projects.length).toBe(1)
  })

  it('无列维度时列为单列「合计」', () => {
    const p = pivotTable(X, ['orgL4'], [], 'actualAmount')
    expect(p.cols.map((c) => c.label)).toEqual(['合计'])
    expect(p.rows.map((r) => r.tuple)).toEqual([['北京'], ['上海']]) // 北京700 > 上海300
    expect(p.cells).toEqual([[700000], [300000]])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/pivot.test.ts`
Expected: FAIL（`pivotTable` 不存在）。

- [ ] **Step 3: 实现**

在 `frontend/src/lib/pivot.ts` 末尾追加：

```ts
export interface PivotRow {
  tuple: string[]
  key: string
}
export interface PivotCol {
  label: string
  key: string
}
export interface PivotResult {
  rowDimLabels: string[]
  colDimLabels: string[]
  rows: PivotRow[]
  cols: PivotCol[]
  cells: number[][]
  index: Record<string, Record<string, PivotGroup>>
}

/** 多行多列透视：行=rowDims 组合、列=colDims 组合、格=metric;按行/列指标合计降序。
 *  colDims 为空时列退化为单列「合计」。index 保留每格 PivotGroup 供下钻。 */
export function pivotTable(
  nodes: RawNode[],
  rowDims: string[],
  colDims: string[],
  metricKey: MetricDef['key'],
): PivotResult {
  const rn = rowDims.length
  const full = groupByDims(nodes, [...rowDims, ...colDims])
  const index: Record<string, Record<string, PivotGroup>> = {}
  const rowMap = new Map<string, string[]>()
  const colMap = new Map<string, string[]>()
  const rowTot: Record<string, number> = {}
  const colTot: Record<string, number> = {}
  for (const g of full) {
    const rowVals = g.values.slice(0, rn)
    const colVals = g.values.slice(rn)
    const rk = rowVals.join(' / ')
    const ck = colVals.join(' / ')
    rowMap.set(rk, rowVals)
    colMap.set(ck, colVals)
    ;(index[rk] ||= {})[ck] = g
    const v = g[metricKey] as number
    rowTot[rk] = (rowTot[rk] || 0) + v
    colTot[ck] = (colTot[ck] || 0) + v
  }
  const rowKeys = [...rowMap.keys()].sort((a, b) => rowTot[b] - rowTot[a])
  const colKeys = [...colMap.keys()].sort((a, b) => colTot[b] - colTot[a])
  const rows: PivotRow[] = rowKeys.map((k) => ({ key: k, tuple: rowMap.get(k)! }))
  const cols: PivotCol[] = colKeys.map((k) => ({ key: k, label: colDims.length ? k : '合计' }))
  const cells = rows.map((r) => cols.map((c) => (index[r.key]?.[c.key]?.[metricKey] as number) ?? 0))
  return {
    rowDimLabels: rowDims.map((d) => DIM_BY_KEY[d]?.label ?? d),
    colDimLabels: colDims.map((d) => DIM_BY_KEY[d]?.label ?? d),
    rows,
    cols,
    cells,
    index,
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/pivot.test.ts`
Expected: PASS（含 D4/D5 原有用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/pivot.ts frontend/src/lib/pivot.test.ts
git commit -m "feat(D6): lib/pivot pivotTable 多行多列透视

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DimPicker — 有序多选维度

**Files:**
- Create: `frontend/src/components/DimPicker.vue`
- Test: `frontend/src/components/DimPicker.test.ts`

chips 多选：点未选→追加到末尾，点已选→移除;选中显序号（即透视的维度顺序）。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/DimPicker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DimPicker from './DimPicker.vue'

const OPTS = [
  { value: 'orgL4', label: '服务组' },
  { value: 'tier', label: '档位' },
]

describe('DimPicker', () => {
  it('点未选项追加到末尾', async () => {
    const w = mount(DimPicker, { props: { modelValue: ['orgL4'], options: OPTS } })
    await w.get('[data-test="dim-tier"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]?.[0]).toEqual(['orgL4', 'tier'])
  })

  it('点已选项移除', async () => {
    const w = mount(DimPicker, { props: { modelValue: ['orgL4', 'tier'], options: OPTS } })
    await w.get('[data-test="dim-orgL4"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]?.[0]).toEqual(['tier'])
  })

  it('选中项显示序号且高亮', () => {
    const w = mount(DimPicker, { props: { modelValue: ['tier', 'orgL4'], options: OPTS } })
    expect(w.get('[data-test="dim-tier"]').classes()).toContain('on')
    expect(w.get('[data-test="dim-tier"]').text()).toContain('1')
    expect(w.get('[data-test="dim-orgL4"]').text()).toContain('2')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/DimPicker.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/DimPicker.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{ modelValue: string[]; options: { value: string; label: string }[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

function toggle(v: string) {
  const cur = props.modelValue
  const i = cur.indexOf(v)
  emit('update:modelValue', i >= 0 ? cur.filter((x) => x !== v) : [...cur, v])
}
function order(v: string): number {
  return props.modelValue.indexOf(v) + 1
}
</script>

<template>
  <div class="dp">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      class="dp-chip"
      :class="{ on: modelValue.includes(o.value) }"
      :data-test="`dim-${o.value}`"
      @click="toggle(o.value)"
    >
      <span v-if="order(o.value)" class="dp-ord">{{ order(o.value) }}</span>{{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.dp { display: inline-flex; flex-wrap: wrap; gap: 6px; }
.dp-chip { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--line); background: var(--card); color: var(--sub); cursor: pointer; font-size: var(--fs-1); padding: 4px 10px; border-radius: 8px; }
.dp-chip.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 600; }
.dp-ord { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: 10px; font-weight: 700; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/DimPicker.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DimPicker.vue frontend/src/components/DimPicker.test.ts
git commit -m "feat(D6): DimPicker 有序多选维度

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: PivotTable — 透视表渲染

**Files:**
- Create: `frontend/src/components/PivotTable.vue`
- Test: `frontend/src/components/PivotTable.test.ts`

行元组多列 + 列组合表头 + 数值格;有数据格 `v-activate` 可点 emit `cell-click{rowKey,colKey}`。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/PivotTable.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PivotTable from './PivotTable.vue'
import type { PivotResult } from '@/lib/pivot'

const P: PivotResult = {
  rowDimLabels: ['服务组', '经理'],
  colDimLabels: ['档位'],
  rows: [
    { tuple: ['北京', '张三'], key: '北京 / 张三' },
    { tuple: ['上海', '王五'], key: '上海 / 王五' },
  ],
  cols: [
    { label: '100万以上', key: '100万以上' },
    { label: '50万以下', key: '50万以下' },
  ],
  cells: [[600000, 0], [0, 300000]],
  index: {
    '北京 / 张三': { '100万以上': { projects: [{}] } as any },
    '上海 / 王五': { '50万以下': { projects: [{}] } as any },
  },
}

describe('PivotTable', () => {
  it('渲染行维度列、列表头与格', () => {
    const w = mount(PivotTable, { props: { pivot: P, format: (v: number) => String(v) } })
    expect(w.text()).toContain('服务组')
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('600000')
  })

  it('点有数据格 emit cell-click，空格不可点', async () => {
    const w = mount(PivotTable, { props: { pivot: P, format: (v: number) => String(v) } })
    const clickable = w.findAll('.pv-cell.pv-click')
    expect(clickable.length).toBe(2) // 张三×100万以上、王五×50万以下
    await clickable[0].trigger('click')
    expect(w.emitted('cell-click')?.[0]?.[0]).toEqual({ rowKey: '北京 / 张三', colKey: '100万以上' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/PivotTable.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/PivotTable.vue`:

```vue
<script setup lang="ts">
import type { PivotResult } from '@/lib/pivot'

const props = defineProps<{
  pivot: PivotResult
  format: (v: number) => string
}>()
const emit = defineEmits<{ 'cell-click': [{ rowKey: string; colKey: string }] }>()

function has(rowKey: string, colKey: string): boolean {
  return !!props.pivot.index[rowKey]?.[colKey]
}
</script>

<template>
  <div class="pv-wrap">
    <table class="pv">
      <thead>
        <tr>
          <th v-for="(rl, i) in pivot.rowDimLabels" :key="'rl' + i" class="pv-rowdim">{{ rl }}</th>
          <th v-for="c in pivot.cols" :key="c.key" class="pv-colhead" :title="c.label">{{ c.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, ri) in pivot.rows" :key="r.key">
          <th v-for="(tv, ti) in r.tuple" :key="ti" class="pv-rowval" :title="tv">{{ tv }}</th>
          <td
            v-for="(c, ci) in pivot.cols"
            :key="c.key"
            class="pv-cell"
            :class="{ 'pv-click': has(r.key, c.key), 'pv-zero': !has(r.key, c.key) }"
            v-activate="has(r.key, c.key)"
            @click="has(r.key, c.key) && emit('cell-click', { rowKey: r.key, colKey: c.key })"
          >
            {{ format(pivot.cells[ri][ci]) }}
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!pivot.rows.length" class="pv-empty">暂无数据</div>
  </div>
</template>

<style scoped>
.pv-wrap { overflow-x: auto; }
.pv { border-collapse: collapse; font-size: var(--fs-2); width: 100%; }
.pv th, .pv td { border: 1px solid var(--line); padding: 6px 10px; white-space: nowrap; }
.pv-rowdim { background: var(--card2); color: var(--mut); text-align: left; font-weight: 600; }
.pv-colhead { background: var(--card2); color: var(--sub); font-weight: 600; text-align: right; }
.pv-rowval { background: var(--card2); color: var(--txt); text-align: left; font-weight: 600; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.pv-cell { text-align: right; color: var(--txt); }
.pv-click { cursor: pointer; }
.pv-click:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.pv-zero { color: var(--mut); }
.pv-empty { color: var(--mut); padding: 16px; text-align: center; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/PivotTable.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/PivotTable.vue frontend/src/components/PivotTable.test.ts
git commit -m "feat(D6): PivotTable 透视表渲染（数据格键盘可点 + cell-click）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: BoardView — 三模式（排名/交叉/透视）

**Files:**
- Modify(重写): `frontend/src/views/BoardView.vue`
- Modify(重写): `frontend/src/views/BoardView.test.ts`

引入显式 `mode`（single/cross/pivot），按模式渲染。single/cross 逻辑沿用 D4/D5，仅改由 mode 门控;新增 pivot 模式（DimPicker 行/列 + 指标 + PivotTable + 格下钻）。

- [ ] **Step 1: 整体替换 BoardView.vue**

把 `frontend/src/views/BoardView.vue` 整体替换为：

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { DIMENSIONS, groupByDims, crossMatrix, pivotTable, METRICS, METRIC_BY_KEY, type PivotGroup } from '@/lib/pivot'
import { fmtWan, pct } from '@/lib/format'
import ChartBox from '@/charts/ChartBox.vue'
import SegToggle from '@/components/SegToggle.vue'
import DimPicker from '@/components/DimPicker.vue'
import BoardMatrix from '@/components/BoardMatrix.vue'
import PivotTable from '@/components/PivotTable.vue'
import BoardDrilldownModal from '@/components/BoardDrilldownModal.vue'

const route = useRoute()
const data = useDataStore()
const filter = useFilterStore()

const DIM_OPTS = DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))
const METRIC_OPTS = METRICS.map((m) => ({ value: m.key, label: m.label }))
const MODE_OPTS = [
  { value: 'single', label: '排名' },
  { value: 'cross', label: '交叉' },
  { value: 'pivot', label: '透视' },
]
const SORT_OPTS = [
  { value: 'actualAmount', label: '已回款' },
  { value: 'completionRate', label: '完成率' },
  { value: 'projectCount', label: '项目数' },
  { value: 'delayedCount', label: '延期数' },
]

const initDim =
  typeof route.query.dim === 'string' && DIMENSIONS.some((d) => d.key === route.query.dim)
    ? (route.query.dim as string)
    : 'orgL4'

const mode = ref('single')
const dimKey = ref(initDim)
const sortKey = ref('actualAmount')
const secondDim = ref('')
const metricKey = ref<(typeof METRICS)[number]['key']>('actualAmount')
const rowDims = ref<string[]>([initDim])
const colDims = ref<string[]>([])

const SECOND_OPTS = computed(() => [
  { value: '', label: '无' },
  ...DIMENSIONS.filter((d) => d.key !== dimKey.value).map((d) => ({ value: d.key, label: d.label })),
])

watch(dimKey, () => {
  if (secondDim.value === dimKey.value) secondDim.value = ''
})

// ---- 单维 ----
const groups = computed<PivotGroup[]>(() => {
  const gs = groupByDims(filter.filteredNodes, [dimKey.value])
  const k = sortKey.value as keyof PivotGroup
  return [...gs].sort((a, b) => (b[k] as number) - (a[k] as number))
})
const top = computed(() => groups.value.slice(0, 15))
const chartOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['已回款', '待回款'], top: 0 },
  grid: { left: 60, right: 20, top: 30, bottom: 60 },
  xAxis: { type: 'category', data: top.value.map((g) => g.key), axisLabel: { interval: 0, rotate: 30 } },
  yAxis: { type: 'value', name: '金额(万)' },
  series: [
    { name: '已回款', type: 'bar', stack: 'a', data: top.value.map((g) => +(g.actualAmount / 10000).toFixed(2)), itemStyle: { color: '#10B981' } },
    { name: '待回款', type: 'bar', stack: 'a', data: top.value.map((g) => +(g.remainingAmount / 10000).toFixed(2)), itemStyle: { color: '#F59E0B' } },
  ],
}))

// ---- 共用指标格式 ----
const metricKind = computed(() => METRIC_BY_KEY[metricKey.value].kind)
const metricFormat = computed(() => {
  const kind = metricKind.value
  return (v: number) => (kind === 'money' ? fmtWan(v) : kind === 'rate' ? pct(v) : String(v))
})

// ---- 交叉 ----
const matrix = computed(() =>
  mode.value === 'cross' && secondDim.value
    ? crossMatrix(filter.filteredNodes, dimKey.value, secondDim.value, metricKey.value)
    : null,
)
const crossChartOption = computed(() => {
  const m = matrix.value
  if (!m || metricKind.value === 'rate') return null
  const rows = m.rows.slice(0, 15)
  const div = metricKind.value === 'money' ? 10000 : 1
  return {
    tooltip: { trigger: 'axis' },
    legend: { type: 'scroll', top: 0 },
    grid: { left: 60, right: 20, top: 30, bottom: 70 },
    xAxis: { type: 'category', data: rows, axisLabel: { interval: 0, rotate: 30 } },
    yAxis: { type: 'value', name: metricKind.value === 'money' ? '金额(万)' : '数量' },
    series: m.cols.map((cv) => ({
      name: cv,
      type: 'bar',
      stack: 'cross',
      data: rows.map((rv) => {
        const g = m.index[rv]?.[cv]
        return g ? +((g[metricKey.value] as number) / div).toFixed(2) : 0
      }),
    })),
  }
})

// ---- 透视 ----
const pivot = computed(() =>
  mode.value === 'pivot' && rowDims.value.length
    ? pivotTable(filter.filteredNodes, rowDims.value, colDims.value, metricKey.value)
    : null,
)

// ---- 下钻（共用） ----
const drillOpen = ref(false)
const drillGroup = ref<PivotGroup | null>(null)
function openDrill(g: PivotGroup) {
  drillGroup.value = g
  drillOpen.value = true
}
function onCellClick({ row, col }: { row: string; col: string }) {
  const g = matrix.value?.index[row]?.[col]
  if (g) openDrill(g)
}
function onPivotCellClick({ rowKey, colKey }: { rowKey: string; colKey: string }) {
  const g = pivot.value?.index[rowKey]?.[colKey]
  if (g) openDrill(g)
}
defineExpose({ drillOpen })
</script>

<template>
  <div class="board-view">
    <p v-if="!data.data" class="bv-hint">暂无数据，请先在数据管理中同步/导入。</p>
    <template v-else>
      <div class="bv-toolbar">
        <div class="bv-ctl">
          <span class="bv-ctl-label">模式</span>
          <SegToggle v-model="mode" :options="MODE_OPTS" />
        </div>

        <template v-if="mode === 'single'">
          <div class="bv-ctl">
            <span class="bv-ctl-label">维度</span>
            <SegToggle v-model="dimKey" :options="DIM_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">排序</span>
            <SegToggle v-model="sortKey" :options="SORT_OPTS" />
          </div>
        </template>

        <template v-else-if="mode === 'cross'">
          <div class="bv-ctl">
            <span class="bv-ctl-label">维度</span>
            <SegToggle v-model="dimKey" :options="DIM_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">次维度</span>
            <SegToggle v-model="secondDim" :options="SECOND_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">指标</span>
            <SegToggle v-model="metricKey" :options="METRIC_OPTS" />
          </div>
        </template>

        <template v-else>
          <div class="bv-ctl">
            <span class="bv-ctl-label">行维度</span>
            <DimPicker v-model="rowDims" :options="DIM_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">列维度</span>
            <DimPicker v-model="colDims" :options="DIM_OPTS" />
          </div>
          <div class="bv-ctl">
            <span class="bv-ctl-label">指标</span>
            <SegToggle v-model="metricKey" :options="METRIC_OPTS" />
          </div>
        </template>
      </div>

      <!-- 单维 -->
      <template v-if="mode === 'single'">
        <section class="bv-card">
          <h3 class="bv-title">已回款 / 待回款对比（Top {{ top.length }}）</h3>
          <ChartBox :option="chartOption" height="320px" />
        </section>
        <section class="bv-card">
          <h3 class="bv-title">分组排名（点击行下钻该组项目）</h3>
          <div class="bv-table">
            <div class="bv-row bv-head">
              <span class="bv-c-name">{{ DIM_OPTS.find((d) => d.value === dimKey)?.label }}</span>
              <span>项目数</span><span>计划回款(万)</span><span>已回款(万)</span><span>待回款(万)</span>
              <span>完成率</span><span>延期</span><span>延期率</span>
            </div>
            <div v-for="g in groups" :key="g.key" v-activate class="bv-row bv-body" @click="openDrill(g)">
              <span class="bv-c-name" :title="g.key">{{ g.key }}</span>
              <span>{{ g.projectCount }}</span>
              <span>{{ fmtWan(g.expectedAmount) }}</span>
              <span class="bv-paid">{{ fmtWan(g.actualAmount) }}</span>
              <span class="bv-remain">{{ fmtWan(g.remainingAmount) }}</span>
              <span>{{ pct(g.completionRate) }}</span>
              <span :class="{ 'bv-danger': g.delayedCount > 0 }">{{ g.delayedCount }}</span>
              <span>{{ pct(g.delayRate) }}</span>
            </div>
            <div v-if="!groups.length" class="bv-empty">暂无数据</div>
          </div>
        </section>
      </template>

      <!-- 交叉 -->
      <template v-else-if="mode === 'cross'">
        <section v-if="crossChartOption" class="bv-card">
          <h3 class="bv-title">{{ METRIC_BY_KEY[metricKey].label }} 交叉堆叠（行 Top 15）</h3>
          <ChartBox :option="crossChartOption" height="320px" />
        </section>
        <section class="bv-card">
          <h3 class="bv-title">交叉矩阵（点击单元格下钻）</h3>
          <BoardMatrix
            v-if="matrix"
            :matrix="matrix"
            :row-label="DIM_OPTS.find((d) => d.value === dimKey)?.label || ''"
            :col-label="SECOND_OPTS.find((d) => d.value === secondDim)?.label || ''"
            :format="metricFormat"
            @cell-click="onCellClick"
          />
          <div v-else class="bv-empty">请选择次维度</div>
        </section>
      </template>

      <!-- 透视 -->
      <template v-else>
        <section class="bv-card">
          <h3 class="bv-title">透视表 · {{ METRIC_BY_KEY[metricKey].label }}（点击单元格下钻）</h3>
          <PivotTable v-if="pivot" :pivot="pivot" :format="metricFormat" @cell-click="onPivotCellClick" />
          <div v-else class="bv-empty">请选择至少一个行维度</div>
        </section>
      </template>

      <BoardDrilldownModal
        v-model="drillOpen"
        :title="drillGroup?.key || ''"
        :projects="drillGroup?.projects || []"
      />
    </template>
  </div>
</template>

<style scoped>
.board-view { padding: 16px; }
.bv-hint { padding: 24px; color: var(--mut); }
.bv-toolbar { display: flex; flex-wrap: wrap; gap: 18px; margin-bottom: 12px; }
.bv-ctl { display: flex; align-items: center; gap: 8px; }
.bv-ctl-label { font-size: var(--fs-1); color: var(--mut); }
.bv-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px; margin-bottom: 12px; }
.bv-title { font-size: var(--fs-3); font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.bv-table { font-size: var(--fs-2); }
.bv-row { display: grid; grid-template-columns: 1.6fr repeat(7, 1fr); gap: 8px; align-items: center; padding: 7px 8px; }
.bv-row > span:not(.bv-c-name) { text-align: right; }
.bv-head { color: var(--mut); font-size: var(--fs-1); border-bottom: 1px solid var(--line); }
.bv-body { border-top: 1px solid var(--line); cursor: pointer; border-radius: 6px; }
.bv-body:hover { background: var(--card2); }
.bv-c-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--txt); }
.bv-paid { color: var(--c-paid); }
.bv-remain { color: var(--c-pending); }
.bv-danger { color: var(--danger); font-weight: 700; }
.bv-empty { color: var(--mut); padding: 16px; text-align: center; }
</style>
```

- [ ] **Step 2: 整体替换 BoardView.test.ts**

把 `frontend/src/views/BoardView.test.ts` 整体替换为（覆盖 single/cross/pivot;cross 改为先切模式;新增 pivot 用例）：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import BoardView from './BoardView.vue'
import { useDataStore } from '@/stores/data'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', orgL4: '北京', orgL3: '华北', projectManager: '张三', projectType: '集成', signUnit: '甲', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-01' },
      { projectId: 'P2', tier: '50万以下', orgL4: '上海', orgL3: '华东', projectManager: '李四', projectType: '运维', signUnit: '乙', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 300000, actualPayment: 300000, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

const opts = { global: { stubs: { BoardDrilldownModal: true } } }

describe('BoardView', () => {
  it('默认单维模式渲染排名行', () => {
    seed()
    const w = mount(BoardView, opts)
    expect(w.findAll('.bv-body').length).toBe(2)
    expect(w.text()).toContain('北京')
    expect(w.text()).toContain('上海')
  })

  it('单维点击行打开下钻', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.findAll('.bv-body')[0].trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })

  it('切交叉模式 + 次维度渲染矩阵', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-cross"]').trigger('click')
    // 次维度 SegToggle 里的 tier（维度组也有 seg-tier，取最后一个=次维度）
    const tierBtns = w.findAll('[data-test="seg-tier"]')
    await tierBtns[tierBtns.length - 1].trigger('click')
    expect(w.find('.bm').exists()).toBe(true)
  })

  it('切透视模式默认渲染透视表（行=orgL4）', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-pivot"]').trigger('click')
    expect(w.find('.pv').exists()).toBe(true)
    expect(w.text()).toContain('北京')
  })

  it('透视模式点数据格打开下钻', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-pivot"]').trigger('click')
    await w.find('.pv-cell.pv-click').trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })
})
```

- [ ] **Step 3: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/views/BoardView.test.ts`
Expected: PASS（5 用例）。

- [ ] **Step 4: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/BoardView.vue frontend/src/views/BoardView.test.ts
git commit -m "feat(D6): BoardView 三模式（排名/交叉/透视）+ 透视表与格下钻

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 全量验证 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`。

- [ ] **Step 2: 更新 PROGRESS.md**

- 顶部「最近更新」改为 2026-06-08（Plan D6 多维看板 N 维透视表完成）。
- Phase D backlog 把 `- [ ] **D6** …` 改为 `- [x] **D6** …`，简述：lib/pivot 增 `pivotTable`(多行多列);新增 DimPicker(有序多选)/PivotTable;BoardView 引入 排名/交叉/透视 三模式，透视=自选行×列+指标，点格下钻。
- 「会话交接备注」新增 D6 段：分支、产物、模式重构(cross 改由显式 mode 门控)、YAGNI(无小计/无 N×N 图/列表头用组合标签)、下一步 D7。

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs(D6): PROGRESS 记录多维看板 N 维透视表完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- /board 三模式：排名(D4)/交叉(D5)/透视(D6 新);透视=自选多行维度×多列维度+指标，列维度为空时单列「合计」，点数据格下钻该交叉组项目 → D2 详情。
- single/cross 行为不回归（改由显式 mode 门控）;`pivotTable` 纯函数有 Vitest;计算复用 groupByDims/groupByProject 未改算法。
- `bash verify.sh` 全绿;`PROGRESS.md` 已更新。
```
