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
import { ALL_PAGE_LINKS } from '@/nav'

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

  it('渲染页头标题(与 nav.ts 的 label 逐字一致)', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    // 与 nav.ts 比对而非各写各的字面量:否则会出现「侧栏叫回款节点、页头叫节点清单」
    expect(w.find('.ph-title').text()).toBe(ALL_PAGE_LINKS.find((l) => l.to === '/payment/nodes')!.label)
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

  it('导出按钮改用 AppButton,仍在页头 #actions 内且 data-test 原样保留', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    const btn = w.find('.ph-actions [data-test="pay-nodes-export"]')
    expect(btn.exists()).toBe(true)
    expect(btn.classes()).toContain('ab')
  })

  it('分页条改用 AppPager,「共 N 条」保留', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    expect(w.find('.ap').exists()).toBe(true)
    expect(w.find('.ap-total').text()).toContain('共 2 条')
  })

  it('5 卡汇总改用 AppCard(flat),布局属性仍留在 .ns', async () => {
    seed()
    const w = mount(PayNodesView, opts)
    await flushPromises()
    const cards = w.findAll('.ns')
    expect(cards).toHaveLength(5)
    expect(cards.every((c) => c.classes().includes('ac--flat'))).toBe(true)
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
