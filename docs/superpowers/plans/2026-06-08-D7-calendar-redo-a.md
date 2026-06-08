# D7 回款日历重做 A（富日格 + 选中日明细 + 主题/字号） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 回款日历重做的 A 部分：网格升级为富日格（日号 + 笔数 + 待回款金额 + 状态点），新增"选中日明细"组件（点项目开 D2 详情面板），并把整页 token 化（补上一直延后的**日历暗色**）+ 字号放大。视图切换(议程列表 B)与年度热力条(C)分别留 D8/D9。

**Architecture:** 复用 `lib/calendar` 计算层（月网格/日数据/列表分组/临期/仪表/三筛选已忠实实现），仅小幅扩展：每日新增 待回款金额合计（富日格用）。组件：`CalGrid` 重写为富日格（token + v-activate 选中）、`CalNodeTable` 重写为 token + 行点击→`projectDetail.open`、新增 `CalDayDetail`（选中日/当月节点按状态分组 + 复用 CalNodeTable）、`CalendarView` 重写（仪表卡/导航/筛选/临期全 token 化 + 字号放大 + 接入新组件）。计算口径忠实，不改金额/状态算法。

**Tech Stack:** Vue3 `<script setup lang="ts">` + Pinia + Element Plus(el-select/el-button) + Vitest。

---

## 背景与范围

Phase D spec 决策 8 + §4.4：回款日历重做 = A+C+B 三合一。本计划只做 **A**：富日格 + 选中日明细 + 主题/字号。
- B（议程列表视图切换 `CalAgenda` + 网格/列表 tab）→ D8。
- C（年度热力条 `CalYearHeat`）→ D9。
- **日历暗色**：D2.5 审计时延后至此，本计划随重写一并 token 化。

**已就绪依赖（`lib/calendar.ts`，全部复用）：**
- `calFilterOptions`/`applyCalFilters`/`CalFilters`、`calDashboardStats(filteredNodes,f,now)→CalDashboard`、`calDateData(nodes)→Record<date,CalDayData>`、`calMonthGrid(year,month,dateData,today)→CalCell[]`、`calListNodes`/`calListGroups`、`calUpcoming`、`calExcludePaid`、`calDayTooltipText`。
- `CalDayData`{total,delayed,onTime,advance,canAdvance,reachedCondition,fullPaid,pending}（本计划新增 `remaining`）。`CalCell`{day,dateStr,otherMonth,isToday,isWeekend,statusClass,count}（新增 `remaining`）。
- `lib/riskGroups.getNodeRemaining`（calendar.ts 已 import）、`lib/format.fmtWan/fmtYuan/fmtRatio`。
- `stores/projectDetail`（D2）：`open(id)`;AppLayout 已全局挂载 `ProjectDetailDrawer`。
- D2.5 `v-activate` 指令;主题 token。

**现状（要重写，均硬编码色致暗色坏）：** `views/CalendarView.vue`、`components/CalGrid.vue`、`components/CalNodeTable.vue`。

## 约定（CLAUDE.md）

- 简体中文;**无 emoji**（用 → ↓ ❌ ✕ ▾）。CSS 用主题 token;状态色用语义 token（延期=danger/正常=accent/提前=ok/可提前=cyan/达到条件=warn/已全额=ok/待确定=mut）。尺寸优先 `var(--fs-*)`，日历字号放大一档。
- 下钻入口非语义可点击元素用 `v-activate`。
- 计算口径忠实复用 `lib/calendar`/`getNodeRemaining`，不改算法;改了 calendar 计算先改测试。
- 提交信息结尾：
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```

---

### Task 1: lib/calendar — 每日待回款金额（富日格金额）

**Files:**
- Modify: `frontend/src/lib/calendar.ts`（`CalDayData`/`calDateData`/`CalCell`/`calMonthGrid`）
- Test: `frontend/src/lib/calendar.test.ts`（更新两处用例）

- [ ] **Step 1: 改测试（先失败/对齐新字段）**

`frontend/src/lib/calendar.test.ts`：
- `calDateData` 用例（约 66-76 行）整体替换为：

```ts
describe('calDateData', () => {
  it('按日期统计状态桶 + 待回款金额合计', () => {
    const m = calDateData([
      { isPaymentRelated: true, planDate: '2026-06-10', nodeStatus: '延期', expectedPayment: 100000, actualPayment: 0 },
      { isPaymentRelated: true, planDate: '2026-06-10', nodeStatus: '正常实施中', expectedPayment: 60000, actualPayment: 20000 },
    ] as any)
    expect(m['2026-06-10'].total).toBe(2)
    expect(m['2026-06-10'].delayed).toBe(1)
    expect(m['2026-06-10'].onTime).toBe(1)
    expect(m['2026-06-10'].remaining).toBe(140000) // (100000-0)+(60000-20000)
  })
})
```

- `calMonthGrid` 用例（约 78-89 行）的 dateData 字面量补 `remaining` 并加断言，整体替换为：

```ts
describe('calMonthGrid', () => {
  it('生成含补位的格子，命中日带 count/状态色/金额', () => {
    const dateData = { '2026-06-10': { total: 2, delayed: 1, onTime: 1, advance: 0, canAdvance: 0, reachedCondition: 0, fullPaid: 0, pending: 0, remaining: 140000 } }
    const cells = calMonthGrid(2026, 5, dateData as any, NOW)
    const c10 = cells.find((c) => c.dateStr === '2026-06-10')!
    expect(c10.count).toBe(2)
    expect(c10.statusClass).toBe('mixed')
    expect(c10.remaining).toBe(140000)
    const c4 = cells.find((c) => c.dateStr === '2026-06-04')!
    expect(c4.isToday).toBe(true)
    expect(cells.length % 7).toBe(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/lib/calendar.test.ts`
Expected: FAIL（`remaining` 不存在）。

- [ ] **Step 3: 实现**

`frontend/src/lib/calendar.ts`：

- `CalDayData` 接口末尾加字段：

```ts
  pending: number
  remaining: number
}
```

- `calDateData` 内：把 map 初始化对象补 `remaining: 0`，并在累加处加一行。即把

```ts
    if (!map[d])
      map[d] = { total: 0, delayed: 0, onTime: 0, advance: 0, canAdvance: 0, reachedCondition: 0, fullPaid: 0, pending: 0 }
    const dd = map[d]
    dd.total++
```

改为：

```ts
    if (!map[d])
      map[d] = { total: 0, delayed: 0, onTime: 0, advance: 0, canAdvance: 0, reachedCondition: 0, fullPaid: 0, pending: 0, remaining: 0 }
    const dd = map[d]
    dd.total++
    dd.remaining += getNodeRemaining(n)
```

- `CalCell` 接口末尾加字段：

```ts
  statusClass: string
  count: number
  remaining: number
}
```

- `calMonthGrid` 内三处 `cells.push({...})`：
  - 两处补位格（otherMonth）补 `remaining: 0`。
  - 命中日格把 `count` 行之后加 `remaining: dd ? dd.remaining : 0`。即该 push 改为：

```ts
    cells.push({ day: d, dateStr: ds, otherMonth: false, isToday, isWeekend, statusClass, count, remaining: dd ? dd.remaining : 0 })
```

  两处 otherMonth 补位 push 改为（各自）：

```ts
    cells.push({ day: prevDim - startOff + i + 1, dateStr: '', otherMonth: true, isToday: false, isWeekend: false, statusClass: '', count: 0, remaining: 0 })
```
```ts
    cells.push({ day: i, dateStr: '', otherMonth: true, isToday: false, isWeekend: false, statusClass: '', count: 0, remaining: 0 })
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/lib/calendar.test.ts`
Expected: PASS（其余用例不受影响）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/calendar.ts frontend/src/lib/calendar.test.ts
git commit -m "feat(D7): lib/calendar 每日待回款金额合计（富日格金额）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: CalNodeTable 重写 — token 化 + 行点击下钻详情

**Files:**
- Modify(重写): `frontend/src/components/CalNodeTable.vue`
- Modify(重写): `frontend/src/components/CalNodeTable.test.ts`

token 化全部颜色;行 `v-activate` 可点 → `projectDetail.open(projectId)`（供选中日明细与临期面板共用）。

- [ ] **Step 1: 重写组件**

整体替换 `frontend/src/components/CalNodeTable.vue` 为：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { fmtYuan, fmtRatio } from '@/lib/format'
import { getNodeRemaining } from '@/lib/riskGroups'
import { useProjectDetailStore } from '@/stores/projectDetail'

const props = withDefaults(defineProps<{ nodes: Record<string, any>[]; maxShow?: number }>(), {
  maxShow: 100,
})
const rows = computed(() => props.nodes.slice(0, props.maxShow))
const pd = useProjectDetailStore()
</script>

<template>
  <div class="cnt-wrap">
    <table class="cnt-table">
      <thead>
        <tr>
          <th>项目编号</th>
          <th>项目名称</th>
          <th class="r">项目金额(元)</th>
          <th class="r">待回款金额(元)</th>
          <th>金额区间</th>
          <th>服务组</th>
          <th>项目经理</th>
          <th>节点状态</th>
          <th>里程碑/阶段名称</th>
          <th>计划回款时间</th>
          <th>实际回款比例</th>
          <th class="r">计划回款金额(元)</th>
          <th class="r">已回款金额(元)</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(n, i) in rows" :key="i" v-activate class="cnt-row" @click="pd.open(n.projectId)">
          <td>{{ n.projectId }}</td>
          <td :title="n.projectName || ''">{{ n.projectName || '-' }}</td>
          <td class="r">{{ fmtYuan(n.projectAmount) }}</td>
          <td class="r remain">{{ fmtYuan(getNodeRemaining(n)) }}</td>
          <td>{{ n.tier }}</td>
          <td>{{ n.orgL4 || '-' }}</td>
          <td>{{ n.projectManager || '-' }}</td>
          <td>{{ n.nodeStatus }}</td>
          <td>{{ n.milestone || n.stageName || '-' }}</td>
          <td>{{ n.planDate || '-' }}</td>
          <td>{{ fmtRatio(n.actualPaymentRatio, '待上报') }}</td>
          <td class="r">{{ fmtYuan(n.expectedPayment) }}</td>
          <td class="r">{{ fmtYuan(n.actualPayment) }}</td>
        </tr>
      </tbody>
    </table>
    <div class="cnt-count">共 {{ nodes.length }} 条记录</div>
  </div>
</template>

<style scoped>
.cnt-wrap { overflow-x: auto; }
.cnt-table { width: 100%; border-collapse: collapse; font-size: var(--fs-1); }
.cnt-table th,
.cnt-table td {
  border: 1px solid var(--line);
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cnt-table th { background: var(--card2); color: var(--sub); font-weight: 600; }
.cnt-table th.r, .cnt-table td.r { text-align: right; font-family: var(--font-mono, monospace); }
.cnt-table td.remain { color: var(--danger); }
.cnt-row { cursor: pointer; }
.cnt-row:hover { background: var(--card2); }
.cnt-count { font-size: var(--fs-1); color: var(--mut); padding: 6px 0; }
</style>
```

- [ ] **Step 2: 重写测试**

整体替换 `frontend/src/components/CalNodeTable.test.ts` 为：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalNodeTable from './CalNodeTable.vue'
import { useProjectDetailStore } from '@/stores/projectDetail'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

const NODES = [
  { projectId: 'P1', projectName: '甲', tier: '100万以上', orgL4: '北京', projectManager: '张三', nodeStatus: '延期', planDate: '2026-06-10', expectedPayment: 100000, actualPayment: 0, projectAmount: 2000000 },
]

describe('CalNodeTable', () => {
  it('渲染节点行', () => {
    const w = mount(CalNodeTable, { props: { nodes: NODES } })
    expect(w.text()).toContain('P1')
    expect(w.text()).toContain('甲')
    expect(w.text()).toContain('共 1 条记录')
  })

  it('点击行唤起项目详情面板', async () => {
    const w = mount(CalNodeTable, { props: { nodes: NODES } })
    await w.find('.cnt-row').trigger('click')
    expect(useProjectDetailStore().openId).toBe('P1')
  })
})
```

- [ ] **Step 3: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/CalNodeTable.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CalNodeTable.vue frontend/src/components/CalNodeTable.test.ts
git commit -m "feat(D7): CalNodeTable token 化 + 行点击下钻项目详情

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CalGrid 重写 — 富日格（日号/笔数/金额/状态点）

**Files:**
- Modify(重写): `frontend/src/components/CalGrid.vue`
- Modify(重写): `frontend/src/components/CalGrid.test.ts`

双月富日格：日号 + 状态点(按 statusClass 着色) + "N笔 / X万";token 化、字号放大、有节点日 `v-activate` 可点选中。

- [ ] **Step 1: 重写组件**

整体替换 `frontend/src/components/CalGrid.vue` 为：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { calMonthGrid, calDayTooltipText, type CalDayData } from '@/lib/calendar'
import { fmtWan } from '@/lib/format'

const props = defineProps<{
  year: number
  month: number
  dateData: Record<string, CalDayData>
  selectedDate: string
  today?: Date
}>()
const emit = defineEmits<{ select: [string] }>()

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const months = computed(() => {
  let y2 = props.year
  let m2 = props.month + 1
  if (m2 > 11) {
    m2 = 0
    y2 = props.year + 1
  }
  const t = props.today ?? new Date()
  return [
    { year: props.year, month: props.month, cells: calMonthGrid(props.year, props.month, props.dateData, t) },
    { year: y2, month: m2, cells: calMonthGrid(y2, m2, props.dateData, t) },
  ]
})

function tip(ds: string): string {
  const dd = props.dateData[ds]
  return dd ? calDayTooltipText(dd) : ''
}
function onClick(ds: string) {
  if (ds) emit('select', ds)
}
</script>

<template>
  <div class="cal-grid-row">
    <div v-for="mo in months" :key="mo.year + '-' + mo.month" class="cal-month">
      <div class="cal-month-title">{{ mo.year }}年{{ mo.month + 1 }}月</div>
      <div class="cal-weekdays">
        <span v-for="(wd, i) in WEEKDAYS" :key="wd" :class="{ wkend: i >= 5 }">{{ wd }}</span>
      </div>
      <div class="cal-days">
        <div
          v-for="(c, i) in mo.cells"
          :key="i"
          class="cal-day"
          :class="[
            c.otherMonth ? 'other-month' : '',
            c.isToday ? 'today' : '',
            c.isWeekend ? 'weekend' : '',
            c.count > 0 ? 'has-nodes st-' + c.statusClass : '',
            !c.otherMonth && selectedDate === c.dateStr ? 'selected' : '',
          ]"
          :title="c.count > 0 ? tip(c.dateStr) : ''"
          v-activate="!c.otherMonth && c.count > 0"
          @click="onClick(c.otherMonth ? '' : c.dateStr)"
        >
          <div class="cd-top">
            <span class="cd-num">{{ c.day }}</span>
            <span v-if="c.count > 0" class="cd-dot" />
          </div>
          <div v-if="c.count > 0" class="cd-meta">
            <span>{{ c.count }}笔</span>
            <span class="cd-amt">{{ fmtWan(c.remaining) }}万</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal-grid-row { display: flex; gap: 16px; flex-wrap: wrap; }
.cal-month { flex: 1; min-width: 300px; }
.cal-month-title { text-align: center; font-size: var(--fs-3); font-weight: 800; color: var(--txt); margin-bottom: 8px; }
.cal-weekdays { display: grid; grid-template-columns: repeat(7, 1fr); text-align: center; font-size: var(--fs-1); color: var(--sub); margin-bottom: 4px; }
.cal-weekdays .wkend { color: var(--c-pending); }
.cal-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.cal-day {
  --sc: var(--mut);
  min-height: 58px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 4px 6px;
  font-size: var(--fs-2);
  color: var(--txt);
}
.cal-day.other-month { color: var(--mut); background: var(--card2); opacity: 0.5; }
.cal-day.weekend:not(.other-month) { background: var(--card2); }
.cal-day.today { outline: 2px solid var(--accent); outline-offset: -2px; }
.cal-day.has-nodes { cursor: pointer; background: color-mix(in srgb, var(--sc) 14%, transparent); }
.cal-day.has-nodes:hover { background: color-mix(in srgb, var(--sc) 24%, transparent); }
.cal-day.selected { box-shadow: 0 0 0 2px var(--accent) inset; }
.st-delayed { --sc: var(--danger); }
.st-ontime { --sc: var(--accent); }
.st-advance { --sc: var(--ok); }
.st-canadvance { --sc: var(--cyan); }
.st-reached { --sc: var(--warn); }
.st-fullpaid { --sc: var(--ok); }
.st-pending { --sc: var(--mut); }
.st-mixed { --sc: var(--accent); }
.cd-top { display: flex; align-items: center; justify-content: space-between; }
.cd-num { font-weight: 700; }
.cd-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--sc); }
.cd-meta { display: flex; flex-direction: column; font-size: var(--fs-1); color: var(--sub); line-height: 1.3; }
.cd-amt { color: var(--sc); font-weight: 700; }
</style>
```

- [ ] **Step 2: 重写测试**

整体替换 `frontend/src/components/CalGrid.test.ts` 为：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CalGrid from './CalGrid.vue'
import type { CalDayData } from '@/lib/calendar'

const today = new Date('2026-06-04T00:00:00')
const dateData: Record<string, CalDayData> = {
  '2026-06-10': { total: 2, delayed: 1, onTime: 1, advance: 0, canAdvance: 0, reachedCondition: 0, fullPaid: 0, pending: 0, remaining: 140000 },
}

describe('CalGrid', () => {
  it('富日格显示笔数与金额', () => {
    const w = mount(CalGrid, { props: { year: 2026, month: 5, dateData, selectedDate: '', today } })
    expect(w.text()).toContain('2笔')
    expect(w.text()).toContain('14万') // 140000 → 14万
  })

  it('点击有节点的日 emit select', async () => {
    const w = mount(CalGrid, { props: { year: 2026, month: 5, dateData, selectedDate: '', today } })
    const day = w.findAll('.cal-day.has-nodes')[0]
    await day.trigger('click')
    expect(w.emitted('select')?.[0]?.[0]).toBe('2026-06-10')
  })
})
```

- [ ] **Step 3: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/CalGrid.test.ts`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/CalGrid.vue frontend/src/components/CalGrid.test.ts
git commit -m "feat(D7): CalGrid 富日格（日号/笔数/金额/状态点）+ token + 字号放大

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: CalDayDetail — 选中日/当月明细

**Files:**
- Create: `frontend/src/components/CalDayDetail.vue`
- Test: `frontend/src/components/CalDayDetail.test.ts`

按状态分组展示节点（复用 `CalNodeTable`，行点击经其下钻详情）。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/components/CalDayDetail.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import CalDayDetail from './CalDayDetail.vue'
import type { CalListGroup } from '@/lib/calendar'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

const GROUPS: CalListGroup[] = [
  { key: '延期', color: '#EF4444', nodes: [{ projectId: 'P1', projectName: '甲', nodeStatus: '延期' }] as any, subRemaining: 100000 },
]

describe('CalDayDetail', () => {
  it('渲染分组标题与小计', () => {
    const w = mount(CalDayDetail, { props: { title: '2026-06-10 回款节点', groups: GROUPS } })
    expect(w.text()).toContain('2026-06-10 回款节点')
    expect(w.text()).toContain('延期')
    expect(w.text()).toContain('待回款小计')
  })

  it('空分组显示空态', () => {
    const w = mount(CalDayDetail, { props: { title: '当月回款节点', groups: [] } })
    expect(w.text()).toContain('暂无回款节点')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npm run test:run -- src/components/CalDayDetail.test.ts`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现**

Create `frontend/src/components/CalDayDetail.vue`:

```vue
<script setup lang="ts">
import type { CalListGroup } from '@/lib/calendar'
import { fmtWan } from '@/lib/format'
import CalNodeTable from './CalNodeTable.vue'

defineProps<{ title: string; groups: CalListGroup[] }>()
</script>

<template>
  <div class="cdd">
    <div class="cdd-title">{{ title }}</div>
    <div v-if="!groups.length" class="cdd-empty">暂无回款节点</div>
    <div v-for="g in groups" :key="g.key" class="cdd-group">
      <div class="cdd-head" :style="{ borderLeftColor: g.color }">
        <span class="cdd-status" :style="{ color: g.color }">{{ g.key }}</span>
        <span class="cdd-sub">{{ g.nodes.length }}个节点，待回款小计 {{ fmtWan(g.subRemaining) }}万</span>
      </div>
      <CalNodeTable :nodes="g.nodes as Record<string, any>[]" />
    </div>
  </div>
</template>

<style scoped>
.cdd { margin-top: 18px; }
.cdd-title { font-size: var(--fs-4); font-weight: 800; color: var(--txt); margin-bottom: 8px; }
.cdd-empty { color: var(--mut); text-align: center; padding: 20px; }
.cdd-group { margin-bottom: 14px; }
.cdd-head { display: flex; align-items: center; gap: 10px; font-weight: 700; padding: 8px 12px; border-left: 3px solid var(--line); background: var(--card2); font-size: var(--fs-2); }
.cdd-sub { color: var(--sub); font-size: var(--fs-1); font-weight: 400; }
</style>
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/components/CalDayDetail.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CalDayDetail.vue frontend/src/components/CalDayDetail.test.ts
git commit -m "feat(D7): CalDayDetail 选中日/当月明细（状态分组 + 项目下钻）

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: CalendarView 重写 — token 化 + 字号 + 接入富日格/明细

**Files:**
- Modify(重写): `frontend/src/views/CalendarView.vue`
- Modify(重写): `frontend/src/views/CalendarView.test.ts`

整页 token 化（仪表卡/导航/筛选/临期），字号放大，接入新 CalGrid + CalDayDetail。逻辑（计算/导航/筛选/选中）沿用现状。

- [ ] **Step 1: 重写 CalendarView.vue**

整体替换 `frontend/src/views/CalendarView.vue` 为：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useDataStore } from '@/stores/data'
import { useFilterStore } from '@/stores/filter'
import { naguanFilter } from '@/lib/ledger'
import {
  calFilterOptions,
  calDashboardStats,
  calExcludePaid,
  applyCalFilters,
  calDateData,
  calListNodes,
  calListGroups,
  calUpcoming,
  type CalFilters,
} from '@/lib/calendar'
import { fmtWan } from '@/lib/format'
import CalGrid from '@/components/CalGrid.vue'
import CalDayDetail from '@/components/CalDayDetail.vue'
import CalNodeTable from '@/components/CalNodeTable.vue'

const data = useDataStore()
const filter = useFilterStore()
onMounted(() => {
  if (!data.data) data.load()
})

const init = new Date()
const state = reactive({
  year: init.getFullYear(),
  month: init.getMonth(),
  selectedDate: '',
  filterOrgL3: '',
  filterOrgL4: '',
  filterPM: '',
})
const calFilters = computed<CalFilters>(() => ({
  orgL3: state.filterOrgL3,
  orgL4: state.filterOrgL4,
  pm: state.filterPM,
}))

const rawNodes = computed(() => (data.data?.rawNodes ?? []) as Record<string, any>[])
const naguanNodes = computed(
  () =>
    naguanFilter(
      rawNodes.value as any,
      filter.naguanOn,
      (data.data?.naguanExclude ?? {}) as Record<string, boolean>,
    ) as Record<string, any>[],
)

const options = computed(() => calFilterOptions(naguanNodes.value as any))
const dashboard = computed(() => calDashboardStats(filter.filteredNodes as any, calFilters.value, new Date()))
const gridDateData = computed(() =>
  calDateData(
    applyCalFilters(
      calExcludePaid(naguanNodes.value.filter((n) => n.isPaymentRelated && n.planDate) as any),
      calFilters.value,
    ),
  ),
)
const listNodes = computed(() =>
  calListNodes(naguanNodes.value as any, calFilters.value, {
    year: state.year,
    month: state.month,
    selectedDate: state.selectedDate,
  }),
)
const listGroups = computed(() => calListGroups(listNodes.value))
const upcoming = computed(() => calUpcoming(naguanNodes.value as any, calFilters.value, new Date()))

const listTitle = computed(() => (state.selectedDate ? `${state.selectedDate} 回款节点` : '当月/次月回款节点'))

const DASH = computed(() => [
  { label: '当月待回款(万)', value: fmtWan(dashboard.value.mRemaining), cls: 'danger' },
  { label: '当月已回款(万)', value: fmtWan(dashboard.value.mActual), cls: 'paid' },
  { label: '7天内到期', value: String(dashboard.value.upcoming7), cls: 'pending' },
  { label: '当月回款节点', value: String(dashboard.value.mCount), cls: 'accent' },
  { label: '延期节点', value: String(dashboard.value.delayed), cls: 'danger' },
])

function prevYear() { state.year-- }
function nextYear() { state.year++ }
function prevMonth() {
  state.month--
  if (state.month < 0) { state.month = 11; state.year-- }
}
function nextMonth() {
  state.month++
  if (state.month > 11) { state.month = 0; state.year++ }
}
function onSelectDay(ds: string) {
  state.selectedDate = state.selectedDate === ds ? '' : ds
}
function clearFilters() {
  state.filterOrgL3 = ''
  state.filterOrgL4 = ''
  state.filterPM = ''
}
</script>

<template>
  <div class="cal-view">
    <h2 class="cal-title">回款日历</h2>

    <div class="cal-dash">
      <div v-for="c in DASH" :key="c.label" class="cd-card">
        <div class="cd-label">{{ c.label }}</div>
        <div class="cd-val" :class="c.cls">{{ c.value }}</div>
      </div>
    </div>

    <div class="cal-filterbar">
      <div class="cal-nav">
        <button class="cal-arrow" @click="prevYear">‹</button>
        <span class="cal-navlabel">{{ state.year }}年</span>
        <button class="cal-arrow" @click="nextYear">›</button>
      </div>
      <div class="cal-nav">
        <button class="cal-arrow" @click="prevMonth">‹</button>
        <span class="cal-navlabel">{{ state.month + 1 }}月</span>
        <button class="cal-arrow" @click="nextMonth">›</button>
      </div>
      <el-select v-model="state.filterOrgL3" size="small" placeholder="PM L3-1部门" clearable style="width:150px">
        <el-option v-for="o in options.orgL3" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="state.filterOrgL4" size="small" placeholder="项目经理L4部门" clearable style="width:160px">
        <el-option v-for="o in options.orgL4" :key="o" :label="o" :value="o" />
      </el-select>
      <el-select v-model="state.filterPM" size="small" placeholder="项目经理" clearable style="width:130px">
        <el-option v-for="o in options.pm" :key="o" :label="o" :value="o" />
      </el-select>
      <el-button size="small" @click="clearFilters">清除所有筛选</el-button>
    </div>

    <CalGrid
      :year="state.year"
      :month="state.month"
      :date-data="gridDateData"
      :selected-date="state.selectedDate"
      @select="onSelectDay"
    />

    <CalDayDetail :title="listTitle" :groups="listGroups" />

    <div class="cal-upcoming">
      <div class="cal-up-title">即将到期回款节点</div>
      <div class="cal-up-row">
        <div class="cal-up-panel">
          <div class="cal-up-header pending">15天内到期</div>
          <CalNodeTable :nodes="upcoming.up15 as Record<string, any>[]" :max-show="50" />
        </div>
        <div class="cal-up-panel">
          <div class="cal-up-header accent">30天内到期</div>
          <CalNodeTable :nodes="upcoming.up30 as Record<string, any>[]" :max-show="100" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cal-view { padding: 16px; }
.cal-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 14px; }
.cal-dash { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 14px; }
.cd-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 14px 10px; text-align: center; }
.cd-label { font-size: var(--fs-1); color: var(--mut); margin-bottom: 4px; }
.cd-val { font-size: var(--fs-5); font-weight: 800; color: var(--txt); }
.cd-val.danger { color: var(--danger); }
.cd-val.paid { color: var(--c-paid); }
.cd-val.pending { color: var(--c-pending); }
.cd-val.accent { color: var(--accent); }
.cal-filterbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
.cal-nav { display: inline-flex; align-items: center; gap: 6px; }
.cal-arrow { border: 1px solid var(--line); background: var(--card); border-radius: 6px; width: 28px; height: 28px; cursor: pointer; font-weight: 900; color: var(--sub); }
.cal-arrow:hover { background: var(--card2); color: var(--accent); }
.cal-navlabel { font-size: var(--fs-2); font-weight: 700; color: var(--txt); min-width: 48px; text-align: center; }
.cal-upcoming { margin-top: 22px; }
.cal-up-title { font-size: var(--fs-4); font-weight: 800; color: var(--txt); margin-bottom: 12px; }
.cal-up-row { display: flex; gap: 16px; flex-wrap: wrap; }
.cal-up-panel { flex: 1; min-width: 320px; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.cal-up-header { color: var(--on-accent); font-weight: 700; font-size: var(--fs-2); padding: 8px 12px; }
.cal-up-header.pending { background: var(--c-pending); }
.cal-up-header.accent { background: var(--accent); }
</style>
```

- [ ] **Step 2: 重写 CalendarView.test.ts**

整体替换 `frontend/src/views/CalendarView.test.ts` 为（stub 子组件 + 注册 ElementPlus 供 el-select）：

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import CalendarView from './CalendarView.vue'
import { useDataStore } from '@/stores/data'

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

const stubs = { CalGrid: true, CalDayDetail: true, CalNodeTable: true }

describe('CalendarView', () => {
  it('渲染仪表卡与日历区块', () => {
    const ds = useDataStore()
    ds.data = {
      meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
      rawNodes: [
        { projectId: 'P1', tier: '100万以上', orgL4: '北京', orgL3: '华北', projectManager: '张三', isPaymentRelated: true, nodeStatus: '延期', planDate: '2026-06-10', expectedPayment: 100000, actualPayment: 0 },
      ],
      projectOverview: { projects: [], columns: [] },
      naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
    } as any
    const w = mount(CalendarView, { global: { plugins: [ElementPlus], stubs } })
    expect(w.find('.cal-dash').exists()).toBe(true)
    expect(w.text()).toContain('回款日历')
    expect(w.findComponent({ name: 'CalGrid' }).exists()).toBe(true)
  })

  it('无数据时仍渲染标题（不抛错）', () => {
    const w = mount(CalendarView, { global: { plugins: [ElementPlus], stubs } })
    expect(w.text()).toContain('回款日历')
  })
})
```

- [ ] **Step 3: 运行确认通过**

Run: `cd frontend && npm run test:run -- src/views/CalendarView.test.ts`
Expected: PASS。若 `findComponent({ name: 'CalGrid' })` 因 stub 命名不匹配失败，改为断言 stub 渲染的占位元素存在（`w.find('cal-grid-stub').exists()` 或直接断言 `.cal-dash` + 文本即可，去掉该行）。

- [ ] **Step 4: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/CalendarView.vue frontend/src/views/CalendarView.test.ts
git commit -m "feat(D7): CalendarView 重写 token 化 + 字号放大 + 接入富日格/选中日明细

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 全量验证 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过`。

- [ ] **Step 2: 确认日历区无残留硬编码颜色**

Run: `rg -n "#[0-9a-fA-F]{3,8}\b" frontend/src/views/CalendarView.vue frontend/src/components/CalGrid.vue frontend/src/components/CalNodeTable.vue frontend/src/components/CalDayDetail.vue`
Expected: 无输出（CalDayDetail 用 `g.color` 来自 lib 常量，非组件内硬编码;若命中仅应为说明性，无则最佳）。

- [ ] **Step 3: 更新 PROGRESS.md**

- 顶部「最近更新」改为 2026-06-08（Plan D7 回款日历重做 A 完成）。
- Phase D backlog 把 `- [ ] **D7** …` 改为 `- [x] **D7** …`，简述：CalGrid 富日格(日号/笔数/金额/状态点) + CalDayDetail 选中日明细(项目下钻) + CalNodeTable token+行下钻 + CalendarView 整页 token 化(补日历暗色) + 字号放大;lib/calendar 增每日待回款金额。议程列表(B)留 D8、年度热力条(C)留 D9。
- 「会话交接备注」新增 D7 段：分支、产物、日历暗色已补、YAGNI(B/C 留 D8/D9)、下一步 D8。

- [ ] **Step 4: Commit**

```bash
git add PROGRESS.md
git commit -m "docs(D7): PROGRESS 记录回款日历重做 A 完成

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成定义

- 回款日历网格为富日格（日号/笔数/待回款金额/状态点），点有节点日选中 → CalDayDetail 显该日按状态分组明细，点项目 → D2 详情面板;临期面板节点行同样可点下钻。
- 整页 token 化、暗色可用（补上 D2.5 延后的日历暗色）、字号放大。
- 议程列表(B)/年度热力条(C)按既定留 D8/D9。
- 新增/改的 lib 纯函数有 Vitest;计算口径复用 lib/calendar 未改算法。
- `bash verify.sh` 全绿;`PROGRESS.md` 已更新。
```
