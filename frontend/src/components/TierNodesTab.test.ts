import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useDataStore } from '@/stores/data'
import TierNodesTab from './TierNodesTab.vue'
import DataTable from '@/components/DataTable.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [{ projectId: 'A', projectName: '甲', orgL4: '组1', paymentPmis: { contract: 2_000_000, paymentRatio: 0.5 } }],
    paymentNodes: { A: [
      { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.7, expectedPayment: 1_400_000, reached: true, status: '已达成' },
      { stage: '终验', planDate: '2026-03-01', actualDate: '', payRatio: 0.3, expectedPayment: 600_000, reached: false, status: '延期' },
    ] },
    projectPmis: { A: { progress: { 项目阶段: '实施' } } },
    naguanExclude: {},
  } as any
}

describe('TierNodesTab', () => {
  beforeEach(() => { setActivePinia(createPinia()) })

  it('渲染节点行 + 汇总条(总数/已达成/延期/待达成) + 状态徽章', () => {
    seed()
    const w = mount(TierNodesTab, { props: { dim: 'dept' }, global: { plugins: [ElementPlus] } })
    // 汇总条文字
    expect(w.text()).toContain('节点总数')
    expect(w.text()).toContain('已达成')
    expect(w.text()).toContain('延期')
    // el-table 在 JSDOM 不渲染行内容，改为验证 DataTable rows prop 含节点数据
    const dt = w.findComponent(DataTable)
    expect(dt.exists()).toBe(true)
    const rows = dt.props('rows') as Array<Record<string, unknown>>
    expect(rows.length).toBe(2)
    expect(rows.some((r) => r.stage === '到货')).toBe(true)
    expect(rows.some((r) => r.status === '已达成')).toBe(true)
    expect(rows.some((r) => r.status === '延期')).toBe(true)
  })

  it('空数据不崩', () => {
    const data = useDataStore()
    data.data = { projects: [], paymentNodes: {}, projectPmis: {}, naguanExclude: {} } as any
    expect(mount(TierNodesTab, { props: { dim: 'tier' }, global: { plugins: [ElementPlus] } }).exists()).toBe(true)
  })
})
