import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TrendCard from './TrendCard.vue'
import PendingBarChart from './PendingBarChart.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('TrendCard', () => {
  it('默认渲染月度图（含 PendingBarChart 与切换）', () => {
    seed()
    const w = mount(TrendCard)
    expect(w.findComponent(PendingBarChart).exists()).toBe(true)
    expect(w.get('[data-test="seg-month"]').classes()).toContain('on')
  })

  it('切到季度后类别变为季度键', async () => {
    seed()
    const w = mount(TrendCard)
    await w.get('[data-test="seg-quarter"]').trigger('click')
    const cats = w.findComponent(PendingBarChart).props('categories') as string[]
    expect(cats.some((c) => c.includes('Q'))).toBe(true)
  })
})
