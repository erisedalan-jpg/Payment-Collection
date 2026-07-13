import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'

const { getSpy, clearSpy, delSpy } = vi.hoisted(() => ({
  getSpy: vi.fn(),
  clearSpy: vi.fn(),
  delSpy: vi.fn(),
}))
vi.mock('@/lib/yitianApi', () => ({
  getYitianStore: getSpy,
  clearYitianStore: clearSpy,
  deleteYitianStoreRange: delSpy,
}))

import YitianStoreCard from './YitianStoreCard.vue'

describe('YitianStoreCard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    getSpy.mockReset(); clearSpy.mockReset(); delSpy.mockReset()
    getSpy.mockResolvedValue({ rows: 540, start: '2026-04-17', end: '2026-04-23' })
    clearSpy.mockResolvedValue({ rows: 0, start: null, end: null })
    delSpy.mockResolvedValue({ deleted: 100, stats: { rows: 440, start: '2026-04-18', end: '2026-04-23' } })
  })

  it('挂载即显示累积状态', async () => {
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('540')
    expect(w.text()).toContain('2026-04-17')
  })

  it('空库时给出提示', async () => {
    getSpy.mockResolvedValue({ rows: 0, start: null, end: null })
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('尚未导入')
  })

  it('清空后刷新状态', async () => {
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    await (w.vm as any).onClear()
    expect(clearSpy).toHaveBeenCalled()
    expect((w.vm as any).stats.rows).toBe(0)
  })

  it('按区间删除(确认后)', async () => {
    const { ElMessageBox } = await import('element-plus')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    ;(w.vm as any).range = ['2026-04-17', '2026-04-17']
    await (w.vm as any).onDeleteRange()
    expect(confirmSpy).toHaveBeenCalled()
    expect(delSpy).toHaveBeenCalledWith('2026-04-17', '2026-04-17')
    expect((w.vm as any).stats.rows).toBe(440)
    confirmSpy.mockRestore()
  })

  it('未选区间不发请求(不弹确认框)', async () => {
    const { ElMessageBox } = await import('element-plus')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm')
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    ;(w.vm as any).range = null
    await (w.vm as any).onDeleteRange()
    expect(confirmSpy).not.toHaveBeenCalled()
    expect(delSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('I-4: 取消删除区间确认框 → 不发请求', async () => {
    // 误删的历史周没有源文件可重导 = 永久丢失,破坏性高于「清空」,必须有二次确认。
    const { ElMessageBox } = await import('element-plus')
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel')
    const w = mount(YitianStoreCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    ;(w.vm as any).range = ['2026-04-17', '2026-04-17']
    await (w.vm as any).onDeleteRange()
    expect(confirmSpy).toHaveBeenCalled()
    expect(delSpy).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })
})
