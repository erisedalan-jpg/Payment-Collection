import { describe, it, expect } from 'vitest'
import { PROJECT_DOMAIN_COLUMNS, BORROWABLE_KEYS } from './projectList'
import { RISK_KEY_MAP, buildRiskRows } from './riskRows'
import { buildTempRows } from './tempFollowup'
import { buildPaymentKeyRows } from './paymentKeyFollowup'
import { buildKeyProjectRows } from './keyProjects'

const DOMAIN_KEYS = PROJECT_DOMAIN_COLUMNS.map((c) => c.key)
const BORROWABLE = BORROWABLE_KEYS
const MS = { C1: [{ name: '项目关闭', planDate: '2026-08-01', actualDate: '2026-08-20' }] } as any
const P = [{ projectId: 'C1', projectName: 'C', top1000: '是',
  paymentPmis: { contract: 2_000_000 } } as any]
const PMIS = { C1: { status: { 项目级别: 'P1' }, riskRecords: [{ 风险编码: 'RK-1' }] } } as any

// ① 映射完备：双向严格相等
describe('契约① RISK_KEY_MAP 与 PROJECT_DOMAIN_COLUMNS 键集严格相等', () => {
  it('新增/删除 /projects 列时必须同步 RISK_KEY_MAP', () => {
    expect(new Set(Object.keys(RISK_KEY_MAP))).toEqual(new Set(DOMAIN_KEYS))
  })
  it('中文键无重复（映射到同一列会互相覆盖）', () => {
    const zh = Object.values(RISK_KEY_MAP)
    expect(new Set(zh).size).toBe(zh.length)
  })
})

// ② 值可达
// 注意：断言必须查值(row[k] !== undefined)，不能只查键存在(k in row)——
// decorateProjectDomain 对 DOMAIN_KEYS 里的每个 key 都无条件执行 extra[k] = pr[k]，
// 哪怕 ProjectRow 上根本没有该字段(pr[k] 取到 undefined)也会把这个 undefined 值
// 显式赋到行上，使该 key 变成行的自有属性——此时 `k in row` 恒为 true，测不出
// "新增列忘了在 ProjectRow/buildProjectRows 里接真实数据" 这类退化。
// 反向验证实测(临时加 zzTest 列)证实了这一点：旧版 `k in row` 断言在该场景下
// 全部保持绿色，只有换成值校验才会正确变红。见本 Task 的 deviations 记录。
describe('契约② 借入列在行对象上取得到值', () => {
  it('/projects/key', () => {
    const [row] = buildKeyProjectRows(P, PMIS, {}, MS) as any[]
    for (const k of BORROWABLE) expect(row[k]).not.toBeUndefined()
  })
  it('/projects/temp', () => {
    const [row] = buildTempRows(P, PMIS, {}, new Set(['C1']), MS) as any[]
    for (const k of BORROWABLE) expect(row[k]).not.toBeUndefined()
  })
  it('/payment/key', () => {
    const [row] = buildPaymentKeyRows(P, PMIS, {}, new Set(['C1']), MS) as any[]
    for (const k of BORROWABLE) expect(row[k]).not.toBeUndefined()
  })
  it('/risk 行含全部中文键', () => {
    const [row] = buildRiskRows(P, PMIS, {}, MS) as any[]
    for (const zh of Object.values(RISK_KEY_MAP)) expect(row[zh]).not.toBeUndefined()
  })
  it('/risk 行不含任何英文键（写了会各自变成一列）', () => {
    const [row] = buildRiskRows(P, PMIS, {}, MS) as any[]
    for (const en of Object.keys(RISK_KEY_MAP)) {
      if (en === 'projectId') continue   // 既有例外，已在 NON_RISK_KEYS 中
      expect(en in row).toBe(false)
    }
  })
})
