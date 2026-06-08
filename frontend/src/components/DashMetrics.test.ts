import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashMetrics from './DashMetrics.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('DashMetrics', () => {
  it('渲染六个指标含延期数', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [
        { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-02' },
      ],
      projectOverview: { projects: [{ projectId: 'P1' }], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(DashMetrics)
    const cards = w.findAll('.dm-card')
    expect(cards.length).toBe(6)
    const text = w.text()
    expect(text).toContain('项目数')
    expect(text).toContain('回款节点')
    expect(text).toContain('延期')
  })
})
