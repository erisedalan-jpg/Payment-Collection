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

  it('repRunning 为真时禁用下载按钮(互斥不得丢失)', async () => {
    const w = mount(MainDomainSourceCard, { props: { repRunning: true }, global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(w.find('[data-test="btn-download"]').attributes('disabled')).toBeDefined()
  })

  it('取到含 SESSION 的 cookie → POST 并 emit cookie-change', async () => {
    const { api } = await import('@/api/client')
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
    expect(calls.some((u: string) => u.includes('/api/pmis/download'))).toBe(true)
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
})
