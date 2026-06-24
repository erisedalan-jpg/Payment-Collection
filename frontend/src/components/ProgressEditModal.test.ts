import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProgressEditModal from './ProgressEditModal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'

beforeEach(() => setActivePinia(createPinia()))

function mountModal() {
  return mount(ProgressEditModal, {
    props: { modelValue: true, projectId: 'P1', projectName: '甲', field: 'weekProgress', initial: '旧内容' },
    global: { plugins: [ElementPlus], stubs: { Modal: { template: '<div><slot/></div>' } } },
  })
}

describe('ProgressEditModal', () => {
  it('预填 initial、标题含字段名', () => {
    const w = mountModal()
    expect(w.text()).toContain('本周工作进展')
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('旧内容')
  })
  it('保存调 store.update 并关闭', async () => {
    const s = useProjectProgressStore()
    const spy = vi.spyOn(s, 'update').mockResolvedValue(undefined as any)
    const w = mountModal()
    await w.find('textarea').setValue('新内容')
    await w.find('.pem-save').trigger('click')
    expect(spy).toHaveBeenCalledWith('P1', 'weekProgress', '新内容')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
