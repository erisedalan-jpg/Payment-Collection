# 首页优化设计 —— V2.9.0 项目总览下半区重做

> 日期：2026-07-11 · 版本：V2.9.0（Y 级 = 整页级重设计，无需 X 确认）
> 类型：纯前端展示层，后端与数据口径零改动 → 升级仅换 `frontend/dist`、不重启后端、不点「更新数据」
> 基线：在线 V2.8.5

## 0. 背景与目标

用户对当前首页（`OverviewView.vue`）两处不满：

1. **项目动态**（右栏 `EventTimeline`）实用性差：它是**快照 diff 的被动变更日志**，只在数据刚同步后有意义，日常回答的是「变了什么」而非「我该做什么」，却占了整条右栏。
2. **需要处理的异常**（4 张卡片）展示不便捷：卡片默认只有「计数 + 一句话」，要看具体项目必须**逐张点「展开 ▾」**，且只显示 top-5 就跳走。

改造方向（已与用户逐项确认）：**三块共存、各自增强**——

- 新增 **待办 / 临期** 工作队列（把「我该做什么」显性化）；
- **异常卡片** 默认内联前 3 行（去掉逐个展开）；
- **项目动态** 加「本期变化」数字条 + 默认只看要紧 + 快筛。

**体检带（顶部：健康度分段条 + 回款环 + 3 个回款数字）保持不变**，本设计只动下半区。

## 1. 布局与信息架构

下半区由现状「异常 7fr : 动态 3fr」两栏，改为**三栏并列**（`ov-lower` 的 `grid-template-columns` 改为约 `minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)`，动态栏可略窄）。响应式：`<=1200px` 三栏堆叠为单列（复用现有断点），`<=768px` 同。

```
┌── 体检带（不变）──────────────────────────────────┐
├────────────────┬────────────────┬────────────────┤
│ 需要处理的异常   │ 待办 / 临期      │ 项目动态         │
│ 计分板·卡片纵叠  │ 工作清单·新增块   │ 变化摘要 + 要紧   │
└────────────────┴────────────────┴────────────────┘
```

**三栏定位与「双视角」约定**：
- **异常 = 计分板**：每类问题有多大盘子（按类别计数 + 内联前 3 行）。
- **待办 = 工作清单**：具体做什么、按截止日/金额排序的条目。
- **动态 = 变化 + 要紧参考**。
- 异常与待办在「回款延期 / 里程碑滞后 / 成本超支」上**刻意保留重叠**：同一问题两种镜头（类别计数 vs 紧急度条目），不去重。

## 2. 待办 / 临期 队列（新块）

新组件 `components/TodoQueue.vue` + 纯计算层 `lib/todoQueue.ts`（带单测）。

**结构**：顶部一排 **4 桶计数**（可点击筛选下方列表；再点同一桶取消筛选）＋ 右上角 **7天 / 30天** 窗口切换 ＋ 下方**按紧急度排序的扁平列表**（每行带类型小标，点击 → `/project/:id`）。

### 2.1 四个计数桶与数据来源

| 计数桶 | 数据来源 | 命中条件 | 行主/次文案 |
|---|---|---|---|
| 回款临期 | `PayNodeRow`（`paymentNodeRows`） | `status ≠ 已回款` 且 `planDate ∈ [今, 今+窗口]`（含今日到期） | 项目名 · `到期 MM-DD · 待回 X 万` |
| 回款已延期 | `PayNodeRow` | `status === '延期'` | 项目名 · `已延期 · 待回 X 万` |
| 里程碑 | `MilestoneProject.nodes`（`buildMilestoneProjects`） | `actualDate` 空 且 `planDate` 非空，且（`planDate < 今` = 滞后）或（`planDate ∈ [今, 今+窗口]` = 临期） | 项目名 · `节点名 · 计划 MM-DD` |
| 成本超支 | 项目行 `riskReasons`（`buildProjectRows`） | category ∈ {`交付成本超支`, `总成本超支大于5000`}（按 projectId 去重，一项目一条） | 项目名 · `超支 X 万` |

- **回款节点单状态互斥**：每个 `PayNodeRow` 至多产出一条——`status==='延期'` 优先归「回款已延期」，**否则**再判临期窗口（`planDate==今`→今到期 / `planDate∈(今,今+窗口]`→临期）；已延期与临期互不重复计数（防延期节点又落窗口被双计）。里程碑节点同理：`planDate<今`→滞后、否则窗口内→临期，二选一。
- 回款/里程碑均**排除异常项目**（`paymentNodeRows`/`buildMilestoneProjects` 已内建 `isAnomalous`/`excludedIds` 排除，与全站口径一致）。
- 成本超支桶**只取 >5000**：`总成本超支小于5000` 不入队列（符合用户「大于5000」诉求），但仍留在异常卡的「成本超支」计分（异常卡不拆档，见 §3）。
- 窗口切换（7/30 天）**只影响两个「临期」判定**（回款临期上界、里程碑临期上界）；已延期 / 里程碑滞后 / 成本超支不受窗口影响。

### 2.2 紧急度排序与去重

扁平列表把四桶条目合并后按 `urgencyRank` 升序、同 rank 内按 `sortSub` 排：

| 状态（stateLabel） | 所属计数桶 | urgencyRank | sortSub |
|---|---|---|---|
| 已延期 | 回款已延期 | 0 | 待回金额降序 |
| 今到期 | 回款临期 | 1 | 待回金额降序 |
| 临期（回款） | 回款临期 | 2 | planDate 升序 |
| 滞后（里程碑） | 里程碑 | 3 | planDate 升序 |
| 临期（里程碑） | 里程碑 | 4 | planDate 升序 |
| 超支 | 成本超支 | 5 | 超支金额降序 |

- 回款/里程碑条目**节点级**（一项目可有多个节点 → 多条），不跨节点去重；成本超支**项目级**去重。
- 列表默认展示全部条目（无硬顶截断），若单块过高由 CSS `max-height + overflow-y:auto` 内滚（沿用设计令牌，不新增密度开关）。列表底部保留「查看回款清单 →」链接到 `/payment`（次要，非必需，可在实现期定）。

### 2.3 `lib/todoQueue.ts` 契约（纯函数）

```ts
export type TodoBucket = '回款临期' | '回款已延期' | '里程碑' | '成本超支'
export interface TodoItem {
  key: string; bucket: TodoBucket; stateLabel: string
  projectId: string; projectName: string
  date?: string; amount?: number; detail: string
  urgencyRank: number; sortSub: number
}
export interface TodoQueueResult {
  items: TodoItem[]                         // 已按 (urgencyRank, sortSub) 排好
  counts: Record<TodoBucket, number>        // 顶部 4 桶计数
}
export function buildTodoQueue(
  payNodes: PayNodeRow[],
  milestones: MilestoneProject[],
  projectRows: Array<{ projectId: string; projectName: string; riskReasons: RiskReason[]; overspendAmount: number }>,
  now: Date,                                // 注入便于测试
  windowDays: 7 | 30,
): TodoQueueResult
```

- `now` 由调用方注入（组件用 `new Date()`），保持纯函数可测（对齐 `paymentBand`/`reminderBuckets` 既有约定）。
- 金额单位：内部元，展示层用 `fmtWan` 转万（避免二次除万坑）。

### 2.4 单测要点（`lib/todoQueue.test.ts`）

- 每桶命中/不命中边界：今日到期归「今到期」而非「临期」；`planDate < 今` 回款节点若 status 非「延期」如何归类（约定：仍按 status；只有 `status==='延期'` 进「已延期」桶，避免与 PMIS 状态口径打架）。
- 窗口 7/30 切换只改临期数量，已延期/滞后/超支不变。
- 成本超支 `>5000` 入、`<=5000` 不入；同项目多 riskReason（总超+交付超）只出一条。
- 排序：混合桶后 rank 顺序正确、同 rank 金额降/日期升。
- 异常项目不出现（上游已排除，作回归断言）。

## 3. 异常卡片（略增强）

改 `OverviewView.vue` 卡片渲染，**逻辑复用现有 `classifyProjects` / `cardItems`**：

- **去掉「展开 ▾」手动步骤**：卡片默认内联显示 **前 3 个项目**（`cardItems` 截断 `slice(0,3)`），下方保留「查看全部 N 个 →」（`c.count > 3` 时显示）到 `/projects?riskCategory=…`。
- 移除 `expanded` reactive 与 `toggle()`（或保留数据但默认全展开——实现期取更简者，倾向直接删 toggle）。
- 卡片在 1/3 宽列内**纵向堆叠**（`ov-anomaly-grid` 改为单列 `1fr` 或 `auto-fit,minmax` 在窄列自然回落单列）。
- 计分口径不变：仍 5 类（`回款延期/里程碑滞后/成本超支/风险未闭环/数据异常`），`成本超支` 桶仍合并总/交付超支且不拆 5000 档（与 §2 待办队列的「仅 >5000」是两种镜头，允许计数不同）。

## 4. 项目动态（加强）

改 `OverviewView.vue` 右栏 `ov-aside`：

- **顶部「本期变化」数字条**：读 `data.data.periodCompare?.lastSync`，精简展示 4 项——`阶段推进 X` / `新增延期 Y` / `回款新增 Z 万`（`fmtWan(paymentGained)`）/ `风险净增 ±N`（`riskNetChange`，带正负号）。`periodCompare.lastSync` 为空（快照不足）→ 整条数字条不渲染（不占位）。
- **下方事件默认只看要紧**：默认 `importantOnly = true`，谓词 `e.tone === 'warn' || e.tone === 'danger'`（内联于 `OverviewView`，不改共享 `filterEvents` 签名）；加「只看要紧 / 全部」切换（`SegToggle` 或小按钮）。
- **L4 快筛**：小号 `el-select`，选项来自在建项目 `orgL4` 去重，复用 `filterEvents(events, {domain:'',query:'',types:[],l4}, pidL4)` 的 `l4` 分支 + `pidL4` 映射（照搬 `ActivityView` 的 `pidL4`/`l4Options` 构造）。
- 事件条数：默认取要紧过滤后的前 N（如 10）条，保留「查看全部 →」到 `/activity`（全量筛选/导出仍在 `/activity`）。
- `EventTimeline` 组件本身不改（已支持 `events`/`pidInfo`/`empty-text`）；只改 `OverviewView` 传入的事件集与外层加筛选控件。

## 5. 改动清单

**改**
- `frontend/src/views/OverviewView.vue`：`ov-lower` 三栏布局；异常卡默认内联 3 行、删 toggle；右栏加数字条 + 要紧/L4 筛选；引入 `TodoQueue`。

**新增**
- `frontend/src/components/TodoQueue.vue`（表现型：props = 队列结果 + 窗口 v-model + 桶筛选状态；行点击 emit 或直接 `router.push`）。
- `frontend/src/lib/todoQueue.ts` + `frontend/src/lib/todoQueue.test.ts`。

**复用（不改）**
- `lib/overview.ts`（`computeKpis`/`healthSummary`/`paymentBand`）、`lib/paymentPmis.ts`（`paymentNodeRows`/`PayNodeRow`）、`lib/milestoneAnalytics.ts`（`buildMilestoneProjects`/`MilestoneProject`）、`lib/riskReasons.ts`（`riskReasons`/`TOTAL_OVERSPEND_CATS`）、`lib/riskClassify.ts`（`classifyProjects`）、`lib/projectList.ts`（`buildProjectRows`）、`lib/activity.ts`（`filterEvents`）、`components/EventTimeline.vue`、`components/SegToggle.vue`、`lib/format.ts`（`fmtWan`）。
- `data.periodCompare`、`data.events`、`data.paymentNodes`、`data.projectMilestones`。

**版本**
- `frontend/src/version.ts` → `V2.9.0`（`RELEASE_DATE` 更新为实现日）。

## 6. 设计规范符合性（展示形式）

- 三栏用 `--gap-card`/`--gap-section` 间距；卡片沿用 `--card`/`--line`/`--r-md`/`--shadow-1`。
- 状态色：已延期/滞后/超支用 `--danger` 系，临期用 `--warn` 系，桶计数徽标用「淡底+深字」三态（`--danger-bg`+`--danger-text` 等），**不实底小字**。
- 金额/日期/计数挂 `.u-num`（tabular-nums）；中文不加 `--ls-wide`；muted 蓝紫不用于小号正文。
- 只引令牌不散写数值；不引新框架；不外链字体。

## 7. 验证

- `bash verify.sh` 全绿：`lib/todoQueue.test.ts` 新增用例 + 前端 `typecheck` + `vitest` + `build`。
- 手动冒烟：`python server.py` + `npm run dev`，真实数据核对——待办四桶计数与 `/payment`（延期/临期）、`/milestone`（滞后）、`/projects`（成本超支>5000）交叉一致；异常卡内联 3 行且「查看全部」跳转正确；动态数字条与 `/activity` 周期对比一致、要紧过滤生效。

## 8. 非目标（YAGNI）

- 不做待办条目的持久化/勾选完成（待办由数据派生，非个人清单）。
- 不改体检带、不改任何后端/口径、不新增页面或 `pageKey`（无需授权）。
- 不把「风险未闭环」纳入待办队列（用户未选；仍在异常卡计分）。
- 动态不新增服务端筛选，仅前端 tone/L4 客户端过滤。
