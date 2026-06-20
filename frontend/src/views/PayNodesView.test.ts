import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import PayNodesView from './PayNodesView.vue'
import DataTable from '@/components/DataTable.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [{ projectId: 'A', projectName: '甲', orgL4: '组1', payment: { paymentRatio: 0.5 }, paymentPmis: { contract: 2_000_000 } }],
    paymentNodes: { A: [
      { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.7, expectedPayment: 1_400_000, reached: true, status: '已回款' },
      { stage: '终验', planDate: '2026-03-01', actualDate: '', payRatio: 0.3, expectedPayment: 600_000, reached: false, status: '延期' },
    ] },
    projectPmis: { A: { progress: { 项目阶段: '实施' } } },
    naguanExclude: {},
  } as any
}

describe('PayNodesView', () => {
  beforeEach(() => { setActivePinia(createPinia()); useFilterStore().setPreset('all') })

  it('渲染节点行 + 汇总条(总数/已回款/延期/待回款) + 状态徽章', () => {
    seed()
    const w = mount(PayNodesView, { global: { plugins: [ElementPlus] } })
    expect(w.text()).toContain('节点总数')
    expect(w.text()).toContain('已回款')
    expect(w.text()).toContain('延期')
    const dt = w.findComponent(DataTable)
    expect(dt.exists()).toBe(true)
    const rows = dt.props('rows') as Array<Record<string, unknown>>
    expect(rows.length).toBe(2)
    expect(rows.some((r) => r.stage === '到货')).toBe(true)
    expect(rows.some((r) => r.status === '已回款')).toBe(true)
    expect(rows.some((r) => r.status === '延期')).toBe(true)
  })

  it('内置维度控件(SegToggle)存在，默认 dept 出部门分组与组值', () => {
    seed()
    const w = mount(PayNodesView, { global: { plugins: [ElementPlus] } })
    expect(w.find('[data-test="seg-dept"]').exists()).toBe(true)
    expect(w.text()).toContain('部门分组')
    expect(w.text()).toContain('组1')
  })

  it('空数据不崩', () => {
    const data = useDataStore()
    data.data = { projects: [], paymentNodes: {}, projectPmis: {}, naguanExclude: {} } as any
    expect(mount(PayNodesView, { global: { plugins: [ElementPlus] } }).exists()).toBe(true)
  })

  it('分页:节点表只渲染一页,汇总仍按全集', async () => {
    const data = useDataStore(); useFilterStore().setPreset('all')
    data.data = {
      projects: [{ projectId: 'A', projectName: '甲', orgL4: '组1', payment: { paymentRatio: 0.5 }, paymentPmis: { contract: 2_000_000 } }],
      paymentNodes: { A: Array.from({ length: 60 }, () => ({
        stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.1, expectedPayment: 1000, reached: true, status: '已回款',
      })) },
      projectPmis: { A: { progress: { 项目阶段: '实施' } } },
      naguanExclude: {},
    } as any
    const w = mount(PayNodesView, { global: { plugins: [ElementPlus] } })
    expect((w.findComponent(DataTable).props('rows') as any[]).length).toBe(50)
    expect(w.text()).toContain('节点总数')
    expect(w.text()).toContain('60')   // 节点汇总 sum.total = 全集 60(非 paged 50);防回归到 nodeSummary(paged)
  })
})
