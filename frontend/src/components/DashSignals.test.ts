import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashSignals from './DashSignals.vue'
import { useDataStore } from '@/stores/data'

vi.mock('vue-router', () => ({
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a class="rl" :data-to="to"><slot /></a>' },
}))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [{ projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 100000, actualPayment: 0, planMonth: '2026-06', planDate: '2026-06-20', followupRecords: [] }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('DashSignals', () => {
  it('渲染 4 个信号卡与标签', () => {
    seed()
    const w = mount(DashSignals)
    expect(w.findAll('.ds-card').length).toBe(4)
    const t = w.text()
    expect(t).toContain('本月需回款')
    expect(t).toContain('7天内临期')
    expect(t).toContain('延期额')
    expect(t).toContain('待跟进')
  })

  it('4 张卡导流到正确路由', () => {
    seed()
    const w = mount(DashSignals)
    const tos = w.findAll('.rl').map((a) => a.attributes('data-to'))
    expect(tos).toEqual(['/calendar', '/calendar', '/analysis/risk', '/followup'])
  })
})
