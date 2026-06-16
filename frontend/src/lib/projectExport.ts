import type { Project, PaymentNodePmis, MilestoneItem } from '@/types/analysis'

export type ExportScope = 'list' | 'tags' | 'followup' | 'nodes' | 'milestones'

export interface ExportCtx {
  rows: Record<string, any>[]            // /projects 当前筛选后的 ProjectRow[]（决定项目集）
  projects: Project[]
  assignments: Record<string, string[]>
  followup: Record<string, any>[]        // 全量跟进记录
  paymentNodes: Record<string, PaymentNodePmis[]>
  milestones: Record<string, MilestoneItem[]>
}

const LIST_COLS: [string, string][] = [
  ['projectId', '项目编号'],
  ['projectName', '项目名称'],
  ['projectManager', '经理'],
  ['orgL4', '服务组'],
  ['stage', '阶段'],
  ['contractAmount', '合同金额(万)'],
  ['paymentRatio', '回款完成率'],
  ['health', '健康度'],
]

export function buildExportSheets(
  scope: ExportScope[],
  ctx: ExportCtx,
): { name: string; rows: Record<string, unknown>[] }[] {
  const pids = new Set(ctx.rows.map((r) => r.projectId as string))
  const out: { name: string; rows: Record<string, unknown>[] }[] = []

  if (scope.includes('list')) {
    out.push({
      name: '项目清单',
      rows: ctx.rows.map((r) => {
        const o: Record<string, unknown> = {}
        for (const [k, label] of LIST_COLS) o[label] = r[k] ?? ''
        o['标签'] = (r.tags ?? []).join('、')
        return o
      }),
    })
  }

  if (scope.includes('tags')) {
    out.push({
      name: '项目标签',
      rows: ctx.rows.map((r) => ({
        项目编号: r.projectId,
        项目名称: r.projectName ?? '',
        标签: (ctx.assignments[r.projectId] ?? []).join('、'),
      })),
    })
  }

  if (scope.includes('followup')) {
    out.push({
      name: '跟进记录',
      rows: ctx.followup
        .filter((r) => pids.has(r['项目编号']))
        .map((r) => ({
          记录编号: r['记录编号'] ?? '',
          项目编号: r['项目编号'],
          项目名称: r['项目名称'] ?? '',
          跟进人: r['跟进人'] ?? '',
          跟进类型: r['跟进类型'] ?? '',
          跟进内容: r['跟进内容'] ?? '',
          跟进状态: r['跟进状态'] ?? '',
          下次跟进计划日期: r['下次跟进计划日期'] ?? '',
          跟进时间: r['跟进时间'] ?? '',
        })),
    })
  }

  if (scope.includes('nodes')) {
    const rows: Record<string, unknown>[] = []
    for (const r of ctx.rows) {
      for (const n of ctx.paymentNodes[r.projectId] ?? []) {
        rows.push({
          项目编号: r.projectId,
          项目名称: r.projectName ?? '',
          阶段: n.stage,
          计划日: n.planDate ?? '',
          实际日: n.actualDate ?? '',
          计划比例: n.payRatio ?? '',
          计划金额: n.expectedPayment ?? '',
          状态: n.status ?? '',
        })
      }
    }
    out.push({ name: '回款节点', rows })
  }

  if (scope.includes('milestones')) {
    const rows: Record<string, unknown>[] = []
    for (const r of ctx.rows) {
      for (const m of ctx.milestones[r.projectId] ?? []) {
        rows.push({
          项目编号: r.projectId,
          项目名称: r.projectName ?? '',
          里程碑: m.name,
          计划: m.planDate ?? '',
          实际: m.actualDate ?? '',
          关联回款阶段: m.payStage ?? '',
          优先级: m.priority ?? '',
        })
      }
    }
    out.push({ name: '里程碑', rows })
  }

  return out
}
