import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PAGE_DOMAINS, effectiveScope, narrowProjects, narrowYitian, narrowOpportunities } from './pageScope'
import type { AuthUser } from './auth'

const U = (o: Partial<AuthUser>): AuthUser =>
  ({ account: 'u', displayName: 'u', isSuper: false, allowedPages: ['*'], allowedL4: [], ...o })

describe('effectiveScope 三层', () => {
  it('页 > 域 > 默认', () => {
    const u = U({ allowedL4: ['D0'], domainScopes: { project: { l4: ['Ddom'], staff: [] } },
                  pageScopes: { 'temp-followup': { l4: ['Dpage'], staff: [] } } })
    expect(effectiveScope(u, 'temp-followup')).toEqual({ l4: ['Dpage'], staff: [] })
    expect(effectiveScope(u, 'projects')).toEqual({ l4: ['Ddom'], staff: [] })
    expect(effectiveScope(u, 'yitian')).toEqual({ l4: ['D0'], staff: [] })
  })
  it('显式空覆盖', () => {
    const u = U({ allowedL4: ['*'], pageScopes: { projects: { l4: [], staff: [] } } })
    expect(effectiveScope(u, 'projects')).toEqual({ l4: [], staff: [] })
    expect(effectiveScope(u, 'overview')).toEqual({ l4: ['*'], staff: [] })
  })
})

describe('narrowProjects', () => {
  const data = { projects: [
    { projectId: 'P1', orgL4: 'D1', projectManager: '张三' },
    { projectId: 'P2', orgL4: 'D2', projectManager: '李四' }],
    projectPmis: { P1: {}, P2: {} }, paymentNodes: { P1: [{}], P2: [{}] } } as never
  it("'*' 原样", () => {
    expect(narrowProjects(data, { l4: ['*'], staff: [] }, {}).projects.length).toBe(2)
  })
  it('按 L4', () => {
    const out = narrowProjects(data, { l4: ['D1'], staff: [] }, {})
    expect(out.projects.map((p: { projectId: string }) => p.projectId)).toEqual(['P1'])
    expect(Object.keys(out.paymentNodes)).toEqual(['P1'])
  })
  it('按项目经理姓名(经 staffNames 解析)', () => {
    const out = narrowProjects(data, { l4: [], staff: ['E_LI'] }, { E_LI: '李四' })
    expect(out.projects.map((p: { projectId: string }) => p.projectId)).toEqual(['P2'])
  })
})

describe('narrowYitian / narrowOpportunities', () => {
  it('yitian 按 L4∪工号,issues.i 重映射', () => {
    const y = { roster: [{ id: 'A1', l4: 'D1' }, { id: 'B1', l4: 'D2' }],
      entries: [{ e: 'B1' }, { e: 'A1' }], issues: [{ i: 0 }, { i: 1 }] } as never
    const out = narrowYitian(y, { l4: ['D1'], staff: [] })
    expect(out.roster.map((r: { id: string }) => r.id)).toEqual(['A1'])
    expect(out.entries.map((e: { e: string }) => e.e)).toEqual(['A1'])
    expect(out.issues).toEqual([{ i: 0 }])
  })
  it('opportunities 按 L4', () => {
    const rows = [{ id: '1', l4: 'D1' }, { id: '2', l4: 'D2' }]
    expect(narrowOpportunities(rows, { l4: ['D2'], staff: [] }).map((r) => r.id)).toEqual(['2'])
  })
})

it('PAGE_DOMAINS 与后端 config.py 一致(跨语言同步)', () => {
  const py = readFileSync(resolve(__dirname, '../../../config.py'), 'utf-8')
  const block = py.slice(py.indexOf('PAGE_DOMAINS = {'), py.indexOf('DOMAIN_PAGES'))
  const pyMap: Record<string, string> = {}
  for (const m of block.matchAll(/'([a-z-]+)':\s*'(project|yitian|opportunity)'/g)) pyMap[m[1]] = m[2]
  expect(PAGE_DOMAINS).toEqual(pyMap)
})
