import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import TempInstancePanel from './TempInstancePanel.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useFollowupColumnsStore } from '@/stores/followupColumns'
import { useProjectTagsStore } from '@/stores/projectTags'
import { BORROWABLE_KEYS } from '@/lib/projectList'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))

const projects = [
  { projectId: 'P1', projectName: '项目甲', projectManager: '张三', orgL4: '银行服务组', top1000: '是',
    paymentPmis: { contract: 2_000_000 }, payment: { paymentRatio: 0.4 }, quadrant: 'A' },
]
const projectPmis = {
  P1: { status: { 项目级别: 'P1' }, progress: { 里程碑进度状态: '正常' }, risk: {}, cost: {},
    customer: { 最终客户: '客甲' }, team: { AR: 'a', SR: 's' } },
}

function seed(isSuper = true) {
  const data = useDataStore()
  data.data = { projects, projectPmis, paymentNodes: {}, projectMilestones: {} } as any
  const auth = useAuthStore()
  auth.user = { account: 'admin', isSuper, allowedPages: ['*'], allowedL4: ['*'] } as any
  const temp = useTempFollowupStore()
  temp.instances = [{
    id: 'inst-1',
    name: '事项一',
    scope: { combinator: 'AND', groups: [
      { combinator: 'AND', conditions: [{ group: 'project', field: 'orgL4', op: 'in', values: ['银行服务组'] }] },
    ] },
    current: {},
    archives: [],
  }] as any
  temp.activeId = 'inst-1'
  temp.loaded = true
}

describe('TempInstancePanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // projectTags.load 会发真实网络请求（/api/tags），测试环境 mock 掉
    useProjectTagsStore().load = vi.fn().mockResolvedValue(undefined)
    pushMock.mockClear()
  })

  it('渲染超管配置的自定义列表头', async () => {
    seed()
    const fc = useFollowupColumnsStore()
    fc.configs = { temp: [{ key: 'cf-t', label: '责任人', type: 'text', clearOnArchive: false }],
      risk: [], payment_key: [], opportunity: [] } as any
    fc.loaded = true
    const w = mount(TempInstancePanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('责任人')
  })

  it('未配置自定义列时表头不受影响(向后兼容)', async () => {
    seed()
    const fc = useFollowupColumnsStore()
    fc.configs = { temp: [], risk: [], payment_key: [], opportunity: [] } as any
    fc.loaded = true
    const w = mount(TempInstancePanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('项目编号')
    expect((w.vm as any).ALL_COLUMNS.map((c: any) => c.key)).not.toContain(undefined)
  })

  it('普通管理员不见「列设置」按钮,超管可见', async () => {
    seed(false)
    const fc = useFollowupColumnsStore()
    fc.configs = { temp: [{ key: 'cf-t', label: '责任人', type: 'text', clearOnArchive: false }],
      risk: [], payment_key: [], opportunity: [] } as any
    fc.loaded = true
    const wNormal = mount(TempInstancePanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wNormal.text()).not.toContain('列设置')

    seed(true)
    const wSuper = mount(TempInstancePanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wSuper.text()).toContain('列设置')
  })

  // V4.4.4 契约③④：/projects/temp 分片
  it('V4.4.4 契约③ ALL_COLUMNS 覆盖全部可借列', async () => {
    seed()
    const fc = useFollowupColumnsStore()
    fc.configs = { temp: [], risk: [], payment_key: [], opportunity: [] } as any
    fc.loaded = true
    const w = mount(TempInstancePanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const keys = new Set((w.vm as any).ALL_COLUMNS.map((c: any) => c.key))
    for (const k of BORROWABLE_KEYS) expect(keys.has(k)).toBe(true)
  })
  it('V4.4.4 契约④ 借入列默认不可见', async () => {
    seed()
    const fc = useFollowupColumnsStore()
    fc.configs = { temp: [], risk: [], payment_key: [], opportunity: [] } as any
    fc.loaded = true
    const w = mount(TempInstancePanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vis = (w.vm as any).prefs.visibleKeys.value
    for (const k of ['plannedCloseDate', 'actualCloseDate', 'originSetupDate', 'tags', 'signUnit']) {
      expect(vis).not.toContain(k)
    }
    expect(vis).toContain('weekProgress')   // 自有默认列未受影响
  })

  // 接线回归:lib 层契约③只证明 buildTempRows 会用 assignments,证明不了本组件真的传了。
  // 漏传时 tags 恒 []、列渲染成空白且不报任何错 —— 生产 V4.5.6 就这样空了一版。
  it('标签列取到与 /project/:id 同源的标签', async () => {
    seed()
    const pt = useProjectTagsStore()
    pt.assignments = { P1: ['佳杰'] }
    pt.loaded = true
    const fc = useFollowupColumnsStore()
    fc.configs = { temp: [], risk: [], payment_key: [], opportunity: [] } as any
    fc.loaded = true
    const w = mount(TempInstancePanel, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const prefs = (w.vm as any).prefs
    prefs.toggle('tags')                     // 借入列默认不可见,先打开
    try {
      await flushPromises()
      expect(w.text()).toContain('佳杰')
    } finally {
      // useColumnPrefsDynamic 持久化到 localStorage,不还原会漏进后续用例
      prefs.toggle('tags')
    }
  })
})
