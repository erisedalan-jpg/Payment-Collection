import { api } from '@/api/client'
import type { ScopeFilter } from './tempScope'
import type { ProgressRecord } from './keyProjects'
import type { Archive } from './projectProgressApi'

export interface TempInstance {
  id: string
  name: string
  scope: ScopeFilter
  current: Record<string, ProgressRecord>
  archives: Archive[]
}

export interface TempGetResp { success?: boolean; instances: TempInstance[] }
export interface TempScopeResp { success: boolean; scope: ScopeFilter }
export interface TempUpdateResp { success: boolean; record: ProgressRecord }
export interface TempArchiveResp { success: boolean; archives: Archive[]; current?: Record<string, ProgressRecord> }
export interface TempInstancesResp { success: boolean; instances: TempInstance[] }
export interface TempInstanceCreateResp extends TempInstancesResp { instance: TempInstance }

export const tempFollowupApi = {
  get: () => api.get<TempGetResp>('/api/temp-followup'),
  saveScope: (instanceId: string, scope: ScopeFilter) =>
    api.post<TempScopeResp>('/api/temp-followup/scope', { instanceId, ...scope }),
  update: (instanceId: string, projectId: string, field: string, content: string) =>
    api.post<TempUpdateResp>('/api/temp-followup/update', { instanceId, projectId, field, content }),
  archive: (instanceId: string, rows: Record<string, unknown>[]) =>
    api.post<TempArchiveResp>('/api/temp-followup/archive', { instanceId, rows }),
  deleteArchive: (instanceId: string, archiveIdx: number) =>
    api.post<TempArchiveResp>('/api/temp-followup/archive/delete', { instanceId, archiveIdx }),
  createInstance: (name: string, copyFrom?: string) =>
    api.post<TempInstanceCreateResp>('/api/temp-followup/instances/create', { name, copyFrom }),
  renameInstance: (instanceId: string, name: string) =>
    api.post<TempInstancesResp>('/api/temp-followup/instances/rename', { instanceId, name }),
  deleteInstance: (instanceId: string) =>
    api.post<TempInstancesResp>('/api/temp-followup/instances/delete', { instanceId }),
}
