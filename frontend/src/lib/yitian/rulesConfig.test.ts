import { describe, it, expect } from 'vitest'
import { configToWorkbook, workbookToConfig, type YitianRulesConfig } from './rulesConfig'

const CFG: YitianRulesConfig = {
  version: 1,
  checkedTypes: ['项目类', '售前类', '售后类'],
  checks: {
    summary: { enabled: true, keywords: ['工作概述', '工作总结'] },
    progress: { enabled: false, keywords: ['工作进展'] },
    next: { enabled: true, keywords: ['下一步'] },
    serviceMode: { enabled: true, effectiveDate: '2026-05-09' },
    typeMismatch: { enabled: true, rules: { 售前类: [['正式上线', '项目类'], ['投标书', '业务类']] } },
    product: {
      enabled: true,
      lineKeywords: [{ linePatterns: ['NGSOC'], keywords: ['SOC', 'SOAR'] }],
      nameKeywords: [{ namePatterns: ['网神V6.0'], keywords: ['SSLO'] }],
      exclusiveKws: ['组件', '租户'],
    },
    customer: { enabled: true, hintKeywords: ['客户', '甲方'] },
    presaleProductHint: { enabled: false, skipWorkTypes: ['项目管理'] },
  },
}

describe('rulesConfig JSON<->Excel', () => {
  it('configToWorkbook 再 workbookToConfig 无损往返', () => {
    const wb = configToWorkbook(CFG)
    const back = workbookToConfig(wb)
    expect(back).toEqual(CFG)
  })

  it('停用开关经 Excel 往返保持', () => {
    const back = workbookToConfig(configToWorkbook(CFG))
    expect(back.checks.progress.enabled).toBe(false)
    expect(back.checks.presaleProductHint.enabled).toBe(false)
  })
})
