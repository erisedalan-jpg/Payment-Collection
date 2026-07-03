import { ref, computed, nextTick } from 'vue'
import { useFollowupPage } from './useFollowupPage'

function fakeStore(archives: any[]) {
  const a = ref(archives)
  return {
    get archives() { return a.value },
    deleteArchive: async (idx: number) => { a.value = a.value.filter((_, i) => i !== idx) },
  }
}

it('datasetOpts/historyOpts 含当前+归档', () => {
  const store = fakeStore([{ archiveTime: 't1' }, { archiveTime: 't2' }])
  const fp = useFollowupPage(store, computed(() => [] as any[]))
  expect(fp.datasetOpts.value[0]).toEqual({ value: 'current', label: '当前数据' })
  expect(fp.datasetOpts.value.map((o: any) => o.value)).toEqual(['current', 'a0', 'a1'])
  expect(fp.historyOpts.value).toEqual([{ value: 0, label: 't1' }, { value: 1, label: 't2' }])
})

it('doDeleteArchive 删末条后回 current,导出全选态正确', async () => {
  const store = fakeStore([{ archiveTime: 't1' }])
  const fp = useFollowupPage(store, computed(() => [] as any[]))
  fp.mode.value = 'history'; fp.historyIdx.value = 0
  await fp.doDeleteArchive()
  expect(store.archives.length).toBe(0)
  expect(fp.mode.value).toBe('current')
  fp.toggleAllExport(true)
  expect(fp.allSelected.value).toBe(true)
  expect(fp.exportIndeterminate.value).toBe(false)
})

it('分页切片随 filtered', () => {
  const rows = ref(Array.from({ length: 120 }, (_, i) => i))
  const fp = useFollowupPage(fakeStore([]), computed(() => rows.value))
  expect(fp.paged.value.length).toBe(50)
})
