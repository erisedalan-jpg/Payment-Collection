import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PmDrilldownModal from './PmDrilldownModal.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

const projects = [{ projectId: 'P1', projectName: '甲', tier: '100万以上', projectAmount: 1000000, paymentStatus: '延期', paymentRatio: 0.5 }]
const delayedNodes = [{ projectId: 'P1', projectName: '甲', tier: '100万以上', milestone: 'M1', planDate: '2026-06-06', expectedPayment: 200000, actualPaymentRatio: 0.25, delayDays: 10, nodeStatus: '延期' }]

describe('PmDrilldownModal', () => {
  it('打开时渲染标题与两表', async () => {
    const w = mount(PmDrilldownModal, {
      props: { modelValue: true, pmName: '张', projects, delayedNodes },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('张 - 项目经理详情')
    expect(document.body.textContent).toContain('负责项目信息')
    expect(document.body.textContent).toContain('延期节点信息')
    expect(w.findAllComponents({ name: 'DataTable' }).length).toBe(2)
    w.unmount()
  })
})
