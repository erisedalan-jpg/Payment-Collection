import { computed, type ComputedRef, type Ref } from 'vue'
import type { DataColumn } from '@/components/DataTable.vue'
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import type { CustomColumn, FollowupTableId } from '@/lib/followupColumns'
import { htmlToPlainText } from '@/lib/richText'
import { computeDiffDays, localToday } from '@/lib/diffColumn'

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
  if (col.type === 'diff')
    // 纯数字、不加「天」后缀:列名已表达含义,加后缀会破坏排序与导出为数值
    return { key: col.key, label: col.label, width: 110, num: true, sortable: true,
             formatter: (v) => (v === null || v === undefined || v === '' ? '-' : String(v)) }
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
    const stored = defs.value.filter((c) => c.type !== 'diff')
    const diffs = defs.value.filter((c) => c.type === 'diff')
    const today = localToday()          // 本批全部行共用一次,避免跨行跨日不一致
    return rows.map((r) => {
      const rec = cur[opts.rowKey(r)]
      const extra: Record<string, any> = {}
      // 存储列:仍需 rec
      if (rec) {
        for (const c of stored) {
          const k = c.key
          if (k in rec) extra[k] = rec[k]
          if ((k + 'EditTime') in rec) extra[k + 'EditTime'] = rec[k + 'EditTime']
          if ((k + 'EditBy') in rec) extra[k + 'EditBy'] = rec[k + 'EditBy']
        }
      }
      // 计算列:派生自行数据,【不依赖 current】—— rec 缺失也必须算
      for (const c of diffs) {
        if (c.diff) extra[c.key] = computeDiffDays(r, c.diff, today)
      }
      return Object.keys(extra).length ? { ...r, ...extra } : r
    })
  }
  return { defs, columns, keys, filterableKeys, loaded, defaultKeys, decorate }
}
