import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AboutView from './AboutView.vue'
import { APP_VERSION } from '@/version'

describe('AboutView', () => {
  it('版本号与发布信息', () => {
    const w = mount(AboutView)
    expect(w.text()).toContain(APP_VERSION)
    expect(w.text()).toContain('项目管理平台')
    expect(w.text()).not.toContain('项目回款跟踪与管控平台')
  })

  it('双域功能说明,作者行已删,数据来源行已删', () => {
    const w = mount(AboutView)
    expect(w.text()).toContain('项目域')
    expect(w.text()).toContain('回款域')
    expect(w.text()).toContain('数据治理')
    expect(w.text()).not.toContain('作者')
    expect(w.text()).not.toContain('王叙潼牛逼')
    expect(w.text()).not.toContain('数据来源')
    expect(w.text()).toContain('健康度规则')   // S1:健康度定义入关于页
  })
})
