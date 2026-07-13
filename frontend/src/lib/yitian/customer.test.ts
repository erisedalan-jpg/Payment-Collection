import { describe, it, expect } from 'vitest'
import { top1000ByL4, bgSupport } from './customer'
import type { YitianData } from '@/types/yitian'

const DATA = {
  meta: { hoursPerDay: 8, thisBgL2: ['银行集团军', '交付中心'] },
  roster: [
    { id: 'A1', name: '张三', l2: '', l3: '交付实施三部', l31: '服务二部', l4: '银行服务组', category: '' },
    { id: 'A2', name: '李四', l2: '', l3: '交付实施三部', l31: '服务一部', l4: '浙江服务组', category: '' },
  ],
  days: [
    { d: '2026-06-01', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
    { d: '2026-06-02', workday: true, isoWeek: '2026-W23', calcWeek: '2026-CW23' },
  ],
  dims: {
    types: ['项目类', '管理类', '售前类'], workTypes: [], customers: ['大客户', '小客户'],
    products: [], productNames: [], projectTypes: [],
    salesL2: ['银行集团军', '政企大区'], serviceModes: [],
  },
  entries: [
    // 张三:项目类 6h 大客户(TOP1000) 本BG
    { d: '2026-06-01', e: 'A1', t: 0, h: 6, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: 0, wo: '', top: true, ok: 0, iss: [] },
    // 张三:项目类 2h 小客户 跨BG
    { d: '2026-06-01', e: 'A1', t: 0, h: 2, wt: null, cu: 1, pl: null, pn: null, pt: null, sm: null, bg: 1, wo: '', top: false, ok: 0, iss: [] },
    // 张三:管理类 8h —— TOP1000 与跨BG 都不该统计管理类
    { d: '2026-06-02', e: 'A1', t: 1, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null, sm: null, bg: 0, wo: '', top: false, ok: 0, iss: [] },
    // 李四:售前类 4h 大客户 本BG
    { d: '2026-06-02', e: 'A2', t: 2, h: 4, wt: null, cu: 0, pl: null, pn: null, pt: null, sm: null, bg: 0, wo: '', top: true, ok: 0, iss: [] },
  ],
  issues: [],
} as unknown as YitianData

const S = '2026-06-01'
const E = '2026-06-02'

describe('top1000ByL4', () => {
  const rows = top1000ByL4(DATA, S, E)
  it('按花名册 L4 分组(不做模糊匹配)', () => {
    expect(rows.map((r) => r.l4).sort()).toEqual(['浙江服务组', '银行服务组'])
  })
  it('只统计项目类/售前类/售后类(管理类不算)', () => {
    const bank = rows.find((r) => r.l4 === '银行服务组')!
    expect(bank.hours).toBe(8)        // 6 + 2,管理类 8h 被排除
  })
  it('TOP1000 工时与占比', () => {
    const bank = rows.find((r) => r.l4 === '银行服务组')!
    expect(bank.topHours).toBe(6)
    expect(bank.pct).toBeCloseTo(0.75)
    expect(bank.topCustomers).toBe(1)
  })
  it('零工时的组也保留(看得见谁没投入)', () => {
    const zj = rows.find((r) => r.l4 === '浙江服务组')!
    expect(zj.hours).toBe(4)
    expect(zj.topHours).toBe(4)
  })
})

describe('bgSupport', () => {
  const b = bgSupport(DATA, S, E)
  it('只统计项目类/售前类', () => {
    expect(b.total).toBe(12)          // 6 + 2 + 4;管理类 8h 排除
  })
  it('本BG判定读 meta.thisBgL2', () => {
    expect(b.thisBg).toBe(10)         // 6(银行集团军) + 4(银行集团军)
    expect(b.crossBg).toBe(2)         // 2(政企大区)
    expect(b.thisPct).toBeCloseTo(10 / 12)
  })
  it('无数据时占比为 0 不是 NaN', () => {
    const empty = bgSupport(DATA, '2026-07-01', '2026-07-02')
    expect(empty.total).toBe(0)
    expect(empty.thisPct).toBe(0)
  })
})
