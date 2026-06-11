import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import InsightDrillModal from './InsightDrillModal.vue'

// Modal 包 el-dialog(append-to-body) 会把内容 teleport 出 wrapper，stub 成内联渲染 slot
const ModalStub = { template: '<div class="modal-stub" data-title-attr=""><slot /></div>' }

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

const ROWS = [
  { projectId: 'P-1', projectName: '甲', manager: '何平', stage: '项目执行', health: '风险',
    contractAmount: 2000000, expectedTotal: 1000, actualTotal: 600 },
] as any[]

describe('InsightDrillModal', () => {
  it('渲染标题与项目行,行点击关弹窗并跳详情', async () => {
    const w = mount(InsightDrillModal, {
      props: { modelValue: true, title: '风险 / 何平', rows: ROWS },
      global: { plugins: [ElementPlus, router], stubs: { Modal: ModalStub } },
    })
    await flushPromises()
    expect(w.text()).toContain('甲')
    const push = vi.spyOn(router, 'push')
    await w.find('.el-table__row').trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/project/P-1')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([false])
  })
})
