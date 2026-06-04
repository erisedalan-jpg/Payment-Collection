import { use, registerTheme } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'

// 按需注册 ECharts 模块（tree-shaking）
use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

// 'ent' 主题：最小色板（沿用旧版主色系）
export const ENT_THEME = 'ent'
registerTheme(ENT_THEME, {
  color: ['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899'],
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, "Noto Sans SC", sans-serif' },
})
