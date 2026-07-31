import { describe, it, expect } from 'vitest'
import { HANDLE_DOMAINS, HANDLE_FIELDS, needsInstance, needsRiskCode, riskChoices, canHandle,
         scopeUnset, handleVisibility } from './lanxinInbox'
import type { ScopeFilter, ScopeProjectInput } from './tempScope'
import { buildRiskRows } from './riskRows'

describe('lanxinInbox', () => {
  it('四个归入目标域与后端一致', () => {
    expect(HANDLE_DOMAINS.map((d) => d.value).sort())
      .toEqual(['payment_key', 'progress', 'risk', 'temp'])
  })

  it('只有 temp 域需要选实例', () => {
    expect(needsInstance('temp')).toBe(true)
    expect(needsInstance('risk')).toBe(false)
    expect(needsInstance('progress')).toBe(false)
  })

  it('已归入的条目不可再次归入', () => {
    expect(canHandle({ handled: true, status: 'parsed' } as never)).toBe(false)
  })

  it('未解析的条目不可归入', () => {
    // 看不懂的东西不许往业务数据里写
    expect(canHandle({ handled: false, status: 'unparsed' } as never)).toBe(false)
  })

  it('已解析且未归入的条目可归入', () => {
    expect(canHandle({ handled: false, status: 'parsed' } as never)).toBe(true)
  })
})

// ── C-1 回归：risk 是四域里唯一按复合键索引的域 ──────────────────────────────

describe('lanxinInbox / risk 复合键', () => {
  const PMIS = {
    P001: { riskRecords: [
      { 风险编码: 'R-7', 风险名称: '验收延期', 风险等级: '高', 风险状态: '未关闭' },
      { 风险编码: 'R-8', 风险名称: '预算超支', 风险等级: '中', 风险状态: '已关闭' },
      { 风险编码: '', 风险名称: '没有编码的记录' },        // 拼不出 key，必须跳过
      { 风险编码: 'R-7', 风险名称: '重复编码' },            // 去重
    ] },
    P002: { riskRecords: [] },
  }

  it('只有 risk 域需要选风险记录', () => {
    expect(needsRiskCode('risk')).toBe(true)
    for (const d of ['temp', 'progress', 'payment_key']) {
      expect(needsRiskCode(d)).toBe(false)
    }
  })

  it('列出该项目的风险记录，跳过无编码项并去重', () => {
    expect(riskChoices(PMIS, 'P001').map((r) => r.code)).toEqual(['R-7', 'R-8'])
  })

  it('标签带上风险名称与等级/状态，便于超管辨认', () => {
    const [first] = riskChoices(PMIS, 'P001')
    expect(first.label).toContain('R-7')
    expect(first.label).toContain('验收延期')
    expect(first.label).toContain('高')
  })

  it('无风险记录或项目不存在时返回空数组，不抛错', () => {
    expect(riskChoices(PMIS, 'P002')).toEqual([])
    expect(riskChoices(PMIS, '不存在')).toEqual([])
    expect(riskChoices({}, 'P001')).toEqual([])
  })

  it('每个可选风险记录拼出的 key，都是风险跟进页真正读取的 key', () => {
    // 这条是整个 C-1 的要害：归入写进去的键，必须正是风险跟进页读得出来的那个键。
    // 两端各写一份拼法，任何一端漂移都不会有编译报错 —— 只有这条断言能发现。
    //
    // 注意是【子集】而非相等：buildRiskRows 不过滤无编码记录也不去重，会产出
    // "P001::" 和重复的 "P001::R-7"；riskChoices 两者都做掉了。这是有意的差异 ——
    // 无编码的记录拼不出可辨认的键，不该出现在归入下拉里。要守的不变量是
    // 「凡是能选来写入的，都必须读得出来」，反向不必成立。
    const projects = [{ projectId: 'P001', projectName: '项目一' }] as never
    const rowKeys = new Set(buildRiskRows(projects, PMIS as never, {}).map((r) => r.riskKey))
    const choiceKeys = riskChoices(PMIS, 'P001').map((c) => `P001::${c.code}`)

    expect(choiceKeys).toEqual(['P001::R-7', 'P001::R-8'])
    for (const k of choiceKeys) {
      expect(rowKeys.has(k)).toBe(true)       // 写得进去 → 一定读得出来
    }
    expect(rowKeys.has('P001')).toBe(false)   // 裸 projectId 绝不是合法的 risk key
  })
})

// ── V4.5.10 归入可见性 ─────────────────────────────────────────────────────
//
// 现网报障「点击归入后在对应位置找不到内容」的根因:归入按 projectId 直接写 store,
// 写入永远成功;但 payment_key/temp 的行集由范围设置决定、progress 的行集只含重点项目。
// 项目不在行集里 → 内容写进去了却永远渲染不出来,而条目已标 handled、按钮转灰。

const IN_SCOPE = {
  id: 'P1',
  proj: { orgL4: '银行服务组' },
} as unknown as ScopeProjectInput

const SCOPE_HITS: ScopeFilter = {
  combinator: 'AND',
  groups: [{ combinator: 'AND',
             conditions: [{ group: 'project', field: 'orgL4', op: 'in',
                            values: ['银行服务组'] }] }],
} as unknown as ScopeFilter

const SCOPE_MISSES: ScopeFilter = {
  combinator: 'AND',
  groups: [{ combinator: 'AND',
             conditions: [{ group: 'project', field: 'orgL4', op: 'in',
                            values: ['别的组'] }] }],
} as unknown as ScopeFilter

describe('scopeUnset', () => {
  it('无 groups / 空组 都算未配置', () => {
    expect(scopeUnset(undefined)).toBe(true)
    expect(scopeUnset({ combinator: 'AND', groups: [] } as ScopeFilter)).toBe(true)
    expect(scopeUnset({ combinator: 'AND',
                        groups: [{ combinator: 'AND', conditions: [] }] } as ScopeFilter)).toBe(true)
  })
  it('配了条件就不算未配置', () => {
    expect(scopeUnset(SCOPE_HITS)).toBe(false)
  })
})

describe('handleVisibility', () => {
  it('risk 域恒可见 —— /risk 无 scope 时展示全部,且另有 riskCode 必填守卫', () => {
    expect(handleVisibility('risk', { projectId: 'P1' }).visible).toBe(true)
  })

  it('progress:非重点项目不可见,且原因要说清判据', () => {
    const v = handleVisibility('progress', { projectId: 'P1', isKeyProject: false })
    expect(v.visible).toBe(false)
    expect(v.reason).toContain('P1')
    expect(v.reason).toContain('重点项目')
    expect(handleVisibility('progress', { projectId: 'P1', isKeyProject: true }).visible).toBe(true)
  })

  it('payment_key:范围命中→可见,不命中→不可见', () => {
    expect(handleVisibility('payment_key',
      { projectId: 'P1', scopeInput: IN_SCOPE, paymentKeyScope: SCOPE_HITS }).visible).toBe(true)
    expect(handleVisibility('payment_key',
      { projectId: 'P1', scopeInput: IN_SCOPE, paymentKeyScope: SCOPE_MISSES }).visible).toBe(false)
  })

  it('【承重】"范围没配"与"项目不符合范围"必须是两句不同的话', () => {
    // 二者 projectMatches 都返回 false,但对超管是完全不同的两件事:
    // 前者要去把范围建起来(此时该页一行都没有),后者是改范围或换个域。
    // 合并成一句 → 超管拿着"不在范围内"去范围设置里找,却发现里面根本是空的。
    const unset = handleVisibility('payment_key',
      { projectId: 'P1', scopeInput: IN_SCOPE, paymentKeyScope: { combinator: 'AND', groups: [] } as ScopeFilter })
    const miss = handleVisibility('payment_key',
      { projectId: 'P1', scopeInput: IN_SCOPE, paymentKeyScope: SCOPE_MISSES })
    expect(unset.visible).toBe(false)
    expect(miss.visible).toBe(false)
    expect(unset.reason).toContain('尚未设置范围')
    expect(miss.reason).not.toContain('尚未设置范围')
    expect(unset.reason).not.toEqual(miss.reason)
  })

  it('temp:原因里要带上是哪一个实例(多实例下不写清楚等于没说)', () => {
    const v = handleVisibility('temp',
      { projectId: 'P1', scopeInput: IN_SCOPE, tempScope: SCOPE_MISSES, tempInstanceName: 'aaa' })
    expect(v.visible).toBe(false)
    expect(v.reason).toContain('aaa')
  })

  it('temp:还没选实例时不下判断(否则一打开抽屉就先弹一句吓人的告警)', () => {
    expect(handleVisibility('temp',
      { projectId: 'P1', scopeInput: IN_SCOPE, tempScope: undefined }).visible).toBe(true)
  })

  it('未选域 / 未选项目时不下判断', () => {
    expect(handleVisibility('', { projectId: 'P1' }).visible).toBe(true)
    expect(handleVisibility('temp', { projectId: '' }).visible).toBe(true)
  })

  it('范围配了但该项目根本没有 scopeInput → 不可见(不能当成命中放行)', () => {
    const v = handleVisibility('payment_key',
      { projectId: 'P9', scopeInput: undefined, paymentKeyScope: SCOPE_HITS })
    expect(v.visible).toBe(false)
  })
})

describe('HANDLE_FIELDS', () => {
  it('四个域都有字段定义,且 label 与目标页表头逐字一致', () => {
    expect(Object.keys(HANDLE_FIELDS).sort()).toEqual(['payment_key', 'progress', 'risk', 'temp'])
    expect(HANDLE_FIELDS.risk.label).toBe('跟进动作')
    expect(HANDLE_FIELDS.temp.label).toBe('本周工作进展')
  })
})
