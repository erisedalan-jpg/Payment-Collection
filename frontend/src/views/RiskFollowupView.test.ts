import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import RiskFollowupView from './RiskFollowupView.vue'
import { useDataStore } from '@/stores/data'
import { useAuthStore } from '@/stores/auth'
import { useRiskFollowupStore } from '@/stores/riskFollowup'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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

describe('RiskFollowupView', () => {
  beforeEach(() => setActivePinia(createPinia()))
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
})
