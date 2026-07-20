import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { tempFollowupApi, type TempInstance } from '@/lib/tempFollowupApi'
import type { Archive } from '@/lib/projectProgressApi'
import type { ProgressRecord } from '@/lib/keyProjects'
import type { ScopeFilter } from '@/lib/tempScope'

const EMPTY_SCOPE: ScopeFilter = { combinator: 'AND', groups: [] }

export const useTempFollowupStore = defineStore('tempFollowup', () => {
  const instances = ref<TempInstance[]>([])
  const activeId = ref('')
  const loaded = ref(false)

  const activeInstance = computed<TempInstance | null>(
    () => instances.value.find((i) => i.id === activeId.value) ?? null)

  // scope/current/archives 保持原名原形状 —— useFollowupPage(5 个跟进页复用)只认
  // {archives, deleteArchive},视图里的既有引用因此一行都不用改。
  const scope = computed<ScopeFilter>(() => activeInstance.value?.scope ?? { ...EMPTY_SCOPE })
  const current = computed<Record<string, ProgressRecord>>(() => activeInstance.value?.current ?? {})
  const archives = computed<Archive[]>(() => activeInstance.value?.archives ?? [])

  function _setInstances(list: TempInstance[]) {
    instances.value = list ?? []
    if (!instances.value.some((i) => i.id === activeId.value)) {
      activeId.value = instances.value[0]?.id ?? ''
    }
  }

  async function load() {
    const r = await tempFollowupApi.get()
    _setInstances(r.instances ?? [])
    loaded.value = true
  }
  function setActive(id: string) {
    if (instances.value.some((i) => i.id === id)) activeId.value = id
  }
  async function saveScope(next: ScopeFilter) {
    const r = await tempFollowupApi.saveScope(activeId.value, next)
    if (activeInstance.value) activeInstance.value.scope = r.scope ?? next
  }
  async function update(projectId: string, field: 'weekProgress' | 'nextPlan', content: string) {
    const r = await tempFollowupApi.update(activeId.value, projectId, field, content)
    const inst = activeInstance.value
    if (inst) inst.current = { ...inst.current, [projectId]: { ...inst.current[projectId], ...r.record } }
  }
  async function archive(rows: Record<string, unknown>[]) {
    const r = await tempFollowupApi.archive(activeId.value, rows)
    const inst = activeInstance.value
    if (inst) { inst.archives = r.archives ?? []; inst.current = {} }
  }
  async function deleteArchive(idx: number) {
    const r = await tempFollowupApi.deleteArchive(activeId.value, idx)
    if (activeInstance.value) activeInstance.value.archives = r.archives ?? []
  }
  async function createInstance(name: string, copyFrom?: string) {
    const r = await tempFollowupApi.createInstance(name, copyFrom)
    _setInstances(r.instances ?? [])
    if (r.instance?.id) activeId.value = r.instance.id      // 新建后直接切过去
  }
  async function renameInstance(id: string, name: string) {
    const r = await tempFollowupApi.renameInstance(id, name)
    _setInstances(r.instances ?? [])
  }
  async function deleteInstance(id: string) {
    const r = await tempFollowupApi.deleteInstance(id)
    _setInstances(r.instances ?? [])   // 删的若是当前实例,_setInstances 自动回落到第一个
  }
  function reset() {
    instances.value = []
    activeId.value = ''
    loaded.value = false
  }
  return { instances, activeId, activeInstance, scope, current, archives, loaded,
           load, setActive, saveScope, update, archive, deleteArchive,
           createInstance, renameInstance, deleteInstance, reset }
})
