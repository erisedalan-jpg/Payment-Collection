import type { PaymentNodePmis, PaymentRecord } from '@/types/analysis'

/** 日期是否落入 [start,end]（含端点）。两端皆空=全部→恒真（含空日期）；否则要求 date 非空且界内。 */
export function inRange(date: string, start: string, end: string): boolean {
  if (!start && !end) return true
  return !!date && (!start || date >= start) && (!end || date <= end)
}

/** 流水按回款确认日窗求和（全部时含空日期记录）。 */
export function actualInRange(records: PaymentRecord[] | undefined, start: string, end: string): number {
  if (!records) return 0
  return records.reduce((s, r) => s + (inRange(String(r.date ?? ''), start, end) ? Number(r.amount ?? 0) : 0), 0)
}

/** 区间内是否有回款活动：节点计划日∈R 或 流水到账日∈R。 */
export function hasActivityInRange(
  nodes: PaymentNodePmis[] | undefined, records: PaymentRecord[] | undefined, start: string, end: string,
): boolean {
  if ((nodes ?? []).some((n) => inRange(String(n.planDate ?? ''), start, end))) return true
  return (records ?? []).some((r) => inRange(String(r.date ?? ''), start, end))
}

export interface RangePmis {
  contract: number
  expectedTotal: number
  actualTotal: number
  remainingTotal: number
  nodeCount: number
  reachedCount: number
  delayedCount: number
  delayedAmount: number
  paymentRatio: number | null
}

/** 区间版项目回款摘要：节点按计划日∈R，流水按到账日∈R；contract 静态传入。 */
export function paymentPmisInRange(
  contract: number, nodes: PaymentNodePmis[] | undefined, records: PaymentRecord[] | undefined,
  start: string, end: string,
): RangePmis {
  const ns = (nodes ?? []).filter((n) => inRange(String(n.planDate ?? ''), start, end))
  const expectedTotal = round2(ns.reduce((s, n) => s + Number(n.expectedPayment ?? 0), 0))
  const remainingTotal = round2(ns.reduce((s, n) => s + Number(n.unpaidAmount ?? 0), 0))
  const actualTotal = round2(actualInRange(records, start, end))
  const delayedAmount = round2(ns.filter((n) => n.status === '延期').reduce((s, n) => s + Number(n.unpaidAmount ?? 0), 0))
  return {
    contract,
    expectedTotal,
    actualTotal,
    remainingTotal,
    nodeCount: ns.length,
    reachedCount: ns.filter((n) => n.reached).length,
    delayedCount: ns.filter((n) => n.status === '延期').length,
    delayedAmount,
    paymentRatio: contract > 0 ? round4(actualTotal / contract) : null,
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10000) / 10000
