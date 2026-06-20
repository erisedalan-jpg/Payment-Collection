import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import OrgRanking from './OrgRanking.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

const { pushSpy } = vi.hoisted(() => ({ pushSpy: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushSpy }) }))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); useFilterStore().setPreset('all') })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [],
    projects: [
      { projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: 'A组', paymentPmis: { contract: 2000000 } },
      { projectId: 'P2', projectName: '乙', projectManager: '李四', orgL4: 'B组', paymentPmis: { contract: 2000000 } },
    ],
    projectPmis: {},
    paymentNodes: {
      P1: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.8, expectedPayment: 1000000, receivedAmount: 800000, unpaidAmount: 200000, status: '部分回款' }],
      P2: [{ stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.1, expectedPayment: 1000000, receivedAmount: 100000, unpaidAmount: 900000, status: '部分回款' }],
    },
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

function seedMany(n: number) {
  const ds = useDataStore()
  const projects: any[] = []
  const paymentNodes: Record<string, any[]> = {}
  for (let i = 0; i < n; i++) {
    const id = `P${i + 1}`
    const org = `服务组${String(i + 1).padStart(2, '0')}`
    projects.push({
      projectId: id, projectName: `项目${i + 1}`, projectManager: '张三',
      orgL4: org, paymentPmis: { contract: 2000000 },
    })
    paymentNodes[id] = [{
      stage: '到货款', planDate: '2026-02-01', actualDate: '', payRatio: 0.5,
      expectedPayment: 1000000, receivedAmount: (n - i) * 10000, unpaidAmount: 500000, status: '部分回款',
    }]
  }
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [], projects, projectPmis: {}, paymentNodes,
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('OrgRanking', () => {
  it('注入 10 个不同 orgL4 项目：渲染全部 10 行，不截断到 8', () => {
    seedMany(10)
    const w = mount(OrgRanking)
    const items = w.findAll('.rank-item')
    expect(items.length).toBe(10)
  })

  it('注入 12 个不同 orgL4 项目：渲染全部 12 行，不截断到 8', () => {
    seedMany(12)
    const w = mount(OrgRanking)
    const items = w.findAll('.rank-item')
    expect(items.length).toBe(12)
  })

  it('渲染服务组排名（A组已回款 800000 > B组 100000，A 在前）', () => {
    seed()
    const w = mount(OrgRanking)
    const text = w.text()
    expect(text).toContain('A组')
    expect(text).toContain('B组')
    const ai = text.indexOf('A组'); const bi = text.indexOf('B组')
    expect(ai).toBeGreaterThanOrEqual(0)
    expect(ai).toBeLessThan(bi) // A 组按 actualTotal 降序排在 B 组之前
  })

  it('切到达成率排序：A组(80%) 在 B组(10%) 之前', async () => {
    seed()
    const w = mount(OrgRanking)
    await w.get('[data-test="seg-achievementRate"]').trigger('click')
    const items = w.findAll('.rank-item')
    expect(items[0].text()).toContain('A组')
  })

  it('点击排名行跳转 /insight/board（orgL4 维度）', async () => {
    seed()
    pushSpy.mockClear()
    const w = mount(OrgRanking)
    await w.findAll('.rank-item')[0].trigger('click')
    expect(pushSpy).toHaveBeenCalledWith({ path: '/insight/board', query: { dim: 'orgL4' } })
  })
})
