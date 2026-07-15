import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { useYitianViewStore } from '@/stores/yitianView'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianAnalyticsView from './YitianAnalyticsView.vue'

// 两天工作日 → 基础 16h。张三 20h(加班) 李四 8h(欠填) 王五 零记录(完全未填)
const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 2,
          employees: 3, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' },
    { id: 'A2', name: '李四', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' },
    { id: 'A3', name: '王五', l2: '', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '正式员工' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: [], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 20, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
    { d: '2026-06-01', e: 'A2', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
  ],
  issues: [],
} as unknown as YitianData

// 60 名员工,用于分页断言(pageSize=50 → 第 1 页 50 条,第 2 页 10 条)
function bigData(): YitianData {
  const roster = Array.from({ length: 60 }, (_, i) => ({
    id: `E${i + 1}`, name: `员工${i + 1}`, l2: '', l3: '交付实施三部', l31: '服务二部',
    l4: i % 2 === 0 ? '银行服务组' : '浙江服务组', category: '正式员工',
  }))
  const entries = roster.map((r) => ({
    d: '2026-06-01', e: r.id, t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [],
  }))
  return {
    meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: entries.length,
            employees: roster.length, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
    roster,
    days: [
      { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
      { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    ],
    dims: { types: ['项目类'], workTypes: [], customers: [], products: [], productNames: [],
            projectTypes: [], salesL2: [], serviceModes: [] },
    entries,
    issues: [],
  } as unknown as YitianData
}

let router: Router
function mountView() {
  return mount(YitianAnalyticsView, { global: { plugins: [ElementPlus, router] } })
}

describe('YitianAnalyticsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: YitianAnalyticsView },
        { path: '/yitian/analytics', component: YitianAnalyticsView },
      ],
    })
  })
  afterEach(() => { document.body.innerHTML = '' })

  it('员工明细覆盖花名册全员', async () => {
    const w = mountView()
    await flushPromises()
    const rows = (w.vm as any).empRows as { name: string }[]
    expect(rows.map((r) => r.name).sort()).toEqual(['张三', '李四', '王五'].sort())
  })

  it('未按时填写清单只含有记录且欠填的人', async () => {
    const w = mountView()
    await flushPromises()
    const rows = (w.vm as any).unfilledRows as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['李四'])
  })

  it('完全未填清单含零记录的人(原工具盲区)', async () => {
    const w = mountView()
    await flushPromises()
    const rows = (w.vm as any).neverRows as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['王五'])
    expect(w.text()).toContain('完全未填')
  })

  it('饱和度榜降序', async () => {
    const w = mountView()
    await flushPromises()
    const rows = (w.vm as any).topRows as { name: string }[]
    expect(rows[0].name).toBe('张三')
  })

  it('页面有内边距(不贴边)', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.yt-page').exists()).toBe(true)
  })

  it('员工明细表 8 列全带列头筛选图标', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.findAll('.cf-icon').length).toBe(8)
  })

  it('员工明细分页:60 人第1页50条/第2页10条,切换后 currentPage 复位于筛选变化时', async () => {
    getSpy.mockResolvedValue(bigData())
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).filtered.length).toBe(60)
    expect((w.vm as any).paged.length).toBe(50)
    ;(w.vm as any).currentPage = 2
    await w.vm.$nextTick()
    expect((w.vm as any).paged.length).toBe(10)
    // 列筛选变化 → currentPage 复位为 1
    const cf = useCrossFilterStore()
    cf.setColumnFilter('yitian-analytics', 'l4', ['银行服务组'], 2)
    await w.vm.$nextTick()
    expect((w.vm as any).currentPage).toBe(1)
    expect((w.vm as any).filtered.length).toBe(30)
  })

  it('员工级图表单点(柱图 data.id)下钻:按工号精确筛到该员工 + 滚到明细表', async () => {
    // 真实 ECharts 柱图 param 形状:data 是 {value,id,...} 对象,value 已被抽取为标量;
    // 若还按旧 p.name 查找会漏(柱图 param 无 name)、按姓名反查也会撞同名歧义(I-2)。
    const spy = vi.fn()
    ;(Element.prototype as any).scrollIntoView = spy
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus, router] }, attachTo: document.body })
    await flushPromises()
    ;(w.vm as any).onEmpChartClick({ data: { value: 40, id: 'A1' } })
    await w.vm.$nextTick()
    await flushPromises()
    const cf = useCrossFilterStore()
    expect(cf.tableFilters('yitian-analytics').id?.value).toEqual(['A1'])
    expect((w.vm as any).filtered.map((r: any) => r.name)).toEqual(['张三'])
    expect(spy).toHaveBeenCalled()
    w.unmount()
  })

  it('员工级图表单点(散点 value[3]=id)下钻:name 键为空串也不影响(I-1)', async () => {
    // 真实 ECharts 散点 param.name 恒为空串(散点没有类目名维度);若 handler 仍靠
    // p.name ?? p.value[2] 回退,拿到的是 ''(真值判断为假但仍会走进旧逻辑试图用它查名字),
    // 现在直接读 value[3] 的工号,连 name 键给不给都不影响结果。
    const w = mountView()
    await flushPromises()
    ;(w.vm as any).onEmpChartClick({ value: [8, 50, '', 'A2'] })
    await w.vm.$nextTick()
    const cf = useCrossFilterStore()
    expect(cf.tableFilters('yitian-analytics').id?.value).toEqual(['A2'])
  })

  it('无 id 的下钻点击不改变筛选态', async () => {
    const w = mountView()
    await flushPromises()
    ;(w.vm as any).onEmpChartClick({ name: '张三' }) // 没有 data.id / value[3] → 取不到 id
    await w.vm.$nextTick()
    const cf = useCrossFilterStore()
    expect(cf.hasFilters('yitian-analytics')).toBe(false)
  })

  it('HealthSegmentBar 无 to 的图例点击 → seg-click → 滚到对应子表锚点', async () => {
    const spy = vi.fn()
    ;(Element.prototype as any).scrollIntoView = spy
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus, router] }, attachTo: document.body })
    await flushPromises()
    // 「欠填」图例(无 to)→ onSegClick('under') → 滚到 #yt-unfilled
    const legs = w.findAll('.hsb-leg')
    const underLeg = legs.find((l) => l.text().includes('欠填'))
    expect(underLeg).toBeTruthy()
    await underLeg!.trigger('click')
    await w.vm.$nextTick()
    await flushPromises()
    expect(spy).toHaveBeenCalled()
    w.unmount()
  })

  it('onSegClick 三键位映射: never→yt-neverfilled / under→yt-unfilled / 其它→yt-emp', async () => {
    const spy = vi.fn()
    ;(Element.prototype as any).scrollIntoView = spy
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus, router] }, attachTo: document.body })
    await flushPromises()
    ;(w.vm as any).onSegClick('never')
    await flushPromises()
    expect(document.getElementById('yt-neverfilled')).toBeTruthy()
    ;(w.vm as any).onSegClick('under')
    await flushPromises()
    expect(document.getElementById('yt-unfilled')).toBeTruthy()
    ;(w.vm as any).onSegClick('ok')
    await flushPromises()
    expect(document.getElementById('yt-emp')).toBeTruthy()
    expect(spy).toHaveBeenCalled()
    w.unmount()
  })

  it('落地读 query: dL4 设 l4 列筛选、dStart+dEnd 设日期区间,读完清空 query', async () => {
    await router.push('/yitian/analytics?dL4=浙江服务组&dStart=2026-06-01&dEnd=2026-06-02')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    const cf = useCrossFilterStore()
    expect(cf.tableFilters('yitian-analytics').l4?.value).toEqual(['浙江服务组'])
    expect((w.vm as any).filtered.map((r: any) => r.name)).toEqual(['王五'])
    const view = useYitianViewStore()
    expect(view.start).toBe('2026-06-01')
    expect(view.end).toBe('2026-06-02')
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('落地清 query 只删下钻键(dL4/dStart/dEnd/dScroll),保留其它非下钻参数(M-2)', async () => {
    await router.push('/yitian/analytics?dL4=浙江服务组&keep=1')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ keep: '1' })
    w.unmount()
  })

  it('落地读 query: dScroll=neverfilled 滚到完全未填锚点', async () => {
    ;(Element.prototype as any).scrollIntoView = vi.fn()
    await router.push('/yitian/analytics?dScroll=neverfilled')
    await router.isReady()
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus, router] }, attachTo: document.body })
    await flushPromises()
    expect(document.getElementById('yt-neverfilled')).toBeTruthy()
    w.unmount()
  })

  it('落地读 query: dScroll=diverging(默认)滚到加班/欠填锚点', async () => {
    ;(Element.prototype as any).scrollIntoView = vi.fn()
    await router.push('/yitian/analytics?dScroll=diverging')
    await router.isReady()
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus, router] }, attachTo: document.body })
    await flushPromises()
    expect(document.getElementById('yt-diverging')).toBeTruthy()
    w.unmount()
  })

  it('无 query 时不动 crossFilter/日期区间', async () => {
    const w = mountView()
    await flushPromises()
    const cf = useCrossFilterStore()
    expect(cf.hasFilters('yitian-analytics')).toBe(false)
  })

  it('结构段锚点 id 齐全: yt-diverging/yt-unfilled/yt-neverfilled/yt-emp', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('#yt-diverging').exists()).toBe(true)
    expect(w.find('#yt-unfilled').exists()).toBe(true)
    expect(w.find('#yt-neverfilled').exists()).toBe(true)
    expect(w.find('#yt-emp').exists()).toBe(true)
  })
})
