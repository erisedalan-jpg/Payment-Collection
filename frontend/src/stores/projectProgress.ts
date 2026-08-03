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
    // 后端只清「本次快照覆盖到的」记录,范围外(非重点项目)的记录会被留下 —— 必须据回传回填,
    // 不可硬编码清空(缺省 {} 兼容旧后端/既有测试 mock)。返回被保留的条数供页面提示。
    current.value = r.current ?? {}
    return r.kept ?? 0
  }
  async function deleteArchive(idx: number) {
    const r = await projectProgressApi.deleteArchive(idx)
    archives.value = r.archives ?? []
  }
  function reset() {
    current.value = {}
    archives.value = []
    loaded.value = false
  }
  return { current, archives, loaded, load, update, archive, deleteArchive, reset }
})
