import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DataDrillModal from './DataDrillModal.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

const nodes = [
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张' },
]

describe('DataDrillModal', () => {
  it('打开渲染标题与节点表', async () => {
    const w = mount(DataDrillModal, {
      props: { modelValue: true, title: '100万以上 - 缺少项目金额', nodes },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('缺少项目金额')
    expect(document.body.textContent).toContain('P1')
    expect(w.findComponent({ name: 'DataTable' }).exists()).toBe(true)
    w.unmount()
  })
})
