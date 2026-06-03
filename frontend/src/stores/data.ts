import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AnalysisData } from '@/types/analysis'

// 数据源：preprocess_data.py 生成的 data/analysis_data.json（开发期经 Vite 代理到 :8080）
export const useDataStore = defineStore('data', () => {
  const data = ref<AnalysisData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const res = await fetch('/data/analysis_data.json')
      if (!res.ok) throw new Error(`加载数据失败 HTTP ${res.status}`)
      data.value = (await res.json()) as AnalysisData
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, load }
})
