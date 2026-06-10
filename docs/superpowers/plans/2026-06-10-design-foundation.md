# 展示形式底层规范落地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `docs/superpowers/specs/2026-06-10-design-foundation-design.md` 的设计令牌落到 `frontend/src/styles/theme.css`,并把三档字号定为 14/16/18 —— 仅令牌+文档,现有页面不迁移。

**Architecture:** 单一落地文件 `theme.css`(`:root` 浅色 + `html.dark` 深色),全部令牌集中于此;`settings` store 复用现有写 `--fs-base` 机制,只改三档取值。两个测试守契约:`settings.test.ts`(字号档位)与新增 `theme.tokens.test.ts`(令牌存在性与取值)。现有 567 处 `var(--…)` 引用的令牌名一律保留,只改值/新增,零改名。

**Tech Stack:** Vue3 + Vite + TS,Pinia,Element Plus,Vitest(jsdom, globals)。

---

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `frontend/src/stores/settings.ts` | 主题/字号档位,写 `--fs-base` | 改 `FONT_PX` 为 14/16/18 |
| `frontend/src/stores/settings.test.ts` | 字号档位测试 | 改断言 14/18 |
| `frontend/src/styles/theme.css` | **全部设计令牌** + reset + EP 桥接 + 滚动条 | 改写(扩展令牌,保留旧名) |
| `frontend/src/styles/theme.tokens.test.ts` | 令牌契约测试(存在性+取值+向后兼容) | 新建 |
| `frontend/src/version.ts` | 版本号单一来源 | 升 V6.4.0 |
| `PROGRESS.md` | 进度记录 | 追加一行 |

**不改:** 任何 `*.vue` 页面、`DisplaySettings.vue`(其 小/中/大 → sm/md/lg 标签已就位)、`main.ts`(引入顺序已正确:EP css → dark css-vars → theme.css)。

---

## Task 1: 三档字号定为 14 / 16 / 18

**Files:**
- Modify: `frontend/src/stores/settings.test.ts`
- Modify: `frontend/src/stores/settings.ts:11`

- [ ] **Step 1: 改测试断言(先失败)**

把 `frontend/src/stores/settings.test.ts` 中两处 `--fs-base` 断言改为新值。

第 34 行 `setFontScale` 用例:
```ts
    s.setFontScale('lg')
    expect(localStorage.getItem('font_scale')).toBe('lg')
    expect(document.documentElement.style.getPropertyValue('--fs-base')).toBe('18px')
```

第 45 行 `init` 用例:
```ts
    s.init()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.getPropertyValue('--fs-base')).toBe('14px')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/stores/settings.test.ts`
Expected: FAIL —— 实际值仍为 `17px` / `13px`(FONT_PX 未改)。

- [ ] **Step 3: 改 FONT_PX**

`frontend/src/stores/settings.ts` 第 11 行:
```ts
// 字号档位 → 根字号（rem 基准）；新组件用 rem，切档即整体缩放。小14/中16/大18。
export const FONT_PX: Record<FontScale, string> = { sm: '14px', md: '16px', lg: '18px' }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/stores/settings.test.ts`
Expected: PASS(4 passed)。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/stores/settings.ts frontend/src/stores/settings.test.ts
git commit -m "feat(design): 三档字号定为 14/16/18

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 令牌契约测试 + theme.css 改写

**Files:**
- Create: `frontend/src/styles/theme.tokens.test.ts`
- Modify(改写): `frontend/src/styles/theme.css`

- [ ] **Step 1: 新建令牌契约测试(先失败)**

新建 `frontend/src/styles/theme.tokens.test.ts`,完整内容:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// 直接读源文件断言令牌契约：改值/丢令牌都会被这里挡住。
const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf-8')

// :root 与 html.dark 块内均无嵌套花括号，取第一个 '}' 即块尾。
function block(selector: string): string {
  const start = css.indexOf(selector)
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
})

describe('theme.css 全局规则', () => {
  it('包含 prefers-reduced-motion 降级', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/styles/theme.tokens.test.ts`
Expected: FAIL —— 现有 theme.css 无 `--accent2`/`--sp-*`/`--chart-*` 等,且 `--accent` 仍是 `#2563eb`。

- [ ] **Step 3: 改写 theme.css**

用以下完整内容**覆盖** `frontend/src/styles/theme.css`:

```css
/* 全局主题变量（设计底层规范令牌）+ 基线 reset + Element Plus 桥接 + 滚动条适配。
   令牌取值与角色见 docs/superpowers/specs/2026-06-10-design-foundation-design.md。
   :root 为浅色；html.dark 覆盖为深色。
   --fs-base 由 settings store 运行时写到 <html>（小14/中16/大18），六级字号按 rem 整体缩放。
   本文件须在 main.ts 中于 element-plus 的 index.css 与 dark/css-vars.css 之后引入，
       使下面对 --el-* 的覆盖按源码顺序生效。 */

:root {
  --fs-base: 16px;

  /* 调色板 · 结构色（浅色，蓝色系基调） */
  --bg: #eef3f7;
  --card: #ffffff;
  --card2: #f6f9fb;
  --line: #dde6ee;
  --line2: #cddae2;
  --txt: #1e2a33;
  --sub: #4a5b68;
  --mut: #7c8a97;
  --accent: #325969;
  --accent2: #6c8fa9;
  --highlight: #c8adc4;
  --cyan: #0891b2;
  --on-accent: #ffffff;

  /* 状态语义色（固定，不随基调变） */
  --ok: #4e9a7c;
  --warn: #e0a23b;
  --danger: #d24d5c;
  --c-paid: var(--ok);
  --c-pending: var(--warn);
  --c-remaining: var(--danger);
  --c-delayed: var(--danger);
  --c-plan: #6c8fa9;
  --c-urgent: #e07a4f;

  /* 图表分类色（5 套各抽一支） */
  --chart-1: #6c8fa9;
  --chart-2: #b484b0;
  --chart-3: #417a64;
  --chart-4: #886441;
  --chart-5: #d24d5c;
  --chart-6: #c8adc4;
  --chart-7: #fec187;
  --chart-8: #a7c190;

  /* 字号 rem 令牌（随 --fs-base 缩放；px 标注 @中16） */
  --fs-1: 0.75rem;   /* 12 角标/标签/列头 */
  --fs-2: 0.875rem;  /* 14 次要/表格元信息 */
  --fs-3: 1rem;      /* 16 正文基准 */
  --fs-4: 1.2rem;    /* 19 卡片标题/小节头 */
  --fs-5: 1.55rem;   /* 25 区块/页面标题 */
  --fs-6: 2.15rem;   /* 34 大数字/KPI 主值 */

  /* 间距阶梯（4px 基 / 8px 节奏） */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 24px;
  --sp-6: 32px;
  --sp-7: 48px;

  /* 卡片（统一） */
  --card-pad: 20px;
  --gap-card: 16px;
  --gap-stack: 12px;
  --gap-section: 24px;

  /* 圆角 */
  --r-sm: 6px;
  --r-md: 10px;
  --r-lg: 14px;
  --r-full: 999px;

  /* 阴影（仅两级，每级 ≤2 层） */
  --shadow-1: 0 1px 2px rgba(30,42,51,.06), 0 2px 8px rgba(30,42,51,.05);
  --shadow-2: 0 2px 4px rgba(30,42,51,.08), 0 12px 28px rgba(30,42,51,.12);

  /* 动效 */
  --dur-1: 120ms;
  --dur-2: 200ms;
  --ease: cubic-bezier(.2, 0, 0, 1);

  /* Element Plus 桥接：主色用我们的 accent；亮/暗色阶用 color-mix 派生，
     不支持 color-mix 的浏览器会忽略这些声明、自动回退 EP 内置值（安全降级）。 */
  --el-color-primary: var(--accent);
  --el-color-primary-light-3: color-mix(in srgb, var(--accent) 70%, #fff);
  --el-color-primary-light-5: color-mix(in srgb, var(--accent) 50%, #fff);
  --el-color-primary-light-7: color-mix(in srgb, var(--accent) 30%, #fff);
  --el-color-primary-light-8: color-mix(in srgb, var(--accent) 20%, #fff);
  --el-color-primary-light-9: color-mix(in srgb, var(--accent) 10%, #fff);
  --el-color-primary-dark-2: color-mix(in srgb, var(--accent) 80%, #000);
  --el-border-radius-base: var(--r-md);
}

html.dark {
  /* 结构色（深色） */
  --bg: #0e1a22;
  --card: #16262f;
  --card2: #11212a;
  --line: #253a47;
  --line2: #2f4756;
  --txt: #e4edf2;
  --sub: #a7bac7;
  --mut: #8295a3;
  --accent: #6c8fa9;
  --accent2: #8fb0c4;
  --highlight: #c8adc4;
  --cyan: #22d3ee;

  /* 状态语义色（深色提亮） */
  --ok: #5ba88a;
  --warn: #e6b056;
  --danger: #e0697a;
  --c-plan: #7fa5be;
  --c-urgent: #ec8a60;

  /* 图表分类色（深色） */
  --chart-1: #7fa5be;
  --chart-2: #c29ac0;
  --chart-3: #5ba88a;
  --chart-4: #b08a63;
  --chart-5: #e0697a;
  --chart-6: #d2bccf;
  --chart-7: #fec187;
  --chart-8: #b7cea3;

  /* 阴影（深色加重） */
  --shadow-1: 0 1px 2px rgba(0,0,0,.4), 0 2px 8px rgba(0,0,0,.3);
  --shadow-2: 0 2px 4px rgba(0,0,0,.5), 0 12px 28px rgba(0,0,0,.45);

  /* EP 暗色：把 EP 自带深灰统一到我们的深蓝调色板 */
  --el-bg-color: var(--card);
  --el-bg-color-overlay: var(--card);
  --el-bg-color-page: var(--bg);
  --el-fill-color-blank: var(--card);
  --el-text-color-primary: var(--txt);
  --el-text-color-regular: var(--sub);
  --el-text-color-secondary: var(--mut);
  --el-border-color: var(--line);
  --el-border-color-light: var(--line);
  --el-border-color-lighter: var(--line);
  --el-border-color-extra-light: var(--line);
}

*, *::before, *::after { box-sizing: border-box; }

html { font-size: var(--fs-base, 16px); }

body {
  margin: 0;
  background: var(--bg);
  color: var(--txt);
  font-family: Inter, "Noto Sans SC", -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  transition: background-color var(--dur-1), color var(--dur-1);
}

/* 选区 / 焦点 */
::selection { background: color-mix(in srgb, var(--accent) 30%, transparent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* 滚动条（暗色适配） */
* { scrollbar-width: thin; scrollbar-color: var(--line2) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--line2); border-radius: var(--r-sm); }
::-webkit-scrollbar-thumb:hover { background: var(--mut); }

/* 自适应栅格：无断点自动换列，--col-min 控制单列最小宽，供卡片/指标区复用。
   断点约定（页面按需用 @media）：窄屏 <=768px，常规 <=1200px。 */
.u-grid-auto {
  display: grid;
  gap: var(--gap-card);
  grid-template-columns: repeat(auto-fit, minmax(var(--col-min, 200px), 1fr));
}

/* 减少动态效果：尊重系统「prefers-reduced-motion」，关闭过渡与动画位移。 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .001ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/styles/theme.tokens.test.ts`
Expected: PASS(全部 it 通过)。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/styles/theme.css frontend/src/styles/theme.tokens.test.ts
git commit -m "feat(design): theme.css 落地设计底层规范令牌

蓝基调结构色 + 固定状态色 + chart-1..8 + 六级字号 + 间距/卡片/圆角/阴影/动效令牌；
light/dark 两套；旧令牌名全保留（零改名）；新增 prefers-reduced-motion 降级。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 版本号 + PROGRESS + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 升版本号**

`frontend/src/version.ts`:
```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V6.4.0'
export const RELEASE_DATE = '2026-06-10'
```

- [ ] **Step 2: PROGRESS.md 追加记录**

在 `PROGRESS.md` 顶部"版本"或最新进度段追加一行（紧跟现有最新条目之后）：
```markdown
- V6.4.0（2026-06-10）展示形式底层规范落地：theme.css 令牌体系（蓝基调结构色/固定状态色/chart-1..8/六级字号/间距/卡片/圆角/阴影/动效），三档字号 14/16/18；仅令牌+文档，现有页面未迁移（留待内容层重构）。spec: docs/superpowers/specs/2026-06-10-design-foundation-design.md
```

- [ ] **Step 3: 全量验证**

Run: `bash verify.sh`
Expected: 全绿 —— py_compile + ruff + pytest + 前端 typecheck + vitest（含新增 `theme.tokens.test.ts` 与改动的 `settings.test.ts`）+ build 全过。

- [ ] **Step 4: 手动冒烟（前端）**

Run: `cd frontend && npm run build`,然后 `python server.py` 打开后端地址。确认：
1. 看板正常加载、无 `window.onerror` 红条。
2. 顶部切换 light/dark：背景/卡片/文字随蓝基调切换,状态色（已回款绿/风险红）清晰可辨。
3. 显示设置切换 小/中/大：整页字号随之缩放（根字号 14/16/18）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(design): 版本 V6.4.0 + PROGRESS 记录底层规范落地

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 验收标准

- `bash verify.sh` 全绿（含两个新增/改动测试）。
- `theme.css` 含 spec 全部令牌,light/dark 两套,旧令牌名零丢失。
- 三档字号根值 14/16/18。
- 现有 `*.vue` 页面零改动,仍能加载（令牌名未变,只换值）。
- `CLAUDE.md` 设计规范条款已在位（上一提交 3ad172e 已完成）。

## 不在本计划内

- 现有页面换用新卡片/间距/层级（后续内容层重构逐页做）。
- 其余 4 套配色换肤切换。
- 纳管开关 / 筛选条等功能逻辑。
