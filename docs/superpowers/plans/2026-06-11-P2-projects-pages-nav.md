# P2 导航收编 + 项目清单 + 项目详情 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 侧边导航重组为「项目 / 回款（重点子域）/ 工具」三段，新增 `/projects` 项目清单页与 `/project/:id` 项目详情页（回款为默认 Tab），抽屉加「查看完整详情 →」入口。

**Architecture:** 纯前端期（后端 P1 已就绪）。数据三源合一：`projects[]`（P1 主域：回款聚合/健康度/deliveryCosts）+ `projectPmis[id]`（团队/客户/进度/风险/状态/riskRecords）+ `rawNodes`（节点明细，复用 `buildProjectDetail` 同式过滤）。两个新 lib 纯函数承载装配/过滤逻辑（vitest 全覆盖），视图薄壳。DataTable 加向后兼容的 `cell-<key>` 动态插槽以支持徽章列。

**Tech Stack:** Vue3 + TS + Pinia + vue-router + Element Plus + Vitest；设计令牌只用 theme.css 既有变量（--ok-bg/--warn-bg/--danger-bg + 对应 -text、--card2、--r-full、--selected-tint）。

---

## 设计决策（评审依据）

1. **详情页右栏动态时间线推迟到 P3**：spec 4.2 的右栏依赖 events（P3 产物），P2 详情页先单列主体，避免常驻空栏死 UI。记入 PROGRESS。
2. **DataTable 扩展而非绕开**：加 `cell-<key>` 作用域插槽，默认回退 formatter，全部既有用法不受影响。
3. **新路由 `hideFilter: true`**：FilterBar 的年份/视角/纳管作用于回款节点域，项目主域两页不适用。
4. **抽屉「查看完整详情 →」仅主域项目显示**（projectId ∈ projects），非主域项目点了会 404，故隐藏。
5. **回款状态按项目派生四态**：无节点（relatedNodeCount=0）/ 延期（delayedCount>0）/ 已回清（remainingTotal≤0 且 actualTotal>0）/ 回款中（其余）。
6. **风险明细列裁剪 10 列**（真实表头 43 列没法看）：风险编码/风险名称/风险等级/风险状态/风险大类/识别日期/计划应对完成日期/实际应对完成日期/是否超期/责任人。
7. **导航过渡期语义**：`/` 旧看板首页归入「回款」组、label 改「回款总览」（它就是回款看板；P4 才迁路由 `/payment`）；route meta.title 不动（仅 PageStub 消费，避免无谓 churn）。
8. **已确认的真实数据形态**（实现与测试都按此写，不得杜撰）：`是否暂停` 为 bool；`完工进展`/`消耗比`/`闭环率` 为 float(0-1) 或 null；`最高等级` ∈ 高/中/低/null；`项目阶段` ∈ 项目启动/项目规划/项目执行/项目收尾/null；`项目状态` ∈ 实施中/已验收/待验收/未开始/项目暂停；riskRecords 行为原始中文表头 dict，日期值为 ISO 字符串（取前 10 位展示）。

## 分级调度（per 用户 2026-06-11 指令）

| 任务 | 难度 | 实现模型 | 审查 |
|---|---|---|---|
| T1 DataTable 插槽 + HealthBadge | 低中 | sonnet | 主循环直接核实 |
| T2 lib/projectList | 中 | sonnet | sonnet 质量审 |
| T3 ProjectsView + /projects | 中 | sonnet | sonnet 质量审 |
| T4 lib/projectPage | 中 | sonnet | sonnet 质量审 |
| T5 ProjectDetailView + /project/:id | 高 | opus | opus 双审（spec+质量） |
| T6 抽屉完整详情入口 | 低 | sonnet | 主循环直接核实 |
| T7 导航收编 | 中 | sonnet | sonnet 质量审 |
| T8 版本/PROGRESS/verify | 低 | 主循环亲做 | verify.sh 门禁 |

所有子代理产出一律由主循环用 `git diff` + 实际跑测核实，不采信自述。

---

### Task 1: DataTable `cell-<key>` 插槽 + HealthBadge 组件

**Files:**
- Modify: `frontend/src/components/DataTable.vue`（模板 `#default` 一处）
- Create: `frontend/src/components/HealthBadge.vue`
- Test: `frontend/src/components/DataTable.test.ts`（追加 describe）、`frontend/src/components/HealthBadge.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

在 `frontend/src/components/DataTable.test.ts` 末尾追加（保持既有 import 与用例不动；若该文件 import 缺 ElementPlus/mount 按已有写法对齐）：

```ts
describe('DataTable cell 插槽', () => {
  it('cell-<key> 插槽覆盖该列默认渲染', () => {
    const w = mount(DataTable, {
      props: { columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }], rows: [{ a: 'x', b: 'y' }] },
      slots: { 'cell-a': '<b class="custom-cell">徽章</b>' },
      global: { plugins: [ElementPlus] },
    })
    expect(w.find('.custom-cell').exists()).toBe(true)
    expect(w.text()).toContain('y') // 未提供插槽的列仍走默认渲染
  })
})
```

新建 `frontend/src/components/HealthBadge.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HealthBadge from './HealthBadge.vue'

describe('HealthBadge', () => {
  it.each([
    ['健康', 'ok'],
    ['关注', 'warn'],
    ['风险', 'danger'],
    ['无数据', 'none'],
  ])('overall=%s → class %s', (overall, cls) => {
    const w = mount(HealthBadge, { props: { overall } })
    expect(w.text()).toBe(overall)
    expect(w.find('.health-badge').classes()).toContain(cls)
  })

  it('空字符串显示无数据并用 none 样式', () => {
    const w = mount(HealthBadge, { props: { overall: '' } })
    expect(w.text()).toBe('无数据')
    expect(w.find('.health-badge').classes()).toContain('none')
  })
})
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts src/components/HealthBadge.test.ts`
Expected: FAIL（插槽用例渲染不出 .custom-cell；HealthBadge.vue 不存在）

- [ ] **Step 3: 实现**

`frontend/src/components/DataTable.vue` 模板中把：

```vue
        <template #default="scope">
          {{ col.formatter ? col.formatter(scope.row[col.key], scope.row) : scope.row[col.key] }}
        </template>
```

改为：

```vue
        <template #default="scope">
          <slot :name="`cell-${col.key}`" :row="scope.row" :value="scope.row[col.key]">
            {{ col.formatter ? col.formatter(scope.row[col.key], scope.row) : scope.row[col.key] }}
          </slot>
        </template>
```

新建 `frontend/src/components/HealthBadge.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'

// 健康度三态徽章：淡底+深字（设计规范 V2 状态三态）；非三态值（含「无数据」/空）走中性样式
const props = defineProps<{ overall: string }>()
const CLS: Record<string, string> = { 健康: 'ok', 关注: 'warn', 风险: 'danger' }
const cls = computed(() => CLS[props.overall] || 'none')
</script>

<template>
  <span class="health-badge" :class="cls">{{ props.overall || '无数据' }}</span>
</template>

<style scoped>
.health-badge { display: inline-block; padding: 1px 8px; border-radius: var(--r-full); font-size: 12px; font-weight: 600; line-height: 1.6; }
.health-badge.ok { background: var(--ok-bg); color: var(--ok-text); }
.health-badge.warn { background: var(--warn-bg); color: var(--warn-text); }
.health-badge.danger { background: var(--danger-bg); color: var(--danger-text); }
.health-badge.none { background: var(--card2); color: var(--mut); }
</style>
```

- [ ] **Step 4: 跑测通过 + 既有用例不回归**

Run: `cd frontend && npx vitest run src/components/DataTable.test.ts src/components/HealthBadge.test.ts`
Expected: PASS（含 DataTable 既有用例）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DataTable.vue frontend/src/components/DataTable.test.ts frontend/src/components/HealthBadge.vue frontend/src/components/HealthBadge.test.ts
git commit -m "feat(p2): DataTable cell-<key> 插槽(向后兼容) + HealthBadge 三态徽章组件"
```

---

### Task 2: lib/projectList — 清单行装配/过滤纯函数

**Files:**
- Create: `frontend/src/lib/projectList.ts`
- Test: `frontend/src/lib/projectList.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/lib/projectList.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, filterProjectRows, distinctOptions, paymentStatusOf, type ProjectFilters } from './projectList'

const PAY0 = { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }

function proj(over: Partial<Project> = {}): Project {
  return {
    projectId: 'QABJ-SS-1', projectName: '终端安全项目', projectManager: '何平', orgL4: '小微部',
    isPresale: false, relatedClosedId: '', payment: { ...PAY0 },
    deliveryCosts: [], health: { progressAbnormal: false, riskAbnormal: false, costAbnormal: false, paymentAbnormal: false, overall: '健康' },
    ...over,
  } as Project
}

const PMIS: Record<string, ProjectPmis> = {
  'QABJ-SS-1': {
    progress: { 完工进展: 0.2, 里程碑进度状态: '正常', 项目阶段: '项目执行', 计划终验: '2028-01-31' },
    status: { 项目状态: '实施中', 是否暂停: false, 评级: 'C', 评分: 25.0 },
    cost: { 总预算: 654051.9, 核算: 208745.13, 剩余预算: 445306.77, 消耗比: 0.319, 超支: false, 成本状态: '正常' },
    risk: { 未关闭风险数: 2, 风险记录数: 3, 最高等级: '中', 闭环率: 0.33 },
    customer: { 最终客户: '北京海聚博源', 合同编号: 'QAX1', 签约形式: null, 行业: '企业', 合同总额: 5276000.0 },
  } as unknown as ProjectPmis,
}

describe('paymentStatusOf', () => {
  it('relatedNodeCount=0 → 无节点', () => {
    expect(paymentStatusOf(proj())).toBe('无节点')
  })
  it('delayedCount>0 → 延期', () => {
    expect(paymentStatusOf(proj({ payment: { ...PAY0, relatedNodeCount: 2, delayedCount: 1 } }))).toBe('延期')
  })
  it('remainingTotal<=0 且 actualTotal>0 → 已回清', () => {
    expect(paymentStatusOf(proj({ payment: { ...PAY0, relatedNodeCount: 2, actualTotal: 100, remainingTotal: 0 } }))).toBe('已回清')
  })
  it('其余 → 回款中', () => {
    expect(paymentStatusOf(proj({ payment: { ...PAY0, relatedNodeCount: 2, actualTotal: 50, remainingTotal: 50 } }))).toBe('回款中')
  })
})

describe('buildProjectRows', () => {
  it('join projectPmis 取 阶段/客户/完工/风险/消耗比/项目状态', () => {
    const [r] = buildProjectRows([proj()], PMIS)
    expect(r.stage).toBe('项目执行')
    expect(r.customer).toBe('北京海聚博源')
    expect(r.progress).toBe(0.2)
    expect(r.riskLevel).toBe('中')
    expect(r.openRisks).toBe(2)
    expect(r.costRatio).toBe(0.319)
    expect(r.projectStatus).toBe('实施中')
    expect(r.health).toBe('健康')
  })
  it('pmis 缺失时取占位默认值', () => {
    const [r] = buildProjectRows([proj({ projectId: 'NO-PMIS' })], PMIS)
    expect(r.stage).toBe('-')
    expect(r.customer).toBe('-')
    expect(r.progress).toBeNull()
    expect(r.riskLevel).toBe('无')
    expect(r.costRatio).toBeNull()
  })
  it('relatedClosedId 非空 → hasClosed=true', () => {
    const [r] = buildProjectRows([proj({ isPresale: true, relatedClosedId: 'OLD-1' })], {})
    expect(r.isPresale).toBe(true)
    expect(r.hasClosed).toBe(true)
  })
})

const F0: ProjectFilters = { search: '', stage: '', projectStatus: '', health: '', riskLevel: '', paymentStatus: '', presale: '' }

describe('filterProjectRows', () => {
  const rows = buildProjectRows(
    [proj(), proj({ projectId: 'QAX-2', projectName: '售前服务-某局', projectManager: '李四', isPresale: true, relatedClosedId: 'OLD-9', health: { progressAbnormal: true, riskAbnormal: false, costAbnormal: false, paymentAbnormal: false, overall: '关注' } })],
    PMIS,
  )
  it('search 命中 项目名/编号/客户/经理 任一（大小写不敏感）', () => {
    expect(filterProjectRows(rows, { ...F0, search: '李四' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, search: 'qax-2' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, search: '海聚' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, search: '不存在' })).toHaveLength(0)
  })
  it('按健康度与售前过滤', () => {
    expect(filterProjectRows(rows, { ...F0, health: '关注' })).toHaveLength(1)
    expect(filterProjectRows(rows, { ...F0, presale: 'yes' })[0].projectId).toBe('QAX-2')
    expect(filterProjectRows(rows, { ...F0, presale: 'no' })[0].projectId).toBe('QABJ-SS-1')
  })
})

describe('distinctOptions', () => {
  it('去重且剔除空与占位 -', () => {
    const rows = buildProjectRows([proj(), proj({ projectId: 'NO-PMIS' })], PMIS)
    expect(distinctOptions(rows, 'stage')).toEqual(['项目执行'])
  })
})
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

新建 `frontend/src/lib/projectList.ts`：

```ts
import type { Project, ProjectPmis } from '@/types/analysis'

// 项目清单行：projects[](P1 主域) join projectPmis[id] 的扁平展示模型
export interface ProjectRow {
  projectId: string
  projectName: string
  customer: string
  projectManager: string
  stage: string
  progress: number | null
  projectStatus: string
  riskLevel: string
  openRisks: number
  costRatio: number | null
  paymentRatio: number | null
  paymentStatus: string
  health: string
  isPresale: boolean
  hasClosed: boolean
}

export interface ProjectFilters {
  search: string
  stage: string
  projectStatus: string
  health: string
  riskLevel: string
  paymentStatus: string
  presale: string // '' | 'yes' | 'no'
}

/** 项目级回款状态四态：无节点 / 延期 / 已回清 / 回款中 */
export function paymentStatusOf(p: Project): string {
  const pay = p.payment
  if (!pay || !pay.relatedNodeCount) return '无节点'
  if ((pay.delayedCount ?? 0) > 0) return '延期'
  if ((pay.remainingTotal ?? 0) <= 0 && (pay.actualTotal ?? 0) > 0) return '已回清'
  return '回款中'
}

export function buildProjectRows(projects: Project[], pmisMap: Record<string, ProjectPmis>): ProjectRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const prog = m.progress ?? {}
    const risk = m.risk ?? {}
    const status = m.status ?? {}
    const cost = m.cost ?? {}
    const customer = m.customer ?? {}
    return {
      projectId: p.projectId,
      projectName: p.projectName || '-',
      customer: customer.最终客户 || '-',
      projectManager: p.projectManager || '-',
      stage: prog.项目阶段 || '-',
      progress: typeof prog.完工进展 === 'number' ? prog.完工进展 : null,
      projectStatus: status.项目状态 || '-',
      riskLevel: risk.最高等级 || '无',
      openRisks: Number(risk.未关闭风险数 ?? 0),
      costRatio: typeof cost.消耗比 === 'number' ? cost.消耗比 : null,
      paymentRatio: p.payment?.paymentRatio ?? null,
      paymentStatus: paymentStatusOf(p),
      health: p.health?.overall || '无数据',
      isPresale: !!p.isPresale,
      hasClosed: !!p.relatedClosedId,
    }
  })
}

export function filterProjectRows(rows: ProjectRow[], f: ProjectFilters): ProjectRow[] {
  const q = (f.search || '').trim().toLowerCase()
  return rows.filter((r) => {
    if (q && ![r.projectName, r.projectId, r.customer, r.projectManager].some((s) => s.toLowerCase().includes(q))) return false
    if (f.stage && r.stage !== f.stage) return false
    if (f.projectStatus && r.projectStatus !== f.projectStatus) return false
    if (f.health && r.health !== f.health) return false
    if (f.riskLevel && r.riskLevel !== f.riskLevel) return false
    if (f.paymentStatus && r.paymentStatus !== f.paymentStatus) return false
    if (f.presale === 'yes' && !r.isPresale) return false
    if (f.presale === 'no' && r.isPresale) return false
    return true
  })
}

/** 下拉选项：从行集取该列出现过的非空值（保插入序，剔除占位 '-'） */
export function distinctOptions(rows: ProjectRow[], key: 'stage' | 'projectStatus' | 'riskLevel'): string[] {
  return [...new Set(rows.map((r) => r[key]).filter((v) => v && v !== '-'))]
}
```

- [ ] **Step 4: 跑测通过**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts`
Expected: PASS（11 cases）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/projectList.ts frontend/src/lib/projectList.test.ts
git commit -m "feat(p2): lib/projectList 清单行装配/过滤/选项纯函数(回款状态四态派生)"
```

---

### Task 3: ProjectsView 项目清单页 + `/projects` 路由

**Files:**
- Create: `frontend/src/views/ProjectsView.vue`
- Modify: `frontend/src/router/index.ts`（新增一条路由）
- Test: `frontend/src/views/ProjectsView.test.ts`（新建）、`frontend/src/router/index.test.ts`（loop 加 '/projects'）

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/views/ProjectsView.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ProjectsView from './ProjectsView.vue'
import { useDataStore } from '@/stores/data'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/projects', component: ProjectsView },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    projects: [
      { projectId: 'P-1', projectName: '终端安全', projectManager: '何平', orgL4: 'A组', isPresale: false, relatedClosedId: '',
        payment: { relatedNodeCount: 2, expectedTotal: 100, actualTotal: 50, remainingTotal: 50, paymentRatio: 0.5, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '健康' } },
      { projectId: 'P-2', projectName: '售前服务-某局', projectManager: '李四', orgL4: 'B组', isPresale: true, relatedClosedId: 'OLD-9',
        payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '关注' } },
    ],
    projectPmis: {
      'P-1': { progress: { 项目阶段: '项目执行', 完工进展: 0.2 }, status: { 项目状态: '实施中' }, risk: { 最高等级: '中', 未关闭风险数: 1 }, cost: { 消耗比: 0.3 }, customer: { 最终客户: '海聚博源' } },
    },
  } as any
}

function mountView() {
  return mount(ProjectsView, { global: { plugins: [ElementPlus, router] } })
}

describe('ProjectsView', () => {
  it('渲染项目行/原项目徽章/健康度徽章', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('P-1')
    expect(w.text()).toContain('售前服务-某局')
    expect(w.text()).toContain('原项目*')
    expect(w.findAll('.health-badge').length).toBeGreaterThanOrEqual(2)
    expect(w.text()).toContain('共 2 条')
  })

  it('搜索过滤（按经理）', async () => {
    seed()
    const w = mountView()
    await w.find('.toolbar input').setValue('李四')
    expect(w.text()).toContain('P-2')
    expect(w.text()).not.toContain('P-1')
  })

  it('行点击跳转 /project/:id', async () => {
    seed()
    const w = mountView()
    const push = vi.spyOn(router, 'push')
    await flushPromises()
    await w.find('.el-table__row').trigger('click')
    expect(push).toHaveBeenCalledWith('/project/P-1')
  })

  it('projects 为空 → 空态提示', () => {
    const ds = useDataStore()
    ds.data = { meta: {}, dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] }, naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {} } as any
    const w = mountView()
    expect(w.text()).toContain('暂无项目主域数据')
  })
})
```

`frontend/src/router/index.test.ts` 的 top-level 循环路径数组加 `'/projects'`（保持其余断言不动）。

- [ ] **Step 2: 跑测确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts src/router/index.test.ts`
Expected: FAIL（ProjectsView.vue 不存在；router 未注册 /projects）

- [ ] **Step 3: 实现**

新建 `frontend/src/views/ProjectsView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { Project, ProjectPmis } from '@/types/analysis'
import { buildProjectRows, filterProjectRows, distinctOptions, type ProjectFilters } from '@/lib/projectList'
import { fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import HealthBadge from '@/components/HealthBadge.vue'

const data = useDataStore()
const router = useRouter()
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() =>
  buildProjectRows(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
  ),
)
const filters = reactive<ProjectFilters>({ search: '', stage: '', projectStatus: '', health: '', riskLevel: '', paymentStatus: '', presale: '' })
const filtered = computed(() => filterProjectRows(rows.value, filters))

const stageOpts = computed(() => distinctOptions(rows.value, 'stage'))
const statusOpts = computed(() => distinctOptions(rows.value, 'projectStatus'))
const riskOpts = computed(() => distinctOptions(rows.value, 'riskLevel'))
const HEALTH_OPTS = ['健康', '关注', '风险', '无数据']
const PAY_OPTS = ['无节点', '回款中', '延期', '已回清']

const columns: DataColumn[] = [
  { key: 'projectName', label: '项目名称', sortable: true },
  { key: 'projectId', label: '项目编号', width: 190 },
  { key: 'customer', label: '客户' },
  { key: 'projectManager', label: '项目经理', width: 90 },
  { key: 'stage', label: '阶段', width: 90 },
  { key: 'progress', label: '完工%', width: 85, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'riskLevel', label: '风险', width: 85, formatter: (v, r) => (r.openRisks ? `${v}(${r.openRisks})` : v) },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'paymentRatio', label: '回款完成率', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'health', label: '健康度', width: 90 },
]

function onRow(row: Record<string, any>) { router.push(`/project/${row.projectId}`) }
</script>

<template>
  <div class="projects-view">
    <h2 class="pv-title">项目清单</h2>
    <div class="toolbar">
      <el-input v-model="filters.search" size="small" placeholder="搜索 项目名/编号/客户/经理" clearable style="width: 230px" />
      <el-select v-model="filters.stage" size="small" clearable placeholder="阶段" style="width: 110px">
        <el-option v-for="o in stageOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectStatus" size="small" clearable placeholder="项目状态" style="width: 110px">
        <el-option v-for="o in statusOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.health" size="small" clearable placeholder="健康度" style="width: 105px">
        <el-option v-for="o in HEALTH_OPTS" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.riskLevel" size="small" clearable placeholder="风险等级" style="width: 105px">
        <el-option v-for="o in riskOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.paymentStatus" size="small" clearable placeholder="回款状态" style="width: 105px">
        <el-option v-for="o in PAY_OPTS" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.presale" size="small" clearable placeholder="售前整合" style="width: 105px">
        <el-option value="yes" label="售前整合" />
        <el-option value="no" label="非售前" />
      </el-select>
    </div>

    <div v-if="!rows.length" class="pv-empty">暂无项目主域数据——请在「数据管理」提供 PMIS 与组织架构文件后点「更新数据」。</div>
    <DataTable v-else :columns="columns" :rows="filtered" clickable @row-click="onRow">
      <template #cell-projectName="{ row }">
        {{ row.projectName }}<span v-if="row.hasClosed" class="pv-origin">原项目*</span>
      </template>
      <template #cell-health="{ row }">
        <HealthBadge :overall="row.health" />
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.projects-view { padding: 16px; }
.pv-title { font-size: 18px; font-weight: 700; color: var(--txt); margin: 0 0 10px; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pv-origin { margin-left: 6px; padding: 0 6px; border-radius: var(--r-full); font-size: 11px; background: var(--selected-tint); color: var(--accent); }
.pv-empty { color: var(--mut); padding: 40px 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
</style>
```

> 若 `npm run typecheck` 对 el-select clearable 清空（undefined）与 `ProjectFilters: string` 冲突报错，把 `ProjectFilters` 字段放宽为 `string`→保持，改 reactive 初始化为 `''` 即可（运行时 undefined 在过滤函数中按 falsy 处理，已兼容）。

`frontend/src/router/index.ts`：import 区加 `import ProjectsView from '@/views/ProjectsView.vue'`；routes 数组在 `/board` 条目前加：

```ts
    { path: '/projects', name: 'projects', component: ProjectsView, meta: { title: '项目清单', hideFilter: true } },
```

- [ ] **Step 4: 跑测通过**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts src/router/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts frontend/src/router/index.ts frontend/src/router/index.test.ts
git commit -m "feat(p2): /projects 项目清单页(搜索+六维筛选+健康度徽章+行点击跳详情)"
```

---

### Task 4: lib/projectPage — 详情页装配纯函数

**Files:**
- Create: `frontend/src/lib/projectPage.ts`
- Test: `frontend/src/lib/projectPage.test.ts`

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/lib/projectPage.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import type { Project, ProjectPmis, RawNode } from '@/types/analysis'
import { buildProjectPage, RISK_COLUMNS, fmtDateCell } from './projectPage'

const PROJECTS = [
  { projectId: 'P-1', projectName: '终端安全', projectManager: '何平', orgL4: 'A组', isPresale: false, relatedClosedId: '',
    payment: { relatedNodeCount: 1, expectedTotal: 100, actualTotal: 0, remainingTotal: 100, paymentRatio: 0, delayedCount: 0 },
    deliveryCosts: [], health: { overall: '健康' } },
  { projectId: 'P-2', projectName: '售前服务-某局', projectManager: '李四', orgL4: 'B组', isPresale: true, relatedClosedId: 'OLD-9',
    payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
    deliveryCosts: [], health: { overall: '关注' } },
] as unknown as Project[]

const PMIS = {
  'P-1': { status: { 项目状态: '实施中' } },
  'OLD-9': { source: '已关闭', team: { 项目名称: '某局一期', 项目经理: '王五' }, customer: { 最终客户: '某局', 合同总额: 1000000 } },
} as unknown as Record<string, ProjectPmis>

const NODES = [
  { projectId: 'P-1', nodeName: '初验', nodeStatus: '正常实施中' },
  { projectId: 'OLD-9', nodeName: '终验', nodeStatus: '已全额回款' },
  { projectId: 'X', nodeName: '无关', nodeStatus: '延期' },
] as unknown as RawNode[]

describe('buildProjectPage', () => {
  it('命中项目：带 pmis 与本项目节点', () => {
    const pg = buildProjectPage(PROJECTS, PMIS, NODES, 'P-1')
    expect(pg.project?.projectId).toBe('P-1')
    expect((pg.pmis as any)?.status?.项目状态).toBe('实施中')
    expect(pg.nodes).toHaveLength(1)
    expect(pg.closedId).toBe('')
    expect(pg.closedPmis).toBeNull()
    expect(pg.closedNodes).toHaveLength(0)
  })
  it('售前整合项目：closedPmis 与原项目节点', () => {
    const pg = buildProjectPage(PROJECTS, PMIS, NODES, 'P-2')
    expect(pg.closedId).toBe('OLD-9')
    expect((pg.closedPmis as any)?.team?.项目名称).toBe('某局一期')
    expect(pg.closedNodes).toHaveLength(1)
    expect(pg.closedNodes[0].nodeName).toBe('终验')
  })
  it('未知 id → project null 且各集合为空', () => {
    const pg = buildProjectPage(PROJECTS, PMIS, NODES, 'NOPE')
    expect(pg.project).toBeNull()
    expect(pg.pmis).toBeNull()
    expect(pg.nodes).toHaveLength(0)
    expect(pg.closedNodes).toHaveLength(0)
  })
})

describe('RISK_COLUMNS / fmtDateCell', () => {
  it('风险列为 10 列裁剪且键为真实表头', () => {
    expect(RISK_COLUMNS.map((c) => c.key)).toEqual([
      '风险编码', '风险名称', '风险等级', '风险状态', '风险大类',
      '识别日期', '计划应对完成日期', '实际应对完成日期', '是否超期', '责任人',
    ])
  })
  it('fmtDateCell 取 ISO 前 10 位，空值显示 -', () => {
    expect(fmtDateCell('2025-09-19T00:00:00')).toBe('2025-09-19')
    expect(fmtDateCell(null)).toBe('-')
    expect(fmtDateCell('')).toBe('-')
  })
})
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd frontend && npx vitest run src/lib/projectPage.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

新建 `frontend/src/lib/projectPage.ts`：

```ts
import type { Project, ProjectPmis, RawNode } from '@/types/analysis'

// 详情页数据装配：projects[](主域) + projectPmis[id] + rawNodes；
// 售前整合项目（relatedClosedId 非空）额外取原(已关闭)项目侧信息——两份信息并存，不合并（spec 3.2）
export interface ProjectPageData {
  project: Project | null
  pmis: ProjectPmis | null
  closedId: string
  closedPmis: ProjectPmis | null
  closedNodes: RawNode[]
  nodes: RawNode[]
}

export function buildProjectPage(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  rawNodes: RawNode[],
  id: string,
): ProjectPageData {
  const project = projects.find((p) => p.projectId === id) ?? null
  if (!project) return { project: null, pmis: null, closedId: '', closedPmis: null, closedNodes: [], nodes: [] }
  const closedId = project.relatedClosedId || ''
  return {
    project,
    pmis: pmisMap[id] ?? null,
    closedId,
    closedPmis: closedId ? (pmisMap[closedId] ?? null) : null,
    nodes: rawNodes.filter((n) => n.projectId === id),
    closedNodes: closedId ? rawNodes.filter((n) => n.projectId === closedId) : [],
  }
}

// 风险明细列裁剪（真实表头 43 列 → 10 列；键名以 项目风险数据.xlsx 实际表头为准）
export const RISK_COLUMNS: { key: string; label: string; width?: number; date?: boolean }[] = [
  { key: '风险编码', label: '编码', width: 110 },
  { key: '风险名称', label: '风险名称' },
  { key: '风险等级', label: '等级', width: 70 },
  { key: '风险状态', label: '状态', width: 90 },
  { key: '风险大类', label: '大类', width: 110 },
  { key: '识别日期', label: '识别日期', width: 100, date: true },
  { key: '计划应对完成日期', label: '计划应对', width: 100, date: true },
  { key: '实际应对完成日期', label: '实际应对', width: 100, date: true },
  { key: '是否超期', label: '超期', width: 70 },
  { key: '责任人', label: '责任人', width: 90 },
]

/** riskRecords 的日期值为 isoformat 字符串，取前 10 位展示 */
export function fmtDateCell(v: unknown): string {
  if (v == null || v === '') return '-'
  return String(v).slice(0, 10)
}
```

- [ ] **Step 4: 跑测通过**

Run: `cd frontend && npx vitest run src/lib/projectPage.test.ts`
Expected: PASS（5 cases）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/projectPage.ts frontend/src/lib/projectPage.test.ts
git commit -m "feat(p2): lib/projectPage 详情页装配纯函数(含售前原项目侧+风险列裁剪)"
```

---

### Task 5: ProjectDetailView 项目详情页 + `/project/:id` 路由

**Files:**
- Create: `frontend/src/views/ProjectDetailView.vue`
- Modify: `frontend/src/router/index.ts`（新增一条路由）
- Test: `frontend/src/views/ProjectDetailView.test.ts`（新建）、`frontend/src/router/index.test.ts`（加 :id 解析断言）

依赖：Task 1（HealthBadge）、Task 4（lib/projectPage）。spec 4.2 布局 B，但**右栏动态时间线推迟 P3**（设计决策 1），本期单列主体。

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/views/ProjectDetailView.test.ts`：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ProjectDetailView from './ProjectDetailView.vue'
import { useDataStore } from '@/stores/data'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/projects', component: { template: '<div />' } },
      { path: '/project/:id', component: ProjectDetailView },
    ],
  })
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    rawNodes: [
      { projectId: 'P-1', nodeName: '初验款', planDate: '2026-03-31', expectedPayment: 500000, actualPayment: 0, nodeStatus: '延期', delayDays: 30, tier: '50-100万', isPaymentRelated: true },
      { projectId: 'OLD-9', nodeName: '终验款', planDate: '2024-01-01', expectedPayment: 200000, actualPayment: 200000, nodeStatus: '已全额回款', tier: '50万以下', isPaymentRelated: true },
    ],
    projects: [
      { projectId: 'P-1', projectName: '终端安全项目', projectManager: '何平', orgL4: 'A组', isPresale: false, relatedClosedId: '',
        payment: { relatedNodeCount: 1, expectedTotal: 500000, actualTotal: 0, remainingTotal: 500000, paymentRatio: 0, delayedCount: 1 },
        deliveryCosts: [{ 类别: '内部人员成本', 预算金额: 122641.51, 实际发生: 0.0, 剩余预算: 122641.51, 消耗率: 0.0 }],
        health: { overall: '风险' } },
      { projectId: 'P-2', projectName: '售前服务-某局', projectManager: '李四', orgL4: 'B组', isPresale: true, relatedClosedId: 'OLD-9',
        payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '关注' } },
    ],
    projectPmis: {
      'P-1': {
        progress: { 完工进展: 0.2, 里程碑进度状态: '延期', 项目阶段: '项目执行', 计划终验: '2028-01-31' },
        status: { 项目状态: '实施中', 是否暂停: true, 评级: 'C' },
        cost: { 总预算: 654051.9, 核算: 208745.13, 剩余预算: 445306.77, 消耗比: 0.319, 超支: false, 成本状态: '正常' },
        risk: { 未关闭风险数: 1, 风险记录数: 2, 最高等级: '中', 闭环率: 0.5 },
        customer: { 最终客户: '海聚博源', 合同总额: 5276000.0 },
        riskRecords: [
          { 风险编码: 'FX-1', 风险名称: '工期风险', 风险等级: '中', 风险状态: '已识别', 风险大类: '进度', 识别日期: '2025-09-19T00:00:00', 计划应对完成日期: '2025-10-01T00:00:00', 实际应对完成日期: null, 是否超期: '否', 责任人: '何平' },
        ],
      },
      'OLD-9': { source: '已关闭', team: { 项目名称: '某局一期', 项目经理: '王五' }, customer: { 最终客户: '某局', 合同总额: 1000000 }, status: { 项目状态: '已验收' }, progress: { 项目阶段: '项目收尾', 完工进展: 1 } },
    },
  } as any
}

async function mountAt(path: string) {
  await router.push(path)
  await router.isReady()
  const w = mount(ProjectDetailView, {
    global: { plugins: [ElementPlus, router], stubs: { FollowupRecords: true } },
  })
  await flushPromises()
  return w
}

describe('ProjectDetailView', () => {
  it('头部+指标条+默认回款 tab(节点表/汇总/跟进记录)', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    expect(w.text()).toContain('终端安全项目')
    expect(w.text()).toContain('海聚博源')
    expect(w.text()).toContain('已暂停')      // 是否暂停=true 徽章
    expect(w.text()).toContain('评级 C')
    expect(w.text()).toContain('项目执行')
    expect(w.find('.health-badge').text()).toBe('风险')
    expect(w.text()).toContain('初验款')       // 节点明细
    expect(w.text()).toContain('延期节点')     // 回款汇总 chip
    expect(w.findComponent({ name: 'FollowupRecords' }).exists()).toBe(true)
  })

  it('切风险 tab 显示聚合与明细行', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '风险')!.trigger('click')
    expect(w.text()).toContain('工期风险')
    expect(w.text()).toContain('2025-09-19') // fmtDateCell 截断
    expect(w.text()).toContain('未关闭风险')
  })

  it('切预算核算 tab 显示成本汇总与明细', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    await w.findAll('.pd-tab').find((b) => b.text() === '预算核算')!.trigger('click')
    expect(w.text()).toContain('内部人员成本')
    expect(w.text()).toContain('总预算(万)')
  })

  it('售前整合项目：原项目 tab 展示已关闭信息与原项目回款节点', async () => {
    seed()
    const w = await mountAt('/project/P-2')
    const originTab = w.findAll('.pd-tab').find((b) => b.text() === '原项目')
    expect(originTab).toBeTruthy()
    await originTab!.trigger('click')
    expect(w.text()).toContain('某局一期')
    expect(w.text()).toContain('OLD-9')
    expect(w.text()).toContain('终验款')
    expect(w.text()).toContain('不计入当前')
  })

  it('非售前项目不显示原项目 tab', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    expect(w.findAll('.pd-tab').some((b) => b.text() === '原项目')).toBe(false)
  })

  it('未知 id → 404 空态 + 返回清单链接', async () => {
    seed()
    const w = await mountAt('/project/NOPE')
    expect(w.text()).toContain('未找到该项目')
    const link = w.find('a[href="/projects"]')
    expect(link.exists()).toBe(true)
  })
})
```

`frontend/src/router/index.test.ts` 追加一条用例（与 analysis 的参数用例同构）：

```ts
  it('resolves project detail with id param', () => {
    const r = router.resolve('/project/QABJ-SS-1')
    expect(r.params.id).toBe('QABJ-SS-1')
    expect(r.name).toBe('project-detail')
  })
```

- [ ] **Step 2: 跑测确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts src/router/index.test.ts`
Expected: FAIL（组件/路由不存在）

- [ ] **Step 3: 实现**

新建 `frontend/src/views/ProjectDetailView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { Project, ProjectPmis, RawNode } from '@/types/analysis'
import { buildProjectPage, RISK_COLUMNS, fmtDateCell } from '@/lib/projectPage'
import { fmtWan, fmtRatio } from '@/lib/format'
import { formatCellValue } from '@/lib/cellFormat'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import HealthBadge from '@/components/HealthBadge.vue'
import FollowupRecords from '@/components/FollowupRecords.vue'

const route = useRoute()
const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const page = computed(() =>
  buildProjectPage(
    (data.data?.projects ?? []) as Project[],
    (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
    (data.data?.rawNodes ?? []) as RawNode[],
    String(route.params.id || ''),
  ),
)
const p = computed(() => page.value.project)
const m = computed(() => (page.value.pmis ?? {}) as Record<string, any>)

// —— 头部徽章（真实取值域见计划设计决策 8）——
const stage = computed(() => m.value.progress?.项目阶段 || '')
const paused = computed(() => m.value.status?.是否暂停 === true)
const rating = computed(() => m.value.status?.评级 || '')

const metrics = computed(() => [
  { k: '完工进展', v: fmtRatio(m.value.progress?.完工进展) },
  { k: '里程碑状态', v: m.value.progress?.里程碑进度状态 || '-' },
  { k: '计划终验', v: fmtDateCell(m.value.progress?.计划终验) },
  { k: '风险', v: m.value.risk?.最高等级 ? `${m.value.risk.最高等级}(${m.value.risk?.未关闭风险数 ?? 0} 未关闭)` : '无' },
  { k: '预算消耗比', v: fmtRatio(m.value.cost?.消耗比) },
  { k: '回款完成率', v: fmtRatio(p.value?.payment?.paymentRatio) },
])

// —— Tab（回款为默认：重点子域，spec 4.2）——
const TABS = [
  { key: 'payment', label: '回款' },
  { key: 'progress', label: '进度里程碑' },
  { key: 'risk', label: '风险' },
  { key: 'cost', label: '预算核算' },
]
const tab = ref('payment')
const showOrigin = computed(() => !!p.value?.isPresale)

// —— 回款 ——
const paySummary = computed(() => {
  const pay = p.value?.payment
  return [
    { k: '计划回款(万)', v: fmtWan(pay?.expectedTotal) },
    { k: '已回款(万)', v: fmtWan(pay?.actualTotal) },
    { k: '待回款(万)', v: fmtWan(pay?.remainingTotal) },
    { k: '完成率', v: fmtRatio(pay?.paymentRatio) },
    { k: '延期节点', v: String(pay?.delayedCount ?? 0) },
  ]
})
const NODE_COLS: DataColumn[] = [
  { key: 'nodeName', label: '节点' },
  { key: 'planDate', label: '计划日期' },
  { key: 'expectedPayment', label: '计划回款' },
  { key: 'actualPayment', label: '已回款' },
  { key: 'actualPaymentRatio', label: '实际比例' },
  { key: 'nodeStatus', label: '状态' },
  { key: 'delayDays', label: '延期天数' },
].map((c) => ({ ...c, formatter: (v: unknown) => formatCellValue(v, c.key) }))

// —— 进度里程碑 ——
const progressInfo = computed(() => [
  { k: '完工进展', v: fmtRatio(m.value.progress?.完工进展) },
  { k: '项目阶段', v: m.value.progress?.项目阶段 || '-' },
  { k: '里程碑进度状态', v: m.value.progress?.里程碑进度状态 || '-' },
  { k: '计划终验', v: fmtDateCell(m.value.progress?.计划终验) },
])

// —— 风险 ——
const riskSummary = computed(() => [
  { k: '未关闭风险', v: String(m.value.risk?.未关闭风险数 ?? 0) },
  { k: '风险记录数', v: String(m.value.risk?.风险记录数 ?? 0) },
  { k: '最高等级', v: m.value.risk?.最高等级 || '无' },
  { k: '闭环率', v: fmtRatio(m.value.risk?.闭环率) },
])
const riskCols: DataColumn[] = RISK_COLUMNS.map((c) => ({
  key: c.key,
  label: c.label,
  width: c.width,
  formatter: c.date ? (v: unknown) => fmtDateCell(v) : undefined,
}))
const riskRows = computed(() => (m.value.riskRecords ?? []) as Record<string, any>[])

// —— 预算核算 ——
const costSummary = computed(() => [
  { k: '总预算(万)', v: fmtWan(m.value.cost?.总预算) },
  { k: '核算(万)', v: fmtWan(m.value.cost?.核算) },
  { k: '剩余预算(万)', v: fmtWan(m.value.cost?.剩余预算) },
  { k: '消耗比', v: fmtRatio(m.value.cost?.消耗比) },
  { k: '成本状态', v: m.value.cost?.成本状态 || '-' },
  { k: '超支', v: m.value.cost?.超支 === true ? '是' : '否' },
])
const COST_COLS: DataColumn[] = [
  { key: '类别', label: '类别' },
  { key: '预算金额', label: '预算金额(万)', formatter: (v) => fmtWan(v as number) },
  { key: '实际发生', label: '实际发生(万)', formatter: (v) => fmtWan(v as number) },
  { key: '剩余预算', label: '剩余预算(万)', formatter: (v) => fmtWan(v as number) },
  { key: '消耗率', label: '消耗率', formatter: (v) => fmtRatio(v) },
]
const costRows = computed(() => (p.value?.deliveryCosts ?? []) as Record<string, any>[])

// —— 原项目（售前整合，两份信息并存：spec 3.2 + 5）——
const cm = computed(() => (page.value.closedPmis ?? {}) as Record<string, any>)
const originInfo = computed(() => [
  { k: '原项目编号', v: page.value.closedId || '-' },
  { k: '原项目名称', v: cm.value.team?.项目名称 || '-' },
  { k: '项目经理', v: cm.value.team?.项目经理 || '-' },
  { k: '最终客户', v: cm.value.customer?.最终客户 || '-' },
  { k: '合同总额(万)', v: fmtWan(cm.value.customer?.合同总额) },
  { k: '项目状态', v: cm.value.status?.项目状态 || '-' },
  { k: '项目阶段', v: cm.value.progress?.项目阶段 || '-' },
  { k: '完工进展', v: fmtRatio(cm.value.progress?.完工进展) },
])
</script>

<template>
  <div class="project-detail-view">
    <div v-if="!p" class="pd-404">
      <div class="pd-404-title">未找到该项目</div>
      <div class="pd-404-sub">项目编号 {{ route.params.id }} 不在项目主域中（仅含交付实施三部在建项目）。</div>
      <RouterLink to="/projects" class="pd-404-link">← 返回项目清单</RouterLink>
    </div>

    <template v-else>
      <div class="pd-head">
        <h2 class="pd-name">{{ p.projectName || p.projectId }}</h2>
        <span v-if="stage" class="pd-badge stage">{{ stage }}</span>
        <span v-if="paused" class="pd-badge paused">已暂停</span>
        <span v-if="rating" class="pd-badge rating">评级 {{ rating }}</span>
        <span v-if="p.isPresale" class="pd-badge origin" title="含已关闭原项目信息">原项目</span>
        <HealthBadge :overall="p.health?.overall || '无数据'" />
      </div>
      <div class="pd-meta">
        <span>编号 <b>{{ p.projectId }}</b></span>
        <span>客户 <b>{{ m.customer?.最终客户 || '-' }}</b></span>
        <span>合同总额(万) <b class="u-num">{{ fmtWan(m.customer?.合同总额) }}</b></span>
        <span>项目经理 <b>{{ p.projectManager || '-' }}</b></span>
        <span>服务组 <b>{{ p.orgL4 || '-' }}</b></span>
      </div>

      <div class="pd-metrics">
        <div v-for="it in metrics" :key="it.k" class="pd-metric">
          <div class="pd-metric-v u-num">{{ it.v }}</div>
          <div class="pd-metric-k">{{ it.k }}</div>
        </div>
      </div>

      <nav class="pd-tabs">
        <button v-for="t in TABS" :key="t.key" class="pd-tab" :class="{ active: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
        <button v-if="showOrigin" class="pd-tab" :class="{ active: tab === 'origin' }" @click="tab = 'origin'">原项目</button>
      </nav>

      <section v-if="tab === 'payment'" class="pd-section">
        <div class="pd-chips">
          <div v-for="it in paySummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
        </div>
        <DataTable :columns="NODE_COLS" :rows="page.nodes" />
        <div class="pd-section-title">跟进记录</div>
        <FollowupRecords :project-id="p.projectId" :project-name="p.projectName || ''" />
      </section>

      <section v-else-if="tab === 'progress'" class="pd-section">
        <div class="pd-chips">
          <div v-for="it in progressInfo" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
        </div>
      </section>

      <section v-else-if="tab === 'risk'" class="pd-section">
        <div class="pd-chips">
          <div v-for="it in riskSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
        </div>
        <DataTable v-if="riskRows.length" :columns="riskCols" :rows="riskRows" />
        <div v-else class="pd-note">无风险记录。</div>
      </section>

      <section v-else-if="tab === 'cost'" class="pd-section">
        <div class="pd-chips">
          <div v-for="it in costSummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
        </div>
        <DataTable v-if="costRows.length" :columns="COST_COLS" :rows="costRows" :show-count="false" />
        <div v-else class="pd-note">未提供预算核算明细（delivery_analysis.xlsx）。</div>
      </section>

      <section v-else-if="tab === 'origin'" class="pd-section">
        <div v-if="!page.closedId" class="pd-note">待提供映射（A.xlsx）——该售前项目尚无已关闭原项目关联。</div>
        <template v-else>
          <div class="pd-note">以下为已关闭原项目信息（标记「原项目」，不计入当前项目汇总）。</div>
          <div class="pd-chips">
            <div v-for="it in originInfo" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
          </div>
          <template v-if="page.closedNodes.length">
            <div class="pd-section-title">原项目回款节点（不计入当前汇总）</div>
            <DataTable :columns="NODE_COLS" :rows="page.closedNodes" :show-count="false" />
          </template>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.project-detail-view { padding: 16px; }
.pd-404 { text-align: center; padding: 60px 0; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.pd-404-title { font-size: 18px; font-weight: 700; color: var(--txt); margin-bottom: 8px; }
.pd-404-sub { font-size: 13px; color: var(--mut); margin-bottom: 16px; }
.pd-404-link { color: var(--accent); font-size: 13px; text-decoration: none; font-weight: 600; }
.pd-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.pd-name { font-size: 19px; font-weight: 700; color: var(--txt); margin: 0; }
.pd-badge { display: inline-block; padding: 1px 8px; border-radius: var(--r-full); font-size: 12px; font-weight: 600; line-height: 1.6; }
.pd-badge.stage { background: var(--selected-tint); color: var(--accent); }
.pd-badge.paused { background: var(--warn-bg); color: var(--warn-text); }
.pd-badge.rating { background: var(--card2); color: var(--sub); }
.pd-badge.origin { background: var(--selected-tint); color: var(--accent); }
.pd-meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--sub); margin-bottom: 12px; }
.pd-meta b { color: var(--txt); }
.pd-metrics { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
.pd-metric { flex: 1; min-width: 120px; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: 10px 14px; }
.pd-metric-v { font-size: 16px; font-weight: 700; color: var(--txt); }
.pd-metric-k { font-size: 12px; color: var(--mut); margin-top: 2px; }
.pd-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin-bottom: 12px; }
.pd-tab { border: none; background: none; padding: 8px 14px; font-size: 13px; color: var(--sub); cursor: pointer; border-bottom: 2px solid transparent; }
.pd-tab:hover { background: var(--hover-tint); }
.pd-tab.active { color: var(--accent); font-weight: 700; border-bottom-color: var(--accent); }
.pd-section { margin-bottom: 16px; }
.pd-section-title { font-weight: 700; color: var(--accent); font-size: 13px; margin: 14px 0 8px; }
.pd-chips { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.pd-chip { display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); font-size: 13px; }
.pd-chip-k { color: var(--mut); }
.pd-chip-v { color: var(--txt); font-weight: 600; }
.pd-note { font-size: 12px; color: var(--mut); margin-bottom: 10px; }
</style>
```

`frontend/src/router/index.ts`：import 区加 `import ProjectDetailView from '@/views/ProjectDetailView.vue'`；routes 在 `/projects` 条目后加：

```ts
    { path: '/project/:id', name: 'project-detail', component: ProjectDetailView, meta: { title: '项目详情', hideFilter: true } },
```

- [ ] **Step 4: 跑测通过**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts src/router/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts frontend/src/router/index.ts frontend/src/router/index.test.ts
git commit -m "feat(p2): /project/:id 详情页(回款默认Tab+进度/风险/预算/原项目+404,右栏动态留P3)"
```

---

### Task 6: 抽屉「查看完整详情 →」入口

**Files:**
- Modify: `frontend/src/components/ProjectDetailDrawer.vue`
- Test: `frontend/src/components/ProjectDetailDrawer.test.ts`（既有 mount 需加 router 插件 + 新增 2 用例）

- [ ] **Step 1: 写失败测试**

`ProjectDetailDrawer.test.ts`：先在既有所有 `mount(...)` 的 `global.plugins` 中加入 memory router（组件将调用 `useRouter`，不加会报 injection 警告/错误）。文件顶部加：

```ts
import { createRouter, createMemoryHistory } from 'vue-router'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
}
```

再追加用例（seed 方式沿用该文件既有写法——store 设 rawNodes 后 `pd.open('P-1')`；按既有断言风格微调）：

```ts
describe('查看完整详情入口', () => {
  it('主域项目显示入口，点击关闭抽屉并跳详情页', async () => {
    const router = makeRouter()
    const push = vi.spyOn(router, 'push')
    // seed：rawNodes 含 P-1，且 data.projects 含 P-1（主域）
    // ...沿用该文件既有 seed 后补：
    // ds.data.projects = [{ projectId: 'P-1', projectName: '甲', payment: {}, deliveryCosts: [], health: {} }]
    // pd.open('P-1')
    const w = mount(ProjectDetailDrawer, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    const btn = w.find('.pd-full-link')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(push).toHaveBeenCalledWith('/project/P-1')
    expect(useProjectDetailStore().openId).toBeNull() // 已关闭
  })

  it('非主域项目（不在 projects[]）不显示入口', async () => {
    const router = makeRouter()
    // seed：rawNodes 含 P-9 但 projects 为空；pd.open('P-9')
    const w = mount(ProjectDetailDrawer, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    expect(w.find('.pd-full-link').exists()).toBe(false)
  })
})
```

> 注：el-drawer 是 append-to-body 的传送门组件，该文件既有用例已有对应的查找方式（如 document.body 查询或 teleport stub）——**沿用既有方式**，不要自创。

- [ ] **Step 2: 跑测确认失败**

Run: `cd frontend && npx vitest run src/components/ProjectDetailDrawer.test.ts`
Expected: 新增 2 用例 FAIL（.pd-full-link 不存在）

- [ ] **Step 3: 实现**

`frontend/src/components/ProjectDetailDrawer.vue` script 中（import 区按需补）：

```ts
import { useRouter } from 'vue-router'
import type { Project } from '@/types/analysis'

const router = useRouter()

// 仅项目主域（projects[]）的项目展示全页详情入口——非主域项目跳过去是 404（spec 2：抽屉保留快速下钻，/project/:id 为全页升级版）
const inDomain = computed(
  () => !!pd.openId && ((data.data?.projects ?? []) as Project[]).some((x) => x.projectId === pd.openId),
)

function goFull() {
  const id = pd.openId
  pd.close()
  if (id) router.push(`/project/${id}`)
}
```

模板在 `<div v-if="detail.project" class="pd">` 内第一行加：

```vue
      <button v-if="inDomain" class="pd-full-link" @click="goFull">查看完整详情 →</button>
```

样式追加：

```css
.pd-full-link { border: none; background: none; color: var(--accent); font-size: 13px; font-weight: 600; cursor: pointer; padding: 0; margin-bottom: 10px; }
```

- [ ] **Step 4: 跑测通过（全文件，防回归）**

Run: `cd frontend && npx vitest run src/components/ProjectDetailDrawer.test.ts`
Expected: PASS（既有 + 新增）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ProjectDetailDrawer.vue frontend/src/components/ProjectDetailDrawer.test.ts
git commit -m "feat(p2): 抽屉加查看完整详情入口(仅主域项目,关抽屉跳 /project/:id)"
```

---

### Task 7: 导航收编——三段分组（项目 / 回款·重点子域 / 工具）

**Files:**
- Modify: `frontend/src/nav.ts`（OVERVIEW_LINKS/ANALYSIS_LINKS → PROJECT_LINKS/PAYMENT_LINKS）
- Modify: `frontend/src/layout/AppSidebar.vue`
- Test: `frontend/src/layout/AppSidebar.test.ts`（标签断言更新）

nav 常量仅 AppSidebar 消费（已核实），重命名安全。旧路由全部不动（spec 2 关键取舍）。

- [ ] **Step 1: 写失败测试**

`frontend/src/layout/AppSidebar.test.ts` 中把组标签/链接断言更新为（沿用该文件既有 mount 与断言写法）：

```ts
  it('renders 项目/回款/工具 三段分组', async () => {
    // ...沿用既有 mount
    const text = wrapper.text()
    expect(text).toContain('项目清单')        // 项目组（新）
    expect(text).toContain('回款总览')        // 回款组：旧首页收编更名
    expect(text).toContain('回款日历')
    expect(text).toContain('多维看板')
    expect(text).toContain('回款分析')        // 业务分析 5 链接的子组标题
    expect(text).toContain('数据管理')        // 工具组
    expect(text).not.toContain('看板首页')    // 旧 label 退场
    // 回款组为低一级呈现（缩进样式类存在）
    expect(wrapper.findAll('.nav-sub').length).toBeGreaterThanOrEqual(5)
  })
```

（替换原 `renders overview + tier-tab + tool nav labels` 用例；`toggle button` 用例不动。）

- [ ] **Step 2: 跑测确认失败**

Run: `cd frontend && npx vitest run src/layout/AppSidebar.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

`frontend/src/nav.ts`：删除 `OVERVIEW_LINKS` 与 `ANALYSIS_LINKS` 两个导出，替换为（其余导出 TIERS/TIER_TABS/ANALYSIS_TAB_LINKS/TOOL_LINKS/TIER_BY_SLUG 全部不动）：

```ts
// 项目主域（P2 起逐期补全：P3 项目动态 /activity、P4 项目总览 /、P5 项目分析 /insight）
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目清单', to: '/projects' },
]

// 回款重点子域（spec 2：分组低一级呈现；'/' 暂为旧首页，P4 迁 /payment）
export const PAYMENT_LINKS: NavLink[] = [
  { label: '回款总览', to: '/' },
  { label: '回款日历', to: '/calendar' },
  { label: '临期跟进', to: '/followup' },
  { label: '回款台账', to: '/ledger' },
  { label: '多维看板', to: '/board' },
]
```

`frontend/src/layout/AppSidebar.vue`：

```vue
<script setup lang="ts">
import { useUiStore } from '@/stores/ui'
import { PROJECT_LINKS, PAYMENT_LINKS, ANALYSIS_TAB_LINKS, TOOL_LINKS } from '@/nav'

const ui = useUiStore()
</script>

<template>
  <aside class="sidebar" :class="{ collapsed: ui.sidebarCollapsed }">
    <nav class="sidebar-nav">
      <div class="section">
        <div class="section-label">项目</div>
        <RouterLink v-for="link in PROJECT_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div class="section">
        <div class="section-label">回款<span class="section-tag">重点子域</span></div>
        <RouterLink v-for="link in PAYMENT_LINKS" :key="link.to" :to="link.to"
          class="nav-sub" active-class="active">{{ link.label }}</RouterLink>
        <div class="group-label">回款分析</div>
        <RouterLink v-for="link in ANALYSIS_TAB_LINKS" :key="link.to" :to="link.to"
          class="nav-sub nav-sub2" active-class="active">{{ link.label }}</RouterLink>
      </div>

      <div class="section">
        <div class="section-label">工具</div>
        <RouterLink v-for="link in TOOL_LINKS" :key="link.to" :to="link.to"
          class="nav-item" active-class="active">{{ link.label }}</RouterLink>
      </div>
    </nav>
  </aside>
  <button data-test="sidebar-toggle" class="sidebar-toggle" title="折叠/展开菜单"
    @click="ui.toggleSidebar()">{{ ui.sidebarCollapsed ? '››' : '‹‹' }}</button>
</template>
```

样式块在既有 `.group-label` 后追加两条（其余不动）：

```css
.section-tag { margin-left: 6px; font-weight: 400; font-size: 10px; color: var(--mut); }
.nav-sub2 { padding-left: 42px; }
```

（既有 `.nav-sub` 规则已含 30px 缩进与 hover/active 态，复用即可。）

- [ ] **Step 4: 跑测通过 + 全量前端测试防回归**

Run: `cd frontend && npx vitest run src/layout/AppSidebar.test.ts && npm run test:run`
Expected: PASS（全量绿，确认无其他文件引用被删常量）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/nav.ts frontend/src/layout/AppSidebar.vue frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(p2): 导航收编三段分组(项目/回款重点子域缩进/工具),旧路由全保留"
```

---

### Task 8: 版本 V7.1.0 + PROGRESS + 全量验证（主循环亲做）

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 版本号**

`frontend/src/version.ts`：`APP_VERSION = 'V7.1.0'`、`RELEASE_DATE = '2026-06-11'`。

- [ ] **Step 2: PROGRESS.md 更新**

- 头部：当前版本 V7.1.0、最近更新 2026-06-11（P2 导航收编+项目清单+项目详情）。
- 「进行中」：P2 完成，下一步 P3（快照/diff/events + /activity，节点稳定键此期确认）。
- 记入：详情页右栏动态时间线推迟至 P3 实现（设计决策）；新 Handoff 段（手工烟雾清单：导航三段分组可见、/projects 640 行可筛可点、/project/:id 五 Tab+售前原项目 Tab、抽屉入口仅主域项目显示）。

- [ ] **Step 3: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(p2): 版本 V7.1.0 + PROGRESS 记录 P2 完成与右栏动态留 P3"
```
