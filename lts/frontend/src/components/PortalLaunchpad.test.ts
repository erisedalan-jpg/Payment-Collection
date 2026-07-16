import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PortalLaunchpad from './PortalLaunchpad.vue'
import type { PortalSection } from '@/lib/portal'

const sections: PortalSection[] = [
  { key: '__featured__', label: '置顶', featured: true, items: [
    { id: 'pl_a', type: 'url', name: 'PMIS', group: 'G', emoji: '', featured: true,
      url: 'https://pmis.example.com', file: null, visibility: { mode: 'all' } },
  ] },
  { key: 'D', label: '文档下载', featured: false, items: [
    { id: 'pl_b', type: 'file', name: '周报', group: 'D', emoji: '📄', featured: false,
      url: '', file: { storedName: 'pf_x__z.txt', originalName: 'z.txt', size: 5 }, visibility: { mode: 'all' } },
  ] },
]

describe('PortalLaunchpad', () => {
  it('渲染置顶段与分组段', () => {
    const w = mount(PortalLaunchpad, { props: { sections } })
    expect(w.text()).toContain('置顶')
    expect(w.text()).toContain('文档下载')
    expect(w.findAll('.pl-tile')).toHaveLength(2)
  })

  it('url 项 target=_blank + rel=noopener + href', () => {
    const w = mount(PortalLaunchpad, { props: { sections } })
    const a = w.find('[data-test="portal-item-pl_a"]')
    expect(a.attributes('href')).toBe('https://pmis.example.com')
    expect(a.attributes('target')).toBe('_blank')
    expect(a.attributes('rel')).toBe('noopener noreferrer')
  })

  it('file 项 href 指向下载端点、无 target', () => {
    const w = mount(PortalLaunchpad, { props: { sections } })
    const a = w.find('[data-test="portal-item-pl_b"]')
    expect(a.attributes('href')).toContain('/api/portal/download?id=pl_b')
    expect(a.attributes('target')).toBeUndefined()
  })

  it('emoji 有值显 emoji、无值显首字母', () => {
    const w = mount(PortalLaunchpad, { props: { sections } })
    expect(w.find('[data-test="portal-item-pl_b"]').text()).toContain('📄')
    expect(w.find('[data-test="portal-item-pl_a"] .pl-initial').text()).toBe('P')
  })

  it('不安全 url → href 降级为 #', () => {
    const bad: PortalSection[] = [{ key: 'G', label: 'G', featured: false, items: [
      { id: 'pl_c', type: 'url', name: 'x', group: 'G', emoji: '', featured: false,
        url: 'javascript:alert(1)', file: null, visibility: { mode: 'all' } }] }]
    const w = mount(PortalLaunchpad, { props: { sections: bad } })
    expect(w.find('[data-test="portal-item-pl_c"]').attributes('href')).toBe('#')
  })
})
