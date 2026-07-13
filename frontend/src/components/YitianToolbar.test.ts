import { describe, it, expect, beforeEach, afterEach } from 'vitest'
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

  it('控件为 small 尺寸且排在同一行(不换行容器)', () => {
    const w = mountBar(DATA)
    expect(w.find('.yt-row').exists()).toBe(true)
    // 三个控件都在同一个 .yt-row 里
    const row = w.find('.yt-row')
    expect(row.findComponent({ name: 'ElDatePicker' }).exists()).toBe(true)
    expect(row.findComponent({ name: 'ElRadioGroup' }).exists()).toBe(true)
    expect(row.findComponent({ name: 'ElSelect' }).exists()).toBe(true)
  })

  it('数据跨度外的日期被禁用', () => {
    const w = mountBar(DATA)
    const fn = (w.vm as any).disabledDate as (d: Date) => boolean
    // 本地构造 Date(月份从 0 起),不用 new Date('2026-05-31') 那种按 UTC 解析的字符串写法——
    // 后者在 UTC+8 会把 bug 盖住(I-2 回归)。
    expect(fn(new Date(2026, 4, 31))).toBe(true)
    expect(fn(new Date(2026, 5, 3))).toBe(false)
  })

  it('数据跨度的第一天不被禁选(I-2:toISOString 时区 off-by-one 回归)', () => {
    const w = mountBar(DATA)
    const fn = (w.vm as any).disabledDate as (d: Date) => boolean
    // periodStart = '2026-06-01';本地零点构造,不能用 UTC 字符串解析(会掩盖 bug)
    expect(fn(new Date(2026, 5, 1))).toBe(false)
    expect(fn(new Date(2026, 5, 5))).toBe(false)   // periodEnd 同理不被禁选
  })
})

describe('YitianToolbar · 时区无关回归(模拟 UTC+8 环境)', () => {
  // 本沙盒宿主机系统时区是 America/Los_Angeles(UTC 之后),该时区下 toISOString() 天然不回退一天,
  // 无法用真实系统时区复现 I-2(需要 UTC+8 这类"领先 UTC"的时区)。
  // 这里临时打桩 Date.prototype.toISOString:把"本地零点构造出的挂钟分量"当作中国时区(UTC+8)
  // 重新折算出 UTC 时刻,精确复刻生产环境(UTC+8)下 toISOString() 的行为,与宿主机实际时区无关。
  let originalToISOString: typeof Date.prototype.toISOString

  beforeEach(() => {
    localStorage.clear()
    originalToISOString = Date.prototype.toISOString
    Date.prototype.toISOString = function (this: Date) {
      const utcMs = Date.UTC(
        this.getFullYear(), this.getMonth(), this.getDate(),
        this.getHours(), this.getMinutes(), this.getSeconds(), this.getMilliseconds(),
      ) - 8 * 3600 * 1000   // 挂钟分量视为 UTC+8 本地零点 → 折算 UTC
      return originalToISOString.call(new Date(utcMs))   // 用原始实现,避免递归打桩
    }
  })

  afterEach(() => {
    Date.prototype.toISOString = originalToISOString
  })

  it('数据跨度第一天在 UTC+8 下不被禁选', () => {
    const w = mountBar(DATA)
    const fn = (w.vm as any).disabledDate as (d: Date) => boolean
    // periodStart = '2026-06-01';本地零点构造的 Date 在(模拟的)UTC+8 下,
    // 旧实现 toISOString().slice(0,10) 会退回 '2026-05-31',把这一天误判为「早于跨度」而禁用。
    expect(fn(new Date(2026, 5, 1))).toBe(false)
  })
})
