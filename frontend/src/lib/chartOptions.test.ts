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
