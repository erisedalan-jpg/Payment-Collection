import { describe, it, expect } from 'vitest'
import { isSafeUrl, initials, avatarColor, buildSections, newItemId, emptyConfig, type PortalConfig, type PortalItem } from './portal'

function item(over: Partial<PortalItem>): PortalItem {
  return { id: 'pl_' + '0'.repeat(12), type: 'url', name: '入口', group: 'G', emoji: '',
    featured: false, url: 'https://x.com', file: null, visibility: { mode: 'all' }, ...over }
}

describe('portal lib', () => {
  it('isSafeUrl 仅放 http/https', () => {
    expect(isSafeUrl('https://a.com')).toBe(true)
    expect(isSafeUrl('http://a.com')).toBe(true)
    expect(isSafeUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeUrl('data:text/html,x')).toBe(false)
    expect(isSafeUrl('nonsense')).toBe(false)
  })

  it('initials 汉字取首字/拉丁取大写首字母/空占位', () => {
    expect(initials('周报模板')).toBe('周')
    expect(initials('pmis')).toBe('P')
    expect(initials('')).toBe('·')
  })

  it('avatarColor 确定性且落在 --chart 令牌集', () => {
    const c = avatarColor('PMIS')
    expect(c).toBe(avatarColor('PMIS'))
    expect(c).toMatch(/^var\(--chart-[1-8]\)$/)
  })

  it('newItemId 前缀 pl_ 且唯一', () => {
    expect(newItemId()).toMatch(/^pl_[0-9a-f]{12}$/)
    expect(newItemId()).not.toBe(newItemId())
  })

  it('buildSections 置顶区在前、按 groups 顺序、featured 不在原组重复', () => {
    const cfg: PortalConfig = {
      version: 1, groups: ['G', 'H'], items: [
        item({ id: 'pl_' + 'a'.repeat(12), group: 'G', featured: true, name: '顶A' }),
        item({ id: 'pl_' + 'b'.repeat(12), group: 'G', name: 'G1' }),
        item({ id: 'pl_' + 'c'.repeat(12), group: 'H', name: 'H1' }),
      ],
    }
    const secs = buildSections(cfg)
    expect(secs.map((s) => s.key)).toEqual(['__featured__', 'G', 'H'])
    expect(secs[0].items.map((i) => i.name)).toEqual(['顶A'])
    expect(secs[1].items.map((i) => i.name)).toEqual(['G1'])  // 顶A 不重复出现在 G
    expect(secs[2].items.map((i) => i.name)).toEqual(['H1'])
  })

  it('buildSections 无置顶则无 featured 段;空组不出段', () => {
    const cfg: PortalConfig = { version: 1, groups: ['G', 'H'], items: [item({ group: 'G' })] }
    const secs = buildSections(cfg)
    expect(secs.map((s) => s.key)).toEqual(['G'])
  })

  it('emptyConfig', () => {
    expect(emptyConfig()).toEqual({ version: 1, groups: [], items: [] })
  })
})
