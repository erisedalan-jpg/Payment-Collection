import { defineStore } from 'pinia'
import { ref } from 'vue'
import { riskFollowupApi, type RiskArchive } from '@/lib/riskFollowupApi'
import type { RiskFollowRecord } from '@/lib/riskRows'
import type { ScopeFilter } from '@/lib/tempScope'

const EMPTY_SCOPE: ScopeFilter = { combinator: 'AND', groups: [] }

export const useRiskFollowupStore = defineStore('riskFollowup', () => {
  const scope = ref<ScopeFilter>({ ...EMPTY_SCOPE })
  const current = ref<Record<string, RiskFollowRecord>>({})
  const archives = ref<RiskArchive[]>([])
  const loaded = ref(false)

  async function load() {
    const r = await riskFollowupApi.get()
    scope.value = r.scope ?? { ...EMPTY_SCOPE }
    current.value = r.current ?? {}
    archives.value = r.archives ?? []
    loaded.value = true
  }
  async function saveScope(next: ScopeFilter) {
    const r = await riskFollowupApi.saveScope(next)
    scope.value = r.scope ?? next
  }
  async function update(riskKey: string, field: 'followAction' | 'revConclusion' | 'nextRevDate', content: string) {
    const r = await riskFollowupApi.update(riskKey, field, content)
    current.value = { ...current.value, [riskKey]: { ...current.value[riskKey], ...r.record } }
  }
  async function archive(rows: Record<string, unknown>[]) {
    const r = await riskFollowupApi.archive(rows)
    archives.value = r.archives ?? []
    // 注意:不清空 current —— 跟进数据留存(与 temp/key 关键差异)
  }
  function reset() {
    scope.value = { ...EMPTY_SCOPE }
    current.value = {}
    archives.value = []
    loaded.value = false
  }
  return { scope, current, archives, loaded, load, saveScope, update, archive, reset }
})
