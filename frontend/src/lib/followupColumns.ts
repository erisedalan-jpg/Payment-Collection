import { api } from '@/api/client'

export type FollowupTableId = 'temp' | 'risk' | 'payment_key' | 'opportunity'
export type CustomColumnType = 'text' | 'date'
export interface CustomColumn {
  key: string
  label: string
  type: CustomColumnType
  clearOnArchive: boolean
}
export type FollowupColumnsConfig = Record<FollowupTableId, CustomColumn[]>

export interface FollowupColumnsGetResp { success: boolean; tables: Partial<FollowupColumnsConfig> }
export interface FollowupColumnMutateResp { success: boolean; column: CustomColumn }
export interface FollowupColumnsReorderResp { success: boolean; columns: CustomColumn[] }
export interface FollowupColumnDeleteResp { success: boolean; deleted?: CustomColumn; affectedRows: number }

export const followupColumnsApi = {
  async getAll(): Promise<FollowupColumnsConfig> {
    const r = await api.get<FollowupColumnsGetResp>('/api/followup-columns')
    return (r.tables ?? {}) as FollowupColumnsConfig
  },
  async add(table: FollowupTableId, label: string, type: CustomColumnType, clearOnArchive: boolean): Promise<CustomColumn> {
    const r = await api.post<FollowupColumnMutateResp>('/api/followup-columns/add', { table, label, type, clearOnArchive })
    return r.column
  },
  async update(table: FollowupTableId, key: string,
               patch: Partial<Pick<CustomColumn, 'label' | 'type' | 'clearOnArchive'>>): Promise<CustomColumn> {
    const r = await api.post<FollowupColumnMutateResp>('/api/followup-columns/update', { table, key, ...patch })
    return r.column
  },
  async reorder(table: FollowupTableId, keys: string[]): Promise<CustomColumn[]> {
    const r = await api.post<FollowupColumnsReorderResp>('/api/followup-columns/reorder', { table, keys })
    return r.columns ?? []
  },
  async remove(table: FollowupTableId, key: string): Promise<{ affectedRows: number }> {
    const r = await api.post<FollowupColumnDeleteResp>('/api/followup-columns/delete', { table, key })
    return { affectedRows: Number(r.affectedRows ?? 0) }
  },
}
