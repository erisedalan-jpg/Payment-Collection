# 分层页「回款状态(plan)」tab + CF 筛选联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点亮分层页第 5 个 tab「回款状态(plan)」——6 个按 nodeStatus 分组的子看板，每板含统计与节点表，并忠实移植旧版 CF 列头枚举筛选 + 6 看板跨表「筛选联动」。

**Architecture:** 把旧 `app.js` 的全局 `CF` 对象拆成三层——纯函数层 `lib/crossFilter.ts`（格式化/去重/过滤）、状态层 `stores/crossFilter.ts`（Pinia，持有各表筛选 + 联动开关 + 同步算法）、视图层 `components/ColumnFilter.vue`（列头下拉）。plan 看板计算放纯函数 `lib/planBoards.ts`。`PlanTab.vue` 组装汇总条 + 状态格 + 工具栏 + 6 个 `PlanBoard.vue`；每板用自有 `<table>`（非 DataTable，因列头需挂 CF 下拉，贴近旧 `plan-board-table`）。最后在 `TierView.vue` 分发 `plan` → `PlanTab`。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Element Plus (el-popover/el-input/el-checkbox/el-button) + Vitest/@vue/test-utils。

**忠实移植基准（旧 app.js）：** `renderPlan`(2843) / `renderPlanBoards`(3031) / `updatePlanSummary`(2987) / `CF`(188-459)。

**展示从简（明确取舍，记录在案，不视为偏差）：**
- CF 下拉的"搜索即时自动勾选 + 即时 apply"（`searchEnum`）简化为：搜索仅过滤可见选项列表，勾选状态保留，统一在「确定」时 apply。enum 筛选与联动语义完全保留。
- 旧版工具栏的「设置展示字段」（列可见性 UI）与「导出Excel」延后到 B-opt（与 nodes/projects 等既有 tab 一致，均未移植）。
- 旧版状态卡点击下钻滚动 + "来自看板下钻"高亮（`_drillFilter`）延后到 B-opt（跨页钻取尚未在 Vue 落地）；状态卡保留为计数展示（对应 `updatePlanSummary` 中不可点击的版本）。

---

## File Structure

| 文件 | 职责 | 任务 |
|---|---|---|
| `frontend/src/lib/crossFilter.ts` | 纯函数：`cfFormatValue` / `cfUniqueValues` / `applyColumnFilters` + 类型 | T1 |
| `frontend/src/stores/crossFilter.ts` | Pinia：各表筛选状态、联动开关、设置/清除/同步 | T2 |
| `frontend/src/lib/planBoards.ts` | 纯函数：`PLAN_BOARDS` / `boardStats` / `planSummaryTotals` / `planStatusCounts` | T3 |
| `frontend/src/components/ColumnFilter.vue` | 列头 ▾ 下拉（搜索 + 全选 + 多选 + 确定/清除） | T4 |
| `frontend/src/components/PlanBoard.vue` | 单看板：表头(挂CF)/统计/节点表/页脚 | T5 |
| `frontend/src/components/PlanTab.vue` | tab 组装：汇总条 + 状态格 + 工具栏 + 6 看板 + 切档重置 | T6 |
| `frontend/src/views/TierView.vue` | 分发 `plan` → `PlanTab` | T7 |
| `frontend/src/views/TierView.test.ts` | 更新占位测试 + 新增 plan 分发测试 | T7 |

每个 lib/store 任务配同名 `*.test.ts`。

---

### Task 1: lib/crossFilter.ts（纯函数 + 测试）

**Files:**
- Create: `frontend/src/lib/crossFilter.ts`
- Test: `frontend/src/lib/crossFilter.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/crossFilter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { cfFormatValue, cfUniqueValues, applyColumnFilters } from './crossFilter'

describe('cfFormatValue', () => {
  it('空值/布尔/比例/普通', () => {
    expect(cfFormatValue('orgL4', '')).toBe('空值')
    expect(cfFormatValue('orgL4', null)).toBe('空值')
    expect(cfFormatValue('canAdvance', true)).toBe('是')
    expect(cfFormatValue('canAdvance', false)).toBe('否')
    expect(cfFormatValue('actualPaymentRatio', 0.8)).toBe('80%')
    expect(cfFormatValue('orgL4', '北京')).toBe('北京')
  })
})

describe('cfUniqueValues', () => {
  it('去重并按展示值升序（空值排末位）', () => {
    const rows = [{ orgL4: '北京' }, { orgL4: '上海' }, { orgL4: '北京' }, { orgL4: '' }]
    expect(cfUniqueValues(rows, 'orgL4').map((u) => u.display)).toEqual(['上海', '北京', '空值'])
  })
})

describe('applyColumnFilters', () => {
  const rows = [
    { orgL4: '北京', nodeStatus: '延期' },
    { orgL4: '上海', nodeStatus: '正常实施中' },
  ]
  it('无筛选返回原数据', () => {
    expect(applyColumnFilters(rows, undefined)).toHaveLength(2)
    expect(applyColumnFilters(rows, {})).toHaveLength(2)
  })
  it('按展示值筛选', () => {
    expect(applyColumnFilters(rows, { orgL4: { value: ['北京'] } })).toEqual([rows[0]])
  })
  it('多列与（AND）', () => {
    expect(applyColumnFilters(rows, { orgL4: { value: ['北京'] }, nodeStatus: { value: ['正常实施中'] } })).toHaveLength(0)
  })
  it('空选集匹配不到任何行', () => {
    expect(applyColumnFilters(rows, { orgL4: { value: [] } })).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/crossFilter.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`frontend/src/lib/crossFilter.ts`:

```ts
import { isDateKey, excelDate } from './cellFormat'
import { pct } from './format'

export interface ColFilter {
  value: string[]
}
export type TableFilters = Record<string, ColFilter>

const RATIO_KEYS = new Set(['planPaymentRatio', 'paymentRatio', 'actualPaymentRatio', 'projectCompletion'])

/** 忠实移植 CF.formatValue：把单元格原始值转为筛选枚举用的展示字符串（空值→'空值'）。 */
export function cfFormatValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === '') return '空值'
  if (isDateKey(key)) {
    const ed = excelDate(val)
    if (ed) return ed
    if (typeof val === 'string' && /^\d{4}-\d{2}/.test(val)) return val.slice(0, 10)
  }
  if (typeof val === 'string' && /^\d{4,5}$/.test(val)) {
    const ed = excelDate(val)
    if (ed) return ed
  }
  if (val === true || val === 'true') return '是'
  if (val === false || val === 'false') return '否'
  if (RATIO_KEYS.has(key)) return pct(val)
  return String(val)
}

export interface UniqueValue {
  display: string
  raw: unknown
}

/** 列去重枚举：按展示值升序返回唯一值。忠实移植 showPopup 的 uvMap（后值覆盖）+ Object.keys().sort()。 */
export function cfUniqueValues(rows: Record<string, any>[], colKey: string): UniqueValue[] {
  const uvMap: Record<string, unknown> = {}
  for (const r of rows) {
    const v = r[colKey]
    uvMap[cfFormatValue(colKey, v)] = v
  }
  return Object.keys(uvMap)
    .sort()
    .map((display) => ({ display, raw: uvMap[display] }))
}

/** 忠实移植 CF.filterData 的 enum 分支：选中值与展示值或原值字符串任一相等即保留；多列取交集。 */
export function applyColumnFilters(
  rows: Record<string, any>[],
  filters: TableFilters | undefined,
): Record<string, any>[] {
  if (!filters) return rows
  const keys = Object.keys(filters)
  if (!keys.length) return rows
  return rows.filter((row) => {
    for (const ck of keys) {
      const sel = filters[ck].value
      const cv = row[ck]
      const fv = cfFormatValue(ck, cv)
      let match = false
      for (const s of sel) {
        if (fv === s || String(cv) === s) {
          match = true
          break
        }
      }
      if (!match) return false
    }
    return true
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/crossFilter.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/crossFilter.ts frontend/src/lib/crossFilter.test.ts
git commit -m "feat(frontend): 新增 CF 纯函数层 crossFilter（格式化/去重/列过滤）"
```

---

### Task 2: stores/crossFilter.ts（Pinia 状态 + 联动 + 测试）

**Files:**
- Create: `frontend/src/stores/crossFilter.ts`
- Test: `frontend/src/stores/crossFilter.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/stores/crossFilter.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCrossFilterStore } from './crossFilter'

const GROUP = ['planBoard_0', 'planBoard_1']
beforeEach(() => setActivePinia(createPinia()))

describe('useCrossFilterStore', () => {
  it('部分选中→设置筛选；全选→清除（全选=无筛选）', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 3)
    expect(s.tableFilters('planBoard_0').orgL4).toEqual({ value: ['北京'] })
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京', '上海', '广州'], 3)
    expect(s.tableFilters('planBoard_0').orgL4).toBeUndefined()
  })
  it('空选集→{value:[]}', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', [], 3)
    expect(s.tableFilters('planBoard_0').orgL4).toEqual({ value: [] })
  })
  it('clearColumn / clearAll / hasFilters', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 3)
    s.setColumnFilter('planBoard_0', 'nodeStatus', ['延期'], 2)
    s.clearColumn('planBoard_0', 'orgL4')
    expect(s.tableFilters('planBoard_0').orgL4).toBeUndefined()
    expect(s.hasFilters('planBoard_0')).toBe(true)
    s.clearAll('planBoard_0')
    expect(s.hasFilters('planBoard_0')).toBe(false)
  })
  it('联动关：不同步到其他看板', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 3, GROUP)
    expect(s.tableFilters('planBoard_1').orgL4).toBeUndefined()
  })
  it('联动开：同步设置与清除', () => {
    const s = useCrossFilterStore()
    s.toggleLinkage()
    expect(s.linkageOn).toBe(true)
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 3, GROUP)
    expect(s.tableFilters('planBoard_1').orgL4).toEqual({ value: ['北京'] })
    s.clearColumn('planBoard_0', 'orgL4', GROUP)
    expect(s.tableFilters('planBoard_1').orgL4).toBeUndefined()
  })
  it('groupHasFilters / clearGroup', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_1', 'orgL4', ['北京'], 3)
    expect(s.groupHasFilters(GROUP)).toBe(true)
    s.clearGroup(GROUP)
    expect(s.groupHasFilters(GROUP)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/stores/crossFilter.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`frontend/src/stores/crossFilter.ts`:

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ColFilter, TableFilters } from '@/lib/crossFilter'

/**
 * CF 跨表筛选状态。忠实移植 app.js 全局 CF 对象的状态与联动算法：
 * - 各表(tableId)各列(colKey)的 enum 筛选；全选=无筛选(删除该列)。
 * - linkageOn 时，对同一 group(6 看板)内的设置/清除做跨表同步(syncFilters)。
 */
export const useCrossFilterStore = defineStore('crossFilter', () => {
  const filters = ref<Record<string, TableFilters>>({})
  const linkageOn = ref(false)

  function tableFilters(id: string): TableFilters {
    return filters.value[id] || {}
  }
  function hasFilters(id: string): boolean {
    const t = filters.value[id]
    return !!t && Object.keys(t).length > 0
  }
  function groupHasFilters(ids: string[]): boolean {
    return ids.some((id) => hasFilters(id))
  }

  // 以新对象重写，确保嵌套变更也触发响应式
  function _set(id: string, colKey: string, val: ColFilter | null) {
    const t = { ...(filters.value[id] || {}) }
    if (val === null) delete t[colKey]
    else t[colKey] = val
    filters.value = { ...filters.value, [id]: t }
  }

  /** 同步源表某列筛选到 group 内其它表（无则删除）。忠实移植 CF.syncFilters。 */
  function syncFilters(sourceId: string, colKey: string, group: string[]) {
    const fv = filters.value[sourceId]?.[colKey] ?? null
    group.forEach((g) => {
      if (g !== sourceId) _set(g, colKey, fv)
    })
  }

  /** 忠实移植 CF.apply 的 enum 语义：空选集→{value:[]}；全选(等于总数)→删除；否则记录所选。 */
  function setColumnFilter(
    id: string,
    colKey: string,
    selected: string[],
    totalCount: number,
    group?: string[],
  ) {
    if (selected.length === 0) _set(id, colKey, { value: [] })
    else if (selected.length === totalCount) _set(id, colKey, null)
    else _set(id, colKey, { value: selected })
    if (linkageOn.value && group && group.includes(id)) syncFilters(id, colKey, group)
  }

  /** 忠实移植 CF.clearColumn：删除该列；联动开则同步删除 group 内其它表同列。 */
  function clearColumn(id: string, colKey: string, group?: string[]) {
    _set(id, colKey, null)
    if (linkageOn.value && group && group.includes(id)) {
      group.forEach((g) => {
        if (g !== id) _set(g, colKey, null)
      })
    }
  }

  function clearAll(id: string) {
    filters.value = { ...filters.value, [id]: {} }
  }
  function clearGroup(ids: string[]) {
    const next = { ...filters.value }
    ids.forEach((id) => {
      next[id] = {}
    })
    filters.value = next
  }
  function toggleLinkage() {
    linkageOn.value = !linkageOn.value
  }

  return {
    filters,
    linkageOn,
    tableFilters,
    hasFilters,
    groupHasFilters,
    setColumnFilter,
    clearColumn,
    clearAll,
    clearGroup,
    toggleLinkage,
    syncFilters,
  }
})
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/stores/crossFilter.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/crossFilter.ts frontend/src/stores/crossFilter.test.ts
git commit -m "feat(frontend): 新增 CF 状态层 crossFilter store（筛选/清除/联动同步）"
```

---

### Task 3: lib/planBoards.ts（纯函数 + 测试）

**Files:**
- Create: `frontend/src/lib/planBoards.ts`
- Test: `frontend/src/lib/planBoards.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/lib/planBoards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { PLAN_BOARDS, boardStats, planSummaryTotals, planStatusCounts } from './planBoards'

describe('PLAN_BOARDS', () => {
  it('6 看板，状态顺序忠实', () => {
    expect(PLAN_BOARDS.map((b) => b.status)).toEqual([
      '加资源可提前',
      '达到回款条件',
      '已提前回款',
      '已全额回款',
      '延期',
      '正常实施中',
    ])
  })
})

describe('boardStats', () => {
  it('计划/已回款/待回款/完成率', () => {
    const s = boardStats([
      { expectedPayment: 200000, actualPayment: 100000 },
      { expectedPayment: 0, actualPayment: 0 },
    ] as any)
    expect(s.count).toBe(2)
    expect(s.totalExp).toBe(200000)
    expect(s.totalAct).toBe(100000)
    expect(s.remaining).toBe(100000)
    expect(s.rate).toBeCloseTo(0.5)
  })
  it('计划为0时完成率0', () => {
    expect(boardStats([{ expectedPayment: 0, actualPayment: 0 }] as any).rate).toBe(0)
  })
})

describe('planSummaryTotals', () => {
  it('跨看板求和', () => {
    const t = planSummaryTotals([
      [{ expectedPayment: 100, actualPayment: 50 }],
      [{ expectedPayment: 100, actualPayment: 0 }],
    ] as any)
    expect(t.totalExp).toBe(200)
    expect(t.totalAct).toBe(50)
    expect(t.totalRem).toBe(150)
    expect(t.rate).toBeCloseTo(0.25)
  })
})

describe('planStatusCounts', () => {
  it('按 nodeStatus 计数', () => {
    const c = planStatusCounts([
      { nodeStatus: '延期' },
      { nodeStatus: '延期' },
      { nodeStatus: '加资源可提前' },
    ] as any)
    expect(c.delayed).toBe(2)
    expect(c.canAdvance).toBe(1)
    expect(c.onTime).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/planBoards.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`frontend/src/lib/planBoards.ts`:

```ts
import type { RawNode } from '@/types/analysis'

export interface PlanBoardDef {
  key: string
  label: string
  color: string
  status: string
}

/** 忠实移植 renderPlan 的 6 看板定义（顺序与配色一致）。 */
export const PLAN_BOARDS: PlanBoardDef[] = [
  { key: 'canAdvance', label: '加资源可提前', color: 'var(--primary, #4f46e5)', status: '加资源可提前' },
  { key: 'reachedCondition', label: '达到回款条件', color: '#F59E0B', status: '达到回款条件' },
  { key: 'advance', label: '已提前回款', color: '#059669', status: '已提前回款' },
  { key: 'fullPaid', label: '已全额回款', color: '#10B981', status: '已全额回款' },
  { key: 'delayed', label: '延期', color: 'var(--red, #ef4444)', status: '延期' },
  { key: 'onTime', label: '正常实施中', color: 'var(--blue, #3b82f6)', status: '正常实施中' },
]

export interface BoardStats {
  count: number
  totalExp: number
  totalAct: number
  remaining: number
  rate: number
}

/** 单看板统计（元）。忠实移植 renderPlanBoards 的 per-board 计算。 */
export function boardStats(nodes: RawNode[]): BoardStats {
  let totalExp = 0
  let totalAct = 0
  for (const n of nodes) {
    const r = n as Record<string, any>
    totalExp += r.expectedPayment || 0
    totalAct += r.actualPayment || 0
  }
  return {
    count: nodes.length,
    totalExp,
    totalAct,
    remaining: totalExp - totalAct,
    rate: totalExp > 0 ? totalAct / totalExp : 0,
  }
}

export interface PlanSummary {
  totalExp: number
  totalAct: number
  totalRem: number
  rate: number
}

/** 汇总条总计（元）。忠实移植 updatePlanSummary 的 boardAgg 路径：跨 6 看板(已CF过滤)求和。 */
export function planSummaryTotals(boardsNodes: RawNode[][]): PlanSummary {
  let totalExp = 0
  let totalAct = 0
  let totalRem = 0
  for (const nodes of boardsNodes) {
    for (const n of nodes) {
      const r = n as Record<string, any>
      totalExp += r.expectedPayment || 0
      totalAct += r.actualPayment || 0
      totalRem += (r.expectedPayment || 0) - (r.actualPayment || 0)
    }
  }
  return { totalExp, totalAct, totalRem, rate: totalExp > 0 ? totalAct / totalExp : 0 }
}

export interface StatusCounts {
  canAdvance: number
  reachedCondition: number
  advance: number
  fullPaid: number
  delayed: number
  onTime: number
}

/** 状态计数（节点级，按 nodeStatus）。忠实移植 updatePlanSummary 的 6 个计数。 */
export function planStatusCounts(related: RawNode[]): StatusCounts {
  const c = (s: string) => related.filter((n) => (n as Record<string, any>).nodeStatus === s).length
  return {
    canAdvance: c('加资源可提前'),
    reachedCondition: c('达到回款条件'),
    advance: c('已提前回款'),
    fullPaid: c('已全额回款'),
    delayed: c('延期'),
    onTime: c('正常实施中'),
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/planBoards.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/planBoards.ts frontend/src/lib/planBoards.test.ts
git commit -m "feat(frontend): 新增 planBoards 纯函数（6看板定义/单板统计/汇总/状态计数）"
```

---

### Task 4: components/ColumnFilter.vue（列头下拉 + 测试）

**Files:**
- Create: `frontend/src/components/ColumnFilter.vue`
- Test: `frontend/src/components/ColumnFilter.test.ts`

说明：弹层内容（搜索/全选/多选/确定/清除）的交互语义已在 store 测试中覆盖；本组件测试聚焦"图标渲染 + 该列有筛选时高亮"，避免 el-popover teleport 在 jsdom 下的不稳定。

- [ ] **Step 1: 写失败测试**

`frontend/src/components/ColumnFilter.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ColumnFilter from './ColumnFilter.vue'
import { useCrossFilterStore } from '@/stores/crossFilter'

beforeEach(() => setActivePinia(createPinia()))

function mountCF() {
  return mount(ColumnFilter, {
    props: { tableId: 'planBoard_0', colKey: 'orgL4', sourceRows: [{ orgL4: '北京' }, { orgL4: '上海' }] },
    global: { plugins: [ElementPlus] },
  })
}

describe('ColumnFilter', () => {
  it('渲染下拉触发图标，默认不高亮', () => {
    const w = mountCF()
    expect(w.find('.cf-icon').exists()).toBe(true)
    expect(w.find('.cf-icon.active').exists()).toBe(false)
  })
  it('该列有筛选时图标高亮', async () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 2)
    const w = mountCF()
    await w.vm.$nextTick()
    expect(w.find('.cf-icon.active').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/ColumnFilter.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现**

`frontend/src/components/ColumnFilter.vue`:

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { cfUniqueValues } from '@/lib/crossFilter'

const props = defineProps<{
  tableId: string
  colKey: string
  sourceRows: Record<string, any>[]
  group?: string[]
}>()

const store = useCrossFilterStore()
const visible = ref(false)
const search = ref('')
const selected = ref<Set<string>>(new Set())

const uniques = computed(() => cfUniqueValues(props.sourceRows, props.colKey))
const visibleUniques = computed(() => {
  const kw = search.value.trim().toLowerCase()
  if (!kw) return uniques.value
  return uniques.value.filter((u) => u.display.toLowerCase().includes(kw))
})
const active = computed(() => !!store.tableFilters(props.tableId)[props.colKey])
const allChecked = computed(
  () => uniques.value.length > 0 && selected.value.size === uniques.value.length,
)

// 打开弹层时初始化勾选：有筛选→沿用其选中值；否则全选
watch(visible, (open) => {
  if (!open) return
  search.value = ''
  const cur = store.tableFilters(props.tableId)[props.colKey]
  selected.value = cur ? new Set(cur.value) : new Set(uniques.value.map((u) => u.display))
})

function toggle(display: string, checked: boolean) {
  const s = new Set(selected.value)
  if (checked) s.add(display)
  else s.delete(display)
  selected.value = s
}
function toggleAll(checked: boolean) {
  selected.value = checked ? new Set(uniques.value.map((u) => u.display)) : new Set()
}
function apply() {
  store.setColumnFilter(
    props.tableId,
    props.colKey,
    Array.from(selected.value),
    uniques.value.length,
    props.group,
  )
  visible.value = false
}
function clear() {
  store.clearColumn(props.tableId, props.colKey, props.group)
  visible.value = false
}
</script>

<template>
  <el-popover
    v-model:visible="visible"
    trigger="click"
    :width="240"
    placement="bottom-start"
    popper-class="cf-popover"
  >
    <template #reference>
      <span class="cf-icon" :class="{ active }" title="列筛选">&#9660;</span>
    </template>
    <div class="cf-inner">
      <div class="cf-title">
        列筛选 <span class="cf-count">({{ visibleUniques.length }}个值)</span>
      </div>
      <el-input v-model="search" size="small" placeholder="搜索筛选选项..." clearable />
      <label class="cf-row cf-all">
        <el-checkbox :model-value="allChecked" @change="(v: any) => toggleAll(!!v)" />
        全选/取消全选
      </label>
      <div class="cf-list">
        <label v-for="u in visibleUniques" :key="u.display" class="cf-row" :title="u.display">
          <el-checkbox
            :model-value="selected.has(u.display)"
            @change="(v: any) => toggle(u.display, !!v)"
          />
          <span class="cf-text">{{ u.display }}</span>
        </label>
      </div>
      <div class="cf-actions">
        <el-button size="small" type="primary" @click="apply">确定</el-button>
        <el-button size="small" @click="clear">清除</el-button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.cf-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 3px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  color: #cbd5e1;
  vertical-align: middle;
}
.cf-icon:hover,
.cf-icon.active {
  color: #4f46e5;
  background: #eef2ff;
}
.cf-title {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 6px;
  color: #0f172a;
}
.cf-count {
  color: #94a3b8;
  font-weight: 400;
}
.cf-all {
  border-bottom: 1px solid #f1f5f9;
  margin: 6px 0;
  padding-bottom: 4px;
}
.cf-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 0;
  cursor: pointer;
}
.cf-list {
  max-height: 200px;
  overflow-y: auto;
}
.cf-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 190px;
}
.cf-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/ColumnFilter.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ColumnFilter.vue frontend/src/components/ColumnFilter.test.ts
git commit -m "feat(frontend): 新增 ColumnFilter 列头筛选下拉（搜索/全选/多选/确定/清除）"
```

---

### Task 5: components/PlanBoard.vue（单看板 + 测试）

**Files:**
- Create: `frontend/src/components/PlanBoard.vue`
- Test: `frontend/src/components/PlanBoard.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/PlanBoard.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import PlanBoard from './PlanBoard.vue'
import { boardStats } from '@/lib/planBoards'

beforeEach(() => setActivePinia(createPinia()))

describe('PlanBoard', () => {
  it('渲染表头/统计/行/列筛选图标', () => {
    const nodes = [{ projectId: 'P1', orgL4: '北京', expectedPayment: 200000, actualPayment: 100000 }]
    const w = mount(PlanBoard, {
      props: {
        board: { key: 'delayed', label: '延期', color: '#ef4444', status: '延期' },
        tableId: 'planBoard_4',
        nodes,
        stats: boardStats(nodes as any),
        columns: [
          { key: 'projectId', label: '项目编号' },
          { key: 'orgL4', label: '服务组' },
        ],
        sourceRows: nodes,
        group: ['planBoard_4'],
      },
      global: { plugins: [ElementPlus] },
    })
    expect(w.text()).toContain('延期')
    expect(w.text()).toContain('节点总数')
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('共 1 条记录')
    expect(w.findAllComponents({ name: 'ColumnFilter' }).length).toBe(2)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/PlanBoard.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现**

`frontend/src/components/PlanBoard.vue`:

```vue
<script setup lang="ts">
import ColumnFilter from './ColumnFilter.vue'
import { formatCellValue } from '@/lib/cellFormat'
import { fmtWan, pct } from '@/lib/format'
import type { PlanBoardDef, BoardStats } from '@/lib/planBoards'

defineProps<{
  board: PlanBoardDef
  tableId: string
  nodes: Record<string, any>[]
  stats: BoardStats
  columns: { key: string; label: string }[]
  sourceRows: Record<string, any>[]
  group: string[]
}>()

const rateColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444')
</script>

<template>
  <div class="plan-board">
    <div class="pb-header" :style="{ background: board.color }">{{ board.label }}</div>
    <div class="pb-stats">
      <div class="ps"><div class="ps-label">节点总数</div><div class="ps-val">{{ stats.count }}</div></div>
      <div class="ps"><div class="ps-label">节点计划回款金额(万)</div><div class="ps-val" style="color:#3b82f6">{{ fmtWan(stats.totalExp) }}</div></div>
      <div class="ps"><div class="ps-label">节点已回款金额(万)</div><div class="ps-val" style="color:#10b981">{{ fmtWan(stats.totalAct) }}</div></div>
      <div class="ps"><div class="ps-label">节点待回款金额(万)</div><div class="ps-val" :style="{ color: stats.remaining > 0 ? '#ef4444' : '#10b981' }">{{ fmtWan(stats.remaining) }}</div></div>
      <div class="ps"><div class="ps-label">节点完成率</div><div class="ps-val" :style="{ color: rateColor(stats.rate) }">{{ pct(stats.rate) }}</div></div>
    </div>
    <div class="pb-table-wrap">
      <table class="pb-table">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key">
              <span class="th-label">{{ col.label }}</span>
              <ColumnFilter
                :table-id="tableId"
                :col-key="col.key"
                :source-rows="sourceRows"
                :group="group"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(n, i) in nodes.slice(0, 100)" :key="i">
            <td v-for="col in columns" :key="col.key" :title="String(n[col.key] ?? '')">
              {{ formatCellValue(n[col.key], col.key) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pb-footer">共 {{ stats.count }} 条记录</div>
  </div>
</template>

<style scoped>
.plan-board {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
}
.pb-header {
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  padding: 8px 14px;
}
.pb-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
  padding: 12px 14px;
  border-bottom: 1px solid #f1f5f9;
}
.ps-label {
  font-size: 12px;
  color: #64748b;
}
.ps-val {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.pb-table-wrap {
  overflow-x: auto;
}
.pb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.pb-table th,
.pb-table td {
  border: 1px solid #f1f5f9;
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pb-table th {
  background: #f8fafc;
  color: #475569;
  font-weight: 600;
}
.pb-footer {
  font-size: 12px;
  color: #94a3b8;
  padding: 6px 14px;
}
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/PlanBoard.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/PlanBoard.vue frontend/src/components/PlanBoard.test.ts
git commit -m "feat(frontend): 新增 PlanBoard 单看板（统计+节点表+列头CF）"
```

---

### Task 6: components/PlanTab.vue（tab 组装 + 测试）

**Files:**
- Create: `frontend/src/components/PlanTab.vue`
- Test: `frontend/src/components/PlanTab.test.ts`

- [ ] **Step 1: 写失败测试**

`frontend/src/components/PlanTab.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import PlanTab from './PlanTab.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {},
    summary: {},
    rawNodes: [
      { projectId: 'P1', projectName: '甲', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', orgL4: '北京', expectedPayment: 1000000, actualPayment: 0 },
      { projectId: 'P2', projectName: '乙', tier: '100万以上', isPaymentRelated: true, nodeStatus: '加资源可提前', orgL4: '上海', expectedPayment: 500000, actualPayment: 500000 },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {},
    naguanExclude: {},
    displayColumns: {
      '100万以上': [
        { key: 'projectId', label: '项目编号', visible: true },
        { key: 'orgL4', label: '服务组', visible: true },
      ],
    },
    followupRecords: {},
  } as any
}

describe('PlanTab', () => {
  it('渲染汇总条/状态格/6看板/工具栏', () => {
    seed()
    const w = mount(PlanTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('节点计划回款金额(万)')
    // 守护汇总求和与单位换算：(100万+50万)/1万 = 150
    expect(w.text()).toContain('150')
    expect(w.text()).toContain('加资源可提前')
    expect(w.findAllComponents({ name: 'PlanBoard' }).length).toBe(6)
    expect(w.text()).toContain('筛选联动')
    // 初始无筛选 → 不显示"清除所有筛选"
    expect(w.text()).not.toContain('清除所有筛选')
  })
  it('节点按状态进入对应看板', () => {
    seed()
    const w = mount(PlanTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('P2')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/PlanTab.test.ts`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现**

`frontend/src/components/PlanTab.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters } from '@/lib/crossFilter'
import { PLAN_BOARDS, boardStats, planSummaryTotals, planStatusCounts } from '@/lib/planBoards'
import { fmtWan, pct } from '@/lib/format'
import PlanBoard from './PlanBoard.vue'

const props = defineProps<{ tier: string }>()
const data = useDataStore()
const filter = useFilterStore()
const cf = useCrossFilterStore()

const tableIds = PLAN_BOARDS.map((_, i) => `planBoard_${i}`)

const allNodes = computed(
  () =>
    filter.filteredNodes.filter(
      (n) => n.tier === props.tier && (n as Record<string, any>).isPaymentRelated,
    ) as Record<string, any>[],
)

const columns = computed(() => {
  const cols = (data.data?.displayColumns as Record<string, any[]> | undefined)?.[props.tier] ?? []
  return cols
    .filter((c) => c.visible !== false)
    .map((c) => ({ key: c.key as string, label: c.label as string }))
})

const boards = computed(() =>
  PLAN_BOARDS.map((b, i) => {
    const boardNodes = allNodes.value.filter((n) => n.nodeStatus === b.status)
    const nodes = applyColumnFilters(boardNodes, cf.tableFilters(tableIds[i]))
    return { board: b, tableId: tableIds[i], nodes, stats: boardStats(nodes as any) }
  }),
)

const combined = computed(() => boards.value.flatMap((d) => d.nodes))
const totals = computed(() => planSummaryTotals(boards.value.map((d) => d.nodes) as any))
// 忠实移植 updatePlanSummary：状态计数取合并后(已CF过滤)节点；为空时回退全量
const counts = computed(() =>
  planStatusCounts((combined.value.length > 0 ? combined.value : allNodes.value) as any),
)

const rateColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444')

// 忠实移植 navTier 的 CF._filters={} 重置：进入页面/切换档位时清空本页 6 看板筛选
function resetFilters() {
  cf.clearGroup(tableIds)
}
onMounted(resetFilters)
watch(() => props.tier, resetFilters)
</script>

<template>
  <div class="plan-tab">
    <div class="summary-bar">
      <div class="sb-item"><div class="sb-label">节点计划回款金额(万)</div><div class="sb-val" style="color:#3b82f6">{{ fmtWan(totals.totalExp) }}</div></div>
      <div class="sb-item"><div class="sb-label">节点已回款金额(万)</div><div class="sb-val green">{{ fmtWan(totals.totalAct) }}</div></div>
      <div class="sb-item"><div class="sb-label">节点待回款金额(万)</div><div class="sb-val red">{{ fmtWan(totals.totalRem) }}</div></div>
      <div class="sb-item"><div class="sb-label">完成率</div><div class="sb-val" :style="{ color: rateColor(totals.rate) }">{{ pct(totals.rate) }}</div></div>
    </div>

    <div class="status-grid">
      <div class="st-card"><div class="st-label">加资源可提前</div><div class="st-val" style="color:#4f46e5">{{ counts.canAdvance }}</div></div>
      <div class="st-card"><div class="st-label">达到回款条件</div><div class="st-val" style="color:#f59e0b">{{ counts.reachedCondition }}</div></div>
      <div class="st-card"><div class="st-label">已提前回款</div><div class="st-val" style="color:#059669">{{ counts.advance }}</div></div>
      <div class="st-card"><div class="st-label">已全额回款</div><div class="st-val" style="color:#10b981">{{ counts.fullPaid }}</div></div>
      <div class="st-card"><div class="st-label">延期</div><div class="st-val" style="color:#ef4444">{{ counts.delayed }}</div></div>
      <div class="st-card"><div class="st-label">正常实施中</div><div class="st-val" style="color:#3b82f6">{{ counts.onTime }}</div></div>
    </div>

    <div class="toolbar">
      <el-button
        size="small"
        :type="cf.linkageOn ? 'primary' : 'default'"
        @click="cf.toggleLinkage()"
      >
        {{ cf.linkageOn ? '筛选联动(已启用)' : '筛选联动' }}
      </el-button>
      <el-button v-if="cf.groupHasFilters(tableIds)" size="small" @click="cf.clearGroup(tableIds)">
        清除所有筛选
      </el-button>
    </div>

    <div class="plan-boards">
      <PlanBoard
        v-for="d in boards"
        :key="d.tableId"
        :board="d.board"
        :table-id="d.tableId"
        :nodes="d.nodes as Record<string, any>[]"
        :stats="d.stats"
        :columns="columns"
        :source-rows="allNodes"
        :group="tableIds"
      />
    </div>
  </div>
</template>

<style scoped>
.plan-tab {
  padding: 12px 16px;
}
.summary-bar,
.status-grid {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}
.summary-bar {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
.status-grid {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}
.sb-item,
.st-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 10px 14px;
}
.sb-label,
.st-label {
  font-size: 12px;
  color: #64748b;
}
.sb-val {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}
.sb-val.green {
  color: #10b981;
}
.sb-val.red {
  color: #ef4444;
}
.st-val {
  font-size: 20px;
  font-weight: 700;
}
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/PlanTab.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/PlanTab.vue frontend/src/components/PlanTab.test.ts
git commit -m "feat(frontend): 新增 PlanTab（汇总条+状态格+工具栏+6看板, 切档重置筛选)"
```

---

### Task 7: TierView 接入 + 占位测试更新 + verify + PROGRESS

**Files:**
- Modify: `frontend/src/views/TierView.vue`
- Modify: `frontend/src/views/TierView.test.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改 TierView.test.ts —— 占位测试改用未知 tab，新增 plan 分发测试**

把现有这段（约 66-70 行）：

```ts
  it('not-yet-built tab shows placeholder', async () => {
    seed()
    const wrapper = await mountAt('/tier/plan/above1m')
    expect(wrapper.text()).toContain('建设中')
  })
```

替换为：

```ts
  it('unknown tab shows placeholder', async () => {
    seed()
    const wrapper = await mountAt('/tier/zzz/above1m')
    expect(wrapper.text()).toContain('建设中')
  })

  it('plan tab renders PlanTab', async () => {
    seed()
    const wrapper = await mountAt('/tier/plan/above1m')
    expect(wrapper.findComponent({ name: 'PlanTab' }).exists()).toBe(true)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/TierView.test.ts`
Expected: FAIL（plan 仍走占位，PlanTab 未接入）

- [ ] **Step 3: 改 TierView.vue —— 引入并分发 PlanTab**

在 import 区加：

```ts
import PlanTab from '@/components/PlanTab.vue'
```

在模板分发处，把 RiskTab 与 stub 之间加入 plan 分支（最终顺序如下）：

```html
    <TierNodesTab v-if="tab === 'nodes'" :tier="tier" />
    <ProjectsOverviewTab v-else-if="tab === 'projects'" :tier="tier" />
    <PlanTab v-else-if="tab === 'plan'" :tier="tier" />
    <RiskTab v-else-if="tab === 'risk'" :tier="tier" />
    <TierIntegrityTab v-else-if="tab === 'integrity'" :tier="tier" />
    <div v-else class="tier-stub">「{{ tab }}」页签建设中（{{ tier }}）</div>
```

（`showSummaryBar` 仍只对 `nodes` 为真——plan 自带汇总条，不复用 TierView 的 tierSummaryBar；保持不变。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/TierView.test.ts`
Expected: PASS

- [ ] **Step 5: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（py_compile + ruff + pytest + 前端 typecheck/vitest/build 全绿）

若 build 报 Element Plus 相关 ~1MB chunk 警告——属已知 B-opt 项，非失败，可忽略。

- [ ] **Step 6: 更新 PROGRESS.md**

将 Backlog 中 B9 行改为已完成：

```
- [x] **B9** 分层页：回款状态(plan) 6 看板 + CF 筛选联动：lib/crossFilter、stores/crossFilter、lib/planBoards、ColumnFilter、PlanBoard、PlanTab，TierView 接入分发。点亮 plan×3 入口（分层页 5 tab×3 档全通）。
```

更新"最近更新"日期为 `2026-06-05`（或当日），并在 Handoff 区追加一段 B9 完成说明（提交 SHA、CF 三层架构、展示从简取舍：搜索即时apply/列可见性UI/导出/下钻高亮延后 B-opt、状态卡保留计数不可点击下钻）。把"会话交接备注"里的下一步更新为 B10+（台账/PM/日历/临期跟进/数据管理/对比/关于）、A4、C。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/views/TierView.vue frontend/src/views/TierView.test.ts PROGRESS.md
git commit -m "feat(frontend): TierView 接入 PlanTab，点亮回款状态(plan) tab；更新 PROGRESS(B9)"
```

---

## Self-Review

- **Spec 覆盖：** 6 看板(`PLAN_BOARDS`/`PlanBoard`)✓；汇总条 4 项(`planSummaryTotals`)✓；状态格 6 计数(`planStatusCounts`)✓；单板统计 5 项(`boardStats`)✓；CF 列头枚举筛选(`ColumnFilter`+`crossFilter`)✓；6 看板跨表联动(`store.syncFilters`/`linkageOn`)✓；清除所有筛选(`clearGroup`)✓；列来源=`displayColumns[tier]`✓；切档重置(`navTier` 的 `CF._filters={}`)✓。
- **占位符扫描：** 各 step 均含完整代码/命令/预期输出，无 TODO/TBD。
- **类型一致性：** `ColFilter`/`TableFilters`(T1) 被 store(T2) 与 ColumnFilter(T4) 复用；`PlanBoardDef`/`BoardStats`(T3) 被 PlanBoard(T5)/PlanTab(T6) 复用；`setColumnFilter(id,colKey,selected,totalCount,group?)` 签名在 store 定义、ColumnFilter 调用处一致；`tableFilters(id)` 返回 `TableFilters` 供 `applyColumnFilters` 消费一致。
- **忠实性取舍：** 已在头部"展示从简"列明（搜索即时apply、列可见性UI、导出、下钻高亮/滚动延后；状态卡保留计数）——属展示层简化，enum 筛选与联动业务语义完全保留。
