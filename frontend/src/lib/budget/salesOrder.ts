import type { BudgetConfig, CalcResult, MaterialKey } from './types'

export interface SalesOrderRow {
  key: MaterialKey
  code: string
  name: string
  price: number
  qty: number
  amount: number
}
export interface SalesOrder {
  rows: SalesOrderRow[]
  grandTotal: number
}

/** 销售下单建议:成本 → 物料数量的逆运算。
 *
 *  两处与原工具不同:
 *  1. directCost 由参数传入 —— 原工具从 DOM 文本 "¥12,345" 反解字符串。
 *  2. 所有物料数量都为 0 而差旅 > 0 时(纯差旅、无人工),原工具把差旅费**静默丢弃**、
 *     合计变 0。这里改为落到最便宜的物料上。
 */
export function calcSalesOrder(r: CalcResult, margin: number, cfg: BudgetConfig): SalesOrder {
  const { rates, salesPrices } = cfg
  const m = 1 + (Number(margin) || 0)

  // PM 模块内的技术服务人天并入「工程师」物料,不进 PM 物料 —— 原工具的既定口径。
  const cost: Record<MaterialKey, number> = {
    pm: r.pmDays1 * rates.city1.pm,
    pm2ndc: r.pmDays2 * rates.city2.pm,
    eng1stc: (r.prodTechDays1 + r.pmTechDays1 + r.svcTechDays1) * rates.city1.tech
           + (r.prodOutDays1 + r.svcOutDays1) * rates.city1.out,
    eng2ndc: (r.prodTechDays2 + r.pmTechDays2 + r.svcTechDays2) * rates.city2.tech
           + (r.prodOutDays2 + r.svcOutDays2) * rates.city2.out,
  }

  const qtyFor = (key: MaterialKey, extra = 0): number => {
    const price = salesPrices[key]
    if (!price || price <= 0) return 0
    return Math.ceil(((cost[key] + extra) * m) / price)
  }

  const qty: Record<MaterialKey, number> = {
    pm: qtyFor('pm'), pm2ndc: qtyFor('pm2ndc'),
    eng1stc: qtyFor('eng1stc'), eng2ndc: qtyFor('eng2ndc'),
  }

  // 直接成本(差旅)寄生到最便宜的、数量 > 0 的物料上,只并一个。
  if (r.directCost > 0) {
    const byPriceAsc = [...cfg.materials].sort((a, b) => salesPrices[a.key] - salesPrices[b.key])
    const host = byPriceAsc.find((x) => qty[x.key] > 0)
      // ★没有任何物料有量(纯差旅、无人工) → 落到最便宜的那个,绝不能把差旅费丢掉
      ?? byPriceAsc[0]
    if (host) qty[host.key] = qtyFor(host.key, r.directCost)
  }

  const rows: SalesOrderRow[] = cfg.materials.map((mat) => ({
    key: mat.key,
    code: mat.code,
    name: mat.name,
    price: salesPrices[mat.key],
    qty: qty[mat.key],
    amount: qty[mat.key] * salesPrices[mat.key],
  }))

  return { rows, grandTotal: rows.reduce((s, x) => s + x.amount, 0) }
}
