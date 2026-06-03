import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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
})
