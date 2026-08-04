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

  // ── 降级原因必须分开说(线上报障:用户上传了 holidays.csv 却被告知「未提供」) ──
  // calendarSource 看的是**解析结果**,文件在但表头被 Excel 写成 `日期\t` 时同样是
  // fallback。原文案一律说「未提供」,于是用户反复重传一个已经在位的文件。
  // 注:上面那条老用例的 toContain('holidays.csv') 两种文案都满足,钉不住文案方向,
  // 故另立这两条 —— 各自断言「该出现的词」与「绝不能出现的词」。
  it('fallback 且文件不存在 → 文案说「未提供」', () => {
    const w = mountBar({
      ...DATA,
      meta: {
        ...DATA.meta, calendarSource: 'fallback',
        dataReadiness: { holidays: { provided: false, rows: 0 } },
      },
    } as unknown as YitianData)
    expect(w.text()).toContain('未提供')
    expect(w.text()).not.toContain('没读懂')
  })

  it('fallback 但文件已存在(格式没读懂) → 文案绝不能说「未提供」', () => {
    const w = mountBar({
      ...DATA,
      meta: {
        ...DATA.meta, calendarSource: 'fallback',
        dataReadiness: { holidays: { provided: true, rows: 0 } },
      },
    } as unknown as YitianData)
    expect(w.text()).not.toContain('未提供')       // ← 说反了就是把人往错误方向引
    expect(w.text()).toContain('没读懂')
    expect(w.text()).toContain('日期,类型')        // 给出可操作的排查方向
  })

  it('meta 无 dataReadiness(旧数据/升级后未重跑) → 退化为「未提供」文案,不报错', () => {
    // 升级后、点「更新数据」之前,yitian_data.json 还是旧的、没有 holidays 字段。
    // 此时必须退化成旧行为而不是崩掉或显示空白告警条。
    const w = mountBar({ ...DATA, meta: { ...DATA.meta, calendarSource: 'fallback' } } as YitianData)
    expect(w.find('.yt-warn').exists()).toBe(true)
    expect(w.text()).toContain('未提供')
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

  it('四个新筛选控件都渲染出来(V4.5.5)', () => {
    const w = mountBar(DATA)
    for (const t of ['yt-prodcat', 'yt-type', 'yt-mgr', 'yt-display']) {
      expect(w.find(`[data-test="${t}"]`).exists(), t).toBe(true)
    }
  })

  it('产品大类/工时类型选项取自 dims 码表而非写死(V4.5.5)', () => {
    const w = mountBar({
      ...DATA,
      dims: { ...DATA.dims, prodCats: ['甲类', '乙类'], types: ['项目类', '售前类'] },
    } as unknown as YitianData)
    // 写死清单会在数据换档(产品分类.xlsx 增删大类)时静默错位,故断言必须打到实际渲染出的选项上
    const cats = w.findComponent('[data-test="yt-prodcat"]')
      .findAllComponents({ name: 'ElOption' }).map((o) => o.props('value'))
    expect(cats).toEqual(['甲类', '乙类'])
    const types = w.findComponent('[data-test="yt-type"]')
      .findAllComponents({ name: 'ElOption' }).map((o) => o.props('value'))
    expect(types).toEqual(['项目类', '售前类'])
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
