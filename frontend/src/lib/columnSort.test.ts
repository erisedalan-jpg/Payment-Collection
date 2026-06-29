import { describe, it, expect } from 'vitest'
import { withSortable, NON_SORTABLE_KEYS } from './columnSort'
import type { DataColumn } from '@/components/DataTable.vue'

describe('withSortable', () => {
  it('非长文本列一律 sortable=true', () => {
    const cols: DataColumn[] = [
      { key: 'projectId', label: '项目编号' },
      { key: 'contractWan', label: '合同金额(万)', num: true },
      { key: 'followDate', label: '跟进日期' },
    ]
    const out = withSortable(cols)
    expect(out.map((c) => c.sortable)).toEqual([true, true, true])
  })

  it('4 个长文本 key 一律 sortable=false', () => {
    const cols: DataColumn[] = [
      { key: 'weekProgress', label: '本周工作进展', wrap: true },
      { key: 'nextPlan', label: '后续工作计划', wrap: true },
      { key: 'remark', label: '当前进展/风险说明/情况备注', wrap: true },
      { key: 'mainProducts', label: '主要涉及产品', wrap: true },
    ]
    const out = withSortable(cols)
    expect(out.map((c) => c.sortable)).toEqual([false, false, false, false])
  })

  it('覆盖原有 sortable：长文本列原标 true 也会被改为 false', () => {
    const out = withSortable([{ key: 'weekProgress', label: '本周工作进展', sortable: true }])
    expect(out[0].sortable).toBe(false)
  })

  it('客户名称/商机名称虽 wrap 但不在排除集 → 可排（边界）', () => {
    const out = withSortable([
      { key: 'customer', label: '客户名称', wrap: true },
      { key: 'name', label: '商机名称/项目名称', wrap: true },
    ])
    expect(out.map((c) => c.sortable)).toEqual([true, true])
  })

  it('保留其它字段（label/width/wrap/num/fixed/formatter）', () => {
    const fmt = (v: any) => String(v)
    const out = withSortable([
      { key: 'amountWan', label: '预估金额(万元)', width: 120, num: true, formatter: fmt },
      { key: 'projectName', label: '项目名称', width: 200, wrap: true, fixed: 'left' },
    ])
    expect(out[0]).toMatchObject({ key: 'amountWan', label: '预估金额(万元)', width: 120, num: true, formatter: fmt, sortable: true })
    expect(out[1]).toMatchObject({ key: 'projectName', label: '项目名称', width: 200, wrap: true, fixed: 'left', sortable: true })
  })

  it('不改入参（返回新数组/新对象，原对象 sortable 不被原地改写）', () => {
    const input: DataColumn[] = [{ key: 'remark', label: '备注' }]
    const out = withSortable(input)
    expect(out).not.toBe(input)
    expect(out[0]).not.toBe(input[0])
    expect(input[0].sortable).toBeUndefined()
  })

  it('NON_SORTABLE_KEYS 恰为 4 个长文本 key', () => {
    expect([...NON_SORTABLE_KEYS].sort()).toEqual(['mainProducts', 'nextPlan', 'remark', 'weekProgress'])
  })
})
