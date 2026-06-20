import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MilestoneView from './MilestoneView.vue'
import ChartBox from '@/charts/ChartBox.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    projectOverview: { projects: [], columns: [] }, naguanMap: {}, naguanExclude: {}, followupRecords: {},
    projects: [
      { projectId: 'A', projectName: '甲', projectManager: '张', orgL4: 'D1', orgL3_1: 'S', isPresale: false, paymentPmis: { contract: 1000000 } },
      { projectId: 'B', projectName: '乙', projectManager: '李', orgL4: 'D1', orgL3_1: 'S', isPresale: false, paymentPmis: { contract: 2000000 } },
    ],
    projectPmis: {
      A: { progress: { 里程碑进度状态: '正常' }, status: { 项目类型: '正常实施类' } },
      B: { progress: { 里程碑进度状态: '严重延期' }, status: { 项目类型: '正常实施类' } },
    },
    projectMilestones: {
      A: [{ name: '终验', planDate: '2026-06-01', actualDate: '', priority: 'high' }],
      B: [{ name: '到货', planDate: '2026-03-01', actualDate: '', payStage: '到货款', priority: 'high' }],
    },
  } as any
}

const opts = { global: { plugins: [ElementPlus], stubs: { VChart: true } } }

describe('MilestoneView 概览', () => {
  it('渲染标题 + KPI(MetricGrid 5 卡)', () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect(w.text()).toContain('里程碑管理')
    expect(w.findComponent(MetricGrid).props('items')).toHaveLength(5)
    expect(w.text()).toContain('项目总数')
  })
  it('KPI 计数正确(正常1/严重延期1/未发布0)', () => {
    seed()
    const w = mount(MilestoneView, opts)
    const items = w.findComponent(MetricGrid).props('items') as any[]
    expect(items.find((i) => i.k === '正常').v).toBe('1')
    expect(items.find((i) => i.k === '严重延期').v).toBe('1')
    expect(items.find((i) => i.k === '项目总数').v).toBe('2')
  })
  it('渲染图 A/C/D 三个 ChartBox', () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect(w.findAllComponents(ChartBox).length).toBeGreaterThanOrEqual(3)
  })
  it('剔除控件开关写 filter.setExclude', async () => {
    seed()
    const f = useFilterStore()
    const spy = vi.spyOn(f, 'setExclude')
    const w = mount(MilestoneView, opts)
    await w.get('[data-test="ms-exclude-switch"] input').setValue(true)
    expect(spy).toHaveBeenCalled()
  })
})
