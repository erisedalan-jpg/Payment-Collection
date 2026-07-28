import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useExcludeStore } from './exclude'
import { useProjectTagsStore } from '@/stores/projectTags'

describe('exclude store（按标签全局排除）', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

  it('excludeOn 关 → 空；开+选标签 → 命中项目集', () => {
    const tags = useProjectTagsStore()
    tags.assignments = { A: ['框架合同'], B: ['BH项目'], C: ['框架合同', 'BH项目'] } as any
    const f = useExcludeStore()
    expect(f.excludedIds).toEqual({})
    f.setExclude(true, ['框架合同'])
    expect(f.excludedIds).toEqual({ A: true, C: true })
    expect(f.excludeOn).toBe(true)
    expect(f.excludeTags).toEqual(['框架合同'])
  })

  it('开但未选标签 → 空（不误排除）', () => {
    const f = useExcludeStore()
    f.setExclude(true, [])
    expect(f.excludedIds).toEqual({})
  })

  it('localStorage 中 pa_exclude_tags 损坏(非合法 JSON) → 回退空数组,不抛异常', () => {
    localStorage.setItem('pa_exclude_tags', '{not valid json')
    expect(() => useExcludeStore()).not.toThrow()
    const f = useExcludeStore()
    expect(f.excludeTags).toEqual([])
  })

  it('localStorage 中 pa_exclude_tags 是合法 JSON 但非数组 → 回退空数组', () => {
    localStorage.setItem('pa_exclude_tags', '{"a":1}')
    const f = useExcludeStore()
    expect(f.excludeTags).toEqual([])
  })

  it('localStorage key 是 pa_exclude_on / pa_exclude_tags（改 key 会清空现网用户配置）', () => {
    const f = useExcludeStore()
    f.setExclude(true, ['框架合同'])
    expect(localStorage.getItem('pa_exclude_on')).toBe('true')
    expect(JSON.parse(localStorage.getItem('pa_exclude_tags') as string)).toEqual(['框架合同'])
  })
})
