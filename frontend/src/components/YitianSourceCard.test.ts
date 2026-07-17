import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import YitianSourceCard from './YitianSourceCard.vue'
import * as cookieAgent from '@/lib/cookieAgent'

// jsdom 未实现 File.prototype.arrayBuffer;上传测试会经 onUploadYitian 走真实
// inputsUpload(内部靠 arrayBuffer 读文件内容再 POST)。沿用 MainDomainSourceCard.test.ts 同款 polyfill。
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
      return { ok: true, json: async () => ({ files: { '工时.xlsx': '2026-07-14 09:00' } }) } as any
    }
    return { ok: true, json: async () => ({}) } as any
  }))
})

const mountCard = async () => {
  const w = mount(YitianSourceCard, {
    props: { yitianStatus: { sessionPreview: '', updatedAt: '' } },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return w
}

describe('YitianSourceCard', () => {
  it('渲染倚天两文件与时间', async () => {
    const w = await mountCard()
    expect(w.text()).toContain('工时.xlsx')
    expect(w.text()).toContain('holidays.csv')
    expect(w.text()).toContain('2026-07-14 09:00')
  })

  it('holidays 格式说明收进折叠(卡面瘦身)', async () => {
    const w = await mountCard()
    const heads = w.findAll('.el-collapse-item__header').map((n) => n.text())
    expect(heads.some((t) => t.includes('holidays.csv 格式说明'))).toBe(true)
  })

  it('保留倚天 cookie 钩子并透出传入的状态', async () => {
    const w = mount(YitianSourceCard, {
      props: { yitianStatus: { sessionPreview: 'SESS9', updatedAt: '2026-07-15 10:00' } },
      global: { plugins: [ElementPlus] },
    })
    await flushPromises()
    expect(w.find('[data-test="btn-fetch-yitian-cookie"]').exists()).toBe(true)
    expect(w.text()).toContain('SESS9')
    expect(w.text()).toContain('2026-07-15 10:00')
  })

  it('取倚天 cookie 成功 → emit cookie-change', async () => {
    const { api } = await import('@/api/client')
    vi.spyOn(api, 'post').mockResolvedValue({ sessionPreview: 'YT1' } as never)
    vi.mocked(cookieAgent.fetchYitianCookie).mockResolvedValue({
      ok: true, cookie: 'a=b', names: ['a'], error: '',
    })
    const w = await mountCard()
    await (w.vm as any).onFetchYitianCookie()
    await flushPromises()
    expect(w.emitted('cookie-change')?.[0]).toEqual([{ sessionPreview: 'YT1', updatedAt: '刚刚' }])
  })

  it('上传非倚天文件 → 不发请求且列入已跳过', async () => {
    const w = await mountCard()
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], '项目中心.xlsx')] })
    await w.find('[data-test="btn-upload-yitian"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/inputs/upload'))).toBe(false)
    expect(w.find('[data-test="upload-yitian-msg"]').text()).toContain('已跳过:项目中心.xlsx（不在倚天白名单）')
  })

  it('上传倚天文件 → 打 inputs 端点', async () => {
    const w = await mountCard()
    const input = w.find('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['x'], '工时.xlsx')] })
    await w.find('[data-test="btn-upload-yitian"]').trigger('click')
    await flushPromises()
    const calls = (fetch as any).mock.calls.map((c: any) => String(c[0]))
    expect(calls.some((u: string) => u.includes('/api/inputs/upload'))).toBe(true)
  })
})
