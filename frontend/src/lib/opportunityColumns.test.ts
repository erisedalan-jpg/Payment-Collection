import { describe, it, expect } from 'vitest'
import { recentUpdateOf, OPP_COLUMNS, OPP_FIELDS, L4_OPTIONS, DEFAULT_VISIBLE } from './opportunityColumns'

describe('opportunityColumns', () => {
  it('L4 11 项与真实 orgL4 一致', () => {
    expect(L4_OPTIONS).toEqual(['小金融服务组','银行服务组','运营商服务组','京津服务组','河北服务组','广东二服务组','辽宁服务组','浙江服务组','上海一服务组','黑龙江服务组','吉林服务组'])
  })
  it('OPP_FIELDS 23 个可编辑字段', () => {
    expect(OPP_FIELDS).toHaveLength(23)
    expect(OPP_FIELDS).toContain('l4'); expect(OPP_FIELDS).toContain('opportunityLevel')
    expect(OPP_FIELDS).not.toContain('firstReg')
  })
  it('OPP_COLUMNS 含 26 列', () => { expect(OPP_COLUMNS).toHaveLength(26) })
  it('商机级别列: select P1-P4, 位于 amountWan 与 expectedDate 之间, 默认显示', () => {
    const keys = OPP_COLUMNS.map((c) => c.key)
    const ai = keys.indexOf('amountWan'), oi = keys.indexOf('opportunityLevel'), ei = keys.indexOf('expectedDate')
    expect(oi).toBe(ai + 1)
    expect(ei).toBe(oi + 1)
    const col = OPP_COLUMNS.find((c) => c.key === 'opportunityLevel')!
    expect(col.type).toBe('select')
    expect(col.options).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(DEFAULT_VISIBLE).toContain('opportunityLevel')
  })
  it('recentUpdateOf: ≤7天=是, >7天/空=否', () => {
    const now = new Date('2026-06-24T12:00:00')
    expect(recentUpdateOf('2026-06-24 09:00', now)).toBe('是')
    expect(recentUpdateOf('2026-06-18', now)).toBe('是')   // 6 天前
    expect(recentUpdateOf('2026-06-17', now)).toBe('是')   // 7 天前(边界含)
    expect(recentUpdateOf('2026-06-16', now)).toBe('否')   // 8 天前
    expect(recentUpdateOf('', now)).toBe('否')
  })
})
