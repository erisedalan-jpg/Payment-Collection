import { use, registerTheme } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart, ScatterChart, HeatmapChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  VisualMapComponent, MarkLineComponent, MarkPointComponent, DataZoomComponent,
} from 'echarts/components'

// 按需注册 ECharts 模块（tree-shaking）
use([
  CanvasRenderer, BarChart, LineChart, PieChart, ScatterChart, HeatmapChart,
  GridComponent, TooltipComponent, LegendComponent, TitleComponent,
  VisualMapComponent, MarkLineComponent, MarkPointComponent, DataZoomComponent,
])

// canvas 读不到 CSS 变量:以下取值必须与 theme.css 同名令牌逐项一致(第二落地文件,spec 1.7),
// 由 echartsTheme.tokens.test.ts 双源契约强制 —— 改 theme.css 没改这里(或反之),测试即红。
export const FONT_SANS = '-apple-system, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif'

// --chart-1..8(浅/暗)
export const CHART_LIGHT = ['#0d3a69', '#eb5c20', '#018b8d', '#f9d46c', '#c8161d', '#71e2d1', '#6ecc54', '#492d22']
export const CHART_DARK = ['#3e6fa8', '#eb5c20', '#1fa6a8', '#f9d46c', '#d34947', '#71e2d1', '#6ecc54', '#8a5a45']

// 结构色映射:txt=标题/tooltip 文字,sub=轴标签/图例,line=分隔线/tooltip 边,line2=轴线,card=tooltip 底
export const STRUCT_LIGHT = { txt: '#121212', sub: '#474747', line: '#e4e4e2', line2: '#d4d4d2', card: '#fbfbfd' }
export const STRUCT_DARK = { txt: '#fbfbfd', sub: '#bcbec1', line: '#272b31', line2: '#343a44', card: '#1a1d24' }

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

// 状态色镜像(canvas 不能读 CSS 变量,与 CHART_* 同理;契约测试与 theme.css 同步)
export const STATUS_LIGHT = { ok: '#6ecc54', warn: '#f9d46c', danger: '#c8161d' }
export const STATUS_DARK = { ok: '#6ecc54', warn: '#f9d46c', danger: '#d34947' }

// 中性灰镜像(--mut):里程碑「未发布」等无文字状态系列用;契约测试与 theme.css 同步
export const MUTED_LIGHT = '#6b6b6b'
export const MUTED_DARK = '#8b8e93'
