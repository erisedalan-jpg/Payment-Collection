import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashSummaryCards from './DashSummaryCards.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三', projectAmount: 2000000, isPaymentRelated: true, nodeStatus: '已全额回款', expectedPayment: 1000000, actualPayment: 1000000, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [{ projectId: 'P1', 项目经理L4部门: '北京', 项目经理: '张三' }], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('DashSummaryCards', () => {
  it('renders five summary cards with computed values', () => {
    seed()
    const wrapper = mount(DashSummaryCards)
    const text = wrapper.text()
    expect(text).toContain('回款节点数 / 项目总数')
    expect(text).toContain('1 / 1')
    expect(text).toContain('计划回款总金额(万)')
    expect(text).toContain('总完成率')
    expect(text).toContain('100%')
  })
})
