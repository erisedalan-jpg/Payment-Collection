import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ClosedProjectDetailView from './ClosedProjectDetailView.vue'
import { useDataStore } from '@/stores/data'

const CP = {
  projectId: 'C-1', projectName: '终端甲', projectManager: '何平', orgL4: '安全A组', orgL3_1: '三部一组',
  合同编号: 'HT-1',
  team: { 项目经理: '何平', L4部门: '安全A组', L3部门: '安全事业部', L3_1部门: '三部一组', AR: 'AR张', SR: 'SR李', CSR: 'CSR王', CDR: 'CDR赵', Sponsor: 'Sponsor陈' },
  customer: { 最终客户: '客A', 签约单位: '甲单位', 合同总额: 1000000, 行业: '金融' },
  status: { 项目状态: '已验收', 项目级别: 'B', 项目类型: '实施项目', 评级: 'A' },
  progress: { 项目阶段: '项目收尾', 完工进展: 1 },
  cost: { 总预算: 1000, 核算: 1200, 剩余预算: -200, 消耗比: 1.2, 项目超支: true, 交付超支: true, 成本状态: '红色预警' },
  closeInfo: { 关闭时间: '2025-08-15', 是否正常关闭: '是', 关闭说明: '正常结项', 计划终验时间: '2025-07-01' },
}

function mountAt(id: string) {
  const router = createRouter({ history: createWebHistory(), routes: [
    { path: '/closed-project/:id', component: ClosedProjectDetailView },
    { path: '/projects/closed', component: { template: '<div/>' } },
  ] })
  router.push(`/closed-project/${id}`)
  return router.isReady().then(() => mount(ClosedProjectDetailView, { global: { plugins: [router] } }))
}

describe('ClosedProjectDetailView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('四块渲染 + L3-1部门键守护(下划线键→连字符标签)', async () => {
    const ds = useDataStore(); ds.data = { closedProjects: [CP] } as any
    const w = await mountAt('C-1')
    expect(w.text()).toContain('终端甲')
    expect(w.text()).toContain('关闭时间')
    expect(w.text()).toContain('2025-08-15')
    expect(w.text()).toContain('正常结项')                 // closeInfo
    expect(w.text()).toContain('L3-1部门')                 // 团队块:连字符标签
    expect(w.text()).toContain('三部一组')                 // 下划线键值
    expect(w.text()).toContain('AR张')
    expect(w.text()).toContain('甲单位')                   // 客户:签约单位
    expect(w.text()).toContain('HT-1')                     // 客户:合同编号
    expect(w.text()).toContain('项目超支')                 // 成本块
    expect(w.text()).toContain('是')
  })

  it('未找到→404 文案', async () => {
    const ds = useDataStore(); ds.data = { closedProjects: [CP] } as any
    const w = await mountAt('NOPE')
    expect(w.text()).toContain('不在交付三部已关闭清单')
  })
})
