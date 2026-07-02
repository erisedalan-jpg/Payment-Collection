import { describe, it, expect } from 'vitest'
import { NO_TAG_VALUE, tagFilterOptions, tagMatch } from './tagFilter'

describe('tagFilter', () => {
  it('选项含无标签在首位 + 各启用标签', () => {
    const opts = tagFilterOptions([{ name: 'A' }, { name: 'B' }])
    expect(opts[0]).toEqual({ value: NO_TAG_VALUE, label: '无标签' })
    expect(opts.slice(1)).toEqual([{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }])
  })
  it('未选=全部通过', () => {
    expect(tagMatch(['A'], [])).toBe(true)
    expect(tagMatch([], [])).toBe(true)
  })
  it('选无标签=只纳入无标签项目', () => {
    expect(tagMatch([], [NO_TAG_VALUE])).toBe(true)
    expect(tagMatch(['A'], [NO_TAG_VALUE])).toBe(false)
  })
  it('选标签=OR 命中任一', () => {
    expect(tagMatch(['A', 'C'], ['A', 'B'])).toBe(true)
    expect(tagMatch(['C'], ['A', 'B'])).toBe(false)
  })
  it('无标签 + 标签 并集', () => {
    expect(tagMatch([], [NO_TAG_VALUE, 'A'])).toBe(true)
    expect(tagMatch(['A'], [NO_TAG_VALUE, 'A'])).toBe(true)
    expect(tagMatch(['B'], [NO_TAG_VALUE, 'A'])).toBe(false)
  })
})
