import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import PlanTab from './PlanTab.vue'
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
      { projectId: 'P1', projectName: '甲', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', orgL4: '北京', expectedPayment: 1000000, actualPayment: 0 },
      { projectId: 'P2', projectName: '乙', tier: '100万以上', isPaymentRelated: true, nodeStatus: '加资源可提前', orgL4: '上海', expectedPayment: 500000, actualPayment: 500000 },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {},
    naguanExclude: {},
    displayColumns: {
      '100万以上': [
        { key: 'projectId', label: '项目编号', visible: true },
        { key: 'orgL4', label: '服务组', visible: true },
      ],
    },
    followupRecords: {},
  } as any
}

describe('PlanTab', () => {
  it('渲染汇总条/状态格/6看板/工具栏', () => {
    seed()
    const w = mount(PlanTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('节点计划回款金额(万)')
    // 守护汇总求和与单位换算：(100万+50万)/1万 = 150
    expect(w.text()).toContain('150')
    expect(w.text()).toContain('加资源可提前')
    expect(w.findAllComponents({ name: 'PlanBoard' }).length).toBe(6)
    expect(w.text()).toContain('筛选联动')
    // 初始无筛选 → 不显示"清除所有筛选"
    expect(w.text()).not.toContain('清除所有筛选')
  })
  it('节点按状态进入对应看板', () => {
    seed()
    const w = mount(PlanTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('P2')
  })
})
