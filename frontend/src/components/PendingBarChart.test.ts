import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import PendingBarChart from './PendingBarChart.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useSettingsStore } from '@/stores/settings'
import { STATUS_LIGHT, STATUS_DARK } from '@/charts/echartsTheme'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  document.documentElement.className = ''
})

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
  it('assigns tier colors in order (danger/warn/ok) from STATUS_LIGHT under light theme', () => {
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
    expect(option.series[0].itemStyle.color).toBe(STATUS_LIGHT.danger)
    expect(option.series[1].itemStyle.color).toBe(STATUS_LIGHT.warn)
    expect(option.series[2].itemStyle.color).toBe(STATUS_LIGHT.ok)
  })

  it('assigns tier colors from STATUS_DARK under dark theme (danger 随主题变 #d34947)', () => {
    useSettingsStore().setTheme('dark')
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
    expect(option.series[0].itemStyle.color).toBe(STATUS_DARK.danger)
    expect(option.series[0].itemStyle.color).toBe('#d34947')
    expect(option.series[1].itemStyle.color).toBe(STATUS_DARK.warn)
    expect(option.series[2].itemStyle.color).toBe(STATUS_DARK.ok)
  })

  it('横滑容器 .pbc-scroll 存在', () => {
    const wrapper = mount(PendingBarChart, {
      props: {
        categories: ['2026-Q1', '2026-Q2'],
        series: [
          { tier: '100万以上', data: [10, 20] },
          { tier: '50-100万', data: [5, 15] },
          { tier: '50万以下', data: [0, 0] },
        ],
      },
    })
    expect(wrapper.find('.pbc-scroll').exists()).toBe(true)
  })

  it('pbc-inner min-width 随 categories 数增大', () => {
    // 2 个 categories: min-width 含 2*48=96px
    const w2 = mount(PendingBarChart, {
      props: {
        categories: ['2026-Q1', '2026-Q2'],
        series: [{ tier: '100万以上', data: [10, 20] }, { tier: '50-100万', data: [5, 15] }, { tier: '50万以下', data: [0, 0] }],
      },
    })
    // 10 个 categories: min-width 含 10*48=480px
    const w10 = mount(PendingBarChart, {
      props: {
        categories: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'],
        series: [{ tier: '100万以上', data: [1,1,1,1,1,1,1,1,1,1] }, { tier: '50-100万', data: [0,0,0,0,0,0,0,0,0,0] }, { tier: '50万以下', data: [0,0,0,0,0,0,0,0,0,0] }],
      },
    })
    const inner2 = w2.find('.pbc-inner')
    const inner10 = w10.find('.pbc-inner')
    expect(inner2.exists()).toBe(true)
    expect(inner10.exists()).toBe(true)
    // 解析 minWidth style，10 个桶的值应大于 2 个桶的值
    const minWidth2 = inner2.attributes('style') ?? ''
    const minWidth10 = inner10.attributes('style') ?? ''
    // 2 个桶: max(100%, 2*48px) = max(100%, 96px)
    expect(minWidth2).toContain('96px')
    // 10 个桶: max(100%, 10*48px) = max(100%, 480px)
    expect(minWidth10).toContain('480px')
  })
})
