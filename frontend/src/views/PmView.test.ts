import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import PmView from './PmView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    dashboard: {},
    summary: {},
    rawNodes: [
      { projectManager: '张', projectId: 'P1', projectName: '甲', tier: '100万以上', projectAmount: 1000000, isPaymentRelated: true, expectedPayment: 200000, actualPayment: 0, nodeStatus: '延期', milestone: 'M1' },
      { projectManager: '李', projectId: 'P2', projectName: '乙', tier: '50万以下', projectAmount: 300000, isPaymentRelated: true, expectedPayment: 100000, actualPayment: 100000, nodeStatus: '正常实施中' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {},
    naguanExclude: {},
    displayColumns: {},
    followupRecords: {},
  } as any
}

describe('PmView', () => {
  it('渲染标题/搜索/排名表', () => {
    seed()
    const w = mount(PmView, { global: { plugins: [ElementPlus] }, attachTo: document.body })
    expect(w.text()).toContain('项目经理视图')
    expect(w.text()).toContain('张')
    expect(w.text()).toContain('李')
    expect(w.findComponent({ name: 'PmRankingTable' }).exists()).toBe(true)
    w.unmount()
  })

  it('点击经理行打开下钻弹层', async () => {
    seed()
    const w = mount(PmView, { global: { plugins: [ElementPlus] }, attachTo: document.body })
    await w.find('.pm-row').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('项目经理详情')
    w.unmount()
  })
})
