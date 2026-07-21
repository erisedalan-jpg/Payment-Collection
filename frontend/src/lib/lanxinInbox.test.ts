import { describe, it, expect } from 'vitest'
import { HANDLE_DOMAINS, needsInstance, needsRiskCode, riskChoices, canHandle } from './lanxinInbox'
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
