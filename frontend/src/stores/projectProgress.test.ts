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
  it('archive 用后端回传的 current 回填,范围外记录必须留住(L-63)', async () => {
    // 「重点项目进展」只渲染重点项目;非重点项目的记录(蓝信归入写进来的、或项目降级后的)
    // 页面上看不见 → 不在归档 rows 里 → 后端不再清它。前端若照旧硬编码 current={},
    // 归档后 UI 会以为它没了,刷新又冒出来。
    vi.spyOn(apiMod.projectProgressApi, 'archiveProgress').mockResolvedValue({
      success: true, archives: [{ archiveTime: 't1', rows: [{ projectId: 'P1' }] }],
      current: { P9: { weekProgress: '非重点项目,页面不显示它' } }, kept: 1,
    })
    const s = useProjectProgressStore()
    s.current = { P1: { weekProgress: 'A' }, P9: { weekProgress: '非重点项目,页面不显示它' } }
    const kept = await s.archive([{ projectId: 'P1' } as any])
    expect(s.current).toEqual({ P9: { weekProgress: '非重点项目,页面不显示它' } })
    expect(kept).toBe(1)
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
