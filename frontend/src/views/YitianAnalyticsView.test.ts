import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ElementPlus from 'element-plus'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { YitianData } from '@/types/yitian'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { useYitianViewStore } from '@/stores/yitianView'
import { ALL_PAGE_LINKS } from '@/nav'
import { userScopedKey } from '@/lib/userScopedKey'

/** 页头标题取自 nav.ts 而非字面量:侧栏/tab 改了名而页头没跟,这条断言就红
 *  (防「tab 叫统计分析、页头叫工时统计」这种同页两个说法)。 */
const navLabel = (to: string) => ALL_PAGE_LINKS.find((l) => l.to === to)!.label

/** 五类工时拆分列(V4.5.6)。值由 lib/yitian/empSplit 算出、在视图里 decorate 到行上。 */
const SPLIT_KEYS = ['nonCustomer', 'customer', 'project', 'presale', 'postsale'] as const

/** 员工工时明细表:以只有它才有的 satText 列认表(短表/完全未填表都没有该列)。 */
function empTable(w: ReturnType<typeof mountView>) {
  const t = w.findAllComponents({ name: 'DataTable' })
    .find((x) => (x.props('columns') as { key: string }[]).some((c) => c.key === 'satText'))
  expect(t, '找不到员工工时明细表').toBeTruthy()
  return t!
}

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianAnalyticsView from './YitianAnalyticsView.vue'
import AppPager from '@/components/AppPager.vue'
import AppCard from '@/components/AppCard.vue'
import SectionTitle from '@/components/SectionTitle.vue'

// 两天工作日 → 基础 16h。张三 28h(项目类 20 + 管理类 8,加班) 李四 8h(欠填) 王五 零记录(完全未填)
// dims.types 必须含一个非客户类(管理类),否则五列拆分的 nonCustomer 恒为 0,断言证明不了拆分真生效
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
  dims: { types: ['项目类', '管理类'], workTypes: [], customers: [], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 20, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
    { d: '2026-06-01', e: 'A1', t: 1, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
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
        { path: '/yitian/detail', component: { template: '<div/>' } },
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

  it('8 处卡片容器全部接入 AppCard(default)', async () => {
    const w = mountView()
    await flushPromises()
    const cards = w.findAllComponents(AppCard)
    // 只数本页自己的卡(以 h3.yt-h 为标记):子组件内部也可能用 AppCard,按总数断言会被它们带偏
    const main = cards.filter((c) => c.find('h3.yt-h').exists())
    expect(main).toHaveLength(8)
    expect(main.every((c) => c.props('variant') === 'default')).toBe(true)
  })

  it('8 处卡内小标题接入 SectionTitle(section 级),.yt-h 只剩布局属性', async () => {
    const w = mountView()
    await flushPromises()
    const titles = w.findAllComponents(SectionTitle)
    expect(titles).toHaveLength(8)
    // 卡内小节标题一律 section 级(--fs-3/700);写成 card 级会与卡片主标题混为一档
    expect(titles.every((t) => t.classes().includes('st--section'))).toBe(true)
    // 字号/字重/色已收归 SectionTitle;.yt-h 留着只因它还带 margin 这类布局属性
    const rule = readFileSync(resolve(__dirname, 'YitianAnalyticsView.vue'), 'utf-8')
      .match(/^\.yt-h\s*\{([^}]*)\}/m)![1]
    for (const k of ['font-size', 'font-weight', 'color']) {
      expect(rule.includes(k), `.yt-h 仍自带 ${k},未收归 SectionTitle`).toBe(false)
    }
    expect(rule).toContain('margin-bottom')
  })

  it('员工明细表 8 个可筛选列全带列头筛选图标', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.findAll('.cf-icon').length).toBe(8)
  })

  it('员工明细表列定义含五类工时拆分列(在差值之后、明细之前)', async () => {
    const w = mountView()
    await flushPromises()
    const cols = (empTable(w).props('columns') as { key: string }[]).map((c) => c.key)
    for (const k of SPLIT_KEYS) expect(cols, k).toContain(k)
    expect(cols.indexOf('nonCustomer')).toBeGreaterThan(cols.indexOf('diffText'))
    expect(cols.indexOf('postsale')).toBeLessThan(cols.indexOf('detailAction'))
  })

  it('员工明细行带上五类工时拆分且值不为 undefined', async () => {
    const w = mountView()
    await flushPromises()
    const rows = empTable(w).props('rows') as Record<string, unknown>[]
    expect(rows.length).toBeGreaterThan(0)
    // 逐行都要有值:王五零记录,靠 decorate 的 `?? zero` 兜底;漏了兜底这条就红。
    // 写 `k in row` 会恒真(赋 undefined 也算自有属性),故断言 not.toBeUndefined()
    for (const r of rows) {
      for (const k of SPLIT_KEYS) expect(r[k], `${String(r.name)}.${k}`).not.toBeUndefined()
    }
    // 值确实拆开了(不是一片 0):张三 项目类 20h + 管理类 8h
    expect(rows.find((r) => r.name === '张三'))
      .toMatchObject({ nonCustomer: 8, customer: 20, project: 20, presale: 0, postsale: 0 })
    expect(rows.find((r) => r.name === '王五'))
      .toMatchObject({ nonCustomer: 0, customer: 0, project: 0, presale: 0, postsale: 0 })
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

  it('分页改用 AppPager,且 v-model:size 仍绑持久化的那个 pageSize', async () => {
    // 本页 pageSize 由 usePersistedRefs 托管。若替换时把 size 绑到新建的局部 ref,
    // 分页看着照常工作、V4.4.8 的往返测试也照绿(它只断言 ref 的值,不关心谁在改它),
    // 持久化却已静默失效 —— 故这里从 AppPager 发 update:size,一路验到 localStorage。
    getSpy.mockResolvedValue(bigData())
    const w = mountView()
    await flushPromises()
    expect(w.find('.ap').exists()).toBe(true)
    expect(w.find('.ap-total').text()).toMatch(/共\s*60\s*条/)
    w.findComponent(AppPager).vm.$emit('update:size', 20)
    await nextTick()
    expect((w.vm as any).pageSize).toBe(20)
    expect((w.vm as any).paged.length).toBe(20)
    const saved = JSON.parse(localStorage.getItem(userScopedKey('view_yitian_analytics')) ?? '{}')
    expect(saved.pageSize).toBe(20)
    w.unmount()
  })

  it('分页 AppPager 的 v-model:page 绑 currentPage(切页生效)', async () => {
    getSpy.mockResolvedValue(bigData())
    const w = mountView()
    await flushPromises()
    w.findComponent(AppPager).vm.$emit('update:page', 2)
    await nextTick()
    expect((w.vm as any).currentPage).toBe(2)
    expect((w.vm as any).paged.length).toBe(10)
    w.unmount()
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

  it('渲染页头标题「统计分析」,与 tab label 逐字一致', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.ph-title').text()).toBe(navLabel('/yitian/analytics'))
  })

  it('pageSize 持久化:改每页条数 → 卸载 → 重新挂载后仍是该值', async () => {
    const w1 = mountView()
    await flushPromises()
    ;(w1.vm as any).pageSize = 20
    await nextTick()                 // 等 usePersistedRefs 的 watch 落盘
    w1.unmount()

    const w2 = mountView()
    await flushPromises()
    expect((w2.vm as any).pageSize).toBe(20)
    w2.unmount()
  })

  it('currentPage 不进存档(回来不该还停在上次翻到的那一页)', async () => {
    const w = mountView()
    await flushPromises()
    ;(w.vm as any).currentPage = 2
    ;(w.vm as any).pageSize = 20
    await nextTick()
    const keys = Object.keys(JSON.parse(localStorage.getItem(userScopedKey('view_yitian_analytics')) ?? '{}'))
    // 先证明存档确实写了 —— 否则(接线漏了/存档为空)下一条断言恒真,是假绿
    expect(keys).toContain('pageSize')
    expect(keys).not.toContain('currentPage')
    w.unmount()
  })

  it('员工表「明细」入口跳 /yitian/detail 带 dEmp(工号)', async () => {
    const w = mountView()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    ;(w.vm as any).goDetailEmp({ id: 'A1' })
    expect(push).toHaveBeenCalledWith({ path: '/yitian/detail', query: { dEmp: 'A1' } })
  })
})
