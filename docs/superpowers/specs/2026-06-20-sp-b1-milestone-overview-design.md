# SP-B1 里程碑管理页（概览半）— 设计文档

> 状态：设计待用户确认。父设计：`docs/superpowers/specs/2026-06-19-insight-analysis-hub-integration-design.md`（§2-SP-B、§4 为本页数据映射母本；§3 设计规范；§8 复用锚点）。
> 目标版本：V1.16.0（SP-A 已合入；本页替换 SP-A 占的 `/insight/milestone` stub）。
> 范围切分（用户 2026-06-20 拍板「拆两段」）：**本 SP-B1 = 概览半**（5 KPI + 5 图 + 下钻 + 页内剔除控件）；**SP-B2 = 明细半**（延期清单 / 到期提醒 / 在建里程碑计划 三张表，各含多筛选/分页/导出），另起 spec→plan→实现 循环。

**Goal：** 把同事「项目数据运营工具」`milestone.html` 看板的**概览区**（统计卡 + 5 图 + 节点下钻）忠实移植到 `/insight/milestone`，数据全部取自我方 `analysis_data.json`，配色/字体/架构遵循当前系统。

**Architecture：** 纯计算口径集中在新 `lib/milestoneAnalytics.ts`（无 Vue 依赖、全 vitest 覆盖），`views/MilestoneView.vue` 只做装配 + 构造 ECharts option（仿 InsightView 的 `computed(option)` 范式）。KPI 卡用新通用 `components/MetricGrid.vue`；节点下钻用新 `components/MilestoneDrillModal.vue`（Modal+DataTable）。图统一经 `ChartBox` 自动 light/dark；季/月切换用 `SegToggle`。数据读 `useDataStore`，并遵循全局标签剔除 `useFilterStore`（见 §3）。

---

## 1. 文件结构（创建 / 复用）

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/lib/milestoneAnalytics.ts` | 新建 | 纯计算：状态归一、域装配（含售前节点回退 + 标签剔除）、KPI、5 图数据、下钻取数 |
| `frontend/src/views/MilestoneView.vue` | 替换 stub | 页面装配：工具栏 + 剔除控件 + KPI + 5 图（构造 option）+ 下钻 modal |
| `frontend/src/components/MetricGrid.vue` | 新建 | 通用 KPI 卡网格（泛化 DashMetrics 的 `.u-grid-auto`+`.dm-card` 范式，DashMetrics 写死回款不可复用） |
| `frontend/src/components/MilestoneDrillModal.vue` | 新建 | 节点下钻弹窗（Modal + DataTable，行点击跳 `/project/:id`） |
| `frontend/src/charts/echartsTheme.ts` | 小改 | 新增 `MUTED_LIGHT`/`MUTED_DARK` 导出镜像 theme.css `--mut`（「未发布」系列中性灰需要）；同步契约测试 |
| 复用（不改） | — | `ChartBox` / `SegToggle` / `DataTable` / `Modal` / `echartsTheme`(STATUS_*/CHART_*) / `useDataStore` / `useFilterStore` / `useProjectTagsStore` |

---

## 2. 数据域与装配口径

主域 = `data.projects`（624：PMIS 在建 ∩ 交付三部，已含 297 售前服务类）。**不硬编码任何「交付实施三部」「特殊支持类」剔除**（我方主域天然吻合对方范围；特殊支持类经标签剔除处理，见 §3）。

**域装配 `buildMilestoneProjects(projects, projectPmis, projectMilestones, opts)` → `MilestoneProject[]`：**
- 对每个 `p ∈ projects`：
  - `status` = `normalizeStatus(projectPmis[p.projectId]?.progress?.里程碑进度状态)`。
  - `nodes` = `nodesFor(p, projectMilestones)`：本项目号 `projectMilestones[p.projectId]` 优先；为空且 `p.isPresale` 则回退 `projectMilestones[p.relatedClosedId]`；仍无则 `[]`（仿后端 `_collection_nodes_for` 约定）。
  - 字段：`projectId / projectName / manager(projectManager) / orgL4 / orgL3_1 / projectType(projectPmis[pid].status.项目类型) / contract(p.paymentPmis?.contract ?? 0) / status / nodes`。
- **标签剔除**：`opts.excludeOn` 为真时，剔除 `opts.excludedIds[projectId]` 为真的项目（见 §3）。
- 返回过滤后数组；KPI/图均基于它。

**状态归一 `normalizeStatus(raw): MilestoneStatus`**（`'正常'|'延期'|'严重延期'|'未发布'`）：
- `正常→正常`；`延期→延期`；`严重延期→严重延期`；`超期未发布 | 未发布里程碑 | 空串 | null | 其它 → 未发布`。
- 实测主域值域（真实数据核对锚点）：正常 331 / 严重延期 258 / 延期 8 / 超期未发布 7 / 空 20 → 归一后：正常 331 / 严重延期 258 / 延期 8 / **未发布 27**（=7+20）/ 总 624。

**节点结构**（`MilestoneItem`，实测）：`name / planDate / actualDate / payStage / priority('high'|'mid'|'low') / payRatio / pct`。节点名值域：项目启动/到货/服务进场/交付完工/初验/项目完工（服务离场）/终验/项目关闭/驻场/实物点验/服务完成/节点成果确认。`priority` 已同源同口径（实测 mid=805 恰为「项目关闭」节点数；high=终验/服务完成/payStage 非空；其余 low），**直接用、不重算**。

---

## 3. 标签剔除（页内控件 + 全局生效）

**机制（既有，复用）：** `useFilterStore` 持有 `excludeOn`(localStorage `pa_exclude_on`) + `excludeTags`(localStorage `pa_exclude_tags`)，computed `excludedIds` = 凡 `useProjectTagsStore().assignments` 命中所选标签的项目 → `{pid:true}`。`setExclude(on, tags)` 写两者并持久化。全平台共享（Calendar/Ledger/Board/各回款页均已遵循）。

**本页处理：**
- 域装配传入 `{ excludeOn: filter.excludeOn, excludedIds: filter.excludedIds }`，剔除生效于 KPI 与全部 5 图。
- `MilestoneView` 挂载时若 `!projectTags.loaded` 则 `await projectTags.load()`（供剔除控件列出标签、供 `excludedIds` 计算）。
- **页内剔除控件**（因本页 `hideFilter:true` 无全局 FilterBar）：放页面工具栏，忠实镜像 `DataView.vue:232-238` 的控件：
  - `<span>按标签排除</span>` + `<el-switch v-model="excludeOn">` + `<el-select multiple collapse-tags clearable v-model="excludeTags">`（`el-option` 取 `projectTags.activeTags` 的 `name`）。
  - 计算包装：`excludeOn = computed({get:()=>filter.excludeOn, set:v=>filter.setExclude(v, filter.excludeTags)})`；`excludeTags = computed({get:()=>filter.excludeTags, set:v=>filter.setExclude(filter.excludeOn, v)})`。
  - 写入即持久化、即全局——在本页给 23 个「特殊支持类」挂排除标签并开启，即复刻对方「剔除特殊支持类」效果，且与本平台其它页一致。

---

## 4. 5 状态 KPI 卡（区块顶部）

通过 `statusKpis(projects: MilestoneProject[])` → `{ total, normal, delayed, severe, unpublished }`。卡片（一主值 `--fs-5`/700 + 副标占比 `--fs-1`/`--mut`，挂 `.u-num`）：

| 卡 | 主值 | 副标 | 主值色 |
|---|---|---|---|
| 项目总数 | `total` | （剔除生效时主值即随之变） | `--txt` |
| 正常 | `normal` | `normal/total` 百分比 | `--ok` |
| 延期 | `delayed` | `delayed/total` | `--warn` |
| 严重延期 | `severe` | `severe/total` | `--danger` |
| 未发布 | `unpublished` | `unpublished/total` | `--mut` |

`total≤0` 时占比显 `-`。用 `MetricGrid` 渲染（`items: {k,v,sub?,cls?}[]`，`--col-min:150px`）。

---

## 5. 五图（忠实对方，色 token 化）

所有图经 `ChartBox :option height`。系列颜色：状态语义用 `STATUS_LIGHT/DARK`（ok/warn/danger）+ `MUTED_*`（未发布灰）；分类维度用 `CHART_LIGHT/DARK`（按 `settings.theme` 取明/暗）。数值标签值为 0 不显示。

### A 里程碑到期提醒（横向堆叠条）
- `reminderBuckets(projects, now)` → `{ '7d'|'30d'|'quarter': { high, mid, low } }`（**累计桶 7⊂30⊂季**）。
- 计数：节点 `actualDate` 为空（未完成）且 `planDate ∈ 窗口`；窗口：7天 `[今,今+7]`、30天 `[今,今+30]`、本季度 `[季初,季末]`（季初月 `=⌊month/3⌋*3`）。优先级取 `node.priority`。
- y 轴分类：未来7天 / 未来30天 / 本季度；x 轴：节点数。系列：高优先级`--danger` / 中`--warn` / 低`--ok`，`stack:'total'`。tooltip 额外行「涉及项目 N 个」（按 projectId 去重计数）。
- `now` 由调用方传入（lib 纯函数不取系统时间，便于测试与缓存友好）。

### B 项目终验完成情况（左右双柱：项目数 + 金额万元）
- `finalAcceptStats(projects, gran:'quarter'|'month', year?)` → `{ periods:string[], planCount[], actualCount[], planAmountWan[], actualAmountWan[] }`。
- 口径（按**项目**计，每项目一次）：取该项目 `终验` 节点 `planDate` 优先、缺则 `服务完成` 节点 `planDate` 作计划期 → 落桶（季 `YYYY-Qn` / 月 `YYYY-MM`，`year` 非空则只取该年）；该项目 `终验.actualDate` 或 `服务完成.actualDate` 任一非空 → 计实际完成数，金额 = `contract`÷10000 计入对应计划桶。无计划期的项目不计。
- 渲染：两张 `ChartBox`（`grid 1fr 1fr`）。每图两系列嵌套柱（`barGap:'-55%'`）：计划=淡色宽柱(`CHART` 浅)+顶标；实际=深色窄柱(`CHART` 深)+顶标。项目数图与金额图同 `periods`。
- 控件：年份 `el-select`（选项 `availableYears(projects,'finalAccept')`，含「全部年份」）+ 季/月 `SegToggle`（`data-test=seg-quarter|seg-month`）。

### C 部门异常项目分布（垂直堆叠柱，Top15 L4）
- `deptAbnormalTop15(projects)` → `[{ orgL4, delayed, severe, unpublished, abnormal }]`，按 `abnormal=delayed+severe+unpublished` 降序取前 15；**排除 orgL4 空**（空名部门不入榜）。
- x 轴 L4（长名换行：在「服务组」「一部」前插换行，仿对方 `wrapDeptName`）；y 轴异常项目数。系列：延期`--warn` / 严重延期`--danger` / 未发布`MUTED`，`stack:'abnormal'`。tooltip 合计异常数。

### D 部门里程碑合规率（折线，与 C 同序 Top15）
- `deptComplianceRate(projects, deptOrder)` → `[{ orgL4, rate }]`（`rate = normal/部门总数 ×100`，一位小数；`deptOrder` 复用 C 的 Top15 同序）。
- 平滑折线 + 8% 绿色 `areaStyle`，色 `--ok`；顶标 `{c}%`，`<100` 标签红(`--danger`)。

### E 关键里程碑节点分布（多线按月，年份下拉，可下钻）
- `nodeDistribution(projects, year)` → `{ months:1..12, series: { arrival, firstAccept, finalAccept, serviceDone }[12] }`。
- 计数（按**节点** `planDate` 月份）：到货「关联回款」= name 含「到货」且 `payStage` 非空；初验「关联回款」= name 含「初验」且 `payStage` 非空；终验 = name 含「终验」（`payStage` 不要求）；服务完成 = name 含「服务完成」。`year` 过滤 planDate 年份。
- 4 平滑折线，色取 `CHART_LIGHT/DARK[0]`(到货·蓝)/`[2]`(初验·青绿)/`STATUS.warn`(终验·黄)/`STATUS.danger`(服务完成·红)（按 `settings.theme` 取明/暗；与对方蓝/绿/黄/红近似且 token 化）；`labelLayout moveOverlap:'shiftY'` 防重叠。
- 控件：计划年度 `el-select`（`availableYears(projects,'node')`，默认当年）。
- **下钻**：点击折线数据点 → `nodesForDrill(projects, seriesKey, monthIndex, year)` → 打开 `MilestoneDrillModal`（列出该节点类型+该月的项目/节点）。SP-B1 自包含为弹窗；SP-B2 接入 Tab3 时可改跳转。

---

## 6. 组件契约

**MetricGrid.vue**（通用 KPI 网格）
- Props：`items: { k: string; v: string; sub?: string; cls?: string }[]`；可选 `colMin?: string`（默认 `'150px'`，落 `--col-min`）。
- 渲染：`.u-grid-auto` > N×`.mg-card`（`.mg-k` 标签 `--fs-1`/`--mut`；`.mg-v` 主值 `--fs-5`/700/`.u-num`，`cls` 控制主值色类如 `ok|warn|danger|mut`；`.mg-sub` 副标 `--fs-1`/`--mut`）。无 emits。仅令牌、无散值、无 emoji。

**MilestoneDrillModal.vue**（节点下钻）
- Props：`modelValue: boolean`、`title: string`、`rows: MilestoneDrillRow[]`。Emits：`update:modelValue`。
- `MilestoneDrillRow = { projectId; projectName; manager; orgL4; node; planDate; status }`。
- 用 `Modal`(width 60%) 包 `DataTable`：列 项目编号(`cell` 插槽渲染可点链→关闭并 `router.push('/project/'+projectId)`)/项目名称/经理/L4/节点/计划时间/状态(badge)。`clickable` 行点击同跳转。

**lib/milestoneAnalytics.ts 导出面（供 plan 精确实现 + 单测）**
```
export type MilestoneStatus = '正常' | '延期' | '严重延期' | '未发布'
export interface MilestoneProject { projectId; projectName; manager; orgL4; orgL3_1; projectType; contract; status: MilestoneStatus; nodes: MilestoneItem[] }
export function normalizeStatus(raw: string | null | undefined): MilestoneStatus
export function buildMilestoneProjects(projects, projectPmis, projectMilestones, opts?: { excludeOn?: boolean; excludedIds?: Record<string,boolean> }): MilestoneProject[]
export function statusKpis(ps: MilestoneProject[]): { total; normal; delayed; severe; unpublished }
export function reminderBuckets(ps: MilestoneProject[], now: Date): { windows: Record<'7d'|'30d'|'quarter', { high: number; mid: number; low: number; projectCount: number }> }
export function finalAcceptStats(ps, gran: 'quarter'|'month', year?: number|null): { periods; planCount; actualCount; planAmountWan; actualAmountWan }
export function deptAbnormalTop15(ps): { orgL4; delayed; severe; unpublished; abnormal }[]
export function deptComplianceRate(ps, deptOrder: string[]): { orgL4; rate: number }[]
export function nodeDistribution(ps, year: number|null): { months: number[]; arrival; firstAccept; finalAccept; serviceDone: number[] }
export function nodesForDrill(ps, seriesKey: 'arrival'|'firstAccept'|'finalAccept'|'serviceDone', monthIndex: number, year: number|null): MilestoneDrillRow[]
export function availableYears(ps, scope: 'finalAccept'|'node'): number[]
```

---

## 7. 设计规范遵循（§3 父设计 + CLAUDE.md）
- 仅引用 `theme.css` 令牌 + `echartsTheme` 桥接色，**禁散值**；新增 `MUTED_*` 经契约测试与 `--mut` 锁同源。
- 状态色与结构/分类色分离：表达里程碑状态的系列必用状态色；分类维度（节点类型）用 `--chart-*`。
- 数字列/百分比/KPI 挂 `.u-num`；8pt grid（`--sp-*`）、卡片（`--card-pad`/`--gap-card`）、圆角/阴影/字号六级严格遵循。
- 无 emoji。`hideFilter:true`（SP-A 已设）。

## 8. 测试策略
- `milestoneAnalytics.test.ts`（vitest，纯函数全覆盖）：
  - `normalizeStatus` 全值域（含 超期未发布/空/null/未知 → 未发布）。
  - `buildMilestoneProjects`：售前节点回退（本号缺、回退 relatedClosedId、皆缺得 `[]`）；标签剔除生效（excludeOn + excludedIds 命中被剔）。
  - `statusKpis`：真实分布锚点（正常331/延期8/严重延期258/未发布27/总624）。
  - `reminderBuckets`：累计桶（7⊂30⊂季）、actualDate 非空不计、边界日期、优先级取值。
  - `finalAcceptStats`：终验优先/服务完成回退分桶、季↔月、year 过滤、金额÷1e4、计划=实际不重复计、空合同。
  - `deptAbnormalTop15` + `deptComplianceRate`：Top15 截断、orgL4 空排除、同序、rate 边界（部门总数 0）。
  - `nodeDistribution` + `nodesForDrill`：payStage 条件（到货/初验需非空、终验/服务完成不需）、月份/年份过滤、下钻行匹配。
- `MilestoneView.test.ts`（挂载冒烟）：KPI 文案存在、5 图 `ChartBox` 存在、季/月 `SegToggle` 切换、点击节点点开 `MilestoneDrillModal`、剔除控件存在且开关写 `filter.setExclude`。
- `echartsTheme.tokens.test.ts`：补 `MUTED_*` 与 `--mut` 一致断言。
- 真实数据冒烟：`python server.py` + `npm run dev`，核对 KPI 分布、终验桶、Top15 部门合理。
- `bash verify.sh` 全绿。

## 9. 范围边界（SP-B1 不含，留 SP-B2）
- 三张明细表（延期项目清单 / 到期提醒节点表 / 在建里程碑计划宽表）及其多筛选、分页、Excel 导出。
- Chart E 下钻由「开弹窗」升级为「跳 Tab3 并按条件过滤」。
- 「延期节点」列（派生口径已定：节点 planDate<今 且 actualDate 空 → 节点名拼接）在 SP-B2 的延期清单表实现。

## 10. 真实数据核查锚点（已用 analysis_data.json 实测，避免实现期重查）
- 主域 624；项目类型：售前服务类 297 / 正常实施类 281 / 特殊支持类 23 / 提前实施类 20 / 空 3。
- 里程碑进度状态：正常 331 / 严重延期 258 / 延期 8 / 超期未发布 7 / 空 20。
- projectMilestones：4879 节点 / 805 项目（含售前原项目）；主域有节点 598/624；priority low3049/high1025/mid805；有 planDate 4879、actualDate 2063、payStage 490。
