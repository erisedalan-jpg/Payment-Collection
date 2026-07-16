import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ColumnFilter from './ColumnFilter.vue'
import { useCrossFilterStore } from '@/stores/crossFilter'

beforeEach(() => {
  setActivePinia(createPinia())
  document.body.innerHTML = '' // 清掉上个用例 teleport 到 body 的弹层残留
})

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
  // 性能护栏(V2.6.6):弹层内容必须惰性——未打开不得把整列唯一值选项预渲染进 body
  // (el-popover persistent 默认 true 会挂载即渲染并永驻 body,多页多列叠加致全站卡慢)
  it('未打开时不渲染选项列表(不污染 body)', () => {
    mountCF()
    expect(document.body.querySelector('.cf-list')).toBeNull()
  })
  it('打开渲染选项列表,关闭即销毁', async () => {
    const w = mountCF()
    ;(w.vm as any).visible = true
    await w.vm.$nextTick()
    expect(document.body.querySelector('.cf-list')).not.toBeNull()
    ;(w.vm as any).visible = false
    await w.vm.$nextTick()
    expect(document.body.querySelector('.cf-list')).toBeNull()
  })
  it('该列有筛选时图标高亮', async () => {
    const s = useCrossFilterStore()
    s.setColumnFilter('planBoard_0', 'orgL4', ['北京'], 2)
    const w = mountCF()
    await w.vm.$nextTick()
    expect(w.find('.cf-icon.active').exists()).toBe(true)
  })
  it('搜索后直接确定 → 只筛「搜索结果中被勾选的值」(无需先取消全选)', async () => {
    const store = useCrossFilterStore()
    const rows = [{ v: '张三' }, { v: '张四' }, { v: '李五' }, { v: '王六' }]
    const w = mount(ColumnFilter, {
      props: { tableId: 'T', colKey: 'v', sourceRows: rows },
      global: { plugins: [ElementPlus] },
    })
    ;(w.vm as any).visible = true
    await w.vm.$nextTick()
    // 默认全选(4 值);输入搜索「张」→ 可见张三/张四(仍在 selected 中)
    ;(w.vm as any).search = '张'
    await w.vm.$nextTick()
    // 直接确定:应只筛张三/张四,而非旧行为的全部 4 个(无需先取消全选)
    ;(w.vm as any).apply()
    expect(store.tableFilters('T').v.value.slice().sort()).toEqual(['张三', '张四'].sort())
  })
  it('搜索态「取消全选」只移除搜索结果、不动搜索框外的值', async () => {
    const store = useCrossFilterStore()
    const rows = [{ v: '张三' }, { v: '张四' }, { v: '李五' }]
    const w = mount(ColumnFilter, {
      props: { tableId: 'T2', colKey: 'v', sourceRows: rows },
      global: { plugins: [ElementPlus] },
    })
    ;(w.vm as any).visible = true
    await w.vm.$nextTick()
    ;(w.vm as any).search = '张'
    await w.vm.$nextTick()
    ;(w.vm as any).toggleAll(false)        // 取消全选(搜索结果)→ 只去掉张三/张四
    await w.vm.$nextTick()
    expect([...(w.vm as any).selected].sort()).toEqual(['李五'])  // 李五(搜索框外)仍在
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
