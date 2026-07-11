import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TodoQueue from './TodoQueue.vue'
import type { TodoQueueResult } from '@/lib/todoQueue'

const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/', component: { template: '<div/>' } },
  { path: '/project/:id', component: { template: '<div/>' } },
] })

const result: TodoQueueResult = {
  items: [
    { key: 'k1', bucket: '回款已延期', stateLabel: '已延期', tone: 'danger', projectId: 'A', projectName: '甲', amount: 1200000, detail: '已延期 · 待回 120.0 万', urgencyRank: 0, sortSub: -1200000 },
    { key: 'k2', bucket: '成本超支', stateLabel: '超支', tone: 'danger', projectId: 'B', projectName: '乙', amount: 80000, detail: '超支 8.0 万', urgencyRank: 5, sortSub: -80000 },
  ],
  counts: { '回款临期': 3, '回款已延期': 1, '里程碑': 2, '成本超支': 4 },
}

function mountQ() {
  return mount(TodoQueue, { props: { result, windowDays: 7 }, global: { plugins: [router] } })
}

describe('TodoQueue', () => {
  it('渲染 4 桶计数与全部条目', () => {
    const w = mountQ()
    expect(w.text()).toContain('已延期')
    expect(w.text()).toContain('超支')
    expect(w.findAll('.tq-item')).toHaveLength(2)
  })

  it('行链接指向 /project/:id', () => {
    const w = mountQ()
    expect(w.find('a[href="/project/A"]').exists()).toBe(true)
  })

  it('点击桶计数过滤列表，再点取消', async () => {
    const w = mountQ()
    await w.find('[data-test="tq-bucket-成本超支"]').trigger('click')
    expect(w.findAll('.tq-item')).toHaveLength(1)
    expect(w.find('.tq-item').text()).toContain('乙')
    await w.find('[data-test="tq-bucket-成本超支"]').trigger('click')
    expect(w.findAll('.tq-item')).toHaveLength(2)
  })

  it('切换窗口 emit update:windowDays', async () => {
    const w = mountQ()
    await w.find('[data-test="seg-30"]').trigger('click')
    expect(w.emitted('update:windowDays')?.[0]).toEqual([30])
  })

  it('空队列显示空态', () => {
    const w = mount(TodoQueue, { props: { result: { items: [], counts: { '回款临期': 0, '回款已延期': 0, '里程碑': 0, '成本超支': 0 } }, windowDays: 7 }, global: { plugins: [router] } })
    expect(w.text()).toContain('暂无待办')
  })
})
