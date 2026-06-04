import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import TierView from './TierView.vue'
import { useDataStore } from '@/stores/data'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/tier/:tab/:tier', name: 'tier', component: { template: '<div/>' } },
      { path: '/:pathMatch(.*)*', component: { template: '<div/>' } },
    ],
  })
}

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {},
    summary: { '100万以上': { projectCount: 1, incompleteData: [] } },
    rawNodes: [{ projectId: 'P1', projectName: '甲', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 1000000, actualPayment: 0, planMonth: '2026-02' }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {},
    displayColumns: { '100万以上': [{ key: 'projectId', label: '项目编号', visible: true }] },
    followupRecords: {},
  } as any
}

async function mountAt(path: string) {
  const router = makeRouter()
  router.push(path)
  await router.isReady()
  return mount(TierView, { global: { plugins: [router, ElementPlus] } })
}

describe('TierView', () => {
  it('nodes tab renders summary bar + nodes table', async () => {
    seed()
    const wrapper = await mountAt('/tier/nodes/above1m')
    expect(wrapper.text()).toContain('回款节点数')
    // 守护汇总条数值绑定与单位换算：seed 单节点 expected=100万/actual=0
    expect(wrapper.text()).toContain('0%') // 完成率 pct(0)
    expect(wrapper.text()).toContain('100') // 待回款 fmtWan(1000000)=100(万)
    expect(wrapper.findComponent({ name: 'TierNodesTab' }).exists()).toBe(true)
  })

  it('falls back to the first tier when the slug is unknown', async () => {
    seed()
    const wrapper = await mountAt('/tier/nodes/badslug')
    // TIER_BY_SLUG 命不中时回退首档（100万以上），不崩溃且仍渲染节点表
    expect(wrapper.findComponent({ name: 'TierNodesTab' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('回款节点数')
  })

  it('integrity tab renders integrity component', async () => {
    seed()
    const wrapper = await mountAt('/tier/integrity/above1m')
    expect(wrapper.findComponent({ name: 'TierIntegrityTab' }).exists()).toBe(true)
  })

  it('unknown tab shows placeholder', async () => {
    seed()
    const wrapper = await mountAt('/tier/zzz/above1m')
    expect(wrapper.text()).toContain('建设中')
  })

  it('plan tab renders PlanTab', async () => {
    seed()
    const wrapper = await mountAt('/tier/plan/above1m')
    expect(wrapper.findComponent({ name: 'PlanTab' }).exists()).toBe(true)
  })

  it('projects tab renders ProjectsOverviewTab', async () => {
    seed()
    const wrapper = await mountAt('/tier/projects/above1m')
    expect(wrapper.findComponent({ name: 'ProjectsOverviewTab' }).exists()).toBe(true)
  })

  it('risk tab renders RiskTab', async () => {
    seed()
    const wrapper = await mountAt('/tier/risk/above1m')
    expect(wrapper.findComponent({ name: 'RiskTab' }).exists()).toBe(true)
  })
})
