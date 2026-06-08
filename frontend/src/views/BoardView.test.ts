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
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', orgL4: '北京', orgL3: '华北', projectManager: '张三', projectType: '集成', signUnit: '甲', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-01' },
      { projectId: 'P2', tier: '50万以下', orgL4: '上海', orgL3: '华东', projectManager: '李四', projectType: '运维', signUnit: '乙', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 300000, actualPayment: 300000, planMonth: '2026-02' },
    ],
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
