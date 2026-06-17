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
    rawNodes: [],
    projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } }],
    projectPmis: {},
    paymentNodes: { P1: [
      { stage: '到货款', planDate: '2026-02-10', actualDate: '', payRatio: 0.5, expectedPayment: 1000000, receivedAmount: 0, unpaidAmount: 500000, status: '待回款' },
    ] },
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

  it('月度趋势：2026-02 桶的 100万以上 系列有非零数据', () => {
    seed()
    const w = mount(TrendCard)
    const cats = w.findComponent(PendingBarChart).props('categories') as string[]
    const seriesData = w.findComponent(PendingBarChart).props('series') as { tier: string; data: number[] }[]
    expect(cats).toContain('2026-02')
    const idx = cats.indexOf('2026-02')
    const t100 = seriesData.find((s) => s.tier === '100万以上')
    expect(t100).toBeDefined()
    expect(t100!.data[idx]).toBeCloseTo(50) // 500000/10000
  })
})
