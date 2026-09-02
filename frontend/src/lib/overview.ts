import type { Project, ProjectPmis, PaymentRecordsEntry, Paymentrecords } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
import { isAnomalous } from './anomaly'
import { actualInRange } from './paymentRange'
import { aggregateRate } from './paymentRate'

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

/** 回款达成率:分子=Σ流水(排除异常)，分母=Σ合同 paymentPmis.contract(排除异常)。
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
  const rated: Project[] = []
  for (const p of projects) {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    if (m.status?.项目状态 === '实施中') active++
    if (m.status?.是否暂停 === true) paused++
    if (m.cost?.项目超支 === true) overspend++
    if (p.health?.riskAbnormal) highRisk++
    // 回款达成率排除异常项目；分母改为 Σ合同(paymentPmis.contract)
    // 达成率只统计【有合同】的项目:分子分母恒同一集合。
    // 无合同却有流水的项目原本进分子、不进分母,生产实测虚高 0.29pp(见 lib/paymentRate.ts)。
    // 分子恒用流水,不退化节点已收 —— 那是另一套口径(实测差 570 万),
    // CLAUDE.md 例外清单当前为空。宁可明显坏(0%),不要悄悄错(46.36%)。
    if (!isAnomalous(p)) rated.push(p)
  }
  const agg = aggregateRate(rated, (p) => p.paymentPmis?.contract,
    (p) => actualInRange(paymentRecords?.[p.projectId]?.records, '', ''))
  return { total: projects.length, active, paused, highRisk, overspend, paymentRatio: agg.rate }
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
 * projects 可选:传入时 yearActual 改为遍历项目集(排除异常)汇总流水，
 * 共享项目集与异常排除;年度分子按本年(startsWith(year))过滤,与 /payment 已回款(全时)口径不同，
 * 含无收款节点项目的流水；未传时退化到按节点项目去重的旧逻辑(向后兼容)。
 * V4.5.3 起【不接受日期区间】:唯一调用方 OverviewView 的文案写死「年度回款进度」,
 * 接受区间会让标签与数据不符(用户在 /payment 设「本季」,首页显示本季数字却顶着"年度"标签)。
 * 计划侧(yearExpected/delayedTop)固定按 planDate.startsWith(year) 过滤。*/
export function paymentBand(
  rows: PayNodeRow[],
  now: Date,
  projects?: Project[],
  paymentRecords?: Record<string, PaymentRecordsEntry>,
): PaymentBand {
  const year = String(now.getFullYear())
  const month = isoDate(now).slice(0, 7)
  const today = isoDate(now)
  const until = isoDate(new Date(now.getTime() + 7 * 86400000))

  // 计划侧固定按自然年度前缀匹配(不接受区间,理由见函数注释)
  const planInScope = (planDate: string): boolean => planDate.startsWith(year)

  // yearActual：优先按 projects 遍历(排除异常，含无收款节点项目流水；共享项目集与异常排除，
  // 年度分子按本年过滤，与 computeKpis 全时口径不同)；
  // 否则若传入 paymentRecords 则退化按节点项目去重求和；否则退化节点 receivedAmount 之和
  let yearActual = 0
  if (paymentRecords && projects) {
    // 遍历项目集(排除异常)，共享项目集与异常排除(与 computeKpis 相同)：含无收款节点项目的流水；
    // 年度分子按本年(startsWith(year))过滤，与 /payment 已回款(全时)口径不同
    for (const p of projects) {
      if (isAnomalous(p)) continue
      const records = paymentRecords[p.projectId]?.records
      yearActual += (records ?? []).reduce(
        (s, r) => s + (String(r.date ?? '').startsWith(year) ? Number(r.amount ?? 0) : 0),
        0,
      )
    }
  } else if (paymentRecords) {
    // 旧退化路径(无 projects)：按节点项目去重求和（rows 含多节点，流水应按项目级聚合）
    const seen = new Set<string>()
    for (const n of rows) {
      if (!seen.has(n.projectId)) {
        seen.add(n.projectId)
        const records = paymentRecords[n.projectId]?.records
        // 只累加本年流水，与 yearExpected 年度前缀口径对齐
        yearActual += (records ?? []).reduce(
          (s, r) => s + (String(r.date ?? '').startsWith(year) ? Number(r.amount ?? 0) : 0),
          0,
        )
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
