import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginCharacters from './LoginCharacters.vue'

describe('LoginCharacters', () => {
  it('渲染 4 个角色,默认 idle', () => {
    const w = mount(LoginCharacters)
    expect(w.findAll('.lc-char')).toHaveLength(4)
    expect(w.find('.lc').classes()).toContain('lc--idle')
  })
  it('mood prop 驱动根类', async () => {
    const w = mount(LoginCharacters, { props: { mood: 'account' } })
    expect(w.find('.lc').classes()).toContain('lc--account')
    await w.setProps({ mood: 'password' })
    expect(w.find('.lc').classes()).toContain('lc--password')
    await w.setProps({ mood: 'reveal' })
    expect(w.find('.lc').classes()).toContain('lc--reveal')
    await w.setProps({ mood: 'fail' })
    expect(w.find('.lc').classes()).toContain('lc--fail')
  })
  it('眼随鼠标:mousemove 更新瞳孔偏移(--eye-x 非 0)', async () => {
    const w = mount(LoginCharacters)
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 99999, clientY: 0 }))
    await w.vm.$nextTick()   // Vue :style 绑定异步刷新,须等下一拍再读属性
    const style = w.find('.lc').attributes('style') || ''
    expect(style).toMatch(/--eye-x:\s*[1-9]/)   // 向右偏移,瞳孔随鼠标(非 0)
  })
})
