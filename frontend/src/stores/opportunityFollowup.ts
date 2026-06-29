import { defineStore } from 'pinia'
import { ref } from 'vue'
import { opportunityFollowupApi } from '@/lib/opportunityFollowupApi'
import type { Archive } from '@/lib/projectProgressApi'
import type { ProgressRecord } from '@/lib/keyProjects'
import type { ScopeFilter } from '@/lib/tempScope'

const EMPTY_SCOPE: ScopeFilter = { combinator: 'AND', groups: [] }

export const useOpportunityFollowupStore = defineStore('opportunityFollowup', () => {
  const scope = ref<ScopeFilter>({ ...EMPTY_SCOPE })
  const current = ref<Record<string, ProgressRecord>>({})
  const archives = ref<Archive[]>([])
  const loaded = ref(false)

  async function load() {
    const r = await opportunityFollowupApi.get()
    scope.value = r.scope ?? { ...EMPTY_SCOPE }
    current.value = r.current ?? {}
    archives.value = r.archives ?? []
    loaded.value = true
  }
  async function saveScope(next: ScopeFilter) {
    const r = await opportunityFollowupApi.saveScope(next)
    scope.value = r.scope ?? next
  }
  async function update(oppId: string, field: 'weekProgress' | 'nextPlan', content: string) {
    const r = await opportunityFollowupApi.update(oppId, field, content)
    current.value = { ...current.value, [oppId]: { ...current.value[oppId], ...r.record } }
  }
  async function archive(rows: Record<string, unknown>[]) {
    const r = await opportunityFollowupApi.archive(rows)
    archives.value = r.archives ?? []
    current.value = {}
  }
  async function deleteArchive(idx: number) {
    const r = await opportunityFollowupApi.deleteArchive(idx)
    archives.value = r.archives ?? []
  }
  function reset() {
    scope.value = { ...EMPTY_SCOPE }
    current.value = {}
    archives.value = []
    loaded.value = false
  }
  return { scope, current, archives, loaded, load, saveScope, update, archive, deleteArchive, reset }
})
