import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getYitianSettings, saveYitianSettings, type YitianSettings } from '@/lib/yitianApi'

/** 合规检查范围。默认与原工具一致(剔除管理类/业务类/假期类);超管可在 /data 改。 */
const DEFAULT: YitianSettings = { excludedTypes: ['管理类', '业务类', '假期类'] }

export const useYitianSettingsStore = defineStore('yitianSettings', () => {
  const settings = ref<YitianSettings>({ ...DEFAULT })
  const loaded = ref(false)
  const saving = ref(false)

  async function load(): Promise<void> {
    if (loaded.value) return
    try {
      settings.value = await getYitianSettings()
    } catch {
      settings.value = { ...DEFAULT }   // 拿不到就用默认口径,不要把页面卡死
    }
    loaded.value = true
  }

  async function save(next: YitianSettings): Promise<void> {
    saving.value = true
    try {
      settings.value = await saveYitianSettings(next)
    } finally {
      saving.value = false
    }
  }

  function reset(): void {
    settings.value = { ...DEFAULT }
    loaded.value = false
  }

  return { settings, loaded, saving, load, save, reset }
})
