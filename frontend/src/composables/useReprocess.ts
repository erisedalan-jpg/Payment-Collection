import { ref } from 'vue'
import { apiUrl } from '@/lib/baseUrl'

export function useReprocess(opts: { onDone?: () => void } = {}) {
  const progress = ref(0)
  const message = ref('')
  const running = ref(false)

  async function start() {
    running.value = true; progress.value = 0
    try {
      const res = await fetch(apiUrl('/api/reprocess'))
      if (!res.ok) { message.value = `更新失败 (${res.status})`; return }
      // 忙分支:运行槽被占(如另一管理员正在更新)或有下载/回滚在跑时,后端回的是普通
      // JSON {running,progress,message} 而非 SSE 流(见 server.py handle_reprocess 的
      // _json_response 分支)。旧代码一律按 SSE 逐行找 data: 帧 → 一帧都解析不出 → message
      // 空、进度面板闪现即消失(与「下载数据」并发闪退同款)。按 content-type 分流:是 JSON
      // 就直接把冲突提示显示出来,且不触发 onDone(本次没重算任何东西)。
      const ct = res.headers?.get('content-type') || ''
      if (ct.includes('application/json')) {
        let s: { running?: boolean; message?: string } = {}
        try { s = await res.json() } catch { /* 空/坏 JSON 用兜底文案 */ }
        message.value = s.running
          ? `已有数据更新正在进行，请等其完成后再试${s.message ? '（当前：' + s.message + '）' : ''}`
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
