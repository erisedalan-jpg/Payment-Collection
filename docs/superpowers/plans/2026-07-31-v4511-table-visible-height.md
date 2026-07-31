# V4.5.11 表格可见高度修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/insight/milestone` 底部三张 >100 条的明细表从只显示 3~4 行变成一次显示约 15 行，并把导致这个缺陷的兜底逻辑修好、用清单守卫钉死不再复发。

**Architecture:** 两根杠杆分工明确 —— ①**显式固定高度**：长分析页最底部的大明细表一律传 `:max-height-px="DETAIL_TABLE_MAX_H"`（新增共享常量，值 640），不依赖动态测量；②**兜底地板**：`useTableMaxHeight` 的默认 `min` 从 200 抬到 440（约 10 行），并在纯函数里 clamp 负 `rectTop`。前者确定性修好本次报障，后者把「将来某张表被挤到折叠线以下」的最坏情况从 4 行抬到 10 行。纯前端改动，不动 `.py`、不进数据管线。

**Tech Stack:** Vue 3 `<script setup>` + TypeScript + Element Plus `el-table` + Vitest / @vue/test-utils（jsdom）

## Global Constraints

- 交流语言**简体中文**；代码/命令/文件名保持原文。
- **不使用任何 emoji** 装饰；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- 版本号单一来源 `frontend/src/version.ts`，本期改为 `V4.5.11`，`RELEASE_DATE` 改为 `2026-07-31`。**只改此处**。
- 前端样式改动倾向于补充 CSS 完善表现，**不引入框架**。
- 本期**不动** `YitianAnalyticsView.vue` / `YitianComplianceView.vue` 的 `560`（处境不同，无报障，改它属于扩大改动面）。
- 本期**不动**弹窗内长表格、首页固定高度部件、无 `max-height` 的铺开表 —— 只把弹窗那条记进 backlog（Task 4）。
- **不新增任何 `data/*.json`**，本期不涉及后端与数据文件，无 `.gitignore` 动作。
- 声称完成前必须 `bash verify.sh` 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）。
- 每个新增守卫都必须做**反向验证**：亲手制造违规，确认对应用例真的变红，再还原。**还原一律用 `cp` 从备份恢复，绝不用 `git checkout` / `git restore` / `git stash`**（工作树里有未提交改动与不可碰的未跟踪文件 `avatar-drafts/`、`wangxutong.png`、`wxt.png`）。备份写到 scratchpad 绝对路径并**立刻验证文件存在**再动手。

---

## 背景：根因与已核实的事实

实施者不需要重新调研，以下均已实证：

**根因** —— `frontend/src/composables/useTableMaxHeight.ts:4`：

```ts
export function computeMaxHeight(rectTop, innerHeight, bottomGap, min) {
  return Math.max(min, innerHeight - rectTop - bottomGap)
}
```

`recompute()` 只在**挂载 / window resize / keep-alive 激活 / `props.rows` 变化**时跑，从不在滚动时跑。`/insight/milestone` 的三张表位于 KPI + 6 张图之后、页面顶部约 1300px 处，挂载那一刻 `rectTop`（≈1300）远大于视口高（≈900），算出负数后被 `min: 200` 兜住 → 表头 41px + 约 4 行 ≈ 200px，与报障「仅能展示 3-4 行」吻合。

**同一个坑已被填过两次** —— `frontend/src/views/CostDetailView.test.ts:84` 的用例名逐字写着：「明细表用 sticky-header + 固定 max-height（表内滚动一次展示多行，如 /projects；**固定值绕过在长页面底部按位置动态测高塌缩成~1行**）」。`CostDetailView` 用 640、`YitianAnalyticsView`/`YitianComplianceView` 用 560 绕开了。三个里程碑 tab 是唯一没补上的。

**全系统盘点（已用脚本枚举，非估计）** —— 全仓 `.vue` 中 `sticky-header` 共 **16 处**，其中带 `max-height-px` 的 **3 处**：

| 类别 | 文件 |
|---|---|
| FIXED（3） | `views/CostDetailView.vue`、`views/YitianAnalyticsView.vue`、`views/YitianComplianceView.vue` |
| DYNAMIC（13） | `components/MilestoneDelayedTab.vue`、`components/MilestonePlanTab.vue`、`components/MilestoneReminderTab.vue`、`components/TempInstancePanel.vue`、`views/ClosedProjectsView.vue`、`views/KeyProjectsView.vue`、`views/OpportunityFollowupView.vue`、`views/PayNodesView.vue`、`views/PayProjectsView.vue`、`views/PaymentKeyFollowupView.vue`、`views/ProjectsView.vue`、`views/RiskFollowupView.vue`、`views/YitianDetailView.vue` |

DYNAMIC 里除三个里程碑 tab 外的 10 张，表格都紧跟在 `PageHeader` + 工具栏（至多一排统计卡）之下，`rectTop` ≈ 250px，测得准，**当前无问题**。本次修完：FIXED 6 / DYNAMIC 10。

`useTableMaxHeight(` 的调用方共 **2 个**：`components/DataTable.vue:54`、`views/OpportunitiesView.vue:95`（后者是裸 `el-table` 手接）。

**为什么 `min` 取 440**：`min` 只在 `视口高 − rectTop − 24 < min` 时才生效。现有 10 张健康表（`rectTop`≈250）在 1080p 视口算得 676、在 768 视口算得 494，**都大于 440，故 440 对它们不生效**；再高（如 560）会在 768 视口上把表体撑出屏幕底部，`el-table` 的冻结表头随页面滚走、当场失效。440 是不咬现有布局的最大值，约 10 行。

**为什么必须补一条「走真实路径」的默认值测试**：现有 `composables/useTableMaxHeight.test.ts` 的 3 条用例形如 `computeMaxHeight(800, 900, 24, 200)`，**把 `min` 当显式入参喂进去**——改 `useTableMaxHeight` 里的默认值它们一条都不会红。这是典型假绿，Task 2 专门补。

---

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `frontend/src/lib/tableLayout.ts` | 表格高度口径单一来源，导出 `DETAIL_TABLE_MAX_H = 640` 及「何时该用它」的判据注释 | **新建** |
| `frontend/src/lib/tableLayout.test.ts` | 钉住常量值 640（防止 tab 测试因两边同时移动而恒绿） | **新建** |
| `frontend/src/components/MilestoneDelayedTab.vue` | 延期项目清单：改传固定高度 | 改 2 行 |
| `frontend/src/components/MilestoneReminderTab.vue` | 到期提醒：改传固定高度 | 改 2 行 |
| `frontend/src/components/MilestonePlanTab.vue` | 在建里程碑计划：改传固定高度 | 改 2 行 |
| `frontend/src/views/CostDetailView.vue` | 把内联 `640` 改成引用常量（4 个调用点收归一处） | 改 2 行 |
| `frontend/src/composables/useTableMaxHeight.ts` | 默认 `min` 200→440；`computeMaxHeight` 内 clamp 负 `rectTop` | 改 3 处 |
| `frontend/src/components/__tableHeightInventory.test.ts` | 清单守卫：新增/改动任一 sticky 表即变红，逼作者归类 | **新建** |
| 三个 tab 的 `.test.ts` | 各加一条固定高度断言 | 各加 1 条用例 |
| `frontend/src/composables/useTableMaxHeight.test.ts` | 加「真实路径默认 min」与「负 top clamp」两条 | 加 2 条用例 |
| `frontend/src/version.ts` | 版本号 | 改 2 行 |
| `PROGRESS.md` | 版本段落 + backlog L-64 | 改 |

---

### Task 1: 共享常量 + 三张里程碑表固定高度 + CostDetail 收归引用

**Files:**
- Create: `frontend/src/lib/tableLayout.ts`
- Create: `frontend/src/lib/tableLayout.test.ts`
- Modify: `frontend/src/components/MilestoneDelayedTab.vue`（import 区末行 `:12`，模板 `:75`）
- Modify: `frontend/src/components/MilestoneReminderTab.vue`（import 区末行 `:18`，模板 `:116`）
- Modify: `frontend/src/components/MilestonePlanTab.vue`（import 区末行 `:10`，模板 `:54`）
- Modify: `frontend/src/views/CostDetailView.vue`（import 区末行 `:36`，模板 `:232`）
- Test: `frontend/src/components/MilestoneDelayedTab.test.ts`、`frontend/src/components/MilestoneReminderTab.test.ts`、`frontend/src/components/MilestonePlanTab.test.ts`、`frontend/src/lib/tableLayout.test.ts`

**Interfaces:**
- Consumes: `DataTable` 既有 prop `maxHeightPx?: number`（`components/DataTable.vue:37`，仅在 `stickyHeader` 为真时生效，已存在，本任务不改）。
- Produces: `export const DETAIL_TABLE_MAX_H: number`（值 640），供 Task 3 的清单守卫 import。

- [ ] **Step 1: 写失败测试 —— 常量本身的值**

新建 `frontend/src/lib/tableLayout.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { DETAIL_TABLE_MAX_H } from './tableLayout'

describe('DETAIL_TABLE_MAX_H', () => {
  // 【为什么单独钉这个数】三个 tab 的测试断言的是 `toBe(DETAIL_TABLE_MAX_H)`,
  // 常量和断言会一起移动 —— 只有这条把字面量 640 钉死,改常量才有测试变红。
  it('值为 640(≈15 行:表头 41 + 行高 41,(640-41)/41≈14.6),且不会大到在 768 高的视口撑出屏幕', () => {
    expect(DETAIL_TABLE_MAX_H).toBe(640)
    expect(DETAIL_TABLE_MAX_H).toBeLessThan(768 - 24)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm --prefix frontend run test:run -- src/lib/tableLayout.test.ts
```

Expected: FAIL —— `Failed to resolve import "./tableLayout"`（文件尚不存在）

- [ ] **Step 3: 新建常量文件**

新建 `frontend/src/lib/tableLayout.ts`：

```ts
// 表格高度口径的单一来源。
//
// 【为什么需要显式固定值】DataTable 的 sticky-header 默认按「表格在视口中的位置」动态测高
// (composables/useTableMaxHeight.ts)。该测量只在挂载 / window resize / keep-alive 激活 /
// props.rows 变化时跑,拿到的是那一刻的 rect.top —— 对【位于长页面折叠线以下】的表格,
// 挂载时 rect.top 远大于视口高,算出负数后只能退到兜底地板,表格塌缩成几行。
// /insight/milestone 底部三张 >100 条的明细表就因此只显示 3~4 行(V4.5.11 报障),
// /insight/costdetail 的明细表更早踩过同一个坑(见 CostDetailView.test.ts 该用例名)。
//
// 【判据】新增一张 sticky-header 表时按位置二选一,不要凭感觉:
//   · 表格紧跟在 PageHeader + 工具栏之下(rect.top ≈ 250px)  → 动态测量测得准,【不要】传 max-height-px
//   · 表格位于 KPI / 图表 / 多个卡片之后(长分析页底部)      → 必须传 :max-height-px="DETAIL_TABLE_MAX_H"
// 该判据由 components/__tableHeightInventory.test.ts 的清单守卫强制:新增任一 sticky 表都会变红。
//
// 【640 的来历】设计规范定「单元格内边距纵 8 横 12」,中档字号(18)下表头与行高各约 41px,
// (640-41)/41 ≈ 14~15 行;且在 768 高的笔记本视口上不会撑出屏幕外 —— 撑出后 el-table 的
// 冻结表头会随页面一起滚走、当场失效。
export const DETAIL_TABLE_MAX_H = 640
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npm --prefix frontend run test:run -- src/lib/tableLayout.test.ts
```

Expected: PASS（1 passed）

- [ ] **Step 5: 写失败测试 —— 三个 tab 各一条**

在 `frontend/src/components/MilestoneDelayedTab.test.ts` 顶部 import 区加：

```ts
import { DETAIL_TABLE_MAX_H } from '@/lib/tableLayout'
```

在 `describe('MilestoneDelayedTab', ...)` 内追加：

```ts
  it('明细表传固定 max-height(表在 6 图之下,动态测高会退到兜底地板、塌缩成 3~4 行)', () => {
    const w = mount(MilestoneDelayedTab, { props: { projects, now }, ...opts })
    const dt = w.findComponent(DataTable)
    expect(dt.props('stickyHeader')).toBe(true)
    expect(dt.props('maxHeightPx')).toBe(DETAIL_TABLE_MAX_H)
  })
```

在 `frontend/src/components/MilestoneReminderTab.test.ts` 顶部 import 区加同一行 import，并在 `describe('MilestoneReminderTab 核心', ...)` 内追加（注意本文件挂载走 `mountTab()` 助手，它内含 `setActivePinia`）：

```ts
  it('明细表传固定 max-height(表在 6 图之下,动态测高会退到兜底地板、塌缩成 3~4 行)', () => {
    const w = mountTab()
    const dt = w.findComponent(DataTable)
    expect(dt.props('stickyHeader')).toBe(true)
    expect(dt.props('maxHeightPx')).toBe(DETAIL_TABLE_MAX_H)
  })
```

在 `frontend/src/components/MilestonePlanTab.test.ts` 顶部 import 区加同一行 import，并在 `describe('MilestonePlanTab', ...)` 内追加：

```ts
  it('明细表传固定 max-height(表在 6 图之下,动态测高会退到兜底地板、塌缩成 3~4 行)', () => {
    const w = mount(MilestonePlanTab, { props: { projects }, ...opts })
    const dt = w.findComponent(DataTable)
    expect(dt.props('stickyHeader')).toBe(true)
    expect(dt.props('maxHeightPx')).toBe(DETAIL_TABLE_MAX_H)
  })
```

- [ ] **Step 6: 跑测试确认失败**

```bash
npm --prefix frontend run test:run -- src/components/MilestoneDelayedTab.test.ts src/components/MilestoneReminderTab.test.ts src/components/MilestonePlanTab.test.ts
```

Expected: 3 FAILED —— `expected undefined to be 640`（三个 tab 都还没传 `maxHeightPx`）

- [ ] **Step 7: 三个 tab 加 import 与 prop**

`frontend/src/components/MilestoneDelayedTab.vue` —— 在 `import AppPager from './AppPager.vue'`（`:12`）之后加一行：

```ts
import { DETAIL_TABLE_MAX_H } from '@/lib/tableLayout'
```

把 `:75` 那行改为（只加一个 prop，其余原样）：

```html
    <DataTable :columns="COLS" :rows="paged" :show-count="false" clickable sticky-header :max-height-px="DETAIL_TABLE_MAX_H" @row-click="onRow">
```

`frontend/src/components/MilestoneReminderTab.vue` —— 在 `import AppCard from './AppCard.vue'`（`:18`）之后加同一行 import；把 `:116` 那行改为：

```html
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable sticky-header :max-height-px="DETAIL_TABLE_MAX_H" :default-sort="psort.defaultSort.value" @sort-change="psort.onSortChange" @row-click="onRow">
```

`frontend/src/components/MilestonePlanTab.vue` —— 在 `import AppPager from './AppPager.vue'`（`:10`）之后加同一行 import；把 `:54` 那行改为：

```html
      <DataTable :columns="COLS" :rows="paged" :show-count="false" clickable sticky-header :max-height-px="DETAIL_TABLE_MAX_H" @row-click="onRow">
```

- [ ] **Step 8: 跑测试确认通过**

```bash
npm --prefix frontend run test:run -- src/components/MilestoneDelayedTab.test.ts src/components/MilestoneReminderTab.test.ts src/components/MilestonePlanTab.test.ts
```

Expected: 全部 PASS

- [ ] **Step 9: CostDetail 改引用常量（不改行为）**

`frontend/src/views/CostDetailView.vue` —— 在 `import { useViewScrollMemory } from '@/lib/useViewScrollMemory'`（`:36`）之后加：

```ts
import { DETAIL_TABLE_MAX_H } from '@/lib/tableLayout'
```

把 `:232` 行内的 `:max-height-px="640"` 改为 `:max-height-px="DETAIL_TABLE_MAX_H"`，该行其余部分（含换行后的属性）原样不动。

- [ ] **Step 10: 确认 CostDetail 既有断言仍绿（零行为变化的证明）**

```bash
npm --prefix frontend run test:run -- src/views/CostDetailView.test.ts
```

Expected: PASS —— 其中 `CostDetailView.test.ts:90` 的 `expect(detail.props('maxHeightPx')).toBe(640)` 断的是字面量 640，改成引用常量后仍应为 640。**若这条红了，说明常量值写错了。**

- [ ] **Step 11: 反向验证（制造违规确认真会红）**

```bash
SCRATCH="C:/Users/tjusu/AppData/Local/Temp/claude/C--Users-tjusu-Desktop-cc-work-tools-Payment-Collection/cf8743e9-6428-4fc9-a97e-745efb774141/scratchpad"
mkdir -p "$SCRATCH/bak-t1"
cp frontend/src/components/MilestoneDelayedTab.vue "$SCRATCH/bak-t1/"
cp frontend/src/lib/tableLayout.ts "$SCRATCH/bak-t1/"
ls -l "$SCRATCH/bak-t1/"     # 必须看到两个文件,为空则停下,不要往下做
```

变异 A —— 撤掉一个 tab 的 prop：把 `MilestoneDelayedTab.vue` 里的 ` :max-height-px="DETAIL_TABLE_MAX_H"` 删掉，跑

```bash
npm --prefix frontend run test:run -- src/components/MilestoneDelayedTab.test.ts
```

Expected: **1 FAILED**（`expected undefined to be 640`）。还原：`cp "$SCRATCH/bak-t1/MilestoneDelayedTab.vue" frontend/src/components/`

变异 B —— 改常量值：把 `tableLayout.ts` 的 `640` 改成 `700`，跑

```bash
npm --prefix frontend run test:run -- src/lib/tableLayout.test.ts src/views/CostDetailView.test.ts
```

Expected: **2 FAILED**（`tableLayout.test.ts` 的 `toBe(640)` 红；`CostDetailView.test.ts:90` 的 `toBe(640)` 红）。这证明常量不是随便能改的。还原：`cp "$SCRATCH/bak-t1/tableLayout.ts" frontend/src/lib/`

还原后重跑 Step 8 + Step 10 的命令，确认全绿。

- [ ] **Step 12: typecheck**

```bash
npm --prefix frontend run typecheck
```

Expected: 无输出、退出码 0

- [ ] **Step 13: Commit**

```bash
git add frontend/src/lib/tableLayout.ts frontend/src/lib/tableLayout.test.ts \
        frontend/src/components/MilestoneDelayedTab.vue frontend/src/components/MilestoneReminderTab.vue frontend/src/components/MilestonePlanTab.vue \
        frontend/src/components/MilestoneDelayedTab.test.ts frontend/src/components/MilestoneReminderTab.test.ts frontend/src/components/MilestonePlanTab.test.ts \
        frontend/src/views/CostDetailView.vue
git commit -F - <<'MSGEOF'
fix(milestone): 三张明细表改用固定 max-height,从 3~4 行提到约 15 行

/insight/milestone 底部三表位于 6 图之后约 1300px 处,DataTable 的
sticky-header 动态测高在挂载时拿到的 rect.top 远大于视口高,算出负数后
退到兜底地板 200px = 表头 + 4 行。改传 :max-height-px。

新增 lib/tableLayout.ts 作为该口径的单一来源(DETAIL_TABLE_MAX_H = 640),
CostDetailView 原有的内联 640 一并收归引用,四个调用点从此只有一处可改。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSGEOF
```

---

### Task 2: `useTableMaxHeight` 兜底地板抬到 440 + 负 `rectTop` clamp

**Files:**
- Modify: `frontend/src/composables/useTableMaxHeight.ts`（`:4-6` 纯函数、`:17` 默认值）
- Test: `frontend/src/composables/useTableMaxHeight.test.ts`

**Interfaces:**
- Consumes: 无（本任务不依赖 Task 1）
- Produces: `computeMaxHeight(rectTop, innerHeight, bottomGap, min)` 签名**不变**（四个入参、返回 number），仅内部行为变化；`useTableMaxHeight(getEl, opts)` 签名不变，`opts.min` 缺省值由 200 变 440。

- [ ] **Step 1: 写失败测试 —— 走真实路径的默认 min + 负 top clamp**

在 `frontend/src/composables/useTableMaxHeight.test.ts` 顶部把 import 改成（补 vue / test-utils）：

```ts
import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { computeMaxHeight, useTableMaxHeight } from './useTableMaxHeight'
```

在文件末尾追加两个 describe：

```ts
describe('computeMaxHeight 负 rectTop', () => {
  // rect.top 为负 = 表格顶部已滚出视口上沿。此时 innerHeight − 负数 会算出【比视口还高】
  // 的表体,表头随页面滚走、冻结表头当场失效。recompute 在 rows 变化与 keep-alive 激活时
  // 都用当时的滚动位置测量,这条路径是可达的(useViewScrollMemory 从下钻页返回会恢复滚动)。
  it('按贴顶算,不会算出比视口还高的表', () => {
    expect(computeMaxHeight(-150, 900, 24, 440)).toBe(876) // 900-0-24,不是 900+150-24=1026
  })
  it('clamp 只影响负值,正常正数 top 一字不动', () => {
    expect(computeMaxHeight(200, 900, 24, 440)).toBe(676)
  })
})

describe('useTableMaxHeight 默认兜底地板', () => {
  // 【这条为什么必须走真实路径】上面 computeMaxHeight 的用例都把 min 当【显式入参】喂进去,
  // 改 useTableMaxHeight 里的默认值它们一条都不会红。这条不传 opts.min,才真正钉住默认值。
  it('表格在折叠线以下(测量失效)时给出 440 ≈ 10 行,而不是塌缩成 4 行', async () => {
    const realInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { value: 900, writable: true, configurable: true })

    const el = document.createElement('div')
    // rect.top = 10000:表格远在视口下方,900 - 10000 - 24 为负 → 只能吃默认地板
    el.getBoundingClientRect = () => ({ top: 10000 }) as DOMRect

    let mh: { value: number } | null = null
    const C = defineComponent({
      setup() {
        mh = useTableMaxHeight(() => el).maxHeight
        return () => h('div')
      },
    })
    const w = mount(C)
    await nextTick()
    await nextTick() // useTableMaxHeight 在 onMounted 里 nextTick(recompute)

    expect(mh!.value).toBe(440)

    w.unmount()
    Object.defineProperty(window, 'innerHeight', { value: realInnerHeight, writable: true, configurable: true })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm --prefix frontend run test:run -- src/composables/useTableMaxHeight.test.ts
```

Expected: **2 FAILED** —— 「负 rectTop」得到 `1026`（期望 876）；「默认兜底地板」得到 `200`（期望 440）。另一条「clamp 只影响正值」应已 PASS。

- [ ] **Step 3: 改实现**

`frontend/src/composables/useTableMaxHeight.ts` —— 把 `:3-6` 的纯函数替换为：

```ts
/** 纯计算:视口可用高度 = 视口高 − 表格顶部距 − 底部留白,不低于 min。
 *  rectTop 为负(表格顶部已滚出视口上沿)时按【贴顶】算 —— 否则 innerHeight − 负数 会算出
 *  比视口还高的表体,表头随页面滚走、冻结表头当场失效(V4.5.11)。clamp 只会【减小】结果,
 *  对现有正常表格是单向安全的。 */
export function computeMaxHeight(rectTop: number, innerHeight: number, bottomGap: number, min: number): number {
  return Math.max(min, innerHeight - Math.max(0, rectTop) - bottomGap)
}

/** 兜底地板:测不准时(表格在折叠线以下,rect.top 远大于视口高,算出的负数不是「空间不够」
 *  而是「没测到」)最坏也要显示约 10 行。取 440 而非更大值 —— 现有页面顶部表格(top≈250)
 *  在 1080p / 768 视口下算出 676 / 494,都大于 440,故此地板对它们【不生效】;再高(如 560)
 *  会在 768 视口上把表体撑出屏幕底部,冻结表头失效。
 *  长页面底部的大明细表不该依赖这个地板,应显式传 max-height-px(见 lib/tableLayout.ts)。 */
const DEFAULT_MIN_HEIGHT = 440
```

把 `:17` 的 `const min = opts.min ?? 200` 改为：

```ts
  const min = opts.min ?? DEFAULT_MIN_HEIGHT
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npm --prefix frontend run test:run -- src/composables/useTableMaxHeight.test.ts
```

Expected: 全部 PASS（原有 3 条 + 新增 3 条）。原有 3 条必须**保持绿**——它们传的都是显式 `min: 200` 与正数 `rectTop`，是本次改动的零回归安全网；**若它们变红，说明 clamp 写错了位置或默认值改到了不该改的地方。**

- [ ] **Step 5: 反向验证**

```bash
SCRATCH="C:/Users/tjusu/AppData/Local/Temp/claude/C--Users-tjusu-Desktop-cc-work-tools-Payment-Collection/cf8743e9-6428-4fc9-a97e-745efb774141/scratchpad"
mkdir -p "$SCRATCH/bak-t2"
cp frontend/src/composables/useTableMaxHeight.ts "$SCRATCH/bak-t2/"
ls -l "$SCRATCH/bak-t2/"     # 必须看到文件,为空则停下
```

变异 A —— 把 `DEFAULT_MIN_HEIGHT` 改回 `200`，跑测试。Expected: **1 FAILED**（「默认兜底地板」得 200）。
变异 B —— 还原后，把 `Math.max(0, rectTop)` 改回 `rectTop`，跑测试。Expected: **1 FAILED**（「负 rectTop」得 1026）。

每次还原：`cp "$SCRATCH/bak-t2/useTableMaxHeight.ts" frontend/src/composables/`，还原后重跑 Step 4 确认全绿。

- [ ] **Step 6: 跑全量前端测试（确认 10 张动态表未被影响）**

```bash
npm --prefix frontend run test:run
```

Expected: 全绿。**这一步是本任务最重要的回归证明** —— 抬高默认地板会影响所有 13 张动态测高的表，全量绿才说明没波及。

- [ ] **Step 7: typecheck**

```bash
npm --prefix frontend run typecheck
```

Expected: 无输出、退出码 0

- [ ] **Step 8: Commit**

```bash
git add frontend/src/composables/useTableMaxHeight.ts frontend/src/composables/useTableMaxHeight.test.ts
git commit -F - <<'MSGEOF'
fix(table): 兜底地板 200→440,并 clamp 负 rectTop

兜底地板 200px = 表头 + 4 行,是本次里程碑三表塌缩的直接落点。抬到 440
(约 10 行)后,将来任何一张表被挤到折叠线以下,最坏也有 10 行。取 440 而非
更大值:现有页面顶部表格在 1080p/768 视口下算出 676/494 都大于 440,此地板
对它们不生效;取 560 会在 768 视口撑出屏幕、冻结表头失效。

同时 clamp 负 rectTop:recompute 在 rows 变化与 keep-alive 激活时用当时的
滚动位置测量,表格顶部滚出视口后会算出比视口还高的表体,表头随页面滚走。

补一条走真实路径的默认值测试 —— 原有 3 条把 min 当显式入参传,改默认值
它们一条都不会红。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSGEOF
```

---

### Task 3: sticky-header 表格清单守卫

**Files:**
- Create: `frontend/src/components/__tableHeightInventory.test.ts`

**Interfaces:**
- Consumes: `DETAIL_TABLE_MAX_H`（Task 1 产出，`@/lib/tableLayout`）；Task 1 完成后的清单状态（FIXED 6 / DYNAMIC 10）。
- Produces: 无运行时产物，纯守卫。

- [ ] **Step 1: 写测试**

新建 `frontend/src/components/__tableHeightInventory.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = resolve(__dirname, '..')
const DIRS = ['components', 'views']

function scanVue(pred: (src: string) => boolean): string[] {
  const hit: string[] = []
  for (const dir of DIRS) {
    for (const f of readdirSync(resolve(SRC, dir))) {
      if (!f.endsWith('.vue')) continue
      if (pred(readFileSync(resolve(SRC, dir, f), 'utf-8'))) hit.push(f)
    }
  }
  return hit.sort()
}

// ── 本次(V4.5.11)全量盘点 ───────────────────────────────────────────────────
// 新增或改动任一张 sticky-header 表都会让下面第一条用例变红。这是【故意】的:
// 必须当场回答「这张表在页面的什么位置」,因为两种位置的正解完全不同 ——
//   · 页面顶部(PageHeader + 工具栏之下,rect.top ≈ 250px)
//        → 动态测量测得准,不要传 max-height-px
//   · 长分析页底部(KPI / 图表 / 多卡片之后)
//        → 必须传 :max-height-px="DETAIL_TABLE_MAX_H",否则 rect.top 远大于视口高、
//          算出负数退到兜底地板,表格塌缩成约 10 行(V4.5.11 之前是 4 行)
// 判据与常量见 lib/tableLayout.ts。变红时请把新文件归入下面某一类,不要直接删用例。
const FIXED = [
  'CostDetailView.vue',        // /insight/costdetail 明细表:6 图之后
  'MilestoneDelayedTab.vue',   // /insight/milestone 三表:6 图之后(V4.5.11 修)
  'MilestonePlanTab.vue',
  'MilestoneReminderTab.vue',
  'YitianAnalyticsView.vue',   // 页内 tab 中的中等表,固定 560(处境不同,保持原值)
  'YitianComplianceView.vue',  // 同上
].sort()

const DYNAMIC = [
  'ClosedProjectsView.vue', 'KeyProjectsView.vue', 'OpportunityFollowupView.vue',
  'PayNodesView.vue', 'PayProjectsView.vue', 'PaymentKeyFollowupView.vue',
  'ProjectsView.vue', 'RiskFollowupView.vue', 'TempInstancePanel.vue',
  'YitianDetailView.vue',
].sort()

describe('sticky-header 表格高度清单守卫', () => {
  it('清单逐项吻合;新增 sticky 表必须显式归入固定高度或动态测高一类', () => {
    const all = scanVue((s) => s.includes('sticky-header'))
    const fixed = scanVue((s) => s.includes('sticky-header') && s.includes('max-height-px'))
    const dynamic = all.filter((f) => !fixed.includes(f))

    // 【自证规模】目录读取或匹配一旦失效会返回空数组,让下面两条 toEqual 变成恒真式空跑
    // (本仓踩过:结构守卫解析失配 → 循环空跑 → 恒绿)。先钉死规模,再比内容。
    expect(all.length, '扫到的 sticky-header 表数量异常,先检查扫描路径是否失效').toBe(16)
    expect(fixed.length + dynamic.length).toBe(all.length)

    expect(fixed, '这些表传了固定 max-height —— 新增的请确认它确实在长页面底部').toEqual(FIXED)
    expect(dynamic, '这些表用动态测高 —— 新增的请确认它确实在页面顶部,否则会塌缩').toEqual(DYNAMIC)
  })

  it('useTableMaxHeight 只有 DataTable 与 OpportunitiesView 两个调用方', () => {
    // 第三个调用方 = 又一处绕过 DataTable 的裸 el-table,须显式评审(它拿不到
    // max-height-px 这条逃生口,只能吃动态测量 + 兜底地板)。
    const callers = scanVue((s) => s.includes('useTableMaxHeight('))
    expect(callers).toEqual(['DataTable.vue', 'OpportunitiesView.vue'])
  })
})
```

- [ ] **Step 2: 跑测试确认通过**

```bash
npm --prefix frontend run test:run -- src/components/__tableHeightInventory.test.ts
```

Expected: 2 passed。**若第一条红且报 `expected 16`，说明 Task 1 尚未完成或清单枚举有误 —— 先看实际扫到的列表再改常量数组，不要为了变绿去改 `toBe(16)`。**

- [ ] **Step 3: 反向验证（三次变异，缺一不可）**

```bash
SCRATCH="C:/Users/tjusu/AppData/Local/Temp/claude/C--Users-tjusu-Desktop-cc-work-tools-Payment-Collection/cf8743e9-6428-4fc9-a97e-745efb774141/scratchpad"
mkdir -p "$SCRATCH/bak-t3"
cp frontend/src/views/ProjectsView.vue "$SCRATCH/bak-t3/"
cp frontend/src/components/__tableHeightInventory.test.ts "$SCRATCH/bak-t3/"
ls -l "$SCRATCH/bak-t3/"     # 必须看到两个文件,为空则停下
```

变异 A —— **归类漂移**：给 `ProjectsView.vue:199` 的 DataTable 加 `:max-height-px="640"`（页面顶部表格不该有）。Expected: **1 FAILED**，`fixed` 多出 `ProjectsView.vue`、`dynamic` 少一个。还原：`cp "$SCRATCH/bak-t3/ProjectsView.vue" frontend/src/views/`

变异 B —— **扫描失效**：把测试里的 `const SRC = resolve(__dirname, '..')` 改成 `resolve(__dirname, '../nonexistent-dir')`。Expected: **FAILED** —— 抛 ENOENT 或 `expected 0 to be 16`。**这条专门验证「自证规模断言真的挡得住空跑」**：若把 `expect(all.length).toBe(16)` 注释掉再跑同一个变异，两条 `toEqual` 会因为两边都是空数组而恒绿 —— 请实际跑一遍看到这个恒绿现象，再把断言加回来。还原：`cp "$SCRATCH/bak-t3/__tableHeightInventory.test.ts" frontend/src/components/`

变异 C —— **新增调用方**：临时在 `frontend/src/views/PayNodesView.vue` 的 `<script setup>` 里加一行注释 `// useTableMaxHeight(` 。Expected: **1 FAILED**（第二条用例，`callers` 多出 `PayNodesView.vue`）。还原：手工删掉该行注释，或先 `cp` 备份再还原。

三次变异后重跑 Step 2 的命令，确认回到 2 passed。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/__tableHeightInventory.test.ts
git commit -F - <<'MSGEOF'
test(table): 清单守卫,新增 sticky-header 表必须显式归类

把全仓 16 张 sticky-header 表按「固定高度 6 / 动态测高 10」逐项钉住。
新增或改动任一张都会变红,逼作者回答「这表在页面顶部还是长页面底部」——
这正是本次三张里程碑表塌缩、且此前 CostDetail 已踩过一次的那个判断。

带自证规模断言(扫到的总数必须是 16):本仓踩过结构守卫解析失配 → 循环
空跑 → 恒绿的假绿。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSGEOF
```

---

### Task 4: 版本号 + PROGRESS 收尾

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`（`:7` 当前版本段落、`:9` 上一版本标记、`:380` 之后插入 backlog L-64）

**Interfaces:**
- Consumes: Task 1~3 的全部成果。
- Produces: 无代码产物。

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：

```ts
export const APP_VERSION = 'V4.5.11'
export const RELEASE_DATE = '2026-07-31'
```

- [ ] **Step 2: PROGRESS.md 版本段落**

把 `:7` 现有的 `- 当前版本：**V4.5.10**（...）` 整段的开头 `- 当前版本：` 改为 `- 上一版本：`，然后在其**上方**（原 `:7` 位置）插入新的当前版本段落：

```markdown
- 当前版本：**V4.5.11**（Z 级 · **`/insight/milestone` 三张明细表可见高度修复 + 全站 sticky 表清单守卫**）——用户报障：延期项目清单 / 到期提醒 / 在建里程碑计划三表各 >100 条，**却只显示 3~4 行**，全靠表内下拉。**纯前端，不动 `.py`、不进数据管线、不需要点「更新数据」、无新增 pageKey**；升级只需整个替换 `dist`。**★ 根因** `DataTable` 的 `sticky-header` 按「表格在视口中的位置」动态测高（`useTableMaxHeight`：`max(min, 视口高 − rect.top − 24)`），而 `recompute()` 只在挂载 / resize / keep-alive 激活 / `rows` 变化时跑。三张表位于 KPI + 6 图之后约 1300px 处，挂载那一刻 `rect.top` 远大于视口高 → 算出负数 → 退到兜底地板 `min: 200` = 表头 41 + 约 4 行。**★ 这是第三次踩同一个坑**：`CostDetailView`（640）与 Yitian 两页（560）早已用固定值绕过，`CostDetailView.test.ts:84` 的用例名逐字写着「固定值绕过在长页面底部按位置动态测高塌缩成~1行」，三个里程碑 tab 是唯一漏网的。**★ 修法两根杠杆分工**：①**显式固定值** —— 新增 `lib/tableLayout.ts` 的 `DETAIL_TABLE_MAX_H = 640`（≈15 行），三表 + CostDetail 共四个调用点收归一处引用；②**兜底地板 200→440**（≈10 行）—— 地板的定位是「测不准时最坏也要有 10 行」，**不是估算器**；取 440 而非 560，是因为现有页面顶部表格（`rect.top`≈250）在 1080p / 768 视口下算出 676 / 494 **都大于 440，故此地板对它们不生效**，而 560 会在 768 视口撑出屏幕、令冻结表头失效。**★ 顺修一处同源潜在缺陷**：`computeMaxHeight` 内 clamp 负 `rectTop` —— `recompute` 用的是当时的滚动位置，表格顶部滚出视口后 `视口高 − 负数` 会算出比视口还高的表体，表头随页面滚走、冻结表头当场失效；`useViewScrollMemory` 从下钻页返回恢复滚动 + `onActivated` 重算，这条路径是可达的。clamp 只会**减小**结果，对现有表单向安全。**★ 通盘扫描结论**：全仓 16 张 `sticky-header` 表逐个核过，除报障这三张外，其余 13 张要么已有固定值（3 张），要么紧跟 `PageHeader` + 工具栏之下（10 张，`rect.top`≈250，测得准），**无第四处**。新增 `components/__tableHeightInventory.test.ts` 把「固定 6 / 动态 10」与「`useTableMaxHeight` 只有 2 个调用方」逐项钉住并带**自证规模断言**（扫到的总数必须是 16，防解析失配空跑恒绿），今后新增任一 sticky 表都会变红、逼作者回答「这表在页面顶部还是底部」。**★ 假绿修补**：原有 3 条 `computeMaxHeight` 单测把 `min` 当**显式入参**传（`computeMaxHeight(800, 900, 24, 200)`），改默认值它们一条都不会红 —— 新增一条走真实路径的用例（不传 `opts.min`，打桩 `getBoundingClientRect` 返回 `top: 10000`，断言 440）才真正钉住默认值。**★ 反向验证 7 处变异逐条实测**：撤 tab 的 prop / 改常量 640→700 / 默认值改回 200 / 撤 clamp / 给页面顶部表加固定值 / 扫描路径改坏（并实测注释掉自证规模断言后两条 `toEqual` 确实恒绿）/ 新增第三个 `useTableMaxHeight` 调用方。**未走 SDD、未用 Workflow**（6 文件、无并行车道，单人直做 + 逐条反向验证更快）。**已发现未修见 backlog L-64（弹窗内长表格无高度约束）。**
```

- [ ] **Step 3: PROGRESS.md 新增 backlog L-64**

在 `## Backlog（按优先级，...）` 小节内、现有 `- [ ] **L-63（...` 那一条的**上方**插入：

```markdown
- [ ] **L-64（V4.5.11 通盘扫描时发现，未修，非本期引入）下钻弹窗内的长表格没有任何高度约束** `components/Modal.vue` 用的 `el-dialog` 未设 `max-height`，6 个下钻弹窗里只有 `BoardDrilldownModal` 切了 `.slice(0, 200)`，其余 5 个（`MilestoneDrillModal` / `MilestoneStatusModal` / `InsightDrillModal` / `RiskDrillModal` / `DataDrillModal`）**全量渲染 `props.rows`**。点开一个 200 条的下钻 → 对话框被撑到几千像素高，滚的是遮罩层而不是表体，表头也留不住。**方向与 V4.5.11 相反**（那次是表太矮，这次是表太高），且需要先定一条「弹窗内表格高度」的统一口径、动 6 个组件，故当时未顺手修。**改法**：给 `Modal.vue` 加可选 `bodyMaxHeight`，或在 5 个下钻弹窗统一传 `:max-height-px`（`DETAIL_TABLE_MAX_H` 已可复用）；一并决定要不要保留 `BoardDrilldownModal` 那个 200 条的静默截断（目前**无任何提示**，用户看不出被截了）。
```

- [ ] **Step 4: 跑完整验证**

```bash
bash verify.sh
```

Expected: `[PASS] verify.sh 全部通过 ✓`

若出现 `tests/test_server_budget.py::test_estimates_未登录401` 的 `ConnectionAborted` —— 这是 Windows 下线程内 HTTP server 的已知偶发抖动（V4.5.10 遇到过）。判据：**单独跑该文件 + 全量重跑各一次都绿**才可判为 flake；否则按真失败处理。

```bash
python -m pytest tests/test_server_budget.py -q
bash verify.sh
```

- [ ] **Step 5: 核对暂存内容（public 仓安全红线）**

```bash
git status --porcelain -uall data/     # 必须为空,非空则停下逐一确认
git status --porcelain
git add frontend/src/version.ts PROGRESS.md
git diff --cached --stat
```

Expected: `data/` 那条命令**无输出**；`git status` 里除本次改动外只有既有未跟踪文件 `avatar-drafts/`、`wangxutong.png`、`wxt.png` —— **绝不 `git add -A` / `git add .`，绝不碰这三项**。

- [ ] **Step 6: Commit 并 push**

```bash
git commit -F - <<'MSGEOF'
chore(release): V4.5.11;PROGRESS 记本期结论与 backlog L-64

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSGEOF
git push origin master
```

- [ ] **Step 7: 目验（唯一无法自动化的一步）**

```bash
python server.py
# 另开一个终端
npm --prefix frontend run dev
```

打开 `http://localhost:5173/insight/milestone`，滚到页面底部：

1. 「延期项目清单」tab —— 表格应一次显示约 **15 行**（此前 3~4 行），表内可继续下拉，表头冻结不动
2. 切到「到期提醒」tab —— 同样约 15 行
3. 切到「在建里程碑计划」tab —— 同样约 15 行，且横向滚动仍正常（该表有大量节点列）
4. 浏览器控制台 **无报错**
5. 顺手回归一张动态测高的表：打开 `/projects`，确认表格高度仍是「铺满剩余视口」的观感，没有变矮也没有超出屏幕底部

**注意**：`npm run dev` 起的是 5173 端口的开发服务，它代理 `/api` 与 `/data` 到 8080，两个都要起。目验完记得 `python server.py --stop`。

---

## Self-Review

**1. 共识覆盖** —— grill 纪要七项决定逐条对照：

| 决定 | 落在 |
|---|---|
| 修法取 C（固定值 + 抬地板） | Task 1 + Task 2 |
| 固定值 640、抽常量、CostDetail 改引用、Yitian 560 不动 | Task 1 Step 3/7/9；Global Constraints 第 5 条 |
| 兜底 min 200→440 | Task 2 Step 3 |
| clamp 负 `rectTop`、不加 scroll 监听 | Task 2 Step 3（实现里只改纯函数，未碰监听） |
| 守卫取 B（最小闭环 + 清单守卫） | Task 1 Step 1/5、Task 2 Step 1、Task 3 |
| 弹窗长表只记 backlog，②③ 不动 | Task 4 Step 3（L-64） |
| V4.5.11、做到 push 为止、不派 Workflow | Task 4；Global Constraints 第 3 条 |

**2. 占位符扫描** —— 无 TBD / TODO / 「类似 Task N」；每个代码步骤都给了可直接粘贴的完整内容；每个测试步骤都给了确切的 Expected。

**3. 类型/命名一致性** —— 全篇统一 `DETAIL_TABLE_MAX_H`（Task 1 定义 → Task 1 三个 tab 与 CostDetail 使用 → Task 3 注释引用 → Task 4 backlog 引用）、`DEFAULT_MIN_HEIGHT`（Task 2 内部私有，不导出，故无跨任务引用）、`computeMaxHeight(rectTop, innerHeight, bottomGap, min)` 四参签名前后一致。`__tableHeightInventory.test.ts` 里 `scanVue` 的两次调用都返回已排序数组，与 `FIXED`/`DYNAMIC` 的 `.sort()` 对齐。

**4. 顺序依赖** —— Task 3 的 `toBe(16)` 与 FIXED/DYNAMIC 清单反映的是 **Task 1 完成后**的状态，故 Task 3 必须在 Task 1 之后；Task 2 与 Task 1 相互独立，但 Task 2 Step 6 的全量测试会连带跑到 Task 1 的新用例，按 1→2→3→4 顺序执行最顺。
