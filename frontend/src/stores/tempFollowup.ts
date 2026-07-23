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
  // 四个 action 都遵循同一条规则:请求发起前把 activeId 存进局部常量 id,await 之后
  // 一律按 id 去 instances.value 里查实例再回填 —— 绝不能在 await 之后再读
  // activeInstance.value,因为用户可能在请求在途时已经切换了选项卡(I-1)。
  async function saveScope(next: ScopeFilter) {
    const id = activeId.value
    const r = await tempFollowupApi.saveScope(id, next)
    const inst = instances.value.find((i) => i.id === id)
    if (inst) inst.scope = r.scope ?? next
  }
  async function update(projectId: string, field: string, content: string) {
    const id = activeId.value
    const r = await tempFollowupApi.update(id, projectId, field, content)
    const inst = instances.value.find((i) => i.id === id)
    if (inst) inst.current = { ...inst.current, [projectId]: { ...inst.current[projectId], ...r.record } }
  }
  async function archive(rows: Record<string, unknown>[]) {
    const id = activeId.value
    const r = await tempFollowupApi.archive(id, rows)
    const inst = instances.value.find((i) => i.id === id)
    // 表级清空;clearOnArchive=false 的自定义列后端留存,用回传 current 回填(缺省则空,向后兼容)。
    if (inst) { inst.archives = r.archives ?? []; inst.current = r.current ?? {} }
  }
  async function deleteArchive(idx: number) {
    const id = activeId.value
    const r = await tempFollowupApi.deleteArchive(id, idx)
    const inst = instances.value.find((i) => i.id === id)
    if (inst) inst.archives = r.archives ?? []
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
