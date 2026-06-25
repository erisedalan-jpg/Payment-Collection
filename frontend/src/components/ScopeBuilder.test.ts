import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ElementPlus from 'element-plus'
import ScopeBuilder from './ScopeBuilder.vue'
import type { ScopeProjectInput, ScopeFilter } from '@/lib/tempScope'

const inputs: ScopeProjectInput[] = [
  { id: 'P1', proj: { orgL4: '银行服务组' }, nodes: [], milestones: [] },
  { id: 'P2', proj: { orgL4: '小金融服务组' }, nodes: [], milestones: [] },
]

function mountIt(initial: ScopeFilter) {
  return mount(ScopeBuilder, {
    props: { modelValue: true, inputs, initial },
    global: { plugins: [ElementPlus], stubs: { teleport: true } },
  })
}

describe('ScopeBuilder', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('addGroup/addCondition 改 draft 结构', async () => {
    const w = mountIt({ combinator: 'AND', groups: [] })
    ;(w.vm as any).addGroup()
    expect((w.vm as any).draft.groups).toHaveLength(1)
    ;(w.vm as any).addCondition(0)
    expect((w.vm as any).draft.groups[0].conditions).toHaveLength(1)
  })

  it('命中数随条件变化', async () => {
    const w = mountIt({ combinator: 'AND', groups: [
      { combinator: 'AND', conditions: [{ group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] }] },
    ] })
    expect((w.vm as any).matchCount).toBe(1)
  })

  it('保存 emit save 携带 draft', async () => {
    const init: ScopeFilter = { combinator: 'OR', groups: [
      { combinator: 'AND', conditions: [{ group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] }] },
    ] }
    const w = mountIt(init)
    ;(w.vm as any).onSave()
    const ev = w.emitted('save')
    expect(ev).toBeTruthy()
    expect((ev![0][0] as ScopeFilter).combinator).toBe('OR')
  })
})
