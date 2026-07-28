import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ElementPlus from 'element-plus'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { YitianData } from '@/types/yitian'
import { ALL_PAGE_LINKS } from '@/nav'

/** 页头标题取自 nav.ts 而非字面量:侧栏改了名而页头没跟,这条断言就红
 *  (防「侧栏叫工时总览、页头叫倚天总览」这种同页两个说法)。 */
const navLabel = (to: string) => ALL_PAGE_LINKS.find((l) => l.to === to)!.label

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianOverviewView from './YitianOverviewView.vue'
import AppCard from '@/components/AppCard.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import YitianReadinessCard from '@/components/YitianReadinessCard.vue'

// 跨页下钻断言只需路由能解析到目标路径,不依赖目标页真实实现(与其它并行任务隔离)。
const StubPage = { template: '<div class="stub-page" />' }

let router: Router
function mountView(comp: any = YitianOverviewView) {
  return mount(comp, { global: { plugins: [ElementPlus, router] } })
}
function newRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: YitianOverviewView },
      { path: '/yitian/analytics', component: StubPage },
      { path: '/yitian/compliance', component: StubPage },
      { path: '/yitian/detail', component: StubPage },
    ],
  })
}

// V4.5.4:meta.dataReadiness 与 entries[].tr 是契约必填。fixture 缺了它们不会红,
// 只会让就绪度卡的 v-if 恒假、整块静默不渲染 —— 那才是最坏的假绿(接线断了却全绿)。
const READINESS = {
  top1000: { provided: true, rows: 139, matchedCustomers: 97, hasQuad: true, hasBg: true },
  productCategory: { provided: true, rows: 108, coveredLines: 81, totalLines: 81 },
  calibration: { pending: 1439, calibrated: 307, ambiguous: 931, unmatched: 201 },
  unattributed: { rows: 478, hours: 2810 },
  roster: { hasSupColumn: true, managers: 14 },
}

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '2026-07-12 10:00',
          rows: 2, employees: 1, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [],
          dataReadiness: READINESS },
  roster: [{ id: 'A1', name: '张三', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工', isMgr: false }],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: [], products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [],
          custQuads: [], custBgs: [], prodCats: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [], tr: 4 },
    { d: '2026-06-02', e: 'A1', t: 0, h: 10, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 2, iss: ['MISS_NEXT'], tr: 0 },
  ],
  issues: [{ i: 1, codes: ['MISS_NEXT'], msgs: ['缺少下一步工作计划'], snippet: '正文' }],
} as unknown as YitianData

describe('YitianOverviewView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
    router = newRouter()
  })

  it('挂载即拉数据并渲染 KPI', async () => {
    const w = mountView()
    await flushPromises()
    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('总工时')
    expect(w.text()).toContain('18')          // 8 + 10
  })

  it('渲染分层汇总表:标题去括号,只含 L4 层,不含层级列,含固定汇总行', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('分层汇总')
    expect(w.text()).not.toContain('分层汇总（')
    expect(w.text()).toContain('银行服务组')
    // 只展示 L4 层:L3 名不再出现在表格里
    expect(w.text()).not.toContain('交付实施三部')
    // 层级列已删除
    expect(w.text()).not.toContain('层级')
    // 固定汇总行:合计 + 按 Σ实际÷Σ基础 重算的饱和度(18h / 16h = 112.5%)
    expect(w.text()).toContain('合计')
    expect(w.text()).toContain('112.5%')
  })

  it('加载失败显示错误', async () => {
    getSpy.mockRejectedValue(new Error('无倚天工时页面权限'))
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('无倚天工时页面权限')
  })

  it('页面有内边距(不贴边)', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.yt-page').exists()).toBe(true)
  })

  it('工时类型占比只出环图(V3.2.0 删除与之同数据的重复柱图)', async () => {
    const w = mountView()
    await flushPromises()
    const vm = w.vm as any
    expect(vm.typeOption.series[0].type).toBe('pie')
    expect(vm.typeBarOption).toBeUndefined()
  })

  it('合规率环形:接住 kpi().complianceRate,问题条数同源', async () => {
    const w = mountView()
    await flushPromises()
    const vm = w.vm as any
    expect(vm.complianceRatio).not.toBeNull()
    expect(w.text()).toContain('合规率')
    expect(w.text()).toContain(`问题 ${vm.complianceIssueCount} 条`)
  })

  it('L4 组织工时分组柱:实际/基础两个系列,与分层汇总表同源(orgRows)', async () => {
    const w = mountView()
    await flushPromises()
    const vm = w.vm as any
    expect(w.text()).toContain('L4 组织工时')
    const opt = vm.orgBarChartOption
    expect(opt.series.map((s: any) => s.name)).toEqual(['实际工时', '填报基准'])
    expect(opt.yAxis.data).toEqual(vm.orgRows.map((r: any) => r.name))
  })

  it('L4 组织工时柱单点下钻:带 dL4 跳统计分析页', async () => {
    const w = mountView()
    await flushPromises()
    ;(w.vm as any).onOrgBarClick({ name: '银行服务组' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toEqual({ dL4: '银行服务组' })
  })

  it('L4 组织工时柱单点无 name 时不跳转', async () => {
    const w = mountView()
    await flushPromises()
    ;(w.vm as any).onOrgBarClick({})
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('分层汇总行点击:带 dL4 跳统计分析页', async () => {
    const w = mountView()
    await flushPromises()
    ;(w.vm as any).onOrgRow({ name: '银行服务组' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toEqual({ dL4: '银行服务组' })
  })

  it('KPI「未填人数」卡点击:带 dScroll=neverfilled 跳统计分析页', async () => {
    const w = mountView()
    await flushPromises()
    const i = (w.vm as any).metrics.findIndex((m: any) => m.k.includes('未填'))
    ;(w.vm as any).onKpiClick(i)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toEqual({ dScroll: 'neverfilled' })
  })

  it('KPI「加班人数」卡点击:带 dScroll=diverging 跳统计分析页', async () => {
    const w = mountView()
    await flushPromises()
    const i = (w.vm as any).metrics.findIndex((m: any) => m.k.includes('加班'))
    ;(w.vm as any).onKpiClick(i)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toEqual({ dScroll: 'diverging' })
  })

  it('KPI「总工时」/「平均饱和度」卡点击:无参跳统计分析页', async () => {
    const w = mountView()
    await flushPromises()
    const i = (w.vm as any).metrics.findIndex((m: any) => m.k === '总工时')
    ;(w.vm as any).onKpiClick(i)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('KPI 卡全部标记为可点击(clickable:true)', async () => {
    const w = mountView()
    await flushPromises()
    const items = (w.vm as any).metrics as { clickable?: boolean }[]
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((it) => it.clickable === true)).toBe(true)
  })

  it('MetricGrid 点击(item-click)委托到 onKpiClick:未填人数卡触发下钻', async () => {
    const w = mountView()
    await flushPromises()
    const i = (w.vm as any).metrics.findIndex((m: any) => m.k.includes('未填'))
    const cards = w.findAll('.mg-card--clickable')
    expect(cards.length).toBe((w.vm as any).metrics.length)
    await cards[i].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toEqual({ dScroll: 'neverfilled' })
  })

  it('合规率环卡片点击:跳合规检查页', async () => {
    const w = mountView()
    await flushPromises()
    ;(w.vm as any).goCompliance()
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/compliance')
  })

  it('合规率环卡片(.yt-ring-card) DOM 点击也能跳转', async () => {
    const w = mountView()
    await flushPromises()
    await w.find('.yt-ring-card').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/compliance')
  })

  it('卡片容器接入 AppCard:2 张主卡 default,合规率环卡 flat', async () => {
    const w = mountView()
    await flushPromises()
    const cards = w.findAllComponents(AppCard)
    // 只数本页自己的卡(以 h3.yt-h 为标记):MetricGrid 等子组件内部也用 AppCard,按总数断言会被它们带偏
    const main = cards.filter((c) => c.find('h3.yt-h').exists())
    expect(main).toHaveLength(2)
    expect(main.every((c) => c.props('variant') === 'default')).toBe(true)
    const ring = cards.find((c) => c.classes().includes('yt-ring-card'))
    expect(ring, '环卡未接 AppCard').toBeTruthy()
    // 主卡 default(带阴影)与环卡 flat(无阴影)必须是不同变体,同写成 default 则两者层次差别消失
    expect(ring!.props('variant')).toBe('flat')
  })

  it('3 处卡内小标题接入 SectionTitle(section 级),.yt-h 只剩布局属性', async () => {
    const w = mountView()
    await flushPromises()
    // 只数本页自己的小标题(以 .yt-h 为标记):子组件(就绪度卡)内部也用 SectionTitle,
    // 按总数断言会被它们带偏 —— 与上面那条 AppCard 断言同一手法。
    const titles = w.findAllComponents(SectionTitle).filter((t) => t.classes().includes('yt-h'))
    expect(titles).toHaveLength(3)
    // 卡内小节标题一律 section 级(--fs-3/700);写成 card 级会与卡片主标题混为一档
    expect(titles.every((t) => t.classes().includes('st--section'))).toBe(true)
    // 字号/字重/色已收归 SectionTitle;.yt-h 留着只因它还带 margin 这类布局属性
    const rule = readFileSync(resolve(__dirname, 'YitianOverviewView.vue'), 'utf-8')
      .match(/^\.yt-h\s*\{([^}]*)\}/m)![1]
    for (const k of ['font-size', 'font-weight', 'color']) {
      expect(rule.includes(k), `.yt-h 仍自带 ${k},未收归 SectionTitle`).toBe(false)
    }
    expect(rule).toContain('margin-bottom')
  })

  it('分层汇总表 DataTable 标记 clickable(行 hover 有点击态)', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.dt-clickable-row').exists()).toBe(true)
  })

  it('渲染页头标题「工时总览」,与侧栏 label 逐字一致', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.ph-title').text()).toBe(navLabel('/yitian'))
  })

  it('就绪度卡已接线:两个 grid 都渲染出来(:data 漏传或传空则 v-if 恒假、整块静默消失)', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.findComponent(YitianReadinessCard).exists()).toBe(true)
    expect(w.find('.rc-grid').exists(), '可转移五档 grid 未渲染').toBe(true)
    expect(w.find('.rc-grid2').exists(), '就绪度 grid 未渲染').toBe(true)
    expect(w.text()).toContain('可转移非原厂支持')
    expect(w.text()).toContain('数据就绪度')
  })

  it('组织表「明细」入口跳 /yitian/detail 带 dL4', async () => {
    const w = mountView()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    ;(w.vm as any).goDetailL4({ name: '银行服务组' })
    expect(push).toHaveBeenCalledWith({ path: '/yitian/detail', query: { dL4: '银行服务组' } })
  })
})

describe('YitianOverviewView 分层汇总:剔除未分配L4', () => {
  // A2 的 L4 为空(花名册里的部门负责人) → 表里不该出现「未分配L4」行,合计也只算可见行
  const WITH_EMPTY = {
    ...DATA,
    roster: [
      ...DATA.roster,
      { id: 'A2', name: '李四', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '', category: '正式员工', isMgr: false },
    ],
    entries: [
      ...DATA.entries,
      { d: '2026-06-01', e: 'A2', t: 0, h: 6, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [], tr: 3 },
    ],
  } as unknown as YitianData

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(WITH_EMPTY)
    router = newRouter()
  })

  it('表格不含「未分配L4」行', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.text()).not.toContain('未分配L4')
    expect((w.vm as any).orgRows.map((r: any) => r.name)).toEqual(['银行服务组'])
  })

  it('合计只统计表中可见的行(与所见一致)', async () => {
    const w = mountView()
    await flushPromises()
    // 张三 18h(银行服务组) 可见;李四 6h(无 L4) 已剔除 → 合计 1 人 / 18h,不是 2 人 / 24h。
    // 注意:KPI 卡的「总工时」仍是 24h —— 剔除只作用于这张 L4 表,不改全局口径。
    const cols = [{ property: 'name' }, { property: 'people' }, { property: 'hoursText' }, { property: 'satText' }]
    const summary = (w.vm as any).orgSummaryMethod({ columns: cols })
    expect(summary).toEqual(['合计', '1', '18.0', '112.5%'])
  })
})
