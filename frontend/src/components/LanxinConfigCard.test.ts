import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import LanxinConfigCard from './LanxinConfigCard.vue'
import { ISSUE_LABELS } from '@/lib/yitian/compliance'
import { ALL_RISK_CATEGORIES } from '@/lib/riskReasons'
import { getLanxinConfig } from '@/lib/lanxinApi'

// items 恒为完整白名单长度(后端 lanxin_config._validate_items 按白名单补齐)。
// 只把 MISS_SUMMARY / 回款延期 设为已启用,其余 code 保持 enabled:false ——
// 这样才能同时覆盖「已启用项渲染」与「未启用项仍渲染」两种场景。
const CFG = {
  enabled: false, sendIntervalMs: 200,
  credentials: { appId: 'app-1', appSecret: '', orgId: '524288',
                 apiGateway: 'https://apigw.example.com', idType: 'employ_id', hasSecret: true },
  routes: [
    { key: 'timesheet', label: '倚天工时问题', enabled: true,
      items: Object.keys(ISSUE_LABELS).map((code) => (
        { code, enabled: code === 'MISS_SUMMARY', primary: true, supervisorLevels: 0 }
      )) },
    { key: 'project', label: '项目关注原因', enabled: true,
      items: ALL_RISK_CATEGORIES.map((code) => (
        { code, enabled: code === '回款延期', primary: true, supervisorLevels: 1 }
      )) },
  ],
}

vi.mock('@/lib/lanxinApi', () => ({
  getLanxinConfig: vi.fn(async () => JSON.parse(JSON.stringify(CFG))),
  saveLanxinConfig: vi.fn(async (c: unknown) => c),
  lanxinSelftest: vi.fn(async () => ({ steps: [
    { name: '取应用访问TOKEN', ok: true, msg: '成功' },
    { name: '工号换人员ID', ok: false, msg: '组织id格式异常 (52051)' },
  ] })),
}))

beforeEach(() => { setActivePinia(createPinia()) })

const mountCard = async () => {
  const w = mount(LanxinConfigCard, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
  await flushPromises()
  return w
}

describe('LanxinConfigCard', () => {
  it('渲染两条路由与其汇总级别', async () => {
    const w = await mountCard()
    expect(w.text()).toContain('倚天工时问题')
    expect(w.text()).toContain('项目关注原因')
    expect(w.find('[data-test="lx-card"]').exists()).toBe(true)
  })

  it('已存密钥时不回显明文,只提示已配置', async () => {
    const w = await mountCard()
    expect(w.html()).not.toContain('appSecret“明文”')
    expect(w.text()).toContain('已配置')
  })

  it('自检结果逐步展示,失败步骤必须可见(不静默吞)', async () => {
    const w = await mountCard()
    await w.find('[data-test="lx-selftest-emp"]').setValue('A000701')
    await w.find('[data-test="lx-selftest"]').trigger('click')
    await flushPromises()
    const box = w.find('[data-test="lx-selftest-result"]')
    expect(box.exists()).toBe(true)
    expect(box.isVisible()).toBe(true)
    expect(box.text()).toContain('取应用访问TOKEN')
    expect(box.text()).toContain('52051')
  })

  it('保存调用 saveLanxinConfig', async () => {
    const { saveLanxinConfig } = await import('@/lib/lanxinApi')
    const w = await mountCard()
    await w.find('[data-test="lx-save"]').trigger('click')
    await flushPromises()
    expect(saveLanxinConfig).toHaveBeenCalled()
  })

  it('保存时把新密钥放进 payload;未填则传空串(后端据此沿用旧值)', async () => {
    const { saveLanxinConfig } = await import('@/lib/lanxinApi')
    const w = await mountCard()
    await w.find('[data-test="lx-save"]').trigger('click')
    await flushPromises()
    expect(vi.mocked(saveLanxinConfig).mock.calls[0][0].credentials.appSecret).toBe('')
  })

  it('「预览并推送」冒泡 open-push 事件(抽屉由 DataView 持有)', async () => {
    const w = await mountCard()
    await w.find('[data-test="lx-open-push"]').trigger('click')
    expect(w.emitted('open-push')).toHaveLength(1)
  })

  it('选项源是全集,不是已勾选的子集(否则取消勾选后再也勾不回来)', async () => {
    const w = await mountCard()
    // 配置里 timesheet 只勾了 1 个 code、project 只勾了 1 个 reason,
    // 但表格必须给出全部 8 个 / 8 个 code 行(items 恒为完整白名单长度)
    const html = w.html()
    expect(html).toContain('缺少工作概述')
    expect(html).toContain('工时类型填报有误')   // 未启用,但必须仍在表格里
    expect(html).toContain('里程碑滞后')         // 未启用,但必须仍在表格里
  })
})

describe('V4.0.2 逐项配置', () => {
  it('每条路由渲染成逐项表格,行数 = 白名单全集', async () => {
    const w = await mountCard()
    const rows = w.findAll('[data-test="lx-item-row"]')
    expect(rows.length).toBe(16) // 工时 8 + 项目 8
  })

  it('每行有启用/发本人/汇总级别三个控件', async () => {
    const w = await mountCard()
    const row = w.findAll('[data-test="lx-item-row"]')[0]
    expect(row.find('[data-test="lx-item-enabled"]').exists()).toBe(true)
    expect(row.find('[data-test="lx-item-primary"]').exists()).toBe(true)
    expect(row.find('[data-test="lx-item-levels"]').exists()).toBe(true)
  })

  it('未启用的项仍然渲染 —— 否则取消启用后就再也开不回来', async () => {
    // CFG 里 HINT_PRESALE_PRODUCT 未启用(只有 MISS_SUMMARY 启用),该行仍须出现在 DOM 里。
    const w = await mountCard()
    expect(w.html()).toContain('售前服务类产品类别不应为「其他」')
  })

  it('保存时把 items 原样回传', async () => {
    const { saveLanxinConfig } = await import('@/lib/lanxinApi')
    const w = await mountCard()
    await w.find('[data-test="lx-save"]').trigger('click')
    await flushPromises()
    const payload = vi.mocked(saveLanxinConfig).mock.calls[0][0]
    expect(Array.isArray(payload.routes[0].items)).toBe(true)
    expect(payload.routes[0].items[0]).toHaveProperty('supervisorLevels')
  })

  // M-1(终审):items 恒为完整白名单是【后端契约】(_validate_items 会按白名单补齐,
  // 有 test_items_missing_codes_are_filled_as_disabled 锁)。这里锁的是契约被破坏时的
  // 降级行为 —— 少渲染几行是可接受的,但绝不能崩、也不能把已收到的项吞掉。
  it('后端若返回不完整 items,UI 不崩且如实渲染收到的项', async () => {
    const partial = JSON.parse(JSON.stringify(CFG))
    partial.routes[0].items = [
      { code: 'MISS_SUMMARY', enabled: true, primary: true, supervisorLevels: 0 },
    ]
    vi.mocked(getLanxinConfig).mockResolvedValueOnce(partial)
    const w = await mountCard()
    // 工时路由只剩 1 行、项目路由仍 8 行 —— 如实渲染收到的,不崩也不吞
    expect(w.findAll('[data-test="lx-item-row"]').length).toBe(1 + ALL_RISK_CATEGORIES.length)
    expect(w.html()).toContain('缺少工作概述')
  })
})
