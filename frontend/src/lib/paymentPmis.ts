import type { Project, ProjectPaymentPmis, ProjectPmis } from '@/types/analysis'

// ── 阈值常量（集中定义，spec §2）──
export const TIER_HIGH = 1_000_000
export const TIER_MID = 500_000
export const RATE_OK = 0.8
export const RATE_WARN = 0.5

/** 金额档：由 paymentPmis.contract 派生。 */
export function deriveTier(contract: number | null | undefined): string {
  if (contract == null || contract <= 0) return '未知'
  if (contract >= TIER_HIGH) return '100万以上'
  if (contract >= TIER_MID) return '50-100万'
  return '50万以下'
}

/** 进度态：由 paymentPmis.paymentRatio 派生。无合同→未知；ratio 0/null 且有合同→未回款。 */
export function deriveProgress(pmis: ProjectPaymentPmis | null | undefined): string {
  const c = pmis?.contract
  if (c == null || c <= 0) return '未知'
  const r = pmis?.paymentRatio
  if (r == null || r <= 0) return '未回款'
  if (r >= 0.999) return '已全额回款'
  return '部分回款'
}

/** 部门：project.orgL4（空→未指定）。 */
export function deriveDept(p: Project): string {
  const s = (p.orgL4 ?? '').trim()
  return s === '' ? '未指定' : s
}

/** 阶段：projectPmis[pid].progress.项目阶段（空/缺→未指定）。 */
export function deriveStage(pid: string, pmisMap: Record<string, ProjectPmis> | undefined): string {
  const s = String((pmisMap?.[pid]?.progress as Record<string, unknown> | undefined)?.['项目阶段'] ?? '').trim()
  return s === '' ? '未指定' : s
}

/** 完成率三态色（对齐既有 0.8/0.5 阈值，输出 theme 令牌；null→mut）。 */
export function rateColorPmis(r: number | null | undefined): string {
  if (r == null) return 'var(--mut)'
  if (r >= RATE_OK) return 'var(--ok-text)'
  if (r >= RATE_WARN) return 'var(--warn-text)'
  return 'var(--danger-text)'
}

// ── 共享维度选择器（前 4 个 facet tab）──
export interface PayDimDef { key: 'dept' | 'stage' | 'tier' | 'progress'; label: string }
export const PAY_FACET_DIMS: PayDimDef[] = [
  { key: 'dept', label: '部门' },
  { key: 'stage', label: '阶段' },
  { key: 'tier', label: '金额档' },
  { key: 'progress', label: '进度态' },
]

// ── 视角/纳管过滤（对 projects[]，不复用 filterNodes）──
export interface FilterOpts {
  viewMode: 'global' | 'l4' | 'pm'
  viewL4: string
  viewPM: string
  naguanOn: boolean
  naguanExclude: Record<string, boolean>
}
export function filterProjects(projects: Project[], opts: FilterOpts): Project[] {
  return projects.filter((p) => {
    if (opts.naguanOn && opts.naguanExclude && opts.naguanExclude[p.projectId]) return false
    if (opts.viewMode === 'l4' && opts.viewL4) return (p.orgL4 ?? '') === opts.viewL4
    if (opts.viewMode === 'pm' && opts.viewPM) return (p.projectManager ?? '') === opts.viewPM
    return true
  })
}

// ── 项目级回款行（项目总览表底座 + 维度 + 下钻兼容列）──
export interface PayProjectRow {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  dept: string
  stage: string
  tier: string
  progress: string
  contract: number
  actualTotal: number
  paymentRatio: number | null
  expectedTotal: number
  nodeCount: number
  reachedCount: number
  delayedCount: number
  fromOrigin: boolean
  overspendAmount: number
  projectAmount: number
  paymentStatus: string
}

export function projectPaymentRows(
  projects: Project[],
  pmisMap?: Record<string, ProjectPmis>,
): PayProjectRow[] {
  return projects.map((p) => {
    const pm = p.paymentPmis ?? null
    const contract = pm?.contract ?? 0
    const actualTotal = pm?.actualTotal ?? 0
    const paymentRatio = pm?.paymentRatio ?? null
    const dept = deriveDept(p)
    const tier = deriveTier(pm?.contract)
    const progress = deriveProgress(pm)
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      projectManager: (p.projectManager ?? '').trim() || '未指定',
      orgL4: dept,
      dept,
      stage: deriveStage(p.projectId, pmisMap),
      tier,
      progress,
      contract,
      actualTotal,
      paymentRatio,
      expectedTotal: pm?.expectedTotal ?? 0,
      nodeCount: pm?.nodeCount ?? 0,
      reachedCount: pm?.reachedCount ?? 0,
      delayedCount: pm?.delayedCount ?? 0,
      fromOrigin: pm?.fromOrigin ?? false,
      overspendAmount: p.overspendAmount ?? 0,
      projectAmount: contract,
      paymentStatus: progress,
    }
  })
}

// ── 单维汇总（加权完成率 Σ÷Σ）──
export interface DimSummary {
  value: string
  projectCount: number
  contractSum: number
  actualSum: number
  rate: number | null
  delayedNodeSum: number
}
export function summaryByDim(rows: PayProjectRow[], dimKey: string): DimSummary[] {
  const buckets: Record<string, PayProjectRow[]> = {}
  for (const r of rows) {
    const v = String((r as unknown as Record<string, unknown>)[dimKey] ?? '未指定')
    ;(buckets[v] ||= []).push(r)
  }
  return Object.entries(buckets)
    .map(([value, grp]) => {
      const contractSum = grp.reduce((s, r) => s + r.contract, 0)
      const actualSum = grp.reduce((s, r) => s + r.actualTotal, 0)
      return {
        value,
        projectCount: grp.length,
        contractSum,
        actualSum,
        rate: contractSum > 0 ? actualSum / contractSum : null,
        delayedNodeSum: grp.reduce((s, r) => s + r.delayedCount, 0),
      }
    })
    .sort((a, b) => b.contractSum - a.contractSum)
}
