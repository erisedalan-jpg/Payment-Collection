import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FollowupSignalRow from './FollowupSignalRow.vue'

const stat = { name: 'A部门', total: 4, d7: 2, d15: 1, d30: 1, delay: 2, flw: 2, d7flw: 1, d15flw: 0, d30flw: 0, delayFlw: 1 }
const max = { d7: 2, d15: 1, d30: 1, delay: 2 }

describe('FollowupSignalRow', () => {
  it('渲染排名/部门/4 档数值/跟进率', () => {
    const w = mount(FollowupSignalRow, { props: { index: 0, stat, max } })
    expect(w.text()).toContain('1')
    expect(w.text()).toContain('A部门')
    expect(w.text()).toContain('共4个项目')
    expect(w.text()).toContain('50%')
    expect(w.findAll('.sig-bar-fill')).toHaveLength(4)
    expect(w.text()).toContain('已跟进1/待跟进1个')
  })
})
