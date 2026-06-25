import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProgressEditModal from './ProgressEditModal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'
import { useTempFollowupStore } from '@/stores/tempFollowup'

describe('ProgressEditModal store 分流', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it("store='temp' 时保存调临时跟进 store.update", async () => {
    const tmp = useTempFollowupStore()
    const key = useProjectProgressStore()
    const tSpy = vi.spyOn(tmp, 'update').mockResolvedValue(undefined as any)
    const kSpy = vi.spyOn(key, 'update').mockResolvedValue(undefined as any)
    const w = mount(ProgressEditModal, {
      props: { modelValue: true, projectId: 'P1', projectName: '甲', field: 'weekProgress', initial: 'x', store: 'temp' },
      global: { plugins: [ElementPlus], stubs: { teleport: true } },
    })
    await (w.vm as any).save()
    expect(tSpy).toHaveBeenCalledWith('P1', 'weekProgress', 'x')
    expect(kSpy).not.toHaveBeenCalled()
  })

  it("默认(key) 调 projectProgress store.update", async () => {
    const key = useProjectProgressStore()
    const kSpy = vi.spyOn(key, 'update').mockResolvedValue(undefined as any)
    const w = mount(ProgressEditModal, {
      props: { modelValue: true, projectId: 'P2', projectName: '乙', field: 'nextPlan', initial: 'y' },
      global: { plugins: [ElementPlus], stubs: { teleport: true } },
    })
    await (w.vm as any).save()
    expect(kSpy).toHaveBeenCalledWith('P2', 'nextPlan', 'y')
  })
})
