import { ref, computed, watch, type ComputedRef } from 'vue'
import { usePagedRows } from '@/lib/usePagedRows'

interface FollowupStoreLike {
  archives: { archiveTime?: string }[]
  deleteArchive: (idx: number) => Promise<unknown>
}

/** 5 跟进页共享的数据集/历史切换 + 删历史 + 导出选择态 + 分页(逐字相同段抽取)。
 * 页面自留:列定义/范围引擎/cell编辑/doArchive(行集与文案)/onRow。 */
export function useFollowupPage<T>(store: FollowupStoreLike, filtered: ComputedRef<T[]>) {
  const mode = ref<'current' | 'history'>('current')
  const historyIdx = ref(0)
  const isCurrent = computed(() => mode.value === 'current')
  const datasetOpts = computed(() => [
    { value: 'current', label: '当前数据' },
    ...store.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime ?? '' })),
  ])
  const historyOpts = computed(() => store.archives.map((a, i) => ({ value: i, label: a.archiveTime ?? '' })))
  watch(() => [mode.value, store.archives.length] as const, () => {
    if (mode.value === 'history') historyIdx.value = Math.max(0, store.archives.length - 1)
  })

  const { paged, currentPage, pageSize } = usePagedRows(filtered, 50)

  const delConfirm = ref(false)
  const deleting = ref(false)
  async function doDeleteArchive() {
    deleting.value = true
    try {
      await store.deleteArchive(historyIdx.value)
      delConfirm.value = false
      if (!store.archives.length) mode.value = 'current'
      else historyIdx.value = Math.min(historyIdx.value, store.archives.length - 1)
    } finally { deleting.value = false }
  }

  const exportOpen = ref(false)
  const exportSel = ref<string[]>(['current'])
  const allSelected = computed(() => exportSel.value.length > 0 && exportSel.value.length === datasetOpts.value.length)
  const exportIndeterminate = computed(() => exportSel.value.length > 0 && exportSel.value.length < datasetOpts.value.length)
  function toggleAllExport(val: boolean) { exportSel.value = val ? datasetOpts.value.map((o) => o.value) : [] }

  return {
    mode, historyIdx, isCurrent, datasetOpts, historyOpts,
    paged, currentPage, pageSize,
    delConfirm, deleting, doDeleteArchive,
    exportOpen, exportSel, allSelected, exportIndeterminate, toggleAllExport,
  }
}
