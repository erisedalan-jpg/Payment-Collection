# P1 回款域重构（V2.6.0）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）or superpowers:executing-plans 逐任务实现本计划。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 重做 /payment 总览、/payment/projects、/payment/nodes，删除 /payment/plan、/payment/risk、/ledger，统一回款域口径并对齐 /projects 表格能力。

**Architecture:** 纯前端改动（零后端 / 零 schema / 零依赖 / 无需点「更新数据」）。项目数卡口径由"有回款活动 557"改为"在建主域整体 638"并显式化 81 个无回款阶段项目；下钻抽屉全局加宽并对无节点项目特殊处理；回款项目/节点两页复刻 CostDetailView 的 externalSort + 列头筛选 + 选列 + 导出范式，并接入统一标签筛选（含「无标签」）。

**Tech Stack:** Vue3 `<script setup>` + TS + Pinia + Element Plus + Vitest；复用 DataTable / useColumnPrefs / ColumnFilter+crossFilter / usePagedRows / exportXlsx / projectTags。

## Global Constraints（每个任务隐含遵守）

- **不使用任何 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`。
- 版本号单一来源 `frontend/src/version.ts`，只改此处；本期目标版本 **V2.6.0**。
- 金额/百分比/KPI/表格数字列必须挂 `.u-num`（DataTable 传 `num:true` 自动挂）。
- 只引用设计令牌（`styles/theme.css`），不手写散值（图形尺寸像素例外）。
- 交互件五态齐全，可点元素用 hover 手型/`--hover-tint`，遵守 `:focus-visible`。
- 改了计算逻辑先补/改测试再改实现；声称完成前 `bash verify.sh` 全绿。
- **commit 仅在用户要求时**；提交信息尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 不扩大改动面；不动本期外的既有未提交工作树改动（.gitignore、deploy 文档、docs/、pmisdata/、yitian/、demo.html、.claude/）。
- 回款完成率/达成率口径不变（Σ流水净额 ÷ Σ合同）；本期不碰任何金额口径。

## 文件结构（P1 落点）

- 新建：`frontend/src/lib/tagFilter.ts`、`frontend/src/components/TagFilterSelect.vue`、`frontend/src/components/NoStageProjectsTable.vue`
- 修改：`frontend/src/lib/payDashboard.ts`、`frontend/src/lib/paymentPmis.ts`、`frontend/src/components/DashMetrics.vue`、`frontend/src/components/PaymentL4Table.vue`、`frontend/src/views/DashboardView.vue`、`frontend/src/views/PayProjectsView.vue`、`frontend/src/views/PayNodesView.vue`、`frontend/src/components/ProjectDetailDrawer.vue`、`frontend/src/router/index.ts`、`frontend/src/nav.ts`、`frontend/src/lib/pageAccess.ts`、`frontend/src/layout/AppSidebar.vue`、`frontend/src/version.ts`、`PROGRESS.md`
- 删除：`frontend/src/views/PayPlanView.vue`、`frontend/src/views/PayRiskView.vue`、`frontend/src/views/LedgerView.vue`、`frontend/src/components/LedgerTable.vue`（执行期确认后者仅被 LedgerView 引用）
- 测试：随各任务新建/改 `*.test.ts`

---

### Task 1: 统一标签筛选构件（tagFilter.ts + TagFilterSelect.vue）

**Files:**
- Create: `frontend/src/lib/tagFilter.ts`
- Create: `frontend/src/components/TagFilterSelect.vue`
- Test: `frontend/src/lib/tagFilter.test.ts`

**Interfaces:**
- Produces：`NO_TAG_VALUE: string`、`tagFilterOptions(activeTags: {name:string}[]): {value:string;label:string}[]`、`tagMatch(projectTags: string[], selected: string[]): boolean`；组件 `TagFilterSelect`（`v-model` 绑 `string[]`）。
- Consumes（后续任务）：PayProjectsView / PayNodesView（P1）、/projects、/insight、costdetail、milestone（P3）。

- [ ] **Step 1: 写失败测试** `frontend/src/lib/tagFilter.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { NO_TAG_VALUE, tagFilterOptions, tagMatch } from './tagFilter'

describe('tagFilter', () => {
  it('选项含无标签在首位 + 各启用标签', () => {
    const opts = tagFilterOptions([{ name: 'A' }, { name: 'B' }])
    expect(opts[0]).toEqual({ value: NO_TAG_VALUE, label: '无标签' })
    expect(opts.slice(1)).toEqual([{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }])
  })
  it('未选=全部通过', () => {
    expect(tagMatch(['A'], [])).toBe(true)
    expect(tagMatch([], [])).toBe(true)
  })
  it('选无标签=只纳入无标签项目', () => {
    expect(tagMatch([], [NO_TAG_VALUE])).toBe(true)
    expect(tagMatch(['A'], [NO_TAG_VALUE])).toBe(false)
  })
  it('选标签=OR 命中任一', () => {
    expect(tagMatch(['A', 'C'], ['A', 'B'])).toBe(true)
    expect(tagMatch(['C'], ['A', 'B'])).toBe(false)
  })
  it('无标签 + 标签 并集', () => {
    expect(tagMatch([], [NO_TAG_VALUE, 'A'])).toBe(true)
    expect(tagMatch(['A'], [NO_TAG_VALUE, 'A'])).toBe(true)
    expect(tagMatch(['B'], [NO_TAG_VALUE, 'A'])).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败** `cd frontend && npx vitest run src/lib/tagFilter.test.ts`　Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现** `frontend/src/lib/tagFilter.ts`

```ts
// 统一标签筛选:一个多选控件,选项 = [无标签] + 启用标签,语义 OR/并集。
// 用 sentinel 值避免与真实标签"无标签"重名。各页本地态,不联动;不影响全局 filter.ts 的"按标签排除(统计)"。
export const NO_TAG_VALUE = '__NO_TAG__'

export function tagFilterOptions(activeTags: { name: string }[]): { value: string; label: string }[] {
  return [{ value: NO_TAG_VALUE, label: '无标签' }, ...activeTags.map((t) => ({ value: t.name, label: t.name }))]
}

/** selected 空→全部;否则 (选了无标签 且 项目无标签) 或 项目某标签∈selected。 */
export function tagMatch(projectTags: string[], selected: string[]): boolean {
  if (!selected.length) return true
  if (selected.includes(NO_TAG_VALUE) && projectTags.length === 0) return true
  return projectTags.some((t) => selected.includes(t))
}
```

- [ ] **Step 4: 实现组件** `frontend/src/components/TagFilterSelect.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useProjectTagsStore } from '@/stores/projectTags'
import { tagFilterOptions } from '@/lib/tagFilter'

const model = defineModel<string[]>({ default: () => [] })
const tags = useProjectTagsStore()
const options = computed(() => tagFilterOptions(tags.activeTags))
</script>

<template>
  <el-select v-model="model" multiple collapse-tags clearable placeholder="标签筛选"
    size="small" style="min-width: 160px" data-test="tag-filter">
    <el-option v-for="o in options" :key="o.value" :label="o.label" :value="o.value" />
  </el-select>
</template>
```

> 注：`useProjectTagsStore` 的实际导出名执行期以 `stores/projectTags.ts` 为准（store id `projectTags`）。`activeTags` 形如 `{name,disabled?}[]` 已过滤 disabled。

- [ ] **Step 5: 运行测试通过** `cd frontend && npx vitest run src/lib/tagFilter.test.ts`　Expected: PASS

- [ ] **Step 6: typecheck** `cd frontend && npm run typecheck`　Expected: 通过

- [ ] **Step 7: Commit**（若用户已授权提交，否则跳过）

```bash
git add frontend/src/lib/tagFilter.ts frontend/src/lib/tagFilter.test.ts frontend/src/components/TagFilterSelect.vue
git commit -m "feat(tagFilter): 统一标签筛选纯函数+组件(含无标签选项)"
```

---

### Task 2: payDashboard 新增整体项目数 / 无回款阶段口径

**Files:**
- Modify: `frontend/src/lib/payDashboard.ts`（`PayDashSummary` 接口 + `payDashSummary` 实现，约 L26-65）
- Test: `frontend/src/lib/payDashboard.test.ts`（追加）

**Interfaces:**
- Produces：`PayDashSummary` 新增 `totalAll: number`（inScope 全量=在建主域经视角/排除后项目数，无筛选时=638）、`noStageCount: number`（inScope 中 `paymentNodes[pid]` 空的数量，无筛选时=81）；新函数 `noStageProjects(projects, paymentNodes, opts): NoStageRow[]`，`NoStageRow = { projectId; projectName; projectManager; orgL4; contractWan }`。
- Consumes：`filterProjects`（paymentPmis）已有。

- [ ] **Step 1: 写失败测试**（追加到 `frontend/src/lib/payDashboard.test.ts`）

```ts
import { describe, it, expect } from 'vitest'
import { payDashSummary, noStageProjects } from './payDashboard'

const OPTS = { viewMode: 'global' as const, viewL4: '', viewPM: '', excludeActive: false, excludedIds: {} }
const P = (id: string, orgL4 = 'X', contract = 1000000) =>
  ({ projectId: id, projectName: id + '名', projectManager: '张', orgL4, paymentPmis: { contract } }) as any

describe('payDashboard 整体项目数/无回款阶段', () => {
  const projects = [P('A'), P('B'), P('C')]
  const paymentNodes = { A: [{ planDate: '2026-01-01', expectedPayment: 1, unpaidAmount: 0, status: '待回款' }], B: [], C: [] } as any
  it('totalAll=在建主域全量, noStageCount=空节点数', () => {
    const s = payDashSummary([], projects, OPTS, {}, paymentNodes, '', '')
    expect(s.totalAll).toBe(3)
    expect(s.noStageCount).toBe(2)  // B、C 空节点
  })
  it('noStageProjects 只列空节点项目 + 合同额转万', () => {
    const rows = noStageProjects(projects, paymentNodes, OPTS)
    expect(rows.map((r) => r.projectId)).toEqual(['B', 'C'])
    expect(rows[0]).toMatchObject({ projectId: 'B', projectName: 'B名', projectManager: '张', orgL4: 'X', contractWan: 100 })
  })
})
```

- [ ] **Step 2: 运行确认失败** `cd frontend && npx vitest run src/lib/payDashboard.test.ts`　Expected: FAIL（`totalAll`/`noStageProjects` 未定义）

- [ ] **Step 3: 实现** —— 修改 `frontend/src/lib/payDashboard.ts`

3a. `PayDashSummary` 接口（现 L26-34）追加两字段：

```ts
export interface PayDashSummary {
  relatedNodeCount: number
  totalProjects: number
  totalAll: number      // 在建主域全量(经视角/排除),无筛选=638
  noStageCount: number  // 其中无收款阶段节点(paymentNodes 空)的数量,无筛选=81
  totalExpected: number
  totalActual: number
  totalRemaining: number
  rate: number
  delayedProjects: number
}
```

3b. `payDashSummary` 函数体内（现 L46 `const inScope = ...` 之后、`return` 之前）加：

```ts
  const totalAll = inScope.length
  const noStageCount = inScope.filter((p) => !(paymentNodes?.[p.projectId]?.length)).length
```

并在 `return {...}` 里补 `totalAll, noStageCount,`（紧邻 `totalProjects,`）。

3c. 文件末尾追加纯函数：

```ts
export interface NoStageRow {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  contractWan: number
}

/** 在建主域(经视角/排除)中 paymentNodes 为空数组的项目 → 清单行。合同额转万。 */
export function noStageProjects(
  projects: Project[],
  paymentNodes: Record<string, PaymentNodePmis[]> | undefined,
  opts: ProjFilterOpts,
): NoStageRow[] {
  return filterProjects(projects, opts)
    .filter((p) => !(paymentNodes?.[p.projectId]?.length))
    .map((p) => ({
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      projectManager: (p.projectManager ?? '').trim() || '未指定',
      orgL4: (p.orgL4 ?? '').trim() || '未指定',
      contractWan: (p.paymentPmis?.contract ?? 0) / 10000,
    }))
}
```

（`ProjFilterOpts` 已在文件顶部从 paymentPmis 引入为 `FilterOpts as ProjFilterOpts`，`filterProjects` 同源已引入；`Project`/`PaymentNodePmis` 类型已在文件顶部 import。）

- [ ] **Step 4: 运行测试通过** `cd frontend && npx vitest run src/lib/payDashboard.test.ts`　Expected: PASS

- [ ] **Step 5: Commit**（若已授权）

```bash
git add frontend/src/lib/payDashboard.ts frontend/src/lib/payDashboard.test.ts
git commit -m "feat(payDashboard): 整体项目数 totalAll + 无回款阶段口径 noStageCount/noStageProjects"
```

---

### Task 3: DashMetrics 卡口径 + 下钻

**Files:**
- Modify: `frontend/src/components/DashMetrics.vue`（全文，现 23-53 script + 36-42 模板）
- Test: `frontend/src/components/DashMetrics.test.ts`（新建或追加）

**Interfaces:**
- Consumes：`payDashSummary`（含 Task 2 的 `totalAll`/`noStageCount`）；`useRouter`。

- [ ] **Step 1: 写失败测试** `frontend/src/components/DashMetrics.test.ts`（挂载后断言：项目数卡显示 totalAll，副字含 noStageCount；点击延期卡 push `/projects?riskCategory=回款延期`；点回款节点卡 push `/payment/nodes`；点项目数副字 push `/projects`）

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import DashMetrics from './DashMetrics.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

// 视 payDashSummary 依赖数据 store；用 createTestingPinia 注入最小 data + filter。
beforeEach(() => push.mockReset())

it('项目数卡=totalAll 且副字含无回款阶段数; 三处下钻正确', async () => {
  // 具体 store stub 由实现者按现有 DashMetrics.test 既有套路补齐(data.projects[]、paymentNodes)
  // 断言点:
  //  - 含文本 "项目数" 的卡值 = 在建主域全量
  //  - 副字文本包含 "无回款阶段"
  //  - 点副字 → push('/projects')
  //  - 点"延期项目数"卡 → push('/projects?riskCategory=回款延期')
  //  - 点"回款节点数"卡 → push('/payment/nodes')
  expect(true).toBe(true) // 占位:实现者用真实挂载替换(见下 impl 后回填断言)
})
```

> 实现者注：本仓 vitest 已有 `DashMetrics` 的 store 挂载先例（参考 `OverviewView.test.ts`/`CostDetailView.test.ts` 的 `createTestingPinia` + data stub 用法）。用真实 `mount` + `data-test` 定位替换上面占位断言：给项目数副字加 `data-test="pay-nostage-link"`、延期卡加 `data-test="pay-delayed-card"`、回款节点卡加 `data-test="pay-nodes-card"`，断言点击后 `push` 参数。

- [ ] **Step 2: 运行确认失败** `cd frontend && npx vitest run src/components/DashMetrics.test.ts`

- [ ] **Step 3: 实现** —— 改 `frontend/src/components/DashMetrics.vue`

3a. script 顶部加 `import { useRouter } from 'vue-router'` 与 `const router = useRouter()`。

3b. `metrics` computed 里"项目数"格改为整体 + 副字 + 三格下钻标记：

```ts
const metrics = computed(() => {
  const s = summary.value
  return [
    { k: '项目数', v: String(s.totalAll), cls: '', sub: `${s.noStageCount} 个项目无回款阶段`, subAction: 'nostage' },
    { k: '回款节点数', v: String(s.relatedNodeCount), cls: '', action: 'nodes' },
    { k: '已回款(万)', v: fmtWan(s.totalActual), cls: 'paid' },
    { k: '待回款(万)', v: fmtWan(s.totalRemaining), cls: 'remain' },
    { k: '完成率', v: pct(s.rate), cls: s.rate >= 0.8 ? 'paid' : s.rate >= 0.5 ? 'pending' : 'danger' },
    { k: '延期项目数', v: String(s.delayedProjects), cls: 'danger', action: 'delayed' },
  ]
})

function onCard(action?: string) {
  if (action === 'nodes') router.push('/payment/nodes')
  else if (action === 'delayed') router.push('/projects?riskCategory=回款延期')
}
function onSub(subAction?: string) {
  if (subAction === 'nostage') router.push('/projects')
}
```

3c. 模板：给可点卡加 `@click`、hover 手型（`.dm-card--link`），项目数卡加副字行：

```vue
<template>
  <div class="dash-metrics u-grid-auto">
    <div v-for="m in metrics" :key="m.k" class="dm-card" :class="{ 'dm-card--link': m.action }"
      :data-test="m.action === 'nodes' ? 'pay-nodes-card' : m.action === 'delayed' ? 'pay-delayed-card' : undefined"
      @click="onCard(m.action)">
      <div class="dm-k">{{ m.k }}</div>
      <div class="dm-v u-num" :class="m.cls">{{ m.v }}</div>
      <button v-if="m.sub" class="dm-sub" data-test="pay-nostage-link" @click.stop="onSub(m.subAction)">{{ m.sub }} →</button>
    </div>
  </div>
</template>
```

3d. 样式：加 `.dm-card--link { cursor: pointer; }`、`.dm-card--link:hover { background: var(--hover-tint); }`、`.dm-sub { border:none; background:none; color: var(--accent); font-size: var(--fs-1); cursor:pointer; padding:4px 0 0; }`。数字值 `.dm-v` 补 `.u-num`（已在模板加）。

- [ ] **Step 4: 回填断言并运行通过** `cd frontend && npx vitest run src/components/DashMetrics.test.ts`　Expected: PASS

- [ ] **Step 5: Commit**（若已授权）`git commit -m "feat(DashMetrics): 项目数卡改整体+无回款阶段副字, 延期/节点卡下钻"`

---

### Task 4: 无回款阶段数据项目清单组件

**Files:**
- Create: `frontend/src/components/NoStageProjectsTable.vue`
- Test: `frontend/src/components/NoStageProjectsTable.test.ts`

**Interfaces:**
- Consumes：`noStageProjects`（Task 2）、`DataTable`、`exportRows`、`useRouter`、`useDataStore`/`useFilterStore`。

- [ ] **Step 1: 写失败测试** `NoStageProjectsTable.test.ts`：给定 data/filter stub（含 1 个空节点项目），断言表渲染该行、点击行 push `/project/<id>`、存在导出按钮（`data-test="nostage-export"`）。

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现** `frontend/src/components/NoStageProjectsTable.vue`

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { noStageProjects } from '@/lib/payDashboard'
import { exportRows } from '@/lib/exportXlsx'
import { fmtWan } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'

const router = useRouter()
const data = useDataStore()
const filter = useFilterStore()

const rows = computed(() => noStageProjects(data.data?.projects ?? [], data.data?.paymentNodes, {
  viewMode: filter.viewMode, viewL4: filter.viewL4, viewPM: filter.viewPM,
  excludeActive: filter.excludeOn, excludedIds: filter.excludedIds,
}))

const COLS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 160, sortable: true },
  { key: 'projectName', label: '项目名称', wrap: true, sortable: true },
  { key: 'projectManager', label: '项目经理', width: 100, sortable: true },
  { key: 'orgL4', label: 'L4组', width: 120, sortable: true },
  { key: 'contractWan', label: '合同额(万)', width: 120, num: true, sortable: true, formatter: (v) => fmtWan(v as number) },
]
function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }
function onExport() {
  exportRows('无回款阶段数据项目.xlsx', rows.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, 项目经理: r.projectManager, L4组: r.orgL4, 合同额万: r.contractWan,
  })))
}
</script>

<template>
  <div class="nsp">
    <div class="nsp-h">
      <span>无回款阶段数据项目（{{ rows.length }}）</span>
      <button class="nsp-btn" data-test="nostage-export" @click="onExport">导出Excel</button>
    </div>
    <div v-if="!rows.length" class="nsp-empty">无——全部在建项目均有收款阶段。</div>
    <DataTable v-else :columns="COLS" :rows="rows" :show-count="false" clickable @row-click="onRow" />
  </div>
</template>

<style scoped>
.nsp-h { display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-2); font-weight: 600; color: var(--txt); margin-bottom: var(--sp-3); }
.nsp-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.nsp-btn:hover { background: var(--bg); color: var(--accent); }
.nsp-empty { color: var(--mut); padding: var(--sp-4) 0; }
</style>
```

- [ ] **Step 4: 运行测试通过**

- [ ] **Step 5: Commit**（若已授权）`git commit -m "feat: 无回款阶段数据项目清单组件(可点+导出)"`

---

### Task 5: DashboardView 重构（删两卡 + 回款数据表改名增大 + 挂无阶段清单）

**Files:**
- Modify: `frontend/src/views/DashboardView.vue`（全文）
- Modify: `frontend/src/components/PaymentL4Table.vue`（标题 L51 + 布局）
- Test: `frontend/src/views/DashboardView.test.ts`（新建或追加）

- [ ] **Step 1: 写失败测试** `DashboardView.test.ts`：挂载后断言不含 TrendCard/OrgRanking（可按其根类名或文案"服务组达成排名"/"待回款金额"缺席断言）、含 NoStageProjectsTable、PaymentL4Table 标题为「回款数据」。

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现**

3a. `PaymentL4Table.vue`：标题 L51 `回款数据（按 L4 服务组）` → `回款数据`；`.pl4` 容器与 `.pl4-scroll` 使表填满宽度（`.pl4 { width: 100%; }`，`DataTable` 外层已 `overflow-x:auto`，无需额外约束）。

3b. `DashboardView.vue`：删 `TrendCard`、`OrgRanking` 的 import 与模板；删 `.dash-grid` 两列容器；`PaymentL4Table` 卡片改为整宽主内容；其下新增 `NoStageProjectsTable`。改后模板主体：

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import DashMetrics from '@/components/DashMetrics.vue'
import PaymentL4Table from '@/components/PaymentL4Table.vue'
import NoStageProjectsTable from '@/components/NoStageProjectsTable.vue'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })
</script>

<template>
  <div class="dashboard">
    <p v-if="data.loading" class="dash-hint">加载中…</p>
    <p v-else-if="data.error" class="dash-hint error">数据加载失败：{{ data.error }}</p>
    <template v-else-if="data.data">
      <DashMetrics />
      <section class="dash-card dash-block"><PaymentL4Table /></section>
      <section class="dash-card dash-block"><NoStageProjectsTable /></section>
    </template>
    <p v-else class="dash-hint">暂无数据，请先在数据管理中同步/导入。</p>
  </div>
</template>
```

（保留 `.dashboard`/`.dash-hint`/`.dash-card`/`.dash-block` 样式，删 `.dash-grid` 规则。）

- [ ] **Step 4: 运行测试通过**

- [ ] **Step 5: Commit**（若已授权）`git commit -m "refactor(payment总览): 删待回款金额/达成排名两卡, 回款数据表改名增大, 挂无阶段清单"`

---

### Task 6: /payment/projects 表格化（对齐 /projects）+ 级别列 + 去来源列 + 标签筛选

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts`（`PayProjectRow` + `projectPaymentRows`，加 `projectLevel`）
- Modify: `frontend/src/views/PayProjectsView.vue`（全文重写为 CostDetailView 范式）
- Test: `frontend/src/lib/paymentPmis.test.ts`（追加 projectLevel）、`frontend/src/views/PayProjectsView.test.ts`（新建或追加）

**Interfaces:**
- Produces：`PayProjectRow.projectLevel: string`。
- Consumes：`tagMatch`/`TagFilterSelect`（Task 1）、`useColumnPrefs`、`ColumnFilter`+`crossFilter`、`applyColumnFilters`、`usePagedRows`、`exportRows`、`ColumnPicker`、`useProjectTagsStore`。

- [ ] **Step 1: 写失败测试**（paymentPmis.test.ts 追加）：`projectPaymentRows` 传入含 `status.项目级别='P1'` 的 pmisMap，断言行 `projectLevel==='P1'`；缺失时为 `'-'`。

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现取数**（`paymentPmis.ts`）
- `PayProjectRow` 接口加 `projectLevel: string`。
- `projectPaymentRows` map 内加：`const projectLevel = String((pmisMap?.[p.projectId]?.status as Record<string, unknown> | undefined)?.['项目级别'] ?? '').trim() || '-'`，并在返回对象加 `projectLevel,`。

- [ ] **Step 4: 运行取数测试通过** `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`

- [ ] **Step 5: 重写视图** `frontend/src/views/PayProjectsView.vue`（照 CostDetailView 范式：externalSort 全量排序 + ColumnFilter 列头筛选 + ColumnPicker 选列 + 关键词 + 标签筛选 + 导出 + 分页）。要点：
  - `TABLE_ID='pay-projects'`；`onMounted` 若 `!data.data` `data.load()`，`cf.clearAll(TABLE_ID)`；若 `!tags.tags.length` `tags.load()`。
  - 行源：`projectPaymentRows(filterProjects(projects, opts), projectPmis, paymentNodes, filter.payRecordsAll, filter.dateStart, filter.dateEnd)`（opts 同现文件 L16-23）。
  - `selectedTags = ref<string[]>([])`；`filtered = applyColumnFilters(rows, cf.tableFilters(TABLE_ID))` 再 `.filter(r => tagMatch(tags.assignments[r.projectId] ?? [], selectedTags.value))` 再关键词。
  - `sortState`/`onSortChange`/`sorted`（NUMERIC_KEYS 含 contract/actualTotal/expectedTotal/paymentRatio/nodeCount/reachedCount/delayedCount/projectLevel? 级别按字符串）→ 照 CostDetailView L149-166。
  - `usePagedRows(sorted, 50)`。
  - 列 `COLS`：项目编号 / 项目名称(wrap) / 经理 / 部门 / **项目级别** / 合同(万) / 已回款(万) / 完成率 / 计划回款(万) / 节点 / 达成 / 延期。**删「来源」列（fromOrigin）**。
  - `FILTERABLE`：除项目名称/编号可选，按需（对齐 CostDetail 全列除序号可筛）。
  - 模板：工具栏含关键词 `el-input` + `TagFilterSelect v-model="selectedTags"` + 清除筛选 + 导出；表 `external-sort` + `header-${key}` 插槽挂 `ColumnFilter`；`onRow → pd.open(row.projectId)`；pager 显 `共 {{ sorted.length }} 条`。
  - 导出：`exportRows('回款项目.xlsx', sorted.value.map(...中文列...))`。

- [ ] **Step 6: 写/补视图测试** `PayProjectsView.test.ts`：断言无「来源」列、有「项目级别」列、标签筛选控件存在（`data-test="tag-filter"`）、导出按钮存在、行点击 `pd.open`。

- [ ] **Step 7: 运行测试 + typecheck 通过** `cd frontend && npx vitest run src/views/PayProjectsView.test.ts && npm run typecheck`

- [ ] **Step 8: Commit**（若已授权）`git commit -m "feat(回款项目): 表格化(排序/筛选/选列/导出/标签)+级别列-来源列"`

---

### Task 7: 下钻抽屉全局加宽 + 无回款阶段特殊态

**Files:**
- Modify: `frontend/src/components/ProjectDetailDrawer.vue`（L73 size + 正文条件）
- Test: `frontend/src/components/ProjectDetailDrawer.test.ts`（新建或追加）

- [ ] **Step 1: 写失败测试**：openId 指向一个 `paymentNodes[id]` 为空的主域项目 → 抽屉正文显示「该项目无回款阶段数据」，且有「查看完整详情」按钮点击 push `/project/<id>`；openId 指向有节点项目 → 正常渲染节点明细表。

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现**
- `size="600px"` → `size="900px"`。
- 计算 `hasNoStage = computed(() => !!pd.openId && !(data.data?.paymentNodes?.[pd.openId]?.length) && inDomain.value)`。
- 模板：在 `detail.project` 分支内，若 `hasNoStage` 显示占位块（「该项目无回款阶段数据」+ 「查看完整详情 →」按钮，复用现有 `goFull()`），否则渲染现有 summary + 节点明细表。有节点/域外项目行为不变。

```vue
<div v-if="detail.project" class="pd">
  <template v-if="hasNoStage">
    <div class="pd-nostage">该项目无回款阶段数据</div>
    <button class="pd-full-link" @click="goFull">查看完整详情 →</button>
  </template>
  <template v-else>
    <button v-if="inDomain" class="pd-full-link" @click="goFull">查看完整详情 →</button>
    <div class="pd-grid">…现状…</div>
    <div class="pd-nodes-title">…</div>
    <DataTable … />
  </template>
</div>
```

样式加 `.pd-nostage { color: var(--mut); padding: var(--sp-4) 0; font-size: var(--fs-2); }`；`.pd-grid` 两列在 900px 下可保持或改 3 列（保持两列亦可，执行者目测）。

- [ ] **Step 4: 运行测试通过**

- [ ] **Step 5: Commit**（若已授权）`git commit -m "feat(下钻抽屉): 全局加宽900px + 无回款阶段项目特殊态"`

---

### Task 8: /payment/nodes 精简 + 主表增强

**Files:**
- Modify: `frontend/src/views/PayNodesView.vue`（全文）
- Test: `frontend/src/views/PayNodesView.test.ts`（新建或追加）

- [ ] **Step 1: 写失败测试**：断言无维度切换（`SegToggle`）与维度分组表（`.dim-summary` 缺席）、保留 5 卡、主表含「项目经理」「L4组」列、标签筛选控件存在、导出按钮存在。

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现**
- 删：`SegToggle` import 与 `.pv-ctl`、`.dim-summary` 模板、`dim`/`DIM_OPTS`/`dimField`/`dimLabel`/`byDim`、`PAY_FACET_DIMS` import（若不再用）。
- 保留 5 卡（`.nsum` + `nodeSummary`）。
- 主表增强（照 CostDetailView 范式）：
  - `TABLE_ID='pay-nodes'`；`cf.clearAll(TABLE_ID)`；`tags.load()` 守卫。
  - 行源不变（`paymentNodeRows` 后按计划日区间过滤）。
  - `selectedTags`→`tagMatch(tags.assignments[r.projectId] ?? [], selectedTags)`；`applyColumnFilters(..., cf.tableFilters(TABLE_ID))`；externalSort `sorted`；`usePagedRows(sorted, 50)`。
  - COLS 加「项目经理」(`projectManager`)、「L4组」(`dept`) 列；其余保持（项目/阶段/计划日/实际日/计划比例/计划金额/状态）。
  - `FILTERABLE` 覆盖状态/阶段/经理/L4组等枚举列；模板 `header-${key}` 挂 `ColumnFilter`。
  - 工具栏：`TagFilterSelect` + 清除筛选 + 导出（`exportRows('回款节点.xlsx', sorted...)`）。
  - pager 显 `共 {{ sorted.length }} 条`。

- [ ] **Step 4: 运行测试 + typecheck 通过**

- [ ] **Step 5: Commit**（若已授权）`git commit -m "feat(回款节点): 删维度+主表增强(经理/L4列+筛选/排序/标签/导出)"`

---

### Task 9: 删除 /payment/plan、/payment/risk、/ledger

**Files:**
- Delete: `frontend/src/views/PayPlanView.vue`、`frontend/src/views/PayRiskView.vue`、`frontend/src/views/LedgerView.vue`、`frontend/src/components/LedgerTable.vue`（确认仅 LedgerView 引用后删）
- Modify: `frontend/src/router/index.ts`、`frontend/src/nav.ts`、`frontend/src/lib/pageAccess.ts`、`frontend/src/layout/AppSidebar.vue`
- Modify tests: `frontend/src/router/index.test.ts`、`frontend/src/layout/AppSidebar.test.ts`（及删视图相关测试）

- [ ] **Step 1: 改测试先行**（TDD：先改断言到目标态）
- `router/index.test.ts`：删对 `/payment/plan`、`/payment/risk`、`/ledger` 命中断言；加断言旧路径 redirect 到 `/payment`。
- `AppSidebar.test.ts`：`PAYMENT_LINKS` 数量断言由 6 改 3（回款总览/回款项目/回款节点）。

- [ ] **Step 2: 运行确认失败** `cd frontend && npx vitest run src/router/index.test.ts src/layout/AppSidebar.test.ts`

- [ ] **Step 3: 实现删除**
- `router/index.ts`：删 import `PayPlanView/PayRiskView/LedgerView`（L10-12）；删路由 `/ledger`(L71)、`/payment/plan`(L77)、`/payment/risk`(L78)；把旧深链 redirect 分支指向 plan/risk/ledger 的改成 → `/payment`（`/panalysis/:tab`、`/analysis/:tab` 中 `t==='plan'||t==='risk'` 与 tab 对应旧页的分支统一 `return { path: '/payment' }`；`board` 分支保留 → `/insight/board`）。追加显式兼容 redirect：`{ path: '/payment/plan', redirect: '/payment' }`、`{ path: '/payment/risk', redirect: '/payment' }`、`{ path: '/ledger', redirect: '/payment' }`（保旧深链不 404）。
- `nav.ts`：`PAYMENT_LINKS` 删「回款进度/风险项目/回款台账」三条；删死代码 `TIER_TABS`（全仓 grep 确认无引用后删；若有引用则保留）。
- `lib/pageAccess.ts`：`PageKey` 联合删 `'payment-plan' | 'payment-risk' | 'ledger'`。
- `AppSidebar.vue`：`activeSectionKey` 里 `p.startsWith('/payment') || p.startsWith('/ledger')` 去掉 `|| p.startsWith('/ledger')`（因 /ledger 现 redirect 到 /payment，但保留判断亦无害；为整洁移除）。
- 删 4 个视图/组件文件及其 `*.test.ts`（若存在 `PayPlanView.test.ts` 等）。

- [ ] **Step 4: 运行测试通过 + 全量 typecheck/build** `cd frontend && npx vitest run && npm run typecheck && npm run build`　Expected: 全绿（无对已删模块的悬空 import）

- [ ] **Step 5: Commit**（若已授权）`git commit -m "refactor(回款): 删除 /payment/plan /payment/risk /ledger(旧链 redirect→/payment)"`

---

### Task 10: 版本号 + PROGRESS + 验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1:** `frontend/src/version.ts`：`APP_VERSION='V2.6.0'`、`RELEASE_DATE='2026-07-02'`。
- [ ] **Step 2:** `PROGRESS.md`：新增 V2.6.0 版本节（P1 内容摘要、纯前端、口径变更说明、待 P2-P4）。标 in_progress→done。
- [ ] **Step 3: 全量验证** `bash verify.sh`　Expected: 语法/ruff/pytest/typecheck/vitest/build 全绿。
- [ ] **Step 4: 真机冒烟**（承 design-review-screenshot-harness）：/payment 六→四区块、项目数 638+副字、三处下钻、无阶段清单可点+导出；/payment/projects 排序/筛选/选列/导出/标签/无来源列/抽屉加宽+无阶段特殊态；/payment/nodes 无维度+新列+筛选/导出;删的三页旧链 redirect 到 /payment 不报错;全程 0 console 报错。
- [ ] **Step 5: Commit**（若已授权）`git commit -m "chore(release): V2.6.0 回款域重构 + PROGRESS"`

---

## 自查（写完计划的检查）

- **spec 覆盖**：P1 spec §4 全部映射到任务——总览重做(T2-T5)、/payment/projects(T6-T7)、/payment/nodes(T8)、删三页(T9)、tagFilter 基建(T1)、收尾(T10)。✓
- **占位扫描**：仅 T3 Step1 有一个显式"占位断言"，已注明实现者用真实挂载替换并给出 data-test 约定与参考测试文件——非交付占位。✓
- **类型一致**：`PayProjectRow.projectLevel`(T6)、`PayDashSummary.totalAll/noStageCount`+`noStageProjects/NoStageRow`(T2)、`tagMatch/NO_TAG_VALUE`(T1) 在消费任务中签名一致。✓
- **顺序依赖**：T1(tag)→T6/T8;T2(payDashboard)→T3/T4/T5;T6 取数(paymentPmis)→T6 视图;T9 放最后避免中途悬空 import。✓
