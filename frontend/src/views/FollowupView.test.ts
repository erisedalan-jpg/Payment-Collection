import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import FollowupView from './FollowupView.vue'
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
      { orgL4: 'A部门', projectId: 'P1', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-05-01', expectedPayment: 100000, actualPayment: 0, actualPaymentRatio: 0 },
      { orgL4: 'B部门', projectId: 'P2', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-08-15', expectedPayment: 200000, actualPayment: 50000, actualPaymentRatio: 0.25 },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {},
    naguanExclude: {},
    displayColumns: {},
    followupRecords: {},
  } as any
}

describe('FollowupView', () => {
  it('渲染季度概览/统计卡/信号板', () => {
    seed()
    const w = mount(FollowupView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('季度回款概览')
    expect(w.text()).toContain('延期')
    expect(w.text()).toContain('已跟进')
    expect(w.text()).toContain('临期回款进度跟进')
    expect(w.findAllComponents({ name: 'FollowupSignalRow' }).length).toBe(2)
  })

  it('部门搜索过滤信号行', async () => {
    seed()
    const w = mount(FollowupView, { global: { plugins: [ElementPlus] } })
    const input = w.find('input')
    await input.setValue('A部门')
    expect(w.findAllComponents({ name: 'FollowupSignalRow' }).length).toBe(1)
  })

  it('点击部门信号行打开展开面板', async () => {
    seed()
    const w = mount(FollowupView, { global: { plugins: [ElementPlus] }, attachTo: document.body })
    await w.find('.sig-dept.clickable').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('项目列表')
    w.unmount()
  })
})
