// 风险跟进:把 projectPmis[pid].riskRecords 拍平为「风险行」(join 项目列),并提供单表范围匹配。
import type { Project, ProjectPmis } from '@/types/analysis'
import { leafMatch, type FieldKind } from './scopeOps'
import type { ScopeFilter, ScopeCondition, ScopeGroup, FieldLike } from './tempScope'
import { buildProjectRows, decorateProjectDomainMapped, BORROW_EXCLUDE } from './projectList'

export interface RiskFollowRecord {
  followAction?: string; followActionEditTime?: string; followActionEditBy?: string
  revConclusion?: string; revConclusionEditTime?: string; revConclusionEditBy?: string
  nextRevDate?: string; nextRevDateEditTime?: string; nextRevDateEditBy?: string
}

export interface RiskRow extends Record<string, any> {
  riskKey: string
  projectId: string
  followAction?: string; revConclusion?: string; nextRevDate?: string
}

const s = (raw: unknown): string => (raw == null ? '' : String(raw).trim())

/** 拍平全部项目的风险记录为风险行;默认含全部风险(已关闭也在内,由范围/筛选自控)。 */
export function buildRiskRows(
  projects: Project[],
  pmisMap: Record<string, ProjectPmis>,
  current: Record<string, RiskFollowRecord>,
  milestones?: Record<string, any[]>,
): RiskRow[] {
  const out: RiskRow[] = []
  const prMap = new Map(buildProjectRows(projects, pmisMap, undefined, milestones).map((r) => [r.projectId, r]))
  for (const p of projects) {
    const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
    const recs = (m.riskRecords ?? []) as Record<string, any>[]
    if (!recs.length) continue
    const contract = (p.paymentPmis as Record<string, any> | null | undefined)?.contract
    const status = m.status ?? {}
    const pr = prMap.get(p.projectId)
    for (const rr of recs) {
      const riskCode = s(rr['风险编码'])
      const riskKey = `${p.projectId}::${riskCode}`
      const follow = current[riskKey] ?? {}
      out.push({
        ...rr,                                   // 风险记录全部原始中文键
        projectId: p.projectId,
        '项目编号': p.projectId,                 // 项目主域权威值,覆盖风险记录里可能存在的同名键
        '项目名称': p.projectName ?? '',
        '客户': s(p.customer),
        '项目金额': typeof contract === 'number' ? Math.round(contract / 1000) / 10 : null,  // 万,1 位小数
        '项目级别': s(status['项目级别']),
        '项目经理': p.projectManager ?? '',
        'L4组织': p.orgL4 ?? '',
        '项目类型': s(status['项目类型']),
        '项目状态': s(status['项目状态']),
        '立项日期': pr?.setupDate ?? null,
        '项目阶段': pr?.stage ?? '-',
        '完工进展': pr?.progress ?? null,
        '项目最高风险等级': pr?.riskLevel ?? '无',
        '未关闭风险数': pr?.openRisks ?? 0,
        '预算消耗比': pr?.costRatio ?? null,
        '回款完成率': pr?.paymentRatio ?? null,
        '健康度': pr?.health ?? '无数据',
        '关注原因': (pr?.riskReasons ?? []).map((r) => r.category),
        '回款状态': pr?.paymentStatus ?? '-',
        'TOP1000': pr?.top1000 ?? '否',
        '象限': pr?.quadrant ?? '',
        riskKey,
        followAction: follow.followAction, followActionEditTime: follow.followActionEditTime, followActionEditBy: follow.followActionEditBy,
        revConclusion: follow.revConclusion, revConclusionEditTime: follow.revConclusionEditTime, revConclusionEditBy: follow.revConclusionEditBy,
        nextRevDate: follow.nextRevDate, nextRevDateEditTime: follow.nextRevDateEditTime, nextRevDateEditBy: follow.nextRevDateEditBy,
      })
    }
  }
  return decorateProjectDomainMapped(out, prMap, RISK_KEY_MAP, BORROW_EXCLUDE)
}

/** 单表范围匹配(风险行级,两级 AND/OR)。空范围 → false(视图判空决定是否回退全量)。 */
export function riskRowMatches(row: Record<string, any>, scope: ScopeFilter): boolean {
  if (!scope || !Array.isArray(scope.groups) || !scope.groups.length) return false
  const evalCond = (c: ScopeCondition) => leafMatch(row[c.field], c)
  const evalGroup = (g: ScopeGroup) =>
    g.conditions && g.conditions.length
      ? (g.combinator === 'OR' ? g.conditions.some(evalCond) : g.conditions.every(evalCond))
      : false
  const rs = scope.groups.map(evalGroup)
  return scope.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}

/** 英文 key → risk 行的中文 key。键集必须与 PROJECT_DOMAIN_COLUMNS 严格相等（契约测试守护）。
 *  ① 前 19 条目标键已存在于 RiskRow，只映射不新增列；值严禁改动（范围条件按 key 序列化）。
 *  ② 后 7 条为 V4.4.4 新增。 */
export const RISK_KEY_MAP: Record<string, string> = {
  projectId: '项目编号',      projectName: '项目名称',    projectLevel: '项目级别',
  projectManager: '项目经理', orgL4: 'L4组织',            projectType: '项目类型',
  projectStatus: '项目状态',  setupDate: '立项日期',      stage: '项目阶段',
  progress: '完工进展',       riskLevel: '项目最高风险等级',
  costRatio: '预算消耗比',    paymentRatio: '回款完成率', health: '健康度',
  riskReasons: '关注原因',    paymentStatus: '回款状态',  top1000: 'TOP1000',
  quadrant: '象限',           contractAmount: '项目金额',
  signUnit: '签约单位',       tags: '标签',
  originSetupDate: '原项目立项日期',
  plannedFinalAcceptDate: '计划终验时间',
  actualFinalAcceptDate: '实际终验时间',
  plannedCloseDate: '计划关闭时间',
  actualCloseDate: '实际关闭时间',
}

/** ScopeBuilder 单表字段目录(key 必须与风险行键一致)。 */
export const RISK_SCOPE_CATALOG: FieldLike[] = [
  { key: '风险等级', label: '风险等级', kind: 'enum' as FieldKind },
  { key: '风险状态', label: '风险状态', kind: 'enum' as FieldKind },
  { key: '风险大类', label: '风险大类', kind: 'enum' as FieldKind },
  { key: '风险小类', label: '风险小类', kind: 'enum' as FieldKind },
  { key: '风险名称', label: '风险名称', kind: 'text' as FieldKind },
  { key: '项目编号', label: '项目编号', kind: 'enum' as FieldKind },
  { key: '项目名称', label: '项目名称', kind: 'text' as FieldKind },
  { key: '客户', label: '客户', kind: 'enum' as FieldKind },
  { key: '项目级别', label: '项目级别', kind: 'enum' as FieldKind },
  { key: '项目经理', label: '项目经理', kind: 'enum' as FieldKind },
  { key: 'L4组织', label: 'L4组织', kind: 'enum' as FieldKind },
  { key: '项目类型', label: '项目类型', kind: 'enum' as FieldKind },
  { key: '项目状态', label: '项目状态', kind: 'enum' as FieldKind },
  { key: '立项日期', label: '立项日期', kind: 'date' as FieldKind },
  { key: '项目金额', label: '项目金额(万)', kind: 'number' as FieldKind },
  { key: '项目阶段', label: '项目阶段', kind: 'enum' as FieldKind },
  { key: '完工进展', label: '完工进展', kind: 'number' as FieldKind },
  { key: '项目最高风险等级', label: '项目最高风险等级', kind: 'enum' as FieldKind },
  { key: '未关闭风险数', label: '未关闭风险数', kind: 'number' as FieldKind },
  { key: '预算消耗比', label: '预算消耗比', kind: 'number' as FieldKind },
  { key: '回款完成率', label: '回款完成率', kind: 'number' as FieldKind },
  { key: '健康度', label: '健康度', kind: 'enum' as FieldKind },
  { key: '关注原因', label: '关注原因', kind: 'enum' as FieldKind },
  { key: '回款状态', label: '回款状态', kind: 'enum' as FieldKind },
  { key: 'TOP1000', label: 'TOP1000', kind: 'enum' as FieldKind },
  { key: '象限', label: '象限', kind: 'enum' as FieldKind },
  { key: '签约单位', label: '签约单位', kind: 'enum' as FieldKind },
  { key: '标签', label: '标签', kind: 'enum' as FieldKind },
  { key: '原项目立项日期', label: '原项目立项日期', kind: 'date' as FieldKind },
  { key: '计划终验时间', label: '计划终验时间', kind: 'date' as FieldKind },
  { key: '实际终验时间', label: '实际终验时间', kind: 'date' as FieldKind },
  { key: '计划关闭时间', label: '计划关闭时间', kind: 'date' as FieldKind },
  { key: '实际关闭时间', label: '实际关闭时间', kind: 'date' as FieldKind },
]
