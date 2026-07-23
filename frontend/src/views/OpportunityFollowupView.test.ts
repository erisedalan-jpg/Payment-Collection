import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import OpportunityFollowupView from './OpportunityFollowupView.vue'
import { useAuthStore } from '@/stores/auth'
import * as oppApi from '@/lib/opportunitiesApi'
import * as oppfApi from '@/lib/opportunityFollowupApi'
import { DEFAULT_OPP_SCOPE } from '@/lib/opportunityScope'
import { useFollowupColumnsStore } from '@/stores/followupColumns'

// 既有测试未预置 followupColumns store 时,onMounted 会触发真实 fcStore.load();
// mock 掉底层 API 避免真实网络调用,默认四表皆空(与升级前行为逐字一致)。
vi.mock('@/lib/followupColumns', () => ({
  followupColumnsApi: {
    getAll: vi.fn().mockResolvedValue({ temp: [], risk: [], payment_key: [], opportunity: [] }),
    add: vi.fn(), update: vi.fn(), reorder: vi.fn(), remove: vi.fn(),
  },
}))

const ROWS = [
  { id: 'opp-1', name: '甲商机', customer: '甲公司', top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '招投标', amountWan: 200, opportunityLevel: 'P1', frOwner: '王', lastUpdate: '2026-06-20' },
  { id: 'opp-2', name: '乙商机', customer: '乙公司', top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '赢单', amountWan: 80, opportunityLevel: 'P3', frOwner: '李', lastUpdate: '2026-06-01' },
  { id: 'opp-3', name: '丙商机', customer: '丙公司', top1000: '非TOP1000', earlyIntervene: '否', keyOpp: '否', status: '意向沟通', amountWan: 50, opportunityLevel: 'P4', frOwner: '赵', lastUpdate: '2026-05-01' },
]

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(oppApi.opportunitiesApi, 'list').mockResolvedValue({ rows: ROWS as any })
  vi.spyOn(oppfApi.opportunityFollowupApi, 'get').mockResolvedValue({
    scope: DEFAULT_OPP_SCOPE, current: { 'opp-1': { weekProgress: '本周推进', weekProgressEditTime: '2026-06-25 10:00', weekProgressEditBy: 'admin' } }, archives: [],
  } as any)
})

async function mountView(isSuper = true) {
  const auth = useAuthStore()
  auth.user = { account: 't', displayName: 't', isSuper, allowedPages: ['*'], allowedL4: [] } as any
  const w = mount(OpportunityFollowupView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return w
}

describe('OpportunityFollowupView', () => {
  it('默认范围只保留命中商机(opp-1):状态非赢单+三条件齐', async () => {
    const w = await mountView(true)
    const ids = (w.vm as any).inScopeRows.map((r: any) => r.id)
    expect(ids).toEqual(['opp-1'])
  })
  it('默认列含跟进四列与商机级别;跟进进展单元格渲染时间+内容', async () => {
    const w = await mountView(true)
    const html = w.html()
    expect(html).toContain('本周工作进展')
    expect(html).toContain('跟进人')
    expect(html).toContain('商机级别')
    expect(w.text()).toContain('2026-06-25 10:00：本周推进')
  })
  it('超管见范围设置/更新/导出按钮;普通管理员不见', async () => {
    const ws = await mountView(true)
    expect(ws.text()).toContain('范围设置')
    const wn = await mountView(false)
    expect(wn.text()).not.toContain('范围设置')
  })

  // V2.6.3:分页 + 总数(同 /projects)
  it('S1:>50 行触发分页,总数与渲染行数受控', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      id: `opp-${i}`, name: `商机${i}`, customer: `客户${i}`, top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是',
      status: '招投标', amountWan: 100, opportunityLevel: 'P2', frOwner: '王', lastUpdate: '2026-06-20',
    }))
    vi.spyOn(oppApi.opportunitiesApi, 'list').mockResolvedValue({ rows: many as any })
    const w = await mountView(true)
    expect(w.text()).toContain('共 51 条')
    expect(w.find('.el-pagination').exists()).toBe(true)
    expect(w.findAll('.el-table__body-wrapper tbody tr').length).toBeLessThanOrEqual(50)
  })

  it('渲染超管配置的自定义列表头', async () => {
    const fc = useFollowupColumnsStore()
    fc.configs = { temp: [], risk: [], payment_key: [],
      opportunity: [{ key: 'cf-z', label: '客户联系人', type: 'text', clearOnArchive: false }] } as any
    fc.loaded = true
    const w = await mountView(true)
    expect(w.text()).toContain('客户联系人')
  })
})
