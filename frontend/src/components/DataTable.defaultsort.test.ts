import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import DataTable from './DataTable.vue'

const COLS = [{ key: 'a', label: 'A', sortable: true }]
const ROWS = [{ a: 1 }, { a: 2 }]

describe('DataTable default-sort 透传', () => {
  it('传 defaultSort → el-table 收到该 prop', () => {
    const w = mount(DataTable, {
      props: { columns: COLS, rows: ROWS, defaultSort: { prop: 'a', order: 'descending' } },
      global: { plugins: [ElementPlus] },
    })
    // findComponent(ElTable) 的类型推断在 vue-tsc 下退化为 DOMWrapper(无 .props()，element-plus
    // withInstall() 导出类型与 @vue/test-utils 的 DefinedComponent 重载不匹配)；改用具名选择器，
    // 与仓库既有用法一致(见 ChartBox.test.ts / CalendarView.test.ts 的 findComponent({ name: ... }))。
    expect(w.findComponent({ name: 'ElTable' }).props('defaultSort')).toEqual({ prop: 'a', order: 'descending' })
  })
  it('不传 defaultSort → el-table 收到 undefined(不破坏渲染)', () => {
    const w = mount(DataTable, {
      props: { columns: COLS, rows: ROWS },
      global: { plugins: [ElementPlus] },
    })
    expect(w.findComponent({ name: 'ElTable' }).props('defaultSort')).toBeUndefined()
  })
})
