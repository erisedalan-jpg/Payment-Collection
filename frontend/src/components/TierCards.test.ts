import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TierCards from './TierCards.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '已全额回款', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 1000000, planMonth: '2026-02' },
      { projectId: 'P2', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', projectAmount: 1500000, expectedPayment: 500000, actualPayment: 0, planMonth: '2026-03' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('TierCards', () => {
  it('renders a card per tier with project count and status rows', () => {
    seed()
    const wrapper = mount(TierCards)
    const text = wrapper.text()
    expect(text).toContain('100万以上')
    expect(text).toContain('50-100万')
    expect(text).toContain('50万以下')
    expect(text).toContain('已全额回款')
    expect(text).toContain('延期')
  })
})
