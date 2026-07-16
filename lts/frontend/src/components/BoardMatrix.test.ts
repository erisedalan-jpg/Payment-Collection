import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BoardMatrix from './BoardMatrix.vue'
import type { CrossMatrix } from '@/lib/pivot'

const M: CrossMatrix = {
  rows: ['北京', '上海'],
  cols: ['100万以上', '50万以下'],
  cells: [[600000, 100000], [0, 300000]],
  index: {
    北京: { '100万以上': { projects: [{}] } as any, '50万以下': { projects: [{}] } as any },
    上海: { '50万以下': { projects: [{}] } as any },
  },
}

describe('BoardMatrix', () => {
  it('渲染行/列/格并格式化', () => {
    const w = mount(BoardMatrix, {
      props: { matrix: M, rowLabel: '服务组', colLabel: '档位', format: (v: number) => `¥${v}` },
    })
    expect(w.text()).toContain('北京')
    expect(w.text()).toContain('100万以上')
    expect(w.text()).toContain('¥600000')
  })

  it('点击有数据的格 emit cell-click，空格不可点', async () => {
    const w = mount(BoardMatrix, {
      props: { matrix: M, rowLabel: '服务组', colLabel: '档位', format: (v: number) => String(v) },
    })
    const clickable = w.findAll('.bm-cell.bm-click')
    expect(clickable.length).toBe(3)
    await clickable[0].trigger('click')
    expect(w.emitted('cell-click')?.[0]?.[0]).toEqual({ row: '北京', col: '100万以上' })
  })
})
