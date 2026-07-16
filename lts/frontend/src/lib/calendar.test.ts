import { describe, it, expect } from 'vitest'
import {
  calExcludePaid, calFilterOptions, applyCalFilters, calDashboardStats,
  calDateData, calListGroups, calUpcoming, calYearHeat,
} from './calendar'
import type { PayNodeRow } from './paymentPmis'
import type { Paymentrecords } from '@/types/analysis'

function pn(p: Partial<PayNodeRow>): PayNodeRow {
  return { projectId: 'P1', projectName: '甲', stage: '到货款', planDate: '2026-02-10', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0,
    projectManager: '张', status: '待回款', dept: 'A组', orgL3_1: '三部一组', projStage: '', tier: '100万以上', progress: '未回款', ...p }
}

describe('calExcludePaid', () => {
  it('排除已回款', () => {
    const out = calExcludePaid([pn({ status: '已回款' }), pn({ status: '延期' })])
    expect(out).toHaveLength(1)
    expect(out[0].status).toBe('延期')
  })
})

describe('calFilterOptions', () => {
  it('orgL3_1/orgL4(dept)/pm 去重升序', () => {
    const o = calFilterOptions([pn({ orgL3_1: '组A', dept: 'L4A', projectManager: '张' }), pn({ orgL3_1: '组B', dept: 'L4B', projectManager: '李' })])
    expect(o.orgL3_1).toEqual(['组A', '组B'])
    expect(o.orgL4).toEqual(['L4A', 'L4B'])
    expect(o.pm).toEqual(['张', '李'])
  })
})

describe('applyCalFilters', () => {
  it('按 orgL3_1/dept/pm 过滤', () => {
    const rows = [pn({ projectId: 'P1', orgL3_1: '组A' }), pn({ projectId: 'P2', orgL3_1: '组B' })]
    expect(applyCalFilters(rows, { orgL3_1: '组A', orgL4: '', pm: '' }).map((n) => n.projectId)).toEqual(['P1'])
  })
})

describe('calDashboardStats', () => {
  it('当月 Σ未收/已收(流水) + 延期 + 7天到期', () => {
    const now = new Date('2026-02-15T00:00:00')
    const rows = [
      pn({ projectId: 'P1', planDate: '2026-02-10', unpaidAmount: 30000, receivedAmount: 10000, status: '部分回款' }),
      pn({ projectId: 'P2', planDate: '2026-02-18', unpaidAmount: 50000, status: '延期' }),
    ]
    // P1 有当月流水 12000，P2 有当月流水 5000（另有上月流水 9000 不应计入）
    const paymentRecords: Paymentrecords = {
      P1: { records: [{ amount: 12000, date: '2026-02-08' }, { amount: 9000, date: '2026-01-20' }] },
      P2: { records: [{ amount: 5000, date: '2026-02-20' }] },
    }
    const d = calDashboardStats(rows, { orgL3_1: '', orgL4: '', pm: '' }, now, paymentRecords)
    expect(d.mRemaining).toBe(80000)
    // 当月已回款=流水口径：P1(12000) + P2(5000) = 17000，不含上月 9000
    expect(d.mActual).toBe(17000)
    expect(d.mCount).toBe(2)
    expect(d.delayed).toBe(1)
    expect(d.upcoming7).toBe(1)
  })
  it('未传 paymentRecords 时 mActual=0', () => {
    const now = new Date('2026-02-15T00:00:00')
    const rows = [pn({ projectId: 'P1', planDate: '2026-02-10', unpaidAmount: 30000, receivedAmount: 10000, status: '部分回款' })]
    const d = calDashboardStats(rows, { orgL3_1: '', orgL4: '', pm: '' }, now)
    expect(d.mActual).toBe(0)
  })
})

describe('calDateData', () => {
  it('按日 4 态桶 + Σ未收', () => {
    const m = calDateData([
      pn({ planDate: '2026-02-10', unpaidAmount: 30000, status: '延期' }),
      pn({ planDate: '2026-02-10', unpaidAmount: 20000, status: '部分回款' }),
    ])
    expect(m['2026-02-10'].total).toBe(2)
    expect(m['2026-02-10'].delayed).toBe(1)
    expect(m['2026-02-10'].partial).toBe(1)
    expect(m['2026-02-10'].remaining).toBe(50000)
  })
})

describe('calListGroups', () => {
  it('按 4 态分组,subRemaining=Σ未收', () => {
    const g = calListGroups([pn({ status: '延期', unpaidAmount: 5000 }), pn({ status: '延期', unpaidAmount: 3000 })])
    expect(g[0].key).toBe('延期')
    expect(g[0].subRemaining).toBe(8000)
  })
})

describe('calUpcoming', () => {
  it('15/30天内、排已回款', () => {
    const now = new Date('2026-02-01T00:00:00')
    const rows = [
      pn({ planDate: '2026-02-10', status: '待回款' }),
      pn({ planDate: '2026-02-25', status: '延期' }),
      pn({ planDate: '2026-02-05', status: '已回款' }),
    ]
    const u = calUpcoming(rows, { orgL3_1: '', orgL4: '', pm: '' }, now)
    expect(u.up15.map((n) => n.planDate)).toEqual(['2026-02-10'])
    expect(u.up30.map((n) => n.planDate)).toEqual(['2026-02-25'])
  })
})

describe('calYearHeat', () => {
  it('按月 Σ未收', () => {
    const h = calYearHeat([pn({ planDate: '2026-02-10', unpaidAmount: 40000 })], 2026)
    expect(h[1].remaining).toBe(40000)
    expect(h[1].count).toBe(1)
  })
})

function node(p: any) {
  return { projectId: 'P1', projectName: '甲', stage: '初验款', planDate: '2026-07-03', status: '待回款',
    dept: 'A组', orgL3_1: '', projectManager: '张三', unpaidAmount: 0, receivedAmount: 0,
    expectedPayment: 0, actualDate: '', payRatio: null, actualRatio: null, tier: '', projStage: '', progress: '', ...p }
}
const noFilter = { orgL3_1: '', orgL4: '', pm: '' }

describe('calUpcoming 本地日界', () => {
  it('东八区上午 10 点,今日到期节点仍在 up15', () => {
    const now = new Date('2026-07-03T10:00:00') // 本地时间
    const r = calUpcoming([node({ planDate: '2026-07-03' })], noFilter, now)
    expect(r.up15.length).toBe(1)
  })
})

describe('calDashboardStats 当月已回款范围', () => {
  it('项目节点在他月但本月有流水,mActual 计入', () => {
    const now = new Date('2026-07-03T10:00:00')
    const nodes = [node({ projectId: 'P1', planDate: '2026-09-30' })] // 节点在 9 月
    const records = { P1: { records: [{ date: '2026-07-10', amount: 200000 }] } } as any
    const r = calDashboardStats(nodes, noFilter, now, records)
    expect(r.mActual).toBe(200000)
  })
})
