import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashboardView from './DashboardView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

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
})
