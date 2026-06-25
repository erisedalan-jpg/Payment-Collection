import { describe, it, expect } from 'vitest'
import { canAccess } from './pageAccess'
import { KEY_FOLLOWUP_LINKS } from '@/nav'

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
  it('KEY_FOLLOWUP_LINKS 含临时重点跟进,在重点商机之后', () => {
    const keys = KEY_FOLLOWUP_LINKS.map((l) => l.key)
    expect(keys).toContain('temp-followup')
    expect(keys.indexOf('temp-followup')).toBe(keys.indexOf('opportunities-progress') + 1)
    const temp = KEY_FOLLOWUP_LINKS.find((l) => l.key === 'temp-followup')!
    expect(temp.to).toBe('/projects/temp')
    expect(temp.label).toBe('临时重点跟进')
  })
})
