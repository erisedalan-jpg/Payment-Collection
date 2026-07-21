import type { DataColumn } from '@/components/DataTable.vue'
import type { YitianData } from '@/types/yitian'
import { ISSUE_LABELS } from './compliance'
import { NO_L3, NO_L31, NO_L4 } from './metrics'

export interface DetailRow {
  date: string
  empId: string
  empName: string
  l2: string
  l3: string
  l31: string
  l4: string
  category: string
  type: string
  hours: number
  workType3: string
  customer: string
  productLine: string
  productName: string
  projectType: string
  serviceMode: string
  salesL2: string
  workOrder: string
  top: boolean
  ok: number
  okText: string
  issueReason: string
  snippet: string
  content: string
}

const OK_TEXT = ['合规', '提示', '问题'] // 下标 = ok(0/1/2)

/** 逐条还原全量 entries → 明细行。
 *  issues[].i 是全量 entries 的原始下标,必须带 index 遍历全量数组(不可先过滤,否则下标失配)。 */
export function buildDetailRows(data: YitianData): DetailRow[] {
  const byId = new Map(data.roster.map((p) => [p.id, p]))
  const d = data.dims
  const dv = (arr: string[], i: number | null | undefined): string =>
    i === null || i === undefined ? '' : (arr[i] ?? '')
  const issueAt = new Map<number, { msgs: string[]; codes: string[]; snippet: string }>()
  for (const it of data.issues) {
    issueAt.set(it.i, { msgs: it.msgs ?? [], codes: it.codes ?? [], snippet: it.snippet ?? '' })
  }
  return data.entries.map((e, i) => {
    const p = byId.get(e.e)
    const iss = issueAt.get(i)
    const codes = iss?.codes ?? e.iss ?? []
    const msgs = iss?.msgs ?? []
    const issueReason = msgs.length
      ? msgs.join('；')
      : codes.map((c) => ISSUE_LABELS[c] ?? c).join('；')
    return {
      date: e.d,
      empId: e.e,
      empName: p?.name ?? '',
      l2: p?.l2 || '',
      l3: p?.l3 || NO_L3,
      l31: p?.l31 || NO_L31,
      l4: p?.l4 || NO_L4,
      category: p?.category || '',
      type: dv(d.types, e.t),
      hours: e.h,
      workType3: dv(d.workTypes, e.wt),
      customer: dv(d.customers, e.cu),
      productLine: dv(d.products, e.pl),
      productName: dv(d.productNames, e.pn),
      projectType: dv(d.projectTypes, e.pt),
      serviceMode: dv(d.serviceModes, e.sm),
      salesL2: dv(d.salesL2, e.bg),
      workOrder: e.wo ?? '',
      top: !!e.top,
      ok: e.ok,
      okText: OK_TEXT[e.ok] ?? '合规',
      issueReason,
      snippet: e.ok === 2 ? (iss?.snippet ?? '') : '', // 问题行 120 字摘要(向后兼容,问题原因 tooltip 用)
      content: e.ct ?? '',                              // 工作成果全文(V4.1.3 起下发,整列展示)
    }
  })
}

export interface DetailFilter {
  start?: string
  end?: string
  l4s?: string[]
  onlyIssues?: boolean
}

/** 日期区间 + L4 粗筛(对应 YitianToolbar view.l4s) + 仅看异常。全在还原之后做。 */
export function filterDetailRows(rows: DetailRow[], f: DetailFilter): DetailRow[] {
  const { start, end, l4s = [], onlyIssues } = f
  const allow = new Set(l4s)
  return rows.filter((r) => {
    if (start && r.date < start) return false
    if (end && r.date > end) return false
    if (allow.size && !allow.has(r.l4)) return false
    if (onlyIssues && r.ok === 0) return false
    return true
  })
}

export interface DetailSummary {
  count: number
  totalHours: number
  ok: number
  warn: number
  issue: number
}

export function detailSummary(rows: DetailRow[]): DetailSummary {
  let totalHours = 0, ok = 0, warn = 0, issue = 0
  for (const r of rows) {
    totalHours += r.hours
    if (r.ok === 2) issue++
    else if (r.ok === 1) warn++
    else ok++
  }
  return { count: rows.length, totalHours: Math.round(totalHours * 10) / 10, ok, warn, issue }
}

export const ALL_COLUMNS: DataColumn[] = [
  { key: 'date', label: '日期', width: 110, sortable: true },
  { key: 'empName', label: '员工', width: 90 },
  { key: 'l4', label: 'L4组织', width: 120 },
  { key: 'l3', label: 'L3组织', width: 120 },
  { key: 'l31', label: 'L3-1组织', width: 120 },
  { key: 'l2', label: 'L2组织', width: 120 },
  { key: 'category', label: '序列', width: 90 },
  { key: 'type', label: '工时类型', width: 110 },
  { key: 'hours', label: '工时', width: 80, sortable: true, num: true },
  { key: 'workType3', label: '工作类型三', width: 120 },
  { key: 'customer', label: '客户', width: 140 },
  { key: 'productLine', label: '产品线', width: 120 },
  { key: 'productName', label: '产品名', width: 140 },
  { key: 'projectType', label: '项目类型', width: 110 },
  { key: 'serviceMode', label: '服务方式', width: 110 },
  { key: 'salesL2', label: '销售L2', width: 120 },
  { key: 'workOrder', label: '工单号', width: 130 },
  { key: 'top', label: 'TOP客户', width: 90, formatter: (v) => (v ? '是' : '') },
  { key: 'okText', label: '合规状态', width: 100 },
  { key: 'issueReason', label: '问题原因', width: 240, wrap: true },
  { key: 'content', label: '工作成果', width: 360, wrap: true },
]
export const ALL_KEYS: string[] = ALL_COLUMNS.map((c) => c.key)
export const DEFAULT_VISIBLE: string[] = ['date', 'empName', 'l4', 'type', 'hours', 'customer', 'workOrder', 'okText', 'issueReason', 'content']
export const FILTERABLE = new Set(['l4', 'l2', 'l3', 'l31', 'category', 'type', 'workType3', 'projectType', 'serviceMode', 'salesL2', 'top', 'okText', 'customer', 'empName'])

/** 导出行:按传入的可见列,用中文列名作键;走 formatter(如 top→是/空);不含 snippet 正文。 */
export function buildDetailSheetRows(rows: DetailRow[], cols: DataColumn[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const o: Record<string, unknown> = {}
    for (const c of cols) {
      const raw = (r as unknown as Record<string, unknown>)[c.key]
      o[c.label] = c.formatter ? c.formatter(raw, r as Record<string, any>) : raw
    }
    return o
  })
}
