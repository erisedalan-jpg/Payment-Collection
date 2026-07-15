import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))
vi.mock('@/charts/ChartBox.vue', () => ({
  default: { name: 'ChartBox', props: ['option', 'height'], template: '<div class="chart-stub" />' },
}))

import YitianCustomerView from './YitianCustomerView.vue'
import DataTable from '@/components/DataTable.vue'

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/yitian/customer', component: YitianCustomerView },
      { path: '/yitian/analytics', component: { template: '<div/>' } },
    ],
  })
}

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-01', generatedAt: '', rows: 2,
          employees: 1, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8,
          thisBgL2: ['银行集团军'] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' },
    // 部门负责人,花名册 L4 为空 → 归入「未分配L4」,无客户支持归属,页面应剔除
    { id: 'A9', name: '赵六', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '', category: '' },
  ],
  days: [{ d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' }],
  dims: { types: ['项目类'], workTypes: [], customers: ['大客户', '小客户'], products: [],
          productNames: [], projectTypes: [], salesL2: ['银行集团军', '政企大区'], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 6, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: 0, wo: '', top: true, ok: 0, iss: [] },
    { d: '2026-06-01', e: 'A1', t: 0, h: 2, wt: null, cu: 1, pl: null, pn: null, pt: null, sm: null, bg: 1, wo: '', top: false, ok: 0, iss: [] },
  ],
  issues: [],
} as unknown as YitianData

describe('YitianCustomerView', () => {
  let router: Router

  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
    router = makeRouter()
    await router.push('/yitian/customer')
    await router.isReady()
  })

  function mountView() {
    return mount(YitianCustomerView, { global: { plugins: [ElementPlus, router] } })
  }

  it('TOP1000 按 L4 汇总', async () => {
    const w = mountView()
    await flushPromises()
    const rows = (w.vm as any).topRows as { l4: string; pctText: string }[]
    expect(rows[0].l4).toBe('银行服务组')
    expect(rows[0].pctText).toBe('75.0%')
  })

  it('跨 BG 占比', async () => {
    const w = mountView()
    await flushPromises()
    const bg = (w.vm as any).bg as { thisBg: number; crossBg: number }
    expect(bg.thisBg).toBe(6)
    expect(bg.crossBg).toBe(2)
    expect(w.text()).toContain('跨 BG')
  })

  it('页面有内边距(不贴边)', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.yt-page').exists()).toBe(true)
  })

  it('TOP1000 标题去括号,口径说明降为表上小字,不含"未分配L4"行,含固定汇总行', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('TOP1000 大客户支持')
    expect(w.text()).not.toContain('TOP1000 大客户支持（')
    expect(w.text()).not.toContain('未分配L4')
    const rows = (w.vm as any).topRows as { l4: string }[]
    expect(rows.every((r) => r.l4 !== '未分配L4')).toBe(true)
    expect(w.text()).toContain('合计')
  })

  it('跨 BG 标题去括号,口径说明降为小字', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.text()).toContain('跨 BG 支持')
    expect(w.text()).not.toContain('跨 BG 支持（')
  })

})

// 跨页下钻:TOP1000 堆叠柱 / 跨 BG 分组柱 / TOP1000 表行 → /yitian/analytics?dL4=<l4>。
// TOP 客户排行柱(无 v-if 情形下饼图同理)不接下钻,点击不导航。
// 渲染顺序(与模板一致): 0=TOP1000 堆叠柱 1=跨BG 饼 2=跨BG×L4 分组柱 3=TOP客户排行柱。
describe('YitianCustomerView · 下钻(跨页)', () => {
  let router: Router

  beforeEach(async () => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
    router = makeRouter()
    await router.push('/yitian/customer')
    await router.isReady()
  })

  async function mountAndCharts() {
    const w = mount(YitianCustomerView, { global: { plugins: [ElementPlus, router] } })
    await flushPromises()
    return { w, charts: w.findAllComponents({ name: 'ChartBox' }) }
  }

  it('TOP1000 堆叠柱按 L4 下钻', async () => {
    const { charts } = await mountAndCharts()
    expect(charts).toHaveLength(4)
    await charts[0].vm.$emit('datapoint-click', { name: '银行服务组' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toEqual({ dL4: '银行服务组' })
  })

  it('跨 BG × L4 分组柱按 L4 下钻', async () => {
    const { charts } = await mountAndCharts()
    await charts[2].vm.$emit('datapoint-click', { name: '银行服务组' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toEqual({ dL4: '银行服务组' })
  })

  it('跨 BG 饼图、TOP 客户排行柱不挂下钻——点击不导航(无 L4 目标)', async () => {
    const { charts } = await mountAndCharts()
    await charts[1].vm.$emit('datapoint-click', { name: '本 BG' })
    await charts[3].vm.$emit('datapoint-click', { name: '大客户' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/customer')
  })

  it('点击 name 为空(如轴标签之外的杂项)时不导航', async () => {
    const { charts } = await mountAndCharts()
    await charts[0].vm.$emit('datapoint-click', {})
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/customer')
  })

  it('TOP1000 表行点击按 L4 下钻', async () => {
    const { w } = await mountAndCharts()
    await w.findComponent(DataTable).vm.$emit('row-click', { l4: '银行服务组' })
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/analytics')
    expect(router.currentRoute.value.query).toEqual({ dL4: '银行服务组' })
  })

  it('TOP1000 表设为 clickable(行有 hover 手型样式类)', async () => {
    const { w } = await mountAndCharts()
    expect(w.findComponent(DataTable).props('clickable')).toBe(true)
  })

  it('合计行(row.l4 为"合计"文本,非真实 L4)点击不应误导航——由 row-click 只在真实数据行触发保证', async () => {
    const { w } = await mountAndCharts()
    // el-table 原生 show-summary 汇总行不参与 row-click(el-table 行为),这里直接验证
    // 点击一条不含 l4 字段的行(等价于汇总行 slot 场景)不会导航。
    await w.findComponent(DataTable).vm.$emit('row-click', {})
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/yitian/customer')
  })
})
