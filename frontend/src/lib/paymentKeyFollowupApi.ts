import { api } from '@/api/client'
import type { ScopeFilter } from './tempScope'
import type { PaymentKeyRecord } from './paymentKeyFollowup'
import type { Archive } from './projectProgressApi'

export interface PaymentKeyGetResp { success?: boolean; scope: ScopeFilter; current: Record<string, PaymentKeyRecord>; archives: Archive[] }
export interface PaymentKeyScopeResp { success: boolean; scope: ScopeFilter }
export interface PaymentKeyUpdateResp { success: boolean; record: PaymentKeyRecord }
export interface PaymentKeyArchiveResp { success: boolean; archives: Archive[]; current?: Record<string, PaymentKeyRecord> }

export const paymentKeyFollowupApi = {
  get: () => api.get<PaymentKeyGetResp>('/api/payment-key-followup'),
  saveScope: (scope: ScopeFilter) => api.post<PaymentKeyScopeResp>('/api/payment-key-followup/scope', scope),
  update: (projectId: string, field: string, content: string) =>
    api.post<PaymentKeyUpdateResp>('/api/payment-key-followup/update', { projectId, field, content }),
  archive: (rows: Record<string, unknown>[]) => api.post<PaymentKeyArchiveResp>('/api/payment-key-followup/archive', { rows }),
  deleteArchive: (archiveIdx: number) => api.post<PaymentKeyArchiveResp>('/api/payment-key-followup/archive/delete', { archiveIdx }),
}
