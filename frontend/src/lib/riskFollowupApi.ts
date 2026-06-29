import { api } from '@/api/client'
import type { ScopeFilter } from './tempScope'
import type { RiskFollowRecord } from './riskRows'

export interface RiskArchive { archiveTime: string; rows: Record<string, unknown>[] }
export interface RiskGetResp { success?: boolean; scope: ScopeFilter; current: Record<string, RiskFollowRecord>; archives: RiskArchive[] }
export interface RiskScopeResp { success: boolean; scope: ScopeFilter }
export interface RiskUpdateResp { success: boolean; record: RiskFollowRecord }
export interface RiskArchiveResp { success: boolean; archives: RiskArchive[] }

export const riskFollowupApi = {
  get: () => api.get<RiskGetResp>('/api/risk-followup'),
  saveScope: (scope: ScopeFilter) => api.post<RiskScopeResp>('/api/risk-followup/scope', scope),
  update: (riskKey: string, field: 'followAction' | 'revConclusion' | 'nextRevDate', content: string) =>
    api.post<RiskUpdateResp>('/api/risk-followup/update', { riskKey, field, content }),
  archive: (rows: Record<string, unknown>[]) => api.post<RiskArchiveResp>('/api/risk-followup/archive', { rows }),
}
