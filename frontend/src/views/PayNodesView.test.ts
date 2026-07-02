import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useProjectTagsStore } from '@/stores/projectTags'
import PayNodesView from './PayNodesView.vue'
import DataTable from '@/components/DataTable.vue'

function seed() {
  const data = useDataStore()
  data.data = {
    projects: [{ projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1', payment: { paymentRatio: 0.5 }, paymentPmis: { contract: 2_000_000 } }],
    paymentNodes: { A: [
      { stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.7, expectedPayment: 1_400_000, reached: true, status: '已回款' },
      { stage: '终验', planDate: '2026-03-01', actualDate: '', payRatio: 0.3, expectedPayment: 600_000, reached: false, status: '延期' },
    ] },
    projectPmis: { A: { progress: { 项目阶段: '实施' } } },
  } as any
}

const opts = { global: { plugins: [ElementPlus] } }

describe('PayNodesView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    useFilterStore().setPreset('all')
    // projectTags.load 会发真实网络请求（/api/tags），测试环境 mock 掉
    useProjectTagsStore().load = vi.fn().mockResolvedValue(undefined)
  })

  it('渲染节点行 + 5 卡汇总(总数/已回款/延期/待回款/计划回款Σ) + 状态徽章', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    expect(w.text()).toContain('节点总数')
    expect(w.text()).toContain('已回款')
    expect(w.text()).toContain('延期')
    expect(w.text()).toContain('待回款')
    expect(w.text()).toContain('计划回款Σ(万)')
    const dt = w.findComponent(DataTable)
    expect(dt.exists()).toBe(true)
    const rows = dt.props('rows') as Array<Record<string, unknown>>
    expect(rows.length).toBe(2)
    expect(rows.some((r) => r.stage === '到货')).toBe(true)
    expect(rows.some((r) => r.status === '已回款')).toBe(true)
    expect(rows.some((r) => r.status === '延期')).toBe(true)
  })

  it('维度切换与维度分组表已删除', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    expect(w.find('.dim-summary').exists()).toBe(false)
    expect(w.find('[data-test="seg-dept"]').exists()).toBe(false)
    expect(w.text()).not.toContain('部门分组')
    expect(w.find('.pv-ctl').exists()).toBe(false)
  })

  it('主表含「项目经理」「L4组」列', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    const cols = (w.findComponent(DataTable).props('columns') as any[]).map((c) => c.key)
    expect(cols).toContain('projectManager')
    expect(cols).toContain('dept')
    expect(w.text()).toContain('项目经理')
    expect(w.text()).toContain('L4组')
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.find((r) => r.stage === '到货').projectManager).toBe('张三')
    expect(rows.find((r) => r.stage === '到货').dept).toBe('组1')
  })

  it('标签筛选控件存在', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    expect(w.find('[data-test="tag-filter"]').exists()).toBe(true)
  })

  it('导出按钮存在', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    expect(w.find('[data-test="pay-nodes-export"]').exists()).toBe(true)
  })

  it('行点击触发 pd.open', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    const pd = useProjectDetailStore()
    await w.findComponent(DataTable).vm.$emit('row-click', { projectId: 'A' })
    expect(pd.openId).toBe('A')
  })

  it('空数据不崩', async () => {
    const data = useDataStore()
    data.data = { projects: [], paymentNodes: {}, projectPmis: {} } as any
    const w = mount(PayNodesView, opts)
    await flushPromises()
    expect(w.exists()).toBe(true)
  })

  it('分页:节点表只渲染一页,5卡汇总仍按区间全集(不受表格分页/筛选影响)', async () => {
    const data = useDataStore()
    useFilterStore().setPreset('all')
    data.data = {
      projects: [{ projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1', payment: { paymentRatio: 0.5 }, paymentPmis: { contract: 2_000_000 } }],
      paymentNodes: { A: Array.from({ length: 60 }, () => ({
        stage: '到货', planDate: '2026-01-01', actualDate: '2026-01-05', payRatio: 0.1, expectedPayment: 1000, reached: true, status: '已回款',
      })) },
      projectPmis: { A: { progress: { 项目阶段: '实施' } } },
    } as any
    const w = mount(PayNodesView, opts)
    await flushPromises()
    expect((w.findComponent(DataTable).props('rows') as any[]).length).toBe(50)
    expect(w.text()).toContain('节点总数')
    expect(w.text()).toContain('60')   // 节点汇总 sum.total = 全集 60(非 paged 50)
  })
})
