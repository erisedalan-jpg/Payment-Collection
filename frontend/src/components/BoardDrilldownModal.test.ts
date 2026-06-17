import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import BoardDrilldownModal from './BoardDrilldownModal.vue'
import { useProjectDetailStore } from '@/stores/projectDetail'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

// Modal 包 el-dialog(append-to-body) 会把内容 teleport 出 wrapper，stub 成内联渲染 slot
const ModalStub = { template: '<div class="modal-stub"><slot /></div>' }

const PROJECTS = [
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三', projectType: '', orgL3: '', projectAmount: 2000000, paymentStatus: '延期', paymentRatio: 0.4, expectedPayment: 1500000, actualPayment: 600000, remainingAmount: 900000, canAdvance: false, nodes: [] },
] as Record<string, any>[]

describe('BoardDrilldownModal', () => {
  it('渲染组内项目并在点击行时唤起详情面板', async () => {
    const w = mount(BoardDrilldownModal, {
      props: { modelValue: true, title: '北京', projects: PROJECTS },
      global: { plugins: [ElementPlus], stubs: { Modal: ModalStub } },
    })
    await flushPromises()
    expect(w.text()).toContain('甲')
    await w.find('.el-table__row').trigger('click')
    const pd = useProjectDetailStore()
    expect(pd.openId).toBe('P1')
  })
})
