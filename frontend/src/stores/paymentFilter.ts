import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useDataStore } from './data'
import { useScopedProjects } from '@/composables/useScopedData'
import { useExcludeStore } from './exclude'
import type { ViewMode } from '@/lib/filterNodes'
import { paymentNodeRows } from '@/lib/paymentPmis'
import { filterPayNodes } from '@/lib/payDashboard'

// 回款域页面级筛选。【仅服务回款域 5 页】(/payment、/payment/{projects,nodes,board,calendar})——
// 这 5 个也正是 router 里唯一不带 hideFilter 的路由,即唯一能看见 FilterBar 的页面。
// 域外页面看不到 FilterBar 却能读到这里的值,就会出现「数据被筛过、用户无从察觉」的错标
// (V4.5.3 修的首页「年度回款进度」即此)。守卫见 views/__pageHeader.test.ts。
// 全局标签排除属另一类状态,在 stores/exclude.ts;本 store 单向依赖它,反向依赖绝不可引入。
export const usePaymentFilterStore = defineStore('paymentFilter', () => {
  const data = useDataStore()
  const scoped = useScopedProjects()
  const exclude = useExcludeStore()

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

  const payNodeRowsAll = computed(() =>
    paymentNodeRows(scoped.value?.paymentNodes, scoped.value?.projects ?? [], data.data?.projectPmis),
  )
  const payRecordsAll = computed(() => scoped.value?.paymentRecords ?? {})
  const filteredPayNodes = computed(() =>
    filterPayNodes(payNodeRowsAll.value, {
      dateStart: dateStart.value, dateEnd: dateEnd.value, viewMode: viewMode.value, viewL4: viewL4.value, viewPM: viewPM.value,
      excludeActive: exclude.excludeOn, excludedIds: exclude.excludedIds,
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

  return {
    dateStart, dateEnd, viewMode, viewL4, viewPM,
    l4Options, pmOptions, filteredPayNodes, payRecordsAll,
    setDateRange, setPreset, setViewGlobal, setViewL4, setViewPM,
  }
})
