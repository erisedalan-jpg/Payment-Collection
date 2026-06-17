import type { Project, ProjectPmis } from '@/types/analysis'
import { paymentNodeRows, type PayNodeRow } from './paymentPmis'
import { ledgerRows, type LedgerProjectRow } from './ledger'

export interface ProjectDetail {
  project: LedgerProjectRow | null
  nodes: PayNodeRow[]
}

/** 单项目下钻：复用 3C ledgerRows 聚合(进度3态+延期)取目标项目行 + 其收款阶段节点。不经纳管/年份/视角过滤。 */
export function buildProjectDetail(
  paymentNodes: Parameters<typeof paymentNodeRows>[0],
  projects: Project[],
  projectPmis: Record<string, ProjectPmis> | undefined,
  projectId: string,
): ProjectDetail {
  const rows = paymentNodeRows(paymentNodes, projects, projectPmis)
  const row = ledgerRows(rows, projects).find((r) => r.projectId === projectId) ?? null
  return { project: row, nodes: row?.nodes ?? [] }
}
