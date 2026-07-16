import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPortalConfig, savePortalConfig } from '@/lib/portalApi'
import { emptyConfig, type PortalConfig } from '@/lib/portal'

export const usePortalStore = defineStore('portal', () => {
  const config = ref<PortalConfig>(emptyConfig())
  const loaded = ref(false)
  const saving = ref(false)

  async function load(): Promise<void> {
    config.value = await getPortalConfig()
    loaded.value = true
  }
  async function save(next: PortalConfig): Promise<void> {
    saving.value = true
    try {
      config.value = await savePortalConfig(next)
    } finally {
      saving.value = false
    }
  }
  function reset(): void {
    config.value = emptyConfig()
    loaded.value = false
  }
  return { config, loaded, saving, load, save, reset }
})
