import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CHART_LIGHT, CHART_DARK, STRUCT_LIGHT, STRUCT_DARK, FONT_SANS, STATUS_LIGHT, STATUS_DARK, MUTED_LIGHT, MUTED_DARK } from './echartsTheme'

// 双源契约(spec 1.7):ECharts 画在 canvas 上读不到 CSS 变量,
// echartsTheme.ts 的取值必须与 theme.css 同名令牌逐项一致 —— 改一边漏一边,这里即红。
// theme.css 侧从源文件解析;TS 侧直接 import 导出常量。
// 注:先赋变量再 new URL,避免 Vite 在 jsdom 下静态重写为 http 地址(同 theme.tokens.test.ts)。
const _metaUrl = import.meta.url
const css = readFileSync(fileURLToPath(new URL('../styles/theme.css', _metaUrl)), 'utf-8')

// :root 与 html.dark 块内无嵌套花括号,取第一个 '}' 即块尾。
function block(selector: string): string {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`theme.css 缺少选择器块: ${selector}`)
  const end = css.indexOf('}', start)
  return css.slice(start, end)
}
// 解析块内某令牌的取值(小写化以忽略大小写差异)。
function cssVar(blockText: string, name: string): string {
  const m = blockText.match(new RegExp(`${name}:\\s*([^;]+);`))
  if (!m) throw new Error(`theme.css 块内缺少令牌 ${name}`)
  return m[1].trim().toLowerCase()
}
const root = block(':root {')
const dark = block('html.dark {')

describe('ECharts 双源契约 · 调色板', () => {
  it('浅色 8 支 = theme.css :root --chart-1..8', () => {
    expect(CHART_LIGHT).toHaveLength(8)
    CHART_LIGHT.forEach((c, i) => expect(c.toLowerCase()).toBe(cssVar(root, `--chart-${i + 1}`)))
  })
  it('深色 8 支 = theme.css html.dark --chart-1..8', () => {
    expect(CHART_DARK).toHaveLength(8)
    CHART_DARK.forEach((c, i) => expect(c.toLowerCase()).toBe(cssVar(dark, `--chart-${i + 1}`)))
  })
})

describe('ECharts 双源契约 · 结构映射(spec 1.7)', () => {
  it('浅色 txt/sub/line/line2/card', () => {
    expect(STRUCT_LIGHT.txt).toBe(cssVar(root, '--txt'))
    expect(STRUCT_LIGHT.sub).toBe(cssVar(root, '--sub'))
    expect(STRUCT_LIGHT.line).toBe(cssVar(root, '--line'))
    expect(STRUCT_LIGHT.line2).toBe(cssVar(root, '--line2'))
    expect(STRUCT_LIGHT.card).toBe(cssVar(root, '--card'))
  })
  it('深色 txt/sub/line/line2/card', () => {
    expect(STRUCT_DARK.txt).toBe(cssVar(dark, '--txt'))
    expect(STRUCT_DARK.sub).toBe(cssVar(dark, '--sub'))
    expect(STRUCT_DARK.line).toBe(cssVar(dark, '--line'))
    expect(STRUCT_DARK.line2).toBe(cssVar(dark, '--line2'))
    expect(STRUCT_DARK.card).toBe(cssVar(dark, '--card'))
  })
  it('字体栈 = theme.css --font-sans', () => {
    expect(FONT_SANS.toLowerCase()).toBe(cssVar(root, '--font-sans'))
  })
})

describe('ECharts 双源契约 · 状态色(spec 1.7)', () => {
  it('STATUS_* 与 theme.css 状态色同步', () => {
    expect(STATUS_LIGHT.ok).toBe(cssVar(root, '--ok'))
    expect(STATUS_LIGHT.warn).toBe(cssVar(root, '--warn'))
    expect(STATUS_LIGHT.danger).toBe(cssVar(root, '--danger'))
    expect(STATUS_DARK.ok).toBe(cssVar(dark, '--ok'))
    expect(STATUS_DARK.warn).toBe(cssVar(dark, '--warn'))
    expect(STATUS_DARK.danger).toBe(cssVar(dark, '--danger'))
  })
})

describe('ECharts 双源契约 · 中性灰(MUTED)', () => {
  it('MUTED_* 与 theme.css --mut 同步', () => {
    expect(MUTED_LIGHT).toBe(cssVar(root, '--mut'))
    expect(MUTED_DARK).toBe(cssVar(dark, '--mut'))
  })
})
