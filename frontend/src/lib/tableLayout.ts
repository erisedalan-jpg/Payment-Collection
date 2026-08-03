// 表格高度口径的单一来源。
//
// 【为什么需要显式固定值】DataTable 的 sticky-header 默认按「表格在视口中的位置」动态测高
// (composables/useTableMaxHeight.ts)。该测量只在挂载 / window resize / keep-alive 激活 /
// props.rows 变化时跑,拿到的是那一刻的 rect.top —— 对【位于长页面折叠线以下】的表格,
// 挂载时 rect.top 远大于视口高,算出负数后只能退到兜底地板,表格塌缩成几行。
// /insight/milestone 底部三张 >100 条的明细表就因此只显示 3~4 行(V4.5.11 报障),
// /insight/costdetail 的明细表更早踩过同一个坑(见 CostDetailView.test.ts 该用例名)。
//
// 【判据】新增一张 sticky-header 表时按位置二选一,不要凭感觉:
//   · 表格紧跟在 PageHeader + 工具栏之下(rect.top ≈ 250px)  → 动态测量测得准,【不要】传 max-height-px
//   · 表格位于 KPI / 图表 / 多个卡片之后(长分析页底部)      → 必须传 :max-height-px="DETAIL_TABLE_MAX_H"
// 该判据由 components/__tableHeightInventory.test.ts 的清单守卫强制:新增任一 sticky 表都会变红。
//
// 【两条例外,别当成待统一的违规】
//   · YitianAnalyticsView / YitianComplianceView 是页内 tab 中的中等表,刻意保持内联 560(见
//     components/__tableHeightInventory.test.ts 的 FIXED 注释),不改用本常量。
//   · 弹窗(Modal/el-dialog)内的表格【不适用】本常量 —— 弹窗的可用高度是「视口高 − dialog 的
//     margin/标题/footer」,与页面位置无关,需另定口径(见 PROGRESS backlog L-64)。
//
// 【640 的来历】设计规范定「单元格内边距纵 8 横 12」,中档字号(18)下表头与行高各约 41px,
// (640-41)/41 ≈ 14~15 行;注意 640 是按「滚到该表时它能整个落进视口」定的,而 1366×768
// 笔记本的 innerHeight 实际只有 620~660(屏幕高 ≠ innerHeight),此时表体会略微越过视口底
// —— 相比修复前的 4 行仍是大幅改善,但再往上加会明显恶化(表头随页面滚走)。
export const DETAIL_TABLE_MAX_H = 640

// ── 弹窗(Modal/el-dialog)内的表格:另一条口径 ────────────────────────────────
// 【为什么不能复用 DETAIL_TABLE_MAX_H】页面内表格的可用高度取决于「表格在页面里的位置」,
// 弹窗内表格的可用高度取决于「视口高 − dialog 自己的 chrome」,与位置无关 —— 640 在
// innerHeight≈640 的笔记本上,加上 dialog 的顶边距和标题栏必然溢出。
//
// 【为什么用固定值而不是 useTableMaxHeight 动态测量】弹窗有开场过渡动画,挂载瞬间 rect 还在
// 变换中;且 el-dialog 默认 destroy-on-close=false,第二次打开不会重新挂载、动态测量不会重跑。
//
// 【扣除项】Element Plus 默认几何:margin-top 15vh + margin-bottom 50 + 标题栏 ~54 +
// body 上下 padding ~40 + 余量 16 ≈ 0.15×视口 + 160。地板 240(≈5 行)兜住极矮视口。
// 不设上限:视口越高弹窗越高是对的,撑不破 —— 表体本身就被 max-height 关住了。
export const DIALOG_TABLE_MIN_H = 240

// 下钻弹窗一次最多渲染多少行。el-table 没有虚拟滚动,上千行会明显卡顿,所以上限保留;
// 但超出部分【必须显式告诉用户】—— L-64 之前 BoardDrilldownModal / DataDrillModal 两处
// 都是静默 slice(0, 200),用户看到的「就是全部」其实不是全部,且无从察觉。
export const DRILL_ROW_LIMIT = 200

export function dialogTableMaxHeight(innerHeight?: number): number {
  const ih = innerHeight ?? (typeof window === 'undefined' ? 900 : window.innerHeight)
  return Math.max(DIALOG_TABLE_MIN_H, Math.round(ih * 0.85) - 160)
}
