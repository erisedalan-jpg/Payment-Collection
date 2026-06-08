import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { vActivate } from './activate'

const Host = {
  template: `<div class="hit" v-activate @click="onClick">x</div>`,
  setup() {
    const onClick = vi.fn()
    return { onClick }
  },
}

function mountHost() {
  return mount(Host, { global: { directives: { activate: vActivate } } })
}

describe('v-activate', () => {
  it('挂载后补上 role 与 tabindex', () => {
    const w = mountHost()
    const el = w.get('.hit')
    expect(el.attributes('role')).toBe('button')
    expect(el.attributes('tabindex')).toBe('0')
  })

  it('Enter 键触发元素上的 @click', async () => {
    const w = mountHost()
    await w.get('.hit').trigger('keydown', { key: 'Enter' })
    expect((w.vm as unknown as { onClick: ReturnType<typeof vi.fn> }).onClick).toHaveBeenCalledTimes(1)
  })

  it('Space 键触发元素上的 @click', async () => {
    const w = mountHost()
    await w.get('.hit').trigger('keydown', { key: ' ' })
    expect((w.vm as unknown as { onClick: ReturnType<typeof vi.fn> }).onClick).toHaveBeenCalledTimes(1)
  })

  it('不覆盖已有的 role/tabindex', () => {
    const Custom = {
      template: `<div class="hit" role="link" tabindex="2" v-activate @click="() => {}">x</div>`,
    }
    const w = mount(Custom, { global: { directives: { activate: vActivate } } })
    const el = w.get('.hit')
    expect(el.attributes('role')).toBe('link')
    expect(el.attributes('tabindex')).toBe('2')
  })
})
