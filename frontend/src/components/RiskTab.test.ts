import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import RiskTab from './RiskTab.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', projectName: '甲', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-06', actualPaymentRatio: 0.5, expectedPayment: 200000, actualPayment: 100000, orgL4: '北京', planMonth: '2026-06' },
      { projectId: 'P3', projectName: '丙', tier: '100万以上', isPaymentRelated: true, nodeStatus: '加资源可提前', planDate: '2026-08-01', actualPaymentRatio: 0, expectedPayment: 300000, actualPayment: 0, orgL4: '广州', planMonth: '2026-08' },
      { projectId: 'P4', projectName: '丁', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-09-01', actualPaymentRatio: 0.1, expectedPayment: 1000000, actualPayment: 100000, projectAmount: 2000000, orgL4: '深圳', planMonth: '2026-09' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('RiskTab', () => {
  it('渲染三类风险标题', async () => {
    seed()
    const wrapper = mount(RiskTab, { props: { tier: '100万以上', now: new Date('2026-06-04T00:00:00') }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('临近到期节点')
    expect(text).toContain('可提前但未行动')
    expect(text).toContain('高金额低完成率')
  })
  it('三张表均为 DataTable', async () => {
    seed()
    const wrapper = mount(RiskTab, { props: { tier: '100万以上', now: new Date('2026-06-04T00:00:00') }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.findAllComponents({ name: 'DataTable' }).length).toBe(3)
  })
})
