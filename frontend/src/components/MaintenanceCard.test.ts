import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MaintenanceCard from './MaintenanceCard.vue'
import { useAuthStore } from '@/stores/auth'

vi.mock('@/lib/manualApi', () => ({
  manualApi: {
    backups: vi.fn(async () => ({ success: true, versions: [] })),
    import: vi.fn(async () => ({ success: true, message: '导入成功' })),
    rollback: vi.fn(async () => ({ success: true, message: '已回滚' })),
  },
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) } as any)))
})

const mountCard = async (isSuper = true) => {
  const auth = useAuthStore()
  ;(auth as any).user = { account: 'admin', isSuper, allowedPages: ['*'], allowedL4: ['*'] }
  const w = mount(MaintenanceCard, { global: { plugins: [ElementPlus], stubs: { YitianStoreCard: true } } })
  await flushPromises()
  return w
}

describe('MaintenanceCard', () => {
  it('四个折叠项齐全(人工导入/数据历史/倚天累积数据/清空数据)', async () => {
    const w = await mountCard()
    const t = w.text()
    expect(t).toContain('人工数据导入')
    expect(t).toContain('数据历史')
    expect(t).toContain('倚天累积数据管理')
    expect(t).toContain('清空数据')
  })

  it('保留 manual-import-card 与 history-source-note 钩子', async () => {
    const w = await mountCard()
    expect(w.find('[data-test="manual-import-card"]').exists()).toBe(true)
    const note = w.find('[data-test="history-source-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('源数据仅保留最新 1 份')
    expect(note.text()).toContain('回滚仅还原看板数据')
  })

  it('非超管不渲染倚天累积数据管理(纵深防御)', async () => {
    const w = await mountCard(false)
    expect(w.text()).not.toContain('倚天累积数据管理')
  })
})
