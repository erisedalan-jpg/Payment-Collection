import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus, { ElMessageBox } from 'element-plus'
import LanxinInboxCard from './LanxinInboxCard.vue'
import { getLanxinInbox, handleLanxinInboxItem, deleteLanxinInboxItem } from '@/lib/lanxinApi'
import type { LanxinInboxItem } from '@/lib/lanxinInbox'
import { useDataStore } from '@/stores/data'
import { useTempFollowupStore } from '@/stores/tempFollowup'

vi.mock('@/lib/lanxinApi', () => ({
  getLanxinInbox: vi.fn(async () => ({
    success: true, items: [], rejected: { count: 0, lastAt: '' }, received: 0,
  })),
  handleLanxinInboxItem: vi.fn(async () => ({ success: true, handledInfo: {} })),
  deleteLanxinInboxItem: vi.fn(async () => ({ success: true })),
}))

/** 补齐 LanxinInboxItem 必填字段的基线值,每条用例只需写自己关心的差异
 *  (与仓库既有 buildCfg/CFG 深合并写法同构,见 LanxinConfigCard.test.ts)。 */
function baseItem(overrides: Partial<LanxinInboxItem> = {}): LanxinInboxItem {
  return {
    id: 'evt-1', receivedAt: '2026-07-20 10:00:00', status: 'parsed', unparsedReason: null,
    eventType: 'bot_private_message', staffId: 's1', employId: 'A1', name: '张三',
    msgType: 'text', text: 'hi', groupId: null, groupName: null,
    handled: false, handledInfo: null, candidateProjects: [],
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

/** 点第一行的「归入」按钮打开归入抽屉(参照 LanxinPushDrawer.test.ts 对 el-drawer 内容的既有断言写法,
 *  el-drawer 的 teleport 内容 @vue/test-utils 能直接 find/text 到,无需额外处理)。 */
async function openHandleDrawer(wrapper: VueWrapper) {
  await wrapper.find('[data-test="li-handle-btn"]').trigger('click')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  const data = useDataStore()
  ;(data as unknown as { data: unknown }).data = {
    projects: [{ projectId: 'P001', projectName: '项目一' }],
  }
  vi.mocked(getLanxinInbox).mockReset()
  vi.mocked(handleLanxinInboxItem).mockReset()
  vi.mocked(deleteLanxinInboxItem).mockReset()
  vi.mocked(handleLanxinInboxItem).mockResolvedValue({ success: true, handledInfo: {} })
  vi.mocked(deleteLanxinInboxItem).mockResolvedValue({ success: true })
})

describe('LanxinInboxCard', () => {
  it('未解析条目显示原因，不静默隐藏', async () => {
    const wrapper = await mountInbox([
      { id: 'raw-1', status: 'unparsed', unparsedReason: '非文本消息或正文字段缺失',
        handled: false, text: '', name: null, candidateProjects: [] },
    ])
    expect(wrapper.text()).toContain('未解析')
    expect(wrapper.text()).toContain('非文本消息或正文字段缺失')
  })

  it('身份查不到时显示原始 staffId 与「未知」，不编造姓名', async () => {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: null,
        employId: null, staffId: '524288-zzz', candidateProjects: [] },
    ])
    expect(wrapper.text()).toContain('未知')
    expect(wrapper.text()).toContain('524288-zzz')
  })

  it('归入候选项目标注为推测', async () => {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三',
        employId: 'A1', staffId: 's1', candidateProjects: ['P001'] },
    ])
    await openHandleDrawer(wrapper)
    expect(wrapper.text()).toContain('推测')
  })

  it('已归入条目显示去向且归入按钮禁用', async () => {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: true, text: 'hi', name: '张三',
        handledInfo: { label: '风险跟进', projectId: 'P001' }, candidateProjects: [] },
    ])
    expect(wrapper.text()).toContain('风险跟进')
    expect(wrapper.find('[data-test="li-handle-btn"]').attributes('disabled')).toBeDefined()
  })

  it('未解析条目的归入按钮也禁用（看不懂的东西不许写业务数据）', async () => {
    const wrapper = await mountInbox([
      { id: 'raw-1', status: 'unparsed', unparsedReason: '未订阅或未知的事件类型',
        handled: false, text: '', name: null, candidateProjects: [] },
    ])
    expect(wrapper.find('[data-test="li-handle-btn"]').attributes('disabled')).toBeDefined()
  })

  it('归入成功后刷新列表', async () => {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三',
        employId: 'A1', staffId: 's1', candidateProjects: ['P001'] },
    ])
    await openHandleDrawer(wrapper)
    // 走 EP el-select 的真实 popper 交互在 jsdom 下很脆，仓库既有写法(YitianRulesCard.test.ts)
    // 对这类"选完再点确认"的流程改成直接摆状态、调用暴露出来的方法。
    const vm = wrapper.vm as unknown as {
      handleForm: { domain: string; projectId: string; instanceId: string }
      confirmHandle: () => Promise<void>
    }
    vm.handleForm.domain = 'risk'
    vm.handleForm.projectId = 'P001'
    getLanxinInboxMockNextEmpty()
    await vm.confirmHandle()
    await flushPromises()
    expect(handleLanxinInboxItem).toHaveBeenCalledWith('evt-1', 'risk', 'P001', undefined)
    expect(getLanxinInbox).toHaveBeenCalledTimes(2) // 挂载一次 + 归入成功后刷新一次

    function getLanxinInboxMockNextEmpty() {
      vi.mocked(getLanxinInbox).mockResolvedValueOnce({
        success: true, items: [], rejected: { count: 0, lastAt: '' }, received: 0,
      })
    }
  })

  it('temp 域归入须带 instanceId', async () => {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三',
        employId: 'A1', staffId: 's1', candidateProjects: ['P001'] },
    ])
    await openHandleDrawer(wrapper)
    const vm = wrapper.vm as unknown as {
      handleForm: { domain: string; projectId: string; instanceId: string }
      confirmHandle: () => Promise<void>
    }
    vm.handleForm.domain = 'temp'
    vm.handleForm.projectId = 'P001'
    vm.handleForm.instanceId = 'inst-1'
    vi.mocked(getLanxinInbox).mockResolvedValueOnce({
      success: true, items: [], rejected: { count: 0, lastAt: '' }, received: 0,
    })
    await vm.confirmHandle()
    await flushPromises()
    expect(handleLanxinInboxItem).toHaveBeenCalledWith('evt-1', 'temp', 'P001', 'inst-1')
  })

  it('删除须二次确认，确认后调用删除接口并刷新', async () => {
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三', candidateProjects: [] },
    ])
    vi.mocked(getLanxinInbox).mockResolvedValueOnce({
      success: true, items: [], rejected: { count: 0, lastAt: '' }, received: 0,
    })
    await wrapper.find('[data-test="li-delete-btn"]').trigger('click')
    await flushPromises()
    expect(confirmSpy).toHaveBeenCalled()
    expect(deleteLanxinInboxItem).toHaveBeenCalledWith('evt-1')
    confirmSpy.mockRestore()
  })

  it('打开归入抽屉时按需加载临时跟进实例列表(不臆造路径,复用既有 store)', async () => {
    const tempFollowup = useTempFollowupStore()
    const loadSpy = vi.spyOn(tempFollowup, 'load').mockResolvedValue()
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三', candidateProjects: [] },
    ])
    await openHandleDrawer(wrapper)
    expect(loadSpy).toHaveBeenCalled()
  })
})
