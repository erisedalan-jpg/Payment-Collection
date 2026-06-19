import type { Project, ProjectPmis, PaymentRecordsEntry, Paymentrecords } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
import { isAnomalous } from './anomaly'
import { inRange, actualInRange } from './paymentRange'

// 项目总览(/)的纯计算层(spec 4.1)。两套口径:KPI 用主域 projects[] 聚合;
// 回款重点带与 /payment 同口径(全部门 isPaymentRelated 节点)——微块点击钻的就是 /payment。

export interface OverviewKpis {
  total: number
  active: number
  paused: number
  highRisk: number
  overspend: number
  paymentRatio: number | null
}

/** 回款达成率:分子=Σ流水(排除异常)，分母=Σ计划 expectedTotal(排除异常)。
 *  paymentRecords 传入时分子用全量流水(start=end=''=全时)；未传时退化节点 actualTotal。 */
export function computeKpis(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  paymentRecords?: Paymentrecords,
): OverviewKpis {
  let active = 0
  let paused = 0
  let overspend = 0
  let highRisk = 0
  let exp = 0
  let act = 0
  for (const p of projects) {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    if (m.status?.项目状态 === '实施中') active++
    if (m.status?.是否暂停 === true) paused++
    if (m.cost?.项目超支 === true) overspend++
    if (p.health?.riskAbnormal) highRisk++
    // 回款达成率排除异常项目
    if (!isAnomalous(p)) {
      exp += p.payment?.expectedTotal ?? 0
      // 分子=Σ流水(全时)；无流水表时退化节点汇总
      act += paymentRecords
        ? actualInRange(paymentRecords[p.projectId]?.records, '', '')
        : (p.payment?.actualTotal ?? 0)
    }
  }
  return { total: projects.length, active, paused, highRisk, overspend, paymentRatio: exp > 0 ? act / exp : null }
}

export interface HealthSummary {
  counts: { 健康: number; 关注: number; 风险: number; 无数据: number }
  dims: { progress: number; risk: number; cost: number; payment: number }
  riskProjects: Project[]
}

export function healthSummary(projects: Project[]): HealthSummary {
  const counts = { 健康: 0, 关注: 0, 风险: 0, 无数据: 0 }
  const dims = { progress: 0, risk: 0, cost: 0, payment: 0 }
  const riskProjects: Project[] = []
  for (const p of projects) {
    const h = (p.health ?? {}) as Record<string, any>
    const overall = String(h.overall || '无数据')
    if (overall === '健康' || overall === '关注' || overall === '风险') counts[overall]++
    else counts.无数据++
    if (h.progressAbnormal) dims.progress++
    if (h.riskAbnormal) dims.risk++
    if (h.costAbnormal) dims.cost++
    if (h.paymentAbnormal) dims.payment++
    if (overall === '风险') riskProjects.push(p)
  }
  return { counts, dims, riskProjects }
}

export interface DelayedTopItem {
  projectId: string
  projectName: string
  stage: string
  remaining: number
}

export interface PaymentBand {
  yearExpected: number
  yearActual: number
  monthPending: number
  dueSoon7: number
  delayedTop: DelayedTopItem[]
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 回款重点带——now 注入便于测试;收款阶段节点级口径。
 * paymentRecords/start/end 可选:传入时 yearActual=Σ流水∈[start,end]；全部(start=end='')时含空日期记录。
 * 计划侧(yearExpected/monthPending/delayedTop)按 inRange(planDate,start,end) 过滤；全部时含空计划日节点。*/
export function paymentBand(
  rows: PayNodeRow[],
  now: Date,
  paymentRecords?: Record<string, PaymentRecordsEntry>,
  start = '',
  end = '',
): PaymentBand {
  const year = String(now.getFullYear())
  const month = isoDate(now).slice(0, 7)
  const today = isoDate(now)
  const until = isoDate(new Date(now.getTime() + 7 * 86400000))

  // 计划侧区间判断：若有日期区间则用 inRange；否则退化到年度前缀匹配
  const hasRange = !!(start || end)
  const planInScope = (planDate: string): boolean =>
    hasRange ? inRange(planDate, start, end) : planDate.startsWith(year)

  // yearActual：若传入 paymentRecords 则按流水求和，否则退化节点 receivedAmount 之和
  // hasRange 时：流水∈[start,end]；无区间时：流水 date.startsWith(year)，与计划侧年度口径对齐
  let yearActual = 0
  if (paymentRecords) {
    // 按项目 id 去重求和（rows 含多节点，流水应按项目级聚合）
    const seen = new Set<string>()
    for (const n of rows) {
      if (!seen.has(n.projectId)) {
        seen.add(n.projectId)
        const records = paymentRecords[n.projectId]?.records
        if (hasRange) {
          yearActual += actualInRange(records, start, end)
        } else {
          // 无区间时只累加本年流水，与 yearExpected 年度前缀口径对齐
          yearActual += (records ?? []).reduce(
            (s, r) => s + (String(r.date ?? '').startsWith(year) ? Number(r.amount ?? 0) : 0),
            0,
          )
        }
      }
    }
  } else {
    for (const n of rows) {
      if (planInScope(String(n.planDate ?? ''))) {
        yearActual += n.receivedAmount
      }
    }
  }

  let yearExpected = 0
  let monthPending = 0
  let dueSoon7 = 0
  const delayed: DelayedTopItem[] = []
  for (const n of rows) {
    const plan = String(n.planDate ?? '')
    if (planInScope(plan)) {
      yearExpected += n.expectedPayment
    }
    if (plan.slice(0, 7) === month) monthPending += n.unpaidAmount
    if (plan >= today && plan <= until && n.status !== '已回款') dueSoon7++
    if (n.status === '延期' && planInScope(plan)) {
      delayed.push({ projectId: n.projectId, projectName: n.projectName, stage: n.stage, remaining: n.unpaidAmount })
    }
  }
  delayed.sort((a, b) => b.remaining - a.remaining)
  return { yearExpected, yearActual, monthPending, dueSoon7, delayedTop: delayed.slice(0, 3) }
}
