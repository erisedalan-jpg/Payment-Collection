import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AboutView from './AboutView.vue'
import { APP_VERSION } from '@/version'

describe('AboutView', () => {
  it('版本号与发布信息', () => {
    const w = mount(AboutView)
    expect(w.text()).toContain(APP_VERSION)
    expect(w.text()).toContain('项目回款跟踪与管控平台')
  })

  it('双域功能说明与三类数据来源', () => {
    const w = mount(AboutView)
    expect(w.text()).toContain('项目域')
    expect(w.text()).toContain('回款域')
    expect(w.text()).toContain('数据治理')
    expect(w.text()).toContain('PMIS')
    expect(w.text()).toContain('组织架构')
  })
})
