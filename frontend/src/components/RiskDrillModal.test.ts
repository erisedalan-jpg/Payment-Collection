import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import RiskDrillModal from './RiskDrillModal.vue'

let router: Router
beforeEach(() => {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/project/:id', component: { template: '<div/>' } },
  ] })
})

const rows = [{ projectId: 'P1', projectName: '甲', orgL4: '组', riskLevel: '高', openRisks: 2, contractAmount: 2000000 }] as any

describe('RiskDrillModal', () => {
  it('标题含项目数、渲染行', async () => {
    const w = mount(RiskDrillModal, { props: { modelValue: true, title: 'L4组织=组 / 风险等级=高', rows },
      global: { plugins: [ElementPlus, router], stubs: { Modal: { template: '<div><slot/></div>' } } } })
    await flushPromises()
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('高')
  })
  it('点行跳详情并关闭', async () => {
    await router.push('/'); await router.isReady()
    const push = vi.spyOn(router, 'push')
    const w = mount(RiskDrillModal, { props: { modelValue: true, title: 't', rows },
      global: { plugins: [ElementPlus, router], stubs: { Modal: { template: '<div><slot/></div>' } } } })
    await w.find('.el-table__row').trigger('click')
    expect(push).toHaveBeenCalledWith('/project/P1')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
