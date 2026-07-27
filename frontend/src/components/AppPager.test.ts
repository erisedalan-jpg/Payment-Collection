import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ElementPlus from 'element-plus'
import AppPager from './AppPager.vue'

// 形参按 AppPager 真实 props 声明:plan 原写 Record<string, unknown>,vue-tsc 判定不可赋值给必填 props
const mountPager = (props: { page: number; size: number; total: number; sizes?: number[] }) =>
  mount(AppPager, { props, global: { plugins: [ElementPlus] } })

describe('AppPager', () => {
  it('渲染「共 N 条」与分页器', () => {
    const w = mountPager({ page: 1, size: 20, total: 137 })
    expect(w.text()).toContain('共 137 条')
    expect(w.find('.el-pagination').exists()).toBe(true)
  })

  it('「共 N 条」挂 .u-num(等宽数字,刷新不跳动)', () => {
    const w = mountPager({ page: 1, size: 20, total: 5 })
    expect(w.find('.ap-total').classes()).toContain('u-num')
  })

  it('「共 N 条」取值与被替换的 .cv-total/.pv-total 一族一致(--fs-1 + --sub)', () => {
    // plan 初版写 --fs-2 + --mut,与全部 11 处现状都不同且无断言可逮,已订正。
    const css = readFileSync(resolve(__dirname, 'AppPager.vue'), 'utf-8')
    const b = css.match(/\.ap-total\s*\{([^}]*)\}/)![1]
    expect(b).toMatch(/font-size:\s*var\(--fs-1\)/)
    expect(b).toMatch(/color:\s*var\(--sub\)/)
  })

  it('默认 sizes 为主流的 [20,50,80,100]', () => {
    const w = mountPager({ page: 1, size: 20, total: 5 })
    expect((w.vm as any).effectiveSizes).toEqual([20, 50, 80, 100])
  })

  it('sizes 可覆盖(少数页用 [50,100])', () => {
    const w = mountPager({ page: 1, size: 50, total: 5, sizes: [50, 100] })
    expect((w.vm as any).effectiveSizes).toEqual([50, 100])
  })

  it('切页 emit update:page', async () => {
    const w = mountPager({ page: 1, size: 20, total: 200 })
    ;(w.vm as any).onPage(3)
    expect(w.emitted('update:page')![0]).toEqual([3])
  })

  it('切每页条数 emit update:size', async () => {
    const w = mountPager({ page: 3, size: 20, total: 200 })
    ;(w.vm as any).onSize(50)
    expect(w.emitted('update:size')![0]).toEqual([50])
  })
})
