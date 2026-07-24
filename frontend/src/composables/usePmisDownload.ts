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
      // 忙分支:运行槽被占(如另一管理员正在下载)或有其他数据操作在跑时,后端回的是普通
      // JSON {running,progress,message} 而非 SSE 流(见 server.py handle_pmis_download 的
      // _json_response 分支)。旧代码一律按 SSE 逐行找 data: 帧 → 一帧都解析不出 → message
      // 空、进度面板闪现即消失(用户侧表现为"闪退、不知下载脚本是否被调用")。这里按
      // content-type 分流:是 JSON 就直接把冲突提示显示出来,且不触发 onDone(本次没下载任何东西)。
      const ct = res.headers?.get('content-type') || ''
      if (ct.includes('application/json')) {
        let s: { running?: boolean; message?: string } = {}
        try { s = await res.json() } catch { /* 空/坏 JSON 用兜底文案 */ }
        message.value = s.running
          ? `已有下载正在进行，请等其完成后再试${s.message ? '（当前：' + s.message + '）' : ''}`
          : (s.message || '已有数据操作正在进行，请稍后再试')
        return
      }
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
