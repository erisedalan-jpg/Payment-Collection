import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBudgetConfig, saveBudgetConfig } from '@/lib/budgetApi'
import type { BudgetConfig } from '@/lib/budget/types'

/** 费率与目录配置。默认值在后端(budget_config.py);前端不备份一份默认,
 *  拿不到就报错让页面显示错误 —— 概算的每个数都依赖它,静默用猜的默认值会算出错的报价。 */
export const useBudgetConfigStore = defineStore('budgetConfig', () => {
  const config = ref<BudgetConfig | null>(null)
  const loaded = ref(false)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')

  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return
    loading.value = true
    error.value = ''
    try {
      config.value = await getBudgetConfig()
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '费率配置加载失败'
    } finally {
      loading.value = false
    }
  }

  async function save(next: BudgetConfig): Promise<void> {
    saving.value = true
    try {
      config.value = await saveBudgetConfig(next)
    } finally {
      saving.value = false
    }
  }

  return { config, loaded, loading, saving, error, load, save }
})
