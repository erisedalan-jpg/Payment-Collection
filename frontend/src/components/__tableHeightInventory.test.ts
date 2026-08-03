import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve(__dirname, '..')
const DIRS = ['components', 'views']

function scanVue(pred: (src: string) => boolean): string[] {
  const hit: string[] = []
  for (const dir of DIRS) {
    for (const f of readdirSync(resolve(SRC, dir))) {
      if (!f.endsWith('.vue')) continue
      if (pred(readFileSync(resolve(SRC, dir, f), 'utf-8'))) hit.push(f)
    }
  }
  return hit.sort()
}

// ── 全量盘点(V4.5.11 建立,V4.5.12 加入弹窗一类) ─────────────────────────────
// 新增或改动任一张 sticky-header 表都会让下面第一条用例变红。这是【故意】的:
// 必须当场回答「这张表在哪」,因为三种处境的正解完全不同 ——
//   · 页面顶部(PageHeader + 工具栏之下,rect.top ≈ 250px)
//        → 动态测量测得准,不要传 max-height-px
//   · 长分析页底部(KPI / 图表 / 多卡片之后)
//        → 必须传 :max-height-px="DETAIL_TABLE_MAX_H",否则 rect.top 远大于视口高、
//          算出负数退到兜底地板,表格塌缩成约 10 行(V4.5.11 之前是 4 行)
//   · 弹窗(Modal/el-dialog)内
//        → 用 useDialogTableHeight(),【不要】套 DETAIL_TABLE_MAX_H:弹窗可用高度取决于
//          「视口 − dialog 自身 chrome」而非页面位置,640 在矮屏上必然溢出(L-64)
// 判据与常量见 lib/tableLayout.ts。变红时请把新文件归入下面某一类,不要直接删用例。
const FIXED = [
  'CostDetailView.vue',        // /insight/costdetail 明细表:6 图之后
  'MilestoneDelayedTab.vue',   // /insight/milestone 三表:6 图之后(V4.5.11 修)
  'MilestonePlanTab.vue',
  'MilestoneReminderTab.vue',
  'YitianAnalyticsView.vue',   // 页内 tab 中的中等表,固定 560(处境不同,保持原值)
  'YitianComplianceView.vue',  // 同上
].sort()

// 注:本清单按 `sticky-header` 字符串统计。views/OpportunitiesView.vue 是裸 el-table 手接
// useTableMaxHeight 的第 17 张冻结表头表,不含该字符串故不在此列,由下面第二条用例兜住。
const DYNAMIC = [
  'ClosedProjectsView.vue', 'KeyProjectsView.vue', 'OpportunityFollowupView.vue',
  'PayNodesView.vue', 'PayProjectsView.vue', 'PaymentKeyFollowupView.vue',
  'ProjectsView.vue', 'RiskFollowupView.vue', 'TempInstancePanel.vue',
  'YitianDetailView.vue',
].sort()

// 弹窗内的表(V4.5.12/L-64):高度按视口算,与页面位置无关。这一类同时含 max-height-px,
// 故必须【先】从 FIXED 里摘出来,否则会被误判成「长页面底部的固定高度表」。
const DIALOG = [
  'BoardDrilldownModal.vue', 'DataDrillModal.vue', 'InsightDrillModal.vue',
  'MilestoneDrillModal.vue', 'MilestoneStatusModal.vue', 'RiskDrillModal.vue',
].sort()

describe('sticky-header 表格高度清单守卫', () => {
  it('清单逐项吻合;新增 sticky 表必须显式归入固定高度/动态测高/弹窗三类之一', () => {
    const all = scanVue((s) => s.includes('sticky-header'))
    const dialog = scanVue((s) => s.includes('sticky-header') && s.includes('useDialogTableHeight'))
    const fixed = scanVue((s) => s.includes('sticky-header') && s.includes('max-height-px'))
      .filter((f) => !dialog.includes(f))
    const dynamic = all.filter((f) => !fixed.includes(f) && !dialog.includes(f))

    // 【自证规模】先钉死规模再比内容:目录读取或匹配一旦失效,这条会给出「规模变了」这个
    // 准确得多的失败信息(空扫描时下面两条 toEqual 也会红 —— FIXED/DYNAMIC 是非空字面量 ——
    // 但报的是「一堆文件不见了」,指向不对)。注意扫描路径写坏时 readdirSync 直接抛 ENOENT。
    expect(all.length, 'sticky-header 表数量变了:若你新增/删除了一张表,请把它归入下面 FIXED / DYNAMIC / DIALOG 之一并把本数字改对;若你没动过表,那就是扫描路径失效了').toBe(22)

    // 分类谓词是【文件级】的:同一文件里出现第二张 sticky 表时,只要该文件已含 max-height-px
    // 就会被整体判为 FIXED,新表哪怕没传固定高度也溜过去。钉住「一文件一表」这个前提。
    const multi = all.filter((f) => {
      const dir = DIRS.find((d) => existsSync(resolve(SRC, d, f)))!
      return (readFileSync(resolve(SRC, dir, f), 'utf-8').match(/sticky-header/g) ?? []).length > 1
    })
    expect(multi, '这些文件里有不止一张 sticky 表,本守卫的文件级分类已不适用,请改成逐表匹配').toEqual([])

    expect(fixed, '这些表传了固定 max-height —— 新增的请确认它确实在长页面底部').toEqual(FIXED)
    expect(dynamic, '这些表用动态测高 —— 新增的请确认它确实在页面顶部,否则会塌缩').toEqual(DYNAMIC)
    expect(dialog, '这些是弹窗内的表 —— 高度按视口算,不要改套 DETAIL_TABLE_MAX_H').toEqual(DIALOG)
  })

  it('弹窗内的表一张都不许漏:所有 Modal 里包着 DataTable 的组件都得有高度约束', () => {
    // 只钉 DIALOG 清单会漏掉「新写了个弹窗、既没 sticky-header 也没高度约束」的情况 ——
    // 那种文件压根不含 sticky-header,上面第一条用例的规模数不会变,它就静静地长成
    // 一个能撑破视口的弹窗(L-64 修复前 6 个弹窗全是这样)。
    //
    // 谓词必须【块级】:文件级的「含 <Modal 且含 <DataTable」会把 ProjectsView.vue 误判进来 ——
    // 它的 <Modal> 是「导出范围」复选框弹窗、<DataTable> 是页面主表,两者根本没有嵌套关系。
    const modalHasTable = (s: string) =>
      (s.match(/<Modal[\s>][\s\S]*?<\/Modal>/g) ?? []).some((b) => b.includes('<DataTable'))

    const modalWithTable = scanVue(modalHasTable)
    // 【自证】两条都断言成【非空】的 DIALOG:正则一旦失配,两边同时变空集,
    // 若只写 constrained==modalWithTable 就成了 [] == [] 的恒真。
    expect(modalWithTable, '弹窗内含表格的组件清单变了,请同步 DIALOG(或检查正则是否已失配)').toEqual(DIALOG)
    const constrained = scanVue((s) => modalHasTable(s) && s.includes('useDialogTableHeight'))
    expect(constrained, '这些弹窗里有表格却没接 useDialogTableHeight,长表会把对话框撑到几千像素').toEqual(DIALOG)
  })

  it('useTableMaxHeight 只有 DataTable 与 OpportunitiesView 两个调用方', () => {
    // 第三个调用方 = 又一处绕过 DataTable 的裸 el-table,须显式评审(它拿不到
    // max-height-px 这条逃生口,只能吃动态测量 + 兜底地板)。
    const callers = scanVue((s) => s.includes('useTableMaxHeight('))
    expect(callers).toEqual(['DataTable.vue', 'OpportunitiesView.vue'])
  })
})
