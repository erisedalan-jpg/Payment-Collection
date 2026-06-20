import type { Project, ProjectPmis } from '@/types/analysis'

export type CostStatus = '超支大于5k' | '超支不足5k' | '未超支'

export function isXs(projectId: string): boolean {
  return (projectId ?? '').toUpperCase().startsWith('XS')
}

/** 成本状态三档(忠实对方):XS 强制未超支;null→0;rb<-5000 大于5k;-5000≤rb<0 不足5k;rb≥0 未超支。 */
export function costStatusOf(remainingBudget: number | null | undefined, projectId: string): CostStatus {
  if (isXs(projectId)) return '未超支'
  const rb = remainingBudget == null ? 0 : Number(remainingBudget)
  if (rb < -5000) return '超支大于5k'
  if (rb < 0) return '超支不足5k'
  return '未超支'
}

export interface CostRow {
  projectId: string; projectName: string; projectType: string
  orgL3: string; orgL3_1: string; orgL4: string; manager: string
  amount: number; status: CostStatus
  totalBudget: number; actualCost: number; remaining: number; xs: boolean
}

/** 全部主域项目装配成本行(明细表用;XS 保留并标记)。 */
export function buildCostRows(projects: Project[], pmis: Record<string, ProjectPmis>): CostRow[] {
  return projects.map((p) => {
    const m = (pmis[p.projectId] ?? {}) as any
    const cost = m.cost ?? {}
    const rb = cost.剩余预算
    return {
      projectId: p.projectId,
      projectName: p.projectName || p.projectId,
      projectType: (m.status?.项目类型 ?? '').trim(),
      orgL3: (m.team?.L3部门 ?? '').trim(),
      orgL3_1: (p.orgL3_1 ?? '').trim(),
      orgL4: (p.orgL4 ?? '').trim(),
      manager: (p.projectManager ?? '').trim(),
      amount: Number(p.paymentPmis?.contract ?? 0),
      status: costStatusOf(rb, p.projectId),
      totalBudget: Number(cost.总预算 ?? 0),
      actualCost: Number(cost.核算 ?? 0),
      remaining: Number(rb ?? 0),
      xs: isXs(p.projectId),
    }
  })
}

export interface CostKpis { total: number; normal: number; under5k: number; over5k: number }
export function costKpis(rows: CostRow[]): CostKpis {
  const k: CostKpis = { total: 0, normal: 0, under5k: 0, over5k: 0 }
  for (const r of rows) {
    if (r.xs) continue
    k.total++
    if (r.status === '未超支') k.normal++
    else if (r.status === '超支不足5k') k.under5k++
    else if (r.status === '超支大于5k') k.over5k++
  }
  return k
}

export interface CostL4Dist { orgL4: string; under5k: number; over5k: number }
export function costL4Dist(rows: CostRow[]): CostL4Dist[] {
  const m: Record<string, CostL4Dist> = {}
  for (const r of rows) {
    if (r.xs) continue
    const d = r.orgL4 || '未知'
    if (!m[d]) m[d] = { orgL4: d, under5k: 0, over5k: 0 }
    if (r.status === '超支不足5k') m[d].under5k++
    else if (r.status === '超支大于5k') m[d].over5k++
  }
  return Object.values(m).sort((a, b) => a.orgL4.localeCompare(b.orgL4))
}

export interface CostL4Summary { orgL4: string; total: number; normal: number; under5k: number; over5k: number; over5kRatio: number }
export function costL4Summary(rows: CostRow[]): CostL4Summary[] {
  const m: Record<string, CostL4Summary> = {}
  for (const r of rows) {
    if (r.xs) continue
    const d = r.orgL4 || '未知'
    if (!m[d]) m[d] = { orgL4: d, total: 0, normal: 0, under5k: 0, over5k: 0, over5kRatio: 0 }
    m[d].total++
    if (r.status === '未超支') m[d].normal++
    else if (r.status === '超支不足5k') m[d].under5k++
    else if (r.status === '超支大于5k') m[d].over5k++
  }
  return Object.values(m)
    .map((s) => ({ ...s, over5kRatio: s.total > 0 ? +((s.over5k / s.total) * 100).toFixed(1) : 0 }))
    .sort((a, b) => a.orgL4.localeCompare(b.orgL4))
}
