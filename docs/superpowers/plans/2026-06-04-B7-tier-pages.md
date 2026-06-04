# Plan B7：分层页外壳 + 回款节点 + 数据质检 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立分层页 `/tier/:tab/:tier` 的外壳（按路由切 tab/档位、汇总条、tab 分发），并实现其中两个 tab：回款节点（DataTable）、数据质检。点亮侧边栏"业务分析"下 nodes×3 + integrity×3 共 6 个入口。

**Architecture:** 纯前端。单元格格式化与档位汇总放可单测的 `lib/`；TierView 读路由 + `filterStore.filteredNodes` 按档位过滤，分发到各 tab 组件；tab 组件复用 B4 的 DataTable。Phase B 第七块，自成可运行/可测闭环。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Vue Router + DataTable(B4) + Vitest（已装）。

参考：spec §6；旧版忠实来源 `app.js`：`renderTier`(1959-2070)、`renderIntegrity`(2074-2143)、`fmtCell`(2259-2320)、`getVisibleCols`(2199-2208)、`excelDate`(2217)。数据来自 `useDataStore`（displayColumns/summary）+ `useFilterStore`（filteredNodes）；复用 `groupByProject`(B5)、`fmtYuan/pct`(B5)、`TIER_BY_SLUG/TIERS`(B2)、DataTable(B4)。

**不在本计划（拆到 B8/B9 或 B-opt）：** 项目总览(projects)/风险(risk)/回款状态(plan) tab → B8/B9；列可见性持久化 UI、CF 列枚举筛选、Excel 导出、nodeStatus/tier 徽章配色、行点击钻取 → B-opt（展示从简，用户已接受）。

---

## File Structure（B7 产出）

```
frontend/src/
├── lib/cellFormat.ts + cellFormat.test.ts        # formatCellValue / isDateKey / excelDate
├── lib/dashboardStats.ts (改：加 tierSummaryBar) + 对应测试补充
├── views/TierView.vue + TierView.test.ts          # 分层页外壳（路由分发）
├── components/TierNodesTab.vue + .test.ts          # 回款节点表
├── components/TierIntegrityTab.vue + .test.ts      # 数据质检
└── router/index.ts （改：/tier/:tab/:tier → TierView）
```

约定：从 `frontend/` 运行 npm；提交信息末尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。Windows，Bash 工具。

---

### Task 1: lib/cellFormat.ts 单元格值格式化

**Files:** Create `frontend/src/lib/cellFormat.ts`、`frontend/src/lib/cellFormat.test.ts`。忠实移植 `fmtCell` 的**取值格式化**部分（返回纯字符串，徽章配色不在此处）。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/cellFormat.test.ts
import { describe, it, expect } from 'vitest'
import { formatCellValue, isDateKey, excelDate } from './cellFormat'

describe('isDateKey', () => {
  it('matches date-ish keys', () => {
    expect(isDateKey('planDate')).toBe(true)
    expect(isDateKey('该节点计划完成时间')).toBe(true)
    expect(isDateKey('projectName')).toBe(false)
  })
})

describe('excelDate', () => {
  it('converts excel serial in range to YYYY-MM-DD', () => {
    expect(excelDate(43831)).toBe('2020-01-01')
  })
  it('returns null for out-of-range / non-serial', () => {
    expect(excelDate(100)).toBeNull()
    expect(excelDate('abc')).toBeNull()
  })
})

describe('formatCellValue', () => {
  it('empty → -', () => {
    expect(formatCellValue('', 'projectName')).toBe('-')
    expect(formatCellValue(null, 'x')).toBe('-')
  })
  it('amounts → fmtYuan', () => {
    expect(formatCellValue(1234.5, 'expectedPayment')).toBe('1,234.5')
  })
  it('ratio keys → pct', () => {
    expect(formatCellValue(0.8, 'actualPaymentRatio')).toBe('80%')
    expect(formatCellValue('70%', 'planPaymentRatio')).toBe('70%')
  })
  it('boolean-ish keys → 是/否', () => {
    expect(formatCellValue('是', 'isPaymentRelated')).toBe('是')
    expect(formatCellValue('', 'isPaymentRelated')).toBe('-') // empty handled first
    expect(formatCellValue('否', 'canAdvance')).toBe('否')
  })
  it('纳管 → 是/否/-', () => {
    expect(formatCellValue('否', '纳管')).toBe('否')
    expect(formatCellValue('是', '纳管')).toBe('是')
  })
  it('delayDays → N天', () => {
    expect(formatCellValue(5, 'delayDays')).toBe('5天')
  })
  it('nodeStatus → plain label', () => {
    expect(formatCellValue('延期', 'nodeStatus')).toBe('延期')
  })
  it('plain text collapses newlines', () => {
    expect(formatCellValue('a\nb', 'remarks')).toBe('a b')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/cellFormat.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/lib/cellFormat.ts`**

```ts
import { fmtYuan, pct } from './format'

/** 忠实移植 app.js isDateKey */
export function isDateKey(k: string): boolean {
  return /(?:Date|日期|时间)(?:$|_)/.test(k) || (/^(?:plan|actual|stage|expected|next|close)/.test(k) && /Date$/.test(k))
}

/** 忠实移植 app.js excelDate：Excel 序列号(40000~60000) → YYYY-MM-DD，否则 null */
export function excelDate(v: unknown): string | null {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d{4,5}$/.test(v) ? Number(v) : null)
  if (n !== null && n > 40000 && n < 60000) {
    const d = new Date(Math.round((n - 25569) * 86400000))
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }
  }
  return null
}

const AMOUNT_KEYS = new Set(['projectAmount', 'expectedPayment', 'actualPayment'])
const RATIO_KEYS = new Set(['planPaymentRatio', 'paymentRatio', 'actualPaymentRatio', 'projectCompletion'])
const BOOL_KEYS = new Set(['isPaymentRelated', 'isMilestoneAchieved', 'canAdvance'])

/** 忠实移植 app.js fmtCell 的取值格式化（返回纯字符串；徽章配色等展示样式不在此层）。 */
export function formatCellValue(value: unknown, key: string): string {
  if (value === null || value === undefined || value === '') return '-'
  const v = value
  if (isDateKey(key)) {
    const ed = excelDate(v)
    if (ed) return ed
    if (typeof v === 'string' && /^\d{4}-\d{2}/.test(v)) return v.slice(0, 10)
  }
  if (typeof v === 'string' && /^\d{4,5}$/.test(v)) {
    const ed = excelDate(v)
    if (ed) return ed
  }
  if (AMOUNT_KEYS.has(key)) return fmtYuan(v as number)
  if (RATIO_KEYS.has(key)) return pct(v)
  if (BOOL_KEYS.has(key)) return v === true || v === 'true' || v === '是' ? '是' : '否'
  if (key === '纳管') return v === '否' ? '否' : v === '是' || v === true || v === 'true' ? '是' : '-'
  if (key === 'delayDays') return `${v}天`
  // nodeStatus/paymentStatus/tier 等返回纯标签（徽章配色延后）
  return String(v).replace(/[\r\n]+/g, ' ')
}
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/cellFormat.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/cellFormat.ts frontend/src/lib/cellFormat.test.ts
git commit -m "feat(frontend): lib/cellFormat（formatCellValue/isDateKey/excelDate 忠实移植 fmtCell 取值）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: lib/dashboardStats 增加 tierSummaryBar

**Files:** Modify `frontend/src/lib/dashboardStats.ts`、`frontend/src/lib/dashboardStats.test.ts`。

忠实移植 renderTier 的汇总条计算（项目级状态计数 + 金额）。

- [ ] **Step 1: 追加失败测试到 `dashboardStats.test.ts`**

```ts
import { tierSummaryBar } from './dashboardStats' // 加到现有 import

describe('tierSummaryBar', () => {
  const NODES: any[] = [
    { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' },
    { projectId: 'P2', tier: '100万以上', isPaymentRelated: true, nodeStatus: '已全额回款', expectedPayment: 500000, actualPayment: 500000, planMonth: '2026-03' },
  ]
  it('aggregates project-level counts + amounts', () => {
    const s = tierSummaryBar(NODES)
    expect(s.projectCount).toBe(2)
    expect(s.relatedNodeCount).toBe(2)
    expect(s.totalActual).toBe(500000)
    expect(s.totalExpected).toBe(1500000)
    expect(s.rate).toBeCloseTo(1 / 3)
    expect(s.projDelayed).toBe(1)   // P1 状态=延期
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/dashboardStats.test.ts`  → FAIL（无 tierSummaryBar）。

- [ ] **Step 3: 在 `dashboardStats.ts` 末尾追加**

```ts
export interface TierSummaryBar {
  projectCount: number
  relatedNodeCount: number
  totalActual: number
  totalExpected: number
  rate: number
  projCanAdvance: number
  projReachedCondition: number
  projDelayed: number
}

/** 忠实移植 renderTier 的汇总条计算（项目级状态计数 + 金额，单位元）。 */
export function tierSummaryBar(nodes: RawNode[]): TierSummaryBar {
  const projs = groupByProject(nodes)
  const totalActual = projs.reduce((s, p) => s + (p.actualPayment || 0), 0)
  const totalExpected = projs.reduce((s, p) => s + (p.expectedPayment || 0), 0)
  return {
    projectCount: projs.length,
    relatedNodeCount: nodes.filter((n) => (n as Record<string, any>).isPaymentRelated).length,
    totalActual,
    totalExpected,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0,
    projCanAdvance: projs.filter((p) => p.paymentStatus === '加资源可提前').length,
    projReachedCondition: projs.filter((p) => p.paymentStatus === '达到回款条件').length,
    projDelayed: projs.filter((p) => p.paymentStatus === '延期').length,
  }
}
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/dashboardStats.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/dashboardStats.ts frontend/src/lib/dashboardStats.test.ts
git commit -m "feat(frontend): dashboardStats 增加 tierSummaryBar（分层页汇总条计算）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: TierNodesTab 组件（回款节点表）

**Files:** Create `frontend/src/components/TierNodesTab.vue`、`frontend/src/components/TierNodesTab.test.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/TierNodesTab.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import TierNodesTab from './TierNodesTab.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', projectName: '甲', tier: '100万以上', nodeName: '终验款', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {},
    displayColumns: {
      '100万以上': [
        { key: 'projectId', label: '项目编号', visible: true },
        { key: 'projectName', label: '项目名称', visible: true },
        { key: 'expectedPayment', label: '计划回款', visible: true },
        { key: 'nodeStatus', label: '状态', visible: true },
      ],
    },
    followupRecords: {},
  } as any
}

describe('TierNodesTab', () => {
  it('renders a table with the tier nodes using displayColumns', async () => {
    seed()
    const wrapper = mount(TierNodesTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('项目编号')
    expect(text).toContain('P1')
    expect(text).toContain('终验款') === false || true // nodeName not a column here; ignore
    // formatted amount + status
    expect(text).toContain('1,000,000')
    expect(text).toContain('延期')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/TierNodesTab.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/components/TierNodesTab.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { formatCellValue } from '@/lib/cellFormat'

const props = defineProps<{ tier: string }>()

const data = useDataStore()
const filter = useFilterStore()

const rows = computed(() => filter.filteredNodes.filter((n) => n.tier === props.tier))

const columns = computed<DataColumn[]>(() => {
  const cols = (data.data?.displayColumns as Record<string, any[]> | undefined)?.[props.tier] ?? []
  return cols
    .filter((c) => c.visible !== false)
    .map((c) => ({
      key: c.key,
      label: c.label,
      formatter: (value: unknown) => formatCellValue(value, c.key),
    }))
})
</script>

<template>
  <DataTable :columns="columns" :rows="rows as any[]" />
</template>
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/components/TierNodesTab.test.ts`（PASS）
若 el-table 在 jsdom 下未渲染单元格内容（`P1`/`1,000,000` 断言失败但表头通过）：保留表头断言，对单元格断言改用 `wrapper.html()`；仍不稳定则降级为断言 `columns` 计算正确（mount 后 `wrapper.findComponent(DataTable).props('columns').length === 4`）。报告所用方式。
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/TierNodesTab.vue frontend/src/components/TierNodesTab.test.ts
git commit -m "feat(frontend): TierNodesTab 回款节点表（DataTable + displayColumns + formatCellValue）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: TierIntegrityTab 组件（数据质检）

**Files:** Create `frontend/src/components/TierIntegrityTab.vue`、`frontend/src/components/TierIntegrityTab.test.ts`。

数据源：`data.summary[tier].incompleteData`（数组：projectId/projectName/orgL4/projectManager/projectCompletion?/isMilestoneAchieved?）。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/TierIntegrityTab.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TierIntegrityTab from './TierIntegrityTab.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed(incomplete: any[]) {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {},
    summary: { '100万以上': { projectCount: 1, incompleteData: incomplete } },
    rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('TierIntegrityTab', () => {
  it('renders incomplete rows + 缺失 markers + count', () => {
    seed([{ projectId: 'P1', projectName: '甲', orgL4: '北京', projectManager: '张三', projectCompletion: '', isMilestoneAchieved: '' }])
    const wrapper = mount(TierIntegrityTab, { props: { tier: '100万以上' } })
    const text = wrapper.text()
    expect(text).toContain('P1')
    expect(text).toContain('北京')
    expect(text).toContain('缺失')
    expect(text).toContain('共 1 条')
  })

  it('shows complete hint when no incomplete data', () => {
    seed([])
    const wrapper = mount(TierIntegrityTab, { props: { tier: '100万以上' } })
    expect(wrapper.text()).toContain('数据完整')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/TierIntegrityTab.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/components/TierIntegrityTab.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'

const props = defineProps<{ tier: string }>()
const data = useDataStore()

interface IncompleteRow {
  projectId: string
  projectName?: string
  orgL4?: string
  projectManager?: string
  projectCompletion?: string
  isMilestoneAchieved?: string
}

const rows = computed<IncompleteRow[]>(() => {
  const summary = (data.data?.summary as Record<string, any> | undefined)?.[props.tier]
  return (summary?.incompleteData ?? []) as IncompleteRow[]
})

const deptEntries = computed(() => {
  const counts: Record<string, number> = {}
  for (const p of rows.value) {
    const d = p.orgL4 || '未指定'
    counts[d] = (counts[d] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
})

const missingCompletion = computed(() => rows.value.filter((p) => !p.projectCompletion).length)
const missingMilestone = computed(() => rows.value.filter((p) => !p.isMilestoneAchieved).length)
</script>

<template>
  <div class="integrity-tab">
    <div class="it-note">筛选条件：关联回款=是 且 当前项目完成%为空 且 是否已达成里程碑为空</div>
    <div class="it-summary">
      <div class="it-stat"><div class="it-label">缺失项目总数</div><div class="it-val orange">{{ rows.length }}</div></div>
      <div class="it-stat"><div class="it-label">L4部门数</div><div class="it-val">{{ deptEntries.length }}</div></div>
      <div class="it-stat"><div class="it-label">项目完成%缺失</div><div class="it-val" :class="missingCompletion ? 'red' : 'green'">{{ missingCompletion }}</div></div>
      <div class="it-stat"><div class="it-label">里程碑达成缺失</div><div class="it-val" :class="missingMilestone ? 'red' : 'green'">{{ missingMilestone }}</div></div>
    </div>
    <div v-if="deptEntries.length" class="it-badges">
      <span v-for="[dept, cnt] in deptEntries" :key="dept" class="it-badge">{{ dept }} <b>{{ cnt }}</b></span>
    </div>
    <table class="it-table">
      <thead><tr><th>项目编号</th><th>项目名称</th><th>项目经理L4部门</th><th>项目经理</th><th>当前项目完成%</th><th>是否已达成里程碑</th></tr></thead>
      <tbody>
        <tr v-if="!rows.length"><td colspan="6" class="it-ok">数据完整，无待补全项</td></tr>
        <tr v-for="p in rows" :key="p.projectId">
          <td>{{ p.projectId }}</td>
          <td :title="p.projectName">{{ p.projectName || '-' }}</td>
          <td>{{ p.orgL4 || '-' }}</td>
          <td>{{ p.projectManager || '-' }}</td>
          <td><span v-if="!p.projectCompletion" class="miss">缺失</span><span v-else>{{ p.projectCompletion }}</span></td>
          <td><span v-if="!p.isMilestoneAchieved" class="miss">缺失</span><span v-else>{{ p.isMilestoneAchieved }}</span></td>
        </tr>
      </tbody>
    </table>
    <div class="it-count">共 {{ rows.length }} 条记录</div>
  </div>
</template>

<style scoped>
.integrity-tab { padding: 12px 16px; }
.it-note { background: #fff7ed; color: #b45309; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 12px; }
.it-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 12px; }
.it-stat { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
.it-label { font-size: 12px; color: #64748b; }
.it-val { font-size: 18px; font-weight: 700; }
.it-val.orange { color: #f59e0b; } .it-val.red { color: #ef4444; } .it-val.green { color: #10b981; }
.it-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.it-badge { background: #fff7ed; color: #b45309; padding: 4px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; }
.it-table { width: 100%; border-collapse: collapse; font-size: 13px; background: #fff; }
.it-table th, .it-table td { border: 1px solid #f1f5f9; padding: 6px 10px; text-align: left; }
.it-ok { text-align: center; color: #10b981; padding: 20px; }
.miss { color: #ef4444; font-weight: 700; }
.it-count { font-size: 12px; color: #94a3b8; margin-top: 8px; }
</style>
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/components/TierIntegrityTab.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/TierIntegrityTab.vue frontend/src/components/TierIntegrityTab.test.ts
git commit -m "feat(frontend): TierIntegrityTab 数据质检（incompleteData + 缺失标记 + 部门统计）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: TierView 外壳 + 路由接入

**Files:** Create `frontend/src/views/TierView.vue`、`frontend/src/views/TierView.test.ts`；Modify `frontend/src/router/index.ts`。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/views/TierView.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import TierView from './TierView.vue'
import { useDataStore } from '@/stores/data'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tier/:tab/:tier', name: 'tier', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
}

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {},
    summary: { '100万以上': { projectCount: 1, incompleteData: [] } },
    rawNodes: [{ projectId: 'P1', projectName: '甲', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {},
    displayColumns: { '100万以上': [{ key: 'projectId', label: '项目编号', visible: true }] },
    followupRecords: {},
  } as any
}

async function mountAt(path: string) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  return mount(TierView, { global: { plugins: [router, ElementPlus] } })
}

describe('TierView', () => {
  it('nodes tab renders summary bar + nodes table', async () => {
    seed()
    const wrapper = await mountAt('/tier/nodes/above1m')
    expect(wrapper.text()).toContain('回款节点数')   // summary bar
    expect(wrapper.findComponent({ name: 'TierNodesTab' }).exists()).toBe(true)
  })

  it('integrity tab renders integrity component', async () => {
    seed()
    const wrapper = await mountAt('/tier/integrity/above1m')
    expect(wrapper.findComponent({ name: 'TierIntegrityTab' }).exists()).toBe(true)
  })

  it('not-yet-built tab shows placeholder', async () => {
    seed()
    const wrapper = await mountAt('/tier/plan/above1m')
    expect(wrapper.text()).toContain('建设中')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/TierView.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/views/TierView.vue`**

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { tierSummaryBar } from '@/lib/dashboardStats'
import { fmtWan, pct } from '@/lib/format'
import { TIER_BY_SLUG, TIERS } from '@/nav'
import TierNodesTab from '@/components/TierNodesTab.vue'
import TierIntegrityTab from '@/components/TierIntegrityTab.vue'

const route = useRoute()
const data = useDataStore()
const filter = useFilterStore()

onMounted(() => { if (!data.data) data.load() })

const tab = computed(() => String(route.params.tab || 'nodes'))
const tier = computed(() => TIER_BY_SLUG[String(route.params.tier)] || TIERS[0].label)

const tierNodes = computed(() => filter.filteredNodes.filter((n) => n.tier === tier.value))
const summary = computed(() => tierSummaryBar(tierNodes.value))

const showSummaryBar = computed(() => tab.value === 'nodes')
const rateColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444')
</script>

<template>
  <div class="tier-view">
    <div v-if="showSummaryBar" class="summary-bar">
      <div class="sb-item"><div class="sb-label">回款节点数</div><div class="sb-val">{{ summary.relatedNodeCount }}</div></div>
      <div class="sb-item"><div class="sb-label">已回款总金额(万)</div><div class="sb-val green">{{ fmtWan(summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">待回款总金额(万)</div><div class="sb-val red">{{ fmtWan(summary.totalExpected - summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">完成率</div><div class="sb-val" :style="{ color: rateColor(summary.rate) }">{{ pct(summary.rate) }}</div></div>
      <div class="sb-item"><div class="sb-label">加资源可提前</div><div class="sb-val primary">{{ summary.projCanAdvance }}</div></div>
      <div class="sb-item"><div class="sb-label">达到回款条件</div><div class="sb-val orange">{{ summary.projReachedCondition }}</div></div>
      <div class="sb-item"><div class="sb-label">延期</div><div class="sb-val red">{{ summary.projDelayed }}</div></div>
    </div>

    <TierNodesTab v-if="tab === 'nodes'" :tier="tier" />
    <TierIntegrityTab v-else-if="tab === 'integrity'" :tier="tier" />
    <div v-else class="tier-stub">「{{ tab }}」页签建设中（{{ tier }}）</div>
  </div>
</template>

<style scoped>
.tier-view { padding: 12px 0; }
.summary-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; padding: 0 16px 12px; }
.sb-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
.sb-label { font-size: 12px; color: #64748b; }
.sb-val { font-size: 18px; font-weight: 700; color: #0f172a; }
.sb-val.green { color: #10b981; } .sb-val.red { color: #ef4444; } .sb-val.orange { color: #f59e0b; } .sb-val.primary { color: #4f46e5; }
.tier-stub { padding: 40px; text-align: center; color: #94a3b8; }
</style>
```
（`TierNodesTab`/`TierIntegrityTab` 的 `name` 需可被测试 `findComponent({name})` 命中：Vue SFC 默认用文件名作为组件名，通常可命中；若命不中，测试改用 `wrapper.find('.integrity-tab')` / DataTable 存在性断言，报告所用方式。）

- [ ] **Step 4: 路由接入**

在 `frontend/src/router/index.ts`：`import TierView from '@/views/TierView.vue'`；把 `/tier/:tab/:tier` 路由的 `component: PageStub` 改为 `component: TierView`。（PageStub 仍被其它未建页面使用，保留 import。）

- [ ] **Step 5: 运行确认通过 + 全量前端验证**

Run: `cd frontend && npx vitest run src/views/TierView.test.ts`（PASS）
Run: `cd frontend && npm run test:run`（全部通过）
Run: `cd frontend && npm run typecheck`（通过）
Run: `cd frontend && npm run build`（成功）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/TierView.vue frontend/src/views/TierView.test.ts frontend/src/router/index.ts
git commit -m "feat(frontend): TierView 分层页外壳（汇总条 + nodes/integrity tab 分发），路由 /tier/:tab/:tier 接入

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 收尾——verify 全绿 + 更新 PROGRESS

**Files:** Modify `PROGRESS.md`。

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`。失败则 BLOCKED。

- [ ] **Step 2: 更新 PROGRESS.md**

在 "🟦 Phase B 前端"：
- 把 B7+ 行细化为：
  ```
  - [x] **B7** 分层页外壳 + 回款节点(nodes) + 数据质检(integrity)：lib/cellFormat、tierSummaryBar、TierView（/tier/:tab/:tier）、TierNodesTab、TierIntegrityTab。点亮 nodes×3 + integrity×3 入口。
  - [ ] **B8** 分层页：项目总览(projects) + 风险(risk) tab。
  - [ ] **B9** 分层页：回款状态(plan) 6 看板（CF 联动）。
  - [ ] **B10+** 台账/PM → 日历 → 临期跟进 → 数据管理 → 区间对比/关于。
  ```
- 在 `B-opt` 追加："分层页列可见性持久化 UI、CF 列枚举筛选、Excel 导出、nodeStatus/tier 徽章配色、行点击钻取"。
- 更新"最近更新"为 `2026-06-04`。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): 标记 B7 分层页(nodes+integrity)完成；projects/risk→B8，plan→B9，其余→B10+

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（分层页的 nodes + integrity 部分）：**
- 单元格格式化（忠实移植 fmtCell 取值）→ Task 1 ✓
- 分层汇总条（忠实移植 renderTier 汇总）→ Task 2 ✓
- 回款节点表（DataTable + displayColumns + formatCellValue）→ Task 3 ✓
- 数据质检（incompleteData）→ Task 4 ✓
- TierView 外壳 + 路由 → Task 5 ✓
- **明确移交**：projects/risk → B8；plan → B9；其余页面 → B10+；列可见/CF/导出/徽章/钻取 → B-opt。

**Placeholder scan：** 所有 lib/组件/视图/测试均给出完整代码；命令含预期输出。Task 3 Step 4 / Task 5 Step 3 对 el-table jsdom 渲染 与 findComponent({name}) 给了断言降级方案并要求报告。无 TBD/TODO。

**一致性：** `formatCellValue`/`tierSummaryBar` 在 lib 与组件间签名一致；复用 `groupByProject`/`fmtYuan`/`pct`(B5)、`DataTable`(B4)、`TIER_BY_SLUG/TIERS`(B2)、`filterStore.filteredNodes`(B3)；tier slug↔label 经 `TIER_BY_SLUG`；nodes 数据 = filteredNodes 按 route tier 过滤（年份/视角/纳管经 filteredNodes 自动生效）；integrity 数据 = summary[tier].incompleteData。

**风险点：**
- el-table 在 jsdom 的单元格渲染：Task 3 已给降级断言。
- 状态/tier 以纯文本显示（徽章配色延后），是已接受的展示简化。
- TierNodesTab 列来自 displayColumns[tier]，与数据契约一致；若某 tier 无 displayColumns 则空表（数据问题，非代码问题）。

---

## Execution Handoff

见会话中执行方式选择（建议同前：subagent-driven-development）。
