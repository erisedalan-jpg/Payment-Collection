import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

const { listSpy, getSpy, delSpy } = vi.hoisted(() => ({
  listSpy: vi.fn(), getSpy: vi.fn(), delSpy: vi.fn(),
}))
vi.mock('@/lib/budgetApi', () => ({
  listEstimates: listSpy, getEstimate: getSpy, deleteEstimate: delSpy,
  getBudgetConfig: vi.fn(), saveBudgetConfig: vi.fn(), saveEstimate: vi.fn(),
}))

import EstimateDrawer from './EstimateDrawer.vue'

const ITEMS = [
  { id: 'e1', account: 'zhangsan', quoteName: 'A项目', customerName: '客户甲',
    salesName: '张三', projectAmount: 100, totalCost: 100000, salesAmount: 113000,
    costRatio: 11.3, ratioStatus: 'normal', createdAt: '2026-07-01 10:00:00',
    updatedAt: '2026-07-01 10:00:00' },
  { id: 'e2', account: 'lisi', quoteName: 'B项目', customerName: '客户乙',
    salesName: '李四', projectAmount: 50, totalCost: 60000, salesAmount: 67800,
    costRatio: 13.56, ratioStatus: 'normal', createdAt: '2026-07-02 10:00:00',
    updatedAt: '2026-07-02 10:00:00' },
]

describe('EstimateDrawer', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listSpy.mockReset(); getSpy.mockReset(); delSpy.mockReset()
    listSpy.mockResolvedValue(ITEMS)
  })

  const mountIt = (isSuper = false) => mount(EstimateDrawer, {
    props: { modelValue: true, isSuper },
    global: { plugins: [ElementPlus] },
  })

  it('打开即拉列表,展示报价名/客户/成本比例', async () => {
    const w = mountIt()
    await flushPromises()
    expect(listSpy).toHaveBeenCalledWith(false)
    expect(w.text()).toContain('A项目')
    expect(w.text()).toContain('客户甲')
    expect(w.text()).toContain('11.3')
  })

  it('普通管理员没有「查看全部账号」开关', async () => {
    const w = mountIt(false)
    await flushPromises()
    expect(w.text()).not.toContain('查看全部账号')
  })

  it('超管有「查看全部账号」开关,打开后按 all=true 重拉并显示创建人列', async () => {
    const w = mountIt(true)
    await flushPromises()
    expect(w.text()).toContain('查看全部账号')
    await (w.vm as any).toggleAll(true)
    expect(listSpy).toHaveBeenLastCalledWith(true)
    expect(w.text()).toContain('创建人')
  })

  it('搜索按报价名与客户过滤', async () => {
    const w = mountIt()
    await flushPromises()
    ;(w.vm as any).keyword = '客户乙'
    await flushPromises()
    expect((w.vm as any).filtered.map((x: any) => x.id)).toEqual(['e2'])
  })

  it('恢复:取整条记录后 emit restore', async () => {
    const rec = { ...ITEMS[0], data: {}, rateSnapshot: {}, summary: {} }
    getSpy.mockResolvedValue(rec)
    const w = mountIt()
    await flushPromises()
    await (w.vm as any).restore('e1')
    expect(getSpy).toHaveBeenCalledWith('e1')
    expect(w.emitted('restore')?.[0]?.[0]).toEqual(rec)
  })

  it('删除后刷新列表', async () => {
    delSpy.mockResolvedValue(undefined)
    const w = mountIt()
    await flushPromises()
    listSpy.mockResolvedValue([ITEMS[1]])
    await (w.vm as any).doDelete('e1')
    expect(delSpy).toHaveBeenCalledWith('e1')
    expect((w.vm as any).items.map((x: any) => x.id)).toEqual(['e2'])
  })
})
