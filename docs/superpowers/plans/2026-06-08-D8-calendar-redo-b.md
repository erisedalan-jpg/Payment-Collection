# D8 回款日历 B（议程列表视图切换） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 回款日历加「网格 / 议程列表」视图切换;议程列表=按日期升序平铺的当月/次月回款节点（按日分组、每日小计、点项目下钻 D2 详情），与网格共享同一筛选/数据。

**Architecture:** 复用 D7 的 `lib/calendar`（`calListNodes` 已按日期升序取双月节点）+ `getNodeRemaining`。新增纯函数 `calAgendaGroups(nodes)` 按日期分组（升序 + 每日待回款小计）。新增 `CalAgenda.vue`（议程列表，复用 `CalNodeTable` 行点击下钻）。`CalendarView` 加 `view` 切换（`SegToggle`），网格态渲染 D7 的 CalGrid + CalDayDetail，议程态渲染 CalAgenda。计算口径忠实，不改算法。

**Tech Stack:** Vue3 `<script setup lang="ts">` + Pinia + Element Plus + Vitest。

---

## 背景与范围

Phase D spec §4.4：回款日历 = A(D7) + B(本计划) + C(D9)。本计划只做 **B**：视图切换 + 议程列表。年度热力条(C)留 D9。

**已就绪依赖：**
- `lib/calendar`：`calListNodes(naguanNodes, f, {year,month,selectedDate})`（selectedDate 空→双月范围，按 planDate 升序）、`getNodeRemaining`。
- `components/CalNodeTable.vue`（D7）：token 化 + 行 `v-activate` 点击 → `projectDetail.open`。
- `components/SegToggle.vue`（D3）：`modelValue/options`。
- `components/CalGrid.vue`/`CalDayDetail.vue`（D7，网格态）。
- `views/CalendarView.vue`（D7 重写版，已 token 化）。
- 测试范式：`setActivePinia(createPinia())` + `useDataStore().data` 种子;CalendarView.test 全量挂载 + ElementPlus。

**本计划新建/改：**
- 改 `lib/calendar.ts`：加 `CalAgendaGroup`/`calAgendaGroups`（+ 测试追加）。
- 新建 `components/CalAgenda.vue`（+ 测试）。
- 改 `views/CalendarView.vue`：加视图切换 + 议程态（+ 测试追加）。

**YAGNI 边界：** 议程列表为"按日分组的平铺列表"（复用 CalNodeTable），不做虚拟滚动/无限范围;议程数据源用 calListNodes 的双月范围（与网格同源，selectedDate 强制空，议程不随网格选日变化）。年度热力条 C 留 D9。

## 约定（CLAUDE.md）

- 简体中文;**无 emoji**。CSS 用主题 token;尺寸优先 `var(--fs-*)`。
- 下钻入口非语义可点击元素用 `v-activate`（CalNodeTable 已具备）。
- 计算口径忠实复用 lib/calendar/getNodeRemaining，不改算法;新增纯函数有 Vitest。
- 提交信息结尾：
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: lib/calendar — calAgendaGroups 按日期分组

**Files:**
- Modify: `frontend/src/lib/calendar.ts`（追加 `CalAgendaGroup`/`calAgendaGroups`）
- Test: `frontend/src/lib/calendar.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试**

在 `frontend/src/lib/calendar.test.ts` 末尾追加（`calAgendaGroups` 加入顶部 import 或新增 import 行）：

```ts
import { calAgendaGroups } from './calendar'

describe('calAgendaGroups', () => {
  it('按日期升序分组 + 每日待回款小计', () => {
    const g = calAgendaGroups([
      { planDate: '2026-07-05', expectedPayment: 100000, actualPayment: 20000 },
      { planDate: '2026-06-10', expectedPayment: 100000, actualPayment: 0 },
      { planDate: '2026-06-10', expectedPayment: 50000, actualPayment: 50000 },
    ] as any)
    expect(g.map((x) => x.date)).toEqual(['2026-06-10', '2026-07-05'])
    expect(g[0].nodes).toHaveLength(2)
    expect(g[0].subRemaining).toBe(100000) // (100000-0)+(50000-50000)
    expect(g[1].subRemaining).toBe(80000)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/calendar.test.ts`
Expected: FAIL（`calAgendaGroups` 不存在）。

- [ ] **Step 3: 实现**

在 `frontend/src/lib/calendar.ts` 末尾追加（`getNodeRemaining` 已在文件顶部 import）：

```ts
export interface CalAgendaGroup {
  date: string
  nodes: RawNode[]
  subRemaining: number
}
/** 议程列表：按 planDate(到日) 分组、日期升序，每组待回款小计(元)。输入应为已筛选的节点。 */
export function calAgendaGroups(nodes: RawNode[]): CalAgendaGroup[] {
  const map: Record<string, RawNode[]> = {}
  for (const raw of nodes) {
    const d = String((raw as N).planDate || '').slice(0, 10)
    if (!d) continue
    ;(map[d] ||= []).push(raw)
  }
  return Object.keys(map)
    .sort()
    .map((d) => ({
      date: d,
      nodes: map[d],
      subRemaining: map[d].reduce((s, n) => s + getNodeRemaining(n as N), 0),
    }))
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/calendar.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/calendar.ts frontend/src/lib/calendar.test.ts
git commit -m "feat(D8): lib/calendar calAgendaGroups 按日期分组

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: CalAgenda — 议程列表

**Files:**
- Create: `frontend/src/components/CalAgenda.vue`
- Test: `frontend/src/components/CalAgenda.test.ts`

按日分组平铺，每日 header（日期 + 节点数 + 待回款小计）+ 复用 `CalNodeTable`（行点击下钻 D2 详情）。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/CalAgenda.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalAgenda from './CalAgenda.vue'
import type { CalAgendaGroup } from '@/lib/calendar'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

const GROUPS: CalAgendaGroup[] = [
  { date: '2026-06-10', nodes: [{ projectId: 'P1', projectName: '甲', nodeStatus: '延期' }] as any, subRemaining: 100000 },
]

describe('CalAgenda', () => {
  it('渲染日期分组与小计', () => {
    const w = mount(CalAgenda, { props: { groups: GROUPS } })
    expect(w.text()).toContain('2026-06-10')
    expect(w.text()).toContain('待回款')
    expect(w.text()).toContain('甲')
  })

  it('空分组显示空态', () => {
    const w = mount(CalAgenda, { props: { groups: [] } })
    expect(w.text()).toContain('暂无回款节点')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/CalAgenda.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/CalAgenda.vue`:

```vue
<script setup lang="ts">
import type { CalAgendaGroup } from '@/lib/calendar'
import { fmtWan } from '@/lib/format'
import CalNodeTable from './CalNodeTable.vue'

defineProps<{ groups: CalAgendaGroup[] }>()
</script>

<template>
  <div class="cag">
    <div v-if="!groups.length" class="cag-empty">暂无回款节点</div>
    <div v-for="g in groups" :key="g.date" class="cag-day">
      <div class="cag-head">
        <span class="cag-date">{{ g.date }}</span>
        <span class="cag-sub">{{ g.nodes.length }}个节点，待回款 {{ fmtWan(g.subRemaining) }}万</span>
      </div>
      <CalNodeTable :nodes="g.nodes as Record<string, any>[]" />
    </div>
  </div>
</template>

<style scoped>
.cag { margin-top: 6px; }
.cag-empty { color: var(--mut); text-align: center; padding: 20px; }
.cag-day { margin-bottom: 14px; }
.cag-head { display: flex; align-items: center; gap: 10px; font-weight: 700; padding: 8px 12px; border-left: 3px solid var(--accent); background: var(--card2); font-size: var(--fs-2); color: var(--txt); }
.cag-sub { color: var(--sub); font-size: var(--fs-1); font-weight: 400; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/CalAgenda.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CalAgenda.vue frontend/src/components/CalAgenda.test.ts
git commit -m "feat(D8): CalAgenda 议程列表（按日分组 + 项目下钻）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CalendarView — 网格/议程视图切换

**Files:**
- Modify: `frontend/src/views/CalendarView.vue`
- Test: `frontend/src/views/CalendarView.test.ts`（追加用例）

加 `view`（grid/agenda）SegToggle;网格态渲染 CalGrid + CalDayDetail（D7），议程态渲染 CalAgenda。议程数据源用 calListNodes 双月范围（selectedDate 强制空）。

- [ ] **Step 1: 改 `<script setup>`**

在 import 区补充：

```ts
import { ref } from 'vue'
import { calAgendaGroups } from '@/lib/calendar'
import SegToggle from '@/components/SegToggle.vue'
import CalAgenda from '@/components/CalAgenda.vue'
```

（即在原有 `import { computed, onMounted, reactive } from 'vue'` 基础上补 `ref`;`@/lib/calendar` 解构补 `calAgendaGroups`;新增 SegToggle/CalAgenda。CalGrid/CalDayDetail/CalNodeTable 等保留。）

在 `const listTitle = computed(...)` 之后追加：

```ts
const view = ref('grid')
const VIEW_OPTS = [
  { value: 'grid', label: '网格' },
  { value: 'agenda', label: '议程列表' },
]
const agendaNodes = computed(() =>
  calListNodes(naguanNodes.value as any, calFilters.value, {
    year: state.year,
    month: state.month,
    selectedDate: '',
  }),
)
const agendaGroups = computed(() => calAgendaGroups(agendaNodes.value))
```

- [ ] **Step 2: 改 `<template>`**

在筛选条 `</div>`（`.cal-filterbar` 结束）之后、`<CalGrid ...>` 之前，插入视图切换：

```vue
      <div class="cal-viewbar">
        <SegToggle v-model="view" :options="VIEW_OPTS" />
      </div>
```

把现有的 `<CalGrid .../>` 与紧随的 `<CalDayDetail .../>` 用 `<template v-if="view === 'grid'">` 包裹，并加议程态分支。即把：

```vue
    <CalGrid ... @select="onSelectDay" />

    <CalDayDetail :title="listTitle" :groups="listGroups" />
```

替换为：

```vue
    <template v-if="view === 'grid'">
      <CalGrid
        :year="state.year"
        :month="state.month"
        :date-data="gridDateData"
        :selected-date="state.selectedDate"
        @select="onSelectDay"
      />
      <CalDayDetail :title="listTitle" :groups="listGroups" />
    </template>
    <template v-else>
      <CalAgenda :groups="agendaGroups" />
    </template>
```

在 `<style scoped>` 追加：

```css
.cal-viewbar { margin-bottom: 12px; }
```

- [ ] **Step 3: 追加测试**

在 `frontend/src/views/CalendarView.test.ts` 的 `describe('CalendarView')` 内追加（沿用现有 seed/ElementPlus 全量挂载范式）：

```ts
  it('切到议程列表视图渲染 CalAgenda', async () => {
    seed()
    const w = mount(CalendarView, { global: { plugins: [ElementPlus] } })
    await w.get('[data-test="seg-agenda"]').trigger('click')
    expect(w.findComponent({ name: 'CalAgenda' }).exists()).toBe(true)
    expect(w.findComponent({ name: 'CalGrid' }).exists()).toBe(false)
  })
```

> 若现有测试文件未导出 `seed`（为局部函数）即直接复用;若 `findComponent({ name: 'CalAgenda' })` 名称不匹配，改用 `w.find('.cag').exists()` 断言议程根元素存在、`w.find('.cal-grid-row').exists()` 为 false。

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/views/CalendarView.test.ts`
Expected: PASS（原有 + 新增）。

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 通过。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/CalendarView.vue frontend/src/views/CalendarView.test.ts
git commit -m "feat(D8): CalendarView 网格/议程列表视图切换

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

- 顶部「最近更新」改为 2026-06-08（Plan D8 回款日历 B 完成）。
- Phase D backlog 把 `- [ ] **D8** …` 改为 `- [x] **D8** …`，简述：lib/calendar 增 calAgendaGroups;新增 CalAgenda(按日分组议程 + 项目下钻);CalendarView 加网格/议程列表视图切换(SegToggle)。年度热力条(C)留 D9。
- 「会话交接备注」新增 D8 段：分支、产物、YAGNI(C 留 D9)、下一步 D9。

- [ ] **Step 3: Commit**

```bash
git add PROGRESS.md
git commit -m "docs(D8): PROGRESS 记录回款日历 B 完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- /calendar 可切「网格 / 议程列表」;议程列表按日期升序平铺、每日小计、点项目下钻 D2 详情;与网格共享筛选/纳管/年视角。
- `calAgendaGroups` 纯函数有 Vitest;计算复用 lib/calendar 未改算法。
- 年度热力条(C)按既定留 D9。
- `bash verify.sh` 全绿;`PROGRESS.md` 已更新。
```
