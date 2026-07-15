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

  it('工时类型占比只出环图(V3.2.0 删除与之同数据的重复柱图)', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as any
    expect(vm.typeOption.series[0].type).toBe('pie')
    expect(vm.typeBarOption).toBeUndefined()
  })

  it('合规率环形:接住 kpi().complianceRate,问题条数同源', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as any
    expect(vm.complianceRatio).not.toBeNull()
    expect(w.text()).toContain('合规率')
    expect(w.text()).toContain(`问题 ${vm.complianceIssueCount} 条`)
  })

  it('L4 组织工时分组柱:实际/基础两个系列,与分层汇总表同源(orgRows)', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as any
    expect(w.text()).toContain('L4 组织工时')
    const opt = vm.orgBarChartOption
    expect(opt.series.map((s: any) => s.name)).toEqual(['实际工时', '基础工时'])
    expect(opt.yAxis.data).toEqual(vm.orgRows.map((r: any) => r.name))
  })
})

describe('YitianOverviewView 分层汇总:剔除未分配L4', () => {
  // A2 的 L4 为空(花名册里的部门负责人) → 表里不该出现「未分配L4」行,合计也只算可见行
  const WITH_EMPTY = {
    ...DATA,
    roster: [
      ...DATA.roster,
      { id: 'A2', name: '李四', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '', category: '正式员工' },
    ],
    entries: [
      ...DATA.entries,
      { d: '2026-06-01', e: 'A2', t: 0, h: 6, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
    ],
  } as unknown as YitianData

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(WITH_EMPTY)
  })

  it('表格不含「未分配L4」行', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).not.toContain('未分配L4')
    expect((w.vm as any).orgRows.map((r: any) => r.name)).toEqual(['银行服务组'])
  })

  it('合计只统计表中可见的行(与所见一致)', async () => {
    const w = mount(YitianOverviewView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    // 张三 18h(银行服务组) 可见;李四 6h(无 L4) 已剔除 → 合计 1 人 / 18h,不是 2 人 / 24h。
    // 注意:KPI 卡的「总工时」仍是 24h —— 剔除只作用于这张 L4 表,不改全局口径。
    const cols = [{ property: 'name' }, { property: 'people' }, { property: 'hoursText' }, { property: 'satText' }]
    const summary = (w.vm as any).orgSummaryMethod({ columns: cols })
    expect(summary).toEqual(['合计', '1', '18.0', '112.5%'])
  })
})
