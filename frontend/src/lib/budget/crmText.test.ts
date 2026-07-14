import { describe, it, expect } from 'vitest'
import { genCrmText } from './crmText'
import type { CalcResult } from './types'

const ZERO: CalcResult = {
  pmDays1: 0, pmDays2: 0, pmTechDays1: 0, pmTechDays2: 0,
  prodTechDays1: 0, prodTechDays2: 0, prodOutDays1: 0, prodOutDays2: 0,
  svcTechDays1: 0, svcTechDays2: 0, svcOutDays1: 0, svcOutDays2: 0,
  pmCost: 0, pmTechCost: 0, prodTechCost: 0, prodOutCost: 0, svcTechCost: 0, svcOutCost: 0,
  laborCost: 0, travelAllowance: 0, hotelCost: 0, hotelOutCost: 0, directCost: 0,
  totalCost: 0, salesAmount: 0, costRatio: null, ratioStatus: 'na',
}

describe('genCrmText', () => {
  it('四条编号句式齐备,人天保留 1 位小数', () => {
    const t = genCrmText({ ...ZERO, pmDays1: 3, pmDays2: 2 })
    expect(t).toContain('该项目评估后，')
    expect(t).toContain('1.预计项目经理5.0人天；')
    expect(t).toContain('2.相关产品部署原厂工程师')
    expect(t).toContain('3.其他服务原厂工程师')
    expect(t).toContain('4.直接成本')
  })

  it('第2条的原厂工程师人天**含 PM 模块内的技术服务人天**', () => {
    const t = genCrmText({ ...ZERO, prodTechDays1: 2, prodTechDays2: 1,
                          pmTechDays1: 3, pmTechDays2: 4, prodOutDays1: 5 })
    // 2 + 3 + 1 + 4 = 10.0;外包 5.0
    expect(t).toContain('2.相关产品部署原厂工程师10.0人天、外包5.0人天；')
  })

  it('第3条只统计其他服务的人天', () => {
    const t = genCrmText({ ...ZERO, svcTechDays1: 1, svcTechDays2: 2,
                          svcOutDays1: 3, svcOutDays2: 4 })
    expect(t).toContain('3.其他服务原厂工程师3.0人天、外包7.0人天；')
  })

  it('直接成本带千分位', () => {
    expect(genCrmText({ ...ZERO, directCost: 12345.6 })).toContain('4.直接成本¥12,345.6')
  })

  it('全零时各项显示 0.0 人天与 ¥0', () => {
    const t = genCrmText({ ...ZERO })
    expect(t).toContain('1.预计项目经理0.0人天；')
    expect(t).toContain('4.直接成本¥0')
  })
})
