import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
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

// ── 本次(V4.5.11)全量盘点 ───────────────────────────────────────────────────
// 新增或改动任一张 sticky-header 表都会让下面第一条用例变红。这是【故意】的:
// 必须当场回答「这张表在页面的什么位置」,因为两种位置的正解完全不同 ——
//   · 页面顶部(PageHeader + 工具栏之下,rect.top ≈ 250px)
//        → 动态测量测得准,不要传 max-height-px
//   · 长分析页底部(KPI / 图表 / 多卡片之后)
//        → 必须传 :max-height-px="DETAIL_TABLE_MAX_H",否则 rect.top 远大于视口高、
//          算出负数退到兜底地板,表格塌缩成约 10 行(V4.5.11 之前是 4 行)
// 判据与常量见 lib/tableLayout.ts。变红时请把新文件归入下面某一类,不要直接删用例。
const FIXED = [
  'CostDetailView.vue',        // /insight/costdetail 明细表:6 图之后
  'MilestoneDelayedTab.vue',   // /insight/milestone 三表:6 图之后(V4.5.11 修)
  'MilestonePlanTab.vue',
  'MilestoneReminderTab.vue',
  'YitianAnalyticsView.vue',   // 页内 tab 中的中等表,固定 560(处境不同,保持原值)
  'YitianComplianceView.vue',  // 同上
].sort()

const DYNAMIC = [
  'ClosedProjectsView.vue', 'KeyProjectsView.vue', 'OpportunityFollowupView.vue',
  'PayNodesView.vue', 'PayProjectsView.vue', 'PaymentKeyFollowupView.vue',
  'ProjectsView.vue', 'RiskFollowupView.vue', 'TempInstancePanel.vue',
  'YitianDetailView.vue',
].sort()

describe('sticky-header 表格高度清单守卫', () => {
  it('清单逐项吻合;新增 sticky 表必须显式归入固定高度或动态测高一类', () => {
    const all = scanVue((s) => s.includes('sticky-header'))
    const fixed = scanVue((s) => s.includes('sticky-header') && s.includes('max-height-px'))
    const dynamic = all.filter((f) => !fixed.includes(f))

    // 【自证规模】目录读取或匹配一旦失效会返回空数组,让下面两条 toEqual 变成恒真式空跑
    // (本仓踩过:结构守卫解析失配 → 循环空跑 → 恒绿)。先钉死规模,再比内容。
    expect(all.length, '扫到的 sticky-header 表数量异常,先检查扫描路径是否失效').toBe(16)
    expect(fixed.length + dynamic.length).toBe(all.length)

    expect(fixed, '这些表传了固定 max-height —— 新增的请确认它确实在长页面底部').toEqual(FIXED)
    expect(dynamic, '这些表用动态测高 —— 新增的请确认它确实在页面顶部,否则会塌缩').toEqual(DYNAMIC)
  })

  it('useTableMaxHeight 只有 DataTable 与 OpportunitiesView 两个调用方', () => {
    // 第三个调用方 = 又一处绕过 DataTable 的裸 el-table,须显式评审(它拿不到
    // max-height-px 这条逃生口,只能吃动态测量 + 兜底地板)。
    const callers = scanVue((s) => s.includes('useTableMaxHeight('))
    expect(callers).toEqual(['DataTable.vue', 'OpportunitiesView.vue'])
  })
})
