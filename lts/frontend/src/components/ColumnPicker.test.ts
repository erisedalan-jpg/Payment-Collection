import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import ColumnPicker from './ColumnPicker.vue'

const COLS = [{ key: 'a', label: 'A列' }, { key: 'b', label: 'B列' }, { key: 'c', label: 'C列' }]

function mountPicker() {
  return mount(ColumnPicker, {
    props: { columns: COLS, visibleKeys: ['a', 'b'] },
    global: { plugins: [ElementPlus] },
    attachTo: document.body,
  })
}


// persistent=false 后弹层内容在 open 定时器(setTimeout 0)触发后才渲染,点开需等一个宏任务
async function openPicker(w: ReturnType<typeof mountPicker>) {
  await w.find('.colpick-btn').trigger('click')
  await new Promise((r) => setTimeout(r, 0))
  await w.vm.$nextTick()
}

describe('ColumnPicker', () => {
  it('渲染可见(勾选)与隐藏(未勾选)分区', async () => {
    const w = mountPicker()
    await openPicker(w)
    const text = document.body.textContent || ''
    expect(text).toContain('A列')
    expect(text).toContain('C列') // 隐藏列也列出
    w.unmount()
  })

  it('点隐藏列复选框 emit toggle(key)', async () => {
    const w = mountPicker()
    await openPicker(w)
    // 取所有 colpick-row，第3行是 C列(隐藏列)
    const rows = document.querySelectorAll('.colpick-row')
    expect(rows.length).toBe(3)
    // 点 C列 行内的 el-checkbox label
    const cRow = rows[2] as HTMLElement
    const checkbox = cRow.querySelector('input[type="checkbox"]') as HTMLElement
    checkbox.click()
    await w.vm.$nextTick()
    expect(w.emitted('toggle')?.[0]?.[0]).toBe('c')
    w.unmount()
  })

  it('点上移箭头 emit move-up(key)', async () => {
    const w = mountPicker()
    await openPicker(w)
    // 第2行(B列)的↑箭头点击 → emit move-up('b')
    const rows = document.querySelectorAll('.colpick-row')
    const bRow = rows[1] as HTMLElement
    const upBtn = bRow.querySelector('.colpick-arrow:not([disabled])') as HTMLElement
    upBtn.click()
    await w.vm.$nextTick()
    expect(w.emitted('move-up')?.[0]?.[0]).toBe('b')
    w.unmount()
  })

  it('点下移箭头 emit move-down(key)', async () => {
    const w = mountPicker()
    await openPicker(w)
    // 第1行(A列)的↓箭头点击 → emit move-down('a')
    const rows = document.querySelectorAll('.colpick-row')
    const aRow = rows[0] as HTMLElement
    // A列首行↑禁用，↓可用 — 取最后一个 arrow 按钮
    const arrows = aRow.querySelectorAll('.colpick-arrow')
    const downBtn = arrows[1] as HTMLElement
    downBtn.click()
    await w.vm.$nextTick()
    expect(w.emitted('move-down')?.[0]?.[0]).toBe('a')
    w.unmount()
  })

  it('点恢复默认 emit reset', async () => {
    const w = mountPicker()
    await openPicker(w)
    const resetBtn = document.querySelector('.colpick-reset') as HTMLElement
    resetBtn.click()
    await w.vm.$nextTick()
    expect(w.emitted('reset')).toBeTruthy()
    w.unmount()
  })

  it('首行↑箭头禁用，末可见行↓箭头禁用', async () => {
    const w = mountPicker()
    await openPicker(w)
    const rows = document.querySelectorAll('.colpick-row')
    // A列(首行)：第一个箭头↑应禁用
    const aArrows = rows[0].querySelectorAll('.colpick-arrow')
    expect((aArrows[0] as HTMLButtonElement).disabled).toBe(true)
    // B列(末可见行)：第二个箭头↓应禁用
    const bArrows = rows[1].querySelectorAll('.colpick-arrow')
    expect((bArrows[1] as HTMLButtonElement).disabled).toBe(true)
    w.unmount()
  })
})
