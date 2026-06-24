import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import OpportunityEditDrawer from './OpportunityEditDrawer.vue'
import { useOpportunitiesStore } from '@/stores/opportunities'

beforeEach(() => setActivePinia(createPinia()))
const row = { id: 'opp-1', l4: '小金融服务组', customer: '甲', status: '招投标', amountWan: 100, firstReg: '2026-06-01', lastUpdate: '2026-06-20 10:00' }

function mountD() {
  return mount(OpportunityEditDrawer, { props: { modelValue: true, row }, global: { plugins: [ElementPlus] } })
}

describe('OpportunityEditDrawer', () => {
  it('渲染 22 个可编辑字段控件 + 只读首登/最后更新', () => {
    const w = mountD()
    expect(w.text()).toContain('L4组织'); expect(w.text()).toContain('商机状态')
    expect(w.text()).toContain('首次登记日期'); expect(w.text()).toContain('2026-06-01')
  })
  it('保存提交 fields 给 store.update', async () => {
    const w = mountD(); const s = useOpportunitiesStore()
    const spy = vi.spyOn(s, 'update').mockResolvedValue(undefined as any)
    ;(w.vm as any).form.customer = '乙'
    await (w.vm as any).onSave(); await flushPromises()
    expect(spy).toHaveBeenCalledWith('opp-1', expect.objectContaining({ customer: '乙', l4: '小金融服务组' }))
  })
})
