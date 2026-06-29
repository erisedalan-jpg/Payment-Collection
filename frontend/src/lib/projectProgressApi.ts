import { api } from '@/api/client'
import type { ProgressRecord, KeyProjectRow } from './keyProjects'

export interface Archive { archiveTime: string; rows: Partial<KeyProjectRow>[] }
export interface ProgressResp { success?: boolean; current: Record<string, ProgressRecord>; archives: Archive[] }
export interface UpdateResp { success: boolean; record: ProgressRecord }
export interface ArchiveResp { success: boolean; archives: Archive[] }

export const projectProgressApi = {
  getProgress: () => api.get<ProgressResp>('/api/progress'),
  updateProgress: (projectId: string, field: 'weekProgress' | 'nextPlan', content: string) =>
    api.post<UpdateResp>('/api/progress/update', { projectId, field, content }),
  archiveProgress: (rows: Partial<KeyProjectRow>[]) =>
    api.post<ArchiveResp>('/api/progress/archive', { rows }),
  deleteArchive: (archiveIdx: number) =>
    api.post<ArchiveResp>('/api/progress/archive/delete', { archiveIdx }),
}
