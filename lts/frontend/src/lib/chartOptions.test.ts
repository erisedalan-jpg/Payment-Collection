import { describe, it, expect } from 'vitest'
import { buildRankingOption, valueKindForPie } from './chartOptions'

const CATS = ['甲部门', '乙部门', '丙部门']
const VALS = [100, 200, 50]

describe('buildRankingOption - bar', () => {
  it('返回 bar 类型 series', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: VALS, metricLabel: '项目数', valueKind: 'count' })
    expect(opt.series[0].type).toBe('bar')
  })

  it('label.show === true', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: VALS, metricLabel: '项目数', valueKind: 'count' })
    expect(opt.series[0].label.show).toBe(true)
  })

  it('xAxis.data === categories', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: VALS, metricLabel: '项目数', valueKind: 'count' })
    expect(opt.xAxis.data).toEqual(CATS)
  })

  it('series[0].data === values', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: VALS, metricLabel: '项目数', valueKind: 'count' })
    expect(opt.series[0].data).toEqual(VALS)
  })
})

describe('buildRankingOption - line', () => {
  it('返回 line 类型 series', () => {
    const opt = buildRankingOption('line', { categories: CATS, values: VALS, metricLabel: '合同额', valueKind: 'amount' })
    expect(opt.series[0].type).toBe('line')
  })

  it('label.show === true', () => {
    const opt = buildRankingOption('line', { categories: CATS, values: VALS, metricLabel: '合同额', valueKind: 'amount' })
    expect(opt.series[0].label.show).toBe(true)
  })

  it('有 symbol 字段', () => {
    const opt = buildRankingOption('line', { categories: CATS, values: VALS, metricLabel: '合同额', valueKind: 'amount' })
    expect(opt.series[0].symbol).toBeTruthy()
  })
})

describe('buildRankingOption - pie', () => {
  it('返回 pie 类型 series', () => {
    const opt = buildRankingOption('pie', { categories: CATS, values: VALS, metricLabel: '合同额', valueKind: 'amount' })
    expect(opt.series[0].type).toBe('pie')
  })

  it('label.show === true', () => {
    const opt = buildRankingOption('pie', { categories: CATS, values: VALS, metricLabel: '合同额', valueKind: 'amount' })
    expect(opt.series[0].label.show).toBe(true)
  })

  it('series[0].data 含 name/value 对象', () => {
    const opt = buildRankingOption('pie', { categories: CATS, values: VALS, metricLabel: '合同额', valueKind: 'amount' })
    expect(opt.series[0].data[0]).toHaveProperty('name')
    expect(opt.series[0].data[0]).toHaveProperty('value')
    expect(opt.series[0].data[0].name).toBe('甲部门')
    expect(opt.series[0].data[0].value).toBe(100)
  })

  it('无 xAxis（饼图不需要坐标轴）', () => {
    const opt = buildRankingOption('pie', { categories: CATS, values: VALS, metricLabel: '合同额', valueKind: 'amount' })
    expect(opt.xAxis).toBeUndefined()
  })
})

describe('valueKind 决定 label formatter', () => {
  it('count 类型 formatter 输出整数字符串', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: VALS, metricLabel: '项目数', valueKind: 'count' })
    const fmt = opt.series[0].label.formatter
    expect(typeof fmt).toBe('function')
    // count 不除万，直接 String
    expect(fmt({ value: 5 })).toBe('5')
  })

  it('amount 类型 formatter 含"万"', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: [1000000], metricLabel: '合同额', valueKind: 'amount' })
    const fmt = opt.series[0].label.formatter
    expect(typeof fmt).toBe('function')
    expect(fmt({ value: 1000000 })).toContain('万')
  })

  it('ratio 类型 formatter 含"%"', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: [0.85], metricLabel: '完成率', valueKind: 'ratio' })
    const fmt = opt.series[0].label.formatter
    expect(typeof fmt).toBe('function')
    expect(fmt({ value: 0.85 })).toContain('%')
  })
})

describe('valueKindForPie', () => {
  it('count 类型可用饼图', () => {
    expect(valueKindForPie('count')).toBe(true)
  })

  it('amount 类型可用饼图', () => {
    expect(valueKindForPie('amount')).toBe(true)
  })

  it('ratio 类型不可用饼图', () => {
    expect(valueKindForPie('ratio')).toBe(false)
  })
})

describe('buildRankingOption pie legendCounts', () => {
  it('传 legendCounts → legend.formatter 显 名称(数量)', () => {
    const opt = buildRankingOption('pie', {
      categories: ['一组', '二组'], values: [10, 20], metricLabel: '合同总额',
      valueKind: 'amount', legendCounts: [3, 5],
    })
    expect(typeof (opt.legend as any).formatter).toBe('function')
    expect((opt.legend as any).formatter('一组')).toBe('一组 (3)')
    expect((opt.legend as any).formatter('二组')).toBe('二组 (5)')
  })
  it('不传 legendCounts → 无 formatter(回归)', () => {
    const opt = buildRankingOption('pie', {
      categories: ['一组'], values: [10], metricLabel: '项目数', valueKind: 'count',
    })
    expect((opt.legend as any).formatter).toBeUndefined()
  })
})

describe('buildRankingOption palette 参数', () => {
  it('传 palette 覆盖默认色板(bar)', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: VALS, metricLabel: '项目数', valueKind: 'count', palette: ['#111', '#222'] })
    expect(opt.color).toEqual(['#111', '#222'])
  })
  it('pie 同样接受 palette', () => {
    const opt = buildRankingOption('pie', { categories: CATS, values: VALS, metricLabel: '合同额', valueKind: 'amount', palette: ['#abc'] })
    expect(opt.color).toEqual(['#abc'])
  })
  it('不传 palette 回落 CHART_LIGHT(零回归)', () => {
    const opt = buildRankingOption('bar', { categories: CATS, values: VALS, metricLabel: '项目数', valueKind: 'count' })
    expect(opt.color[0]).toBe('#0d3a69')
  })
})

describe("buildRankingOption valueKind 'wan'", () => {
  it('bar: 值原样不除万, 标签带「万」', () => {
    const opt = buildRankingOption('bar', {
      categories: ['终端安全'], values: [22604], metricLabel: '预估金额(万元)', valueKind: 'wan',
    })
    // series 数据未被 ÷10000
    expect(opt.series[0].data).toEqual([22604])
    // y 轴名沿用 metricLabel(不追加 (万))
    expect(opt.yAxis.name).toBe('预估金额(万元)')
    // label formatter 输出含「万」
    const txt = opt.series[0].label.formatter({ value: 22604 })
    expect(txt).toContain('万')
    expect(txt).toContain('22,604')
  })
  it('pie: label formatter 带「万」且不除万', () => {
    const opt = buildRankingOption('pie', {
      categories: ['可参与'], values: [38108], metricLabel: '预估金额(万元)', valueKind: 'wan',
    })
    const txt = opt.series[0].label.formatter({ name: '可参与', value: 38108, percent: 50 })
    expect(txt).toContain('38,108')
    expect(txt).toContain('万')
  })
})
