import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import LanxinConfigCard from './LanxinConfigCard.vue'
import { ISSUE_LABELS } from '@/lib/yitian/compliance'
import { ALL_RISK_CATEGORIES } from '@/lib/riskReasons'
import { getLanxinConfigFull, type LanxinConfig } from '@/lib/lanxinApi'

// items 恒为完整白名单长度(后端 lanxin_config._validate_items 按白名单补齐)。
// 只把 MISS_SUMMARY / 回款延期 设为已启用,其余 code 保持 enabled:false ——
// 这样才能同时覆盖「已启用项渲染」与「未启用项仍渲染」两种场景。
const CFG = {
  enabled: false, sendIntervalMs: 200, sendAs: 'account',
  credentials: { appId: 'app-1', appSecret: '', orgId: '524288',
                 apiGateway: 'https://apigw.example.com', idType: 'employ_id', hasSecret: true,
                 callbackAesKey: '', callbackSignToken: '',
                 hasCallbackAesKey: true, hasCallbackSignToken: true },
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
  // config + rejected 合并成一次响应;默认不带 rejected,如实模拟 Task 6 落地前的真实现状。
  getLanxinConfigFull: vi.fn(async () => ({ config: JSON.parse(JSON.stringify(CFG)) })),
  saveLanxinConfig: vi.fn(async (c: unknown) => c),
  lanxinSelftest: vi.fn(async () => ({ steps: [
    { name: '取应用访问TOKEN', ok: true, msg: '成功' },
    { name: '工号换人员ID', ok: false, msg: '组织id格式异常 (52051)' },
  ] })),
}))

beforeEach(() => { setActivePinia(createPinia()) })

/** 深合并 override 到 CFG 克隆上：顶层字段直接覆盖，credentials 只覆盖传入的那几个键，
 *  其余字段(appId/orgId 等)保留基线值 —— 这样调用方每次只需写「本用例关心的差异」。 */
function buildCfg(override: Record<string, unknown> = {}) {
  const merged = JSON.parse(JSON.stringify(CFG))
  const { credentials, ...rest } = override as { credentials?: Record<string, unknown> }
  Object.assign(merged, rest)
  if (credentials) Object.assign(merged.credentials, credentials)
  return merged
}

// mountCard 第二参数承载 rejected(验签拒绝计数) —— 真实数据源是 GET /api/lanxin/config
// 的 rejected 字段(随 config 一起一次请求拿回,见 getLanxinConfigFull),但这里选择在
// load() 跑完之后直接改写 defineExpose 出的 ref,而不是拼进 mockResolvedValueOnce 的响应体,
// 是为了把「有拒绝计数时怎么展示」这条纯 UI 逻辑与「load() 怎么从响应里取值」分开单独锁定
// (后者由下方"接口未返回 rejected 时按 0 处理"等用例覆盖)。
const mountCard = async (
  cfgOverride: Record<string, unknown> = {},
  extra: { rejected?: { count: number; lastAt: string } } = {},
) => {
  // 只有真的带了 override 才多塞一次 mockResolvedValueOnce —— 否则每次调用都会往
  // vi.fn 的一次性队列里插一条,当某用例(如下方"后端若返回不完整 items")自己手动
  // mockResolvedValueOnce 之后再调用 mountCard() 时,顺序就会错位、把残留值漏给下一个用例。
  if (Object.keys(cfgOverride).length > 0) {
    vi.mocked(getLanxinConfigFull).mockResolvedValueOnce({ config: buildCfg(cfgOverride) })
  }
  const w = mount(LanxinConfigCard, { global: { plugins: [ElementPlus], stubs: { 'el-switch': true } } })
  await flushPromises()
  if (extra.rejected) {
    ;(w.vm as unknown as { rejected: { count: number; lastAt: string } }).rejected = extra.rejected
    await flushPromises()
  }
  return w
}

/** 保存时不触碰两个回调密钥输入框，直接点保存 —— 用来锁「留空=不修改」这条契约。
 *  读 mock.calls 的【最后一次】调用而非 [0]，避免被本文件里更早的用例的调用记录污染
 *  (vitest 默认不还原 mock，同一 saveLanxinConfig 的调用历史会在整个文件生命周期内累积)。 */
async function saveWithoutTouchingSecrets() {
  const { saveLanxinConfig } = await import('@/lib/lanxinApi')
  const w = await mountCard()
  await w.find('[data-test="lx-save"]').trigger('click')
  await flushPromises()
  const calls = vi.mocked(saveLanxinConfig).mock.calls
  const payload = calls[calls.length - 1][0] as LanxinConfig
  return { wrapper: w, payload }
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
    vi.mocked(getLanxinConfigFull).mockResolvedValueOnce({ config: partial })
    const w = await mountCard()
    // 工时路由只剩 1 行、项目路由仍 8 行 —— 如实渲染收到的,不崩也不吞
    expect(w.findAll('[data-test="lx-item-row"]').length).toBe(1 + ALL_RISK_CATEGORIES.length)
    expect(w.html()).toContain('缺少工作概述')
  })
})

describe('V4.0.5 回调双向配置(发送身份/回调双凭证/回调地址/拒绝计数)', () => {
  it('展示发送身份单选，默认应用号', async () => {
    const wrapper = await mountCard({ sendAs: 'account' })
    expect(wrapper.text()).toContain('应用号')
    expect(wrapper.text()).toContain('智能机器人')
  })

  it('两个回调凭证未配置时显示「未配置」', async () => {
    const wrapper = await mountCard({
      credentials: { hasCallbackAesKey: false, hasCallbackSignToken: false },
    })
    expect(wrapper.text()).toContain('回调密钥')
    expect(wrapper.text()).toContain('回调签名令牌')
  })

  it('回调地址按当前站点拼出，可复制', async () => {
    const wrapper = await mountCard({})
    expect(wrapper.text()).toContain('/api/lanxin/callback')
  })

  it('展示已拒绝次数，让 signToken 配错一眼可见', async () => {
    const wrapper = await mountCard({}, { rejected: { count: 7, lastAt: '2026-07-20 10:00:00' } })
    expect(wrapper.text()).toContain('7')
  })

  // 数据源是 GET /api/lanxin/config 的顶层 rejected 字段(Task 6 提供)。Task 6 落地前响应
  // 不含该字段(见上方 vi.mock 里 getLanxinConfigFull 默认只返回 { config }、没有 rejected 键)
  // ——缺字段导致整卡挂掉是不可接受的,load() 必须按 0 兜底、既不渲染拒绝行也不报错。
  it('接口未返回 rejected 时按 0 处理，不渲染拒绝行也不报错', async () => {
    const w = await mountCard()
    expect(w.find('[data-test="lx-rejected"]').exists()).toBe(false)
    expect((w.vm as unknown as { rejected: { count: number; lastAt: string } }).rejected)
      .toEqual({ count: 0, lastAt: '' })
  })

  // 之前 config 与 rejected 是两个函数、各打一次 GET /api/lanxin/config；协调者要求收回成一次
  // 请求(见 getLanxinConfigFull)。这条锁住「以后不会有人不小心又拆回两次调用」。
  it('挂载时对 GET /api/lanxin/config 只发一次请求(config 与 rejected 合并成一次调用)', async () => {
    vi.mocked(getLanxinConfigFull).mockClear()
    await mountCard()
    expect(getLanxinConfigFull).toHaveBeenCalledTimes(1)
  })

  it('保存时不回传空的回调密钥（空串=不修改）', async () => {
    const { payload } = await saveWithoutTouchingSecrets()
    expect(payload.credentials.callbackAesKey).toBe('')
    expect(payload.credentials.callbackSignToken).toBe('')
  })

  // 上一条只覆盖"没填→传空串"这一面,不足以锁住"空串=不修改"契约的另一面:
  // cfg.credentials.callbackAesKey/callbackSignToken 经后端脱敏恒为空串,若 onSave 手滑读了
  // cfg 而不是本次输入框的值,不填时和填了时结果都是空串、上一条测试测不出来 ——
  // 这条用真填了值来验证「确实是从输入框取的值」,才是变异验证 Step 5 真正会绊倒的用例。
  it('保存时把新输入的回调密钥透传给后端(不能被脱敏后的旧值顶替)', async () => {
    const { saveLanxinConfig } = await import('@/lib/lanxinApi')
    const w = await mountCard()
    await w.find('[data-test="lx-callback-aes-key"]').setValue('new-aes-key-123')
    await w.find('[data-test="lx-callback-sign-token"]').setValue('new-sign-token-456')
    await w.find('[data-test="lx-save"]').trigger('click')
    await flushPromises()
    const calls = vi.mocked(saveLanxinConfig).mock.calls
    const payload = calls[calls.length - 1][0] as LanxinConfig
    expect(payload.credentials.callbackAesKey).toBe('new-aes-key-123')
    expect(payload.credentials.callbackSignToken).toBe('new-sign-token-456')
  })
})
