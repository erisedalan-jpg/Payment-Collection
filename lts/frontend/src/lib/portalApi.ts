import { api } from '@/api/client'
import { apiUrl } from '@/lib/baseUrl'
import type { PortalConfig, PortalFileRef } from '@/lib/portal'

export async function getPortalConfig(): Promise<PortalConfig> {
  const r = await api.get<{ success: boolean; config: PortalConfig }>('/api/portal/config')
  return r.config
}

export async function savePortalConfig(config: PortalConfig): Promise<PortalConfig> {
  const r = await api.post<{ success: boolean; config: PortalConfig }>('/api/portal/config', config)
  return r.config
}

export async function uploadPortalFile(file: File): Promise<PortalFileRef> {
  const url = apiUrl('/api/portal/upload?name=' + encodeURIComponent(file.name))
  const res = await fetch(url, { method: 'POST', credentials: 'same-origin', body: file })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.success === false) throw new Error(data.message || '上传失败')
  return data.file as PortalFileRef
}

export function downloadUrl(id: string): string {
  return apiUrl('/api/portal/download?id=' + encodeURIComponent(id))
}
