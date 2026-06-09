import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AboutView from './AboutView.vue'
import { APP_VERSION } from '@/version'

describe('AboutView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('展示产品名、版本号、作者、数据来源', () => {
    const w = mount(AboutView)
    const t = w.text()
    expect(t).toContain('项目回款跟踪与管控平台')
    expect(t).toContain(APP_VERSION)
    expect(t).toContain('交付中心-交付实施三部-阿童木')
    expect(t).toContain('WPS云文档')
  })

  it('不展示"数据更新"行(已移至 DataView)', () => {
    const w = mount(AboutView)
    expect(w.text()).not.toContain('数据更新')
  })

  it('渲染功能说明列表（至少若干条）', () => {
    const w = mount(AboutView)
    expect(w.findAll('.about-features li').length).toBeGreaterThan(5)
  })
})
