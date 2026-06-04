# 临期跟进 Signal Board(只读看板) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点亮"临期跟进"页（`/followup`）的 **Signal Board 只读看板**：季度回款概览(4卡) + 6 统计卡(7天/8-15天/16-30天/延期/已跟进/待跟进) + L4 服务组信号行(4 档进度条 + 已跟进/待跟进 + 跟进率) + 部门搜索。

**范围与拆分（重要）：** 旧 `initFollowup` 页面含两个大子系统：(1) 本 Signal Board 看板；(2) 行展开面板 + 跟进记录 CRUD(`/api/followup/add|update|delete|list|types|sync-status`) + 云文档异步回写 + 同步状态轮询。后者是首个写操作 + 后端联动，体量与看板相当，**拆为 B14**。本 B13 只做**只读看板**：信号行不可点击展开、不含 CRUD。看板的"已跟进/待跟进/跟进率"来自本地标记 `localStorage['fu_data']`（忠实读取；其写入在 B14 的展开面板实现，故 B13 阶段通常显示 0% 直到 B14 接入——这是预期的增量状态）。

**Architecture:** 计算抽到纯函数 `lib/followup.ts`（部门信号统计/总计/季度聚合/本地标记读取/周期标签）。信号行抽为 `FollowupSignalRow.vue`。`FollowupView.vue` owns 搜索并装配季度卡 + 统计卡 + 信号板。数据源 = `getFilteredNodes`（年/视角/纳管 = `filterStore.filteredNodes`）.filter(isPaymentRelated)。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Element Plus(el-input) + Vitest。

**忠实移植基准（旧 app.js）：** `initFollowup`(6667) / `_renderFollowupRows`(6779) / `_filterFollowup`(6828) / `_fuData`(6662)。

**关键忠实性要点：**
- 数据源 = `getFilteredNodes().filter(isPaymentRelated)`（= `filter.filteredNodes` 再筛 isPaymentRelated）。
- 部门按 `orgL4 || '未分配'` 分组。每节点：`total++`；`isFlw = fuData[pid]?.flw`。
- 若 `nodeStatus==='延期'`：`delay++`，isFlw 时 `flw++、delayFlw++`；**随后仍继续**档位判断（照搬，不 early-return）。
- 档位前提：有 planDate、`pctToNum(actualPaymentRatio) < 1`(或 null)、`planDate >= today`；`diff=ceil((d-today)/天)`；`≤7→d7`、`≤15→d15`、`≤30→d30`（isFlw 时各自 +flw 与档位 flw）。注意 flw 是逐节点桶计数，可被"延期+档位"重复计（照搬）。
- 排序：`delay desc → d7 desc → d15 desc → d30 desc`。
- 总计：urgent=Σd7、d15=Σd15、d30=Σd30、delayed=Σdelay、totalFlw=Σflw；signalBase=delayed+urgent+d15+d30；totalNotFlw=max(0, signalBase-totalFlw)。
- 季度概览：按 planDate 月份分 Q1-Q4，统计 nodeCount/projectCount(去重)/expected/actual；标题前缀 `cycleLabel(filterYear)`。
- 进度条宽度 = `值/max(该档全表max,1)*100%`；跟进率 = `total>0?round(flw/total*100):0`，配色 ≥80 绿 / ≥50 橙 / 否则红。
- 时间(`today`)注入参数，便于测试。

**展示从简（已记录，非偏差）：**
- 信号行点击展开面板、"跟进动态"菜单 → 延后 B14（本期行不可点击）。
- 季度标题"括号内靛紫色"等纯样式细节从简。

---

## File Structure

| 文件 | 职责 | 任务 |
|---|---|---|
| `frontend/src/lib/followup.ts` | 纯函数：loadFuData/followupDeptStats/followupTotals/followupQuarters/cycleLabel + 类型 | T1 |
| `frontend/src/components/FollowupSignalRow.vue` | 单部门信号行(4 档进度条 + 跟进率) | T2 |
| `frontend/src/views/FollowupView.vue` | 季度卡 + 6 统计卡 + 搜索 + 信号板装配 | T3 |
| `frontend/src/router/index.ts` | `/followup` 由 PageStub 改 FollowupView | T4 |

lib 与组件配 `*.test.ts`。

---

### Task 1: lib/followup.ts（纯函数 + 测试）

**Files:**
- Create: `frontend/src/lib/followup.ts`
- Test: `frontend/src/lib/followup.test.ts`

依赖：`RawNode` 来自 `@/types/analysis`；`pctToNum` 来自 `@/lib/format`。

- [ ] **Step 1: 写失败测试** — `frontend/src/lib/followup.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadFuData,
  followupDeptStats,
  followupTotals,
  followupQuarters,
  cycleLabel,
} from './followup'

const NOW = new Date('2026-06-04T00:00:00')

const NODES: any[] = [
  { orgL4: 'A', projectId: 'P1', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-08', actualPaymentRatio: 0.5, expectedPayment: 100000, actualPayment: 50000 },
  { orgL4: 'A', projectId: 'P2', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-20', actualPaymentRatio: 0, expectedPayment: 100000, actualPayment: 0 },
  { orgL4: 'A', projectId: 'P3', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-05-01', actualPaymentRatio: 0, expectedPayment: 100000, actualPayment: 0 },
  { orgL4: 'B', projectId: 'P4', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-15', actualPaymentRatio: 0, expectedPayment: 100000, actualPayment: 0 },
]

describe('followupDeptStats', () => {
  it('按部门统计各档位 + 排序(delay 优先)', () => {
    const s = followupDeptStats(NODES, {}, NOW)
    expect(s.map((d) => d.name)).toEqual(['A', 'B']) // A 有延期排前
    const a = s.find((d) => d.name === 'A')!
    expect(a.total).toBe(3)
    expect(a.d7).toBe(1) // 06-08 diff=4
    expect(a.d30).toBe(1) // 06-20 diff=16
    expect(a.delay).toBe(1) // P3 延期
    const b = s.find((d) => d.name === 'B')!
    expect(b.d15).toBe(1) // 06-15 diff=11
  })
  it('fuData 标记驱动 flw 计数', () => {
    const s = followupDeptStats(NODES, { P3: { flw: true } }, NOW)
    const a = s.find((d) => d.name === 'A')!
    expect(a.delayFlw).toBe(1)
    expect(a.flw).toBe(1)
  })
})

describe('followupTotals', () => {
  it('汇总各档位与待跟进', () => {
    const t = followupTotals(followupDeptStats(NODES, {}, NOW))
    expect(t.urgent).toBe(1)
    expect(t.d15).toBe(1)
    expect(t.d30).toBe(1)
    expect(t.delayed).toBe(1)
    expect(t.totalFlw).toBe(0)
    expect(t.totalNotFlw).toBe(4) // signalBase 4 - 0
  })
})

describe('followupQuarters', () => {
  it('按 planDate 月份分季度，项目去重', () => {
    const q = followupQuarters(NODES)
    expect(q).toHaveLength(4)
    // 全部 planDate 落在 5/6 月 → Q2
    expect(q[1].quarter).toBe(2)
    expect(q[1].nodeCount).toBe(4)
    expect(q[1].projectCount).toBe(4)
    expect(q[1].expected).toBe(400000)
    expect(q[1].actual).toBe(50000)
    expect(q[0].nodeCount).toBe(0)
  })
})

describe('cycleLabel', () => {
  it('主分支映射', () => {
    expect(cycleLabel('all', 2026)).toBe('全部')
    expect(cycleLabel('2026', 2026)).toBe('本年度')
    expect(cycleLabel('2027', 2026)).toBe('下一年度')
    expect(cycleLabel('upto2026', 2026)).toBe('至本年度')
    expect(cycleLabel('2026-Q1', 2026)).toBe('本年度') // 季度取父年度标签
  })
})

describe('loadFuData', () => {
  beforeEach(() => localStorage.clear())
  it('读取 localStorage fu_data，异常返回空', () => {
    expect(loadFuData()).toEqual({})
    localStorage.setItem('fu_data', JSON.stringify({ P1: { flw: true } }))
    expect(loadFuData().P1.flw).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/lib/followup.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/lib/followup.ts`:

```ts
import type { RawNode } from '@/types/analysis'
import { pctToNum } from './format'

type N = Record<string, any>

export interface FuFlag {
  flw?: boolean
  st?: string
  fb?: string
}
export type FuData = Record<string, FuFlag>

const FU_KEY = 'fu_data'
/** 读取本地跟进标记（忠实移植 _fuData，localStorage 'fu_data'；异常返回空对象）。 */
export function loadFuData(): FuData {
  try {
    return JSON.parse(localStorage.getItem(FU_KEY) || '{}')
  } catch {
    return {}
  }
}

export interface DeptStat {
  name: string
  total: number
  d7: number
  d15: number
  d30: number
  delay: number
  flw: number
  d7flw: number
  d15flw: number
  d30flw: number
  delayFlw: number
}
/** 忠实移植 initFollowup 的 deptMap 计算 + 排序（delay→d7→d15→d30 降序）。today 注入。 */
export function followupDeptStats(relatedNodes: RawNode[], fuData: FuData, today: Date): DeptStat[] {
  const map: Record<string, DeptStat> = {}
  for (const raw of relatedNodes) {
    const n = raw as N
    const dept = n.orgL4 || '未分配'
    const pid = n.projectId || ''
    if (!map[dept])
      map[dept] = { name: dept, d30: 0, d15: 0, d7: 0, delay: 0, flw: 0, total: 0, d7flw: 0, d15flw: 0, d30flw: 0, delayFlw: 0 }
    const m = map[dept]
    m.total++
    const isFlw = !!(fuData[pid] && fuData[pid].flw)
    if (n.nodeStatus === '延期') {
      m.delay++
      if (isFlw) {
        m.flw++
        m.delayFlw++
      }
    }
    if (!n.planDate) continue
    const ar = pctToNum(n.actualPaymentRatio)
    if (ar !== null && ar >= 1) continue
    const d = new Date(n.planDate)
    if (d < today) continue
    const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
    if (diff <= 7) {
      m.d7++
      if (isFlw) {
        m.flw++
        m.d7flw++
      }
    } else if (diff <= 15) {
      m.d15++
      if (isFlw) {
        m.flw++
        m.d15flw++
      }
    } else if (diff <= 30) {
      m.d30++
      if (isFlw) {
        m.flw++
        m.d30flw++
      }
    }
  }
  return Object.values(map).sort((a, b) => {
    if (b.delay !== a.delay) return b.delay - a.delay
    if (b.d7 !== a.d7) return b.d7 - a.d7
    if (b.d15 !== a.d15) return b.d15 - a.d15
    return b.d30 - a.d30
  })
}

export interface FollowupTotals {
  urgent: number
  d15: number
  d30: number
  delayed: number
  totalFlw: number
  totalNotFlw: number
}
/** 忠实移植 6 统计卡的汇总。 */
export function followupTotals(stats: DeptStat[]): FollowupTotals {
  const delayed = stats.reduce((s, d) => s + d.delay, 0)
  const urgent = stats.reduce((s, d) => s + d.d7, 0)
  const d15 = stats.reduce((s, d) => s + d.d15, 0)
  const d30 = stats.reduce((s, d) => s + d.d30, 0)
  const totalFlw = stats.reduce((s, d) => s + d.flw, 0)
  const signalBase = delayed + urgent + d15 + d30
  return { urgent, d15, d30, delayed, totalFlw, totalNotFlw: Math.max(0, signalBase - totalFlw) }
}

export interface QuarterStat {
  quarter: number
  nodeCount: number
  projectCount: number
  expected: number
  actual: number
}
/** 忠实移植季度概览：按 planDate 月份分 Q1-Q4，统计节点/项目数(去重)/计划/实际。 */
export function followupQuarters(relatedNodes: RawNode[]): QuarterStat[] {
  const q = [0, 1, 2, 3].map(() => ({ nodeCount: 0, pids: new Set<string>(), expected: 0, actual: 0 }))
  for (const raw of relatedNodes) {
    const n = raw as N
    if (!n.planDate || String(n.planDate).length < 7) continue
    const pm = parseInt(String(n.planDate).substring(5, 7))
    const qi = pm <= 3 ? 0 : pm <= 6 ? 1 : pm <= 9 ? 2 : 3
    q[qi].nodeCount++
    q[qi].pids.add(n.projectId)
    q[qi].expected += n.expectedPayment || 0
    q[qi].actual += n.actualPayment || 0
  }
  return q.map((x, i) => ({
    quarter: i + 1,
    nodeCount: x.nodeCount,
    projectCount: x.pids.size,
    expected: x.expected,
    actual: x.actual,
  }))
}

/** 季度标题前缀（忠实移植 cyclePrefix 主分支；季度类 filterYear 取父年度标签）。 */
export function cycleLabel(filterYear: string, curYear: number): string {
  const m: Record<string, string> = {
    all: '全部',
    [String(curYear)]: '本年度',
    [String(curYear + 1)]: '下一年度',
    ['upto' + curYear]: '至本年度',
    ['upto' + String(curYear + 1)]: '至下一年度',
  }
  if (m[filterYear]) return m[filterYear]
  if (filterYear.indexOf('upto') === 0 && filterYear.indexOf('-Q') >= 0) {
    const bu = filterYear.substring(4).split('-Q')[0]
    return m['upto' + bu] || filterYear
  }
  if (filterYear.indexOf('-Q') >= 0) {
    const base = filterYear.split('-Q')[0]
    return m[base] || base
  }
  return filterYear
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/lib/followup.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 看 `frontend/package.json` scripts 用其 typecheck 命令，确认无新增错误。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/followup.ts frontend/src/lib/followup.test.ts
git commit -m "feat(frontend): 新增 followup 纯函数（部门信号统计/总计/季度聚合/本地标记）"
```

---

### Task 2: components/FollowupSignalRow.vue（信号行 + 测试）

**Files:**
- Create: `frontend/src/components/FollowupSignalRow.vue`
- Test: `frontend/src/components/FollowupSignalRow.test.ts`

依赖：类型 `DeptStat` 来自 `@/lib/followup`。无需 Element Plus。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/FollowupSignalRow.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FollowupSignalRow from './FollowupSignalRow.vue'

const stat = { name: 'A部门', total: 4, d7: 2, d15: 1, d30: 1, delay: 2, flw: 2, d7flw: 1, d15flw: 0, d30flw: 0, delayFlw: 1 }
const max = { d7: 2, d15: 1, d30: 1, delay: 2 }

describe('FollowupSignalRow', () => {
  it('渲染排名/部门/4 档数值/跟进率', () => {
    const w = mount(FollowupSignalRow, { props: { index: 0, stat, max } })
    expect(w.text()).toContain('1') // 排名
    expect(w.text()).toContain('A部门')
    expect(w.text()).toContain('共4个项目')
    // 跟进率 = round(2/4*100)=50%
    expect(w.text()).toContain('50%')
    // 4 档进度条
    expect(w.findAll('.sig-bar-fill')).toHaveLength(4)
    // 已跟进/待跟进子标签（d7：已跟进1/待跟进1）
    expect(w.text()).toContain('已跟进1/待跟进1个')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/components/FollowupSignalRow.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/components/FollowupSignalRow.vue`:

```vue
<script setup lang="ts">
import type { DeptStat } from '@/lib/followup'

const props = defineProps<{
  index: number
  stat: DeptStat
  max: { d7: number; d15: number; d30: number; delay: number }
}>()

const BARS = [
  { key: 'd7', flw: 'd7flw', color: '#f97316' },
  { key: 'd15', flw: 'd15flw', color: '#f59e0b' },
  { key: 'd30', flw: 'd30flw', color: '#3b82f6' },
  { key: 'delay', flw: 'delayFlw', color: '#dc2626' },
] as const

const rate = (s: DeptStat) => (s.total > 0 ? Math.round((s.flw / s.total) * 100) : 0)
const barW = (v: number, mx: number) => (mx > 0 ? Math.round((v / mx) * 100) : 0)
const rankColor = (i: number) => (i === 0 ? '#ef4444' : i === 1 ? '#f59e0b' : '#8c8c9e')
const rateColor = (r: number) => (r >= 80 ? '#10b981' : r >= 50 ? '#f59e0b' : '#ef4444')
const val = (b: { key: string }) => (props.stat as Record<string, any>)[b.key] as number
const flwVal = (b: { flw: string }) => ((props.stat as Record<string, any>)[b.flw] as number) || 0
const maxVal = (b: { key: string }) => (props.max as Record<string, any>)[b.key] as number
</script>

<template>
  <div class="sig-row">
    <div class="sig-rank" :style="{ color: rankColor(index) }">{{ index + 1 }}</div>
    <div class="sig-dept">
      <div class="sig-dept-name">{{ stat.name }}</div>
      <div class="sig-dept-count">共{{ stat.total }}个项目</div>
    </div>
    <div class="sig-bars">
      <div v-for="b in BARS" :key="b.key" class="sig-bar-group">
        <div class="sig-bar-line">
          <div class="sig-bar-wrap">
            <div class="sig-bar-fill" :style="{ width: barW(val(b), maxVal(b)) + '%', background: b.color }"></div>
          </div>
          <span class="sig-bar-num" :style="{ color: b.color }">{{ val(b) }}</span>
        </div>
        <div class="sig-bar-sub">已跟进{{ flwVal(b) }}/待跟进{{ val(b) - flwVal(b) }}个</div>
      </div>
    </div>
    <div class="sig-rate" :style="{ color: rateColor(rate(stat)) }">{{ rate(stat) }}%</div>
  </div>
</template>

<style scoped>
.sig-row { display: grid; grid-template-columns: 40px 160px 1fr 70px; gap: 12px; align-items: center; padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }
.sig-rank { text-align: center; font-weight: 800; font-size: 15px; }
.sig-dept-name { font-weight: 700; font-size: 13px; color: #1a1a2e; }
.sig-dept-count { font-size: 11px; color: #8c8c9e; }
.sig-bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.sig-bar-group { display: flex; flex-direction: column; gap: 2px; }
.sig-bar-line { display: flex; align-items: center; gap: 8px; }
.sig-bar-wrap { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; overflow: hidden; }
.sig-bar-fill { height: 100%; border-radius: 4px; }
.sig-bar-num { font-weight: 800; font-size: 13px; min-width: 22px; text-align: right; }
.sig-bar-sub { font-size: 11px; color: #8c8c9e; text-align: center; }
.sig-rate { text-align: center; font-weight: 800; font-size: 14px; }
</style>
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/components/FollowupSignalRow.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/FollowupSignalRow.vue frontend/src/components/FollowupSignalRow.test.ts
git commit -m "feat(frontend): 新增 FollowupSignalRow 部门信号行（4 档进度条 + 跟进率）"
```

---

### Task 3: views/FollowupView.vue（页面装配 + 测试）

**Files:**
- Create: `frontend/src/views/FollowupView.vue`
- Test: `frontend/src/views/FollowupView.test.ts`

依赖：`@/stores/data`、`@/stores/filter`(filteredNodes/filterYear)、`@/lib/followup`(全部)、`@/lib/format`(fmtWan)、`@/components/FollowupSignalRow.vue`。

- [ ] **Step 1: 写失败测试** — `frontend/src/views/FollowupView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import FollowupView from './FollowupView.vue'
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
      { orgL4: 'A部门', projectId: 'P1', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-05-01', expectedPayment: 100000, actualPayment: 0, actualPaymentRatio: 0 },
      { orgL4: 'B部门', projectId: 'P2', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-08-15', expectedPayment: 200000, actualPayment: 50000, actualPaymentRatio: 0.25 },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {},
    naguanExclude: {},
    displayColumns: {},
    followupRecords: {},
  } as any
}

describe('FollowupView', () => {
  it('渲染季度概览/统计卡/信号板', () => {
    seed()
    const w = mount(FollowupView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('季度回款概览')
    expect(w.text()).toContain('延期')
    expect(w.text()).toContain('已跟进')
    expect(w.text()).toContain('临期回款进度跟进')
    expect(w.findAllComponents({ name: 'FollowupSignalRow' }).length).toBe(2)
  })

  it('部门搜索过滤信号行', async () => {
    seed()
    const w = mount(FollowupView, { global: { plugins: [ElementPlus] } })
    const input = w.find('input')
    await input.setValue('A部门')
    expect(w.findAllComponents({ name: 'FollowupSignalRow' }).length).toBe(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/views/FollowupView.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/views/FollowupView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import {
  loadFuData,
  followupDeptStats,
  followupTotals,
  followupQuarters,
  cycleLabel,
} from '@/lib/followup'
import { fmtWan } from '@/lib/format'
import FollowupSignalRow from '@/components/FollowupSignalRow.vue'

const data = useDataStore()
const filter = useFilterStore()
onMounted(() => {
  if (!data.data) data.load()
})

const search = ref('')
const fuData = loadFuData()

const relatedNodes = computed(
  () => filter.filteredNodes.filter((n) => (n as Record<string, any>).isPaymentRelated) as Record<string, any>[],
)
const stats = computed(() => followupDeptStats(relatedNodes.value as any, fuData, new Date()))
const totals = computed(() => followupTotals(stats.value))
const quarters = computed(() => followupQuarters(relatedNodes.value as any))
const prefix = computed(() => cycleLabel(filter.filterYear, new Date().getFullYear()))

const filteredStats = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? stats.value.filter((d) => d.name.toLowerCase().includes(q)) : stats.value
})
const max = computed(() => ({
  d7: Math.max(1, ...filteredStats.value.map((d) => d.d7)),
  d15: Math.max(1, ...filteredStats.value.map((d) => d.d15)),
  d30: Math.max(1, ...filteredStats.value.map((d) => d.d30)),
  delay: Math.max(1, ...filteredStats.value.map((d) => d.delay)),
}))

const STAT_CARDS = computed(() => [
  { label: '7天内待回款', value: totals.value.urgent, color: '#f97316' },
  { label: '8~15天内待回款', value: totals.value.d15, color: '#f59e0b' },
  { label: '16~30天内待回款', value: totals.value.d30, color: '#3b82f6' },
  { label: '延期', value: totals.value.delayed, color: '#dc2626' },
  { label: '已跟进', value: totals.value.totalFlw, color: '#10b981' },
  { label: '待跟进', value: totals.value.totalNotFlw, color: '#8c8c9e' },
])
</script>

<template>
  <div class="fu-view">
    <h2 class="fu-title">临期跟进</h2>

    <div class="fu-quarters-card">
      <div class="fu-q-header">季度回款概览（{{ prefix }}）</div>
      <div class="fu-q-row">
        <div v-for="q in quarters" :key="q.quarter" class="fu-q-cell">
          <div class="fu-q-name">{{ prefix }}-Q{{ q.quarter }}季度汇总</div>
          <div class="fu-q-sub">节点 / 项目</div>
          <div class="fu-q-main">{{ q.nodeCount }} / {{ q.projectCount }}</div>
          <div class="fu-q-amts">
            <div><div class="fu-q-amt-label">待回款</div><div class="fu-q-amt red">{{ fmtWan(q.expected - q.actual) }}万</div></div>
            <div><div class="fu-q-amt-label">已回款</div><div class="fu-q-amt green">{{ fmtWan(q.actual) }}万</div></div>
          </div>
        </div>
      </div>
    </div>

    <div class="fu-cards">
      <div v-for="c in STAT_CARDS" :key="c.label" class="fu-card">
        <div class="fu-card-label">{{ c.label }}</div>
        <div class="fu-card-val" :style="{ color: c.color }">{{ c.value }}</div>
      </div>
    </div>

    <div class="fu-search">
      <el-input v-model="search" size="small" placeholder="搜索 L4 部门..." clearable style="width: 240px" />
    </div>

    <div class="fu-board">
      <div class="fu-board-header">
        临期回款进度跟进
        <span class="fu-board-hint">橙色7天 黄色8~15天 蓝色16~30天 红色延期</span>
      </div>
      <div class="fu-board-cols">
        <div class="bc-rank">序号</div>
        <div class="bc-dept">L4部门</div>
        <div class="bc-bars">
          <span>7天内待回款项目</span><span>8~15天内待回款项目</span><span>16~30天内待回款项目</span><span>延期项目</span>
        </div>
        <div class="bc-rate">跟进率</div>
      </div>
      <FollowupSignalRow
        v-for="(d, i) in filteredStats"
        :key="d.name"
        :index="i"
        :stat="d"
        :max="max"
      />
      <div v-if="!filteredStats.length" class="fu-empty">暂无数据</div>
    </div>
  </div>
</template>

<style scoped>
.fu-view { padding: 16px; }
.fu-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 14px; }
.fu-quarters-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 12px; }
.fu-q-header { font-weight: 700; padding: 10px 16px; border-bottom: 1px solid #f1f5f9; color: #1a1a2e; }
.fu-q-header { color: #6366f1; }
.fu-q-row { display: flex; gap: 12px; padding: 10px 16px; flex-wrap: wrap; }
.fu-q-cell { flex: 1; min-width: 180px; text-align: center; padding: 10px 6px; background: #fafbfc; border-radius: 8px; border: 1px solid #ebe7e2; }
.fu-q-name { font-size: 13px; font-weight: 700; color: #1a1a2e; margin-bottom: 4px; }
.fu-q-sub { font-size: 10px; color: #8c8c9e; }
.fu-q-main { font-size: 20px; font-weight: 800; color: #3b82f6; }
.fu-q-amts { display: flex; gap: 8px; margin-top: 4px; justify-content: center; }
.fu-q-amt-label { font-size: 9px; color: #8c8c9e; }
.fu-q-amt { font-size: 12px; font-weight: 700; }
.fu-q-amt.red { color: #ef4444; }
.fu-q-amt.green { color: #10b981; }
.fu-cards { display: flex; gap: 14px; margin-bottom: 16px; flex-wrap: wrap; }
.fu-card { flex: 1; min-width: 120px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center; padding: 18px 14px; }
.fu-card-label { font-size: 11px; color: #8c8c9e; margin-bottom: 4px; }
.fu-card-val { font-size: 28px; font-weight: 800; }
.fu-search { margin-bottom: 12px; }
.fu-board { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
.fu-board-header { font-weight: 700; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
.fu-board-hint { font-size: 10px; color: #8c8c9e; font-weight: 400; margin-left: 12px; }
.fu-board-cols { display: grid; grid-template-columns: 40px 160px 1fr 70px; gap: 12px; padding: 8px 14px; font-size: 12px; color: #8c8c9e; font-weight: 600; background: #fafbfc; }
.bc-rank, .bc-rate { text-align: center; }
.bc-bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.bc-bars span { white-space: nowrap; }
.fu-empty { padding: 30px; text-align: center; color: #94a3b8; }
</style>
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/views/FollowupView.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/FollowupView.vue frontend/src/views/FollowupView.test.ts
git commit -m "feat(frontend): 新增 FollowupView（季度概览+统计卡+部门信号板, 只读）"
```

---

### Task 4: 路由接入 + verify + PROGRESS

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改路由** — 顶部加 `import FollowupView from '@/views/FollowupView.vue'`；把 `/followup` 一行 `component: PageStub` 改为 `component: FollowupView`（保留 `meta: { title: '临期跟进' }`）。其余不动。

- [ ] **Step 2: 验证路由测试仍过** — `cd frontend && npx vitest run src/router/index.test.ts`（应全绿）。

- [ ] **Step 3: 全量验证** — `bash verify.sh`，期望 `[PASS] verify.sh 全部通过 ✓`（~1MB chunk 警告属已知 B-opt，非失败）。

- [ ] **Step 4: 更新 PROGRESS.md**
  - "最近更新"改当日，注明 B13 临期跟进 Signal Board(只读) 完成。
  - Backlog：B13 行改 `[x] **B13** 临期跟进 Signal Board(只读)：lib/followup、FollowupSignalRow、FollowupView，路由 /followup 接入。`；新增 `[ ] **B14** 临期跟进：行展开面板 + 跟进记录 CRUD(/api/followup/*) + 云回写 + 同步状态`；其余顺延 `[ ] **B15** 数据管理(data)`、`[ ] **B16** 区间对比(compare) + 关于(about)`。
  - Handoff 追加 B13 完成段（提交 SHA；忠实性：数据源 filteredNodes.related、部门档位统计与排序、季度聚合、totalNotFlw；范围：只读看板，展开/CRUD/云回写拆 B14，fu_data 本地标记 B13 只读故跟进率初期为 0；展示从简：行不可点击、纯样式细节；today 注入）。下一步指向 B14。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/router/index.ts PROGRESS.md
git commit -m "feat(frontend): 路由 /followup 接入 FollowupView，点亮临期跟进看板；更新 PROGRESS(B13)"
```

---

## Self-Review

- **Spec 覆盖：** 季度概览 4 卡(`followupQuarters`+`cycleLabel`)✓；6 统计卡(`followupTotals`)✓；L4 信号行 4 档进度条 + 已跟进/待跟进 + 跟进率(`followupDeptStats`+`FollowupSignalRow`)✓；部门搜索✓；数据源 filteredNodes.related✓；排序 delay→d7→d15→d30✓；本地标记读取(`loadFuData`)✓；路由接入✓。
- **占位符扫描：** 各 step 含完整代码/命令/预期；无 TODO/TBD。
- **类型一致性：** `DeptStat`(followup) 贯穿 lib→FollowupSignalRow→FollowupView；`QuarterStat`/`FollowupTotals`/`FuData` 类型在 view 消费一致；`followupDeptStats(nodes,fuData,today)` 签名注入 today；复用 `pctToNum`/`fmtWan`(format) 一致。
- **范围/忠实性取舍：** B13 只读看板、展开/CRUD/云回写拆 B14、fu_data 仅读、行不可点击、today 注入——均已在头部"范围与拆分/关键忠实性/展示从简"列明。
