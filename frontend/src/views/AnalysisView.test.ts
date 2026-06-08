import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AnalysisView from './AnalysisView.vue'
import { useDataStore } from '@/stores/data'

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { tab: 'projects' } }),
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
}))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [{ projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '延期', expectedPayment: 100000, actualPayment: 0, planMonth: '2026-02' }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('AnalysisView', () => {
  it('渲染 tab 条与档位筛选(默认全部)，projects tab 渲染总览', () => {
    seed()
    const w = mount(AnalysisView, {
      global: { stubs: { ProjectsOverviewTab: true, TierNodesTab: true, PlanTab: true, RiskTab: true, TierIntegrityTab: true } },
    })
    expect(w.text()).toContain('项目总览')
    expect(w.text()).toContain('档位')
    expect(w.text()).toContain('全部')
    expect(w.findComponent({ name: 'ProjectsOverviewTab' }).exists()).toBe(true)
  })
})
