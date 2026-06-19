import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TierStrip from './TierStrip.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('TierStrip', () => {
  it('每档渲染一条进度行并显示完成率(收款阶段口径)', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
      projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }],
      projectPmis: {},
      paymentNodes: { P1: [
        { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.6, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
      ] },
      paymentRecords: { P1: { records: [{ amount: 600000, date: '2026-02-01' }] } },
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
      rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
      projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }],
      projectPmis: {},
      paymentNodes: { P1: [
        { stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.6, expectedPayment: 1000000, receivedAmount: 600000, unpaidAmount: 400000, status: '部分回款' },
      ] },
      paymentRecords: { P1: { records: [{ amount: 600000, date: '2026-02-01' }] } },
    } as any
    const w = mount(TierStrip, { global: { stubs: { BoardDrilldownModal: true } } })
    await w.findAll('.ts-row')[0].trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })
})
