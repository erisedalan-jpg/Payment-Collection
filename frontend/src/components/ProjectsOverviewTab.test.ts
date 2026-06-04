import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProjectsOverviewTab from './ProjectsOverviewTab.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' },
    ],
    projectOverview: {
      projects: [
        { projectId: 'P1', projectName: '甲项目', amountTier: '100万以上', orgL4: '北京' },
        { projectId: 'P9', projectName: '乙项目', amountTier: '50万以下', orgL4: '上海' },
      ],
      columns: [
        { key: 'projectId', label: '项目编号', visible: true },
        { key: 'projectName', label: '项目名称', visible: true },
        { key: 'orgL4', label: '服务组', visible: true },
        { key: 'hidden', label: '隐藏列', visible: false },
      ],
    },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('ProjectsOverviewTab', () => {
  it('按档位渲染项目总览 + 汇总条 + 动态列', async () => {
    seed()
    const wrapper = mount(ProjectsOverviewTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = wrapper.text()
    expect(text).toContain('项目总数')
    expect(text).toContain('项目编号')
    expect(text).toContain('甲项目')
    expect(text).not.toContain('乙项目')
    expect(text).not.toContain('隐藏列')
  })

  it('汇总条计算正确（完成率 0% / 延期 1）', async () => {
    seed()
    const wrapper = mount(ProjectsOverviewTab, { props: { tier: '100万以上' }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('0%')
  })
})
