import { api } from '@/api/client'
import { apiUrl } from '@/lib/baseUrl'

export interface OppRow { id: string; [k: string]: any }
export interface OppListResp { rows: OppRow[] }
export interface OppRowResp { row: OppRow }
export interface OppImportResp { rows: OppRow[]; count: number }

export const opportunitiesApi = {
  list: () => api.get<OppListResp>('/api/opportunities'),
  create: (fields?: Record<string, any>) =>
    api.post<OppRowResp>('/api/opportunities/create', fields ? { fields } : {}),
  update: (id: string, fields: Record<string, any>) => api.post<OppRowResp>('/api/opportunities/update', { id, fields }),
  remove: (ids: string[]) => api.post<OppListResp>('/api/opportunities/delete', { ids }),
  /** 后端按裸字节读(rfile.read)，与 /api/inputs/upload 同构，直接传 File 作 body。
   *  URL 经 apiUrl() 拼接 BASE_URL 前缀，防 /pm 子路径部署下前缀丢失。*/
  importFile: async (file: File): Promise<OppImportResp> => {
    const res = await fetch(apiUrl('/api/opportunities/import'), {
      method: 'POST',
      body: file,
      credentials: 'include',
    })
    if (!res.ok) throw new Error('import failed: ' + res.status)
    return res.json()
  },
}
