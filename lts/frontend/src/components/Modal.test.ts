import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import Modal from './Modal.vue'

afterEach(() => { document.body.innerHTML = '' })

describe('Modal', () => {
  it('renders title and default slot content when open', async () => {
    const wrapper = mount(Modal, {
      props: { modelValue: true, title: '测试标题' },
      slots: { default: '<p>内容X</p>' },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('测试标题')
    expect(document.body.textContent).toContain('内容X')
    wrapper.unmount()
  })

  it('does not render content when closed', async () => {
    const wrapper = mount(Modal, {
      props: { modelValue: false, title: '关闭态' },
      slots: { default: '<p>隐藏内容</p>' },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).not.toContain('隐藏内容')
    wrapper.unmount()
  })
})
