import type { RawNode } from '@/types/analysis'
import { groupByProject, type ProjectAgg } from './dashboardStats'

export interface DimDef {
  key: string
  label: string
  valueOf: (n: Record<string, any>) => string
}

const v = (raw: unknown) => {
  const s = raw == null ? '' : String(raw).trim()
  return s === '' ? '未指定' : s
}

export const DIMENSIONS: DimDef[] = [
  { key: 'orgL4', label: '服务组(L4)', valueOf: (n) => v(n.orgL4) },
  { key: 'orgL3', label: 'L3部门', valueOf: (n) => v(n.orgL3) },
  { key: 'projectManager', label: '项目经理', valueOf: (n) => v(n.projectManager) },
  { key: 'projectType', label: '项目类型', valueOf: (n) => v(n.projectType) },
  { key: 'signUnit', label: '签约单位', valueOf: (n) => v(n.signUnit) },
  { key: 'tier', label: '金额档位', valueOf: (n) => v(n.tier) },
]

export const DIM_BY_KEY: Record<string, DimDef> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.key, d]),
)

export interface PivotGroup {
  key: string
  values: string[]
  projectCount: number
  expectedAmount: number
  actualAmount: number
  remainingAmount: number
  completionRate: number
  delayedCount: number
  delayRate: number
  projects: ProjectAgg[]
}

/** 按 1..N 个维度分桶（桶 key = 各维取值以 " / " 连接），每桶用 groupByProject 算项目级指标。
 *  默认按已回款金额降序。本期单维使用，接口 N 维可扩展。 */
export function groupByDims(nodes: RawNode[], dimKeys: string[]): PivotGroup[] {
  const defs = dimKeys.map((k) => DIM_BY_KEY[k]).filter(Boolean)
  if (!defs.length) return []
  const buckets: Record<string, RawNode[]> = {}
  for (const raw of nodes) {
    const n = raw as Record<string, any>
    const key = defs.map((d) => d.valueOf(n)).join(' / ')
    ;(buckets[key] ||= []).push(raw)
  }
  const groups = Object.entries(buckets).map(([key, gnodes]) => {
    const first = gnodes[0] as Record<string, any>
    const projects = groupByProject(gnodes)
    const expectedAmount = projects.reduce((s, p) => s + (p.expectedPayment || 0), 0)
    const actualAmount = projects.reduce((s, p) => s + (p.actualPayment || 0), 0)
    const delayedCount = projects.filter((p) => p.paymentStatus === '延期').length
    const projectCount = projects.length
    return {
      key,
      values: defs.map((d) => d.valueOf(first)),
      projectCount,
      expectedAmount,
      actualAmount,
      remainingAmount: expectedAmount - actualAmount,
      completionRate: expectedAmount > 0 ? actualAmount / expectedAmount : 0,
      delayedCount,
      delayRate: projectCount > 0 ? delayedCount / projectCount : 0,
      projects,
    }
  })
  return groups.sort((a, b) => b.actualAmount - a.actualAmount)
}
