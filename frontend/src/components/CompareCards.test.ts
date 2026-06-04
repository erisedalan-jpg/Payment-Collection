import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CompareCards from './CompareCards.vue'
import type { CompareTierStat } from '@/lib/compare'

const stats: CompareTierStat[] = [
  {
    tier: '100万以上',
    projectCount: 3,
    totalAmountWan: 500,
    remainingAmountWan: 200,
    actualAmountWan: 300,
    expectedAmountWan: 500,
    completionRate: 0.6,
    delayRate: 0.2,
  },
  {
    tier: '50-100万',
    projectCount: 2,
    totalAmountWan: 150,
    remainingAmountWan: 60,
    actualAmountWan: 90,
    expectedAmountWan: 150,
    completionRate: 0.6,
    delayRate: 0.05,
  },
  {
    tier: '50万以下',
    projectCount: 0,
    totalAmountWan: 0,
    remainingAmountWan: 0,
    actualAmountWan: 0,
    expectedAmountWan: 0,
    completionRate: 0,
    delayRate: 0,
  },
]

describe('CompareCards', () => {
  it('渲染三张卡片，标题为档位名', () => {
    const w = mount(CompareCards, { props: { stats } })
    const cards = w.findAll('.cmp-card')
    expect(cards.length).toBe(3)
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('50-100万')
    expect(w.text()).toContain('50万以下')
  })

  it('展示项目数/计划金额/待回款/完成率/延期率', () => {
    const w = mount(CompareCards, { props: { stats } })
    const t = w.text()
    expect(t).toContain('项目数')
    expect(t).toContain('计划回款总金额(万)')
    expect(t).toContain('待回款总金额(万)')
    expect(t).toContain('完成率')
    expect(t).toContain('延期率')
    expect(t).toContain('60%') // completionRate 0.6 → 60%
  })
})
