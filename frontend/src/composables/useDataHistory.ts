import { ref } from 'vue'
import { api, ApiRequestError } from '@/api/client'

export interface HistoryVersion {
  id: string
  createdAt?: string
  projectCount?: number
  paymentNodeCount?: number
  dataLastUpdate?: string
  sizeBytes?: number
  contents?: string[]
}
export interface HistorySource {
  id?: string
  refreshedFrom?: string
  refreshedAt?: string
  sizeBytes?: number
  contents?: string[]
}
interface HistoryResp { versions: HistoryVersion[]; preRollback: HistoryVersion | null; source?: HistorySource | null }

export function useDataHistory(opts: { onChange?: () => void } = {}) {
  const versions = ref<HistoryVersion[]>([])
  const preRollback = ref<HistoryVersion | null>(null)
  const source = ref<HistorySource | null>(null)
  const busy = ref(false)
  const message = ref('')

  async function load() {
    try {
      const r = await api.get<HistoryResp>('/api/data-history')
      versions.value = r.versions ?? []
      preRollback.value = r.preRollback ?? null
      source.value = r.source ?? null
    } catch (e) {
      message.value = e instanceof ApiRequestError ? e.message : '加载历史失败'
    }
  }

  async function rollback(id: string) {
    busy.value = true; message.value = ''
    try {
      await api.post('/api/data-history/rollback', { id })
      message.value = '回滚完成'
      await load()
      opts.onChange?.()
    } catch (e) {
      message.value = e instanceof ApiRequestError ? e.message : '回滚失败'
    } finally {
      busy.value = false
    }
  }

  async function undo() {
    busy.value = true; message.value = ''
    try {
      await api.post('/api/data-history/undo-rollback', {})
      message.value = '已撤销回滚'
      await load()
      opts.onChange?.()
    } catch (e) {
      message.value = e instanceof ApiRequestError ? e.message : '撤销失败'
    } finally {
      busy.value = false
    }
  }

  return { versions, preRollback, source, busy, message, load, rollback, undo }
}
