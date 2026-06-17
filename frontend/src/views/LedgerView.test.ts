import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import LedgerView from './LedgerView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    projects: [
      { projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '北京', paymentPmis: { contract: 2000000 } },
      { projectId: 'P2', projectName: '乙', projectManager: '李', orgL4: '上海', paymentPmis: { contract: 300000 } },
    ],
    projectPmis: {},
    paymentNodes: {
      P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.5, expectedPayment: 1000000, receivedAmount: 0, unpaidAmount: 1000000, actualRatio: 0, status: '延期' }],
      P2: [{ stage: '预付款', planDate: '2026-02-01', actualDate: '2026-02-02', payRatio: 1, expectedPayment: 200000, receivedAmount: 200000, unpaidAmount: 0, actualRatio: 1, status: '已回款' }],
    },
  } as any
}

describe('LedgerView', () => {
  it('渲染汇总条/状态行(4卡)/分层卡/表格(收款阶段口径)', () => {
    seed()
    const w = mount(LedgerView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('计划回款总金额(万)')
    expect(w.text()).toContain('120')
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('P2')
    expect(w.text()).toContain('已全额回款')
    expect(w.text()).toContain('未回款')
    expect(w.text()).toContain('延期')
    expect(w.findComponent({ name: 'LedgerTable' }).exists()).toBe(true)
  })

  it('搜索按经理过滤', async () => {
    seed()
    const w = mount(LedgerView, { global: { plugins: [ElementPlus] } })
    const input = w.find('.toolbar input')
    await input.setValue('李')
    expect(w.text()).toContain('P2')
    expect(w.text()).not.toContain('P1')
  })
})
