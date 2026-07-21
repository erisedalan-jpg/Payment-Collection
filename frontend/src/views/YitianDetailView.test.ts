import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import type { YitianData } from '@/types/yitian'

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }))
vi.mock('@/lib/yitianApi', () => ({ getYitianData: getSpy }))

import YitianDetailView from './YitianDetailView.vue'
import { useCrossFilterStore } from '@/stores/crossFilter'

const DATA = {
  meta: { periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 3,
          employees: 2, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: [] },
  roster: [
    { id: 'A1', name: '张三', l2: 'BG1', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '交付' },
    { id: 'A2', name: '李四', l2: 'BG1', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '交付' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: { types: ['项目类'], workTypes: [], customers: ['某客户'], products: [], productNames: [],
          projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 8, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO1', top: true, ok: 2, iss: ['MISS_SUMMARY'] },
    { d: '2026-06-02', e: 'A2', t: 0, h: 6, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: 'WO2', top: false, ok: 1, iss: ['HINT_PRESALE_PRODUCT'] },
    { d: '2026-06-02', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
  ],
  issues: [
    { i: 0, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '正文' },
    { i: 1, codes: ['HINT_PRESALE_PRODUCT'], msgs: [], snippet: '' },
  ],
} as unknown as YitianData

let router: Router
function mountView() {
  return mount(YitianDetailView, { global: { plugins: [ElementPlus, router] } })
}

describe('YitianDetailView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    getSpy.mockReset()
    getSpy.mockResolvedValue(DATA)
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        { path: '/yitian/detail', component: YitianDetailView },
      ],
    })
  })

  it('渲染逐条明细(全量 3 条)', async () => {
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).filtered).toHaveLength(3)
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('缺少工作概述')
  })

  it('汇总:总条数/三态计数随「仅看异常」变化', async () => {
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).summary).toMatchObject({ count: 3, ok: 1, warn: 1, issue: 1 })
    ;(w.vm as any).onlyIssues = true
    await flushPromises()
    expect((w.vm as any).filtered).toHaveLength(2)
  })

  it('表头 ColumnFilter 经 crossFilter 生效(按 okText 筛)', async () => {
    const w = mountView()
    await flushPromises()
    useCrossFilterStore().setColumnFilter('yitian-detail', 'okText', ['问题'], 3)
    await flushPromises()
    expect((w.vm as any).filtered.map((r: any) => r.empName)).toEqual(['张三'])
  })

  it('分页:每页 50,filtered 保留全量', async () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({
      d: i % 2 === 0 ? '2026-06-01' : '2026-06-02', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: `W${i}`, top: false, ok: 0, iss: [],
    }))
    getSpy.mockResolvedValue({ ...DATA, entries, issues: [] } as unknown as YitianData)
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).filtered.length).toBe(60)
    expect((w.vm as any).paged.length).toBe(50)
  })

  it('页面有内边距容器', async () => {
    const w = mountView()
    await flushPromises()
    expect(w.find('.yd-view').exists()).toBe(true)
  })
})
