import { defineStore } from 'pinia'
import { ref } from 'vue'

const KEY = 'sidebar_collapsed'

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(localStorage.getItem(KEY) === 'true')

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
    localStorage.setItem(KEY, String(sidebarCollapsed.value))
  }

  return { sidebarCollapsed, toggleSidebar }
})
