import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTempFollowupStore } from './tempFollowup'

vi.mock('@/lib/tempFollowupApi', () => ({
  tempFollowupApi: {
    get: vi.fn(),
    saveScope: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    deleteArchive: vi.fn(),
    createInstance: vi.fn(),
    renameInstance: vi.fn(),
    deleteInstance: vi.fn(),
  },
}))
import { tempFollowupApi } from '@/lib/tempFollowupApi'

const INST_A = { id: 'inst-aaa', name: '甲', scope: { combinator: 'AND', groups: [] },
                 current: { P1: { weekProgress: '甲的进展' } }, archives: [{ archiveTime: 't1', rows: [] }] }
const INST_B = { id: 'inst-bbb', name: '乙', scope: { combinator: 'OR', groups: [] },
                 current: {}, archives: [] }

describe('tempFollowup store 多实例', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(tempFollowupApi.get as any).mockResolvedValue({ success: true, instances: [INST_A, INST_B] })
  })

  it('load 后默认选中第一个实例,scope/current/archives 指向它', async () => {
    const s = useTempFollowupStore()
    await s.load()
    expect(s.instances.length).toBe(2)
    expect(s.activeId).toBe('inst-aaa')
    expect(s.current.P1.weekProgress).toBe('甲的进展')
    expect(s.archives.length).toBe(1)
  })

  it('setActive 后三个导出跟着切换 —— 这是视图零改动的前提', async () => {
    const s = useTempFollowupStore()
    await s.load()
    s.setActive('inst-bbb')
    expect(s.current).toEqual({})
    expect(s.archives).toEqual([])
    expect(s.scope.combinator).toBe('OR')
  })

  it('update 自动带上 activeId', async () => {
    ;(tempFollowupApi.update as any).mockResolvedValue({ success: true, record: { weekProgress: 'x' } })
    const s = useTempFollowupStore()
    await s.load()
    s.setActive('inst-bbb')
    await s.update('P9', 'weekProgress', 'x')
    expect(tempFollowupApi.update).toHaveBeenCalledWith('inst-bbb', 'P9', 'weekProgress', 'x')
  })

  it('update 只改当前实例的 current,不串到别的实例', async () => {
    ;(tempFollowupApi.update as any).mockResolvedValue({ success: true, record: { weekProgress: '乙的' } })
    const s = useTempFollowupStore()
    await s.load()
    s.setActive('inst-bbb')
    await s.update('P9', 'weekProgress', '乙的')
    expect(s.current.P9.weekProgress).toBe('乙的')
    s.setActive('inst-aaa')
    expect(s.current.P9).toBeUndefined()
  })

  it('deleteInstance 后若删的是当前实例,自动回落到第一个', async () => {
    ;(tempFollowupApi.deleteInstance as any).mockResolvedValue({ success: true, instances: [INST_B] })
    const s = useTempFollowupStore()
    await s.load()
    await s.deleteInstance('inst-aaa')
    expect(s.activeId).toBe('inst-bbb')
  })

  it('createInstance 后自动切到新实例', async () => {
    const NEW = { id: 'inst-ccc', name: '丙', scope: { combinator: 'AND', groups: [] }, current: {}, archives: [] }
    ;(tempFollowupApi.createInstance as any).mockResolvedValue(
      { success: true, instance: NEW, instances: [INST_A, INST_B, NEW] })
    const s = useTempFollowupStore()
    await s.load()
    await s.createInstance('丙')
    expect(s.activeId).toBe('inst-ccc')
  })

  it('实例列表为空时三个导出降级为空值,不抛', async () => {
    ;(tempFollowupApi.get as any).mockResolvedValue({ success: true, instances: [] })
    const s = useTempFollowupStore()
    await s.load()
    expect(s.current).toEqual({})
    expect(s.archives).toEqual([])
    expect(s.scope).toEqual({ combinator: 'AND', groups: [] })
  })
})
