import type { MilestoneProject, MilestoneStatus } from './milestoneAnalytics'
import { ymd } from './milestoneAnalytics'

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

import { reminderBounds, addDays } from './milestoneAnalytics'

export type ReminderWin = '7d' | '30d' | 'quarter'
export interface ReminderRow {
  projectId: string; projectName: string; projectType: string; manager: string
  orgL3: string; orgL4: string; node: string; planDate: string; payStage: string
  linked: '是' | '否'; priority: string; priorityLabel: string; urgency: 'urgent' | 'warn' | ''
}

const PR_LABEL: Record<string, string> = { high: '高', mid: '中', low: '低' }

/** 到期提醒(节点级):窗口内未完成节点逐条成行。 */
export function buildReminderRows(ps: MilestoneProject[], now: Date, win: ReminderWin): ReminderRow[] {
  const b = reminderBounds(now)
  const [start, end] = win === '7d' ? [b.today, b.d7] : win === '30d' ? [b.today, b.d30] : [b.qs, b.qe]
  const out: ReminderRow[] = []
  for (const p of ps) {
    for (const n of p.nodes) {
      if ((n.actualDate ?? '').trim()) continue
      const pd = (n.planDate ?? '').slice(0, 10)
      if (!pd || pd < start || pd > end) continue
      const diff = dayDiff(pd, now)
      const pr = ((n as any).priority === 'high' || (n as any).priority === 'mid') ? (n as any).priority : 'low'
      const payStage = ((n as any).payStage ?? '').trim()
      out.push({
        projectId: p.projectId, projectName: p.projectName, projectType: p.projectType, manager: p.manager,
        orgL3: p.orgL3, orgL4: p.orgL4, node: n.name ?? '', planDate: pd, payStage,
        linked: payStage ? '是' : '否', priority: pr, priorityLabel: PR_LABEL[pr],
        urgency: diff <= 3 ? 'urgent' : diff <= 7 ? 'warn' : '',
      })
    }
  }
  return out
}

export interface ReminderStat { projectCount: number; nodeCount: number; within7: number; withinWeek: number }
export function reminderStat(rows: ReminderRow[], now: Date): ReminderStat {
  const today = reminderBounds(now).today
  const d7 = addDays(now, 7)
  const we = addDays(now, 7 - now.getDay()) // 本周末(下个周日)
  const pids = new Set<string>()
  let within7 = 0, withinWeek = 0
  for (const r of rows) {
    pids.add(r.projectId)
    const pd = r.planDate.slice(0, 10)
    if (pd >= today && pd <= d7) within7++
    if (pd >= today && pd <= we) withinWeek++
  }
  return { projectCount: pids.size, nodeCount: rows.length, within7, withinWeek }
}
