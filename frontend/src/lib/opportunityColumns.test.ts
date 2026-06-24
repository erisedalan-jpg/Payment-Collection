import { describe, it, expect } from 'vitest'
import { recentUpdateOf, OPP_COLUMNS, OPP_FIELDS, L4_OPTIONS } from './opportunityColumns'

describe('opportunityColumns', () => {
  it('L4 11 项与真实 orgL4 一致', () => {
    expect(L4_OPTIONS).toEqual(['小金融服务组','银行服务组','运营商服务组','京津服务组','河北服务组','广东二服务组','辽宁服务组','浙江服务组','上海一服务组','黑龙江服务组','吉林服务组'])
  })
  it('OPP_FIELDS 22 个可编辑字段', () => {
    expect(OPP_FIELDS).toHaveLength(22)
    expect(OPP_FIELDS).toContain('l4'); expect(OPP_FIELDS).not.toContain('firstReg')
  })
  it('OPP_COLUMNS 含 25 列', () => { expect(OPP_COLUMNS).toHaveLength(25) })
  it('recentUpdateOf: ≤7天=是, >7天/空=否', () => {
    const now = new Date('2026-06-24T12:00:00')
    expect(recentUpdateOf('2026-06-24 09:00', now)).toBe('是')
    expect(recentUpdateOf('2026-06-18', now)).toBe('是')   // 6 天前
    expect(recentUpdateOf('2026-06-17', now)).toBe('是')   // 7 天前(边界含)
    expect(recentUpdateOf('2026-06-16', now)).toBe('否')   // 8 天前
    expect(recentUpdateOf('', now)).toBe('否')
  })
})
