import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RiskFollowupView from './RiskFollowupView.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useRiskFollowupStore } from '@/stores/riskFollowup'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: pushMock }) }))

vi.mock('@/lib/riskFollowupApi', () => ({
  riskFollowupApi: {
    get: vi.fn().mockResolvedValue({ scope: { combinator: 'AND', groups: [] }, current: {}, archives: [] }),
    saveScope: vi.fn(), update: vi.fn(), archive: vi.fn(),
  },
}))

function seed(isSuper = true) {
  const data = useDataStore()
  ;(data as any).data = {
    projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '一组', paymentPmis: { contract: 2_000_000 } }],
    projectPmis: { P1: { status: { 项目级别: 'P1' }, riskRecords: [
      { 风险编码: 'FX-1', 风险名称: '进度风险', 风险等级: '高', 风险状态: '未关闭', 风险大类: '进度', 风险小类: '排期', 风险描述: '长文本', 备注: '附加列' },
      { 风险编码: 'FX-2', 风险名称: '成本风险', 风险等级: '中', 风险状态: '已关闭', 风险大类: '成本', 风险小类: '人力' },
    ] } },
  }
  const auth = useAuthStore(); (auth as any).user = { isSuper, allowedPages: ['*'], allowedL4: ['*'] }
  const risk = useRiskFollowupStore(); risk.loaded = true; risk.scope = { combinator: 'AND', groups: [] }
}

function seedMany(n: number) {
  const data = useDataStore()
  const riskRecords = Array.from({ length: n }, (_, i) => ({
    风险编码: `FX-${i}`, 风险名称: `风险${i}`, 风险等级: '高', 风险状态: '未关闭', 风险大类: '进度', 风险小类: '排期',
  }))
  ;(data as any).data = {
    projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '一组', paymentPmis: { contract: 2_000_000 } }],
    projectPmis: { P1: { status: { 项目级别: 'P1' }, riskRecords } },
  }
  const auth = useAuthStore(); (auth as any).user = { isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }
  const risk = useRiskFollowupStore(); risk.loaded = true; risk.scope = { combinator: 'AND', groups: [] }
}

describe('RiskFollowupView', () => {
  beforeEach(() => setActivePinia(createPinia()))
  beforeEach(() => pushMock.mockClear())
  it('默认展示全部风险(含已关闭),16 默认列含跟进三列', async () => {
    seed()
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as any
    expect(vm.allRows.length).toBe(2)         // FX-1 + FX-2(已关闭)都在
    expect(vm.scopedRows.length).toBe(2)      // 空范围 → 全量
    expect(w.text()).toContain('风险跟进')
    // 跟进三列默认可见
    for (const lbl of ['跟进动作', 'rev结论', '下次rev时间']) expect(w.text()).toContain(lbl)
  })
  it('有范围条件时按风险行过滤', async () => {
    seed()
    const risk = useRiskFollowupStore()
    risk.scope = { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [{ field: '风险状态', op: 'in', values: ['未关闭'] }] }] }
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect((w.vm as any).scopedRows.map((r: any) => r.riskKey)).toEqual(['P1::FX-1'])
  })
  it('普通管理员不见范围/归档/导出按钮', async () => {
    seed(false)
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).not.toContain('范围设置')
    expect(w.text()).not.toContain('归档（留存跟进）')
  })
  it('历史模式:超管见「删除此历史」按钮,普通管理员不见', async () => {
    seed(true)
    const risk = useRiskFollowupStore()
    risk.archives = [{ archiveTime: '2026-06-01 10:00', rows: [] }] as any
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    ;(w.vm as any).mode = 'history'
    await w.vm.$nextTick()
    expect(w.text()).toContain('删除此历史')
  })
  it('重访场景(store+data 挂载前已 load)下,切到历史模式 paged/filtered 显示归档行而非当前数据(V2.6.9 C1 回归)', async () => {
    // seed() 让 data.data 与 risk.loaded 在 mount 前就绪 → onMounted 里 data.load()/risk.load() 守卫短路不再触发,
    // currentRows 构造后不会再因异步数据到达而失效一次——旧 fpRef 兜底写法下 isCurrent/historyIdx 永远不会被
    // rows 计算属性登记为依赖,切换历史模式后表格仍停留在当前数据。
    seed(true)
    const risk = useRiskFollowupStore()
    risk.archives = [{
      archiveTime: '2026-06-01 10:00',
      rows: [{ riskKey: 'ARCHIVED::FX-9', 风险编码: 'FX-9', 风险名称: '已归档风险', 项目名称: '归档项目' }],
    }] as any
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as any
    // 挂载后默认当前模式:显示 2 条实时风险(FX-1/FX-2)
    expect(vm.paged.length).toBe(2)
    vm.mode = 'history'
    vm.historyIdx = 0
    await w.vm.$nextTick()
    expect(vm.filtered.length).toBe(1)
    expect(vm.paged.length).toBe(1)
    expect(vm.paged[0].riskKey).toBe('ARCHIVED::FX-9')
  })
  it('客户列存在于 ALL_COLUMNS 但不在默认可见 16 列', async () => {
    seed()
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as any
    expect(vm.allKeys).toContain('客户')                       // 可选列存在
    expect(vm.prefs.visibleKeys.value).not.toContain('客户')   // 默认隐藏
  })
  it('普通管理员历史模式不见删除按钮', async () => {
    seed(false)
    const risk = useRiskFollowupStore()
    risk.archives = [{ archiveTime: '2026-06-01 10:00', rows: [] }] as any
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    ;(w.vm as any).mode = 'history'
    await w.vm.$nextTick()
    expect(w.text()).not.toContain('删除此历史')
  })
  it('分页器与总数;>50 行时单页渲染行数≤50', async () => {
    seedMany(55)
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('.kp-pager').exists()).toBe(true)
    expect(w.text()).toContain('共 55 条')
    expect(w.text()).toContain('合同金额合计')
    expect(w.find('.el-pagination').exists()).toBe(true)
    const bodyRows = w.findAll('tbody tr')
    expect(bodyRows.length).toBeLessThanOrEqual(50)
  }, 20000) // 渲染满页(55行)重表,并行争用下放宽超时
  it('下次rev时间列头渲染 ColumnFilter；rev结论列富文本化后不再可筛选(V2.8.2)', async () => {
    seed()
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const vm = w.vm as any
    expect(vm.FILTERABLE.has('revConclusion')).toBe(false)   // V2.8.2:富文本化后移除筛选
    expect(vm.FILTERABLE.has('nextRevDate')).toBe(true)
    const filters = w.findAllComponents(ColumnFilter)
    const filteredKeys = filters.map((f) => f.props('colKey'))
    expect(filteredKeys).not.toContain('revConclusion')
    expect(filteredKeys).toContain('nextRevDate')
  })
  it('冷加载(F5:业务数据挂载后才到达):持久化的风险列与排序在数据到达后完整恢复', async () => {
    // 复现 F5 冷加载:auth 已就绪(路由守卫保证),但 data.data 尚未到达。
    // 持久化一份含「非默认风险列」的自定义选列 + 一个按风险列的排序。
    const account = 'admin'
    localStorage.setItem('colprefs:' + account + ':risk-followup',
      JSON.stringify(['风险编码', '风险等级', '备注', '项目编号', '项目名称']))
    localStorage.setItem('colsort:' + account + ':risk-followup',
      JSON.stringify({ prop: '风险等级', order: 'asc' }))
    const auth = useAuthStore(); (auth as any).user = { account, isSuper: true, allowedPages: ['*'], allowedL4: ['*'] }
    const risk = useRiskFollowupStore(); risk.loaded = true; risk.scope = { combinator: 'AND', groups: [] }
    const data = useDataStore()
    vi.spyOn(data, 'load').mockResolvedValue(undefined as any)   // data.data=null → onMounted 会调 load,置空避免真实拉取
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    // 业务数据到达(异步)
    ;(data as any).data = {
      projects: [{ projectId: 'P1', projectName: '甲', projectManager: '张', orgL4: '一组', paymentPmis: { contract: 2_000_000 } }],
      projectPmis: { P1: { status: { 项目级别: 'P1' }, riskRecords: [
        { 风险编码: 'FX-1', 风险名称: '进度风险', 风险等级: '高', 风险状态: '未关闭', 风险大类: '进度', 风险小类: '排期', 风险描述: '长文本', 备注: '附加列' },
      ] } },
    }
    await flushPromises()
    const vm = w.vm as any
    // 选列:全部持久化列(含非默认风险列 风险等级/备注)在数据到达后完整恢复,顺序不变
    expect(vm.prefs.visibleKeys.value).toEqual(['风险编码', '风险等级', '备注', '项目编号', '项目名称'])
    // 排序:被排序的风险列存在于可见列 → el-table :default-sort 才能落地;defaultSort 保持持久化值
    expect(vm.prefs.visibleKeys.value).toContain('风险等级')
    expect(vm.psort.defaultSort.value).toEqual({ prop: '风险等级', order: 'ascending' })
  })
  it('点行下钻到该风险项目 /project/:id', async () => {
    seed()
    const w = mount(RiskFollowupView, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    await w.find('.el-table__row').trigger('click')
    expect(pushMock).toHaveBeenCalledWith('/project/P1')
  })
})
