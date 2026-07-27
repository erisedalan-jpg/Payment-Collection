# 2a-3 `SectionTitle` 两级 + 约束修正 实施计划（V4.5.1，Z 级）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 V4.4.9 定错的「卡内小标题」约束（拆为两级），抽出 `SectionTitle` 替换全站 31 处标题类。

**Architecture:** 标题本就是两个层级——卡片主标题（`--fs-4`/700）与卡内小节标题（`--fs-3`/700）。V4.4.9 把它们压成一个值（`--fs-3`/600）是基于两个样本的抽样误判。本期先改约束、再抽组件、最后按文件集并行替换。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Vitest

## Global Constraints

- **绝不使用 emoji**；符号用 `→ ↓ ❌ ✕ ▾`；注释与测试名一律简体中文
- 版本 **V4.5.1（Z 级）**
- `SectionTitle` **只有 `level` 一个 prop**（`'card' | 'section'`），不提供字号/字重逐项覆盖
- **6 处字重归位**（`.pl4-title` 600→700、倚天 5 处 `.yt-h` 600→700）是本期唯一预期视觉变化
- **绝不碰** `PageHeader.ph-title`（V4.4.8 建，页头标题不是卡内标题）
- **绝不纳入**：数值显示类（`.ov-acard-count` `.pd-metric-v` `.tq-count-v` `.ov-pay-v` `.ps-ref-val` `.hsb-leg-count`）、名称字段类（`.pd-name` `.cd-name` `.ps-name` `.sv-name` `.pm-phase-name`）、`.pl-initial`（门户图标首字母）、登录页（`.cpw-error` `.lv-error`）—— 它们字号字重相同但**语义不是标题**
- **`StatusBadge` 推广与 chip 本期不做**（spec §3.2.2 已论证：形态本就不同，硬抽会得到 props 爆炸的组件）
- typecheck 用 `npm --prefix frontend run typecheck`（本仓无 `tsconfig.app.json`）

---

### Task 1: 约束修正 + `SectionTitle` 组件

**Files:**
- Modify: `CLAUDE.md`（「排版严格层级」条）
- Create: `frontend/src/components/SectionTitle.vue` + `SectionTitle.test.ts`

- [ ] **Step 1: 修正 `CLAUDE.md` 中 V4.4.9 定错的那句**

「排版严格层级」条末尾现有这句（V4.4.9 加的）：

> **卡内小标题固定 `--fs-3` / 600 / `--txt`**（现状 `.gov-h` 用 700、`.yt-h` 用 600，以多数派 600 为准）。

**整句替换为**：

> **标题分两级、由 `SectionTitle.vue` 唯一实现**：卡片主标题 `--fs-4` / 700 / `--txt`（`level="card"`），卡内小节标题 `--fs-3` / 700 / `--txt`（`level="section"`）。页头标题另属 `PageHeader.vue`，不在此列。
> （V4.4.9 曾定为「统一 `--fs-3`/600，取多数派 `.yt-h`」，是只看了 `.gov-h`(700) 与 `.yt-h`(600) 两个样本的抽样误判 —— 全量核对为 `--fs-4`/700 十五处、`--fs-3`/700 十处、`--fs-3`/600 五处，且两级本就该分开。）

- [ ] **Step 2: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import SectionTitle from './SectionTitle.vue'

const css = () => readFileSync(resolve(__dirname, 'SectionTitle.vue'), 'utf-8')
const block = (v: string) => css().match(new RegExp(`\\.st--${v}\\s*\\{([^}]*)\\}`))![1]

describe('SectionTitle', () => {
  it('渲染插槽文案', () => {
    expect(mount(SectionTitle, { slots: { default: '成本构成' } }).text()).toBe('成本构成')
  })

  it('level 默认 section,两级各挂对应 class', () => {
    expect(mount(SectionTitle, { slots: { default: 'x' } }).classes()).toContain('st--section')
    expect(mount(SectionTitle, { props: { level: 'card' }, slots: { default: 'x' } }).classes()).toContain('st--card')
  })

  it('card 级:--fs-4 / 700 / --txt(15 处卡片主标题的原值)', () => {
    const b = block('card')
    expect(b).toMatch(/font-size:\s*var\(--fs-4\)/)
    expect(b).toMatch(/font-weight:\s*700/)
    expect(b).toMatch(/color:\s*var\(--txt\)/)
  })

  it('section 级:--fs-3 / 700 / --txt(10 处卡内小节标题的原值)', () => {
    const b = block('section')
    expect(b).toMatch(/font-size:\s*var\(--fs-3\)/)
    expect(b).toMatch(/font-weight:\s*700/)
    expect(b).toMatch(/color:\s*var\(--txt\)/)
  })

  it('两级字号必须不同 —— 压成一级正是 V4.4.9 的错', () => {
    expect(block('card')).not.toEqual(block('section'))
    expect(block('card')).toMatch(/--fs-4/)
    expect(block('section')).toMatch(/--fs-3/)
  })

  it('只有 level 一个 prop —— 不提供字号/字重逐项覆盖', () => {
    expect(Object.keys((SectionTitle as any).props ?? {})).toEqual(['level'])
  })

  it('渲染为 h3(语义标题,而非 div)', () => {
    expect(mount(SectionTitle, { slots: { default: 'x' } }).element.tagName).toBe('H3')
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npm --prefix frontend run test:run -- src/components/SectionTitle.test.ts`
Expected: FAIL —— 找不到 `./SectionTitle.vue`

- [ ] **Step 4: 实现**

```vue
<script setup lang="ts">
// 两级取值来自全量核对:card 级(--fs-4/700)15 处、section 级(--fs-3/700)10 处。
// V4.4.9 曾把两者压成「统一 --fs-3/600」,是只看了 .gov-h 与 .yt-h 两个样本的抽样误判。
// 【只有 level 一个 prop】—— 不提供字号/字重逐项覆盖,否则又会散回各写各的。
withDefaults(defineProps<{ level?: 'card' | 'section' }>(), { level: 'section' })
</script>

<template>
  <h3 class="st" :class="`st--${level}`"><slot /></h3>
</template>

<style scoped>
.st { margin: 0; line-height: var(--lh-dense); }
/* 卡片主标题:概算 10 卡的 .bd-card-title、日历/详情页的 404 与卡头标题等 15 处 */
.st--card { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
/* 卡内小节标题:.gov-h / .ob-h3 / .rv-h3 / .or-title / .tc-title 等 10 处 */
.st--section { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
</style>
```

- [ ] **Step 5: 运行确认通过 + 反向验证（必做）**

Run: `npm --prefix frontend run test:run -- src/components/SectionTitle.test.ts`
Expected: PASS（7 项）

反向验证**逐项做**：card/section 各 3 项取值分别改坏 + 把两级改成同值 + 临时加一个 `size` prop + 把 `h3` 改成 `div`，共 9 次，每次只改一项、确认精确变红后还原。

**V4.5.0 的教训**：`AppCard` 的 plan 契约标题写「+ card」却漏了 background 断言、共用 `.ac` 描边整条无人管，删掉 border 让全站 44 处卡片丢边框而七个用例全绿。**凡契约标题里承诺的每一项，都要实测能红。**

- [ ] **Step 6: 提交**

```bash
git add CLAUDE.md frontend/src/components/SectionTitle.vue frontend/src/components/SectionTitle.test.ts
git commit -m "feat(components): V4.5.1 SectionTitle 两级 + 修正 V4.4.9 定错的标题约束

V4.4.9 定「卡内小标题统一 --fs-3/600,取多数派 .yt-h」是只看了两个样本的
抽样误判:全量核对为 --fs-4/700 十五处、--fs-3/700 十处、--fs-3/600 五处,
且卡片主标题与卡内小节标题本就该是两级。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2-5 通用替换模式

```vue
<!-- 改前 -->
<h3 class="gov-h">数据源</h3>
<!-- 改后 -->
<SectionTitle>数据源</SectionTitle>          <!-- section 级是默认,不必写 level -->

<!-- 改前 -->
<div class="bd-card-title">基本信息</div>
<!-- 改后 -->
<SectionTitle level="card">基本信息</SectionTitle>
```

script 段加 `import SectionTitle from '@/components/SectionTitle.vue'`；style 段删除已无引用的标题类规则。

**三条铁律**：

1. **级别按下表指定**。判据是原字号：`--fs-4`→`card`，`--fs-3`→`section`，**不要按类名猜**（`.lx-card-title` 名字里有 card 但原值是 `--fs-3`，归 `section`）。
2. **标题类若还带布局属性**（`margin-bottom`、`display:flex`、`gap` 等），保留原类与组件并存：`<SectionTitle class="yt-h">`。`SectionTitle` 只负责字号/字重/色三属性。
3. **6 处字重归位**（`.pl4-title` 与倚天 5 处 `.yt-h` 由 600 → 700）**以组件为准**，不要为保持原样加覆盖。

---

### Task 2: 概算工具 10 处（全 card 级）

**Files:** `components/budget/` 下 10 个 `.bd-card-title`：`BasicInfoCard` · `CrmCard` · `DirectCostSection` · `PmSection` · `ProductSection` · `RateReferenceCard` · `RatioCard` · `SalesOrderCard` · `ServiceSection` · `SummaryCard`

全部 `level="card"`，原值均为 `--fs-4`/700，**零归位差异**，本组最机械。

**注意**：这 10 个文件在 V4.5.0 刚接过 `AppCard`，`.bd-card` 类可能仍带布局属性 —— 那是卡片容器的事，与本期标题无关，**不要动**。

- [ ] **Step 1-3**：逐文件替换 + 删 `.bd-card-title` 规则 + 各补一条断言
- [ ] **Step 4**：`npm --prefix frontend run test:run -- src/components/budget/`，提交

---

### Task 3: 倚天 5 处（section 级 + 字重归位）

**Files:** `views/Yitian{Overview,Analytics,Compliance,Trend,Customer}View.vue` 的 `.yt-h`

全部 `level="section"`。**5 处原为 `--fs-3`/600，归位后变 700**，是本期最集中的视觉变化点。

`.yt-h` 带 `margin-bottom: var(--gap-stack)`，按铁律 2 保留原类并存：`<SectionTitle class="yt-h">`，并从 `.yt-h` 规则里删掉 font-size/font-weight/color 三项、只留 margin。

**注意** `YitianOverviewView` 另有 `.yt-h--sub` 修饰类（`margin-top`），一并保留。

- [ ] **Step 1-4**：同通用模式，验证并提交

---

### Task 4: views 组（8 处）

| 文件 | 类 | 级别 | 备注 |
|---|---|---|---|
| `BoardView` | `.bv-title` | section | |
| `DataQualityView` | `.gov-h` | section | |
| `DataQualityView` | `.gov-banner-title` | **card** | 同文件两个级别，勿混 |
| `OpportunitiesBoardView` | `.ob-h3` | section | |
| `OverviewView` | `.ov-portal-title` | section | |
| `RiskBoardView` | `.rv-h3` | section | |
| `CalendarView` | `.cal-up-title` | **card** | |
| `ClosedProjectDetailView` | `.cd-404-title` | **card** | |
| `ProjectDetailView` | `.pd-404-title` | **card** | |

`DataQualityView` 一个文件里两个级别，是本组最易搞错的。

- [ ] **Step 1-4**：同通用模式，验证并提交

---

### Task 5: components 组（8 处）

| 文件 | 类 | 级别 | 备注 |
|---|---|---|---|
| `CalGrid` | `.cal-month-title` | section | |
| `CalDayDetail` | `.cdd-title` | **card** | |
| `LanxinPushDrawer` | `.lx-card-title` | **section** | 类名含 card 但原值是 `--fs-3`，**按原值归 section** |
| `OrgRanking` | `.or-title` | section | |
| `RateConfigDrawer` | `.rc-h` | section | |
| `TrendCard` | `.tc-title` | section | |
| `PaymentL4Table` | `.pl4-title` | **card** | **★ 原为 `--fs-4`/600，归位 700** |

- [ ] **Step 1-4**：同通用模式，验证并提交

---

### Task 6: 守卫 + 发版

- [ ] **Step 1: 追加守卫**（`views/__pageHeader.test.ts`）

```ts
  it('V4.5.1 SectionTitle 已接入,标题类不再自带字号字重', () => {
    const comps = resolve(viewsDir, '../components')
    const dirs = [viewsDir, comps, resolve(comps, 'budget')]
    const users = dirs.flatMap((d) => {
      try {
        return readdirSync(d).filter((f) => f.endsWith('.vue'))
          .filter((f) => readFileSync(resolve(d, f), 'utf-8').includes('<SectionTitle'))
      } catch { return [] }
    }).length
    expect(users, 'SectionTitle 接入数下降').toBeGreaterThanOrEqual(20)

    // 判据是「不再自带字号字重」而非「类名消失」—— 按铁律 2,带布局属性的标题类
    // 要保留下来与组件并存(如 <SectionTitle class="yt-h">),此时类名仍在但只剩 margin。
    const NO_FONT: [string, string, string][] = [
      [viewsDir, 'YitianOverviewView.vue', 'yt-h'], [viewsDir, 'DataQualityView.vue', 'gov-h'],
      [viewsDir, 'RiskBoardView.vue', 'rv-h3'], [comps, 'OrgRanking.vue', 'or-title'],
      [comps, 'budget/SummaryCard.vue', 'bd-card-title'],
    ]
    for (const [d, f, cls] of NO_FONT) {
      const m = readFileSync(resolve(d, f), 'utf-8').match(new RegExp(`^\\.${cls}\\s*\\{([^}]*)\\}`, 'm'))
      if (!m) continue
      for (const k of ['font-size', 'font-weight']) {
        expect(m[1].includes(k), `${f} 的 .${cls} 仍自带 ${k},未收归 SectionTitle`).toBe(false)
      }
    }
  })
```

（`budget/SummaryCard.vue` 那条的 `resolve(d, f)` 会拼成 `components/budget/SummaryCard.vue`，路径正确。）

- [ ] **Step 2**: `version.ts` → `V4.5.1`；`PROGRESS.md` 追加条目
- [ ] **Step 3**: `bash verify.sh` 全绿
- [ ] **Step 4**: 提交

---

## 完成后的人工目验清单

1. **6 处字重归位**（倚天 5 页的卡内小标题、`PaymentL4Table` 的表标题）由 600 变 700 —— 本期唯一预期视觉变化，确认不显得过重
2. **两级差异是否成立**：随便找一个既有卡片主标题又有卡内小节标题的页面（如 `/governance` 的 `.gov-banner-title` 与 `.gov-h`），确认两级有可见的层次差
3. `/budget` 10 卡的标题应零变化（原本就是 `--fs-4`/700）
4. 深色模式下标题色 `--txt` 正常
