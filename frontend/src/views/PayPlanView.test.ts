import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useDataStore } from '@/stores/data'
import PayPlanView from './PayPlanView.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [
      { projectId: 'A', projectName: '甲', orgL4: '组1', payment: { paymentRatio: 1 }, paymentPmis: { contract: 100, actualTotal: 100 } },
      { projectId: 'B', projectName: '乙', orgL4: '组1', payment: { paymentRatio: 0.5 }, paymentPmis: { contract: 100, actualTotal: 50 } },
      { projectId: 'C', projectName: '丙', orgL4: '组2', payment: { paymentRatio: 0 }, paymentPmis: { contract: 100, actualTotal: 0 } },
    ],
    projectPmis: {},
  } as any
}

describe('PayPlanView(回款进度)', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('渲染 3 进度桶卡（已全额/部分/未回款）', () => {
    seed()
    const w = mount(PayPlanView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('已全额回款')
    expect(w.text()).toContain('部分回款')
    expect(w.text()).toContain('未回款')
  })
  it('空数据不崩', () => {
    const data = useDataStore(); data.data = { projects: [], projectPmis: {} } as any
    expect(mount(PayPlanView, { global: { plugins: [ElementPlus] } }).exists()).toBe(true)
  })
  it('分页:超过页大小手写表只渲染一页', () => {
    const data = useDataStore()
    data.data = {
      projects: Array.from({ length: 60 }, (_, i) => ({
        projectId: 'P' + i, projectName: '名' + i, orgL4: '组1',
        payment: { paymentRatio: 0.5 }, paymentPmis: { contract: 100, actualTotal: 50 },
      })),
      projectPmis: {},
    } as any
    const w = mount(PayPlanView, { global: { plugins: [ElementPlus] } })
    expect(w.findAll('tr.prow').length).toBe(50)
  })
})
