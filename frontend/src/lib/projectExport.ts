import type { Project, PaymentNodePmis, MilestoneItem } from '@/types/analysis'

export type ExportScope = 'list' | 'tags' | 'followup' | 'nodes' | 'milestones'

/** 「项目清单」sheet 的导出列。由 /projects 当前可见列(visibleColumns)派生，实现「导出=页面所见列」。
 *  formatter 直接复用列定义里的展示 formatter，做到导出文本与页面一致。 */
export interface ExportListCol {
  key: string
  label: string
  formatter?: (v: any, r: Record<string, any>) => string
}

export interface ExportCtx {
  rows: Record<string, any>[]            // /projects 当前筛选后的 ProjectRow[]（决定项目集）
  projects: Project[]
  assignments: Record<string, string[]>
  followup: Record<string, any>[]        // 全量跟进记录
  paymentNodes: Record<string, PaymentNodePmis[]>
  milestones: Record<string, MilestoneItem[]>
  // 传入则「项目清单」按当前可见列导出(排除操作列);不传回退固定 LIST_COLS(向后兼容)。
  listColumns?: ExportListCol[]
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
    if (ctx.listColumns && ctx.listColumns.length) {
      // 按当前可见列导出:排除操作列(无数据),值优先走列自带 formatter(与页面一致),
      // riskReasons 是数组对象、取 category 拼接,其余原样。
      const cols = ctx.listColumns.filter((c) => c.key !== 'action')
      out.push({
        name: '项目清单',
        rows: ctx.rows.map((r) => {
          const o: Record<string, unknown> = {}
          for (const c of cols) {
            const raw = (r as Record<string, any>)[c.key]
            if (c.formatter) o[c.label] = c.formatter(raw, r)
            else if (c.key === 'riskReasons') o[c.label] = Array.isArray(raw) ? raw.map((x: any) => x?.category ?? '').filter(Boolean).join('、') : ''
            else o[c.label] = raw ?? ''
          }
          return o
        }),
      })
    } else {
      out.push({
        name: '项目清单',
        rows: ctx.rows.map((r) => {
          const o: Record<string, unknown> = {}
          for (const [k, label] of LIST_COLS) {
            const raw = r[k]
            if (k === 'contractAmount') o[label] = typeof raw === 'number' ? raw / 10000 : (raw ?? '')
            else o[label] = raw ?? ''
          }
          o['标签'] = (r.tags ?? []).join('、')
          return o
        }),
      })
    }
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
