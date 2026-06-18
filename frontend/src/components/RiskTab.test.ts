import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useDataStore } from '@/stores/data'
import RiskTab from './RiskTab.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [
      { projectId: 'A', projectName: '甲', orgL4: '组1', overspendAmount: 8000,
        payment: { paymentRatio: 0.1 },
        paymentPmis: { contract: 3_000_000, actualTotal: 300_000 } },
      { projectId: 'B', projectName: '乙', orgL4: '组2', overspendAmount: 0,
        payment: { paymentRatio: 0.9 },
        paymentPmis: { contract: 1_000_000, actualTotal: 900_000 } },
    ],
    paymentNodes: { A: [{ stage: '终验', planDate: '2026-05-01', status: '延期', expectedPayment: 100 }] },
    projectPmis: {}, naguanExclude: {},
  } as any
}

describe('RiskTab(PMIS 风险三类)', () => {
  beforeEach(() => { setActivePinia(createPinia()) })
  it('渲染三组标题与命中项', () => {
    seed()
    const w = mount(RiskTab, { props: { dim: 'dept' }, global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('延期节点')
    expect(w.text()).toContain('低回款项目')
    expect(w.text()).toContain('超支项目')
    // el-table 在 JSDOM 不渲染 tbody 行内容，用计数行验证数据已传入
    expect(w.text()).toContain('共 1 条')
  })
  it('空数据不崩', () => {
    const data = useDataStore(); data.data = { projects: [], paymentNodes: {}, projectPmis: {}, naguanExclude: {} } as any
    expect(mount(RiskTab, { props: { dim: 'tier' }, global: { plugins: [ElementPlus] } }).exists()).toBe(true)
  })
})
