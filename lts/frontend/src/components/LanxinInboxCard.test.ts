import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import ElementPlus, { ElMessageBox } from 'element-plus'
import LanxinInboxCard from './LanxinInboxCard.vue'
import { getLanxinInbox, markLanxinInboxHandled, deleteLanxinInboxItem } from '@/lib/lanxinApi'
import type { LanxinInboxItem } from '@/lib/lanxinInbox'

vi.mock('@/lib/lanxinApi', () => ({
  getLanxinInbox: vi.fn(async () => ({
    success: true, items: [], rejected: { count: 0, lastAt: '' }, received: 0,
  })),
  markLanxinInboxHandled: vi.fn(async () => ({ success: true })),
  deleteLanxinInboxItem: vi.fn(async () => ({ success: true })),
}))

/** 补齐 LanxinInboxItem 必填字段的基线值,每条用例只需写自己关心的差异
 *  (LTS 无 candidateProjects 字段,较 master 少一项——见 T7 去归入)。 */
function baseItem(overrides: Partial<LanxinInboxItem> = {}): LanxinInboxItem {
  return {
    id: 'evt-1', receivedAt: '2026-07-20 10:00:00', status: 'parsed', unparsedReason: null,
    eventType: 'bot_private_message', staffId: 's1', employId: 'A1', name: '张三',
    msgType: 'text', text: 'hi', groupId: null, groupName: null,
    handled: false, handledInfo: null,
    ...overrides,
  }
}

async function mountInbox(items: Partial<LanxinInboxItem>[]): Promise<VueWrapper> {
  vi.mocked(getLanxinInbox).mockResolvedValueOnce({
    success: true,
    items: items.map((i) => baseItem(i)),
    rejected: { count: 0, lastAt: '' },
    received: items.length,
  })
  const w = mount(LanxinInboxCard, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return w
}

beforeEach(() => {
  vi.mocked(getLanxinInbox).mockReset()
  vi.mocked(markLanxinInboxHandled).mockReset()
  vi.mocked(deleteLanxinInboxItem).mockReset()
  vi.mocked(markLanxinInboxHandled).mockResolvedValue({ success: true })
  vi.mocked(deleteLanxinInboxItem).mockResolvedValue({ success: true })
})

describe('LanxinInboxCard', () => {
  it('挂载后加载收件箱,填充 items/received/rejected', async () => {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三' },
      { id: 'evt-2', status: 'parsed', handled: false, text: 'ok', name: '李四' },
    ])
    expect(getLanxinInbox).toHaveBeenCalledTimes(1)
    const vm = wrapper.vm as unknown as {
      items: LanxinInboxItem[]; received: number; rejected: { count: number }
    }
    expect(vm.items.length).toBe(2)
    expect(vm.received).toBe(2)
    expect(vm.rejected.count).toBe(0)
  })

  it('未解析条目显示原因，不静默隐藏', async () => {
    const wrapper = await mountInbox([
      { id: 'raw-1', status: 'unparsed', unparsedReason: '非文本消息或正文字段缺失',
        handled: false, text: '', name: null },
    ])
    expect(wrapper.text()).toContain('未解析')
    expect(wrapper.text()).toContain('非文本消息或正文字段缺失')
  })

  it('未处理条目可点「标记已处理」,调用接口后刷新列表', async () => {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三' },
    ])
    vi.mocked(getLanxinInbox).mockResolvedValueOnce({
      success: true, items: [], rejected: { count: 0, lastAt: '' }, received: 0,
    })
    await wrapper.find('[data-test="li-mark-btn"]').trigger('click')
    await flushPromises()
    expect(markLanxinInboxHandled).toHaveBeenCalledWith('evt-1')
    expect(getLanxinInbox).toHaveBeenCalledTimes(2) // 挂载一次 + 标记成功后刷新一次
  })

  it('已处理条目显示处理状态且标记按钮禁用', async () => {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: true, text: 'hi', name: '张三',
        handledInfo: { by: 'admin', at: '2026-07-21 09:00:00' } },
    ])
    expect(wrapper.text()).toContain('已处理')
    expect(wrapper.text()).toContain('2026-07-21 09:00:00')
    expect(wrapper.find('[data-test="li-mark-btn"]').attributes('disabled')).toBeDefined()
  })

  it('未解析条目同样可标记已处理（收件箱只读,不写业务数据）', async () => {
    const wrapper = await mountInbox([
      { id: 'raw-1', status: 'unparsed', unparsedReason: '未订阅或未知的事件类型',
        handled: false, text: '', name: null },
    ])
    expect(wrapper.find('[data-test="li-mark-btn"]').attributes('disabled')).toBeUndefined()
  })

  it('删除须二次确认，确认后调用删除接口并刷新', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三' },
    ])
    vi.mocked(getLanxinInbox).mockResolvedValueOnce({
      success: true, items: [], rejected: { count: 0, lastAt: '' }, received: 0,
    })
    await wrapper.find('[data-test="li-delete-btn"]').trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalled()
    expect(deleteLanxinInboxItem).toHaveBeenCalledWith('evt-1')
    expect(getLanxinInbox).toHaveBeenCalledTimes(2)
    confirmSpy.mockRestore()
  })

  it('取消删除确认框则不调用删除接口', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockRejectedValue('cancel' as never)
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三' },
    ])
    await wrapper.find('[data-test="li-delete-btn"]').trigger('click')
    await flushPromises()
    expect(deleteLanxinInboxItem).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('身份查不到时显示原始 staffId 与「未知」，不编造姓名', async () => {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: null,
        employId: null, staffId: '524288-zzz' },
    ])
    expect(wrapper.text()).toContain('未知')
    expect(wrapper.text()).toContain('524288-zzz')
  })

  it('验签被拒计数 > 0 时展示提示', async () => {
    vi.mocked(getLanxinInbox).mockResolvedValueOnce({
      success: true, items: [], rejected: { count: 3, lastAt: '2026-07-21 08:00:00' }, received: 0,
    })
    const wrapper = mount(LanxinInboxCard, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('验签被拒')
    expect(wrapper.text()).toContain('2026-07-21 08:00:00')
  })
})
