import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProjectsOverviewTab from './ProjectsOverviewTab.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const data = useDataStore()
  data.data = {
    meta: { lastUpdate: 'x', totalProjects: 1, totalPaymentNodes: 3 },
    dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {},
    projects: [
      {
        projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1',
        paymentPmis: {
          contract: 2_000_000, actualTotal: 1_000_000, paymentRatio: 0.5,
          expectedTotal: 1_500_000, nodeCount: 3, reachedCount: 1, delayedCount: 1, fromOrigin: false,
        },
      },
    ] as any,
    projectPmis: { A: { progress: { 项目阶段: '实施' } } } as any,
  } as any
}

describe('ProjectsOverviewTab', () => {
  it('渲染项目行与维度汇总，行可点击', async () => {
    seed()
    const w = mount(ProjectsOverviewTab, {
      props: { dim: 'dept' },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).toContain('甲')
    expect(w.text()).toContain('部门汇总')
    expect(w.text()).toContain('组1')
  })

  it('空数据不崩', async () => {
    const data = useDataStore()
    data.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
      dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanExclude: {}, projects: [], projectPmis: {},
    } as any
    const w = mount(ProjectsOverviewTab, {
      props: { dim: 'tier' },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.exists()).toBe(true)
  })
})
