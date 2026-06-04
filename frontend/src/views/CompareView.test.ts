import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CompareView from './CompareView.vue'
import { useDataStore } from '@/stores/data'

const fakeData = {
  meta: { lastUpdate: '2026-06-01' },
  dashboard: {
    orgRanking: [
      { org: '北京交付组', actualTotal: 30, actualTotalWan: 3, achievementRate: 0.6 },
      { org: '上海交付组', actualTotal: 10, actualTotalWan: 1, achievementRate: 0.2 },
    ],
  },
  summary: {
    '100万以上': {
      projectCount: 3,
      totalAmountWan: 500,
      remainingAmountWan: 200,
      actualAmountWan: 300,
      expectedAmountWan: 500,
      delayedAmount: 80,
      relatedNodeCount: 10,
      delayedCount: 2,
      onTimeCount: 4,
      monthlyPlan: { '2026-01': { amountWan: 100 } },
    },
    '50-100万': { projectCount: 2, monthlyPlan: {} },
    '50万以下': { projectCount: 0, monthlyPlan: {} },
  },
  rawNodes: [],
}

describe('CompareView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useDataStore()
    store.data = fakeData as any
  })

  it('渲染三档卡片与四个图表区块标题', async () => {
    const w = mount(CompareView, { global: { stubs: { ChartBox: true } } })
    await flushPromises()
    expect(w.findAll('.cmp-card').length).toBe(3)
    const t = w.text()
    expect(t).toContain('回款达成对比看板')
    expect(t).toContain('回款进度对比')
    expect(t).toContain('状态分布对比')
    expect(t).toContain('月度回款趋势对比')
    expect(t).toContain('服务组达成率排名')
  })

  it('排名榜渲染 TOP5/BOTTOM5 与服务组名', async () => {
    const w = mount(CompareView, { global: { stubs: { ChartBox: true } } })
    await flushPromises()
    const t = w.text()
    expect(t).toContain('TOP5')
    expect(t).toContain('BOTTOM5')
    expect(t).toContain('北京交付组')
    expect(t).toContain('上海交付组')
  })

  it('无数据时不抛错（空态）', async () => {
    setActivePinia(createPinia())
    const store = useDataStore()
    store.data = null as any
    const w = mount(CompareView, { global: { stubs: { ChartBox: true } } })
    await flushPromises()
    expect(w.findAll('.cmp-card').length).toBe(3) // 三档恒在，数值回退 0
  })
})
