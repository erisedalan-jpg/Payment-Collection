import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDataStore } from './data'
import { useProjectTagsStore } from '@/stores/projectTags'
import { filterNodes, type ViewMode } from '@/lib/filterNodes'

const NAGUAN_KEY = 'naguan_on'
const EXCLUDE_ON_KEY = 'pa_exclude_on'
const EXCLUDE_TAGS_KEY = 'pa_exclude_tags'

export interface YearOption { key: string; label: string }

function buildYearOptions(): YearOption[] {
  const y = new Date().getFullYear()
  const qs = ['Q1', 'Q2', 'Q3', 'Q4']
  const opts: YearOption[] = [
    { key: 'all', label: '全部' },
    { key: String(y), label: '本年度' },
    { key: String(y + 1), label: '下一年度' },
    { key: `upto${y}`, label: '至本年度' },
    { key: `upto${y + 1}`, label: '至下一年度' },
  ]
  for (const yr of [y, y + 1]) {
    for (const q of qs) opts.push({ key: `${yr}-${q}`, label: `${yr}年${q}季度` })
  }
  for (const yr of [y, y + 1]) {
    for (const q of qs) opts.push({ key: `upto${yr}-${q}`, label: `至${yr}年${q}季度` })
  }
  return opts
}

export const useFilterStore = defineStore('filter', () => {
  const data = useDataStore()

  const filterYear = ref('all')
  const viewMode = ref<ViewMode>('global')
  const viewL4 = ref('')
  const viewPM = ref('')
  const naguanOn = ref(localStorage.getItem(NAGUAN_KEY) !== 'false') // 默认开启

  const yearOptions = computed(buildYearOptions)

  const l4Options = computed(() => {
    const set = new Set<string>()
    for (const n of data.data?.rawNodes ?? []) {
      const v = (n as { orgL4?: string }).orgL4
      if (v) set.add(v)
    }
    return [...set]
  })

  const pmOptions = computed(() => {
    const set = new Set<string>()
    for (const n of data.data?.rawNodes ?? []) {
      const v = (n as { projectManager?: string }).projectManager
      if (v) set.add(v)
    }
    return [...set]
  })

  const filteredNodes = computed(() =>
    filterNodes(data.data?.rawNodes ?? [], {
      filterYear: filterYear.value,
      viewMode: viewMode.value,
      viewL4: viewL4.value,
      viewPM: viewPM.value,
      naguanOn: naguanOn.value,
      naguanExclude: (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
    }),
  )

  function setYear(key: string) {
    filterYear.value = key
  }
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
  function toggleNaguan(on: boolean) {
    naguanOn.value = on
    localStorage.setItem(NAGUAN_KEY, on ? 'true' : 'false')
  }

  const projectTags = useProjectTagsStore()
  const excludeOn = ref(localStorage.getItem(EXCLUDE_ON_KEY) === 'true')
  const excludeTags = ref<string[]>(JSON.parse(localStorage.getItem(EXCLUDE_TAGS_KEY) || '[]'))

  const excludedIds = computed<Record<string, boolean>>(() => {
    if (!excludeOn.value || excludeTags.value.length === 0) return {}
    const sel = new Set(excludeTags.value)
    const out: Record<string, boolean> = {}
    for (const [pid, names] of Object.entries(projectTags.assignments)) {
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

  return {
    filterYear, viewMode, viewL4, viewPM, naguanOn,
    yearOptions, l4Options, pmOptions, filteredNodes,
    setYear, setViewGlobal, setViewL4, setViewPM, toggleNaguan,
    excludeOn, excludeTags, excludedIds, setExclude,
  }
})
