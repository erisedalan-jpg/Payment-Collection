# D5 多维看板·双维交叉 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 D4 单维看板基础上加「次维度 + 指标」选择：选了次维度即进入交叉模式，输出行×列交叉矩阵表（单元格点击下钻该交叉组项目）+ 可加性指标的分组堆叠图;不选次维度时维持 D4 单维行为不变。

**Architecture:** 复用 D4 的 `groupByDims`（已 N 维可扩展）。`lib/pivot` 新增指标注册表 `METRICS` 与 `crossMatrix(nodes, rowDim, colDim, metricKey)`（把双维分组透视成矩阵 + 保留每格 PivotGroup 供下钻）。新增 `BoardMatrix.vue`（矩阵表，数据格 `v-activate` 可键盘点击，emit `cell-click`）。`BoardView` 增加次维度/指标 SegToggle，交叉模式下渲染 BoardMatrix + 堆叠图，格点击复用 D4 的 `BoardDrilldownModal` → D2 详情面板。计算口径仍复用 groupByProject，不改算法。

**Tech Stack:** Vue3 `<script setup lang="ts">` + Pinia + vue-echarts(ChartBox) + Vitest。

---

## 背景与范围

Phase D spec §4.3：「双维交叉：在单维基础上加『次维度』，输出交叉矩阵/分组堆叠图」。本期只做双维（N 维透视表是 D6）。

**已就绪依赖（D4 起）：**
- `lib/pivot.ts`：`DIMENSIONS`、`DIM_BY_KEY`、`groupByDims(nodes, dimKeys[]) → PivotGroup[]`（双维时桶 key=`"行值 / 列值"`、`values=[行值,列值]`、含每组指标 + `projects`）。`PivotGroup` 数值字段：`projectCount/expectedAmount/actualAmount/remainingAmount/completionRate/delayedCount/delayRate`。
- `views/BoardView.vue`（D4 单维）：维度/排序 SegToggle + 对比图 + 排名表 + `BoardDrilldownModal`(drillOpen/drillGroup/openDrill)。
- `components/BoardDrilldownModal.vue`：`modelValue/title/projects`，项目行 → `projectDetail.open`。
- `components/SegToggle.vue`：`modelValue/options`。
- D2.5 `v-activate` 指令支持绑定值 `false` 时跳过（用于空格不可点）。
- `lib/format.ts`：`fmtWan(元)→万`、`pct(0~1)→%`。
- 测试范式：`setActivePinia(createPinia())` + `useDataStore().data` 种子;BoardView 测试已 `vi.mock('vue-router')` + stub `BoardDrilldownModal`。

**本计划新建/改：**
- 改 `lib/pivot.ts`：加 `METRICS`/`METRIC_BY_KEY` 与 `crossMatrix`（+ 测试追加）。
- 新建 `components/BoardMatrix.vue`（+ 测试）。
- 改 `views/BoardView.vue`：次维度/指标选择 + 交叉模式渲染（+ 测试追加）。

**YAGNI 边界：** 仅双维;N 维任意行/列/指标透视表留 D6。交叉图仅对可加性指标（金额/计数）做堆叠;比例类指标（完成率/延期率）只在矩阵表显示，不出堆叠图（堆叠比例无意义）。

## 约定（CLAUDE.md，所有任务遵守）

- 简体中文;**无 emoji**（用 → ↓ ❌ ✕ ▾）。
- CSS 用主题 token;ECharts series 颜色按既有惯例可用 hex/主题调色板。尺寸优先 `var(--fs-*)`。
- 下钻入口非语义可点击元素用 `v-activate`。
- 计算口径忠实：复用 `groupByDims`/`groupByProject`，不改算法;新增纯函数有 Vitest。
- 提交信息结尾固定：
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: lib/pivot — 指标注册表 + crossMatrix 透视

**Files:**
- Modify: `frontend/src/lib/pivot.ts`（追加 `METRICS`/`METRIC_BY_KEY`/`MetricDef`/`CrossMatrix`/`crossMatrix`）
- Test: `frontend/src/lib/pivot.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试**

在 `frontend/src/lib/pivot.test.ts` 末尾追加（`groupByDims` 已在顶部 import，补充 `crossMatrix`/`METRICS` 到该 import 或新增一行 import）：

```ts
import { METRICS, crossMatrix } from './pivot'

describe('crossMatrix 双维透视', () => {
  const X: any[] = [
    { projectId: 'A', orgL4: '北京', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 1000000, actualPayment: 600000 },
    { projectId: 'B', orgL4: '北京', tier: '50万以下', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 200000, actualPayment: 100000 },
    { projectId: 'C', orgL4: '上海', tier: '50万以下', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 400000, actualPayment: 300000 },
  ]

  it('METRICS 含 6 指标', () => {
    expect(METRICS.map((m) => m.key)).toEqual(['actualAmount', 'expectedAmount', 'remainingAmount', 'completionRate', 'projectCount', 'delayedCount'])
  })

  it('按 orgL4 × tier 透视已回款，行列按合计降序', () => {
    const m = crossMatrix(X, 'orgL4', 'tier', 'actualAmount')
    expect(m.rows).toEqual(['北京', '上海']) // 北京 700000 > 上海 300000
    expect(m.cols).toEqual(['100万以上', '50万以下']) // 600000 vs 400000
    expect(m.cells[0]).toEqual([600000, 100000]) // 北京 × [100万以上, 50万以下]
    expect(m.cells[1]).toEqual([0, 300000]) // 上海：100万以上无 → 0
    expect(m.index['北京']['100万以上'].projects.length).toBe(1) // 供下钻
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/pivot.test.ts`
Expected: FAIL（`METRICS`/`crossMatrix` 不存在）。

- [ ] **Step 3: 实现**

在 `frontend/src/lib/pivot.ts` 末尾追加：

```ts
export interface MetricDef {
  key: 'actualAmount' | 'expectedAmount' | 'remainingAmount' | 'completionRate' | 'projectCount' | 'delayedCount'
  label: string
  kind: 'money' | 'count' | 'rate'
}

export const METRICS: MetricDef[] = [
  { key: 'actualAmount', label: '已回款', kind: 'money' },
  { key: 'expectedAmount', label: '计划回款', kind: 'money' },
  { key: 'remainingAmount', label: '待回款', kind: 'money' },
  { key: 'completionRate', label: '完成率', kind: 'rate' },
  { key: 'projectCount', label: '项目数', kind: 'count' },
  { key: 'delayedCount', label: '延期数', kind: 'count' },
]

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
)

export interface CrossMatrix {
  rows: string[]
  cols: string[]
  cells: number[][]
  index: Record<string, Record<string, PivotGroup>>
}

/** 双维透视：行=rowDim 取值、列=colDim 取值、格=所选指标值（无该交叉组则 0）。
 *  行/列按各自指标合计降序。index 保留每格 PivotGroup 供下钻。 */
export function crossMatrix(
  nodes: RawNode[],
  rowDim: string,
  colDim: string,
  metricKey: MetricDef['key'],
): CrossMatrix {
  const groups = groupByDims(nodes, [rowDim, colDim])
  const index: Record<string, Record<string, PivotGroup>> = {}
  const rowTotals: Record<string, number> = {}
  const colTotals: Record<string, number> = {}
  for (const g of groups) {
    const [rv, cv] = g.values
    const val = g[metricKey] as number
    ;(index[rv] ||= {})[cv] = g
    rowTotals[rv] = (rowTotals[rv] || 0) + val
    colTotals[cv] = (colTotals[cv] || 0) + val
  }
  const rows = Object.keys(rowTotals).sort((a, b) => rowTotals[b] - rowTotals[a])
  const cols = Object.keys(colTotals).sort((a, b) => colTotals[b] - colTotals[a])
  const cells = rows.map((rv) => cols.map((cv) => (index[rv]?.[cv]?.[metricKey] as number) ?? 0))
  return { rows, cols, cells, index }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/pivot.test.ts`
Expected: PASS（含 D4 原有用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/pivot.ts frontend/src/lib/pivot.test.ts
git commit -m "feat(D5): lib/pivot 指标注册表 METRICS + crossMatrix 双维透视

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: BoardMatrix — 交叉矩阵表

**Files:**
- Create: `frontend/src/components/BoardMatrix.vue`
- Test: `frontend/src/components/BoardMatrix.test.ts`

行×列矩阵表。有数据的格 `v-activate` 可键盘点击，emit `cell-click {row,col}`;空格（无该交叉组）不可点。格值由父传入的 `format` 函数格式化。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/BoardMatrix.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BoardMatrix from './BoardMatrix.vue'
import type { CrossMatrix } from '@/lib/pivot'

const M: CrossMatrix = {
  rows: ['北京', '上海'],
  cols: ['100万以上', '50万以下'],
  cells: [[600000, 100000], [0, 300000]],
  index: {
    北京: { '100万以上': { projects: [{}] } as any, '50万以下': { projects: [{}] } as any },
    上海: { '50万以下': { projects: [{}] } as any },
  },
}

describe('BoardMatrix', () => {
  it('渲染行/列/格并格式化', () => {
    const w = mount(BoardMatrix, {
      props: { matrix: M, rowLabel: '服务组', colLabel: '档位', format: (v: number) => `¥${v}` },
    })
    expect(w.text()).toContain('北京')
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('¥600000')
  })

  it('点击有数据的格 emit cell-click，空格不可点', async () => {
    const w = mount(BoardMatrix, {
      props: { matrix: M, rowLabel: '服务组', colLabel: '档位', format: (v: number) => String(v) },
    })
    const clickable = w.findAll('.bm-cell.bm-click')
    // 有数据格：北京×100万以上、北京×50万以下、上海×50万以下 = 3 个
    expect(clickable.length).toBe(3)
    await clickable[0].trigger('click')
    expect(w.emitted('cell-click')?.[0]?.[0]).toEqual({ row: '北京', col: '100万以上' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/BoardMatrix.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/BoardMatrix.vue`:

```vue
<script setup lang="ts">
import type { CrossMatrix } from '@/lib/pivot'

const props = defineProps<{
  matrix: CrossMatrix
  rowLabel: string
  colLabel: string
  format: (v: number) => string
}>()
const emit = defineEmits<{ 'cell-click': [{ row: string; col: string }] }>()

function has(row: string, col: string): boolean {
  return !!props.matrix.index[row]?.[col]
}
</script>

<template>
  <div class="bm-wrap">
    <table class="bm">
      <thead>
        <tr>
          <th class="bm-corner">{{ rowLabel }} \ {{ colLabel }}</th>
          <th v-for="c in matrix.cols" :key="c" class="bm-colhead" :title="c">{{ c }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(rv, ri) in matrix.rows" :key="rv">
          <th class="bm-rowhead" :title="rv">{{ rv }}</th>
          <td
            v-for="(cv, ci) in matrix.cols"
            :key="cv"
            class="bm-cell"
            :class="{ 'bm-click': has(rv, cv), 'bm-zero': !has(rv, cv) }"
            v-activate="has(rv, cv)"
            @click="has(rv, cv) && emit('cell-click', { row: rv, col: cv })"
          >
            {{ format(matrix.cells[ri][ci]) }}
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!matrix.rows.length" class="bm-empty">暂无数据</div>
  </div>
</template>

<style scoped>
.bm-wrap { overflow-x: auto; }
.bm { border-collapse: collapse; font-size: var(--fs-2); width: 100%; }
.bm th, .bm td { border: 1px solid var(--line); padding: 6px 10px; white-space: nowrap; }
.bm-corner { background: var(--card2); color: var(--mut); text-align: left; font-weight: 600; position: sticky; left: 0; }
.bm-colhead { background: var(--card2); color: var(--sub); font-weight: 600; }
.bm-rowhead { background: var(--card2); color: var(--txt); text-align: left; font-weight: 600; position: sticky; left: 0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.bm-cell { text-align: right; color: var(--txt); }
.bm-click { cursor: pointer; }
.bm-click:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.bm-zero { color: var(--mut); }
.bm-empty { color: var(--mut); padding: 16px; text-align: center; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/BoardMatrix.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BoardMatrix.vue frontend/src/components/BoardMatrix.test.ts
git commit -m "feat(D5): BoardMatrix 交叉矩阵表（数据格键盘可点 + cell-click）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: BoardView — 次维度 + 指标选择 + 交叉模式

**Files:**
- Modify: `frontend/src/views/BoardView.vue`
- Test: `frontend/src/views/BoardView.test.ts`（追加用例）

加「次维度」「指标」两个 SegToggle。次维度=无 → 维持 D4 单维（排序 + 排名表 + 单维对比图）;次维度≠无 → 交叉模式：BoardMatrix + 可加性指标的堆叠图;格点击复用 drill 下钻。

- [ ] **Step 1: 改 BoardView `<script setup>`**

在 import 区补充：

```ts
import { ref, computed, watch } from 'vue'
import { DIMENSIONS, groupByDims, crossMatrix, METRICS, METRIC_BY_KEY, type PivotGroup } from '@/lib/pivot'
import { fmtWan, pct } from '@/lib/format'
import BoardMatrix from '@/components/BoardMatrix.vue'
```

（即在原有 import 基础上：`vue` 增加 `watch`;`@/lib/pivot` 增加 `crossMatrix, METRICS, METRIC_BY_KEY`;新增 `BoardMatrix` 与确保 `fmtWan, pct` 已引入。原有 `ChartBox/SegToggle/BoardDrilldownModal/useRoute/useDataStore/useFilterStore` 保留。）

在 `const sortKey = ref('actualAmount')` 之后追加交叉相关状态：

```ts
const secondDim = ref('')
const metricKey = ref<(typeof METRICS)[number]['key']>('actualAmount')

const SECOND_OPTS = computed(() => [
  { value: '', label: '无' },
  ...DIMENSIONS.filter((d) => d.key !== dimKey.value).map((d) => ({ value: d.key, label: d.label })),
])
const METRIC_OPTS = METRICS.map((m) => ({ value: m.key, label: m.label }))

// 主维度变化时若与次维度撞车则清空次维度
watch(dimKey, () => {
  if (secondDim.value === dimKey.value) secondDim.value = ''
})

const crossOn = computed(() => secondDim.value !== '')

const matrix = computed(() =>
  crossOn.value ? crossMatrix(filter.filteredNodes, dimKey.value, secondDim.value, metricKey.value) : null,
)

const metricKind = computed(() => METRIC_BY_KEY[metricKey.value].kind)
const metricFormat = computed(() => {
  const kind = metricKind.value
  return (v: number) => (kind === 'money' ? fmtWan(v) : kind === 'rate' ? pct(v) : String(v))
})

// 交叉堆叠图：仅可加性指标（金额/计数）；比例类不出图
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

function onCellClick({ row, col }: { row: string; col: string }) {
  const g = matrix.value?.index[row]?.[col]
  if (g) openDrill(g)
}
```

（`openDrill`、`drillOpen`、`drillGroup`、`defineExpose({ drillOpen })` 保持 D4 原样。`metricKind` 供模板判断。）

- [ ] **Step 2: 改 BoardView `<template>` 工具栏与主体**

工具栏：在「维度」控件后加「次维度」，并把「排序」改为按模式切换（单维=排序，交叉=指标）：

```vue
      <div class="bv-toolbar">
        <div class="bv-ctl">
          <span class="bv-ctl-label">维度</span>
          <SegToggle v-model="dimKey" :options="DIM_OPTS" />
        </div>
        <div class="bv-ctl">
          <span class="bv-ctl-label">次维度</span>
          <SegToggle v-model="secondDim" :options="SECOND_OPTS" />
        </div>
        <div class="bv-ctl">
          <span class="bv-ctl-label">{{ crossOn ? '指标' : '排序' }}</span>
          <SegToggle v-if="crossOn" v-model="metricKey" :options="METRIC_OPTS" />
          <SegToggle v-else v-model="sortKey" :options="SORT_OPTS" />
        </div>
      </div>
```

主体：交叉模式渲染矩阵 + 堆叠图;单维模式维持 D4 的对比图 + 排名表。把原「对比图 card」与「排名表 card」用 `v-if="!crossOn"` 包裹（保持 D4 内容不变），并新增交叉模式块：

```vue
      <template v-if="crossOn">
        <section v-if="crossChartOption" class="bv-card">
          <h3 class="bv-title">{{ METRIC_BY_KEY[metricKey].label }} 交叉堆叠（行 Top 15）</h3>
          <ChartBox :option="crossChartOption" height="320px" />
        </section>
        <section class="bv-card">
          <h3 class="bv-title">交叉矩阵（点击单元格下钻）</h3>
          <BoardMatrix
            :matrix="matrix!"
            :row-label="DIM_OPTS.find((d) => d.value === dimKey)?.label || ''"
            :col-label="SECOND_OPTS.find((d) => d.value === secondDim)?.label || ''"
            :format="metricFormat"
            @cell-click="onCellClick"
          />
        </section>
      </template>

      <template v-else>
        <!-- 以下为 D4 原有：对比图 card + 排名表 card，原样保留 -->
        <section class="bv-card"> ...(D4 对比图)... </section>
        <section class="bv-card"> ...(D4 排名表)... </section>
      </template>
```

> 实施提示：把 D4 现有的两个 `<section class="bv-card">`（对比图、排名表）整体移入 `<template v-else>`，不改其内部内容;`BoardDrilldownModal` 保持在 `v-if/v-else` 之外（两模式共用）。

- [ ] **Step 3: 追加 BoardView 测试**

在 `frontend/src/views/BoardView.test.ts` 的 `describe('BoardView')` 内追加（该文件已 `vi.mock('vue-router')` + 默认 stub `BoardDrilldownModal`;交叉用例需让 BoardMatrix 真实渲染，故 mount 时只 stub BoardDrilldownModal）：

```ts
  it('选择次维度进入交叉模式并渲染矩阵', async () => {
    seed()
    const w = mount(BoardView, { global: { stubs: { BoardDrilldownModal: true } } })
    // 主维度默认 orgL4，次维度选 tier
    await w.get('[data-test="seg-tier"]').trigger('click')
    expect(w.find('.bm').exists()).toBe(true)
    expect(w.text()).toContain('北京')
    expect(w.text()).toContain('100万以上')
  })

  it('交叉模式点击数据格打开下钻', async () => {
    seed()
    const w = mount(BoardView, { global: { stubs: { BoardDrilldownModal: true } } })
    await w.get('[data-test="seg-tier"]').trigger('click')
    await w.find('.bm-cell.bm-click').trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })
```

> 注意：`[data-test="seg-tier"]` 既出现在「维度」也可能出现在「次维度」SegToggle。次维度选项里含 tier（主维度 orgL4 时未被过滤掉），但「维度」SegToggle 的 tier 选项同样 data-test=seg-tier。`w.get` 取第一个=「维度」组的 tier，会切主维度而非次维度。**为避免歧义，测试改用次维度组内定位**：给次维度 SegToggle 容器加 class 后在其内查找，或用 `findAll('[data-test="seg-tier"]')` 取最后一个。本测试用：

```ts
    const tierBtns = w.findAll('[data-test="seg-tier"]')
    await tierBtns[tierBtns.length - 1].trigger('click') // 次维度组的 tier
```

即把上面两个用例里的 `await w.get('[data-test="seg-tier"]').trigger('click')` 替换为上述两行（取最后一个 seg-tier = 次维度）。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/views/BoardView.test.ts`
Expected: PASS（D4 3 用例 + D5 2 用例 = 5）。

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/BoardView.vue frontend/src/views/BoardView.test.ts
git commit -m "feat(D5): BoardView 次维度+指标选择，交叉矩阵+堆叠图+格下钻

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 全量验证 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`。

- [ ] **Step 2: 更新 PROGRESS.md**

- 顶部「最近更新」改为 2026-06-08（Plan D5 多维看板双维交叉完成）。
- Phase D backlog 把 `- [ ] **D5** …` 改为 `- [x] **D5** …`，简述：lib/pivot 增 METRICS + crossMatrix;BoardView 加次维度/指标选择，交叉矩阵(BoardMatrix)+ 可加性指标堆叠图 + 单元格下钻(复用 BoardDrilldownModal→D2 详情)。
- 「会话交接备注」新增 D5 段：分支、产物、YAGNI（N维透视表留 D6）、下一步 D6。

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs(D5): PROGRESS 记录多维看板双维交叉完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- /board 选次维度即进入交叉模式：交叉矩阵表（行×列，指标可切）+ 可加性指标堆叠图;点单元格下钻该交叉组项目 → D2 详情面板;次维度=无时维持 D4 单维行为。
- `crossMatrix` 纯函数有 Vitest 覆盖;计算复用 groupByDims/groupByProject 未改算法。
- `bash verify.sh` 全绿;`PROGRESS.md` 已更新。
```
