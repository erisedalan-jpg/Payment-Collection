# 风险看板 + /insight 与 /insight/board 改造 — 设计文档

> 日期：2026-06-23　版本：V1.18.0（新增整页 /insight/risk，Y 级；含 /insight 维度调整与 /insight/board 排名排序，Z 级，并版到 V1.18.0）
> 范围：前端项目分析域，纯前端、零后端/数据迁移（风险口径从已有 `pmis.riskRecords` 现场计算）。

## 1. 目标与背景

在"项目分析"区新增**风险看板** `/insight/risk`，集中展示项目风险统计；并对既有 `/insight`（项目多维分析）与 `/insight/board`（回款多维分析）做两处小改造。全部复用现有多维分析基建（`SegToggle` / `ChartTypeSelector` / `chartOptions.buildRankingOption` / 透视结构），不引入新框架、不改后端契约。

**已定决策（用户拍板）：**
- **风险口径 = 仅看未关闭风险**：项目"有风险"当且仅当存在未关闭（`风险状态` 不含"已关闭"）且分级（`风险等级` ∈ {高,中,低}）的风险记录；该项目风险等级 = 这些未关闭记录中的最高等级（高>中>低）。否则为"无风险"。于是全量项目按 `{无风险, 高, 中, 低}` 互斥四分，`有风险 = 高+中+低`，4 张卡片口径自洽。
- 风险等级**从 `pmis.riskRecords` 现场计算**（每条透传了 `风险等级`/`风险状态`），不用 `pmis.risk.最高等级`（它含已关闭记录，与"仅看未关闭"不符），无需改 schema/后端/重跑数据。
- 风险统计维度 = 风险等级、L4组织、项目级别、项目经理、行业；统计 = 项目数、有风险项目数、未关闭风险数、合同总额。
- 风险概览 = 透视表：行维（L4组织默认/项目级别/项目经理/行业）× 列（高/中/低/无风险/合计）+ 健康度%。
- `/insight` 去掉"评级"维度、新增"项目级别"维度。
- `/insight/board` 排名加"排序"选项卡，项：项目数/合同金额/完成率/延期节点。

## 2. 风险口径库（新 `frontend/src/lib/riskBoard.ts`）

纯函数，可单测。数据来源：`Project` + `ProjectPmis`（`projectPmis[projectId]`）。

### 2.1 类型与等级常量
```ts
export type RiskLevel = '高' | '中' | '低' | '无风险'
const RISK_RANK: Record<string, number> = { 高: 3, 中: 2, 低: 1 }
```

### 2.2 单项目风险等级
```ts
export function projectRiskLevel(pmis: ProjectPmis | undefined): RiskLevel
```
- 遍历 `pmis?.riskRecords ?? []`（元素为 `Record<string, unknown>`，中文键）。
- **跳过**任何 `String(r['风险状态'] ?? '')` 含 `'已关闭'` 的记录（已关闭）。
- 对未关闭记录取 `RISK_RANK[String(r['风险等级']).trim()] ?? 0` 的最大值 `best`。
- 返回 `best===3?'高':best===2?'中':best===1?'低':'无风险'`。
- 含义：只有"未关闭且有等级"的风险才使项目"有风险"；未关闭但无等级、或全部已关闭、或无风险记录 → '无风险'。

### 2.3 未关闭风险数
```ts
export function openRiskCount(pmis: ProjectPmis | undefined): number
```
- 返回 `riskRecords` 中 `风险状态` 不含"已关闭"的记录条数（与后端 `risk.未关闭风险数` 同义，但现场计算，自洽）。

### 2.4 风险行
```ts
export interface RiskRow {
  projectId: string
  projectName: string
  orgL4: string         // v(p.orgL4)          —— "服务组"/L4 组织
  projectLevel: string  // v(pmis.status.项目级别)
  manager: string       // v(p.projectManager)
  industry: string      // v(pmis.customer.行业)
  riskLevel: RiskLevel
  openRisks: number      // openRiskCount(pmis)
  contractAmount: number // Number(pmis.customer.合同总额 ?? 0) —— 与 /insight contractAmount 同源
}
export function buildRiskRows(projects: Project[], pmisMap: Record<string, ProjectPmis>): RiskRow[]
```
- 缺省值用与 `projectPivot.v()` 同款的 `v(raw, fallback='未指定')`（空串→'未指定'）；金额缺失→0。
- **包含全部项目**（含异常项目 orgL4 空——风险与 orgL4 无关；其 orgL4 在维度聚合中落"未指定"桶）。这是 4 卡片分母 = 全量项目。

### 2.5 汇总（4 卡片口径）
```ts
export interface RiskSummary {
  total: number; noRisk: number; high: number; mid: number; low: number
  hasRisk: number              // high+mid+low
  healthPct: number | null     // total>0 ? noRisk/total : null
}
export function riskSummary(rows: RiskRow[]): RiskSummary
```
- 卡片占比：高/中/低 占比 = `hasRisk>0 ? 各/hasRisk : null`（展示层 null→"-"）。

### 2.6 风险排名分组
```ts
export interface RiskDimDef { key: 'riskLevel'|'orgL4'|'projectLevel'|'manager'|'industry'; label: string }
export const RISK_DIMENSIONS: RiskDimDef[] = [
  { key: 'riskLevel', label: '风险等级' },
  { key: 'orgL4', label: 'L4组织' },
  { key: 'projectLevel', label: '项目级别' },
  { key: 'manager', label: '项目经理' },
  { key: 'industry', label: '行业' },
]
export type RiskMetricKey = 'projectCount' | 'hasRiskCount' | 'openRiskSum' | 'contractAmount'
export interface RiskMetricDef { key: RiskMetricKey; label: string; kind: 'count' | 'money' }
export const RISK_METRICS: RiskMetricDef[] = [
  { key: 'projectCount',   label: '项目数',       kind: 'count' },
  { key: 'hasRiskCount',   label: '有风险项目数', kind: 'count' },
  { key: 'openRiskSum',    label: '未关闭风险数', kind: 'count' },
  { key: 'contractAmount', label: '合同总额',     kind: 'money' },
]
export interface RiskGroup {
  key: string; rows: RiskRow[]
  projectCount: number; hasRiskCount: number; openRiskSum: number; contractAmount: number
}
export function groupRisk(rows: RiskRow[], dimKey: RiskDimDef['key']): RiskGroup[]
```
- 按单维 `dimKey` 分桶；`hasRiskCount` = 桶内 `riskLevel!=='无风险'` 的行数；`openRiskSum` = Σ`openRisks`；`contractAmount` = Σ`contractAmount`。
- 默认按 `projectCount` 降序（与现有 groupInsight 一致）；视图排名再按所选统计降序。

### 2.7 风险概览（透视表）
```ts
export interface RiskOverviewRow {
  key: string                       // 行维取值
  高: number; 中: number; 低: number; 无风险: number
  total: number                     // 该行项目总数
  healthPct: number | null          // total>0 ? 无风险/total : null
}
export function riskOverview(rows: RiskRow[], dimKey: RiskDimDef['key']): RiskOverviewRow[]
```
- 按行维分桶，每桶统计四类计数 + total + healthPct；按 `total` 降序。

## 3. 风险看板页（新 `frontend/src/views/RiskBoardView.vue`）

- 路由：`{ path:'/insight/risk', name:'insight-risk', component: RiskBoardView, meta:{ title:'风险看板', hideFilter:true, pageKey:'insight-risk' } }`。
- 数据：`onMounted(() => { if (!data.data) data.load() })`；`rows = buildRiskRows(data.data?.projects ?? [], data.data?.projectPmis ?? {})`（仿 InsightView）。
- 空态：无项目主域数据时显与 InsightView 同款提示。

### 3.1 顶部 4 张卡片（`RiskSummary`）
卡片样式遵循设计令牌、`card 1 主 2 辅`、数字挂 `.u-num`：
1. **项目健康度**：主值 `healthPct` 百分比（null→"-"）；辅文 `无风险数 / 全量数`。
2. **高风险项目**：主值 `high` + 单位"个"；辅文 占比 `high/hasRisk`（null→"-"）。
3. **中风险项目**：主值 `mid` + "个"；辅文 占比 `mid/hasRisk`。
4. **低风险项目**：主值 `low` + "个"；辅文 占比 `low/hasRisk`。
- 配色：高=`--danger` 系、中=`--warn` 系、低=`--c-advance`/中性、健康度=`--ok` 系（用淡底深字状态三态，不实底白字）。

### 3.2 风险统计分析（仿 /insight 排名块）
- 控件：`维度`（`SegToggle` 绑 `RISK_DIMENSIONS`，默认 `riskLevel`）+ `统计`（`SegToggle` 绑 `RISK_METRICS`，默认 `projectCount`）+ `图表类型`（`ChartTypeSelector`，available 恒含 bar/pie；不含 line——风险统计为离散分类，line 无意义；如需可后续加）。
- 排名：`groupRisk(rows, dimKey)` 后按所选统计降序，取 Top15。
- 图表用 `buildRankingOption(type, { categories, values, metricLabel, valueKind })`，其中 `valueKind = kind==='money'?'amount':'count'`。柱图柱顶显数值（buildRankingOption 既有）。
- **饼图图例显示数量**：扩展 `buildRankingOption` 支持可选 `legendCounts?: number[]`（见 §6），风险页饼图传各分类的"项目数"作为 legend 数量。
- 排名表：列 = [维度取值, 项目数, 有风险项目数, 未关闭风险数, 合同总额(万)]，用 `DataTable`。

### 3.3 风险概览（仿 /insight 透视的表格）
- 控件：`行维度`（`SegToggle`，可选 L4组织/项目级别/项目经理/行业，默认 orgL4）。
- 表格（`DataTable` 或简单 table）：列 = [行维取值, 高, 中, 低, 无风险, 合计, 健康度%]；数据 = `riskOverview(rows, dimKey)`；`健康度%` 用 `pct()`（null→"-"）；数字列挂 `.u-num`。

## 4. 导航与门禁接入

- `frontend/src/nav.ts` `ANALYSIS_LINKS`：在"成本分析"`{to:'/insight/costdetail'}`(index 2) 之后、"回款多维分析"`{to:'/insight/board'}`(index 3) 之前插入 `{ label:'风险看板', to:'/insight/risk', key:'insight-risk' }`。
- `frontend/src/lib/pageAccess.ts` `PageKey` union：在 `'insight-costdetail'` 后、`'insight-board'` 前加 `'insight-risk'`。
- 路由 `meta.pageKey:'insight-risk'`；既有 `router.beforeEach` 守卫 + AppSidebar 过滤按 pageKey 自动生效，超管全可见、普通管理员按 `allowedPages` 控制。

## 5. /insight 维度调整（`frontend/src/lib/projectPivot.ts` + 测试）

### 5.1 去掉"评级"
- `InsightRow`：删除 `rating: string` 字段（行 19）与 `rating: v(st.评级, '无')` 赋值（行 57）。
- `InsightDimDef.key` union：删除 `'rating'`（行 72）。
- `INSIGHT_DIMENSIONS`：删除 `{ key:'rating', label:'评级' }`（行 87）。
- 全仓 grep `rating` / `评级` 确认无其它消费方（InsightView 的 `DIM_OPTS`/`SECOND_OPTS` 由 `INSIGHT_DIMENSIONS` 派生，自动同步）；同步改既有测试。

### 5.2 新增"项目级别"
- `InsightRow`：加 `projectLevel: string`，赋值 `projectLevel: v(st.项目级别)`（`st = m.status`）。
- `InsightDimDef.key` union：加 `'projectLevel'`。
- `INSIGHT_DIMENSIONS`：在 `{ key:'orgL4', label:'服务组' }` 之后插入 `{ key:'projectLevel', label:'项目级别' }`。
- 排名/交叉/透视三块自动可选该维（DIM_OPTS 派生）。

## 6. /insight/board 排名排序（`frontend/src/views/BoardView.vue` + `frontend/src/lib/paymentBoard.ts`）

### 6.1 可单测的排序纯函数（paymentBoard.ts）
```ts
export type PayBoardSortKey = 'projectCount' | 'contractSum' | 'rate' | 'delayedNodeSum'
export const PAY_BOARD_SORTS: { key: PayBoardSortKey; label: string }[] = [
  { key: 'projectCount',   label: '项目数' },
  { key: 'contractSum',    label: '合同金额' },
  { key: 'rate',           label: '完成率' },
  { key: 'delayedNodeSum', label: '延期节点' },
]
/** 按 key 降序排序分组副本；rate 为 null 视作 -Infinity（排末尾） */
export function sortPayBoardGroups(groups: PayBoardGroup[], key: PayBoardSortKey): PayBoardGroup[]
```

### 6.2 视图接线（BoardView.vue，single/排名 模式）
- 新增 `const sortKey = ref<PayBoardSortKey>('projectCount')`、`const SORT_OPTS = PAY_BOARD_SORTS.map(s => ({ value:s.key, label:s.label }))`。
- 新增 `const sortedGroups = computed(() => sortPayBoardGroups(groups.value, sortKey.value))`。
- `chartTop` 改为 `computed(() => sortedGroups.value.slice(0, 15))`（替换原按 `expectedSum` 排序）。
- 排名表 `:rows` 由 `groups` 改为 `sortedGroups`。
- 工具栏模板（`v-if="mode==='single'"`，现"维度"`SegToggle` 与"图表类型"`ChartTypeSelector` 之间）插入：
  ```vue
  <div class="bv-ctl"><span class="bv-ctl-label">排序</span><SegToggle v-model="sortKey" :options="SORT_OPTS" /></div>
  ```
- 默认 `projectCount` 与现表默认一致；堆叠柱/折线仍展示已回/待回组成，仅顺序随排序变。

### 6.3 buildRankingOption 扩展（chartOptions.ts，供风险页饼图图例显数量）
- `RankingOptionParams` 增可选 `legendCounts?: number[]`（与 `categories` 等长）。
- 仅 `type==='pie'` 且传入 `legendCounts` 时，设 `legend.formatter = (name) => \`${name} (${count})\``（按 name→index 映射取 count）。未传则维持现状（向后兼容，/insight 与 board 现有调用不受影响）。

## 7. 测试

### vitest（frontend/src/）
- **lib/riskBoard.test.ts（新）**：
  - `projectRiskLevel`：未关闭高→'高'；最高未关闭为中（另有已关闭高）→'中'；全部已关闭→'无风险'；无记录→'无风险'；未关闭但等级空→'无风险'。
  - `openRiskCount`：按未关闭计数。
  - `buildRiskRows`：字段映射（orgL4/projectLevel/manager/industry/contractAmount）、缺省值、含异常项目。
  - `riskSummary`：四类互斥分区 total=noRisk+high+mid+low；healthPct（total=0→null）；hasRisk。
  - `groupRisk`：分桶、hasRiskCount/openRiskSum/contractAmount、默认降序。
  - `riskOverview`：四类列计数、total、healthPct、按 total 降序。
- **lib/projectPivot.test.ts（改）**：断言 `INSIGHT_DIMENSIONS` 不含 `rating`、含 `projectLevel`；`buildInsightRows` 输出含 `projectLevel`、不含 `rating`。
- **lib/paymentBoard.test.ts（改/加）**：`sortPayBoardGroups` 四 key 降序、rate=null 排末；`PAY_BOARD_SORTS` 四项。
- **lib/chartOptions.test.ts（改/加）**：`buildRankingOption('pie', {legendCounts})` 设 `legend.formatter`；不传时无 formatter（回归）。
- **views/RiskBoardView.test.ts（新）**：挂载渲染 4 卡片数值/占比、排名维度与统计选项、概览表列；空态。
- **views/BoardView.test.ts（改）**：排序选项卡存在、切换重排（表首行随 sortKey 变）。
- **views/InsightView.test.ts（按需改）**：维度选项不含"评级"、含"项目级别"。

### 验证
`bash verify.sh` 全绿（后端 pytest/ruff 不受影响；前端 typecheck/vitest/build）。手动启动 `python server.py` 走查：`/insight/risk` 4 卡片与图表、概览表；`/insight` 维度无评级有项目级别；`/insight/board` 排名排序生效。

## 8. 非目标（YAGNI）

- 不改后端 schema / preprocess（风险等级现场前端计算）。
- 风险统计排名暂不做折线图、不做交叉/透视（用户仅要排名 + 一个概览表）。
- 不做风险明细下钻弹窗（本期仅统计；如需后续加，可复用 InsightDrillModal 模式）。
- 不动 `/insight` 现有交叉/透视逻辑（仅维度表增减，三块自动同步）。
- 不做风险口径的后端硬校验/导出端覆盖告警（属另一技术债）。
