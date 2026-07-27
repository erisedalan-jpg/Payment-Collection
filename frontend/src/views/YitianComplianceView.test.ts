import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import type { YitianData } from '@/types/yitian'
import { ALL_PAGE_LINKS } from '@/nav'
import { userScopedKey } from '@/lib/userScopedKey'

/** 页头标题取自 nav.ts 而非字面量:侧栏/tab 改了名而页头没跟,这条断言就红
 *  (防「tab 叫合规检查、页头叫工时合规检查」这种同页两个说法)。 */
const navLabel = (to: string) => ALL_PAGE_LINKS.find((l) => l.to === to)!.label

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianComplianceView from './YitianComplianceView.vue'
import AppCard from '@/components/AppCard.vue'
import { useYitianSettingsStore } from '@/stores/yitianSettings'
import { useYitianViewStore } from '@/stores/yitianView'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { STATUS_LIGHT } from '@/charts/echartsTheme'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 2,
          employees: 2, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' },
    { id: 'A2', name: '李四', l2: '', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: ['某客户'], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO1', top: false, ok: 2, iss: ['MISS_SUMMARY'] },
    { d: '2026-06-02', e: 'A2', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 1, iss: ['HINT_PRESALE_PRODUCT'] },
  ],
  issues: [
    { i: 0, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '张三的正文' },
    { i: 1, codes: ['HINT_PRESALE_PRODUCT'], msgs: ['售前服务类产品类别不应为「其他」'], snippet: '李四的正文' },
  ],
} as unknown as YitianData

let router: Router

function mountView() {
  return mount(YitianComplianceView, { global: { plugins: [ElementPlus, router] } })
}

describe('YitianComplianceView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/yitian/compliance', component: YitianComplianceView },
        { path: '/yitian/detail', component: { template: '<div/>' } },
      ],
    })
  })

  it('渲染问题明细(含提示行)', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('缺少工作概述')
    expect(w.text()).toContain('李四')
  })

  it('按问题类型筛选(列头 ColumnFilter,经 crossFilter store)', async () => {
    const w = mountView()
    await flushPromises()
    const cf = useCrossFilterStore()
    cf.setColumnFilter('yitian-compliance', 'issueTypes', ['缺少工作概述'], 2)
    await flushPromises()
    const rows = (w.vm as any).filtered as { empName: string }[]
    expect(rows.map((r) => r.empName)).toEqual(['张三'])
  })

  it('问题码分布计数', async () => {
    const w = mountView()
    await flushPromises()
    const dist = (w.vm as any).codeDist as { code: string; count: number }[]
    expect(dist.find((d) => d.code === 'MISS_SUMMARY')!.count).toBe(1)
  })

  it('遵循 excludedTypes 口径(I-7):剔除的类型不出现在问题明细,与总览/趋势页同源', async () => {
    const w = mountView()
    await flushPromises()
    // DATA 里两条问题行的工时类型都是 dims.types[0] = '项目类';把它剔出合规范围后,
    // 问题明细应同步清空(不能像之前那样对超管的配置无感)。
    useYitianSettingsStore().settings.excludedTypes = ['项目类']
    await flushPromises()
    const rows = (w.vm as any).filtered as unknown[]
    expect(rows).toHaveLength(0)
  })

  it('提示码(HINT_ 前缀)分布柱用 warn 状态色,问题码用 danger(M-5)', async () => {
    // 重设计后 pill 列表换成横向柱图(codeBarChartOption),语义色改挂在柱的 itemStyle 上,
    // 而不是 DOM class——按 yAxis 标签定位对应柱,断言其 itemStyle.color。
    const w = mountView()
    await flushPromises()
    const opt = (w.vm as any).codeBarChartOption as {
      yAxis: { data: string[] }
      series: { data: { itemStyle: { color: string } }[] }[]
    }
    const labels = opt.yAxis.data
    const bars = opt.series[0].data
    const hintIdx = labels.indexOf('售前服务类产品类别不应为「其他」')
    const issueIdx = labels.indexOf('缺少工作概述')
    expect(hintIdx).toBeGreaterThanOrEqual(0)
    expect(issueIdx).toBeGreaterThanOrEqual(0)
    expect(bars[hintIdx].itemStyle.color).toBe(STATUS_LIGHT.warn)
    expect(bars[issueIdx].itemStyle.color).toBe(STATUS_LIGHT.danger)
  })

  it('页面有内边距(不贴边)', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.yt-page').exists()).toBe(true)
  })

  it('卡片容器接入 AppCard:4 张主卡 default,合规率环卡 flat', async () => {
    const w = mountView()
    await flushPromises()
    const cards = w.findAllComponents(AppCard)
    // 只数本页自己的卡(以 h3.yt-h 为标记):MetricGrid 等子组件内部也用 AppCard,按总数断言会被它们带偏
    const main = cards.filter((c) => c.find('h3.yt-h').exists())
    expect(main).toHaveLength(4)
    expect(main.every((c) => c.props('variant') === 'default')).toBe(true)
    const ring = cards.find((c) => c.classes().includes('yt-ring-card'))
    expect(ring, '环卡未接 AppCard').toBeTruthy()
    // 主卡 default(带阴影)与环卡 flat(无阴影)必须是不同变体,同写成 default 则两者层次差别消失
    expect(ring!.props('variant')).toBe('flat')
  })

  it('分页:每页 50 条,超出部分不进 paged', async () => {
    // 造 60 条问题行(复用 DATA.days 原有两天,只加量 entries+issues),验证 paged 截到 pageSize、filtered 保留全量。
    // 注意:dataRange() 只取 days[0]/days[last] 不排序,故不能改 days 顺序/新增乱序日期,否则 ensureRange 会把
    // view 区间收窄到错误跨度、entries 被日期过滤掉一部分——一次踩坑教训,保留 DATA.days 原样最安全。
    const entries = Array.from({ length: 60 }, (_, i) => ({
      d: i % 2 === 0 ? '2026-06-01' : '2026-06-02', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: `WO${i}`, top: false, ok: 2, iss: ['MISS_SUMMARY'],
    }))
    const issues = entries.map((_, i) => ({ i, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: 's' }))
    getSpy.mockResolvedValue({ ...DATA, entries, issues } as unknown as YitianData)
    const w = mountView()
    await flushPromises()
    const filtered = (w.vm as any).filtered as unknown[]
    const paged = (w.vm as any).paged as unknown[]
    expect(filtered.length).toBe(60)
    expect(paged.length).toBe(50)
  })

  it('落地读 drill query:设日期区间后清空 query(不残留 dStart/dEnd)', async () => {
    await router.push('/yitian/compliance?dStart=2026-06-01&dEnd=2026-06-02')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    const view = useYitianViewStore()
    expect(view.start).toBe('2026-06-01')
    expect(view.end).toBe('2026-06-02')
    expect(router.currentRoute.value.query).toEqual({})
    w.unmount()
  })

  it('落地清 query 只删下钻键,保留其它非下钻参数(M-2)', async () => {
    await router.push('/yitian/compliance?dStart=2026-06-01&dEnd=2026-06-02&keep=1')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ keep: '1' })
    w.unmount()
  })

  it('渲染页头标题「合规检查」,与 tab label 逐字一致', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.ph-title').text()).toBe(navLabel('/yitian/compliance'))
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
    const keys = Object.keys(JSON.parse(localStorage.getItem(userScopedKey('view_yitian_compliance')) ?? '{}'))
    // 先证明存档确实写了 —— 否则(接线漏了/存档为空)下一条断言恒真,是假绿
    expect(keys).toContain('pageSize')
    expect(keys).not.toContain('currentPage')
    w.unmount()
  })

  it('问题表「明细」入口跳 /yitian/detail 带 dEmp+dOnly', async () => {
    await router.push('/')
    await router.isReady()
    const w = mountView()
    await flushPromises()
    const push = vi.spyOn(router, 'push')
    ;(w.vm as any).goDetailIssue({ empId: 'A1' })
    expect(push).toHaveBeenCalledWith({ path: '/yitian/detail', query: { dEmp: 'A1', dOnly: '1' } })
  })
})
