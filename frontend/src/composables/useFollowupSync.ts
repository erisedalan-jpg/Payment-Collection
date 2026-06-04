import { ref } from 'vue'
import { followupApi } from '@/lib/followupApi'

export type SyncStatus = 'syncing' | 'success' | 'failed' | 'local' | 'unknown'
export interface SyncToast {
  id: string
  status: SyncStatus
  text: string
}
export interface SyncOpts {
  pollMs?: number
  maxPolls?: number
  syncStatusFn?: (recordId: string) => Promise<{ state: { status: string; message: string } }>
}

let _seq = 0

/** 同步状态 toast + 轮询（忠实移植 _showFollowupSyncToast/_pollFollowupSyncStatus）。时间/轮询函数可注入便于测试。 */
export function useFollowupSync(opts: SyncOpts = {}) {
  const pollMs = opts.pollMs ?? 2000
  const maxPolls = opts.maxPolls ?? 60
  const syncStatusFn = opts.syncStatusFn ?? ((id: string) => followupApi.syncStatus(id))

  const toasts = ref<SyncToast[]>([])
  function add(t: SyncToast) {
    toasts.value = [...toasts.value, t]
  }
  function update(id: string, patch: Partial<SyncToast>) {
    toasts.value = toasts.value.map((t) => (t.id === id ? { ...t, ...patch } : t))
  }
  function remove(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function notify(message: string, recordId: string) {
    const id = 'to_' + ++_seq
    const isCloud = !!recordId && (message.includes('正在同步') || message.includes('正在重新同步'))
    if (!isCloud) {
      add({ id, status: 'local', text: message || '已保存到本地' })
      setTimeout(() => remove(id), 4000)
      return
    }
    add({ id, status: 'syncing', text: '正在同步到云文档...' })
    let polls = 0
    const timer = setInterval(async () => {
      polls++
      if (polls > maxPolls) {
        clearInterval(timer)
        update(id, { status: 'unknown', text: '同步耗时较长，状态未知' })
        setTimeout(() => remove(id), 8000)
        return
      }
      try {
        const r = await syncStatusFn(recordId)
        const st = r.state || { status: 'unknown', message: '' }
        if (st.status === 'syncing') {
          update(id, { text: st.message || '同步中...' })
        } else if (st.status === 'success') {
          clearInterval(timer)
          update(id, { status: 'success', text: '已同步到云文档' })
          setTimeout(() => remove(id), 5000)
        } else if (st.status === 'failed') {
          clearInterval(timer)
          update(id, { status: 'failed', text: '同步失败' })
          setTimeout(() => remove(id), 8000)
        }
      } catch {
        /* 网络错误，继续轮询 */
      }
    }, pollMs)
  }

  return { toasts, notify }
}
