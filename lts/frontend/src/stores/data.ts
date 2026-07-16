import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { AnalysisData } from '@/types/analysis'
import { apiUrl } from '@/lib/baseUrl'

// 数据源：preprocess_data.py 生成的 data/analysis_data.json（开发期经 Vite 代理到 :8080）
export const useDataStore = defineStore('data', () => {
  // 性能:analysis_data.json 约 16MB 只读快照,用 shallowRef 避免深层响应式代理 ——
  // 否则各派生页(成本/里程碑/风险等)遍历数百项目时,每次字段访问都走 reactive proxy(track/get),
  // 白白放大挂载耗时。全仓仅整体重赋值 data.value(load/reload/clear/reset),无深层字段写入,故安全。
  const data = shallowRef<AnalysisData | null>(null)
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

  /** 重置为初始态(登录/登出时调用)。杜绝身份切换后复用上一个用户已按 L4 切过的内存数据→
   *  下个页面 onMounted 的 `if(!data.data)` 守卫即触发重拉,后端按新会话切数据。 */
  function reset() {
    data.value = null
    error.value = null
    loading.value = false
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

  return { data, loading, error, load, clearBusinessData, reload, reset }
})
