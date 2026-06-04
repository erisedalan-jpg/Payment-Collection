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
})
