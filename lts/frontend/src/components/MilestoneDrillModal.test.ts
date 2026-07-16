import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneDrillModal from './MilestoneDrillModal.vue'
import DataTable from './DataTable.vue'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

// Modal 包 el-dialog(append-to-body) 会 teleport 内容,stub 成内联渲染 slot + title
const ModalStub = { props: ['title'], template: '<div class="modal-stub">{{ title }}<slot /></div>' }

const rows = [
  { projectId: 'P1', projectName: '甲', manager: '张', orgL4: 'D1', node: '终验', planDate: '2026-06-01', status: '正常' },
] as any[]

const opts = { global: { plugins: [ElementPlus], stubs: { Modal: ModalStub } } }

describe('MilestoneDrillModal', () => {
  it('打开时把 rows 传给 DataTable 且显示标题', () => {
    const w = mount(MilestoneDrillModal, { props: { modelValue: true, title: '终验 · 6月', rows }, ...opts })
    expect(w.findComponent(DataTable).props('rows')).toHaveLength(1)
    expect(w.text()).toContain('终验 · 6月')
  })
  it('行点击跳项目详情并关闭', async () => {
    pushSpy.mockClear()
    const w = mount(MilestoneDrillModal, { props: { modelValue: true, title: 't', rows }, ...opts })
    await w.findComponent(DataTable).vm.$emit('row-click', rows[0])
    expect(pushSpy).toHaveBeenCalledWith('/project/P1')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
