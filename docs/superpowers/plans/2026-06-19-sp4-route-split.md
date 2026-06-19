# SP4 /panalysis 五页拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/panalysis/:tab?`（PayAnalysisView 内 tab 切换 5 组件）拆为 `/payment/*` 下五条独立平铺路由，去掉顶部 tab 栏，组件归位 views/，维度控件仅保留在 nodes 页。

**Architecture:** 两步走且每步收尾全绿。Task 1 纯 `git mv` 把四个 facet 组件迁入 `views/` 并改名（行为不变，dim prop 暂留，PayAnalysisView 仍是宿主）。Task 2 做耦合翻转：仅 nodes 页内聚维度控件、其余三页删死 prop、router 改五条 `/payment/*` 路由 + 三条兼容 redirect、删除 PayAnalysisView、更新侧栏/跳转/版本与全部相关测试。两步之间无破损中间态。

**Tech Stack:** Vue3 + Vite + TS + Pinia + Element Plus + vue-router 4 + vitest；纯前端，不动 Python/数据层。

## Global Constraints

- 纯前端、纯结构搬迁：**不动任何回款计算口径与数据层**（口径完全沿用 SP2/SP3）。
- 版本：`frontend/src/version.ts` → `V1.13.0`（Y 级），`RELEASE_DATE` 保持 `2026-06-19`。
- 设计令牌：样式只引用 `theme.css` 令牌（间距/字号/圆角/颜色），**不手写散值**；禁用 emoji。
- 维度控件**只有 nodes 页真正生效**：`plan`/`risk`/`projects` 的 `dim` 是声明未用的死 prop，删除且**不加**任何维度控件（用户 2026-06-19 确认）。
- 提交信息结尾恒一行：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`；**禁止 `git add -A`/`git add .`**，逐文件 add。
- 收尾判据：`bash verify.sh` 全绿（ruff/pytest/typecheck/vitest/build）。

---

## File Structure

| 文件 | 责任 | 本轮变更 |
|---|---|---|
| `frontend/src/views/PayProjectsView.vue` | 回款项目明细页 | Task1 由 `components/ProjectsOverviewTab.vue` git mv；Task2 删死 `dim?` prop |
| `frontend/src/views/PayNodesView.vue` | 回款节点页（唯一带维度控件） | Task1 由 `components/TierNodesTab.vue` git mv；Task2 dim→内部 ref+SegToggle |
| `frontend/src/views/PayPlanView.vue` | 回款进度页 | Task1 由 `components/PlanTab.vue` git mv（修 ColumnFilter 相对导入）；Task2 删死 dim prop |
| `frontend/src/views/PayRiskView.vue` | 风险项目页 | Task1 由 `components/RiskTab.vue` git mv；Task2 删死 dim prop |
| `frontend/src/views/BoardView.vue` | 多维看板（SP5 重做对象） | 不改内容，Task2 挂 `/payment/board` |
| `frontend/src/views/PayAnalysisView.vue` | 旧 tab 宿主 | Task2 删除 |
| `frontend/src/router/index.ts` | 路由表 | Task1 同步迁移后 import 路径仍由 PayAnalysisView 持有（不动）；Task2 重写 |
| `frontend/src/nav.ts` | 侧栏链接 | Task2 PAYMENT_LINKS 展开为 8 项 |
| `frontend/src/lib/navContext.ts` | goBoard 跳转 | Task2 → `/payment/board` |
| `frontend/src/version.ts` | 版本单一来源 | Task2 → V1.13.0 |

> **Task1 边界说明**：Task1 只 `git mv` + 改引用，**不动 router**（router 此刻仍由 PayAnalysisView 引用这四个组件——而 PayAnalysisView 的 import 路径在 Task1 被更新为新 views/ 路径）。router 自身重写在 Task2。

---

## Task 1: 四组件 git mv 迁入 views/ 并改名（纯机械，行为不变）

把四个 facet 组件与其测试 `git mv` 到 `views/`，更新所有引用，行为与测试断言完全不变（`dim` prop 仍保留，PayAnalysisView 仍是宿主）。这是低风险重定位，单独成任务便于审查"除路径外无逻辑变化"。

**Files:**
- Rename: `frontend/src/components/ProjectsOverviewTab.vue` → `frontend/src/views/PayProjectsView.vue`
- Rename: `frontend/src/components/ProjectsOverviewTab.test.ts` → `frontend/src/views/PayProjectsView.test.ts`
- Rename: `frontend/src/components/TierNodesTab.vue` → `frontend/src/views/PayNodesView.vue`
- Rename: `frontend/src/components/TierNodesTab.test.ts` → `frontend/src/views/PayNodesView.test.ts`
- Rename: `frontend/src/components/PlanTab.vue` → `frontend/src/views/PayPlanView.vue`
- Rename: `frontend/src/components/PlanTab.test.ts` → `frontend/src/views/PayPlanView.test.ts`
- Rename: `frontend/src/components/RiskTab.vue` → `frontend/src/views/PayRiskView.vue`
- Rename: `frontend/src/components/RiskTab.test.ts` → `frontend/src/views/PayRiskView.test.ts`
- Modify: `frontend/src/views/PayPlanView.vue`（移动后修相对导入）
- Modify: `frontend/src/views/PayAnalysisView.vue`（4 个 import 路径 + 4 个模板标签）
- Modify: `frontend/src/views/PayAnalysisView.test.ts`（stub keys + findComponent names）
- Modify: 四个移动后的 `.test.ts`（import 路径 + 标识符）

**Interfaces:**
- Consumes: 现有组件 `ProjectsOverviewTab`(props `dim?:string`)、`TierNodesTab`(props `dim:string`)、`PlanTab`(props `dim:string`)、`RiskTab`(props `dim:string`)。
- Produces: 同名能力的 views `PayProjectsView`/`PayNodesView`/`PayPlanView`/`PayRiskView`，props 签名不变，供 Task2 改造与挂路由。

- [ ] **Step 1: git mv 八个文件**

```bash
cd "frontend/src"
git mv components/ProjectsOverviewTab.vue views/PayProjectsView.vue
git mv components/ProjectsOverviewTab.test.ts views/PayProjectsView.test.ts
git mv components/TierNodesTab.vue views/PayNodesView.vue
git mv components/TierNodesTab.test.ts views/PayNodesView.test.ts
git mv components/PlanTab.vue views/PayPlanView.vue
git mv components/PlanTab.test.ts views/PayPlanView.test.ts
git mv components/RiskTab.vue views/PayRiskView.vue
git mv components/RiskTab.test.ts views/PayRiskView.test.ts
```

- [ ] **Step 2: 修 PayPlanView.vue 的相对导入**

`PlanTab.vue` 第 8 行 `import ColumnFilter from './ColumnFilter.vue'` 在 views/ 下失效（ColumnFilter 仍在 components/）。改为别名：

```ts
import ColumnFilter from '@/components/ColumnFilter.vue'
```

（其余三个 view 的导入均为 `@/` 别名或同目录测试，无需改。）

- [ ] **Step 3: 更新 PayAnalysisView.vue 的 import 与模板标签**

`frontend/src/views/PayAnalysisView.vue` 第 8-11 行 import 改为：

```ts
import PayProjectsView from '@/views/PayProjectsView.vue'
import PayNodesView from '@/views/PayNodesView.vue'
import PayPlanView from '@/views/PayPlanView.vue'
import PayRiskView from '@/views/PayRiskView.vue'
```

模板第 50-53 行标签随之改名（保留 `:dim="dim"`）：

```vue
    <BoardView v-if="tab === 'board'" />
    <PayProjectsView v-else-if="tab === 'projects'" :dim="dim" />
    <PayNodesView v-else-if="tab === 'nodes'" :dim="dim" />
    <PayPlanView v-else-if="tab === 'plan'" :dim="dim" />
    <PayRiskView v-else-if="tab === 'risk'" :dim="dim" />
```

- [ ] **Step 4: 更新四个移动后测试的 import 与标识符**

每个 `.test.ts` 把对自身组件的 import 与 `mount` 目标改名（逻辑、props、断言全部不变）：

- `views/PayProjectsView.test.ts`：`import ProjectsOverviewTab from './ProjectsOverviewTab.vue'` → `import PayProjectsView from './PayProjectsView.vue'`；全文件 `ProjectsOverviewTab` 标识符 → `PayProjectsView`（含 `describe('ProjectsOverviewTab'`→`describe('PayProjectsView'` 与三处 `mount(ProjectsOverviewTab`）。
- `views/PayNodesView.test.ts`：`import TierNodesTab from './TierNodesTab.vue'` → `import PayNodesView from './PayNodesView.vue'`；`describe('TierNodesTab'`→`describe('PayNodesView'`；三处 `mount(TierNodesTab` → `mount(PayNodesView`。
- `views/PayPlanView.test.ts`：`import PlanTab from './PlanTab.vue'` → `import PayPlanView from './PayPlanView.vue'`；`describe('PlanTab(回款进度)'`→`describe('PayPlanView(回款进度)'`；两处 `mount(PlanTab` → `mount(PayPlanView`。
- `views/PayRiskView.test.ts`：`import RiskTab from './RiskTab.vue'` → `import PayRiskView from './PayRiskView.vue'`；`describe('RiskTab(PMIS 风险三类)'`→`describe('PayRiskView(PMIS 风险三类)'`；两处 `mount(RiskTab` → `mount(PayRiskView`。

- [ ] **Step 5: 更新 PayAnalysisView.test.ts 的 stub 与 findComponent 名**

`frontend/src/views/PayAnalysisView.test.ts` 第 14 行 TAB_STUBS 改键名：

```ts
const TAB_STUBS = { BoardView: true, PayProjectsView: true, PayNodesView: true, PayPlanView: true, PayRiskView: true }
```

`findComponent({ name: 'ProjectsOverviewTab' })`→`{ name: 'PayProjectsView' }`（第 51 行）、`{ name: 'TierNodesTab' }`→`{ name: 'PayNodesView' }`（第 58 行）、`{ name: 'PlanTab' }`→`{ name: 'PayPlanView' }`（第 64 行）、`{ name: 'RiskTab' }`→`{ name: 'PayRiskView' }`（第 66 行）。文本断言（'多维看板'/'回款进度'/'项目总览'/'部门'/'金额档'/'进度态'/'维度'）来自 PayAnalysisView 自身的 TABS 与共享 av-ctl，**不改**。

- [ ] **Step 6: 跑测试 + 类型检查，确认全绿**

```bash
cd frontend && npm run typecheck && npm run test:run
```

Expected: typecheck 0 error；vitest 全绿（含 PayProjectsView/PayNodesView/PayPlanView/PayRiskView/PayAnalysisView 套件，断言数与迁移前一致）。

- [ ] **Step 7: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add frontend/src/views/PayProjectsView.vue frontend/src/views/PayProjectsView.test.ts \
        frontend/src/views/PayNodesView.vue frontend/src/views/PayNodesView.test.ts \
        frontend/src/views/PayPlanView.vue frontend/src/views/PayPlanView.test.ts \
        frontend/src/views/PayRiskView.vue frontend/src/views/PayRiskView.test.ts \
        frontend/src/views/PayAnalysisView.vue frontend/src/views/PayAnalysisView.test.ts
git commit -m "$(cat <<'EOF'
refactor(SP4): 四 facet 组件 git mv 迁入 views/ 并改名(行为不变)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 维度内聚(仅 nodes) + 路由切换 /payment/* + 删 PayAnalysisView

耦合翻转，一次到位避免破损中间态：nodes 页内聚维度控件、其余三页删死 prop、router 改五条独立路由 + 三条兼容 redirect、删除旧宿主、更新侧栏/跳转/版本与全部相关测试。

**Files:**
- Modify: `frontend/src/views/PayNodesView.vue`（dim prop → 内部 ref + SegToggle）
- Modify: `frontend/src/views/PayNodesView.test.ts`（去 props.dim + 加维度控件断言）
- Modify: `frontend/src/views/PayProjectsView.vue`（删 `dim?` prop）/ `.test.ts`（去 props.dim）
- Modify: `frontend/src/views/PayPlanView.vue`（删 dim prop）/ `.test.ts`（去 props.dim）
- Modify: `frontend/src/views/PayRiskView.vue`（删 dim prop）/ `.test.ts`（去 props.dim）
- Modify: `frontend/src/router/index.ts`（重写：5 路由 + 3 redirect）
- Modify: `frontend/src/router/index.test.ts`
- Modify: `frontend/src/nav.ts`（PAYMENT_LINKS）
- Modify: `frontend/src/lib/navContext.ts` / `frontend/src/lib/navContext.test.ts`
- Modify: `frontend/src/components/OrgRanking.test.ts`
- Modify: `frontend/src/layout/AppSidebar.test.ts`
- Modify: `frontend/src/version.ts`
- Delete: `frontend/src/views/PayAnalysisView.vue` + `frontend/src/views/PayAnalysisView.test.ts`

**Interfaces:**
- Consumes: Task1 产出的四个 views（props 签名 `dim`）、`BoardView`（无 props）、`SegToggle`（props `modelValue`/`options`，emit `update:modelValue`，选项含 `data-test="seg-<value>"`）、`PAY_FACET_DIMS`（`{key,label}[]`，来自 `@/lib/paymentPmis`）。
- Produces: 路由名 `pay-board`/`pay-projects`/`pay-nodes`/`pay-plan`/`pay-risk`（均挂 `/payment/*`）；`goBoard` 推 `/payment/board`。

- [ ] **Step 1: 改测试预期——PayNodesView 维度内聚（先红）**

`frontend/src/views/PayNodesView.test.ts`：三处 `mount(PayNodesView, { props: { dim: 'dept' }, ... })`/`{ dim: 'tier' }` 去掉 `props`（dim 改内部默认 dept）。把第一个分组用例改为不传 prop 并断言维度控件存在。替换整个 describe 体为：

```ts
describe('PayNodesView', () => {
  beforeEach(() => { setActivePinia(createPinia()); useFilterStore().setPreset('all') })

  it('渲染节点行 + 汇总条(总数/已回款/延期/待回款) + 状态徽章', () => {
    seed()
    const w = mount(PayNodesView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('节点总数')
    expect(w.text()).toContain('已回款')
    expect(w.text()).toContain('延期')
    const dt = w.findComponent(DataTable)
    expect(dt.exists()).toBe(true)
    const rows = dt.props('rows') as Array<Record<string, unknown>>
    expect(rows.length).toBe(2)
    expect(rows.some((r) => r.stage === '到货')).toBe(true)
    expect(rows.some((r) => r.status === '已回款')).toBe(true)
    expect(rows.some((r) => r.status === '延期')).toBe(true)
  })

  it('内置维度控件(SegToggle)存在，默认 dept 出部门分组与组值', () => {
    seed()
    const w = mount(PayNodesView, { global: { plugins: [ElementPlus] } })
    expect(w.find('[data-test="seg-dept"]').exists()).toBe(true)
    expect(w.text()).toContain('部门分组')
    expect(w.text()).toContain('组1')
  })

  it('空数据不崩', () => {
    const data = useDataStore()
    data.data = { projects: [], paymentNodes: {}, projectPmis: {}, naguanExclude: {} } as any
    expect(mount(PayNodesView, { global: { plugins: [ElementPlus] } }).exists()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑该测试，确认红**

```bash
cd frontend && npm run test:run -- PayNodesView
```

Expected: FAIL（`seg-dept` 不存在 / 当前仍要求 `dim` prop）。

- [ ] **Step 3: 实现 PayNodesView 维度内聚**

`frontend/src/views/PayNodesView.vue` 脚本改动：
- 第 2 行 `import { computed } from 'vue'` → `import { computed, ref } from 'vue'`
- 在 import 区补一行：`import SegToggle from '@/components/SegToggle.vue'`
- 删第 11 行 `const props = defineProps<{ dim: string }>()`，替换为：

```ts
const dim = ref<'dept' | 'stage' | 'tier' | 'progress'>('dept')
const DIM_OPTS = PAY_FACET_DIMS.map((d) => ({ value: d.key, label: d.label }))
```

- 第 32 行 `const dimField = computed(() => (props.dim === 'stage' ? 'projStage' : props.dim))` → 用 `dim.value`：

```ts
const dimField = computed(() => (dim.value === 'stage' ? 'projStage' : dim.value))
```

- 第 33 行 `props.dim` → `dim.value`：

```ts
const dimLabel = computed(() => PAY_FACET_DIMS.find((d) => d.key === dim.value)?.label ?? '维度')
```

模板：在 `<div class="nodes-tab">` 内最上方插入维度控件行：

```vue
  <div class="nodes-tab">
    <div class="pv-ctl">
      <span class="pv-label">维度</span>
      <SegToggle v-model="dim" :options="DIM_OPTS" />
    </div>
    <section class="nsum u-num">
```

`<style scoped>` 内补（取值对齐原 PayAnalysisView 的 av-ctl/av-label，全令牌）：

```css
.pv-ctl { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--gap-card); }
.pv-label { font-size: var(--fs-1); color: var(--mut); }
```

- [ ] **Step 4: 删其余三页死 dim prop**

- `frontend/src/views/PayProjectsView.vue`：删第 10 行 `const props = defineProps<{ dim?: string }>()`（`props` 全文件未引用）。
- `frontend/src/views/PayPlanView.vue`：删第 13 行 `defineProps<{ dim: string }>()`（未赋值、未引用）。
- `frontend/src/views/PayRiskView.vue`：删第 11 行 `defineProps<{ dim: string }>()`（未赋值、未引用）。

三页对应测试去掉 `props`：

- `PayProjectsView.test.ts`：三处 `mount(PayProjectsView, { props: { dim: 'dept' }/{ dim: 'tier' }, global: ... })` 删 `props:` 键，留 `{ global: { plugins: [ElementPlus] } }`。
- `PayPlanView.test.ts`：两处 `props: { dim: 'dept' }`/`{ dim: 'tier' }` 同样删。
- `PayRiskView.test.ts`：两处同样删。

- [ ] **Step 5: 跑四页测试，确认绿**

```bash
cd frontend && npm run test:run -- PayNodesView PayProjectsView PayPlanView PayRiskView
```

Expected: PASS（PayNodesView 含 seg-dept 与分组断言；其余三页去 prop 后仍绿）。

- [ ] **Step 6: 改测试预期——router 切换到 /payment/*（先红）**

`frontend/src/router/index.test.ts` 整体替换为：

```ts
import { describe, it, expect } from 'vitest'
import { router } from './index'

describe('router', () => {
  it('resolves all top-level pages', () => {
    for (const path of ['/', '/payment', '/payment/board', '/payment/projects', '/payment/nodes', '/payment/plan', '/payment/risk', '/calendar', '/ledger', '/data', '/about', '/projects', '/activity', '/insight']) {
      expect(router.resolve(path).matched.length).toBeGreaterThan(0)
    }
  })

  it('/payment/board 解析到 BoardView、/about 解析到 AboutView（非占位 PageStub）', () => {
    const p = router.resolve('/payment/board')
    const a = router.resolve('/about')
    expect((p.matched[0].components?.default as any).__name).toBe('BoardView')
    expect((a.matched[0].components?.default as any).__name).toBe('AboutView')
  })

  it('五条 /payment/* 路由各自命名', () => {
    expect(router.resolve('/payment/board').name).toBe('pay-board')
    expect(router.resolve('/payment/projects').name).toBe('pay-projects')
    expect(router.resolve('/payment/nodes').name).toBe('pay-nodes')
    expect(router.resolve('/payment/plan').name).toBe('pay-plan')
    expect(router.resolve('/payment/risk').name).toBe('pay-risk')
  })

  // 函数式 redirect 仅在导航时生效(resolve 不跟随),故用 push 后断言 currentRoute
  it('旧 /panalysis/:tab 导航 redirect 到 /payment/:tab', async () => {
    await router.push('/panalysis/plan')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-plan')
    expect(cur.redirectedFrom?.path).toBe('/panalysis/plan')
  })

  it('旧 /panalysis 缺省 redirect 到 /payment/board', async () => {
    await router.push('/panalysis')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.redirectedFrom?.path).toBe('/panalysis')
  })

  it('旧 /board 导航 redirect 到 /payment/board 并保 query(dim)', async () => {
    await router.push('/board?dim=orgL4')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-board')
    expect(cur.query.dim).toBe('orgL4')
    expect(cur.redirectedFrom?.path).toBe('/board')
  })

  it('旧 /analysis/:tab 导航 redirect 到 /payment/:tab', async () => {
    await router.push('/analysis/risk')
    const cur = router.currentRoute.value
    expect(cur.name).toBe('pay-risk')
    expect(cur.redirectedFrom?.path).toBe('/analysis/risk')
  })

  it('resolves project detail with id param', () => {
    const r = router.resolve('/project/QABJ-SS-1')
    expect(r.params.id).toBe('QABJ-SS-1')
    expect(r.name).toBe('project-detail')
  })

  it('unknown path falls back to overview', () => {
    const r = router.resolve('/nonexistent-xyz')
    expect(r.name).toBe('overview')
  })

  it('/ resolves overview and /payment resolves dashboard', () => {
    expect(router.resolve('/').name).toBe('overview')
    expect(router.resolve('/payment').name).toBe('payment')
  })
})
```

- [ ] **Step 7: 跑 router 测试，确认红**

```bash
cd frontend && npm run test:run -- router/index
```

Expected: FAIL（`pay-board` 等路由尚不存在）。

- [ ] **Step 8: 重写 router/index.ts**

删第 3 行 `import PayAnalysisView from '@/views/PayAnalysisView.vue'`，在 import 区改为引入五个目标视图（BoardView 之前未 import，需新增）：

```ts
import BoardView from '@/views/BoardView.vue'
import PayProjectsView from '@/views/PayProjectsView.vue'
import PayNodesView from '@/views/PayNodesView.vue'
import PayPlanView from '@/views/PayPlanView.vue'
import PayRiskView from '@/views/PayRiskView.vue'
```

把原 `/panalysis/:tab?` 路由（第 37 行）与原两条 redirect（第 38-40 行，`/board`、`/analysis/:tab`）整段替换为五条路由 + 三条 redirect：

```ts
    // 回款分析五页:由旧 /panalysis 单页拆为 /payment/* 平铺独立路由(SP4);均依赖 FilterBar(不 hideFilter)
    { path: '/payment/board', name: 'pay-board', component: BoardView, meta: { title: '多维看板' } },
    { path: '/payment/projects', name: 'pay-projects', component: PayProjectsView, meta: { title: '回款项目' } },
    { path: '/payment/nodes', name: 'pay-nodes', component: PayNodesView, meta: { title: '回款节点' } },
    { path: '/payment/plan', name: 'pay-plan', component: PayPlanView, meta: { title: '回款进度' } },
    { path: '/payment/risk', name: 'pay-risk', component: PayRiskView, meta: { title: '风险项目' } },
    // 兼容旧深链:/panalysis/:tab? → /payment/{tab||board}; /board、/analysis/:tab 同步映射(保 query)
    { path: '/panalysis/:tab?', redirect: (to) => ({ path: '/payment/' + String(to.params.tab || 'board'), query: to.query }) },
    { path: '/board', redirect: (to) => ({ path: '/payment/board', query: to.query }) },
    { path: '/analysis/:tab', redirect: (to) => ({ path: '/payment/' + String(to.params.tab) }) },
```

> 注意：`/payment`（DashboardView，name `payment`）一行**保留不动**；五条新路由与之平铺独立。catch-all `/:pathMatch(.*)*` 仍为最后一条。

- [ ] **Step 9: 删除 PayAnalysisView 及其测试**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git rm frontend/src/views/PayAnalysisView.vue frontend/src/views/PayAnalysisView.test.ts
```

- [ ] **Step 10: 更新 nav.ts 与 navContext.ts**

`frontend/src/nav.ts` 的 `PAYMENT_LINKS`（第 29-34 行）替换为：

```ts
export const PAYMENT_LINKS: NavLink[] = [
  { label: '回款总览', to: '/payment' },
  { label: '多维看板', to: '/payment/board' },
  { label: '回款项目', to: '/payment/projects' },
  { label: '回款节点', to: '/payment/nodes' },
  { label: '回款进度', to: '/payment/plan' },
  { label: '风险项目', to: '/payment/risk' },
  { label: '回款日历', to: '/calendar' },
  { label: '回款台账', to: '/ledger' },
]
```

`frontend/src/lib/navContext.ts` 第 5 行 `/panalysis/board` → `/payment/board`：

```ts
  router.push({ path: '/payment/board', query: { dim } })
```

- [ ] **Step 11: 更新 navContext / OrgRanking 测试**

`frontend/src/lib/navContext.test.ts`：用例标题与断言路径改为 `/payment/board`：

```ts
  it('push 到 /payment/board 并带 dim query', () => {
    const router = { push: vi.fn() } as any
    goBoard(router, 'orgL4')
    expect(router.push).toHaveBeenCalledWith({ path: '/payment/board', query: { dim: 'orgL4' } })
  })
```

`frontend/src/components/OrgRanking.test.ts` 第 90、95 行：

```ts
  it('点击排名行跳转 /payment/board（orgL4 维度）', async () => {
    seed()
    pushSpy.mockClear()
    const w = mount(OrgRanking)
    await w.findAll('.rank-item')[0].trigger('click')
    expect(pushSpy).toHaveBeenCalledWith({ path: '/payment/board', query: { dim: 'orgL4' } })
  })
```

- [ ] **Step 12: 更新 AppSidebar.test.ts**

`frontend/src/layout/AppSidebar.test.ts` 的 makeRouter 把 `/panalysis/:tab?` 桩替换为新路径（保证 RouterLink `to` 有匹配路由；catch-all 已兜底，仍显式列出主路径）：

```ts
function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'dashboard', component: { template: '<div/>' } },
      { path: '/payment', component: { template: '<div/>' } },
      { path: '/payment/board', component: { template: '<div/>' } },
      { path: '/calendar', component: { template: '<div/>' } },
      { path: '/ledger', name: 'ledger', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
}
```

第一个用例的回款组断言改为反映八项（'多维看板' 现应出现、'回款分析' 退场、`.nav-sub` 计 8）：

```ts
    expect(text).toContain('回款总览')        // 回款组：旧首页收编更名
    expect(text).toContain('多维看板')        // SP4 拆分:回款分析单入口拆为独立页
    expect(text).toContain('回款项目')
    expect(text).toContain('回款节点')
    expect(text).toContain('回款进度')
    expect(text).toContain('风险项目')
    expect(text).toContain('回款日历')
    expect(text).toContain('数据管理')        // 工具组
    expect(text).not.toContain('看板首页')    // 旧 label 退场
    expect(text).not.toContain('回款分析')    // SP4 拆分后单入口退场
    // 回款组为低一级呈现;SP4 拆分后为 8 项
    expect(wrapper.findAll('.nav-sub').length).toBe(8)
```

（删除原第 42 行 `expect(text).not.toContain('多维看板')` 这条，与新断言冲突。）

- [ ] **Step 13: bump 版本**

`frontend/src/version.ts` 第 2 行：

```ts
export const APP_VERSION = 'V1.13.0'
```

（`RELEASE_DATE` 保持 `'2026-06-19'`。）

- [ ] **Step 14: 全量 verify**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && bash verify.sh
```

Expected: ruff / pytest / typecheck / vitest / build 全绿。重点确认 router/index、navContext、OrgRanking、AppSidebar、四个 PayXView 套件全通过，且无对 `PayAnalysisView`/`@/components/{ProjectsOverviewTab,TierNodesTab,PlanTab,RiskTab}` 的悬挂引用（typecheck/build 会抓）。

- [ ] **Step 15: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add frontend/src/views/PayNodesView.vue frontend/src/views/PayNodesView.test.ts \
        frontend/src/views/PayProjectsView.vue frontend/src/views/PayProjectsView.test.ts \
        frontend/src/views/PayPlanView.vue frontend/src/views/PayPlanView.test.ts \
        frontend/src/views/PayRiskView.vue frontend/src/views/PayRiskView.test.ts \
        frontend/src/router/index.ts frontend/src/router/index.test.ts \
        frontend/src/nav.ts frontend/src/lib/navContext.ts frontend/src/lib/navContext.test.ts \
        frontend/src/components/OrgRanking.test.ts frontend/src/layout/AppSidebar.test.ts \
        frontend/src/version.ts
git rm frontend/src/views/PayAnalysisView.vue frontend/src/views/PayAnalysisView.test.ts
git commit -m "$(cat <<'EOF'
feat(SP4): /panalysis 五页拆为 /payment/* 平铺路由,维度控件仅留 nodes (V1.13.0)

- 删 PayAnalysisView(tab 宿主),五页独立: /payment/{board,projects,nodes,plan,risk}
- nodes 内聚维度 SegToggle; plan/risk/projects 删声明未用的死 dim prop
- 旧 /panalysis/:tab?、/board、/analysis/:tab 兼容 redirect 到新路径(保 query)
- 侧栏「回款」展开 8 项; goBoard → /payment/board

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage（逐节核对 spec → 任务）：**
- spec §2 路由表（5 路由 + 3 redirect、不 hideFilter、catch-all 末尾） → Task2 Step8 ✓
- spec §3 组件归位 + 删 PayAnalysisView → Task1（git mv）+ Task2 Step9 ✓
- spec §4 维度仅 nodes 内聚 → Task2 Step3；三页删死 prop → Step4 ✓
- spec §5 侧栏 8 项 + goBoard → Task2 Step10 ✓
- spec §6 测试（router/navContext/OrgRanking/AppSidebar + 四 view + 删 PayAnalysisView.test + nodes seg 断言） → Task1 Step4-5 + Task2 Step1/6/11/12 ✓
- spec §7 版本 V1.13.0 + verify → Task2 Step13-14 ✓

**2. Placeholder scan：** 无 TBD/TODO/"类似 TaskN"；每个代码步骤含完整代码块。✓

**3. Type/名称一致性：** 路由名 `pay-board/pay-projects/pay-nodes/pay-plan/pay-risk` 在 Step8（定义）与 Step6（断言）一致；view 名 `PayProjectsView/PayNodesView/PayPlanView/PayRiskView` 在 Task1（git mv + import）与 Task2（router import + 测试）一致；`SegToggle` v-model 用 `modelValue`/`update:modelValue`（组件实现匹配），`data-test="seg-dept"` 与 SegToggle 模板的 `seg-${o.value}` 一致；`DIM_OPTS` 用 `{value,label}` 与 SegToggle `options` 类型一致。✓

> 已知小账（不在本轮）：OrgRanking `.rank-item` 散值、`.org-list` scrollbar-gutter（SP5/收尾再处理）；本轮关闭 backlog「ProjectsOverviewTab props.dim 清理」。
