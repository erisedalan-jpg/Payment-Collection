import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import PayProjectsView from './PayProjectsView.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { useProjectDetailStore } from '@/stores/projectDetail'
import { useProjectTagsStore } from '@/stores/projectTags'
import DataTable from '@/components/DataTable.vue'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  // projectTags.load 会发真实网络请求（/api/tags），测试环境 mock 掉
  useProjectTagsStore().load = vi.fn().mockResolvedValue(undefined)
})

function seed() {
  const data = useDataStore()
  useFilterStore().setPreset('all')
  data.data = {
    meta: { lastUpdate: 'x', totalProjects: 1, totalPaymentNodes: 3 },
    dashboard: {}, summary: {}, rawNodes: [],
    projects: [
      {
        projectId: 'A', projectName: '甲', projectManager: '张三', orgL4: '组1',
        paymentPmis: {
          contract: 2_000_000, actualTotal: 1_000_000, paymentRatio: 0.5,
          expectedTotal: 1_500_000, nodeCount: 3, reachedCount: 1, delayedCount: 1, fromOrigin: false,
        },
      },
    ] as any,
    projectPmis: { A: { status: { 项目级别: 'P1' }, progress: { 项目阶段: '实施' } } } as any,
  } as any
}

const opts = { global: { plugins: [ElementPlus] } }

describe('PayProjectsView', () => {
  it('渲染项目明细行，部门汇总不再出现', async () => {
    seed()
    const w = mount(PayProjectsView, opts)
    await flushPromises()
    // 明细表仍渲染
    expect(w.text()).toContain('甲')
    // 部门汇总 section 已移除
    expect(w.text()).not.toContain('部门汇总')
    expect(w.find('section.dim-summary').exists()).toBe(false)
  })

  it('明细表含预期列头，无「来源」列，含「项目级别」列', async () => {
    seed()
    const w = mount(PayProjectsView, opts)
    await flushPromises()
    expect(w.text()).toContain('项目编号')
    expect(w.text()).toContain('完成率')
    expect(w.text()).toContain('项目级别')
    expect(w.text()).not.toContain('来源')
    const cols = (w.findComponent(DataTable).props('columns') as any[]).map((c) => c.key)
    expect(cols).not.toContain('fromOrigin')
    expect(cols).toContain('projectLevel')
  })

  it('项目级别列取值正确', async () => {
    seed()
    const w = mount(PayProjectsView, opts)
    await flushPromises()
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.find((r) => r.projectId === 'A').projectLevel).toBe('P1')
  })

  it('标签筛选控件存在', async () => {
    seed()
    const w = mount(PayProjectsView, opts)
    await flushPromises()
    expect(w.find('[data-test="tag-filter"]').exists()).toBe(true)
  })

  it('导出按钮存在', async () => {
    seed()
    const w = mount(PayProjectsView, opts)
    await flushPromises()
    expect(w.find('[data-test="pay-projects-export"]').exists()).toBe(true)
  })

  it('行点击触发 pd.open', async () => {
    seed()
    const w = mount(PayProjectsView, opts)
    await flushPromises()
    const pd = useProjectDetailStore()
    await w.findComponent(DataTable).vm.$emit('row-click', { projectId: 'A' })
    expect(pd.openId).toBe('A')
  })

  it('空数据不崩', async () => {
    const data = useDataStore()
    useFilterStore().setPreset('all')
    data.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
      dashboard: {}, summary: {}, rawNodes: [],
      projects: [], projectPmis: {},
    } as any
    const w = mount(PayProjectsView, opts)
    await flushPromises()
    expect(w.exists()).toBe(true)
    expect(w.text()).not.toContain('部门汇总')
  })

  it('分页:超过页大小只渲染一页,分页条 total=全量', async () => {
    const data = useDataStore(); useFilterStore().setPreset('all')
    data.data = {
      meta: { lastUpdate: 'x', totalProjects: 60, totalPaymentNodes: 0 },
      dashboard: {}, summary: {}, rawNodes: [],
      projects: Array.from({ length: 60 }, (_, i) => ({
        projectId: 'P' + i, projectName: '名' + i, projectManager: '张', orgL4: '组1',
        paymentPmis: { contract: 100, actualTotal: 50, paymentRatio: 0.5, nodeCount: 0, reachedCount: 0, delayedCount: 0 },
      })),
      projectPmis: {},
    } as any
    const w = mount(PayProjectsView, opts)
    await flushPromises()
    expect((w.findComponent(DataTable).props('rows') as any[]).length).toBe(50)
  })
})
