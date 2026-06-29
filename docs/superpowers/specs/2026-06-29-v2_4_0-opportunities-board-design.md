# V2.4.0 设计：商机看板 /opportunities/board

> 状态：设计已与用户确认（4 决策：产品维度=productCategory；AI相关=productCategory 含 'AI'；本周=近7天；月趋势=按 firstReg 分月）。
> 日期：2026-06-29　版本：V2.3.3 → **V2.4.0**（Y 级·新增页面）。
> 交流语言：简体中文。沿用既有设计令牌/口径/打包约定（CLAUDE.md）。展现形式忠实复刻 `oppoboard.pdf`。

## 0. 总览与全局约束

新增一个**商机统计看板**页 `/opportunities/board`，数据源=现有商机数据（`/api/opportunities`），自上而下复刻 `oppoboard.pdf` 的约 19 个统计元素（KPI 卡 + 环形/饼/柱/多系列折线/双轴组合/堆叠柱）。**纯展示、无下钻**。

**全局约束（每个任务隐含遵守）：**
- **纯前端**：新增 1 个 view + 1 个 lib + 路由/导航/门禁登记，并对共享 `chartOptions.ts` 做 1 处加法（新增 `'wan'` valueKind）。**不改后端**（`opportunities.py`/`server.py`）、不改商机数据结构、不新增端点。读现有 `/api/opportunities`（该端点已按 L4 过滤，看板自动继承数据隔离）。
- 设计令牌只引用 `theme.css` 变量与 `echartsTheme.ts` 的 `CHART_LIGHT` 调色板；**不手写散值色/间距**。图表经 `ChartBox.vue`（已做明暗主题桥接）。
- 不使用 emoji。
- 金额口径：商机字段 `amountWan` 已是**万元数值**（后端 `_num()` 解析），看板所有金额=`Σ amountWan`，单位万元，图表标签/轴名标「万元」。**不得**走 `buildRankingOption` 的 `'amount'`（那会再 ÷10000）。
- 版本单一来源 `frontend/src/version.ts`：`APP_VERSION='V2.4.0'`、`RELEASE_DATE='2026-06-29'`。
- 验证：`bash verify.sh` 全绿。新增纯函数先补测试再改实现（TDD）。

## 1. 数据源与字段口径

前端 `useOpportunitiesStore().rows: OppRow[]`（`{ id, ...字段 }`，字段为**原始值**）。挂载时 `if (!opps.loaded) opps.load()`。本看板用到的字段（取值原始）：
- `l4`（L4组织/团队，11 个服务组，见 `opportunityColumns.ts` `L4_OPTIONS`）
- `amountWan`（预估金额，**number，万元**；空/异常按 `Number(v) || 0`）
- `forecast`（主观预测，取值与顺序复用 `opportunityColumns.ts` 的 `FORECAST_OPTIONS`：可参与/可承诺/可争取/赢单）
- `status`（商机状态：方案设计沟通/售前测试/意向沟通/招投标/商务谈判/需求确认/合同签约/赢单/丢单/进行中）
- `keyOpp`（是否重点商机：是/否）
- `top1000`（是否TOP1000客户：TOP1000/非TOP1000/其他非指名；空→「空白」桶）
- `customer`（客户名称，自由文本）
- `productCategory`（产品大类，自由文本）
- `expectedDate`（预估落单时间 YYYY-MM-DD，可空）
- `firstReg`（首次登记日期 YYYY-MM-DD，后端自动写入，非空）
- `lastUpdate`（最后更新日期，ISO 时间戳；取前 10 位做日期比较）

**口径定义（用户钦定）：**
- **近7天**：日期字符串 `d` 满足 `0 ≤ (今天 - d) ≤ 6`（按自然日，取日期前 10 位）。「本周新增/更新」= `firstReg 近7天 OR lastUpdate 近7天`。
- **AI相关**：`String(productCategory).toUpperCase().includes('AI')`（不分大小写；用户接受子串判定）。
- **月趋势分月**：按 `firstReg` 前 7 位 `YYYY-MM`。
- **去重客户数**：某桶内 `customer` 去空白后的不重复个数。

## 2. lib/opportunityBoard.ts（新建，纯函数 + option 构造）

集中放：聚合纯函数 + 复杂图的 ECharts option 构造。导出（签名固定）：

```ts
import type { OppRow } from '@/lib/opportunitiesApi'

export interface GroupAgg { category: string; count: number; amountWan: number }

/** 近7天判定:d 为日期串(取前10位),now 为当前时间;0..6 天内为真。 */
export function isWithin7Days(d: string | null | undefined, now: Date): boolean

/** 金额数值化:Number(amountWan)||0。 */
export function amtWan(row: OppRow): number

/** AI相关:productCategory 含 'AI'(不分大小写)。 */
export function isAiRow(row: OppRow): boolean

/** 顶部 4 张 KPI:本周新增/更新数·额、总数、总额。 */
export function boardKpis(rows: OppRow[], now: Date): {
  weekCount: number; weekAmountWan: number; totalCount: number; totalAmountWan: number
}

/** 两张 AI KPI:AI 行的数与额。 */
export function aiKpis(rows: OppRow[]): { count: number; amountWan: number }

/** 按任意字段聚合 count+ΣamountWan;skipEmpty=true 跳过空值类目;order 给定则按它排序,否则按 amountWan 降序。 */
export function groupBy(
  rows: OppRow[], field: string,
  opts?: { skipEmpty?: boolean; order?: string[]; blankLabel?: string; topN?: number }
): GroupAgg[]

/** 各级别客户:按 top1000 桶(固定 4 桶含「空白」)聚合 ΣamountWan + 去重客户数。 */
export function customerTierAgg(rows: OppRow[]): { tier: string; amountWan: number; customers: number }[]

/** 按 firstReg 分月 × l4 的趋势矩阵。months=连续 YYYY-MM(min→max);teams=出现过的 l4(按 L4_OPTIONS 排序);
 *  countMatrix[teamIdx][monthIdx] 与 amountMatrix[teamIdx][monthIdx]。 */
export function monthlyTrendByTeam(rows: OppRow[]): {
  months: string[]; teams: string[]; countMatrix: number[][]; amountMatrix: number[][]
}

/** 预估落单时间分布:按 expectedDate 分月(连续 + 末尾「空白」桶) × forecast 堆叠的 ΣamountWan。
 *  months=连续 YYYY-MM + '空白';series=FORECAST_ORDER(+ '未填' 若有空 forecast);matrix[seriesIdx][monthIdx]。 */
export function expectedDateStack(rows: OppRow[]): {
  months: string[]; series: string[]; matrix: number[][]
}

// ——— 复杂图 option 构造(返回 ECharts option;用 CHART_LIGHT 调色板) ———
/** 多系列折线:每队一条线。valueKind 决定标签('count' 或 'wan')。 */
export function buildMultiLineOption(
  months: string[], teams: string[], matrix: number[][], metricLabel: string, kind: 'count' | 'wan'
): Record<string, any>

/** 双轴组合柱:左轴 ΣamountWan(万元) 柱、右轴 去重客户数 柱。 */
export function buildCustomerTierOption(agg: { tier: string; amountWan: number; customers: number }[]): Record<string, any>

/** 堆叠柱:x=months,堆叠 series,值=ΣamountWan(万元)。 */
export function buildStackedAmountOption(months: string[], series: string[], matrix: number[][]): Record<string, any>

/** 横向柱(商机覆盖产品):值固定万元。 */
export function buildHorizontalBarOption(categories: string[], values: number[], metricLabel: string): Record<string, any>
```

固定常量：
- `FORECAST_ORDER = ['可参与', '可承诺', '可争取', '赢单']`（本 lib 内常量，与 `opportunityColumns.ts` 的 `FORECAST_OPTIONS` 同序；用于主观预测分组与落单堆叠 series 顺序；forecast 为空→ '未填' 追加在末尾）。
- `TOP1000_TIERS = ['TOP1000', '非TOP1000', '其他非指名', '空白']`（本 lib 内常量）。
- `l4` 顺序：`import { L4_OPTIONS } from '@/lib/opportunityColumns'`（该常量已 export）。
- 商机阶段（status）分组：不传固定顺序，按 `Σ amountWan` 降序（`opportunityColumns.ts` 的 `STATUS_OPTIONS` 未 export，环形图按金额降序即可，无需引入新导出）。

> 月份连续区间：取所有非空 `firstReg`（趋势）/ `expectedDate`（落单）的 `YYYY-MM` 的 min..max，按月步进生成连续序列（避免 x 轴断档）；落单分布在末尾追加「空白」桶（空 `expectedDate` 的行）。

## 3. chartOptions.ts —— 新增 `'wan'` valueKind（唯一共享改动，加法）

`amountWan` 已是万元，复用 `buildRankingOption` 时需要一个不再 ÷10000、标签带「万」的档：
- `ValueKind` 类型加 `'wan'`：`export type ValueKind = 'amount' | 'ratio' | 'count' | 'wan'`。
- `makeLabelFormatter` 加一例：
  ```ts
  if (valueKind === 'wan') {
    return (p) => p.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '万'
  }
  ```
- 柱状分支无需再改：现有 `valueKind === 'amount'` 的三处特判（`yAxisName`/`seriesData`/`axisFormatter`）对 `'wan'` 自然走 else——`seriesData=values`（不除）、`yAxisName=metricLabel`（metricLabel 自带「(万元)」）、`axisFormatter=formatter`（即上面的 wan 档）。饼图分支用 `formatter` 同理生效。
- 补 `chartOptions.test.ts` 一例：`buildRankingOption('bar', { valueKind:'wan', values:[22604], categories:['终端安全'], metricLabel:'预估金额(万元)' })` 的 series 数据为 `[22604]`（未被 ÷10000）、label formatter 输出含「万」。

## 4. 组件 → 实现映射（OpportunitiesBoardView.vue）

读 `opps.rows`，用上面 lib 算数据，逐块渲染。简单柱/饼复用 `buildRankingOption`（`'wan'`/`'count'`），复杂图用 lib 的 option 构造；统一塞进 `ChartBox`。

| # | PDF 块 | 数据 | 渲染 |
|---|---|---|---|
| 1-4 | 顶部 KPI ×4（本周新增/更新数·额、总数、总额） | `boardKpis(rows, now)` | 内联 KPI 卡（§5） |
| 5 | 商机覆盖产品（横向柱） | `groupBy(rows,'productCategory',{skipEmpty:true})` 降序取 topN(默认 10) | `buildRankingOption('bar', {valueKind:'wan'})` + `yAxis/xAxis` 互换为横向（见下注） |
| 6 | 商机主观预测（环形） | `groupBy(rows,'forecast',{order:FORECAST_ORDER,skipEmpty:true})` ΣamountWan | `buildRankingOption('pie', {valueKind:'wan'})` |
| 7 | 商机阶段分布（环形，图例滚动） | `groupBy(rows,'status',{skipEmpty:true})` ΣamountWan（按金额降序） | `buildRankingOption('pie', {valueKind:'wan'})` |
| 8 | 各团队商机金额（柱） | `groupBy(rows,'l4',{order:L4_OPTIONS})` ΣamountWan | `buildRankingOption('bar', {valueKind:'wan'})` |
| 9 | 各团队【重点】商机金额 | `groupBy(rows.filter(keyOpp==='是'),'l4',{order:L4_OPTIONS})` | 同上 |
| 10 | 各团队商机数量（柱） | 同 8，取 count | `buildRankingOption('bar', {valueKind:'count'})` |
| 11 | 各团队【重点】商机数量 | 同 9，取 count | 同上 |
| 12 | 商机数量月变化趋势（多线） | `monthlyTrendByTeam(rows)` countMatrix | `buildMultiLineOption(..., 'count')` |
| 13 | 商机金额月变化趋势（多线） | 同 12 amountMatrix | `buildMultiLineOption(..., 'wan')` |
| 14 | 各级别客户商机数及金额（双轴） | `customerTierAgg(rows)` | `buildCustomerTierOption(agg)` |
| 15 | 预估落单时间分布（堆叠柱） | `expectedDateStack(rows)` | `buildStackedAmountOption(...)` |
| 16 | AI相关商机数（饼，分页） | `groupBy(rows.filter(isAiRow),'productCategory')` count | `buildRankingOption('pie', {valueKind:'count'})` |
| 17 | AI相关商机金额（饼） | 同 16 ΣamountWan | `buildRankingOption('pie', {valueKind:'wan'})` |
| 18-19 | AI KPI ×2（数、额） | `aiKpis(rows)` | 内联 KPI 卡 |

> 横向柱（块 5）：`buildRankingOption('bar',…)` 默认纵向；商机覆盖产品需横向。做法：在 view 内取 `buildRankingOption` 产出的 option 后，交换 `xAxis`/`yAxis` 的 `type`（category↔value）并把 `series.label.position` 设 `'right'`、`yAxis.inverse=true`（值大在上）。或在 lib 加一个 `buildHorizontalBarOption(categories, values, metricLabel)`（推荐，便于单测）。**采用后者**：`opportunityBoard.ts` 导出 `buildHorizontalBarOption(categories: string[], values: number[], metricLabel: string)`，valueKind 固定万元。

布局：复刻 PDF 的行结构，用 `.u-grid-auto` 或 flex-wrap（参考 `RiskBoardView` 的 `.rv-charts-row { display:flex; flex-wrap:wrap }`，单图 `flex:1 1 400px; min-width:300px`）。每个图 `ChartBox` 高度 `300px`（双轴/堆叠可 `340px`）。区块标题用 `--fs-3`/`h3`。

## 5. KPI 卡（内联，复刻 RiskBoardView 三段式）

view 内定义 `ob-card`：标签（`--fs-1`/`--sub`/600）+ 主值（`--fs-5`/700/`--txt`/`.u-num`）+ 副文本（`--fs-2`/`--mut`）。卡容器 flex-wrap、`gap:var(--gap-card)`；单卡 `flex:1 1 200px; min-width:180px; background:var(--card); border:1px solid var(--line); border-radius:var(--r-md); padding:var(--card-pad)`。顶部 4 卡一行、底部 AI 2 卡一行。主值挂 `.u-num`（tabular-nums，CLAUDE.md 硬约束）。金额卡副标注「万元」。

## 6. 路由 / 导航 / 门禁 / 侧栏

- `router/index.ts`：import `OpportunitiesBoardView`，在 `/insight/risk` 与 `/insight/board` 之间插：
  ```ts
  { path: '/opportunities/board', name: 'opportunities-board', component: OpportunitiesBoardView,
    meta: { title: '商机看板', hideFilter: true, pageKey: 'opportunities-board' } },
  ```
- `nav.ts` `ANALYSIS_LINKS`：在「风险看板」与「回款多维分析」之间插 `{ label: '商机看板', to: '/opportunities/board', key: 'opportunities-board' }`。
- `pageAccess.ts`：`PageKey` 联合类型加 `'opportunities-board'`（`PAGE_OPTIONS` 由 nav 自动派生，无需手维护）。
- `AppSidebar.vue` `activeSectionKey`：把 analysis 分支判断改为 `if (p.startsWith('/insight') || p.startsWith('/opportunities/board')) return 'analysis'`（精确匹配 `/opportunities/board` 前缀；`/opportunities`、`/opportunities/key` 不匹配该前缀、仍归项目分区默认值）。
- **权限**：看板读 `/api/opportunities`，后端对非超管已按 L4 过滤 → 看板数据自动隔离。新 pageKey `opportunities-board`：超管默认可见，普通管理员需在「页面访问控制」勾选（部署须知）。

## 7. 测试
`frontend/src/lib/opportunityBoard.test.ts`：
- `isWithin7Days`：今天/6天前→真；7天前/未来/空→假。
- `amtWan`/`isAiRow`：数值化容错；`'AISOC'/'ai审计'`→真、`'终端安全'/''`→假。
- `boardKpis`/`aiKpis`：构造若干行验证 weekCount/weekAmount（firstReg 或 lastUpdate 近7天命中）、total、AI 数额。
- `groupBy`：skipEmpty 跳空、order 固定序、topN 截断、降序、count 与 ΣamountWan 正确。
- `customerTierAgg`：4 桶固定、去重客户数（同客户多商机只计一次）、空 top1000 进「空白」、空 customer 不计数。
- `monthlyTrendByTeam`：连续月轴（含中间空月补 0）、teams 按 L4_OPTIONS 序、矩阵对位。
- `expectedDateStack`：连续月 + 末尾「空白」桶、按 forecast 堆叠、空 forecast 进「未填」。
- option 构造（`buildMultiLineOption`/`buildCustomerTierOption`/`buildStackedAmountOption`/`buildHorizontalBarOption`）：series 数量、双轴 yAxis 长度=2、堆叠 series 带 `stack` 同名、调色板来自 CHART_LIGHT（断言 `series.length` 与关键结构，不逐像素）。
`chartOptions.test.ts`：补 `'wan'` 档一例（§3）。
view 层不强求快照测试；`bash verify.sh` 全绿即可。

## 8. 不动（明确边界）
- 后端：`opportunities.py`、`server.py`、商机 schema/端点（看板只读现有 GET）。
- `/opportunities`（商机清单）、`/opportunities/key`（重点商机跟进）页与其 lib。
- 风险看板 `RiskBoardView.vue`、`riskBoard.ts`（`chartOptions.ts` 仅加 `'wan'` 档，对其无影响）。
- `ChartBox.vue`、`echartsTheme.ts`。

## 9. 影响与交付
- 新页 `/opportunities/board` 在「项目分析」分区、风险看板下/回款多维分析上；忠实复刻 PDF 约 19 个统计元素；普通管理员数据按 L4 自动隔离。
- `verify.sh` 全绿（前端 typecheck/vitest/build；后端 pytest 不受影响）。
- **纯前端 → 升级不需点「更新数据」、无新依赖、无新后端端点**；唯一部署须知=给需要的普通管理员授权新页 `opportunities-board`。打包按用户发话。

## 实现拆解（3 工作流）
1. **WS-1 计算与 option lib**：`chartOptions.ts` 加 `'wan'` 档（+测试）；新建 `lib/opportunityBoard.ts` 全部纯函数 + 4 个复杂 option 构造 + `buildHorizontalBarOption`；`opportunityBoard.test.ts`。
2. **WS-2 看板页**：`OpportunitiesBoardView.vue`——KPI 卡 + 19 元素布局，调 WS-1 与 `buildRankingOption`，经 `ChartBox` 渲染。
3. **WS-3 接线收尾**：路由 + `nav.ts` + `pageAccess.ts` + `AppSidebar.vue` + 版本 V2.4.0 + `PROGRESS.md` + `bash verify.sh`。

WS-2/WS-3 依赖 WS-1 的导出。
