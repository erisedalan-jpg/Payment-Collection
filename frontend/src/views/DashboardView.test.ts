import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashboardView from './DashboardView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('DashboardView', () => {
  it('渲染指标与四张卡片', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [{ projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '已全额回款', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 1000000, planMonth: '2026-02' }],
      projectOverview: { projects: [{ projectId: 'P1' }], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(DashboardView)
    expect(w.find('.dash-metrics').exists()).toBe(true)
    expect(w.find('.tier-strip').exists()).toBe(true)
    expect(w.find('.org-ranking').exists()).toBe(true)
    expect(w.find('.trend-card').exists()).toBe(true)
    expect(w.find('.delay-top-card').exists()).toBe(true)
  })

  it('渲染加载态', () => {
    const ds = useDataStore()
    ds.loading = true
    const w = mount(DashboardView)
    expect(w.text()).toContain('加载中')
  })

  it('加载失败渲染错误态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }))
    const w = mount(DashboardView)
    await flushPromises()
    expect(w.text()).toContain('数据加载失败')
  })
})
