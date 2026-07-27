import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import BoardView from './BoardView.vue'
import DataTable from '@/components/DataTable.vue'
import ChartBox from '@/charts/ChartBox.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { ALL_PAGE_LINKS } from '@/nav'

let routeQuery: Record<string, string> = {}
vi.mock('vue-router', () => ({ useRoute: () => ({ query: routeQuery }) }))
vi.mock('@/lib/projectTagsApi', () => ({
  getTags: vi.fn(async () => ({ tags: [], assignments: {} })),
  saveTags: vi.fn(async () => ({ success: true })),
}))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); routeQuery = {} })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [],
    projects: [
      { projectId: 'P1', projectName: '甲项目', orgL4: '北京', projectManager: '张三',
        payment: { relatedNodeCount: 3, expectedTotal: 1500000, actualTotal: 600000, remainingTotal: 900000, paymentRatio: 0.3, delayedCount: 2 },
        paymentPmis: { contract: 2000000, actualTotal: 600000, expectedTotal: 1500000, delayedCount: 2, nodeCount: 3, reachedCount: 1, fromOrigin: true } },
      { projectId: 'P2', projectName: '乙项目', orgL4: '上海', projectManager: '李四',
        payment: { relatedNodeCount: 1, expectedTotal: 300000, actualTotal: 300000, remainingTotal: 0, paymentRatio: 1, delayedCount: 0 },
        paymentPmis: { contract: 300000, actualTotal: 300000, expectedTotal: 300000, delayedCount: 0, nodeCount: 1, reachedCount: 1, fromOrigin: true } },
    ],
    projectPmis: {
      P1: { progress: { 项目阶段: '实施' }, customer: { 行业: '金融' }, status: { 项目级别: 'A级' } },
      P2: { progress: { 项目阶段: '验收' }, customer: { 行业: '政务' }, status: { 项目级别: 'B级' } },
    },
    displayColumns: {}, followupRecords: {},
    paymentNodes: {
      P1: [
        { planDate: '2026-01-01', expectedPayment: 600000, unpaidAmount: 400000, status: '延期', reached: false },
        { planDate: '2026-06-01', expectedPayment: 900000, unpaidAmount: 500000, status: '延期', reached: false },
      ],
      P2: [
        { planDate: '2026-01-01', expectedPayment: 300000, unpaidAmount: 0, status: '已到账', reached: true },
      ],
    },
    paymentRecords: {
      P1: { records: [{ date: '2026-01-15', amount: 600000 }] },
      P2: { records: [{ date: '2026-01-20', amount: 300000 }] },
    },
  } as any
}

const opts = { global: { plugins: [ElementPlus], stubs: { BoardDrilldownModal: true } } }

/** 存档按账号隔离(userScopedKey),持久化用例须先登录,存档键才是确定的 's:view_board'。 */
function login(account = 's') {
  useAuthStore().user = {
    account, displayName: account, isSuper: true, allowedPages: ['*'], allowedL4: [],
  } as any
}
/** 挂载辅助:seed + mount,供「卸载 → 重新挂载」的持久化往返用例复用。 */
function mountView() {
  seed()
  return mount(BoardView, opts)
}

describe('BoardView', () => {
  it('默认单维模式：排名表为 DataTable，含两组(北京/上海)', () => {
    seed()
    const w = mount(BoardView, opts)
    const dt = w.findComponent(DataTable)
    expect(dt.exists()).toBe(true)
    const rows = dt.props('rows') as Array<Record<string, any>>
    expect(rows.length).toBe(2)
    expect(rows.some((r) => r.key === '北京')).toBe(true)
    expect(rows.some((r) => r.key === '上海')).toBe(true)
  })

  it('维度集为新 5 维(含 L4部门/标签)，旧维(金额档/进度态)退场', () => {
    seed()
    const w = mount(BoardView, opts)
    expect(w.text()).toContain('L4部门')
    expect(w.text()).toContain('项目级别')
    expect(w.text()).toContain('标签')
    expect(w.text()).not.toContain('金额档')
    expect(w.text()).not.toContain('进度态')
  })

  it('排名表列含五指标 + 新增「排序」选项卡(默认项目数),切合同金额重排', async () => {
    seed()
    const w = mount(BoardView, opts)
    await flushPromises()
    const cols = (w.findComponent(DataTable).props('columns') as Array<{ key: string }>).map((c) => c.key)
    expect(cols).toEqual(['key', 'projectCount', 'contractSum', 'expectedSum', 'rate', 'delayedNodeSum'])
    // 新增排序选项卡(四项)
    expect(w.find('[data-test="seg-projectCount"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-contractSum"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-rate"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-delayedNodeSum"]').exists()).toBe(true)
    // 默认按项目数:北京/上海各 1 个项目,顺序稳定;切到合同金额后按 contractSum 降序(北京 200万 > 上海 30万)
    await w.get('[data-test="seg-contractSum"]').trigger('click')
    const rows = w.findComponent(DataTable).props('rows') as Array<Record<string, any>>
    expect(rows[0].key).toBe('北京')
  })

  it('单维点击行打开下钻', async () => {
    seed()
    const w = mount(BoardView, opts)
    const dt = w.findComponent(DataTable)
    const rows = dt.props('rows') as Array<Record<string, any>>
    await dt.vm.$emit('row-click', rows[0])
    expect((w.vm as any).drillOpen).toBe(true)
  })

  it('柱状图随排序指标换口径：默认项目数→各组计数；切合同金额→合同额(万)', async () => {
    seed()
    const w = mount(BoardView, opts)
    await flushPromises()
    // 默认 sort=projectCount(count)：北京/上海各 1 个项目
    let opt = (w.findComponent(ChartBox).props('option') as any)
    expect(opt.series[0].data).toEqual([1, 1])
    expect(w.text()).toContain('项目数排名')
    // 切合同金额(amount,÷万)：北京 200万 居首
    await w.get('[data-test="seg-contractSum"]').trigger('click')
    opt = (w.findComponent(ChartBox).props('option') as any)
    expect(opt.xAxis.data[0]).toBe('北京')
    expect(opt.series[0].data[0]).toBe(200)
    expect(w.text()).toContain('合同金额排名')
  })

  it('完成率指标饼图降级(pieRenderable=false)，合同金额可饼图', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-rate"]').trigger('click')
    expect((w.vm as any).pieRenderable).toBe(false)
    await w.get('[data-test="seg-contractSum"]').trigger('click')
    expect((w.vm as any).pieRenderable).toBe(true)
  })

  it('切交叉模式选标签为次维度渲染矩阵', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-cross"]').trigger('click')
    const tagBtns = w.findAll('[data-test="seg-tag"]')
    await tagBtns[tagBtns.length - 1].trigger('click')
    expect(w.find('.bm').exists()).toBe(true)
  })

  it('切透视模式默认渲染透视表(行=L4部门)', async () => {
    seed()
    const w = mount(BoardView, opts)
    await w.get('[data-test="seg-pivot"]').trigger('click')
    expect(w.find('.pv').exists()).toBe(true)
    expect(w.text()).toContain('北京')
  })

  it('deep-link ?dim=orgL4 落到 L4部门(dept)', () => {
    seed()
    routeQuery = { dim: 'orgL4' }
    const w = mount(BoardView, opts)
    const rows = w.findComponent(DataTable).props('rows') as Array<Record<string, any>>
    expect(rows.some((r) => r.key === '北京')).toBe(true) // dept 分组
    expect((w.vm as any).dimKey).toBe('dept') // orgL4 别名解析为 dept
  })

  it('渲染页头标题(与 nav.ts 的 label 逐字一致)', async () => {
    login()
    const w = mountView()
    await flushPromises()
    // 与 nav.ts 比对而非各写各的字面量:否则会出现「侧栏叫回款多维分析、页头叫回款看板」
    expect(w.find('.ph-title').text()).toBe(ALL_PAGE_LINKS.find((l) => l.to === '/payment/board')!.label)
  })

  it('维度选择持久化:改 dimKey → 卸载 → 重新挂载后仍是该值', async () => {
    login()
    const w1 = mountView()
    await flushPromises()
    // 走真实交互路径(点维度选项卡)而非直接给 vm 赋值,避免赋值静默无效导致的假绿
    await w1.get('[data-test="seg-industry"]').trigger('click')
    expect((w1.vm as any).dimKey).toBe('industry')
    await nextTick()                           // 等 watch 落盘
    w1.unmount()

    const w2 = mountView()
    await flushPromises()
    expect((w2.vm as any).dimKey).toBe('industry')
  })

  it('URL 的 ?dim= 压过 localStorage 存档', async () => {
    // 存档 industry,URL 带 dim=dept → 取 dept(显式跳转意图 > 上次选择)
    login()
    localStorage.setItem('s:view_board', JSON.stringify({ dimKey: 'industry' }))
    routeQuery = { dim: 'dept' }
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).dimKey).toBe('dept')
  })

  it('带 ?dim= 进入时行维度跟随主维度(rowDims 与 dimKey 同步)', async () => {
    // 原 rowDims 初值就是 initDim;改造后若漏了 URL 分支里的同步,透视模式的行维度会与主维度打架
    login()
    localStorage.setItem('s:view_board', JSON.stringify({ dimKey: 'dept', rowDims: ['dept'] }))
    routeQuery = { dim: 'industry' }
    const w = mountView()
    await flushPromises()
    expect((w.vm as any).dimKey).toBe('industry')
    expect((w.vm as any).rowDims).toEqual(['industry'])
  })

  it('八个视图状态全部入档,modal 状态 drillOpen 不入档(否则重进页面会弹空 modal)', async () => {
    login()
    const w1 = mountView()
    await flushPromises()
    await w1.get('[data-test="seg-industry"]').trigger('click')   // 先动一个被持久化的状态,触发落盘
    const dt = w1.findComponent(DataTable)
    await dt.vm.$emit('row-click', (dt.props('rows') as Array<Record<string, any>>)[0])
    expect((w1.vm as any).drillOpen).toBe(true)   // 先证明下钻确实打开了,否则下面的断言恒真
    await nextTick()
    w1.unmount()

    const saved = JSON.parse(localStorage.getItem('s:view_board') ?? '{}')
    expect(Object.keys(saved).sort()).toEqual(
      ['chartTypes', 'colDims', 'dimKey', 'metricKey', 'mode', 'rowDims', 'secondDim', 'sortKey'])

    const w2 = mountView()
    await flushPromises()
    expect((w2.vm as any).drillOpen).toBe(false)
  })
})
