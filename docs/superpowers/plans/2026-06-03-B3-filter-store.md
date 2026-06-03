# Plan B3：筛选状态与控件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把旧版散落的 ~30 个筛选相关全局变量与 `getFilteredNodes()` 收敛为前端 `filterStore`（年份/视角/纳管），并提供一个 `FilterBar` 控件。这是页面（B4+）渲染前的核心状态模型。

**Architecture:** 纯前端。把筛选**纯逻辑**抽到 `lib/filterNodes.ts`（可独立单测），`filterStore`（Pinia）在其上叠加状态/持久化/选项派生，`FilterBar.vue` 是 UI。**行为忠实移植**自旧版 `app.js` 的 `getFilteredNodes`/`_getFilterYearStartMonth`/纳管逻辑。Phase B 第三块，自成可测闭环。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Vitest（B1/B2 已装）。

参考：spec §4 数据契约（RawNode 字段 orgL4/projectManager/planMonth/projectId）；旧版语义见 `app.js`（`getFilteredNodes` 1560-1603、年月辅助 464-493、纳管 155-182、`filterYear` 461、年份选项 ClockService.getYearOptions 89-140）。数据来自 B1 `useDataStore`。

**不在本计划（拆到 B4/B5+）：** 通用组件 `DataTable`/`ChartBox`/`Modal`（B4）；各页面真实内容（B5+）。FilterBar 用原生 `<select>`/`<input>` 控件（可测、简单）；视觉上的 Element Plus 化与浮动 dock 交互留后续按需做（用户已接受展示改动）。

---

## File Structure（B3 产出）

```
frontend/src/
├── lib/filterNodes.ts          # 纯筛选函数（忠实移植 getFilteredNodes 语义）
├── lib/filterNodes.test.ts
├── stores/filter.ts            # Pinia：年份/视角/纳管 + filteredNodes/选项派生
├── stores/filter.test.ts
├── layout/FilterBar.vue        # 年份/视角/纳管 控件
├── layout/FilterBar.test.ts
└── layout/AppLayout.vue        # 改：在 main 顶部加 <FilterBar/>
```

约定：从 `frontend/` 运行 npm；提交信息末尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。Windows，Bash 工具。

---

### Task 1: 纯筛选函数 lib/filterNodes.ts

**Files:** Create `frontend/src/lib/filterNodes.ts`、`frontend/src/lib/filterNodes.test.ts`。

忠实移植 `app.js:getFilteredNodes` 语义：视角(l4/pm) → 纳管 → 年份/季度/累计。无 `planMonth` 的节点在年/季筛选中被排除（与旧版 `n.planMonth && ...` 一致）。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/filterNodes.test.ts
import { describe, it, expect } from 'vitest'
import { filterNodes, type FilterOpts } from './filterNodes'

const NODES: any[] = [
  { projectId: 'P1', orgL4: '北京服务组', projectManager: '张三', planMonth: '2026-02' },
  { projectId: 'P2', orgL4: '上海一服务组', projectManager: '李四', planMonth: '2026-05' },
  { projectId: 'P3', orgL4: '北京服务组', projectManager: '张三', planMonth: '2027-03' },
  { projectId: 'P4', orgL4: '上海一服务组', projectManager: '王五', planMonth: '' }, // 无月份
]

function opts(over: Partial<FilterOpts> = {}): FilterOpts {
  return {
    filterYear: 'all', viewMode: 'global', viewL4: '', viewPM: '',
    naguanOn: false, naguanExclude: {}, ...over,
  }
}

describe('filterNodes', () => {
  it('all returns everything', () => {
    expect(filterNodes(NODES, opts()).map((n) => n.projectId)).toEqual(['P1', 'P2', 'P3', 'P4'])
  })

  it('plain year filters by planMonth within that year', () => {
    expect(filterNodes(NODES, opts({ filterYear: '2026' })).map((n) => n.projectId)).toEqual(['P1', 'P2'])
  })

  it('quarter filters by month range', () => {
    expect(filterNodes(NODES, opts({ filterYear: '2026-Q1' })).map((n) => n.projectId)).toEqual(['P1'])
  })

  it('upto-year is cumulative (<= year-12)', () => {
    expect(filterNodes(NODES, opts({ filterYear: 'upto2026' })).map((n) => n.projectId)).toEqual(['P1', 'P2'])
  })

  it('upto-quarter behaves like the quarter range', () => {
    expect(filterNodes(NODES, opts({ filterYear: 'upto2026-Q2' })).map((n) => n.projectId)).toEqual(['P1', 'P2'])
  })

  it('nodes without planMonth are excluded in year filters', () => {
    expect(filterNodes(NODES, opts({ filterYear: '2026' })).some((n) => n.projectId === 'P4')).toBe(false)
  })

  it('l4 view filters by orgL4', () => {
    expect(filterNodes(NODES, opts({ viewMode: 'l4', viewL4: '北京服务组' })).map((n) => n.projectId)).toEqual(['P1', 'P3'])
  })

  it('pm view filters by projectManager', () => {
    expect(filterNodes(NODES, opts({ viewMode: 'pm', viewPM: '李四' })).map((n) => n.projectId)).toEqual(['P2'])
  })

  it('naguan excludes flagged projectIds when on', () => {
    const r = filterNodes(NODES, opts({ naguanOn: true, naguanExclude: { P2: true } }))
    expect(r.map((n) => n.projectId)).toEqual(['P1', 'P3', 'P4'])
  })

  it('view + year combine', () => {
    const r = filterNodes(NODES, opts({ viewMode: 'l4', viewL4: '北京服务组', filterYear: '2026' }))
    expect(r.map((n) => n.projectId)).toEqual(['P1'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/filterNodes.test.ts`
Expected: FAIL（找不到 `./filterNodes`）。

- [ ] **Step 3: 写实现 `frontend/src/lib/filterNodes.ts`**

```ts
import type { RawNode } from '@/types/analysis'

export type ViewMode = 'global' | 'l4' | 'pm'

export interface FilterOpts {
  filterYear: string // 'all' | '2026' | 'upto2026' | '2026-Q1' | 'upto2026-Q1'
  viewMode: ViewMode
  viewL4: string
  viewPM: string
  naguanOn: boolean
  naguanExclude: Record<string, boolean>
}

const Q_RANGE: Record<string, [string, string]> = {
  Q1: ['01', '03'], Q2: ['04', '06'], Q3: ['07', '09'], Q4: ['10', '12'],
}

/** 忠实移植 app.js getFilteredNodes：视角 → 纳管 → 年份/季度/累计。
 *  无 planMonth 的节点在年/季筛选中被排除。 */
export function filterNodes(rawNodes: RawNode[], opts: FilterOpts): RawNode[] {
  let nodes = rawNodes
  if (opts.viewMode === 'l4' && opts.viewL4) nodes = nodes.filter((n) => n.orgL4 === opts.viewL4)
  if (opts.viewMode === 'pm' && opts.viewPM) nodes = nodes.filter((n) => n.projectManager === opts.viewPM)
  if (opts.naguanOn && opts.naguanExclude) nodes = nodes.filter((n) => !opts.naguanExclude[n.projectId])

  const fy = opts.filterYear
  if (fy === 'all') return nodes

  if (fy.includes('-Q')) {
    const keyPart = fy.startsWith('upto') ? fy.slice(4) : fy
    const [qYear, qn] = keyPart.split('-Q')
    const range = Q_RANGE['Q' + qn]
    if (!range) return nodes
    const mStart = `${qYear}-${range[0]}`
    const mEnd = `${qYear}-${range[1]}`
    return nodes.filter((n) => !!n.planMonth && n.planMonth >= mStart && n.planMonth <= mEnd)
  }

  if (fy.startsWith('upto')) {
    const endOfYear = `${fy.slice(4)}-12`
    return nodes.filter((n) => !!n.planMonth && n.planMonth <= endOfYear)
  }

  const startOfYear = `${fy}-01`
  const endOfYear = `${fy}-12`
  return nodes.filter((n) => !!n.planMonth && n.planMonth >= startOfYear && n.planMonth <= endOfYear)
}
```

注：`RawNode` 的 `orgL4`/`projectManager` 是 schema 的 extra 字段，生成的 `analysis.ts` 接口含索引签名 `[k: string]: unknown`，故 `n.orgL4 === opts.viewL4`（unknown === string）类型检查通过。若 typecheck 报这两字段不存在，确认 `analysis.ts` 的 `RawNode` 是否有索引签名；如确实没有，则在本文件顶部对节点访问做 `(n as any).orgL4` 兜底，并在报告中说明。

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/filterNodes.test.ts`（10 passed）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/filterNodes.ts frontend/src/lib/filterNodes.test.ts
git commit -m "feat(frontend): 纯筛选函数 filterNodes（忠实移植 getFilteredNodes 语义）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: filterStore（年份/视角/纳管 + 派生）

**Files:** Create `frontend/src/stores/filter.ts`、`frontend/src/stores/filter.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/stores/filter.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFilterStore } from './filter'
import { useDataStore } from './data'

const SAMPLE = {
  meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
  dashboard: {}, summary: {},
  rawNodes: [
    { projectId: 'P1', orgL4: '北京服务组', projectManager: '张三', planMonth: '2026-02' },
    { projectId: 'P2', orgL4: '上海一服务组', projectManager: '李四', planMonth: '2027-05' },
  ],
  projectOverview: { projects: [], columns: [] },
  naguanMap: {}, naguanExclude: { P2: true }, displayColumns: {}, followupRecords: {},
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function withData() {
  const ds = useDataStore()
  ds.data = SAMPLE as any
  return useFilterStore()
}

describe('filter store', () => {
  it('defaults: year=all, view=global, naguan on', () => {
    const f = useFilterStore()
    expect(f.filterYear).toBe('all')
    expect(f.viewMode).toBe('global')
    expect(f.naguanOn).toBe(true)
  })

  it('filteredNodes applies year filter over dataStore rawNodes', () => {
    const f = withData()
    f.naguanOn = false
    f.setYear('2026')
    expect(f.filteredNodes.map((n: any) => n.projectId)).toEqual(['P1'])
  })

  it('naguan on excludes flagged ids', () => {
    const f = withData() // naguanOn defaults true
    expect(f.filteredNodes.map((n: any) => n.projectId)).toEqual(['P1'])
  })

  it('toggleNaguan persists to localStorage', () => {
    const f = useFilterStore()
    f.toggleNaguan(false)
    expect(f.naguanOn).toBe(false)
    expect(localStorage.getItem('naguan_on')).toBe('false')
  })

  it('yearOptions include all + current year', () => {
    const f = useFilterStore()
    const keys = f.yearOptions.map((o) => o.key)
    expect(keys).toContain('all')
    expect(keys).toContain(String(new Date().getFullYear()))
  })

  it('l4Options / pmOptions derive distinct values from data', () => {
    const f = withData()
    expect(f.l4Options.sort()).toEqual(['上海一服务组', '北京服务组'])
    expect(f.pmOptions.sort()).toEqual(['张三', '李四'].sort())
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts`
Expected: FAIL（找不到 `./filter`）。

- [ ] **Step 3: 写实现 `frontend/src/stores/filter.ts`**

```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDataStore } from './data'
import { filterNodes, type ViewMode } from '@/lib/filterNodes'

const NAGUAN_KEY = 'naguan_on'

export interface YearOption { key: string; label: string }

function buildYearOptions(): YearOption[] {
  const y = new Date().getFullYear()
  const qs = ['Q1', 'Q2', 'Q3', 'Q4']
  const opts: YearOption[] = [
    { key: 'all', label: '全部' },
    { key: String(y), label: '本年度' },
    { key: String(y + 1), label: '下一年度' },
    { key: `upto${y}`, label: '至本年度' },
    { key: `upto${y + 1}`, label: '至下一年度' },
  ]
  for (const yr of [y, y + 1]) {
    for (const q of qs) opts.push({ key: `${yr}-${q}`, label: `${yr}年${q}季度` })
  }
  for (const yr of [y, y + 1]) {
    for (const q of qs) opts.push({ key: `upto${yr}-${q}`, label: `至${yr}年${q}季度` })
  }
  return opts
}

export const useFilterStore = defineStore('filter', () => {
  const data = useDataStore()

  const filterYear = ref('all')
  const viewMode = ref<ViewMode>('global')
  const viewL4 = ref('')
  const viewPM = ref('')
  const naguanOn = ref(localStorage.getItem(NAGUAN_KEY) !== 'false') // 默认开启

  const yearOptions = computed(buildYearOptions)

  const l4Options = computed(() => {
    const set = new Set<string>()
    for (const n of data.data?.rawNodes ?? []) {
      const v = (n as { orgL4?: string }).orgL4
      if (v) set.add(v)
    }
    return [...set]
  })

  const pmOptions = computed(() => {
    const set = new Set<string>()
    for (const n of data.data?.rawNodes ?? []) {
      const v = (n as { projectManager?: string }).projectManager
      if (v) set.add(v)
    }
    return [...set]
  })

  const filteredNodes = computed(() =>
    filterNodes(data.data?.rawNodes ?? [], {
      filterYear: filterYear.value,
      viewMode: viewMode.value,
      viewL4: viewL4.value,
      viewPM: viewPM.value,
      naguanOn: naguanOn.value,
      naguanExclude: (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
    }),
  )

  function setYear(key: string) {
    filterYear.value = key
  }
  function setViewGlobal() {
    viewMode.value = 'global'
    viewL4.value = ''
    viewPM.value = ''
  }
  function setViewL4(dept: string) {
    viewMode.value = 'l4'
    viewL4.value = dept
    viewPM.value = ''
  }
  function setViewPM(pm: string) {
    viewMode.value = 'pm'
    viewPM.value = pm
    viewL4.value = ''
  }
  function toggleNaguan(on: boolean) {
    naguanOn.value = on
    localStorage.setItem(NAGUAN_KEY, on ? 'true' : 'false')
  }

  return {
    filterYear, viewMode, viewL4, viewPM, naguanOn,
    yearOptions, l4Options, pmOptions, filteredNodes,
    setYear, setViewGlobal, setViewL4, setViewPM, toggleNaguan,
  }
})
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/stores/filter.test.ts`（6 passed）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/filter.ts frontend/src/stores/filter.test.ts
git commit -m "feat(frontend): filterStore（年份/视角/纳管 + filteredNodes/选项派生）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: FilterBar 控件 + 接入 AppLayout

**Files:** Create `frontend/src/layout/FilterBar.vue`、`frontend/src/layout/FilterBar.test.ts`；Modify `frontend/src/layout/AppLayout.vue`、`frontend/src/layout/AppLayout.test.ts`。

用原生 `<select>`/`<input>`（可测、简单）。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/layout/FilterBar.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import FilterBar from './FilterBar.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {}, summary: {},
    rawNodes: [{ projectId: 'P1', orgL4: '北京服务组', projectManager: '张三', planMonth: '2026-02' }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('FilterBar', () => {
  it('year select reflects and updates store', async () => {
    seed()
    const f = useFilterStore()
    const wrapper = mount(FilterBar)
    const yearSel = wrapper.get('[data-test="year-select"]')
    await yearSel.setValue('2026')
    expect(f.filterYear).toBe('2026')
  })

  it('naguan checkbox toggles store + persists', async () => {
    seed()
    const f = useFilterStore()
    const wrapper = mount(FilterBar)
    expect(f.naguanOn).toBe(true)
    await wrapper.get('[data-test="naguan-toggle"]').setValue(false)
    expect(f.naguanOn).toBe(false)
    expect(localStorage.getItem('naguan_on')).toBe('false')
  })

  it('view select to L4 then choose dept updates store', async () => {
    seed()
    const f = useFilterStore()
    const wrapper = mount(FilterBar)
    await wrapper.get('[data-test="view-mode"]').setValue('l4')
    expect(f.viewMode).toBe('l4')
    // L4 下拉出现，选择部门
    await wrapper.get('[data-test="view-l4"]').setValue('北京服务组')
    expect(f.viewL4).toBe('北京服务组')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/layout/FilterBar.test.ts`
Expected: FAIL（找不到组件）。

- [ ] **Step 3: 写实现 `frontend/src/layout/FilterBar.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'

const f = useFilterStore()

// 年份：双向
const year = computed({
  get: () => f.filterYear,
  set: (v: string) => f.setYear(v),
})

// 视角模式
const mode = computed({
  get: () => f.viewMode,
  set: (v: 'global' | 'l4' | 'pm') => {
    if (v === 'global') f.setViewGlobal()
    else if (v === 'l4') f.setViewL4('')
    else f.setViewPM('')
  },
})
</script>

<template>
  <div class="filter-bar">
    <label class="fb-item">
      周期
      <select data-test="year-select" v-model="year">
        <option v-for="o in f.yearOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>
    </label>

    <label class="fb-item">
      视角
      <select data-test="view-mode" v-model="mode">
        <option value="global">全局</option>
        <option value="l4">L4 服务组</option>
        <option value="pm">项目经理</option>
      </select>
    </label>

    <label v-if="f.viewMode === 'l4'" class="fb-item">
      服务组
      <select data-test="view-l4" :value="f.viewL4" @change="f.setViewL4(($event.target as HTMLSelectElement).value)">
        <option value="">全部</option>
        <option v-for="d in f.l4Options" :key="d" :value="d">{{ d }}</option>
      </select>
    </label>

    <label v-if="f.viewMode === 'pm'" class="fb-item">
      项目经理
      <select data-test="view-pm" :value="f.viewPM" @change="f.setViewPM(($event.target as HTMLSelectElement).value)">
        <option value="">全部</option>
        <option v-for="p in f.pmOptions" :key="p" :value="p">{{ p }}</option>
      </select>
    </label>

    <label class="fb-item naguan">
      纳管
      <input data-test="naguan-toggle" type="checkbox" :checked="f.naguanOn"
        @change="f.toggleNaguan(($event.target as HTMLInputElement).checked)" />
      <span>{{ f.naguanOn ? '已开启' : '已关闭' }}</span>
    </label>
  </div>
</template>

<style scoped>
.filter-bar { display: flex; align-items: center; gap: 16px; padding: 8px 18px;
  border-bottom: 1px solid #e2e8f0; background: #fff; font-size: 13px; color: #475569; }
.fb-item { display: inline-flex; align-items: center; gap: 6px; }
.fb-item select { padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; }
.naguan { margin-left: auto; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/layout/FilterBar.test.ts`（3 passed）

- [ ] **Step 5: 接入 AppLayout**

在 `frontend/src/layout/AppLayout.vue` 的 `<main class="app-main">` 内、`<router-view />` 之前插入 `<FilterBar />`，并 import：
```vue
<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import AppSidebar from './AppSidebar.vue'
import FilterBar from './FilterBar.vue'
</script>

<template>
  <div class="app-layout">
    <AppHeader />
    <div class="app-body">
      <AppSidebar />
      <main class="app-main">
        <FilterBar />
        <router-view />
      </main>
    </div>
  </div>
</template>
<!-- style 不变 -->
```
在 `frontend/src/layout/AppLayout.test.ts` 增加断言（在现有测试内）：`expect(wrapper.find('.filter-bar').exists()).toBe(true)`。该测试已提供 pinia；FilterBar 在无数据时 yearOptions 仍存在、l4/pm 为空，能正常渲染。

- [ ] **Step 6: 全量前端验证**

Run: `cd frontend && npm run test:run`（全部通过）
Run: `cd frontend && npm run typecheck`（通过）
Run: `cd frontend && npm run build`（成功）

- [ ] **Step 7: 提交**

```bash
git add frontend/src/layout/FilterBar.vue frontend/src/layout/FilterBar.test.ts frontend/src/layout/AppLayout.vue frontend/src/layout/AppLayout.test.ts
git commit -m "feat(frontend): FilterBar（年份/视角/纳管 控件）接入 AppLayout + 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 收尾——verify 全绿 + 更新 PROGRESS

**Files:** Modify `PROGRESS.md`。

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（py_compile + ruff + 75 pytest + 前端 typecheck/vitest/build 全绿）。失败则 BLOCKED。

- [ ] **Step 2: 更新 PROGRESS.md**

在 "🟦 Phase B 前端"：
- B3 行改 `[x]`：
  ```
  - [x] **B3** 筛选状态与控件：lib/filterNodes（忠实移植 getFilteredNodes）、filterStore（年份/视角/纳管 + filteredNodes/选项派生，取代散落全局）、FilterBar 接入 AppLayout。
  ```
- 新增 B4 行（通用组件，从原 B3 拆出）：
  ```
  - [ ] **B4** 通用组件：DataTable（封装 el-table：列配置/枚举筛选/导出/截断 tooltip）、ChartBox（封装 vue-echarts + 主题/自定义图例）、Modal（封装 el-dialog）。
  ```
- 原 B4+（页面）顺延为 B5+；保留 B-opt。更新"最近更新"为 `2026-06-03`。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): 标记 B3 筛选状态与控件完成；通用组件顺延为 B4，页面 B5+

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（对照 spec §6 的 filterStore + 筛选控件）：**
- 筛选纯逻辑（忠实移植 getFilteredNodes：视角/纳管/年份/季度/累计）→ Task 1 ✓
- filterStore（取代 ~30 散落全局 + getFilteredNodes）→ Task 2 ✓
- 年份/视角/纳管控件 → Task 3 ✓
- **明确移交 B4**：通用组件 DataTable/ChartBox/Modal（Task 4 在 PROGRESS 记录）。**B5+**：页面。

**Placeholder scan：** 所有 lib/store/组件/测试均给出完整代码；命令含预期输出。Task 1 Step 3 对 RawNode 索引签名的潜在 typecheck 问题给了兜底方案并要求报告。无 TBD/TODO。

**一致性：** `filterNodes`/`FilterOpts`/`ViewMode` 在 lib 与 store 间一致；`useFilterStore` 暴露 `filterYear/viewMode/viewL4/viewPM/naguanOn/yearOptions/l4Options/pmOptions/filteredNodes/setYear/setViewGlobal/setViewL4/setViewPM/toggleNaguan`，FilterBar 与测试按此调用；`naguan_on` localStorage 键与旧版一致（沿用持久化语义）；filterYear 取值格式（all/年/upto年/年-Q/upto年-Q）与旧版及年月范围解析一致。

**风险点：**
- 年份语义忠实性：Task 1 的 10 个用例覆盖 all/年/季度/upto年/upto季度/无月份排除/视角/纳管/组合，是移植正确性的护栏。
- RawNode 的 orgL4/projectManager 经索引签名访问（schema extra=allow），Task 1 已给兜底。
- FilterBar 用原生控件（非 Element Plus）以保证可测与简洁；视觉 EP 化留后续（用户已接受展示改动）。

---

## Execution Handoff

见会话中执行方式选择（建议同前：subagent-driven-development）。
