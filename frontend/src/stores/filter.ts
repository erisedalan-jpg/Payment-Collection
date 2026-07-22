import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDataStore } from './data'
import { useScopedProjects } from '@/composables/useScopedData'
import { useProjectTagsStore } from '@/stores/projectTags'
import type { ViewMode } from '@/lib/filterNodes'
import { paymentNodeRows, filterProjects } from '@/lib/paymentPmis'
import { filterPayNodes } from '@/lib/payDashboard'

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

export const useFilterStore = defineStore('filter', () => {
  const data = useDataStore()
  const scoped = useScopedProjects()

  const _y = new Date().getFullYear()
  const dateStart = ref(`${_y}-01-01`)   // 默认本年度(Task 11)
  const dateEnd = ref(`${_y}-12-31`)
  const viewMode = ref<ViewMode>('global')
  const viewL4 = ref('')
  const viewPM = ref('')

  function setDateRange(start: string, end: string) { dateStart.value = start || ''; dateEnd.value = end || '' }
  function setPreset(key: 'month' | 'quarter' | 'year' | 'all') {
    if (key === 'all') { dateStart.value = ''; dateEnd.value = ''; return }
    const now = new Date(); const y = now.getFullYear(); const pad = (n: number) => String(n).padStart(2, '0')
    if (key === 'year') { dateStart.value = `${y}-01-01`; dateEnd.value = `${y}-12-31`; return }
    if (key === 'quarter') { const q = Math.floor(now.getMonth() / 3); const sm = q * 3 + 1
      dateStart.value = `${y}-${pad(sm)}-01`; dateEnd.value = `${y}-${pad(sm + 2)}-${pad(new Date(y, sm + 2, 0).getDate())}`; return }
    const m = now.getMonth() + 1; dateStart.value = `${y}-${pad(m)}-01`; dateEnd.value = `${y}-${pad(m)}-${pad(new Date(y, m, 0).getDate())}`
  }

  const l4Options = computed(() => {
    const set = new Set<string>()
    for (const p of data.data?.projects ?? []) {
      const v = (p as { orgL4?: string }).orgL4
      if (v) set.add(v)
    }
    return [...set]
  })

  const pmOptions = computed(() => {
    const set = new Set<string>()
    for (const p of data.data?.projects ?? []) {
      const v = (p as { projectManager?: string }).projectManager
      if (v) set.add(v)
    }
    return [...set]
  })

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

  const payNodeRowsAll = computed(() =>
    paymentNodeRows(scoped.value?.paymentNodes, scoped.value?.projects ?? [], data.data?.projectPmis),
  )
  const payRecordsAll = computed(() => scoped.value?.paymentRecords ?? {})
  const filteredPayNodes = computed(() =>
    filterPayNodes(payNodeRowsAll.value, {
      dateStart: dateStart.value, dateEnd: dateEnd.value, viewMode: viewMode.value, viewL4: viewL4.value, viewPM: viewPM.value,
      excludeActive: excludeOn.value, excludedIds: excludedIds.value,
    }),
  )
  const filteredProjects = computed(() =>
    filterProjects(data.data?.projects ?? [], {
      viewMode: viewMode.value, viewL4: viewL4.value, viewPM: viewPM.value,
      excludeActive: excludeOn.value, excludedIds: excludedIds.value,
    }),
  )

  function setViewGlobal() {
    viewMode.value = 'global'
    viewL4.value = ''
    viewPM.value = ''
  }
  function setViewL4(dept: string) {
    viewMode.value = 'l4'
    viewL4.value = dept
    viewPM.value = ''
  }
  function setViewPM(pm: string) {
    viewMode.value = 'pm'
    viewPM.value = pm
    viewL4.value = ''
  }

  function setExclude(on: boolean, tags: string[]) {
    excludeOn.value = on
    excludeTags.value = [...tags]
    localStorage.setItem(EXCLUDE_ON_KEY, on ? 'true' : 'false')
    localStorage.setItem(EXCLUDE_TAGS_KEY, JSON.stringify(tags))
  }

  return {
    dateStart, dateEnd, viewMode, viewL4, viewPM,
    l4Options, pmOptions, filteredPayNodes, filteredProjects, payRecordsAll,
    setDateRange, setPreset, setViewGlobal, setViewL4, setViewPM,
    excludeOn, excludeTags, excludedIds, setExclude,
  }
})
