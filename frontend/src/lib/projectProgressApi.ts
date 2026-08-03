import { api } from '@/api/client'
import type { ProgressRecord, KeyProjectRow } from './keyProjects'

export interface Archive { archiveTime: string; rows: Partial<KeyProjectRow>[] }
export interface ProgressResp { success?: boolean; current: Record<string, ProgressRecord>; archives: Archive[] }
export interface UpdateResp { success: boolean; record: ProgressRecord }
/** current/kept 是 L-63 后新增:归档只清「快照覆盖到的」记录,范围外记录会被后端留下来,
 *  故 current 必须以后端回传的为准(不可前端硬编码清空,否则 UI 与后端错位);
 *  kept = 被保留的范围外记录条数,供页面提示。两者都可选,兼容旧后端与既有测试 mock。 */
export interface ArchiveResp {
  success: boolean; archives: Archive[]
  current?: Record<string, ProgressRecord>; kept?: number
}

export const projectProgressApi = {
  getProgress: () => api.get<ProgressResp>('/api/progress'),
  updateProgress: (projectId: string, field: 'weekProgress' | 'nextPlan', content: string) =>
    api.post<UpdateResp>('/api/progress/update', { projectId, field, content }),
  archiveProgress: (rows: Partial<KeyProjectRow>[]) =>
    api.post<ArchiveResp>('/api/progress/archive', { rows }),
  deleteArchive: (archiveIdx: number) =>
    api.post<ArchiveResp>('/api/progress/archive/delete', { archiveIdx }),
}
