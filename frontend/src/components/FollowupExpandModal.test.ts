import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import FollowupExpandModal from './FollowupExpandModal.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})
afterEach(() => {
  document.body.innerHTML = ''
})

const today = new Date('2026-06-04T00:00:00')
const relatedNodes = [
  { orgL4: 'A部门', projectId: 'P1', projectName: '甲', projectManager: '张', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-05-01', actualPaymentRatio: 0, projectAmount: 1000000 },
  { orgL4: 'A部门', projectId: 'P2', projectName: '乙', projectManager: '李', isPaymentRelated: true, nodeStatus: '正常实施中', planDate: '2026-06-08', actualPaymentRatio: 0, projectAmount: 500000 },
]

describe('FollowupExpandModal', () => {
  it('打开渲染部门标题/统计/项目行', async () => {
    const w = mount(FollowupExpandModal, {
      props: { modelValue: true, dept: 'A部门', timeWin: '', relatedNodes, today },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('A部门')
    expect(document.body.textContent).toContain('项目列表')
    expect(document.body.textContent).toContain('涉及 2 个项目')
    expect(w.findAllComponents({ name: 'FuProjectRow' }).length).toBe(2)
    w.unmount()
  })

  it('delay 档只含延期项目', async () => {
    const w = mount(FollowupExpandModal, {
      props: { modelValue: true, dept: 'A部门', timeWin: 'delay', relatedNodes, today },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(w.findAllComponents({ name: 'FuProjectRow' }).length).toBe(1)
    w.unmount()
  })
})
