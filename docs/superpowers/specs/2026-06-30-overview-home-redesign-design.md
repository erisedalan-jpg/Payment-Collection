# 项目总览（首页 `/`）深度重做 — 设计文档

> 日期：2026-06-30　范围：单页（OverviewView）视觉 + 信息层级重做　性质：整页重设计（Y 级）
> 约束：在项目钦定「设计底层规范」内做——只引用 `frontend/src/styles/theme.css` 令牌、不引框架、不加第 16 色、守 8pt 栅格 / 六级字阶 / 卡片「1 主 2 辅」/ 状态色分离 / 阴影≤2 层。

## 1. 背景与目标

项目总览是登录后的落地首页（路由 `/`，`OverviewView.vue`）。现状经真机截图 + 代码确认有两类问题：

1. **冗余**：底部「高风险/暂停/超支」三色块与顶部 KPI 卡完全重复；`健康度低302` ＝ `关注253+风险49`、`进度异常183` ＝ `里程碑滞后183`、`回款异常133` ＝ `回款延期133` 等「同数字两处出现」。
2. **层级偏平**：6 张等权 KPI + 3 块等重卡片堆叠，**没有「先看哪」**；唯一重点（回款达成率 accent 卡）被排在 KPI 行末尾。

**首页定位（用户钦定）**：**全局健康为主 + 异常可直接下钻**。顶部用极精简的「全局体检」（含回款达成）一眼传达态势；下方把异常按严重度收口、点开即下钻处理。

**重做自由度（用户钦定）**：大胆重排——可删冗余、可合并、可换可视化形式，右侧动态流保留可收窄，前提是不丢数据语义。

## 2. 范围

**做**：`OverviewView.vue` 模板 + scoped CSS 重写；新增 2 个纯展示小组件 `RatioRing.vue`、`HealthSegmentBar.vue`；异常卡 `v-for` 内联。

**不做（明确排除）**：
- 不改 `lib/overview.ts`（computeKpis/healthSummary/paymentBand）与 `lib/riskClassify.ts`（classifyProjects）——原样调用；去重/排序/隐藏 0 项**只在视图层**做。
- 不改 `EventTimeline` 内部（全站共享件）。
- 不改 schema / preprocess / 后端 / 路由 / pageAccess / nav。
- 不新增数据端点、不新增依赖。
- 结论：**升级不需点「更新数据」、无新依赖、无新页**。

## 3. 信息架构与布局

```
┌─ 项目体检带（全宽 hero）────────────────────────────────────────┐
│ 左·健康统领（分段条 + 在管/进行中/暂停）  │ 右·回款一眼（达成环 + 年度/本月/临期）│
└──────────────────────────────────────────────────────────────────┘
┌─ 需要处理的异常（左·主，卡片网格，按严重度，可下钻）─┐ ┌─ 项目动态（右·窄）─┐
│  danger → warn → mut，每卡点开就地展开下钻             │ │  EventTimeline      │
└────────────────────────────────────────────────────────┘ └────────────────────┘
```

- 顶部体检带全宽，单独一张卡。
- 下半区 `grid-template-columns: minmax(0,7fr) minmax(260px,3fr)`（沿用现有 7:3）：左＝异常卡网格、右＝动态流。
- 体检带与下半区间距 `--gap-section`；卡间距 `--gap-card`。

## 4. 区块详设

### 4.1 体检带（hero）

全宽卡：`background:var(--card)`、`border:1px var(--line)`、`border-radius:var(--r-lg)`、`padding:var(--card-pad)`、`box-shadow:var(--shadow-1)`。内部 `grid-template-columns: minmax(0,1.6fr) minmax(0,1fr)`，中缝右区 `border-left:1px var(--line)`（窄屏改 `border-top`）。

**左·健康统领**
- 标题「项目健康度」`--fs-2`/700/`--txt`；右侧上下文 `在管 638 · 进行中 553 · 暂停 8`，`--fs-1`/`--sub`（数据 = `kpis.total/active/paused`）。
- `<HealthSegmentBar>`：分段条 + 图例。
  - 段：健康=`--ok` / 关注=`--warn` / 风险=`--danger` / 无数据=`--mut`（数据 = `health.counts`）；宽度按 count 占比，**实色填充、条内不放字**；极小段设最小宽度（`minSegmentPct`，默认 4%）保证可见可点；条高 14px（沿用现有 `ov-pay-bar` 像素先例）。
  - 图例即下钻：`●健康 336 / ●关注 253 / ●风险 49`，圆点取段色、计数 `--fs-4`/700/`--txt`、标签 `--sub`/`--fs-1`；健康/关注/风险整项点击 → `/projects?health=<值>`（现有路由）；无数据段（仅 count>0 时显示）不可点。hover `--hover-tint`。

**右·回款一眼**
- `<RatioRing>` 回款达成环：CSS `conic-gradient` 圆环（**不引图表依赖**），轨道 `--line`、进度 `--accent`；环心显示 `fmtRatio(kpis.paymentRatio)`（如 `50.9%`）`--fs-5`/700/`--accent`，下方副标「回款达成率」`--fs-1`/`--mut`；`paymentRatio=null` → 环心显「-」、整环置灰（仅轨道色）。整环点击 → `/payment`。
- 环下 3 个辅助小数（值 `--fs-3`/700/`--txt`/`.u-num`，标签 `--fs-1`/`--mut`）：
  - `年度 {fmtWan(band.yearActual)} / {fmtWan(band.yearExpected)} 万` + 一条细进度条（`yearPct`，填充 `--accent`，轨道 `--line`）→ `/payment`
  - `本月待回 {fmtWan(band.monthPending)} 万` → `/payment`
  - `7 天临期 {band.dueSoon7}` → `/payment`

**视觉守则**：卡内仅 1 个 `--fs-5` 大值（回款环），健康计数压 `--fs-4`，不出现两个争抢的 700 大号（守「1 主 2 辅」）。

### 4.2 异常分诊区（左·主，可下钻）

区标题「需要处理的异常」`--fs-2`/700/`--txt`。卡片网格 `grid-template-columns: repeat(auto-fit, minmax(280px,1fr))`，`gap:var(--gap-card)`。

**派生数据（视图层，不改 lib）**：
```ts
const SEVERITY_ORDER = { danger: 0, warn: 1, mut: 2 } as const
const anomalyCards = computed(() =>
  classEntries.value
    .filter(e => e.category !== '健康度低' && e.count > 0)   // 健康度低并入体检带；0 项隐藏
    .slice()
    .sort((a, b) => SEVERITY_ORDER[a.tone] - SEVERITY_ORDER[b.tone]),  // 稳定排序,组内保留 classifyProjects 固定序
)
```
real data 下顺序：成本超支(danger)、风险未闭环(danger)、回款延期(warn)、里程碑滞后(warn)；数据异常=0 隐藏。

**单卡解剖**：`background:var(--card)`、`border:1px var(--line)`、`border-radius:var(--r-md)`、`padding:var(--card-pad)`、`box-shadow:var(--shadow-1)`、hover `--hover-tint`。
- 左色条：tone 实色（danger=`--danger`/warn=`--warn`/mut=`--mut`，宽 4px，无字）。
- 头行：类目名 `--fs-2`/600/`--txt`；计数 `entry.count` `--fs-4`/700、**取 tone 色**。
- 迷你说明 1 行 `--fs-1`/`--sub`（`BLURB` 映射）：
  - 回款延期 →「有延期收款节点的项目」
  - 里程碑滞后 →「里程碑计划滞后的项目」
  - 成本超支 →「总/交付成本超支的项目」
  - 风险未闭环 →「存在未关闭风险项的项目」
  - 数据异常 →「组织架构缺失等数据问题」
- 操作行：`查看清单 →` `--accent`，→ `/projects?riskCategory=<encodeURIComponent(类目)>`（现有下钻链路，不动）；`展开 ▾` 箭头 `--fs-1`/`--sub`，`--dur-2 var(--ease)` 旋转。

**下钻交互（各卡独立展开，互不互斥）**：
- 展开体 `background:var(--card2)`、`padding:var(--sp-2) var(--sp-3)`。
- **「回款延期」卡**：展开内容 = `band.delayedTop`（延期金额 Top，每行 `项目名（省略号）` + `待回 {fmtWan(remaining)} 万`），点行 → `/project/:id`；`band.delayedTop` 为空时回退到 `entry.projects.slice(0,5)`。
- **其余卡**：展开 = `entry.projects.slice(0,5)`（每行 `项目名（省略号）` + `detail`），点行 → `/project/:id`。
- `entry.count` 超过已展示条数时，底部「查看全部 {count} 个 →」→ `/projects?riskCategory=<类目>`。

### 4.3 右栏 项目动态

卡：`--card`/`--line`/`--r-md`/`--card-pad`。标题「项目动态」`--fs-2`/700/`--txt`。`<EventTimeline :events="recentEvents" empty-text="首次同步，暂无变化记录" />`（`recentEvents` = `events.slice(0,10)`，不动组件内部）。底部「查看全部 →」`/activity`，`--accent`/`--fs-1`。

## 5. 数据映射（全部现有 lib，零计算改动）

| UI 元素 | 数据来源 |
|---|---|
| 在管/进行中/暂停 | `computeKpis → kpis.total/active/paused` |
| 健康分段条 健康/关注/风险/无数据 | `healthSummary → health.counts` |
| 回款达成环 | `kpis.paymentRatio` |
| 年度/本月/7天临期 | `paymentBand → band.yearActual/yearExpected/monthPending/dueSoon7`；`yearPct` 同现状 |
| 异常卡（含下钻清单） | `classifyProjects → classEntries`（视图层过滤排序） |
| 回款延期卡展开 | `paymentBand → band.delayedTop` |
| 右栏动态 | `events.slice(0,10)` |

筛选排除（`filter.excludeOn/excludedIds`）沿用现状：`baseProjects` 计算不变。

## 6. 删除 / 合并清单（去重决策，已逐条确认）

| # | 动作 | 去向 / 理由 |
|---|---|---|
| 1 | 删底部三色块「高风险/暂停/超支」 | 风险→体检带分段条；超支→异常区「成本超支」卡；暂停→体检带上下文数字 |
| 2 | `健康度低` 不单列异常卡 | ＝关注+风险，已是体检带分段条内容；点「关注/风险」段即下钻 |
| 3 | 异常区只显 `count>0` 类目，danger→warn→mut | 数据异常=0 自动隐藏，去噪 |
| 4 | 省略旧「4 维异常行」（进度/风险/成本/回款异常） | 与异常分类卡数字重叠（183/133 雷同），改由可下钻的异常卡承载 |
| 5 | 去掉易混的 KPI「超支31」 | 与异常「成本超支107」口径不同、并列易误读；首页只留可下钻的「成本超支」 |
| 6 | 延期 Top3 移出体检带 | 下放「回款延期」卡展开（带「待回 X 万」） |

被删项的语义均可在别处或下钻中找到，未丢失。

## 7. 设计令牌与视觉守则

- 颜色：仅 `--ok/--warn/--danger/--mut/--accent/--txt/--sub/--mut/--card/--card2/--line/--hover-tint` 及对应 `-bg/-text`；状态色只表状态，结构色不混。
- 字阶：`--fs-1..5`（不手写字号）；大值 `--fs-5`（回款环）唯一，健康计数 `--fs-4`，类目名/标题 `--fs-2`，说明/标签 `--fs-1`。
- 间距：仅 `--sp-*` / `--gap-card` / `--gap-section` / `--card-pad`。
- 圆角：体检带 `--r-lg`、卡片 `--r-md`、内嵌 `--r-sm`；阴影只 `--shadow-1`；hover `--hover-tint`，focus 走全局 `:focus-visible`。
- 数字列挂 `.u-num`（tabular-nums）。
- **唯一允许的像素散值**：分段条 / 进度条 / 环线宽等图形尺寸（如条高 14px），沿用现有 `ov-pay-bar:8px` 既有先例；其余一律令牌。
- 文案：简体中文、无 emoji。

## 8. 响应式 / 主题 / 字档

- ≤1200px：下半区并 1 列（异常在上、动态落底）；体检带左右区由 `border-left` 改 `border-top` 堆叠。
- ≤768px：体检带完全堆叠，回款 3 小数换行，异常 1 列。
- 深浅主题：全程令牌，dark 自动适配（含 conic 环用 `--accent/--line`）。
- 小/中/大 三档字号：因全用 `--fs-*`（rem）自动整体缩放。

## 9. 文件改动范围与新组件接口

**改**：`frontend/src/views/OverviewView.vue`（模板 + scoped CSS 重写；新增 `anomalyCards`/`expanded` 派生与 `BLURB` 常量）。

**新增** `frontend/src/components/RatioRing.vue`：
```
props: {
  ratio: number | null        // 0..1；null → 显示 "-" 且置灰
  label?: string              // 环心副标，如 "回款达成率"
  size?: number               // 直径 px，默认 96
  thickness?: number          // 环宽 px，默认 10
  color?: string              // 进度色，默认 'var(--accent)'
  to?: string                 // 传入则整环包 RouterLink
}
// 渲染：conic-gradient 环 + 环心 fmtRatio(ratio)（--fs-5/700/color）+ label（--fs-1/--mut）
```

**新增** `frontend/src/components/HealthSegmentBar.vue`：
```
props: {
  segments: { key: string; label: string; count: number; color: string; to?: string }[]
  height?: number             // 条高 px，默认 14
  minSegmentPct?: number      // 极小段最小宽 %，默认 4
}
// 渲染：实色分段条（条内无字）+ 图例行（●色点 + label + count.u-num）；segment.to 存在则该图例项为 RouterLink
```

异常卡：内联于 OverviewView（`v-for="c in anomalyCards"`）。

## 10. 版本

按版本策略「Y=整页重设计」→ **V2.5.0**（`frontend/src/version.ts` 单一来源，实现末步改）。最终版本号以用户确认为准；若视作页内局部调整则 Z＝V2.4.1。

## 11. 验证（声称完成前 `verify.sh` 全绿）

- 后端 pytest 不受影响（无 lib 计算改动）。
- 前端 `npm run typecheck` + `npm run test:run`（vitest）+ `npm run build` 全绿。
- 新组件 `RatioRing`/`HealthSegmentBar` 配纯渲染单测（含 `ratio=null`、极小段、空 segments 边界）；保持 `OverviewView` 既有测试绿（如断言数量随结构调整需同步更新）。
- 真机冒烟（puppeteer 截图，登录后 `/`）：**before/after 对比** + dark 主题 + 小/中/大三档 + ≤1200/≤768 两断点 + 空态（`paymentRatio=null`、异常 0 类全隐藏）+ 抽查下钻链接（health 段 / 查看清单 / 项目行 / 回款各块）跳转正确。

## 12. 验收标准

1. 首页呈现「体检带 → 异常分诊卡网格 → 右栏动态」三段式，底部三色块、4 维异常行、健康度低卡、KPI 超支均不再出现。
2. 体检带分段条按 `health.counts` 占比正确着色，图例计数与 `health.counts` 一致，段点击进入对应 `/projects?health=` 清单。
3. 回款达成环数值＝`fmtRatio(kpis.paymentRatio)`，null 显「-」；环及三小数点击进 `/payment`。
4. 异常卡按 danger→warn→mut 排序、仅显 count>0；每卡「查看清单」进对应 `riskCategory` 过滤清单；展开显项目并可进详情；回款延期卡展开显「待回 X 万」。
5. 全站令牌合规：无新手写颜色/字号散值（图形尺寸像素除外）；dark 与三档字号正常；≤1200/≤768 不破版。
6. `verify.sh` 全绿。

## 13. 风险与既有技术债（不在本次范围）

- `/insight/board` 等深链直接刷新空白（数据不自举）——与本页无关，记录待后续。
- 商机看板图表标签重叠、项目详情回款明细金额截断——另两处真实缺陷，本次不做，留作后续单。
- `EventTimeline` 视觉单调——共享组件，超本页范围。
