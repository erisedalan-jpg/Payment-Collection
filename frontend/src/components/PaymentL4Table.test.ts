import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import PaymentL4Table from './PaymentL4Table.vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

function seed() {
  const data = useDataStore()
  data.data = {
    meta: { lastUpdate: 'x', totalProjects: 2, totalPaymentNodes: 4 },
    dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {},
    projects: [
      {
        projectId: 'P1',
        projectName: '项目甲',
        projectManager: '张三',
        orgL4: '组A',
        paymentPmis: {
          contract: 2_000_000,
          actualTotal: 800_000,
          paymentRatio: 0.4,
          expectedTotal: 1_600_000,
          nodeCount: 3,
          reachedCount: 1,
          delayedCount: 1,
          fromOrigin: false,
        },
      },
      {
        projectId: 'P2',
        projectName: '项目乙',
        projectManager: '李四',
        orgL4: '组B',
        paymentPmis: {
          contract: 1_000_000,
          actualTotal: 500_000,
          paymentRatio: 0.5,
          expectedTotal: 800_000,
          nodeCount: 2,
          reachedCount: 1,
          delayedCount: 0,
          fromOrigin: false,
        },
      },
    ] as any,
    projectPmis: {
      P1: { progress: { 项目阶段: '实施' } },
      P2: { progress: { 项目阶段: '验收' } },
    } as any,
    paymentNodes: {
      P1: [
        { stage: '预付款', planDate: '2026-01-01', actualDate: '', payRatio: 0.3, actualRatio: 0.2, expectedPayment: 600_000, receivedAmount: 400_000, unpaidAmount: 200_000, status: '延期' },
        { stage: '到货款', planDate: '2026-03-01', actualDate: '2026-03-10', payRatio: 0.3, actualRatio: 0.3, expectedPayment: 600_000, receivedAmount: 600_000, unpaidAmount: 0, status: '已回款' },
        { stage: '验收款', planDate: '2026-06-01', actualDate: '', payRatio: 0.4, actualRatio: 0, expectedPayment: 800_000, receivedAmount: 0, unpaidAmount: 800_000, status: '未回款' },
      ],
      P2: [
        { stage: '预付款', planDate: '2026-02-01', actualDate: '2026-02-05', payRatio: 0.5, actualRatio: 0.5, expectedPayment: 400_000, receivedAmount: 400_000, unpaidAmount: 0, status: '已回款' },
        { stage: '验收款', planDate: '2026-07-01', actualDate: '', payRatio: 0.5, actualRatio: 0, expectedPayment: 400_000, receivedAmount: 0, unpaidAmount: 400_000, status: '未回款' },
      ],
    } as any,
    paymentRecords: {
      P1: { records: [{ date: '2026-03-10', amount: 600_000 }] },
      P2: { records: [{ date: '2026-02-05', amount: 400_000 }] },
    } as any,
  } as any
}

describe('PaymentL4Table', () => {
  it('渲染全部 11 列列名', async () => {
    seed()
    useFilterStore().setPreset('all')
    const w = mount(PaymentL4Table, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = w.text()
    expect(text).toContain('L4组')
    expect(text).toContain('项目数')
    expect(text).toContain('合同额(万)')
    expect(text).toContain('已回款(万)')
    expect(text).toContain('回款额完成率')
    expect(text).toContain('延期项目数')
    expect(text).toContain('延期节点')
    expect(text).toContain('延期金额(万)')
    expect(text).toContain('回款节点数')
    expect(text).toContain('完成节点数')
    expect(text).toContain('完成节点比例')
  })

  it('按 L4 组分组，两个不同 orgL4 出两行', async () => {
    seed()
    useFilterStore().setPreset('all')
    const w = mount(PaymentL4Table, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const text = w.text()
    expect(text).toContain('组A')
    expect(text).toContain('组B')
  })

  it('sortable 列在列定义中标记正确（11 列全可排序）', async () => {
    seed()
    useFilterStore().setPreset('all')
    const w = mount(PaymentL4Table, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    // el-table-column 携带 sortable 时会在表头渲染 .caret-wrapper 元素；
    // 若把 COLUMNS 中任意列的 sortable 删除，此处断言即变红。
    const carets = w.findAll('.caret-wrapper')
    // 11 列全部标记 sortable → 11 个排序角标
    expect(carets.length).toBe(11)
  })

  it('区间联动：setPreset(all) 与 setPreset(year) 下数据行不同', async () => {
    // seed() 中所有节点/流水日期均在 2026，无法体现区间变化。
    // 追加 P3（orgL4='组A'），其节点和流水仅在 2025，在 year(2026) 区间内应被过滤掉。
    seed()
    const dataStore = useDataStore()
    // seed() 保证 data 及其子字段已填充；用 any 绕过可选字段的 TS 收窄
    const d = dataStore.data as any
    d.projects.push({
      projectId: 'P3',
      projectName: '项目丙',
      projectManager: '王五',
      orgL4: '组A',
      paymentPmis: {
        contract: 500_000,
        actualTotal: 500_000,
        paymentRatio: 1,
        expectedTotal: 500_000,
        nodeCount: 1,
        reachedCount: 1,
        delayedCount: 0,
        fromOrigin: false,
      },
    })
    d.paymentNodes['P3'] = [
      { stage: '预付款', planDate: '2025-06-01', actualDate: '2025-06-10', payRatio: 1, actualRatio: 1, expectedPayment: 500_000, receivedAmount: 500_000, unpaidAmount: 0, status: '已回款' },
    ]
    d.paymentRecords['P3'] = { records: [{ date: '2025-06-10', amount: 500_000 }] }

    const filter = useFilterStore()

    // all 区间：P3 的节点被统计进 组A
    filter.setPreset('all')
    const wAll = mount(PaymentL4Table, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    // 取 组A 行的文本（包含 actualSum 与 nodeSum 汇总数字）
    const textAll = wAll.text()

    // year(2026) 区间：P3 仅有 2025 节点/流水，应被排除 → 组A 行数值更小
    filter.setPreset('year')
    const wYear = mount(PaymentL4Table, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    const textYear = wYear.text()

    // 两个区间渲染出的表格文本必须不同（P3 的 2025 数据在 year 下消失）
    expect(textAll).not.toBe(textYear)
  })

  it('数字列单元格含 .u-num（tabular-nums 约束）', async () => {
    seed()
    useFilterStore().setPreset('all')
    const w = mount(PaymentL4Table, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    // 10 个数字列每行应有 .u-num；2 行数据 → 至少 10 个 .u-num 元素
    const numCells = w.findAll('.u-num')
    expect(numCells.length).toBeGreaterThanOrEqual(10)
  })

  it('空数据显示空态提示', async () => {
    const data = useDataStore()
    data.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
      dashboard: {}, summary: {}, rawNodes: [], projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {},
      projects: [],
      projectPmis: {},
      paymentNodes: {},
      paymentRecords: {},
    } as any
    useFilterStore().setPreset('all')
    const w = mount(PaymentL4Table, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.text()).toContain('暂无数据')
  })
})
