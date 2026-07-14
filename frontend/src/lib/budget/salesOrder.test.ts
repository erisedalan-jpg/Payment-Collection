import { describe, it, expect } from 'vitest'
import { calcSalesOrder } from './salesOrder'
import type { BudgetConfig, CalcResult, MaterialKey } from './types'

const CFG: BudgetConfig = {
  version: 1,
  rates: { city1: { pm: 2000, tech: 1300, out: 1000 },
           city2: { pm: 1500, tech: 1000, out: 800 } },
  salesPrices: { pm: 2400, pm2ndc: 1800, eng1stc: 1500, eng2ndc: 1200 },
  materials: [
    { key: 'pm', code: 'JY-CPJF-OTHER-PM', name: 'PM一线' },
    { key: 'pm2ndc', code: 'JY-CPJF-OTHER-PM-2NDC-PISN', name: 'PM二线' },
    { key: 'eng1stc', code: 'JY-CPJF-AZ-OTHER-1STC-ENG', name: '工程师一线' },
    { key: 'eng2ndc', code: 'JY-CPJF-AZ-OTHER-2NDC-ENG', name: '工程师二线' },
  ],
  hotel: { type1: 450, capital: 350, other: 300, hk: 125, outType1: 300, outType2: 230 },
  allowance: { dom: 150, intl: 75 },
  fx: 6.8,
  margins: [{ value: 0.13, label: '13%' }, { value: 0.06, label: '6%' }],
  ratio: { min: 3, max: 15 },
  products: [], pmPhases: [], services: [],
}

const ZERO: CalcResult = {
  pmDays1: 0, pmDays2: 0, pmTechDays1: 0, pmTechDays2: 0,
  prodTechDays1: 0, prodTechDays2: 0, prodOutDays1: 0, prodOutDays2: 0,
  svcTechDays1: 0, svcTechDays2: 0, svcOutDays1: 0, svcOutDays2: 0,
  pmCost: 0, pmTechCost: 0, prodTechCost: 0, prodOutCost: 0, svcTechCost: 0, svcOutCost: 0,
  laborCost: 0,
  travelAllowance: 0, hotelCost: 0, hotelOutCost: 0, directCost: 0,
  totalCost: 0, salesAmount: 0, costRatio: null, ratioStatus: 'na',
}
const qtyOf = (rows: { key: MaterialKey; qty: number }[], k: MaterialKey) =>
  rows.find((r) => r.key === k)!.qty

describe('calcSalesOrder', () => {
  it('物料行的编号与名称来自配置,顺序与 materials 一致', () => {
    const o = calcSalesOrder({ ...ZERO }, 0.13, CFG)
    expect(o.rows.map((r) => r.key)).toEqual(['pm', 'pm2ndc', 'eng1stc', 'eng2ndc'])
    expect(o.rows[0].code).toBe('JY-CPJF-OTHER-PM')
    expect(o.rows[0].price).toBe(2400)
  })

  it('数量 = ceil(成本 ×(1+毛利率) ÷ 单价)', () => {
    const r = { ...ZERO, pmDays1: 10, pmCost: 20000 }          // 20000 × 1.13 = 22600
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'pm')).toBe(Math.ceil(22600 / 2400))   // 10
    expect(o.rows.find((x) => x.key === 'pm')!.amount).toBe(10 * 2400)
  })

  it('PM 模块内的技术服务人天并入工程师物料,不进 PM 物料', () => {
    const r = { ...ZERO, pmTechDays1: 4 }                       // 4 × 1300 = 5200
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'pm')).toBe(0)                         // PM 物料不受影响
    expect(qtyOf(o.rows, 'eng1stc')).toBe(Math.ceil(5200 * 1.13 / 1500))   // 4
  })

  it('工程师物料归集 技服 + 外包 两类成本', () => {
    const r = { ...ZERO, prodTechDays2: 2, svcOutDays2: 3 }     // 2×1000 + 3×800 = 4400
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'eng2ndc')).toBe(Math.ceil(4400 * 1.13 / 1200))   // 5
  })

  it('毛利率只作为 (1+margin) 的乘数,单价不随档位变', () => {
    const r = { ...ZERO, pmDays1: 10, pmCost: 20000 }
    const o6 = calcSalesOrder(r, 0.06, CFG)
    expect(o6.rows.find((x) => x.key === 'pm')!.price).toBe(2400)          // 单价不变
    expect(qtyOf(o6.rows, 'pm')).toBe(Math.ceil(20000 * 1.06 / 2400))      // 9
  })

  it('直接成本并到「最便宜的、数量>0 的」物料上,只并一个', () => {
    // eng2ndc(1200) 最便宜且有量 → 差旅并到它头上
    const r = { ...ZERO, prodTechDays2: 2, prodTechDays1: 1, directCost: 10000 }
    // eng2ndc 成本 2×1000=2000;eng1stc 成本 1×1300=1300
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'eng2ndc')).toBe(Math.ceil((10000 + 2000) * 1.13 / 1200))  // 12
    expect(qtyOf(o.rows, 'eng1stc')).toBe(Math.ceil(1300 * 1.13 / 1500))            // 1(未被并入)
  })

  it('最便宜的物料数量为 0 时,顺次并到下一个有量的物料', () => {
    const r = { ...ZERO, pmDays1: 10, pmCost: 20000, directCost: 5000 }
    // 只有 pm 有量 → 差旅并到 pm
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'pm')).toBe(Math.ceil((5000 + 20000) * 1.13 / 2400))       // 12
    expect(qtyOf(o.rows, 'eng2ndc')).toBe(0)
  })

  // ★原工具的 bug:所有物料数量都为 0 时,差旅费被静默丢弃,合计变 0。
  it('回归:纯差旅无人工时,差旅费不得丢失 —— 落到最便宜的物料上', () => {
    const r = { ...ZERO, directCost: 10000 }
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(qtyOf(o.rows, 'eng2ndc')).toBe(Math.ceil(10000 * 1.13 / 1200))           // 10
    expect(o.grandTotal).toBe(10 * 1200)
    expect(o.grandTotal).toBeGreaterThan(0)                    // 绝不能是 0
  })

  it('全零输入 → 所有数量为 0,合计为 0', () => {
    const o = calcSalesOrder({ ...ZERO }, 0.13, CFG)
    expect(o.rows.every((x) => x.qty === 0 && x.amount === 0)).toBe(true)
    expect(o.grandTotal).toBe(0)
  })

  it('合计 = 各行金额之和', () => {
    const r = { ...ZERO, pmDays1: 5, pmCost: 10000, prodTechDays1: 3, directCost: 2000 }
    const o = calcSalesOrder(r, 0.13, CFG)
    expect(o.grandTotal).toBe(o.rows.reduce((s, x) => s + x.amount, 0))
  })
})
