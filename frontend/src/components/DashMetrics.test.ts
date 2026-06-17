import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashMetrics from './DashMetrics.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

describe('DashMetrics', () => {
  it('渲染六个指标含延期数(收款阶段口径)', () => {
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
    } as any
    const w = mount(DashMetrics)
    const cards = w.findAll('.dm-card')
    expect(cards.length).toBe(6)
    const text = w.text()
    expect(text).toContain('项目数')
    expect(text).toContain('回款节点')
    expect(text).toContain('延期')
    // 数值断言:完成率=Σ已收600000÷Σ计划1000000=60%(旧空 rawNodes 口径给 0%,确保真换源)
    expect(text).toContain('60%')
  })
})
