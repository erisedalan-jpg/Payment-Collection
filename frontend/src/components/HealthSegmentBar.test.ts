import { describe, it, expect } from 'vitest'
import { mount, RouterLinkStub } from '@vue/test-utils'
import HealthSegmentBar from './HealthSegmentBar.vue'

const segs = [
  { key: '健康', label: '健康', count: 336, color: 'var(--ok)', to: '/projects?health=健康' },
  { key: '关注', label: '关注', count: 253, color: 'var(--warn)', to: '/projects?health=关注' },
  { key: '风险', label: '风险', count: 49, color: 'var(--danger)', to: '/projects?health=风险' },
  { key: '无数据', label: '无数据', count: 0, color: 'var(--mut)' },
]
const opts = { global: { stubs: { RouterLink: RouterLinkStub } } }

describe('HealthSegmentBar', () => {
  it('只渲染 count>0 的段与图例', () => {
    const w = mount(HealthSegmentBar, { props: { segments: segs }, ...opts })
    expect(w.findAll('.hsb-seg')).toHaveLength(3)
    expect(w.findAll('.hsb-leg')).toHaveLength(3)
    expect(w.text()).toContain('336')
  })

  it('极小段宽不小于 minSegmentPct', () => {
    const w = mount(HealthSegmentBar, {
      props: { segments: [
        { key: 'a', label: 'A', count: 999, color: 'var(--ok)' },
        { key: 'b', label: 'B', count: 1, color: 'var(--danger)' },
      ], minSegmentPct: 5 },
      ...opts,
    })
    expect(w.findAll('.hsb-seg')[1].attributes('style')).toContain('width: 5%')
  })

  it('有 to 的图例渲染为链接并带正确 to', () => {
    const w = mount(HealthSegmentBar, { props: { segments: segs }, ...opts })
    const links = w.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(3)
    expect(links[0].props('to')).toBe('/projects?health=健康')
  })

  it('无 to 的图例点击 emit seg-click(key);有 to 的点击不 emit(仍走 RouterLink)', async () => {
    const w = mount(HealthSegmentBar, {
      props: { segments: [
        { key: 'ok', label: '达标', count: 5, color: 'var(--ok)' },
        { key: '健康', label: '健康', count: 3, color: 'var(--ok)', to: '/projects?health=健康' },
      ] },
      ...opts,
    })
    const legs = w.findAll('.hsb-leg')
    await legs[0].trigger('click') // 无 to → span
    await legs[1].trigger('click') // 有 to → RouterLinkStub
    expect(w.emitted('seg-click')).toEqual([['ok']])
  })

  it('无 to 的图例也带 hsb-leg--link 悬停手感类', () => {
    const w = mount(HealthSegmentBar, {
      props: { segments: [{ key: 'ok', label: '达标', count: 5, color: 'var(--ok)' }] },
      ...opts,
    })
    expect(w.find('.hsb-leg').classes()).toContain('hsb-leg--link')
  })
})
