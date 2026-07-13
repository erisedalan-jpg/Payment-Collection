import type { YitianData } from '@/types/yitian'
import { rosterL4Map } from './metrics'

// 注意:本模块不能用 selectEntries —— issues[].i 是 entries 的**原始下标**,
// 必须在原数组上带 index 遍历才能对得上;先过滤会让下标失配。

/** 问题码 → 中文标签。与后端 yitian_rules.py 的 ISSUE_LABELS 同表(改一处须同步改另一处)。 */
export const ISSUE_LABELS: Record<string, string> = {
  MISS_SUMMARY: '缺少工作概述',
  MISS_PROGRESS: '缺少工作进展',
  MISS_NEXT: '缺少下一步工作计划',
  MISS_SERVICE_MODE: '缺少服务方式',
  TYPE_MISMATCH: '工时类型填报有误',
  PRODUCT_MISMATCH: '产品类别填写错误',
  MISS_CUSTOMER: '客户名称未填写',
  HINT_PRESALE_PRODUCT: '售前服务类产品类别不应为「其他」',
}

export interface IssueRow {
  date: string
  empId: string
  empName: string
  l4: string
  l31: string
  type: string
  customer: string
  workOrder: string
  hours: number
  ok: number
  codes: string[]
  msgs: string[]
  snippet: string
}

/** 问题明细行(仅 ok≠0 的行)。组织/姓名取自花名册,问题正文摘要取自 issues[]。 */
export function issueRows(
  data: YitianData, start: string, end: string, l4s: string[] = [],
): IssueRow[] {
  const byId = new Map(data.roster.map((p) => [p.id, p]))
  const l4Of = rosterL4Map(data)
  const allow = new Set(l4s)

  // issues[].i 是 entries 下标 → 建下标 → issue 的查表
  const issueAt = new Map<number, { codes: string[]; msgs: string[]; snippet: string }>()
  for (const it of data.issues) {
    issueAt.set(it.i, { codes: it.codes ?? [], msgs: it.msgs ?? [], snippet: it.snippet ?? '' })
  }

  const out: IssueRow[] = []
  data.entries.forEach((e, i) => {
    if (e.ok === 0) return
    if (start && e.d < start) return
    if (end && e.d > end) return
    const l4 = l4Of[e.e] ?? ''
    if (allow.size && !allow.has(l4)) return
    const p = byId.get(e.e)
    const iss = issueAt.get(i)
    out.push({
      date: e.d,
      empId: e.e,
      empName: p?.name ?? e.e,
      l4,
      l31: p?.l31 ?? '',
      type: e.t === null || e.t === undefined ? '' : (data.dims.types[e.t] ?? ''),
      customer: e.cu === null || e.cu === undefined ? '' : (data.dims.customers[e.cu] ?? ''),
      workOrder: e.wo ?? '',
      hours: e.h,
      ok: e.ok,
      codes: iss?.codes ?? e.iss ?? [],
      msgs: iss?.msgs ?? [],
      snippet: iss?.snippet ?? '',
    })
  })
  return out
}

/** 按问题码计数(一行多码 → 每码各计一次),降序。 */
export function countByCode(rows: IssueRow[]): { code: string; label: string; count: number }[] {
  const acc: Record<string, number> = {}
  for (const r of rows) {
    for (const c of r.codes) acc[c] = (acc[c] ?? 0) + 1
  }
  return Object.entries(acc)
    .map(([code, count]) => ({ code, label: ISSUE_LABELS[code] ?? code, count }))
    .sort((a, b) => b.count - a.count)
}

/** 按 L4 计问题行数(不是问题码数),降序。 */
export function countByL4(rows: IssueRow[]): { l4: string; count: number }[] {
  const acc: Record<string, number> = {}
  for (const r of rows) acc[r.l4] = (acc[r.l4] ?? 0) + 1
  return Object.entries(acc)
    .map(([l4, count]) => ({ l4, count }))
    .sort((a, b) => b.count - a.count)
}
