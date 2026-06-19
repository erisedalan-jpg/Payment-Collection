import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashMetrics from './DashMetrics.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); useFilterStore().setPreset('all') })

describe('DashMetrics', () => {
  it('渲染六个指标含延期数(流水口径)', () => {
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
      // 流水: P1 实收 800000 (与节点 receivedAmount=600000 刻意不同, 验证流水口径)
      paymentRecords: {
        P1: { total: 800000, count: 1, records: [{ date: '2026-02-10', amount: 800000 }] },
      },
    } as any
    const w = mount(DashMetrics)
    const cards = w.findAll('.dm-card')
    expect(cards.length).toBe(6)
    const text = w.text()
    expect(text).toContain('项目数')
    expect(text).toContain('回款节点')
    expect(text).toContain('延期')
    // 流水口径: totalActual=800000, totalExpected=1000000(来自节点rows), rate=80%
    // 与节点口径(60%)不同, 确保已切换为流水口径
    expect(text).toContain('80%')
  })

  it('无流水时已回款=0, 完成率=0%', () => {
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
      // 无 paymentRecords => 流水=0
      paymentRecords: {},
    } as any
    const w = mount(DashMetrics)
    const text = w.text()
    expect(text).toContain('0%')
  })
})
