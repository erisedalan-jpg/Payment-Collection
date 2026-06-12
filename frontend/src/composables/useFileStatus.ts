import { ref } from 'vue'

/** 已知数据文件的最近修改时间(数据管理页行内展示,/api/files/status) */
export function useFileStatus() {
  const files = ref<Record<string, string | null>>({})
  async function load() {
    try {
      const res = await fetch('/api/files/status')
      if (res.ok) files.value = (await res.json()).files ?? {}
    } catch { /* 离线/接口缺失时静默,行内显示 '-' */ }
  }
  return { files, load }
}
