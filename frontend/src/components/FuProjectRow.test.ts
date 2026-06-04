import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import FuProjectRow from './FuProjectRow.vue'
import { useFuDataStore } from '@/stores/fuData'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

const project = {
  projectId: 'P1', projectName: '甲项目', projectManager: '张', orgL4: '北京', projectAmount: 1000000,
  projectAmountWan: 100, earliestPlanDate: '2026-06-10', completion: '0.8', nodeStatuses: ['延期', '正常实施中'],
  nodes: [{ nodeName: 'N1', actualPaymentRatio: 0.2, nodeStatus: '延期' }], flw: false,
}

describe('FuProjectRow', () => {
  it('渲染名称/元信息，点击展开节点表', async () => {
    const w = mount(FuProjectRow, { props: { project }, global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('甲项目')
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('¥100万')
    expect(w.findComponent({ name: 'FuNodeTable' }).exists()).toBe(false)
    await w.find('.fpr-btn').trigger('click')
    expect(w.findComponent({ name: 'FuNodeTable' }).exists()).toBe(true)
  })
  it('切换已跟进写入 store', async () => {
    const s = useFuDataStore()
    const w = mount(FuProjectRow, { props: { project }, global: { plugins: [ElementPlus] } })
    ;(w.vm as any).onFlwChange('1')
    expect(s.get('P1').flw).toBe(true)
  })
})
