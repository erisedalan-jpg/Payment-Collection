import { computed, type ComputedRef, type Ref } from 'vue'
import type { DataColumn } from '@/components/DataTable.vue'
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import type { CustomColumn, FollowupTableId } from '@/lib/followupColumns'
import { htmlToPlainText } from '@/lib/richText'

interface UseCustomColumnsOpts {
  current: Ref<Record<string, Record<string, any>>>
  rowKey: (row: any) => string
}

export interface UseCustomColumnsResult {
  /** 列定义(带 type/clearOnArchive):cell 模板据 type 派发文本/日期渲染 */
  defs: ComputedRef<CustomColumn[]>
  /** 供 DataTable 用的列模型(不含 type) */
  columns: ComputedRef<DataColumn[]>
  keys: ComputedRef<string[]>
  filterableKeys: ComputedRef<Set<string>>
  loaded: ComputedRef<boolean>
  defaultKeys: () => string[]
  decorate: (rows: any[]) => any[]
}

function toDataColumn(col: CustomColumn): DataColumn {
  if (col.type === 'date')
    return { key: col.key, label: col.label, width: 170, sortable: true,
             formatter: (v) => (v ? String(v).slice(0, 10) : '-') }
  // text: 富文本存储,列表显示纯文本
  return { key: col.key, label: col.label, width: 360, wrap: true,
           formatter: (v) => htmlToPlainText(String(v ?? '')) }
}

export function useCustomColumns(tableId: FollowupTableId, opts: UseCustomColumnsOpts): UseCustomColumnsResult {
  const store = useFollowupColumnsStore()
  const defs = computed<CustomColumn[]>(() => store.columnsFor(tableId))
  const columns = computed<DataColumn[]>(() => defs.value.map(toDataColumn))
  const keys = computed<string[]>(() => defs.value.map((c) => c.key))
  const filterableKeys = computed<Set<string>>(() =>
    new Set(defs.value.filter((c) => c.type === 'date').map((c) => c.key)))
  const loaded = computed(() => store.loaded)

  function defaultKeys(): string[] {
    return defs.value.map((c) => c.key)
  }
  function decorate(rows: any[]): any[] {
    if (!defs.value.length) return rows
    const cur = opts.current.value
    const ks = defs.value.map((c) => c.key)
    return rows.map((r) => {
      const rec = cur[opts.rowKey(r)]
      if (!rec) return r
      const extra: Record<string, any> = {}
      for (const k of ks) {
        if (k in rec) extra[k] = rec[k]
        if ((k + 'EditTime') in rec) extra[k + 'EditTime'] = rec[k + 'EditTime']
        if ((k + 'EditBy') in rec) extra[k + 'EditBy'] = rec[k + 'EditBy']
      }
      return Object.keys(extra).length ? { ...r, ...extra } : r
    })
  }
  return { defs, columns, keys, filterableKeys, loaded, defaultKeys, decorate }
}
