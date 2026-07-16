import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalNodeTable from './CalNodeTable.vue'

beforeEach(() => setActivePinia(createPinia()))

describe('CalNodeTable(收款阶段口径)', () => {
  it('渲染阶段/状态/未收/已收/服务组', () => {
    const nodes = [{ projectId: 'P1', projectName: '甲', tier: '100万以上', dept: 'A组', projectManager: '张',
      status: '部分回款', stage: '到货款', planDate: '2026-02-10', actualRatio: 0.3,
      expectedPayment: 100000, receivedAmount: 30000, unpaidAmount: 70000 }]
    const w = mount(CalNodeTable, { props: { nodes } })
    const t = w.text()
    expect(t).toContain('到货款')
    expect(t).toContain('部分回款')
    expect(t).toContain('A组')
    expect(t).toContain('共 1 条记录')
  })
})
