# D9 回款日历 C（年度热力条 + 月度下钻联动） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 回款日历加年度热力条：当前年份 12 个月，每月按待回款金额着色（强度映射），点月份聚焦到该月（联动网格/议程）。收口回款日历三件套（A 网格 D7 / B 议程 D8 / C 热力条本计划）。

**Architecture:** 复用 D7 的 `getNodeRemaining` 与日历筛选管道。新增纯函数 `calYearHeat(nodes, year)→12 月 {month,remaining,count}`。新增 `CalYearHeat.vue`（12 月条，强度按待回款金额 `color-mix(accent)` tint，点月份 emit select、当前月高亮）。`CalendarView` 抽出共享的 `gridNodes`（网格/热力条同源），渲染 CalYearHeat 于日历区顶部，点月份 → 设 `state.month` 聚焦。计算口径忠实，不改算法。

**Tech Stack:** Vue3 `<script setup lang="ts">` + Pinia + Vitest。

---

## 背景与范围

Phase D spec §4.4：回款日历 = A(D7) + B(D8) + C(本计划)。本计划做 **C**：年度热力条 + 月度下钻联动。完成后 Phase D 仅余 D10（业务分析三档整合）。

**已就绪依赖：**
- `lib/calendar`：`calExcludePaid`/`applyCalFilters`/`CalFilters`、`getNodeRemaining`（间接，经 calendar.ts 已 import）。
- `views/CalendarView.vue`（D8 版）：含 `naguanNodes`/`calFilters`/`gridDateData`/视图切换/网格/议程/临期;`state.year`/`state.month`/`state.selectedDate` 导航状态。
- `lib/format.fmtWan`。
- 测试范式：`setActivePinia(createPinia())` + 种子;CalendarView.test 全量挂载 + ElementPlus。

**本计划新建/改：**
- 改 `lib/calendar.ts`：加 `CalYearHeatCell`/`calYearHeat`（+ 测试追加）。
- 新建 `components/CalYearHeat.vue`（+ 测试）。
- 改 `views/CalendarView.vue`：抽 `gridNodes` 共享、加 `yearHeat`、渲染 CalYearHeat + 点月聚焦（+ 测试追加）。

**YAGNI 边界：** 热力条只做当前 `state.year` 的 12 月（年份切换沿用既有年导航）;颜色强度=待回款金额相对该年最大值的线性 tint（单色 accent），不做多色分级。

## 约定（CLAUDE.md）

- 简体中文;**无 emoji**。CSS 用主题 token;状态/强度色用 `color-mix(var(--accent) X%, transparent)`（随主题自适应）。尺寸优先 `var(--fs-*)`。
- 下钻入口非语义可点击元素用 `v-activate`。
- 计算口径忠实复用 getNodeRemaining，不改算法;新增纯函数有 Vitest。
- 提交信息结尾：
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: lib/calendar — calYearHeat 年度 12 月待回款

**Files:**
- Modify: `frontend/src/lib/calendar.ts`（追加 `CalYearHeatCell`/`calYearHeat`）
- Test: `frontend/src/lib/calendar.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试**

在 `frontend/src/lib/calendar.test.ts` 末尾追加（`calYearHeat` 加入顶部 import）：

```ts
import { calYearHeat } from './calendar'

describe('calYearHeat', () => {
  it('按月汇总指定年的待回款金额与笔数', () => {
    const cells = calYearHeat([
      { planDate: '2026-06-10', expectedPayment: 100000, actualPayment: 0 },
      { planDate: '2026-06-20', expectedPayment: 50000, actualPayment: 20000 },
      { planDate: '2026-08-01', expectedPayment: 80000, actualPayment: 0 },
      { planDate: '2025-06-01', expectedPayment: 999999, actualPayment: 0 },
    ] as any, 2026)
    expect(cells).toHaveLength(12)
    expect(cells[5].month).toBe(5) // 6月
    expect(cells[5].remaining).toBe(130000) // (100000)+(50000-20000)
    expect(cells[5].count).toBe(2)
    expect(cells[7].remaining).toBe(80000) // 8月
    expect(cells[0].remaining).toBe(0) // 1月无
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/calendar.test.ts`
Expected: FAIL（`calYearHeat` 不存在）。

- [ ] **Step 3: 实现**

在 `frontend/src/lib/calendar.ts` 末尾追加（`getNodeRemaining`、类型 `N` 已在文件内可用）：

```ts
export interface CalYearHeatCell {
  month: number
  remaining: number
  count: number
}
/** 年度热力：指定年的 12 个月各自待回款金额合计(元)与节点数。输入应为已筛选的节点。 */
export function calYearHeat(nodes: RawNode[], year: number): CalYearHeatCell[] {
  const out: CalYearHeatCell[] = Array.from({ length: 12 }, (_, m) => ({ month: m, remaining: 0, count: 0 }))
  for (const raw of nodes) {
    const n = raw as N
    const pd = String(n.planDate || '')
    if (pd.length < 7) continue
    if (parseInt(pd.slice(0, 4)) !== year) continue
    const m = parseInt(pd.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    out[m].remaining += getNodeRemaining(n)
    out[m].count++
  }
  return out
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/calendar.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/calendar.ts frontend/src/lib/calendar.test.ts
git commit -m "feat(D9): lib/calendar calYearHeat 年度12月待回款汇总

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: CalYearHeat — 年度热力条

**Files:**
- Create: `frontend/src/components/CalYearHeat.vue`
- Test: `frontend/src/components/CalYearHeat.test.ts`

12 月横条，按待回款金额强度 tint，当前月高亮，有金额月 `v-activate` 可点 emit select(month)。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/CalYearHeat.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalYearHeat from './CalYearHeat.vue'
import type { CalYearHeatCell } from '@/lib/calendar'

const CELLS: CalYearHeatCell[] = Array.from({ length: 12 }, (_, m) => ({ month: m, remaining: m === 5 ? 130000 : 0, count: m === 5 ? 2 : 0 }))

describe('CalYearHeat', () => {
  it('渲染 12 个月格', () => {
    const w = mount(CalYearHeat, { props: { cells: CELLS, activeMonth: 5 } })
    expect(w.findAll('.cyh-cell').length).toBe(12)
    expect(w.text()).toContain('6月')
    expect(w.find('.cyh-cell.active').exists()).toBe(true)
  })

  it('点有金额的月 emit select', async () => {
    const w = mount(CalYearHeat, { props: { cells: CELLS, activeMonth: 0 } })
    await w.findAll('.cyh-cell')[5].trigger('click')
    expect(w.emitted('select')?.[0]?.[0]).toBe(5)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/CalYearHeat.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/CalYearHeat.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { CalYearHeatCell } from '@/lib/calendar'
import { fmtWan } from '@/lib/format'

const props = defineProps<{ cells: CalYearHeatCell[]; activeMonth: number }>()
const emit = defineEmits<{ select: [number] }>()

const max = computed(() => Math.max(1, ...props.cells.map((c) => c.remaining)))
function bg(rem: number): string {
  if (rem <= 0) return 'transparent'
  const p = Math.round(10 + (rem / max.value) * 60)
  return `color-mix(in srgb, var(--accent) ${p}%, transparent)`
}
</script>

<template>
  <div class="cyh">
    <div class="cyh-title">年度待回款热力</div>
    <div class="cyh-row">
      <div
        v-for="c in cells"
        :key="c.month"
        class="cyh-cell"
        :class="{ active: c.month === activeMonth, hot: c.remaining > 0 }"
        :style="{ background: bg(c.remaining) }"
        :title="`${c.month + 1}月 待回款 ${fmtWan(c.remaining)}万 · ${c.count}笔`"
        v-activate="c.remaining > 0"
        @click="c.remaining > 0 && emit('select', c.month)"
      >
        <span class="cyh-m">{{ c.month + 1 }}月</span>
        <span class="cyh-amt">{{ fmtWan(c.remaining) }}万</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cyh { margin-bottom: 14px; }
.cyh-title { font-size: var(--fs-2); font-weight: 700; color: var(--txt); margin-bottom: 6px; }
.cyh-row { display: grid; grid-template-columns: repeat(12, 1fr); gap: 4px; }
.cyh-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 2px; border: 1px solid var(--line); border-radius: 8px; color: var(--txt); }
.cyh-cell.hot { cursor: pointer; }
.cyh-cell.hot:hover { border-color: var(--accent); }
.cyh-cell.active { box-shadow: 0 0 0 2px var(--accent) inset; }
.cyh-m { font-size: var(--fs-1); color: var(--sub); }
.cyh-amt { font-size: var(--fs-1); font-weight: 700; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/CalYearHeat.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CalYearHeat.vue frontend/src/components/CalYearHeat.test.ts
git commit -m "feat(D9): CalYearHeat 年度热力条（强度 tint + 点月聚焦）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CalendarView — 接入热力条 + 月度下钻联动

**Files:**
- Modify: `frontend/src/views/CalendarView.vue`
- Test: `frontend/src/views/CalendarView.test.ts`（追加用例）

抽出共享 `gridNodes`（网格/热力条同源），加 `yearHeat`，渲染 CalYearHeat，点月份 → 聚焦该月。

- [ ] **Step 1: 改 `<script setup>`**

在 import 区补充：

```ts
import { calYearHeat } from '@/lib/calendar'
import CalYearHeat from '@/components/CalYearHeat.vue'
```

（`@/lib/calendar` 解构补 `calYearHeat`;新增 CalYearHeat 组件 import。）

把现有 `gridDateData` 的计算改为先抽出 `gridNodes` 再派生，并加 `yearHeat`。即把：

```ts
const gridDateData = computed(() =>
  calDateData(
    applyCalFilters(
      calExcludePaid(naguanNodes.value.filter((n) => n.isPaymentRelated && n.planDate) as any),
      calFilters.value,
    ),
  ),
)
```

替换为：

```ts
const gridNodes = computed(() =>
  applyCalFilters(
    calExcludePaid(naguanNodes.value.filter((n) => n.isPaymentRelated && n.planDate) as any),
    calFilters.value,
  ),
)
const gridDateData = computed(() => calDateData(gridNodes.value))
const yearHeat = computed(() => calYearHeat(gridNodes.value as any, state.year))
```

在 `function onSelectDay(...)` 附近追加：

```ts
function onSelectMonth(m: number) {
  state.month = m
  state.selectedDate = ''
}
```

- [ ] **Step 2: 改 `<template>`**

在筛选条 `.cal-filterbar` 的 `</div>` 之后、`.cal-viewbar` 之前，插入热力条：

```vue
    <CalYearHeat :cells="yearHeat" :active-month="state.month" @select="onSelectMonth" />
```

- [ ] **Step 3: 追加测试**

在 `frontend/src/views/CalendarView.test.ts` 的 `describe` 内追加：

```ts
  it('点击年度热力条某月聚焦该月', async () => {
    seed()
    const w = mount(CalendarView, { global: { plugins: [ElementPlus] } })
    expect(w.find('.cyh').exists()).toBe(true)
    // seed 数据在 2026-06，6月(index5)有金额可点
    await w.findAll('.cyh-cell')[5].trigger('click')
    expect(w.findComponent({ name: 'CalGrid' }).props('month')).toBe(5)
  })
```

> 若 `findComponent({ name: 'CalGrid' })` 名称不匹配，改为断言 `.cyh-cell.active` 落在第 6 格（`w.findAll('.cyh-cell')[5].classes()` 含 `active`）。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/views/CalendarView.test.ts`
Expected: PASS（原有 + 新增）。

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/CalendarView.vue frontend/src/views/CalendarView.test.ts
git commit -m "feat(D9): CalendarView 接入年度热力条 + 点月聚焦联动

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 全量验证 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`。

- [ ] **Step 2: 更新 PROGRESS.md**

- 顶部「最近更新」改为 2026-06-08（Plan D9 回款日历 C 完成;回款日历三件套收口）。
- Phase D backlog 把 `- [ ] **D9** …` 改为 `- [x] **D9** …`，简述：lib/calendar 增 calYearHeat;新增 CalYearHeat(12月热力条，强度 tint，点月聚焦);CalendarView 抽 gridNodes 共享 + 接入热力条 + 月度下钻联动。回款日历 A/B/C 三件套完成。
- 「会话交接备注」新增 D9 段：分支、产物、回款日历三件套收口、下一步 D10（业务分析三档整合，Phase D 收尾）。

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs(D9): PROGRESS 记录回款日历 C 完成（三件套收口）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- /calendar 顶部有年度热力条：当前年 12 月按待回款金额着色，点有金额月聚焦到该月（网格/议程随之切月），当前月高亮;热力条与网格同源同筛选。
- `calYearHeat` 纯函数有 Vitest;计算复用 getNodeRemaining 未改算法。
- 回款日历 A(网格)/B(议程)/C(热力条) 三件套完成。
- `bash verify.sh` 全绿;`PROGRESS.md` 已更新。
```
