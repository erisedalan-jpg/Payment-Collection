import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import PayProjectsView from './PayProjectsView.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const data = useDataStore()
  useFilterStore().setPreset('all')
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

describe('PayProjectsView', () => {
  it('渲染项目明细行，部门汇总不再出现', async () => {
    seed()
    const w = mount(PayProjectsView, {
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    // 明细表仍渲染
    expect(w.text()).toContain('甲')
    // 部门汇总 section 已移除
    expect(w.text()).not.toContain('部门汇总')
    expect(w.find('section.dim-summary').exists()).toBe(false)
  })

  it('明细表含预期列头', async () => {
    seed()
    const w = mount(PayProjectsView, {
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.text()).toContain('项目编号')
    expect(w.text()).toContain('完成率')
  })

  it('空数据不崩', async () => {
    const data = useDataStore()
    useFilterStore().setPreset('all')
    data.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
      dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanExclude: {}, projects: [], projectPmis: {},
    } as any
    const w = mount(PayProjectsView, {
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.exists()).toBe(true)
    expect(w.text()).not.toContain('部门汇总')
  })
})
