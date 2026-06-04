# 数据管理：数据质量总览 + 纳管开关 + 清空数据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点亮"数据管理"页（`/data`）的**数据质量总览**（5 项检查 × 三档 + 合计，单元格下钻明细）、**纳管开关**（全局联动）、**清空数据**（双确认 + 内存清空 + 服务端清理）。

**范围与拆分（重要）：** 旧数据管理页还含**云同步(SSE 流式进度, /api/sync)** 与**离线 Excel 导入(上传 + /api/import-status 轮询)**——这两块是流式/上传的后端写操作，体量与风险大，**拆为 B17**。本 B16 做"已加载数据上的"质量分析 + 纳管开关 + 清空（数据已由构建管线 `data/analysis_data.json` 加载，本页完全可用）。

**Architecture:** 质量检查抽到纯函数 `lib/dataQuality.ts`（检查定义 + 按档计数 + 下钻）。`data` store 增 `clearBusinessData()`（清空业务数据、保留平台配置）。组件 `DataQualityTable.vue`（检查表，单元格可点）、`DataDrillModal.vue`（复用 Modal + DataTable 列出问题节点）。`DataView.vue` owns 纳管开关(绑 filterStore) + 清空按钮 + 质量总览 + 下钻。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Element Plus(el-switch) + Vitest。

**忠实移植基准（旧 app.js）：** `initData`(3406) / `showDataDrill`(5126) / `clearData`(3552) / `toggleNaguan`(170)。

**关键忠实性要点：**
- 数据源 = `D.rawNodes`（**全部原始节点**，不做年份/视角/纳管过滤）。
- 5 项检查（去掉旧版恒为 0 的"状态为待确定"死检查）：
  1. 缺少项目金额（severity h，全量）：`!projectAmount`
  2. 实际回款比例待上报（m，仅关联）：`pctToNum(actualPaymentRatio)===null`
  3. 缺少项目经理（m，全量）：`!projectManager`
  4. 缺少服务组（l，全量）：`!orgL4`
  5. 回款比例>100%（h，仅关联）：`pctToNum(actualPaymentRatio)!==null && >1`
- 每项按三档（100万以上/50-100万/50万以下）计数 + 合计（合计=该 scope 全量计数，非档内之和的依赖；按 pred 在 scope 上算）。
- 单元格 count>0 可点击下钻：档位单元格 → 该档该检查的问题节点；合计单元格 → 全部档（tierIdx=-1）。下钻列表 5 列（项目编号/项目名称/金额区间/服务组/项目经理），`slice(0,200)`。
- 单元格配色：count>0 用 severity 色（h 红/m 橙/l 灰），否则绿。
- 清空数据：**双重 confirm** → 内存清空业务数据（保留 displayColumns/meta 等平台配置）+ 调 `/api/clear-data`（best-effort，失败仅内存清空）→ 按钮反馈。
- 纳管开关：绑 `filterStore.naguanOn`（`toggleNaguan`），切换联动全站（已由 B3 接通 filteredNodes）。

**展示从简（已记录，非偏差）：**
- 云同步(SSE)/离线导入(上传+轮询) → B17。
- tier 徽章配色省略（纯文本，与既有页一致）。
- 旧版 reloadData 动态加载脚本 → 本期清空用内存清空（数据 store），不重载脚本。
- 停止服务/关于等其它按钮非本页范围。

---

## File Structure

| 文件 | 职责 | 任务 |
|---|---|---|
| `frontend/src/lib/dataQuality.ts` | 纯函数：DATA_CHECKS / dataQualityRows / dataQualityDrill | T1 |
| `frontend/src/stores/data.ts`(改) | 增 `clearBusinessData()` | T2 |
| `frontend/src/components/DataQualityTable.vue` | 质量检查表（单元格可点下钻） | T3 |
| `frontend/src/components/DataDrillModal.vue` | 问题节点下钻弹层（Modal + DataTable） | T4 |
| `frontend/src/views/DataView.vue` | 纳管开关 + 清空 + 质量总览 + 下钻 | T5 |
| `frontend/src/router/index.ts`(改) | `/data` 由 PageStub 改 DataView | T6 |

新建文件配 `*.test.ts`。

---

### Task 1: lib/dataQuality.ts（纯函数 + 测试）

**Files:**
- Create: `frontend/src/lib/dataQuality.ts`
- Test: `frontend/src/lib/dataQuality.test.ts`

依赖：`RawNode` 来自 `@/types/analysis`；`pctToNum` 来自 `@/lib/format`。

- [ ] **Step 1: 写失败测试** — `frontend/src/lib/dataQuality.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { DATA_CHECKS, dataQualityRows, dataQualityDrill } from './dataQuality'

const NODES: any[] = [
  { projectId: 'P1', tier: '100万以上', projectAmount: 0, projectManager: '张', orgL4: '北京', isPaymentRelated: true, actualPaymentRatio: null },
  { projectId: 'P2', tier: '100万以上', projectAmount: 100, projectManager: '', orgL4: '', isPaymentRelated: true, actualPaymentRatio: 1.5 },
  { projectId: 'P3', tier: '50万以下', projectAmount: 50, projectManager: '李', orgL4: '上海', isPaymentRelated: false, actualPaymentRatio: null },
]

describe('DATA_CHECKS', () => {
  it('5 项检查，去掉死检查', () => {
    expect(DATA_CHECKS).toHaveLength(5)
    expect(DATA_CHECKS.map((c) => c.name)).toEqual([
      '缺少项目金额', '实际回款比例待上报', '缺少项目经理', '缺少服务组', '回款比例>100%',
    ])
  })
})

describe('dataQualityRows', () => {
  const rows = dataQualityRows(NODES)
  it('缺少项目金额：P1(0)', () => {
    const r = rows[0]
    expect(r.byTier).toEqual([1, 0, 0])
    expect(r.total).toBe(1)
  })
  it('实际回款比例待上报：仅关联且 null → P1', () => {
    expect(rows[1].total).toBe(1) // P3 虽 null 但非关联
  })
  it('回款比例>100%：关联且 >1 → P2', () => {
    expect(rows[4].total).toBe(1)
    expect(rows[4].byTier).toEqual([1, 0, 0])
  })
})

describe('dataQualityDrill', () => {
  it('合计(tierIdx=-1)：缺金额 → P1', () => {
    expect(dataQualityDrill(NODES, 0, -1).map((n: any) => n.projectId)).toEqual(['P1'])
  })
  it('档位下钻：100万以上 比例>100% → P2', () => {
    expect(dataQualityDrill(NODES, 4, 0).map((n: any) => n.projectId)).toEqual(['P2'])
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/lib/dataQuality.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/lib/dataQuality.ts`:

```ts
import type { RawNode } from '@/types/analysis'
import { pctToNum } from './format'

type N = Record<string, any>
export type Severity = 'h' | 'm' | 'l'

export interface DataCheck {
  key: string
  name: string
  severity: Severity
  scope: 'all' | 'related'
  pred: (n: N) => boolean
}

/** 忠实移植 initData 的数据质量检查（去掉旧版恒为 0 的"状态为待确定"死检查）。 */
export const DATA_CHECKS: DataCheck[] = [
  { key: 'noAmount', name: '缺少项目金额', severity: 'h', scope: 'all', pred: (n) => !n.projectAmount },
  { key: 'ratioPending', name: '实际回款比例待上报', severity: 'm', scope: 'related', pred: (n) => pctToNum(n.actualPaymentRatio) === null },
  { key: 'noPm', name: '缺少项目经理', severity: 'm', scope: 'all', pred: (n) => !n.projectManager },
  { key: 'noOrgL4', name: '缺少服务组', severity: 'l', scope: 'all', pred: (n) => !n.orgL4 },
  {
    key: 'ratioOver',
    name: '回款比例>100%',
    severity: 'h',
    scope: 'related',
    pred: (n) => {
      const v = pctToNum(n.actualPaymentRatio)
      return v !== null && v > 1
    },
  },
]

const TIERS = ['100万以上', '50-100万', '50万以下']

function scopeNodes(rawNodes: RawNode[], scope: 'all' | 'related'): N[] {
  return (scope === 'related' ? rawNodes.filter((n) => (n as N).isPaymentRelated) : rawNodes) as N[]
}

export interface QualityRow {
  key: string
  name: string
  severity: Severity
  byTier: number[]
  total: number
}
/** 各检查项按三档计数 + 合计。 */
export function dataQualityRows(rawNodes: RawNode[]): QualityRow[] {
  return DATA_CHECKS.map((c) => {
    const base = scopeNodes(rawNodes, c.scope)
    const byTier = TIERS.map((t) => base.filter((n) => n.tier === t && c.pred(n)).length)
    return { key: c.key, name: c.name, severity: c.severity, byTier, total: base.filter((n) => c.pred(n)).length }
  })
}

/** 下钻：checkIdx 检查项、tierIdx 档位(-1=全部) 的问题节点。忠实移植 showDataDrill。 */
export function dataQualityDrill(rawNodes: RawNode[], checkIdx: number, tierIdx: number): RawNode[] {
  const c = DATA_CHECKS[checkIdx]
  if (!c) return []
  let base = scopeNodes(rawNodes, c.scope)
  if (tierIdx >= 0) base = base.filter((n) => n.tier === TIERS[tierIdx])
  return base.filter((n) => c.pred(n)) as RawNode[]
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/lib/dataQuality.test.ts`（全绿）
- [ ] **Step 5: typecheck** — `cd frontend && npm run typecheck`（无新增错误）。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/dataQuality.ts frontend/src/lib/dataQuality.test.ts
git commit -m "feat(frontend): 新增 dataQuality 纯函数（检查定义/按档计数/下钻）"
```

---

### Task 2: data store 增 clearBusinessData + 测试

**Files:**
- Modify: `frontend/src/stores/data.ts`
- Create: `frontend/src/stores/data.test.ts`

- [ ] **Step 1: 写失败测试** — `frontend/src/stores/data.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDataStore } from './data'

beforeEach(() => setActivePinia(createPinia()))

describe('useDataStore.clearBusinessData', () => {
  it('清空业务数据，保留平台配置', () => {
    const s = useDataStore()
    s.data = {
      meta: { lastUpdate: 'x', totalProjects: 1, totalPaymentNodes: 1 },
      dashboard: { a: 1 },
      summary: { b: 2 },
      rawNodes: [{ projectId: 'P1' }],
      projectOverview: { projects: [{ projectId: 'P1' }], columns: [{ key: 'projectId' }] },
      naguanMap: {},
      naguanExclude: {},
      displayColumns: { '100万以上': [{ key: 'projectId' }] },
      followupRecords: {},
    } as any
    s.clearBusinessData()
    expect(s.data!.rawNodes).toEqual([])
    expect((s.data!.projectOverview as any).projects).toEqual([])
    // 平台配置保留
    expect(s.data!.displayColumns).toBeTruthy()
    expect((s.data!.projectOverview as any).columns).toHaveLength(1)
  })
  it('data 为空时安全', () => {
    const s = useDataStore()
    expect(() => s.clearBusinessData()).not.toThrow()
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/stores/data.test.ts`（FAIL）

- [ ] **Step 3: 实现** — 修改 `frontend/src/stores/data.ts`：在 `load` 之后、`return` 之前加入 `clearBusinessData`，并把它加入 return：

```ts
  /** 清空业务数据（rawNodes/summary/dashboard/projectOverview.projects），保留平台配置（displayColumns/meta/列定义）。忠实移植 clearData 的内存清空。 */
  function clearBusinessData() {
    if (!data.value) return
    const ov = (data.value.projectOverview ?? {}) as Record<string, any>
    data.value = {
      ...data.value,
      rawNodes: [],
      summary: {} as any,
      dashboard: {} as any,
      projectOverview: { ...ov, projects: [] } as any,
    }
  }
```

return 改为：

```ts
  return { data, loading, error, load, clearBusinessData }
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/stores/data.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/stores/data.ts frontend/src/stores/data.test.ts
git commit -m "feat(frontend): data store 增 clearBusinessData（清空业务数据保留平台配置）"
```

---

### Task 3: components/DataQualityTable.vue（检查表 + 测试）

**Files:**
- Create: `frontend/src/components/DataQualityTable.vue`
- Test: `frontend/src/components/DataQualityTable.test.ts`

依赖：类型 `QualityRow` 来自 `@/lib/dataQuality`。无需 Element Plus。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/DataQualityTable.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DataQualityTable from './DataQualityTable.vue'

const rows = [
  { key: 'noAmount', name: '缺少项目金额', severity: 'h', byTier: [1, 0, 0], total: 1 },
  { key: 'noPm', name: '缺少项目经理', severity: 'm', byTier: [0, 0, 0], total: 0 },
]

describe('DataQualityTable', () => {
  it('渲染检查项/三档/合计', () => {
    const w = mount(DataQualityTable, { props: { rows } })
    expect(w.text()).toContain('缺少项目金额')
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('合计')
  })
  it('count>0 单元格点击 emit drill', async () => {
    const w = mount(DataQualityTable, { props: { rows } })
    await w.find('.dq-cell.clickable').trigger('click')
    const ev = w.emitted('drill')
    expect(ev).toBeTruthy()
    expect(ev![0][0]).toEqual({ checkIdx: 0, tierIdx: 0 }) // 第一行第一档
  })
  it('count=0 单元格不可点', () => {
    const w = mount(DataQualityTable, { props: { rows } })
    // 第二行(noPm)全 0：其单元格无 clickable
    const cells = w.findAll('.dq-cell')
    const zeroCells = cells.filter((c) => c.text() === '0')
    expect(zeroCells.every((c) => !c.classes('clickable'))).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/components/DataQualityTable.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/components/DataQualityTable.vue`:

```vue
<script setup lang="ts">
import type { QualityRow, Severity } from '@/lib/dataQuality'

defineProps<{ rows: QualityRow[] }>()
const emit = defineEmits<{ drill: [{ checkIdx: number; tierIdx: number }] }>()

const TIER_LABELS = ['100万以上', '50-100万', '50万以下']
const sevColor = (s: Severity) => (s === 'h' ? '#ef4444' : s === 'm' ? '#f59e0b' : '#94a3b8')
const cellColor = (count: number, s: Severity) => (count > 0 ? sevColor(s) : '#10b981')
</script>

<template>
  <table class="dq-table">
    <thead>
      <tr>
        <th>检查项</th>
        <th v-for="t in TIER_LABELS" :key="t" class="c">{{ t }}</th>
        <th class="c">合计</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(r, ci) in rows" :key="r.key">
        <td>
          <span class="dq-dot" :style="{ background: sevColor(r.severity) }"></span>{{ r.name }}
        </td>
        <td
          v-for="(v, ti) in r.byTier"
          :key="ti"
          class="dq-cell c"
          :class="{ clickable: v > 0 }"
          :style="{ color: cellColor(v, r.severity) }"
          @click="v > 0 && emit('drill', { checkIdx: ci, tierIdx: ti })"
        >
          {{ v }}
        </td>
        <td
          class="dq-cell c total"
          :class="{ clickable: r.total > 0 }"
          :style="{ color: cellColor(r.total, r.severity) }"
          @click="r.total > 0 && emit('drill', { checkIdx: ci, tierIdx: -1 })"
        >
          {{ r.total }}
        </td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
.dq-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dq-table th, .dq-table td { border: 1px solid #f1f5f9; padding: 8px 10px; }
.dq-table th { background: #f8fafc; color: #475569; font-weight: 600; }
.dq-table th.c, .dq-cell.c { text-align: center; }
.dq-cell { font-family: var(--font-mono, monospace); font-weight: 700; }
.dq-cell.clickable { cursor: pointer; }
.dq-cell.clickable:hover { background: #f8fafc; }
.dq-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
</style>
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/components/DataQualityTable.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/DataQualityTable.vue frontend/src/components/DataQualityTable.test.ts
git commit -m "feat(frontend): 新增 DataQualityTable 数据质量检查表（单元格可点下钻）"
```

---

### Task 4: components/DataDrillModal.vue（下钻弹层 + 测试）

**Files:**
- Create: `frontend/src/components/DataDrillModal.vue`
- Test: `frontend/src/components/DataDrillModal.test.ts`

依赖：`./Modal.vue`、`./DataTable.vue`（DataColumn）。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/DataDrillModal.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DataDrillModal from './DataDrillModal.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

const nodes = [
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张' },
]

describe('DataDrillModal', () => {
  it('打开渲染标题与节点表', async () => {
    const w = mount(DataDrillModal, {
      props: { modelValue: true, title: '100万以上 - 缺少项目金额', nodes },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('缺少项目金额')
    expect(document.body.textContent).toContain('P1')
    expect(w.findComponent({ name: 'DataTable' }).exists()).toBe(true)
    w.unmount()
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/components/DataDrillModal.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/components/DataDrillModal.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import Modal from './Modal.vue'
import DataTable, { type DataColumn } from './DataTable.vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  nodes: Record<string, any>[]
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'tier', label: '金额区间' },
  { key: 'orgL4', label: '服务组' },
  { key: 'projectManager', label: '项目经理' },
]
const rows = computed(() => props.nodes.slice(0, 200))
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="title"
    width="80%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <DataTable :columns="COLS" :rows="rows" />
  </Modal>
</template>
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/components/DataDrillModal.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/DataDrillModal.vue frontend/src/components/DataDrillModal.test.ts
git commit -m "feat(frontend): 新增 DataDrillModal 数据质量下钻弹层（Modal + DataTable）"
```

---

### Task 5: views/DataView.vue（装配 + 测试）

**Files:**
- Create: `frontend/src/views/DataView.vue`
- Test: `frontend/src/views/DataView.test.ts`

依赖：`@/stores/data`、`@/stores/filter`(naguanOn/toggleNaguan)、`@/api/client`(api)、`@/lib/dataQuality`、`@/components/DataQualityTable.vue`、`@/components/DataDrillModal.vue`。Element Plus(el-switch)。

- [ ] **Step 1: 写失败测试** — `frontend/src/views/DataView.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import DataView from './DataView.vue'
import { useDataStore } from '@/stores/data'

vi.mock('@/api/client', () => ({
  api: { get: vi.fn().mockResolvedValue({ success: true, message: '已清空' }), post: vi.fn() },
  ApiRequestError: class extends Error {},
}))
import { api } from '@/api/client'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', projectAmount: 0, projectManager: '张', orgL4: '北京', isPaymentRelated: true, actualPaymentRatio: null },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('DataView', () => {
  it('渲染标题/纳管开关/质量总览/清空按钮', () => {
    seed()
    const w = mount(DataView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('数据管理')
    expect(w.text()).toContain('数据质量总览')
    expect(w.text()).toContain('纳管')
    expect(w.text()).toContain('清空数据')
    expect(w.findComponent({ name: 'DataQualityTable' }).exists()).toBe(true)
    expect(w.text()).toContain('缺少项目金额')
  })

  it('点击质量单元格打开下钻弹层', async () => {
    seed()
    const w = mount(DataView, { global: { plugins: [ElementPlus] }, attachTo: document.body })
    await w.find('.dq-cell.clickable').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('缺少项目金额')
    expect(w.findComponent({ name: 'DataDrillModal' }).exists()).toBe(true)
    w.unmount()
  })

  it('清空数据：双确认通过则清内存 + 调 api', async () => {
    seed()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const ds = useDataStore()
    const w = mount(DataView, { global: { plugins: [ElementPlus] } })
    await (w.vm as any).onClear()
    await flushPromises()
    expect(ds.data!.rawNodes).toEqual([])
    expect(api.get).toHaveBeenCalledWith('/api/clear-data')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/views/DataView.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/views/DataView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { api } from '@/api/client'
import { dataQualityRows, dataQualityDrill, DATA_CHECKS } from '@/lib/dataQuality'
import DataQualityTable from '@/components/DataQualityTable.vue'
import DataDrillModal from '@/components/DataDrillModal.vue'

const data = useDataStore()
const filter = useFilterStore()
onMounted(() => {
  if (!data.data) data.load()
})

const TIER_LABELS = ['100万以上', '50-100万', '50万以下']

const rawNodes = computed(() => (data.data?.rawNodes ?? []) as Record<string, any>[])
const rows = computed(() => dataQualityRows(rawNodes.value as any))

// 纳管开关绑全局 filterStore
const naguanOn = computed({
  get: () => filter.naguanOn,
  set: (v: boolean) => filter.toggleNaguan(v),
})

// 下钻弹层
const drillOpen = ref(false)
const drillTitle = ref('')
const drillNodes = ref<Record<string, any>[]>([])
function onDrill(e: { checkIdx: number; tierIdx: number }) {
  drillNodes.value = dataQualityDrill(rawNodes.value as any, e.checkIdx, e.tierIdx) as Record<string, any>[]
  const tierLabel = e.tierIdx >= 0 ? TIER_LABELS[e.tierIdx] : '全部区间'
  drillTitle.value = `${tierLabel} - ${DATA_CHECKS[e.checkIdx]?.name || ''}`
  drillOpen.value = true
}

// 清空数据
const clearState = ref('')
const clearing = ref(false)
async function onClear() {
  if (!window.confirm('确定要清空所有数据吗？\n\n此操作将删除系统中所有已加载的项目和回款数据，清空后需重新同步才能恢复。')) return
  if (!window.confirm('再次确认：是否清空所有数据？此操作不可撤销！')) return
  clearing.value = true
  data.clearBusinessData()
  try {
    await api.get('/api/clear-data')
    clearState.value = '已清空(含数据文件)'
  } catch {
    clearState.value = '内存已清空'
  }
  clearing.value = false
  setTimeout(() => {
    clearState.value = ''
  }, 2000)
}
defineExpose({ onClear })
</script>

<template>
  <div class="data-view">
    <h2 class="dv-title">数据管理</h2>

    <div class="dv-card">
      <div class="dv-card-head">设置</div>
      <div class="dv-row">
        <span class="dv-label">纳管开关</span>
        <el-switch v-model="naguanOn" />
        <span class="dv-hint">关闭后不再排除纳管项目（全站联动）</span>
      </div>
      <div class="dv-row">
        <span class="dv-label">清空数据</span>
        <button class="dv-btn danger" :disabled="clearing" @click="onClear">清空数据</button>
        <span v-if="clearState" class="dv-clear-state">{{ clearState }}</span>
      </div>
      <div class="dv-row dv-note">云同步 / 离线导入将在后续接入（B17）。</div>
    </div>

    <div class="dv-card">
      <div class="dv-card-head">数据质量总览</div>
      <DataQualityTable :rows="rows" @drill="onDrill" />
    </div>

    <DataDrillModal v-model="drillOpen" :title="drillTitle" :nodes="drillNodes" />
  </div>
</template>

<style scoped>
.data-view { padding: 16px; }
.dv-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 14px; }
.dv-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 14px; }
.dv-card-head { font-weight: 700; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; color: #1a1a2e; }
.dv-row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; font-size: 13px; }
.dv-label { width: 84px; flex-shrink: 0; color: #475569; font-weight: 600; }
.dv-hint { font-size: 12px; color: #94a3b8; }
.dv-note { color: #94a3b8; font-size: 12px; }
.dv-btn { border: 1px solid #e2e8f0; background: #fff; border-radius: 6px; padding: 5px 14px; font-size: 13px; cursor: pointer; }
.dv-btn.danger { color: #ef4444; border-color: #fecaca; }
.dv-btn:disabled { opacity: 0.5; cursor: default; }
.dv-clear-state { font-size: 12px; color: #10b981; }
</style>
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/views/DataView.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(frontend): 新增 DataView（纳管开关+清空数据+数据质量总览+下钻）"
```

---

### Task 6: 路由接入 + verify + PROGRESS

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改路由** — 顶部加 `import DataView from '@/views/DataView.vue'`；把 `/data` 一行 `component: PageStub` 改为 `component: DataView`（保留 `meta: { title: '数据管理' }`）。其余不动。

- [ ] **Step 2: 验证路由测试仍过** — `cd frontend && npx vitest run src/router/index.test.ts`（应全绿）。

- [ ] **Step 3: 全量验证** — `bash verify.sh`，期望 `[PASS] verify.sh 全部通过 ✓`（~1MB chunk 警告属已知 B-opt，非失败）。

- [ ] **Step 4: 更新 PROGRESS.md**
  - "最近更新"改当日，注明 B16 数据管理（质量总览/纳管/清空）完成。
  - Backlog：B16 行改 `[x] **B16** 数据管理：数据质量总览 + 纳管开关 + 清空数据：lib/dataQuality、data store clearBusinessData、DataQualityTable、DataDrillModal、DataView，路由 /data 接入。`；新增 `[ ] **B17** 数据管理：云同步(SSE 进度) + 离线 Excel 导入(上传+轮询)`；其余顺延 `[ ] **B18** 区间对比(compare) + 关于(about)`。
  - Handoff 追加 B16 完成段（提交 SHA；忠实性：数据源全量 rawNodes、5 检查(去死检查)、按档计数+合计、下钻、双确认清空+保留平台配置、纳管开关绑 filterStore；范围：SSE 同步/导入拆 B17；展示从简：徽章配色/reloadData 脚本重载省略）。下一步指向 B17。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/router/index.ts PROGRESS.md
git commit -m "feat(frontend): 路由 /data 接入 DataView，点亮数据管理（质量/纳管/清空）；更新 PROGRESS(B16)"
```

---

## Self-Review

- **Spec 覆盖：** 数据质量总览 5 检查×三档+合计(`dataQualityRows`+`DataQualityTable`)✓；单元格下钻(`dataQualityDrill`+`DataDrillModal`)✓；纳管开关绑全局(filterStore)✓；清空数据双确认+内存清空+服务端(`clearBusinessData`+api)✓；路由接入✓。
- **占位符扫描：** 各 step 含完整代码/命令/预期或精确改法；无 TODO/TBD。
- **类型一致性：** `QualityRow`/`Severity`/`DataCheck`(dataQuality) 贯穿 lib→DataQualityTable→DataView；`clearBusinessData` 在 data store 定义、DataView 调用一致；`DataColumn`(DataTable)/`Modal`(B4) 复用；`api.get`(client) 复用。
- **范围/忠实性取舍：** 数据源全量 rawNodes、5 检查去死检查、合计=scope 全量、双确认清空保留平台配置、纳管绑 filterStore；SSE 同步/导入拆 B17；徽章配色/reloadData 脚本省略——均已在头部"范围/关键忠实性/展示从简"列明。
