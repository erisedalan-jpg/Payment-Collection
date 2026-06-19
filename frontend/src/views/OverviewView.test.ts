import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import OverviewView from './OverviewView.vue'
import { useDataStore } from '@/stores/data'

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
    meta: {}, dashboard: {}, summary: {}, projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
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
  it('KPI 条六指标', async () => {
    seed()
    const w = await mountView()
    expect(w.text()).toContain('在管项目')
    expect(w.find('.ov-kpis').text()).toContain('2')   // 在管
    expect(w.text()).toContain('回款达成率')
    expect(w.text()).toContain('60%')                   // 600/1000 fmtRatio
  })

  it('KPI 六卡均带跳转(用户反馈)', async () => {
    seed()
    const w = await mountView()
    const kpis = w.find('.ov-kpis')
    expect(kpis.findAll('a')).toHaveLength(6)
    expect(kpis.find('a[href="/projects"]').exists()).toBe(true)
    expect(kpis.find('a[href="/projects?paused=yes"]').exists()).toBe(true)
    expect(kpis.find('a[href="/payment"]').exists()).toBe(true)   // 回款达成率
  })

  it('健康度总览:三档计数+四维+风险卡点击跳详情', async () => {
    seed()
    const w = await mountView()
    const push = vi.spyOn(router, 'push')
    expect(w.text()).toContain('进度异常')
    const card = w.find('.ov-risk-card')
    expect(card.text()).toContain('风险甲')
    await card.trigger('click')
    expect(push).toHaveBeenCalledWith('/project/P-1')
  })

  it('回款重点带:年度进度/本月待回/7天临期/延期Top', async () => {
    seed()
    const w = await mountView()
    expect(w.text()).toContain('年度回款进度')
    expect(w.text()).toContain('本月待回款')
    expect(w.find('.ov-pay').text()).toContain('50')   // 本月待回 50 万(30+20)
    expect(w.text()).toContain('7 天临期')
    expect(w.text()).toContain('延期 Top')
    expect(w.find('.ov-top-item').text()).toContain('30') // 延期款待回 30 万
  })

  it('风险焦点行链接带筛选 query', async () => {
    seed()
    const w = await mountView()
    expect(w.find('a[href="/projects?riskLevel=%E9%AB%98"]').exists() || w.find('a[href="/projects?riskLevel=高"]').exists()).toBe(true)
    expect(w.find('a[href="/projects?paused=yes"]').exists()).toBe(true)
    expect(w.find('a[href="/projects?overspend=yes"]').exists()).toBe(true)
  })

  it('右栏动态最多 10 条 + 查看全部链接', async () => {
    seed()
    const w = await mountView()
    expect(w.findAll('.ev-item')).toHaveLength(10)
    expect(w.find('a[href="/activity"]').exists()).toBe(true)
  })

  it('无数据空态不崩(零项目零事件)', async () => {
    const ds = useDataStore()
    ds.data = { meta: {}, dashboard: {}, summary: {}, projectOverview: { projects: [], columns: [] }, naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {}, projects: [], projectPmis: {}, rawNodes: [], events: [] } as any
    const w = await mountView()
    expect(w.text()).toContain('首次同步，暂无变化记录')
    expect(w.text()).toContain('在管项目')
  })
})
