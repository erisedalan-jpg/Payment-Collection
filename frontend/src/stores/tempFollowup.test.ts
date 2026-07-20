import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useTempFollowupStore } from './tempFollowup'
import type { ScopeFilter } from '@/lib/tempScope'

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

// I-1:请求在途切换实例的竞态。四个 action(saveScope/update/archive/deleteArchive)
// 都是"发请求时用 activeId,await 之后再读 activeInstance"——若切了选项卡,await 后
// activeInstance 已经指向别的实例,回填就会把 A 的结果写进 B。用可手动 resolve 的
// deferred promise 模拟"请求在途"这个窗口。
//
// 每条用例都用局部新建的 fixture(而不是上面共享的 INST_A/INST_B 字面量),因为
// store 的 _setInstances 直接持有引用、历史用例会原地 mutate 这两个对象,若复用会
// 让本组用例的断言意外撞上其它用例遗留的字段。
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

function freshInstances() {
  return [
    { id: 'inst-aaa', name: '甲', scope: { combinator: 'AND', groups: [] },
      current: {}, archives: [] },
    { id: 'inst-bbb', name: '乙', scope: { combinator: 'AND', groups: [] },
      current: {}, archives: [] },
  ]
}

describe('tempFollowup store 请求在途切换实例竞态(I-1)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    ;(tempFollowupApi.get as any).mockResolvedValue({ success: true, instances: freshInstances() })
  })

  it('update:请求在途切到别的实例,结果仍写回发起时的实例,另一个不受影响', async () => {
    const d = deferred<{ success: true; record: any }>()
    ;(tempFollowupApi.update as any).mockReturnValue(d.promise)
    const s = useTempFollowupStore()
    await s.load()                                   // activeId = inst-aaa
    const p = s.update('P9', 'weekProgress', 'A的进展')
    s.setActive('inst-bbb')                          // 请求在途时切到另一个实例
    d.resolve({ success: true, record: { weekProgress: 'A的进展' } })
    await p
    const instA = s.instances.find((i) => i.id === 'inst-aaa')!
    const instB = s.instances.find((i) => i.id === 'inst-bbb')!
    expect(instA.current.P9?.weekProgress).toBe('A的进展')
    expect(instB.current.P9).toBeUndefined()
  })

  it('saveScope:请求在途切到别的实例,结果仍写回发起时的实例', async () => {
    const d = deferred<{ success: true; scope: any }>()
    ;(tempFollowupApi.saveScope as any).mockReturnValue(d.promise)
    const s = useTempFollowupStore()
    await s.load()                                   // activeId = inst-aaa
    const next: ScopeFilter = { combinator: 'OR', groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'orgL4', op: 'in', values: ['X组'] }] }] }
    const p = s.saveScope(next)
    s.setActive('inst-bbb')
    d.resolve({ success: true, scope: next })
    await p
    const instA = s.instances.find((i) => i.id === 'inst-aaa')!
    const instB = s.instances.find((i) => i.id === 'inst-bbb')!
    expect(instA.scope.groups.length).toBe(1)
    expect(instB.scope.groups.length).toBe(0)          // 未被污染
  })

  it('archive:请求在途切到别的实例,结果仍写回发起时的实例', async () => {
    const d = deferred<{ success: true; archives: any[] }>()
    ;(tempFollowupApi.archive as any).mockReturnValue(d.promise)
    const s = useTempFollowupStore()
    await s.load()                                   // activeId = inst-aaa
    const p = s.archive([{ projectId: 'P1' }])
    s.setActive('inst-bbb')
    d.resolve({ success: true, archives: [{ archiveTime: 't2', rows: [] }] })
    await p
    const instA = s.instances.find((i) => i.id === 'inst-aaa')!
    const instB = s.instances.find((i) => i.id === 'inst-bbb')!
    expect(instA.archives.length).toBe(1)
    expect(instB.archives.length).toBe(0)              // 未被污染(真实场景里这条会变成删错归档)
  })

  it('deleteArchive:请求在途切到别的实例,结果仍写回发起时的实例,不删错 B 的归档', async () => {
    // A、B 起始归档不同且都非空,才能分辨"结果落进了谁"——若都是空数组,写错了地方也看不出来。
    ;(tempFollowupApi.get as any).mockResolvedValue({
      success: true,
      instances: [
        { id: 'inst-aaa', name: '甲', scope: { combinator: 'AND', groups: [] }, current: {},
          archives: [{ archiveTime: 't1', rows: [] }, { archiveTime: 't2', rows: [] }] },
        { id: 'inst-bbb', name: '乙', scope: { combinator: 'AND', groups: [] }, current: {},
          archives: [{ archiveTime: 'B原有', rows: [] }] },
      ],
    })
    const d = deferred<{ success: true; archives: any[] }>()
    ;(tempFollowupApi.deleteArchive as any).mockReturnValue(d.promise)
    const s = useTempFollowupStore()
    await s.load()                                   // activeId = inst-aaa
    const p = s.deleteArchive(0)                       // 删 inst-aaa 的第 0 条
    s.setActive('inst-bbb')
    d.resolve({ success: true, archives: [{ archiveTime: 't2', rows: [] }] })  // 服务端已按 A 删好
    await p
    const instA = s.instances.find((i) => i.id === 'inst-aaa')!
    const instB = s.instances.find((i) => i.id === 'inst-bbb')!
    expect(instA.archives).toEqual([{ archiveTime: 't2', rows: [] }])     // A 收到删除后的正确结果
    expect(instB.archives).toEqual([{ archiveTime: 'B原有', rows: [] }])   // B 的真实归档完全未被触碰
  })
})
