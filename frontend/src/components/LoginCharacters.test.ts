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
})
