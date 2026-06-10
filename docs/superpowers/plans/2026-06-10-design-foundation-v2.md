# 设计底层规范 V2 增补 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 spec V2 增补的令牌落进 theme.css,并把 ECharts 主题重写为与令牌同源(双源契约测试强制),版本升 V6.5.0。

**Architecture:** 沿用 V1 的「令牌唯一落地 + 契约测试守护」模式:`theme.css` 是 CSS 唯一落地文件(`:root` 浅色 + `html.dark` 深色覆盖);`echartsTheme.ts` 因 canvas 读不到 CSS 变量成为第二落地文件,其导出常量(调色板/结构映射/字体栈)由新契约测试与 theme.css 解析值逐项比对。现有页面不迁移,零令牌改名。

**Tech Stack:** Vue3 + Vite + TS,Vitest(jsdom + globals),ECharts(vue-echarts),纯 CSS 自定义属性(color-mix 渐进增强)。

**Spec:** `docs/superpowers/specs/2026-06-10-design-foundation-design.md`(V2,提交 1a9b759)
**分支:** `feat/design-foundation-v2`(已建,基于 master 8521251)

**背景常识(实现者必读):**
- 契约测试模式:直接 `readFileSync` 读 `theme.css` 源文件断言令牌文本存在。注意 Vite 在 jsdom 下会把字面量 `new URL('./x', import.meta.url)` 静态重写为 http 地址,**必须**先把 `import.meta.url` 赋给中间变量再传入(现有 `theme.tokens.test.ts` 顶部有同款注释)。
- `block()` 辅助函数假设 `:root {` / `html.dark {` 块内无嵌套花括号 —— `color-mix(...)` 只有圆括号,不破坏该假设。
- 测试命令在 `frontend/` 下运行:`npm run test:run -- <文件>`(vitest run)。
- 验证门槛:仓库根目录 `bash verify.sh` 全绿(py_compile + ruff + pytest + 前端 typecheck/vitest/build)才算完成。
- 提交规范:不用 emoji;**禁止 `git add -A` / `git add .`**(input/、data/ 等绝不入库),逐文件 add。

**文件结构(全部改动):**

| 文件 | 动作 | 职责 |
|---|---|---|
| `frontend/src/styles/theme.css` | 修改 | V2 令牌:--mut 改值/三态/字体/行高字距/交互层/z-index/.u-num |
| `frontend/src/styles/theme.tokens.test.ts` | 修改 | 扩展契约:V2 令牌存在性与取值 |
| `frontend/src/charts/echartsTheme.ts` | 重写 | 调色板与结构色全部换为令牌同源值,导出常量供契约测试 |
| `frontend/src/charts/echartsTheme.tokens.test.ts` | 新建 | 双源契约:TS 导出常量 ↔ theme.css 解析值逐项相等 |
| `frontend/src/version.ts` | 修改 | V6.5.0 |
| `PROGRESS.md` | 修改 | 版本记录 + Plan 完成条目 |

---

### Task 1: theme.css V2 令牌 + 契约测试扩展

**Files:**
- Modify: `frontend/src/styles/theme.css`
- Test: `frontend/src/styles/theme.tokens.test.ts`

- [ ] **Step 1: 写失败测试 —— 在 `theme.tokens.test.ts` 追加 V2 契约**

在 `describe('theme.css 令牌契约 · :root(浅色)', ...)` 块内(`it('向后兼容:旧令牌名一律保留', ...)` 之后)追加三个 it:

```ts
  it('V2:--mut 加深 + 字体/行高/字距令牌', () => {
    expect(root).toContain('--mut: #62707d')
    expect(root).toContain('--font-sans: -apple-system, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif')
    expect(root).toContain('--lh-tight: 1.15')
    expect(root).toContain('--lh-dense: 1.4')
    expect(root).toContain('--lh-base: 1.6')
    expect(root).toContain('--ls-wide: 0.05em')
  })
  it('V2:状态三态(淡底 12% + 深字)与 --c-advance 收编', () => {
    expect(root).toContain('--c-advance: var(--cyan)')
    expect(root).toContain('--ok-bg: color-mix(in srgb, var(--ok) 12%, transparent)')
    expect(root).toContain('--warn-bg: color-mix(in srgb, var(--warn) 12%, transparent)')
    expect(root).toContain('--danger-bg: color-mix(in srgb, var(--danger) 12%, transparent)')
    expect(root).toContain('--urgent-bg: color-mix(in srgb, var(--c-urgent) 12%, transparent)')
    expect(root).toContain('--advance-bg: color-mix(in srgb, var(--c-advance) 12%, transparent)')
    expect(root).toContain('--ok-text: #37745b')
    expect(root).toContain('--warn-text: #8a6210')
    expect(root).toContain('--danger-text: #b93848')
    expect(root).toContain('--urgent-text: #a84b1d')
    expect(root).toContain('--advance-text: #066f89')
  })
  it('V2:交互状态层与 z-index 阶梯', () => {
    expect(root).toContain('--hover-tint: color-mix(in srgb, var(--accent) 6%, transparent)')
    expect(root).toContain('--selected-tint: color-mix(in srgb, var(--accent) 12%, transparent)')
    expect(root).toContain('--disabled-opacity: 0.45')
    expect(root).toContain('--z-sticky: 100')
    expect(root).toContain('--z-panel: 1500')
    expect(root).toContain('--z-toast: 4000')
  })
```

在 `describe('theme.css 令牌契约 · html.dark(深色覆盖)', ...)` 块内追加:

```ts
  it('V2:暗色三态(淡底提至 16%,文字用状态本色)', () => {
    expect(dark).toContain('--ok-bg: color-mix(in srgb, var(--ok) 16%, transparent)')
    expect(dark).toContain('--warn-bg: color-mix(in srgb, var(--warn) 16%, transparent)')
    expect(dark).toContain('--danger-bg: color-mix(in srgb, var(--danger) 16%, transparent)')
    expect(dark).toContain('--urgent-bg: color-mix(in srgb, var(--c-urgent) 16%, transparent)')
    expect(dark).toContain('--advance-bg: color-mix(in srgb, var(--c-advance) 16%, transparent)')
    expect(dark).toContain('--ok-text: var(--ok)')
    expect(dark).toContain('--warn-text: var(--warn)')
    expect(dark).toContain('--danger-text: var(--danger)')
    expect(dark).toContain('--urgent-text: var(--c-urgent)')
    expect(dark).toContain('--advance-text: var(--c-advance)')
  })
```

在 `describe('theme.css 全局规则', ...)` 块内追加:

```ts
  it('V2:.u-num 工具类 + body 字体走令牌', () => {
    expect(css).toContain('.u-num { font-variant-numeric: tabular-nums; }')
    expect(css).toContain('font-family: var(--font-sans)')
  })
```

- [ ] **Step 2: 跑测试确认失败(RED)**

Run: `cd frontend && npm run test:run -- src/styles/theme.tokens.test.ts`
Expected: FAIL —— 新增 5 个 it 全红(旧 11 个仍绿),失败信息为 `expected ... to contain '--mut: #62707d'` 等。

- [ ] **Step 3: 修改 theme.css(浅色 :root)**

逐处修改(行号基于当前文件):

3a. `--fs-base: 16px;` 之后追加字体令牌:

```css
  --font-sans: -apple-system, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
```

3b. 结构色块中 `--mut: #7c8a97;` 改为:

```css
  --mut: #62707d;
```

3c. 状态语义色块尾部(`--c-urgent: #e07a4f;` 之后)追加:

```css
  --c-advance: var(--cyan); /* 可提前(原 --cyan 收编,旧名保留兼容) */

  /* 状态三态(V2):填充=上方本色;淡底 12% 自适应底色;文字深字达 4.5:1 */
  --ok-bg: color-mix(in srgb, var(--ok) 12%, transparent);
  --warn-bg: color-mix(in srgb, var(--warn) 12%, transparent);
  --danger-bg: color-mix(in srgb, var(--danger) 12%, transparent);
  --urgent-bg: color-mix(in srgb, var(--c-urgent) 12%, transparent);
  --advance-bg: color-mix(in srgb, var(--c-advance) 12%, transparent);
  --ok-text: #37745b;
  --warn-text: #8a6210;
  --danger-text: #b93848;
  --urgent-text: #a84b1d;
  --advance-text: #066f89;
```

3d. 字号令牌块尾部(`--fs-6: 2.15rem;` 注释行之后)追加:

```css
  /* 行高三档 + 字距(V2):tight=fs-5/6 大数字标题,dense=fs-1/2/4 表格标签,base=fs-3 正文;字距仅拉丁/数字大写标签 */
  --lh-tight: 1.15;
  --lh-dense: 1.4;
  --lh-base: 1.6;
  --ls-wide: 0.05em;
```

3e. 动效块尾部(`--ease: cubic-bezier(.2, 0, 0, 1);` 之后)追加两组:

```css

  /* 交互状态层(V2):自绘件五态 default/hover/selected/disabled/focus */
  --hover-tint: color-mix(in srgb, var(--accent) 6%, transparent);
  --selected-tint: color-mix(in srgb, var(--accent) 12%, transparent);
  --disabled-opacity: 0.45;

  /* 层叠阶梯(V2):自绘浮层只准用这三级;弹窗/抽屉/下拉优先用 EP(自带 2000+ 动态管理) */
  --z-sticky: 100;
  --z-panel: 1500;
  --z-toast: 4000;
```

- [ ] **Step 4: 修改 theme.css(暗色 html.dark)**

`html.dark` 块内状态语义色段尾部(`--c-urgent: #ec8a60;` 之后)追加:

```css

  /* 状态三态(暗色,V2):淡底提至 16%,文字直接用状态本色(实测 4.78~8.59 达标) */
  --ok-bg: color-mix(in srgb, var(--ok) 16%, transparent);
  --warn-bg: color-mix(in srgb, var(--warn) 16%, transparent);
  --danger-bg: color-mix(in srgb, var(--danger) 16%, transparent);
  --urgent-bg: color-mix(in srgb, var(--c-urgent) 16%, transparent);
  --advance-bg: color-mix(in srgb, var(--c-advance) 16%, transparent);
  --ok-text: var(--ok);
  --warn-text: var(--warn);
  --danger-text: var(--danger);
  --urgent-text: var(--c-urgent);
  --advance-text: var(--c-advance);
```

注:`--c-advance: var(--cyan)` 不需要暗色重声明 —— 暗色块已覆盖 `--cyan: #22d3ee`,别名自动跟随。

- [ ] **Step 5: 修改 theme.css(全局规则)**

5a. body 的 `font-family` 整行替换为:

```css
  font-family: var(--font-sans);
```

(原值 `Inter, "Noto Sans SC", -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif` 含 Inter 且未走令牌,V2 移除 Inter 并收敛到 `--font-sans`。)

5b. `.u-grid-auto` 规则块之后追加:

```css

/* 数字排版(V2):金额/百分比/KPI/表格数字列必须挂 —— 等宽数字,列对齐、刷新不跳动。 */
.u-num { font-variant-numeric: tabular-nums; }
```

- [ ] **Step 6: 跑测试确认通过(GREEN)**

Run: `cd frontend && npm run test:run -- src/styles/theme.tokens.test.ts`
Expected: PASS —— 16 个 it 全绿(11 旧 + 5 新)。

- [ ] **Step 7: 全量前端测试防回归**

Run: `cd frontend && npm run test:run`
Expected: 全绿(改 `--mut` 取值与 body 字体不影响任何组件测试;若有红,先查是否有测试断言旧字体栈)。

- [ ] **Step 8: Commit**

```bash
git add frontend/src/styles/theme.css frontend/src/styles/theme.tokens.test.ts
git commit -m "feat(design): theme.css 落地 V2 令牌(三态/交互层/数字排版/字体/z-index)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: echartsTheme.ts 令牌同源重写 + 双源契约测试

**Files:**
- Modify: `frontend/src/charts/echartsTheme.ts`(整文件重写)
- Create: `frontend/src/charts/echartsTheme.tokens.test.ts`

**背景:** 现文件用一套与令牌完全无关的旧调色板(`#6366F1...`)。ECharts 画在 canvas 上读不到 CSS 变量,所以取值必须在 TS 里复写一份,并用契约测试与 theme.css 锁死(spec 1.7)。`ENT_THEME`/`ENT_THEME_DARK` 导出名不能变(`ChartBox.vue` 与 `ChartBox.test.ts` 引用)。旧 `PALETTE` 常量仅本文件使用,可安全删除。

- [ ] **Step 1: 写失败测试 —— 新建 `frontend/src/charts/echartsTheme.tokens.test.ts`**

完整文件内容:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CHART_LIGHT, CHART_DARK, STRUCT_LIGHT, STRUCT_DARK, FONT_SANS } from './echartsTheme'

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
```

- [ ] **Step 2: 跑测试确认失败(RED)**

Run: `cd frontend && npm run test:run -- src/charts/echartsTheme.tokens.test.ts`
Expected: FAIL —— 导入错误(`echartsTheme` 尚未导出 `CHART_LIGHT` 等 5 个常量)。

- [ ] **Step 3: 重写 `frontend/src/charts/echartsTheme.ts`**

完整文件内容(整文件替换):

```ts
import { use, registerTheme } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'

// 按需注册 ECharts 模块（tree-shaking）
use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent])

// canvas 读不到 CSS 变量:以下取值必须与 theme.css 同名令牌逐项一致(第二落地文件,spec 1.7),
// 由 echartsTheme.tokens.test.ts 双源契约强制 —— 改 theme.css 没改这里(或反之),测试即红。
export const FONT_SANS = '-apple-system, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif'

// --chart-1..8(浅/暗)
export const CHART_LIGHT = ['#6c8fa9', '#b484b0', '#417a64', '#886441', '#d24d5c', '#c8adc4', '#fec187', '#a7c190']
export const CHART_DARK = ['#7fa5be', '#c29ac0', '#5ba88a', '#b08a63', '#e0697a', '#d2bccf', '#fec187', '#b7cea3']

// 结构色映射:txt=标题/tooltip 文字,sub=轴标签/图例,line=分隔线/tooltip 边,line2=轴线,card=tooltip 底
export const STRUCT_LIGHT = { txt: '#1e2a33', sub: '#4a5b68', line: '#dde6ee', line2: '#cddae2', card: '#ffffff' }
export const STRUCT_DARK = { txt: '#e4edf2', sub: '#a7bac7', line: '#253a47', line2: '#2f4756', card: '#16262f' }

function buildTheme(palette: string[], s: typeof STRUCT_LIGHT) {
  return {
    color: palette,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: FONT_SANS, color: s.txt },
    title: { textStyle: { color: s.txt } },
    legend: { textStyle: { color: s.sub } },
    categoryAxis: {
      axisLine: { lineStyle: { color: s.line2 } },
      axisTick: { lineStyle: { color: s.line2 } },
      axisLabel: { color: s.sub },
      splitLine: { show: false, lineStyle: { color: s.line } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: s.line2 } },
      axisTick: { lineStyle: { color: s.line2 } },
      axisLabel: { color: s.sub },
      splitLine: { lineStyle: { color: s.line } },
    },
    tooltip: { backgroundColor: s.card, borderColor: s.line, textStyle: { color: s.txt } },
  }
}

// 'ent':浅色(沿用旧主题名,避免破坏既有引用/测试)
export const ENT_THEME = 'ent'
registerTheme(ENT_THEME, buildTheme(CHART_LIGHT, STRUCT_LIGHT))

// 'ent-dark':深色
export const ENT_THEME_DARK = 'ent-dark'
registerTheme(ENT_THEME_DARK, buildTheme(CHART_DARK, STRUCT_DARK))
```

- [ ] **Step 4: 跑测试确认通过(GREEN)**

Run: `cd frontend && npm run test:run -- src/charts/echartsTheme.tokens.test.ts`
Expected: PASS —— 5 个 it 全绿。

- [ ] **Step 5: 跑 ChartBox 既有测试确认导出名兼容**

Run: `cd frontend && npm run test:run -- src/charts/ChartBox.test.ts`
Expected: PASS(`ENT_THEME`/`ENT_THEME_DARK` 导出名未变)。

- [ ] **Step 6: 全量前端测试 + typecheck**

Run: `cd frontend && npm run test:run && npm run typecheck`
Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
git add frontend/src/charts/echartsTheme.ts frontend/src/charts/echartsTheme.tokens.test.ts
git commit -m "feat(design): ECharts 主题与令牌同源(chart-1..8/结构映射/字体栈,双源契约测试)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 版本 V6.5.0 + PROGRESS.md + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`(头部两行 + 新增 Plan 完成条目)

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts` 整文件替换为:

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V6.5.0'
export const RELEASE_DATE = '2026-06-10'
```

(AboutView/AppHeader 经 import 引用,无需改;`AboutView.test.ts` 断言的是常量本身,版本升级不破坏。)

- [ ] **Step 2: 更新 PROGRESS.md**

2a. 头部两行(当前第 7-8 行)改为:

```markdown
- 当前版本：**V6.5.0**
- 最近更新：2026-06-10（设计底层规范 V2 增补，V6.5.0）
```

2b. 在 `### ✅ Plan design-foundation 完成（2026-06-10）` 条目**之前**插入:

```markdown
### ✅ Plan design-foundation-v2 完成（2026-06-10）：设计底层规范 V2 增补（V6.5.0）
- 分支 **`feat/design-foundation-v2`**，3 任务全完成、`verify.sh` 全绿。
- V6.5.0（2026-06-10）底层规范 V2：浅色 --mut 加深 #62707D（对比度达标）；状态色三态（填充+淡底 12%/16%+深字，--cyan 收编为 --c-advance）；交互状态层（--hover-tint/--selected-tint/--disabled-opacity）；数字排版（.u-num tabular-nums + 行高三档 + --ls-wide）；--font-sans 系统栈（移除 Inter）；z-index 三级阶梯；断点入规范。ECharts 主题重写为令牌同源（chart-1..8/结构映射/字体栈），双源契约测试强制一致。仅令牌+文档，现有页面未迁移。spec: docs/superpowers/specs/2026-06-10-design-foundation-design.md（V2）
- 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → 看板图表配色应变为蓝/紫/绿/棕/红等 8 支分类色（不再是旧紫蓝色系）；切换亮\暗模式图表轴线/文字随主题；列头等弱化文字略加深；字体不再依赖本机 Inter。

```

- [ ] **Step 3: 全量验证**

Run: 仓库根目录 `bash verify.sh`
Expected: 全绿(py_compile + ruff + pytest 125 + 前端 typecheck + vitest(334+10 新) + build)。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(design): 版本 V6.5.0 + PROGRESS 记录底层规范 V2 落地

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## 完成定义

- 3 任务全部提交,`bash verify.sh` 全绿。
- 契约测试守住:V2 全部新令牌 + ECharts 双源一致性。
- 零令牌改名;`ENT_THEME`/`ENT_THEME_DARK` 导出名不变;现有页面零迁移。
- 之后走 superpowers:finishing-a-development-branch(预期:合并回 master)。
