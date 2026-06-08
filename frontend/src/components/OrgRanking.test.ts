import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import OrgRanking from './OrgRanking.vue'
import { useDataStore } from '@/stores/data'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [
      { projectId: 'P1', tier: '100万以上', orgL4: '北京服务组', isPaymentRelated: true, expectedPayment: 1000000, actualPayment: 600000, planMonth: '2026-02' },
      { projectId: 'P2', tier: '50-100万', orgL4: '上海一服务组', isPaymentRelated: true, expectedPayment: 800000, actualPayment: 200000, planMonth: '2026-05' },
    ],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('OrgRanking', () => {
  it('渲染服务组排名（金额与达成率）', () => {
    seed()
    const w = mount(OrgRanking)
    const text = w.text()
    expect(text).toContain('北京服务组')
    expect(text).toContain('上海一服务组')
    expect(text).toContain('60%')
  })

  it('切到达成率排序：北京(60%) 在 上海(25%) 之前', async () => {
    seed()
    const w = mount(OrgRanking)
    await w.get('[data-test="seg-achievementRate"]').trigger('click')
    const items = w.findAll('.rank-item')
    expect(items[0].text()).toContain('北京服务组')
  })

  it('点击排名行跳转 /board（orgL4 维度）', async () => {
    seed()
    pushSpy.mockClear()
    const w = mount(OrgRanking)
    await w.findAll('.rank-item')[0].trigger('click')
    expect(pushSpy).toHaveBeenCalledWith({ path: '/board', query: { dim: 'orgL4' } })
  })
})
