import { describe, it, expect } from 'vitest'
import { canAccess, PAGE_OPTIONS } from './pageAccess'
import { KEY_FOLLOWUP_LINKS, PROJECT_LINKS } from '@/nav'

describe('pageAccess.canAccess', () => {
  it("'*' 通配可访问任意", () => {
    expect(canAccess(['*'], 'data')).toBe(true)
    expect(canAccess(['*'], 'about')).toBe(true)
  })
  it('命中 key 才可访问', () => {
    expect(canAccess(['data'], 'data')).toBe(true)
    expect(canAccess(['data'], 'about')).toBe(false)
    expect(canAccess([], 'data')).toBe(false)
  })
})

describe('nav links', () => {
  it('KEY_FOLLOWUP_LINKS = [重点项目进展, 重点商机跟进, 临时重点跟进, 风险跟进, 回款重点跟进]', () => {
    const keys = KEY_FOLLOWUP_LINKS.map((l) => l.key)
    expect(keys).toEqual(['projects-key', 'opportunity-followup', 'temp-followup', 'risk-followup', 'payment-key'])
    const oppf = KEY_FOLLOWUP_LINKS.find((l) => l.key === 'opportunity-followup')!
    expect(oppf.to).toBe('/opportunities/key')
    expect(oppf.label).toBe('重点商机跟进')
    const riskf = KEY_FOLLOWUP_LINKS.find((l) => l.key === 'risk-followup')!
    expect(riskf.to).toBe('/risk')
    expect(riskf.label).toBe('风险跟进')
    const paymentf = KEY_FOLLOWUP_LINKS.find((l) => l.key === 'payment-key')!
    expect(paymentf.to).toBe('/payment/key')
    expect(paymentf.label).toBe('回款重点跟进')
  })
  it('商机清单(opportunities-progress)移入 PROJECT_LINKS,在已关闭项目后、项目动态前', () => {
    const keys = PROJECT_LINKS.map((l) => l.key)
    expect(keys.indexOf('opportunities-progress')).toBe(keys.indexOf('projects-closed') + 1)
    expect(keys.indexOf('activity')).toBe(keys.indexOf('opportunities-progress') + 1)
    const opp = PROJECT_LINKS.find((l) => l.key === 'opportunities-progress')!
    expect(opp.label).toBe('商机清单')
  })
})

describe('倚天 pageKey', () => {
  it('五个倚天页面都能被单独授权', () => {
    const keys = ['yitian', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer'] as const
    for (const k of keys) {
      expect(canAccess([k], k)).toBe(true)
      expect(canAccess(['overview'], k)).toBe(false)
      expect(canAccess(['*'], k)).toBe(true)
    }
  })

  it('PAGE_OPTIONS 含倚天五页(账号管理表单能勾到)', () => {
    const keys = PAGE_OPTIONS.map((o) => o.key)
    for (const k of ['yitian', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer']) {
      expect(keys).toContain(k)
    }
  })
})

it('PAGE_OPTIONS 含概算工具(账号管理里必须能勾选,否则谁都授权不了)', () => {
  expect(PAGE_OPTIONS.some((o) => o.key === 'budget' && o.label === '概算工具')).toBe(true)
})
