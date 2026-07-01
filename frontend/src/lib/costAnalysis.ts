import type { Project, ProjectPmis } from '@/types/analysis'
import { riskReasons } from './riskReasons'

export type CostStatus = '超支大于5k' | '超支不足5k' | '未超支'

export function isXs(projectId: string): boolean {
  return (projectId ?? '').toUpperCase().startsWith('XS')
}

/** 成本状态三档(忠实对方):XS 强制未超支;null→0;rb<-5000 大于5k;-5000≤rb<0 不足5k;rb≥0 未超支。 */
export function costStatusOf(remainingBudget: number | null | undefined, projectId: string): CostStatus {
  if (isXs(projectId)) return '未超支'
  const rb = remainingBudget == null ? 0 : Number(remainingBudget)
  if (rb < -5000) return '超支大于5k'
  if (rb < 0) return '超支不足5k'
  return '未超支'
}

export interface CostRow {
  projectId: string; projectName: string; projectType: string
  orgL3: string; orgL3_1: string; orgL4: string; manager: string
  amount: number; status: CostStatus
  totalBudget: number; actualCost: number; remaining: number; xs: boolean
  deliveryDeptRemaining: number; deliveryOutsourceRemaining: number
  deliveryStatus: DeliveryStatus
  totalOverspend: boolean; deliveryOverspend: boolean; overspendAmount: number
}

/** 全部主域项目装配成本行(明细表用;XS 保留并标记)。
 * 售前服务类(isPresale + relatedClosedId)的 总预算/已核算/剩余 回退原项目:
 *   总预算=原项目总预算; 已核算=原项目核算 + 售前自身核算; 剩余=总预算 − 已核算。
 * 超支判定(totalOverspend/deliveryOverspend)沿用 riskReasons(售前用自身),与 /projects 同源。
 * 交付成本状态由本行两交付剩余列判定(售前同样用自身 deliveryCosts/delivery_analysis.csv)。 */
export function buildCostRows(projects: Project[], pmis: Record<string, ProjectPmis>): CostRow[] {
  return projects.map((p) => {
    const m = (pmis[p.projectId] ?? {}) as any
    const cost = m.cost ?? {}
    const dc = p.deliveryCosts ?? []
    const findRem = (cat: string) => Number(dc.find((c: any) => c.类别 === cat)?.剩余预算 ?? 0)
    const deptRem = findRem('交付部门人工成本')
    const outRem = findRem('交付外包服务成本')

    // 售前三列回退原项目;否则读自身
    const originCost = (p.isPresale && p.relatedClosedId && pmis[p.relatedClosedId])
      ? ((pmis[p.relatedClosedId] as any).cost ?? {}) : null
    let totalBudget: number, actualCost: number, remaining: number
    if (originCost) {
      totalBudget = Number(originCost.总预算 ?? 0)
      actualCost = Number(originCost.核算 ?? 0) + Number(cost.核算 ?? 0)
      remaining = totalBudget - actualCost
    } else {
      totalBudget = Number(cost.总预算 ?? 0)
      actualCost = Number(cost.核算 ?? 0)
      remaining = Number(cost.剩余预算 ?? 0)
    }

    // 超支判定:复用 riskReasons(售前/异常按自身,与 /projects 一致)
    const cats = riskReasons(p, m as ProjectPmis).map((rr) => rr.category)

    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      projectType: (m.status?.项目类型 ?? '').trim(),
      orgL3: (m.team?.L3部门 ?? '').trim(),
      orgL3_1: (p.orgL3_1 ?? '').trim(),
      orgL4: (p.orgL4 ?? '').trim(),
      manager: (p.projectManager ?? '').trim(),
      amount: Number(p.paymentPmis?.contract ?? 0),
      status: costStatusOf(remaining, p.projectId),
      totalBudget, actualCost, remaining,
      xs: isXs(p.projectId),
      deliveryDeptRemaining: deptRem,
      deliveryOutsourceRemaining: outRem,
      deliveryStatus: deliveryStatusOf(deptRem, outRem),
      totalOverspend: cats.includes('总成本超支'),
      deliveryOverspend: cats.includes('交付成本超支'),
      overspendAmount: Number(p.overspendAmount ?? 0),
    }
  })
}

export interface CostKpis { total: number; notOverspent: number; totalOverspend: number; totalOverspendOver5k: number; deliveryOverspend: number }
/** 成本卡计数(不剔 XS):总数=全部行;未超支=两维度皆否;总/交付超支沿用 riskReasons 派生布尔;大于5000=overspendAmount>5000。 */
export function costKpis(rows: CostRow[]): CostKpis {
  const k: CostKpis = { total: 0, notOverspent: 0, totalOverspend: 0, totalOverspendOver5k: 0, deliveryOverspend: 0 }
  for (const r of rows) {
    k.total++
    if (!r.totalOverspend && !r.deliveryOverspend) k.notOverspent++
    if (r.totalOverspend) { k.totalOverspend++; if (r.overspendAmount > 5000) k.totalOverspendOver5k++ }
    if (r.deliveryOverspend) k.deliveryOverspend++
  }
  return k
}

export interface CostL4Dist { orgL4: string; under5k: number; over5k: number }
export function costL4Dist(rows: CostRow[]): CostL4Dist[] {
  const m: Record<string, CostL4Dist> = {}
  for (const r of rows) {
    if (r.xs) continue
    const d = r.orgL4 || '未知'
    if (!m[d]) m[d] = { orgL4: d, under5k: 0, over5k: 0 }
    if (r.status === '超支不足5k') m[d].under5k++
    else if (r.status === '超支大于5k') m[d].over5k++
  }
  return Object.values(m).sort((a, b) => a.orgL4.localeCompare(b.orgL4))
}

export interface CostL4Summary { orgL4: string; total: number; normal: number; under5k: number; over5k: number; over5kRatio: number; contractTotal: number; remainingTotal: number; deliveryDeptRemaining: number; deliveryOutsourceRemaining: number }
export function costL4Summary(rows: CostRow[]): CostL4Summary[] {
  const m: Record<string, CostL4Summary> = {}
  for (const r of rows) {
    if (r.xs) continue
    const d = r.orgL4 || '未知'
    if (!m[d]) m[d] = { orgL4: d, total: 0, normal: 0, under5k: 0, over5k: 0, over5kRatio: 0, contractTotal: 0, remainingTotal: 0, deliveryDeptRemaining: 0, deliveryOutsourceRemaining: 0 }
    m[d].total++
    m[d].contractTotal += r.amount
    m[d].remainingTotal += r.remaining
    m[d].deliveryDeptRemaining += r.deliveryDeptRemaining
    m[d].deliveryOutsourceRemaining += r.deliveryOutsourceRemaining
    if (r.status === '未超支') m[d].normal++
    else if (r.status === '超支不足5k') m[d].under5k++
    else if (r.status === '超支大于5k') m[d].over5k++
  }
  return Object.values(m)
    .map((s) => ({ ...s, over5kRatio: s.total > 0 ? +((s.over5k / s.total) * 100).toFixed(1) : 0 }))
    .sort((a, b) => a.orgL4.localeCompare(b.orgL4))
}

export type DeliveryStatus = '未超支' | '交付预算超支' | '交付外包超支' | '原厂外包均超支'

/** 交付成本状态:由交付部门剩余、交付外包剩余两列判定。<0=超支,≥0=不超支(含 =0)。 */
export function deliveryStatusOf(deptRemain: number, outsourceRemain: number): DeliveryStatus {
  const deptOver = deptRemain < 0
  const outOver = outsourceRemain < 0
  if (deptOver && outOver) return '原厂外包均超支'
  if (deptOver) return '交付预算超支'
  if (outOver) return '交付外包超支'
  return '未超支'
}
