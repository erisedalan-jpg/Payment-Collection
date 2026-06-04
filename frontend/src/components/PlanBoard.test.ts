import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import PlanBoard from './PlanBoard.vue'
import { boardStats } from '@/lib/planBoards'

beforeEach(() => setActivePinia(createPinia()))

describe('PlanBoard', () => {
  it('渲染表头/统计/行/列筛选图标', () => {
    const nodes = [{ projectId: 'P1', orgL4: '北京', expectedPayment: 200000, actualPayment: 100000 }]
    const w = mount(PlanBoard, {
      props: {
        board: { key: 'delayed', label: '延期', color: '#ef4444', status: '延期' },
        tableId: 'planBoard_4',
        nodes,
        stats: boardStats(nodes as any),
        columns: [
          { key: 'projectId', label: '项目编号' },
          { key: 'orgL4', label: '服务组' },
        ],
        sourceRows: nodes,
        group: ['planBoard_4'],
      },
      global: { plugins: [ElementPlus] },
    })
    expect(w.text()).toContain('延期')
    expect(w.text()).toContain('节点总数')
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('共 1 条记录')
    expect(w.findAllComponents({ name: 'ColumnFilter' }).length).toBe(2)
  })
})
