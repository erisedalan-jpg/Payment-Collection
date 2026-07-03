import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ScopeBuilder from './ScopeBuilder.vue'
import { OPP_SCOPE_CATALOG, opportunityMatches, DEFAULT_OPP_SCOPE } from '@/lib/opportunityScope'
import type { ScopeProjectInput } from '@/lib/tempScope'

beforeEach(() => setActivePinia(createPinia()))

function mountSB(props: Record<string, any>) {
  return mount(ScopeBuilder as any, { props: { modelValue: true, ...props }, global: { plugins: [ElementPlus] } })
}

describe('ScopeBuilder 单表模式(商机)', () => {
  const oppRows = [
    { id: 'o1', top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '招投标' },
    { id: 'o2', top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '赢单' },
    { id: 'o3', top1000: '非TOP1000', earlyIntervene: '否', keyOpp: '否', status: '意向沟通' },
  ]
  it('singleTable=true 时 matchCount 用 matchFn,默认范围命中 1 条', () => {
    const w = mountSB({
      inputs: oppRows, initial: DEFAULT_OPP_SCOPE,
      catalog: OPP_SCOPE_CATALOG, singleTable: true, matchFn: opportunityMatches, countUnit: '商机',
    })
    expect((w.vm as any).SINGLE).toBe(true)
    expect((w.vm as any).matchCount).toBe(1)   // 仅 o1(状态非赢单+三条件齐)
  })
  it('addCondition 在单表模式建无 group 的条件', () => {
    const w = mountSB({
      inputs: oppRows, initial: { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] },
      catalog: OPP_SCOPE_CATALOG, singleTable: true, matchFn: opportunityMatches,
    })
    ;(w.vm as any).addCondition(0)
    const c = (w.vm as any).draft.groups[0].conditions[0]
    expect(c.group).toBeUndefined()
    expect(typeof c.field).toBe('string')
  })
})

describe('ScopeBuilder 默认(temp 三子表)行为不回归', () => {
  const inp = (over: Partial<ScopeProjectInput>): ScopeProjectInput => ({ id: 'P', proj: {}, nodes: [], milestones: [], ...over })
  it('不传新 prop → 多表模式,addCondition 建 project/orgL4 条件', () => {
    const w = mountSB({
      inputs: [inp({ proj: { orgL4: '银行服务组' } })],
      initial: { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] },
    })
    expect((w.vm as any).SINGLE).toBe(false)
    ;(w.vm as any).addCondition(0)
    const c = (w.vm as any).draft.groups[0].conditions[0]
    expect(c.group).toBe('project')
    expect(c.field).toBe('orgL4')
  })
  it('onSave 触发后 emit save 事件且携带当前 draft', () => {
    const initial = { combinator: 'AND' as const, groups: [{ combinator: 'AND' as const, conditions: [] }] }
    const w = mountSB({
      inputs: [inp({ proj: { orgL4: '银行服务组' } })],
      initial,
    })
    ;(w.vm as any).onSave()
    const emitted = w.emitted('save')
    expect(emitted).toBeTruthy()
    expect(emitted!.length).toBe(1)
    const payload = emitted![0][0] as any
    expect(payload.combinator).toBe('AND')
    expect(Array.isArray(payload.groups)).toBe(true)
  })
  it('onSave 导出的 scope 不含内部渲染用的 _uid 字段(不混入保存数据)', () => {
    const initial = { combinator: 'AND' as const, groups: [{ combinator: 'AND' as const, conditions: [] }] }
    const w = mountSB({ inputs: [inp({ proj: { orgL4: '银行服务组' } })], initial })
    ;(w.vm as any).addCondition(0)
    ;(w.vm as any).addGroup()
    ;(w.vm as any).onSave()
    const payload = w.emitted('save')![0][0] as any
    expect(JSON.stringify(payload)).not.toContain('_uid')
    for (const g of payload.groups) {
      expect(g._uid).toBeUndefined()
      for (const c of g.conditions) expect(c._uid).toBeUndefined()
    }
  })
})

describe('ScopeBuilder group/condition 稳定 uid(v-for key,防 splice 后错位)', () => {
  const inp = (over: Partial<ScopeProjectInput>): ScopeProjectInput => ({ id: 'P', proj: {}, nodes: [], milestones: [], ...over })

  it('addGroup 两次后各组 _uid 唯一;removeGroup(0) 后剩余组 _uid 保持不变', () => {
    const w = mountSB({ inputs: [inp({})], initial: { combinator: 'AND', groups: [] } })
    ;(w.vm as any).addGroup()
    ;(w.vm as any).addGroup()
    const draft = (w.vm as any).draft
    expect(draft.groups.length).toBe(2)
    const uid0 = draft.groups[0]._uid
    const uid1 = draft.groups[1]._uid
    expect(uid0).toBeDefined()
    expect(uid1).toBeDefined()
    expect(uid0).not.toBe(uid1)
    ;(w.vm as any).removeGroup(0)
    expect(draft.groups.length).toBe(1)
    // splice 后剩下的组还是原来那个对象(uid 未因数组重排而改变/重新分配)
    expect(draft.groups[0]._uid).toBe(uid1)
  })

  it('addCondition 两次后各条件 _uid 唯一;removeCondition(0,0) 后剩余条件 _uid 保持不变', () => {
    const w = mountSB({
      inputs: [inp({})],
      initial: { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] },
    })
    ;(w.vm as any).addCondition(0)
    ;(w.vm as any).addCondition(0)
    const draft = (w.vm as any).draft
    const uid0 = draft.groups[0].conditions[0]._uid
    const uid1 = draft.groups[0].conditions[1]._uid
    expect(uid0).toBeDefined()
    expect(uid1).toBeDefined()
    expect(uid0).not.toBe(uid1)
    ;(w.vm as any).removeCondition(0, 0)
    expect(draft.groups[0].conditions.length).toBe(1)
    expect(draft.groups[0].conditions[0]._uid).toBe(uid1)
  })
})
