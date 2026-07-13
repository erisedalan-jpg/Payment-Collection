import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { YitianData } from '@/types/yitian'
import { getYitianData } from '@/lib/yitianApi'

export const useYitianStore = defineStore('yitian', () => {
  // 与 stores/data.ts 同款:大只读快照用 shallowRef,避免深层响应式代理拖慢聚合。
  // 全站只整体重赋值 data.value(load/reset),无深层字段写入,故安全。
  const data = shallowRef<YitianData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** 惰性加载:只在进入 /yitian 时调用(不在首页 bootstrap)。已有数据且非 force 则不重拉。 */
  async function load(force = false): Promise<void> {
    if (loading.value) return
    if (data.value && !force) return
    loading.value = true
    error.value = null
    try {
      data.value = await getYitianData()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      loading.value = false
    }
  }

  /** 登录/登出复位:杜绝身份切换后复用上一个账号已按 L4 切过的内存数据。 */
  function reset(): void {
    data.value = null
    error.value = null
    loading.value = false
  }

  return { data, loading, error, load, reset }
})
