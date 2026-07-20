import { describe, it, expect } from 'vitest'
import { configToWorkbook, workbookToConfig, assertRulesShape, fillLegacyDefaults,
         DEFAULT_SERVICE_MODE_KEYWORDS, type YitianRulesConfig } from './rulesConfig'

const CFG: YitianRulesConfig = {
  version: 1,
  checkedTypes: ['项目类', '售前类', '售后类'],
  checks: {
    summary: { enabled: true, keywords: ['工作概述', '工作总结'] },
    progress: { enabled: false, keywords: ['工作进展'] },
    next: { enabled: true, keywords: ['下一步'] },
    serviceMode: { enabled: true, keywords: ['服务方式', '服务形式'], effectiveDate: '2026-05-09' },
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

  it('assertRulesShape 对合法配置放行、对缺关键嵌套键的结构抛错(防导入即崩)', () => {
    expect(() => assertRulesShape(CFG)).not.toThrow()
    expect(() => assertRulesShape({ foo: 'bar' })).toThrow()
    expect(() => assertRulesShape({ checkedTypes: [], checks: { summary: { enabled: true } } })).toThrow()  // 缺其余段
    expect(() => assertRulesShape(null)).toThrow()
  })
})


// ── V4.0.4:服务方式改按正文关键词判定,配置多出 keywords ─────────────────
//
// 这里锁的是【向后兼容】:用户手上还存着 V4.0.3 及以前导出的 JSON/Excel,
// 导入时不能崩、也不能静默把关键词丢成空(空关键词 = 该项不检查 = 规则静默失效)。

describe('V4.0.4 服务方式关键词', () => {
  it('往返保留服务方式关键词', () => {
    const wb = configToWorkbook(CFG)
    const back = workbookToConfig(wb)
    expect(back.checks.serviceMode.keywords).toEqual(CFG.checks.serviceMode.keywords)
    expect(back.checks.serviceMode.effectiveDate).toBe(CFG.checks.serviceMode.effectiveDate)
  })

  it('导入旧版 JSON(无 keywords)补默认值而不是被拒', () => {
    const legacy = JSON.parse(JSON.stringify(CFG))
    delete legacy.checks.serviceMode.keywords          // 模拟 V4.0.3 及以前导出的文件
    const filled = fillLegacyDefaults(legacy) as typeof CFG
    expect(filled.checks.serviceMode.keywords).toEqual(DEFAULT_SERVICE_MODE_KEYWORDS)
    expect(() => assertRulesShape(filled)).not.toThrow()
  })

  it('导入旧版 Excel(sheet 叫「必填三段」)仍能读到必填关键词', () => {
    // 造一份旧结构工作簿:sheet 名是旧的,且没有服务方式那一行
    const wb = configToWorkbook(CFG)
    const idx = wb.SheetNames.indexOf('必填四段')
    expect(idx).toBeGreaterThanOrEqual(0)
    wb.SheetNames[idx] = '必填三段'
    wb.Sheets['必填三段'] = wb.Sheets['必填四段']
    delete wb.Sheets['必填四段']
    const back = workbookToConfig(wb)
    expect(back.checks.summary.keywords).toEqual(CFG.checks.summary.keywords)   // 不能静默丢
    expect(back.checks.serviceMode.keywords.length).toBeGreaterThan(0)          // 缺行时补默认
  })

  it('前端默认关键词与后端 yitian_rules.SERVICE_MODE_RE 逐项一致', async () => {
    // 跨语言副本只能靠真读源码锁 —— 抄字面量自证等于假绿(V4.0.0 的教训)
    const fs = await import('node:fs')
    const src = fs.readFileSync('../yitian_rules.py', 'utf-8')
    const m = src.match(/SERVICE_MODE_RE\s*=\s*r"\(([^)]+)\)"/)
    expect(m).toBeTruthy()
    expect(m![1].split('|')).toEqual(DEFAULT_SERVICE_MODE_KEYWORDS)
  })
})
