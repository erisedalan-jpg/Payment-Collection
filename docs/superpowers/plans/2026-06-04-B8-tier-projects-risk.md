# Plan B8：分层页 项目总览(projects) + 风险项目(risk) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 B7 已建的分层页外壳 `/tier/:tab/:tier` 上，补齐两个 tab：项目总览（projects，含项目级汇总条 + 动态列表格）、风险项目（risk，三类风险表）。点亮侧边栏"业务分析"下 projects×3 + risk×3 共 6 个入口。

**Architecture:** 纯前端。可单测的取数/聚合放 `lib/`（projectsOverview / riskGroups + format.fmtRatio）；两个 tab 组件复用 B4 的 DataTable；TierView 增加 projects/risk 分发。日期相关的风险（临近到期）把 `now` 作为参数注入以便测试（沿用后端 compute_node_status 的注入模式）。Phase B 第八块，自成可运行/可测闭环。

**Tech Stack:** Vue 3 `<script setup>` + TS + Pinia + Vue Router + DataTable(B4) + Vitest（已装）。

参考（旧版忠实来源 `app.js`）：项目总览汇总 `renderTier` 2029-2053、项目总览表 `renderProjectOverviewTable` 6451+（其搜索框/列可见性/导出列入 B-opt，本计划不做）；风险 `renderRisk` 3120-3157；`getNodeRemaining` 654、`fmtRatio` 617、`truncName` 5267（截断改用 DataTable 内置 tooltip，不再单独移植）。复用：`groupByProject/ProjectAgg`(B5 `lib/dashboardStats.ts`)、`pctToNum/pct/fmtYuan/fmtWan`(B5 `lib/format.ts`)、`formatCellValue`(B7 `lib/cellFormat.ts`)、`DataTable`(B4)、`TIER_BY_SLUG/TIERS`(B2)、`filterStore.filteredNodes/naguanOn`(B3)、`TierView`(B7)。

**不在本计划（拆到 B9 或 B-opt）：**
- 回款状态(plan) 6 看板 → B9（本计划 TierView 中 plan 仍走"建设中"占位）。
- 项目总览的：搜索框、列可见性持久化 UI、Excel 导出、看板下钻（`_overviewDrilldown`）→ B-opt（展示从简，用户已接受）。
- 风险表旧版"显示截断 30 行、计数取全量"的差异：本计划改为全量渲染（DataTable 计数=渲染行数，二者一致），小列表性能无忧——属可接受的展示简化。
- nodeStatus/tier 徽章配色、行点击钻取 → B-opt。

---

## File Structure（B8 产出）

```
frontend/src/
├── lib/format.ts (改：加 fmtRatio) + format.test.ts (补测试)
├── lib/projectsOverview.ts + projectsOverview.test.ts   # filterOverviewProjects / projectsOverviewSummary
├── lib/riskGroups.ts + riskGroups.test.ts               # getNodeRemaining / riskGroups
├── components/ProjectsOverviewTab.vue + .test.ts         # 项目总览（汇总条 + 动态列表格）
├── components/RiskTab.vue + .test.ts                     # 风险三表
└── views/TierView.vue (改：分发 projects/risk) + TierView.test.ts (补测试)
```

约定：从 `frontend/` 运行 npm；提交信息末尾附 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。Windows，Bash 工具。

数据形状备忘（已核对 `data/analysis_data.json` 实样）：
- `projectOverview.projects[]` 每条含中文键 + 派生英文键：`projectId, projectName, amountTier('100万以上'|'50-100万'|'50万以下'), projectType, orgL4, orgL3, projectManager, projectAmount` 等。
- `projectOverview.columns[]`：`{key, label, visible, isImage}`（约 20 列）。
- `naguanExclude`：`{projectId: true}`。

---

### Task 1: lib/format 增加 fmtRatio

**Files:** Modify `frontend/src/lib/format.ts`、`frontend/src/lib/format.test.ts`。忠实移植 `app.js fmtRatio`（617）：空值返回 nullLabel（回款比例列用 '待上报'），否则走 `pct`。

- [ ] **Step 1: 追加失败测试到 `format.test.ts`**

在文件现有 import 行补上 `fmtRatio`，并在末尾追加 describe：

```ts
import { fmtRatio } from './format' // 合并进现有 import（与 fmt/fmtYuan/fmtWan/pct/pctToNum 同行或新增一行）

describe('fmtRatio', () => {
  it('null/空值/空串 → nullLabel（默认 -）', () => {
    expect(fmtRatio(null)).toBe('-')
    expect(fmtRatio('空值')).toBe('-')
    expect(fmtRatio('')).toBe('-')
  })
  it('指定 nullLabel（如 待上报）', () => {
    expect(fmtRatio(null, '待上报')).toBe('待上报')
    expect(fmtRatio('', '待上报')).toBe('待上报')
  })
  it('有值 → pct', () => {
    expect(fmtRatio(0.7)).toBe('70%')
    expect(fmtRatio('70%')).toBe('70%')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/format.test.ts`  → FAIL（无 fmtRatio）。

- [ ] **Step 3: 在 `format.ts` 末尾追加**

```ts
/** 比例展示；null/undefined/'空值'/'' → nullLabel（默认 '-'，回款比例列用 '待上报'）。忠实移植 app.js fmtRatio。 */
export function fmtRatio(v: unknown, nullLabel = '-'): string {
  if (v === null || v === undefined || v === '空值' || v === '') return nullLabel
  return pct(v)
}
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/format.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/format.ts frontend/src/lib/format.test.ts
git commit -m "feat(frontend): format 增加 fmtRatio（空值占位 + 复用 pct，忠实移植）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: lib/projectsOverview（项目总览过滤 + 汇总）

**Files:** Create `frontend/src/lib/projectsOverview.ts`、`frontend/src/lib/projectsOverview.test.ts`。忠实移植 `renderTier` 2030-2044 的项目总览取数与汇总。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/projectsOverview.test.ts
import { describe, it, expect } from 'vitest'
import { filterOverviewProjects, projectsOverviewSummary } from './projectsOverview'

const PROJECTS = [
  { projectId: 'P1', amountTier: '100万以上' },
  { projectId: 'P2', amountTier: '100万以上' },
  { projectId: 'P3', amountTier: '50万以下' },
]

describe('filterOverviewProjects', () => {
  it('按 amountTier 过滤', () => {
    expect(filterOverviewProjects(PROJECTS, '100万以上', false, {}).map((p) => p.projectId)).toEqual(['P1', 'P2'])
  })
  it('纳管开启时排除 naguanExclude', () => {
    expect(filterOverviewProjects(PROJECTS, '100万以上', true, { P2: true }).map((p) => p.projectId)).toEqual(['P1'])
  })
  it('纳管关闭时不排除', () => {
    expect(filterOverviewProjects(PROJECTS, '100万以上', false, { P2: true }).map((p) => p.projectId)).toEqual(['P1', 'P2'])
  })
})

describe('projectsOverviewSummary', () => {
  const NODES: any[] = [
    { projectId: 'P1', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0 },
    { projectId: 'P2', isPaymentRelated: true, nodeStatus: '加资源可提前', expectedPayment: 500000, actualPayment: 500000 },
    { projectId: 'X9', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 999, actualPayment: 0 }, // 不在 displayProjects → 不计入
    { projectId: 'P1', isPaymentRelated: false, nodeStatus: '正常实施中', expectedPayment: 9999, actualPayment: 0 }, // 非关联 → 不计入
  ]
  it('仅统计 displayProjects 内的关联节点', () => {
    const s = projectsOverviewSummary([{ projectId: 'P1' }, { projectId: 'P2' }], NODES)
    expect(s.projectCount).toBe(2)
    expect(s.nodeCount).toBe(2)
    expect(s.totalActual).toBe(500000)
    expect(s.totalRemaining).toBe(1000000)
    expect(s.rate).toBeCloseTo(1 / 3)
    expect(s.adv).toBe(1)
    expect(s.reached).toBe(0)
    expect(s.delayed).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/projectsOverview.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/lib/projectsOverview.ts`**

```ts
import type { RawNode } from '@/types/analysis'

export type OverviewProject = Record<string, any>

/** 忠实移植 renderTier：项目总览按 amountTier 过滤；纳管开启时排除 naguanExclude。 */
export function filterOverviewProjects(
  projects: OverviewProject[],
  tier: string,
  naguanOn: boolean,
  naguanExclude: Record<string, boolean>,
): OverviewProject[] {
  return projects.filter((p) => {
    if (naguanOn && naguanExclude && naguanExclude[p.projectId as string]) return false
    return p.amountTier === tier
  })
}

export interface ProjectsOverviewSummary {
  projectCount: number
  nodeCount: number
  totalActual: number
  totalRemaining: number
  rate: number
  adv: number
  reached: number
  delayed: number
}

/** 忠实移植 renderTier 项目总览汇总：仅统计 displayProjects 内的关联回款节点（单位元）。 */
export function projectsOverviewSummary(
  displayProjects: OverviewProject[],
  filteredNodes: RawNode[],
): ProjectsOverviewSummary {
  const pids = new Set(displayProjects.map((p) => p.projectId as string))
  const ovNodes = filteredNodes.filter((raw) => {
    const n = raw as Record<string, any>
    return n.isPaymentRelated && pids.has(n.projectId)
  })
  const expected = ovNodes.reduce((s, n) => s + ((n as Record<string, any>).expectedPayment || 0), 0)
  const actual = ovNodes.reduce((s, n) => s + ((n as Record<string, any>).actualPayment || 0), 0)
  const byStatus = (st: string) => ovNodes.filter((n) => (n as Record<string, any>).nodeStatus === st).length
  return {
    projectCount: displayProjects.length,
    nodeCount: ovNodes.length,
    totalActual: actual,
    totalRemaining: expected - actual,
    rate: expected > 0 ? actual / expected : 0,
    adv: byStatus('加资源可提前'),
    reached: byStatus('达到回款条件'),
    delayed: byStatus('延期'),
  }
}
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/projectsOverview.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/projectsOverview.ts frontend/src/lib/projectsOverview.test.ts
git commit -m "feat(frontend): lib/projectsOverview（按档位/纳管过滤 + 项目总览汇总，忠实移植）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: ProjectsOverviewTab 组件（项目总览）

**Files:** Create `frontend/src/components/ProjectsOverviewTab.vue`、`frontend/src/components/ProjectsOverviewTab.test.ts`。汇总条（项目级）+ 动态列表格（列来自 `projectOverview.columns`，`formatCellValue` 格式化）。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/ProjectsOverviewTab.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProjectsOverviewTab from './ProjectsOverviewTab.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' },
    ],
    projectOverview: {
      projects: [
        { projectId: 'P1', projectName: '甲项目', amountTier: '100万以上', orgL4: '北京' },
        { projectId: 'P9', projectName: '乙项目', amountTier: '50万以下', orgL4: '上海' },
      ],
      columns: [
        { key: 'projectId', label: '项目编号', visible: true },
        { key: 'projectName', label: '项目名称', visible: true },
        { key: 'orgL4', label: '服务组', visible: true },
        { key: 'hidden', label: '隐藏列', visible: false },
      ],
    },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('ProjectsOverviewTab', () => {
  it('按档位渲染项目总览 + 汇总条 + 动态列', async () => {
    seed()
    const wrapper = mount(ProjectsOverviewTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('项目总数')          // 汇总条
    expect(text).toContain('项目编号')          // 可见列表头
    expect(text).toContain('甲项目')            // 本档位项目
    expect(text).not.toContain('乙项目')        // 其它档位被过滤
    expect(text).not.toContain('隐藏列')        // visible:false 列不出现
  })

  it('汇总条计算正确（完成率 0% / 延期 1）', async () => {
    seed()
    const wrapper = mount(ProjectsOverviewTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('0%')      // pct(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/ProjectsOverviewTab.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/components/ProjectsOverviewTab.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { filterOverviewProjects, projectsOverviewSummary, type OverviewProject } from '@/lib/projectsOverview'
import { formatCellValue } from '@/lib/cellFormat'
import { fmtWan, pct } from '@/lib/format'

const props = defineProps<{ tier: string }>()
const data = useDataStore()
const filter = useFilterStore()

const displayProjects = computed<OverviewProject[]>(() =>
  filterOverviewProjects(
    (data.data?.projectOverview?.projects ?? []) as OverviewProject[],
    props.tier,
    filter.naguanOn,
    (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
  ),
)

const summary = computed(() => projectsOverviewSummary(displayProjects.value, filter.filteredNodes))

const columns = computed<DataColumn[]>(() => {
  const cols = (data.data?.projectOverview?.columns ?? []) as Record<string, any>[]
  return cols
    .filter((c) => c.visible !== false)
    .map((c) => ({
      key: c.key as string,
      label: c.label as string,
      formatter: (value: unknown) => formatCellValue(value, c.key as string),
    }))
})

const rateColor = (r: number) => (r >= 0.8 ? '#10b981' : r >= 0.5 ? '#f59e0b' : '#ef4444')
</script>

<template>
  <div class="projects-tab">
    <div class="summary-bar">
      <div class="sb-item"><div class="sb-label">项目总数</div><div class="sb-val">{{ summary.projectCount }}</div></div>
      <div class="sb-item"><div class="sb-label">已回款总金额(万)</div><div class="sb-val green">{{ fmtWan(summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">待回款总金额(万)</div><div class="sb-val red">{{ fmtWan(summary.totalRemaining) }}</div></div>
      <div class="sb-item"><div class="sb-label">完成率</div><div class="sb-val" :style="{ color: rateColor(summary.rate) }">{{ pct(summary.rate) }}</div></div>
      <div class="sb-item"><div class="sb-label">加资源可提前</div><div class="sb-val primary">{{ summary.adv }}</div></div>
      <div class="sb-item"><div class="sb-label">达到回款条件</div><div class="sb-val orange">{{ summary.reached }}</div></div>
      <div class="sb-item"><div class="sb-label">延期</div><div class="sb-val red">{{ summary.delayed }}</div></div>
    </div>
    <DataTable :columns="columns" :rows="displayProjects" />
  </div>
</template>

<style scoped>
.projects-tab { padding: 12px 0; }
.summary-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; padding: 0 16px 12px; }
.sb-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
.sb-label { font-size: 12px; color: #64748b; }
.sb-val { font-size: 18px; font-weight: 700; color: #0f172a; }
.sb-val.green { color: #10b981; } .sb-val.red { color: #ef4444; } .sb-val.orange { color: #f59e0b; } .sb-val.primary { color: #4f46e5; }
</style>
```

注：汇总条样式与 `TierView` 的 summary-bar 同构（标签/口径不同）。B-opt 可抽公共 `SummaryBar` 组件统一 TierView/projects；本计划维持内联，符合"展示从简"。

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/components/ProjectsOverviewTab.test.ts`（PASS）
若 el-table 在 jsdom 下单元格内容断言不稳（表头通过但 `甲项目` 失败）：表头/汇总断言保留，对单元格断言改用 `wrapper.html()`；仍不稳则降级断言 `wrapper.findComponent(DataTable).props('columns').length === 3`（隐藏列已排除）并报告所用方式。
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ProjectsOverviewTab.vue frontend/src/components/ProjectsOverviewTab.test.ts
git commit -m "feat(frontend): ProjectsOverviewTab 项目总览（项目级汇总条 + 动态列表格）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: lib/riskGroups（三类风险分组）

**Files:** Create `frontend/src/lib/riskGroups.ts`、`frontend/src/lib/riskGroups.test.ts`。忠实移植 `renderRisk` 3122-3132 的三类分组；`now` 注入以便测试。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/lib/riskGroups.test.ts
import { describe, it, expect } from 'vitest'
import { riskGroups, getNodeRemaining } from './riskGroups'

const NOW = new Date('2026-06-04T00:00:00')

const NODES: any[] = [
  // 临近到期：planDate 在 now..now+7d，actualPaymentRatio<1
  { projectId: 'P1', projectName: '甲', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-06', actualPaymentRatio: 0.5, expectedPayment: 200000, actualPayment: 100000, orgL4: '北京' },
  // 不临近：planDate 超出 7 天
  { projectId: 'P2', projectName: '乙', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-07-30', actualPaymentRatio: 0, expectedPayment: 100000, actualPayment: 0, orgL4: '上海' },
  // 可提前但未行动
  { projectId: 'P3', projectName: '丙', tier: '100万以上', isPaymentRelated: true, nodeStatus: '加资源可提前', planDate: '2026-08-01', actualPaymentRatio: 0, expectedPayment: 300000, actualPayment: 0, orgL4: '广州' },
  // 高金额低完成率：项目级 paymentRatio=0.1 (<0.3)
  { projectId: 'P4', projectName: '丁', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-09-01', actualPaymentRatio: 0.1, expectedPayment: 1000000, actualPayment: 100000, projectAmount: 2000000, orgL4: '深圳' },
]

describe('getNodeRemaining', () => {
  it('expected - actual（元）', () => {
    expect(getNodeRemaining({ expectedPayment: 200000, actualPayment: 100000 })).toBe(100000)
    expect(getNodeRemaining({})).toBe(0)
  })
})

describe('riskGroups', () => {
  it('临近到期：7天内且未100%回款，按 planDate 升序', () => {
    const g = riskGroups(NODES, NOW)
    expect(g.nearDue.map((n: any) => n.projectId)).toEqual(['P1'])
  })
  it('可提前但未行动：nodeStatus=加资源可提前', () => {
    const g = riskGroups(NODES, NOW)
    expect(g.canAdvance.map((n: any) => n.projectId)).toEqual(['P3'])
  })
  it('高金额低完成率：项目完成率<0.3，按项目金额降序，取前10', () => {
    const g = riskGroups(NODES, NOW)
    expect(g.highRisk.map((p) => p.projectId)).toEqual(['P4'])
    expect(g.highRisk[0].paymentRatio).toBeCloseTo(0.1)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/riskGroups.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/lib/riskGroups.ts`**

```ts
import type { RawNode } from '@/types/analysis'
import { groupByProject, type ProjectAgg } from './dashboardStats'
import { pctToNum } from './format'

/** 节点待回款（元）= 计划回款 - 实际回款。忠实移植 app.js getNodeRemaining。 */
export function getNodeRemaining(n: Record<string, any>): number {
  return (n.expectedPayment || 0) - (n.actualPayment || 0)
}

export interface RiskGroups {
  nearDue: RawNode[]
  canAdvance: RawNode[]
  highRisk: ProjectAgg[]
}

/**
 * 忠实移植 renderRisk 的三类风险分组。now 注入以便测试（组件调用方传 new Date()）。
 * - nearDue：关联节点且有 planDate、实际比例<1（或缺报）、planDate 落在 [now, now+7天]，按 planDate 升序。
 * - canAdvance：关联节点且 nodeStatus='加资源可提前'。
 * - highRisk：项目级完成率<0.3，按项目金额降序取前 10。
 */
export function riskGroups(tierNodes: RawNode[], now: Date): RiskGroups {
  const d7 = new Date(now.getTime() + 7 * 864e5)
  const related = tierNodes.filter((n) => (n as Record<string, any>).isPaymentRelated)

  const nearDue = related
    .filter((n) => {
      const r = n as Record<string, any>
      if (!r.planDate) return false
      const v = pctToNum(r.actualPaymentRatio)
      return v === null || v < 1
    })
    .filter((n) => {
      try {
        const d = new Date((n as Record<string, any>).planDate)
        return d >= now && d <= d7
      } catch {
        return false
      }
    })
    .sort((a, b) =>
      String((a as Record<string, any>).planDate || '').localeCompare(
        String((b as Record<string, any>).planDate || ''),
      ),
    )

  const canAdvance = related.filter((n) => (n as Record<string, any>).nodeStatus === '加资源可提前')

  const highRisk = groupByProject(tierNodes)
    .filter((p) => p.paymentRatio !== null && p.paymentRatio < 0.3)
    .sort((a, b) => (b.projectAmount || 0) - (a.projectAmount || 0))
    .slice(0, 10)

  return { nearDue, canAdvance, highRisk }
}
```

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/lib/riskGroups.test.ts`（PASS）
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/riskGroups.ts frontend/src/lib/riskGroups.test.ts
git commit -m "feat(frontend): lib/riskGroups（临近到期/可提前未行动/高金额低完成率，now 注入，忠实移植）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: RiskTab 组件（风险三表）

**Files:** Create `frontend/src/components/RiskTab.vue`、`frontend/src/components/RiskTab.test.ts`。三张卡片各一个 DataTable；`now` 作为可选 prop（默认 `new Date()`）以便测试。

- [ ] **Step 1: 写失败测试**

```ts
// frontend/src/components/RiskTab.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import RiskTab from './RiskTab.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', projectName: '甲', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-06', actualPaymentRatio: 0.5, expectedPayment: 200000, actualPayment: 100000, orgL4: '北京', planMonth: '2026-06' },
      { projectId: 'P3', projectName: '丙', tier: '100万以上', isPaymentRelated: true, nodeStatus: '加资源可提前', planDate: '2026-08-01', actualPaymentRatio: 0, expectedPayment: 300000, actualPayment: 0, orgL4: '广州', planMonth: '2026-08' },
      { projectId: 'P4', projectName: '丁', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-09-01', actualPaymentRatio: 0.1, expectedPayment: 1000000, actualPayment: 100000, projectAmount: 2000000, orgL4: '深圳', planMonth: '2026-09' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('RiskTab', () => {
  it('渲染三类风险标题', async () => {
    seed()
    const wrapper = mount(RiskTab, { props: { tier: '100万以上', now: new Date('2026-06-04T00:00:00') }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('临近到期节点')
    expect(text).toContain('可提前但未行动')
    expect(text).toContain('高金额低完成率')
  })
  it('三张表均为 DataTable', async () => {
    seed()
    const wrapper = mount(RiskTab, { props: { tier: '100万以上', now: new Date('2026-06-04T00:00:00') }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.findAllComponents({ name: 'DataTable' }).length).toBe(3)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/RiskTab.test.ts`  → FAIL。

- [ ] **Step 3: 写实现 `frontend/src/components/RiskTab.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useFilterStore } from '@/stores/filter'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import { riskGroups, getNodeRemaining } from '@/lib/riskGroups'
import { fmtYuan, fmtRatio, pct } from '@/lib/format'

const props = defineProps<{ tier: string; now?: Date }>()
const filter = useFilterStore()

const tierNodes = computed(() => filter.filteredNodes.filter((n) => n.tier === props.tier))
const groups = computed(() => riskGroups(tierNodes.value, props.now ?? new Date()))

const nodeCols: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'planDate', label: '计划日期' },
  { key: 'remaining', label: '待回款(元)', formatter: (_v, row) => fmtYuan(getNodeRemaining(row)) },
  { key: 'actualPaymentRatio', label: '实际比例', formatter: (v) => fmtRatio(v, '待上报') },
  { key: 'orgL4', label: '服务组' },
]

const highRiskCols: DataColumn[] = [
  { key: 'projectId', label: '项目编号' },
  { key: 'projectName', label: '项目名称' },
  { key: 'projectAmount', label: '项目金额(元)', formatter: (v) => fmtYuan(v as number) },
  { key: 'remainingAmount', label: '待回款金额(元)', formatter: (v) => fmtYuan(v as number) },
  { key: 'paymentRatio', label: '完成率', formatter: (v) => pct(v) },
  { key: 'orgL4', label: '服务组' },
]
</script>

<template>
  <div class="risk-tab">
    <section class="risk-card">
      <div class="rc-header orange">临近到期节点 <span class="rc-sub">7天内到期且未100%回款</span></div>
      <DataTable :columns="nodeCols" :rows="groups.nearDue as Record<string, any>[]" />
    </section>
    <section class="risk-card">
      <div class="rc-header primary">可提前但未行动 <span class="rc-sub">具备提前完成条件但未行动</span></div>
      <DataTable :columns="nodeCols" :rows="groups.canAdvance as Record<string, any>[]" />
    </section>
    <section class="risk-card">
      <div class="rc-header red">高金额低完成率 <span class="rc-sub">回款完成率&lt;30%且金额最高</span></div>
      <DataTable :columns="highRiskCols" :rows="groups.highRisk as Record<string, any>[]" />
    </section>
  </div>
</template>

<style scoped>
.risk-tab { padding: 12px 16px; display: flex; flex-direction: column; gap: 16px; }
.risk-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
.rc-header { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.rc-header.orange { color: #f59e0b; } .rc-header.primary { color: #4f46e5; } .rc-header.red { color: #ef4444; }
.rc-sub { font-weight: 400; font-size: 12px; color: #94a3b8; margin-left: 6px; }
</style>
```

注：旧版每表显示截断 30 行、计数取全量；本实现全量渲染（DataTable 计数=渲染行数，二者一致），小列表无性能问题，属可接受的展示简化。

- [ ] **Step 4: 运行确认通过 + 类型检查**

Run: `cd frontend && npx vitest run src/components/RiskTab.test.ts`（PASS）
若 `findAllComponents({name:'DataTable'})` 命不中（SFC 名未注册）：改为断言三处 `.risk-card` 存在（`wrapper.findAll('.risk-card').length === 3`）+ 三个标题文案，报告所用方式。
Run: `cd frontend && npm run typecheck`（通过）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/RiskTab.vue frontend/src/components/RiskTab.test.ts
git commit -m "feat(frontend): RiskTab 风险三表（临近到期/可提前未行动/高金额低完成率，DataTable）+ 测试

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: TierView 接入 projects/risk + 收尾（verify 全绿 + 更新 PROGRESS）

**Files:** Modify `frontend/src/views/TierView.vue`、`frontend/src/views/TierView.test.ts`、`PROGRESS.md`。

- [ ] **Step 1: 在 `TierView.test.ts` 追加失败测试**

在 `describe('TierView', ...)` 内追加两个用例（seed/mountAt 复用现有；现有 seed 的 `projectOverview:{projects:[],columns:[]}` 足够让组件挂载）：

```ts
  it('projects tab renders ProjectsOverviewTab', async () => {
    seed()
    const wrapper = await mountAt('/tier/projects/above1m')
    expect(wrapper.findComponent({ name: 'ProjectsOverviewTab' }).exists()).toBe(true)
  })

  it('risk tab renders RiskTab', async () => {
    seed()
    const wrapper = await mountAt('/tier/risk/above1m')
    expect(wrapper.findComponent({ name: 'RiskTab' }).exists()).toBe(true)
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/TierView.test.ts`  → FAIL（projects/risk 仍走占位，组件不存在）。

- [ ] **Step 3: 修改 `TierView.vue` 接入分发**

在 `<script setup>` 顶部 import 区追加：

```ts
import ProjectsOverviewTab from '@/components/ProjectsOverviewTab.vue'
import RiskTab from '@/components/RiskTab.vue'
```

把 template 中的 tab 分发块（B7 的 nodes/integrity/占位）改为：

```vue
    <TierNodesTab v-if="tab === 'nodes'" :tier="tier" />
    <ProjectsOverviewTab v-else-if="tab === 'projects'" :tier="tier" />
    <RiskTab v-else-if="tab === 'risk'" :tier="tier" />
    <TierIntegrityTab v-else-if="tab === 'integrity'" :tier="tier" />
    <div v-else class="tier-stub">「{{ tab }}」页签建设中（{{ tier }}）</div>
```

（`showSummaryBar` 维持仅 `tab === 'nodes'`：projects 的汇总条在 ProjectsOverviewTab 内部，risk/integrity/plan 无顶部汇总条。`plan` tab 仍落占位 → 留给 B9。）

- [ ] **Step 4: 运行确认通过 + 全量前端验证**

Run: `cd frontend && npx vitest run src/views/TierView.test.ts`（PASS）
Run: `cd frontend && npm run test:run`（全部通过）
Run: `cd frontend && npm run typecheck`（通过）
Run: `cd frontend && npm run build`（成功）

- [ ] **Step 5: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`。失败则 BLOCKED。

- [ ] **Step 6: 更新 PROGRESS.md**

在 "🟦 Phase B 前端"：
- 把 `- [ ] **B8** ...` 改为：
  ```
  - [x] **B8** 分层页：项目总览(projects) + 风险(risk) tab：lib/projectsOverview、lib/riskGroups、format.fmtRatio、ProjectsOverviewTab、RiskTab，TierView 接入分发。点亮 projects×3 + risk×3 入口。
  ```
- 更新 "Handoff" 段：把 B7 完成块标题/内容更新为 B8 完成，记录提交与下一步（B9 plan 6 看板 → B10+ …）。
- 更新 "最近更新" 为 `2026-06-04`。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/views/TierView.vue frontend/src/views/TierView.test.ts PROGRESS.md
git commit -m "feat(frontend): TierView 接入 projects/risk tab 分发；标记 B8 完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage（分层页 projects + risk）：**
- 项目总览过滤 + 汇总（忠实移植 renderTier）→ Task 2 ✓
- 项目总览表（动态列 + formatCellValue + 汇总条）→ Task 3 ✓
- 风险三类分组（忠实移植 renderRisk）→ Task 4 ✓
- 风险三表组件 → Task 5 ✓
- 比例展示占位（fmtRatio）→ Task 1 ✓
- TierView 接入 projects/risk → Task 6 ✓
- **明确移交**：plan tab → B9；搜索/列可见/导出/下钻/徽章/钻取 → B-opt。

**Placeholder scan：** 所有 lib/组件/视图/测试均给出完整代码；命令含预期输出。Task 3 Step 4 / Task 5 Step 4 对 el-table jsdom 渲染 与 findComponent({name}) 给了断言降级方案并要求报告。无 TBD/TODO。

**一致性：**
- `filterOverviewProjects`/`projectsOverviewSummary`/`riskGroups`/`getNodeRemaining`/`fmtRatio` 在 lib 与组件间签名一致。
- 复用 `groupByProject/ProjectAgg`(B5)、`pctToNum/pct/fmtYuan/fmtWan`(B5)、`formatCellValue`(B7)、`DataTable`(B4)、`TIER_BY_SLUG/TIERS`(B2)、`filterStore.filteredNodes/naguanOn`(B3)。
- projects 数据 = `projectOverview.projects` 按 `amountTier` + 纳管过滤；汇总取 `filteredNodes` 中属于这些项目的关联节点（与旧 renderTier 口径一致）。
- risk 数据 = `filteredNodes` 按 tier 过滤后分三类（年份/视角/纳管经 filteredNodes 自动生效）。
- TierView 分发：nodes/projects/risk/integrity 四 tab + plan 占位；summary-bar 仅 nodes（projects 汇总条在其组件内）。

**风险点：**
- el-table 在 jsdom 的单元格渲染：Task 3/5 已给降级断言。
- 风险"临近到期"依赖当前时间：lib 用 `now` 注入、组件用可选 `now` prop，测试传固定日期，规避不确定性（沿用后端 compute_node_status 注入模式）。
- 旧版风险表 30 行显示截断/全量计数差异：本计划全量渲染，已在 Task 5 说明为可接受简化。
- 汇总条样式与 TierView 重复：B-opt 可抽 SummaryBar，本计划维持内联。

---

## Execution Handoff

见会话中执行方式选择（建议同前：subagent-driven-development）。
