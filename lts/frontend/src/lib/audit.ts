import { apiUrl } from '@/lib/baseUrl'

export interface AuditRow {
  ts: string
  event: string
  action: string
  account: string
  displayName: string
  ip: string
  userAgent: string
  method: string
  path: string
  status: number
  success: boolean
  target?: string | null
  detail?: string | null
}

export interface AuditFilters {
  account?: string
  event?: string[]
  from?: string
  to?: string
  result?: '' | 'success' | 'failure'
  kw?: string
}

export interface AuditResponse {
  rows: AuditRow[]
  total: number
  facets: { accounts: string[]; events: { code: string; label: string }[] }
}

export async function fetchAudit(
  filters: AuditFilters,
  page: number,
  pageSize: number,
): Promise<AuditResponse> {
  const p = new URLSearchParams()
  if (filters.account) p.set('account', filters.account)
  for (const e of filters.event ?? []) p.append('event', e)
  if (filters.from) p.set('from', filters.from)
  if (filters.to) p.set('to', filters.to)
  if (filters.result) p.set('result', filters.result)
  if (filters.kw) p.set('kw', filters.kw)
  p.set('page', String(page))
  p.set('pageSize', String(pageSize))
  const res = await fetch(apiUrl('/api/admin/audit?' + p.toString()), { credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.success) throw new Error(data.message || '获取审计日志失败')
  return data as AuditResponse
}

/** 审计行 → xlsx 导出行(中文表头)。纯函数。 */
export function buildExportRows(rows: AuditRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    时间: r.ts,
    账号: r.account,
    显示名: r.displayName,
    动作: r.action,
    事件码: r.event,
    IP: r.ip,
    方法: r.method,
    路径: r.path,
    状态: r.status,
    结果: r.success ? '成功' : '失败',
    目标: r.target ?? '',
    详情: r.detail ?? '',
  }))
}
