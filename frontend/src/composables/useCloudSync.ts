import { ref } from 'vue'

export type SyncPhase = 'idle' | 'syncing' | 'done' | 'error' | 'stopped'
export interface CloudSyncOpts {
  eventSourceCtor?: typeof EventSource
  fetchFn?: typeof fetch
  baseUrl?: string
  onDone?: () => void
}

/** 云同步 SSE 状态机。忠实移植 startSync/stopSync。EventSource/fetch 可注入便于测试。 */
export function useCloudSync(opts: CloudSyncOpts = {}) {
  const ESCtor = opts.eventSourceCtor ?? (globalThis as any).EventSource
  const fetchFn = opts.fetchFn ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a))
  const base = opts.baseUrl ?? ''

  const phase = ref<SyncPhase>('idle')
  const progress = ref(0)
  const message = ref('')
  let es: { close: () => void; onmessage: any; onerror: any } | null = null

  function start(url: string) {
    const u = (url || '').trim()
    if (!u) {
      phase.value = 'error'
      message.value = '请先输入数据源地址（WPS云文档网址）'
      return
    }
    phase.value = 'syncing'
    progress.value = 0
    message.value = '正在连接WPS云文档...'
    es = new ESCtor(base + '/api/sync?url=' + encodeURIComponent(u))
    es!.onmessage = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data)
        if (typeof d.progress === 'number') progress.value = d.progress
        if (d.message) message.value = d.message
        if ((d.progress ?? 0) >= 100) {
          es?.close()
          phase.value = 'done'
          opts.onDone?.()
        } else if (d.running === false) {
          // 后端拒绝（如互斥：导入进行中）→ 保留其 message 置错误态，避免随后 onerror 覆盖
          es?.close()
          phase.value = 'error'
        }
      } catch {
        /* 忽略非 JSON 事件 */
      }
    }
    es!.onerror = () => {
      // 仅在同步进行中才视为连接中断；已完成/已置错误/已停止时忽略，避免覆盖真实文案
      if (phase.value !== 'syncing') return
      es?.close()
      phase.value = 'error'
      message.value = '同步连接中断，请检查浏览器/云文档地址/网络后重试'
    }
  }

  function stop() {
    es?.close()
    es = null
    phase.value = 'stopped'
    progress.value = 0
    message.value = '同步已停止'
    try {
      fetchFn(base + '/api/stop-sync')
    } catch {
      /* best-effort */
    }
  }

  return { phase, progress, message, start, stop }
}
