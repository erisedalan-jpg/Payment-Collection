import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PmRankingTable from './PmRankingTable.vue'

const rows = [
  { name: '张', projectCount: 2, totalAmount: 1000000, actualPayment: 300000, expectedPayment: 600000, remaining: 300000, rate: 0.5, delayedCount: 1 },
  { name: '李', projectCount: 1, totalAmount: 500000, actualPayment: 500000, expectedPayment: 500000, remaining: 0, rate: 1, delayedCount: 0 },
]

describe('PmRankingTable', () => {
  it('渲染表头/行/排名/记录数', () => {
    const w = mount(PmRankingTable, { props: { rows, expanded: '' } })
    expect(w.text()).toContain('项目经理')
    expect(w.text()).toContain('张')
    expect(w.text()).toContain('共 2 位项目经理')
    expect(w.findAll('.pm-row')).toHaveLength(2)
    expect(w.findAll('.pm-row')[0].text()).toContain('1')
  })
  it('点击行 emit select(name)', async () => {
    const w = mount(PmRankingTable, { props: { rows, expanded: '' } })
    await w.findAll('.pm-row')[1].trigger('click')
    expect(w.emitted('select')?.[0]).toEqual(['李'])
  })
})
