import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import HomeView from './HomeView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => setActivePinia(createPinia()))

describe('HomeView', () => {
  it('renders meta lastUpdate and rawNodes count from store', async () => {
    const store = useDataStore()
    store.data = {
      meta: { lastUpdate: '2026-06-03 10:00', totalProjects: 2, totalPaymentNodes: 3 },
      dashboard: { totalProjectCount: 2, totalPaymentNodes: 3, totalPaidNodes: 1 },
      summary: {}, rawNodes: [{ projectId: 'P1' }, { projectId: 'P2' }],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const wrapper = mount(HomeView)
    expect(wrapper.text()).toContain('2026-06-03 10:00')
    expect(wrapper.text()).toContain('2')  // rawNodes 数
  })

  it('renders loading state', () => {
    const store = useDataStore()
    store.loading = true // load() 的并发守卫会让 onMounted 的 load() 直接返回，保持 loading
    const wrapper = mount(HomeView)
    expect(wrapper.text()).toContain('加载中…')
  })

  it('renders error state after a failed load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => null }))
    const wrapper = mount(HomeView) // onMounted 触发 load()，fetch 失败
    await flushPromises()
    expect(wrapper.text()).toContain('数据加载失败')
    vi.unstubAllGlobals()
  })
})
