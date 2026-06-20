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
