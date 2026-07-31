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
// 【640 的来历】设计规范定「单元格内边距纵 8 横 12」,中档字号(18)下表头与行高各约 41px,
// (640-41)/41 ≈ 14~15 行;且在 768 高的笔记本视口上不会撑出屏幕外 —— 撑出后 el-table 的
// 冻结表头会随页面一起滚走、当场失效。
export const DETAIL_TABLE_MAX_H = 640
