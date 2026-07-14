import { describe, it, expect } from 'vitest'
import { productTotalDays, calcBudget, emptyForm } from './calc'
import type { BudgetConfig, BudgetForm, DayCells } from './types'

// 与后端 budget_config.DEFAULT_CONFIG 同值的最小配置(测试自带,不依赖网络)
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
  margins: [{ value: 0.13, label: '13%（含产品）' }, { value: 0.06, label: '6%（纯服务）' }],
  ratio: { min: 3, max: 15 },
  products: [{ id: '1.1', name: '防火墙', coefficient: 0.8, stdDays: 1.5,
               stdDesc: '标准说明', nonstdDesc: '非标说明' }],
  pmPhases: [{ name: '项目启动阶段', content: '模板1' }, { name: '项目规划阶段', content: '模板2' },
             { name: '项目执行阶段', content: '模板3' }, { name: '项目收尾阶段', content: '模板4' },
             { name: '其他工作', content: '模板5' }],
  services: [{ name: '巡检服务', desc: '巡检说明' },
             { name: '其他服务', desc: '用户自定义服务项', isOther: true }],
}

const Z: DayCells = { tech1: 0, tech2: 0, out1: 0, out2: 0 }
const cells = (p: Partial<DayCells>): DayCells => ({ ...Z, ...p })

function form(patch: Partial<BudgetForm> = {}): BudgetForm {
  return { ...emptyForm(CFG), ...patch }
}

describe('productTotalDays:合计参考人天的分段规则', () => {
  it('qty===1 时不乘系数,直接取 stdDays(刻意为之,不是 bug)', () => {
    expect(productTotalDays(1, 1.5, 0.8)).toBe(1.5)
    expect(productTotalDays(1, 6.375, 0.6)).toBe(6.375)
  })
  it('qty>1 时乘系数并四舍五入到 1 位小数', () => {
    expect(productTotalDays(3, 1.5, 0.8)).toBe(3.6)      // 3*1.5*0.8 = 3.6
    expect(productTotalDays(2, 6.375, 0.6)).toBe(7.7)    // 7.65 → 7.7
  })
  it('qty===0 或 0<qty<1 一律得 0', () => {
    expect(productTotalDays(0, 1.5, 0.8)).toBe(0)
    expect(productTotalDays(0.5, 1.5, 0.8)).toBe(0)
  })
})

describe('calcBudget:人工成本', () => {
  it('产品人天只认手填的四格,合计参考人天不参与任何金额计算', () => {
    const r = calcBudget(form({
      products: [{
        uid: 'u1', id: '1.1', name: '防火墙', isCustom: false,
        qty: 100, stdDays: 10, coefficient: 1,        // 参考人天会很大…
        std: cells({ tech1: 2, out2: 3 }),            // …但金额只认这四格
        nonStdDesc: '', nonStd: Z,
        customDesc: '', custom: Z,
      }],
    }), CFG)
    expect(r.prodTechDays1).toBe(2)
    expect(r.prodOutDays2).toBe(3)
    expect(r.prodTechCost).toBe(2 * 1300)
    expect(r.prodOutCost).toBe(3 * 800)
    expect(r.laborCost).toBe(2 * 1300 + 3 * 800)
  })

  it('标准 + 非标 + 自定义三段人天全部累加', () => {
    const r = calcBudget(form({
      products: [
        { uid: 'u1', id: '1.1', name: '防火墙', isCustom: false,
          qty: 1, stdDays: 1.5, coefficient: 0.8,
          std: cells({ tech1: 1 }), nonStdDesc: '复杂场景', nonStd: cells({ tech1: 2 }),
          customDesc: '', custom: Z },
        { uid: 'u2', id: 'other', name: '自定义X', isCustom: true,
          qty: 0, stdDays: 0, coefficient: 0, std: Z, nonStdDesc: '', nonStd: Z,
          customDesc: '定制工作', custom: cells({ tech1: 4 }) },
      ],
    }), CFG)
    expect(r.prodTechDays1).toBe(7)                    // 1 + 2 + 4
    expect(r.prodTechCost).toBe(7 * 1300)
  })

  it('PM:五阶段求和,PM 人天与技服人天分别按各自单价计价', () => {
    const f = form()
    f.pmPhases[0].pm1 = 3
    f.pmPhases[1].pm2 = 2
    f.pmPhases[2].tech1 = 5
    f.pmPhases[3].tech2 = 1
    const r = calcBudget(f, CFG)
    expect(r.pmDays1).toBe(3)
    expect(r.pmDays2).toBe(2)
    expect(r.pmTechDays1).toBe(5)
    expect(r.pmTechDays2).toBe(1)
    expect(r.pmCost).toBe(3 * 2000 + 2 * 1500)
    expect(r.pmTechCost).toBe(5 * 1300 + 1 * 1000)
  })

  it('其他服务:按四格累加计价', () => {
    const r = calcBudget(form({
      services: [{ uid: 's1', name: '巡检服务', isOther: false, content: '巡检',
                   cells: cells({ tech2: 2, out1: 1 }) }],
    }), CFG)
    expect(r.svcTechDays2).toBe(2)
    expect(r.svcOutDays1).toBe(1)
    expect(r.svcTechCost).toBe(2 * 1000)
    expect(r.svcOutCost).toBe(1 * 1000)
  })
})

describe('calcBudget:直接成本', () => {
  it('差补/住宿/外包差旅/三项交通全部累加,美金项按汇率折算', () => {
    const r = calcBudget(form({
      direct: {
        allowanceDomDays: 2, allowanceIntlDays: 1,
        hotelType1: 1, hotelCapital: 1, hotelOther: 1, hotelHk: 1,
        hotelOutType1: 1, hotelOutType2: 1,
        localTransportBase: 100, localTransportTrip: 200, interCityTransport: 300,
      },
    }), CFG)
    expect(r.travelAllowance).toBeCloseTo(2 * 150 + 1 * 75 * 6.8, 6)     // 300 + 510 = 810
    expect(r.hotelCost).toBeCloseTo(450 + 350 + 300 + 125 * 6.8, 6)      // 1100 + 850 = 1950
    expect(r.hotelOutCost).toBe(300 + 230)
    expect(r.directCost).toBeCloseTo(810 + 1950 + 530 + 100 + 200 + 300, 6)
  })

  it('本地交通(base地)与当地交通(差旅)是两个类目,都要计入', () => {
    const r = calcBudget(form({
      direct: { ...emptyForm(CFG).direct, localTransportBase: 111, localTransportTrip: 222 },
    }), CFG)
    expect(r.directCost).toBe(333)
  })
})

describe('calcBudget:成本比例(分子必须含税)', () => {
  // ★这是本次重构对原工具的核心修正:原代码分子用未含税总成本,漏乘 (1 + margin)。
  it('成本比例 = 总成本 ×(1+毛利率) ÷ 项目金额 —— 分子含税', () => {
    const f = form({ margin: 0.13 })
    f.basic.projectAmount = 100                       // 100 万元
    f.pmPhases[0].pm1 = 40                            // 40 × 2000 = 80000 人工
    f.direct.localTransportBase = 20000               // 20000 直接成本
    const r = calcBudget(f, CFG)
    expect(r.totalCost).toBe(100000)
    expect(r.salesAmount).toBeCloseTo(113000, 6)
    expect(r.costRatio).toBeCloseTo(11.3, 6)          // 113000 / 1000000 = 11.3%
    // 反向钉死:绝不能是未含税的 10.0%
    expect(r.costRatio).not.toBeCloseTo(10.0, 6)
    expect(r.ratioStatus).toBe('normal')
  })

  it('毛利率会影响成本比例(原工具只影响下单金额)', () => {
    const f = form({ margin: 0.06 })
    f.basic.projectAmount = 100
    f.pmPhases[0].pm1 = 50                            // 100000 总成本
    const r = calcBudget(f, CFG)
    expect(r.costRatio).toBeCloseTo(10.6, 6)          // 106000 / 1000000
  })

  it('三态:低于下限 low、区间内 normal、高于上限 high', () => {
    // 项目金额 1000 万 → 分母 10,000,000 元;PM 一类人天 × 2000 = 总成本
    const mk = (pmDays: number) => {
      const f = form({ margin: 0.13 })
      f.basic.projectAmount = 1000
      f.pmPhases[0].pm1 = pmDays
      return calcBudget(f, CFG)
    }
    expect(mk(10).ratioStatus).toBe('low')      // 20000×1.13 = 22600 → 0.226%
    expect(mk(300).ratioStatus).toBe('normal')  // 600000×1.13 = 678000 → 6.78%
    expect(mk(1000).ratioStatus).toBe('high')   // 2000000×1.13 = 2260000 → 22.6%
  })

  it('三态边界:恰好等于下限/上限都判 normal(闭区间)', () => {
    // 构造 costRatio 恰好 = 3:  totalCost × 1.13 / (amount×10000) × 100 = 3
    const f = form({ margin: 0.13 })
    f.basic.projectAmount = 100                       // 分母 1,000,000
    // 需要 salesAmount = 30000 → totalCost = 30000/1.13
    f.direct.localTransportBase = 30000 / 1.13
    const lo = calcBudget(f, CFG)
    expect(lo.costRatio).toBeCloseTo(3, 6)
    expect(lo.ratioStatus).toBe('normal')

    f.direct.localTransportBase = 150000 / 1.13       // salesAmount = 150000 → 15%
    const hi = calcBudget(f, CFG)
    expect(hi.costRatio).toBeCloseTo(15, 6)
    expect(hi.ratioStatus).toBe('normal')
  })

  it('三态:略低于 3% → low;略高于 15% → high', () => {
    const f = form({ margin: 0.13 })
    f.basic.projectAmount = 100
    f.direct.localTransportBase = 20000 / 1.13        // 2%
    expect(calcBudget(f, CFG).ratioStatus).toBe('low')
    f.direct.localTransportBase = 200000 / 1.13       // 20%
    expect(calcBudget(f, CFG).ratioStatus).toBe('high')
  })

  it('项目金额为空或<=0 → costRatio 为 null,状态 na(不判定不拦截)', () => {
    const f = form()
    f.basic.projectAmount = null
    f.pmPhases[0].pm1 = 10
    const r1 = calcBudget(f, CFG)
    expect(r1.costRatio).toBeNull()
    expect(r1.ratioStatus).toBe('na')
    f.basic.projectAmount = 0
    expect(calcBudget(f, CFG).ratioStatus).toBe('na')
  })

  it('总成本为 0 → costRatio 为 null,状态 na', () => {
    const f = form()
    f.basic.projectAmount = 100
    const r = calcBudget(f, CFG)
    expect(r.totalCost).toBe(0)
    expect(r.costRatio).toBeNull()
    expect(r.ratioStatus).toBe('na')
  })

  it('阈值取自配置,不是写死的 3/15', () => {
    const cfg2 = { ...CFG, ratio: { min: 8, max: 20 } }
    const f = form({ margin: 0.13 })
    f.basic.projectAmount = 100
    f.direct.localTransportBase = 50000 / 1.13        // 5%
    expect(calcBudget(f, cfg2).ratioStatus).toBe('low')   // 用默认 3/15 会是 normal
  })
})

describe('emptyForm', () => {
  it('按配置预填 PM 五阶段(名称与工作内容模板来自配置)', () => {
    const f = emptyForm(CFG)
    expect(f.pmPhases.map((p) => p.name)).toEqual(
      ['项目启动阶段', '项目规划阶段', '项目执行阶段', '项目收尾阶段', '其他工作'])
    expect(f.pmPhases[0].note).toBe('模板1')
    expect(f.pmPhases.every((p) => p.pm1 === 0 && p.pm2 === 0)).toBe(true)
  })
  it('毛利率取配置里的第一档', () => {
    expect(emptyForm(CFG).margin).toBe(0.13)
  })
  it('产品/服务初始为空,直接成本全 0', () => {
    const f = emptyForm(CFG)
    expect(f.products).toEqual([])
    expect(f.services).toEqual([])
    expect(f.direct.localTransportBase).toBe(0)
  })
})
