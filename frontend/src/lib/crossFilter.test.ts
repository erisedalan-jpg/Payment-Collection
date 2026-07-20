import { describe, it, expect } from 'vitest'
import { cfFormatValue, cfUniqueValues, applyColumnFilters } from './crossFilter'

describe('cfFormatValue', () => {
  it('空值/布尔/比例/普通', () => {
    expect(cfFormatValue('orgL4', '')).toBe('空值')
    expect(cfFormatValue('orgL4', null)).toBe('空值')
    expect(cfFormatValue('canAdvance', true)).toBe('是')
    expect(cfFormatValue('canAdvance', false)).toBe('否')
    expect(cfFormatValue('actualPaymentRatio', 0.8)).toBe('80%')
    expect(cfFormatValue('orgL4', '北京')).toBe('北京')
  })
})

describe('cfFormatValue 非日期列不误判为日期', () => {
  it("金额列 '45000' 不转日期", () => {
    expect(cfFormatValue('projectAmount', '45000')).not.toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('cfUniqueValues', () => {
  it('去重并按展示值升序（空值排末位）', () => {
    const rows = [{ orgL4: '北京' }, { orgL4: '上海' }, { orgL4: '北京' }, { orgL4: '' }]
    expect(cfUniqueValues(rows, 'orgL4').map((u) => u.display)).toEqual(['上海', '北京', '空值'])
  })
})

describe('applyColumnFilters', () => {
  const rows = [
    { orgL4: '北京', nodeStatus: '延期' },
    { orgL4: '上海', nodeStatus: '正常实施中' },
  ]
  it('无筛选返回原数据', () => {
    expect(applyColumnFilters(rows, undefined)).toHaveLength(2)
    expect(applyColumnFilters(rows, {})).toHaveLength(2)
  })
  it('按展示值筛选', () => {
    expect(applyColumnFilters(rows, { orgL4: { value: ['北京'] } })).toEqual([rows[0]])
  })
  it('多列与（AND）', () => {
    expect(applyColumnFilters(rows, { orgL4: { value: ['北京'] }, nodeStatus: { value: ['正常实施中'] } })).toHaveLength(0)
  })
  it('空选集匹配不到任何行', () => {
    expect(applyColumnFilters(rows, { orgL4: { value: [] } })).toHaveLength(0)
  })
})

describe('crossFilter — riskReasons 多值(按类别)', () => {
  const rows = [
    { projectId: 'A', riskReasons: [{ category: '回款延期' }, { category: '总成本超支大于5000' }] },
    { projectId: 'B', riskReasons: [{ category: '交付成本超支' }] },
    { projectId: 'C', riskReasons: [] },
  ] as any[]
  it('唯一值=摊平后的各类别', () => {
    const u = cfUniqueValues(rows, 'riskReasons').map((x) => x.display)
    expect(u).toContain('回款延期'); expect(u).toContain('总成本超支大于5000'); expect(u).toContain('交付成本超支')
  })
  it('筛选「交付成本超支」只留 B', () => {
    const res = applyColumnFilters(rows, { riskReasons: { value: ['交付成本超支'] } })
    expect(res.map((r: any) => r.projectId)).toEqual(['B'])
  })
})

describe('通用数组列筛选', () => {
  const rows = [{ code: ['A', 'B'] }, { code: ['A'] }, { code: [] }, { code: ['C'] }]
  it('cfUniqueValues 摊平去重升序（含空数组 → 空值置顶，V4.0.1 起）', () => {
    expect(cfUniqueValues(rows, 'code').map((u) => u.display)).toEqual(['空值', 'A', 'B', 'C'])
  })
  it('applyColumnFilters 元素成员匹配', () => {
    expect(applyColumnFilters(rows, { code: { value: ['A'] } })).toEqual([{ code: ['A', 'B'] }, { code: ['A'] }])
  })
  it('多选取并集', () => {
    expect(applyColumnFilters(rows, { code: { value: ['B', 'C'] } })).toEqual([{ code: ['A', 'B'] }, { code: ['C'] }])
  })
  it('不误伤标量列', () => {
    const s = [{ x: '1' }, { x: '2' }]
    expect(applyColumnFilters(s, { x: { value: ['1'] } })).toEqual([{ x: '1' }])
  })
})

describe('V4.0.1 数组列的「空值」选项', () => {
  const rows = [
    { id: 'A', tags: ['重点', '国网'] },
    { id: 'B', tags: [] },        // 空数组:无标签
    { id: 'C' },                  // 字段缺失:同样视为无
    { id: 'D', tags: ['重点'] },
  ]

  it('存在空数组时,选项首项是「空值」,其余按字母序', () => {
    const opts = cfUniqueValues(rows, 'tags').map((o) => o.display)
    expect(opts[0]).toBe('空值')
    expect(opts).toEqual(['空值', '国网', '重点'])
  })

  it('全都有值时不产出「空值」选项', () => {
    const opts = cfUniqueValues(
      [{ id: 'A', tags: ['重点'] }, { id: 'D', tags: ['国网'] }], 'tags').map((o) => o.display)
    expect(opts).toEqual(['国网', '重点'])
  })

  it('选「空值」能筛出空数组的行 —— 这是本任务的目的', () => {
    const r = applyColumnFilters(rows, { tags: { value: ['空值'] } } as any)
    expect(r.map((x: any) => x.id)).toEqual(['B', 'C'])
  })

  it('选具体标签时,空数组的行被排除(原有行为不得回归)', () => {
    const r = applyColumnFilters(rows, { tags: { value: ['重点'] } } as any)
    expect(r.map((x: any) => x.id)).toEqual(['A', 'D'])
  })

  it('「空值」与具体标签可同时选,取并集', () => {
    const r = applyColumnFilters(rows, { tags: { value: ['空值', '国网'] } } as any)
    expect(r.map((x: any) => x.id)).toEqual(['A', 'B', 'C'])
  })

  it('riskReasons 专用分支不受影响', () => {
    const rr = [
      { id: 'A', riskReasons: [{ category: '回款延期' }] },
      { id: 'B', riskReasons: [] },
    ]
    const opts = cfUniqueValues(rr, 'riskReasons').map((o) => o.display)
    expect(opts).toEqual(['回款延期'])   // 不加「空值」
  })
})
