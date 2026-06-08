# D4 多维看板·单维核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 Phase D 决策 2/3/4 落地多维看板单维核心：`/board` 页可按任意维度（服务组/L3/项目经理/项目类型/签约单位/金额档位）做排名榜 + 对比图 + 行点击下钻到该组项目列表 → 项目详情面板;吸收并删除「区间对比」「项目经理视图」;落地 navContext 带上下文跳转。

**Architecture:** 新增 `lib/pivot`（N 维可扩展的纯函数聚合：按维度取值分桶 → 每桶用既有 `groupByProject` 算指标，本期只用单维）。`BoardView` 顶部维度选择（复用 SegToggle）+ ECharts 对比图（ChartBox）+ 自定义可键盘操作的排名表，行点击经 `BoardDrilldownModal` 展示该组项目（复用增强后的 DataTable），项目行点击经 D2 `projectDetail` 唤起全局详情面板。`lib/navContext` 提供 `goBoard(router, dim)` 供首页排名等带维度跳转。删除 compare/pmview 整链与其旧路由/侧栏入口。计算口径忠实（复用 groupByProject，不改算法）。

**Tech Stack:** Vue3 `<script setup lang="ts">` + Pinia + vue-router + Element Plus + vue-echarts(ChartBox) + Vitest。

---

## 背景与范围

Phase D spec（`docs/superpowers/specs/2026-06-04-phase-d-frontend-redesign-design.md`）决策 2/3/4 + §4.3 定义多维看板;§4.2 定义 navContext;IA 移除 `/compare`、`/pmview` 入口。本计划是「单维核心」，**双维交叉(D5)/N 维透视表(D6) 不在本期**——但 `lib/pivot` 的 `groupByDims` 设计为 N 维可扩展。

**已就绪依赖（复用，不重造）：**
- `lib/dashboardStats.ts`：`groupByProject(nodes) → ProjectAgg[]`（含 projectId/projectName/orgL4/orgL3/projectManager/projectType/projectAmount/tier/expectedPayment/actualPayment/paymentRatio/remainingAmount/paymentStatus/nodes）。
- `stores/filter.ts`：`filteredNodes`（年/视角/纳管已应用，跨页保留）。
- `stores/projectDetail.ts`（D2）：`open(id)`，AppLayout 已全局挂载 `ProjectDetailDrawer`。
- `components/Modal.vue`：`modelValue/title?/width?` + `update:modelValue`（el-dialog 包装）。
- `components/DataTable.vue`：`columns/rows/showCount`，列含 `formatter`。
- `components/SegToggle.vue`（D3）：`modelValue/options` + `update:modelValue`。
- `lib/cellFormat.ts`：`formatCellValue(v, key)`;`lib/format.ts`：`fmtWan/pct`。
- `charts/ChartBox.vue`：`option/height`，吃 D1 明暗主题。
- 维度字段已确认存在于 rawNodes（每节点冗余）：`orgL4 orgL3 projectManager projectType signUnit tier`。
- 测试范式：`setActivePinia(createPinia())` + `useDataStore().data = {...rawNodes...}` + mount + 断言。

**本计划新建/改/删：**
- 新建：`lib/pivot.ts`、`lib/navContext.ts`、`components/BoardDrilldownModal.vue`、`views/BoardView.vue`（+各自 `.test.ts`）。
- 改：`components/DataTable.vue`（加可选 `row-click` 与 `clickable`）、`router/index.ts`、`nav.ts`、`layout/AppSidebar.vue`、`components/OrgRanking.vue`（行接 navContext）。
- 删：`views/CompareView.vue`(+test)、`components/CompareCards.vue`(+test)、`lib/compare.ts`(+test)、`views/PmView.vue`(+test)、`components/PmRankingTable.vue`(+test)、`components/PmDrilldownModal.vue`(+test)、`lib/pmView.ts`(+test)。

**YAGNI 边界：** 双维/N 维(D5/D6)不做;BoardView 行下钻目标是「该组项目列表」，单组特定值再细筛留后续;navContext 本期仅 `goBoard(router, dim)` 一个消费者（OrgRanking）+ 年/视角全局 filter 自动保留，足够。

## 约定（CLAUDE.md，所有任务遵守）

- 简体中文;**无 emoji**（用 → ↓ ❌ ✕ ▾）;术语「邮件推动」。
- CSS 颜色用主题 token（背景 --card/--card2、文字 --txt/--sub/--mut、线 --line/--line2、状态 --c-paid/--c-pending/--danger/--accent、彩底反白 --on-accent）;ECharts series 颜色按既有图表惯例可用 hex 常量（如 PendingBarChart）。尺寸优先 `var(--fs-*)`。
- 下钻入口的非语义可点击元素用 `v-activate`（D2.5 全局指令）键盘可达;原生 `<button>` 不加。
- 计算口径忠实：复用 `groupByProject`，不改金额/日期/比例/状态算法;新增纯函数有 Vitest。
- 提交信息结尾固定：
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: lib/pivot — 维度注册表 + groupByDims 聚合引擎

**Files:**
- Create: `frontend/src/lib/pivot.ts`
- Test: `frontend/src/lib/pivot.test.ts`

按 1..N 个维度把节点分桶，每桶用 `groupByProject` 算项目级指标。本期单维使用，接口 N 维可扩展（供 D5/D6）。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/lib/pivot.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DIMENSIONS, DIM_BY_KEY, groupByDims } from './pivot'

const NODES: any[] = [
  // 项目 P1（北京/张三/100万以上）两节点：计划 100+50 万，已回 60+0 万，一节点延期
  { projectId: 'P1', tier: '100万以上', orgL4: '北京', orgL3: '华北', projectManager: '张三', projectType: '集成', signUnit: '甲公司', isPaymentRelated: true, nodeStatus: '已全额回款', expectedPayment: 1000000, actualPayment: 600000 },
  { projectId: 'P1', tier: '100万以上', orgL4: '北京', orgL3: '华北', projectManager: '张三', projectType: '集成', signUnit: '甲公司', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 500000, actualPayment: 0 },
  // 项目 P2（上海/李四/50万以下）一节点
  { projectId: 'P2', tier: '50万以下', orgL4: '上海', orgL3: '华东', projectManager: '李四', projectType: '运维', signUnit: '', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 300000, actualPayment: 300000 },
]

describe('DIMENSIONS', () => {
  it('提供 6 个维度，valueOf 空值回退「未指定」', () => {
    expect(DIMENSIONS.map((d) => d.key)).toEqual(['orgL4', 'orgL3', 'projectManager', 'projectType', 'signUnit', 'tier'])
    expect(DIM_BY_KEY.signUnit.valueOf({ signUnit: '' } as any)).toBe('未指定')
    expect(DIM_BY_KEY.orgL4.valueOf({ orgL4: '北京' } as any)).toBe('北京')
  })
})

describe('groupByDims 单维', () => {
  it('按 orgL4 分组并算指标', () => {
    const gs = groupByDims(NODES, ['orgL4'])
    const bj = gs.find((g) => g.key === '北京')!
    expect(bj.projectCount).toBe(1)
    expect(bj.expectedAmount).toBe(1500000)
    expect(bj.actualAmount).toBe(600000)
    expect(bj.remainingAmount).toBe(900000)
    expect(bj.completionRate).toBeCloseTo(0.4)
    expect(bj.delayedCount).toBe(1)
    expect(bj.delayRate).toBeCloseTo(1)
    expect(bj.projects.length).toBe(1)
  })

  it('按 tier 分组得到两组，默认按已回款降序', () => {
    const gs = groupByDims(NODES, ['tier'])
    expect(gs.map((g) => g.key)).toEqual(['100万以上', '50万以下'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/pivot.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/lib/pivot.ts`:

```ts
import type { RawNode } from '@/types/analysis'
import { groupByProject, type ProjectAgg } from './dashboardStats'

export interface DimDef {
  key: string
  label: string
  valueOf: (n: Record<string, any>) => string
}

const v = (raw: unknown) => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? '未指定' : s
}

export const DIMENSIONS: DimDef[] = [
  { key: 'orgL4', label: '服务组(L4)', valueOf: (n) => v(n.orgL4) },
  { key: 'orgL3', label: 'L3部门', valueOf: (n) => v(n.orgL3) },
  { key: 'projectManager', label: '项目经理', valueOf: (n) => v(n.projectManager) },
  { key: 'projectType', label: '项目类型', valueOf: (n) => v(n.projectType) },
  { key: 'signUnit', label: '签约单位', valueOf: (n) => v(n.signUnit) },
  { key: 'tier', label: '金额档位', valueOf: (n) => v(n.tier) },
]

export const DIM_BY_KEY: Record<string, DimDef> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.key, d]),
)

export interface PivotGroup {
  key: string
  values: string[]
  projectCount: number
  expectedAmount: number
  actualAmount: number
  remainingAmount: number
  completionRate: number
  delayedCount: number
  delayRate: number
  projects: ProjectAgg[]
}

/** 按 1..N 个维度分桶（桶 key = 各维取值以 " / " 连接），每桶用 groupByProject 算项目级指标。
 *  默认按已回款金额降序。本期单维使用，接口 N 维可扩展。 */
export function groupByDims(nodes: RawNode[], dimKeys: string[]): PivotGroup[] {
  const defs = dimKeys.map((k) => DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, RawNode[]> = {}
  for (const raw of nodes) {
    const n = raw as Record<string, any>
    const key = defs.map((d) => d.valueOf(n)).join(' / ')
    ;(buckets[key] ||= []).push(raw)
  }
  const groups = Object.entries(buckets).map(([key, gnodes]) => {
    const first = gnodes[0] as Record<string, any>
    const projects = groupByProject(gnodes)
    const expectedAmount = projects.reduce((s, p) => s + (p.expectedPayment || 0), 0)
    const actualAmount = projects.reduce((s, p) => s + (p.actualPayment || 0), 0)
    const delayedCount = projects.filter((p) => p.paymentStatus === '延期').length
    const projectCount = projects.length
    return {
      key,
      values: defs.map((d) => d.valueOf(first)),
      projectCount,
      expectedAmount,
      actualAmount,
      remainingAmount: expectedAmount - actualAmount,
      completionRate: expectedAmount > 0 ? actualAmount / expectedAmount : 0,
      delayedCount,
      delayRate: projectCount > 0 ? delayedCount / projectCount : 0,
      projects,
    }
  })
  return groups.sort((a, b) => b.actualAmount - a.actualAmount)
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/pivot.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/pivot.ts frontend/src/lib/pivot.test.ts
git commit -m "feat(D4): lib/pivot 维度注册表 + groupByDims 聚合引擎(N维可扩展)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: lib/navContext — 带维度跳转多维看板

**Files:**
- Create: `frontend/src/lib/navContext.ts`
- Test: `frontend/src/lib/navContext.test.ts`

封装「带上下文跳转」。本期一个消费者（首页服务组排名 → 跳 /board）。年/视角等全局筛选由 filter store 自动跨页保留，无需重复写入;只需把目标维度经路由 query 传给 BoardView。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/lib/navContext.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { goBoard } from './navContext'

describe('goBoard', () => {
  it('push 到 /board 并带 dim query', () => {
    const router = { push: vi.fn() } as any
    goBoard(router, 'orgL4')
    expect(router.push).toHaveBeenCalledWith({ path: '/board', query: { dim: 'orgL4' } })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/navContext.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/lib/navContext.ts`:

```ts
import type { Router } from 'vue-router'

/** 带维度跳转多维看板。年/视角等全局筛选由 filter store 跨页保留，此处只传维度。 */
export function goBoard(router: Router, dim: string): void {
  router.push({ path: '/board', query: { dim } })
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/navContext.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/navContext.ts frontend/src/lib/navContext.test.ts
git commit -m "feat(D4): lib/navContext goBoard 带维度跳转

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: DataTable 增加可选 row-click 与 clickable

**Files:**
- Modify: `frontend/src/components/DataTable.vue`
- Test: `frontend/src/components/DataTable.test.ts`（追加用例）

让 DataTable 行可点击（供 BoardDrilldownModal 项目行 → 详情面板;D5/D6/D7 复用）。向后兼容：不传不影响现有用法。

- [ ] **Step 1: 追加失败测试**

在 `frontend/src/components/DataTable.test.ts` 末尾追加（文件已 import mount/flushPromises 则复用;否则在新 describe 里按下方 import）：

```ts
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DataTable from './DataTable.vue'

describe('DataTable row-click', () => {
  it('点击行 emit row-click 携带行数据', async () => {
    const w = mount(DataTable, {
      props: {
        columns: [{ key: 'projectId', label: '编号' }],
        rows: [{ projectId: 'P1' }],
        clickable: true,
      },
    })
    await flushPromises()
    await w.find('.el-table__row').trigger('click')
    expect(w.emitted('row-click')?.[0]?.[0]).toMatchObject({ projectId: 'P1' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/DataTable.test.ts`
Expected: FAIL（无 row-click emit）。

- [ ] **Step 3: 实现**

把 `frontend/src/components/DataTable.vue` 的 `<script setup>` 内 props 定义加上 `clickable`，并新增 emit；模板 `<el-table>` 加 `@row-click` 与可点击行类。完整替换 `<script setup>` 与 `<el-table ...>` 起始标签：

`<script setup lang="ts">` 内，在 `const props = withDefaults(...)` 之后追加：

```ts
const emit = defineEmits<{ 'row-click': [Record<string, any>] }>()
```

并把 props 的 withDefaults 块改为含 `clickable`：

```ts
const props = withDefaults(
  defineProps<{
    columns: DataColumn[]
    rows: Record<string, any>[]
    showCount?: boolean
    clickable?: boolean
  }>(),
  { showCount: true, clickable: false },
)
```

模板里把 `<el-table :data="props.rows" border stripe style="width: 100%">` 改为：

```vue
    <el-table
      :data="props.rows"
      border
      stripe
      style="width: 100%"
      :row-class-name="props.clickable ? 'dt-clickable-row' : ''"
      @row-click="(row: Record<string, any>) => emit('row-click', row)"
    >
```

在 `<style scoped>` 末尾追加：

```css
:deep(.dt-clickable-row) { cursor: pointer; }
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/DataTable.test.ts`
Expected: PASS（含原有用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DataTable.vue frontend/src/components/DataTable.test.ts
git commit -m "feat(D4): DataTable 支持可选 row-click 与 clickable 行

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: BoardDrilldownModal — 组内项目下钻

**Files:**
- Create: `frontend/src/components/BoardDrilldownModal.vue`
- Test: `frontend/src/components/BoardDrilldownModal.test.ts`

展示某分组的项目列表（复用 Modal + DataTable），项目行点击 → D2 `projectDetail.open`。吸收 pmview 的「下钻看项目」。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/BoardDrilldownModal.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import BoardDrilldownModal from './BoardDrilldownModal.vue'
import { useProjectDetailStore } from '@/stores/projectDetail'
import type { ProjectAgg } from '@/lib/dashboardStats'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

const PROJECTS = [
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三', projectAmount: 2000000, paymentStatus: '延期', paymentRatio: 0.4, expectedPayment: 1500000, actualPayment: 600000, remainingAmount: 900000, orgL3: '', projectType: '', canAdvance: false, nodes: [] },
] as unknown as ProjectAgg[]

describe('BoardDrilldownModal', () => {
  it('渲染组内项目并在点击行时唤起详情面板', async () => {
    const w = mount(BoardDrilldownModal, {
      props: { modelValue: true, title: '北京', projects: PROJECTS },
    })
    await flushPromises()
    expect(w.text()).toContain('甲')
    await w.find('.el-table__row').trigger('click')
    const pd = useProjectDetailStore()
    expect(pd.openId).toBe('P1')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/BoardDrilldownModal.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/BoardDrilldownModal.vue`:

```vue
<script setup lang="ts">
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import { formatCellValue } from '@/lib/cellFormat'
import { useProjectDetailStore } from '@/stores/projectDetail'
import type { ProjectAgg } from '@/lib/dashboardStats'

const props = defineProps<{
  modelValue: boolean
  title: string
  projects: ProjectAgg[]
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const pd = useProjectDetailStore()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'tier', label: '金额档位' },
  { key: 'orgL4', label: '服务组(L4)' },
  { key: 'projectManager', label: '项目经理' },
  { key: 'projectAmount', label: '项目金额' },
  { key: 'paymentStatus', label: '回款状态' },
  { key: 'paymentRatio', label: '完成率' },
].map((c) => ({ ...c, formatter: (v: unknown) => formatCellValue(v, c.key) }))

function onRowClick(row: Record<string, any>) {
  pd.open(row.projectId)
}
</script>

<template>
  <Modal
    :model-value="props.modelValue"
    :title="`${props.title} - 项目下钻（${props.projects.length}）`"
    width="90%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <DataTable :columns="COLS" :rows="props.projects.slice(0, 200)" clickable @row-click="onRowClick" />
    <div class="bd-hint">点击任意项目行查看详情</div>
  </Modal>
</template>

<style scoped>
.bd-hint { margin-top: 10px; font-size: var(--fs-1); color: var(--mut); }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/BoardDrilldownModal.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BoardDrilldownModal.vue frontend/src/components/BoardDrilldownModal.test.ts
git commit -m "feat(D4): BoardDrilldownModal 组内项目下钻 → 详情面板

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: BoardView — 多维看板单维页

**Files:**
- Create: `frontend/src/views/BoardView.vue`
- Test: `frontend/src/views/BoardView.test.ts`

维度选择（SegToggle）+ 排序（SegToggle）+ 对比图（ChartBox 堆叠柱：已回/待回）+ 自定义排名表（行 v-activate 可键盘操作，点行开下钻）。维度初值取 `route.query.dim`，默认 `orgL4`。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/views/BoardView.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import BoardView from './BoardView.vue'
import { useDataStore } from '@/stores/data'

// BoardView 用组合式 useRoute()，需 mock vue-router（global.mocks.$route 仅作用于选项式）
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

describe('BoardView', () => {
  it('默认按服务组渲染排名行', () => {
    seed()
    const w = mount(BoardView)
    const rows = w.findAll('.bv-body')
    expect(rows.length).toBe(2)
    expect(w.text()).toContain('北京')
    expect(w.text()).toContain('上海')
  })

  it('切换维度到项目经理后重算分组', async () => {
    seed()
    const w = mount(BoardView)
    await w.get('[data-test="seg-projectManager"]').trigger('click')
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('李四')
  })

  it('点击行打开下钻弹窗', async () => {
    seed()
    const w = mount(BoardView)
    await w.findAll('.bv-body')[0].trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/views/BoardView.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/views/BoardView.vue`:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { DIMENSIONS, groupByDims, type PivotGroup } from '@/lib/pivot'
import { fmtWan, pct } from '@/lib/format'
import ChartBox from '@/charts/ChartBox.vue'
import SegToggle from '@/components/SegToggle.vue'
import BoardDrilldownModal from '@/components/BoardDrilldownModal.vue'

const route = useRoute()
const data = useDataStore()
const filter = useFilterStore()

const DIM_OPTS = DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))
const SORT_OPTS = [
  { value: 'actualAmount', label: '已回款' },
  { value: 'completionRate', label: '完成率' },
  { value: 'projectCount', label: '项目数' },
  { value: 'delayedCount', label: '延期数' },
]

const initDim = typeof route.query.dim === 'string' && DIMENSIONS.some((d) => d.key === route.query.dim)
  ? (route.query.dim as string)
  : 'orgL4'
const dimKey = ref(initDim)
const sortKey = ref('actualAmount')

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

const drillOpen = ref(false)
const drillGroup = ref<PivotGroup | null>(null)
function openDrill(g: PivotGroup) {
  drillGroup.value = g
  drillOpen.value = true
}
defineExpose({ drillOpen })
</script>

<template>
  <div class="board-view">
    <p v-if="!data.data" class="bv-hint">暂无数据，请先在数据管理中同步/导入。</p>
    <template v-else>
      <div class="bv-toolbar">
        <div class="bv-ctl">
          <span class="bv-ctl-label">维度</span>
          <SegToggle v-model="dimKey" :options="DIM_OPTS" />
        </div>
        <div class="bv-ctl">
          <span class="bv-ctl-label">排序</span>
          <SegToggle v-model="sortKey" :options="SORT_OPTS" />
        </div>
      </div>

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
          <div
            v-for="g in groups"
            :key="g.key"
            v-activate
            class="bv-row bv-body"
            @click="openDrill(g)"
          >
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

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/views/BoardView.test.ts`
Expected: PASS（3 用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/BoardView.vue frontend/src/views/BoardView.test.ts
git commit -m "feat(D4): BoardView 多维看板单维页（维度/排序/对比图/排名下钻）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 路由 — 新增 /board，移除 /compare 与 /pmview

**Files:**
- Modify: `frontend/src/router/index.ts`
- Test: `frontend/src/router/index.test.ts`（若存在，更新断言）

- [ ] **Step 1: 改路由**

把 `frontend/src/router/index.ts` 整体替换为（删 CompareView/PmView import 与其路由，加 BoardView 与 /board）：

```ts
import { createRouter, createWebHistory } from 'vue-router'
import DashboardView from '@/views/DashboardView.vue'
import TierView from '@/views/TierView.vue'
import LedgerView from '@/views/LedgerView.vue'
import BoardView from '@/views/BoardView.vue'
import CalendarView from '@/views/CalendarView.vue'
import FollowupView from '@/views/FollowupView.vue'
import DataView from '@/views/DataView.vue'
import AboutView from '@/views/AboutView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/board', name: 'board', component: BoardView, meta: { title: '多维看板' } },
    { path: '/calendar', name: 'calendar', component: CalendarView, meta: { title: '回款日历' } },
    { path: '/followup', name: 'followup', component: FollowupView, meta: { title: '临期跟进' } },
    { path: '/ledger', name: 'ledger', component: LedgerView, meta: { title: '回款台账' } },
    { path: '/tier/:tab/:tier', name: 'tier', component: TierView, meta: { title: '业务分析' } },
    { path: '/data', name: 'data', component: DataView, meta: { title: '数据管理' } },
    { path: '/about', name: 'about', component: AboutView, meta: { title: '关于产品' } },
    // catch-all (including '/') renders DashboardView and is the canonical 'dashboard' name
    { path: '/:pathMatch(.*)*', name: 'dashboard', component: DashboardView, alias: '/', meta: { title: '看板首页' } },
  ],
})
```

- [ ] **Step 2: 更新/确认路由测试**

Run: `cd frontend && npm run test:run -- src/router/index.test.ts`
若该测试断言存在 `compare`/`pmview` 路由，改为断言 `board` 路由存在、`compare`/`pmview` 不存在；若文件不存在则跳过本步。运行至通过。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/router
git commit -m "feat(D4): 路由新增 /board，移除 /compare 与 /pmview

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 侧边栏 — 新增「分析 > 多维看板」，移除区间对比/项目经理视图

**Files:**
- Modify: `frontend/src/nav.ts`
- Modify: `frontend/src/layout/AppSidebar.vue`
- Test: `frontend/src/layout/AppSidebar.test.ts`（若断言旧入口则更新）

- [ ] **Step 1: 改 nav.ts**

把 `OVERVIEW_LINKS` 中的 `{ label: '区间对比', to: '/compare' }` 删除;把 `TOOL_LINKS` 中的 `{ label: '项目经理视图', to: '/pmview' }` 删除;新增导出 `ANALYSIS_LINKS`。即：

```ts
export const OVERVIEW_LINKS: NavLink[] = [
  { label: '看板首页', to: '/' },
  { label: '回款日历', to: '/calendar' },
  { label: '临期跟进', to: '/followup' },
  { label: '回款台账', to: '/ledger' },
]

export const ANALYSIS_LINKS: NavLink[] = [
  { label: '多维看板', to: '/board' },
]

export const TOOL_LINKS: NavLink[] = [
  { label: '数据管理', to: '/data' },
  { label: '关于产品', to: '/about' },
]
```

- [ ] **Step 2: 改 AppSidebar.vue**

在 `<script setup>` 的 import 把 `ANALYSIS_LINKS` 加入：

```ts
import { OVERVIEW_LINKS, ANALYSIS_LINKS, TOOL_LINKS, TIER_TABS, TIERS } from '@/nav'
```

模板里在「概览」section 之后、「业务分析」section 之前，插入新 section：

```vue
      <div class="section">
        <div class="section-label">分析</div>
        <RouterLink v-for="link in ANALYSIS_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>
```

- [ ] **Step 3: 更新/确认侧栏测试**

Run: `cd frontend && npm run test:run -- src/layout/AppSidebar.test.ts`
若断言存在「区间对比」「项目经理视图」则改为断言「多维看板」存在、二者不存在;运行至通过（文件不存在则跳过）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/nav.ts frontend/src/layout/AppSidebar.vue
git commit -m "feat(D4): 侧边栏新增「分析·多维看板」，移除区间对比/项目经理视图入口

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: OrgRanking 行接入 navContext 跳转 /board

**Files:**
- Modify: `frontend/src/components/OrgRanking.vue`
- Test: `frontend/src/components/OrgRanking.test.ts`（追加用例）

兑现 D3 留的「点行→带筛选跳多维看板」（/board 现已存在）。行用 `v-activate` 键盘可达 + `useRouter` + `goBoard(router, 'orgL4')`。

- [ ] **Step 1: 追加失败测试**

在 `frontend/src/components/OrgRanking.test.ts` 顶部加入 vue-router mock（组件用组合式 `useRouter()`），并在 describe 内追加用例。顶部 `import` 区之后加：

```ts
import { vi } from 'vitest'
const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))
```

describe 内追加：

```ts
it('点击排名行跳转 /board（orgL4 维度）', async () => {
  seed()
  pushSpy.mockClear()
  const w = mount(OrgRanking)
  await w.findAll('.rank-item')[0].trigger('click')
  expect(pushSpy).toHaveBeenCalledWith({ path: '/board', query: { dim: 'orgL4' } })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/OrgRanking.test.ts`
Expected: FAIL（行无点击行为）。

- [ ] **Step 3: 实现**

修改 `frontend/src/components/OrgRanking.vue` `<script setup>`：加入 router 与 goBoard，删去原「留 D4」注释：

```ts
import { useRouter } from 'vue-router'
import { goBoard } from '@/lib/navContext'
```

在 `const filter = useFilterStore()` 下加：

```ts
const router = useRouter()
```

把原注释行 `// 行点击「带筛选跳多维看板」...` 删除。

模板里把每个 `.rank-item` 行加 `v-activate` 与点击：

```vue
    <div
      v-for="(o, i) in ranked"
      :key="o.org"
      v-activate
      class="rank-item"
      @click="goBoard(router, 'orgL4')"
    >
```

`.rank-item` 样式补 `cursor: pointer;` 与 hover：

```css
.rank-item { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: var(--fs-2); cursor: pointer; border-radius: 6px; }
.rank-item:hover { background: var(--card2); }
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/OrgRanking.test.ts`
Expected: PASS（含原有用例）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OrgRanking.vue frontend/src/components/OrgRanking.test.ts
git commit -m "feat(D4): OrgRanking 行点击经 navContext 跳 /board(orgL4) + 键盘可达

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 删除被吸收的 compare 与 pmview 整链

**Files:**
- Delete: `frontend/src/views/CompareView.vue` `CompareView.test.ts`、`frontend/src/components/CompareCards.vue` `CompareCards.test.ts`、`frontend/src/lib/compare.ts` `compare.test.ts`
- Delete: `frontend/src/views/PmView.vue` `PmView.test.ts`、`frontend/src/components/PmRankingTable.vue` `PmRankingTable.test.ts`、`frontend/src/components/PmDrilldownModal.vue` `PmDrilldownModal.test.ts`、`frontend/src/lib/pmView.ts` `pmView.test.ts`

- [ ] **Step 1: 删除文件**

```bash
git rm frontend/src/views/CompareView.vue frontend/src/views/CompareView.test.ts \
       frontend/src/components/CompareCards.vue frontend/src/components/CompareCards.test.ts \
       frontend/src/lib/compare.ts frontend/src/lib/compare.test.ts \
       frontend/src/views/PmView.vue frontend/src/views/PmView.test.ts \
       frontend/src/components/PmRankingTable.vue frontend/src/components/PmRankingTable.test.ts \
       frontend/src/components/PmDrilldownModal.vue frontend/src/components/PmDrilldownModal.test.ts \
       frontend/src/lib/pmView.ts frontend/src/lib/pmView.test.ts
```

- [ ] **Step 2: 确认无残留引用**

Run: `rg -n "CompareView|CompareCards|PmView|PmRankingTable|PmDrilldownModal|lib/compare|lib/pmView|from '@/lib/compare'|from '@/lib/pmView'|/compare|/pmview" frontend/src`
Expected: 无输出（所有引用已随路由/侧栏/视图删除而清除）。若有命中（如 nav 残留或某处 import），定位并清理后重跑至无输出。

- [ ] **Step 3: 类型检查**

Run: `cd frontend && npm run typecheck`
Expected: 通过（无悬空 import / 类型引用）。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(D4): 删除被多维看板吸收的 compare 与 pmview 整链

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: 全量验证 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`（py_compile + ruff + pytest + 前端 typecheck/vitest/build 全绿）。

- [ ] **Step 2: 更新 PROGRESS.md**

- 顶部「最近更新」改为 2026-06-08（Plan D4 多维看板单维核心完成）。
- Phase D backlog 把 `- [ ] **D4** …` 改为 `- [x] **D4** …`，简述：lib/pivot(DIMENSIONS+groupByDims N维可扩展) + BoardView(/board 维度/排序/对比图/排名下钻) + BoardDrilldownModal(组内项目→D2详情) + navContext.goBoard + OrgRanking 接入跳转 + DataTable 加 row-click;删除 compare/pmview 整链与 /compare /pmview 路由及侧栏入口;新增侧栏「分析·多维看板」。
- 「会话交接备注」新增 D4 段：分支、产物、YAGNI（双维/N维留 D5/D6;navContext 暂一个消费者）、删除清单、下一步 D5。

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs(D4): PROGRESS 记录多维看板单维核心完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- `/board` 可切 6 维度做排名 + 对比图，行点击下钻该组项目，项目点击唤起 D2 详情面板;维度可由首页服务组排名带入（navContext）。
- compare/pmview 整链删除且无残留引用;`/compare` `/pmview` 路由与侧栏旧入口移除，新增「分析·多维看板」。
- `lib/pivot`/`lib/navContext` 新纯函数有 Vitest 覆盖;计算口径复用 groupByProject 未改算法。
- `bash verify.sh` 全绿;`PROGRESS.md` 已更新。
```
