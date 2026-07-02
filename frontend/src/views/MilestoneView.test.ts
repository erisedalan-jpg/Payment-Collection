import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MilestoneView from './MilestoneView.vue'
import ChartBox from '@/charts/ChartBox.vue'
import MetricGrid from '@/components/MetricGrid.vue'
import MilestoneDrillModal from '@/components/MilestoneDrillModal.vue'
import MilestoneStatusModal from '@/components/MilestoneStatusModal.vue'
import SegToggle from '@/components/SegToggle.vue'
import MilestoneDelayedTab from '@/components/MilestoneDelayedTab.vue'
import MilestoneReminderTab from '@/components/MilestoneReminderTab.vue'
import MilestonePlanTab from '@/components/MilestonePlanTab.vue'
import { useDataStore } from '@/stores/data'
import { NO_TAG_VALUE } from '@/lib/tagFilter'
import { useFilterStore } from '@/stores/filter'
import { useProjectTagsStore } from '@/stores/projectTags'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/projectTagsApi', () => ({
  getTags: vi.fn(async () => ({ tags: [], assignments: {} })),
  saveTags: vi.fn(async () => ({ success: true })),
}))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    followupRecords: {},
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

describe('MilestoneView 终验/节点分布', () => {
  it('渲染 6 个 ChartBox(含 B 双图 + E)', () => {
    seed()
    const w = mount(MilestoneView, opts)
    // A + C + D + B(项目数) + B(金额) + E = 6
    expect(w.findAllComponents(ChartBox).length).toBe(6)
  })
  it('终验图季/月 SegToggle 可切换', async () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect(w.find('[data-test="seg-month"]').exists()).toBe(true)
    await w.get('[data-test="seg-month"]').trigger('click')
    expect((w.vm as any).faGran).toBe('month')
  })
  it('节点分布图点击数据点开下钻 modal', async () => {
    seed()
    const w = mount(MilestoneView, opts)
    ;(w.vm as any).onNodeClick({ seriesName: '到货(关联回款)', dataIndex: 2 })
    await w.vm.$nextTick()
    expect(w.findComponent(MilestoneDrillModal).props('modelValue')).toBe(true)
    expect(w.findComponent(MilestoneDrillModal).props('rows').length).toBeGreaterThanOrEqual(1)
  })
  it('节点分布年份默认当年/最新可用年(seed 仅 2026)', () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect((w.vm as any).nodeYear).toBe(2026)
  })
})

describe('MilestoneView 明细 tab', () => {
  it('默认显延期清单 tab;切换到到期提醒/在建计划', async () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect(w.findComponent(MilestoneDelayedTab).exists()).toBe(true)
    expect(w.findComponent(MilestoneReminderTab).exists()).toBe(false)
    await w.get('[data-test="seg-reminder"]').trigger('click')
    expect(w.findComponent(MilestoneReminderTab).exists()).toBe(true)
    await w.get('[data-test="seg-plan"]').trigger('click')
    expect(w.findComponent(MilestonePlanTab).exists()).toBe(true)
  })
})

describe('MilestoneView 标签筛选(仅三表)', () => {
  it('三表区域存在标签筛选控件', () => {
    seed()
    const w = mount(MilestoneView, opts)
    expect(w.find('[data-test="tag-filter"]').exists()).toBe(true)
  })
  it('选标签后 mpsFiltered 收窄；mps/kpi 不变', async () => {
    seed()
    const tags = useProjectTagsStore()
    tags.load = vi.fn().mockResolvedValue(undefined) // 避免真实 load() 异步覆盖下面手设的 assignments
    tags.assignments = { A: ['重点'] }
    const w = mount(MilestoneView, opts)
    expect((w.vm as any).mps.length).toBe(2)
    ;(w.vm as any).selectedTags = ['重点']
    await w.vm.$nextTick()
    expect((w.vm as any).mpsFiltered.length).toBe(1)
    expect((w.vm as any).mpsFiltered[0].projectId).toBe('A')
    // KPI/mps 不受三表标签筛选影响
    expect((w.vm as any).mps.length).toBe(2)
    expect(w.findComponent(MetricGrid).props('items').find((i: any) => i.k === '项目总数')?.v).toBe('2')
  })
  it('“无标签”选项匹配未打标签的项目', async () => {
    seed()
    const tags = useProjectTagsStore()
    tags.load = vi.fn().mockResolvedValue(undefined)
    tags.assignments = { A: ['重点'] }
    const w = mount(MilestoneView, opts)
    ;(w.vm as any).selectedTags = [NO_TAG_VALUE]
    await w.vm.$nextTick()
    expect((w.vm as any).mpsFiltered.length).toBe(1)
    expect((w.vm as any).mpsFiltered[0].projectId).toBe('B')
  })
  it('选择后传给三表组件的 projects 收窄，切到其余两 tab 同样生效', async () => {
    seed()
    const tags = useProjectTagsStore()
    tags.load = vi.fn().mockResolvedValue(undefined)
    tags.assignments = { A: ['重点'] }
    const w = mount(MilestoneView, opts)
    ;(w.vm as any).selectedTags = ['重点']
    await w.vm.$nextTick()
    expect(w.findComponent(MilestoneDelayedTab).props('projects').length).toBe(1)
    await w.get('[data-test="seg-reminder"]').trigger('click')
    expect(w.findComponent(MilestoneReminderTab).props('projects').length).toBe(1)
    await w.get('[data-test="seg-plan"]').trigger('click')
    expect(w.findComponent(MilestonePlanTab).props('projects').length).toBe(1)
  })
})

describe('MilestoneView KPI 下钻弹窗', () => {
  it('点 KPI(严重延期)开状态弹窗,rows 仅严重延期项目', async () => {
    seed()
    const w = mount(MilestoneView, opts)
    w.findComponent(MetricGrid).vm.$emit('item-click', 3)
    await w.vm.$nextTick()
    const modal = w.findComponent(MilestoneStatusModal)
    expect(modal.props('modelValue')).toBe(true)
    const mrows = modal.props('rows') as any[]
    expect(mrows.length).toBe(1)
    expect(mrows.every((r) => r.status === '严重延期')).toBe(true)
  })
})
