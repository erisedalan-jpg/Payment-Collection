# 项目清单选列 + 表头筛选 + 横滚 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 /projects(在建) 与 /projects/closed(已关闭) 两清单加：表头列筛选(复用 ColumnFilter)、选列(显隐+排序,localStorage)菜单、项目状态/回款状态列、L4组改名、横向滚动。

**Architecture:** 新增共享 `useColumnPrefs`(组合式) + `ColumnPicker`(受控组件)；DataTable 加可选 `fixed` 透传；两视图把列枚举筛选移到表头(crossFilter store + applyColumnFilters)、按 prefs 显隐+排序列、列宽促成横滚。先共享件→DataTable→已关闭→在建→收尾，TDD。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus、vitest。

## Global Constraints

- 简体中文；**全程禁用 emoji**，符号用 `→ ↓ ❌ ✕ ▾`。
- 禁止 `git add -A` / `git add .`；逐路径 add。未跟踪的 `docs/...血缘...md`、`.claude/` 不提交。
- 版本单一来源 `frontend/src/version.ts`；本子项目 Y 级 → V1.9.0，落版本只改此处 + PROGRESS。
- 提交信息结尾恒为：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不引入拖拽/表格框架；列排序用菜单内上/下箭头。
- 表头筛选复用现有 `ColumnFilter`/`useCrossFilterStore`/`applyColumnFilters`/`cfUniqueValues`，**不改它们**；tableId='projects-active'/'projects-closed'，不传 group(无联动)。
- 不变式：表头筛选随**可见列**呈现；选列关某列时清其 crossFilter；KPI 深链命中列枚举则确保该列可见再设其筛选。
- 列名"服务组(L4)"→"L4组"(两视图)。
- 前端测试 ElementPlus/router 挂载沿用同目录现有 *.test.ts 约定。

---

### Task 1: `useColumnPrefs` 组合式

**Files:**
- Create: `frontend/src/lib/useColumnPrefs.ts`
- Test: `frontend/src/lib/useColumnPrefs.test.ts`

**Interfaces:**
- Produces: `useColumnPrefs(viewKey: string, allKeys: string[], defaultVisible: string[]) → { visibleKeys: Ref<string[]>, toggle(key), moveUp(key), moveDown(key), reset() }`（Task 4/5 消费）。localStorage key=`colprefs:${viewKey}`，值=有序可见 key 数组。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/lib/useColumnPrefs.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { useColumnPrefs } from './useColumnPrefs'

const ALL = ['a', 'b', 'c', 'd']
const DEF = ['a', 'b', 'c']

describe('useColumnPrefs', () => {
  beforeEach(() => localStorage.clear())

  it('无存储时用默认可见集', () => {
    const p = useColumnPrefs('t1', ALL, DEF)
    expect(p.visibleKeys.value).toEqual(['a', 'b', 'c'])
  })

  it('toggle 显↔隐并持久化到 localStorage', () => {
    const p = useColumnPrefs('t2', ALL, DEF)
    p.toggle('c')                       // 隐藏 c
    expect(p.visibleKeys.value).toEqual(['a', 'b'])
    p.toggle('d')                       // 显示 d(追加末尾)
    expect(p.visibleKeys.value).toEqual(['a', 'b', 'd'])
    expect(JSON.parse(localStorage.getItem('colprefs:t2')!)).toEqual(['a', 'b', 'd'])
  })

  it('从 localStorage 恢复并剔除失效 key', () => {
    localStorage.setItem('colprefs:t3', JSON.stringify(['b', 'a', 'zzz']))  // zzz 不在 ALL
    const p = useColumnPrefs('t3', ALL, DEF)
    expect(p.visibleKeys.value).toEqual(['b', 'a'])
  })

  it('新列(在 ALL 不在存储)默认隐藏', () => {
    localStorage.setItem('colprefs:t4', JSON.stringify(['a', 'b']))  // c/d 未存
    const p = useColumnPrefs('t4', ALL, DEF)
    expect(p.visibleKeys.value).toEqual(['a', 'b'])   // 不自动补 c/d
  })

  it('moveUp/moveDown 在可见集内换位', () => {
    const p = useColumnPrefs('t5', ALL, DEF)
    p.moveDown('a')
    expect(p.visibleKeys.value).toEqual(['b', 'a', 'c'])
    p.moveUp('c')
    expect(p.visibleKeys.value).toEqual(['b', 'c', 'a'])
    p.moveUp('b')                       // 已是首项,不动
    expect(p.visibleKeys.value).toEqual(['b', 'c', 'a'])
  })

  it('reset 恢复默认', () => {
    const p = useColumnPrefs('t6', ALL, DEF)
    p.toggle('a'); p.toggle('d')
    p.reset()
    expect(p.visibleKeys.value).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- useColumnPrefs`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 useColumnPrefs.ts**

Create `frontend/src/lib/useColumnPrefs.ts`：

```typescript
import { ref, watch, type Ref } from 'vue'

const PREFIX = 'colprefs:'

function loadKeys(viewKey: string, allKeys: string[], defaultVisible: string[]): string[] {
  try {
    const raw = localStorage.getItem(PREFIX + viewKey)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        const valid = arr.filter((k: unknown): k is string => typeof k === 'string' && allKeys.includes(k))
        if (valid.length) return valid
      }
    }
  } catch {
    /* localStorage 不可用/损坏 → 降级默认 */
  }
  return defaultVisible.filter((k) => allKeys.includes(k))
}

function saveKeys(viewKey: string, keys: string[]): void {
  try {
    localStorage.setItem(PREFIX + viewKey, JSON.stringify(keys))
  } catch {
    /* 忽略写入失败(隐私模式/配额) */
  }
}

export interface ColumnPrefs {
  visibleKeys: Ref<string[]>
  toggle: (key: string) => void
  moveUp: (key: string) => void
  moveDown: (key: string) => void
  reset: () => void
}

export function useColumnPrefs(viewKey: string, allKeys: string[], defaultVisible: string[]): ColumnPrefs {
  const visibleKeys = ref<string[]>(loadKeys(viewKey, allKeys, defaultVisible))
  watch(visibleKeys, (v) => saveKeys(viewKey, v))   // 每次整体重赋值,非 deep 即触发

  function toggle(key: string) {
    if (!allKeys.includes(key)) return
    visibleKeys.value = visibleKeys.value.includes(key)
      ? visibleKeys.value.filter((k) => k !== key)
      : [...visibleKeys.value, key]
  }
  function moveUp(key: string) {
    const i = visibleKeys.value.indexOf(key)
    if (i > 0) {
      const next = [...visibleKeys.value]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      visibleKeys.value = next
    }
  }
  function moveDown(key: string) {
    const i = visibleKeys.value.indexOf(key)
    if (i >= 0 && i < visibleKeys.value.length - 1) {
      const next = [...visibleKeys.value]
      ;[next[i + 1], next[i]] = [next[i], next[i + 1]]
      visibleKeys.value = next
    }
  }
  function reset() {
    visibleKeys.value = defaultVisible.filter((k) => allKeys.includes(k))
  }
  return { visibleKeys, toggle, moveUp, moveDown, reset }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- useColumnPrefs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/useColumnPrefs.ts frontend/src/lib/useColumnPrefs.test.ts
git commit -m "feat(fe-lib): useColumnPrefs 选列偏好(显隐/排序/localStorage)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `ColumnPicker` 组件

**Files:**
- Create: `frontend/src/components/ColumnPicker.vue`
- Test: `frontend/src/components/ColumnPicker.test.ts`

**Interfaces:**
- Consumes: 无(纯受控展示)。
- Produces: `<ColumnPicker :columns="{key,label}[]" :visible-keys="string[]" @toggle @move-up @move-down @reset />`（Task 4/5 接 useColumnPrefs 方法）。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/ColumnPicker.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ColumnPicker from './ColumnPicker.vue'

const COLS = [{ key: 'a', label: 'A列' }, { key: 'b', label: 'B列' }, { key: 'c', label: 'C列' }]

function mountPicker() {
  return mount(ColumnPicker, { props: { columns: COLS, visibleKeys: ['a', 'b'] }, attachTo: document.body })
}

describe('ColumnPicker', () => {
  it('渲染可见(勾选)与隐藏(未勾选)分区', async () => {
    const w = mountPicker()
    await w.find('.colpick-btn').trigger('click')   // 打开 popover
    const text = document.body.textContent || ''
    expect(text).toContain('A列')
    expect(text).toContain('C列')                    // 隐藏列也列出
    w.unmount()
  })

  it('toggle/move/reset 事件', async () => {
    const w = mountPicker()
    await w.find('.colpick-btn').trigger('click')
    // 找到 C列 行的复选框(隐藏列)点击 → toggle('c')
    const rows = document.querySelectorAll('.colpick-row')
    expect(rows.length).toBe(3)
    // 直接验证组件方法触发事件:点 reset
    const resetBtn = [...document.querySelectorAll('.colpick-reset')][0] as HTMLElement
    resetBtn.click()
    expect(w.emitted('reset')).toBeTruthy()
    w.unmount()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- ColumnPicker`
Expected: FAIL（组件不存在）

- [ ] **Step 3: 实现 ColumnPicker.vue**

Create `frontend/src/components/ColumnPicker.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  columns: { key: string; label: string }[]
  visibleKeys: string[]
}>()
const emit = defineEmits<{
  toggle: [key: string]
  'move-up': [key: string]
  'move-down': [key: string]
  reset: []
}>()

// 可见列按 visibleKeys 顺序;隐藏列按 columns 原序
const visibleOrdered = computed(() =>
  props.visibleKeys
    .map((k) => props.columns.find((c) => c.key === k))
    .filter((c): c is { key: string; label: string } => !!c),
)
const hidden = computed(() => props.columns.filter((c) => !props.visibleKeys.includes(c.key)))

function labelOf(key: string) {
  return props.columns.find((c) => c.key === key)?.label ?? key
}
</script>

<template>
  <el-popover trigger="click" :width="260" placement="bottom-end" popper-class="colpick-pop">
    <template #reference>
      <button class="colpick-btn" type="button">选列 ▾</button>
    </template>
    <div class="colpick-inner">
      <div class="colpick-title">显示列（勾选显示，箭头排序）</div>
      <div class="colpick-list">
        <div v-for="(c, i) in visibleOrdered" :key="c.key" class="colpick-row">
          <el-checkbox :model-value="true" @change="emit('toggle', c.key)" />
          <span class="colpick-label">{{ c.label }}</span>
          <button class="colpick-arrow" type="button" :disabled="i === 0" @click="emit('move-up', c.key)">↑</button>
          <button class="colpick-arrow" type="button" :disabled="i === visibleOrdered.length - 1" @click="emit('move-down', c.key)">↓</button>
        </div>
        <div v-for="c in hidden" :key="c.key" class="colpick-row colpick-hidden">
          <el-checkbox :model-value="false" @change="emit('toggle', c.key)" />
          <span class="colpick-label">{{ c.label }}</span>
        </div>
      </div>
      <div class="colpick-actions">
        <button class="colpick-reset" type="button" @click="emit('reset')">恢复默认</button>
      </div>
    </div>
  </el-popover>
</template>

<style scoped>
.colpick-btn { font-size: var(--fs-1); color: var(--accent); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 10px; cursor: pointer; }
.colpick-title { font-size: var(--fs-1); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-2); }
.colpick-list { max-height: 320px; overflow-y: auto; }
.colpick-row { display: flex; align-items: center; gap: var(--sp-2); padding: 2px 0; font-size: var(--fs-1); }
.colpick-hidden .colpick-label { color: var(--mut); }
.colpick-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.colpick-arrow { width: 20px; border: 1px solid var(--line); background: var(--card2); border-radius: var(--r-sm); cursor: pointer; color: var(--sub); }
.colpick-arrow:disabled { opacity: var(--disabled-opacity, .45); cursor: not-allowed; }
.colpick-actions { display: flex; justify-content: flex-end; margin-top: var(--sp-2); border-top: 1px solid var(--line); padding-top: var(--sp-2); }
.colpick-reset { font-size: var(--fs-1); color: var(--sub); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 10px; cursor: pointer; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- ColumnPicker`
Expected: PASS（若 popover teleport 致查询不到，按同目录现有 popover 测试约定调整选择器/`attachTo`，断言不弱化）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ColumnPicker.vue frontend/src/components/ColumnPicker.test.ts
git commit -m "feat(fe-comp): ColumnPicker 选列菜单(勾选显隐+上下排序+恢复默认)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: DataTable 加可选 `fixed` 透传

**Files:**
- Modify: `frontend/src/components/DataTable.vue`（DataColumn 接口 + el-table-column 绑定）
- Test: `frontend/src/components/DataTable.test.ts`（若存在则补一条；不存在则在本任务新建最小测试）

**Interfaces:**
- Produces: `DataColumn.fixed?: 'left' | 'right'`，透传 el-table-column `:fixed`。现有 14 处消费方不设此字段 → undefined → el-table 默认(不固定)，行为不变。

- [ ] **Step 1: 写/补测试**

若 `frontend/src/components/DataTable.test.ts` 存在，追加；否则新建：

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DataTable, { type DataColumn } from './DataTable.vue'

describe('DataTable fixed 列', () => {
  it('col.fixed 透传到 el-table-column', () => {
    const cols: DataColumn[] = [
      { key: 'a', label: 'A' },
      { key: 'op', label: '操作', fixed: 'right' },
    ]
    const w = mount(DataTable, { props: { columns: cols, rows: [{ a: 1 }] } })
    // el-table-column fixed=right 会在表格根渲染 fixed 容器类
    expect(w.html()).toContain('fixed')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- DataTable`
Expected: FAIL（`fixed` 不在 DataColumn / 未透传）。若现有 DataTable.test 已绿但新断言失败亦可。

- [ ] **Step 3: 改 DataTable.vue**

`frontend/src/components/DataTable.vue` 的 `DataColumn` 接口加一行（在 `wrap?` 之后）：

```typescript
  /** 固定列：'left' | 'right'（横向滚动时常驻）；默认不固定 */
  fixed?: 'left' | 'right'
```

`<el-table-column>` 标签加 `:fixed="col.fixed"`（在 `:width="col.width"` 之后）：

```html
      <el-table-column
        v-for="col in props.columns"
        :key="col.key"
        :prop="col.key"
        :label="col.label"
        :width="col.width"
        :fixed="col.fixed"
        :sortable="!!col.sortable"
        :show-overflow-tooltip="!col.wrap"
        :cell-class-name="col.wrap ? 'dt-wrap-col' : ''"
      >
```

- [ ] **Step 4: 跑测试确认通过 + 防牵连**

Run: `cd frontend && npm run test:run -- DataTable && npm run typecheck`
Expected: PASS（typecheck 绿；现有消费方不传 fixed,不受影响）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DataTable.vue frontend/src/components/DataTable.test.ts
git commit -m "feat(fe-comp): DataTable 加可选 fixed 列透传(横滚常驻列)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: ClosedProjectsView 重构（表头筛选 + 选列 + 横滚）

**Files:**
- Modify: `frontend/src/lib/closedProjectList.ts`（`filterClosedRows` 删列枚举分支、`ClosedFilters` 收窄为仅 search）
- Modify: `frontend/src/views/ClosedProjectsView.vue`（全量重构）
- Test: `frontend/src/lib/closedProjectList.test.ts`（更新）、`frontend/src/views/ClosedProjectsView.test.ts`（更新）

**Interfaces:**
- Consumes: `useColumnPrefs`(Task1)、`ColumnPicker`(Task2)、`DataColumn.fixed`(Task3,本视图不用)、`ColumnFilter`/`useCrossFilterStore`/`applyColumnFilters`(现有)。
- Produces: 无下游。

- [ ] **Step 1: 改测试 — closedProjectList 收窄 + 视图**

`frontend/src/lib/closedProjectList.test.ts`：`ClosedFilters` 现仅 `{ search }`；删去 `filterClosedRows` 的 manager/orgL4/... 多选断言（那些迁到 crossFilter，已由 lib/crossFilter 测试覆盖），保留 search 用例。把 `filterClosedRows(rows, { search: '李四', manager: [], ... })` 改为 `filterClosedRows(rows, { search: '李四' })`，断言不变（仍 `['C-2']`）；删 `'多选 经理 过滤'` 用例（该能力移交 applyColumnFilters）；`distinctClosedOptions` 用例删除（不再用）。

`frontend/src/views/ClosedProjectsView.test.ts`：保留"渲染清单列与行"与"空态"两用例，断言不弱化（仍断言 含 '已关闭项目'/'终端甲'/'已验收'/'2025-08-15'）；新增一条：默认隐藏列(签约单位)默认不在表格、可见列(项目状态)在表格。示例：

```typescript
  it('默认列集:显示项目状态,隐藏签约单位', async () => {
    const ds = useDataStore()
    ds.data = { closedProjects: [{
      projectId: 'C-1', projectName: '终端甲', projectManager: '张三', orgL4: '安全A组', orgL3_1: '三部一组',
      合同编号: 'HT-1', customer: { 最终客户: '客A', 签约单位: '甲单位', 合同总额: 1000000, 行业: '金融' },
      status: { 项目状态: '已验收', 项目级别: 'B', 项目类型: '实施项目', 评级: 'A' },
      progress: { 项目阶段: '项目收尾', 完工进展: 1 }, cost: { 消耗比: 1.2, 项目超支: true },
      closeInfo: { 关闭时间: '2025-08-15' },
    }] } as any
    const router = makeRouter(); router.push('/projects/closed'); await router.isReady()
    const w = mount(ClosedProjectsView, { global: { plugins: [router] } })
    await w.vm.$nextTick()
    expect(w.text()).toContain('项目状态')      // 默认可见列名
    expect(w.text()).not.toContain('签约单位')  // 默认隐藏列名(表头不出现)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- closedProjectList ClosedProjectsView`
Expected: FAIL（ClosedFilters 仍宽、视图未改）

- [ ] **Step 3: 收窄 closedProjectList.ts**

`frontend/src/lib/closedProjectList.ts`：`ClosedFilters` 改为：

```typescript
export interface ClosedFilters {
  search: string
}
```

`filterClosedRows` 改为（仅 search；列枚举交 crossFilter）：

```typescript
export function filterClosedRows(rows: ClosedRow[], f: ClosedFilters): ClosedRow[] {
  const kw = f.search.trim().toLowerCase()
  if (!kw) return rows
  return rows.filter((r) =>
    [r.projectName, r.projectId, r.customer, r.projectManager].some((x) => x.toLowerCase().includes(kw)),
  )
}
```

删除 `distinctClosedOptions` 导出（不再使用）。`buildClosedRows`/`ClosedRow` 不变。

- [ ] **Step 4: 重构 ClosedProjectsView.vue**

整体替换 `frontend/src/views/ClosedProjectsView.vue` 为：

```vue
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { ClosedProject } from '@/types/analysis'
import { buildClosedRows, filterClosedRows } from '@/lib/closedProjectList'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'

const TABLE_ID = 'projects-closed'
const data = useDataStore()
const cf = useCrossFilterStore()
const router = useRouter()
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() => buildClosedRows((data.data?.closedProjects ?? []) as ClosedProject[]))
const search = ref('')
// 先表头列枚举(crossFilter) → 再全列搜索
const filtered = computed(() => filterClosedRows(applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)), { search: search.value }))

const ALL_COLUMNS: DataColumn[] = [
  { key: 'projectName', label: '项目名称', width: 220 },
  { key: 'projectId', label: '项目编号', width: 175 },
  { key: 'customer', label: '客户', width: 130 },
  { key: 'signParty', label: '签约单位', width: 130 },
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'orgL4', label: 'L4组', width: 110 },
  { key: 'orgL3_1', label: 'L3-1部门', width: 110 },
  { key: 'projectManager', label: '项目经理', width: 96 },
  { key: 'projectType', label: '项目类型', width: 110 },
  { key: 'projectLevel', label: '级别', width: 80 },
  { key: 'rating', label: '评级', width: 80 },
  { key: 'stage', label: '项目阶段', width: 110 },
  { key: 'projectStatus', label: '项目状态', width: 100 },
  { key: 'closedAt', label: '关闭时间', width: 110, sortable: true },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'overspend', label: '项目超支', width: 90, formatter: (v) => (v === true ? '是' : '否') },
]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ['projectName', 'projectId', 'customer', 'contractAmount', 'orgL4', 'projectManager', 'projectType', 'projectLevel', 'stage', 'projectStatus', 'closedAt', 'costRatio', 'overspend']
const FILTERABLE = new Set(['orgL4', 'orgL3_1', 'projectManager', 'projectType', 'projectLevel', 'rating', 'stage', 'projectStatus'])

const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))

// 关列时清其表头筛选(不变式)
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

function onRow(row: Record<string, any>) { router.push(`/closed-project/${row.projectId}`) }
</script>

<template>
  <div class="closed-view">
    <h2 class="cv-title">已关闭项目</h2>
    <div class="toolbar">
      <el-input v-model="search" size="small" placeholder="搜索 项目名/编号/客户/经理" clearable style="width: 230px" />
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
    </div>

    <div v-if="!rows.length" class="cv-empty">暂无已关闭项目数据——请在「数据管理」提供 PMIS 已关闭三表后点「更新数据」。</div>
    <div v-else class="cv-scroll">
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="cv-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" /></span>
        </template>
      </DataTable>
    </div>

    <div v-if="rows.length" class="cv-pager">
      <span class="cv-total u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.closed-view { padding: var(--sp-4); }
.cv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.cv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.cv-scroll { overflow-x: auto; }
.cv-th { display: inline-flex; align-items: center; }
.cv-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.cv-total { font-size: var(--fs-1); color: var(--sub); }
</style>
```

（注：DataTable 的 `header-${col.key}` 插槽用动态插槽名 `#[\`header-${col.key}\`]` 遍历 visibleColumns 注入；**若动态插槽名+v-for 构建/渲染异常，退回为每个可筛列写静态 `#header-orgL4`/`#header-projectManager`/... 插槽**(更冗长但稳,同现有 ProjectsView 旧 `#header-health` 写法)。el-table 自身列总宽(≈1600px>容器)即出横滚，外层 `.cv-scroll overflow-x:auto` 兜底。）

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- closedProjectList ClosedProjectsView`
Expected: PASS

- [ ] **Step 6: typecheck + 全量 vitest**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: PASS（全绿）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/closedProjectList.ts frontend/src/lib/closedProjectList.test.ts frontend/src/views/ClosedProjectsView.vue frontend/src/views/ClosedProjectsView.test.ts
git commit -m "feat(fe-views): 已关闭清单 表头列筛选+选列菜单+横滚+L4组改名

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: ProjectsView 重构（表头筛选 + 选列 + 项目状态/回款状态列 + 深链 + 横滚）

**Files:**
- Modify: `frontend/src/lib/projectList.ts`（`filterProjectRows` 删列枚举分支、`ProjectFilters` 收窄、删 `distinctOptions`）
- Modify: `frontend/src/views/ProjectsView.vue`（全量重构）
- Test: `frontend/src/lib/projectList.test.ts`（更新）、`frontend/src/views/ProjectsView.test.ts`（更新）

**Interfaces:**
- Consumes: `useColumnPrefs`(Task1)、`ColumnPicker`(Task2)、`DataColumn.fixed`(Task3)、`ColumnFilter`/`useCrossFilterStore`/`applyColumnFilters`/`cfUniqueValues`(现有)、`ProjectRow`(现有,字段含 projectStatus/paymentStatus)。

- [ ] **Step 1: 改测试 — projectList 收窄**

`frontend/src/lib/projectList.test.ts`：`ProjectFilters` 现为 `{ search, presale, paused, overspend, tags }`；删去 manager/orgL4/stage/projectStatus/riskLevel/projectLevel/paymentStatus/health 多选过滤断言（迁 crossFilter）；保留 search、presale、paused=yes/overspend=yes、tags、以及守护用例(`cost.项目超支:true→overspend=true`)。把这些用例里 `filterProjectRows(rows, {...全字段...})` 改为只传收窄后的字段。`paymentStatusOf`/`buildProjectRows` 用例不变。删 `distinctOptions` 用例(不再用)。

- [ ] **Step 2: 改测试 — ProjectsView**

`frontend/src/views/ProjectsView.test.ts`：
- 保留并不弱化基础渲染断言。
- 现有深链用例：`?overspend=yes` 仍走本地特殊态(断言过滤结果不变)；`?orgL4=B组`、`?riskLevel=中` 改为断言"进页后 crossFilter('projects-active') 对应列被设值，且表格仅剩匹配行"（用 `useCrossFilterStore().tableFilters('projects-active')` 验证 + 渲染行断言；过滤结果不弱化）。
- 新增：默认列含"项目状态"且位于"回款完成率"与"健康度"间(断言表头文本顺序或列定义)、列名"L4组"、表头可筛列有 ColumnFilter ▼、选列菜单按钮存在、横滚容器 `.pv-scroll` 存在。

- [ ] **Step 3: 收窄 projectList.ts**

`frontend/src/lib/projectList.ts`：`ProjectFilters` 改为：

```typescript
export interface ProjectFilters {
  search: string
  presale: string // '' | 'yes' | 'no'
  paused: string   // '' | 'yes'
  overspend: string // '' | 'yes'
  tags: string[]
}
```

`filterProjectRows` 改为（删列枚举分支，保留 search/presale/paused/overspend/tags）：

```typescript
export function filterProjectRows(rows: ProjectRow[], f: ProjectFilters): ProjectRow[] {
  const q = (f.search || '').trim().toLowerCase()
  return rows.filter((r) => {
    if (q && ![r.projectName, r.projectId, r.customer, r.projectManager].some((s) => s !== '-' && s.toLowerCase().includes(q))) return false
    if (f.paused === 'yes' && !r.paused) return false
    if (f.overspend === 'yes' && !r.overspend) return false
    if (f.presale === 'yes' && !r.isPresale) return false
    if (f.presale === 'no' && r.isPresale) return false
    if (f.tags && f.tags.length) {
      const sel = new Set(f.tags)
      if (!(r.tags ?? []).some((t) => sel.has(t))) return false
    }
    return true
  })
}
```

删除 `distinctOptions` 导出（不再使用）。`ProjectRow`/`buildProjectRows`/`paymentStatusOf` 不变。

- [ ] **Step 4: 重构 ProjectsView.vue**

整体替换 `frontend/src/views/ProjectsView.vue` 为：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useCrossFilterStore } from '@/stores/crossFilter'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, filterProjectRows, type ProjectFilters } from '@/lib/projectList'
import { applyColumnFilters, cfUniqueValues } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import { fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import HealthBadge from '@/components/HealthBadge.vue'
import FollowupModal from '@/components/FollowupModal.vue'
import Modal from '@/components/Modal.vue'
import { exportSheets } from '@/lib/exportXlsx'
import { buildExportSheets, type ExportScope } from '@/lib/projectExport'
import { followupApi } from '@/lib/followupApi'

const TABLE_ID = 'projects-active'
const data = useDataStore()
const projectTags = useProjectTagsStore()
const cf = useCrossFilterStore()
const route = useRoute()
const router = useRouter()
onMounted(() => {
  if (!data.data) data.load()
  if (!projectTags.loaded) projectTags.load()
})

const rows = computed(() =>
  buildProjectRows((data.data?.projects ?? []) as Project[], (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>, projectTags.assignments))

// 工具栏特殊筛选(非列枚举)
const sp = reactive<ProjectFilters>({ search: '', presale: '', paused: '', overspend: '', tags: [] })
// 先表头列枚举(crossFilter) → 再特殊项
const filtered = computed(() => filterProjectRows(applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)), sp))

const ALL_COLUMNS: DataColumn[] = [
  { key: 'projectName', label: '项目名称', width: 220 },
  { key: 'projectId', label: '项目编号', width: 175 },
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'projectManager', label: '项目经理', width: 96 },
  { key: 'orgL4', label: 'L4组', width: 110 },
  { key: 'stage', label: '阶段', width: 100 },
  { key: 'progress', label: '完工%', width: 90, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'riskLevel', label: '风险', width: 96 },
  { key: 'projectLevel', label: '级别', width: 80 },
  { key: 'projectType', label: '项目类型', width: 110 },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'paymentRatio', label: '回款完成率', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'projectStatus', label: '项目状态', width: 100 },
  { key: 'health', label: '健康度', width: 96 },
  { key: 'paymentStatus', label: '回款状态', width: 100 },
  { key: 'tags', label: '标签', width: 160, formatter: (v) => (Array.isArray(v) && v.length ? v.join('、') : '') },
  { key: 'action', label: '操作', width: 80, fixed: 'right' },
]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ['projectName', 'projectId', 'contractAmount', 'projectManager', 'orgL4', 'riskLevel', 'projectLevel', 'projectType', 'costRatio', 'paymentRatio', 'projectStatus', 'health', 'action']
const FILTERABLE = new Set(['projectManager', 'orgL4', 'stage', 'projectStatus', 'riskLevel', 'projectLevel', 'projectType', 'paymentStatus', 'health'])

const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))

function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

// KPI 深链 → 列枚举写 crossFilter(并确保列可见) / 特殊项写本地态
function qval(v: unknown): string | null {
  if (typeof v === 'string' && v) return v
  if (Array.isArray(v)) { const s = v.find((x) => typeof x === 'string' && x); return (s as string) || null }
  return null
}
for (const key of FILTERABLE) {
  const val = qval(route.query[key])
  if (val) {
    if (!prefs.visibleKeys.value.includes(key)) prefs.toggle(key)   // 罕见:深链命中默认隐藏列(paymentStatus)→显
    cf.setColumnFilter(TABLE_ID, key, [val], cfUniqueValues(rows.value, key).length)
  }
}
{
  const presale = qval(route.query.presale); if (presale) sp.presale = presale
  const paused = qval(route.query.paused); if (paused) sp.paused = paused
  const overspend = qval(route.query.overspend); if (overspend) sp.overspend = overspend
}

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

function onRow(row: Record<string, any>) { router.push(`/project/${row.projectId}`) }

const fuOpen = ref(false)
const fuProject = ref<{ projectId: string; projectName: string }>({ projectId: '', projectName: '' })
function openFollowup(row: Record<string, any>) {
  fuProject.value = { projectId: row.projectId, projectName: row.projectName || '' }
  fuOpen.value = true
}

const exOpen = ref(false)
const exScope = ref<ExportScope[]>(['list', 'tags', 'followup'])
const EX_OPTS: { value: ExportScope; label: string }[] = [
  { value: 'list', label: '项目清单' },
  { value: 'tags', label: '项目标签' },
  { value: 'followup', label: '跟进记录' },
  { value: 'nodes', label: '回款节点' },
  { value: 'milestones', label: '里程碑' },
]
async function doExport() {
  const fu = exScope.value.includes('followup') ? (await followupApi.all()).records : []
  const sheets = buildExportSheets(exScope.value, {
    rows: filtered.value,
    projects: (data.data?.projects ?? []) as any,
    assignments: projectTags.assignments,
    followup: fu as any,
    paymentNodes: (data.data?.paymentNodes ?? {}) as any,
    milestones: (data.data?.projectMilestones ?? {}) as any,
  })
  exportSheets(`项目数据导出_${filtered.value.length}项.xlsx`, sheets)
  exOpen.value = false
}
</script>

<template>
  <div class="projects-view">
    <h2 class="pv-title">在建项目</h2>
    <div class="toolbar">
      <el-input v-model="sp.search" size="small" placeholder="搜索 项目名/编号/客户/经理" clearable style="width: 230px" />
      <el-select v-model="sp.presale" size="small" clearable placeholder="售前整合" style="width: 105px"
        :empty-values="['', null, undefined]" :value-on-clear="''">
        <el-option value="yes" label="售前整合" />
        <el-option value="no" label="非售前" />
      </el-select>
      <el-select v-model="sp.tags" size="small" multiple collapse-tags clearable placeholder="标签" style="width: 140px">
        <el-option v-for="t in projectTags.activeTags" :key="t.name" :value="t.name" :label="t.name" />
      </el-select>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button class="pv-export-btn" @click="exOpen = true">导出</button>
    </div>

    <div v-if="sp.paused === 'yes' || sp.overspend === 'yes'" class="pv-tags">
      <span v-if="sp.paused === 'yes'" class="pv-tag">已暂停项目 <button @click="sp.paused = ''">✕</button></span>
      <span v-if="sp.overspend === 'yes'" class="pv-tag">超支项目 <button @click="sp.overspend = ''">✕</button></span>
    </div>

    <div v-if="!rows.length" class="pv-empty">暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>
    <div v-else class="pv-scroll">
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="pv-th">{{ c.label }}<el-tooltip v-if="c.key === 'health'" placement="top">
              <template #content>四维异常——进度:里程碑进度状态含滞后/延期/超期;风险:最高等级高且未关闭&gt;0;成本:超支或消耗比&gt;100%;回款:存在延期回款节点。<br />总评:0 项=健康 / 1 项=关注 / ≥2 项=风险;PMIS 未匹配=无数据。</template>
              <span class="pv-info">i</span>
            </el-tooltip><ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" /></span>
        </template>
        <template #cell-projectName="{ row }">
          {{ row.projectName }}<span v-if="row.hasClosed" class="pv-origin">原项目*</span>
        </template>
        <template #cell-health="{ row }">
          <HealthBadge :overall="row.health" />
        </template>
        <template #cell-tags="{ value }">
          <span v-for="t in (value || [])" :key="t" class="lst-tag">{{ t }}</span>
        </template>
        <template #cell-action="{ row }">
          <button class="pv-fu-btn" @click.stop="openFollowup(row)">跟进</button>
        </template>
      </DataTable>
    </div>

    <FollowupModal v-model="fuOpen" :project-id="fuProject.projectId" :project-name="fuProject.projectName" />

    <Modal v-model="exOpen" title="导出范围" width="420px">
      <el-checkbox-group v-model="exScope">
        <el-checkbox v-for="o in EX_OPTS" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
      </el-checkbox-group>
      <div style="margin-top: var(--gap-card)">
        <button class="pv-fu-btn" :disabled="!exScope.length" @click="doExport">
          导出 xlsx（当前筛选 {{ filtered.length }} 项）
        </button>
      </div>
    </Modal>

    <div v-if="rows.length" class="pv-pager">
      <span class="pv-total u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.projects-view { padding: var(--sp-4); }
.pv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.pv-scroll { overflow-x: auto; }
.pv-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
.pv-origin { margin-left: var(--sp-2); padding: 0 var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); background: var(--selected-tint); color: var(--accent); }
.pv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.pv-tags { display: flex; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.pv-tag { display: inline-flex; align-items: center; gap: var(--sp-2); padding: 2px var(--sp-3); border-radius: var(--r-full); font-size: var(--fs-1); background: var(--selected-tint); color: var(--accent); font-weight: 600; }
.pv-tag button { border: none; background: none; color: var(--accent); cursor: pointer; padding: 0; font-size: var(--fs-1); }
.pv-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.pv-total { font-size: var(--fs-1); color: var(--sub); }
.pv-info { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: var(--r-full); border: 1px solid var(--sub); color: var(--sub); font-size: 10px; font-style: italic; cursor: help; line-height: 1; }
.lst-tag { display: inline-block; padding: 1px 6px; margin: 1px; border-radius: var(--r-sm); background: var(--card2); color: var(--sub); font-size: var(--fs-1); }
.pv-fu-btn { font-size: var(--fs-1); color: var(--accent); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 8px; cursor: pointer; }
.pv-export-btn { font-size: var(--fs-1); color: var(--accent); background: none; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 2px 10px; cursor: pointer; }
</style>
```

（注：项目状态列在 ALL_COLUMNS/DEFAULT_VISIBLE 中位于 paymentRatio 与 health 之间，满足 req1。回款状态列 paymentStatus 默认隐藏但可筛(显示后)。操作列 `fixed: 'right'`。深链对 projectStatus/riskLevel/orgL4 命中默认可见列;paymentStatus 深链(罕见)走 toggle 显逻辑。**动态 header 插槽若构建异常,同 Task4 退回静态 `#header-<key>` 插槽**;cell 插槽(projectName/health/tags/action)保持静态。）

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- projectList ProjectsView`
Expected: PASS

- [ ] **Step 6: typecheck + 全量 vitest**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: PASS（全绿。若 BoardView/其它消费 projectList 的 fixture 因 ProjectFilters 收窄报错,按新结构修；不弱化断言）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/projectList.ts frontend/src/lib/projectList.test.ts frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts
git commit -m "feat(fe-views): 在建清单 表头列筛选+选列菜单+项目状态/回款状态列+L4组+深链crossFilter+横滚

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 版本 V1.9.0 + verify.sh + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 升版本（Y 级）**

`frontend/src/version.ts`：

```typescript
export const APP_VERSION = 'V1.9.0'
export const RELEASE_DATE = '2026-06-18'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法 + ruff + pytest + 前端 typecheck/vitest/build）。任何红条先修到绿。

- [ ] **Step 3: 更新 PROGRESS.md**

`PROGRESS.md` 头部：当前版本改 `V1.9.0`；最近更新写结论（/projects 在建 与 /projects/closed 已关闭两清单：列枚举筛选移入表头(复用 ColumnFilter)、新增选列菜单 ColumnPicker(显隐+上下排序+localStorage 持久化,useColumnPrefs)、在建新增项目状态列(回款完成率与健康度间)+回款状态列、服务组(L4)→L4组、DataTable 加 fixed 列、横向滚动）；上一版本顺延记 V1.8.0。合适清单区加 `[x] 项目清单选列+表头筛选+横滚`（合并 SHA 在 finishing 后回填）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: 版本 V1.9.0 + PROGRESS(项目清单选列+表头筛选+横滚)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成后

跑完 Task 6 进入 superpowers:finishing-a-development-branch（option 1：merge --no-ff 到 master、合并结果跑 verify.sh、回填 PROGRESS 合并 SHA、删分支）。
