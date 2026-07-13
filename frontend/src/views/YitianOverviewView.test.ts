import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianOverviewView from './YitianOverviewView.vue'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '2026-07-12 10:00',
          rows: 2, employees: 1, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [{ id: 'A1', name: '张三', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' }],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: [], products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
    { d: '2026-06-02', e: 'A1', t: 0, h: 10, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 2, iss: ['MISS_NEXT'] },
  ],
  issues: [{ i: 1, codes: ['MISS_NEXT'], msgs: ['缺少下一步工作计划'], snippet: '正文' }],
} as unknown as YitianData

describe('YitianOverviewView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('挂载即拉数据并渲染 KPI', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('总工时')
    expect(w.text()).toContain('18')          // 8 + 10
  })

  it('渲染分层汇总表:标题去括号,只含 L4 层,不含层级列,含固定汇总行', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
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
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('无倚天工时页面权限')
  })

  it('页面有内边距(不贴边)', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('.yt-page').exists()).toBe(true)
  })

  it('工时类型占比同时给出环图与柱状图', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as any
    expect(vm.typeOption.series[0].type).toBe('pie')
    expect(vm.typeBarOption.series[0].type).toBe('bar')
    // 柱状图的类目与数据必须与占比同源(同一批 typeRows)
    expect(vm.typeBarOption.xAxis.data).toEqual(vm.typeRows.map((t: any) => t.type))
  })
})
