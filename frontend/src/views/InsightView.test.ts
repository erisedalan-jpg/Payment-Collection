import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import InsightView from './InsightView.vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { NO_TAG_VALUE } from '@/lib/tagFilter'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  // projectTags.load 会发真实网络请求（/api/tags），测试环境 mock 掉
  useProjectTagsStore().load = vi.fn().mockResolvedValue(undefined)
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/insight', component: InsightView },
      { path: '/project/:id', component: { template: '<div />' } },
    ],
  })
})

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [],
    displayColumns: {}, followupRecords: {}, events: [],
    projects: [
      { projectId: 'P-1', projectName: '甲', projectManager: '何平', orgL4: '交付一组',
        payment: { relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 600, remainingTotal: 400, paymentRatio: 0.6, delayedCount: 1 },
        deliveryCosts: [], health: { overall: '风险' } },
      { projectId: 'P-2', projectName: '乙', projectManager: '何平', orgL4: '交付二组',
        payment: { relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 1000, remainingTotal: 0, paymentRatio: 1, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '健康' } },
      { projectId: 'P-3', projectName: '丙', projectManager: '李四', orgL4: '交付一组',
        payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 },
        deliveryCosts: [], health: { overall: '健康' } },
    ],
    projectPmis: {
      'P-1': { progress: { 项目阶段: '项目执行', 完工进展: 0.2 }, status: { 项目状态: '实施中' }, risk: { 最高等级: '高' }, cost: { 消耗比: 0.5 }, customer: { 行业: '银行', 合同总额: 2000000 } },
      'P-2': { progress: { 项目阶段: '项目收尾', 完工进展: 0.8 }, status: { 项目状态: '已验收' }, risk: {}, cost: {}, customer: { 行业: '银行', 合同总额: 1000000 } },
    },
  } as any
}

async function mountView() {
  await router.push('/insight')
  await router.isReady()
  const w = mount(InsightView, { global: { plugins: [ElementPlus, router], stubs: { ChartBox: true } } })
  await flushPromises()
  return w
}

describe('InsightView', () => {
  it('默认排名模式:维度/指标切换条 + 排名表(健康度维度计数)', async () => {
    seed()
    const w = await mountView()
    expect(w.find('[data-test="seg-rank"]').exists()).toBe(true)
    await w.find('[data-test="seg-health"]').trigger('click')
    expect(w.text()).toContain('健康')
    expect(w.text()).toContain('共 2 条')   // 健康/风险 两组
  })

  it('排名表行点击开下钻弹窗,项目行点击跳详情', async () => {
    seed()
    const w = await mountView()
    await w.find('[data-test="seg-health"]').trigger('click')
    const firstRow = w.find('.el-table__row')
    await firstRow.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('个项目')   // 弹窗标题
  })

  it('交叉模式:次维 SegToggle 点选后真实渲染矩阵(P5.5)', async () => {
    seed()
    const w = await mountView()
    await w.find('[data-test="seg-cross"]').trigger('click')
    const healthBtns = w.findAll('[data-test="seg-health"]')
    await healthBtns[healthBtns.length - 1].trigger('click')   // 次维 SegToggle 的健康度
    await flushPromises()
    expect(w.findComponent({ name: 'BoardMatrix' }).exists()).toBe(true)
    expect(w.text()).toContain('风险')   // 矩阵行头含健康度取值
  })

  it('透视模式:行维选择后渲染 PivotTable', async () => {
    seed()
    const w = await mountView()
    await w.find('[data-test="seg-pivot"]').trigger('click')
    await flushPromises()
    expect(w.findComponent({ name: 'PivotTable' }).exists()).toBe(true)  // 默认行维 stage
  })

  it('标签筛选:控件存在,选中标签后排名分组随之收窄(整页联动,含无标签)', async () => {
    seed()
    const tags = useProjectTagsStore()
    tags.assignments = { 'P-1': ['重点'] }   // P-2/P-3 无标签
    const w = await mountView()
    expect(w.find('[data-test="tag-filter"]').exists()).toBe(true)

    await w.find('[data-test="seg-health"]').trigger('click')
    expect(w.text()).toContain('共 2 条')   // 未筛选:风险(P-1)+健康(P-2,P-3) 两组

    ;(w.vm as any).selectedTags = ['重点']
    await flushPromises()
    expect(w.text()).toContain('共 1 条')   // 只剩 P-1(风险) 一组

    ;(w.vm as any).selectedTags = [NO_TAG_VALUE]
    await flushPromises()
    expect(w.text()).toContain('共 1 条')   // 只剩 P-2/P-3(均健康) 一组,不含 P-1
    const groupRows = w.findAll('.el-table__row')
    expect(groupRows).toHaveLength(1)
    expect(groupRows[0].text()).toContain('健康')
  })

  it('空项目空态', async () => {
    const ds = useDataStore()
    ds.data = { meta: {}, dashboard: {}, summary: {}, rawNodes: [], displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {}, events: [] } as any
    const w = await mountView()
    expect(w.text()).toContain('暂无项目主域数据')
  })
})
