import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TierStrip from './TierStrip.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('TierStrip', () => {
  it('按档位渲染段与图例', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [
        { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' },
        { projectId: 'P2', tier: '50万以下', isPaymentRelated: true, nodeStatus: '已全额回款', projectAmount: 300000, expectedPayment: 300000, actualPayment: 300000, planMonth: '2026-03' },
      ],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(TierStrip)
    expect(w.findAll('.ts-seg').length).toBe(3)
    expect(w.text()).toContain('100万以上')
    expect(w.find('.ts-empty').exists()).toBe(false)
  })

  it('无项目时显示空态', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(TierStrip)
    expect(w.find('.ts-empty').exists()).toBe(true)
  })
})
