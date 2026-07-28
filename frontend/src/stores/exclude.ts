import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useProjectTagsStore } from '@/stores/projectTags'

// 按标签全局排除项目。【全局配置】——在 /data 页配置、全站多域消费(回款域/成本分析/里程碑/首页)，
// 与「回款域页面级筛选」(stores/paymentFilter.ts)是两类东西,V4.5.3 拆开。
// 本 store 绝不可反向引用 paymentFilter,否则两类状态又粘回去、拆分白做。
const EXCLUDE_ON_KEY = 'pa_exclude_on'
const EXCLUDE_TAGS_KEY = 'pa_exclude_tags'

function loadExcludeTags(): string[] {
  try {
    const raw = localStorage.getItem(EXCLUDE_TAGS_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v as string[]
    }
  } catch {
    /* localStorage 不可用/损坏 → 空 */
  }
  return []
}

export const useExcludeStore = defineStore('exclude', () => {
  const projectTags = useProjectTagsStore()
  const excludeOn = ref(localStorage.getItem(EXCLUDE_ON_KEY) === 'true')
  const excludeTags = ref<string[]>(loadExcludeTags())

  const excludedIds = computed<Record<string, boolean>>(() => {
    if (!excludeOn.value || excludeTags.value.length === 0) return {}
    const sel = new Set(excludeTags.value)
    const out: Record<string, boolean> = {}
    for (const [pid, names] of Object.entries(projectTags.effectiveAssignments)) {
      if (names.some((n) => sel.has(n))) out[pid] = true
    }
    return out
  })

  function setExclude(on: boolean, tags: string[]) {
    excludeOn.value = on
    excludeTags.value = [...tags]
    localStorage.setItem(EXCLUDE_ON_KEY, on ? 'true' : 'false')
    localStorage.setItem(EXCLUDE_TAGS_KEY, JSON.stringify(tags))
  }

  return { excludeOn, excludeTags, excludedIds, setExclude }
})
