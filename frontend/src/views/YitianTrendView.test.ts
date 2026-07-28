import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ElementPlus from 'element-plus'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { YitianData } from '@/types/yitian'
import { ALL_PAGE_LINKS } from '@/nav'

/** 页头标题取自 nav.ts 而非字面量:侧栏/tab 改了名而页头没跟,这条断言就红
 *  (防「tab 叫趋势分析、页头叫工时趋势」这种同页两个说法)。 */
const navLabel = (to: string) => ALL_PAGE_LINKS.find((l) => l.to === to)!.label

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))
// ChartBox 内部依赖 canvas,单测里替身掉,只断言 option
vi.mock('@/charts/ChartBox.vue', () => ({
  default: { name: 'ChartBox', props: ['option', 'height'], template: '<div class="chart-stub" />' },
}))

import YitianTrendView from './YitianTrendView.vue'
import AppCard from '@/components/AppCard.vue'
import SectionTitle from '@/components/SectionTitle.vue'
import { useYitianViewStore } from '@/stores/yitianView'

// 6/1~6/4 全工作日;张三 6/1 8h(合规) 6/5 8h(问题)。calc 口径下 6/5 属下一个计算周
const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-05', generatedAt: '', rows: 2,
          employees: 1, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [{ id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' }],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-03', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-04', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-05', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: [], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
    { d: '2026-06-05', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 2, iss: ['MISS_NEXT'] },
  ],
  issues: [{ i: 1, codes: ['MISS_NEXT'], msgs: ['缺少下一步工作计划'], snippet: '正文' }],
} as unknown as YitianData

/** 视图内用 useRouter() 做下钻跳转,mount 需带一个装好的 router 才不告警(未调用 push 的用例功能不受影响)。 */
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: YitianTrendView },
      { path: '/yitian/compliance', component: { template: '<div />' } },
      { path: '/yitian/analytics', component: { template: '<div />' } },
    ],
  })
}

describe('YitianTrendView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('渲染 6 张图(总工时+合规率合成双轴,减一张卡)', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus, makeRouter()] } })
    await flushPromises()
    expect(w.findAll('.chart-stub')).toHaveLength(6)
  })

  it('calc 口径下按计算周分桶(6/5 单独一桶)', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus, makeRouter()] } })
    await flushPromises()
    const s = (w.vm as any).series as { weeks: string[]; issues: number[]; hours: number[] }
    expect(s.weeks).toEqual(['2026-CW23', '2026-CW24'])
    expect(s.issues).toEqual([0, 1])
    expect(s.hours).toEqual([8, 8])
  })

  it('切成 iso 口径后并成一桶', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus, makeRouter()] } })
    await flushPromises()
    useYitianViewStore().weekMode = 'iso'
    await flushPromises()
    const s = (w.vm as any).series as { weeks: string[]; hours: number[] }
    expect(s.weeks).toEqual(['2026-W23'])
    expect(s.hours).toEqual([16])
  })

  it('页面有内边距(不贴边)', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus, makeRouter()] } })
    await flushPromises()
    expect(w.find('.yt-page').exists()).toBe(true)
  })

  it('6 张趋势卡全部接入 AppCard(default)', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus, makeRouter()] } })
    await flushPromises()
    const cards = w.findAllComponents(AppCard)
    // 只数本页自己的卡(以 h3.yt-h 为标记):子组件内部也可能用 AppCard,按总数断言会被它们带偏
    const main = cards.filter((c) => c.find('h3.yt-h').exists())
    expect(main).toHaveLength(6)
    expect(main.every((c) => c.props('variant') === 'default')).toBe(true)
  })

  it('6 处卡内小标题接入 SectionTitle(section 级),.yt-h 只剩布局属性', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus, makeRouter()] } })
    await flushPromises()
    const titles = w.findAllComponents(SectionTitle)
    expect(titles).toHaveLength(6)
    // 卡内小节标题一律 section 级(--fs-3/700);写成 card 级会与卡片主标题混为一档
    expect(titles.every((t) => t.classes().includes('st--section'))).toBe(true)
    // 字号/字重/色已收归 SectionTitle;.yt-h 留着只因它还带 margin 这类布局属性
    const rule = readFileSync(resolve(__dirname, 'YitianTrendView.vue'), 'utf-8')
      .match(/^\.yt-h\s*\{([^}]*)\}/m)![1]
    for (const k of ['font-size', 'font-weight', 'color']) {
      expect(rule.includes(k), `.yt-h 仍自带 ${k},未收归 SectionTitle`).toBe(false)
    }
    expect(rule).toContain('margin-bottom')
  })

  it('渲染页头标题「趋势分析」,与 tab label 逐字一致', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus, makeRouter()] } })
    await flushPromises()
    expect(w.find('.ph-title').text()).toBe(navLabel('/yitian/trend'))
  })
})

// I-5:零工作日的整周(假期周)不能画成合规率/饱和度 0%——那是凭空捏造出的暴跌,
// 与 /yitian KPI 卡对同一个 null 显示 '-' 的口径不一致。
const DATA_WITH_HOLIDAY_WEEK = {
  ...DATA,
  meta: { ...DATA.meta, periodEnd: '2026-06-09' },
  days: [
    ...DATA.days,
    { d: '2026-06-08', workday: false, isoWeek: '2026-W24', calcWeek: '2026-CW25' },
    { d: '2026-06-09', workday: false, isoWeek: '2026-W24', calcWeek: '2026-CW25' },
  ],
  // 假期周内零工时记录(entries 保持不变,不新增)
} as unknown as YitianData

describe('YitianTrendView · 假期周(零工作日)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA_WITH_HOLIDAY_WEEK)
  })

  it('合规率/饱和度在假期周为 null,不画成 0%', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus, makeRouter()] } })
    await flushPromises()
    const s = (w.vm as any).series as {
      weeks: string[]; okRate: (number | null)[]; sat: (number | null)[]
    }
    const idx = s.weeks.indexOf('2026-CW25')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(s.okRate[idx]).toBeNull()
    expect(s.sat[idx]).toBeNull()
  })
})

// 时间点跨页下钻:按指标分流(问题数/合规率→compliance;工时/饱和度/未填/总工时→analytics)+ 带该桶起止日期区间。
// 桶起止日期同源于 bucketsList:calc 口径下 2026-CW23 = 06-01~06-04(见顶部 DATA)。
describe('YitianTrendView · 下钻(跨页,按指标分流)', () => {
  let router: Router

  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/yitian/trend', component: YitianTrendView },
        { path: '/yitian/compliance', component: { template: '<div />' } },
        { path: '/yitian/analytics', component: { template: '<div />' } },
      ],
    })
    await router.push('/yitian/trend')
  })

  async function mountAndCharts() {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    return { w, charts: w.findAllComponents({ name: 'ChartBox' }) }
  }

  it('问题数折线点击 → /yitian/compliance,带该桶起止日期', async () => {
    const { charts } = await mountAndCharts()
    await charts[0].vm.$emit('datapoint-click', { name: '2026-CW23', seriesName: '问题数' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/compliance')
    expect(router.currentRoute.value.query).toMatchObject({ dStart: '2026-06-01', dEnd: '2026-06-04' })
  })

  it('双轴图「合规率」系列点击 → /yitian/compliance', async () => {
    const { charts } = await mountAndCharts()
    await charts[1].vm.$emit('datapoint-click', { name: '2026-CW24', seriesName: '合规率' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/compliance')
    expect(router.currentRoute.value.query).toMatchObject({ dStart: '2026-06-05', dEnd: '2026-06-05' })
  })

  it('双轴图「总工时」系列点击 → /yitian/analytics(工时明细归 analytics,非 compliance)', async () => {
    const { charts } = await mountAndCharts()
    await charts[1].vm.$emit('datapoint-click', { name: '2026-CW23', seriesName: '总工时' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toMatchObject({ dStart: '2026-06-01', dEnd: '2026-06-04' })
  })

  it('加班工时/饱和度/未填人数折线点击 → /yitian/analytics', async () => {
    const { charts } = await mountAndCharts()
    await charts[2].vm.$emit('datapoint-click', { name: '2026-CW23', seriesName: '加班工时' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')

    await router.push('/yitian/trend')
    await charts[3].vm.$emit('datapoint-click', { name: '2026-CW23', seriesName: '饱和度' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')

    await router.push('/yitian/trend')
    await charts[4].vm.$emit('datapoint-click', { name: '2026-CW23', seriesName: '未填人数' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
  })

  it('百分比堆叠柱(工时类型占比)不挂下钻——点击不导航', async () => {
    const { charts } = await mountAndCharts()
    expect(charts).toHaveLength(6)
    await charts[5].vm.$emit('datapoint-click', { name: '2026-CW23', seriesName: '项目类' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/trend')
  })

  it('点击 name 对不上任何桶 key(非时间点,如图例)→ 忽略,不导航', async () => {
    const { charts } = await mountAndCharts()
    await charts[0].vm.$emit('datapoint-click', { name: '问题数', seriesName: '问题数' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/trend')
  })

  // 粒度(V4.5.6 补半年/年)。借用本 describe 的 mountAndCharts:粒度决定分桶,与上面的桶 key 下钻同源。
  it('粒度选项含五档且顺序为 周-月-季-半年-年', async () => {
    const { w } = await mountAndCharts()
    const seg = w.findComponent({ name: 'SegToggle' })
    expect(seg.exists()).toBe(true)
    const opts = seg.props('options') as { value: string; label: string }[]
    expect(opts.map((o) => o.value)).toEqual(['week', 'month', 'quarter', 'half', 'year'])
    expect(opts.map((o) => o.label)).toEqual(['周', '月', '季', '半年', '年'])
  })

  it('切到半年粒度后 X 轴按 YYYY-Hn 分桶', async () => {
    const { w, charts } = await mountAndCharts()
    await w.findComponent({ name: 'SegToggle' }).vm.$emit('update:modelValue', 'half')
    await flushPromises()
    const keys = (charts[0].props('option') as { xAxis?: { data?: string[] } }).xAxis?.data ?? []
    // 先钉死桶数:空数组会让下面的逐项断言空跑成恒真(本仓吃过这种假绿)。
    // DATA 全落 2026 年 6 月,半年粒度下应并成 H1 一个桶(周粒度下是 CW23/CW24 两个)。
    expect(keys).toEqual(['2026-H1'])
    for (const k of keys) expect(k, k).toMatch(/^\d{4}-H[12]$/)
  })

  it('切到年粒度后 X 轴按 YYYY 分桶', async () => {
    const { w, charts } = await mountAndCharts()
    await w.findComponent({ name: 'SegToggle' }).vm.$emit('update:modelValue', 'year')
    await flushPromises()
    expect((charts[0].props('option') as { xAxis?: { data?: string[] } }).xAxis?.data).toEqual(['2026'])
  })
})
