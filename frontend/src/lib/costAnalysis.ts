import type { Project, ProjectPmis } from '@/types/analysis'
import { riskReasons, TOTAL_OVERSPEND_CATS } from './riskReasons'

export type CostStatus = '超支大于5k' | '超支不足5k' | '未超支' | '未获取原项目预算'

/** 成本状态三档(与卡「总成本超支数」/首页/projects 同源 riskReasons 口径):
 *  未超支 = 非总成本超支;超支再按 overspendAmount 是否 > 5000 分档(与卡「超支大于5000」子项一致)。
 *  不再用 remaining、不再对 XS 强制判断 —— XS 由整页 /data 标签排除统一处理,不在此层硬编码。 */
export function costStatusOf(totalOverspend: boolean, overspendAmount: number): CostStatus {
  if (!totalOverspend) return '未超支'
  return overspendAmount > 5000 ? '超支大于5k' : '超支不足5k'
}

/** 售前服务类且原项目(relatedClosedId)总预算=0(含原项目缺失)→未获取原项目预算。与 buildCostRows presale totalBudget 同口径。 */
export function noOriginBudget(p: Project, pmis: Record<string, ProjectPmis>): boolean {
  if (!p.isPresale) return false
  const oc = (p.relatedClosedId && pmis[p.relatedClosedId]) ? ((pmis[p.relatedClosedId] as any).cost ?? {}) : {}
  return Number(oc.总预算 ?? 0) === 0
}

export interface CostRow {
  projectId: string; projectName: string; projectType: string
  orgL3: string; orgL3_1: string; orgL4: string; manager: string
  amount: number; status: CostStatus
  totalBudget: number; actualCost: number; remaining: number
  deliveryDeptRemaining: number; deliveryOutsourceRemaining: number
  deliveryStatus: DeliveryStatus
  totalOverspend: boolean; deliveryOverspend: boolean; overspendAmount: number
  riskLevel: string; openRisks: number; riskMajorCats: string[]
  noOriginBudget: boolean
}

/** 全部主域项目装配成本行(明细表用)。
 * 售前服务类(isPresale):总预算=原项目总预算(缺→0);剩余/已核算随毛利超支额定——
 *   有毛利数据 → 剩余=−overspendAmount(超支即为负,与成本状态一致)、已核算=总预算+overspendAmount(含现项目实际成本);
 *   无毛利数据(overspendAmount=null)→ 回退原项目预算视图(已核算=原核算+售前自身核算、剩余=总−已核算)。
 * 成本状态/超支判定(status/totalOverspend/deliveryOverspend)统一走 riskReasons,与卡/首页/projects 同源。
 * 交付成本状态由本行两交付剩余列判定(售前同用自身 deliveryCosts)。XS 不在此硬编码剔除,交整页 /data 标签排除。 */
export function buildCostRows(projects: Project[], pmis: Record<string, ProjectPmis>): CostRow[] {
  return projects.map((p) => {
    const m = (pmis[p.projectId] ?? {}) as any
    const noOrig = noOriginBudget(p, pmis)
    const risk = (m.risk ?? {}) as Record<string, any>
    const riskMajorCats = [...new Set(
      ((m.riskRecords ?? []) as Record<string, any>[])
        .map((rr) => String(rr['风险大类'] ?? '').trim()).filter((sv) => sv !== ''),
    )]
    const cost = m.cost ?? {}
    const dc = p.deliveryCosts ?? []
    const findRem = (cat: string) => Number(dc.find((c: any) => c.类别 === cat)?.剩余预算 ?? 0)
    const deptRem = findRem('交付部门人工成本')
    const outRem = findRem('交付外包服务成本')

    // 整体超支额(元,来自毛利 profit_loss:非售前=实际成本−预算成本、售前=实际成本−原剩余预算);null=无毛利数据
    const rawOverspend = p.overspendAmount
    const overspendAmount = Number(rawOverspend ?? 0)

    // 售前:总预算=原项目总预算(缺→0);有毛利数据 → 剩余=−超支额(超支即为负,与成本状态天然一致)、
    //   已核算=总预算+超支额(=原核算+现项目实际成本;超支时现项目核算必非 0);无毛利数据回退原项目预算视图。
    // 非售前:读自身 cost。
    let totalBudget: number, actualCost: number, remaining: number
    if (p.isPresale) {
      const oc = (p.relatedClosedId && pmis[p.relatedClosedId]) ? ((pmis[p.relatedClosedId] as any).cost ?? {}) : {}
      totalBudget = Number(oc.总预算 ?? 0)
      if (rawOverspend == null) {
        actualCost = Number(oc.核算 ?? 0) + Number(cost.核算 ?? 0)
        remaining = totalBudget - actualCost
      } else {
        remaining = -overspendAmount
        actualCost = totalBudget - remaining
      }
    } else {
      totalBudget = Number(cost.总预算 ?? 0)
      actualCost = Number(cost.核算 ?? 0)
      remaining = Number(cost.剩余预算 ?? 0)
    }

    // 超支判定:复用 riskReasons(售前/异常按自身,与 /projects、首页、卡「总成本超支」同源)
    const cats = riskReasons(p, m as ProjectPmis, noOrig).map((rr) => rr.category)
    const totalOverspend = cats.some((c) => (TOTAL_OVERSPEND_CATS as readonly string[]).includes(c))

    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      projectType: (m.status?.项目类型 ?? '').trim(),
      orgL3: (m.team?.L3部门 ?? '').trim(),
      orgL3_1: (p.orgL3_1 ?? '').trim(),
      orgL4: (p.orgL4 ?? '').trim(),
      manager: (p.projectManager ?? '').trim(),
      amount: Number(p.paymentPmis?.contract ?? 0),
      // 成本状态与超支判定同源 riskReasons(不看 remaining;剩余预算仅金额展示)
      status: noOrig ? '未获取原项目预算' : costStatusOf(totalOverspend, overspendAmount),
      totalBudget, actualCost, remaining,
      deliveryDeptRemaining: deptRem,
      deliveryOutsourceRemaining: outRem,
      deliveryStatus: noOrig ? '未获取原项目预算' : deliveryStatusOf(deptRem, outRem),
      totalOverspend,
      deliveryOverspend: cats.includes('交付成本超支'),
      overspendAmount,
      riskLevel: String(risk.最高等级 ?? '') || '无',
      openRisks: Number(risk.未关闭风险数 ?? 0),
      riskMajorCats,
      noOriginBudget: noOrig,
    }
  })
}

export interface CostKpis { total: number; notOverspent: number; totalOverspend: number; totalOverspendOver5k: number; deliveryOverspend: number; noOriginBudget: number }
/** 成本卡计数(不剔 XS):总数=全部行;未超支=两维度皆否;总/交付超支沿用 riskReasons 派生布尔;大于5000=overspendAmount>5000。 */
export function costKpis(rows: CostRow[]): CostKpis {
  const k: CostKpis = { total: 0, notOverspent: 0, totalOverspend: 0, totalOverspendOver5k: 0, deliveryOverspend: 0, noOriginBudget: 0 }
  for (const r of rows) {
    k.total++
    if (r.noOriginBudget) { k.noOriginBudget++; continue }
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

export type DeliveryStatus = '未超支' | '交付预算超支' | '交付外包超支' | '原厂外包均超支' | '未获取原项目预算'

/** 交付成本状态:由交付部门剩余、交付外包剩余两列判定。<0=超支,≥0=不超支(含 =0)。 */
export function deliveryStatusOf(deptRemain: number, outsourceRemain: number): DeliveryStatus {
  const deptOver = deptRemain < 0
  const outOver = outsourceRemain < 0
  if (deptOver && outOver) return '原厂外包均超支'
  if (deptOver) return '交付预算超支'
  if (outOver) return '交付外包超支'
  return '未超支'
}
