import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import RiskBoardView from './RiskBoardView.vue'
import DataTable from '@/components/DataTable.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => setActivePinia(createPinia()))

const rec = (lvl: string, status: string) => ({ 风险等级: lvl, 风险状态: status })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 },
    projects: [
      { projectId: 'P1', projectName: '甲', orgL4: '北京', projectManager: '张三' },
      { projectId: 'P2', projectName: '乙', orgL4: '上海', projectManager: '李四' },
      { projectId: 'P3', projectName: '丙', orgL4: '北京', projectManager: '张三' },
    ],
    projectPmis: {
      P1: { status: { 项目级别: 'A级' }, customer: { 行业: '金融', 合同总额: 1000000 }, riskRecords: [rec('高', '未关闭')] },
      P2: { status: { 项目级别: 'B级' }, customer: { 行业: '政务', 合同总额: 500000 }, riskRecords: [rec('中', '处理中')] },
      P3: { status: { 项目级别: 'A级' }, customer: { 行业: '金融', 合同总额: 300000 }, riskRecords: [rec('高', '已关闭')] },
    },
    displayColumns: {}, followupRecords: {},
  } as any
}

const opts = { global: { plugins: [ElementPlus] } }

describe('RiskBoardView', () => {
  it('渲染 4 卡片:健康度 33.3% / 高1 / 中1 / 低0', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    const t = w.text()
    expect(t).toContain('项目健康度')
    expect(t).toContain('无风险 1 / 全量 3')   // P3 全部已关闭 → 无风险
    expect(t).toContain('高风险项目')
    expect(t).toContain('中风险项目')
    expect(t).toContain('低风险项目')
  })
  it('排名维度与统计选项存在', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    expect(w.find('[data-test="seg-riskLevel"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-orgL4"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-projectCount"]').exists()).toBe(true)
    expect(w.find('[data-test="seg-contractAmount"]').exists()).toBe(true)
  })
  it('概览表含 高/中/低/无风险/合计/健康度% 列', () => {
    seed()
    const w = mount(RiskBoardView, opts)
    const tables = w.findAllComponents(DataTable)
    const ovCols = (tables[tables.length - 1].props('columns') as Array<{ key: string }>).map((c) => c.key)
    expect(ovCols).toEqual(['key', '高', '中', '低', '无风险', 'total', 'healthPct'])
  })
  it('空数据显空态', () => {
    const ds = useDataStore()
    ds.data = { meta: {}, projects: [], projectPmis: {}, displayColumns: {}, followupRecords: {} } as any
    const w = mount(RiskBoardView, opts)
    expect(w.text()).toContain('暂无项目主域数据')
  })
})
