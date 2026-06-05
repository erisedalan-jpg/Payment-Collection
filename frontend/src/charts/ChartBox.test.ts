import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ChartBox from './ChartBox.vue'
import { useSettingsStore } from '@/stores/settings'

const VChartStub = {
  name: 'VChart',
  props: ['option', 'theme', 'autoresize'],
  template: '<div class="vchart-stub">{{ Object.keys(option || {}).join(",") }}</div>',
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
  document.documentElement.className = ''
})

describe('ChartBox', () => {
  it('renders a chart container and forwards the option to VChart', () => {
    const wrapper = mount(ChartBox, {
      props: { option: { series: [], xAxis: {} } },
      global: { stubs: { VChart: VChartStub } },
    })
    expect(wrapper.find('.chart-box').exists()).toBe(true)
    expect(wrapper.find('.vchart-stub').text()).toContain('series')
    expect(wrapper.findComponent({ name: 'VChart' }).props('theme')).toBe('ent')
  })

  it('applies the given height', () => {
    const wrapper = mount(ChartBox, {
      props: { option: {}, height: '480px' },
      global: { stubs: { VChart: VChartStub } },
    })
    expect((wrapper.find('.chart-box').element as HTMLElement).style.height).toBe('480px')
  })

  it('uses dark echarts theme when settings.theme is dark', () => {
    useSettingsStore().setTheme('dark')
    const wrapper = mount(ChartBox, {
      props: { option: {} },
      global: { stubs: { VChart: VChartStub } },
    })
    expect(wrapper.findComponent({ name: 'VChart' }).props('theme')).toBe('ent-dark')
  })
})
