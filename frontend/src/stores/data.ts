import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { AnalysisData } from '@/types/analysis'
import { apiUrl } from '@/lib/baseUrl'

// 数据源：preprocess_data.py 生成的 data/analysis_data.json（开发期经 Vite 代理到 :8080）
export const useDataStore = defineStore('data', () => {
  // 性能:analysis_data.json 是只读大快照(实测于 2026-08-03:18,285,154 B ≈ 17.44 MiB;
  // 该体积随数据量增长,只是当时的观测值,不要当常量引用、也不要据此写阈值),
  // 用 shallowRef 避免深层响应式代理 ——
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
      // 不拼 ?t=Date.now():每次都是全新 URL,ETag/Last-Modified 协商缓存无从谈起,
      // 17MB 快照每次都要全量重传。改用 cache:'no-cache' —— 语义是「强制走条件请求」而非
      // 「禁用缓存」:必发 If-None-Match/If-Modified-Since,未变则 304 空响应复用本地副本,
      // 变了才传全量。故「点更新数据后立刻拿到新数据」的既有诉求不受影响。
      // 首次加载这里也显式声明,不敢退回浏览器默认缓存模式:服务端对 /data/*.json 未下发
      // Cache-Control(旧代码是靠 URL 里的 '?' 触发 server.py 的 no-store 分支才没出事),
      // 默认模式下浏览器会按 Last-Modified 做启发式新鲜期,F5 冷加载可能拿到过期快照。
      const res = await fetch(apiUrl('/data/analysis_data.json'), { cache: 'no-cache' })
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

  /** 强制重拉 analysis_data.json（绕过 loading 守卫 + 强制协商缓存校验）。忠实移植 reloadData 的数据热更新。 */
  async function reload() {
    error.value = null
    try {
      // 主动刷新语义:必须校验到服务端最新版本。cache:'no-cache' 恰是这个语义(强制条件请求),
      // 不用 cache:'reload'(那会跳过校验直接全量重下,白白丢掉 304 的收益)。
      // 本函数的调用场景是「更新数据」完成后刷新 —— 那时文件已变,校验必不命中,拿到的就是新数据。
      const res = await fetch(apiUrl('/data/analysis_data.json'), { cache: 'no-cache' })
      if (!res.ok) throw new Error(`加载数据失败 HTTP ${res.status}`)
      data.value = (await res.json()) as AnalysisData
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  return { data, loading, error, load, clearBusinessData, reload, reset }
})
