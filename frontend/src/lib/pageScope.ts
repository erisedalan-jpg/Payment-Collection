import type { PageKey } from './pageAccess'
import type { AuthUser } from './auth'

export type ScopeDomain = 'project' | 'yitian' | 'opportunity'
export interface Scope { l4: string[]; staff: string[] }

// 与后端 config.py PAGE_DOMAINS 同(跨语言同步测试锁一致)。无数据域页不入表。
export const PAGE_DOMAINS: Record<string, ScopeDomain> = {
  overview: 'project', projects: 'project', 'projects-closed': 'project', activity: 'project',
  insight: 'project', 'insight-milestone': 'project', 'insight-costdetail': 'project',
  'insight-risk': 'project', 'insight-board': 'project', 'insight-calendar': 'project',
  payment: 'project', 'payment-projects': 'project', 'payment-nodes': 'project',
  'projects-key': 'project', 'temp-followup': 'project', 'risk-followup': 'project',
  'payment-key': 'project', governance: 'project',
  yitian: 'yitian', 'yitian-detail': 'yitian', 'yitian-compliance': 'yitian',
  'yitian-analytics': 'yitian', 'yitian-trend': 'yitian', 'yitian-customer': 'yitian',
  'opportunities-progress': 'opportunity', 'opportunities-board': 'opportunity',
  'opportunity-followup': 'opportunity',
}

/** 三层解析:pageScopes[page] ?? domainScopes[域] ?? 默认(allowedL4/allowedStaff)。 */
export function effectiveScope(user: AuthUser, pageKey: PageKey): Scope {
  const dom = PAGE_DOMAINS[pageKey]
  const ps = user.pageScopes?.[pageKey]
  if (ps) return { l4: ps.l4 ?? [], staff: ps.staff ?? [] }
  const ds = dom ? user.domainScopes?.[dom] : undefined
  if (ds) return { l4: ds.l4 ?? [], staff: ds.staff ?? [] }
  return { l4: user.allowedL4 ?? [], staff: user.allowedStaff ?? [] }
}

function _keep(orgL4: string, pm: string, l4set: Set<string>, names: Set<string>): boolean {
  return l4set.has(orgL4) || (!!pm && names.has(pm))
}

/** 收窄 analysis_data(projects + 关联 pid 键 map);'*'→原样;显式空→空。staffNames:工号→姓名。 */
export function narrowProjects(data: any, scope: Scope, staffNames: Record<string, string>): any {
  if (!data) return data
  const l4set = new Set(scope.l4)
  if (l4set.has('*')) return data
  const names = new Set(scope.staff.map((id) => staffNames[id]).filter(Boolean))
  const keep = new Set<string>()
  for (const p of (data.projects ?? [])) {
    if (_keep(String(p.orgL4 ?? '').trim(), String(p.projectManager ?? '').trim(), l4set, names)) {
      keep.add(p.projectId)
      if (p.relatedClosedId) keep.add(p.relatedClosedId)
    }
  }
  const pidKeyed = ['projectPmis', 'paymentNodes', 'projectMilestones', 'paymentRecords', 'projectProfit', 'followupRecords', 'tagSeed']
  const out: any = { ...data }
  out.projects = (data.projects ?? []).filter((p: any) => keep.has(p.projectId))
  out.closedProjects = (data.closedProjects ?? []).filter((c: any) => l4set.has(String(c.orgL4 ?? '').trim()))
  for (const k of pidKeyed) if (data[k] && typeof data[k] === 'object')
    out[k] = Object.fromEntries(Object.entries(data[k]).filter(([id]) => keep.has(id)))
  if (Array.isArray(data.events)) out.events = data.events.filter((e: any) => keep.has(e.projectId))
  return out
}

/** 收窄 yitian_data(roster/entries/issues,issues.i 重映射);'*'→原样;显式空→空。 */
export function narrowYitian(data: any, scope: Scope): any {
  if (!data) return data
  const l4set = new Set(scope.l4)
  if (l4set.has('*')) return data
  const staff = new Set(scope.staff)
  const keepRoster = (data.roster ?? []).filter((p: any) => l4set.has(String(p.l4 ?? '').trim()) || staff.has(p.id))
  const keepIds = new Set(keepRoster.map((p: any) => p.id))
  const o2n = new Map<number, number>()
  const keepEntries: any[] = []
  for (let i = 0; i < (data.entries ?? []).length; i++) {
    if (keepIds.has(data.entries[i].e)) { o2n.set(i, keepEntries.length); keepEntries.push(data.entries[i]) }
  }
  const keepIssues = (data.issues ?? []).filter((it: any) => o2n.has(it.i)).map((it: any) => ({ ...it, i: o2n.get(it.i) }))
  return { ...data, roster: keepRoster, entries: keepEntries, issues: keepIssues }
}

/** 收窄商机行(按 l4);'*'→原样。 */
export function narrowOpportunities<T extends { l4?: string }>(rows: T[], scope: Scope): T[] {
  const l4set = new Set(scope.l4)
  if (l4set.has('*')) return rows
  return rows.filter((r) => l4set.has(String(r.l4 ?? '').trim()))
}
