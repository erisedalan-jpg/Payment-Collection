import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  followupColumnsApi, type CustomColumn, type CustomColumnType,
  type FollowupColumnsConfig, type FollowupTableId,
} from '@/lib/followupColumns'

const TABLES: FollowupTableId[] = ['temp', 'risk', 'payment_key', 'opportunity']
const emptyConfig = (): FollowupColumnsConfig =>
  ({ temp: [], risk: [], payment_key: [], opportunity: [] })

export const useFollowupColumnsStore = defineStore('followupColumns', () => {
  const configs = ref<FollowupColumnsConfig>(emptyConfig())
  const loaded = ref(false)

  function columnsFor(table: FollowupTableId): CustomColumn[] {
    return configs.value[table] ?? []
  }
  async function load() {
    const all = await followupColumnsApi.getAll()
    const next = emptyConfig()
    for (const t of TABLES) next[t] = Array.isArray(all[t]) ? all[t] : []
    configs.value = next
    loaded.value = true
  }
  async function add(table: FollowupTableId, label: string, type: CustomColumnType, clearOnArchive: boolean) {
    const col = await followupColumnsApi.add(table, label, type, clearOnArchive)
    configs.value = { ...configs.value, [table]: [...configs.value[table], col] }
    return col
  }
  async function update(table: FollowupTableId, key: string,
                        patch: Partial<Pick<CustomColumn, 'label' | 'type' | 'clearOnArchive'>>) {
    const col = await followupColumnsApi.update(table, key, patch)
    configs.value = { ...configs.value, [table]: configs.value[table].map((c) => (c.key === key ? col : c)) }
    return col
  }
  async function reorder(table: FollowupTableId, keys: string[]) {
    const cols = await followupColumnsApi.reorder(table, keys)
    configs.value = { ...configs.value, [table]: cols }
    return cols
  }
  async function remove(table: FollowupTableId, key: string) {
    const r = await followupColumnsApi.remove(table, key)
    configs.value = { ...configs.value, [table]: configs.value[table].filter((c) => c.key !== key) }
    return r
  }
  return { configs, loaded, columnsFor, load, add, update, reorder, remove }
})
