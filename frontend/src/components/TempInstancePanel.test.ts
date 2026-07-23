import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import TempInstancePanel from './TempInstancePanel.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useFollowupColumnsStore } from '@/stores/followupColumns'

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
})
