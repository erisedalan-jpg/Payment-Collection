# filterStore 收窄为回款域专用 + 首页筛选脱钩（V4.5.3）设计

> 状态：待实施　｜　版本：V4.5.3（Z 级，待用户最终确认）　｜　日期：2026-07-27
> 归属：整体前端优化 **第三期「按域迁筛选」**。该期曾于 2026-07-27 被并入第四期权限重构（V4.5.2）一起排期，
> 但**并入的只是排期、不是工作量** —— V4.5.2 未做本期任何实质改动，backlog 条目继续挂起至今。
> 前置：backlog「第三期按域迁筛选」已完成 grill 与方向选型（用户选「乙」），本设计是其落地方案。

## 1. 要解决什么

`filterStore` 是全局单例，里面混着**两类性质不同**的状态：

- ① **全局配置**：`excludeOn` / `excludeTags` / `excludedIds`（按标签排除项目）—— 在 `/data` 页配置、全站多域消费，**该全局，拆了反而错**
- ② **回款域页面级筛选**：`dateStart` / `dateEnd` / `viewMode` / `viewL4` / `viewPM` —— 只服务回款域

混在一个 store 里的直接后果：**首页 `OverviewView` 消费了本不该它消费的 ②**。

### 1.1 首页那处不是"无提示"，是标签与数据不符

backlog 原记录为「首页看到的是被筛过的数据但没有任何筛选条件提示，无从知道数据被筛过」。**全量核对后，实际情况比这更明确**：

`OverviewView.vue:196-197` 的文案**写死**「年度回款进度」：

```
<div class="ov-pay-v u-num">{{ fmtWan(band.yearActual) }} / {{ fmtWan(band.yearExpected) }} 万</div>
<div class="ov-pay-k">年度回款进度</div>
```

而数值来自 `paymentBand(..., filter.dateStart, filter.dateEnd)`。`lib/overview.ts:112-114` 内部：

```
const hasRange = !!(start || end)
const planInScope = (planDate) => hasRange ? inRange(planDate, start, end) : planDate.startsWith(year)
```

→ 用户在 `/payment` 点了「本季」，首页这一行显示的是**本季数字、顶着"年度"的标签**。这是**错标**，不只是缺提示。

**平时看不出来的原因**：`filterStore` 的 `dateStart`/`dateEnd` 默认值恰好是本年 1/1–12/31，与年度口径同值。错标只在用户动过筛选后浮现，且首页无 FilterBar，用户无从察觉、更无从改回。

## 2. 事实基础（已全量核对，勿凭记忆重推）

### 2.1 FilterBar 的显示范围本就已经收窄好了

`router/index.ts` 全部路由中，**不带 `hideFilter: true` 的恰好 5 个，且全部是回款域**：

| 路由 | 组件 |
|---|---|
| `/payment` | `DashboardView` |
| `/payment/projects` | `PayProjectsView` |
| `/payment/nodes` | `PayNodesView` |
| `/payment/board` | `BoardView` |
| `/payment/calendar` | `CalendarView` |

`AppLayout.vue:14` `showFilter = !route.meta?.hideFilter`。→ **泄漏不在 UI 层，只在 store 层**：hideFilter 页面看不到 FilterBar，却仍能从全局单例里读到筛选值。

### 2.2 逐成员消费方全量核对

| 成员 | 类别 | 消费方 |
|---|---|---|
| `excludeOn` / `excludeTags` / `excludedIds` / `setExclude` | ① 全局配置 | 回款 5 页及其组件、`CostDetailView`、`MilestoneView`、`ProjectTagsCard`（`/data` 配置入口）、**`OverviewView`** |
| `dateStart` / `dateEnd` | ② 回款筛选 | `BoardView`、`CalendarView`、`PayNodesView`、`PayProjectsView`、`DashMetrics`、`OrgRanking`、`PaymentL4Table`、`TrendCard`、`FilterBar`、**`OverviewView`** ← 唯一域外消费方 |
| `viewMode` / `viewL4` / `viewPM` + 3 个 setter | ② 回款筛选 | 同上，**不含** `OverviewView` |
| `l4Options` / `pmOptions` | ② 回款筛选 | 仅 `FilterBar` |
| `filteredPayNodes` | ② 回款筛选 | `DashMetrics`、`TrendCard` |
| `payRecordsAll` | ③ 纯转发（`scoped.paymentRecords ?? {}`） | `DashMetrics`、`OrgRanking`、`PaymentL4Table`、`BoardView`、`PayProjectsView`、**`OverviewView`** |
| `filteredProjects` | ③ **死代码** | **全仓零消费方** |

**结论**：① 的跨域消费是设计使然、正确；② 的域外消费**有且只有 `OverviewView` 的 `dateStart`/`dateEnd` 一处**。

### 2.3 `paymentBand` 的 start/end 是首页专属

`grep paymentBand(` 全仓：生产代码**唯一调用方就是 `OverviewView.vue:60`**，其余 5 处全在 `lib/overview.test.ts`。→ 首页脱钩后这两个参数再无生产调用方。

`lib/paymentRange.ts` 的 `inRange` / `actualInRange` 另有大量消费方（`calendar` / `ledger` / `payDashboard` / `paymentBoard` / `paymentPmis` / `CalendarView` / `PayNodesView`），**不因本期改动变死**。

### 2.4 已有一条到期的冻结基线测试

`views/__pageHeader.test.ts:32-39`（V4.4.8 留）：

```
it('不得新增对 useFilterStore 的引用(全局单例筛选状态属第三期)', () => {
  // 第三期才会拆掉全局单例 filterStore;在那之前新增引用会让第三期的迁移面继续扩大。
  const BASELINE = ['BoardView.vue', 'CalendarView.vue', 'CostDetailView.vue', 'MilestoneView.vue',
                    'OverviewView.vue', 'PayNodesView.vue', 'PayProjectsView.vue']
  ...
})
```

本期就是它注释里点名的「第三期」。这条测试到期，须改写（详见 §3.4）。它成功地把迁移面冻结住了 —— 三个月来 view 层引用数一直是 7。

## 3. 设计

### 3.1 Store 一分为二

| store | 文件 | id | 成员 |
|---|---|---|---|
| `useExcludeStore` | `stores/exclude.ts`（**新建**） | `exclude` | `excludeOn` / `excludeTags` / `excludedIds` / `setExclude` |
| `usePaymentFilterStore` | `stores/paymentFilter.ts`（由 `filter.ts` **更名**） | `paymentFilter` | `dateStart` / `dateEnd` / `viewMode` / `viewL4` / `viewPM` / `l4Options` / `pmOptions` / `filteredPayNodes` / `payRecordsAll` + `setDateRange` / `setPreset` / `setViewGlobal` / `setViewL4` / `setViewPM` |

**承重设计（违一即缺陷）**：

- **① 单向依赖 `paymentFilter → exclude`**。`filteredPayNodes` 要把全局排除叠加进筛选（现 `filterPayNodes(..., excludeActive, excludedIds)`），故 `paymentFilter` 内部 `useExcludeStore()`。**反向依赖不存在，也绝不能引入** —— 一旦 `exclude` 反过来读回款筛选，两类状态就又粘回去了，本期白做。
- **② localStorage key 一字不改**（`pa_exclude_on` / `pa_exclude_tags`）。这两个 key 存着现网用户已配好的排除标签，改 key 等于把所有人的配置静默清空。store id 改名不影响它们（本仓是手写 `localStorage.getItem/setItem`，不是 pinia 持久化插件）。
- **③ 删 `filteredProjects`**（§2.2 实测零消费方）。
- **④ `payRecordsAll` 留在 `paymentFilter`**。它是 `scoped.paymentRecords` 的纯转发，语义上不属于"筛选"，但 5 个回款组件在用、回款域内共享合理。**只让首页脱钩，不为纯洁性去动那 5 个组件** —— 那属于另一件事（消除转发层），本期不做。

### 3.2 首页脱钩

`views/OverviewView.vue`：

- `useFilterStore` → `useExcludeStore`
- `paymentBand(...)` 调用去掉末两个实参 `filter.dateStart` / `filter.dateEnd`
- `filter.payRecordsAll` → 组件内已有的 `scoped.value?.paymentRecords`（同源，等价）

**唯一用户可见变化**：「年度回款进度」恒按自然年度算。默认区间即本年 1/1–12/31，**默认状态下数值与改造前完全一致**；只有动过 `/payment` 筛选的用户会看到它不再跟着变 —— 这正是修复目标。

首页其余数字**不受影响**：`monthPending`（本月待回款）、`dueSoon7`（7 天内到期）均从 `now` 派生，从来不吃区间。受影响的只有 `yearExpected` / `yearActual` / `delayedTop`。

### 3.3 `paymentBand` 收口

`lib/overview.ts`：删 `start` / `end` 两个形参与函数体内的 `hasRange` 分支，签名收敛为 `paymentBand(rows, now, projects?, paymentRecords?)`，计划侧固定 `planDate.startsWith(year)`、实际侧固定 `date.startsWith(year)`。

理由：脱钩后无任何生产调用方能传值，留着就是本期正在清理的那类死参数；删掉后函数名与行为一致（"年度"就是年度）。

**边界**：`inRange` / `actualInRange` 本身不动（§2.3）。

### 3.4 守卫测试升级为结构守卫

`views/__pageHeader.test.ts` 那条冻结基线（§2.4）改写为：

> **从 `router/index.ts` 解析出所有 `hideFilter: true` 路由的组件名 → 断言其对应 `.vue` 文件不含 `usePaymentFilterStore`。**

以 `router/index.ts` 为**单一来源**，不再维护手工白名单 —— 今后新增的任何 hideFilter 页面自动纳入守卫，无需有人记得来改这个数组。这是本期的结构性交付：拆 store 挡住了当下这一处泄漏，守卫挡住的是复发。

**实现方式**：沿用 `__pageHeader.test.ts` 既有风格 —— `readFileSync` + **正则源码扫描**，不引入 AST 解析器、不 import router 模块（import 会拖进整棵组件依赖树）。逐行匹配同时含 `component:` 与 `hideFilter: true` 的路由行，取出组件名 → 映射到 `views/<组件名>.vue`。**守卫须自证有效**：断言解析出的 hideFilter 组件数 `> 20`（当前 26），否则正则一旦失配返回空数组，"零个文件违规"会恒真通过 —— 这是本仓最常见的假绿形态。

`exclude` store 不设此类限制（它本就该跨域用）。

## 4. 改动清单

**源文件 17**

| 文件 | 改动 |
|---|---|
| `stores/exclude.ts` | 新建（从 `filter.ts` 搬 ① 类成员 + `useProjectTagsStore` 依赖） |
| `stores/paymentFilter.ts` | 由 `filter.ts` 更名；删 `filteredProjects`；改用 `useExcludeStore` 取排除态 |
| `layout/FilterBar.vue` | 换 import |
| `views/OverviewView.vue` | 换 `exclude` store + `paymentBand` 去区间 + `payRecordsAll` 改 `scoped` |
| `views/CostDetailView.vue`、`views/MilestoneView.vue` | 换 `exclude` store（仅用 ① 类） |
| `views/BoardView.vue`、`views/CalendarView.vue`、`views/PayNodesView.vue`、`views/PayProjectsView.vue` | 换两个 store |
| `components/ProjectTagsCard.vue` | 换 `exclude` store |
| `components/TrendCard.vue` | 换 `paymentFilter` store |
| `components/DashMetrics.vue`、`components/OrgRanking.vue`、`components/PaymentL4Table.vue`、`components/NoStageProjectsTable.vue` | 换两个 store |
| `lib/overview.ts` | `paymentBand` 删 start/end 与 hasRange 分支 |

**测试 17**

| 文件 | 改动 |
|---|---|
| `stores/filter.test.ts` | **删除**，按现有三个 `describe` 天然拆为两份新文件 |
| `stores/paymentFilter.test.ts` | 新建：`describe('filter store')`（默认值/setDateRange/setPreset/l4Options/pmOptions）+ `describe('filteredPayNodes(3B)')` |
| `stores/exclude.test.ts` | 新建：`describe('filter excludedIds（按标签全局排除）')` 四例，含两条 localStorage 损坏回退 |
| 13 个消费方测试 | 换 store import 与 mock（`DashMetrics` / `NoStageProjectsTable` / `OrgRanking` / `PaymentL4Table` / `TrendCard` / `FilterBar` / `CalendarView` / `CostDetailView` / `DashboardView` / `MilestoneView` / `OverviewView` / `PayNodesView` / `PayProjectsView`） |
| `views/__pageHeader.test.ts` | 冻结基线 → 结构守卫（§3.4） |
| `lib/overview.test.ts` | 删 `:147` 那条传 `'2026-01-01','2026-06-30'` 的用例（参数已不存在）；**其余四条一律不动**（见 §6） |

**注意一处非对称**：`DashboardView.test.ts` 在测试清单里、但 `DashboardView.vue` 不在源文件清单里 —— 该 view 自身不引用 store（`filteredPayNodes` 等由它内嵌的 `DashMetrics`/`OrgRanking`/`PaymentL4Table`/`NoStageProjectsTable`/`TrendCard` 各自取），测试文件引用只是为了 seed 筛选状态。**不是漏改**。

**后端零改动。** 纯前端、仅换 `dist`，无需重启后端、无需点「更新数据」、无新增 `pageKey`、无 schema 变更。

## 5. 不做什么（YAGNI 边界）

- ❌ **不拆 `hideFilter`**：backlog 已定「`hideFilter` 保留」。它是 router meta、职责清晰，没有问题。
- ❌ **不把回款筛选页面化**：全局单例的「跨页保持」在**回款域内部是合理且有用的**（在 `/payment` 设区间、切到 `/payment/projects` 仍生效）。完全页面化是倒退。要切断的只是「泄漏到域外」这一条有害路径。
- ❌ **不消除 `payRecordsAll` 转发层**（§3.1 承重④）。
- ❌ **不动 `/data` 的排除配置 UI**。
- ❌ **不给首页加筛选提示条**：脱钩后首页不再吃区间，没有可提示的东西。
- ❌ **不重构 `lib/paymentRange.ts`**。
- ❌ **不动 `lts/`**：LTS 是独立变体，各自维护（`lts/frontend` 不在本仓 vitest 扫描范围）。

## 6. 验证与回归安全网

**闸门**：`bash verify.sh` 全绿（py_compile / ruff / pytest / 前端 typecheck + vitest + build）。后端零改动，pytest 数应与 V4.5.2 持平。

**回归安全网（钉死，实施时不许改这些断言）**：

| 断言 | 位置 | 变红说明什么 |
|---|---|---|
| 「无区间 → 年度前缀口径」的既有用例（`paymentBand(rows, now, ..., '', '')` 四条） | `lib/overview.test.ts:111/131/163/168` | 它们钉住的**正是首页改造后的目标行为**。改造只是让首页永远走这条路径，函数在这条路径上的行为**一字不能变**。变红 = 删 `hasRange` 分支时误伤了年度分支 |
| `pa_exclude_on` / `pa_exclude_tags` 两个 key 字面量 | `stores/exclude.ts` + 其测试 | 变了 = 现网所有人的排除配置被静默清空 |
| localStorage 损坏回退两例（非法 JSON / 合法 JSON 非数组 → 空数组不抛异常） | `exclude.test.ts` | 搬迁时把 `loadExcludeTags` 的 try/catch 丢了 |

**新增断言**：

- 结构守卫（§3.4）—— 须做**反向验证**：临时在某个 hideFilter view（如 `CostDetailView.vue`）里加一行 `usePaymentFilterStore` 引用，确认守卫**真的变红**，再改回。不做这一步就不能算数（本仓已连续四次出现"专为抓 bug 写的测试恒绿"）。
- `paymentFilter` 与 `exclude` 各自的 store 单测（由 `filter.test.ts` 拆分而来，用例数不减）。

**人工目验（AI 无浏览器，须用户执行）**：

1. 首页「年度回款进度」数值与改造前一致（默认区间下）
2. 去 `/payment` 点「本月」→ 回首页，该数值**不再跟着变**（这是本期修复的核心，改造前会变）
3. `/data` 页设一个排除标签 → 首页项目数、`/insight/costdetail`、`/payment` 三处仍同步生效（① 类跨域消费未被拆坏）
4. `/payment` 设区间后切到 `/payment/projects`/`/payment/nodes`，区间仍保持（回款域内跨页保持未被拆坏）

## 7. 风险

| 风险 | 处置 |
|---|---|
| 13 个消费方测试的 mock 改动量大，容易漏改一处导致连锁红 | 每个文件改完即跑该文件单测；全部改完跑**全量 vitest**（本仓 V1.6.8 教训：删除/换源型任务只跑窄单测必漏） |
| store 拆分后 `filteredPayNodes` 跨 store 取排除态，若 `useExcludeStore()` 调用位置写在 computed 外的错误时机，可能取不到响应式 | 在 store setup 顶层调用（与现 `useProjectTagsStore()` 同位置），computed 内只读 `.value` |
| 首页「年度回款进度」行为变化，用户可能以为是 bug | 已在 §6 人工目验第 2 条写明预期；发版说明须点出这是修复 |
| `paymentBand` 删参数后若有遗漏调用方 → typecheck 红 | typecheck 是硬闸，遗漏必然暴露，不会静默 |
