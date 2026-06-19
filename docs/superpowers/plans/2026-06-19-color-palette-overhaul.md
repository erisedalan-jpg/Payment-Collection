# 整体配色改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全站配色令牌从旧「蓝灰 + 绿黄红」整体切换到用户钦定品牌色板（11 彩 + 4 黑白），并消除散落硬编码色。

**Architecture:** 配色唯一落地 `theme.css`（`:root` 浅 + `html.dark` 暗），ECharts 因 canvas 读不到变量由 `echartsTheme.ts` 做第二落地，二者由 `echartsTheme.tokens.test.ts`（动态双源比对）+ `theme.tokens.test.ts`（硬编码期望值）强制一致。只改令牌取值与散值，不改令牌名、不改其它 foundation 维度、不改页面结构。

**Tech Stack:** Vue3 + Vite + TS + Element Plus + ECharts；vitest 契约测试。

**Spec:** `docs/superpowers/specs/2026-06-19-color-palette-overhaul-design.md`（取值权威，所有色值以 spec §3/§4 为准）。

## Global Constraints

- 全程简体中文；**禁用任何 emoji**，需要符号只用 `→ ↓ ❌ ✕ ▾`。
- **禁止 `git add -A` / `git add .`**；只逐路径 `git add`。
- 每次提交信息结尾恒为一行：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 色值**全站仅允许**这 15 个：深蓝`#0d3a69`/橙`#eb5c20`/棕`#492d22`/正红`#c8161d`/蓝绿`#71e2d1`/浅黄`#f9d46c`/深红`#470125`/正蓝`#002fa7`/青绿`#018b8d`/浅红`#d34947`/浅绿`#6ecc54`/柔纸白`#fbfbfd`/米白`#f6f6f0`/炭黑`#121212`/深海石`#0d1117`，外加由这 4 个中性色「明度/透明度派生」出的纯灰与深字提亮档（见 spec §3）；**不得引入第 16 个独立色号**。EP 桥接 `color-mix(... #fff)` 的向白原语保留不动。
- 令牌色值统一**小写 hex**（对齐 echartsTheme.ts 常量；契约测试 lowercase 后比对）。
- **令牌名零改动**（只改取值）；ECharts 镜像的 `--txt/--sub/--line/--line2/--card` + 状态基色 `--ok/--warn/--danger` + `--chart-1..8` 必须是具体色值；`-bg`/`hover`/`selected` 保持 `color-mix`。
- 版本单一来源 `frontend/src/version.ts`，只改此处；本轮 `V1.10.0` / `2026-06-19`（Y 级，用户已确认走小版本）。
- 改前端后跑 `bash verify.sh` 全绿（typecheck / vitest / build；后端 ruff·pytest 不受本轮影响）。

---

### Task 1: 核心令牌切换（theme.css + echartsTheme.ts + theme.tokens.test.ts）

三文件原子改动：theme.css 改值会同时令两套契约测试变红，必须同 task 内一并改回绿。TDD 顺序：先改硬编码期望测试（红）→ 改 theme.css（theme.tokens 绿、echartsTheme.tokens 仍红）→ 改 echartsTheme.ts（全绿）。

**Files:**
- Modify: `frontend/src/styles/theme.tokens.test.ts`
- Modify: `frontend/src/styles/theme.css`
- Modify: `frontend/src/charts/echartsTheme.ts`
- 不改（自动跟随，仅验证）：`frontend/src/charts/echartsTheme.tokens.test.ts`

**Interfaces:**
- Produces: 新令牌取值（供全站 `var(--…)` 与 ECharts 主题消费）。导出常量签名不变：`CHART_LIGHT/CHART_DARK: string[]`、`STRUCT_LIGHT/STRUCT_DARK: {txt,sub,line,line2,card}`、`STATUS_LIGHT/STATUS_DARK: {ok,warn,danger}`。

- [ ] **Step 1: 改 `theme.tokens.test.ts` 期望值（先红）**

按下表逐个把 `toContain(...)` 里的旧字符串替换为新字符串（其余断言不动）：

`:root` 段：
```
'--bg: #eef3f7'      → '--bg: #f6f6f0'
'--card: #ffffff'    → '--card: #fbfbfd'
'--txt: #1e2a33'     → '--txt: #121212'
'--accent: #325969'  → '--accent: #0d3a69'
'--accent2: #6c8fa9' → '--accent2: #002fa7'
'--highlight: #c8adc4' → '--highlight: #f9d46c'
'--ok: #4e9a7c'      → '--ok: #6ecc54'
'--warn: #e0a23b'    → '--warn: #f9d46c'
'--danger: #d24d5c'  → '--danger: #c8161d'
'--c-urgent: #e07a4f' → '--c-urgent: #eb5c20'
'--chart-1: #6c8fa9' → '--chart-1: #0d3a69'
'--chart-5: #d24d5c' → '--chart-5: #c8161d'
'--chart-8: #a7c190' → '--chart-8: #492d22'
'--on-accent: #ffffff' → '--on-accent: #fbfbfd'   （兼容数组那行）
'--mut: #62707d;'    → '--mut: #6b6b6b;'
'--ok-text: #37745b;'    → '--ok-text: #2f6b27;'
'--warn-text: #8a6210;'  → '--warn-text: #492d22;'
'--danger-text: #b93848;' → '--danger-text: #470125;'
'--urgent-text: #a84b1d;' → '--urgent-text: #8a3a18;'
'--advance-text: #066f89;' → '--advance-text: #056d6e;'
```

`html.dark` 段：
```
'--bg: #0e1a22'      → '--bg: #0d1117'
'--card: #16262f'    → '--card: #121212'
'--txt: #e4edf2'     → '--txt: #fbfbfd'
'--accent: #6c8fa9'  → '--accent: #7891ac'
'--accent2: #8fb0c4' → '--accent2: #7e95d2'
'--danger: #e0697a'  → '--danger: #d34947'
'--ok: #5ba88a'      → '--ok: #6ecc54'
'--ok-text: #7dbfa3;'    → '--ok-text: #8fd97a;'
'--danger-text: #ea8b99;' → '--danger-text: #e8918f;'
```

- [ ] **Step 2: 跑 theme.tokens 测试确认变红**

Run: `cd frontend && npx vitest run src/styles/theme.tokens.test.ts`
Expected: FAIL（期望新值，theme.css 仍是旧值）。

- [ ] **Step 3: 改 `theme.css` `:root` 段取值**

逐行替换（仅这些行，其它令牌不动）：
```
--bg:        #eef3f7 → #f6f6f0
--card:      #ffffff → #fbfbfd
--card2:     #f6f9fb → #f1f1ef
--line:      #dde6ee → #e4e4e2
--line2:     #cddae2 → #d4d4d2
--txt:       #1e2a33 → #121212
--sub:       #4a5b68 → #474747
--mut:       #62707d → #6b6b6b
--accent:    #325969 → #0d3a69
--accent2:   #6c8fa9 → #002fa7
--highlight: #c8adc4 → #f9d46c
--cyan:      #0891b2 → #018b8d
--on-accent: #ffffff → #fbfbfd
--ok:        #4e9a7c → #6ecc54
--warn:      #e0a23b → #f9d46c
--danger:    #d24d5c → #c8161d
--c-plan:    #6c8fa9 → #002fa7
--c-urgent:  #e07a4f → #eb5c20
--ok-text:     #37745b → #2f6b27
--warn-text:   #8a6210 → #492d22
--danger-text: #b93848 → #470125
--urgent-text: #a84b1d → #8a3a18
--advance-text: #066f89 → #056d6e
--chart-1: #6c8fa9 → #0d3a69
--chart-2: #b484b0 → #eb5c20
--chart-3: #417a64 → #018b8d
--chart-4: #886441 → #f9d46c
--chart-5: #d24d5c → #c8161d
--chart-6: #c8adc4 → #71e2d1
--chart-7: #fec187 → #6ecc54
--chart-8: #a7c190 → #492d22
```
不动：`--c-paid/--c-pending/--c-remaining/--c-delayed/--c-advance: var(--cyan)` 别名行、各 `-bg: color-mix(...)`、`--hover-tint/--selected-tint`、EP 桥接 `--el-color-primary-*`、字号/间距/卡片/圆角/阴影/动效/z-index。

- [ ] **Step 4: 改 `theme.css` `html.dark` 段取值**

```
--bg:        #0e1a22 → #0d1117
--card:      #16262f → #121212
--card2:     #11212a → #1b1b20
--line:      #253a47 → #272b31
--line2:     #2f4756 → #343a44
--txt:       #e4edf2 → #fbfbfd
--sub:       #a7bac7 → #bcbec1
--mut:       #8295a3 → #8b8e93
--accent:    #6c8fa9 → #7891ac
--accent2:   #8fb0c4 → #7e95d2
--highlight: #c8adc4 → #f9d46c
--cyan:      #22d3ee → #71e2d1
--ok:        #5ba88a → #6ecc54
--warn:      #e6b056 → #f9d46c
--danger:    #e0697a → #d34947
--c-plan:    #7fa5be → #7e95d2
--c-urgent:  #ec8a60 → #eb5c20
--ok-text:     #7dbfa3 → #8fd97a
--danger-text: #ea8b99 → #e8918f
--chart-1: #7fa5be → #3e6fa8
--chart-2: #c29ac0 → #eb5c20
--chart-3: #5ba88a → #1fa6a8
--chart-4: #b08a63 → #f9d46c
--chart-5: #e0697a → #d34947
--chart-6: #d2bccf → #71e2d1
--chart-7: #fec187 → #6ecc54
--chart-8: #b7cea3 → #8a5a45
```
不动：暗色 `--warn-text: var(--warn);`、`--urgent-text: var(--c-urgent);`、`--advance-text: var(--c-advance);`、各 `-bg: ...16%...`、`--shadow-*`、EP 暗色灰阶映射。（暗色段无 `--on-accent`，继承 `:root` 的 `#fbfbfd`，不新增。）

- [ ] **Step 5: 跑两套契约测试（theme.tokens 绿、echartsTheme.tokens 应红）**

Run: `cd frontend && npx vitest run src/styles/theme.tokens.test.ts src/charts/echartsTheme.tokens.test.ts`
Expected: `theme.tokens` PASS；`echartsTheme.tokens` FAIL（theme.css 已新、echartsTheme.ts 仍旧，双源不一致）。

- [ ] **Step 6: 改 `echartsTheme.ts` 常量（与 theme.css 同源）**

把第 14-19、53-54 行常量整体替换为：
```ts
export const CHART_LIGHT = ['#0d3a69', '#eb5c20', '#018b8d', '#f9d46c', '#c8161d', '#71e2d1', '#6ecc54', '#492d22']
export const CHART_DARK = ['#3e6fa8', '#eb5c20', '#1fa6a8', '#f9d46c', '#d34947', '#71e2d1', '#6ecc54', '#8a5a45']

export const STRUCT_LIGHT = { txt: '#121212', sub: '#474747', line: '#e4e4e2', line2: '#d4d4d2', card: '#fbfbfd' }
export const STRUCT_DARK = { txt: '#fbfbfd', sub: '#bcbec1', line: '#272b31', line2: '#343a44', card: '#121212' }
```
```ts
export const STATUS_LIGHT = { ok: '#6ecc54', warn: '#f9d46c', danger: '#c8161d' }
export const STATUS_DARK = { ok: '#6ecc54', warn: '#f9d46c', danger: '#d34947' }
```
`FONT_SANS`、`buildTheme`、`registerTheme(...)`、`ENT_THEME(_DARK)` 不动。

- [ ] **Step 7: 跑两套契约测试确认全绿**

Run: `cd frontend && npx vitest run src/styles/theme.tokens.test.ts src/charts/echartsTheme.tokens.test.ts`
Expected: 两文件 PASS。

- [ ] **Step 8: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无类型错误。

- [ ] **Step 9: Commit**

```bash
git add frontend/src/styles/theme.css frontend/src/charts/echartsTheme.ts frontend/src/styles/theme.tokens.test.ts
git commit -m "feat(theme): 核心配色令牌切换为品牌色板(浅/暗双套+ECharts同源)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 散落硬编码色归一

把令牌体系外的硬编码色并入新色板：CSS 内联绑定的改 `var(--token)`，进 ECharts canvas 的改具体色值。

**Files:**
- Modify: `frontend/src/lib/calendar.ts:118-123`（`LIST_STATUS_ORDER`）
- Modify: `frontend/src/nav.ts:6-10`（`TIERS`）
- Modify: `frontend/src/components/PendingBarChart.vue:12`（`COLORS`）
- Test: `frontend/src/components/PendingBarChart.test.ts:38-40`（断言色值）
- Modify: `frontend/src/components/PageStub.vue:16`（`.hint`）
- Modify: `frontend/src/components/DisplaySettings.vue:37`（`.seg-btn.on`）
- Modify: `frontend/src/components/CalDayDetail.test.ts:10`（fixture 色，无断言、仅去散值）

**Interfaces:**
- Consumes: Task 1 的新令牌（`--danger/--warn/--ok/--mut/--c-plan/--on-accent`）。

- [ ] **Step 1: 改 `PendingBarChart.test.ts` 断言（先红）**

把第 38-40 行与第 26 行描述改为：
```ts
  it('assigns tier colors in order (danger/warn/ok)', () => {
```
```ts
    expect(option.series[0].itemStyle.color).toBe('#c8161d')
    expect(option.series[1].itemStyle.color).toBe('#f9d46c')
    expect(option.series[2].itemStyle.color).toBe('#6ecc54')
```

- [ ] **Step 2: 跑测试确认变红**

Run: `cd frontend && npx vitest run src/components/PendingBarChart.test.ts`
Expected: FAIL（期望新值，组件仍输出旧 `#EF4444` 等）。

- [ ] **Step 3: 改 `PendingBarChart.vue` COLORS**

第 12 行：
```ts
const COLORS = ['#c8161d', '#f9d46c', '#6ecc54']
```

- [ ] **Step 4: 跑测试确认变绿**

Run: `cd frontend && npx vitest run src/components/PendingBarChart.test.ts`
Expected: PASS。

- [ ] **Step 5: 改 `calendar.ts` `LIST_STATUS_ORDER`（CSS 内联绑定 → var）**

```ts
const LIST_STATUS_ORDER = [
  { key: '延期', color: 'var(--danger)' },
  { key: '待回款', color: 'var(--mut)' },
  { key: '部分回款', color: 'var(--c-plan)' },
  { key: '质保期', color: 'var(--warn)' },
]
```

- [ ] **Step 6: 改 `nav.ts` `TIERS`（去掉不存在的 `--red/--orange/--green` fallback）**

```ts
export const TIERS: TierOpt[] = [
  { label: '100万以上', slug: 'above1m', color: 'var(--danger)' },
  { label: '50-100万', slug: '50to100', color: 'var(--warn)' },
  { label: '50万以下', slug: 'below50', color: 'var(--ok)' },
]
```

- [ ] **Step 7: 改 `PageStub.vue` 与 `DisplaySettings.vue`**

`PageStub.vue` 第 16 行：
```css
.hint { color: var(--mut); font-size: var(--fs-2); }
```
`DisplaySettings.vue` 第 37 行：把 `color: #fff;` 改为 `color: var(--on-accent);`（该行其余不动）。

- [ ] **Step 8: 改 `CalDayDetail.test.ts` fixture 去散值**

第 10 行 `color: '#EF4444'` → `color: 'var(--danger)'`（无断言依赖，纯去硬编码）。

- [ ] **Step 9: 跑相关测试 + typecheck**

Run: `cd frontend && npx vitest run src/components/PendingBarChart.test.ts src/components/CalDayDetail.test.ts && npm run typecheck`
Expected: PASS，无类型错误。

- [ ] **Step 10: 确认无色板外散值**

Run: `cd frontend && git grep -nE '#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b' -- 'src/**/*.vue' 'src/**/*.ts' ':!src/styles/theme.css' ':!src/charts/echartsTheme.ts' ':!src/styles/theme.tokens.test.ts'`
Expected: 仅剩 `components/PendingBarChart.vue` 的 `COLORS` 与 `components/PendingBarChart.test.ts` 的断言（共 `#c8161d`/`#f9d46c`/`#6ecc54`，ECharts canvas 必需具体值，且三者均属 15 色色板）；不得出现任何色板外色号。其余 .vue/.ts 已无散值。

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/calendar.ts frontend/src/nav.ts frontend/src/components/PendingBarChart.vue frontend/src/components/PendingBarChart.test.ts frontend/src/components/PageStub.vue frontend/src/components/DisplaySettings.vue frontend/src/components/CalDayDetail.test.ts
git commit -m "feat(theme): 散落硬编码色归一到新色板令牌

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 版本号 + 文档对齐

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `CLAUDE.md`（「## 设计底层规范」配色条）
- Modify: `docs/superpowers/specs/2026-06-10-design-foundation-design.md`（顶部加 supersede 注记）
- Modify: `PROGRESS.md`（改版记录）

**Interfaces:** 无代码接口；纯版本/文档。

- [ ] **Step 1: 改 `version.ts`**

```ts
export const APP_VERSION = 'V1.10.0'
export const RELEASE_DATE = '2026-06-19'
```

- [ ] **Step 2: 改 `CLAUDE.md` 配色条示例色号**

定位「## 设计底层规范」首条「- **配色**：」那一段，把其中的旧示例色号替换为新值并补一句派生说明。新文本：
```
- **配色**：以钦定品牌色板为唯一来源(蓝色系做基调,`--accent` 浅 `#0D3A69`/暗 `#7891AC`)，light/dark 两套；结构灰阶由 4 个黑白中性色(柔纸白/米白/炭黑/深海石)明度·透明度派生,全站不引入第 16 个色号。**结构色与状态色分离**：状态语义色固定(已回款 `--ok #6ECC54` / 待回款 `--warn #F9D46C` / 风险延期 `--danger #C8161D` / 可提前 `--c-advance` 浅 青绿`#018B8D`/暗 蓝绿`#71E2D1`)，不随基调变。图表分类用 `--chart-1..8`，表达回款状态的图表系列必须用状态色。
```
（该段其余设计条款不动；取值权威指向 `docs/superpowers/specs/2026-06-19-color-palette-overhaul-design.md`。）

- [ ] **Step 3: 给 2026-06-10 foundation spec 加 supersede 注记**

在该文件顶部 `**配色基调决策:**` 行之后插入一行：
```
> **配色取值已于 2026-06-19 整体改版**：§1「配色」的具体色号以 `2026-06-19-color-palette-overhaul-design.md` 为准（本文角色框架/派生规则仍有效，历史色值正文不再逐一回改）。
```

- [ ] **Step 4: PROGRESS.md 加改版记录**

在 PROGRESS.md 顶部版本区新增一条（合并 SHA 由 finishing 后回填）：
```
- V1.10.0 整体配色改版：全站令牌切换为钦定品牌色板(11 彩+4 黑白)，结构灰阶派生、散值归一、契约测试同步。合并 SHA: <finishing 回填>
```

- [ ] **Step 5: 全量 verify**

Run: `bash verify.sh`
Expected: 全绿（前端 typecheck/vitest/build + 后端 ruff/pytest）。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/version.ts CLAUDE.md docs/superpowers/specs/2026-06-10-design-foundation-design.md PROGRESS.md
git commit -m "chore: 版本 V1.10.0 + 配色改版文档对齐(CLAUDE.md/foundation spec/PROGRESS)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 验证总览（finishing 前）

- `bash verify.sh` 全绿。
- 手动起一次（`python server.py` + `cd frontend && npm run dev`）：light/dark 切换、三档字号切换；看板/图表/日历/台账/项目清单无 JS 报错（右下角红条）；状态 chip「淡底+深字」可读、图表 8 色可区分。
- 深字档目测对比度（ok/warn/danger/urgent/advance 在白卡与各自淡底上 ≥4.5:1 目标）；个别不达标者只在「给定色+黑白」范围内微调，并同步 theme.css 与（若涉及基色）echartsTheme.ts。
