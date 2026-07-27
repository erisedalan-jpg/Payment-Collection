import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import PageHeader from './PageHeader.vue'

describe('PageHeader', () => {
  it('渲染标题', () => {
    const w = mount(PageHeader, { props: { title: '在建项目' } })
    expect(w.find('.ph-title').text()).toBe('在建项目')
  })

  it('actions 插槽内容渲染在 .ph-actions 内', () => {
    const w = mount(PageHeader, {
      props: { title: 'X' },
      slots: { actions: '<button class="t-btn">导出</button>' },
    })
    expect(w.find('.ph-actions .t-btn').exists()).toBe(true)
  })

  it('无 actions 插槽时不报错', () => {
    const w = mount(PageHeader, { props: { title: 'X' } })
    expect(w.find('.ph-actions').exists()).toBe(true)
  })

  it('视觉零变化契约:ph-title 取值与被替换的 19 份 XX-title 一致', () => {
    // 被替换的各页样式统一是 font-size:--fs-4 / font-weight:700 / color:--txt。
    // 这条锁住「抽组件不改观感」这个前提 —— 改了取值就等于改了 19 个页面的外观。
    const css = readFileSync(resolve(__dirname, 'PageHeader.vue'), 'utf-8')
    expect(css).toMatch(/\.ph-title\s*\{[^}]*font-size:\s*var\(--fs-4\)/)
    expect(css).toMatch(/\.ph-title\s*\{[^}]*font-weight:\s*700/)
    expect(css).toMatch(/\.ph-title\s*\{[^}]*color:\s*var\(--txt\)/)
  })
})
