import { describe, it, expect } from 'vitest'
import { inRange, actualInRange, hasActivityInRange, paymentPmisInRange } from './paymentRange'

const N = (planDate: string, exp: number, unpaid: number, status: string, reached = false) =>
  ({ planDate, expectedPayment: exp, unpaidAmount: unpaid, status, reached } as any)
const R = (date: string, amount: number) => ({ date, amount } as any)

describe('inRange', () => {
  it('全部(两端空)恒真,含空日期', () => {
    expect(inRange('', '', '')).toBe(true)
    expect(inRange('2026-03-01', '', '')).toBe(true)
  })
  it('限定区间:空日期排除,界内含端点', () => {
    expect(inRange('', '2026-01-01', '2026-12-31')).toBe(false)
    expect(inRange('2026-01-01', '2026-01-01', '2026-12-31')).toBe(true)
    expect(inRange('2026-12-31', '2026-01-01', '2026-12-31')).toBe(true)
    expect(inRange('2025-12-31', '2026-01-01', '2026-12-31')).toBe(false)
  })
  it('单端开放', () => {
    expect(inRange('2026-05-01', '2026-03-01', '')).toBe(true)
    expect(inRange('2026-02-01', '2026-03-01', '')).toBe(false)
    expect(inRange('2026-02-01', '', '2026-03-01')).toBe(true)
  })
})

describe('actualInRange', () => {
  it('按到账日窗求和;undefined→0', () => {
    expect(actualInRange(undefined, '', '')).toBe(0)
    const recs = [R('2026-02-10', 100), R('2026-05-10', 200), R('', 50)]
    expect(actualInRange(recs, '', '')).toBe(350)                       // 全部含空日期? 空日期 amount 计入全部
    expect(actualInRange(recs, '2026-01-01', '2026-03-31')).toBe(100)  // 仅 2/10
  })
})

describe('paymentPmisInRange', () => {
  const nodes = [N('2026-02-01', 1000, 1000, '延期'), N('2026-05-01', 500, 0, '已回款', true), N('2025-12-01', 300, 300, '待回款')]
  const recs = [R('2026-02-10', 400), R('2025-11-01', 100)]
  it('区间聚合(计划日筛节点,到账日筛流水)', () => {
    const r = paymentPmisInRange(2000, nodes, recs, '2026-01-01', '2026-12-31')
    expect(r.expectedTotal).toBe(1500)   // 1000+500(2025的300排除)
    expect(r.remainingTotal).toBe(1000)  // 1000+0
    expect(r.nodeCount).toBe(2)
    expect(r.reachedCount).toBe(1)
    expect(r.delayedCount).toBe(1)
    expect(r.actualTotal).toBe(400)      // 仅2/10(2025/11排除)
    expect(r.contract).toBe(2000)
    // 分母改为合同总额 contract=2000，不再是计划 expectedTotal=1500
    expect(r.paymentRatio).toBeCloseTo(400 / 2000, 4)
  })
  it('全部≡全量(不变式):expected=Σ全节点,actual=Σ全流水', () => {
    const r = paymentPmisInRange(2000, nodes, recs, '', '')
    expect(r.expectedTotal).toBe(1800)   // 1000+500+300
    expect(r.actualTotal).toBe(500)      // 400+100
    expect(r.delayedCount).toBe(1)
  })
  it('delayedAmount=Σ延期节点未收(计划日∈R)', () => {
    const ns = [
      N('2026-02-01', 1000, 1000, '延期'),
      N('2026-03-01', 500, 200, '延期'),
      N('2026-04-01', 300, 300, '待回款'),
    ]
    const r = paymentPmisInRange(2000, ns, [], '2026-01-01', '2026-12-31')
    expect(r.delayedAmount).toBe(1200)   // 1000+200(待回款300不计)
  })
  it('全部不变式:delayedAmount=Σ全延期节点未收', () => {
    const ns = [N('2026-02-01', 1000, 1000, '延期'), N('2025-12-01', 500, 500, '延期')]
    expect(paymentPmisInRange(0, ns, [], '', '').delayedAmount).toBe(1500)
  })
})

describe('hasActivityInRange', () => {
  it('节点计划日或流水到账日落区间即真', () => {
    expect(hasActivityInRange([N('2026-02-01', 1, 1, '待回款')], [], '2026-01-01', '2026-12-31')).toBe(true)
    expect(hasActivityInRange([], [R('2026-02-10', 1)], '2026-01-01', '2026-12-31')).toBe(true)
    expect(hasActivityInRange([N('2025-01-01', 1, 1, '待回款')], [R('2025-01-01', 1)], '2026-01-01', '2026-12-31')).toBe(false)
  })
})
