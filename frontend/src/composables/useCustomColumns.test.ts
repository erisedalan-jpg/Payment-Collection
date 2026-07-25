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

describe('V4.4.6 diff 计算列', () => {
  const DIFF_COL = {
    key: 'cf-diff0001', label: '立项至今', type: 'diff' as const, clearOnArchive: false,
    diff: { anchor: { kind: 'today' as const }, target: 'setupDate' },
  }

  // 按本文件既有的 store/挂载范式构造:塞 store.configs、直接拿 useCustomColumns(...) 的各计算属性
  function setup(defs: any[], current: Record<string, any> = {}) {
    const s = useFollowupColumnsStore()
    s.configs = { ...s.configs, temp: defs }
    const cur = ref<Record<string, any>>(current)
    return useCustomColumns('temp', { current: cur, rowKey: (r) => r.projectId })
  }
  function makeColumns(defs: any[]) {
    return setup(defs).columns.value
  }
  function makeDecorate(defs: any[], current: Record<string, any>) {
    const c = setup(defs, current)
    return (rows: any[]) => c.decorate(rows)
  }
  function makeFilterable(defs: any[]) {
    return setup(defs).filterableKeys.value
  }

  it('toDataColumn:diff 是数字列、可排序、不带「天」后缀', () => {
    // 通过 columns 计算属性间接验证(与本文件既有用例同风格)
    const c = makeColumns([DIFF_COL]).find((x: any) => x.key === 'cf-diff0001')!
    expect(c.num).toBe(true)
    expect(c.sortable).toBe(true)
    expect(c.formatter!(12, {})).toBe('12')
    expect(c.formatter!(null, {})).toBe('-')
  })

  it('【关键】没有跟进记录的行也要算出 diff 值', () => {
    // current 为空 → 旧实现 if (!rec) return r 会整行跳过
    const rows = makeDecorate([DIFF_COL], {})([{ projectId: 'P1', setupDate: '2026-01-01' }])
    expect(typeof (rows[0] as any)['cf-diff0001']).toBe('number')
  })

  it('diff 值不从 current 读:即便 current 里存了值也以计算结果为准', () => {
    const cur = { P1: { 'cf-diff0001': 99999 } }
    const rows = makeDecorate([DIFF_COL], cur)([{ projectId: 'P1', setupDate: '2026-01-01' }])
    expect((rows[0] as any)['cf-diff0001']).not.toBe(99999)
  })

  it('filterableKeys 不含 diff 列', () => {
    expect(makeFilterable([DIFF_COL]).has('cf-diff0001')).toBe(false)
  })
})
