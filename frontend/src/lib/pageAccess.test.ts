import { describe, it, expect } from 'vitest'
import { canAccess } from './pageAccess'
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
  it('KEY_FOLLOWUP_LINKS = [重点项目进展, 临时重点跟进]', () => {
    const keys = KEY_FOLLOWUP_LINKS.map((l) => l.key)
    expect(keys).toEqual(['projects-key', 'temp-followup'])
    const temp = KEY_FOLLOWUP_LINKS.find((l) => l.key === 'temp-followup')!
    expect(temp.to).toBe('/projects/temp')
    expect(temp.label).toBe('临时重点跟进')
  })
  it('商机清单(opportunities-progress)移入 PROJECT_LINKS,在已关闭项目后、项目动态前', () => {
    const keys = PROJECT_LINKS.map((l) => l.key)
    expect(keys.indexOf('opportunities-progress')).toBe(keys.indexOf('projects-closed') + 1)
    expect(keys.indexOf('activity')).toBe(keys.indexOf('opportunities-progress') + 1)
    const opp = PROJECT_LINKS.find((l) => l.key === 'opportunities-progress')!
    expect(opp.label).toBe('商机清单')
  })
})
