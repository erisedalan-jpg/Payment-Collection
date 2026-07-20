# SP-C 成本分析页 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。步骤 checkbox 跟踪。

**Goal：** 把 `/insight/costdetail` 占位 stub 替换为成本分析页（4 计数 KPI + 超支分布堆叠柱 + L4 成本汇总表 + 项目成本明细表[13 列,多筛选/分页/导出]），超支三档用 `cost.剩余预算 ±5000` 忠实复刻对方。末任务收尾整个 /insight 整合(AboutView 文案 + riskGroups 注释)。

**Architecture：** 纯计算集中在新 `lib/costAnalysis.ts`(全 vitest)；`views/CostDetailView.vue` 装配，重度复用 MetricGrid/ChartBox/DataTable/StatusBadge/usePagedRows/exportRows。

**Tech Stack：** Vue3 + Vite + TS + Pinia + Element Plus + ECharts + Vitest。

## Global Constraints
- 无 emoji；样式仅 theme.css 令牌(成本状态用 StatusBadge;金额/计数/百分比/预算列挂 `.u-num`)；图色 `STATUS_*`；无散值(inline el-select/el-input/pager px 宽度沿用既有范式)。
- git 逐文件 add；commit message 结尾恒含 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不提交 docs/plan/spec/.superpowers/data；版本不动(V1.16.0)；不碰后端。
- TDD：先写/改测试→红→实现→绿→`cd frontend && npm run typecheck`→提交。命令 `cd frontend && npm run test:run -- <file>`。

## 复用锚点(实测)
- `MetricGrid.vue`(SP-B1)：props `items:{k,v,sub?,cls?}[]`、`colMin?`。
- `ChartBox.vue`：props `option`/`height?`；`echartsTheme` `STATUS_LIGHT/DARK={ok,warn,danger}`；`useSettingsStore().theme`。
- `DataTable.vue`：`DataColumn={key,label,width?,sortable?,formatter?,wrap?,fixed?,num?}`；props `columns/rows/showCount?/clickable?`；emit `row-click`；插槽 `#cell-<key>`(作用域 `{row,value}`)。
- `StatusBadge.vue`(SP-B2)：props `label?`、`tone?`(ok/warn/danger/urgent/mut)。
- `usePagedRows`(SP-B2)：`usePagedRows(sourceRef, size?)`→`{paged,currentPage,pageSize}`。
- `exportXlsx`：`exportRows(filename, rows)`。
- `useDataStore().data`：`.projects`、`.projectPmis`(`[pid].cost.{总预算,核算,剩余预算}`、`.status.项目类型`、`.team.L3部门`)。`Project.{orgL3_1,orgL4,projectManager,paymentPmis.contract}`。

## 文件结构
- 新 `lib/costAnalysis.ts` + 测试。
- 替换 `views/CostDetailView.vue`(stub→实页) + 新 `views/CostDetailView.test.ts`。
- 改 `views/AboutView.vue`(收尾) + 其测试(若有)；改 `lib/riskGroups.ts`(收尾注释)。

---

## Task 1: lib costAnalysis 核心(状态 + 行装配)

**Files:** Create `frontend/src/lib/costAnalysis.ts`; Test `frontend/src/lib/costAnalysis.test.ts`

**Interfaces:** Produces `CostStatus`、`isXs(id)`、`costStatusOf(rb, id)`、`CostRow`、`buildCostRows(projects, pmis)`。

- [ ] **Step 1: 写失败测试** — `frontend/src/lib/costAnalysis.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { isXs, costStatusOf, buildCostRows } from './costAnalysis'

describe('isXs / costStatusOf', () => {
  it('XS 前缀(大小写不敏感)', () => {
    expect(isXs('XS-001')).toBe(true)
    expect(isXs('xs001')).toBe(true)
    expect(isXs('WS-1')).toBe(false)
  })
  it('三档边界 + XS 强制未超支 + null→未超支', () => {
    expect(costStatusOf(-5000.01, 'WS1')).toBe('超支大于5k')
    expect(costStatusOf(-5000, 'WS1')).toBe('超支不足5k')   // −5000 归不足5k(排他下界)
    expect(costStatusOf(-0.01, 'WS1')).toBe('超支不足5k')
    expect(costStatusOf(0, 'WS1')).toBe('未超支')
    expect(costStatusOf(100, 'WS1')).toBe('未超支')
    expect(costStatusOf(null, 'WS1')).toBe('未超支')
    expect(costStatusOf(-99999, 'XS9')).toBe('未超支')        // XS 强制
  })
})

const projects = [
  { projectId: 'WS1', projectName: '甲', projectManager: '张', orgL4: 'D1', orgL3_1: 'L31' },
  { projectId: 'XS9', projectName: '售前', projectManager: '李', orgL4: 'D2', orgL3_1: '' },
] as any
const pmis = {
  WS1: { status: { 项目类型: '正常实施类' }, team: { L3部门: '交付一部' }, cost: { 总预算: 1000, 核算: 1200, 剩余预算: -6000 } },
  XS9: { status: { 项目类型: '售前服务类' }, team: { L3部门: '交付二部' }, cost: { 剩余预算: -8000 } },
} as any

describe('buildCostRows', () => {
  it('字段映射 + XS 标记 + 状态', () => {
    const rows = buildCostRows(projects, pmis)
    const a = rows.find((r) => r.projectId === 'WS1')!
    expect(a).toMatchObject({ projectName: '甲', projectType: '正常实施类', orgL3: '交付一部', orgL3_1: 'L31', orgL4: 'D1', manager: '张', status: '超支大于5k', totalBudget: 1000, actualCost: 1200, remaining: -6000, xs: false })
    const x = rows.find((r) => r.projectId === 'XS9')!
    expect(x).toMatchObject({ xs: true, status: '未超支' }) // XS 强制未超支
  })
})
```

- [ ] **Step 2: 跑红** — `cd frontend && npm run test:run -- src/lib/costAnalysis.test.ts` → FAIL。

- [ ] **Step 3: 实现** — `frontend/src/lib/costAnalysis.ts`：

```ts
import type { Project, ProjectPmis } from '@/types/analysis'

export type CostStatus = '超支大于5k' | '超支不足5k' | '未超支'

export function isXs(projectId: string): boolean {
  return (projectId ?? '').toUpperCase().startsWith('XS')
}

/** 成本状态三档(忠实对方):XS 强制未超支;null→0;rb<-5000 大于5k;-5000≤rb<0 不足5k;rb≥0 未超支。 */
export function costStatusOf(remainingBudget: number | null | undefined, projectId: string): CostStatus {
  if (isXs(projectId)) return '未超支'
  const rb = remainingBudget == null ? 0 : Number(remainingBudget)
  if (rb < -5000) return '超支大于5k'
  if (rb < 0) return '超支不足5k'
  return '未超支'
}

export interface CostRow {
  projectId: string; projectName: string; projectType: string
  orgL3: string; orgL3_1: string; orgL4: string; manager: string
  amount: number; status: CostStatus
  totalBudget: number; actualCost: number; remaining: number; xs: boolean
}

/** 全部主域项目装配成本行(明细表用;XS 保留并标记)。 */
export function buildCostRows(projects: Project[], pmis: Record<string, ProjectPmis>): CostRow[] {
  return projects.map((p) => {
    const m = (pmis[p.projectId] ?? {}) as any
    const cost = m.cost ?? {}
    const rb = cost.剩余预算
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      projectType: (m.status?.项目类型 ?? '').trim(),
      orgL3: (m.team?.L3部门 ?? '').trim(),
      orgL3_1: (p.orgL3_1 ?? '').trim(),
      orgL4: (p.orgL4 ?? '').trim(),
      manager: (p.projectManager ?? '').trim(),
      amount: Number(p.paymentPmis?.contract ?? 0),
      status: costStatusOf(rb, p.projectId),
      totalBudget: Number(cost.总预算 ?? 0),
      actualCost: Number(cost.核算 ?? 0),
      remaining: Number(rb ?? 0),
      xs: isXs(p.projectId),
    }
  })
}
```

- [ ] **Step 4: 跑绿 + typecheck** — `cd frontend && npm run test:run -- src/lib/costAnalysis.test.ts && npm run typecheck` → PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/costAnalysis.ts frontend/src/lib/costAnalysis.test.ts
git commit -m "feat(cost): lib 成本状态三档 + 行装配 (SP-C)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: lib 聚合(KPI + L4 分布 + L4 汇总)

**Files:** Modify `frontend/src/lib/costAnalysis.ts`(追加); Test 追加

**Interfaces:** Consumes `CostRow`。Produces `costKpis`/`CostKpis`、`costL4Dist`/`CostL4Dist`、`costL4Summary`/`CostL4Summary`(均剔 XS)。

- [ ] **Step 1: 追加失败测试** — import 追加 + describe：

```ts
import { costKpis, costL4Dist, costL4Summary } from './costAnalysis'

function cr(o: Partial<any> = {}): any {
  return { projectId: 'W', projectName: 'x', projectType: '', orgL3: '', orgL3_1: '', orgL4: 'D1', manager: '', amount: 0, status: '未超支', totalBudget: 0, actualCost: 0, remaining: 0, xs: false, ...o }
}

describe('costKpis / costL4Dist / costL4Summary(均剔 XS)', () => {
  const rows = [
    cr({ orgL4: 'B', status: '未超支' }),
    cr({ orgL4: 'B', status: '超支不足5k' }),
    cr({ orgL4: 'A', status: '超支大于5k' }),
    cr({ orgL4: 'A', status: '超支大于5k' }),
    cr({ orgL4: 'A', status: 'XS忽略', xs: true }), // XS→不计
  ]
  it('KPI 剔 XS 计数', () => {
    expect(costKpis(rows)).toEqual({ total: 4, normal: 1, under5k: 1, over5k: 2 })
  })
  it('L4 分布按 orgL4 升序、两档', () => {
    expect(costL4Dist(rows)).toEqual([
      { orgL4: 'A', under5k: 0, over5k: 2 },
      { orgL4: 'B', under5k: 1, over5k: 0 },
    ])
  })
  it('L4 汇总含占比(大于5k/总数)', () => {
    const s = costL4Summary(rows)
    expect(s.find((x) => x.orgL4 === 'A')).toMatchObject({ total: 2, over5k: 2, over5kRatio: 100 })
    expect(s.find((x) => x.orgL4 === 'B')).toMatchObject({ total: 2, normal: 1, under5k: 1, over5k: 0, over5kRatio: 0 })
  })
})
```

- [ ] **Step 2: 跑红** — FAIL。

- [ ] **Step 3: 追加实现** — 末尾追加：

```ts
export interface CostKpis { total: number; normal: number; under5k: number; over5k: number }
export function costKpis(rows: CostRow[]): CostKpis {
  const k: CostKpis = { total: 0, normal: 0, under5k: 0, over5k: 0 }
  for (const r of rows) {
    if (r.xs) continue
    k.total++
    if (r.status === '未超支') k.normal++
    else if (r.status === '超支不足5k') k.under5k++
    else if (r.status === '超支大于5k') k.over5k++
  }
  return k
}

export interface CostL4Dist { orgL4: string; under5k: number; over5k: number }
export function costL4Dist(rows: CostRow[]): CostL4Dist[] {
  const m: Record<string, CostL4Dist> = {}
  for (const r of rows) {
    if (r.xs) continue
    const d = r.orgL4 || '未知'
    if (!m[d]) m[d] = { orgL4: d, under5k: 0, over5k: 0 }
    if (r.status === '超支不足5k') m[d].under5k++
    else if (r.status === '超支大于5k') m[d].over5k++
  }
  return Object.values(m).sort((a, b) => a.orgL4.localeCompare(b.orgL4))
}

export interface CostL4Summary { orgL4: string; total: number; normal: number; under5k: number; over5k: number; over5kRatio: number }
export function costL4Summary(rows: CostRow[]): CostL4Summary[] {
  const m: Record<string, CostL4Summary> = {}
  for (const r of rows) {
    if (r.xs) continue
    const d = r.orgL4 || '未知'
    if (!m[d]) m[d] = { orgL4: d, total: 0, normal: 0, under5k: 0, over5k: 0, over5kRatio: 0 }
    m[d].total++
    if (r.status === '未超支') m[d].normal++
    else if (r.status === '超支不足5k') m[d].under5k++
    else if (r.status === '超支大于5k') m[d].over5k++
  }
  return Object.values(m)
    .map((s) => ({ ...s, over5kRatio: s.total > 0 ? +((s.over5k / s.total) * 100).toFixed(1) : 0 }))
    .sort((a, b) => a.orgL4.localeCompare(b.orgL4))
}
```

- [ ] **Step 4: 跑绿 + typecheck** — PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/lib/costAnalysis.ts frontend/src/lib/costAnalysis.test.ts
git commit -m "feat(cost): lib KPI/L4分布/L4汇总(剔XS) (SP-C)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: CostDetailView 上半(KPI + 超支分布图 + L4 汇总表)

**Files:** Modify `frontend/src/views/CostDetailView.vue`(替换 stub); Test `frontend/src/views/CostDetailView.test.ts`(新建)

**Interfaces:** Consumes Task 1/2 lib、MetricGrid、ChartBox、DataTable、`STATUS_*`、`useDataStore`/`useSettingsStore`。Produces 页面骨架 + KPI + 图 + L4 表。明细表(含筛选)在 Task 4 追加。

- [ ] **Step 1: 写失败测试** — `frontend/src/views/CostDetailView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import CostDetailView from './CostDetailView.vue'
import ChartBox from '@/charts/ChartBox.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import { useDataStore } from '@/stores/data'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    projectOverview: { projects: [], columns: [] }, naguanMap: {}, naguanExclude: {}, followupRecords: {},
    projects: [
      { projectId: 'WS1', projectName: '甲', projectManager: '张', orgL4: 'D1', orgL3_1: 'L31', paymentPmis: { contract: 2000000 } },
      { projectId: 'WS2', projectName: '乙', projectManager: '李', orgL4: 'D1', orgL3_1: 'L31', paymentPmis: { contract: 500000 } },
      { projectId: 'XS9', projectName: '售前', projectManager: '王', orgL4: 'D2', orgL3_1: '', paymentPmis: { contract: 0 } },
    ],
    projectPmis: {
      WS1: { status: { 项目类型: '正常实施类' }, team: { L3部门: '一部' }, cost: { 总预算: 1000, 核算: 1200, 剩余预算: -8000 } },
      WS2: { status: { 项目类型: '正常实施类' }, team: { L3部门: '一部' }, cost: { 总预算: 1000, 核算: 900, 剩余预算: 100 } },
      XS9: { status: { 项目类型: '售前服务类' }, team: { L3部门: '二部' }, cost: { 剩余预算: -9999 } },
    },
  } as any
}

const opts = { global: { plugins: [ElementPlus], stubs: { VChart: true } } }

describe('CostDetailView 上半', () => {
  it('标题 + 4 KPI(剔 XS:总数2/未超支1/不足5k0/大于5k1)', () => {
    seed()
    const w = mount(CostDetailView, opts)
    expect(w.text()).toContain('成本分析')
    const items = w.findComponent(MetricGrid).props('items') as any[]
    expect(items.map((i) => i.k)).toEqual(['成本统计项目数', '未超支', '超支不足5K', '超支大于5K'])
    expect(items.find((i) => i.k === '成本统计项目数').v).toBe('2')
    expect(items.find((i) => i.k === '超支大于5K').v).toBe('1')
  })
  it('渲染超支分布 ChartBox + L4 汇总表(行=D1)', () => {
    seed()
    const w = mount(CostDetailView, opts)
    expect(w.findComponent(ChartBox).exists()).toBe(true)
    expect(w.text()).toContain('D1')
  })
})
```

- [ ] **Step 2: 跑红** — FAIL（CostDetailView 仍 stub）。

- [ ] **Step 3: 实现(替换整个 CostDetailView.vue)** — `frontend/src/views/CostDetailView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import { useSettingsStore } from '@/stores/settings'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildCostRows, costKpis, costL4Dist, costL4Summary } from '@/lib/costAnalysis'
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'
import MetricGrid from '@/components/MetricGrid.vue'
import ChartBox from '@/charts/ChartBox.vue'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'

const data = useDataStore()
const settings = useSettingsStore()
onMounted(() => { if (!data.data) data.load() })

const sc = computed(() => (settings.theme === 'dark' ? STATUS_DARK : STATUS_LIGHT))
const rows = computed(() => buildCostRows(
  (data.data?.projects ?? []) as Project[],
  (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
))

const kpi = computed(() => costKpis(rows.value))
const kpiItems = computed(() => {
  const k = kpi.value
  return [
    { k: '成本统计项目数', v: String(k.total) },
    { k: '未超支', v: String(k.normal), cls: 'ok' },
    { k: '超支不足5K', v: String(k.under5k), cls: 'warn' },
    { k: '超支大于5K', v: String(k.over5k), cls: 'danger' },
  ]
})

const dist = computed(() => costL4Dist(rows.value))
const distOption = computed(() => {
  const d = dist.value, s = sc.value
  const lbl = { show: true, formatter: (p: any) => p.value || '' }
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['超支不足5k', '超支大于5k'], bottom: 0 },
    grid: { left: 40, right: 20, top: 10, bottom: 50 },
    xAxis: { type: 'category', data: d.map((x) => x.orgL4), axisLabel: { interval: 0, rotate: d.length > 6 ? 30 : 0, fontSize: 11 } },
    yAxis: { type: 'value', name: '超支项目数' },
    series: [
      { name: '超支不足5k', type: 'bar', stack: 't', color: s.warn, label: lbl, data: d.map((x) => x.under5k) },
      { name: '超支大于5k', type: 'bar', stack: 't', color: s.danger, label: lbl, data: d.map((x) => x.over5k) },
    ],
  }
})

const l4Rows = computed(() => costL4Summary(rows.value))
const L4_COLS: DataColumn[] = [
  { key: 'orgL4', label: 'L4部门', width: 140 },
  { key: 'total', label: '项目总数', width: 90, num: true },
  { key: 'normal', label: '未超支', width: 90, num: true },
  { key: 'under5k', label: '超支不足5k', width: 110, num: true },
  { key: 'over5k', label: '超支大于5k', width: 110, num: true },
  { key: 'over5kRatio', label: '超支占比', width: 100, num: true, formatter: (v) => v + '%' },
]
</script>

<template>
  <div class="cd-view">
    <h2 class="cd-title">成本分析</h2>

    <div v-if="!rows.length" class="cd-empty">暂无主域成本数据——请在「数据管理」提供 PMIS 文件后点「更新数据」。</div>

    <template v-else>
      <MetricGrid :items="kpiItems" :col-min="'160px'" />
      <div class="cd-grid2">
        <div class="cd-card"><div class="cd-card-h">超支项目分布(按 L4,剔 XS)</div><ChartBox :option="distOption" height="260px" /></div>
        <div class="cd-card"><div class="cd-card-h">L4 部门成本情况汇总</div><DataTable :columns="L4_COLS" :rows="l4Rows" :show-count="false">
          <template #cell-over5kRatio="{ row, value }"><span class="u-num" :class="row.over5k > 0 ? 'cd-red' : 'cd-green'">{{ value }}</span></template>
        </DataTable></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cd-view { padding: var(--sp-4); }
.cd-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.cd-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: var(--gap-card); }
.cd-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--sp-3); margin-bottom: var(--sp-3); }
.cd-card-h { font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-2); }
.cd-red { color: var(--danger); font-weight: 600; }
.cd-green { color: var(--ok); }
.cd-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
</style>
```

- [ ] **Step 4: 跑绿 + typecheck** — `cd frontend && npm run test:run -- src/views/CostDetailView.test.ts && npm run typecheck` → PASS。

- [ ] **Step 5: Commit**
```bash
git add frontend/src/views/CostDetailView.vue frontend/src/views/CostDetailView.test.ts
git commit -m "feat(cost): CostDetailView 上半 KPI+超支分布图+L4汇总表 (SP-C)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: CostDetailView 下半(明细表 + 多筛选 + 分页 + 导出)

**Files:** Modify `frontend/src/views/CostDetailView.vue`(追加); Test `frontend/src/views/CostDetailView.test.ts`(追加)

**Interfaces:** Consumes `usePagedRows`、`exportRows`、`StatusBadge`、`useRouter`、Task 1 `CostRow`。

- [ ] **Step 1: 追加失败测试** — import 追加 `import DataTable from '@/components/DataTable.vue'` 与 `import StatusBadge from '@/components/StatusBadge.vue'`(若未引)，新增 describe：

```ts
describe('CostDetailView 明细表', () => {
  it('明细表含全部 3 项目(XS 保留);L4 多选筛选缩小', async () => {
    seed()
    const w = mount(CostDetailView, opts)
    // 明细 DataTable 是第二个(L4 汇总是第一个)
    const tables = w.findAllComponents({ name: 'DataTable' })
    const detail = tables[tables.length - 1]
    expect((detail.props('rows') as any[]).length).toBe(3)
    ;(w.vm as any).fL4 = ['D2']
    await w.vm.$nextTick()
    expect((detail.props('rows') as any[]).map((r: any) => r.projectId)).toEqual(['XS9'])
  })
  it('成本状态多选 + 导出按钮 + 序号列', async () => {
    seed()
    const w = mount(CostDetailView, opts)
    ;(w.vm as any).fStatus = ['超支大于5k']
    await w.vm.$nextTick()
    const tables = w.findAllComponents({ name: 'DataTable' })
    const detail = tables[tables.length - 1]
    expect((detail.props('rows') as any[]).map((r: any) => r.projectId)).toEqual(['WS1'])
    expect((detail.props('rows') as any[])[0]._seq).toBe(1)
    expect(w.find('[data-test="cost-export"]').exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑红** — FAIL（明细表/`fL4`/`fStatus`/`_seq` 未定义）。

- [ ] **Step 3: 追加实现**

3a. `<script setup>` import 段补充：
```ts
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePagedRows } from '@/lib/usePagedRows'
import { exportRows } from '@/lib/exportXlsx'
import StatusBadge from '@/components/StatusBadge.vue'
```
> 说明：`computed`/`onMounted` 已在 Task 3 的 vue import；把 `ref` 并入该行(`import { computed, onMounted, ref } from 'vue'`)。`DataTable`/`DataColumn` 已在 Task 3 import。

3b. `<script setup>` 末尾追加(明细表状态/筛选/分页/导出)：
```ts
const router = useRouter()
const STATUS_OPTS = ['未超支', '超支不足5k', '超支大于5k']
const fL3 = ref<string[]>([])
const fL3_1 = ref<string[]>([])
const fL4 = ref<string[]>([])
const fStatus = ref<string[]>([])
const fType = ref<string[]>([])
const fManager = ref('')
const fKw = ref('')

const uniq = (key: 'orgL3' | 'orgL3_1' | 'orgL4' | 'projectType') =>
  computed(() => [...new Set(rows.value.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b)))
const l3Opts = uniq('orgL3'); const l31Opts = uniq('orgL3_1'); const l4Opts = uniq('orgL4'); const typeOpts = uniq('projectType')

const TONE: Record<string, string> = { 未超支: 'ok', 超支不足5k: 'warn', 超支大于5k: 'danger' }
const filtered = computed(() => rows.value.filter((r) =>
  (fL3.value.length === 0 || fL3.value.includes(r.orgL3)) &&
  (fL3_1.value.length === 0 || fL3_1.value.includes(r.orgL3_1)) &&
  (fL4.value.length === 0 || fL4.value.includes(r.orgL4)) &&
  (fStatus.value.length === 0 || fStatus.value.includes(r.status)) &&
  (fType.value.length === 0 || fType.value.includes(r.projectType)) &&
  (!fManager.value || r.manager.includes(fManager.value)) &&
  (!fKw.value || r.projectId.includes(fKw.value) || r.projectName.includes(fKw.value)),
).sort((a, b) => a.orgL3.localeCompare(b.orgL3) || a.orgL3_1.localeCompare(b.orgL3_1) || a.orgL4.localeCompare(b.orgL4)))
const { paged, currentPage, pageSize } = usePagedRows(filtered, 20)
const pagedSeq = computed(() => paged.value.map((r, i) => ({ ...r, _seq: (currentPage.value - 1) * pageSize.value + i + 1 })))

const yuan = (v: any) => '¥' + Number(v || 0).toLocaleString('zh-CN')
const DETAIL_COLS: DataColumn[] = [
  { key: '_seq', label: '序号', width: 60, num: true },
  { key: 'projectId', label: '项目编号', width: 150 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'projectType', label: '类型', width: 100 },
  { key: 'orgL3', label: 'L3部门', width: 110 },
  { key: 'orgL3_1', label: 'L3-1部门', width: 110 },
  { key: 'orgL4', label: 'L4部门', width: 110 },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'amount', label: '项目金额', width: 130, num: true, formatter: yuan },
  { key: 'status', label: '成本状态', width: 110 },
  { key: 'totalBudget', label: '总预算(元)', width: 130, num: true, formatter: yuan },
  { key: 'actualCost', label: '已核算(元)', width: 130, num: true, formatter: yuan },
  { key: 'remaining', label: '剩余预算(元)', width: 140, num: true, formatter: yuan },
]
function reset() { fL3.value = []; fL3_1.value = []; fL4.value = []; fStatus.value = []; fType.value = []; fManager.value = ''; fKw.value = '' }
function onExport() {
  exportRows('项目成本明细.xlsx', filtered.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 项目类型: r.projectType, L3部门: r.orgL3, 'L3-1部门': r.orgL3_1,
    L4部门: r.orgL4, 项目经理: r.manager, 项目金额: r.amount, 成本状态: r.status,
    总预算: r.totalBudget, 已核算: r.actualCost, 剩余预算: r.remaining,
  })))
}
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
```

3c. 模板 `<template v-else>` 内、`.cd-grid2` 之后追加明细区：
```html
      <div class="cd-card">
        <div class="cd-card-h">项目成本明细(按 L4 组织排序)</div>
        <div class="cd-bar">
          <el-select v-model="fL3" size="small" multiple collapse-tags clearable placeholder="L3部门" style="width: 140px"><el-option v-for="o in l3Opts" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="fL3_1" size="small" multiple collapse-tags clearable placeholder="L3-1部门" style="width: 140px"><el-option v-for="o in l31Opts" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="fL4" size="small" multiple collapse-tags clearable placeholder="L4部门" style="width: 140px"><el-option v-for="o in l4Opts" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="fStatus" size="small" multiple collapse-tags clearable placeholder="成本状态" style="width: 150px"><el-option v-for="o in STATUS_OPTS" :key="o" :value="o" :label="o" /></el-select>
          <el-select v-model="fType" size="small" multiple collapse-tags clearable placeholder="项目类型" style="width: 140px"><el-option v-for="o in typeOpts" :key="o" :value="o" :label="o" /></el-select>
          <el-input v-model="fManager" size="small" placeholder="项目经理" style="width: 110px" />
          <el-input v-model="fKw" size="small" placeholder="编号/名称" style="width: 130px" />
          <button class="cd-btn" @click="reset">重置</button>
          <button class="cd-btn" data-test="cost-export" @click="onExport">导出Excel</button>
        </div>
        <div class="cd-scroll">
          <DataTable :columns="DETAIL_COLS" :rows="pagedSeq" :show-count="false" clickable @row-click="onRow">
            <template #cell-projectId="{ value }"><span class="cd-link">{{ value }}</span></template>
            <template #cell-status="{ value }"><StatusBadge :label="value" :tone="TONE[value]" /></template>
            <template #cell-remaining="{ row, value }"><span class="u-num" :class="row.remaining < 0 ? 'cd-red' : 'cd-green'">{{ yuan(value) }}</span></template>
          </DataTable>
        </div>
        <div class="cd-pager">
          <span class="u-num">共 {{ filtered.length }} 条</span>
          <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
        </div>
      </div>
```

3d. `<style scoped>` 追加：
```css
.cd-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.cd-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.cd-btn:hover { background: var(--bg); color: var(--accent); }
.cd-scroll { overflow-x: auto; }
.cd-link { color: var(--accent); cursor: pointer; }
.cd-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
```

- [ ] **Step 4: 跑绿 + typecheck** — PASS（含 Task 3 用例）。

- [ ] **Step 5: 全套件 + 构建** — `cd frontend && npm run test:run && npm run typecheck && npm run build` → 全绿。

- [ ] **Step 6: Commit**
```bash
git add frontend/src/views/CostDetailView.vue frontend/src/views/CostDetailView.test.ts
git commit -m "feat(cost): CostDetailView 下半 明细表+多筛选+分页+导出 (SP-C)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: /insight 整合收尾(AboutView 文案 + riskGroups 注释)

**Files:** Modify `frontend/src/views/AboutView.vue`; Modify `frontend/src/lib/riskGroups.ts`; Test：若 `frontend/src/views/AboutView.test.ts` 存在且断言被改文案，相应更新。

**Interfaces:** 无（纯文案/注释订正,反映 /insight 整合后的 IA）。

- [ ] **Step 1: 先查是否有 AboutView 测试** — Run: `cd frontend && npm run test:run -- src/views/AboutView.test.ts`
  - 若"no test files found"或无断言冲突：跳过测试改动。
  - 若存在且断言旧文案(如"回款分析:多维看板")：记下需同步更新的断言。

- [ ] **Step 2: 改 `AboutView.vue` 的 SECTIONS** — 把 `const SECTIONS = [...]` 整体替换为：

```ts
const SECTIONS = [
  { title: '项目域', items: [
    '项目总览:KPI 条 / 健康度总览 / 回款重点带 / 风险焦点 / 动态流',
    '项目清单:多条件筛选 + 全列搜索,行点击下钻项目详情',
    '项目详情:回款 / 进度里程碑 / 风险 / 预算核算 / 原项目五 Tab + 动态时间线',
    '项目动态:快照 diff 事件流 + 周期对比(上次同步 / 上周 / 上月)',
  ] },
  { title: '项目分析(五页)', items: [
    '项目多维分析:11 维 × 6 指标排名 / 交叉 / 透视,可下钻',
    '里程碑管理:5 状态 KPI + 到期提醒 / 终验完成 / 部门异常·合规率 / 节点分布(下钻) + 延期清单 / 到期提醒 / 在建计划三明细表',
    '成本分析:预算超支预警(计数 KPI + 超支分布柱 + L4 汇总 + 项目成本明细)',
    '回款多维分析:多维看板(排名 / 交叉 / 透视),可下钻',
    '回款日历:双月视图 / 年度热力图 / 到期提醒',
  ] },
  { title: '回款域', items: [
    '回款总览:核心指标 / 档位进度 / 服务组排名 / 月度趋势(FilterBar 联动)',
    '回款项目 / 回款节点 / 回款进度 / 风险项目:分维明细看板',
    '临期跟进:30/15/7 天临期进度 + 跟进记录云文档回写',
    '回款台账:跨档位统一视图,行内下钻',
  ] },
  { title: '工具组', items: [
    '数据管理:云同步 / 离线导入 / PMIS 下载上传 / 项目域文件上传 / 更新数据',
    '数据治理:全源健康检查(结论横幅 / 源状态卡 / 分级告警与导出)',
  ] },
]
```

- [ ] **Step 3: 改 `riskGroups.ts` 第 2 行注释** — 把 `被 /calendar、/ledger 共享消费（回款节点级）。` 改为 `被 /insight/calendar、/ledger 共享消费（回款节点级）。`（仅注释,代码不动）。

- [ ] **Step 4: 若 Step 1 发现 AboutView 测试断言旧文案** — 同步更新断言(如把 `'回款分析'`/`'多维看板'` 改为新文案对应词)。否则跳过。

- [ ] **Step 5: 跑测试 + typecheck** — Run: `cd frontend && npm run test:run -- src/views/AboutView.test.ts && npm run typecheck`（无 AboutView 测试则 `npm run typecheck` 即可）。Expected: PASS。

- [ ] **Step 6: Commit**
```bash
git add frontend/src/views/AboutView.vue frontend/src/lib/riskGroups.ts
git commit -m "docs(about): About 文案 + riskGroups 注释 反映 /insight 整合后 IA (SP-C 收尾)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
（若同步改了 AboutView.test.ts,一并 `git add` 该文件。）

---

## 收尾验证(控制器执行)
- [ ] `bash verify.sh` 全绿。
- [ ] 冒烟：`/insight/costdetail` —— 4 KPI(剔 XS 基数)、超支分布柱、L4 汇总(占比染色)、明细表 5 多选+经理+关键词筛选、分页、导出、剩余预算染色、链接跳详情；XS 项目在明细可见但不入 KPI/图/汇总。`/about` 文案反映新 IA。控制台无报错。

## Self-Review(对照 spec §2-§5)
- 覆盖：costStatusOf 三档+XS+null(T1)；buildCostRows 字段映射(T1)；costKpis/costL4Dist/costL4Summary 剔 XS+占比+排序(T2)；KPI+图+L4 表(T3)；明细 13 列+5 多选+经理/关键词+分页+导出+序号+染色(T4)；AboutView 文案+riskGroups 注释收尾(T5)。
- 类型/命名一致：`CostStatus`/`CostRow`/`CostKpis`/`CostL4Dist`/`CostL4Summary` 跨任务一致；`buildCostRows`(projects,pmis)↔view；`usePagedRows(filtered,20)`→`{paged,currentPage,pageSize}`；`StatusBadge{label,tone}`；TONE 映射 ok/warn/danger；导出键中文↔列。
- 硬约束：成本状态 StatusBadge、金额/预算/计数/百分比挂 `.u-num`、图色 STATUS_*、无散值(图标签无显式色)、无 emoji、逐文件 add+trailer、不碰后端/version。
