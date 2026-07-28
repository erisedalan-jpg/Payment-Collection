import { describe, it, expect } from 'vitest'
import { canAccess, PAGE_KEYS, PAGE_OPTIONS } from './pageAccess'
import { NAV_SECTIONS, sectionPageLinks } from '@/nav'

const keyFollowup = sectionPageLinks(NAV_SECTIONS.find((s) => s.id === 'keyfollowup')!)
const projectSec = sectionPageLinks(NAV_SECTIONS.find((s) => s.id === 'project')!)

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
  it('重点跟进组 = [重点项目进展, 重点商机跟进, 临时重点跟进, 风险跟进, 回款重点跟进]', () => {
    const keys = keyFollowup.map((l) => l.key)
    expect(keys).toEqual(['projects-key', 'opportunity-followup', 'temp-followup', 'risk-followup', 'payment-key'])
    const oppf = keyFollowup.find((l) => l.key === 'opportunity-followup')!
    expect(oppf.to).toBe('/opportunities/key')
    expect(oppf.label).toBe('重点商机跟进')
    const riskf = keyFollowup.find((l) => l.key === 'risk-followup')!
    expect(riskf.to).toBe('/risk')
    expect(riskf.label).toBe('风险跟进')
    const paymentf = keyFollowup.find((l) => l.key === 'payment-key')!
    expect(paymentf.to).toBe('/payment/key')
    expect(paymentf.label).toBe('回款重点跟进')
  })
  it('商机清单已独立成「商机」分组(V4.4.7 从项目组迁出)', () => {
    const opp = sectionPageLinks(NAV_SECTIONS.find((s) => s.id === 'opportunity')!)
    expect(opp.map((l) => l.key)).toEqual(['opportunities-progress', 'opportunities-board'])
    expect(projectSec.map((l) => l.key)).not.toContain('opportunities-progress')
  })
})

describe('倚天 pageKey', () => {
  it('七个倚天页面都能被单独授权', () => {
    const keys = ['yitian', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer', 'yitian-customer-product', 'yitian-governance'] as const
    for (const k of keys) {
      expect(canAccess([k], k)).toBe(true)
      expect(canAccess(['overview'], k)).toBe(false)
      expect(canAccess(['*'], k)).toBe(true)
    }
  })

  it('PAGE_OPTIONS 含倚天七页(账号管理表单能勾到)', () => {
    const keys = PAGE_OPTIONS.map((o) => o.key)
    for (const k of ['yitian', 'yitian-compliance', 'yitian-analytics', 'yitian-trend', 'yitian-customer', 'yitian-customer-product', 'yitian-governance']) {
      expect(keys).toContain(k)
    }
  })
})

it('PAGE_OPTIONS 含概算工具(账号管理里必须能勾选,否则谁都授权不了)', () => {
  expect(PAGE_OPTIONS.some((o) => o.key === 'budget' && o.label === '概算工具')).toBe(true)
})

it('PAGE_OPTIONS 覆盖全部 32 个 PageKey(含 12 个 tab 页),否则超管无法为其授权', () => {
  const keys = PAGE_OPTIONS.filter((o) => o.key !== '*').map((o) => o.key).sort()
  expect(keys).toEqual([...PAGE_KEYS].sort())
})

it('PAGE_OPTIONS 含 tab 页(里程碑管理/回款日历/工时趋势)', () => {
  const keys = PAGE_OPTIONS.map((o) => o.key)
  expect(keys).toContain('insight-milestone')
  expect(keys).toContain('insight-calendar')
  expect(keys).toContain('yitian-trend')
})
