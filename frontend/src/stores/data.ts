import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AnalysisData } from '@/types/analysis'

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
      const res = await fetch('/data/analysis_data.json')
      if (!res.ok) throw new Error(`加载数据失败 HTTP ${res.status}`)
      data.value = (await res.json()) as AnalysisData
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  /** 清空业务数据（rawNodes/summary/dashboard/projectOverview.projects），保留平台配置（displayColumns/meta/列定义）。忠实移植 clearData 的内存清空。 */
  function clearBusinessData() {
    if (!data.value) return
    const ov = (data.value.projectOverview ?? {}) as Record<string, any>
    data.value = {
      ...data.value,
      rawNodes: [],
      summary: {} as any,
      dashboard: {} as any,
      projectOverview: { ...ov, projects: [] } as any,
    }
  }

  return { data, loading, error, load, clearBusinessData }
})
