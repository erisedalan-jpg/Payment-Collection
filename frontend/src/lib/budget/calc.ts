import type {
  BudgetConfig, BudgetForm, CalcResult, DayCells, DirectCostForm, RatioStatus,
} from './types'

/** 合计参考人天。
 *
 *  分段规则(原工具刻意为之,不是 bug):qty === 1 时**不乘系数**,直接取 stdDays;
 *  qty > 1 才乘系数并四舍五入到 1 位小数;qty === 0 或 0 < qty < 1 一律得 0。
 *
 *  ⚠ 这个值**不参与任何金额计算** —— 它只是给填表人的参考,人天必须手动分配到四格里。
 */
export function productTotalDays(qty: number, stdDays: number, coefficient: number): number {
  const q = Number(qty) || 0
  const d = Number(stdDays) || 0
  const c = Number(coefficient) || 0
  if (q === 1) return d
  if (q > 1) return Math.round(q * d * c * 10) / 10
  return 0
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function addCells(acc: DayCells, c: DayCells): void {
  acc.tech1 += n(c.tech1); acc.tech2 += n(c.tech2)
  acc.out1 += n(c.out1);   acc.out2 += n(c.out2)
}

function directCostOf(d: DirectCostForm, cfg: BudgetConfig) {
  const { hotel, allowance, fx } = cfg
  const travelAllowance = n(d.allowanceDomDays) * allowance.dom
                        + n(d.allowanceIntlDays) * allowance.intl * fx
  const hotelCost = n(d.hotelType1) * hotel.type1
                  + n(d.hotelCapital) * hotel.capital
                  + n(d.hotelOther) * hotel.other
                  + n(d.hotelHk) * hotel.hk * fx
  const hotelOutCost = n(d.hotelOutType1) * hotel.outType1
                     + n(d.hotelOutType2) * hotel.outType2
  const directCost = travelAllowance + hotelCost + hotelOutCost
                   + n(d.localTransportBase)      // 本地交通:员工 base 地
                   + n(d.localTransportTrip)      // 当地交通:差旅期间
                   + n(d.interCityTransport)
  return { travelAllowance, hotelCost, hotelOutCost, directCost }
}

/** 全站唯一的概算计算口径。纯函数 —— 不碰 DOM、不读全局。 */
export function calcBudget(form: BudgetForm, cfg: BudgetConfig): CalcResult {
  const { rates } = cfg

  // 产品:标准 + 非标 + 自定义三段人天全部累加(合计参考人天不参与)
  const prod: DayCells = { tech1: 0, tech2: 0, out1: 0, out2: 0 }
  for (const p of form.products) {
    if (p.isCustom) {
      addCells(prod, p.custom)
    } else {
      addCells(prod, p.std)
      addCells(prod, p.nonStd)
    }
  }

  // 项目经理:五阶段求和。阶段只是分组标签,没有系数、没有工时基线。
  let pmDays1 = 0, pmDays2 = 0, pmTechDays1 = 0, pmTechDays2 = 0
  for (const ph of form.pmPhases) {
    pmDays1 += n(ph.pm1);     pmDays2 += n(ph.pm2)
    pmTechDays1 += n(ph.tech1); pmTechDays2 += n(ph.tech2)
  }

  const svc: DayCells = { tech1: 0, tech2: 0, out1: 0, out2: 0 }
  for (const s of form.services) addCells(svc, s.cells)

  const prodTechCost = prod.tech1 * rates.city1.tech + prod.tech2 * rates.city2.tech
  const prodOutCost  = prod.out1  * rates.city1.out  + prod.out2  * rates.city2.out
  const svcTechCost  = svc.tech1  * rates.city1.tech + svc.tech2  * rates.city2.tech
  const svcOutCost   = svc.out1   * rates.city1.out  + svc.out2   * rates.city2.out
  const pmCost       = pmDays1     * rates.city1.pm   + pmDays2     * rates.city2.pm
  const pmTechCost   = pmTechDays1 * rates.city1.tech + pmTechDays2 * rates.city2.tech

  const laborCost = pmCost + pmTechCost + prodTechCost + prodOutCost + svcTechCost + svcOutCost
  const { travelAllowance, hotelCost, hotelOutCost, directCost } = directCostOf(form.direct, cfg)

  const totalCost = laborCost + directCost
  const margin = n(form.margin)
  const salesAmount = totalCost * (1 + margin)

  // ★成本比例的分子是**销售下单金额(含税)**,不是未含税总成本。
  //  原工具页面文案写的是「销售下单金额/项目金额」,代码却漏乘 (1 + margin) —— 那是计算错误。
  //  修正后毛利率会影响成本比例(原来只影响下单金额)。
  const amountYuan = n(form.basic.projectAmount) * 10000
  let costRatio: number | null = null
  let ratioStatus: RatioStatus = 'na'
  if (amountYuan > 0 && totalCost !== 0) {
    costRatio = (salesAmount / amountYuan) * 100
    ratioStatus = costRatio < cfg.ratio.min ? 'low'
                : costRatio > cfg.ratio.max ? 'high'
                : 'normal'                                  // 闭区间:恰好等于上下限都算正常
  }

  return {
    pmDays1, pmDays2, pmTechDays1, pmTechDays2,
    prodTechDays1: prod.tech1, prodTechDays2: prod.tech2,
    prodOutDays1: prod.out1,   prodOutDays2: prod.out2,
    svcTechDays1: svc.tech1,   svcTechDays2: svc.tech2,
    svcOutDays1: svc.out1,     svcOutDays2: svc.out2,
    pmCost, pmTechCost, prodTechCost, prodOutCost, svcTechCost, svcOutCost,
    laborCost,
    travelAllowance, hotelCost, hotelOutCost, directCost,
    totalCost, salesAmount, costRatio, ratioStatus,
  }
}

/** 按配置生成初始表单:PM 五阶段按配置预填(名称 + 工作内容模板),毛利率取首档。 */
export function emptyForm(cfg: BudgetConfig): BudgetForm {
  return {
    basic: {
      quoteName: '', customerName: '', salesName: '', location: '',
      projectAmount: null, projectLevel: '', customerLevel: '',
      signType: '', thirdParty: '',
    },
    products: [],
    pmPhases: cfg.pmPhases.map((p) => ({
      name: p.name, pm1: 0, pm2: 0, tech1: 0, tech2: 0, note: p.content,
    })),
    services: [],
    direct: {
      allowanceDomDays: 0, allowanceIntlDays: 0,
      hotelType1: 0, hotelCapital: 0, hotelOther: 0, hotelHk: 0,
      hotelOutType1: 0, hotelOutType2: 0,
      localTransportBase: 0, localTransportTrip: 0, interCityTransport: 0,
    },
    margin: cfg.margins[0]?.value ?? 0.13,
    ratioExplanation: '',
    crmText: '',
    crmUserEdited: false,
  }
}
