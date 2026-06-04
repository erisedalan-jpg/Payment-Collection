# 临期跟进 展开面板 + 项目列表 + 跟进标记 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 B13 只读看板基础上，点亮临期跟进的**展开交互**：信号行可点击（部门名/某档位）→ 弹出展开面板（左：部门统计/跟进率/紧迫度/筛选/批量；右：项目列表，每项目含节点表展开 + 已跟进/待跟进标记），跟进标记写入本地 `fu_data` 并联动看板跟进率。

**范围（两步拆分的第 1 步）：** 本 B14 做**读 + 本地标记**；**跟进记录 CRUD（/api/followup/* 增删改）+ 云文档异步回写 + 同步状态轮询拆为 B15**。故本期项目行**不含**"跟进记录"区与"下钻详情/添加记录"按钮（下钻跳转亦延后）。

**Architecture:** 把本地标记 `fu_data` 升级为响应式 Pinia store `stores/fuData.ts`（替代 B13 一次性 `loadFuData`，使标记切换联动看板/面板）。项目聚合与过滤抽到纯函数 `lib/followupProjects.ts`。组件：`FuNodeTable.vue`（待跟进节点 9 列表）、`FuProjectRow.vue`（项目卡：元信息 + 节点表展开 + 标记切换）、`FollowupExpandModal.vue`（复用 B4 Modal：左统计 + 右项目列表）。`FollowupSignalRow.vue`/`FollowupView.vue`（B13）改造：行可点击 → 开面板；视图改用 fuData store。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Element Plus(el-select/el-dialog) + Vitest。

**忠实移植基准（旧 app.js）：** `_fuDeptProjects`(6838) / `_openFuExpand`(6867) / `_renderFuRight`(7053) / `_renderFuNodeTable`(7153) / `_fuChangeFlw`(7377) / `_fuBatchFlw`(7399) / `_fuData/_fuGet/_fuSet`(6662-6665)。

**关键忠实性要点：**
- 数据源 = `getFilteredNodes().filter(isPaymentRelated)`（= `filter.filteredNodes` 再筛 isPaymentRelated）。
- 部门项目聚合按 `orgL4||'未分配'`；earliestPlanDate=最早 planDate；completion=取最大 `pctToNum(projectCompletion)` 对应的原值；projectAmountWan=round(amount/10000*100)/100；flw 来自 fu_data。
- 档位过滤 timeWin：`delay`→nodeStatus==='延期'；`d7/d15/d30`→有 planDate、`pctToNum(actualPaymentRatio)<1 或 null`、`planDate>=today`、diff≤7/≤15/≤30；空→全部。
- 面板左统计基于 timeWin 过滤后的节点：nodeCount=节点数、projCount=去重项目数、flwCount=其中已跟进项目数、flwRate=round(flwCount/projCount*100)、紧迫度 urgency{delay/d7/d15/d30}（延期优先，否则按 diff）。
- 右列表下拉过滤(all/flw/noflw/7d/15d)叠加在 timeWin 之上；节点表只显示 `pctToNum(actualPaymentRatio)<1 或 null` 的待跟进节点。
- 标记切换写 fu_data（持久化 localStorage 'fu_data'）；批量标记对当前部门(window 过滤后) 项目全设。
- 时间(`today`)注入参数，便于测试。

**展示从简（已记录，非偏差）：**
- 跟进记录区、"添加/编辑/删除"、"下钻详情"跳转 → B15 / B-opt（本期项目行只有 展开 + 标记切换）。
- 左侧跟进率"环形 SVG"简化为大号百分数 + 待跟进/已跟进卡片（信息保留）。
- "跟进动态"下拉菜单（与档位条点击重复）省略；行点击区为部门名 + 4 档条。
- 旧全屏侧滑面板用 Modal(el-dialog width 92%) 承载。

---

## File Structure

| 文件 | 职责 | 任务 |
|---|---|---|
| `frontend/src/stores/fuData.ts` | 响应式本地标记 store（get/setFlw/batchSetFlw + 持久化） | T1 |
| `frontend/src/lib/followupProjects.ts` | 纯函数：部门项目聚合/档位过滤/紧迫度/下拉过滤/待跟进节点 | T2 |
| `frontend/src/components/FuNodeTable.vue` | 待跟进节点 9 列表 | T3 |
| `frontend/src/components/FuProjectRow.vue` | 项目卡（元信息 + 节点表展开 + 标记切换） | T4 |
| `frontend/src/components/FollowupExpandModal.vue` | 展开面板（左统计 + 右项目列表） | T5 |
| `frontend/src/components/FollowupSignalRow.vue`(改) + `frontend/src/views/FollowupView.vue`(改) | 行可点击→开面板；视图改用 fuData store | T6 |

新建 lib/store/组件配 `*.test.ts`。

---

### Task 1: stores/fuData.ts（响应式本地标记 store + 测试）

**Files:**
- Create: `frontend/src/stores/fuData.ts`
- Test: `frontend/src/stores/fuData.test.ts`

依赖：类型 `FuFlag`/`FuData` 来自 `@/lib/followup`（B13 已导出）。

- [ ] **Step 1: 写失败测试** — `frontend/src/stores/fuData.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFuDataStore } from './fuData'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

describe('useFuDataStore', () => {
  it('get 默认值', () => {
    const s = useFuDataStore()
    expect(s.get('P1')).toEqual({ flw: false, st: '', fb: '' })
  })
  it('setFlw 写入并持久化', () => {
    const s = useFuDataStore()
    s.setFlw('P1', true)
    expect(s.data.P1.flw).toBe(true)
    expect(JSON.parse(localStorage.getItem('fu_data') || '{}').P1.flw).toBe(true)
  })
  it('batchSetFlw 批量设置', () => {
    const s = useFuDataStore()
    s.batchSetFlw(['P1', 'P2'], true)
    expect(s.data.P1.flw).toBe(true)
    expect(s.data.P2.flw).toBe(true)
    s.batchSetFlw(['P1'], false)
    expect(s.data.P1.flw).toBe(false)
    expect(s.data.P2.flw).toBe(true)
  })
  it('初始化时读取已有 localStorage', () => {
    localStorage.setItem('fu_data', JSON.stringify({ P9: { flw: true } }))
    const s = useFuDataStore()
    expect(s.get('P9').flw).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/stores/fuData.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/stores/fuData.ts`:

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { FuFlag, FuData } from '@/lib/followup'

const FU_KEY = 'fu_data'
function load(): FuData {
  try {
    return JSON.parse(localStorage.getItem(FU_KEY) || '{}')
  } catch {
    return {}
  }
}

/** 本地跟进标记 store（响应式，持久化 localStorage 'fu_data'）。忠实移植 _fuData/_fuGet/_fuSet。 */
export const useFuDataStore = defineStore('fuData', () => {
  const data = ref<FuData>(load())

  function persist() {
    localStorage.setItem(FU_KEY, JSON.stringify(data.value))
  }
  function get(pid: string): FuFlag {
    return data.value[pid] || { flw: false, st: '', fb: '' }
  }
  function setFlw(pid: string, flw: boolean) {
    const cur: FuFlag = { ...(data.value[pid] || {}) }
    cur.flw = flw
    data.value = { ...data.value, [pid]: cur }
    persist()
  }
  function batchSetFlw(pids: string[], flw: boolean) {
    const next = { ...data.value }
    for (const pid of pids) next[pid] = { ...(next[pid] || {}), flw }
    data.value = next
    persist()
  }
  return { data, get, setFlw, batchSetFlw }
})
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/stores/fuData.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 看 `frontend/package.json` scripts 用其 typecheck 命令，确认无新增错误。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/stores/fuData.ts frontend/src/stores/fuData.test.ts
git commit -m "feat(frontend): 新增 fuData 响应式 store（本地跟进标记 get/setFlw/batchSetFlw）"
```

---

### Task 2: lib/followupProjects.ts（纯函数 + 测试）

**Files:**
- Create: `frontend/src/lib/followupProjects.ts`
- Test: `frontend/src/lib/followupProjects.test.ts`

依赖：`RawNode` 来自 `@/types/analysis`；`pctToNum` 来自 `@/lib/format`；`FuData` 来自 `@/lib/followup`。

- [ ] **Step 1: 写失败测试** — `frontend/src/lib/followupProjects.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  followupDeptProjects,
  deptWindowNodes,
  deptUrgency,
  applyProjDropdown,
  pendingNodes,
} from './followupProjects'

const NOW = new Date('2026-06-04T00:00:00')

const NODES: any[] = [
  { orgL4: 'A', projectId: 'P1', projectName: '甲', projectManager: '张', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-05-01', actualPaymentRatio: 0, projectAmount: 1000000, projectCompletion: '0.6' },
  { orgL4: 'A', projectId: 'P1', projectName: '甲', projectManager: '张', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-08', actualPaymentRatio: 0.5, projectAmount: 1000000, projectCompletion: '0.8' },
  { orgL4: 'A', projectId: 'P2', projectName: '乙', projectManager: '李', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-25', actualPaymentRatio: 0, projectAmount: 500000 },
  { orgL4: 'B', projectId: 'P3', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-10', actualPaymentRatio: 0, projectAmount: 0 },
]

describe('followupDeptProjects', () => {
  it('按部门聚合项目（金额万/最早日期/完成率/flw）', () => {
    const ps = followupDeptProjects(NODES, 'A', { P1: { flw: true } })
    expect(ps.map((p) => p.projectId).sort()).toEqual(['P1', 'P2'])
    const p1 = ps.find((p) => p.projectId === 'P1')!
    expect(p1.projectAmountWan).toBe(100)
    expect(p1.earliestPlanDate).toBe('2026-05-01')
    expect(p1.completion).toBe('0.8') // 取最大完成率对应原值
    expect(p1.flw).toBe(true)
    expect(p1.nodes).toHaveLength(2)
  })
})

describe('deptWindowNodes', () => {
  it('delay 档：仅延期节点', () => {
    expect(deptWindowNodes(NODES, 'A', 'delay', NOW)).toHaveLength(1)
  })
  it('d7 档：7天内未满额未过期', () => {
    const r = deptWindowNodes(NODES, 'A', 'd7', NOW) // 06-08 diff=4
    expect(r.map((n: any) => n.planDate)).toEqual(['2026-06-08'])
  })
  it('空档：该部门全部', () => {
    expect(deptWindowNodes(NODES, 'A', '', NOW)).toHaveLength(3)
  })
})

describe('deptUrgency', () => {
  it('紧迫度分桶（延期优先）', () => {
    const wn = deptWindowNodes(NODES, 'A', '', NOW)
    const u = deptUrgency(wn, NOW)
    expect(u.delay).toBe(1) // P1 延期
    expect(u.d7).toBe(1) // 06-08
    expect(u.d30).toBe(1) // 06-25 diff=21
  })
})

describe('applyProjDropdown', () => {
  const projs = followupDeptProjects(NODES, 'A', { P1: { flw: true } })
  it('flw 只留已跟进', () => {
    expect(applyProjDropdown(projs, 'flw', NOW).map((p) => p.projectId)).toEqual(['P1'])
  })
  it('noflw 只留未跟进', () => {
    expect(applyProjDropdown(projs, 'noflw', NOW).map((p) => p.projectId)).toEqual(['P2'])
  })
  it('all 不过滤', () => {
    expect(applyProjDropdown(projs, 'all', NOW)).toHaveLength(2)
  })
})

describe('pendingNodes', () => {
  it('排除实际回款>=1 的节点', () => {
    const r = pendingNodes([
      { actualPaymentRatio: 0.5 }, { actualPaymentRatio: 1 }, { actualPaymentRatio: null },
    ] as any)
    expect(r).toHaveLength(2)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/lib/followupProjects.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/lib/followupProjects.ts`:

```ts
import type { RawNode } from '@/types/analysis'
import { pctToNum } from './format'
import type { FuData } from './followup'

type N = Record<string, any>

export interface FuProject {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  projectAmount: number
  projectAmountWan: number
  earliestPlanDate: string
  completion: string
  nodeStatuses: string[]
  nodes: RawNode[]
  flw: boolean
}

/** 忠实移植 _fuDeptProjects：某部门(orgL4||未分配)的项目聚合。relatedNodes=getFilteredNodes().filter(isPaymentRelated)。 */
export function followupDeptProjects(relatedNodes: RawNode[], deptName: string, fuData: FuData): FuProject[] {
  const nodes = relatedNodes.filter((n) => ((n as N).orgL4 || '未分配') === deptName)
  const map: Record<string, any> = {}
  for (const raw of nodes) {
    const n = raw as N
    const pid = n.projectId || ''
    if (!pid) continue
    if (!map[pid])
      map[pid] = {
        projectId: pid,
        projectName: n.projectName || '',
        projectManager: n.projectManager || '',
        orgL4: n.orgL4 || deptName,
        projectAmount: n.projectAmount || 0,
        nodes: [],
        earliestPlanDate: '',
        _maxCompletion: 0,
        completion: '',
      }
    const p = map[pid]
    p.nodes.push(raw)
    if (n.planDate) {
      if (!p.earliestPlanDate || n.planDate < p.earliestPlanDate) p.earliestPlanDate = n.planDate
    }
    if (n.projectCompletion && n.projectCompletion !== '空值') {
      const cp = pctToNum(n.projectCompletion) || 0
      if (cp > p._maxCompletion) {
        p._maxCompletion = cp
        p.completion = n.projectCompletion
      }
    }
  }
  return Object.values(map).map((p: any) => ({
    projectId: p.projectId,
    projectName: p.projectName,
    projectManager: p.projectManager,
    orgL4: p.orgL4,
    projectAmount: p.projectAmount,
    projectAmountWan: Math.round(((p.projectAmount || 0) / 10000) * 100) / 100,
    earliestPlanDate: p.earliestPlanDate || '-',
    completion: p.completion || '-',
    nodeStatuses: p.nodes.map((n: N) => n.nodeStatus).filter(Boolean),
    nodes: p.nodes,
    flw: !!(fuData[p.projectId] && fuData[p.projectId].flw),
  }))
}

/** 忠实移植 _openFuExpand 的 timeWin 节点过滤（delay/d7/d15/d30/空=全部）。today 注入。 */
export function deptWindowNodes(
  relatedNodes: RawNode[],
  deptName: string,
  timeWin: string,
  today: Date,
): RawNode[] {
  const nodes = relatedNodes.filter((n) => ((n as N).orgL4 || '未分配') === deptName)
  return nodes.filter((raw) => {
    const n = raw as N
    if (timeWin === 'delay') return n.nodeStatus === '延期'
    if (!timeWin) return true
    if (!n.planDate) return false
    const ar = pctToNum(n.actualPaymentRatio)
    if (ar !== null && ar >= 1) return false
    const d = new Date(n.planDate)
    if (d < today) return false
    const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
    if (timeWin === 'd7') return diff <= 7
    if (timeWin === 'd15') return diff <= 15
    if (timeWin === 'd30') return diff <= 30
    return true
  })
}

export interface Urgency {
  delay: number
  d7: number
  d15: number
  d30: number
}
/** 忠实移植 _openFuExpand 的紧迫度统计（基于已 timeWin 过滤的节点）。today 注入。 */
export function deptUrgency(windowNodes: RawNode[], today: Date): Urgency {
  const u: Urgency = { delay: 0, d7: 0, d15: 0, d30: 0 }
  for (const raw of windowNodes) {
    const n = raw as N
    if (n.nodeStatus === '延期') u.delay++
    else if (n.planDate) {
      const d = new Date(n.planDate)
      const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
      if (diff <= 7) u.d7++
      else if (diff <= 15) u.d15++
      else if (diff <= 30) u.d30++
    }
  }
  return u
}

/** 忠实移植 _renderFuRight 的下拉过滤（all/flw/noflw/7d/15d）。today 注入。 */
export function applyProjDropdown(projs: FuProject[], fval: string, today: Date): FuProject[] {
  if (fval === 'flw') return projs.filter((p) => p.flw)
  if (fval === 'noflw') return projs.filter((p) => !p.flw)
  if (fval === '7d' || fval === '15d')
    return projs.filter((p) =>
      p.nodes.some((raw) => {
        const n = raw as N
        if (!n.planDate) return false
        const ar = pctToNum(n.actualPaymentRatio)
        if (ar !== null && ar >= 1) return false
        const d = new Date(n.planDate)
        if (d < today) return false
        const diff = Math.ceil((d.getTime() - today.getTime()) / 86400000)
        return fval === '7d' ? diff <= 7 : diff <= 15
      }),
    )
  return projs
}

/** 待跟进节点（实际回款<1 或缺，忠实移植 _renderFuNodeTable 过滤）。 */
export function pendingNodes(nodes: RawNode[]): RawNode[] {
  return nodes.filter((raw) => {
    const ar = pctToNum((raw as N).actualPaymentRatio)
    return ar === null || ar < 1
  })
}
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/lib/followupProjects.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/followupProjects.ts frontend/src/lib/followupProjects.test.ts
git commit -m "feat(frontend): 新增 followupProjects 纯函数（部门项目聚合/档位过滤/紧迫度/下拉/待跟进节点）"
```

---

### Task 3: components/FuNodeTable.vue（待跟进节点表 + 测试）

**Files:**
- Create: `frontend/src/components/FuNodeTable.vue`
- Test: `frontend/src/components/FuNodeTable.test.ts`

依赖：`@/lib/followupProjects`(pendingNodes)；`@/lib/cellFormat`(formatCellValue)。无需 Element Plus。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/FuNodeTable.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FuNodeTable from './FuNodeTable.vue'

describe('FuNodeTable', () => {
  it('渲染 9 列，过滤已满额节点', () => {
    const nodes = [
      { nodeName: 'N1', planDate: '2026-06-10', planPaymentRatio: 0.5, actualPaymentRatio: 0.2, nodeStatus: '延期', blocker: '审批', blockerOwner: '财务', nextAction: '催办', nextActionDate: '2026-06-12' },
      { nodeName: 'N2', actualPaymentRatio: 1 },
    ]
    const w = mount(FuNodeTable, { props: { nodes } })
    expect(w.findAll('thead th')).toHaveLength(9)
    expect(w.findAll('tbody tr')).toHaveLength(1) // N2 已满额被过滤
    expect(w.text()).toContain('N1')
    expect(w.text()).toContain('催办')
  })
  it('无待跟进节点显示提示', () => {
    const w = mount(FuNodeTable, { props: { nodes: [{ actualPaymentRatio: 1 }] } })
    expect(w.text()).toContain('暂无待跟进节点')
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/components/FuNodeTable.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/components/FuNodeTable.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { pendingNodes } from '@/lib/followupProjects'
import { formatCellValue } from '@/lib/cellFormat'

const props = defineProps<{ nodes: Record<string, any>[] }>()
const rows = computed(() => pendingNodes(props.nodes as any) as Record<string, any>[])

const COLS = [
  { key: 'nodeName', label: '节点' },
  { key: 'planDate', label: '计划日期' },
  { key: 'planPaymentRatio', label: '计划回款%' },
  { key: 'actualPaymentRatio', label: '实际回款%' },
  { key: 'nodeStatus', label: '状态' },
  { key: 'blocker', label: '卡点' },
  { key: 'blockerOwner', label: '卡点责任方' },
  { key: 'nextAction', label: '下一步动作' },
  { key: 'nextActionDate', label: '动作完成时间' },
]
</script>

<template>
  <div v-if="!rows.length" class="fnt-empty">暂无待跟进节点（已全额回款的节点已自动隐藏）</div>
  <div v-else class="fnt-wrap">
    <table class="fnt-table">
      <thead>
        <tr><th v-for="c in COLS" :key="c.key">{{ c.label }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="(n, i) in rows" :key="i">
          <td v-for="c in COLS" :key="c.key" :title="String(n[c.key] ?? '')">{{ formatCellValue(n[c.key], c.key) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.fnt-wrap { overflow-x: auto; }
.fnt-table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 4px 0; }
.fnt-table th, .fnt-table td {
  padding: 5px 6px; border: 1px solid #ebe7e2; text-align: left; white-space: nowrap;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis;
}
.fnt-table th { background: #fafbfc; color: #475569; font-weight: 600; }
.fnt-empty { font-size: 13px; color: #8c8c9e; padding: 8px 0; }
</style>
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/components/FuNodeTable.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/FuNodeTable.vue frontend/src/components/FuNodeTable.test.ts
git commit -m "feat(frontend): 新增 FuNodeTable 待跟进节点 9 列表"
```

---

### Task 4: components/FuProjectRow.vue（项目卡 + 测试）

**Files:**
- Create: `frontend/src/components/FuProjectRow.vue`
- Test: `frontend/src/components/FuProjectRow.test.ts`

依赖：`./FuNodeTable.vue`；`@/stores/fuData`(useFuDataStore)；类型 `FuProject` 来自 `@/lib/followupProjects`。Element Plus(el-select/el-option)。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/FuProjectRow.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import FuProjectRow from './FuProjectRow.vue'
import { useFuDataStore } from '@/stores/fuData'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

const project = {
  projectId: 'P1', projectName: '甲项目', projectManager: '张', orgL4: '北京', projectAmount: 1000000,
  projectAmountWan: 100, earliestPlanDate: '2026-06-10', completion: '0.8', nodeStatuses: ['延期', '正常实施中'],
  nodes: [{ nodeName: 'N1', actualPaymentRatio: 0.2, nodeStatus: '延期' }], flw: false,
}

describe('FuProjectRow', () => {
  it('渲染名称/元信息，点击展开节点表', async () => {
    const w = mount(FuProjectRow, { props: { project }, global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('甲项目')
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('¥100万')
    expect(w.findComponent({ name: 'FuNodeTable' }).exists()).toBe(false)
    await w.find('.fpr-btn').trigger('click')
    expect(w.findComponent({ name: 'FuNodeTable' }).exists()).toBe(true)
  })
  it('切换已跟进写入 store', async () => {
    const s = useFuDataStore()
    const w = mount(FuProjectRow, { props: { project }, global: { plugins: [ElementPlus] } })
    // 直接调用组件暴露的处理逻辑：通过 store 验证
    ;(w.vm as any).onFlwChange('1')
    expect(s.get('P1').flw).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/components/FuProjectRow.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/components/FuProjectRow.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import FuNodeTable from './FuNodeTable.vue'
import { useFuDataStore } from '@/stores/fuData'
import type { FuProject } from '@/lib/followupProjects'

const props = defineProps<{ project: FuProject }>()
const fu = useFuDataStore()
const open = ref(false)

function onFlwChange(v: string | number) {
  fu.setFlw(props.project.projectId, String(v) === '1')
}
defineExpose({ onFlwChange })
</script>

<template>
  <div class="fpr" :class="{ flw: project.flw }">
    <div class="fpr-head">
      <div class="fpr-name">{{ project.projectName }}</div>
      <div class="fpr-actions">
        <button class="fpr-btn" @click="open = !open">{{ open ? '收起' : '展开' }}</button>
        <el-select
          :model-value="project.flw ? '1' : '0'"
          size="small"
          style="width: 90px"
          @change="onFlwChange"
        >
          <el-option value="0" label="待跟进" />
          <el-option value="1" label="已跟进" />
        </el-select>
      </div>
    </div>
    <div class="fpr-meta">
      <span>{{ project.projectId }}</span>
      <span>{{ project.orgL4 }}</span>
      <span>{{ project.projectManager }}</span>
      <span>¥{{ project.projectAmountWan }}万</span>
      <span>到期: {{ project.earliestPlanDate }}</span>
      <span>完成: {{ project.completion }}</span>
      <span>状态: {{ project.nodeStatuses.slice(0, 3).join(', ') }}</span>
    </div>
    <div v-if="open" class="fpr-nodes">
      <FuNodeTable :nodes="project.nodes as Record<string, any>[]" />
    </div>
  </div>
</template>

<style scoped>
.fpr { padding: 14px; border: 1px solid #ebe7e2; border-left: 4px solid #f59e0b; border-radius: 8px; margin-bottom: 10px; }
.fpr.flw { border-left-color: #10b981; }
.fpr-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
.fpr-name { flex: 1; min-width: 0; font-weight: 700; font-size: 14px; color: #0f172a; }
.fpr-actions { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.fpr-btn { border: 1px solid #e2e8f0; background: #fff; border-radius: 6px; padding: 3px 12px; font-size: 12px; cursor: pointer; color: #475569; }
.fpr-meta { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: #8c8c9e; }
.fpr-nodes { margin-top: 6px; padding-left: 8px; border-left: 2px solid #e2e8f0; }
</style>
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/components/FuProjectRow.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/FuProjectRow.vue frontend/src/components/FuProjectRow.test.ts
git commit -m "feat(frontend): 新增 FuProjectRow 项目卡（元信息+节点表展开+跟进标记切换）"
```

---

### Task 5: components/FollowupExpandModal.vue（展开面板 + 测试）

**Files:**
- Create: `frontend/src/components/FollowupExpandModal.vue`
- Test: `frontend/src/components/FollowupExpandModal.test.ts`

依赖：`./Modal.vue`、`./FuProjectRow.vue`、`@/stores/fuData`、`@/lib/followupProjects`(followupDeptProjects/deptWindowNodes/deptUrgency/applyProjDropdown)。Element Plus。
注：el-dialog teleport，测试用 `attachTo: document.body` + `flushPromises` + 断言 `document.body.textContent`。

- [ ] **Step 1: 写失败测试** — `frontend/src/components/FollowupExpandModal.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import FollowupExpandModal from './FollowupExpandModal.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

const today = new Date('2026-06-04T00:00:00')
const relatedNodes = [
  { orgL4: 'A部门', projectId: 'P1', projectName: '甲', projectManager: '张', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-05-01', actualPaymentRatio: 0, projectAmount: 1000000 },
  { orgL4: 'A部门', projectId: 'P2', projectName: '乙', projectManager: '李', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-08', actualPaymentRatio: 0, projectAmount: 500000 },
]

describe('FollowupExpandModal', () => {
  it('打开渲染部门标题/统计/项目行', async () => {
    const w = mount(FollowupExpandModal, {
      props: { modelValue: true, dept: 'A部门', timeWin: '', relatedNodes, today },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('A部门')
    expect(document.body.textContent).toContain('项目列表')
    expect(document.body.textContent).toContain('涉及 2 个项目')
    expect(w.findAllComponents({ name: 'FuProjectRow' }).length).toBe(2)
    w.unmount()
  })

  it('delay 档只含延期项目', async () => {
    const w = mount(FollowupExpandModal, {
      props: { modelValue: true, dept: 'A部门', timeWin: 'delay', relatedNodes, today },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(w.findAllComponents({ name: 'FuProjectRow' }).length).toBe(1) // 仅 P1 延期
    w.unmount()
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `cd frontend && npx vitest run src/components/FollowupExpandModal.test.ts`（FAIL）

- [ ] **Step 3: 实现** — `frontend/src/components/FollowupExpandModal.vue`:

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Modal from './Modal.vue'
import FuProjectRow from './FuProjectRow.vue'
import { useFuDataStore } from '@/stores/fuData'
import {
  followupDeptProjects,
  deptWindowNodes,
  deptUrgency,
  applyProjDropdown,
} from '@/lib/followupProjects'

const props = defineProps<{
  modelValue: boolean
  dept: string
  timeWin: string
  relatedNodes: Record<string, any>[]
  today?: Date
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const fu = useFuDataStore()
const fval = ref('all')
watch(
  () => props.modelValue,
  (o) => {
    if (o) fval.value = 'all'
  },
)

const now = computed(() => props.today ?? new Date())
const windowNodes = computed(() =>
  deptWindowNodes(props.relatedNodes as any, props.dept, props.timeWin, now.value),
)
const projSet = computed(() => new Set(windowNodes.value.map((n) => (n as any).projectId)))
const allProjs = computed(() => followupDeptProjects(props.relatedNodes as any, props.dept, fu.data))
const projs = computed(() => allProjs.value.filter((p) => projSet.value.has(p.projectId)))
const displayProjs = computed(() => applyProjDropdown(projs.value, fval.value, now.value))
const urgency = computed(() => deptUrgency(windowNodes.value, now.value))

const projCount = computed(() => projs.value.length)
const nodeCount = computed(() => windowNodes.value.length)
const flwCount = computed(() => projs.value.filter((p) => p.flw).length)
const flwRate = computed(() => (projCount.value > 0 ? Math.round((flwCount.value / projCount.value) * 100) : 0))
const rateColor = computed(() => (flwRate.value >= 80 ? '#10b981' : flwRate.value >= 50 ? '#f59e0b' : '#ef4444'))
const timeLabel = computed(
  () =>
    ((
      { delay: ' (已延期)', d7: ' (7天内到期)', d15: ' (15天内到期)', d30: ' (30天内到期)' } as Record<string, string>
    )[props.timeWin] || ''),
)
const maxU = computed(() => Math.max(urgency.value.delay, urgency.value.d7, urgency.value.d15, urgency.value.d30, 1))
const URG = computed(() => [
  { label: '已延期', count: urgency.value.delay, color: '#dc2626' },
  { label: '7天内到期', count: urgency.value.d7, color: '#f97316' },
  { label: '8~15天到期', count: urgency.value.d15, color: '#f59e0b' },
  { label: '16~30天到期', count: urgency.value.d30, color: '#3b82f6' },
])

function batch(v: string | number) {
  if (v === '') return
  fu.batchSetFlw(projs.value.map((p) => p.projectId), String(v) === '1')
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    :title="`${dept}${timeLabel}`"
    width="92%"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="fe-body">
      <aside class="fe-left">
        <div class="fe-sum">涉及 {{ projCount }} 个项目 · 共 {{ nodeCount }} 个节点</div>
        <div class="fe-rate" :style="{ color: rateColor }">{{ flwRate }}%<span>跟进率</span></div>
        <div class="fe-cards">
          <div class="fe-c red"><b>{{ projCount - flwCount }}</b><span>待跟进</span></div>
          <div class="fe-c green"><b>{{ flwCount }}</b><span>已跟进</span></div>
        </div>
        <div class="fe-urg-title">到期紧迫度</div>
        <div v-for="u in URG" :key="u.label" class="fe-urg">
          <span class="fe-urg-label">{{ u.label }}</span>
          <div class="fe-urg-bar"><div :style="{ width: Math.round((u.count / maxU) * 100) + '%', background: u.color }"></div></div>
          <span class="fe-urg-num">{{ u.count }}</span>
        </div>
        <div class="fe-label">跟进状态筛选</div>
        <el-select v-model="fval" size="small" style="width: 100%">
          <el-option value="all" label="全部项目" />
          <el-option value="flw" label="已跟进" />
          <el-option value="noflw" label="未跟进" />
          <el-option value="7d" label="7天内到期" />
          <el-option value="15d" label="15天内到期" />
        </el-select>
        <div class="fe-label">批量操作</div>
        <el-select :model-value="''" size="small" style="width: 100%" placeholder="批量设置跟进..." @change="batch">
          <el-option value="1" label="全部标记已跟进" />
          <el-option value="0" label="全部标记未跟进" />
        </el-select>
      </aside>
      <section class="fe-right">
        <h3 class="fe-r-title">项目列表</h3>
        <div class="fe-r-count">共 {{ displayProjs.length }} 个项目 | 已跟进 {{ flwCount }}/{{ projCount }}</div>
        <FuProjectRow v-for="p in displayProjs" :key="p.projectId" :project="p" />
        <div v-if="!displayProjs.length" class="fe-empty">暂无匹配项目</div>
      </section>
    </div>
  </Modal>
</template>

<style scoped>
.fe-body { display: flex; gap: 16px; }
.fe-left { width: 240px; flex-shrink: 0; }
.fe-right { flex: 1; min-width: 0; }
.fe-sum { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }
.fe-rate { font-size: 32px; font-weight: 900; text-align: center; margin-bottom: 12px; }
.fe-rate span { display: block; font-size: 12px; color: #8c8c9e; font-weight: 400; }
.fe-cards { display: flex; gap: 10px; margin-bottom: 16px; }
.fe-c { flex: 1; text-align: center; padding: 12px 8px; border-radius: 8px; }
.fe-c b { font-size: 18px; display: block; }
.fe-c span { font-size: 12px; font-weight: 600; }
.fe-c.red { background: #fef2f2; color: #ef4444; }
.fe-c.green { background: #ecfdf5; color: #10b981; }
.fe-urg-title { font-size: 13px; font-weight: 600; color: #8c8c9e; margin-bottom: 8px; }
.fe-urg { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
.fe-urg-label { font-size: 12px; color: #8c8c9e; width: 76px; flex-shrink: 0; text-align: right; }
.fe-urg-bar { flex: 1; height: 10px; background: #f1f5f9; border-radius: 5px; overflow: hidden; }
.fe-urg-bar > div { height: 100%; border-radius: 5px; }
.fe-urg-num { font-size: 13px; font-weight: 700; color: #1a1a2e; min-width: 20px; text-align: right; }
.fe-label { font-size: 13px; font-weight: 600; color: #475569; margin: 12px 0 6px; }
.fe-r-title { font-size: 15px; font-weight: 700; margin: 0 0 4px; }
.fe-r-count { font-size: 11px; color: #8c8c9e; margin-bottom: 16px; }
.fe-empty { text-align: center; padding: 30px; color: #8c8c9e; }
</style>
```

- [ ] **Step 4: 跑测试确认通过** — `cd frontend && npx vitest run src/components/FollowupExpandModal.test.ts`（全绿）
- [ ] **Step 5: typecheck** — 同前。
- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/FollowupExpandModal.vue frontend/src/components/FollowupExpandModal.test.ts
git commit -m "feat(frontend): 新增 FollowupExpandModal 展开面板（左统计+右项目列表+档位/下拉/批量）"
```

---

### Task 6: 接入信号行点击 + 视图改用 fuData store + verify + PROGRESS

**Files:**
- Modify: `frontend/src/components/FollowupSignalRow.vue`
- Modify: `frontend/src/views/FollowupView.vue`
- Modify: `frontend/src/views/FollowupView.test.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 改 FollowupSignalRow.vue —— 部门名与 4 档条可点击，emit expand**

在 `<script setup>` 的 `defineProps` 后加 emit：

```ts
const emit = defineEmits<{ expand: [{ dept: string; timeWin: string }] }>()
```

模板：给部门块加点击（timeWin 空=全部）、给每个档位 `sig-bar-group` 加点击（timeWin=b.key）。即把：

```html
    <div class="sig-dept">
      <div class="sig-dept-name">{{ stat.name }}</div>
      <div class="sig-dept-count">共{{ stat.total }}个项目</div>
    </div>
```

改为（加 `@click` 与 `clickable` 类）：

```html
    <div class="sig-dept clickable" @click="emit('expand', { dept: stat.name, timeWin: '' })">
      <div class="sig-dept-name">{{ stat.name }}</div>
      <div class="sig-dept-count">共{{ stat.total }}个项目</div>
    </div>
```

并把档位 `<div v-for="b in BARS" :key="b.key" class="sig-bar-group">` 改为：

```html
      <div v-for="b in BARS" :key="b.key" class="sig-bar-group clickable" @click="emit('expand', { dept: stat.name, timeWin: b.key })">
```

样式追加：`.clickable { cursor: pointer; }`

- [ ] **Step 2: 改 FollowupView.vue —— 改用 fuData store + 接入展开面板**

- import 增加：

```ts
import { useFuDataStore } from '@/stores/fuData'
import FollowupExpandModal from '@/components/FollowupExpandModal.vue'
```

- 删除 `import { loadFuData } from '@/lib/followup'` 中的 `loadFuData`（保留其余），并把 `const fuData = loadFuData()` 改为：

```ts
const fu = useFuDataStore()
```

- `stats` computed 改用 `fu.data`：

```ts
const stats = computed(() => followupDeptStats(relatedNodes.value as any, fu.data, new Date()))
```

- 增加展开面板状态与处理：

```ts
const expandOpen = ref(false)
const expandDept = ref('')
const expandWin = ref('')
function onExpand(e: { dept: string; timeWin: string }) {
  expandDept.value = e.dept
  expandWin.value = e.timeWin
  expandOpen.value = true
}
```

- 模板：给 `FollowupSignalRow` 加 `@expand="onExpand"`；在 `.fu-board` 之后加面板：

```html
      <FollowupSignalRow
        v-for="(d, i) in filteredStats"
        :key="d.name"
        :index="i"
        :stat="d"
        :max="max"
        @expand="onExpand"
      />
```

并在根 `</div>` 前加：

```html
    <FollowupExpandModal
      v-model="expandOpen"
      :dept="expandDept"
      :time-win="expandWin"
      :related-nodes="relatedNodes as Record<string, any>[]"
    />
```

（`relatedNodes` computed 已存在；`ref` 已从 vue 导入。）

- [ ] **Step 3: 改 FollowupView.test.ts —— 新增点击开面板用例**

在原 describe 内追加：

```ts
  it('点击部门信号行打开展开面板', async () => {
    seed()
    const w = mount(FollowupView, { global: { plugins: [ElementPlus] }, attachTo: document.body })
    await w.find('.sig-dept.clickable').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('项目列表')
    w.unmount()
  })
```

并把文件顶部 import 改为含 `flushPromises`：`import { mount, flushPromises } from '@vue/test-utils'`，且在文件末尾 `afterEach(() => { document.body.innerHTML = '' })`（若 B13 测试未含）。注意保留 B13 原有两个用例不变。

- [ ] **Step 4: 跑相关测试** — `cd frontend && npx vitest run src/views/FollowupView.test.ts src/components/FollowupSignalRow.test.ts`（全绿；FollowupSignalRow 原测试不应因 emit 增加而失败）

- [ ] **Step 5: 全量验证** — `bash verify.sh`，期望 `[PASS] verify.sh 全部通过 ✓`（~1MB chunk 警告属已知 B-opt，非失败）。

- [ ] **Step 6: 更新 PROGRESS.md**
  - "最近更新"改当日，注明 B14 临期跟进 展开面板/项目列表/跟进标记 完成。
  - Backlog：B14 行改 `[x] **B14** 临期跟进：展开面板 + 项目列表 + 跟进标记(fuData store/followupProjects/FuNodeTable/FuProjectRow/FollowupExpandModal，信号行可点击开面板)。`；新增 `[ ] **B15** 临期跟进：跟进记录 CRUD(/api/followup/*) + 云文档异步回写 + 同步状态轮询`；其余顺延 `[ ] **B16** 数据管理(data)`、`[ ] **B17** 区间对比(compare) + 关于(about)`。
  - Handoff 追加 B14 完成段（提交 SHA；忠实性：数据源 filteredNodes.related、部门项目聚合、档位/紧迫度/下拉过滤、标记写 fu_data 联动看板；范围：读+本地标记，CRUD/云回写拆 B15；展示从简：记录区/下钻/环形图/动态菜单延后；fuData 升级为响应式 store，B13 视图改用之；today 注入）。下一步指向 B15。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/components/FollowupSignalRow.vue frontend/src/views/FollowupView.vue frontend/src/views/FollowupView.test.ts PROGRESS.md
git commit -m "feat(frontend): 临期跟进信号行可点击开展开面板，视图改用 fuData store；更新 PROGRESS(B14)"
```

---

## Self-Review

- **Spec 覆盖：** 信号行可点击(部门名/档位)→展开面板(T6+T5)✓；左统计 涉及N项目共N节点/跟进率/待跟进-已跟进/紧迫度4条/筛选/批量(`deptWindowNodes`+`deptUrgency`+FollowupExpandModal)✓；右项目列表(`followupDeptProjects`+`applyProjDropdown`+FuProjectRow)✓；项目节点表展开(`pendingNodes`+FuNodeTable)✓；跟进标记写 fu_data 并联动看板(`fuData` store + B13 视图改用)✓；档位/下拉过滤口径✓；today 注入✓。
- **占位符扫描：** 各 step 含完整代码/命令/预期或精确改法；无 TODO/TBD。
- **类型一致性：** `FuFlag`/`FuData`(followup) 被 fuData store 复用；`FuProject`/`Urgency`(followupProjects) 贯穿 lib→FuProjectRow/FollowupExpandModal；`useFuDataStore` 的 get/setFlw/batchSetFlw 在 FuProjectRow/FollowupExpandModal/FollowupView 调用一致；复用 `pctToNum`/`formatCellValue`/`Modal`(B4) 一致。
- **范围/忠实性取舍：** B14 读+本地标记、CRUD/云回写拆 B15、记录区/下钻/环形图/动态菜单延后、fuData 升级响应式、today 注入——均已在头部"范围/关键忠实性/展示从简"列明。
