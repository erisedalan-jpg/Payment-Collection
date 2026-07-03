import { ref, computed, nextTick } from 'vue'
import { useFollowupPage } from './useFollowupPage'

function fakeStore(archives: any[]) {
  const a = ref(archives)
  return {
    get archives() { return a.value },
    deleteArchive: async (idx: number) => { a.value = a.value.filter((_, i) => i !== idx) },
  }
}

const identity = <T,>(r: T[]) => r

it('datasetOpts/historyOpts 含当前+归档', () => {
  const store = fakeStore([{ archiveTime: 't1' }, { archiveTime: 't2' }])
  const fp = useFollowupPage(store, computed(() => [] as any[]), identity)
  expect(fp.datasetOpts.value[0]).toEqual({ value: 'current', label: '当前数据' })
  expect(fp.datasetOpts.value.map((o: any) => o.value)).toEqual(['current', 'a0', 'a1'])
  expect(fp.historyOpts.value).toEqual([{ value: 0, label: 't1' }, { value: 1, label: 't2' }])
})

it('doDeleteArchive 删末条后回 current,导出全选态正确', async () => {
  const store = fakeStore([{ archiveTime: 't1' }])
  const fp = useFollowupPage(store, computed(() => [] as any[]), identity)
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
  const fp = useFollowupPage(fakeStore([]), computed(() => rows.value), identity)
  expect(fp.paged.value.length).toBe(50)
})

it('applyFilter 施加于 rows 之上,filtered 随 applyFilter 逻辑变化', () => {
  const store = fakeStore([])
  const fp = useFollowupPage(store, computed(() => [1, 2, 3, 4]), (r) => r.filter((n) => n % 2 === 0))
  expect(fp.rows.value).toEqual([1, 2, 3, 4])
  expect(fp.filtered.value).toEqual([2, 4])
})

it('重访场景:store 数据在构造前已就绪,之后切到历史模式 rows/filtered 仍正确响应(不依赖 currentRows 失效才补登记)', async () => {
  // 复现 V2.6.9 C1:旧 fpRef 兜底写法下,若 currentRows 在构造后不再失效(如本例:
  // currentRows 恒定不变,不像页面里那样会因 data.load() 异步到达而失效一次帮 rows 补登记),
  // rows 的响应式依赖会永远停留在"仅追踪 currentRows",historyIdx/isCurrent 切换不生效。
  const store = fakeStore([{ archiveTime: 't1', rows: ['archived-1', 'archived-2'] }])
  const currentRows = computed(() => ['live-1'])
  const fp = useFollowupPage(store, currentRows, identity)
  expect(fp.rows.value).toEqual(['live-1'])
  fp.mode.value = 'history'
  fp.historyIdx.value = 0
  await nextTick()
  expect(fp.rows.value).toEqual(['archived-1', 'archived-2'])
  expect(fp.filtered.value).toEqual(['archived-1', 'archived-2'])
  expect(fp.paged.value).toEqual(['archived-1', 'archived-2'])
})
