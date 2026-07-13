import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))
vi.mock('@/charts/ChartBox.vue', () => ({
  default: { name: 'ChartBox', props: ['option', 'height'], template: '<div class="chart-stub" />' },
}))

import YitianCustomerView from './YitianCustomerView.vue'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-01', generatedAt: '', rows: 2,
          employees: 1, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8,
          thisBgL2: ['银行集团军'] },
  roster: [{ id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' }],
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
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('TOP1000 按 L4 汇总', async () => {
    const w = mount(YitianCustomerView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).topRows as { l4: string; pctText: string }[]
    expect(rows[0].l4).toBe('银行服务组')
    expect(rows[0].pctText).toBe('75.0%')
  })

  it('跨 BG 占比', async () => {
    const w = mount(YitianCustomerView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const bg = (w.vm as any).bg as { thisBg: number; crossBg: number }
    expect(bg.thisBg).toBe(6)
    expect(bg.crossBg).toBe(2)
    expect(w.text()).toContain('跨 BG')
  })
})
