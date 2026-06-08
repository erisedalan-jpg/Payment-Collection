import { use, registerTheme } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'

// 按需注册 ECharts 模块（tree-shaking）
use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

const PALETTE = ['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899']

// 'ent'：浅色（默认，沿用旧版主名，避免破坏既有引用/测试）
export const ENT_THEME = 'ent'
registerTheme(ENT_THEME, {
  color: PALETTE,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, "Noto Sans SC", sans-serif', color: '#1f2a3d' },
  title: { textStyle: { color: '#1f2a3d' } },
  legend: { textStyle: { color: '#5b6b85' } },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#d4dbe8' } },
    axisTick: { lineStyle: { color: '#d4dbe8' } },
    axisLabel: { color: '#5b6b85' },
    splitLine: { show: false, lineStyle: { color: '#eef2f8' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#d4dbe8' } },
    axisTick: { lineStyle: { color: '#d4dbe8' } },
    axisLabel: { color: '#5b6b85' },
    splitLine: { lineStyle: { color: '#e6eaf2' } },
  },
  tooltip: { backgroundColor: '#ffffff', borderColor: '#e6eaf2', textStyle: { color: '#1f2a3d' } },
})

// 'ent-dark'：深色
export const ENT_THEME_DARK = 'ent-dark'
registerTheme(ENT_THEME_DARK, {
  color: PALETTE,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, "Noto Sans SC", sans-serif', color: '#e6edf7' },
  title: { textStyle: { color: '#e6edf7' } },
  legend: { textStyle: { color: '#8aa0c0' } },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#28385a' } },
    axisTick: { lineStyle: { color: '#28385a' } },
    axisLabel: { color: '#8aa0c0' },
    splitLine: { show: false, lineStyle: { color: '#1f2c44' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#28385a' } },
    axisTick: { lineStyle: { color: '#28385a' } },
    axisLabel: { color: '#8aa0c0' },
    splitLine: { lineStyle: { color: '#1f2c44' } },
  },
  tooltip: { backgroundColor: '#111c30', borderColor: '#1f2c44', textStyle: { color: '#e6edf7' } },
})
