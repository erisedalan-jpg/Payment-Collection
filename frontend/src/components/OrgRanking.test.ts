import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import OrgRanking from './OrgRanking.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', orgL4: '北京服务组', isPaymentRelated: true, expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-02' },
      { projectId: 'P2', tier: '50-100万', orgL4: '上海一服务组', isPaymentRelated: true, expectedPayment: 800000, actualPayment: 200000, planMonth: '2026-05' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('OrgRanking', () => {
  it('renders ranked orgs with amount and rate', () => {
    seed()
    const wrapper = mount(OrgRanking)
    const text = wrapper.text()
    expect(text).toContain('北京服务组')
    expect(text).toContain('上海一服务组')
    expect(text).toContain('60%')
  })

  it('tier filter restricts orgs', async () => {
    seed()
    const wrapper = mount(OrgRanking)
    await wrapper.get('[data-test="rank-tier"]').setValue('50-100万')
    const text = wrapper.text()
    expect(text).toContain('上海一服务组')
    expect(text).not.toContain('北京服务组')
  })
})
