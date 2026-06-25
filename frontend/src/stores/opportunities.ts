import { defineStore } from 'pinia'
import { ref } from 'vue'
import { opportunitiesApi, type OppRow } from '@/lib/opportunitiesApi'

export const useOpportunitiesStore = defineStore('opportunities', () => {
  const rows = ref<OppRow[]>([])
  const loaded = ref(false)

  async function load() {
    const r = await opportunitiesApi.list()
    rows.value = r.rows ?? []
    loaded.value = true
  }
  async function create(fields?: Record<string, any>): Promise<OppRow> {
    const r = await opportunitiesApi.create(fields)
    rows.value = [...rows.value, r.row]
    return r.row
  }
  async function update(id: string, fields: Record<string, any>) {
    const r = await opportunitiesApi.update(id, fields)
    rows.value = rows.value.map((x) => (x.id === id ? r.row : x))
  }
  async function remove(ids: string[]) {
    const r = await opportunitiesApi.remove(ids)
    rows.value = r.rows ?? []
  }
  async function importFile(file: File) {
    const r = await opportunitiesApi.importFile(file)
    rows.value = r.rows ?? []
    return r.count
  }
  function reset() {
    rows.value = []
    loaded.value = false
  }

  return { rows, loaded, load, create, update, remove, importFile, reset }
})
