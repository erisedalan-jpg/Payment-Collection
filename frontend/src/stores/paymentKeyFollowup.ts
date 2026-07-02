import { defineStore } from 'pinia'
import { ref } from 'vue'
import { paymentKeyFollowupApi, type PaymentKeyArchiveResp } from '@/lib/paymentKeyFollowupApi'
import type { PaymentKeyRecord } from '@/lib/paymentKeyFollowup'
import type { ScopeFilter } from '@/lib/tempScope'
import type { Archive } from '@/lib/projectProgressApi'

const EMPTY_SCOPE: ScopeFilter = { combinator: 'AND', groups: [] }

export const usePaymentKeyFollowupStore = defineStore('paymentKeyFollowup', () => {
  const scope = ref<ScopeFilter>({ ...EMPTY_SCOPE })
  const current = ref<Record<string, PaymentKeyRecord>>({})
  const archives = ref<Archive[]>([])
  const loaded = ref(false)

  async function load() {
    const r = await paymentKeyFollowupApi.get()
    scope.value = r.scope ?? { ...EMPTY_SCOPE }
    current.value = r.current ?? {}
    archives.value = r.archives ?? []
    loaded.value = true
  }
  async function saveScope(next: ScopeFilter) {
    const r = await paymentKeyFollowupApi.saveScope(next)
    scope.value = r.scope ?? next
  }
  async function update(projectId: string, field: 'followAction' | 'revConclusion' | 'nextRevDate', content: string) {
    const r = await paymentKeyFollowupApi.update(projectId, field, content)
    current.value = { ...current.value, [projectId]: { ...current.value[projectId], ...r.record } }
  }
  async function archive(rows: Record<string, unknown>[]) {
    const r: PaymentKeyArchiveResp = await paymentKeyFollowupApi.archive(rows)
    archives.value = r.archives ?? []
    // 注意:不清空 current —— 跟进数据留存(与 temp/key 关键差异)
  }
  async function deleteArchive(idx: number) {
    const r = await paymentKeyFollowupApi.deleteArchive(idx)
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
