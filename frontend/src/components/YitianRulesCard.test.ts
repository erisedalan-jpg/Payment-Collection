import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import YitianRulesCard from './YitianRulesCard.vue'
import { useYitianRulesStore } from '@/stores/yitianRules'

function seedStore() {
  const s = useYitianRulesStore()
  s.config = {
    version: 1, checkedTypes: ['项目类'],
    checks: {
      summary: { enabled: true, keywords: ['工作概述'] },
      progress: { enabled: true, keywords: ['工作进展'] },
      next: { enabled: true, keywords: ['下一步'] },
      serviceMode: { enabled: true, effectiveDate: '2026-05-09' },
      typeMismatch: { enabled: true, rules: { 售前类: [['正式上线', '项目类']] } },
      product: { enabled: true, lineKeywords: [{ linePatterns: ['NGSOC'], keywords: ['SOC'] }], nameKeywords: [], exclusiveKws: ['组件'] },
      customer: { enabled: true, hintKeywords: ['客户'] },
      presaleProductHint: { enabled: true, skipWorkTypes: ['项目管理'] },
    },
  } as never
  s.loaded = true
  return s
}

describe('YitianRulesCard', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('载入 store 配置到草稿并渲染分组标题', async () => {
    seedStore()
    const w = mount(YitianRulesCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('基础项')
    expect(w.text()).toContain('类型一致性')
    expect(w.text()).toContain('产品类别')
    expect((w.vm as any).draft.checkedTypes).toEqual(['项目类'])
  })

  it('保存调用 store.save 并提示问题数', async () => {
    const s = seedStore()
    const saveSpy = vi.spyOn(s, 'save').mockResolvedValue({ rules: s.config as never, problemCount: 5 })
    const w = mount(YitianRulesCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    await (w.vm as any).onSave()
    expect(saveSpy).toHaveBeenCalled()
    expect(w.text()).toContain('5')
  })

  it('导入替换草稿', async () => {
    seedStore()
    const w = mount(YitianRulesCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const imported = { version: 1, checkedTypes: ['售后类'], checks: (w.vm as any).draft.checks }
    await (w.vm as any).applyImport(imported)
    expect((w.vm as any).draft.checkedTypes).toEqual(['售后类'])
  })
})
