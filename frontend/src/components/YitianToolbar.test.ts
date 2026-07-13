import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import YitianToolbar from './YitianToolbar.vue'
import { useYitianStore } from '@/stores/yitian'
import { useYitianViewStore } from '@/stores/yitianView'
import type { YitianData } from '@/types/yitian'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-05', hoursPerDay: 8, calendarSource: 'csv', thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '', l31: '服务二部', l4: '银行服务组', category: '' },
    { id: 'A2', name: '李四', l2: '', l3: '', l31: '服务一部', l4: '浙江服务组', category: '' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-05', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW24' },
  ],
  dims: { types: [], workTypes: [], customers: [], products: [], productNames: [], projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [],
  issues: [],
} as unknown as YitianData

function mountBar(data: YitianData) {
  setActivePinia(createPinia())
  useYitianStore().data = data
  return mount(YitianToolbar, { global: { plugins: [ElementPlus] } })
}

describe('YitianToolbar', () => {
  beforeEach(() => localStorage.clear())

  it('挂载后把区间兜底为数据跨度', () => {
    mountBar(DATA)
    const v = useYitianViewStore()
    expect(v.start).toBe('2026-06-01')
    expect(v.end).toBe('2026-06-05')
  })

  it('L4 选项取自花名册(去重升序)', () => {
    const w = mountBar(DATA)
    expect((w.vm as any).l4Options).toEqual(['浙江服务组', '银行服务组'])
  })

  it('日历源为 csv 时不显示降级告警', () => {
    const w = mountBar(DATA)
    expect(w.find('.yt-warn').exists()).toBe(false)
  })

  it('日历源为 fallback 时显示降级告警', () => {
    const w = mountBar({ ...DATA, meta: { ...DATA.meta, calendarSource: 'fallback' } } as YitianData)
    expect(w.find('.yt-warn').exists()).toBe(true)
    expect(w.text()).toContain('holidays.csv')
  })

  it('数据跨度外的日期被禁用', () => {
    const w = mountBar(DATA)
    const fn = (w.vm as any).disabledDate as (d: Date) => boolean
    expect(fn(new Date('2026-05-31'))).toBe(true)
    expect(fn(new Date('2026-06-03'))).toBe(false)
  })
})
