import { describe, it, expect } from 'vitest'
import { aggregateRate } from './paymentRate'

// 达成率聚合的口径契约。守的是 2026-09-01 目验逮到的那个缺陷:
// 分子把「有流水但没合同」的项目算了进去,分母给它们记 0 —— 两个总和不是同一批项目。

const P = (contract: number | null, actual: number) => ({ contract, actual })
const agg = (rows: { contract: number | null; actual: number }[]) =>
  aggregateRate(rows, (r) => r.contract, (r) => r.actual)

describe('aggregateRate', () => {
  it('★ 合同缺失的项目:流水不计入分子,项目不计入分母', () => {
    // 生产实测的缩影:6 个售前项目有流水 136.68 万却没有合同。
    // 改前 (100+30)/100 = 130%,改后 100/100 = 100%。
    const r = agg([P(100, 100), P(null, 30)])
    expect(r.actualSum).toBe(100)
    expect(r.contractSum).toBe(100)
    expect(r.rate).toBe(1)
    expect(r.ratedCount).toBe(1)
    expect(r.excludedCount).toBe(1)
  })

  it('合同为 0 与合同缺失同等对待', () => {
    const r = agg([P(100, 50), P(0, 40)])
    expect(r.actualSum).toBe(50)
    expect(r.rate).toBe(0.5)
    expect(r.excludedCount).toBe(1)
  })

  it('合同为负同样排除(PMIS 导出脏值)', () => {
    const r = agg([P(100, 50), P(-500, 20)])
    expect(r.contractSum).toBe(100)
    expect(r.actualSum).toBe(50)
  })

  it('流水为负(红冲)必须【照加】—— 那是真实的资金流出', () => {
    // CLAUDE.md:分子逐笔严格全加,含负值/红冲,不取绝对值。
    // 排除的只有「没有合同」,不是「金额为负」。
    const r = agg([P(100, 80), P(100, -30)])
    expect(r.actualSum).toBe(50)
    expect(r.rate).toBe(0.25)
  })

  it('无任何有效合同 → rate 为 null,不是 0', () => {
    // 0 会被读成「一分没收」,null 前端显 '-' —— 两者含义完全不同。
    const r = agg([P(null, 999), P(0, 1)])
    expect(r.rate).toBeNull()
    expect(r.actualSum).toBe(0)
    expect(r.ratedCount).toBe(0)
  })

  it('空输入不炸', () => {
    const r = agg([])
    expect(r.rate).toBeNull()
    expect(r.contractSum).toBe(0)
  })

  it('NaN 合同按排除处理,不污染合计', () => {
    const r = agg([P(100, 50), P(Number.NaN as unknown as number, 10)])
    expect(r.contractSum).toBe(100)
    expect(r.actualSum).toBe(50)
    expect(Number.isNaN(r.contractSum)).toBe(false)
  })

  it('undefined 流水按 0 计(有合同、还没收钱)', () => {
    const r = aggregateRate([{ c: 100, a: undefined }], (x) => x.c, (x) => x.a)
    expect(r.actualSum).toBe(0)
    expect(r.rate).toBe(0)
    expect(r.ratedCount).toBe(1)
  })

  it('★ 复现生产数字:剔除 6 个无合同项目后 47.85% → 47.56%', () => {
    // 用真实量级,防「小数字下两种口径恰好都对」的假绿。
    const rows = [
      { contract: 474_932_828.49, actual: 225_871_290.36 },   // 624 个有合同项目的合计
      { contract: null, actual: 1_366_753.25 },               // 6 个无合同项目的流水
    ]
    const r = agg(rows)
    expect(r.rate).toBeCloseTo(0.4756, 4)
    // 旧口径(分子全加、分母记 0)会是 47.85% —— 钉住两者确实不同,否则这条测了个寂寞
    const oldRate = (225_871_290.36 + 1_366_753.25) / 474_932_828.49
    expect(oldRate).toBeCloseTo(0.4785, 4)
    expect(r.rate).not.toBeCloseTo(oldRate, 4)
  })
})
