import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useDataStore } from '@/stores/data'
import PlanTab from './PlanTab.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [
      { projectId: 'A', projectName: '甲', orgL4: '组1', paymentPmis: { contract: 100, actualTotal: 100, paymentRatio: 1 } },
      { projectId: 'B', projectName: '乙', orgL4: '组1', paymentPmis: { contract: 100, actualTotal: 50, paymentRatio: 0.5 } },
      { projectId: 'C', projectName: '丙', orgL4: '组2', paymentPmis: { contract: 100, actualTotal: 0, paymentRatio: 0 } },
    ],
    projectPmis: {}, naguanExclude: {},
  } as any
}

describe('PlanTab(回款进度)', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('渲染 3 进度桶卡（已全额/部分/未回款）', () => {
    seed()
    const w = mount(PlanTab, { props: { dim: 'dept' }, global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('已全额回款')
    expect(w.text()).toContain('部分回款')
    expect(w.text()).toContain('未回款')
  })
  it('空数据不崩', () => {
    const data = useDataStore(); data.data = { projects: [], projectPmis: {}, naguanExclude: {} } as any
    expect(mount(PlanTab, { props: { dim: 'tier' }, global: { plugins: [ElementPlus] } }).exists()).toBe(true)
  })
})
