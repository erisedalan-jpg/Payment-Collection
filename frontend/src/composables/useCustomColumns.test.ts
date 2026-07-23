import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/followupColumns', () => ({ followupColumnsApi: {} }))
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import { useCustomColumns } from '@/composables/useCustomColumns'

describe('useCustomColumns', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const s = useFollowupColumnsStore()
    s.configs = {
      temp: [], payment_key: [], opportunity: [],
      risk: [
        { key: 'cf-t', label: '责任人', type: 'text', clearOnArchive: false },
        { key: 'cf-d', label: '截止', type: 'date', clearOnArchive: true },
      ],
    } as any
    s.loaded = true
  })

  it('text/date 列生成对应 DataColumn', () => {
    const current = ref<Record<string, any>>({})
    const c = useCustomColumns('risk', { current, rowKey: (r) => r.riskKey })
    const cols = c.columns.value
    expect(cols.map((x) => x.key)).toEqual(['cf-t', 'cf-d'])
    const dateCol = cols.find((x) => x.key === 'cf-d')!
    expect(dateCol.sortable).toBe(true)
    expect(c.filterableKeys.value.has('cf-d')).toBe(true)   // date 可筛选
    expect(c.filterableKeys.value.has('cf-t')).toBe(false)  // text 不可筛选
    expect(c.defaultKeys()).toEqual(['cf-t', 'cf-d'])
  })

  it('decorate 把 current 值(+EditTime)并到行', () => {
    const current = ref<Record<string, any>>({
      R1: { 'cf-t': '张三', 'cf-tEditTime': '2026-07-22 10:00:00' },
    })
    const c = useCustomColumns('risk', { current, rowKey: (r) => r.riskKey })
    const [row] = c.decorate([{ riskKey: 'R1', foo: 1 }])
    expect(row['cf-t']).toBe('张三')
    expect(row['cf-tEditTime']).toBe('2026-07-22 10:00:00')
    expect(row.foo).toBe(1)
  })
})
