/**
 * chartOptions.ts — 可单测的纯函数，构造 ECharts option
 *
 * 颜色取 echartsTheme 的 chart 调色板（CHART_LIGHT），避免手写散值。
 * 格式化器按 valueKind 决定：
 *   amount → 万（除以 10000，toLocaleString 保留 2 位小数 + "万"）
 *   ratio  → 百分比（×100 + "%"）
 *   count  → 整数字符串
 *   wan    → 万（值原样不除万，toLocaleString 保留 1 位小数 + "万"；供已是万元的字段如商机 amountWan 用）
 */
import { CHART_LIGHT } from '@/charts/echartsTheme'

export type ValueKind = 'amount' | 'ratio' | 'count' | 'wan'
export type ChartType = 'bar' | 'line' | 'pie'

export interface RankingOptionParams {
  categories: string[]
  values: number[]
  metricLabel: string
  valueKind: ValueKind
  legendCounts?: number[]
  palette?: string[]
}

/** 根据 valueKind 返回 ECharts label formatter 函数 */
function makeLabelFormatter(valueKind: ValueKind): (p: { value: number }) => string {
  if (valueKind === 'amount') {
    return (p) => {
      const wan = p.value / 10000
      return wan.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '万'
    }
  }
  if (valueKind === 'ratio') {
    return (p) => {
      const pctVal = p.value * 100
      if (pctVal === Math.round(pctVal)) return Math.round(pctVal) + '%'
      return pctVal.toFixed(1) + '%'
    }
  }
  if (valueKind === 'wan') {
    return (p) => p.value.toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '万'
  }
  // count
  return (p) => String(Math.round(p.value))
}

/**
 * 构造排名图 ECharts option。
 * type='bar'：横坐标分类柱状图 + 数据标签
 * type='line'：折线图 + 数据标签 + symbol
 * type='pie'：饼图（无坐标轴），name=category、value=该值；标签显名称+数值
 */
export function buildRankingOption(
  type: ChartType,
  params: RankingOptionParams,
): Record<string, any> {
  const { categories, values, metricLabel, valueKind } = params
  const formatter = makeLabelFormatter(valueKind)
  const color = params.palette ?? CHART_LIGHT

  if (type === 'pie') {
    const pieData = categories.map((name, i) => ({ name, value: values[i] }))
    const legend: Record<string, any> = { type: 'scroll', orient: 'vertical', right: 10, top: 'middle' }
    if (params.legendCounts) {
      const countByName: Record<string, number> = {}
      categories.forEach((name, i) => { countByName[name] = params.legendCounts![i] })
      legend.formatter = (name: string) => `${name} (${countByName[name] ?? 0})`
    }
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {d}%' },
      legend,
      color,
      series: [
        {
          name: metricLabel,
          type: 'pie',
          radius: ['40%', '70%'],
          data: pieData,
          label: {
            show: true,
            formatter: (p: { name: string; value: number; percent: number }) =>
              `${p.name}\n${formatter({ value: p.value })}`,
          },
          emphasis: { itemStyle: { shadowBlur: 8, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.3)' } },
        },
      ],
    }
  }

  const yAxisName = valueKind === 'amount' ? `${metricLabel}(万)` : metricLabel
  // amount 类型的 series 数据已除万供 yAxis 显示
  const seriesData = valueKind === 'amount' ? values.map((v) => +(v / 10000).toFixed(4)) : values

  // amount 已除万，label formatter 直接展示数字+"万"(不再除 10000)
  const axisFormatter =
    valueKind === 'amount'
      ? (p: { value: number }) => {
          const wan = p.value // series 数据已是万
          return wan.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '万'
        }
      : formatter

  const seriesBase: Record<string, any> = {
    name: metricLabel,
    type,
    colorBy: 'data',
    data: seriesData,
    label: {
      show: true,
      position: type === 'bar' ? 'top' : 'top',
      formatter: axisFormatter,
    },
  }

  if (type === 'line') {
    seriesBase.symbol = 'circle'
    seriesBase.symbolSize = 6
    seriesBase.smooth = false
  }

  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 60, right: 20, top: 40, bottom: 60 },
    color,
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { interval: 0, rotate: 30 },
    },
    yAxis: {
      type: 'value',
      name: yAxisName,
    },
    series: [seriesBase],
  }
}

/**
 * 判断某 valueKind 是否可以用饼图展示。
 * ratio/均值类不适合饼图（比率相加无意义）。
 */
export function valueKindForPie(valueKind: ValueKind): boolean {
  return valueKind !== 'ratio'
}
