import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MainDomainSourceCard from './MainDomainSourceCard.vue'
import * as cookieAgent from '@/lib/cookieAgent'

// jsdom 未实现 File.prototype.arrayBuffer;合并上传测试会经 onUploadMain 走真实
// pmisUpload/inputsUpload(内部靠 arrayBuffer 读文件内容再 POST)。沿用 usePmisSync.test.ts
// 同款处理思路垫一个最小 polyfill(内容不影响断言,只看 URL)。用纯微任务 resolve——
// 若走 FileReader(jsdom 内部用 setImmediate 两级宏任务)则单次 flushPromises() 冲不掉。
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function () {
    return Promise.resolve(new ArrayBuffer(0))
  }
}

vi.mock('@/lib/cookieAgent', () => ({
  pingAgent: vi.fn().mockResolvedValue(true),
  fetchPmisCookie: vi.fn(),
  fetchYitianCookie: vi.fn(),
}))

beforeEach(() => {
  // 前一条用例可能 vi.spyOn(api, 'post')(见下方 cookie 相关用例);vitest 默认不还原 spy,
  // 不清会让后续用例(如 M-3「先 POST cookie 再开 download」)静默断不到 cookie 请求。
  vi.restoreAllMocks()
  setActivePinia(createPinia())
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('/api/files/status')) {
      return { ok: true, json: async () => ({ files: { '项目中心.xlsx': '2026-06-12 14:09', 'payment_records.csv': '2026-06-12 14:46' } }) } as any
    }
    return { ok: true, json: async () => ({}) } as any
  }))
})

const mountCard = async () => {
  const w = mount(MainDomainSourceCard, { props: { repRunning: false }, global: { plugins: [ElementPlus] } })
  await flushPromises()
  return w
}

describe('MainDomainSourceCard', () => {
  it('一张卡内同时含 PMIS 九表与项目域文件两分区', async () => {
    const w = await mountCard()
    expect(w.text()).toContain('PMIS 九表')
    expect(w.text()).toContain('项目域文件')
    expect(w.findAll('.dv-fgrid')).toHaveLength(2)
  })

  it('根节点带 files-card 钩子且含核心回款源与根文件', async () => {
    const w = await mountCard()
    const card = w.find('[data-test="files-card"]')
    expect(card.exists()).toBe(true)
    expect(card.text()).toContain('collection_stages.csv')
    expect(card.text()).toContain('组织架构.xlsx')
    expect(card.text()).toContain('payment_records.csv')
    expect(card.text()).toContain('2026-06-12 14:46')
  })

  it('PMIS 九行渲染', async () => {
    const w = await mountCard()
    const rows = w.findAll('[data-test="pmis-row"]')
    expect(rows).toHaveLength(9)
    expect(rows.some((r) => r.text().includes('在建项目里程碑计划数据'))).toBe(true)
  })

  it('repRunning 为真时禁用下载按钮', async () => {
    const w = mount(MainDomainSourceCard, { props: { repRunning: true }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('[data-test="btn-download"]').attributes('disabled')).toBeDefined()
  })

  it('取到含 SESSION 的 cookie → POST 并 emit cookie-change', async () => {
    const { api } = await import('@/api/client')
    // 必须显式声明代理在线:beforeEach 的 restoreAllMocks 会把 vi.mock 工厂里的
    // mockResolvedValue(true) 一并重置成 undefined(falsy),不写这行本用例会走服务端直取那条路,
    // 而它的断言恰好也成立 —— 是个假绿。
    vi.mocked(cookieAgent.pingAgent).mockResolvedValue(true)
    vi.spyOn(api, 'post').mockResolvedValue({ sessionPreview: 'SESSION1' } as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'SESSION=z; a=b', names: ['SESSION', 'a'], hasSession: true, error: '',
    })
    const w = await mountCard()
    await (w.vm as any).onFetchPmisCookie()
    await flushPromises()
    expect(w.emitted('cookie-change')?.[0]).toEqual([{ sessionPreview: 'SESSION1', updatedAt: '刚刚' }])
  })

  it('取到无 SESSION → 告警且不推送、不 emit', async () => {
    const { api } = await import('@/api/client')
    vi.mocked(cookieAgent.pingAgent).mockResolvedValue(true)   // 同上:钉住代理那条路
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({} as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'a=b', names: ['a'], hasSession: false, error: '',
    })
    const w = await mountCard()
    await (w.vm as any).onFetchPmisCookie()
    await flushPromises()
    expect(postSpy).not.toHaveBeenCalledWith('/api/pmis/cookie', expect.anything())
    expect(w.emitted('cookie-change')).toBeUndefined()
    expect(w.text()).toContain('未检测到 PMIS 登录态')
  })

  it('点下载:cookie 非空时先 POST /api/pmis/cookie 再开 /api/pmis/download', async () => {
    const w = await mountCard()
    await w.find('[data-test="pmis-cookie"]').setValue('x=1; SESSION=abc')
    await w.find('[data-test="btn-download"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    const cookieIdx = calls.findIndex((u: string) => u.includes('/api/pmis/cookie'))
    const downloadIdx = calls.findIndex((u: string) => u.includes('/api/pmis/download'))
    expect(cookieIdx).toBeGreaterThanOrEqual(0)
    expect(downloadIdx).toBeGreaterThanOrEqual(0)
    expect(cookieIdx).toBeLessThan(downloadIdx)
  })
})

describe('MainDomainSourceCard 合并上传', () => {
  it('只剩一个上传框与一个上传按钮', async () => {
    const w = await mountCard()
    expect(w.findAll('input[type="file"]')).toHaveLength(1)
    expect(w.find('[data-test="btn-upload-main"]').exists()).toBe(true)
    expect(w.text()).toContain('上传主域数据文件')
  })

  it('混合投放:九表与根文件分别打两个端点,倚天/未知文件不发请求且列入已跳过', async () => {
    const w = await mountCard()
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], '项目中心.xlsx'), new File(['x'], 'budget_data.csv'),
              new File(['x'], '工时.xlsx'), new File(['x'], 'x.txt')],
    })
    await w.find('[data-test="btn-upload-main"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.filter((u: string) => u.includes('/api/pmis/upload'))).toHaveLength(1)
    expect(calls.filter((u: string) => u.includes('/api/inputs/upload'))).toHaveLength(1)
    // 倚天/未知文件绝不能被静默塞进 inputs 端点
    expect(calls.some((u: string) => u.includes(encodeURIComponent('工时.xlsx')))).toBe(false)
    const msg = w.find('[data-test="upload-main-msg"]').text()
    expect(msg).toContain('已上传 1 个 PMIS 九表 + 1 个项目域文件')
    expect(msg).toContain('工时.xlsx（属倚天工时域')
    expect(msg).toContain('x.txt（不在主域白名单）')
  })

  it('有跳过项时不阻断已识别文件的上传', async () => {
    const w = await mountCard()
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], '项目中心.xlsx'), new File(['x'], 'x.txt')] })
    await w.find('[data-test="btn-upload-main"]').trigger('click')
    await flushPromises()
    expect((fetch as any).mock.calls.map((c: any) => String(c[0])).some((u: string) => u.includes('/api/pmis/upload'))).toBe(true)
  })

  it('HTTP 层部分失败(白名单内文件被服务端拒收)时提示行走 warn 且文案含失败数(I-1)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/api/files/status')) return { ok: true, json: async () => ({ files: {} }) } as any
      if (u.includes('/api/pmis/upload') && u.includes(encodeURIComponent('项目风险数据.xlsx'))) {
        return { ok: false, json: async () => ({}) } as any
      }
      return { ok: true, json: async () => ({}) } as any
    }))
    const w = await mountCard()
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], '项目中心.xlsx'), new File(['x'], '项目风险数据.xlsx')],
    })
    await w.find('[data-test="btn-upload-main"]').trigger('click')
    await flushPromises()
    const msgEl = w.find('[data-test="upload-main-msg"]')
    expect(msgEl.text()).toContain('已上传 1 个 PMIS 九表')
    expect(msgEl.text()).toContain('失败 1 个（服务端未接收,请重试）')
    expect(msgEl.classes()).toContain('warn')
  })
})

describe('取 PMIS cookie 的两条路：代理在线走代理，代理不在走服务端直取', () => {
  // 背景：cookie_core 是 requests 直连 PMIS + 本机零信任认证。
  //   生产版 —— 平台在服务器、零信任在用户 PC，两者不同机 → 必须由 PC 上的 8765 代理取了再推。
  //   单机 exe 版 —— 平台就跑在用户机器上 → 服务端自己就能取，交付机因此不需要装 Python/跑 vbs。
  // 所以按钮不新增，按「代理在不在」自动选路。

  it('代理离线 → 调 /api/pmis/cookie/fetch-local，且不去碰本机代理', async () => {
    const { api } = await import('@/api/client')
    vi.mocked(cookieAgent.pingAgent).mockResolvedValue(false)
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({
      success: true, sessionPreview: 'LOCAL123', names: ['SESSION'], message: '已从本机获取并更新 Cookie',
    } as never)
    const w = await mountCard()
    await (w.vm as any).onFetchPmisCookie()
    await flushPromises()

    expect(postSpy).toHaveBeenCalledWith('/api/pmis/cookie/fetch-local', {})
    // 代理离线时不该再去调代理（那正是会 ERR_CONNECTION_REFUSED 的那条路）
    expect(cookieAgent.fetchPmisCookie).not.toHaveBeenCalled()
    expect(w.emitted('cookie-change')?.[0]).toEqual([{ sessionPreview: 'LOCAL123', updatedAt: '刚刚' }])
    expect(w.text()).toContain('已从本机获取并更新 Cookie')
  })

  it('代理在线 → 仍走代理那条路，不调 fetch-local（生产版行为不变）', async () => {
    const { api } = await import('@/api/client')
    vi.mocked(cookieAgent.pingAgent).mockResolvedValue(true)
    const postSpy = vi.spyOn(api, 'post').mockResolvedValue({ sessionPreview: 'VIA_AGENT' } as never)
    vi.mocked(cookieAgent.fetchPmisCookie).mockResolvedValue({
      ok: true, cookie: 'SESSION=z; a=b', names: ['SESSION', 'a'], hasSession: true, error: '',
    })
    const w = await mountCard()
    await (w.vm as any).onFetchPmisCookie()
    await flushPromises()

    expect(cookieAgent.fetchPmisCookie).toHaveBeenCalled()
    expect(postSpy).toHaveBeenCalledWith('/api/pmis/cookie', { cookie: 'SESSION=z; a=b' })
    expect(postSpy).not.toHaveBeenCalledWith('/api/pmis/cookie/fetch-local', expect.anything())
  })

  it('服务端直取失败（零信任未登录）→ 显示后端给的原话，不 emit', async () => {
    const { api } = await import('@/api/client')
    vi.mocked(cookieAgent.pingAgent).mockResolvedValue(false)
    // api.post 对 success:false 会抛 ApiRequestError，message 取自后端
    vi.spyOn(api, 'post').mockRejectedValue(
      new Error('取 Cookie 失败: 被重定向到登录页（零信任未登录）（请确认本机零信任客户端已登录 PMIS）'))
    const w = await mountCard()
    await (w.vm as any).onFetchPmisCookie()
    await flushPromises()

    expect(w.emitted('cookie-change')).toBeUndefined()
    expect(w.text()).toContain('零信任')
  })
})
