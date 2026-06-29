import { describe, it, expect } from 'vitest'
import {
  amtWan, isAiRow, isWithin7Days, groupBy, customerTierAgg,
  monthlyTrendByTeam, expectedDateStack, boardKpis, aiKpis,
  buildMultiLineOption, buildCustomerTierOption, buildStackedAmountOption, buildHorizontalBarOption,
  FORECAST_ORDER, TOP1000_TIERS,
} from './opportunityBoard'
import type { OppRow } from '@/lib/opportunitiesApi'

const NOW = new Date(2026, 5, 29) // 2026-06-29(月份 0 基)

function row(o: Partial<OppRow>): OppRow {
  return { id: o.id ?? 'x', ...o } as OppRow
}

describe('amtWan / isAiRow', () => {
  it('amtWan 数值化容错', () => {
    expect(amtWan(row({ amountWan: 123 }))).toBe(123)
    expect(amtWan(row({ amountWan: '' as any }))).toBe(0)
    expect(amtWan(row({ amountWan: undefined }))).toBe(0)
  })
  it('isAiRow 按 productCategory 含 AI(不分大小写)', () => {
    expect(isAiRow(row({ productCategory: 'AISOC' }))).toBe(true)
    expect(isAiRow(row({ productCategory: 'ai审计' }))).toBe(true)
    expect(isAiRow(row({ productCategory: '终端安全' }))).toBe(false)
    expect(isAiRow(row({ productCategory: '' }))).toBe(false)
  })
})

describe('isWithin7Days', () => {
  it('今天/7天前为真, 8天前/未来/空为假', () => {
    expect(isWithin7Days('2026-06-29', NOW)).toBe(true)
    expect(isWithin7Days('2026-06-22', NOW)).toBe(true)   // 7 天前(含)
    expect(isWithin7Days('2026-06-21', NOW)).toBe(false)  // 8 天前
    expect(isWithin7Days('2026-06-30', NOW)).toBe(false)  // 未来
    expect(isWithin7Days('', NOW)).toBe(false)
  })
})

describe('groupBy', () => {
  const rows = [
    row({ l4: '银行服务组', amountWan: 100 }),
    row({ l4: '银行服务组', amountWan: 50 }),
    row({ l4: '浙江服务组', amountWan: 200 }),
    row({ l4: '', amountWan: 9 }),
  ]
  it('默认按金额降序, 空进「空白」', () => {
    const g = groupBy(rows, 'l4')
    expect(g[0]).toMatchObject({ category: '浙江服务组', count: 1, amountWan: 200 })
    expect(g[1]).toMatchObject({ category: '银行服务组', count: 2, amountWan: 150 })
    expect(g.find((x) => x.category === '空白')).toMatchObject({ count: 1, amountWan: 9 })
  })
  it('skipEmpty 跳过空类目', () => {
    const g = groupBy(rows, 'l4', { skipEmpty: true })
    expect(g.some((x) => x.category === '空白')).toBe(false)
  })
  it('order 固定序在前, topN 截断', () => {
    const g = groupBy(rows, 'l4', { order: ['银行服务组', '浙江服务组'], skipEmpty: true })
    expect(g.map((x) => x.category)).toEqual(['银行服务组', '浙江服务组'])
    expect(groupBy(rows, 'l4', { skipEmpty: true, topN: 1 })).toHaveLength(1)
  })
})

describe('customerTierAgg', () => {
  it('4 固定桶 + 去重客户数', () => {
    const rows = [
      row({ top1000: 'TOP1000', customer: 'A', amountWan: 10 }),
      row({ top1000: 'TOP1000', customer: 'A', amountWan: 20 }), // 同客户去重
      row({ top1000: 'TOP1000', customer: 'B', amountWan: 5 }),
      row({ top1000: '', customer: 'C', amountWan: 7 }),          // 空→空白桶
    ]
    const agg = customerTierAgg(rows)
    expect(agg.map((a) => a.tier)).toEqual(TOP1000_TIERS)
    const top = agg.find((a) => a.tier === 'TOP1000')!
    expect(top).toMatchObject({ amountWan: 35, customers: 2 })
    expect(agg.find((a) => a.tier === '空白')!).toMatchObject({ amountWan: 7, customers: 1 })
  })
})

describe('monthlyTrendByTeam', () => {
  it('连续月轴(补空月)+ 团队按 L4_OPTIONS 序 + 矩阵对位', () => {
    const rows = [
      row({ l4: '银行服务组', firstReg: '2026-02-10', amountWan: 100 }),
      row({ l4: '银行服务组', firstReg: '2026-04-01', amountWan: 50 }),
      row({ l4: '浙江服务组', firstReg: '2026-03-15', amountWan: 200 }),
    ]
    const t = monthlyTrendByTeam(rows)
    expect(t.months).toEqual(['2026-02', '2026-03', '2026-04']) // 连续(含空 03? 03 有浙江)
    expect(t.teams).toContain('银行服务组')
    expect(t.teams).toContain('浙江服务组')
    const bi = t.teams.indexOf('银行服务组')
    expect(t.countMatrix[bi]).toEqual([1, 0, 1])
    expect(t.amountMatrix[bi]).toEqual([100, 0, 50])
  })
})

describe('expectedDateStack', () => {
  it('连续月 + 末尾空白桶, 按 forecast 堆叠', () => {
    const rows = [
      row({ expectedDate: '2026-01-10', forecast: '可参与', amountWan: 10 }),
      row({ expectedDate: '2026-03-10', forecast: '赢单', amountWan: 30 }),
      row({ expectedDate: '', forecast: '可参与', amountWan: 5 }),
    ]
    const s = expectedDateStack(rows)
    expect(s.months[s.months.length - 1]).toBe('空白')
    expect(s.months).toEqual(['2026-01', '2026-02', '2026-03', '空白'])
    expect(s.series).toContain('可参与')
    expect(s.series).toContain('赢单')
    const ci = s.series.indexOf('可参与')
    // 可参与: 2026-01=10, 空白=5
    expect(s.matrix[ci][0]).toBe(10)
    expect(s.matrix[ci][s.months.length - 1]).toBe(5)
  })
})

describe('boardKpis / aiKpis', () => {
  it('本周(近7天)按 firstReg 或 lastUpdate 命中', () => {
    const rows = [
      row({ amountWan: 100, firstReg: '2026-06-28', lastUpdate: '2026-01-01' }), // firstReg 近7天
      row({ amountWan: 50, firstReg: '2026-01-01', lastUpdate: '2026-06-25' }),  // lastUpdate 近7天
      row({ amountWan: 9, firstReg: '2026-01-01', lastUpdate: '2026-01-01' }),   // 都不近
    ]
    const k = boardKpis(rows, NOW)
    expect(k).toMatchObject({ weekCount: 2, weekAmountWan: 150, totalCount: 3, totalAmountWan: 159 })
  })
  it('aiKpis 统计 AI 行', () => {
    const rows = [row({ productCategory: 'AISOC', amountWan: 7000 }), row({ productCategory: '终端安全', amountWan: 1 })]
    expect(aiKpis(rows)).toMatchObject({ count: 1, amountWan: 7000 })
  })
})

describe('option 构造', () => {
  it('buildMultiLineOption: 每队一条 line series', () => {
    const opt = buildMultiLineOption(['2026-02', '2026-03'], ['银行服务组', '浙江服务组'], [[1, 0], [0, 2]], '商机数量', 'count')
    expect(opt.series).toHaveLength(2)
    expect(opt.series[0]).toMatchObject({ name: '银行服务组', type: 'line' })
    expect(opt.xAxis.data).toEqual(['2026-02', '2026-03'])
  })
  it('buildCustomerTierOption: 双 yAxis + 2 series', () => {
    const opt = buildCustomerTierOption([{ tier: 'TOP1000', amountWan: 100, customers: 10 }])
    expect(opt.yAxis).toHaveLength(2)
    expect(opt.series).toHaveLength(2)
    expect(opt.series[1].yAxisIndex).toBe(1)
  })
  it('buildStackedAmountOption: series 带同名 stack', () => {
    const opt = buildStackedAmountOption(['2026-01'], ['可参与', '赢单'], [[10], [30]])
    expect(opt.series).toHaveLength(2)
    expect(opt.series[0].stack).toBe(opt.series[1].stack)
  })
  it('buildHorizontalBarOption: category 在 yAxis(inverse)', () => {
    const opt = buildHorizontalBarOption(['终端安全', '主机安全'], [22604, 10297], '预估金额(万元)')
    expect(opt.yAxis.type).toBe('category')
    expect(opt.xAxis.type).toBe('value')
    expect(opt.yAxis.inverse).toBe(true)
    expect(opt.series[0].data).toEqual([22604, 10297])
  })
})
