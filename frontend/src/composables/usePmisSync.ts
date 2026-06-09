import { ref } from 'vue'

export const PMIS_FILE_NAMES = [
  '项目中心.xlsx', '项目基础信息数据.xlsx', '项目状态信息数据.xlsx', '项目风险数据.xlsx',
  '项目中心-已关闭.xlsx', '项目基础信息数据-已关闭.xlsx', '项目状态信息数据-已关闭.xlsx',
]

export function usePmisSync(opts: { onDone?: () => void } = {}) {
  const links = ref<Record<string, string>>({})
  const progress = ref(0)
  const message = ref('')
  const running = ref(false)

  async function loadLinks() {
    const res = await fetch('/api/pmis/links')
    if (res.ok) links.value = (await res.json()).links ?? {}
  }
  async function saveLinks() {
    await fetch('/api/pmis/links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: links.value }),
    })
  }
  async function download() {
    running.value = true; progress.value = 0
    try {
      await saveLinks()
      const res = await fetch('/api/pmis/download')
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
    } finally {
      running.value = false
    }
  }
  async function upload(files: File[]): Promise<number> {
    let ok = 0
    for (const f of files) {
      if (!PMIS_FILE_NAMES.includes(f.name)) continue
      const buf = await f.arrayBuffer()
      const res = await fetch('/api/pmis/upload?name=' + encodeURIComponent(f.name), {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
      })
      if (res.ok) ok++
    }
    return ok
  }
  return { links, progress, message, running, loadLinks, saveLinks, download, upload, PMIS_FILE_NAMES }
}
