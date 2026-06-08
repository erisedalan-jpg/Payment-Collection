import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TierStrip from './TierStrip.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('TierStrip', () => {
  it('每档渲染一条进度行并显示完成率', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [
        { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-02' },
      ],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(TierStrip, { global: { stubs: { BoardDrilldownModal: true } } })
    expect(w.findAll('.ts-row').length).toBe(3)
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('60%')
  })

  it('点击档位行打开下钻', async () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [
        { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-02' },
      ],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(TierStrip, { global: { stubs: { BoardDrilldownModal: true } } })
    await w.findAll('.ts-row')[0].trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })
})
