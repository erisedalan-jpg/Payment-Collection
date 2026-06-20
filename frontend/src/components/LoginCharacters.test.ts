import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import LoginCharacters from './LoginCharacters.vue'

describe('LoginCharacters', () => {
  afterEach(() => { delete (window as any).matchMedia })

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
  it('prefers-reduced-motion: 禁用眼随(瞳孔不随鼠标偏移)', () => {
    ;(window as any).matchMedia = vi.fn().mockReturnValue({ matches: true })
    const w = mount(LoginCharacters)
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 99999, clientY: 99999 }))
    const style = w.find('.lc').attributes('style') || ''
    expect(style).toContain('--eye-x: 0px')   // reduceMotion→onMove 短路,eye.x 保持 0
  })
})
