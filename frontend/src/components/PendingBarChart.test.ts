import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PendingBarChart from './PendingBarChart.vue'
import ChartBox from '@/charts/ChartBox.vue'

describe('PendingBarChart', () => {
  it('builds a stacked bar option with 3 tier series and passes it to ChartBox', () => {
    const wrapper = mount(PendingBarChart, {
      props: {
        categories: ['2026-Q1', '2026-Q2'],
        series: [
          { tier: '100万以上', data: [100, 0] },
          { tier: '50-100万', data: [0, 60] },
          { tier: '50万以下', data: [0, 0] },
        ],
      },
    })
    const cb = wrapper.findComponent(ChartBox)
    expect(cb.exists()).toBe(true)
    const option = cb.props('option') as any
    expect(option.series).toHaveLength(3)
    expect(option.series[0].stack).toBe('a')
    expect(option.xAxis.data).toEqual(['2026-Q1', '2026-Q2'])
    expect(option.series[0].data).toEqual([100, 0])
  })
  it('assigns tier colors in order (danger/warn/ok)', () => {
    const wrapper = mount(PendingBarChart, {
      props: {
        categories: ['Q1'],
        series: [
          { tier: '100万以上', data: [1] },
          { tier: '50-100万', data: [2] },
          { tier: '50万以下', data: [3] },
        ],
      },
    })
    const option = wrapper.findComponent(ChartBox).props('option') as any
    expect(option.series[0].itemStyle.color).toBe('#c8161d')
    expect(option.series[1].itemStyle.color).toBe('#f9d46c')
    expect(option.series[2].itemStyle.color).toBe('#6ecc54')
  })
})
