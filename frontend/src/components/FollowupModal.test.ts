import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import FollowupModal from './FollowupModal.vue'
import Modal from './Modal.vue'

describe('FollowupModal', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('开启时标题含项目名 + 内嵌 FollowupRecords', () => {
    const w = mount(FollowupModal, {
      props: { modelValue: true, projectId: 'P1', projectName: '甲' },
      global: {
        plugins: [ElementPlus],
        stubs: {
          // stub Modal 使 slot 内容直接渲染到组件树，可查找内部元素
          Modal: {
            name: 'Modal',
            props: ['modelValue', 'title', 'width'],
            template: '<div><slot /></div>',
          },
          FollowupRecords: true,
        },
      },
    })
    // 验证 Modal 的 title prop 含项目名
    const modal = w.findComponent(Modal)
    expect(modal.props('title')).toContain('甲')
    // 验证 FollowupRecords stub 占位元素存在
    expect(w.find('followup-records-stub').exists()).toBe(true)
  })
})
