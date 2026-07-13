import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

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

describe('YitianAnalyticsView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('员工明细覆盖花名册全员', async () => {
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).empRows as { name: string }[]
    expect(rows.map((r) => r.name).sort()).toEqual(['张三', '李四', '王五'].sort())
  })

  it('未按时填写清单只含有记录且欠填的人', async () => {
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).unfilledRows as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['李四'])
  })

  it('完全未填清单含零记录的人(原工具盲区)', async () => {
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).neverRows as { name: string }[]
    expect(rows.map((r) => r.name)).toEqual(['王五'])
    expect(w.text()).toContain('完全未填')
  })

  it('饱和度榜降序', async () => {
    const w = mount(YitianAnalyticsView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const rows = (w.vm as any).topRows as { name: string }[]
    expect(rows[0].name).toBe('张三')
  })
})
