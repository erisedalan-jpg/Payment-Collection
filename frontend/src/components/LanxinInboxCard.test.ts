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
    projects: [
      { projectId: 'P001', projectName: '项目一' },
      { projectId: 'P002', projectName: '无风险项目' },
    ],
    // 风险跟进按「项目号::风险编码」复合键存储，归入抽屉的二级下拉从这里取记录。
    projectPmis: {
      P001: { riskRecords: [
        { 风险编码: 'R-7', 风险名称: '验收延期', 风险等级: '高', 风险状态: '未关闭' },
        { 风险编码: 'R-8', 风险名称: '预算超支', 风险等级: '中', 风险状态: '未关闭' },
      ] },
      P002: { riskRecords: [] },
    },
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
      handleForm: { domain: string; projectId: string; instanceId: string; riskCode: string }
      confirmHandle: () => Promise<void>
    }
    vm.handleForm.domain = 'risk'
    vm.handleForm.projectId = 'P001'
    vm.handleForm.riskCode = 'R-7'
    getLanxinInboxMockNextEmpty()
    await vm.confirmHandle()
    await flushPromises()
    expect(handleLanxinInboxItem).toHaveBeenCalledWith('evt-1', 'risk', 'P001', undefined, 'R-7')
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
      handleForm: { domain: string; projectId: string; instanceId: string; riskCode: string }
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
    // temp 不是 risk，riskCode 必须是 undefined —— 不许给非 risk 域捎带复合键
    expect(handleLanxinInboxItem).toHaveBeenCalledWith('evt-1', 'temp', 'P001', 'inst-1', undefined)
  })

  // ── C-1 回归：risk 域必须再选一条风险记录 ────────────────────────────────
  //
  // 风险跟进 store 按「项目号::风险编码」复合键索引（四域里唯一），前端 riskRows.ts
  // 没有任何回退到裸 projectId 的分支。少了这一级选择，归入的内容前端永远读不到，
  // 而条目已被标 handled、归入按钮转灰 —— 员工的回复静默蒸发，全程零报错。

  async function openRiskDrawer(): Promise<VueWrapper> {
    const wrapper = await mountInbox([
      { id: 'evt-1', status: 'parsed', handled: false, text: 'hi', name: '张三',
        employId: 'A1', staffId: 's1', candidateProjects: ['P001'] },
    ])
    await openHandleDrawer(wrapper)
    return wrapper
  }

  type RiskVm = {
    handleForm: { domain: string; projectId: string; instanceId: string; riskCode: string }
    riskOptions: { code: string; label: string }[]
    riskEmpty: boolean
    confirmHandle: () => Promise<void>
  }

  it('risk 域列出该项目的风险记录供选择', async () => {
    const wrapper = await openRiskDrawer()
    const vm = wrapper.vm as unknown as RiskVm
    vm.handleForm.domain = 'risk'
    vm.handleForm.projectId = 'P001'
    await flushPromises()
    expect(vm.riskOptions.map((r) => r.code)).toEqual(['R-7', 'R-8'])
    expect(vm.riskEmpty).toBe(false)
  })

  it('risk 域未选风险记录时拒绝归入，绝不退化成写裸 projectId', async () => {
    const wrapper = await openRiskDrawer()
    const vm = wrapper.vm as unknown as RiskVm
    vm.handleForm.domain = 'risk'
    vm.handleForm.projectId = 'P001'
    vm.handleForm.riskCode = ''
    await vm.confirmHandle()
    await flushPromises()
    expect(handleLanxinInboxItem).not.toHaveBeenCalled()
  })

  it('项目无风险记录时明确提示，不给空下拉也不允许归入', async () => {
    const wrapper = await openRiskDrawer()
    const vm = wrapper.vm as unknown as RiskVm
    vm.handleForm.domain = 'risk'
    vm.handleForm.projectId = 'P002'   // 无风险记录
    await flushPromises()
    expect(vm.riskEmpty).toBe(true)
    expect(vm.riskOptions).toEqual([])
    expect(wrapper.text()).toContain('该项目无风险记录')
    await vm.confirmHandle()
    await flushPromises()
    expect(handleLanxinInboxItem).not.toHaveBeenCalled()
  })

  it('改选项目后清空已选风险编码（它属于上一个项目，留着会写错复合键）', async () => {
    const wrapper = await openRiskDrawer()
    const vm = wrapper.vm as unknown as RiskVm & { onScopeChange: () => void }
    vm.handleForm.domain = 'risk'
    vm.handleForm.projectId = 'P001'
    vm.handleForm.riskCode = 'R-7'
    await flushPromises()

    // 项目/域下拉的 @change 绑的就是这个函数；不清空的话 P002 会拿着 P001 的 R-7
    // 去拼出 "P002::R-7" —— 一个前端永远读不到的幽灵键。
    vm.onScopeChange()
    await flushPromises()

    expect(vm.handleForm.riskCode).toBe('')
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
