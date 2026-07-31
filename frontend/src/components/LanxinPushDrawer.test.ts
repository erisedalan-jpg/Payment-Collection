import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus, { ElMessage, ElMessageBox } from 'element-plus'
import type { YitianData } from '@/types/yitian'
import type { PushItem } from '@/lib/lanxin/items'
import LanxinPushDrawer from './LanxinPushDrawer.vue'
import SectionTitle from './SectionTitle.vue'

const PLAN = {
  recipients: [
    { employId: 'A006', name: '张三', role: 'primary',
      card: { headTitle: '项目关注提醒', bodyTitle: '你名下 2 个项目存在关注原因',
              fields: [{ key: '回款延期', value: '2 个项目' }] } },
    { employId: 'A005', name: '耿磊磊', role: 'supervisor',
      card: { headTitle: '项目关注提醒', bodyTitle: '你的团队有 2 个项目存在关注原因',
              fields: [{ key: '张三', value: '2 项：回款延期 2' }] } },
  ],
  unresolved: [{ kind: 'project', id: 'P9', name: '查无此人', reason: '经理不在花名册' }],
  totals: { recipients: 2, unresolved: 1 },
}

// C-1 回归 fixture:一条有问题码的工时行,问题码 MISS_SUMMARY 与下方 getLanxinConfig mock 的
// timesheet.issueCodes 对齐 —— 这样才能验证「预览事项里真的含 kind:'timesheet'」。
const YITIAN_DATA = {
  meta: { hoursPerDay: 8, thisBgL2: ['交付中心'], periodStart: '2026-07-01', periodEnd: '2026-07-07' },
  roster: [{ id: 'A1', name: '王五', l2: '', l3: '交付实施三部', l31: '服务二部',
             l4: '银行服务组', category: '' }],
  days: [],
  dims: { types: ['项目类'], workTypes: [], customers: [], products: [], productNames: [],
         projectTypes: [], salesL2: [], serviceModes: [] },
  entries: [
    { d: '2026-07-01', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', top: false, ok: 2, iss: ['MISS_SUMMARY'] },
  ],
  issues: [{ i: 0, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '' }],
} as unknown as YitianData

// V4.0.2 fixture:同一员工两条工时行,分别带一个 enabled 码(MISS_SUMMARY)与一个
// disabled 码(TYPE_MISMATCH,见上方 getLanxinConfig mock)—— 用于验证 buildItems
// 真的按 items.filter(enabled) 派生白名单,而不是把两个码都发出去。
const YITIAN_DATA_MULTI_CODE = {
  ...YITIAN_DATA,
  entries: [
    ...(YITIAN_DATA as unknown as { entries: unknown[] }).entries,
    { d: '2026-07-02', e: 'A1', t: 0, h: 8, wt: null, cu: null, pl: null, pn: null, pt: null,
      sm: null, bg: null, wo: '', top: false, ok: 2, iss: ['TYPE_MISMATCH'] },
  ],
  issues: [
    { i: 0, codes: ['MISS_SUMMARY'], msgs: ['缺少工作概述'], snippet: '' },
    { i: 1, codes: ['TYPE_MISMATCH'], msgs: ['工时类型填报有误'], snippet: '' },
  ],
} as unknown as YitianData

// vi.hoisted:mock 工厂里要用的 spy 必须在 vi.mock 提升之前先声明,否则 TDZ 报错。
const { getYitianDataMock, lanxinPreviewMock, lanxinSendMock } = vi.hoisted(() => ({
  getYitianDataMock: vi.fn(),
  lanxinPreviewMock: vi.fn(),
  lanxinSendMock: vi.fn(),
}))

vi.mock('@/lib/yitianApi', () => ({
  getYitianData: getYitianDataMock,
  getYitianSettings: vi.fn(async () => ({ excludedTypes: [] })),
  saveYitianSettings: vi.fn(async (s: unknown) => s),
}))

// items 恒为完整白名单长度;此处只把 MISS_SUMMARY / 回款延期 设为 enabled,
// 其余 code 一律 enabled:false —— 用于验证 buildItems 只按 enabled 派生白名单。
vi.mock('@/lib/lanxinApi', () => ({
  getLanxinConfig: vi.fn(async () => ({
    enabled: true, sendIntervalMs: 200,
    credentials: { appId: 'a', appSecret: '', orgId: '1',
                   apiGateway: 'https://x.example.com', idType: 'employ_id', hasSecret: true },
    routes: [
      { key: 'timesheet', label: '倚天工时问题', enabled: true,
        items: [
          { code: 'MISS_SUMMARY', enabled: true, primary: true, supervisorLevels: 0 },
          { code: 'TYPE_MISMATCH', enabled: false, primary: true, supervisorLevels: 0 },
        ] },
      { key: 'project', label: '项目关注原因', enabled: true,
        items: [
          { code: '回款延期', enabled: true, primary: true, supervisorLevels: 1 },
          { code: '里程碑滞后', enabled: false, primary: true, supervisorLevels: 1 },
        ] },
    ],
  })),
  // C-1:不再把 lanxinPreview 整个 mock 成罐头数据就完事 —— 用 vi.hoisted 的 spy 接住入参,
  // 断言 buildItems() 的真实产物,而不是只断言抽屉能不能渲染一份写死的 PLAN。
  lanxinPreview: lanxinPreviewMock,
  // V4.5.10:改成 hoisted spy —— 「只推给勾选的人」要断言的是【真正发给后端的入参】,
  // 匿名 vi.fn 接不住调用记录,只能验到"抽屉没报错"。
  lanxinSend: lanxinSendMock,
}))

const SEND_RESULT = {
  plan: PLAN,
  result: { sent: 1, failed: [{ employId: 'A005', name: '耿磊磊',
                                errCode: 56008, errMsg: '触发限流' }], msgIds: ['M1'] },
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) } as any)))
  getYitianDataMock.mockReset()
  getYitianDataMock.mockResolvedValue(YITIAN_DATA)
  lanxinPreviewMock.mockReset()
  lanxinPreviewMock.mockResolvedValue(PLAN)
  lanxinSendMock.mockReset()
  lanxinSendMock.mockResolvedValue(SEND_RESULT)
})

const mountDrawer = async () => {
  const w = mount(LanxinPushDrawer, {
    props: { modelValue: true },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w
}

describe('LanxinPushDrawer', () => {
  it('打开即预览,列出收件人与卡片文案', async () => {
    const w = await mountDrawer()
    expect(w.text()).toContain('张三')
    expect(w.text()).toContain('耿磊磊')
    expect(w.text()).toContain('你名下 2 个项目存在关注原因')
  })

  it('V4.5.1 卡片标题走 SectionTitle 的 section 级(类名含 card,但原值是 --fs-3)', async () => {
    const w = await mountDrawer()
    const titles = w.findAllComponents(SectionTitle)
    expect(titles.length).toBe(2) // 两位收件人各一张卡片预览
    for (const t of titles) expect(t.classes()).toContain('st--section')
    expect(titles[0].text()).toBe('你名下 2 个项目存在关注原因')
  })

  it('未解析清单必须可见(不静默丢)', async () => {
    const w = await mountDrawer()
    const box = w.find('[data-test="lx-unresolved"]')
    expect(box.exists()).toBe(true)
    expect(box.isVisible()).toBe(true)
    expect(box.text()).toContain('经理不在花名册')
    expect(box.text()).toContain('P9')
  })

  it('推送后失败清单必须可见(不吞)', async () => {
    // 真实二次确认框不会在 jsdom 里自动点击「确定」，须 spy 掉走既有仓库约定
    // (参照 YitianStoreCard.test.ts 对 ElMessageBox.confirm 的处理)。
    const confirmSpy = vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as any)
    const w = await mountDrawer()
    await w.find('[data-test="lx-send"]').trigger('click')
    await flushPromises()
    const box = w.find('[data-test="lx-failed"]')
    expect(box.exists()).toBe(true)
    expect(box.isVisible()).toBe(true)
    expect(box.text()).toContain('耿磊磊')
    expect(box.text()).toContain('56008')
    confirmSpy.mockRestore()
  })

  it('推送按钮在预览出结果前禁用', async () => {
    const w = mount(LanxinPushDrawer, { props: { modelValue: true },
                                        global: { plugins: [ElementPlus] } })
    // el-drawer 首次挂载的插槽内容要等一个 tick 才 rendered=true(Element Plus 内部机制)，
    // 此时预览请求(至少两跳微任务)仍未回来，正好卡在「未出结果」这一态。
    await nextTick()
    expect(w.find('[data-test="lx-send"]').attributes('disabled')).toBeDefined()
  })

  // ── C-1:yitian.data 在 /data 上此前恒为 null(store 惰性加载,抽屉从不主动 load) ──

  it('C-1:预览会主动加载倚天数据,发给后端的 items 里必须含 kind:timesheet', async () => {
    await mountDrawer()
    expect(getYitianDataMock).toHaveBeenCalled()
    expect(lanxinPreviewMock).toHaveBeenCalledTimes(1)
    const sentItems = lanxinPreviewMock.mock.calls[0][0] as PushItem[]
    expect(sentItems.some((i) => i.kind === 'timesheet')).toBe(true)
  })

  it('C-1:倚天数据加载失败时不能静默把工时问题算作 0 条,必须显式告警', async () => {
    getYitianDataMock.mockReset()
    getYitianDataMock.mockRejectedValue(new Error('网络错误'))
    const warnSpy = vi.spyOn(ElMessage, 'warning')
    await mountDrawer()
    expect(warnSpy).toHaveBeenCalled()
    const sentItems = lanxinPreviewMock.mock.calls[0][0] as PushItem[]
    expect(sentItems.some((i) => i.kind === 'timesheet')).toBe(false)
    warnSpy.mockRestore()
  })
})

describe('V4.0.2 逐项配置', () => {
  it('buildItems 只取 enabled 的项', async () => {
    // 配置里工时仅 MISS_SUMMARY 启用、TYPE_MISMATCH 未启用 → 即便数据里两码都有问题行,
    // 发给后端预览的 items 也只应含 MISS_SUMMARY。
    getYitianDataMock.mockReset()
    getYitianDataMock.mockResolvedValue(YITIAN_DATA_MULTI_CODE)
    await mountDrawer()
    const sent = lanxinPreviewMock.mock.calls[0][0] as PushItem[]
    const ts = sent.filter((x) => x.kind === 'timesheet')
    expect(ts.length).toBeGreaterThan(0)
    for (const it of ts) {
      if (it.kind !== 'timesheet') continue
      for (const i of it.issues) expect(i.code).toBe('MISS_SUMMARY')
    }
  })
})

// ── V4.5.10:只推送给勾选的收件人 ─────────────────────────────────────────
//
// 起因:配置页的连通性自检只能证明网关通,要验一次真实数据此前只能往生产上全员真发。
// 三条测试都断言【lanxinSend 真正收到的入参】,而不是"点了没报错" ——
// 勾选态若没接到请求上,组件照样能跑完、消息照样弹「已推送」。

describe('V4.5.10 选人推送', () => {
  const confirmAll = () => vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue('confirm' as never)

  it('默认全选,全选时【不传 only】以保持原有的全发行为', async () => {
    const spy = confirmAll()
    const w = await mountDrawer()
    await w.find('[data-test="lx-send"]').trigger('click')
    await flushPromises()
    expect(lanxinSendMock).toHaveBeenCalledTimes(1)
    // 第二个实参为 undefined = 请求体里根本没有 only 字段 → 走后端原来的全发路径
    expect(lanxinSendMock.mock.calls[0][1]).toBeUndefined()
    spy.mockRestore()
  })

  it('取消勾选一人后,只把剩下的人以 {role, employId} 传给后端', async () => {
    const spy = confirmAll()
    const w = await mountDrawer()
    // 取消勾选 A005(汇总卡),只留 A006
    await w.find('[data-test="lx-pick-supervisor-A005"]').find('input').setValue(false)
    await nextTick()
    await w.find('[data-test="lx-send"]').trigger('click')
    await flushPromises()
    // 键必须是二元组:同一人可能同时是本人卡与汇总卡的收件人,只给工号区分不出要发哪张
    expect(lanxinSendMock.mock.calls[0][1]).toEqual([{ role: 'primary', employId: 'A006' }])
    spy.mockRestore()
  })

  it('全部取消勾选后推送按钮禁用(发不出去,而不是发给所有人)', async () => {
    const w = await mountDrawer()
    await w.find('[data-test="lx-select-all"]').find('input').setValue(false)
    await nextTick()
    expect(w.find('[data-test="lx-send"]').attributes('disabled')).toBeDefined()
  })

  it('部分推送时二次确认必须说明"其余不会收到",不能沿用全发文案', async () => {
    const spy = confirmAll()
    const w = await mountDrawer()
    await w.find('[data-test="lx-pick-supervisor-A005"]').find('input').setValue(false)
    await nextTick()
    await w.find('[data-test="lx-send"]').trigger('click')
    await flushPromises()
    const msg = String(spy.mock.calls[0][0])
    expect(msg).toContain('只向勾选的 1 人')
    expect(msg).toContain('其余不会收到')
    spy.mockRestore()
  })
})
