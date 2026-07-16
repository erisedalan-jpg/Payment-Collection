import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, KeepAlive, ref as vueRef } from 'vue'
import ElementPlus from 'element-plus'
import RichTextCell from './RichTextCell.vue'

// jsdom 未实现 document.execCommand（浏览器专有 API，仅真实浏览器有）；
// 补一个可被 vi.spyOn 挂钩的空实现，使测试能在 jsdom 下运行（不影响真实浏览器行为）。
if (!('execCommand' in document)) {
  ;(document as unknown as { execCommand: (...args: unknown[]) => boolean }).execCommand = () => true
}

beforeEach(() => { vi.spyOn(document, 'execCommand').mockReturnValue(true) })

// RichTextCell 用模块级单例(activeCell)做跨实例互斥；@vue/test-utils 不会在测试间自动 unmount，
// 若某用例中断在"编辑中"状态就切下一个用例，残留的单例会挡住后续用例进入编辑态。
// 逐用例 unmount 触发组件的 onBeforeUnmount 清理单例，让用例互不干扰（不改组件行为，纯测试卫生）。
const mountedWrappers: ReturnType<typeof mount>[] = []
afterEach(() => {
  mountedWrappers.forEach((w) => w.unmount())
  mountedWrappers.length = 0
})

function mountCell(props: Record<string, unknown>) {
  // props 是松散 Record 与默认值合并，严格 prop 类型推不出 content 必填；用 `as any` 桥接，运行期行为不变。
  const w = mount(RichTextCell as any, { props: { editable: true, saveHandler: vi.fn(), ...props }, global: { plugins: [ElementPlus] } })
  mountedWrappers.push(w)
  return w
}

describe('RichTextCell 显示态', () => {
  it('有内容:净化后 v-html + 前缀', () => {
    const w = mountCell({ content: '<b>粗</b>', editable: false, prefix: '2026-07-10：' })
    expect(w.find('.rtc-prefix').text()).toBe('2026-07-10：')
    expect(w.find('.rtc-body').element.innerHTML).toBe('<b>粗</b>')
  })
  it('空内容 + editable → 点击填写', () => {
    const w = mountCell({ content: '', editable: true })
    expect(w.find('.rtc-empty').text()).toBe('点击填写')
  })
  it('空内容 + 只读 → 短横', () => {
    const w = mountCell({ content: '', editable: false })
    expect(w.find('.rtc-empty').text()).toBe('-')
  })
  it('只读态点击不进入编辑', async () => {
    const w = mountCell({ content: '', editable: false })
    await w.find('.rtc-empty').trigger('click')
    expect(w.find('.rtc-editor').exists()).toBe(false)
  })
})

describe('RichTextCell 编辑态', () => {
  it('editable 点击 → 出编辑器', async () => {
    const w = mountCell({ content: '', editable: true })
    await w.find('.rtc-empty').trigger('click')
    expect(w.find('.rtc-editor').exists()).toBe(true)
    expect(w.find('[contenteditable]').exists()).toBe(true)
  })
  it('保存:回调收到净化 html,成功后关闭', async () => {
    const saveHandler = vi.fn().mockResolvedValue(undefined)
    const w = mountCell({ content: '', editable: true, saveHandler })
    await w.find('.rtc-empty').trigger('click')
    const ed = w.find('[contenteditable]').element as HTMLElement
    ed.innerHTML = '<b>hi</b><script>x</script>'
    await w.find('.rtc-save').trigger('click')
    await flushPromises()
    expect(saveHandler).toHaveBeenCalledWith('<b>hi</b>')       // script 被净化
    expect(w.find('.rtc-editor').exists()).toBe(false)
  })
  it('取消:不回调、关闭', async () => {
    const saveHandler = vi.fn()
    const w = mountCell({ content: '', editable: true, saveHandler })
    await w.find('.rtc-empty').trigger('click')
    await w.find('.rtc-cancel').trigger('click')
    expect(saveHandler).not.toHaveBeenCalled()
    expect(w.find('.rtc-editor').exists()).toBe(false)
  })
  it('工具条按钮调 execCommand', async () => {
    const w = mountCell({ content: '', editable: true })
    await w.find('.rtc-empty').trigger('click')
    await w.findAll('.rtc-tb')[0].trigger('click')              // 加粗
    expect(document.execCommand).toHaveBeenCalledWith('bold', false)
  })
  it('保存失败:保持打开', async () => {
    const saveHandler = vi.fn().mockRejectedValue(new Error('boom'))
    const w = mountCell({ content: '', editable: true, saveHandler })
    await w.find('.rtc-empty').trigger('click')
    await w.find('.rtc-save').trigger('click')
    await flushPromises()
    expect(w.find('.rtc-editor').exists()).toBe(true)
  })
  it('保存用进入编辑时快照的 saveHandler(行复用 prop 重绑不串行)', async () => {
    const A = vi.fn().mockResolvedValue(undefined)
    const B = vi.fn().mockResolvedValue(undefined)
    const w = mountCell({ content: '', editable: true, saveHandler: A })
    await w.find('.rtc-empty').trigger('click')
    ;(w.find('[contenteditable]').element as HTMLElement).innerHTML = '<b>x</b>'
    await w.setProps({ saveHandler: B })   // 模拟 el-table 行复用后 saveHandler 重绑到别的行
    await w.find('.rtc-save').trigger('click')
    await flushPromises()
    expect(A).toHaveBeenCalledWith('<b>x</b>')
    expect(B).not.toHaveBeenCalled()
  })
})

describe('RichTextCell keep-alive 停用释放单例', () => {
  it('停用页面的脏编辑器不挡另一 keep-alive 页进入编辑', async () => {
    const PageA = defineComponent({
      props: { saveHandler: { type: Function, required: true } },
      setup(props) {
        return () => h(RichTextCell as any, { content: '', editable: true, saveHandler: props.saveHandler })
      },
    })
    const PageB = defineComponent({
      props: { saveHandler: { type: Function, required: true } },
      setup(props) {
        return () => h(RichTextCell as any, { content: '', editable: true, saveHandler: props.saveHandler })
      },
    })
    const active = vueRef<'A' | 'B'>('A')
    const saveA = vi.fn()
    const saveB = vi.fn()
    const Wrapper = defineComponent({
      setup() {
        return () => h(KeepAlive, null, {
          default: () => (active.value === 'A'
            ? h(PageA, { key: 'A', saveHandler: saveA })
            : h(PageB, { key: 'B', saveHandler: saveB })),
        })
      },
    })
    const w = mount(Wrapper, { global: { plugins: [ElementPlus] } })
    mountedWrappers.push(w as unknown as ReturnType<typeof mount>)

    await w.find('.rtc-empty').trigger('click')
    ;(w.find('[contenteditable]').element as HTMLElement).innerHTML = '<b>dirty</b>'
    await w.find('[contenteditable]').trigger('input')  // dirty = true, 不保存不取消

    active.value = 'B'
    await flushPromises()

    // PageA 已停用(deactivated 非卸载),但组件应主动 stopEdit() 释放模块单例。
    await w.find('.rtc-empty').trigger('click')
    expect(w.find('.rtc-editor').exists()).toBe(true)
  })
})
