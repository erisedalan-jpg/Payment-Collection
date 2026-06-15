import { api } from '@/api/client'

export interface FollowupRecord {
  记录编号?: string
  跟进时间?: string
  跟进人?: string
  跟进类型?: string
  跟进内容?: string
  跟进状态?: string
  下次跟进计划日期?: string
  项目编号?: string
  项目名称?: string
  节点动作完成时间?: string
}

export interface FollowupFormData {
  项目编号: string
  项目名称: string
  跟进人: string
  跟进类型: string
  跟进内容: string
  跟进状态: string
  下次跟进计划日期?: string
  记录编号?: string
  cloudUrl?: string
}

interface TypesResp {
  success: true
  跟进类型: string[]
  跟进状态: string[]
}
interface ListResp {
  success: true
  records: FollowupRecord[]
  total: number
}
interface MutResp {
  success: true
  记录编号?: string
  message: string
}
interface DelResp {
  success: true
  message: string
}

/** 跟进记录后端调用（忠实对接 server.py handle_followup_*）。 */
export const followupApi = {
  types: () => api.get<TypesResp>('/api/followup/types'),
  list: (projectId: string, limit = 20) =>
    api.get<ListResp>(`/api/followup/list/${encodeURIComponent(projectId)}?limit=${limit}`),
  add: (data: FollowupFormData) => api.post<MutResp>('/api/followup/add', data),
  update: (data: FollowupFormData) => api.post<MutResp>('/api/followup/update', data),
  remove: (recordId: string) => api.post<DelResp>('/api/followup/delete', { 记录编号: recordId }),
}
