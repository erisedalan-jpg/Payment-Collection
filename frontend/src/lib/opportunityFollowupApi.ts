import { api } from '@/api/client'
import type { ScopeFilter } from './tempScope'
import type { ProgressRecord } from './keyProjects'
import type { Archive } from './projectProgressApi'

export interface OppFollowupGetResp { success?: boolean; scope: ScopeFilter; current: Record<string, ProgressRecord>; archives: Archive[] }
export interface OppFollowupScopeResp { success: boolean; scope: ScopeFilter }
export interface OppFollowupUpdateResp { success: boolean; record: ProgressRecord }
export interface OppFollowupArchiveResp { success: boolean; archives: Archive[]; current?: Record<string, ProgressRecord> }

export const opportunityFollowupApi = {
  get: () => api.get<OppFollowupGetResp>('/api/opportunity-followup'),
  saveScope: (scope: ScopeFilter) => api.post<OppFollowupScopeResp>('/api/opportunity-followup/scope', scope),
  update: (oppId: string, field: string, content: string) =>
    api.post<OppFollowupUpdateResp>('/api/opportunity-followup/update', { oppId, field, content }),
  archive: (rows: Record<string, unknown>[]) => api.post<OppFollowupArchiveResp>('/api/opportunity-followup/archive', { rows }),
  deleteArchive: (archiveIdx: number) => api.post<OppFollowupArchiveResp>('/api/opportunity-followup/archive/delete', { archiveIdx }),
}
