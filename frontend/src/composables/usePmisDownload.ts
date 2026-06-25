import { ref } from 'vue'
import { apiUrl } from '@/lib/baseUrl'

/** PMIS 在线下载流水线 SSE（/api/pmis/download），与 useReprocess 同形。 */
export function usePmisDownload(opts: { onDone?: () => void } = {}) {
  const progress = ref(0)
  const message = ref('')
  const running = ref(false)

  async function start() {
    running.value = true; progress.value = 0
    try {
      const res = await fetch(apiUrl('/api/pmis/download'))
      if (!res.ok) { message.value = `下载失败 (${res.status})`; return }
      const reader = res.body?.getReader()
      if (!reader) { message.value = '无响应体'; return }
      const dec = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split('\n')) {
          const t = line.startsWith('data:') ? line.slice(5).trim() : ''
          if (!t) continue
          try {
            const s = JSON.parse(t)
            progress.value = s.progress; message.value = s.message; running.value = s.running
          } catch { /* 跳过半包 */ }
        }
      }
      opts.onDone?.()
    } finally {
      running.value = false
    }
  }
  return { progress, message, running, start }
}
