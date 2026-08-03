/**
 * CSS 注释提前闭合守卫。
 *
 * ── 为什么要有这条守卫 ──
 * `theme.css` 里曾写过 `动效复用 --dur-*&#47;--ease。`（令牌通配写法紧跟斜杠）。
 * 那个 `*` 加 `/` 合起来就是注释结束符,注释在此提前闭合,后半段中文漏成 CSS 代码：
 *
 *   :root { ...;--disabled-opacity:.45;--ease。 *&#47; --lift:-2px; ... }
 *                                       ^^^^^^^^^^^^^^^^^^^^^^^
 * 浏览器读 `--ease。` 当属性名、期望 `:` 却遇到 `*` → 丢弃整个声明**直到下一个分号**,
 * 而那个分号在 `--lift:-2px` 之后 → **`--lift` 从未被定义**,`.u-lift:hover` 与四个
 * `.dv-btn.primary:hover` 的 `translateY(var(--lift))` 全是无效值,上浮效果一次没生效过。
 * 顶层那处更狠：漏出的文本被当成选择器一路吞到下一个 `{`,把整条
 * `.el-button{transition:...}` 规则吞掉,按钮只剩瞬间跳变、没有过渡。
 *
 * 这类缺陷**构建不报错、测试不变红、产物里还"看得见"令牌**（esbuild 原样保留文本,
 * 容错发生在浏览器端),V2.5.2 引入后躺了一个多月无人察觉,只有 build 日志里两行
 * `[WARNING] css-syntax-error` 是线索 —— 而 verify.sh 按退出码判定,不看警告。
 *
 * ── 判据为什么选「注释外不准有中文」 ──
 * 不去匹配 `-*&#47;` 这类具体写法（换个写法就绕过了）,而是抓后果：本仓 CSS 的中文只可能
 * 出现在注释里,注释一旦提前闭合,中文必然漏到注释外。任何形式的提前闭合都会被这条逮到。
 * 合法例外只有字符串字面量（`content:"中文"`、`font-family:"微软雅黑"`）,已跳过。
 *
 * ── 覆盖面 ──
 * `.css` 文件 + `.vue` 的 `<style>` 块（127 个块,同样过 esbuild、同样会踩这个坑）。
 * 缺陷本身出在 `theme.css`,但守卫只盯 `.css` 就会给下一个在 `.vue` 里踩坑的人留后门。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(__dirname, '..')
const CJK = /[一-鿿　-〿＀-￯]/

type Unit = { label: string; content: string; lineOffset: number }

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p, exts))
    else if (exts.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

/** 收集待检的 CSS 片段：整份 .css，以及 .vue 里每个 <style> 块（带行号偏移）。 */
function collectUnits(): Unit[] {
  const units: Unit[] = []
  for (const f of walk(SRC, ['.css'])) {
    units.push({ label: relative(SRC, f), content: readFileSync(f, 'utf-8'), lineOffset: 0 })
  }
  for (const f of walk(SRC, ['.vue'])) {
    const src = readFileSync(f, 'utf-8')
    const re = /<style[^>]*>([\s\S]*?)<\/style>/g
    let m: RegExpExecArray | null
    let n = 0
    while ((m = re.exec(src)) !== null) {
      n++
      const before = src.slice(0, m.index + m[0].indexOf('>') + 1)
      units.push({
        label: `${relative(SRC, f)} <style#${n}>`,
        content: m[1],
        lineOffset: before.split('\n').length - 1,
      })
    }
  }
  return units
}

/** 逐字符状态机：返回注释外、字符串外出现的 CJK 位置。 */
function cjkOutsideComments(css: string): { line: number; text: string }[] {
  const hits: { line: number; text: string }[] = []
  let i = 0
  let line = 1
  let state: 'code' | 'comment' | 'sq' | 'dq' = 'code'
  while (i < css.length) {
    const c = css[i]
    const next = css[i + 1]
    if (c === '\n') line++
    if (state === 'code') {
      if (c === '/' && next === '*') { state = 'comment'; i += 2; continue }
      if (c === "'") { state = 'sq'; i++; continue }
      if (c === '"') { state = 'dq'; i++; continue }
      if (CJK.test(c)) {
        const lineText = css.slice(0, i).split('\n').pop() + css.slice(i).split('\n')[0]
        hits.push({ line, text: lineText.trim().slice(0, 100) })
        // 同一行只报一次,避免整段中文刷屏
        while (i < css.length && css[i] !== '\n') i++
        continue
      }
    } else if (state === 'comment') {
      if (c === '*' && next === '/') { state = 'code'; i += 2; continue }
    } else if (state === 'sq') {
      if (c === '\\') { i += 2; continue }
      if (c === "'") { state = 'code' }
    } else if (state === 'dq') {
      if (c === '\\') { i += 2; continue }
      if (c === '"') { state = 'code' }
    }
    i++
  }
  return hits
}

describe('CSS 注释不得提前闭合', () => {
  const units = collectUnits()

  it('自证：扫到了足量片段,且状态机对已知样例判定正确', () => {
    // 规模自证 —— 正则失配时 units 会塌成空数组,下面的 it.each 会一条不跑、静默全绿。
    expect(units.filter((u) => !u.label.includes('<style'))).not.toHaveLength(0)
    expect(units.filter((u) => u.label.includes('<style')).length).toBeGreaterThan(100)
    // 正常注释：中文在注释内 → 不报
    expect(cjkOutsideComments('/* 中文注释 */\n.a{color:red}')).toEqual([])
    // 提前闭合：`--dur-*` 紧跟斜杠 → 后半段中文漏出 → 必须报
    expect(cjkOutsideComments('/* 复用 --dur-*/--ease。 */\n.a{color:red}').length).toBe(1)
    // 字符串里的中文 → 合法,不报
    expect(cjkOutsideComments('.a::after{content:"中文"}')).toEqual([])
    expect(cjkOutsideComments(".a{font-family:'微软雅黑'}")).toEqual([])
  })

  it.each(collectUnits().map((u) => [u.label, u]))(
    '%s 的中文全部落在注释或字符串内',
    (_label, unit) => {
      const hits = cjkOutsideComments((unit as Unit).content)
      const msg = hits
        .map((h) => `  第 ${h.line + (unit as Unit).lineOffset} 行: ${h.text}`)
        .join('\n')
      expect(hits, `注释外出现中文,通常意味着上方注释被 "*/" 提前闭合:\n${msg}`).toEqual([])
    },
  )
})
