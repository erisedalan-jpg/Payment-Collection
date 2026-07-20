# 分析页交付后打磨 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三回款页改可翻页 + 两分析页 KPI card 点击下钻 + L4 成本汇总排序与四金额列。

**Architecture:** 纯前端。分页统一复用既有 `usePagedRows` + Element Plus `el-pagination`（仿 `/projects`）。KPI 下钻把 `MetricGrid` 通用化（可选 `clickable` + `item-click` 事件），成本页就地筛选+滚动、里程碑页弹新 `MilestoneStatusModal`。L4 列扩展在 `costAnalysis.ts` 纯函数层累加，视图层加 `sortable` 与 `fmtWan` 列。数据全取自现有 `analysis_data.json`。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + Vitest + @vue/test-utils。

## Global Constraints

- 不使用任何 emoji；需要符号用 `→ ↓ ❌ ✕ ▾`。
- 样式只引用 `frontend/src/styles/theme.css` 令牌，不手写散值。
- 表格/金额/百分比数字列必须挂 `.u-num`（tabular-nums）。
- 金额展示：部门级聚合用 `fmtWan`（万）；既有「元」列不动。
- 回款页默认页大小 50，sizes `[20, 50, 80, 100]`。
- 版本 Z 级：`frontend/src/version.ts` 的 `APP_VERSION` 改为 `'V1.16.1'`（单一来源，只改此处）；`RELEASE_DATE` 保持 `'2026-06-20'`。
- 提交逐文件 `git add`，禁止 `git add -A/.`；commit message 结尾恒含一行
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- `data/analysis_data.json` 是 gitignored 产物，不提交；spec/plan/账本/memory 不提交。
- 测试断言 DataTable 行走 `findComponent(DataTable).props('rows')`，勿用 `w.text()`（el-table 行 jsdom 异步渲染）。

---

### Task 1: PayProjectsView 分页

**Files:**
- Modify: `frontend/src/views/PayProjectsView.vue`
- Test: `frontend/src/views/PayProjectsView.test.ts`

**Interfaces:**
- Consumes: `usePagedRows(source, size=50) → { paged, currentPage, pageSize }`（来自 `@/lib/usePagedRows`，既有）。
- Produces: 无（视图改动）。

- [ ] **Step 1: 写失败测试**（append 到 `PayProjectsView.test.ts`，文件顶部已 `import { mount, flushPromises }`、`ElementPlus`、stores；新增 `import DataTable from '@/components/DataTable.vue'` 到顶部 import 区）

```ts
it('分页:超过页大小只渲染一页,分页条 total=全量', async () => {
  const data = useDataStore(); useFilterStore().setPreset('all')
  data.data = {
    meta: { lastUpdate: 'x', totalProjects: 60, totalPaymentNodes: 0 },
    dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {},
    projects: Array.from({ length: 60 }, (_, i) => ({
      projectId: 'P' + i, projectName: '名' + i, projectManager: '张', orgL4: '组1',
      paymentPmis: { contract: 100, actualTotal: 50, paymentRatio: 0.5, nodeCount: 0, reachedCount: 0, delayedCount: 0 },
    })),
    projectPmis: {},
  } as any
  const w = mount(PayProjectsView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  expect((w.findComponent(DataTable).props('rows') as any[]).length).toBe(50)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/PayProjectsView.test.ts`
Expected: FAIL（当前渲染 60 行，断言期望 50）

- [ ] **Step 3: 实现** —— 改 `PayProjectsView.vue`

`<script setup>` 顶部 import 区加：

```ts
import { usePagedRows } from '@/lib/usePagedRows'
```

在 `const rows = computed(...)` 之后加：

```ts
const { paged, currentPage, pageSize } = usePagedRows(rows, 50)
```

模板里 DataTable 的 `:rows="rows"` 改为 `:rows="paged"`（其余 props/slot 不变）。在 `</DataTable>` 所在 `<div class="pov-tab">` 内、表之后加分页条：

```html
    <div class="pov-pager">
      <span class="u-num">共 {{ rows.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="rows.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
```

`<style scoped>` 内加（文件当前 style 块为空，补两条）：

```css
.pov-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pov-pager .u-num { font-size: var(--fs-1); color: var(--sub); }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/PayProjectsView.test.ts`
Expected: PASS（含原有 3 条用例，单项目用例 paged 返回该 1 行不受影响）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/PayProjectsView.vue frontend/src/views/PayProjectsView.test.ts
git commit -m "$(printf 'feat(payment): PayProjects 表分页(usePagedRows 50)消除全量渲染\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: PayNodesView 分页（汇总仍全集）

**Files:**
- Modify: `frontend/src/views/PayNodesView.vue`
- Test: `frontend/src/views/PayNodesView.test.ts`

**Interfaces:**
- Consumes: `usePagedRows`（同上）。
- Produces: 无。

**关键约束:** 顶部 `节点汇总`(`sum = nodeSummary(rows.value)`) 与 `维度分组`(`byDim`) 仍对**全集 `rows`** 聚合，只有底部明细 DataTable 分页。

- [ ] **Step 1: 写失败测试**（append 到 `PayNodesView.test.ts`，顶部已 import `DataTable`）

```ts
it('分页:节点表只渲染一页,汇总仍按全集', async () => {
  const data = useDataStore(); useFilterStore().setPreset('all')
  data.data = {
    projects: [{ projectId: 'A', projectName: '甲', orgL4: '组1', payment: { paymentRatio: 0.5 }, paymentPmis: { contract: 2_000_000 } }],
    paymentNodes: { A: Array.from({ length: 60 }, (_, i) => ({
      stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.1, expectedPayment: 1000, reached: true, status: '已回款',
    })) },
    projectPmis: { A: { progress: { 项目阶段: '实施' } } },
    naguanExclude: {},
  } as any
  const w = mount(PayNodesView, { global: { plugins: [ElementPlus] } })
  expect((w.findComponent(DataTable).props('rows') as any[]).length).toBe(50)
  expect(w.text()).toContain('节点总数')
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/PayNodesView.test.ts`
Expected: FAIL（渲染 60 行）

- [ ] **Step 3: 实现** —— 改 `PayNodesView.vue`

`import { computed, ref } from 'vue'` 行下方 import 区加：

```ts
import { usePagedRows } from '@/lib/usePagedRows'
```

在 `const sum = computed(() => nodeSummary(rows.value))` 之后（`byDim` 定义附近、COLS 之前皆可）加：

```ts
const { paged, currentPage, pageSize } = usePagedRows(rows, 50)
```

模板底部 DataTable 的 `:rows="rows"` 改为 `:rows="paged"`。在该 DataTable 之后（`</div>` 闭合 `.nodes-tab` 前）加分页条：

```html
    <div class="pn-pager">
      <span class="u-num">共 {{ rows.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="rows.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
```

`<style scoped>` 加：

```css
.pn-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pn-pager .u-num { font-size: var(--fs-1); color: var(--sub); }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/PayNodesView.test.ts`
Expected: PASS（原有 2 节点用例 paged 返回 2 行不变）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/PayNodesView.vue frontend/src/views/PayNodesView.test.ts
git commit -m "$(printf 'feat(payment): PayNodes 明细表分页(汇总/分组仍全集)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: PayPlanView 分页（消除 slice(0,300) 静默截断）

**Files:**
- Modify: `frontend/src/views/PayPlanView.vue`
- Test: `frontend/src/views/PayPlanView.test.ts`

**Interfaces:**
- Consumes: `usePagedRows`（对 `filteredRows` 分页）。
- Produces: 无。

**关键约束:** 保留手写表头与 `ColumnFilter`（跨筛选语义不动）；`<tbody>` 由 `filteredRows.slice(0, 300)` 改为 `paged`。

- [ ] **Step 1: 写失败测试**（append 到 `PayPlanView.test.ts`）

```ts
it('分页:超过页大小手写表只渲染一页', () => {
  const data = useDataStore()
  data.data = {
    projects: Array.from({ length: 60 }, (_, i) => ({
      projectId: 'P' + i, projectName: '名' + i, orgL4: '组1',
      payment: { paymentRatio: 0.5 }, paymentPmis: { contract: 100, actualTotal: 50 },
    })),
    projectPmis: {}, naguanExclude: {},
  } as any
  const w = mount(PayPlanView, { global: { plugins: [ElementPlus] } })
  expect(w.findAll('tr.prow').length).toBe(50)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/PayPlanView.test.ts`
Expected: FAIL（slice(0,300) 渲染 60 行）

- [ ] **Step 3: 实现** —— 改 `PayPlanView.vue`

`import { computed } from 'vue'` 改为：

```ts
import { computed } from 'vue'
import { usePagedRows } from '@/lib/usePagedRows'
```

在 `const filteredRows = computed(...)` 之后加：

```ts
const { paged, currentPage, pageSize } = usePagedRows(filteredRows, 50)
```

模板 `<tbody>` 内 `v-for="r in filteredRows.slice(0, 300)"` 改为 `v-for="r in paged"`。在 `</div>`（`.tbl-wrap`）之后、`</div>`（`.progress-tab`）之前加分页条：

```html
    <div class="pp-pager">
      <span class="u-num">共 {{ filteredRows.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filteredRows.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
```

`<style scoped>` 加：

```css
.pp-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pp-pager .u-num { font-size: var(--fs-1); color: var(--sub); }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/PayPlanView.test.ts`
Expected: PASS（原有 3 项目/空数据用例不变）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/PayPlanView.vue frontend/src/views/PayPlanView.test.ts
git commit -m "$(printf 'feat(payment): PayPlan 手写表分页替换 slice(0,300) 静默截断\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: MetricGrid 通用化（可选 clickable + item-click）

**Files:**
- Modify: `frontend/src/components/MetricGrid.vue`
- Test: `frontend/src/components/MetricGrid.test.ts`

**Interfaces:**
- Produces: `MetricGrid` item 类型新增可选 `clickable?: boolean`；新增 emit `'item-click': [number]`（传 item 索引）。未设 `clickable` 的卡片无交互（向后兼容既有所有用法）。

- [ ] **Step 1: 写失败测试**（append 到 `MetricGrid.test.ts`）

```ts
it('clickable item 点击 emit item-click 带索引;非 clickable 不 emit', async () => {
  const w = mount(MetricGrid, { props: { items: [
    { k: '总数', v: '10' },
    { k: '超支', v: '3', clickable: true },
  ] } })
  const cards = w.findAll('.mg-card')
  await cards[0].trigger('click')
  expect(w.emitted('item-click')).toBeUndefined()
  await cards[1].trigger('click')
  expect(w.emitted('item-click')).toEqual([[1]])
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/MetricGrid.test.ts`
Expected: FAIL（无 item-click 事件）

- [ ] **Step 3: 实现** —— 全量替换 `MetricGrid.vue`

```vue
<script setup lang="ts">
withDefaults(
  defineProps<{
    items: { k: string; v: string; sub?: string; cls?: string; clickable?: boolean }[]
    colMin?: string
  }>(),
  { colMin: '150px' },
)
const emit = defineEmits<{ 'item-click': [number] }>()
</script>

<template>
  <div class="u-grid-auto mg" :style="{ '--col-min': colMin }">
    <div v-for="(it, i) in items" :key="i" class="mg-card" :class="{ 'mg-card--clickable': it.clickable }"
      @click="it.clickable && emit('item-click', i)">
      <div class="mg-k">{{ it.k }}</div>
      <div class="mg-v u-num" :class="it.cls">{{ it.v }}</div>
      <div v-if="it.sub" class="mg-sub u-num">{{ it.sub }}</div>
    </div>
  </div>
</template>

<style scoped>
.mg { margin-bottom: var(--sp-3); }
.mg-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.mg-card--clickable { cursor: pointer; transition: background var(--dur-1) var(--ease); }
.mg-card--clickable:hover { background: var(--hover-tint); }
.mg-k { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.mg-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.mg-v.ok { color: var(--ok); }
.mg-v.warn { color: var(--warn); }
.mg-v.danger { color: var(--danger); }
.mg-v.mut { color: var(--mut); }
.mg-sub { font-size: var(--fs-1); color: var(--mut); margin-top: var(--sp-1); }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/MetricGrid.test.ts`
Expected: PASS（含原有渲染用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/MetricGrid.vue frontend/src/components/MetricGrid.test.ts
git commit -m "$(printf 'feat(MetricGrid): 可选 clickable + item-click(索引)向后兼容\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: milestoneProjectsByStatus 纯函数 + MilestoneStatusModal 组件

**Files:**
- Modify: `frontend/src/lib/milestoneAnalytics.ts`
- Create: `frontend/src/components/MilestoneStatusModal.vue`
- Test: `frontend/src/lib/milestoneAnalytics.test.ts`、`frontend/src/components/MilestoneStatusModal.test.ts`(Create)

**Interfaces:**
- Produces:
  - `export interface MilestoneStatusRow { projectId: string; projectName: string; manager: string; orgL4: string; contract: number; status: MilestoneStatus }`
  - `export function milestoneProjectsByStatus(ps: MilestoneProject[], status: MilestoneStatus | null): MilestoneStatusRow[]`（`status` 为 `null` 返回全部）
  - 组件 `MilestoneStatusModal`：props `{ modelValue: boolean; title: string; rows: MilestoneStatusRow[] }`，emit `'update:modelValue': [boolean]`。
- Consumes: `MilestoneProject`（既有，含 `projectId/projectName/manager/orgL4/contract/status`）、`fmtWan`（`@/lib/format`）。

- [ ] **Step 1: 写失败测试 A**（append 到 `milestoneAnalytics.test.ts`；把顶部 import 里追加 `milestoneProjectsByStatus`；文件已有 `mp()` 助手）

```ts
describe('milestoneProjectsByStatus', () => {
  const ps = [
    mp({ projectId: 'A', projectName: '甲', manager: '张', orgL4: 'D1', contract: 100, status: '正常' }),
    mp({ projectId: 'B', projectName: '乙', manager: '李', orgL4: 'D2', contract: 200, status: '严重延期' }),
  ]
  it('null 返回全部', () => {
    expect(milestoneProjectsByStatus(ps, null)).toHaveLength(2)
  })
  it('指定状态只返回该状态 + 字段映射', () => {
    expect(milestoneProjectsByStatus(ps, '严重延期')).toEqual([
      { projectId: 'B', projectName: '乙', manager: '李', orgL4: 'D2', contract: 200, status: '严重延期' },
    ])
  })
})
```

- [ ] **Step 2: 跑测试 A 确认失败**

Run: `cd frontend && npx vitest run src/lib/milestoneAnalytics.test.ts`
Expected: FAIL（`milestoneProjectsByStatus is not a function`）

- [ ] **Step 3: 实现纯函数** —— `milestoneAnalytics.ts` 在 `statusKpis` 之后加：

```ts
export interface MilestoneStatusRow {
  projectId: string; projectName: string; manager: string; orgL4: string; contract: number; status: MilestoneStatus
}
/** 按里程碑状态筛主域项目;status 为 null 返回全部。供 KPI 卡点击下钻弹窗用。 */
export function milestoneProjectsByStatus(ps: MilestoneProject[], status: MilestoneStatus | null): MilestoneStatusRow[] {
  return ps
    .filter((p) => status == null || p.status === status)
    .map((p) => ({ projectId: p.projectId, projectName: p.projectName, manager: p.manager, orgL4: p.orgL4, contract: p.contract, status: p.status }))
}
```

- [ ] **Step 4: 跑测试 A 确认通过**

Run: `cd frontend && npx vitest run src/lib/milestoneAnalytics.test.ts`
Expected: PASS

- [ ] **Step 5: 写失败测试 B** —— Create `frontend/src/components/MilestoneStatusModal.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneStatusModal from './MilestoneStatusModal.vue'
import DataTable from './DataTable.vue'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

const ModalStub = { props: ['title'], template: '<div class="modal-stub">{{ title }}<slot /></div>' }
const rows = [{ projectId: 'P1', projectName: '甲', manager: '张', orgL4: 'D1', contract: 100, status: '严重延期' }] as any[]
const opts = { global: { plugins: [ElementPlus], stubs: { Modal: ModalStub } } }

describe('MilestoneStatusModal', () => {
  it('打开时把 rows 传给 DataTable 且显示标题', () => {
    const w = mount(MilestoneStatusModal, { props: { modelValue: true, title: '严重延期', rows }, ...opts })
    expect(w.findComponent(DataTable).props('rows')).toHaveLength(1)
    expect(w.text()).toContain('严重延期')
  })
  it('行点击跳项目详情并关闭', async () => {
    pushSpy.mockClear()
    const w = mount(MilestoneStatusModal, { props: { modelValue: true, title: 't', rows }, ...opts })
    await w.findComponent(DataTable).vm.$emit('row-click', rows[0])
    expect(pushSpy).toHaveBeenCalledWith('/project/P1')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
```

- [ ] **Step 6: 跑测试 B 确认失败**

Run: `cd frontend && npx vitest run src/components/MilestoneStatusModal.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 7: 实现组件** —— Create `frontend/src/components/MilestoneStatusModal.vue`

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'
import { fmtWan } from '@/lib/format'
import type { MilestoneStatusRow } from '@/lib/milestoneAnalytics'

const props = defineProps<{ modelValue: boolean; title: string; rows: MilestoneStatusRow[] }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()
const router = useRouter()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 140 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'manager', label: '经理', width: 80 },
  { key: 'orgL4', label: 'L4', width: 110 },
  { key: 'contract', label: '合同(万)', width: 110, num: true, formatter: (v) => fmtWan(v as number) },
  { key: 'status', label: '状态', width: 90 },
]

function onRow(row: Record<string, any>) {
  emit('update:modelValue', false)
  router.push('/project/' + row.projectId)
}
</script>

<template>
  <Modal :model-value="props.modelValue" :title="props.title" width="60%"
    @update:model-value="emit('update:modelValue', $event)">
    <DataTable :columns="COLS" :rows="props.rows" :show-count="false" clickable @row-click="onRow">
      <template #cell-projectId="{ value }"><span class="msm-link">{{ value }}</span></template>
    </DataTable>
  </Modal>
</template>

<style scoped>
.msm-link { color: var(--accent); cursor: pointer; }
</style>
```

- [ ] **Step 8: 跑测试 B 确认通过**

Run: `cd frontend && npx vitest run src/components/MilestoneStatusModal.test.ts`
Expected: PASS

- [ ] **Step 9: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/lib/milestoneAnalytics.ts frontend/src/lib/milestoneAnalytics.test.ts frontend/src/components/MilestoneStatusModal.vue frontend/src/components/MilestoneStatusModal.test.ts
git commit -m "$(printf 'feat(milestone): milestoneProjectsByStatus + MilestoneStatusModal(状态项目清单弹窗)\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 6: MilestoneView 接 KPI 下钻弹窗

**Files:**
- Modify: `frontend/src/views/MilestoneView.vue`
- Test: `frontend/src/views/MilestoneView.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `MetricGrid` `item-click`、Task 5 的 `milestoneProjectsByStatus`/`MilestoneStatusRow`/`MilestoneStatusModal`、既有 `MilestoneStatus` 类型。
- Produces: 无。

- [ ] **Step 1: 写失败测试**（append 到 `MilestoneView.test.ts`；顶部 import 区加 `import MilestoneStatusModal from '@/components/MilestoneStatusModal.vue'`；`MetricGrid` 已 import）

```ts
it('点 KPI(严重延期)开状态弹窗,rows 仅严重延期项目', async () => {
  seed()
  const w = mount(MilestoneView, opts)
  w.findComponent(MetricGrid).vm.$emit('item-click', 3)
  await w.vm.$nextTick()
  const modal = w.findComponent(MilestoneStatusModal)
  expect(modal.props('modelValue')).toBe(true)
  const mrows = modal.props('rows') as any[]
  expect(mrows.length).toBe(1)
  expect(mrows.every((r) => r.status === '严重延期')).toBe(true)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/MilestoneView.test.ts`
Expected: FAIL（无 MilestoneStatusModal）

- [ ] **Step 3: 实现** —— 改 `MilestoneView.vue`

import 区：把 `milestoneAnalytics` 的具名导入追加 `milestoneProjectsByStatus`、`type MilestoneStatus`、`type MilestoneStatusRow`；并加组件 import：

```ts
import MilestoneStatusModal from '@/components/MilestoneStatusModal.vue'
```

`kpiItems` computed 的 5 个 item 各加 `clickable: true`：

```ts
return [
  { k: '项目总数', v: String(k.total), clickable: true },
  { k: '正常', v: String(k.normal), sub: p(k.normal), cls: 'ok', clickable: true },
  { k: '延期', v: String(k.delayed), sub: p(k.delayed), cls: 'warn', clickable: true },
  { k: '严重延期', v: String(k.severe), sub: p(k.severe), cls: 'danger', clickable: true },
  { k: '未发布', v: String(k.unpublished), sub: p(k.unpublished), cls: 'mut', clickable: true },
]
```

在 `const drillOpen = ref(false)` 一带加状态弹窗逻辑：

```ts
const KPI_STATUS: (MilestoneStatus | null)[] = [null, '正常', '延期', '严重延期', '未发布']
const statusOpen = ref(false)
const statusTitle = ref('')
const statusRows = ref<MilestoneStatusRow[]>([])
function onKpiClick(i: number) {
  statusRows.value = milestoneProjectsByStatus(mps.value, KPI_STATUS[i])
  statusTitle.value = kpiItems.value[i].k
  statusOpen.value = true
}
```

模板 `<MetricGrid :items="kpiItems" />` 改为：

```html
      <MetricGrid :items="kpiItems" @item-click="onKpiClick" />
```

在 `<MilestoneDrillModal ... />` 一行之后加：

```html
      <MilestoneStatusModal v-model="statusOpen" :title="statusTitle" :rows="statusRows" />
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/MilestoneView.test.ts`
Expected: PASS（含原有概览/节点/明细 tab 用例）

- [ ] **Step 5: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/views/MilestoneView.vue frontend/src/views/MilestoneView.test.ts
git commit -m "$(printf 'feat(milestone): KPI 卡点击下钻状态项目弹窗\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 7: costAnalysis 扩四金额字段

**Files:**
- Modify: `frontend/src/lib/costAnalysis.ts`
- Test: `frontend/src/lib/costAnalysis.test.ts`

**Interfaces:**
- Produces:
  - `CostRow` 新增 `deliveryDeptRemaining: number`、`deliveryOutsourceRemaining: number`。
  - `CostL4Summary` 新增 `contractTotal: number`、`remainingTotal: number`、`deliveryDeptRemaining: number`、`deliveryOutsourceRemaining: number`。
- Consumes: `Project.deliveryCosts`（既有，数组项 `{ 类别, 剩余预算? }`）、`Project.paymentPmis.contract`、`ProjectPmis.cost.剩余预算`。

- [ ] **Step 1: 写失败测试**（改 `costAnalysis.test.ts`）

先把 `cr()` 助手补两默认字段：

```ts
function cr(o: Partial<any> = {}): any {
  return { projectId: 'W', projectName: 'x', projectType: '', orgL3: '', orgL3_1: '', orgL4: 'D1', manager: '', amount: 0, status: '未超支', totalBudget: 0, actualCost: 0, remaining: 0, xs: false, deliveryDeptRemaining: 0, deliveryOutsourceRemaining: 0, ...o }
}
```

在 `describe('buildCostRows', ...)` 内追加用例：

```ts
it('交付剩余字段映射(缺类别/无 deliveryCosts → 0)', () => {
  const projects2 = [
    { projectId: 'W1', projectName: 'a', projectManager: '', orgL4: 'D1', orgL3_1: '', paymentPmis: { contract: 500 },
      deliveryCosts: [{ 类别: '交付部门人工成本', 剩余预算: 30 }, { 类别: '交付外包服务成本', 剩余预算: 70 }] },
    { projectId: 'W2', projectName: 'b', projectManager: '', orgL4: 'D1', orgL3_1: '', paymentPmis: { contract: 200 } },
  ] as any
  const pmis2 = { W1: { cost: { 剩余预算: 5 } }, W2: { cost: { 剩余预算: 9 } } } as any
  const rows = buildCostRows(projects2, pmis2)
  expect(rows[0]).toMatchObject({ amount: 500, remaining: 5, deliveryDeptRemaining: 30, deliveryOutsourceRemaining: 70 })
  expect(rows[1]).toMatchObject({ amount: 200, deliveryDeptRemaining: 0, deliveryOutsourceRemaining: 0 })
})
```

在 `describe('costKpis / costL4Dist / costL4Summary(均剔 XS)', ...)` 内追加用例：

```ts
it('L4 汇总四金额列求和(剔 XS)', () => {
  const rows = [
    cr({ orgL4: 'A', amount: 1000, remaining: 100, deliveryDeptRemaining: 10, deliveryOutsourceRemaining: 20 }),
    cr({ orgL4: 'A', amount: 2000, remaining: -50, deliveryDeptRemaining: 5, deliveryOutsourceRemaining: 0 }),
    cr({ orgL4: 'A', amount: 9999, xs: true }),
  ]
  const a = costL4Summary(rows).find((x) => x.orgL4 === 'A')!
  expect(a).toMatchObject({ contractTotal: 3000, remainingTotal: 50, deliveryDeptRemaining: 15, deliveryOutsourceRemaining: 20 })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts`
Expected: FAIL（新字段 undefined）

- [ ] **Step 3: 实现** —— 改 `costAnalysis.ts`

`CostRow` 接口加两字段：

```ts
export interface CostRow {
  projectId: string; projectName: string; projectType: string
  orgL3: string; orgL3_1: string; orgL4: string; manager: string
  amount: number; status: CostStatus
  totalBudget: number; actualCost: number; remaining: number; xs: boolean
  deliveryDeptRemaining: number; deliveryOutsourceRemaining: number
}
```

`buildCostRows` 的 `.map` 内，`const rb = cost.剩余预算` 之后加：

```ts
    const dc = p.deliveryCosts ?? []
    const findRem = (cat: string) => Number(dc.find((c) => c.类别 === cat)?.剩余预算 ?? 0)
```

并在返回对象末尾（`xs:` 行之后）加：

```ts
      deliveryDeptRemaining: findRem('交付部门人工成本'),
      deliveryOutsourceRemaining: findRem('交付外包服务成本'),
```

`CostL4Summary` 接口加四字段：

```ts
export interface CostL4Summary { orgL4: string; total: number; normal: number; under5k: number; over5k: number; over5kRatio: number; contractTotal: number; remainingTotal: number; deliveryDeptRemaining: number; deliveryOutsourceRemaining: number }
```

`costL4Summary` 的初始化对象改为含四个 0：

```ts
    if (!m[d]) m[d] = { orgL4: d, total: 0, normal: 0, under5k: 0, over5k: 0, over5kRatio: 0, contractTotal: 0, remainingTotal: 0, deliveryDeptRemaining: 0, deliveryOutsourceRemaining: 0 }
```

在 `m[d].total++` 之后（状态分支前后皆可）加累加：

```ts
    m[d].contractTotal += r.amount
    m[d].remainingTotal += r.remaining
    m[d].deliveryDeptRemaining += r.deliveryDeptRemaining
    m[d].deliveryOutsourceRemaining += r.deliveryOutsourceRemaining
```

（`over5kRatio` 计算与 `.sort(localeCompare)` 不动。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/costAnalysis.test.ts`
Expected: PASS（原有 isXs/costStatusOf/buildCostRows/KPI/Dist/Summary 用例均不破——新字段经 toMatchObject 兼容）

- [ ] **Step 5: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/lib/costAnalysis.ts frontend/src/lib/costAnalysis.test.ts
git commit -m "$(printf 'feat(cost): CostRow/CostL4Summary 扩 合同总额/剩余/交付部门剩余/交付外包剩余 四金额\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 8: CostDetailView KPI 就地下钻 + L4 表排序/四列 + 版本号

**Files:**
- Modify: `frontend/src/views/CostDetailView.vue`、`frontend/src/version.ts`
- Test: `frontend/src/views/CostDetailView.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `MetricGrid` `item-click`、Task 7 的 `CostL4Summary` 四字段、`fmtWan`（`@/lib/format`）。
- Produces: 无。

**关键约束:**
- KPI 文案大写 `5K` → 行/筛选状态值小写 `5k`，用常量 `KPI_STATUS = [null, '未超支', '超支不足5k', '超支大于5k']` 映射，不能直接取 KPI 文案。
- L4 新四列走默认 slot + `formatter`（DataTable 默认 slot 应用 formatter）；`over5kRatio` 自定义 slot 保留。
- jsdom 无 `scrollIntoView`，测试需先 `Element.prototype.scrollIntoView = vi.fn()`。

- [ ] **Step 1: 写失败测试**（改 `CostDetailView.test.ts`；顶部已 import `MetricGrid`、`DataTable`、`ChartBox`）

在 `describe('CostDetailView 上半', ...)` 内追加两用例：

```ts
it('点 KPI(超支大于5K)就地筛选明细表;点总数恢复', async () => {
  ;(Element.prototype as any).scrollIntoView = vi.fn()
  seed()
  const w = mount(CostDetailView, opts)
  w.findComponent(MetricGrid).vm.$emit('item-click', 3)
  await w.vm.$nextTick()
  const tables = w.findAllComponents({ name: 'DataTable' })
  const detail = tables[tables.length - 1]
  expect((detail.props('rows') as any[]).map((r) => r.projectId)).toEqual(['WS1'])
  w.findComponent(MetricGrid).vm.$emit('item-click', 0)
  await w.vm.$nextTick()
  expect((detail.props('rows') as any[]).length).toBe(3)
})
it('L4 汇总表含四金额列(可排序)且求和正确', () => {
  seed()
  const w = mount(CostDetailView, opts)
  const l4 = w.findAllComponents({ name: 'DataTable' })[0]
  const cols = l4.props('columns') as any[]
  expect(cols.map((c) => c.key)).toEqual(expect.arrayContaining(['contractTotal', 'remainingTotal', 'deliveryDeptRemaining', 'deliveryOutsourceRemaining']))
  expect(cols.find((c) => c.key === 'orgL4').sortable).toBe(true)
  const d1 = (l4.props('rows') as any[]).find((r) => r.orgL4 === 'D1')
  expect(d1.contractTotal).toBe(2500000)
  expect(d1.remainingTotal).toBe(-7900)
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/CostDetailView.test.ts`
Expected: FAIL（无 item-click 处理 / 无四列）

- [ ] **Step 3: 实现** —— 改 `CostDetailView.vue`

import 区加：

```ts
import { fmtWan } from '@/lib/format'
```

`kpiItems` computed 的 4 个 item 各加 `clickable: true`：

```ts
  return [
    { k: '成本统计项目数', v: String(k.total), clickable: true },
    { k: '未超支', v: String(k.normal), cls: 'ok', clickable: true },
    { k: '超支不足5K', v: String(k.under5k), cls: 'warn', clickable: true },
    { k: '超支大于5K', v: String(k.over5k), cls: 'danger', clickable: true },
  ]
```

`const router = useRouter()` 一带加下钻逻辑（`fStatus` 已在该文件定义）：

```ts
const detailCardRef = ref<HTMLElement | null>(null)
const KPI_STATUS = [null, '未超支', '超支不足5k', '超支大于5k'] as const
function onKpiClick(i: number) {
  const s = KPI_STATUS[i]
  fStatus.value = s ? [s] : []
  detailCardRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
```

`L4_COLS` 整体替换为（原列加 `sortable: true` + 追加四列）：

```ts
const L4_COLS: DataColumn[] = [
  { key: 'orgL4', label: 'L4部门', width: 140, sortable: true },
  { key: 'total', label: '项目总数', width: 90, num: true, sortable: true },
  { key: 'normal', label: '未超支', width: 90, num: true, sortable: true },
  { key: 'under5k', label: '超支不足5k', width: 110, num: true, sortable: true },
  { key: 'over5k', label: '超支大于5k', width: 110, num: true, sortable: true },
  { key: 'over5kRatio', label: '超支占比', width: 100, num: true, sortable: true },
  { key: 'contractTotal', label: '合同总额(万)', width: 120, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'remainingTotal', label: '剩余预算(万)', width: 120, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'deliveryDeptRemaining', label: '交付部门剩余(万)', width: 130, num: true, sortable: true, formatter: (v) => fmtWan(v) },
  { key: 'deliveryOutsourceRemaining', label: '交付外包剩余(万)', width: 130, num: true, sortable: true, formatter: (v) => fmtWan(v) },
]
```

模板：`<MetricGrid :items="kpiItems" :col-min="'160px'" />` 改为：

```html
      <MetricGrid :items="kpiItems" :col-min="'160px'" @item-click="onKpiClick" />
```

给「项目成本明细」卡片加 ref —— 把 `<div class="cd-card">`（含 `项目成本明细(按 L4 组织排序)` 那个，是模板中第三个 `.cd-card`、`v-else` 块内最后一个）改为：

```html
      <div class="cd-card" ref="detailCardRef">
```

- [ ] **Step 4: 改版本号** —— `frontend/src/version.ts`

```ts
export const APP_VERSION = 'V1.16.1'
```

（`RELEASE_DATE` 保持 `'2026-06-20'`。）

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/CostDetailView.test.ts`
Expected: PASS（含原有明细/上半用例）

- [ ] **Step 6: typecheck + 提交**

```bash
cd frontend && npm run typecheck
```
Expected: 无错误

```bash
git add frontend/src/views/CostDetailView.vue frontend/src/views/CostDetailView.test.ts frontend/src/version.ts
git commit -m "$(printf 'feat(cost): KPI 就地筛选下钻 + L4 表排序/四金额列;版本 V1.16.1\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## 收尾验证（全部任务后）

```bash
bash verify.sh
```
Expected: 全绿（ruff + pytest + 前端 typecheck/vitest/build）。

手动冒烟（`python server.py` + `cd frontend && npm run dev`）：
- `/payment/{projects,nodes,plan}` 首屏快、底部分页可翻页、PayNodes 上方汇总仍是全集口径。
- `/insight/milestone` 点任一 KPI 卡 → 弹窗列出该状态项目、行可进详情。
- `/insight/costdetail` 点 KPI 卡 → 下方明细表按成本状态筛选并滚动到表；L4 汇总表可点列头排序、四金额列(万)数值合理。
```
