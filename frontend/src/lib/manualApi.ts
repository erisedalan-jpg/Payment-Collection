import { api } from '@/api/client'
import { apiUrl } from '@/lib/baseUrl'

export interface ManualError { sheet: string; row: number; col?: string; message: string }
export interface ImportResp {
  success: boolean; message?: string; errors?: ManualError[]; backupId?: string
  tags?: { projects: number; tagsCount: number }; followup?: { count: number }
}
export interface ManualBackup {
  id: string; createdAt?: string; sourceName?: string; tagProjects?: number; followupCount?: number
}

/** 导入：故意用裸 fetch（不走 api.post 的 success:false 抛错封装），以便拿到校验 errors 明细。 */
async function importManual(
  sheets: Record<string, string[][]>,
  fileName: string,
): Promise<ImportResp> {
  const res = await fetch(apiUrl('/api/manual/import'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheets, fileName }),
  })
  return (await res.json()) as ImportResp
}

export const manualApi = {
  import: importManual,
  backups: () => api.get<{ success: boolean; versions: ManualBackup[] }>('/api/manual/backups'),
  rollback: (id: string) =>
    api.post<{ success: boolean; message?: string }>('/api/manual/rollback', { id }),
}
