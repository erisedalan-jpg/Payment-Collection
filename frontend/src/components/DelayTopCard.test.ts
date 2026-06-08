import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DelayTopCard from './DelayTopCard.vue'
import { useDataStore } from '@/stores/data'
import { useProjectDetailStore } from '@/stores/projectDetail'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'A', projectName: '延期A', tier: '100万以上', orgL4: 'X', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 2200000, actualPayment: 0, delayDays: 15, planMonth: '2026-01' },
      { projectId: 'B', projectName: '延期B', tier: '50万以下', orgL4: 'Y', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 400000, actualPayment: 0, delayDays: 40, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('DelayTopCard', () => {
  it('默认按天数：B(40天) 在 A(15天) 之前', () => {
    seed()
    const w = mount(DelayTopCard)
    const rows = w.findAll('.dtc-row')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('延期B')
  })

  it('切到按金额：A(¥220万) 升到首位', async () => {
    seed()
    const w = mount(DelayTopCard)
    await w.get('[data-test="seg-amount"]').trigger('click')
    expect(w.findAll('.dtc-row')[0].text()).toContain('延期A')
  })

  it('点击行唤起项目详情面板', async () => {
    seed()
    const w = mount(DelayTopCard)
    await w.findAll('.dtc-row')[0].trigger('click')
    const pd = useProjectDetailStore()
    expect(pd.openId).toBe('B')
  })
})
