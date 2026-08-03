import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

// ============================================================================
// 设计底层规范「散值棘轮」守卫
//
// 背景：CLAUDE.md「设计底层规范」写了一整套硬性取值约束（间距只取 --sp-0..7、
// 圆角只取 --r-*、动效时长只取 --dur-1/2、颜色只从令牌取），但在本文件之前
// **没有任何一条测试去扫 .vue/.css 里的散值**：
//   - theme.tokens.test.ts        只校验 theme.css 内部的令牌定义与取值；
//   - echartsTheme.tokens.test.ts 只校验 CSS 与 canvas 双源一致；
//   - __pageHeader.test.ts        只做组件接入广度的下界。
// 于是「某个页面通篇硬写散值」这件事，现有测试一条都不会红。
//
// 【为什么是棘轮而不是一刀切禁令】
// ① 下面每个基线数字都是**实测**得来的（本文件写作时用同一套扫描代码跑出来的结果），
//    不是拍脑袋定的，也不是从规范里推出来的应然值。
// ② 设计规范 spec §12.3 明确写过「现有页面不迁移」—— 所以这些存量散值
//    **不是违规**，是规范自己许可的历史遗留。一刀切禁令会让整支测试立刻全红、
//    最后只能被注释掉，等于没有守卫。
// ③ 因此断言一律是「不得**超过**当前基线」：存量欠账不阻塞任何人，
//    但新增一处散值必然变红。这个数字**只准降不准升** —— 谁把某页迁成令牌了，
//    就顺手把这里的基线改小，把降下来的额度锁死，不许再被别人用掉。
//
// 【自证规模断言】
// 本仓踩过 V4.5.3「第五种假绿」：结构守卫靠解析源码，一旦解析/路径失配就返回空集合，
// 循环空跑、「零处违规」恒真通过。故本文件第一条 it 专门钉住扫描规模
// （文件数 / 声明总数 / 令牌引用总数），扫描路径一坏它就红，而不是静默放行。
// ============================================================================

const SRC = resolve(__dirname, '..')

/** 递归收集 src 下的源文件；跳过 .omc（会话状态，不是源码）。 */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.omc' || e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const allFiles = walk(SRC)
const vueFiles = allFiles.filter((f) => f.endsWith('.vue'))
const cssFiles = allFiles.filter((f) => f.endsWith('.css'))
const rel = (f: string) => f.slice(SRC.length + 1).replace(/\\/g, '/')

/** 取 .vue 的全部 <style> 块内容（模板/脚本不算样式，不参与扫描）。 */
function styleBlocks(src: string): string {
  const out: string[] = []
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) out.push(m[1])
  return out.join('\n')
}

/**
 * 丢弃 @media (prefers-reduced-motion) 整块。
 * 该块是**规范自己要求**的降级开关（CLAUDE.md：动效须尊重 prefers-reduced-motion），
 * 里面的 `transition-duration: .001ms !important` / `transition: none !important`
 * 就是关停动效的标准写法，硬值是必须的，不属于散值。
 * 用花括号配对扫描而不是正则 —— 正则匹配不了嵌套块。
 */
function stripReducedMotion(css: string): string {
  let out = ''
  let i = 0
  for (;;) {
    const at = css.indexOf('@media', i)
    if (at === -1) { out += css.slice(i); break }
    const open = css.indexOf('{', at)
    if (open === -1) { out += css.slice(i); break }
    if (!/prefers-reduced-motion/.test(css.slice(at, open))) {
      out += css.slice(i, open + 1)
      i = open + 1
      continue
    }
    let depth = 1
    let j = open + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    out += css.slice(i, at)
    i = j
  }
  return out
}

interface Decl { file: string; prop: string; value: string }

/**
 * 提取 CSS 声明。前导 (?:^|[;{}]) 让类选择器（`.transition:hover`）匹配不上 ——
 * 前一个字符是 `.` 而不是 `;{}`，故不会被误当成 transition 属性。
 * 自定义属性保留 `--` 前缀，这样 `--gap: 8px`（定义）不会被当成 `gap`（使用）。
 */
function declarations(file: string, css: string): Decl[] {
  const out: Decl[] = []
  const re = /(?:^|[;{}])\s*((?:--)?[a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*([^;{}]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) out.push({ file, prop: m[1], value: m[2].trim() })
  return out
}

const styleUnits = [
  ...vueFiles.map((f) => ({ file: f, css: styleBlocks(readFileSync(f, 'utf-8')) })),
  ...cssFiles.map((f) => ({ file: f, css: readFileSync(f, 'utf-8') })),
]
  .map((u) => ({ ...u, css: stripReducedMotion(u.css.replace(/\/\*[\s\S]*?\*\//g, '')) }))
  .filter((u) => u.css.trim().length > 0)

const decls = styleUnits.flatMap((u) => declarations(u.file, u.css))

const usesToken = (v: string) => /var\(\s*--/.test(v)
/** 负号前缀（-4px）也算硬写；(?<![\w-]) 挡住 `--sp-4px` 这类标识符里的假匹配。 */
const hasHardPx = (v: string) => /(?<![\w.-])-?\d*\.?\d+px/.test(v)

const fmt = (list: Decl[]) =>
  list.map((d) => `  ${rel(d.file)} | ${d.prop}: ${d.value}`).join('\n')

// ---------------------------------------------------------------- 间距
const SPACING_PROPS = new Set([
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'padding-inline', 'padding-block', 'padding-inline-start', 'padding-inline-end',
  'padding-block-start', 'padding-block-end',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-inline', 'margin-block', 'margin-inline-start', 'margin-inline-end',
  'margin-block-start', 'margin-block-end',
  'gap', 'row-gap', 'column-gap', 'grid-gap',
])
const spacingDecls = decls.filter((d) => SPACING_PROPS.has(d.prop))
const spacingHard = spacingDecls.filter((d) => hasHardPx(d.value))
const spacingToken = spacingDecls.filter((d) => usesToken(d.value))

// ---------------------------------------------------------------- 圆角
const RADIUS_PROPS = new Set([
  'border-radius',
  'border-top-left-radius', 'border-top-right-radius',
  'border-bottom-left-radius', 'border-bottom-right-radius',
])
const radiusDecls = decls.filter((d) => RADIUS_PROPS.has(d.prop))
const radiusHard = radiusDecls.filter((d) => hasHardPx(d.value))
const radiusToken = radiusDecls.filter((d) => usesToken(d.value))

// ---------------------------------------------------------------- 动效时长
// 只看 transition / transition-duration。@keyframes 动画时长（登录页 2.2s 巡视、
// 1.8s 脉冲环）不在此列：--dur-1/--dur-2 的定义就是「状态反馈 / 展开浮层」两档，
// 循环动画本就不该被塞进这两档。
const DURATION_PROPS = new Set(['transition', 'transition-duration'])
const durationDecls = decls.filter((d) => DURATION_PROPS.has(d.prop))
// 判据是「值里出现时间字面量」，而不是「值里没有 var(--dur)」——
// 后者会放过 `transition: transform var(--dur-1) var(--ease), color 200ms ease`
// 这种一半走令牌、一半硬写的混合写法。走令牌的值里本就不会有时间字面量，
// 故直接查字面量既堵住混合写法、又不会误伤纯令牌写法（与间距的判据保持同构）。
const durationHard = durationDecls.filter((d) => /(?<![\w.-])-?\d*\.?\d+m?s(?![\w-])/.test(d.value))
const durationToken = durationDecls.filter((d) => /var\(\s*--dur/.test(d.value))

// ---------------------------------------------------------------- 颜色
// theme.css 是令牌的**唯一定义处**，里面的 hex 就是色板本身，天然豁免。
// 只扫声明值，不扫选择器 —— 否则 id 选择器会被误判成颜色。
const HEX = /#[0-9a-fA-F]{3,8}\b/
const hexHard = decls.filter((d) => rel(d.file) !== 'styles/theme.css' && HEX.test(d.value))

describe('设计底层规范 · 扫描规模自证（防「路径失配→空集合→恒真通过」）', () => {
  it('扫描到的文件数 / 声明数 / 令牌引用数须在合理范围', () => {
    // 这条不是业务断言，是给下面所有棘轮断言做的**担保**：
    // 一旦 SRC 路径失效、<style> 提取正则失配、或声明解析器被改坏，
    // 下面每条 `xxxHard.length <= N` 都会因为 0 <= N 而恒真通过（本仓最常见的假绿形态，
    // V4.5.3 实测踩过）。所以先把规模钉死，扫不到东西就在这里红。
    expect(vueFiles.length, 'src 下 .vue 文件数异常（实测 134）').toBeGreaterThan(120)
    expect(cssFiles.length, 'src 下 .css 文件数异常（实测 3）').toBeGreaterThanOrEqual(3)
    expect(styleUnits.length, '含样式的文件数异常（实测 130）').toBeGreaterThan(110)
    expect(decls.length, 'CSS 声明解析数异常（实测 3940）').toBeGreaterThan(3000)
    expect(spacingDecls.length, '间距声明解析数异常（实测 762）').toBeGreaterThan(600)
    expect(radiusDecls.length, '圆角声明解析数异常（实测 136）').toBeGreaterThan(100)
    expect(durationDecls.length, '动效声明解析数异常（实测 27）').toBeGreaterThan(20)
    // 令牌引用总数：证明「var(--xxx) 认得出来」这条链路本身没坏。
    expect(spacingToken.length, '间距令牌引用数异常（实测 656）').toBeGreaterThan(550)
    expect(radiusToken.length, '圆角令牌引用数异常（实测 133）').toBeGreaterThan(100)
  })
})

describe('设计底层规范 · 散值棘轮（只准降不准升）', () => {
  it('间距硬写 px 不得超过基线 91 处', () => {
    // 实测基线：硬写 91 处 / 令牌引用 656 处，令牌占比 87.8%。
    // 存量集中在 chip/badge 的 1px~3px 内边距（规范只给了 --sp-0 = 2px 一档，
    // 1px/3px 无对应令牌）与日历/看板几个早期组件。
    // 新增一处 `padding: 10px` 这条就会红 —— 请改用 --sp-0..7。
    expect(spacingHard.length, `间距硬写 px 增加了。新增的散值请改用 --sp-0..7：\n${fmt(spacingHard)}`)
      .toBeLessThanOrEqual(91)
  })

  it('间距令牌占比不得低于基线 87.8%', () => {
    // 与上一条互补：上一条防「新增硬写」，这一条防「删掉令牌用法把占比稀释掉」。
    // 分母用 硬写+令牌 而非全部间距声明 —— `padding: 0` / `margin: auto` 这类
    // 既非硬写散值也无需令牌，不该进分母。
    // 注意：整体删除一个「令牌用得多、硬写少」的组件会让占比下降而并非退步，
    // 届时重新实测、把基线改成新的真实值即可（同样要求「改了就锁死」）。
    const share = (spacingToken.length / (spacingToken.length + spacingHard.length)) * 100
    expect(share, `间距令牌占比 ${share.toFixed(2)}% 低于基线`).toBeGreaterThanOrEqual(87.8)
  })

  it('圆角硬写 px 不得超过基线 0 处', () => {
    // 基线 0 是**实测**结果：写本文件时全仓圆角已全部走 --r-sm/--r-md/--r-lg/--r-full，
    // 剩下的非令牌值只有 `border-radius: 50%`（正圆点，百分比不是 px，不在扫描口径内）。
    // 既然已经清零，就把 0 锁死。
    expect(radiusHard.length, `圆角出现硬写 px，请改用 --r-sm/--r-md/--r-lg/--r-full：\n${fmt(radiusHard)}`)
      .toBeLessThanOrEqual(0)
  })

  it('transition 时长硬写不得超过基线 0 处', () => {
    // 同样是实测清零后锁死。prefers-reduced-motion 降级块已在扫描前整块剔除
    // （那里的硬值是规范要求的关停写法）。
    expect(durationHard.length, `transition 时长未走令牌，请改用 --dur-1(120ms)/--dur-2(200ms)：\n${fmt(durationHard)}`)
      .toBeLessThanOrEqual(0)
    expect(durationToken.length, 'transition 令牌引用数异常（实测 27）').toBeGreaterThan(20)
    // 「0 处硬写」在动效上极易恒真：真实原因可能是 DURATION_PROPS 拼错、
    // 或 stripReducedMotion 把整份 CSS 都吃掉了。上面这条钉住扫到的令牌用法规模。
  })

  it('theme.css 之外不得硬写 hex 色值，基线 0 处', () => {
    // 配色的单一来源是 theme.css（+ charts/echartsTheme.ts 做 canvas 侧同源桥接，
    // 由 echartsTheme.tokens.test.ts 另行看管）。页面里再写一支 hex，
    // 就意味着它在 light/dark 两套主题下必有一套是错的。
    expect(hexHard.length, `页面样式里出现硬写 hex，请从 theme.css 取令牌：\n${fmt(hexHard)}`)
      .toBeLessThanOrEqual(0)
  })
})
