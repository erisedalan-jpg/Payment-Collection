import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ColumnFilter from './ColumnFilter.vue'
import { useCrossFilterStore } from '@/stores/crossFilter'

beforeEach(() => setActivePinia(createPinia()))

function mountCF() {
  return mount(ColumnFilter, {
    props: { tableId: 'planBoard_0', colKey: 'orgL4', sourceRows: [{ orgL4: '北京' }, { orgL4: '上海' }] },
    global: { plugins: [ElementPlus] },
  })
}

describe('ColumnFilter', () => {
  it('渲染下拉触发图标，默认不高亮', () => {
    const w = mountCF()
    expect(w.find('.cf-icon').exists()).toBe(true)
    expect(w.find('.cf-icon.active').exists()).toBe(false)
  })
  it('该列有筛选时图标高亮', async () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 2)
    const w = mountCF()
    await w.vm.$nextTick()
    expect(w.find('.cf-icon.active').exists()).toBe(true)
  })
  it('级联:A 列已筛选后,B 列选项只列 A 筛选后行的 B 值', async () => {
    setActivePinia(createPinia())
    const store = useCrossFilterStore()
    const rows = [
      { L4: '甲组', mgr: '张' },
      { L4: '甲组', mgr: '李' },
      { L4: '乙组', mgr: '王' },
    ]
    // 先对 L4 列设筛选=甲组(总值数2:甲组/乙组)
    store.setColumnFilter('T1', 'L4', ['甲组'], 2)
    const w = mount(ColumnFilter, {
      props: { tableId: 'T1', colKey: 'mgr', sourceRows: rows },
      global: { plugins: [ElementPlus] },
    })
    ;(w.vm as any).visible = true
    await w.vm.$nextTick()
    const displays = ((w.vm as any).uniques as any[]).map((u) => u.display)
    expect(displays.sort()).toEqual(['张', '李'].sort()) // 不含 王(乙组已被 L4 筛掉)
  })
})
