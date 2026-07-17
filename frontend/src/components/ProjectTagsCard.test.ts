import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ProjectTagsCard from './ProjectTagsCard.vue'
import { useProjectTagsStore } from '@/stores/projectTags'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) } as any)))
})

describe('ProjectTagsCard', () => {
  it('渲染标签库与按标签排除', async () => {
    const tags = useProjectTagsStore()
    tags.load = vi.fn(async () => { tags.$patch({ tags: [{ name: 'BH项目' }, { name: '框架合同' }], loaded: true }) })
    const w = mount(ProjectTagsCard, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
    await flushPromises()
    expect(w.text()).toContain('项目标签')
    expect(w.text()).toContain('按标签排除')
    expect(w.html()).toContain('BH项目')
  })

  it('添加标签 → 写 store 并保存', async () => {
    const tags = useProjectTagsStore()
    tags.load = vi.fn(async () => { tags.$patch({ tags: [], loaded: true }) })
    const saveSpy = vi.spyOn(tags, 'save').mockResolvedValue(undefined as never)
    const w = mount(ProjectTagsCard, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
    await flushPromises()
    await w.find('.el-input__inner').setValue('新标签A')
    await w.findAll('button').find((b) => b.text() === '添加')!.trigger('click')
    await flushPromises()
    expect(tags.tags.some((t) => t.name === '新标签A')).toBe(true)
    expect(saveSpy).toHaveBeenCalled()
  })
})
