import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// 全局单例：任意页面调用 open(projectId) 即唤起项目详情抽屉。
export const useProjectDetailStore = defineStore('projectDetail', () => {
  const openId = ref<string | null>(null)
  const visible = computed(() => openId.value !== null)
  function open(id: string) {
    openId.value = id
  }
  function close() {
    openId.value = null
  }
  return { openId, visible, open, close }
})
