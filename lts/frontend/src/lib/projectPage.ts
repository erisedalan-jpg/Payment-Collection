import type { Project, ProjectPmis } from '@/types/analysis'

// 详情页数据装配：projects[](主域) + projectPmis[id]；
// 售前整合项目（relatedClosedId 非空）额外取原(已关闭)项目侧信息——两份信息并存，不合并（spec 3.2）
// nodes/closedNodes 已下线（3E-2）：主回款 tab 3A 已改走 paymentNodes；原项目 tab 的 closedNodes 经调研确认结构性恒空
export interface ProjectPageData {
  project: Project | null
  pmis: ProjectPmis | null
  closedId: string
  closedPmis: ProjectPmis | null
}

export function buildProjectPage(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  id: string,
): ProjectPageData {
  const project = projects.find((p) => p.projectId === id) ?? null
  if (!project) return { project: null, pmis: null, closedId: '', closedPmis: null }
  const closedId = project.relatedClosedId || ''
  return {
    project,
    pmis: pmisMap[id] ?? null,
    closedId,
    closedPmis: closedId ? (pmisMap[closedId] ?? null) : null,
  }
}

// 风险明细列裁剪（真实表头 43 列 → 13 列；键名以 项目风险数据.xlsx 实际表头为准）
export const RISK_COLUMNS: { key: string; label: string; width?: number; date?: boolean; wrap?: boolean }[] = [
  { key: '风险编码', label: '编码', width: 110 },
  { key: '风险名称', label: '风险名称' },
  { key: '风险描述', label: '风险描述', width: 280, wrap: true },
  { key: '风险等级', label: '等级', width: 70 },
  { key: '风险状态', label: '状态', width: 90 },
  { key: '风险大类', label: '大类', width: 110 },
  { key: '风险小类', label: '小类', width: 160 },
  { key: '识别日期', label: '识别日期', width: 100, date: true },
  { key: '计划应对完成日期', label: '计划应对', width: 100, date: true },
  { key: '实际应对完成日期', label: '实际应对', width: 100, date: true },
  { key: '是否超期', label: '超期', width: 70 },
  { key: '待办任务', label: '待办任务', width: 240, wrap: true },
  { key: '责任人', label: '责任人', width: 90 },
]

/** riskRecords 的日期值为 isoformat 字符串，取前 10 位展示 */
export function fmtDateCell(v: unknown): string {
  if (v == null || v === '') return '-'
  return String(v).slice(0, 10)
}
