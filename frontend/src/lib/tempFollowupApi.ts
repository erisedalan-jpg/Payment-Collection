import { api } from '@/api/client'
import type { ScopeFilter } from './tempScope'
import type { ProgressRecord } from './keyProjects'
import type { Archive } from './projectProgressApi'

export interface TempGetResp { success?: boolean; scope: ScopeFilter; current: Record<string, ProgressRecord>; archives: Archive[] }
export interface TempScopeResp { success: boolean; scope: ScopeFilter }
export interface TempUpdateResp { success: boolean; record: ProgressRecord }
export interface TempArchiveResp { success: boolean; archives: Archive[] }

export const tempFollowupApi = {
  get: () => api.get<TempGetResp>('/api/temp-followup'),
  saveScope: (scope: ScopeFilter) => api.post<TempScopeResp>('/api/temp-followup/scope', scope),
  update: (projectId: string, field: 'weekProgress' | 'nextPlan', content: string) =>
    api.post<TempUpdateResp>('/api/temp-followup/update', { projectId, field, content }),
  archive: (rows: Record<string, unknown>[]) => api.post<TempArchiveResp>('/api/temp-followup/archive', { rows }),
  deleteArchive: (archiveIdx: number) => api.post<TempArchiveResp>('/api/temp-followup/archive/delete', { archiveIdx }),
}
