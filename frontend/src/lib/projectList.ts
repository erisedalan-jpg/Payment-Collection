import type { Project, ProjectPmis } from '@/types/analysis'

// 项目清单行：projects[](P1 主域) join projectPmis[id] 的扁平展示模型
export interface ProjectRow {
  projectId: string
  projectName: string
  customer: string
  projectManager: string
  stage: string
  progress: number | null
  projectStatus: string
  riskLevel: string
  openRisks: number
  costRatio: number | null
  paymentRatio: number | null
  paymentStatus: string
  health: string
  isPresale: boolean
  hasClosed: boolean
}

export interface ProjectFilters {
  search: string
  stage: string
  projectStatus: string
  health: string
  riskLevel: string
  paymentStatus: string
  presale: string // '' | 'yes' | 'no'
}

/** 项目级回款状态四态：无节点 / 延期 / 已回清 / 回款中 */
export function paymentStatusOf(p: Project): string {
  const pay = p.payment
  if (!pay || !pay.relatedNodeCount) return '无节点'
  if ((pay.delayedCount ?? 0) > 0) return '延期'
  if ((pay.remainingTotal ?? 0) <= 0 && (pay.actualTotal ?? 0) > 0) return '已回清'
  return '回款中'
}

export function buildProjectRows(projects: Project[], pmisMap: Record<string, ProjectPmis>): ProjectRow[] {
  return projects.map((p) => {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const prog = m.progress ?? {}
    const risk = m.risk ?? {}
    const status = m.status ?? {}
    const cost = m.cost ?? {}
    const customer = m.customer ?? {}
    return {
      projectId: p.projectId,
      projectName: p.projectName || '-',
      customer: customer.最终客户 || '-',
      projectManager: p.projectManager || '-',
      stage: prog.项目阶段 || '-',
      progress: typeof prog.完工进展 === 'number' ? prog.完工进展 : null,
      projectStatus: status.项目状态 || '-',
      riskLevel: risk.最高等级 || '无',
      openRisks: Number(risk.未关闭风险数 ?? 0),
      costRatio: typeof cost.消耗比 === 'number' ? cost.消耗比 : null,
      paymentRatio: p.payment?.paymentRatio ?? null,
      paymentStatus: paymentStatusOf(p),
      health: p.health?.overall || '无数据',
      isPresale: !!p.isPresale,
      hasClosed: !!p.relatedClosedId,
    }
  })
}

export function filterProjectRows(rows: ProjectRow[], f: ProjectFilters): ProjectRow[] {
  const q = (f.search || '').trim().toLowerCase()
  return rows.filter((r) => {
    if (q && ![r.projectName, r.projectId, r.customer, r.projectManager].some((s) => s.toLowerCase().includes(q))) return false
    if (f.stage && r.stage !== f.stage) return false
    if (f.projectStatus && r.projectStatus !== f.projectStatus) return false
    if (f.health && r.health !== f.health) return false
    if (f.riskLevel && r.riskLevel !== f.riskLevel) return false
    if (f.paymentStatus && r.paymentStatus !== f.paymentStatus) return false
    if (f.presale === 'yes' && !r.isPresale) return false
    if (f.presale === 'no' && r.isPresale) return false
    return true
  })
}

/** 下拉选项：从行集取该列出现过的非空值（保插入序，剔除占位 '-'） */
export function distinctOptions(rows: ProjectRow[], key: 'stage' | 'projectStatus' | 'riskLevel'): string[] {
  return [...new Set(rows.map((r) => r[key]).filter((v) => v && v !== '-'))]
}
