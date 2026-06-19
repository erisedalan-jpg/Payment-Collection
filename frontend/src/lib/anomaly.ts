import type { Project } from '@/types/analysis'

/** 数据异常项目：主域 projects[] 中服务组 L4(orgL4) 为空。
 * 成因：项目中心∩组织架构通过，但项目基础信息无 L4。回款看板恒排除，项目清单仍展示+标记。 */
export function isAnomalous(p: Pick<Project, 'orgL4'>): boolean {
  return !((p.orgL4 ?? '').trim())
}

export interface AnomalyRow extends Record<string, unknown> { projectId: string; projectName: string; reason: string }

/** 治理页告警明细行。 */
export function anomalyRows(projects: Pick<Project, 'projectId' | 'projectName' | 'orgL4'>[]): AnomalyRow[] {
  return projects.filter(isAnomalous).map((p) => ({
    projectId: p.projectId,
    projectName: p.projectName || p.projectId,
    reason: '服务组 L4 缺失（项目基础信息无数据）',
  }))
}
