import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 直接读源文件断言令牌契约：改值/丢令牌都会被这里挡住。
// 注：先赋给变量再传入 new URL，避免 Vite 在 jsdom 环境下把字面量形式静态重写为 http://localhost 地址。
const _metaUrl = import.meta.url
const css = readFileSync(fileURLToPath(new URL('./theme.css', _metaUrl)), 'utf-8')

// :root 与 html.dark 块内均无嵌套花括号，取第一个 '}' 即块尾。
function block(selector: string): string {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`theme.css 缺少选择器块: ${selector}`)
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}
const root = block(':root {')
const dark = block('html.dark {')

describe('theme.css 令牌契约 · :root(浅色)', () => {
  it('结构色(蓝色系基调)', () => {
    expect(root).toContain('--fs-base: 16px')
    expect(root).toContain('--bg: #eef3f7')
    expect(root).toContain('--card: #ffffff')
    expect(root).toContain('--txt: #1e2a33')
    expect(root).toContain('--accent: #325969')
    expect(root).toContain('--accent2: #6c8fa9')
    expect(root).toContain('--highlight: #c8adc4')
  })
  it('状态语义色(固定)', () => {
    expect(root).toContain('--ok: #4e9a7c')
    expect(root).toContain('--warn: #e0a23b')
    expect(root).toContain('--danger: #d24d5c')
    expect(root).toContain('--c-urgent: #e07a4f')
  })
  it('图表分类色 8 支', () => {
    expect(root).toContain('--chart-1: #6c8fa9')
    expect(root).toContain('--chart-5: #d24d5c')
    expect(root).toContain('--chart-8: #a7c190')
  })
  it('六级字号 rem', () => {
    expect(root).toContain('--fs-1: 0.75rem')
    expect(root).toContain('--fs-3: 1rem')
    expect(root).toContain('--fs-6: 2.15rem')
  })
  it('间距阶梯 4/8/12/16/24/32/48', () => {
    expect(root).toContain('--sp-1: 4px')
    expect(root).toContain('--sp-4: 16px')
    expect(root).toContain('--sp-7: 48px')
  })
  it('卡片/圆角令牌', () => {
    expect(root).toContain('--card-pad: 20px')
    expect(root).toContain('--gap-card: 16px')
    expect(root).toContain('--gap-stack: 12px')
    expect(root).toContain('--gap-section: 24px')
    expect(root).toContain('--r-md: 10px')
    expect(root).toContain('--r-full: 999px')
  })
  it('阴影两级(浅色) + 动效令牌', () => {
    expect(root).toContain('--shadow-1: 0 1px 2px rgba(30,42,51,.06), 0 2px 8px rgba(30,42,51,.05)')
    expect(root).toContain('--shadow-2: 0 2px 4px rgba(30,42,51,.08), 0 12px 28px rgba(30,42,51,.12)')
    expect(root).toContain('--dur-1: 120ms')
    expect(root).toContain('--dur-2: 200ms')
    expect(root).toContain('--ease: cubic-bezier(.2, 0, 0, 1)')
  })
  it('向后兼容:旧令牌名一律保留', () => {
    for (const t of ['--card2:', '--line2:', '--sub:', '--mut:', '--cyan:',
                     '--c-paid: var(--ok)', '--c-pending: var(--warn)',
                     '--c-remaining: var(--danger)', '--c-delayed: var(--danger)',
                     '--c-plan:', '--on-accent: #ffffff', '--fs-5:']) {
      expect(root).toContain(t)
    }
  })
  it('V2:--mut 加深 + 字体/行高/字距令牌', () => {
    expect(root).toContain('--mut: #62707d;')
    expect(root).toContain('--font-sans: -apple-system, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;')
    expect(root).toContain('--lh-tight: 1.15;')
    expect(root).toContain('--lh-dense: 1.4;')
    expect(root).toContain('--lh-base: 1.6;')
    expect(root).toContain('--ls-wide: 0.05em;')
  })
  it('V2:状态三态(淡底 12% + 深字)与 --c-advance 收编', () => {
    expect(root).toContain('--c-advance: var(--cyan);')
    expect(root).toContain('--ok-bg: color-mix(in srgb, var(--ok) 12%, transparent);')
    expect(root).toContain('--warn-bg: color-mix(in srgb, var(--warn) 12%, transparent);')
    expect(root).toContain('--danger-bg: color-mix(in srgb, var(--danger) 12%, transparent);')
    expect(root).toContain('--urgent-bg: color-mix(in srgb, var(--c-urgent) 12%, transparent);')
    expect(root).toContain('--advance-bg: color-mix(in srgb, var(--c-advance) 12%, transparent);')
    expect(root).toContain('--ok-text: #37745b;')
    expect(root).toContain('--warn-text: #8a6210;')
    expect(root).toContain('--danger-text: #b93848;')
    expect(root).toContain('--urgent-text: #a84b1d;')
    expect(root).toContain('--advance-text: #066f89;')
  })
  it('V2:交互状态层与 z-index 阶梯', () => {
    expect(root).toContain('--hover-tint: color-mix(in srgb, var(--accent) 6%, transparent);')
    expect(root).toContain('--selected-tint: color-mix(in srgb, var(--accent) 12%, transparent);')
    expect(root).toContain('--disabled-opacity: 0.45;')
    expect(root).toContain('--z-sticky: 100;')
    expect(root).toContain('--z-panel: 1500;')
    expect(root).toContain('--z-toast: 4000;')
  })
})

describe('theme.css 令牌契约 · html.dark(深色覆盖)', () => {
  it('结构色提亮', () => {
    expect(dark).toContain('--bg: #0e1a22')
    expect(dark).toContain('--card: #16262f')
    expect(dark).toContain('--txt: #e4edf2')
    expect(dark).toContain('--accent: #6c8fa9')
    expect(dark).toContain('--accent2: #8fb0c4')
  })
  it('状态色 + 阴影(深色)', () => {
    expect(dark).toContain('--danger: #e0697a')
    expect(dark).toContain('--ok: #5ba88a')
    expect(dark).toContain('--shadow-1: 0 1px 2px rgba(0,0,0,.4), 0 2px 8px rgba(0,0,0,.3)')
  })
  it('V2:暗色三态(淡底 16%;ok/danger 文字提亮,其余用本色)', () => {
    expect(dark).toContain('--ok-bg: color-mix(in srgb, var(--ok) 16%, transparent);')
    expect(dark).toContain('--warn-bg: color-mix(in srgb, var(--warn) 16%, transparent);')
    expect(dark).toContain('--danger-bg: color-mix(in srgb, var(--danger) 16%, transparent);')
    expect(dark).toContain('--urgent-bg: color-mix(in srgb, var(--c-urgent) 16%, transparent);')
    expect(dark).toContain('--advance-bg: color-mix(in srgb, var(--c-advance) 16%, transparent);')
    expect(dark).toContain('--ok-text: #7dbfa3;')
    expect(dark).toContain('--warn-text: var(--warn);')
    expect(dark).toContain('--danger-text: #ea8b99;')
    expect(dark).toContain('--urgent-text: var(--c-urgent);')
    expect(dark).toContain('--advance-text: var(--c-advance);')
  })
})

describe('theme.css 全局规则', () => {
  it('包含 prefers-reduced-motion 降级', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
  })
  it('V2:.u-num 工具类 + body 字体走令牌', () => {
    expect(css).toContain('.u-num { font-variant-numeric: tabular-nums; }')
    expect(css).toContain('font-family: var(--font-sans)')
    expect(css).not.toContain('Inter')
  })
})
