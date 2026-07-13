import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))
// ChartBox 内部依赖 canvas,单测里替身掉,只断言 option
vi.mock('@/charts/ChartBox.vue', () => ({
  default: { name: 'ChartBox', props: ['option', 'height'], template: '<div class="chart-stub" />' },
}))

import YitianTrendView from './YitianTrendView.vue'
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
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 0, iss: [] },
    { d: '2026-06-05', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, chk: true, ok: 2, iss: ['MISS_NEXT'] },
  ],
  issues: [{ i: 1, codes: ['MISS_NEXT'], msgs: ['缺少下一步工作计划'], snippet: '正文' }],
} as unknown as YitianData

describe('YitianTrendView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('渲染 7 张图', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.findAll('.chart-stub')).toHaveLength(7)
  })

  it('calc 口径下按计算周分桶(6/5 单独一桶)', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const s = (w.vm as any).series as { weeks: string[]; issues: number[]; hours: number[] }
    expect(s.weeks).toEqual(['2026-CW23', '2026-CW24'])
    expect(s.issues).toEqual([0, 1])
    expect(s.hours).toEqual([8, 8])
  })

  it('切成 iso 口径后并成一桶', async () => {
    const w = mount(YitianTrendView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    useYitianViewStore().weekMode = 'iso'
    await flushPromises()
    const s = (w.vm as any).series as { weeks: string[]; hours: number[] }
    expect(s.weeks).toEqual(['2026-W23'])
    expect(s.hours).toEqual([16])
  })
})
