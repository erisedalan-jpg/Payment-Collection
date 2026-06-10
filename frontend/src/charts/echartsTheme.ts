import { use, registerTheme } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'

// 按需注册 ECharts 模块（tree-shaking）
use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

// canvas 读不到 CSS 变量:以下取值必须与 theme.css 同名令牌逐项一致(第二落地文件,spec 1.7),
// 由 echartsTheme.tokens.test.ts 双源契约强制 —— 改 theme.css 没改这里(或反之),测试即红。
export const FONT_SANS = '-apple-system, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif'

// --chart-1..8(浅/暗)
export const CHART_LIGHT = ['#6c8fa9', '#b484b0', '#417a64', '#886441', '#d24d5c', '#c8adc4', '#fec187', '#a7c190']
export const CHART_DARK = ['#7fa5be', '#c29ac0', '#5ba88a', '#b08a63', '#e0697a', '#d2bccf', '#fec187', '#b7cea3']

// 结构色映射:txt=标题/tooltip 文字,sub=轴标签/图例,line=分隔线/tooltip 边,line2=轴线,card=tooltip 底
export const STRUCT_LIGHT = { txt: '#1e2a33', sub: '#4a5b68', line: '#dde6ee', line2: '#cddae2', card: '#ffffff' }
export const STRUCT_DARK = { txt: '#e4edf2', sub: '#a7bac7', line: '#253a47', line2: '#2f4756', card: '#16262f' }

function buildTheme(palette: string[], s: typeof STRUCT_LIGHT) {
  return {
    color: palette,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT_SANS, color: s.txt },
    title: { textStyle: { color: s.txt } },
    legend: { textStyle: { color: s.sub } },
    categoryAxis: {
      axisLine: { lineStyle: { color: s.line2 } },
      axisTick: { lineStyle: { color: s.line2 } },
      axisLabel: { color: s.sub },
      splitLine: { show: false, lineStyle: { color: s.line } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: s.line2 } },
      axisTick: { lineStyle: { color: s.line2 } },
      axisLabel: { color: s.sub },
      splitLine: { lineStyle: { color: s.line } },
    },
    tooltip: { backgroundColor: s.card, borderColor: s.line, textStyle: { color: s.txt } },
  }
}

// 'ent':浅色(沿用旧主题名,避免破坏既有引用/测试)
export const ENT_THEME = 'ent'
registerTheme(ENT_THEME, buildTheme(CHART_LIGHT, STRUCT_LIGHT))

// 'ent-dark':深色
export const ENT_THEME_DARK = 'ent-dark'
registerTheme(ENT_THEME_DARK, buildTheme(CHART_DARK, STRUCT_DARK))
