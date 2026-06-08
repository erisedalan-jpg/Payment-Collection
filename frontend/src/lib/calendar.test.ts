import { describe, it, expect } from 'vitest'
import {
  calExcludePaid,
  calFilterOptions,
  applyCalFilters,
  calDashboardStats,
  calDateData,
  calMonthGrid,
  calListNodes,
  calListGroups,
  calUpcoming,
  calDayTooltipText,
  calAgendaGroups,
  calYearHeat,
} from './calendar'

const NOW = new Date('2026-06-04T00:00:00')

describe('calExcludePaid', () => {
  it('排除已全额回款/已提前回款', () => {
    const r = calExcludePaid([
      { nodeStatus: '延期' }, { nodeStatus: '已全额回款' }, { nodeStatus: '已提前回款' }, { nodeStatus: '正常实施中' },
    ] as any)
    expect(r.map((n: any) => n.nodeStatus)).toEqual(['延期', '正常实施中'])
  })
})

describe('calFilterOptions', () => {
  it('仅取 related&&planDate，去重升序', () => {
    const o = calFilterOptions([
      { isPaymentRelated: true, planDate: '2026-06-10', orgL3: 'B', orgL4: '上海', projectManager: '李' },
      { isPaymentRelated: true, planDate: '2026-06-11', orgL3: 'A', orgL4: '北京', projectManager: '张' },
      { isPaymentRelated: false, planDate: '2026-06-12', orgL3: 'Z' },
    ] as any)
    // 忠实移植 app.js 的 [...set].sort()（Unicode 序）：上(U+4E0A)<北(U+5317)；张(U+5F20)<李(U+674E)
    expect(o.orgL3).toEqual(['A', 'B'])
    expect(o.orgL4).toEqual(['上海', '北京'])
    expect(o.pm).toEqual(['张', '李'])
  })
})

describe('applyCalFilters', () => {
  const nodes = [
    { orgL3: 'A', orgL4: '北京', projectManager: '张' },
    { orgL3: 'B', orgL4: '上海', projectManager: '李' },
  ] as any[]
  it('按 orgL4 过滤', () => {
    expect(applyCalFilters(nodes, { orgL3: '', orgL4: '北京', pm: '' })).toHaveLength(1)
  })
})

describe('calDashboardStats', () => {
  it('当月指标 + 7天内到期 + 延期（基于注入 now）', () => {
    const nodes = [
      { isPaymentRelated: true, planDate: '2026-06-10', nodeStatus: '正常实施中', expectedPayment: 200000, actualPayment: 50000 },
      { isPaymentRelated: true, planDate: '2026-06-30', nodeStatus: '延期', expectedPayment: 100000, actualPayment: 0 },
      { isPaymentRelated: true, planDate: '2026-08-01', nodeStatus: '正常实施中', expectedPayment: 50000, actualPayment: 0 },
    ] as any[]
    const d = calDashboardStats(nodes, { orgL3: '', orgL4: '', pm: '' }, NOW)
    expect(d.mRemaining).toBe(250000)
    expect(d.mActual).toBe(50000)
    expect(d.upcoming7).toBe(1)
    expect(d.mCount).toBe(2)
    expect(d.delayed).toBe(1)
  })
})

describe('calDateData', () => {
  it('按日期统计状态桶 + 待回款金额合计', () => {
    const m = calDateData([
      { isPaymentRelated: true, planDate: '2026-06-10', nodeStatus: '延期', expectedPayment: 100000, actualPayment: 0 },
      { isPaymentRelated: true, planDate: '2026-06-10', nodeStatus: '正常实施中', expectedPayment: 60000, actualPayment: 20000 },
    ] as any)
    expect(m['2026-06-10'].total).toBe(2)
    expect(m['2026-06-10'].delayed).toBe(1)
    expect(m['2026-06-10'].onTime).toBe(1)
    expect(m['2026-06-10'].remaining).toBe(140000)
  })
})

describe('calMonthGrid', () => {
  it('生成含补位的格子，命中日带 count 与状态色', () => {
    const dateData = { '2026-06-10': { total: 2, delayed: 1, onTime: 1, advance: 0, canAdvance: 0, reachedCondition: 0, fullPaid: 0, pending: 0, remaining: 140000 } }
    const cells = calMonthGrid(2026, 5, dateData as any, NOW)
    const c10 = cells.find((c) => c.dateStr === '2026-06-10')!
    expect(c10.count).toBe(2)
    expect(c10.statusClass).toBe('mixed')
    expect(c10.remaining).toBe(140000)
    const c4 = cells.find((c) => c.dateStr === '2026-06-04')!
    expect(c4.isToday).toBe(true)
    expect(cells.length % 7).toBe(0)
  })
})

describe('calListNodes / calListGroups', () => {
  const naguan = [
    { isPaymentRelated: true, planDate: '2026-06-10', nodeStatus: '延期', expectedPayment: 100000, actualPayment: 0 },
    { isPaymentRelated: true, planDate: '2026-07-05', nodeStatus: '正常实施中', expectedPayment: 100000, actualPayment: 20000 },
    { isPaymentRelated: true, planDate: '2026-09-01', nodeStatus: '正常实施中', expectedPayment: 100000, actualPayment: 0 },
    { isPaymentRelated: true, planDate: '2026-06-12', nodeStatus: '已全额回款', expectedPayment: 100000, actualPayment: 100000 },
  ] as any[]
  it('双月范围(6+7月)且排除已全额回款，按日期升序', () => {
    const ns = calListNodes(naguan, { orgL3: '', orgL4: '', pm: '' }, { year: 2026, month: 5, selectedDate: '' })
    expect(ns.map((n: any) => n.planDate)).toEqual(['2026-06-10', '2026-07-05'])
  })
  it('选中某日只取该日', () => {
    const ns = calListNodes(naguan, { orgL3: '', orgL4: '', pm: '' }, { year: 2026, month: 5, selectedDate: '2026-06-10' })
    expect(ns).toHaveLength(1)
  })
  it('分组顺序与小计', () => {
    const ns = calListNodes(naguan, { orgL3: '', orgL4: '', pm: '' }, { year: 2026, month: 5, selectedDate: '' })
    const g = calListGroups(ns)
    expect(g.map((x) => x.key)).toEqual(['延期', '正常实施中'])
    expect(g[0].subRemaining).toBe(100000)
  })
})

describe('calUpcoming', () => {
  it('15/30 天窗口且排除满额（基于注入 now）', () => {
    const naguan = [
      { isPaymentRelated: true, planDate: '2026-06-10', nodeStatus: '正常实施中', actualPaymentRatio: 0.2 },
      { isPaymentRelated: true, planDate: '2026-06-20', nodeStatus: '正常实施中', actualPaymentRatio: 0 },
      { isPaymentRelated: true, planDate: '2026-06-10', nodeStatus: '正常实施中', actualPaymentRatio: 1 },
    ] as any[]
    const u = calUpcoming(naguan, { orgL3: '', orgL4: '', pm: '' }, NOW)
    expect(u.up15.map((n: any) => n.planDate)).toEqual(['2026-06-10'])
    expect(u.up30.map((n: any) => n.planDate)).toEqual(['2026-06-10', '2026-06-20'])
  })
})

describe('calDayTooltipText', () => {
  it('拼接非零状态 + 合计', () => {
    const t = calDayTooltipText({ total: 3, delayed: 2, onTime: 1, advance: 0, canAdvance: 0, reachedCondition: 0, fullPaid: 0, pending: 0 } as any)
    expect(t).toContain('延期 2')
    expect(t).toContain('正常实施中 1')
    expect(t).toContain('合计 3')
  })
})

describe('calAgendaGroups', () => {
  it('按日期升序分组 + 每日待回款小计', () => {
    const g = calAgendaGroups([
      { planDate: '2026-07-05', expectedPayment: 100000, actualPayment: 20000 },
      { planDate: '2026-06-10', expectedPayment: 100000, actualPayment: 0 },
      { planDate: '2026-06-10', expectedPayment: 50000, actualPayment: 50000 },
    ] as any)
    expect(g.map((x) => x.date)).toEqual(['2026-06-10', '2026-07-05'])
    expect(g[0].nodes).toHaveLength(2)
    expect(g[0].subRemaining).toBe(100000)
    expect(g[1].subRemaining).toBe(80000)
  })
})

describe('calYearHeat', () => {
  it('按月汇总指定年的待回款金额与笔数', () => {
    const cells = calYearHeat([
      { planDate: '2026-06-10', expectedPayment: 100000, actualPayment: 0 },
      { planDate: '2026-06-20', expectedPayment: 50000, actualPayment: 20000 },
      { planDate: '2026-08-01', expectedPayment: 80000, actualPayment: 0 },
      { planDate: '2025-06-01', expectedPayment: 999999, actualPayment: 0 },
    ] as any, 2026)
    expect(cells).toHaveLength(12)
    expect(cells[5].month).toBe(5)
    expect(cells[5].remaining).toBe(130000)
    expect(cells[5].count).toBe(2)
    expect(cells[7].remaining).toBe(80000)
    expect(cells[0].remaining).toBe(0)
  })
})
