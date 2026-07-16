import { describe, it, expect } from 'vitest'
import { isAnomalous, anomalyRows } from './anomaly'

describe('isAnomalous（orgL4 空判定）', () => {
  it('orgL4 为空串/纯空白/undefined 判异常', () => {
    expect(isAnomalous({ orgL4: '' })).toBe(true)
    expect(isAnomalous({ orgL4: '   ' })).toBe(true)
    expect(isAnomalous({ orgL4: undefined as unknown as string })).toBe(true)
  })
  it('orgL4 非空不判异常', () => {
    expect(isAnomalous({ orgL4: '交付一组' })).toBe(false)
  })
})

describe('anomalyRows（治理明细行）', () => {
  it('仅列 orgL4 空项目，带 projectId/projectName/reason', () => {
    const ps = [
      { projectId: 'WSGF-SS-202604169018', projectName: '甲', orgL4: '' },
      { projectId: 'P2', projectName: '乙', orgL4: '交付一组' },
      { projectId: 'P3', projectName: '', orgL4: '  ' },
    ]
    const rows = anomalyRows(ps)
    expect(rows.map((r) => r.projectId)).toEqual(['WSGF-SS-202604169018', 'P3'])
    expect(rows[0].reason).toContain('L4')
    expect(rows[1].projectName).toBe('P3') // projectName 空回退 projectId
  })
})
