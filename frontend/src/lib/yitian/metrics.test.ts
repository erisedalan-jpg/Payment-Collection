import { describe, it, expect } from 'vitest'
import {
  NO_L4, rosterL4Map, selectEntries, baseHours, empStats, typeHours,
  complianceRate, orgSummary, saturationTop, unfilledList, neverFilledList, kpi,
} from './metrics'
import type { YitianData } from '@/types/yitian'

// 两天工作日(6/1 6/2) → 人均基础 16h。三人:张三(银行,20h 加班) 李四(银行,8h 欠填) 王五(浙江,零记录)
const DATA = {
  meta: {
    periodStart: '2026-06-01', periodEnd: '2026-06-02', generatedAt: '', rows: 3,
    employees: 3, droppedRows: 0, calendarSource: 'csv', hoursPerDay: 8, thisBgL2: ['交付中心'],
  },
  roster: [
    { id: 'A1', name: '张三', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' },
    { id: 'A2', name: '李四', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '正式员工' },
    { id: 'A3', name: '王五', l2: '交付中心', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '正式员工' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: {
    types: ['项目类', '管理类', '假期类'], workTypes: [], customers: [], products: [],
    productNames: [], projectTypes: [], salesL2: [], serviceModes: [],
  },
  entries: [
    { d: '2026-06-01', e: 'A1', t: 0, h: 12, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
    { d: '2026-06-02', e: 'A1', t: 1, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 2, iss: ['MISS_NEXT'] },
    { d: '2026-06-01', e: 'A2', t: 2, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
  ],
  issues: [{ i: 1, codes: ['MISS_NEXT'], msgs: ['缺少下一步工作计划'], snippet: '正文' }],
} as unknown as YitianData

const R = ['2026-06-01', '2026-06-02'] as const

describe('selectEntries', () => {
  it('按区间过滤', () => {
    expect(selectEntries(DATA, '2026-06-02', '2026-06-02')).toHaveLength(1)
  })
  it('按 L4 过滤', () => {
    expect(selectEntries(DATA, R[0], R[1], ['浙江服务组'])).toHaveLength(0)
    expect(selectEntries(DATA, R[0], R[1], ['银行服务组'])).toHaveLength(3)
  })
  it('L4 为空 = 不筛组织', () => {
    expect(selectEntries(DATA, R[0], R[1], [])).toHaveLength(3)
  })
})

describe('baseHours', () => {
  it('工作日数 × 8', () => {
    expect(baseHours(DATA, R[0], R[1])).toBe(16)
  })
})

describe('empStats', () => {
  const stats = empStats(DATA, R[0], R[1])
  it('覆盖花名册全员(含零记录的人)', () => {
    expect(stats.map((s) => s.id).sort()).toEqual(['A1', 'A2', 'A3'])
  })
  it('实际工时含全部工时类型(管理类/假期类也算)', () => {
    expect(stats.find((s) => s.id === 'A1')!.hours).toBe(20)   // 项目类12 + 管理类8
    expect(stats.find((s) => s.id === 'A2')!.hours).toBe(8)    // 假期类8 也计入实际工时
  })
  it('饱和度与差值', () => {
    const a1 = stats.find((s) => s.id === 'A1')!
    expect(a1.sat).toBeCloseTo(1.25)
    expect(a1.diff).toBe(4)
  })
  it('零记录的人 filled=false', () => {
    const a3 = stats.find((s) => s.id === 'A3')!
    expect(a3.filled).toBe(false)
    expect(a3.hours).toBe(0)
    expect(a3.sat).toBe(0)
  })
  it('基础工时为 0 时饱和度为 null', () => {
    const s = empStats(DATA, '2026-06-06', '2026-06-07')   // 区间外无工作日
    expect(s[0].base).toBe(0)
    expect(s[0].sat).toBeNull()
  })
})

describe('清单', () => {
  const stats = empStats(DATA, R[0], R[1])
  it('未按时填写 = 有记录且欠填', () => {
    expect(unfilledList(stats).map((s) => s.id)).toEqual(['A2'])
  })
  it('完全未填 = 零记录', () => {
    expect(neverFilledList(stats).map((s) => s.id)).toEqual(['A3'])
  })
  it('两清单互斥', () => {
    const u = new Set(unfilledList(stats).map((s) => s.id))
    expect(neverFilledList(stats).every((s) => !u.has(s.id))).toBe(true)
  })
  it('饱和度榜降序', () => {
    expect(saturationTop(stats, 2).map((s) => s.id)).toEqual(['A1', 'A2'])
  })
})

describe('typeHours', () => {
  it('按类型占比', () => {
    const t = typeHours(DATA, selectEntries(DATA, R[0], R[1]))
    const proj = t.find((x) => x.type === '项目类')!
    expect(proj.hours).toBe(12)
    expect(proj.pct).toBeCloseTo(12 / 28)
  })
})

const EX = ['管理类', '业务类', '假期类']   // 默认剔除口径

describe('complianceRate', () => {
  it('分母按 excludedTypes 剔除(默认剔管理类)', () => {
    // DATA 的 entries:项目类 12h(合规) / 管理类 8h(问题) / 假期类 8h
    // 默认口径下管理类与假期类都不进分母 → 分母只剩项目类 1 条 → 100%
    expect(complianceRate(DATA, selectEntries(DATA, R[0], R[1]), EX)).toBeCloseTo(1)
  })
  it('把管理类纳入后分母变大', () => {
    expect(complianceRate(DATA, selectEntries(DATA, R[0], R[1]), ['业务类', '假期类']))
      .toBeCloseTo(0.5)   // 项目类合规 + 管理类问题 → 1/2
  })
  it('全部纳入(不剔除任何类型)', () => {
    const r = complianceRate(DATA, selectEntries(DATA, R[0], R[1]), [])
    expect(r).toBeCloseTo(2 / 3)   // 3 条:项目类合规 + 管理类问题 + 假期类合规
  })
  it('无可计入行返回 null', () => {
    expect(complianceRate(DATA, [], EX)).toBeNull()
  })
})

describe('orgSummary', () => {
  it('三层汇总(L3/L3-1/L4),人数取花名册', () => {
    const rows = orgSummary(DATA, R[0], R[1])
    const l3 = rows.find((r) => r.level === 'l3')!
    expect(l3.name).toBe('交付实施三部')
    expect(l3.people).toBe(3)
    expect(l3.hours).toBe(28)
    const bank = rows.find((r) => r.level === 'l4' && r.name === '银行服务组')!
    expect(bank.people).toBe(2)
    expect(bank.hours).toBe(28)
    expect(bank.parent).toBe('服务二部')
    const zj = rows.find((r) => r.level === 'l4' && r.name === '浙江服务组')!
    expect(zj.hours).toBe(0)      // 零记录的组也要出现(否则看不到全员没填)
  })
})

describe('kpi', () => {
  const k = kpi(DATA, R[0], R[1], [], EX)
  it('总工时/未填人数/加班', () => {
    expect(k.totalHours).toBe(28)
    expect(k.unfilledCount).toBe(2)      // 李四(欠填) + 王五(零记录)
    expect(k.overtimeCount).toBe(1)
    expect(k.overtimeHours).toBe(4)
  })
  it('平均饱和度 = Σ实际 ÷ Σ基础', () => {
    expect(k.avgSat).toBeCloseTo(28 / 48)
  })
  it('补全后饱和度 = Σmax(实际,基础) ÷ Σ基础', () => {
    expect(k.avgSatFilled).toBeCloseTo((20 + 16 + 16) / 48)
  })
  it('合规率与问题数按 excludedTypes 口径', () => {
    expect(k.complianceRate).toBeCloseTo(1)
    expect(k.issueCount).toBe(0)   // 管理类被剔除 → 它那条问题不计入
  })
})

describe('rosterL4Map', () => {
  it('工号 → L4', () => {
    expect(rosterL4Map(DATA)['A3']).toBe('浙江服务组')
  })
})

describe('空 L4 兜底(真实花名册里有 L4 为空的部门负责人)', () => {
  // A4 无 L4 且有 8h 工时:必须归入「未分配L4」,不能被吞掉
  const WITH_EMPTY = {
    ...DATA,
    roster: [
      ...DATA.roster,
      { id: 'A4', name: '赵六', l2: '交付中心', l3: '交付实施三部', l31: '服务二部', l4: '', category: '正式员工' },
    ],
    entries: [
      ...DATA.entries,
      { d: '2026-06-01', e: 'A4', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: null, wo: '', top: false, ok: 0, iss: [] },
    ],
  } as unknown as YitianData

  it('空 L4 归入「未分配L4」', () => {
    expect(rosterL4Map(WITH_EMPTY)['A4']).toBe(NO_L4)
    const s = empStats(WITH_EMPTY, R[0], R[1]).find((x) => x.id === 'A4')!
    expect(s.l4).toBe(NO_L4)
  })

  it('L3 合计 = 各 L4 之和(空 L4 不得被吞掉)', () => {
    const rows = orgSummary(WITH_EMPTY, R[0], R[1])
    const l3 = rows.find((r) => r.level === 'l3')!
    const l4Sum = rows.filter((r) => r.level === 'l4').reduce((s, r) => s + r.hours, 0)
    expect(l4Sum).toBe(l3.hours)
    expect(rows.some((r) => r.level === 'l4' && r.name === NO_L4)).toBe(true)
  })

  it('可按「未分配L4」筛选', () => {
    expect(selectEntries(WITH_EMPTY, R[0], R[1], [NO_L4]).map((e) => e.e)).toEqual(['A4'])
  })
})
