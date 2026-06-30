import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import OverviewView from './OverviewView.vue'
import { useDataStore } from '@/stores/data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { useFilterStore } from '@/stores/filter'

let router: Router
beforeEach(() => {
  setActivePinia(createPinia())
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: OverviewView },
      { path: '/projects', component: { template: '<div />' } },
      { path: '/project/:id', component: { template: '<div />' } },
      { path: '/payment', component: { template: '<div />' } },
      { path: '/activity', component: { template: '<div />' } },
    ],
  })
})

// 节点日期用运行时 now 动态构造,避免日历脆弱(设计决策 6)
const now = new Date()
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inDays = (n: number) => iso(new Date(now.getTime() + n * 86400000))

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: {}, dashboard: {}, summary: {},
    displayColumns: {}, followupRecords: {},
    projects: [
      { projectId: 'P-1', projectName: '风险甲', orgL4: 'A组', payment: { relatedNodeCount: 1, expectedTotal: 1000, actualTotal: 600, remainingTotal: 400, paymentRatio: 0.6, delayedCount: 1 }, deliveryCosts: [],
        paymentPmis: { contract: 1000 },
        health: { progressAbnormal: true, riskAbnormal: true, costAbnormal: false, paymentAbnormal: true, overall: '风险' } },
      { projectId: 'P-2', projectName: '健康乙', orgL4: 'B组', payment: { relatedNodeCount: 0, expectedTotal: 0, actualTotal: 0, remainingTotal: 0, paymentRatio: null, delayedCount: 0 }, deliveryCosts: [],
        paymentPmis: { contract: 0 },
        health: { overall: '健康' } },
    ],
    projectPmis: {
      'P-1': { status: { 项目状态: '实施中', 是否暂停: false }, cost: { 超支: true } },
      'P-2': { status: { 项目状态: '实施中', 是否暂停: true }, cost: {} },
    },
    rawNodes: [],
    // 回款重点带换收款阶段口径(3E-2):band 取 paymentNodeRows(paymentNodes,projects)。当月节点用本月固定日避免跨月脆弱
    paymentNodes: {
      'P-1': [
        { stage: '延期款', planDate: `${iso(now).slice(0, 7)}-15`, actualDate: '', payRatio: null, actualRatio: null,
          expectedPayment: 300000, receivedAmount: 0, unpaidAmount: 300000, status: '延期' },
        { stage: '临期款', planDate: `${iso(now).slice(0, 7)}-15`, actualDate: '', payRatio: null, actualRatio: null,
          expectedPayment: 200000, receivedAmount: 0, unpaidAmount: 200000, status: '待回款' },
      ],
    },
    events: Array.from({ length: 12 }, (_, i) => ({
      date: iso(now), type: '到账', domain: 'payment', projectId: 'P-1', projectName: '风险甲', summary: `事件${i}`,
    })),
  } as any
}

async function mountView() {
  await router.push('/')
  await router.isReady()
  const w = mount(OverviewView, { global: { plugins: [router] } })
  await flushPromises()
  return w
}

describe('OverviewView', () => {
  it('体检带:在管/进行中/暂停 + 健康分段条 + 回款达成率环', async () => {
    seed()
    const w = await mountView()
    expect(w.find('.ov-band').text()).toContain('在管')
    expect(w.find('.ov-band').text()).toContain('回款达成率')
    expect(w.find('.ratio-ring-val').text()).toBe('60%')   // 600/1000
    expect(w.find('.hsb').exists()).toBe(true)
  })

  it('体检带回款三数:年度进度/本月待回/7天临期,均链 /payment', async () => {
    seed()
    const w = await mountView()
    const band = w.find('.ov-band-pay')
    expect(band.text()).toContain('年度回款进度')
    expect(band.text()).toContain('本月待回款')
    expect(band.text()).toContain('50')   // 本月待回 30+20=50 万
    expect(band.text()).toContain('7 天临期')
    expect(band.findAll('a').every((a) => a.attributes('href') === '/payment')).toBe(true)
  })

  it('健康段链接带 health query', async () => {
    seed()
    const w = await mountView()
    expect(
      w.find('a[href="/projects?health=%E9%A3%8E%E9%99%A9"]').exists()
      || w.find('a[href="/projects?health=风险"]').exists(),
    ).toBe(true)
  })

  it('异常分诊区有标题;旧冗余元素已移除', async () => {
    seed()
    const w = await mountView()
    expect(w.text()).toContain('需要处理的异常')
    expect(w.find('.ov-kpis').exists()).toBe(false)
    expect(w.find('.ov-focus').exists()).toBe(false)
    expect(w.text()).not.toContain('进度异常')
    expect(w.text()).not.toContain('健康度低')
  })

  it('右栏动态最多 10 条 + 查看全部链接', async () => {
    seed()
    const w = await mountView()
    expect(w.findAll('.ev-item')).toHaveLength(10)
    expect(w.find('a[href="/activity"]').exists()).toBe(true)
  })

  it('无数据空态不崩(零项目零事件)', async () => {
    const ds = useDataStore()
    ds.data = { meta: {}, dashboard: {}, summary: {}, displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {}, rawNodes: [], events: [] } as any
    const w = await mountView()
    expect(w.text()).toContain('首次同步，暂无变化记录')
    expect(w.find('.ov-band').text()).toContain('在管')
  })
})

describe('OverviewView 标签排除', () => {
  function seedSmall() {
    const data = useDataStore()
    ;(data as any).data = {
      projects: [
        { projectId: 'P1', projectName: '甲', orgL4: '一组', health: { overall: '健康' } },
        { projectId: 'P2', projectName: '乙', orgL4: '一组', health: { overall: '健康' } },
      ],
      projectPmis: {}, paymentNodes: {}, paymentRecords: [], events: [],
    }
  }

  it('开启排除后被排除项目不进 baseProjects', async () => {
    seedSmall()
    const tags = useProjectTagsStore(); tags.assignments = { P2: ['排除标签'] } as any
    const filter = useFilterStore(); filter.setExclude(true, ['排除标签'])
    await router.push('/'); await router.isReady()
    const w = mount(OverviewView, { global: { plugins: [router] } })
    await flushPromises()
    const base = (w.vm as any).baseProjects as { projectId: string }[]
    expect(base.map((p) => p.projectId)).toEqual(['P1'])
  })

  it('关闭排除时回到全量', async () => {
    seedSmall()
    const tags = useProjectTagsStore(); tags.assignments = { P2: ['排除标签'] } as any
    const filter = useFilterStore(); filter.setExclude(false, ['排除标签'])
    await router.push('/'); await router.isReady()
    const w = mount(OverviewView, { global: { plugins: [router] } })
    await flushPromises()
    expect(((w.vm as any).baseProjects as any[]).map((p) => p.projectId)).toEqual(['P1', 'P2'])
  })
})
