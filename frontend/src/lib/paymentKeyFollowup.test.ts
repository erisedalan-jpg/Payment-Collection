import { describe, it, expect } from 'vitest'
import { buildPaymentKeyRows, payFollowDate, payFollowBy, buildScopeInputs, type PaymentKeyRecord } from './paymentKeyFollowup'
import type { Project, ProjectPmis } from '@/types/analysis'

const proj = (over: Partial<Project>): Project => ({
  projectId: 'P1', projectName: '项目甲', projectManager: '张三', orgL4: '银行服务组',
  top1000: '是', paymentPmis: { contract: 2_000_000 } as any, payment: { paymentRatio: 0.4 } as any,
  quadrant: 'A', ...over,
} as any)

const pmis = (): Record<string, ProjectPmis> => ({
  P1: {
    status: { 项目级别: 'P1', 项目类型: '实施', 项目状态: '进行中', 是否暂停: false },
    progress: { 项目阶段: '执行', 完工进展: 0.5, 里程碑进度状态: '正常', 终验时间: '2026-09-01' },
    risk: { 最高等级: '中', 未关闭风险数: 2 }, cost: { 消耗比: 0.6, 项目超支: false },
    customer: { 最终客户: '客户甲', 合同总额: 200 }, team: { AR: 'arX', SR: 'srY' },
  } as any,
})

describe('buildPaymentKeyRows', () => {
  it('按 inScopeIds 过滤,带项目列+跟进三字段', () => {
    const ps = [proj({}), proj({ projectId: 'P2', projectName: '项目乙', orgL4: '小金融服务组' })]
    const m = { ...pmis(), P2: pmis().P1 }
    const current: Record<string, PaymentKeyRecord> = {
      P1: {
        followAction: '已电话沟通', followActionEditTime: '2026-06-20 10:00:00', followActionEditBy: '张三',
        revConclusion: '风险可控', revConclusionEditTime: '2026-06-25 09:00:00', revConclusionEditBy: '李四',
        nextRevDate: '2026-07-10', nextRevDateEditTime: '2026-06-18 08:00:00', nextRevDateEditBy: '张三',
      },
    }
    const rows = buildPaymentKeyRows(ps, m as any, current, new Set(['P1']))

    expect(rows.map((r) => r.projectId)).toEqual(['P1'])
    const r = rows[0]
    expect(r.projectId).toBe('P1')
    expect(r.projectName).toBe('项目甲')
    expect(r.projectManager).toBe('张三')
    expect(r.orgL4).toBe('银行服务组')
    expect(r.projectLevel).toBe('P1')
    expect(r.contractWan).toBe(200) // 2_000_000 / 10000
    expect(r.paymentRatio).toBe(0.4)
    expect(r.paymentStatus).toBeDefined()
    expect(r.followAction).toBe('已电话沟通')
    expect(r.revConclusion).toBe('风险可控')
    expect(r.nextRevDate).toBe('2026-07-10')
    // payFollowDate = 三字段 EditTime 里最新(字符串排序, revConclusionEditTime 06-25 最大)
    expect(r.followDate).toBe('2026-06-25 09:00:00')
    // payFollowBy = 去重编辑人拼接(张三 出现两次去重)
    expect(r.followBy).toBe('张三、李四')
  })

  it('不在 inScopeIds 的项目不出现在结果中', () => {
    const ps = [proj({}), proj({ projectId: 'P2', projectName: '项目乙' })]
    const m = { ...pmis(), P2: pmis().P1 }
    const rows = buildPaymentKeyRows(ps, m as any, {}, new Set(['P2']))
    expect(rows.map((r) => r.projectId)).toEqual(['P2'])
  })

  it('current 中无记录时跟进三字段为空串,不抛错', () => {
    const ps = [proj({})]
    const m = pmis()
    const rows = buildPaymentKeyRows(ps, m as any, {}, new Set(['P1']))
    expect(rows[0].followAction).toBe('')
    expect(rows[0].followDate).toBe('')
    expect(rows[0].followBy).toBe('')
  })
})

describe('payFollowDate / payFollowBy', () => {
  it('payFollowDate 取三字段 EditTime 里最新(字符串排序)', () => {
    const rec: PaymentKeyRecord = {
      followActionEditTime: '2026-06-20 10:00:00',
      revConclusionEditTime: '2026-06-25 09:00:00',
      nextRevDateEditTime: '2026-06-18 08:00:00',
    }
    expect(payFollowDate(rec)).toBe('2026-06-25 09:00:00')
  })

  it('payFollowBy 去重合并编辑人,忽略空值', () => {
    const rec: PaymentKeyRecord = {
      followActionEditBy: '张三', revConclusionEditBy: '李四', nextRevDateEditBy: '张三',
    }
    expect(payFollowBy(rec)).toBe('张三、李四')
  })

  it('全空记录返回空串', () => {
    expect(payFollowDate({})).toBe('')
    expect(payFollowBy({})).toBe('')
  })
})

describe('buildScopeInputs re-export', () => {
  it('从 ./tempFollowup re-export 且可正常调用', () => {
    const ps = [proj({})]
    const inputs = buildScopeInputs(ps, pmis() as any, {}, {})
    expect(inputs).toHaveLength(1)
    expect(inputs[0].id).toBe('P1')
  })
})
