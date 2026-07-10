# V2.8.3 选列与排序按登录用户持久化 — 设计文档

> 日期：2026-07-10　版本：V2.8.3（Z 级，纯前端）
> 前序：[[v282-inline-richtext-followup]]（本条为原始需求第 2 项，富文本 V2.8.2 已上线后启动）。

## 目标

全站表格的**选列结果**与**排序结果**按**登录用户**持久化到本机 localStorage，刷新 / 重开浏览器后保留，不回默认。修掉当前「选列虽已持久化但 key 不含用户名 → 同一浏览器多个登录账号互相覆盖」的真实缺陷。列筛选（crossFilter）**不纳入**（保持刷新清空）。

## 架构概述

- **纯 localStorage、后端零改动**（全站个性化——主题 / 字号 / 侧栏 / 排除标签 / 选列——本就都走 localStorage，本次沿用同一手段）。
- **按用户区分 = 存储 key 前缀加账号**：选列 `colprefs:{account}:{TABLE_ID}`、排序 `colsort:{account}:{TABLE_ID}`。account 取 `useAuthStore().user.account`（登录门禁保证视图挂载时已就绪，兜底 `'anon'`）。
- **账号 scope 与纯组合式解耦**：新增极小助手 `userScopedKey(base)` 读账号拼前缀；`useColumnPrefs`/`useExternalSort` 保持「纯字符串 key」不耦合 store（其现有单测不受账号影响），由**视图层**把 `TABLE_ID` 包成 `userScopedKey(TABLE_ID)` 再传入。
- **排序持久化分两条路**（对应现有两种排序机制，均不改排序口径）：外部排序 4 表扩 `useExternalSort`；内部排序 9 表用新 `usePersistentSort` + 给共享 `DataTable` 补 `default-sort` 透传。

## Global Constraints（每个任务都隐含）

- 交流语言简体中文；**不使用任何 emoji**，符号仅用 `→ ↓ ❌ ✕ ▾ ⚠`。
- 只引用 `frontend/src/styles/theme.css` 设计令牌、补 CSS 不引框架；**不引第三方 npm 依赖**；前端禁外链字体。
- 版本单一来源 `frontend/src/version.ts` → `V2.8.3` / `RELEASE_DATE='2026-07-10'`。
- 后端 / 审计 / schema / 数据管线 **零改动**；升级仅换 dist、无需重启后端、无需点「更新数据」。
- localStorage 读写一律 `try/catch` 降级（隐私模式 / 配额），与仓库现有 `useColumnPrefs`/`settings`/`ui` 同构。
- TDD：先补 / 改测试再改实现。收尾 `bash verify.sh` 全绿。
- commit 结尾统一 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。

## 权威表格清单（本设计的范围来源）

### A. 选列持久化（11 表，均已调选列 hook，仅把 key 包 userScopedKey）

| 视图 | 路由 | TABLE_ID | hook |
|---|---|---|---|
| OpportunitiesView | /opportunities | `opportunities` | useColumnPrefs |
| ProjectsView | /projects | `projects-active` | useColumnPrefs |
| ClosedProjectsView | /projects/closed | `projects-closed` | useColumnPrefs |
| KeyProjectsView | /projects/key | `key-projects` | useColumnPrefs |
| TempFollowupView | /projects/temp | `temp-followup` | useColumnPrefs |
| PaymentKeyFollowupView | /payment/key | `payment-key` | useColumnPrefs |
| OpportunityFollowupView | /opportunities/key | `opportunity-followup` | useColumnPrefs |
| RiskFollowupView | /risk | `risk-followup` | **useColumnPrefsDynamic** |
| PayProjectsView | /payment/projects | `pay-projects` | useColumnPrefs |
| CostDetailView（L4 汇总表） | /insight/costdetail | `cost-l4-summary` | useColumnPrefs |
| MilestoneReminderTab | /insight/milestone（tab） | `milestone-reminder` | useColumnPrefs |

### B. 排序持久化（13 表）

**外部排序（4 表，扩 `useExternalSort`）**：

| 视图 | TABLE_ID | 表 | 备注 |
|---|---|---|---|
| OpportunitiesView | `opportunities` | 直接 `<el-table>`（非 DataTable） | `:default-sort` 直接绑在 el-table |
| CostDetailView（主表） | `cost-detail` | DataTable，有 `external-sort` | |
| PayProjectsView | `pay-projects` | DataTable，有 `external-sort` | |
| PayNodesView | `pay-nodes` | DataTable，有 `external-sort` | |

**内部排序（9 表，用 `usePersistentSort` + DataTable `default-sort`）**：

| 视图 | TABLE_ID | 备注 |
|---|---|---|
| ProjectsView | `projects-active` | |
| ClosedProjectsView | `projects-closed` | |
| KeyProjectsView | `key-projects` | |
| TempFollowupView | `temp-followup` | |
| PaymentKeyFollowupView | `payment-key` | |
| OpportunityFollowupView | `opportunity-followup` | |
| RiskFollowupView | `risk-followup` | |
| CostDetailView（L4 汇总表） | `cost-l4-summary` | 整表不分页，内部排序=整表排序 |
| MilestoneReminderTab | `milestone-reminder` | |

> 内部排序表（除 cost-l4-summary 外）`:rows` 是**分页切片** → el-table 只排当前页（既有局限，本次不改口径）；持久化恢复的是「进页时按存储列排当前页」。用户已知悉并接受。
> **不在范围**：BoardView / InsightView / RiskBoardView 的排名子表（无 TABLE_ID、排序是图表旁另一套控件）；ProjectDetailView / DataQualityView（只读 / 不可排序）。

## 组件与文件

### 新增 `frontend/src/lib/userScopedKey.ts`（含 store，视图层调用）

```
export function userScopedKey(base: string): string
```
读 `useAuthStore().user?.account || 'anon'`，返回 `` `${account}:${base}` ``。必须在组件 setup（pinia active）内调用。单测用 `setActivePinia` + 设 `auth.user` 覆盖（含 user 为 null → `anon`）。

### 新增 `frontend/src/lib/sortPrefs.ts`（纯函数，无 store）

```
export interface SortState { prop: string; order: '' | 'asc' | 'desc' }
export function loadSort(viewKey: string): SortState        // 读 localStorage['colsort:'+viewKey]，坏/空→{prop:'',order:''}
export function saveSort(viewKey: string, s: SortState): void // 写 JSON；try/catch 降级
export function fromElOrder(order: string | null): '' | 'asc' | 'desc'   // 'ascending'→'asc' / 'descending'→'desc' / else ''
export function elDefaultSort(s: SortState): { prop: string; order: 'ascending' | 'descending' } | undefined // 空→undefined
```
`SortState` 成为排序状态单一类型；`useExternalSort` 改为从此 import（替换其内部同名定义，结构一致、消费方无感）。

### 修改 `frontend/src/lib/useExternalSort.ts`

新增**可选**第三参 `viewKey?: string`：
- 传了：`sortState` 初值改 `loadSort(viewKey)`；加 `watch(sortState, (s) => saveSort(viewKey, s))`（覆盖 onSortChange 与视图 `reset()` 里直接 `sortState.value={prop:'',order:''}` 两条写路径）；额外返回 `defaultSort = computed(() => elDefaultSort(sortState.value))` 供视图绑 el-table `:default-sort`（恢复表头箭头）。
- 未传（现有 8 单测 + 任何 2 参调用）：行为完全不变、不 load/不 watch/不 persist。
返回新增 `defaultSort`（未传 viewKey 时恒 `undefined`）。

### 新增 `frontend/src/lib/usePersistentSort.ts`（内部排序表用）

```
export function usePersistentSort(viewKey: string): {
  defaultSort: ComputedRef<{prop, order:'ascending'|'descending'} | undefined>
  onSortChange: (e: { prop: string | null; order: string | null }) => void
}
```
`const sortState = ref(loadSort(viewKey))`；`onSortChange` 把 el-table 事件映射为 SortState 并 `saveSort`；`defaultSort=computed(elDefaultSort(sortState))`。**不做排序计算**（el-table 内部排 `:rows`），只负责「初值恢复 + 变更持久化」。

### 修改 `frontend/src/components/DataTable.vue`

新增可选 prop：
```
defaultSort?: { prop: string; order: 'ascending' | 'descending' } | null
```
透传 `<el-table :default-sort="props.defaultSort ?? undefined">`。`@sort-change` **已 emit 给父级**（现成，无需改）。不传时与现状一致。

### 视图接线（约 13 文件）

- **选列 11 表**：把 `useColumnPrefs(TABLE_ID, …)` / `useColumnPrefsDynamic(TABLE_ID, …)` 改为传 `userScopedKey(TABLE_ID)`。
- **外部排序 4 表**：`useExternalSort(rows, NUMERIC_KEYS)` → 加第三参 `userScopedKey(TABLE_ID)`；解构出 `defaultSort`；DataTable / el-table 绑 `:default-sort="defaultSort"`（OpportunitiesView 绑在其原生 el-table 上）。
- **内部排序 9 表**：`const { defaultSort, onSortChange } = usePersistentSort(userScopedKey(TABLE_ID))`；其 DataTable 加 `:default-sort="defaultSort" @sort-change="onSortChange"`。
- CostDetailView 同时是：选列（cost-l4-summary）+ 外部排序（cost-detail）+ 内部排序（cost-l4-summary），三处各自接线。

## 迁移与边界

- **升级后既有 `colprefs:{TABLE_ID}` 旧键成孤儿**：不迁移（迁移=把被污染的共享值塞给某账号，正是要修的病）。老用户升级后**首次看到默认列一次**，重设即按新用户键保存。一次性、可接受，手册注明。旧键留存无害（不主动清理，YAGNI）。
- **排序**此前从不持久化，无迁移问题；升级后首次为默认（无排序），用户排一次即记住。
- **登出不清 localStorage**：每账号独立命名空间、下次登录自恢复。
- **列筛选（crossFilter）不纳入**：内存态、刷新清空是现有预期与「关列清筛选」不变式所依赖，持久化会引入「隐形筛选」困惑。
- account 兜底 `'anon'`：视图在登录门禁后挂载、account 恒有值；`anon` 仅极端兜底。

## 测试策略

- `userScopedKey.test.ts`：有 account → `账号:base`；user 为 null → `anon:base`（`setActivePinia` + 设/清 `auth.user`）。
- `sortPrefs.test.ts`：load 空 / 坏 JSON → 默认；save→load 往返；`fromElOrder` 三态；`elDefaultSort` 空→undefined、有值→el 格式。
- `useExternalSort.test.ts`：**保留全部现有 8 用例（2 参不变）**；新增——传 viewKey 时从 localStorage 恢复初值、onSortChange 后 localStorage 落值、`defaultSort` 映射、reset（sortState 置空）后存储清空。
- `usePersistentSort.test.ts`：初值从存储恢复、onSortChange 落值 + defaultSort 更新、空存储→defaultSort undefined。
- `useColumnPrefs.test.ts`：**核心逻辑不变**（仍纯字符串 key）；如需可加一条「userScopedKey 前缀后仍正常存取」的集成向意，但不改既有断言的 key。
- 视图回归：抽 1-2 个代表页（如 CostDetailView 覆盖选列+外部+内部三态、KeyProjectsView 覆盖选列+内部）加/改用例，断言 localStorage 落 `colprefs:{account}:…` / `colsort:{account}:…`、刷新（重挂载）后恢复。
- `bash verify.sh` 全绿。

## 验收清单

- [ ] 登录用户 A 改某表选列/排序 → 刷新后保留；同浏览器登录用户 B 看到的是 B 自己的（不被 A 覆盖）。
- [ ] 4 个外部排序表：排序跨页生效且刷新保留、表头箭头恢复。
- [ ] 9 个内部排序表：刷新后进页按存储列排序（分页表为当前页）。
- [ ] 列筛选仍是刷新清空（未被顺带持久化）。
- [ ] 升级后老用户首次见默认列一次，之后按用户保存。
- [ ] 版本号 V2.8.3；后端零改动；`bash verify.sh` 全绿。
