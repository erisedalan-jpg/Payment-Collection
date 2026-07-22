import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { useScopedProjects } from './useScopedData'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'

const pageKey = ref<string>('projects')
vi.mock('vue-router', () => ({ useRoute: () => ({ meta: { get pageKey() { return pageKey.value } } }) }))

describe('useScopedProjects', () => {
  beforeEach(() => { setActivePinia(createPinia()); pageKey.value = 'projects' })
  it('按当前页 effectiveScope 收窄', () => {
    const d = useDataStore(); d.$patch({ data: { projects: [
      { projectId: 'P1', orgL4: 'D1' }, { projectId: 'P2', orgL4: 'D2' }], projectPmis: { P1: {}, P2: {} } } as never })
    const auth = useAuthStore()
    auth.user = { account: 'u', displayName: 'u', isSuper: false, allowedPages: ['*'], allowedL4: ['*'],
      pageScopes: { projects: { l4: ['D1'], staff: [] } } } as never
    const scoped = useScopedProjects()
    expect(scoped.value?.projects.map((p: { projectId: string }) => p.projectId)).toEqual(['P1'])
    pageKey.value = 'overview'   // overview 无覆盖→默认 * →不收窄
    expect(scoped.value?.projects.length).toBe(2)
  })
})
