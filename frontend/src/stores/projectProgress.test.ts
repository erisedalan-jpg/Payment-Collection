import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectProgressStore } from './projectProgress'
import * as apiMod from '@/lib/projectProgressApi'

beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks() })

describe('projectProgress store', () => {
  it('load 拉取 current/archives', async () => {
    vi.spyOn(apiMod.projectProgressApi, 'getProgress').mockResolvedValue({
      success: true, current: { P1: { weekProgress: 'x' } }, archives: [{ archiveTime: 't', rows: [] }],
    })
    const s = useProjectProgressStore()
    await s.load()
    expect(s.current.P1.weekProgress).toBe('x')
    expect(s.archives).toHaveLength(1)
    expect(s.loaded).toBe(true)
  })
  it('update 调 api 并更新本地 current', async () => {
    vi.spyOn(apiMod.projectProgressApi, 'updateProgress').mockResolvedValue({
      success: true, record: { weekProgress: 'A', weekProgressEditTime: 't', weekProgressEditBy: 'u' },
    })
    const s = useProjectProgressStore()
    await s.update('P1', 'weekProgress', 'A')
    expect(s.current.P1.weekProgress).toBe('A')
    expect(s.current.P1.weekProgressEditBy).toBe('u')
  })
  it('archive 调 api、用返回 archives 刷新、清空 current', async () => {
    vi.spyOn(apiMod.projectProgressApi, 'archiveProgress').mockResolvedValue({
      success: true, archives: [{ archiveTime: 't1', rows: [{ projectId: 'P1' }] }],
    })
    const s = useProjectProgressStore()
    s.current = { P1: { weekProgress: 'A' } }
    await s.archive([{ projectId: 'P1' } as any])
    expect(s.archives).toHaveLength(1)
    expect(s.current).toEqual({})
  })
  it('reset 清空 current/archives/loaded', () => {
    const s = useProjectProgressStore()
    s.current = { P1: { weekProgress: 'x' } }
    s.archives = [{ archiveTime: 't', rows: [] }]
    s.loaded = true
    s.reset()
    expect(s.current).toEqual({})
    expect(s.archives).toHaveLength(0)
    expect(s.loaded).toBe(false)
  })
})
