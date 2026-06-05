import type { RawNode } from '@/types/analysis'
import { groupByProject, type ProjectAgg } from './dashboardStats'

export interface ProjectDetail {
  project: ProjectAgg | null
  nodes: RawNode[]
}

/**
 * 按 projectId 从全量 rawNodes 构建项目详情：项目聚合(复用 groupByProject) + 该项目全部节点。
 * 详情是对单个项目的"下钻查看"，不经纳管/年份/视角过滤——展示项目完整面貌。
 */
export function buildProjectDetail(rawNodes: RawNode[], projectId: string): ProjectDetail {
  const nodes = rawNodes.filter((n) => (n as Record<string, any>).projectId === projectId)
  if (!nodes.length) return { project: null, nodes: [] }
  return { project: groupByProject(nodes)[0], nodes }
}
