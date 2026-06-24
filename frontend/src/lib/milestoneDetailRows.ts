import type { MilestoneProject, MilestoneStatus } from './milestoneAnalytics'
import { ymd, reminderBounds } from './milestoneAnalytics'

export const NODE_TYPES = [
  '项目启动', '到货', '服务进场', '交付完工', '初验', '项目完工（服务离场）',
  '终验', '项目关闭', '驻场', '实物点验', '服务完成', '节点成果确认',
] as const

function dayDiff(planYmd: string, now: Date): number {
  const [y, m, d] = planYmd.split('-').map(Number)
  const plan = new Date(y, (m || 1) - 1, d || 1).getTime()
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((plan - t) / 86400000)
}

export interface DelayedRow {
  projectId: string; projectName: string; projectType: string; orgL3: string; orgL4: string
  manager: string; status: MilestoneStatus; delayedNodes: string
}

/** 延期清单：非正常项目;延期节点=该项目 planDate<今 且 actualDate 空 的去重节点名(、连接),无则 '-'。 */
export function buildDelayedRows(ps: MilestoneProject[], now: Date): DelayedRow[] {
  const today = ymd(now)
  const out: DelayedRow[] = []
  for (const p of ps) {
    if (p.status === '正常') continue
    const names: string[] = []
    for (const n of p.nodes) {
      const pd = (n.planDate ?? '').slice(0, 10)
      if (pd && pd < today && !(n.actualDate ?? '').trim()) {
        const nm = n.name ?? ''
        if (nm && !names.includes(nm)) names.push(nm)
      }
    }
    out.push({
      projectId: p.projectId, projectName: p.projectName, projectType: p.projectType,
      orgL3: p.orgL3, orgL4: p.orgL4, manager: p.manager, status: p.status,
      delayedNodes: names.length ? names.join('、') : '-',
    })
  }
  return out
}

export { dayDiff }

export type ReminderPreset = 'd7' | 'm1' | 'quarter'

/** 时间段快捷档:start 一律今日(向后看);d7=今+7、m1=今+1月、quarter=本季度边界。 */
export function reminderRange(now: Date, preset: ReminderPreset): { start: string; end: string } {
  const b = reminderBounds(now)
  if (preset === 'd7') return { start: b.today, end: b.d7 }
  if (preset === 'quarter') return { start: b.qs, end: b.qe }
  return { start: b.today, end: ymd(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())) }
}

export interface ReminderRow {
  projectId: string; projectName: string; projectType: string; manager: string
  orgL3: string; orgL4: string; node: string; planDate: string; payStage: string
  linked: '是' | '否'; priority: string; priorityLabel: string; urgency: 'urgent' | 'warn' | ''
  contract: number; actualDate: string; done: '是' | '否'; overdue: boolean
}

const PR_LABEL: Record<string, string> = { high: '高', mid: '中', low: '低' }

/** 到期清单(节点级,含已完成):planDate∈range 的节点逐条成行;range=null 取全部。 */
export function buildReminderRows(ps: MilestoneProject[], now: Date, range: { start: string; end: string } | null): ReminderRow[] {
  const today = ymd(now)
  const out: ReminderRow[] = []
  for (const p of ps) {
    for (const n of p.nodes) {
      const pd = (n.planDate ?? '').slice(0, 10)
      if (!pd) continue
      if (range && (pd < range.start || pd > range.end)) continue
      const actual = (n.actualDate ?? '').slice(0, 10)
      const diff = dayDiff(pd, now)
      const pr = ((n as any).priority === 'high' || (n as any).priority === 'mid') ? (n as any).priority : 'low'
      const payStage = ((n as any).payStage ?? '').trim()
      out.push({
        projectId: p.projectId, projectName: p.projectName, projectType: p.projectType, manager: p.manager,
        orgL3: p.orgL3, orgL4: p.orgL4, node: n.name ?? '', planDate: pd, payStage,
        linked: payStage ? '是' : '否', priority: pr, priorityLabel: PR_LABEL[pr],
        contract: p.contract, actualDate: actual, done: actual ? '是' : '否',
        overdue: !actual && pd < today,
        urgency: actual ? '' : (diff <= 3 ? 'urgent' : diff <= 7 ? 'warn' : ''),
      })
    }
  }
  return out
}

export interface ReminderStat { total: number; done: number; undone: number; overdue: number }
export function reminderStat(rows: ReminderRow[]): ReminderStat {
  let done = 0, overdue = 0
  for (const r of rows) {
    if (r.done === '是') done++
    if (r.overdue) overdue++
  }
  return { total: rows.length, done, undone: rows.length - done, overdue }
}

export interface PlanRow extends Record<string, string | number> {
  projectId: string; projectName: string; contract: number
  orgL3: string; orgL3_1: string; orgL4: string; manager: string; projectType: string
}

/** 在建里程碑计划宽表:每项目一行,12 节点类型各两列(计划/实际日期,取首个同名节点,缺为 '')。 */
export function buildPlanRows(ps: MilestoneProject[]): PlanRow[] {
  return ps.map((p) => {
    const row: Record<string, string | number> = {
      projectId: p.projectId, projectName: p.projectName, contract: p.contract,
      orgL3: p.orgL3, orgL3_1: p.orgL3_1, orgL4: p.orgL4, manager: p.manager, projectType: p.projectType,
    }
    for (const t of NODE_TYPES) {
      const n = p.nodes.find((x) => (x.name ?? '') === t)
      row[`计划_${t}`] = (n?.planDate ?? '').slice(0, 10)
      row[`实际_${t}`] = (n?.actualDate ?? '').slice(0, 10)
    }
    return row as PlanRow
  })
}
