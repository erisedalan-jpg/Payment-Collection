import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashboardView from './DashboardView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('DashboardView', () => {
  it('renders summary cards and tier cards sections', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [{ projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '已全额回款', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 1000000, planMonth: '2026-02' }],
      projectOverview: { projects: [{ projectId: 'P1' }], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const wrapper = mount(DashboardView)
    expect(wrapper.find('.dash-summary').exists()).toBe(true)
    expect(wrapper.find('.tier-cards').exists()).toBe(true)
  })

  it('renders loading state', () => {
    const ds = useDataStore()
    ds.loading = true // load() 的并发守卫使 onMounted 的 load() 直接返回，保持 loading
    const wrapper = mount(DashboardView)
    expect(wrapper.text()).toContain('加载中')
  })

  it('renders error state after a failed load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }))
    const wrapper = mount(DashboardView) // onMounted 触发 load()，fetch 失败 → error
    await flushPromises()
    expect(wrapper.text()).toContain('数据加载失败')
  })
})
