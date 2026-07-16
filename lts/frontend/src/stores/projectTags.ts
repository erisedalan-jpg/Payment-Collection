import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getTags, saveTags, type TagDef } from '@/lib/projectTagsApi'
import { useDataStore } from '@/stores/data'

export const useProjectTagsStore = defineStore('projectTags', () => {
  const tags = ref<TagDef[]>([])
  const assignments = ref<Record<string, string[]>>({})
  const loaded = ref(false)
  const saving = ref(false)

  const dataStore = useDataStore()
  // 规则派生标签(只读):来自 analysis_data.json 的 tagSeed(签约单位规则),不写回标签文件
  const seed = computed<Record<string, string[]>>(() => dataStore.data?.tagSeed ?? {})

  const activeTags = computed(() => tags.value.filter((t) => !t.disabled))
  const manualTagsOf = (pid: string): string[] => assignments.value[pid] ?? []
  const seedTagsOf = (pid: string): string[] => seed.value[pid] ?? []
  // 合并去重:手动 ∪ 规则。用于全站展示/筛选/导出
  const tagsOf = (pid: string): string[] => [...new Set([...manualTagsOf(pid), ...seedTagsOf(pid)])]
  const effectiveAssignments = computed<Record<string, string[]>>(() => {
    const out: Record<string, string[]> = {}
    for (const [pid, names] of Object.entries(assignments.value)) out[pid] = [...names]
    for (const [pid, names] of Object.entries(seed.value)) {
      out[pid] = [...new Set([...(out[pid] ?? []), ...names])]
    }
    return out
  })

  async function load() {
    const r = await getTags()
    tags.value = r.tags ?? []
    assignments.value = r.assignments ?? {}
    loaded.value = true
  }

  function addTag(name: string) {
    const n = name.trim()
    if (!n || tags.value.some((t) => t.name === n)) return
    tags.value = [...tags.value, { name: n }]
  }
  function renameTag(oldName: string, newName: string) {
    const nn = newName.trim()
    if (!nn || oldName === nn) return
    if (tags.value.some((t) => t.name === nn)) return // 拒绝改成已存在标签名（防库内/挂载重复）
    tags.value = tags.value.map((t) => (t.name === oldName ? { ...t, name: nn } : t))
    const next: Record<string, string[]> = {}
    for (const [pid, names] of Object.entries(assignments.value)) {
      next[pid] = [...new Set(names.map((x) => (x === oldName ? nn : x)))]
    }
    assignments.value = next
  }
  function disableTag(name: string, on: boolean) {
    tags.value = tags.value.map((t) => (t.name === name ? { ...t, disabled: on } : t))
  }
  function setProjectTags(pid: string, names: string[]) {
    assignments.value = { ...assignments.value, [pid]: [...new Set(names)] }
  }
  function toggleTag(pid: string, name: string) {
    const cur = new Set(assignments.value[pid] ?? [])
    cur.has(name) ? cur.delete(name) : cur.add(name)
    setProjectTags(pid, [...cur])
  }
  async function save() {
    saving.value = true
    try {
      // 只写手动 assignments,规则 seed 不落文件
      await saveTags({ tags: tags.value, assignments: assignments.value })
    } finally {
      saving.value = false
    }
  }

  return { tags, assignments, loaded, saving, seed, activeTags,
           effectiveAssignments, tagsOf, manualTagsOf, seedTagsOf,
           load, addTag, renameTag, disableTag, setProjectTags, toggleTag, save }
})
