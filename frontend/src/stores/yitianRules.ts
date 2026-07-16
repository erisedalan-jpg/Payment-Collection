import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getYitianRules, saveYitianRules } from '@/lib/yitianApi'
import type { YitianRulesConfig } from '@/lib/yitian/rulesConfig'

export const useYitianRulesStore = defineStore('yitianRules', () => {
  const config = ref<YitianRulesConfig | null>(null)
  const loaded = ref(false)
  const saving = ref(false)

  async function load(): Promise<void> {
    if (loaded.value) return
    config.value = await getYitianRules()
    loaded.value = true
  }

  async function save(next: YitianRulesConfig): Promise<{ rules: YitianRulesConfig; problemCount: number }> {
    saving.value = true
    try {
      const r = await saveYitianRules(next)
      config.value = r.rules
      return r
    } finally {
      saving.value = false
    }
  }

  function reset(): void {
    config.value = null
    loaded.value = false
  }

  return { config, loaded, saving, load, save, reset }
})
