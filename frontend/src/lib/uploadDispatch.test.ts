import { describe, it, expect } from 'vitest'
import { dispatchMainDomainFiles, formatDispatchMessage, YITIAN_FILE_NAMES } from './uploadDispatch'
import { PMIS_FILE_NAMES } from '@/composables/usePmisSync'
import { INPUT_FILE_NAMES } from '@/composables/useInputFiles'

const f = (name: string) => new File(['x'], name)

describe('dispatchMainDomainFiles', () => {
  it('9 个 PMIS 九表全部进 pmis 组', () => {
    const r = dispatchMainDomainFiles(PMIS_FILE_NAMES.map(f))
    expect(r.pmis).toHaveLength(9)
    expect(r.inputs).toHaveLength(0)
    expect(r.skipped).toHaveLength(0)
  })

  it('项目域根文件进 inputs 组', () => {
    const r = dispatchMainDomainFiles([f('collection_stages.csv'), f('组织架构.xlsx'), f('payment_records.csv')])
    expect(r.inputs.map((x) => x.name)).toEqual(['collection_stages.csv', '组织架构.xlsx', 'payment_records.csv'])
    expect(r.pmis).toHaveLength(0)
    expect(r.skipped).toHaveLength(0)
  })

  it('倚天两文件进 skipped 且 reason=yitian(不串域)', () => {
    const r = dispatchMainDomainFiles([f('工时.xlsx'), f('holidays.csv')])
    expect(r.inputs).toHaveLength(0)
    expect(r.skipped).toEqual([
      { name: '工时.xlsx', reason: 'yitian' },
      { name: 'holidays.csv', reason: 'yitian' },
    ])
  })

  it('legacy delivery_analysis.xlsx 仍正常上传至 inputs', () => {
    const r = dispatchMainDomainFiles([f('delivery_analysis.xlsx')])
    expect(r.inputs.map((x) => x.name)).toEqual(['delivery_analysis.xlsx'])
    expect(r.skipped).toHaveLength(0)
  })

  it('未知文件进 skipped 且 reason=unknown', () => {
    const r = dispatchMainDomainFiles([f('乱七八糟.xlsx')])
    expect(r.skipped).toEqual([{ name: '乱七八糟.xlsx', reason: 'unknown' }])
  })

  it('混合投放各归其位', () => {
    const r = dispatchMainDomainFiles([f('项目中心.xlsx'), f('budget_data.csv'), f('工时.xlsx'), f('x.txt')])
    expect(r.pmis.map((x) => x.name)).toEqual(['项目中心.xlsx'])
    expect(r.inputs.map((x) => x.name)).toEqual(['budget_data.csv'])
    expect(r.skipped).toEqual([
      { name: '工时.xlsx', reason: 'yitian' },
      { name: 'x.txt', reason: 'unknown' },
    ])
  })

  it('空数组不炸', () => {
    expect(dispatchMainDomainFiles([])).toEqual({ pmis: [], inputs: [], skipped: [] })
  })

  it('两个白名单互斥(回归护栏)', () => {
    const overlap = PMIS_FILE_NAMES.filter((n) => INPUT_FILE_NAMES.includes(n))
    expect(overlap).toEqual([])
  })

  it('YITIAN_FILE_NAMES 是 INPUT_FILE_NAMES 的子集(回归护栏)', () => {
    expect(YITIAN_FILE_NAMES.every((n) => INPUT_FILE_NAMES.includes(n))).toBe(true)
  })
})

describe('formatDispatchMessage', () => {
  it('全部识别:只报上传结果', () => {
    const r = { pmis: [f('项目中心.xlsx')], inputs: [f('budget_data.csv')], skipped: [] }
    expect(formatDispatchMessage(r, 1, 1)).toBe('已上传 1 个 PMIS 九表 + 1 个项目域文件,请点[更新数据]生效')
  })

  it('有跳过:逐个列名并给原因', () => {
    const r = {
      pmis: [], inputs: [],
      skipped: [{ name: '工时.xlsx', reason: 'yitian' as const }, { name: 'x.txt', reason: 'unknown' as const }],
    }
    expect(formatDispatchMessage(r, 0, 0)).toBe(
      '已上传 0 个 PMIS 九表 + 0 个项目域文件,请点[更新数据]生效;' +
      '已跳过:工时.xlsx（属倚天工时域,请在「倚天工时域」卡上传）、x.txt（不在主域白名单）',
    )
  })

  it('全部成功(okPmis/okInputs 等于分发数):不出现失败子句(I-1)', () => {
    const r = { pmis: [f('项目中心.xlsx')], inputs: [f('budget_data.csv')], skipped: [] }
    expect(formatDispatchMessage(r, 1, 1)).not.toContain('失败')
  })

  it('部分失败(okPmis 小于 r.pmis.length,即 HTTP 层失败):出现失败子句并报数(I-1)', () => {
    const r = { pmis: [f('项目中心.xlsx'), f('项目风险数据.xlsx')], inputs: [], skipped: [] }
    expect(formatDispatchMessage(r, 1, 0)).toBe(
      '已上传 1 个 PMIS 九表 + 0 个项目域文件,请点[更新数据]生效;失败 1 个（服务端未接收,请重试）',
    )
  })

  it('失败+跳过同时出现:失败子句在前、跳过子句在后(I-1)', () => {
    const r = {
      pmis: [f('项目中心.xlsx'), f('项目风险数据.xlsx')], inputs: [],
      skipped: [{ name: 'x.txt', reason: 'unknown' as const }],
    }
    expect(formatDispatchMessage(r, 1, 0)).toBe(
      '已上传 1 个 PMIS 九表 + 0 个项目域文件,请点[更新数据]生效;失败 1 个（服务端未接收,请重试）;' +
      '已跳过:x.txt（不在主域白名单）',
    )
  })
})
