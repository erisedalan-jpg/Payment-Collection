import type { Project } from '@/types/analysis'
import type { PayNodeRow } from './paymentPmis'
import { filterProjects, type FilterOpts as ProjFilterOpts } from './paymentPmis'

export interface PayNodeFilterOpts {
  filterYear: string
  viewMode: 'global' | 'l4' | 'pm'
  viewL4: string
  viewPM: string
  excludeActive: boolean
  excludedIds: Record<string, boolean>
}

const Q_RANGE: Record<string, [string, string]> = {
  Q1: ['01', '03'], Q2: ['04', '06'], Q3: ['07', '09'], Q4: ['10', '12'],
}

/** 镜像 lib/filterNodes：视角(dept/projectManager) → 排除 → 年份/季度(按 planDate 月份)。无 planDate 的节点在年/季筛选被排除。 */
export function filterPayNodes(rows: PayNodeRow[], opts: PayNodeFilterOpts): PayNodeRow[] {
  let ns = rows
  if (opts.viewMode === 'l4' && opts.viewL4) ns = ns.filter((r) => r.dept === opts.viewL4)
  if (opts.viewMode === 'pm' && opts.viewPM) ns = ns.filter((r) => r.projectManager === opts.viewPM)
  if (opts.excludeActive && opts.excludedIds) ns = ns.filter((r) => !opts.excludedIds[r.projectId])
  const fy = opts.filterYear
  if (fy === 'all') return ns
  const mo = (r: PayNodeRow) => (r.planDate || '').slice(0, 7)
  if (fy.includes('-Q')) {
    const keyPart = fy.startsWith('upto') ? fy.slice(4) : fy
    const [qYear, qn] = keyPart.split('-Q')
    const range = Q_RANGE['Q' + qn]
    if (!range) return ns
    const mStart = `${qYear}-${range[0]}`, mEnd = `${qYear}-${range[1]}`
    return ns.filter((r) => { const m = mo(r); return !!m && m >= mStart && m <= mEnd })
  }
  if (fy.startsWith('upto')) {
    const end = `${fy.slice(4)}-12`
    return ns.filter((r) => { const m = mo(r); return !!m && m <= end })
  }
  const start = `${fy}-01`, end = `${fy}-12`
  return ns.filter((r) => { const m = mo(r); return !!m && m >= start && m <= end })
}

export interface PayDashSummary {
  relatedNodeCount: number
  totalProjects: number
  totalExpected: number
  totalActual: number
  totalRemaining: number
  rate: number
  delayedProjects: number
}

/** 看板指标(同 DashSummary 字段名)。项目数按视角/排除过滤 projects(不随年份)。金额=节点收款阶段口径。 */
export function payDashSummary(rows: PayNodeRow[], projects: Project[], opts: ProjFilterOpts): PayDashSummary {
  const totalExpected = rows.reduce((s, r) => s + r.expectedPayment, 0)
  const totalActual = rows.reduce((s, r) => s + r.receivedAmount, 0)
  const totalRemaining = rows.reduce((s, r) => s + r.unpaidAmount, 0)
  const delayedPids = new Set(rows.filter((r) => r.status === '延期').map((r) => r.projectId))
  return {
    relatedNodeCount: rows.length,
    totalProjects: filterProjects(projects, opts).length,
    totalExpected, totalActual, totalRemaining,
    rate: totalExpected > 0 ? totalActual / totalExpected : 0,
    delayedProjects: delayedPids.size,
  }
}

export interface PayTierStat {
  projectCount: number
  relatedNodeCount: number
  expectedAmountWan: number
  actualAmountWan: number
  remainingAmountWan: number
  delayedCount: number
  paidCount: number
}

/** 单档聚合(字段名贴合 TierStrip 既有用法 expectedAmountWan/actualAmountWan/projectCount/delayedCount)。 */
export function payTierStats(tier: string, rows: PayNodeRow[]): PayTierStat {
  const grp = rows.filter((r) => r.tier === tier)
  const expected = grp.reduce((s, r) => s + r.expectedPayment, 0)
  const actual = grp.reduce((s, r) => s + r.receivedAmount, 0)
  const remaining = grp.reduce((s, r) => s + r.unpaidAmount, 0)
  return {
    projectCount: new Set(grp.map((r) => r.projectId)).size,
    relatedNodeCount: grp.length,
    expectedAmountWan: expected / 10000,
    actualAmountWan: actual / 10000,
    remainingAmountWan: remaining / 10000,
    delayedCount: grp.filter((r) => r.status === '延期').length,
    paidCount: grp.filter((r) => r.status === '已回款').length,
  }
}
