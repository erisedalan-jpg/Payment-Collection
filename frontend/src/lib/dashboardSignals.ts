import type { RawNode } from '@/types/analysis'
import { getNodeRemaining } from './riskGroups'

export interface DashSignal {
  /** 本月需回款（元）：planMonth=当月且未回款节点的待回款合计 */
  monthDue: number
  /** 7 天内临期节点数：planDate 落在 [today, today+7天] 且未回款 */
  due7Count: number
  /** 延期额（元）：nodeStatus='延期' 节点的待回款合计（rem<0 按 0 计，永不为负） */
  delayed: number
  /** 待跟进节点数：planDate 落在 [today, today+30天]、未回款、且该节点所属项目无"跟进中"记录 */
  toFollowupCount: number
}

/** today('YYYY-MM-DD') + n 天 → 'YYYY-MM-DD'（UTC 锚点，避免时区漂移）。 */
function addDays(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00Z')
  return new Date(d.getTime() + days * 864e5).toISOString().slice(0, 10)
}

/** 该节点所属项目是否有"跟进中"记录（followupRecords 为后端附的项目近期记录）。 */
function hasOpenFollowup(n: Record<string, any>): boolean {
  const recs = Array.isArray(n.followupRecords) ? n.followupRecords : []
  return recs.some((r: any) => r && r['跟进状态'] === '跟进中')
}

/** 看板首页"待办速览"4 信号。today 注入便于测试（组件传本地当天）。 */
export function dashboardSignals(nodes: RawNode[], today: string): DashSignal {
  const month = today.slice(0, 7)
  const horizon7 = addDays(today, 7)
  const horizon30 = addDays(today, 30)

  let monthDue = 0
  let due7Count = 0
  let delayed = 0
  let toFollowupCount = 0

  for (const node of nodes) {
    const n = node as Record<string, any>
    const rem = getNodeRemaining(n)

    if (n.planMonth === month && rem > 0) monthDue += rem
    if (n.nodeStatus === '延期') delayed += Math.max(0, rem)

    const pd: string = typeof n.planDate === 'string' ? n.planDate : ''
    if (pd && rem > 0 && pd >= today) {
      if (pd <= horizon7) due7Count++
      if (pd <= horizon30 && !hasOpenFollowup(n)) toFollowupCount++
    }
  }

  return { monthDue, due7Count, delayed, toFollowupCount }
}
