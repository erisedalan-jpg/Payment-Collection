# 2a-2 `AppCard` 四变体 + 44 处迁移 实施计划（V4.5.0，Z 级）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抽出 `AppCard`（四变体，只有一个 `variant` prop），替换全站 44 处自写卡片容器。

**Architecture:** 先按全量数据定死四种变体，组件只实现这四种、不提供逐项覆盖；再按**文件集**分五组并行替换。变体由「圆角 + 有无阴影」二维决定，与当前 padding 无关 —— 13 处 padding 不符的以变体为准。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Vitest

## Global Constraints

- **绝不使用 emoji**；需要符号用 `→ ↓ ❌ ✕ ▾`
- 注释、测试名、UI 文案一律**简体中文**
- 版本 **V4.5.0（Z 级）**，单一来源 `frontend/src/version.ts`
- `AppCard` **只有 `variant` 一个 prop**，绝不加 `padding`/`radius`/`shadow` 逐项覆盖；需要第五种形态时先改 spec 再加变体
- **16 处非卡片绝不纳入**（见下方「非目标」表），按类名硬套是本期最容易犯的错
- **绝不碰** `SectionTitle` / `StatusBadge` / chip（属 2a-3）、`.toolbar`（第三期）
- typecheck 用 `npm --prefix frontend run typecheck`（**本仓无 `tsconfig.app.json`**）
- 每个 Task 结束时 typecheck + 该 Task 的 scoped 测试必须绿

## 非目标：这 16 处满足「background+border+radius」但不是卡片

| 类型 | 实例 |
|---|---|
| 交互控件 | `SegToggle.seg` · `DisplaySettings.seg` · `ChartTypeSelector.cts` · `FilterBar.fb-preset` |
| 按钮 | `ActivityView.av-export`（类名不含 btn） |
| 列表项 / 单元格 | `ProjectDetailDrawer.pd-cell` · `FollowupRecords.fr-record` · `TodoQueue.tq-count` · `ProductSection.ps-item` · `ServiceSection.sv-item` · `RiskBoardView.rv-chart-item` · `PortalConfigCard.pc-item` · `FilterBar.fb-item` |
| 表单 / 抽屉内部件 | `FollowupRecordForm.frf` · `RateConfigDrawer.rc-col` · `ScopeBuilder.sb-group` · `PmSection.pm-phase` · `CrmCard.crm-text` · `YitianSourceCard.dv-fmt` · `MainDomainSourceCard.dv-cookie-box` |
| 提示条 | `DataQualityView.gov-alert` |
| **登录页（豁免）** | `LoginView.lv-form` · `ChangePasswordView.cpw-form` |
| **本期自建组件** | `AppEmpty.ae--default`（V4.4.9 刚建） |

---

### Task 1: `AppCard` 组件

**Files:**
- Create: `frontend/src/components/AppCard.vue` + `AppCard.test.ts`

**Interfaces:**
- Produces: `<AppCard variant="default|raised|flat|inset">内容</AppCard>`（默认 `default`）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import AppCard from './AppCard.vue'

const css = () => readFileSync(resolve(__dirname, 'AppCard.vue'), 'utf-8')
const block = (v: string) => css().match(new RegExp(`\\.ac--${v}\\s*\\{([^}]*)\\}`))![1]

describe('AppCard', () => {
  it('渲染默认插槽', () => {
    expect(mount(AppCard, { slots: { default: '内容' } }).text()).toBe('内容')
  })

  it('variant 默认 default,四个变体各自挂对应 class', () => {
    expect(mount(AppCard, { slots: { default: 'x' } }).classes()).toContain('ac--default')
    for (const v of ['raised', 'flat', 'inset'] as const) {
      expect(mount(AppCard, { props: { variant: v }, slots: { default: 'x' } }).classes()).toContain(`ac--${v}`)
    }
  })

  it('default:r-lg + card-pad + card + shadow-1(17 处主区块的原值)', () => {
    const b = block('default')
    expect(b).toMatch(/border-radius:\s*var\(--r-lg\)/)
    expect(b).toMatch(/padding:\s*var\(--card-pad\)/)
    expect(b).toMatch(/background:\s*var\(--card\)/)
    expect(b).toMatch(/box-shadow:\s*var\(--shadow-1\)/)
  })

  it('raised:r-md + card-pad + card + shadow-1(与 default 只差圆角)', () => {
    const b = block('raised')
    expect(b).toMatch(/border-radius:\s*var\(--r-md\)/)
    expect(b).toMatch(/padding:\s*var\(--card-pad\)/)
    expect(b).toMatch(/box-shadow:\s*var\(--shadow-1\)/)
  })

  it('flat:r-md + card-pad + card + 无阴影(与 raised 只差阴影)', () => {
    const b = block('flat')
    expect(b).toMatch(/border-radius:\s*var\(--r-md\)/)
    expect(b).toMatch(/padding:\s*var\(--card-pad\)/)
    expect(b).not.toMatch(/box-shadow/)
  })

  it('inset:r-sm + sp-2 sp-3 + card2 + 无阴影', () => {
    const b = block('inset')
    expect(b).toMatch(/border-radius:\s*var\(--r-sm\)/)
    expect(b).toMatch(/padding:\s*var\(--sp-2\)\s+var\(--sp-3\)/)
    expect(b).toMatch(/background:\s*var\(--card2\)/)
    expect(b).not.toMatch(/box-shadow/)
  })

  it('只有 variant 一个 prop —— 不得提供 padding/radius/shadow 逐项覆盖', () => {
    // 承重约束:加逐项覆盖 prop 等于把「3 种圆角 × 5 种 padding」的混乱固化成 API,
    // 此后再也收不回来。需要第五种形态时先改 spec 再加变体。
    expect(Object.keys((AppCard as any).props ?? {})).toEqual(['variant'])
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npm --prefix frontend run test:run -- src/components/AppCard.test.ts`
Expected: FAIL —— 找不到 `./AppCard.vue`

- [ ] **Step 3: 实现**

```vue
<script setup lang="ts">
// 四变体由「圆角 + 有无阴影」二维决定,取值来自全站 44 处卡片的实测分布:
//   default 17 处完全匹配 / raised 3 / flat 8 / inset 1,其余仅 padding 异、按变体归位。
// 【只有 variant 一个 prop】—— 不提供 padding/radius/shadow 逐项覆盖,
// 否则等于把「3 种圆角 × 5 种 padding」的现状混乱固化成 API。
withDefaults(defineProps<{ variant?: 'default' | 'raised' | 'flat' | 'inset' }>(), { variant: 'default' })
</script>

<template>
  <div class="ac" :class="`ac--${variant}`"><slot /></div>
</template>

<style scoped>
.ac { border: 1px solid var(--line); }
/* 页面主区块(概算 10 卡 / 倚天 5 卡 / 首页横幅与门户 / 回款总览) */
.ac--default {
  border-radius: var(--r-lg);
  padding: var(--card-pad);
  background: var(--card);
  box-shadow: var(--shadow-1);
}
/* 带阴影的次级主块(待办队列 / 首页异常卡 / 数据治理源卡 / 数据状态条),
   与 default 只差圆角 —— 三变体方案覆盖不到它,详见 spec §3.3 的订正说明。 */
.ac--raised {
  border-radius: var(--r-md);
  padding: var(--card-pad);
  background: var(--card);
  box-shadow: var(--shadow-1);
}
/* 无阴影的内容块(图表卡 / 指标卡 / 各类明细块),与 raised 只差阴影 */
.ac--flat {
  border-radius: var(--r-md);
  padding: var(--card-pad);
  background: var(--card);
}
/* 卡内小信息块,底色用 --card2 与外层拉开层次 */
.ac--inset {
  border-radius: var(--r-sm);
  padding: var(--sp-2) var(--sp-3);
  background: var(--card2);
}
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `npm --prefix frontend run test:run -- src/components/AppCard.test.ts`
Expected: PASS（7 项）

- [ ] **Step 5: 反向验证（必做）**

四个变体各改坏一项取值（如把 `raised` 的 `box-shadow` 删掉），确认对应契约用例变红后还原。
**V4.4.9 的教训**：`AppButton` 初版契约只断言 3 项、漏了 4 项，导致 7 处按钮被换错形态而**无一条测试变红**。本 Task 的四组断言必须每项都实测能红。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/components/AppCard.vue frontend/src/components/AppCard.test.ts
git commit -m "feat(components): V4.5.0 新增 AppCard 四变体

变体由「圆角 + 有无阴影」二维决定,取值来自全站 44 处卡片的实测分布。
raised 不是为迁就现状硬造:5 处用法一致(待办队列/首页异常卡/数据治理源卡/
数据状态条),语义上「带阴影的主块」与 flat 的「嵌套次级块」确属不同层级,
三变体方案会让它们丢阴影或圆角 10px→14px。
只有 variant 一个 prop —— 加逐项覆盖等于把 3 圆角×5 padding 的混乱固化成 API。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2-6 通用替换模式

```vue
<!-- 改前 -->
<div class="iv-card">…</div>
<!-- 改后(flat 组) -->
<AppCard variant="flat">…</AppCard>
```

script 段加 `import AppCard from '@/components/AppCard.vue'`；style 段**删除**该文件里已无引用的卡片类规则。

**三条铁律**：

1. **变体按下表指定，不要自己按类名猜**。同名类在不同文件里可能归不同变体（如 `CostDetailView.cd-card` 归 flat、`CalendarView.cd-card` 归 inset）。
2. **★ 标记的 13 处 padding 与目标变体不符，以变体为准**（这正是本期要消除的不一致），不要为保持原样而加内联 style 或 `!important`。
3. **卡片类若还带 flex/grid/min-width 等布局属性**（如 `.dash-card` 的 `min-width: 0`、`.ns` 的 `display:flex`），这些属性**保留在原类里**、与 `AppCard` 并存：`<AppCard variant="flat" class="ns">`。`AppCard` 只负责「卡片外观」四属性，不接管布局。

**每个 Task 的验证**：`npm --prefix frontend run test:run -- <本组涉及的 *.test.ts>`，全绿后提交。

---

### Task 2: 概算工具（10 个组件，全 default）

**Files:** `components/budget/` 下 10 个 `.bd-card`：`BasicInfoCard` · `CrmCard` · `DirectCostSection` · `PmSection` · `ProductSection` · `RateReferenceCard` · `RatioCard` · `SalesOrderCard` · `ServiceSection` · `SummaryCard`

全部 `variant="default"`，**10 处 padding 均已是 `--card-pad`、零差异**，是全场最机械的一组。

**注意**：`PmSection.pm-phase`、`ProductSection.ps-item`、`ServiceSection.sv-item`、`CrmCard.crm-text` 在同一批文件里但**属非目标**，不要动。

- [ ] **Step 1-3**：逐文件替换 + 删 `.bd-card` 规则 + 各补一条 `AppCard` 渲染断言。
- [ ] **Step 4**: 验证并提交

```bash
git commit -m "refactor(budget): V4.5.0 概算 10 卡接入 AppCard(default)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 倚天 5 页 + 2 处环卡（7 处）

| 文件 | 类 | 变体 | padding |
|---|---|---|---|
| `YitianAnalyticsView` | `.yt-card` | default | 已符 |
| `YitianComplianceView` | `.yt-card` | default | 已符 |
| `YitianCustomerView` | `.yt-card` | default | 已符 |
| `YitianOverviewView` | `.yt-card` | default | 已符 |
| `YitianTrendView` | `.yt-card` | default | 已符 |
| `YitianComplianceView` | `.yt-ring-card` | **flat** | 已符 |
| `YitianOverviewView` | `.yt-ring-card` | **flat** | 已符 |

`.yt-card` 在 5 个文件里各写一遍、逐字相同 —— 本组零 padding 差异。

- [ ] **Step 1-4**: 同通用模式，验证并提交

---

### Task 4: default / raised 组的其余 views（7 处）

| 文件 | 类 | 变体 | padding | 备注 |
|---|---|---|---|---|
| `BoardView` | `.bv-card` | default | **★ `--sp-4`→`--card-pad`** | 16px→20px |
| `DashboardView` | `.dash-card` | default | 已符 | 保留 `min-width: 0` |
| `OverviewView` | `.ov-band` | default | 已符 | |
| `OverviewView` | `.ov-portal` | default | 已符 | |
| `OverviewView` | `.ov-acard` | **raised** | 已符 | 首页异常卡，带阴影 |
| `OverviewView` | `.ov-aside` | **raised** | **★ `--sp-3 --sp-4`→`--card-pad`** | |
| `DataQualityView` | `.gov-src` | **raised** | 已符 | |

`OverviewView` 一个文件里有 4 处、跨 default 与 raised 两个变体，是本组最需要小心的。

- [ ] **Step 1-4**: 同通用模式，验证并提交

---

### Task 5: flat 组 views（10 处）

| 文件 | 类 | padding |
|---|---|---|
| `ActivityView` | `.av-compare` | **★ `--sp-3 --sp-4`** |
| `CostDetailView` | `.cd-card` | **★ `--sp-3`** |
| `CostDetailView` | `.cd-defer` | **★ `--sp-4`** |
| `InsightView` | `.iv-card` | **★ `--sp-3`** |
| `MilestoneView` | `.mv-card` | **★ `--sp-3`** |
| `MilestoneView` | `.mv-defer` | **★ `--sp-4`** |
| `OpportunitiesBoardView` | `.ob-card` / `.ob-chart` | 已符（2 处） |
| `PayNodesView` | `.ns` | 已符，保留 `display:flex` 等布局属性 |
| `ProjectDetailView` | `.pd-metric` / `.pd-aside` | **★ `--sp-3 --sp-4`**（2 处） |
| `RiskBoardView` | `.rv-card` | 已符 |

**本组 ★ 最多（7 处）**，padding 统一到 `--card-pad` 后这些卡片会变宽松，是本期预期视觉变化的主要来源。

**注意** `RiskBoardView.rv-chart-item` 属非目标，不要动。

- [ ] **Step 1-4**: 同通用模式，验证并提交

---

### Task 6: components + inset 组（7 处）

| 文件 | 类 | 变体 | padding |
|---|---|---|---|
| `DashMetrics` | `.dm-card` | flat | **★ `12px 14px`（硬写）→`--card-pad`** |
| `MetricGrid` | `.mg-card` | flat | 已符 |
| `MilestoneReminderTab` | `.mrt-card` | flat | 已符 |
| `TodoQueue` | `.tq` | **raised** | 已符 |
| `DataStatusBar` | `.dsb` | **raised** | **★ `--sp-3 --sp-4`** |
| `ActivityView` | `.av-card` | **inset** | 已符（唯一完全匹配的 inset） |
| `CalendarView` | `.cd-card` | **inset** | **★ `--sp-4 --sp-3`** |
| `TempFollowupView` | `.tf-inst` | **inset** | 已符 |

`.dm-card` 的 `12px 14px` 是全站仅存的硬写 padding 卡片，归位后同时消除一处硬写违例。

**注意** `TodoQueue.tq-count`、`FollowupRecords.fr-record` 属非目标。

- [ ] **Step 1-4**: 同通用模式，验证并提交

---

### Task 7: 守卫 + 发版

- [ ] **Step 1: 追加守卫**（`views/__pageHeader.test.ts`）

```ts
  it('V4.5.0 AppCard 已广泛接入,44 处旧卡片类未复活', () => {
    const comps = resolve(viewsDir, '../components')
    const dirs = [viewsDir, comps, resolve(comps, 'budget')]
    const users = dirs.flatMap((d) => {
      try { return readdirSync(d).filter((f) => f.endsWith('.vue'))
        .filter((f) => readFileSync(resolve(d, f), 'utf-8').includes('<AppCard')) } catch { return [] }
    }).length
    expect(users, 'AppCard 接入数下降,可能有人改回自写卡片').toBeGreaterThanOrEqual(25)

    // 按「文件:类名」精确配对,避免与他处同名类混淆(如 CalendarView.cd-card vs CostDetailView.cd-card)
    const GONE: [string, string, string][] = [
      [viewsDir, 'BoardView.vue', 'bv-card'], [viewsDir, 'InsightView.vue', 'iv-card'],
      [viewsDir, 'MilestoneView.vue', 'mv-card'], [viewsDir, 'RiskBoardView.vue', 'rv-card'],
      [viewsDir, 'OverviewView.vue', 'ov-acard'], [viewsDir, 'YitianOverviewView.vue', 'yt-card'],
      [comps, 'MetricGrid.vue', 'mg-card'], [comps, 'TodoQueue.vue', 'tq'],
    ]
    for (const [d, f, cls] of GONE) {
      expect(new RegExp(`^\\.${cls}\\s*[,{]`, 'm').test(readFileSync(resolve(d, f), 'utf-8')),
        `${f} 的 .${cls} 复活了`).toBe(false)
    }
  })
```

- [ ] **Step 2: 版本号与 PROGRESS**：`version.ts` → `V4.5.0`；`PROGRESS.md` 追加条目（含 13 处 padding 归位的目验提醒）
- [ ] **Step 3: 全量验证**：`bash verify.sh`
- [ ] **Step 4: 提交**

---

## 完成后的人工目验清单

1. **13 处 padding 归位**（★ 标记）—— 本期唯一的预期视觉变化，逐处确认没有明显变形，尤其 `.dm-card`（12px→20px）与 `.cd-card`(Calendar，`--sp-4 --sp-3`→`--sp-2 --sp-3`)
2. **`raised` 的 5 处**（待办队列 / 首页异常卡与侧栏 / 数据治理源卡 / 数据状态条）—— 阴影与圆角应与改造前**完全一致**
3. **概算工具 10 卡**（`/budget` 页）—— 全 default，应零变化
4. **倚天 5 页**的主卡与 2 处环卡 —— 主卡 default（带阴影）、环卡 flat（无阴影），两者应有可见的层次差别
5. 深色模式下 `inset` 变体的 `--card2` 底与外层 `--card` 是否还分得清
6. 保留了布局属性的两处（`.dash-card` 的 `min-width:0`、`.ns` 的 flex）—— 确认布局未塌
