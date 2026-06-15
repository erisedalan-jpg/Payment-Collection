import { api } from '@/api/client'

export interface TagDef { name: string; disabled?: boolean }
export interface TagStore { tags: TagDef[]; assignments: Record<string, string[]> }

export function getTags(): Promise<TagStore & { success?: boolean }> {
  return api.get<TagStore & { success?: boolean }>('/api/tags')
}
export function saveTags(store: TagStore): Promise<{ success: boolean }> {
  return api.post<{ success: boolean }>('/api/tags', store)
}
