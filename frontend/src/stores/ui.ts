import { defineStore } from 'pinia'
import { ref } from 'vue'

const KEY = 'sidebar_collapsed'
const SECTIONS_KEY = 'sidebar_sections'

function loadSections(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTIONS_KEY)
    if (raw) {
      const o = JSON.parse(raw)
      if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, boolean>
    }
  } catch {
    /* localStorage 不可用/损坏 → 空 */
  }
  return {}
}

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(localStorage.getItem(KEY) === 'true')

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    localStorage.setItem(KEY, String(sidebarCollapsed.value))
  }

  // 分区折叠:仅存用户手动覆盖(显式布尔);未设置的分区由组件按"是否当前路由所属分区"算默认
  const sectionExpanded = ref<Record<string, boolean>>(loadSections())

  function setSection(key: string, value: boolean) {
    sectionExpanded.value = { ...sectionExpanded.value, [key]: value }
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(sectionExpanded.value))
    } catch {
      /* 忽略写入失败(隐私模式/配额) */
    }
  }

  return { sidebarCollapsed, toggleSidebar, sectionExpanded, setSection }
})
