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

  it('转发 VChart click 为 datapoint-click', async () => {
    const wrapper = mount(ChartBox, {
      props: { option: {} },
      global: { stubs: { VChart: VChartStub } },
    })
    wrapper.findComponent({ name: 'VChart' }).vm.$emit('click', { seriesName: '终验', dataIndex: 2 })
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('datapoint-click')?.[0]?.[0]).toMatchObject({ seriesName: '终验', dataIndex: 2 })
  })

  // 性能护栏：tooltip 切 richText 消除 HTML tooltip 每次 mousemove 的强制回流（柱状图 hover 卡顿主因）。
  it('给带 tooltip 的图注入 richText 并保留视图自带的 trigger/axisPointer', () => {
    const wrapper = mount(ChartBox, {
      props: { option: { tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, series: [] } },
      global: { stubs: { VChart: VChartStub } },
    })
    const opt = wrapper.findComponent({ name: 'VChart' }).props('option') as any
    expect(opt.tooltip.renderMode).toBe('richText')
    expect(opt.tooltip.transitionDuration).toBe(0)
    expect(opt.tooltip.trigger).toBe('axis')            // 视图字段保留
    expect(opt.tooltip.axisPointer.type).toBe('shadow') // 视图字段保留
    expect(opt.tooltip.axisPointer.animation).toBe(false)
    expect(opt.axisPointer.animation).toBe(false)
  })

  it('无 tooltip 的图不新增 tooltip 键，且注入进场动画时长', () => {
    const wrapper = mount(ChartBox, {
      props: { option: { series: [] } },
      global: { stubs: { VChart: VChartStub } },
    })
    const opt = wrapper.findComponent({ name: 'VChart' }).props('option') as any
    expect('tooltip' in opt).toBe(false)
    expect(opt.animationDuration).toBe(260)
  })
})
