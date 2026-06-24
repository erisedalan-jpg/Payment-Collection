import { defineStore } from 'pinia'
import { ref } from 'vue'
import { projectProgressApi, type Archive } from '@/lib/projectProgressApi'
import type { ProgressRecord } from '@/lib/keyProjects'

export const useProjectProgressStore = defineStore('projectProgress', () => {
  const current = ref<Record<string, ProgressRecord>>({})
  const archives = ref<Archive[]>([])
  const loaded = ref(false)

  async function load() {
    const r = await projectProgressApi.getProgress()
    current.value = r.current ?? {}
    archives.value = r.archives ?? []
    loaded.value = true
  }
  async function update(projectId: string, field: 'weekProgress' | 'nextPlan', content: string) {
    const r = await projectProgressApi.updateProgress(projectId, field, content)
    current.value = { ...current.value, [projectId]: r.record }
  }
  async function archive(rows: Parameters<typeof projectProgressApi.archiveProgress>[0]) {
    const r = await projectProgressApi.archiveProgress(rows)
    archives.value = r.archives ?? []
    current.value = {}
  }
  function reset() {
    current.value = {}
    archives.value = []
    loaded.value = false
  }
  return { current, archives, loaded, load, update, archive, reset }
})
