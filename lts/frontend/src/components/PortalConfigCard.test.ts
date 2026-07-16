import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const { saveSpy } = vi.hoisted(() => ({ saveSpy: vi.fn(async (c: any) => c) }))
vi.mock('@/lib/portalApi', () => ({
  getPortalConfig: vi.fn(async () => ({ version: 1, groups: ['G'], items: [
    { id: 'pl_' + 'a'.repeat(12), type: 'url', name: 'A', group: 'G', emoji: '', featured: false,
      url: 'https://a.com', file: null, visibility: { mode: 'all' } },
    { id: 'pl_' + 'b'.repeat(12), type: 'url', name: 'B', group: 'G', emoji: '', featured: false,
      url: 'https://b.com', file: null, visibility: { mode: 'all' } },
  ] })),
  savePortalConfig: saveSpy,
  uploadPortalFile: vi.fn(),
}))
vi.mock('@/lib/admin', () => ({ listAccounts: vi.fn(async () => []) }))

import PortalConfigCard from './PortalConfigCard.vue'

function mountCard() {
  return mount(PortalConfigCard, { global: { stubs: { PortalItemEditDialog: true } } })
}

describe('PortalConfigCard', () => {
  beforeEach(() => { setActivePinia(createPinia()); saveSpy.mockClear() })

  it('挂载后展示 store 现有项', async () => {
    const w = mountCard()
    await flushPromises()
    expect(w.findAll('[data-test="pc-item-row"]')).toHaveLength(2)
  })

  it('删除项后保存写回缺该项的 config', async () => {
    const w = mountCard()
    await flushPromises()
    await w.findAll('[data-test="pc-del"]')[0].trigger('click')
    await w.find('[data-test="pc-save"]').trigger('click')
    await flushPromises()
    expect(saveSpy).toHaveBeenCalled()
    const saved = saveSpy.mock.calls[0][0]
    expect(saved.items.map((i: any) => i.name)).toEqual(['B'])
  })

  it('下移首项后保存,顺序变为 B,A', async () => {
    const w = mountCard()
    await flushPromises()
    await w.findAll('[data-test="pc-down"]')[0].trigger('click')
    await w.find('[data-test="pc-save"]').trigger('click')
    await flushPromises()
    const saved = saveSpy.mock.calls[0][0]
    expect(saved.items.map((i: any) => i.name)).toEqual(['B', 'A'])
  })

  it('接收 dialog 的 save 事件后新增项进入 draft 且组被登记', async () => {
    const w = mountCard()
    await flushPromises()
    const newItem = { id: 'pl_' + 'c'.repeat(12), type: 'url', name: 'C', group: '新组', emoji: '',
      featured: false, url: 'https://c.com', file: null, visibility: { mode: 'all' } }
    w.vm.onDialogSave(newItem as any)
    await flushPromises()
    expect(w.vm.draft.items.map((i: any) => i.name)).toContain('C')
    expect(w.vm.draft.groups).toContain('新组')
  })
})
