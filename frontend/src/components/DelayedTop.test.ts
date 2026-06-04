import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DelayedTop from './DelayedTop.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('DelayedTop', () => {
  it('lists delayed projects with max delay days', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [
        { projectId: 'P1', projectName: '延期甲', tier: '100万以上', orgL4: '北京', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, delayDays: 45, planMonth: '2025-01' },
      ],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const wrapper = mount(DelayedTop)
    const text = wrapper.text()
    expect(text).toContain('P1')
    expect(text).toContain('延期甲')
    expect(text).toContain('45')
  })

  it('shows empty hint when no delayed projects', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [{ projectId: 'P9', tier: '100万以上', isPaymentRelated: true, nodeStatus: '已全额回款', expectedPayment: 1, actualPayment: 1, delayDays: 0, planMonth: '2026-02' }],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const wrapper = mount(DelayedTop)
    expect(wrapper.text()).toContain('暂无延期项目')
  })
})
