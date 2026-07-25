import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'

vi.mock('@/lib/followupColumns', () => ({ followupColumnsApi: {} }))
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import FollowupColumnConfig from '@/components/FollowupColumnConfig.vue'

// el-drawer 内容默认 teleport 到 body、且延迟到过渡结束才渲染，导致 w.text()/w.get()
// 找不到内容；el-select 在 jsdom 中会触发递归更新噪声 —— 两者都 stub 掉，
// 参照 ProjectDetailDrawer.test.ts / AdminView.test.ts 的既有模式。
const DrawerStub = {
  name: 'ElDrawer',
  props: ['modelValue', 'title', 'size', 'appendToBody'],
  template: '<div class="drawer-stub"><slot /></div>',
}
// el-select 加 <slot />、el-option 回显 label 文本：V4.4.6 新增用例要断言「时间差」这个
// el-option 的 label 真的出现在渲染输出里——若 el-select stub 不转发 slot，该断言会假绿
// (碰巧命中 fcc-hint 提示语里的同一个词，而非真的验证下拉选项存在)。
const STUBS = {
  ElDrawer: DrawerStub,
  'el-select': { template: '<div class="el-select-stub"><slot /></div>', props: ['modelValue'] },
  'el-option': { template: '<div class="el-option-stub">{{ label }}</div>', props: ['label', 'value'] },
}
function mountIt(table: 'temp' | 'risk' | 'payment_key' | 'opportunity' = 'risk',
                  extraProps: Record<string, unknown> = {}) {
  return mount(FollowupColumnConfig, {
    props: { modelValue: true, table, ...extraProps },
    global: { plugins: [ElementPlus], stubs: STUBS },
  })
}

describe('FollowupColumnConfig', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const s = useFollowupColumnsStore()
    s.configs = { temp: [], payment_key: [], opportunity: [],
      risk: [{ key: 'cf-a', label: '责任人', type: 'text', clearOnArchive: false }] } as any
    s.loaded = true
  })

  it('渲染现有列', () => {
    const w = mountIt()
    // 列名走 el-input 的 :model-value 呈现为 DOM property 而非 textContent/attribute，
    // w.text() 断言不了；改为直接读该行 input 的 value（计划原断言在此组件下必假败）。
    const input = w.get('[data-test="fcc-col"] input')
    expect((input.element as HTMLInputElement).value).toBe('责任人')
  })

  it('新增列调用 store.add', async () => {
    const s = useFollowupColumnsStore()
    const spy = vi.spyOn(s, 'add').mockResolvedValue({ key: 'cf-b', label: '截止', type: 'date', clearOnArchive: true })
    const w = mountIt()
    await w.get('[data-test="fcc-new-label"]').setValue('截止')
    await w.get('[data-test="fcc-add"]').trigger('click')
    // V4.4.6:onAdd 固定传 5 个位置参(非 diff 类型时第 5 个显式为 undefined),故此处补第 5 参匹配
    expect(spy).toHaveBeenCalledWith('risk', '截止', expect.any(String), expect.any(Boolean), undefined)
  })

  it('V4.4.6 类型下拉含「时间差」', () => {
    const w = mountIt()
    const opt = w.findAll('.el-option-stub').filter((n) => n.text() === '时间差')
    expect(opt.length).toBeGreaterThan(0)
  })

  it('V4.4.6 指定列候选 = 内置日期列 + 自定义 date 列(非日期列不进)', () => {
    const w = mountIt('risk', {
      columns: [
        { key: 'setupDate', label: '立项日期' },
        { key: '计划关闭时间', label: '计划关闭时间' },
        { key: 'projectName', label: '项目名称' },   // 非日期,不应出现
      ],
    })
    const opts = (w.vm as any).dateColumnOptions as { key: string }[]
    const keys = opts.map((o) => o.key)
    expect(keys).toContain('setupDate')
    expect(keys).toContain('计划关闭时间')       // isDateKey 认中文
    expect(keys).not.toContain('projectName')
  })
})
