import { describe, it, expect } from 'vitest'
import { buildDetailDrill, parseDetailDrill } from './detailDrill'

describe('detailDrill', () => {
  it('buildDetailDrill 空字段不输出', () => {
    expect(buildDetailDrill({})).toEqual({})
    expect(buildDetailDrill({ l4: '银行服务组' })).toEqual({ dL4: '银行服务组' })
  })

  it('buildDetailDrill 全字段 + only 输出 "1"', () => {
    expect(buildDetailDrill({ emp: 'A1', start: '2026-06-01', end: '2026-06-02', only: true }))
      .toEqual({ dEmp: 'A1', dStart: '2026-06-01', dEnd: '2026-06-02', dOnly: '1' })
  })

  it('parseDetailDrill 往返一致', () => {
    const d = { l4: '浙江服务组', emp: 'A2', only: true }
    expect(parseDetailDrill(buildDetailDrill(d))).toEqual(d)
  })

  it('parseDetailDrill 数组 query 取首项、未知键忽略、dOnly 非 "1" 不置真', () => {
    expect(parseDetailDrill({ dL4: ['x', 'y'], zzz: '1', dOnly: '0' })).toEqual({ l4: 'x' })
  })
})
