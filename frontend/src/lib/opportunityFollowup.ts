import type { OppRow } from './opportunitiesApi'
import { recentUpdateOf } from './opportunityColumns'
import { followDate, followBy, type ProgressRecord } from './keyProjects'

const s = (raw: unknown): string => (raw == null ? '' : String(raw))

export interface OppFollowupRow extends Record<string, any> {
  id: string
  weekProgress: string; weekProgressEditTime: string; weekProgressEditBy: string
  nextPlan: string; nextPlanEditTime: string; nextPlanEditBy: string
  followDate: string; followBy: string
  recentUpdate: string
}

/** 全部商机行(注入 recentUpdate + 跟进记录),不做范围过滤;范围匹配由调用方对返回行跑 opportunityMatches。 */
export function buildOppFollowupRows(
  opps: OppRow[],
  current: Record<string, ProgressRecord>,
  now: Date,
): OppFollowupRow[] {
  return opps.map((o) => {
    const rec: ProgressRecord = current[o.id] ?? {}
    return {
      ...o,
      recentUpdate: recentUpdateOf(s(o.lastUpdate), now),
      weekProgress: s(rec.weekProgress), weekProgressEditTime: s(rec.weekProgressEditTime), weekProgressEditBy: s(rec.weekProgressEditBy),
      nextPlan: s(rec.nextPlan), nextPlanEditTime: s(rec.nextPlanEditTime), nextPlanEditBy: s(rec.nextPlanEditBy),
      followDate: followDate(rec), followBy: followBy(rec),
    }
  })
}
