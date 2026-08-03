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
      // 忙分支:运行槽被占(如另一管理员正在下载)或有其他数据操作在跑时,后端回的是普通
      // JSON 而非 SSE 流(见 server.py 的 _send_sse_busy)。旧代码一律按 SSE 逐行找 data: 帧
      // → 一帧都解析不出 → message 空、进度面板闪现即消失(用户侧表现为"闪退、不知下载脚本
      // 是否被调用")。
      //
      // 【这段必须先于 !res.ok 判断】忙响应的状态码已从 200 改为 400(与「抢不到立即 400」的
      // 设计约定一致)。若沿用「先判 res.ok」的写法,用户看到的会是「下载失败 (400)」——
      // 把「别人正在下载」误报成失败,正是 V4.4.2 修过的那类信息丢失换个形态复发。
      const ct = res.headers?.get('content-type') || ''
      if (ct.includes('application/json')) {
        // message = 为什么拒绝你;currentMessage = 别人跑到哪了。两者语义不同,不可混用。
        let s: { running?: boolean; message?: string; currentMessage?: string } = {}
        try { s = await res.json() } catch { /* 空/坏 JSON 用兜底文案 */ }
        message.value = s.running
          ? `已有下载正在进行，请等其完成后再试${s.currentMessage ? '（当前：' + s.currentMessage + '）' : ''}`
          : (s.message || '已有数据操作正在进行，请稍后再试')
        return
      }
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
