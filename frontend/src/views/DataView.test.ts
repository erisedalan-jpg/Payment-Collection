import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import DataView from './DataView.vue'

describe('DataView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ links: {} }) })) as any)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('呈现 获取/更新/设置 三段,且无数据质量总览', () => {
    const w = mount(DataView, { global: { stubs: { 'el-input': true, 'el-switch': true } } })
    const text = w.text()
    expect(text).toContain('数据来源')
    expect(text).toContain('更新数据')
    expect(text).toContain('设置')
    expect(text).not.toContain('数据质量总览')
    // 关键控件:更新数据主按钮 + PMIS 多选上传输入
    expect(w.find('.dv-btn.primary').exists()).toBe(true)
    expect(w.find('input[type="file"][multiple]').exists()).toBe(true)
  })
})
