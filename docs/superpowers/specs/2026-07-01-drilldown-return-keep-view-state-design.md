# 下钻返回保持视图状态 设计（V2.5.9）

> 日期：2026-07-01　版本：V2.5.9（Z 级：交互行为局部调整，非新增/整页重做）　范围：纯前端
> 状态：设计已获用户口头批准（“方案可以”），本文为落地规格，待用户复核后进入 writing-plans。

## 1. 目标与背景

**用户诉求**：在列表页设置筛选条件后，点击某行「下钻」进入详情页，看完返回，筛选条件默认丢失（被重置）。希望**下钻返回后保持原筛选条件**；而从左侧菜单重新点进该页时，仍恢复为默认（干净）状态。

用户已确认两点行为取向：
- **恢复范围 = 完整视图**：筛选 + 排序 + 分页 + 滚动位置一并恢复，完全回到下钻前离开时的样子。
- **保持时机 = 仅下钻返回时**：从详情/下钻返回时沿用原状态；从左侧菜单重新进入则恢复默认。

**根因（调查实证）**：
1. `AppLayout.vue:21` 裸用 `<router-view />`，全站无 `<keep-alive>`。下钻跳走后列表组件被销毁，返回时重建，所有组件内局部筛选态（搜索词、排序、分页、KPI 就地筛选、售前/超支/标签等特殊筛选、里程碑时间段/tab）在 setup/onMounted 重跑时回到初值。
2. 列头筛选虽存于全局 Pinia `crossFilter`（进程内、跨路由存活），但 `ProjectsView / CostDetailView / ClosedProjectsView / MilestoneReminderTab` 在 setup 顶层 `cf.clearAll(TABLE_ID)`，每次进页即清空。

## 2. 覆盖范围

**纳入（下钻走路由跳转的列表页，共 6 个路由视图）**：

| 路由 name | 组件 | 下钻目标 | crossFilter TABLE_ID | 现有 setup clearAll |
|---|---|---|---|---|
| `projects` | `ProjectsView` | `/project/:id` | `projects-active` | 有（L85，随后按 query 重建） |
| `insight-costdetail` | `CostDetailView` | `/project/:id` | `cost-detail`（另有 `cost-l4-summary`） | 有（L34，仅清 `cost-detail`） |
| `closed-projects` | `ClosedProjectsView` | `/closed-project/:id` | `projects-closed` | 有（L20） |
| `projects-key` | `KeyProjectsView` | `/project/:id` | `key-projects` | **无** |
| `temp-followup` | `TempFollowupView` | `/project/:id` | `temp-followup` | **无** |
| `insight-milestone` | `MilestoneView`（含 3 个 tab 子组件） | `/project/:id` | 仅子组件 `MilestoneReminderTab` 用 `milestone-reminder` | 子组件有（Tab L21） |

**不纳入（无路由级下钻，状态本就不丢，改动无意义）**：
- 商机清单 `OpportunitiesView`、重点商机跟进 `OpportunityFollowupView`：点行开**编辑抽屉**，不跳路由。
- 风险跟进 `RiskFollowupView`（`/risk`）：无行下钻。
- 回款各页 / 台账 / 首页等：无「筛选 + 路由下钻」组合。

## 3. 行为契约（验收口径）

| 进入方式 | 期望结果 |
|---|---|
| 列表设筛选/排序/分页/滚动 → 下钻详情 → 浏览器返回 | **完整恢复**（含滚动位置），无骨架闪动、瞬时呈现 |
| 详情页 404 分支点「← 返回列表」（push 回原列表） | 同「下钻返回」，**保持**（视为一次返回，见 §4.2） |
| 左侧菜单点进该页 | 重置为默认（干净） |
| 首页 KPI 卡深链进入（带 query，如 `/projects?presale=1`） | 重置 + 套用深链筛选（现 `ProjectsView` 逻辑不变） |
| 从详情页点**其它**列表页菜单（跨列表） | 目标页重置（不保持其历史筛选） |
| 页内「清除所有筛选」按钮 | 照常清空（不变） |
| 登出 / 换号后再进入 | 一律默认（缓存已随全屏切换销毁，见 §4.4） |
| 点「更新数据」后 | 保留现有筛选，数据响应式重算（与当前一致） |

## 4. 技术方案

四个部件：**选择性 keep-alive**（保状态）＋ **集中式返回判定 + key token**（区分返回/菜单并触发重置）＋ **滚动记忆 composable**（容器级滚动恢复）＋ **账号隔离护栏**。

### 4.1 选择性 keep-alive（`AppLayout.vue`）

把 `v-else` 分支内的 `<router-view />` 改为 v-slot + keep-alive 模式，**仅 include 6 个目标组件名**（详情页不在 include → 按 id 每次新建，行为不变）：

```vue
<main class="app-main">
  <FilterBar v-if="showFilter" />
  <router-view v-slot="{ Component, route }">
    <keep-alive :include="KEEPALIVE_COMPONENTS" :max="10">
      <component :is="Component" :key="viewKey(route)" />
    </keep-alive>
  </router-view>
</main>
```

- `KEEPALIVE_COMPONENTS`：`['ProjectsView','CostDetailView','ClosedProjectsView','KeyProjectsView','TempFollowupView','MilestoneView']`（来自 `viewReturn.ts`）。
- `include` 按**组件 name**匹配 → 6 个 SFC 各补 `defineOptions({ name: '...' })`。
- `viewKey(route)`：keep-alive 路由 → `` `${route.name}:${token(route.name)}` ``；其余（含详情页）→ `String(route.name)`（保持详情页“同组件复用 + watch(route.params.id)”的现状，不按 fullPath 强制重建）。
- `:max="10"`：token 递增会产生新 key，旧 key 实例不再被激活、由 LRU 淘汰，`max` 为其兜底上限。
- 全屏分支 `<router-view v-if="fullscreen" />`（登录/改密）**保持裸渲染、不缓存**。

### 4.2 集中式返回判定 + key token（`lib/viewReturn.ts` + `router/index.ts` afterEach）

**核心：不在下钻点逐个埋标记，改由 afterEach 从导航模式推断。**

`lib/viewReturn.ts`：
```ts
import { reactive } from 'vue'

export const KEEPALIVE_ROUTES = ['projects','insight-costdetail','closed-projects','projects-key','temp-followup','insight-milestone']
export const KEEPALIVE_COMPONENTS = ['ProjectsView','CostDetailView','ClosedProjectsView','KeyProjectsView','TempFollowupView','MilestoneView']
const DETAIL_ROUTES = ['project-detail','closed-project-detail']

const tokens = reactive<Record<string, number>>({})
let armed: { view: string; detail: string } | null = null

export function isKeepAliveRoute(name?: unknown): boolean {
  return typeof name === 'string' && KEEPALIVE_ROUTES.includes(name)
}
function isDetailRoute(name?: unknown): boolean {
  return typeof name === 'string' && DETAIL_ROUTES.includes(name)
}

// 在 router.afterEach 调用：先登记（离开列表进详情），再解析（到达列表判定返回/菜单）
export function trackNavigation(
  toName: unknown, toIsKeepAlive: boolean,
  fromName: unknown, fromFullPath: string,
): void {
  // 登记：从 keep-alive 列表跳进详情 → 记住 {列表, 详情路径}
  if (isKeepAliveRoute(fromName) && isDetailRoute(toName)) {
    armed = { view: String(fromName), detail: '' } // detail 由到达时的 from.fullPath 校验，见下
  }
  // 到达 keep-alive 列表：命中“上一跳正是刚离开去的详情”→ 保持；否则 bump token 触发重置
  if (toIsKeepAlive) {
    const isReturn = !!armed && armed.view === String(toName) && isDetailRoute(fromName)
    armed = null
    if (!isReturn) tokens[String(toName)] = (tokens[String(toName)] ?? 0) + 1
  }
}

export function token(name: string): number { return tokens[name] ?? 0 }

export function viewKey(name?: unknown): string {
  const n = String(name ?? '')
  return isKeepAliveRoute(n) ? `${n}:${token(n)}` : n
}

// 供测试重置内部状态
export function __resetViewReturn(): void {
  armed = null
  for (const k of Object.keys(tokens)) delete tokens[k]
}
```

> 说明：判定“返回”的充分条件 = **上一跳（`from`）是详情路由** 且 **该详情正是刚从本列表下钻过去的那个**（`armed.view === toName`，且 `armed` 未被中间的其它 keep-alive 到达清除）。这样：
> - 真·下钻返回（`projects → /project/A → projects`）：命中 → 不 bump → 缓存实例被激活恢复。
> - 菜单进入（`from` 非详情，或 `armed` 不匹配）：bump token → key 变化 → **新实例挂载 = setup 重跑 = 自动重置**（含各页 `clearAll` 与本地态默认值）。
> - 跨列表（在 `/project/A` 点“成本分析”菜单）：`armed.view='projects' ≠ 'insight-costdetail'` → bump → 目标页重置。正确。
> - 详情 404 分支 push 回原列表：`from` 仍是详情路由、`armed.view` 匹配 → 保持。符合 §3。
> 不依赖“浏览器返回 vs push 返回”的差异，两种返回都可靠。

`router/index.ts`：在现有 `beforeEach` 之后新增
```ts
router.afterEach((to, from) => {
  trackNavigation(to.name, isKeepAliveRoute(to.name), from.name, from.fullPath)
})
```
> `armed.detail` 字段本设计未参与最终校验（改用 `isDetailRoute(fromName)` + `armed.view` 匹配即足够精确），实现时可省去 detail 字段，仅保留 `armed.view`。此处按最简实现：`armed` 退化为“刚从哪个列表下钻出去了”，到达列表时若 `from` 是详情且等于该列表则判返回。

### 4.3 滚动记忆 composable（`lib/useViewScrollMemory.ts`）

`.app-main` 是滚动容器（在布局层、keep-alive 缓存范围之外），keep-alive 不会自动恢复它，需手动存取。用组件自身“新挂载 vs 缓存激活”的差异区分返回/菜单，无需再读 afterEach：

```ts
import { nextTick, onActivated, onDeactivated, onMounted } from 'vue'

export function useViewScrollMemory(): void {
  let saved = 0
  let fresh = false
  const el = () => document.querySelector('.app-main') as HTMLElement | null
  onMounted(() => { fresh = true })          // 新实例（菜单/深链/首次）
  onDeactivated(() => { const e = el(); if (e) saved = e.scrollTop })  // 下钻离开：存
  onActivated(() => {
    if (fresh) { fresh = false; return }     // 新挂载：菜单进入，保持在顶部
    // 缓存被激活 = 下钻返回：恢复滚动
    nextTick(() => { requestAnimationFrame(() => { const e = el(); if (e) e.scrollTop = saved }) })
  })
}
```
- 菜单进入触发 key bump → **新实例** → `onMounted` 置 `fresh=true` → `onActivated` 见 `fresh` → 不恢复（顶部）。
- 下钻返回 key 不变 → **缓存实例激活** → `onActivated` 见 `!fresh` → 恢复 `saved`。
- 缓存 DOM 已完整布局（含 V2.5.8 延迟渲染早已 ready），`nextTick + rAF` 后写 `scrollTop` 生效。
- 测试/非 keep-alive 挂载：`onActivated/onDeactivated` 不会被调用；`.app-main` 不存在时空操作。无副作用。

### 4.4 账号隔离护栏（P0）

- **主机制（结构性、自动）**：登出 → `router.push('/login')`；`/login` 的 `meta.fullscreen` 使 `AppLayout` 走 `v-if="fullscreen"` 分支，**承载 keep-alive 的 `v-else` 整块卸载 → 所有缓存实例销毁**。重新登录 → `/` → `v-else` 重建 → 空缓存。换号（必经 `/login`）同理。改密页 `/change-password` 亦 fullscreen，一致。
- **显式护栏（防御纵深）**：在 keep-alive 外再挂 `:key="auth.user?.account ?? 'anon'"`（或对 `v-else` 容器加同 key），account 变化即强制重建 keep-alive、清空缓存。即便将来出现不经全屏页的换号路径也不泄漏。
- 业务数据本身：登录/登出已 `useDataStore().reset()` 等（`stores/auth.ts`），缓存实例的 computed 依赖全局 store，重登后重算；本护栏额外保证**本地筛选态/已选 L4** 等组件内状态不跨账号残留。

### 4.5 一致性微调：KeyProjectsView / TempFollowupView 增加 setup 级 clearAll

这两页当前 setup **无** `cf.clearAll`，其列头筛选依赖 crossFilter 全局态、跨菜单导航本就保留（现状）。为与统一行为契约（**菜单进入=重置**）一致：
- 在两页 setup 顶层新增 `cf.clearAll(TABLE_ID)`。
- 效果：菜单进入（key bump → 新实例 → setup 重跑）→ 列头筛选重置；下钻返回（缓存激活、setup 不重跑）→ 列头筛选保持。
- 两页无 route.query 重建逻辑，新增 clearAll 安全无副作用。

> **⚠️ 行为变化提示（供用户复核）**：此举改变 KeyProjectsView/TempFollowupView 的现状——原先“从菜单再次进入仍保留上次列头筛选”，改为“菜单进入即重置”。这是为贯彻用户钦定的“菜单=重置”，若用户希望这两页维持“始终保留”，可单独豁免（不加 clearAll）。默认按统一契约实现。

### 4.6 各页 resetView 的落地方式

本方案**不写显式 per-page resetView 函数**：菜单进入通过 key token 触发**整组件新挂载**，setup 自然重跑 = 复位所有本地 ref/reactive 到初值 + 执行 setup 内 `clearAll`。这天然覆盖：
- ProjectsView：`sp`、分页、并重跑 L84-98 的 query 重建（深链仍生效）。
- CostDetailView：`fKw/kpiFilter/sortState`、分页、`clearAll('cost-detail')`。
- ClosedProjectsView：`search`、分页、`clearAll`。
- KeyProjectsView / TempFollowupView：`mode/historyIdx`、模态态，+ 新增 `clearAll`（§4.5）。
- MilestoneView：图表控件 `faGran/faYear/nodeYear`、`detailTab→'delayed'`、模态态；其 v-if tab 子组件随之新挂载重置（`MilestoneReminderTab` 的 `clearAll('milestone-reminder')` 在其被激活时重跑）。

`cost-l4-summary` 不在任何 clearAll 中（现状即从不在进页清除），维持不变，非回归。

## 5. 与 V2.5.8 的关系

- `useDeferredMount`（onMounted + 双 rAF）：菜单进入=新挂载 → 照常先骨架后内容（同今日）；下钻返回=缓存激活 → 内容已在、`ready` 已 true → **瞬时呈现，无骨架**（优于今日）。无冲突。
- `ChartBox` IntersectionObserver 懒渲染：已渲图缓存保留；未进视口的图返回后仍待滚动触发。无冲突。
- 性能净效果：菜单进入 = 今日水平；下钻返回 = 更快（不重建）。无退化。

## 6. 测试策略（TDD）

- **`viewReturn.ts` 单元测试**（纯函数/状态机，主战场）：
  - list→detail→同 list（`from` 为该详情）：token 不变（保持）。
  - 任意非详情 `from` 到达 list：token +1（重置）。
  - 跨列表：detail→其它 list：目标 token +1。
  - 中间到达另一 keep-alive 列表后 `armed` 被清：随后回原 list 不误判为返回。
  - `viewKey`：keep-alive 路由带 token 后缀；详情/其它路由 = 原 name。
  - `isKeepAliveRoute` 边界（undefined/非字符串）。
- **`useViewScrollMemory.ts`**：以最小宿主组件在 `<KeepAlive>` 下挂载/停用/再激活，断言 `.app-main`（测试内注入一个 mock 容器）scrollTop 的“菜单不恢复/返回恢复”分支；jsdom 无 rAF 时以 `MODE==='test'` 或 rAF 存在性回退（与 useDeferredMount 一致处理）。
- **回归**：现有 6 页视图单测（含同步断言的 CostDetail/Milestone/Projects 等）在补 `defineOptions({name})` + `useViewScrollMemory()` 后必须仍全绿（composable 在无 keep-alive 挂载下不触发 onActivated、`.app-main` 缺失即空操作，理论无影响，须实测确认）。
- **AppLayout**：若有既有测试，新增断言 keep-alive 包裹且 include 正确、fullscreen 分支不受影响；否则补一条轻量渲染测试。
- **真机冒烟**（puppeteer + 系统 Chrome，沿用既有手法）三主路径：
  1. 某页设列头筛选+排序+滚动 → 下钻 `/project/:id` → 浏览器返回 → 断言筛选/排序/滚动完整恢复。
  2. 同页从左侧菜单再次进入 → 断言恢复默认（筛选清空、滚动置顶）。
  3. 登出→换另一账号登录→进入该页 → 断言默认、无上一账号残留。

## 7. 验证与交付

- `bash verify.sh` 全绿（语法/ruff/pytest 不涉改动但需通过；前端 typecheck/vitest/build 为主）。
- 版本：`frontend/src/version.ts` → `V2.5.9`（Z 级，用户已确认非大版本）。
- 纯前端、**零后端 / 零 schema / 零依赖 / 无新页 / 无新 pageKey** → 升级不需点「更新数据」。
- 交付：源码提交 + `release/pmplatform-update-V2.5.9.zip`（从 V2.5.8 单版增量）+ `deploy/升级手册-V2.5.9.md` + `PROGRESS.md`。打包遵循既定坑：先 PowerShell `npx vite build --base=/pm/` → `python make_update_zip.py` → `npx vite build` 重建默认 base。

## 8. 风险与边界

| 风险 | 处置 |
|---|---|
| keep-alive 令 setup 只跑一次，破坏“每次进页刷新”假设 | 6 页均从全局 store 派生（响应式），无“仅 onMounted 拉数据到本地 ref”的隐患；菜单进入=新挂载仍会重跑。逐页在 review 核实。 |
| 账号残留（P0） | §4.4 双保险（全屏卸载 + account key）。冒烟第 3 条强验。 |
| token 递增致缓存膨胀 | `:max=10` LRU 兜底；旧 key 实例不再激活，优先被淘汰。 |
| 里程碑 tab v-if 懒渲染下的子态重置 | 菜单进入=父新挂载→默认 tab 新挂载；其余 tab 待用户切换时其 setup 重跑重置。已论证可接受。 |
| 详情页 `watch(route.params.id)` 现状 | 详情页不入 include、key 仍按 name → 复用+watch 行为不变，非回归。 |
| KeyProjects/Temp 现状“菜单保留”被改为“菜单重置” | §4.5 已显式标注，供用户复核；默认按统一契约。 |

## 9. 自审（spec self-review）

- 占位符：无 TBD/TODO；关键代码给出可直接落地的实现骨架。
- 内部一致：行为契约（§3）↔ 判定逻辑（§4.2）↔ 测试（§6）三处口径一致；覆盖页面（§2）↔ 各处引用一致。
- 歧义：§4.5 的行为变化已显式点名并给豁免选项，交用户裁决；其余按已批准的“菜单=重置、下钻=保持”单义实现。
- 范围：单一功能、纯前端、6 页 + 3 个小文件（新增 `viewReturn.ts`/`useViewScrollMemory.ts` + 改 `router/index.ts`/`AppLayout.vue`/6 视图/2 视图加 clearAll），适合一个实现计划。
