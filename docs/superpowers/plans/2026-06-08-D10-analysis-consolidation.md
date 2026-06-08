# D10 业务分析三档整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"业务分析 5 tab × 3 档 = 15 个侧栏入口"收成 `/analysis/:tab` 单页 + 页内档位筛选（默认全部 + 3 档）+ 表格档位列;5 个 tab 组件支持"全部"档（跨档），并 token 化（补 D2.5 延后的暗色）。删 `/tier/:tab/:tier` 路由与旧侧栏分叉。Phase D 收尾。

**Architecture:** 新增 `views/AnalysisView.vue`（`/analysis/:tab`：RouterLink tab 条 + 档位 SegToggle[全部+3档,默认全部] + nodes 汇总条 + 渲染当前 tab 组件并传 `tier`）。5 个 tab 组件改 `tier===''` 为"全部"（节点不按档过滤;TierNodes/Plan 列在全部档用首档 displayColumns 回退;数据质检全部档跨档 concat incompleteData[带档位标签]），并 token 化。`filterOverviewProjects` 支持空 tier=全部。nav/sidebar 收成 5 个 /analysis 链接，router 去 /tier、删 TierView。计算口径忠实，不改算法。

**Tech Stack:** Vue3 `<script setup lang="ts">` + Pinia + vue-router + Element Plus + Vitest。

---

## 背景与范围

Phase D spec 决策 1 + §4.5：档位降为页内筛选(默认全部)+表格档位列;15 入口收成 5 统一页。用户确认(2026-06-08)：**默认全部**方向。

**现状（要改/删，tab 组件均 D2.5 延后的硬编码色）：**
- `views/TierView.vue`（/tier/:tab/:tier）：按 :tab 渲染 5 个 tab 组件、tier 来自路由;nodes 汇总条用 `tierSummaryBar`。**删除**，逻辑移入 AnalysisView。
- 5 个 tab 组件均 `defineProps<{ tier: string }>()` 且按 `n.tier === props.tier` 过滤:
  - `ProjectsOverviewTab`(5 hex)：`filterOverviewProjects(projects, tier, …)`(按 `amountTier===tier`);列来自**全局** `projectOverview.columns`。
  - `TierNodesTab`(0 hex)：rows 按 tier;列 `displayColumns[tier]`。
  - `PlanTab`(14 hex)：allNodes 按 tier;列 `displayColumns[tier]`;含 PLAN_BOARDS/crossFilter/PlanBoard。
  - `RiskTab`(3 hex)：tierNodes 按 tier;`riskGroups`。
  - `TierIntegrityTab`(10 hex)：rows=`summary[tier].incompleteData`(按档)。
- `nav.ts`：`TIER_TABS`(5) × `TIERS`(3) → AppSidebar 渲染 15 链接;`router` 有 `/tier/:tab/:tier`。

**本计划新建/改/删：**
- 新建：`views/AnalysisView.vue`(+test)。
- 改：`lib/projectsOverview.ts`(filterOverviewProjects 空 tier=全部)、5 个 tab 组件(全部档 + token + 档位列)、`nav.ts`、`layout/AppSidebar.vue`、`router/index.ts`。
- 删：`views/TierView.vue`、`views/TierView.test.ts`。

**YAGNI：** 档位列徽章用 DataTable 文本列(`档位` 列，全部档时前置)，不做彩色徽章(DataTable 仅文本格);质检全部档用跨档 concat(各项目属唯一档，concat=并集)而非聚合。

## 约定（CLAUDE.md）

- 简体中文;**无 emoji**。CSS 用主题 token;尺寸 `var(--fs-*)`。计算口径忠实，不改算法;改的纯函数补测试。
- 提交信息结尾：
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

### 颜色 Token 映射（token 化各 tab 统一遵循，同 D2.5）

`#fff`→`var(--card)`;`#f8fafc`/`#fafbfc`/`#fafafa`→`var(--card2)`;`#0f172a`/`#1f2937`/`#1a1a2e`→`var(--txt)`;`#475569`/`#334155`→`var(--sub)`;`#64748b`/`#94a3b8`/`#cbd5e1`(文字)→`var(--mut)`;`#e2e8f0`/`#f1f5f9`(线)→`var(--line)`;`#ef4444`/`#dc2626`→`var(--danger)`;`#10b981`/`#059669`→`var(--c-paid)`;`#f59e0b`→`var(--c-pending)`;`#3b82f6`/`#2563eb`→`var(--accent)`;`#6366f1`/`#4f46e5`→`var(--accent)`;`#fff7ed`(暖底)→`color-mix(in srgb, var(--warn) 12%, transparent)`;`#b45309`(暖字)→`var(--warn)`。状态色阈值函数(rateColor 等)同理改 token。

---

### Task 1: lib/projectsOverview — 空 tier = 全部

**Files:**
- Modify: `frontend/src/lib/projectsOverview.ts`（`filterOverviewProjects`）
- Test: `frontend/src/lib/projectsOverview.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试**

在 `frontend/src/lib/projectsOverview.test.ts` 末尾追加（`filterOverviewProjects` 应已 import;否则补）：

```ts
describe('filterOverviewProjects 空 tier=全部', () => {
  const projs = [
    { projectId: 'A', amountTier: '100万以上' },
    { projectId: 'B', amountTier: '50万以下' },
  ] as any
  it('空 tier 返回全部（仅纳管过滤）', () => {
    expect(filterOverviewProjects(projs, '', false, {}).map((p: any) => p.projectId)).toEqual(['A', 'B'])
  })
  it('指定 tier 仍按档过滤', () => {
    expect(filterOverviewProjects(projs, '50万以下', false, {}).map((p: any) => p.projectId)).toEqual(['B'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/projectsOverview.test.ts`
Expected: FAIL（空 tier 当前返回空）。

- [ ] **Step 3: 实现**

把 `filterOverviewProjects` 的 filter 体改为空 tier 跳过档过滤：

```ts
  return projects.filter((p) => {
    if (naguanOn && naguanExclude && naguanExclude[p.projectId as string]) return false
    if (tier && p.amountTier !== tier) return false
    return true
  })
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/projectsOverview.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/projectsOverview.ts frontend/src/lib/projectsOverview.test.ts
git commit -m "feat(D10): filterOverviewProjects 空 tier=全部

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 各 tab 组件支持"全部"档 + token 化 + 档位列

**Files:**
- Modify: `frontend/src/components/ProjectsOverviewTab.vue`、`TierNodesTab.vue`、`PlanTab.vue`、`RiskTab.vue`、`TierIntegrityTab.vue`
- Test: 各组件若有 `.test.ts` 则按改动更新断言（保持通过）

按下方逐组件改动 + 按「颜色 Token 映射」token 化全部 hex。"全部档"约定：`props.tier === ''` 表示全部。

- [ ] **Step 1: ProjectsOverviewTab**
  - rows 已经过 `filterOverviewProjects(…, props.tier, …)`（Task1 已支持空=全部），无需改过滤。
  - 列：当 `props.tier === ''` 时，在 `columns` 计算结果**前置**档位列 `{ key: 'amountTier', label: '档位', formatter: (v)=>String(v ?? '-') }`。
  - token 化 `<style>` 与 `rateColor`（5 hex + 阈值色 → token）。

- [ ] **Step 2: TierNodesTab**
  - rows：`filter.filteredNodes.filter((n) => props.tier === '' || n.tier === props.tier)`。
  - 列：`const cols = displayColumns?.[props.tier] ?? displayColumns?.[TIERS[0].label] ?? []`（import `TIERS` from `@/nav`）;当 `props.tier===''` 前置档位列 `{ key:'tier', label:'档位', formatter:(v)=>String(v??'-') }`。
  - 无 hex（无需 token）。

- [ ] **Step 3: RiskTab**
  - `tierNodes`：`filter.filteredNodes.filter((n) => props.tier === '' || n.tier === props.tier)`。
  - 当 `props.tier===''`：`nodeCols`/`highRiskCols` 前置 `{ key:'tier', label:'档位' }`（用 computed 包裹或在模板按条件拼接;简单做法：改 `nodeCols`/`highRiskCols` 为 computed，全部档时 `[{key:'tier',label:'档位'}, ...base]`）。
  - token 化（3 hex：rc-header orange/primary/red + card + sub → token）。

- [ ] **Step 4: PlanTab**
  - `allNodes`：`filter.filteredNodes.filter((n) => (props.tier === '' || n.tier === props.tier) && n.isPaymentRelated)`。
  - 列：`const cols = displayColumns?.[props.tier] ?? displayColumns?.[TIERS[0].label] ?? []`（import `TIERS`）;当 `props.tier===''` 前置 `{ key:'tier', label:'档位' }`。
  - token 化（14 hex：summary-bar/status-grid 内联色与 .sb-val/.st-val/.st-card/卡片边框 → token）。

- [ ] **Step 5: TierIntegrityTab**
  - rows：当 `props.tier===''` 跨档 concat 并打档位标签;否则单档。改为（import `TIERS`）：

```ts
const rows = computed<IncompleteRow[]>(() => {
  const sm = (data.data?.summary as Record<string, any> | undefined) ?? {}
  const tiers = props.tier ? [props.tier] : TIERS.map((t) => t.label)
  return tiers.flatMap((t) =>
    ((sm[t]?.incompleteData ?? []) as IncompleteRow[]).map((r) => ({ ...r, _tier: t })),
  )
})
const showTier = computed(() => props.tier === '')
```

（`IncompleteRow` 接口加可选 `_tier?: string`。）
  - 表格：当 `showTier` 在表头首列加 `<th v-if="showTier">档位</th>`、行首列加 `<td v-if="showTier">{{ p._tier }}</td>`;`colspan` 空态由 6 改为 `showTier ? 7 : 6`（用 `:colspan`）。
  - token 化（10 hex：it-note/it-badge 暖底暖字 → color-mix(warn)/var(--warn);卡片/线/状态色 → token）。

- [ ] **Step 6: grep 确认无残留 hex（除图表/允许例外）**

Run: `rg -n "#[0-9a-fA-F]{3,8}\b" frontend/src/components/ProjectsOverviewTab.vue frontend/src/components/PlanTab.vue frontend/src/components/RiskTab.vue frontend/src/components/TierIntegrityTab.vue`
Expected: 无输出。

- [ ] **Step 7: 回归测试 + typecheck**

Run: `cd frontend && npm run test:run -- src/components/ProjectsOverviewTab.test.ts src/components/TierNodesTab.test.ts src/components/PlanTab.test.ts src/components/RiskTab.test.ts src/components/TierIntegrityTab.test.ts && npm run typecheck`
Expected: 全部通过（若某断言因前置档位列/全部档语义变化失败，按新结构更新断言;原测试通常传具体 tier，行为不变）。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ProjectsOverviewTab.vue frontend/src/components/TierNodesTab.vue frontend/src/components/PlanTab.vue frontend/src/components/RiskTab.vue frontend/src/components/TierIntegrityTab.vue frontend/src/components/*.test.ts
git commit -m "feat(D10): 5 个分析 tab 支持全部档 + token 化 + 档位列

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: AnalysisView 单页（tab 条 + 档位筛选 + 汇总条）

**Files:**
- Create: `frontend/src/views/AnalysisView.vue`
- Test: `frontend/src/views/AnalysisView.test.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend/src/views/AnalysisView.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AnalysisView from './AnalysisView.vue'
import { useDataStore } from '@/stores/data'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { tab: 'projects' } }),
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
}))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [{ projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 100000, actualPayment: 0, planMonth: '2026-02' }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('AnalysisView', () => {
  it('渲染 tab 条与档位筛选(默认全部)，projects tab 渲染总览', () => {
    seed()
    const w = mount(AnalysisView, { global: { stubs: { ProjectsOverviewTab: true, TierNodesTab: true, PlanTab: true, RiskTab: true, TierIntegrityTab: true } } })
    expect(w.text()).toContain('项目总览')
    expect(w.get('[data-test="seg-"]').exists()).toBe(true) // 档位"全部"选项 value=''
    expect(w.findComponent({ name: 'ProjectsOverviewTab' }).exists()).toBe(true)
  })
})
```

> 若 `[data-test="seg-"]`（空 value）选择器不便，改断言 `w.text()).toContain('全部')` 与 `w.text()).toContain('档位')`。

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/views/AnalysisView.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/views/AnalysisView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { tierSummaryBar } from '@/lib/dashboardStats'
import { fmtWan, pct } from '@/lib/format'
import { TIERS } from '@/nav'
import SegToggle from '@/components/SegToggle.vue'
import ProjectsOverviewTab from '@/components/ProjectsOverviewTab.vue'
import TierNodesTab from '@/components/TierNodesTab.vue'
import PlanTab from '@/components/PlanTab.vue'
import RiskTab from '@/components/RiskTab.vue'
import TierIntegrityTab from '@/components/TierIntegrityTab.vue'

const route = useRoute()
const data = useDataStore()
const filter = useFilterStore()
onMounted(() => { if (!data.data) data.load() })

const TABS = [
  { tab: 'projects', label: '项目总览' },
  { tab: 'nodes', label: '回款节点' },
  { tab: 'plan', label: '回款状态' },
  { tab: 'risk', label: '风险项目' },
  { tab: 'integrity', label: '数据质检' },
]
const tab = computed(() => String(route.params.tab || 'projects'))
const tier = ref('')
const TIER_OPTS = [{ value: '', label: '全部' }, ...TIERS.map((t) => ({ value: t.label, label: t.label }))]

const nodes = computed(() =>
  tier.value ? filter.filteredNodes.filter((n) => n.tier === tier.value) : filter.filteredNodes,
)
const summary = computed(() => tierSummaryBar(nodes.value))
const showSummaryBar = computed(() => tab.value === 'nodes')
const rateColor = (r: number) => (r >= 0.8 ? 'var(--c-paid)' : r >= 0.5 ? 'var(--c-pending)' : 'var(--danger)')
</script>

<template>
  <div class="analysis-view">
    <div class="av-bar">
      <nav class="av-tabs">
        <RouterLink
          v-for="t in TABS"
          :key="t.tab"
          :to="`/analysis/${t.tab}`"
          class="av-tab"
          :class="{ on: tab === t.tab }"
        >{{ t.label }}</RouterLink>
      </nav>
      <div class="av-ctl">
        <span class="av-label">档位</span>
        <SegToggle v-model="tier" :options="TIER_OPTS" />
      </div>
    </div>

    <div v-if="showSummaryBar" class="summary-bar">
      <div class="sb-item"><div class="sb-label">回款节点数</div><div class="sb-val">{{ summary.relatedNodeCount }}</div></div>
      <div class="sb-item"><div class="sb-label">已回款总金额(万)</div><div class="sb-val paid">{{ fmtWan(summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">待回款总金额(万)</div><div class="sb-val danger">{{ fmtWan(summary.totalExpected - summary.totalActual) }}</div></div>
      <div class="sb-item"><div class="sb-label">完成率</div><div class="sb-val" :style="{ color: rateColor(summary.rate) }">{{ pct(summary.rate) }}</div></div>
      <div class="sb-item"><div class="sb-label">加资源可提前</div><div class="sb-val accent">{{ summary.projCanAdvance }}</div></div>
      <div class="sb-item"><div class="sb-label">达到回款条件</div><div class="sb-val pending">{{ summary.projReachedCondition }}</div></div>
      <div class="sb-item"><div class="sb-label">延期</div><div class="sb-val danger">{{ summary.projDelayed }}</div></div>
    </div>

    <ProjectsOverviewTab v-if="tab === 'projects'" :tier="tier" />
    <TierNodesTab v-else-if="tab === 'nodes'" :tier="tier" />
    <PlanTab v-else-if="tab === 'plan'" :tier="tier" />
    <RiskTab v-else-if="tab === 'risk'" :tier="tier" />
    <TierIntegrityTab v-else-if="tab === 'integrity'" :tier="tier" />
    <div v-else class="av-stub">「{{ tab }}」建设中</div>
  </div>
</template>

<style scoped>
.analysis-view { padding: 12px 0; }
.av-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 0 16px 12px; }
.av-tabs { display: inline-flex; gap: 4px; flex-wrap: wrap; }
.av-tab { padding: 6px 14px; border-radius: 8px; font-size: var(--fs-2); color: var(--sub); text-decoration: none; }
.av-tab:hover { background: var(--card2); }
.av-tab.on { background: var(--accent); color: var(--on-accent); font-weight: 700; }
.av-ctl { display: flex; align-items: center; gap: 8px; }
.av-label { font-size: var(--fs-1); color: var(--mut); }
.summary-bar { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; padding: 0 16px 12px; }
.sb-item { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px; }
.sb-label { font-size: var(--fs-1); color: var(--mut); }
.sb-val { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
.sb-val.paid { color: var(--c-paid); }
.sb-val.danger { color: var(--danger); }
.sb-val.pending { color: var(--c-pending); }
.sb-val.accent { color: var(--accent); }
.av-stub { padding: 40px; text-align: center; color: var(--mut); }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/views/AnalysisView.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/AnalysisView.vue frontend/src/views/AnalysisView.test.ts
git commit -m "feat(D10): AnalysisView 业务分析单页（tab 条 + 档位筛选 + 汇总条）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 路由 + 侧边栏 + 删 TierView

**Files:**
- Modify: `frontend/src/router/index.ts`、`frontend/src/nav.ts`、`frontend/src/layout/AppSidebar.vue`
- Delete: `frontend/src/views/TierView.vue`、`frontend/src/views/TierView.test.ts`
- Test: `frontend/src/router/index.test.ts`、`frontend/src/layout/AppSidebar.test.ts`（更新断言）

- [ ] **Step 1: router**

`frontend/src/router/index.ts`：删 `import TierView` 与 `{ path:'/tier/:tab/:tier', … }`;加 `import AnalysisView from '@/views/AnalysisView.vue'` 与路由 `{ path: '/analysis/:tab', name: 'analysis', component: AnalysisView, meta: { title: '业务分析' } }`。

- [ ] **Step 2: nav.ts**

新增导出（保留 `TIER_TABS` 供 label 复用）：

```ts
export const ANALYSIS_TAB_LINKS: NavLink[] = [
  { label: '项目总览', to: '/analysis/projects' },
  { label: '回款节点', to: '/analysis/nodes' },
  { label: '回款状态', to: '/analysis/plan' },
  { label: '风险项目', to: '/analysis/risk' },
  { label: '数据质检', to: '/analysis/integrity' },
]
```

- [ ] **Step 3: AppSidebar.vue**

把「业务分析」section 的 `TIER_TABS × TIERS` 嵌套渲染整体替换为 5 个扁平链接：

```vue
      <div class="section">
        <div class="section-label">业务分析</div>
        <RouterLink v-for="link in ANALYSIS_TAB_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>
```

`<script setup>` import 改为：`import { OVERVIEW_LINKS, ANALYSIS_LINKS, ANALYSIS_TAB_LINKS, TOOL_LINKS } from '@/nav'`（去掉不再用的 `TIER_TABS, TIERS`）。

- [ ] **Step 4: 删 TierView**

```bash
git rm frontend/src/views/TierView.vue frontend/src/views/TierView.test.ts
```

- [ ] **Step 5: 更新路由/侧栏测试**

- `router/index.test.ts`：把 `/tier/...` 相关断言改为 `/analysis/projects` 解析存在、`analysis` 路由名;`tier` 路由不存在。
- `AppSidebar.test.ts`：业务分析断言由「项目总览」(仍在,作为 /analysis/projects 链接文本)保留;若断言了 `/tier` 或 TIERS 档位文本则移除。
Run: `cd frontend && npm run test:run -- src/router/index.test.ts src/layout/AppSidebar.test.ts`
至通过。

- [ ] **Step 6: 确认无残留引用**

Run: `rg -n "TierView|/tier/|TIER_TABS|from '@/nav'.*TIERS" frontend/src`
Expected: `TierView` 无;`/tier/` 无;`TIER_TABS`/`TIERS` 仅在 nav.ts 定义处或合理复用处（AppSidebar 已不用）。逐一确认无悬空引用，typecheck 通过。

- [ ] **Step 7: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 通过。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(D10): 路由/侧栏收成 /analysis/:tab 单页，删 /tier 与 TierView

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 全量验证 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`。

- [ ] **Step 2: 更新 PROGRESS.md**

- 顶部「最近更新」改为 2026-06-08（Plan D10 业务分析三档整合完成;**Phase D 全部完成**）。
- Phase D backlog 把 `- [ ] **D10** …` 改为 `- [x] **D10** …`，简述：AnalysisView(/analysis/:tab) tab 条 + 档位筛选(默认全部+3档) + 汇总条;5 个 tab 支持全部档(跨档,质检按档 concat)+token 化(补暗色)+档位列;filterOverviewProjects 空 tier=全部;删 /tier 路由+TierView,侧栏收成 5 链接。
- 「会话交接备注」新增 D10 段;并标注 **Phase D（前端重构）全部完成**，剩余为范围外的 C 打包 / A4 脚本健壮性（PROGRESS Backlog 另列）。

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs(D10): PROGRESS 记录业务分析整合完成（Phase D 收尾）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- 侧栏「业务分析」为 5 个 `/analysis/:tab` 链接;页内 tab 条 + 档位筛选(默认全部+3档);5 个 tab 支持全部档(跨档),数据质检全部档跨档 concat;表格全部档含档位列;全 token 化、暗色可用。
- `/tier` 路由与 TierView 删除且无残留引用;`filterOverviewProjects` 空 tier=全部有测试。
- 计算口径复用既有 lib 未改算法。
- `bash verify.sh` 全绿;`PROGRESS.md` 标记 Phase D 完成。
```
