import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianComplianceView from './YitianComplianceView.vue'
import { useYitianSettingsStore } from '@/stores/yitianSettings'

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

describe('YitianComplianceView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
  })

  it('渲染问题明细(含提示行)', async () => {
    const w = mount(YitianComplianceView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('缺少工作概述')
    expect(w.text()).toContain('李四')
  })

  it('按问题码筛选', async () => {
    const w = mount(YitianComplianceView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    ;(w.vm as any).codeFilter = ['MISS_SUMMARY']
    await flushPromises()
    const rows = (w.vm as any).rows as { empName: string }[]
    expect(rows.map((r) => r.empName)).toEqual(['张三'])
  })

  it('问题码分布计数', async () => {
    const w = mount(YitianComplianceView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const dist = (w.vm as any).codeDist as { code: string; count: number }[]
    expect(dist.find((d) => d.code === 'MISS_SUMMARY')!.count).toBe(1)
  })

  it('遵循 excludedTypes 口径(I-7):剔除的类型不出现在问题明细,与总览/趋势页同源', async () => {
    const w = mount(YitianComplianceView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    // DATA 里两条问题行的工时类型都是 dims.types[0] = '项目类';把它剔出合规范围后,
    // 问题明细应同步清空(不能像之前那样对超管的配置无感)。
    useYitianSettingsStore().settings.excludedTypes = ['项目类']
    await flushPromises()
    const rows = (w.vm as any).rows as unknown[]
    expect(rows).toHaveLength(0)
  })

  it('提示码(HINT_ 前缀)分布 chip 用 warn 状态色,问题码用 danger(M-5)', async () => {
    const w = mount(YitianComplianceView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const items = w.findAll('.yt-dist li')
    const hintItem = items.find((li) => li.text().includes('售前服务类产品类别不应为「其他」'))!
    const issueItem = items.find((li) => li.text().includes('缺少工作概述'))!
    expect(hintItem.classes()).toContain('yt-dist--warn')
    expect(issueItem.classes()).not.toContain('yt-dist--warn')
  })
})
