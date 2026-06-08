import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalNodeTable from './CalNodeTable.vue'
import { useProjectDetailStore } from '@/stores/projectDetail'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

const NODES = [
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三', nodeStatus: '延期', milestone: 'M1', planDate: '2026-06-10', expectedPayment: 200000, actualPayment: 50000, actualPaymentRatio: 0.25, projectAmount: 1000000 },
]

describe('CalNodeTable', () => {
  it('渲染 13 列表头 + 行 + 记录数', () => {
    const w = mount(CalNodeTable, { props: { nodes: NODES } })
    expect(w.findAll('thead th')).toHaveLength(13)
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('M1')
    expect(w.text()).toContain('共 1 条记录')
    expect(w.text()).toContain('150,000')
  })

  it('maxShow 限制行数但记录数显示全部', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ projectId: 'P' + i, planDate: '2026-06-10' }))
    const w = mount(CalNodeTable, { props: { nodes: many, maxShow: 2 } })
    expect(w.findAll('tbody tr')).toHaveLength(2)
    expect(w.text()).toContain('共 5 条记录')
  })

  it('点击行唤起项目详情面板', async () => {
    const w = mount(CalNodeTable, { props: { nodes: NODES } })
    await w.find('.cnt-row').trigger('click')
    expect(useProjectDetailStore().openId).toBe('P1')
  })
})
