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
    { projectId: 'A', riskReasons: [{ category: '回款延期' }, { category: '总成本超支' }] },
    { projectId: 'B', riskReasons: [{ category: '交付成本超支' }] },
    { projectId: 'C', riskReasons: [] },
  ] as any[]
  it('唯一值=摊平后的各类别', () => {
    const u = cfUniqueValues(rows, 'riskReasons').map((x) => x.display)
    expect(u).toContain('回款延期'); expect(u).toContain('总成本超支'); expect(u).toContain('交付成本超支')
  })
  it('筛选「交付成本超支」只留 B', () => {
    const res = applyColumnFilters(rows, { riskReasons: { value: ['交付成本超支'] } })
    expect(res.map((r: any) => r.projectId)).toEqual(['B'])
  })
})
