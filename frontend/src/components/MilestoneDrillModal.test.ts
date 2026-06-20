import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import MilestoneDrillModal from './MilestoneDrillModal.vue'
import DataTable from './DataTable.vue'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

const rows = [
  { projectId: 'P1', projectName: '甲', manager: '张', orgL4: 'D1', node: '终验', planDate: '2026-06-01', status: '正常' },
] as any[]

describe('MilestoneDrillModal', () => {
  it('打开时把 rows 传给 DataTable', () => {
    const w = mount(MilestoneDrillModal, { props: { modelValue: true, title: '终验 · 6月', rows }, global: { plugins: [ElementPlus] } })
    expect(w.findComponent(DataTable).props('rows')).toHaveLength(1)
    expect(w.text()).toContain('终验 · 6月')
  })
  it('行点击跳项目详情并关闭', async () => {
    pushSpy.mockClear()
    const w = mount(MilestoneDrillModal, { props: { modelValue: true, title: 't', rows }, global: { plugins: [ElementPlus] } })
    await w.findComponent(DataTable).vm.$emit('row-click', rows[0])
    expect(pushSpy).toHaveBeenCalledWith('/project/P1')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
