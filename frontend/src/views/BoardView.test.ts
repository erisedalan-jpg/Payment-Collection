import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import BoardView from './BoardView.vue'
import { useDataStore } from '@/stores/data'

vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [],
    projects: [
      { projectId: 'P1', projectName: '甲项目', orgL4: '北京', projectManager: '张三',
        payment: { relatedNodeCount: 3, expectedTotal: 1500000, actualTotal: 600000, remainingTotal: 900000, paymentRatio: 0.3, delayedCount: 2 },
        paymentPmis: { contract: 2000000, actualTotal: 600000, expectedTotal: 1500000, delayedCount: 2, nodeCount: 3, reachedCount: 1, fromOrigin: true } },
      { projectId: 'P2', projectName: '乙项目', orgL4: '上海', projectManager: '李四',
        payment: { relatedNodeCount: 1, expectedTotal: 300000, actualTotal: 300000, remainingTotal: 0, paymentRatio: 1, delayedCount: 0 },
        paymentPmis: { contract: 300000, actualTotal: 300000, expectedTotal: 300000, delayedCount: 0, nodeCount: 1, reachedCount: 1, fromOrigin: true } },
    ],
    projectPmis: {
      P1: { progress: { 项目阶段: '实施' }, customer: { 行业: '金融' } },
      P2: { progress: { 项目阶段: '验收' }, customer: { 行业: '政务' } },
    },
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

const opts = { global: { stubs: { BoardDrilldownModal: true } } }

describe('BoardView', () => {
  it('默认单维模式渲染排名行', () => {
    seed()
    const w = mount(BoardView, opts)
    expect(w.findAll('.bv-body').length).toBe(2)
    expect(w.text()).toContain('北京')
    expect(w.text()).toContain('上海')
  })

  it('维度与指标标签按 PMIS 项目级口径渲染', () => {
    seed()
    const w = mount(BoardView, opts)
    // 维度标签（DimPicker/SegToggle）
    expect(w.text()).toContain('部门')
    expect(w.text()).toContain('金额档')
    expect(w.text()).toContain('进度态')
    // 单维排名表指标列标签
    expect(w.text()).toContain('合同总额(万)')
    expect(w.text()).toContain('已回款(万)')
    expect(w.text()).toContain('完成率')
  })

  it('单维点击行打开下钻', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.findAll('.bv-body')[0].trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })

  it('切交叉模式 + 次维度渲染矩阵', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-cross"]').trigger('click')
    const tierBtns = w.findAll('[data-test="seg-tier"]')
    await tierBtns[tierBtns.length - 1].trigger('click')
    expect(w.find('.bm').exists()).toBe(true)
  })

  it('切透视模式默认渲染透视表（行=orgL4）', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-pivot"]').trigger('click')
    expect(w.find('.pv').exists()).toBe(true)
    expect(w.text()).toContain('北京')
  })

  it('透视模式点数据格打开下钻', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-pivot"]').trigger('click')
    await w.find('.pv-cell.pv-click').trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })
})
