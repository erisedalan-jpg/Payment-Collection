import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FuNodeTable from './FuNodeTable.vue'

describe('FuNodeTable', () => {
  it('渲染 9 列，过滤已满额节点', () => {
    const nodes = [
      { nodeName: 'N1', planDate: '2026-06-10', planPaymentRatio: 0.5, actualPaymentRatio: 0.2, nodeStatus: '延期', blocker: '审批', blockerOwner: '财务', nextAction: '催办', nextActionDate: '2026-06-12' },
      { nodeName: 'N2', actualPaymentRatio: 1 },
    ]
    const w = mount(FuNodeTable, { props: { nodes } })
    expect(w.findAll('thead th')).toHaveLength(9)
    expect(w.findAll('tbody tr')).toHaveLength(1)
    expect(w.text()).toContain('N1')
    expect(w.text()).toContain('催办')
  })
  it('无待跟进节点显示提示', () => {
    const w = mount(FuNodeTable, { props: { nodes: [{ actualPaymentRatio: 1 }] } })
    expect(w.text()).toContain('暂无待跟进节点')
  })
})
