import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

const { getSpy, saveSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  saveSpy: vi.fn(async (c: unknown) => c),
}))
vi.mock('@/lib/yitianApi', () => ({
  getYitianSettings: getSpy,
  saveYitianSettings: saveSpy,
  getYitianData: vi.fn(),
}))

import YitianScopeCard from './YitianScopeCard.vue'
import { useYitianSettingsStore } from '@/stores/yitianSettings'

describe('YitianScopeCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getSpy.mockReset()
    saveSpy.mockClear()
    getSpy.mockResolvedValue({ excludedTypes: ['管理类', '业务类', '假期类'] })
  })

  it('挂载即拉配置并勾上默认剔除项', async () => {
    const w = mount(YitianScopeCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(getSpy).toHaveBeenCalledTimes(1)
    expect((w.vm as any).draft).toEqual(['管理类', '业务类', '假期类'])
  })

  it('保存把勾选结果发给后端', async () => {
    const w = mount(YitianScopeCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    ;(w.vm as any).draft = ['管理类']
    await (w.vm as any).onSave()
    expect(saveSpy).toHaveBeenCalledWith({ excludedTypes: ['管理类'] })
    expect(useYitianSettingsStore().settings.excludedTypes).toEqual(['管理类'])
  })

  it('可以全不勾(不剔除任何类型)', async () => {
    const w = mount(YitianScopeCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    ;(w.vm as any).draft = []
    await (w.vm as any).onSave()
    expect(saveSpy).toHaveBeenCalledWith({ excludedTypes: [] })
  })

  it('提示文案说清"纳入=白送合规"', async () => {
    const w = mount(YitianScopeCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('没有必填字段规则')
  })
})
