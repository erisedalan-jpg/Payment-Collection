import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import { createRouter, createMemoryHistory, type Router } from 'vue-router'
import { nextTick } from 'vue'
import OpportunitiesView from './OpportunitiesView.vue'
import { useAuthStore } from '@/stores/auth'
import { useOpportunitiesStore } from '@/stores/opportunities'
import * as oppApi from '@/lib/opportunitiesApi'
import { DEFAULT_VISIBLE } from '@/lib/opportunityColumns'

let router: Router

// 近7天日期字符串
function recentDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 3)
  return d.toISOString().slice(0, 10)
}
// 超过7天的旧日期
function oldDate(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

const ROW_甲 = {
  id: 'r1', l4: '小金融服务组', salesOwner: '张三', customer: '甲公司',
  industry: '金融', top1000: 'TOP1000', status: '方案设计沟通', forecast: '可参与',
  name: '甲商机', amountWan: 100, expectedDate: '2026-09-01', productCategory: '',
  mainProducts: '', outsource: '否', frOwner: '', frMatch: '是', deliveryMatch: '是',
  crossRegion: '否', keyOpp: '是', earlyIntervene: '否', remark: '',
  bidStatus: '待定', bidDate: '', firstReg: '2026-01-01', lastUpdate: recentDate(),
}
const ROW_乙 = {
  id: 'r2', l4: '银行服务组', salesOwner: '李四', customer: '乙公司',
  industry: '银行', top1000: '非TOP1000', status: '招投标', forecast: '可承诺',
  name: '乙商机', amountWan: 200, expectedDate: '2026-10-01', productCategory: '',
  mainProducts: '', outsource: '是', frOwner: '', frMatch: '否', deliveryMatch: '否',
  crossRegion: '是', keyOpp: '否', earlyIntervene: '否', remark: '',
  bidStatus: '已中标', bidDate: '', firstReg: '2026-02-01', lastUpdate: oldDate(),
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(oppApi.opportunitiesApi, 'list').mockResolvedValue({ rows: [ROW_甲, ROW_乙] })
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/opportunities', component: OpportunitiesView }],
  })
})

async function mountView(isSuper = true) {
  const auth = useAuthStore()
  auth.user = { account: 'test', displayName: '测试', isSuper, allowedPages: ['opportunities'], allowedL4: [] } as any
  await router.push('/opportunities')
  await router.isReady()
  const w = mount(OpportunitiesView, { global: { plugins: [ElementPlus, router] } })
  await flushPromises()
  return w
}

describe('OpportunitiesView', () => {
  it('(a) 超管挂载后渲染选择列', async () => {
    const w = await mountView(true)
    // 超管时 auth.isSuper 为 true，视图应渲染 selection 列
    expect((w.vm as any).auth.isSuper).toBe(true)
    // HTML 中应含 selection 相关 th
    const html = w.html()
    expect(html).toContain('el-table-column--selection')
  })

  it('(b) 普通管理员不渲染选择列', async () => {
    const w = await mountView(false)
    expect((w.vm as any).auth.isSuper).toBe(false)
    const html = w.html()
    expect(html).not.toContain('el-table-column--selection')
  })

  it('(c) DEFAULT_VISIBLE 的列标签出现，未默认显示的列不出现', async () => {
    const w = await mountView(true)
    const html = w.html()
    // DEFAULT_VISIBLE 列应出现（如"客户名称""商机状态"）
    expect(html).toContain('客户名称')
    expect(html).toContain('商机状态')
    // 非 DEFAULT_VISIBLE 的列：'主要涉及产品' 对应 key='mainProducts' 不在默认显示
    expect(DEFAULT_VISIBLE).not.toContain('mainProducts')
    expect(html).not.toContain('主要涉及产品')
  })

  it('(d) 关键词过滤后 filtered 只剩匹配行', async () => {
    const w = await mountView(true)
    const vm = w.vm as any
    // 初始2行
    expect(vm.filtered.length).toBe(2)
    // 设置关键词 '甲'
    vm.fKw = '甲'
    await nextTick()
    expect(vm.filtered.length).toBe(1)
    expect(vm.filtered[0].customer).toBe('甲公司')
    // 设置关键词 '乙'
    vm.fKw = '乙'
    await nextTick()
    expect(vm.filtered.length).toBe(1)
    expect(vm.filtered[0].customer).toBe('乙公司')
    // 清空关键词
    vm.fKw = ''
    await nextTick()
    expect(vm.filtered.length).toBe(2)
  })

  it('(e) recentUpdate 派生：近7天行 recentUpdate=是，旧行=否', async () => {
    const w = await mountView(true)
    const vm = w.vm as any
    const derived = vm.withDerived as Array<Record<string, any>>
    expect(derived.length).toBe(2)
    const 甲 = derived.find((r: any) => r.id === 'r1')
    const 乙 = derived.find((r: any) => r.id === 'r2')
    expect(甲?.recentUpdate).toBe('是')
    expect(乙?.recentUpdate).toBe('否')
  })

  it('defineExpose 暴露 store/filtered/paged/selectedRows/visibleColumns/fKw/sortState', async () => {
    const w = await mountView(true)
    const vm = w.vm as any
    expect(vm.store).toBeDefined()
    expect(vm.filtered).toBeDefined()
    expect(vm.paged).toBeDefined()
    expect(vm.selectedRows).toBeDefined()
    expect(vm.visibleColumns).toBeDefined()
    expect(vm.fKw).toBeDefined()
    expect(vm.sortState).toBeDefined()
  })
})
