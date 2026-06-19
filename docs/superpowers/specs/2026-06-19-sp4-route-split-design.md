# SP4 /panalysis 五页拆分 设计

> 大需求 5 子项目中的 **SP4**。依赖 SP1（异常排除）、SP2（日期范围+流水口径，V1.11.0）、SP3（/payment 重做，V1.12.0）均已合并。SP5（/payment/board 重做）在后。
> 对应原始需求：「/panalysis 五页单独拆分；/panalysis/board 更改路由为 /payment/board」。

**日期:** 2026-06-19
**版本:** V1.13.0（Y 级：路由结构整页级调整 + 新增 4 条独立页面路由）
**范围:** 把 `/panalysis/:tab?` 单路由（PayAnalysisView 内 tab 切换 5 组件）拆为 `/payment/*` 下五条独立平铺路由，去掉顶部 tab 栏，组件归位到 views/，共享维度 prop 下沉为各页内部状态，侧栏「回款」分组直列，保留旧路径 redirect。**纯前端、纯结构搬迁，不动任何回款计算口径与数据层。**

---

## 1. 已敲定决策（brainstorm）

1. **导航/路由模型 = /payment/* 平铺、去 tab 栏**（用户在 A/B/C 三选中选 A）。五页全部落 `/payment/*`，侧栏「回款」分组各列一项，删除顶部 av-tabs 栏。
2. **组件归位**：四个 facet 组件（`ProjectsOverviewTab`/`TierNodesTab`/`PlanTab`/`RiskTab`）`git mv` 重命名进 `views/`（"Tab" 名已失真，且 views/ 是本项目路由页约定）；`BoardView.vue` 已是 view，直接挂 `/payment/board`；删除 `PayAnalysisView.vue`（tab 栏宿主）。
3. **维度控件下沉**：nodes/plan/risk 三页 `dim` 由原 prop 改为页内 `ref('dept')` + 各自渲染 `SegToggle`，**每页独立、默认 dept、切页不串**（无跨页持久化需求，YAGNI）。`回款项目` 页无维度控件（`ProjectsOverviewTab.dim?` 声明但从未使用，删 prop 干净）。
4. **保留 redirect**：旧 `/panalysis/:tab?`、`/board`、`/analysis/:tab` 全部 redirect 到新 `/payment/*`，保深链与 query。

---

## 2. 路由表（`router/index.ts`）

删除 `{ path: '/panalysis/:tab?', name: 'panalysis', component: PayAnalysisView }`。新增五条（均**不** hideFilter，依赖 FilterBar，与原 /panalysis 一致）：

| path | name | 组件 | meta.title |
|---|---|---|---|
| `/payment/board` | `pay-board` | `BoardView` | 多维看板 |
| `/payment/projects` | `pay-projects` | `PayProjectsView` | 回款项目 |
| `/payment/nodes` | `pay-nodes` | `PayNodesView` | 回款节点 |
| `/payment/plan` | `pay-plan` | `PayPlanView` | 回款进度 |
| `/payment/risk` | `pay-risk` | `PayRiskView` | 风险项目 |

- `/payment`（`DashboardView`，回款总览）不变；`/payment/*` 子路径与之是平铺独立路由（非嵌套），互不冲突。
- catch-all `/:pathMatch(.*)*` 仍为最后一条；五条新路由在其之前。
- `import PayAnalysisView` 行删除，新增 4 个 view 的 import（BoardView 已 import）。

### Redirect（保旧深链，替换原 /board、/analysis/:tab 两条）

```ts
// /panalysis/:tab? → /payment/{tab||board}（保 query）
{ path: '/panalysis/:tab?', redirect: (to) => ({ path: '/payment/' + String(to.params.tab || 'board'), query: to.query }) },
// /board → /payment/board（保 query，含 dim）
{ path: '/board', redirect: (to) => ({ path: '/payment/board', query: to.query }) },
// /analysis/:tab → /payment/:tab
{ path: '/analysis/:tab', redirect: (to) => ({ path: '/payment/' + String(to.params.tab) }) },
```

> 注意 redirect 的 `/panalysis/:tab?` 与被删的同名 `name: 'panalysis'` 路由互斥——删 component 路由、加 redirect 路由，name 不再存在（测试里凡断言 `name === 'panalysis'` 的改判 `redirectedFrom`/新 name）。

---

## 3. 组件归位（views/）

`git mv` 重命名（保 git 历史），同步改文件内 import 路径与对应 `.test.ts`：

| 原文件 | 新文件 | 变更 |
|---|---|---|
| `components/ProjectsOverviewTab.vue` | `views/PayProjectsView.vue` | 删 `defineProps<{ dim?: string }>()`（未使用） |
| `components/TierNodesTab.vue` | `views/PayNodesView.vue` | `dim` prop → 内部 `ref` + SegToggle（见 §4） |
| `components/PlanTab.vue` | `views/PayPlanView.vue` | 同上 |
| `components/RiskTab.vue` | `views/PayRiskView.vue` | 同上 |
| `views/PayAnalysisView.vue` | **删除** | tab 栏宿主，不再需要 |
| `views/PayAnalysisView.test.ts` | **删除** | 随 view 删 |
| `views/BoardView.vue` | （不动） | 直接挂 `/payment/board` |

- 四个 `.test.ts` 均存在，随之 `git mv` 改名（`ProjectsOverviewTab.test.ts`→`PayProjectsView.test.ts`、`TierNodesTab.test.ts`→`PayNodesView.test.ts`、`PlanTab.test.ts`→`PayPlanView.test.ts`、`RiskTab.test.ts`→`PayRiskView.test.ts`），更新内部 import 与 mount 目标。
- `PayProjectsView` 的模板根 class、`PlanTab` 的 `TABLE_ID = 'panalysis-progress'` 等内部标识**保持不变**（非路由，改了反而增加 crossFilter 等隐性耦合风险；本轮不碰）。

---

## 4. 维度控件下沉（`PayNodesView` / `PayPlanView` / `PayRiskView`）

原 `PayAnalysisView` 顶部共享一个 `SegToggle`（`v-model="dim"`，选项来自 `PAY_FACET_DIMS`），经 prop 下传三页。拆分后该控件随 view 各自内置：

- 三页脚本：删 `defineProps<{ dim: string }>()`，改 `const dim = ref<'dept'|'stage'|'tier'|'progress'>('dept')`；`import { ref } from 'vue'`、`import SegToggle from '@/components/SegToggle.vue'`、`import { PAY_FACET_DIMS } from '@/lib/paymentPmis'`（PlanTab/RiskTab 已 import paymentPmis，仅补 PAY_FACET_DIMS）。
- 三页模板顶部加一行维度控件：

```vue
<div class="pv-ctl">
  <span class="pv-label">维度</span>
  <SegToggle v-model="dim" :options="DIM_OPTS" />
</div>
```

其中 `const DIM_OPTS = PAY_FACET_DIMS.map((d) => ({ value: d.key, label: d.label }))`。样式 `.pv-ctl`/`.pv-label` 复用原 `PayAnalysisView` 的 `.av-ctl`/`.av-label` 取值（间距/字号用令牌，不手写散值）。

- `PayProjectsView`：无维度控件，仅删 `dim?` prop，其余不动。

---

## 5. 侧栏（`nav.ts` `PAYMENT_LINKS`）

单入口「回款分析」`→ /panalysis/board` 展开为八项：

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

`navContext.goBoard` 改推 `/payment/board`：

```ts
export function goBoard(router: Router, dim: string): void {
  router.push({ path: '/payment/board', query: { dim } })
}
```

---

## 6. 测试

| 文件 | 变更 |
|---|---|
| `router/index.test.ts` | 五条新路径 resolve（name = `pay-board`/`pay-projects`/…，组件非 PageStub）；三条 redirect（`/panalysis/plan`→`/payment/plan`、`/panalysis`→`/payment/board`、`/board?dim=orgL4`→`/payment/board` 保 query、`/analysis/plan`→`/payment/plan`），断言 `redirectedFrom.path`；删除原断言 `name==='panalysis'` 的用例 |
| `lib/navContext.test.ts` | 期望 `push({ path: '/payment/board', query: { dim } })` |
| `components/OrgRanking.test.ts` | 点击排名行期望跳 `/payment/board?dim=orgL4` |
| `layout/AppSidebar.test.ts` | 路由桩 `/panalysis` → 八条 `/payment/*` + `/calendar`/`/ledger`；断言侧栏渲染新链接 |
| `views/PayAnalysisView.test.ts` | **删除** |
| 四个改名 view 的 `.test.ts` | 随 `git mv` 改名 + 更新 import；原靠 `:dim` prop 驱动分组的用例改为驱动内部 SegToggle（或断言默认 dept 分组）；nodes/plan/risk 各加「维度控件（SegToggle）存在」断言 |

---

## 7. 版本 / 验证 / 边界

- 版本：`frontend/src/version.ts` → `V1.13.0` / `2026-06-19`。
- 验证：`bash verify.sh` 全绿（ruff/pytest/typecheck/vitest/build）；手动 `python server.py` + `npm run dev`，逐项点侧栏八项均到对应页、FilterBar 联动、维度控件在 nodes/plan/risk 各自生效且切页不串；旧 `/panalysis/board`、`/board?dim=orgL4`、`/analysis/plan` 仍跳到新路径；从 OrgRanking 点击仍进 /payment/board。
- 边界（不在本轮）：/payment/board 排名维度·指标·柱状图重做（SP5）；任何回款计算口径/数据层/schema 变更（纯结构搬迁，口径完全沿用 SP2/SP3）。
- backlog 联动：本轮关闭「ProjectsOverviewTab props.dim 清理」一项。
