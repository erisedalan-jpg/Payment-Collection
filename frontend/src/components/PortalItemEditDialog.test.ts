import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import PortalItemEditDialog from './PortalItemEditDialog.vue'
import type { PortalItem } from '@/lib/portal'

vi.mock('@/lib/admin', () => ({
  listAccounts: vi.fn(async () => [
    { account: 'zhangsan', displayName: '张三', isSuper: false, allowedPages: [], allowedL4: [] },
    { account: 'lisi', displayName: '李四', isSuper: false, allowedPages: [], allowedL4: [] },
  ]),
}))
vi.mock('@/lib/portalApi', () => ({
  uploadPortalFile: vi.fn(async () => ({ storedName: 'pf_x__a.txt', originalName: 'a.txt', size: 3 })),
}))

function mountD(item: PortalItem | null = null) {
  return mount(PortalItemEditDialog, {
    props: { modelValue: true, item, groups: ['常用系统'] },
    attachTo: document.body,
  })
}

describe('PortalItemEditDialog', () => {
  it('新建时保存 url 项发出完整 item(含 pl_ id)', async () => {
    const w = mountD(null)
    await flushPromises()
    w.vm.form.name = 'PMIS'
    w.vm.form.group = '常用系统'
    w.vm.form.url = 'https://pmis.example.com'
    await w.vm.onSave()
    const ev = w.emitted('save')
    expect(ev).toBeTruthy()
    const saved = ev![0][0] as PortalItem
    expect(saved.id).toMatch(/^pl_[0-9a-f]{12}$/)
    expect(saved.type).toBe('url')
    expect(saved.url).toBe('https://pmis.example.com')
    expect(saved.file).toBeNull()
  })

  it('url scheme 非法则拒绝保存并置错误', async () => {
    const w = mountD(null)
    await flushPromises()
    w.vm.form.name = 'x'
    w.vm.form.group = '常用系统'
    w.vm.form.url = 'javascript:alert(1)'
    await w.vm.onSave()
    expect(w.emitted('save')).toBeFalsy()
    expect(w.vm.error).toContain('http')
  })

  it('切到 file 类型清空 url;可见范围 accounts 携带勾选账号', async () => {
    const w = mountD(null)
    await flushPromises()
    w.vm.form.type = 'file'
    w.vm.form.name = '周报'
    w.vm.form.group = '常用系统'
    w.vm.form.file = { storedName: 'pf_x__a.txt', originalName: 'a.txt', size: 3 }
    w.vm.form.visMode = 'accounts'
    w.vm.form.visAccounts = ['zhangsan']
    await w.vm.onSave()
    const saved = w.emitted('save')![0][0] as PortalItem
    expect(saved.type).toBe('file')
    expect(saved.url).toBe('')
    expect(saved.file?.storedName).toBe('pf_x__a.txt')
    expect(saved.visibility).toEqual({ mode: 'accounts', accounts: ['zhangsan'] })
  })

  it('file 类型但未上传文件则拒绝保存', async () => {
    const w = mountD(null)
    await flushPromises()
    w.vm.form.type = 'file'
    w.vm.form.name = '周报'
    w.vm.form.group = '常用系统'
    await w.vm.onSave()
    expect(w.emitted('save')).toBeFalsy()
    expect(w.vm.error).toContain('文件')
  })
})
