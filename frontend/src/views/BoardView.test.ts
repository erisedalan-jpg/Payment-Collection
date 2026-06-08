import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import BoardView from './BoardView.vue'
import { useDataStore } from '@/stores/data'

// BoardView 用组合式 useRoute()，需 mock vue-router（global.mocks.$route 仅作用于选项式）
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', orgL4: '北京', orgL3: '华北', projectManager: '张三', projectType: '集成', signUnit: '甲', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-01' },
      { projectId: 'P2', tier: '50万以下', orgL4: '上海', orgL3: '华东', projectManager: '李四', projectType: '运维', signUnit: '乙', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 300000, actualPayment: 300000, planMonth: '2026-02' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('BoardView', () => {
  it('默认按服务组渲染排名行', () => {
    seed()
    const w = mount(BoardView, { global: { stubs: { BoardDrilldownModal: true } } })
    const rows = w.findAll('.bv-body')
    expect(rows.length).toBe(2)
    expect(w.text()).toContain('北京')
    expect(w.text()).toContain('上海')
  })

  it('切换维度到项目经理后重算分组', async () => {
    seed()
    const w = mount(BoardView, { global: { stubs: { BoardDrilldownModal: true } } })
    await w.get('[data-test="seg-projectManager"]').trigger('click')
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('李四')
  })

  it('点击行打开下钻弹窗', async () => {
    seed()
    const w = mount(BoardView, { global: { stubs: { BoardDrilldownModal: true } } })
    await w.findAll('.bv-body')[0].trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })

  it('选择次维度进入交叉模式并渲染矩阵', async () => {
    seed()
    const w = mount(BoardView, { global: { stubs: { BoardDrilldownModal: true } } })
    // seg-tier 在「维度」与「次维度」两组都存在，取最后一个=次维度
    const tierBtns = w.findAll('[data-test="seg-tier"]')
    await tierBtns[tierBtns.length - 1].trigger('click')
    expect(w.find('.bm').exists()).toBe(true)
    expect(w.text()).toContain('北京')
    expect(w.text()).toContain('100万以上')
  })

  it('交叉模式点击数据格打开下钻', async () => {
    seed()
    const w = mount(BoardView, { global: { stubs: { BoardDrilldownModal: true } } })
    const tierBtns = w.findAll('[data-test="seg-tier"]')
    await tierBtns[tierBtns.length - 1].trigger('click')
    await w.find('.bm-cell.bm-click').trigger('click')
    expect((w.vm as any).drillOpen).toBe(true)
  })
})
