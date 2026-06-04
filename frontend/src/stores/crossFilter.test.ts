import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCrossFilterStore } from './crossFilter'

const GROUP = ['planBoard_0', 'planBoard_1']
beforeEach(() => setActivePinia(createPinia()))

describe('useCrossFilterStore', () => {
  it('部分选中→设置筛选；全选→清除（全选=无筛选）', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 3)
    expect(s.tableFilters('planBoard_0').orgL4).toEqual({ value: ['北京'] })
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京', '上海', '广州'], 3)
    expect(s.tableFilters('planBoard_0').orgL4).toBeUndefined()
  })
  it('空选集→{value:[]}', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', [], 3)
    expect(s.tableFilters('planBoard_0').orgL4).toEqual({ value: [] })
  })
  it('clearColumn / clearAll / hasFilters', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 3)
    s.setColumnFilter('planBoard_0', 'nodeStatus', ['延期'], 2)
    s.clearColumn('planBoard_0', 'orgL4')
    expect(s.tableFilters('planBoard_0').orgL4).toBeUndefined()
    expect(s.hasFilters('planBoard_0')).toBe(true)
    s.clearAll('planBoard_0')
    expect(s.hasFilters('planBoard_0')).toBe(false)
  })
  it('联动关：不同步到其他看板', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 3, GROUP)
    expect(s.tableFilters('planBoard_1').orgL4).toBeUndefined()
  })
  it('联动开：同步设置与清除', () => {
    const s = useCrossFilterStore()
    s.toggleLinkage()
    expect(s.linkageOn).toBe(true)
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 3, GROUP)
    expect(s.tableFilters('planBoard_1').orgL4).toEqual({ value: ['北京'] })
    s.clearColumn('planBoard_0', 'orgL4', GROUP)
    expect(s.tableFilters('planBoard_1').orgL4).toBeUndefined()
  })
  it('groupHasFilters / clearGroup', () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_1', 'orgL4', ['北京'], 3)
    expect(s.groupHasFilters(GROUP)).toBe(true)
    s.clearGroup(GROUP)
    expect(s.groupHasFilters(GROUP)).toBe(false)
  })
})
