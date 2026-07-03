import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import FollowupModals from './FollowupModals.vue'

afterEach(() => { document.body.innerHTML = '' })

describe('FollowupModals', () => {
  it('retain 切归档 Modal 标题/宽度/确认按钮(正文改由 slot,不再随 retain 变)', async () => {
    const w = mount(FollowupModals, {
      props: {
        delConfirm: false, exportOpen: false, archiveOpen: true, historyLabel: 't',
        deleting: false, archiving: false, retain: false,
        datasetOpts: [{ value: 'current', label: '当前' }], exportSel: ['current'],
        allSelected: true, exportIndeterminate: false, exportCount: 1,
      },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    // retain=false: 清空版标题/按钮/宽度 + 通用默认正文(未传 slot)
    expect(document.body.textContent).toContain('更新（归档）')
    expect(document.body.textContent).toContain('确认更新')
    expect(document.body.textContent).toContain('归档当前数据为历史快照')
    expect(document.body.innerHTML).toContain('420px')

    await w.setProps({ retain: true })
    await flushPromises()
    // retain=true: 留存版标题/按钮/宽度
    expect(document.body.textContent).toContain('归档（留存跟进）')
    expect(document.body.textContent).toContain('确认归档')
    expect(document.body.innerHTML).toContain('460px')
    w.unmount()
  })

  it('#archive-body slot 覆盖默认正文;retain 仍切标题', async () => {
    const w = mount(FollowupModals, {
      props: {
        delConfirm: false, exportOpen: false, archiveOpen: true, historyLabel: 't',
        deleting: false, archiving: false, retain: true,
        datasetOpts: [{ value: 'current', label: '当前' }], exportSel: ['current'],
        allSelected: true, exportIndeterminate: false, exportCount: 1,
      },
      slots: { 'archive-body': '<div>页面自定义归档文案XYZ</div>' },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    // slot 内容渲染,默认正文被覆盖
    expect(document.body.textContent).toContain('页面自定义归档文案XYZ')
    expect(document.body.textContent).not.toContain('归档当前数据为历史快照')
    // retain=true 仍切标题
    expect(document.body.textContent).toContain('归档（留存跟进）')
    w.unmount()
  })

  it('确认删除 emit confirmDelete', async () => {
    const w = mount(FollowupModals, {
      props: {
        delConfirm: true, exportOpen: false, archiveOpen: false, historyLabel: 't1',
        deleting: false, archiving: false, retain: false,
        datasetOpts: [], exportSel: [], allSelected: false, exportIndeterminate: false, exportCount: 0,
      },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()
    expect(document.body.textContent).toContain('t1')
    const btn = Array.from(document.body.querySelectorAll('.kp-archive-btn'))
      .find((b) => b.textContent?.includes('确认删除')) as HTMLElement
    btn.click()
    await flushPromises()
    expect(w.emitted('confirmDelete')).toBeTruthy()
    w.unmount()
  })

  it('确认归档 emit confirmArchive;导出 emit doExport;toggleAll emit', async () => {
    const w = mount(FollowupModals, {
      props: {
        delConfirm: false, exportOpen: true, archiveOpen: true, historyLabel: 't2',
        deleting: false, archiving: false, retain: false,
        datasetOpts: [{ value: 'current', label: '当前' }, { value: 'a0', label: '2026-01-01' }],
        exportSel: ['current'],
        allSelected: false, exportIndeterminate: true, exportCount: 1,
      },
      global: { plugins: [ElementPlus] },
      attachTo: document.body,
    })
    await flushPromises()

    const archiveBtn = Array.from(document.body.querySelectorAll('.kp-archive-btn'))
      .find((b) => b.textContent?.includes('确认更新')) as HTMLElement
    archiveBtn.click()
    await flushPromises()
    expect(w.emitted('confirmArchive')).toBeTruthy()

    const exportBtn = document.body.querySelector('.kp-export-btn') as HTMLElement
    exportBtn.click()
    await flushPromises()
    expect(w.emitted('doExport')).toBeTruthy()

    const allCheckboxInput = document.body.querySelector('.el-checkbox input[type=checkbox]') as HTMLInputElement
    allCheckboxInput.click()
    await flushPromises()
    expect(w.emitted('toggleAll')).toBeTruthy()
    w.unmount()
  })
})
