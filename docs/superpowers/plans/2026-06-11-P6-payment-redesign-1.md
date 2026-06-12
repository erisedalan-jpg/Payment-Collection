# P6 回款子域重设计① 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** ① `/board` 多维看板与 `/analysis/:tab` 业务分析五 tab 归并为一页「回款分析」`/panalysis/:tab`（spec §2/§7 P6）；② `/payment` 回款总览瘦身——移除与项目总览重复的 DashSignals（临期信号行）与 DelayTopCard（延期 Top），保留 DashMetrics/TierStrip/OrgRanking/TrendCard（FilterBar 联动的回款工作台）。版本 V7.5.0。

**Architecture:** 新 `PayAnalysisView`（/panalysis/:tab，默认 board）：tab=board 时**内嵌 `<BoardView />`**（BoardView 仅读 route.query.dim，深链经 redirect 保 query 仍生效，零改造）；其余 5 tab 原样迁入 AnalysisView 的分发逻辑（tier SegToggle + nodes 汇总条 + 5 个 tab 组件），AnalysisView 删除。旧路由 `/board`、`/analysis/:tab` redirect 到新页（保留深链）。navContext.goBoard 改推 `/panalysis/board`。导航「回款」组收为 5 项（回款总览/回款分析/日历/跟进/台账），删多维看板项与回款分析子组。

## 设计决策

1. **瘦身判据**：与项目总览重复者删（DashSignals≈7 天临期+/followup 专页；DelayTopCard≈延期 Top3+风险 tab），FilterBar 联动的回款域特有件留。删除走整链（组件+测试文件,沿 D 期删 compare/pmview 先例）。
2. **BoardView 内嵌不改造**：route.query.dim 读取在新路由下仍工作（redirect 保 query）；P6 不动其内部（硬编码 hex 等 L-21 余项随后续打磨）。BoardView.vue 文件位置不挪（YAGNI）。
3. 路由 redirect 写法：`{ path: '/board', redirect: (to) => ({ path: '/panalysis/board', query: to.query }) }`、`{ path: '/analysis/:tab', redirect: (to) => ({ path: `/panalysis/${to.params.tab}` }) }`；新路由 `{ path: '/panalysis/:tab?', name: 'panalysis', component: PayAnalysisView, meta: { title: '回款分析' } }`（无 hideFilter——六 tab 全依赖 filteredNodes）；:tab? 缺省视为 board。
4. nav.ts：PAYMENT_LINKS = 回款总览(/payment)、**回款分析(/panalysis/board)**、回款日历、临期跟进、回款台账；删「多维看板」项；删 `ANALYSIS_TAB_LINKS` 导出（仅 AppSidebar 消费,已核实）；AppSidebar 删 group-label「回款分析」与 nav-sub2 块及其样式可留（无害）。
5. 测试迁移：AnalysisView.test.ts → PayAnalysisView.test.ts（路径改 /panalysis/:tab + 补 board tab 内嵌断言[stub BoardView] + redirect 断言）；router 测试 loop 改 '/panalysis/board' 并断言两条 redirect；AppSidebar 断言去「多维看板」留「回款分析」；DashboardView.test 去 signals/delaytop 断言；DashSignals.test.ts/DelayTopCard.test.ts 删除。
6. navContext.goBoard 推 `/panalysis/board?dim=...`（navContext.test 同步）。

## 分级调度

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | PayAnalysisView 归并 + 路由 redirect + nav/侧栏 + navContext + 测试迁移 | 高 | opus | opus 终审合并审 |
| T2 | /payment 瘦身 + 删 DashSignals/DelayTopCard 链 + 测试 | 中 | sonnet | 主循环核实 |
| T3 | 版本 V7.5.0 + PROGRESS + verify + 终审 | 低 | 主循环 | opus 整体终审 |

## T1 要点（实现者读 AnalysisView.vue 现文件原样迁移；新页骨架）

PayAnalysisView.vue script 关键：

```ts
const TABS = [
  { tab: 'board', label: '多维看板' },
  { tab: 'projects', label: '项目总览' },
  { tab: 'nodes', label: '回款节点' },
  { tab: 'plan', label: '回款状态' },
  { tab: 'risk', label: '风险项目' },
  { tab: 'integrity', label: '数据质检' },
]
const tab = computed(() => String(route.params.tab || 'board'))
```

模板：tab 条 RouterLink `/panalysis/${t.tab}`；`<BoardView v-if="tab === 'board'" />`；档位控件与汇总条仅非 board tab 显示（`v-if="tab !== 'board'"` 包档位控件,汇总条沿用 `tab==='nodes'` 条件）；其余 5 分支与 AnalysisView 完全一致。样式块整体沿用 AnalysisView（类名不变）。

## T2 要点

DashboardView.vue：删 DashSignals/DelayTopCard 两 import 与模板引用；dash-grid 余 TierStrip/OrgRanking/TrendCard 三卡（grid 列保持 1.3fr 1fr,TrendCard 自然换行占首列；如观感差可让 TrendCard `grid-column: 1 / -1` 通栏——实现者按改后渲染合理性选择并报告）。删除文件：DashSignals.vue/.test.ts、DelayTopCard.vue/.test.ts（先 grep 确认无其他引用——OverviewView 的命中仅为 CSS 注释,不阻删）。DashboardView.test.ts 同步。

## T3 要点

版本 V7.5.0；PROGRESS：进行中 → P6 完成、下一步 P7（日历/跟进/台账逐页重做）；Handoff（归并/瘦身决策、旧路由 redirect 兼容、删链清单）；烟雾清单（/panalysis 六 tab、/board 与 /analysis/plan 旧链重定向、/payment 四卡、OrgRanking 点击带 dim 落多维 tab）；verify.sh；opus 整体终审。
