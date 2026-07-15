# V3.2.0 视觉增强设计：表格首行冻结 + 倚天域与数据页重设计

> 设计文档（spec）。落成后交 `writing-plans` 生成实施计划。
> 交流语言：简体中文。

**版本**：V3.2.0（Y 级 —— 多页整页重设计 + 一个跨页表格能力；线上基线 V3.1.0）。
**性质**：纯前端 + 极小的前端纯计算层新增。**不碰后端、不进数据管线、升级无需点「更新数据」、无新增第三方依赖。**
**目标**：给 14 张长表加首行冻结；对倚天域 5 页 + `/data` 做视觉重设计，增强可视化与信息架构，**功能零改动**。

---

## 0. 全局约束（每个任务都隐含遵守）

- **功能零改动**：所有重设计只动展示层与从既有已计算数据派生的可视化；不改任何 API 调用、业务口径、`data-test` 钩子、SSE 进度反馈、权限判定。
- **只引设计令牌，不手写散值**：颜色/间距/字号/圆角/阴影/动效一律引用 `frontend/src/styles/theme.css` 的 CSS 变量。违者被 `theme.tokens.test.ts` / `echartsTheme.tokens.test.ts` 契约测试拦下。
- **不引入第 16 个色号**（CLAUDE.md 铁律）：新可视化的配色只能取现有 `--chart-1..8` / 状态色 `--ok/--warn/--danger/--c-urgent` / 结构灰阶。热力图、发散条形、markLine 等的色阶一律由现有令牌组合，**不新增任何颜色变量**。
- **状态语义色固定**：合规/达标=`--ok`，提示（HINT_ 前缀）=`--warn`，问题=`--danger`，紧急=`--c-urgent`。表达状态的图表系列必须用状态色，不用分类色。
- **双主题**：light/dark 都要正确（`html.dark` class 切换，非 media-query）。图表经 `ChartBox` 自动按 `settings.theme` 切 `ent`/`ent-dark` 主题。
- **所有新增图表走 `ChartBox`**（已内置 richText tooltip、IntersectionObserver 懒渲染、reduced-motion 护栏）。禁止绕过 ChartBox 直接 new ECharts。
- **canvas 读不到 CSS 变量**：图表色值来自 `echartsTheme.ts` 导出的硬编码常量（与 theme.css 双源契约测试锁定）。任何新图型/新组件必须先在 `echartsTheme.ts` 的 `use([...])` 注册，否则运行时不渲染。
- **8pt 网格 / 卡片规范 / 两级阴影 / 六级字号**：遵守 `docs/superpowers/specs/2026-06-10-design-foundation-design.md` 的设计底座。

---

## 1. 现状基线（调查结论，实现前的事实锚点）

### 1.1 表格渲染
- 共享组件 `frontend/src/components/DataTable.vue` 包裹 Element Plus `el-table`，覆盖 14 张目标表中的 13 张。唯一例外 `/opportunities`（`OpportunitiesView.vue`）是裸写 `<el-table>`（需列头筛选 + 多选列）。
- `DataTable` 现有 props：`columns`(DataColumn[]) / `rows` / `showCount?` / `clickable?` / `externalSort?` / `showSummary?` / `summaryMethod?` / `defaultSort?`；emits `row-click` / `sort-change`；slots `header-<key>` / `cell-<key>`。模板里 el-table 只有 `style="width:100%"`，**无 `height` / `max-height`**。
- **全站没有任何表格设 height/max-height** → Element Plus 原生固定表头未激活。唯一竖向滚动容器是 `frontend/src/layout/AppLayout.vue` 的 `main.app-main { flex:1; overflow:auto }`，整页滚动。`frontend/src/lib/useViewScrollMemory.ts` 按 `.app-main.scrollTop` 记忆滚动位置。
- 各表外层的 `.*-scroll` 包裹层是 `overflow-x:auto`（宽表横向滚动）；这会成为 `position:sticky` 的 containing block 并劫持吸附，故"纯 CSS 表头吸顶"路线被否决。
- 富文本跟进页（/risk、/payment/key、/opportunities/key、/projects/temp、/projects/key）**不是自绘表**：是 `DataTable` + 插在 `#cell-<key>` slot 里的 `RichTextCell` 组件。首行冻结做法与普通 DataTable 页完全一致。

### 1.2 倚天域数据与基建
- Store：`frontend/src/stores/yitian.ts`（`useYitianStore`，`data = shallowRef<YitianData|null>`，读独立 `yitian_data.json`，与主域完全分离）；`frontend/src/stores/yitianView.ts`（共享 `start/end/weekMode('calc'|'iso')/l4s[]`，按账号持久化）；`frontend/src/stores/yitianSettings.ts`（`excludedTypes`）。
- 数据形态 `frontend/src/types/yitian.ts`：`YitianData = { meta, roster[], days[], dims, entries[], issues[] }`。`entries` 压缩列名：`d`(日期) `e`(工号) `t`(类型索引) `h`(工时) `cu`(客户索引) `bg`(销售L2索引) `wo`(工单) `top`(TOP1000) `ok`(0正常/1提示/2问题) `iss`(问题码)。`dims` 索引字典：`types[] customers[] salesL2[] products[] projectTypes[] serviceModes[]`。`roster`：`id name l2 l3 l31 l4 category`。`issues`：`i`(entries 下标) `codes[] msgs[] snippet`。`meta`：`hoursPerDay thisBgL2[] periodStart/End calendarSource`。
- 纯计算层（齐备，多数图无需新算法）：
  - `frontend/src/lib/yitian/metrics.ts`：`kpi / empStats / typeHours / orgSummary(l3→l31→l4 三层) / complianceRate / saturationTop / unfilledList / neverFilledList / baseHours / selectEntries`。
  - `frontend/src/lib/yitian/customer.ts`：`top1000ByL4 / bgSupport / top1000TotalsRow`。
  - `frontend/src/lib/yitian/compliance.ts`：`issueRows / countByCode / countByL4`。**`countByL4` 已实现且有测试，但没有任何视图消费它**（现成的零成本图机会）。
  - `frontend/src/lib/yitian/calendar.ts`：`weekBuckets(iso/calc 双口径) / workdayCount / dataRange`。**只有周分桶，无月/季**。
- 图表基建：`frontend/src/charts/ChartBox.vue`（唯一 ECharts 封装，默认 height 320，性能护栏齐全，暴露 `@datapoint-click`）；`frontend/src/charts/echartsTheme.ts` 注册 `ent`(浅)/`ent-dark`(暗) 两主题，**当前仅 `use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])`**；导出 `CHART_LIGHT/DARK`(8 色)、`STRUCT_LIGHT/DARK`、`STATUS_LIGHT/DARK`(ok/warn/danger)、`MUTED_LIGHT/DARK`、`FONT_SANS`。契约测试 `echartsTheme.tokens.test.ts` 断言这些常量等于 theme.css 同名令牌。
- 可复用视觉组件：`MetricGrid`(KPI 卡网格) / `RatioRing`(conic 环形，0–1 比率) / `HealthSegmentBar`(堆叠分段条+图例) / `StatusBadge` / `HealthBadge` / `SegToggle`(分段切换) / `DataTable` / `ChartBox`。倚天 5 页共用筛选栏 `YitianToolbar`。
- 倚天各页现状：总览（饼+柱+KPI+表，最完整）；合规（**无图**，手写彩色徽章 pill + 大表）；分析（**纯 4 表零图**）；趋势（6 折线+1 堆叠柱，仅周维度）；客户（1 小饼+表）。

### 1.3 /data 页
- `frontend/src/views/DataView.vue`（513 行）+ `frontend/src/components/DataStatusBar.vue`（56 行）。V2.8.0 已做过一次重设计（扁平 8 卡 → 状态条 + 主区 + el-collapse 折叠）。
- 结构（现"流程轴"）：标题 → 状态条(5 项) → 主卡「获取与更新数据」(① 获取数据：在线 PMIS 获取/下载 + 上传文件[PMIS 九表 / 项目域 / 倚天工时域] + 「更多」折叠；② 更新看板：reprocess 主按钮 + SSE 进度) → 维护 accordion（项目标签 / 人工数据导入回滚 / 数据历史回滚 / 门户[超管] / 倚天合规范围[超管] / 倚天累积数据[超管] / 清空数据）。
- API：`/api/reprocess`(SSE) `/api/pmis/download`(SSE) `/api/pmis/upload` `/api/inputs/upload` `/api/files/status` `/api/data-history|rollback|undo-rollback` `/api/clear-data` `/api/pmis/cookie` `/api/yitian/cookie` + manualApi + cookieAgent。SSE 进度 UI：`.dv-progress > .dv-bar > .dv-bar-fill` + `.dv-msg`。共 11 个 `data-test` 钩子。
- 视觉：纯功能控件堆叠，令牌干净但朴素；无任何图表。

---

## 2. 第 1 部分 · 表格首行冻结（EP 原生 max-height）

### 2.1 方案
用户已定：**表格内部滚动**。给 14 张长表设 `max-height`，用 Element Plus 原生固定表头 —— 表头钉死、表体在表内竖向滚动、横向表头同步与 fixed 列全由 EP 处理；带 `show-summary` 的表合计行也一并钉在底部。

### 2.2 新增：`useTableMaxHeight` composable
`frontend/src/composables/useTableMaxHeight.ts`（新建）：动态测量目标 el-table 在视口中的顶部位置，算出可用高度，随窗口 resize / keep-alive 激活 / 数据变化重算。

接口：
```ts
export function useTableMaxHeight(
  getEl: () => HTMLElement | null | undefined,
  opts?: { bottomGap?: number; min?: number }
): { maxHeight: Ref<number>; recompute: () => void }
```
- 计算：`maxHeight = Math.max(min, window.innerHeight - rect.top - bottomGap)`，`bottomGap` 默认 24，`min` 默认 200。`rect` 取 `getEl().getBoundingClientRect()`。
- 触发重算时机：`onMounted`(nextTick 后) / `window resize`(节流) / `onActivated`(keep-alive) / 外部调用 `recompute()`。
- `onUnmounted` / `onDeactivated` 卸载 resize 监听。
- 无 `getEl()` 时返回上次值，不抛错。

### 2.3 `DataTable.vue` 改动
- 新增 prop：`stickyHeader?: boolean`（默认 `false`）。
- `stickyHeader` 为真时：给内部 el-table 挂 template ref，用 `useTableMaxHeight(() => tableRef.value?.$el)` 得到 `maxHeight`，绑 `:max-height="stickyHeader ? maxHeight : undefined"`；`watch(() => props.rows, () => recompute(), { flush: 'post' })` 在数据变化后重算。
- `stickyHeader` 为假时：行为与现状 100% 一致（不设 max-height，不测量，零回归）。
- 默认关，**只有 14 张目标表显式 `sticky-header` 开启**，不影响其它所有 DataTable 使用点（下钻弹窗、短表等）。

### 2.4 逐表接入（打开 `sticky-header`）
| # | 路由 | 视图/组件 | 表 |
|---|---|---|---|
| 1 | /projects | `ProjectsView.vue` | 主表 |
| 2 | /projects/closed | `ClosedProjectsView.vue` | 主表 |
| 3 | /opportunities | `OpportunitiesView.vue` | **裸 el-table，直接接 composable**（见 2.5） |
| 4a | /insight/milestone | `MilestoneDelayedTab.vue` | 延期项目清单 |
| 4b | /insight/milestone | `MilestoneReminderTab.vue` | 到期提醒 |
| 4c | /insight/milestone | `MilestonePlanTab.vue` | 在建里程碑计划 |
| 5 | /insight/costdetail | `CostDetailView.vue` | 明细表（长表；L4 汇总短表不接） |
| 6 | /projects/key | `KeyProjectsView.vue` | 主表（含 RichTextCell） |
| 7 | /opportunities/key | `OpportunityFollowupView.vue` | 主表（含 RichTextCell） |
| 8 | /projects/temp | `TempFollowupView.vue` | 主表（含 RichTextCell） |
| 9 | /risk | `RiskFollowupView.vue` | 主表（含 RichTextCell） |
| 10 | /payment/key | `PaymentKeyFollowupView.vue` | 主表（含 RichTextCell） |
| 11 | /payment/projects | `PayProjectsView.vue` | 主表（external-sort） |
| 12 | /payment/nodes | `PayNodesView.vue` | 主表（external-sort） |
| 13 | /yitian/compliance | `YitianComplianceView.vue` | 问题明细表 |
| 14 | /yitian/analytics | `YitianAnalyticsView.vue` | 员工工时明细表（该页另 3 张小表不接） |

### 2.5 `/opportunities` 裸 el-table
在 `OpportunitiesView.vue` 内直接 `const { maxHeight } = useTableMaxHeight(() => tableRef.value?.$el)`，给 `<el-table ref="tableRef" :max-height="maxHeight">`，`watch(paged, recompute)`。列头筛选、多选列、fixed 操作列与 max-height 原生兼容。

### 2.6 已知取舍（写入实现说明，非缺陷）
- 交互从"整页滚"变"表内滚"，筛选栏/KPI 卡固定在上方；表内滚动位置不进 `useViewScrollMemory`（它只认 `.app-main`）。可接受。
- 外层 `.*-scroll { overflow-x:auto }` 保留无害（el-table 内部接管横向滚动）。

---

## 3. 第 2 部分 · 图表基建改动（支撑平衡档可视化）

### 3.1 `echartsTheme.ts` 注册扩容
在 `use([...])` 增补（只加真正用到的）：
- charts：`ScatterChart`（饱和度分布散点）、`HeatmapChart`（合规问题码×L4 热力图）。
- components：`VisualMapComponent`（热力图色阶）、`MarkLineComponent`（趋势均值线 / 分析基础工时参考线）、`MarkPointComponent`（趋势峰谷）、`DataZoomComponent`（趋势长区间缩放）。

### 3.2 配色：不新增任何颜色令牌
- **散点 / 分组柱 / 堆叠柱**：用现有 `CHART_LIGHT/DARK` 分类色。
- **发散条形**（加班/欠填）：正=加班=`STATUS_*.danger`（红），负=欠填=`STATUS_*.warn`（琥珀）；二值状态语义，取现有状态色令牌。
- **热力图色阶**：visualMap `inRange.color` 取 `[MUTED_*, STATUS_*.warn, STATUS_*.danger]` 的低→高三档（问题密度越高越danger），**全部来自 echartsTheme 已导出且已被契约测试锁定的常量**，不新增 CSS 变量、不新增导出色值。
- **markLine / markPoint**：参考线用 `MUTED_*`，峰值点用 `STATUS_*.danger`。
- 因不新增颜色常量，`echartsTheme.tokens.test.ts` 与 `theme.tokens.test.ts` 无需改色断言；仅注册列表增长（如需可加一条"新图型已注册"的轻量断言）。

### 3.3 `calendar.ts` 月/季分桶（趋势页月/季维度）
`frontend/src/lib/yitian/calendar.ts` 新增，返回与 `weekBuckets` **完全相同的桶结构**（沿用其现有 `Bucket` 类型，实现时照抄其返回形态）：
```ts
export function monthBuckets(start: string, end: string): Bucket[]
export function quarterBuckets(start: string, end: string): Bucket[]
```
- 与 `weekBuckets` 同签名风格，供趋势页按粒度切换时复用逐桶重算逻辑。
- **先补 vitest 再实现**：覆盖跨年、区间不满整月/整季、单月/单季边界。

### 3.4 `customer.ts` TOP 客户排行（客户页新图）
`frontend/src/lib/yitian/customer.ts` 新增纯函数：
```ts
export function topCustomers(data: YitianData, entries: Entry[], n: number): { name: string; hours: number }[]
```
- 按 `entries[].cu` 索引 `dims.customers` 聚合工时，降序取前 n。
- **先补 vitest 再实现**：空数据、并列、n 大于客户数。

---

## 4. 第 2 部分 · 六页重设计（逐页）

> 每页：功能与数据源不变；新增可视化一律取自上表既有计算函数；图表走 ChartBox；重设计后走截图核验（见 §5）。

### 4.1 /yitian 总览 `YitianOverviewView.vue`（增强，不整页重构）
- KPI 卡：给「合规率」卡内嵌 `RatioRing`（0–1 天然适配）；其余卡精修层级（1 主 + 至多 2 辅）。**饱和度不用 RatioRing**（可 >1，超出环形语义）。
- 新增「L4 组织工时」**横向柱**（bar，已注册）：实际工时 vs 基础工时并列，按饱和度着色；置于现有「分层汇总」表上方。表保留（数据密度）。
- 「工时类型占比」保留环形饼，**去掉与之数据重复的同色柱**（信息冗余）。
- 数据来源：`kpi() / complianceRate() / orgSummary(level==='l4') / typeHours()`（均现成）。

### 4.2 /yitian/compliance `YitianComplianceView.vue`（重设计，收益最大）
- 顶部健康带：大号合规率 `RatioRing` + KPI（总问题数 / 问题人次 / 涉及组织数）。
- 「问题分布」：手写彩色徽章 pill 列表 → **横向柱**（`countByCode` 降序；HINT_ 前缀走 `--warn`，其余走 `--danger`）。**保留顶部多选筛选 + 导出按钮**（功能不动）。
- 新增「问题按 L4 组织分布」**横向柱**（消费**已存在但未被使用**的 `countByL4`，零新增计算）。
- 招牌新图：**问题码 × L4 热力图**（heatmap + visualMap）——哪个组的哪类问题扎堆。
- 「问题明细」大表保留，接入首行冻结（§2.4 #13）。

### 4.3 /yitian/analytics `YitianAnalyticsView.vue`（重设计，纯表→图表化）
- 顶部人数结构：达标 / 欠填 / 加班 用 `HealthSegmentBar`（或小环）。
- 「饱和度 TOP10」→ **横向柱** + 基础工时 `markLine` 参考线。
- 招牌新图：**加班/欠填发散条形**（正=加班、负=欠填，双色 diverging，取 `empStats().diff`）。
- **饱和度分布散点**（scatter：x=实际工时、y=饱和度），看全员失衡。
- 原 4 张表（饱和度 TOP10 / 未按时填写 / 完全未填 / 员工工时明细）保留、移至图下方；「员工工时明细」接入首行冻结（§2.4 #14）。
- 数据来源：`empStats() / saturationTop(10) / unfilledList / neverFilledList`（均现成）。

### 4.4 /yitian/trend `YitianTrendView.vue`（收敛 + 加维度）
- 新增 `SegToggle` **周/月/季** 切换（**局部 ref，不入 yitianView store**，避免影响其它页；`weekMode(calc/iso)` 仍走 store）。月/季调用 §3.3 新分桶函数逐桶重算。
- 6 张雷同折线统一风格：加均值 `markLine` + 峰谷 `markPoint`；长区间挂共享 `dataZoom`。
- 把「总工时 + 合规率」合成一张**双轴**折线以减图数量（合规率 null 断线沿用现处理）。
- 类型占比堆叠柱增加「**百分比堆叠**」看构成变化。
- 数据来源：逐桶 `selectEntries / empStats / complianceRate`（现有逐周逻辑推广到月/季桶）。

### 4.5 /yitian/customer `YitianCustomerView.vue`（1 小饼→多图）
- 「TOP1000 大客户支持」→ 各 L4 **横向堆叠柱**（TOP1000 工时 vs 其余客户类工时，带占比标签）。表保留。
- 「跨 BG 支持」保留环形饼，补一张本/跨 BG × L4 分组柱。
- 新增「**TOP 客户排行**」横向柱（消费 §3.4 `topCustomers`；当前无单客户视图）。
- 数据来源：`top1000ByL4() / top1000TotalsRow() / bgSupport() / topCustomers()`。

### 4.6 /data `DataView.vue`（信息架构重排 + 视觉打磨，**不加图表**）
用户已定方向：**不做数据健康可视化叠加**，改为重排版面、按功能域拆分布局。
- 从"流程轴"（获取→更新→维护 accordion）改为**按功能域拆分的清晰卡片**：
  - 顶部保留状态条 `DataStatusBar`（状态非图表）；「更新看板」(reprocess) 作为主操作提到显眼位置。
  - **PMIS 域卡**：cookie 获取/推送 + 下载(SSE) + 9 表上传 + 文件状态。
  - **项目域文件卡**：input/ 根文件上传 + 文件状态。
  - **倚天工时域卡**：倚天文件上传 + cookie + 合规范围(超管) + 累积数据(超管)。
  - **项目标签卡**：标签库编辑。
  - **维护与历史卡**：人工导入/回滚 + 数据历史/回滚 + 门户(超管) + 清空数据。
- 统一卡片系统、清晰分区标题、8pt 节奏、微交互（`--lift` hover / `--focus-ring`）。折叠面板收成有主次的功能卡（局部可保留 el-collapse 承载次要项）。
- **一个不动**：全部 API 调用、11 个 `data-test` 钩子、SSE 进度条与文案、超管可见性判定、上传白名单。

---

## 5. 测试与验证

- **纯计算新增先测后写**（TDD）：`calendar.ts` 月/季分桶、`customer.ts` topCustomers 各自补 vitest。
- **契约测试**：`echartsTheme.ts` 注册扩容后 `echartsTheme.tokens.test.ts` 保持绿（未新增颜色常量）；若加"新图型已注册"断言则一并维护。
- **组件回归**：`DataTable.vue` 加 `stickyHeader` 后，既有 DataTable 测试保持绿（默认关=零回归）；补一条 `stickyHeader` 关时不设 max-height 的断言。
- **浏览器截图核验**（本项目既定设计评审方式，见记忆 design-review-screenshot-harness）：puppeteer-core 驱动系统 Chrome（`--no-proxy-server`）、admin 登录、数据自举后逐页目验——6 个重设计页 + 抽查若干首行冻结表；light/dark 双主题；确认无 console 报错、表头正确钉死、图表正确渲染（尤其新注册图型：散点/热力图/发散条/双轴/dataZoom）。
- **收尾** `bash verify.sh` 全绿：语法编译 + ruff + pytest + 前端 typecheck/vitest/build。

---

## 6. 范围边界与非目标（YAGNI）

- **不做**：激进档图型（桑基/主题河流/旭日/仪表盘组件/toolbox）；/data 的数据健康图表叠加（用户已否）；饱和度用 RatioRing（语义不符）；新增任何颜色令牌；改后端 / 数据管线 / 业务口径；改任何页面的功能与权限。
- **不扩大改动面**：只动本 spec 列出的 6 个视图 + `DataTable.vue` + 14 处接入 + `echartsTheme.ts` + `calendar.ts` + `customer.ts` + 新 composable。其它页面与组件不碰。

---

## 7. 实现分解建议（供 writing-plans 参考）

大致三段，Part 1 独立可先行、低风险：
1. **首行冻结**：`useTableMaxHeight` composable（先测）→ `DataTable.vue` 加 prop → 14 处接入（可按页分任务）。
2. **基建**：`echartsTheme.ts` 注册扩容 → `calendar.ts` 月/季分桶（先测）→ `customer.ts` topCustomers（先测）。
3. **六页重设计**：每页一个任务（总览 / 合规 / 分析 / 趋势 / 客户 / data），各自结束接一次截图核验。

版本号 `frontend/src/version.ts` 改 `APP_VERSION='V3.2.0'` + `RELEASE_DATE`，PROGRESS.md 记版本状态，收尾并入本项。
