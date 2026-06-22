import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AnalysisData } from '@/types/analysis'
import { apiUrl } from '@/lib/baseUrl'

// 数据源：preprocess_data.py 生成的 data/analysis_data.json（开发期经 Vite 代理到 :8080）
export const useDataStore = defineStore('data', () => {
  const data = ref<AnalysisData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    if (loading.value) return // 进行中则忽略再次调用，防止并发重复加载
    loading.value = true
    error.value = null
    try {
      const res = await fetch(apiUrl('/data/analysis_data.json') + '?t=' + Date.now())
      if (!res.ok) throw new Error(`加载数据失败 HTTP ${res.status}`)
      data.value = (await res.json()) as AnalysisData
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  /** 清空内存业务数据（projects），保留 meta。忠实移植 clearData 的内存清空。 */
  function clearBusinessData() {
    if (!data.value) return
    data.value = { ...data.value, projects: [] }
  }

  /** 强制重拉 analysis_data.json（绕过 loading 守卫 + 时间戳防缓存）。忠实移植 reloadData 的数据热更新。 */
  async function reload() {
    error.value = null
    try {
      const res = await fetch(apiUrl('/data/analysis_data.json') + '?t=' + Date.now())
      if (!res.ok) throw new Error(`加载数据失败 HTTP ${res.status}`)
      data.value = (await res.json()) as AnalysisData
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  return { data, loading, error, load, clearBusinessData, reload }
})
