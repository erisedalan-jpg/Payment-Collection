import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneStatusModal from './MilestoneStatusModal.vue'
import DataTable from './DataTable.vue'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

const ModalStub = { props: ['title'], template: '<div class="modal-stub">{{ title }}<slot /></div>' }
const rows = [{ projectId: 'P1', projectName: '甲', manager: '张', orgL4: 'D1', contract: 100, status: '严重延期' }] as any[]
const opts = { global: { plugins: [ElementPlus], stubs: { Modal: ModalStub } } }

describe('MilestoneStatusModal', () => {
  it('打开时把 rows 传给 DataTable 且显示标题', () => {
    const w = mount(MilestoneStatusModal, { props: { modelValue: true, title: '严重延期', rows }, ...opts })
    expect(w.findComponent(DataTable).props('rows')).toHaveLength(1)
    expect(w.text()).toContain('严重延期')
  })
  it('行点击跳项目详情并关闭', async () => {
    pushSpy.mockClear()
    const w = mount(MilestoneStatusModal, { props: { modelValue: true, title: 't', rows }, ...opts })
    await w.findComponent(DataTable).vm.$emit('row-click', rows[0])
    expect(pushSpy).toHaveBeenCalledWith('/project/P1')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
