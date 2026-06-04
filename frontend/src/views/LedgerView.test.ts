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
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {},
    summary: {},
    rawNodes: [
      { projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '北京', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', projectAmount: 2000000, expectedPayment: 1000000, actualPayment: 0 },
      { projectId: 'P2', projectName: '乙', projectManager: '李', orgL4: '上海', tier: '50万以下', isPaymentRelated: true, nodeStatus: '正常实施中', projectAmount: 300000, expectedPayment: 200000, actualPayment: 200000 },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {},
    naguanExclude: {},
    displayColumns: {},
    followupRecords: {},
  } as any
}

describe('LedgerView', () => {
  it('渲染汇总条/状态行/分层卡/表格', () => {
    seed()
    const w = mount(LedgerView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('计划回款总金额(万)')
    // 汇总 fmtWan(1000000+200000)=120
    expect(w.text()).toContain('120')
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('P2')
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
