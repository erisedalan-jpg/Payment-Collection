# Plan E2：首页"待办速览"信号行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在看板首页 6 张 KPI 卡之上增加一行 4 个"待办速览"信号（本月需回款 / 7天内临期 / 延期额 / 待跟进），每个可点击导流到对应页，让首页一眼可见"该催什么"。

**Architecture:** 新增纯函数 `lib/dashboardSignals.ts`（输入已筛选节点 + today 字符串，输出 4 个信号值，可单测）+ 展示组件 `components/DashSignals.vue`（消费 filter store，用 RouterLink 卡片导流），挂在 `DashboardView.vue` 的 DashMetrics 之上。复用既有 `getNodeRemaining`（riskGroups.ts）与 `fmtWan`（format.ts）。

**Tech Stack:** Vue3 `<script setup lang="ts">` + Pinia（filter store 的 `filteredNodes`）+ Vue Router（RouterLink）+ Vitest/@vue/test-utils。

---

## 关键设计决定（与 spec 的细化/优化，实现者须知）

1. **金额信号 lib 返回"元"，组件用 `fmtWan` 格式化。** `fmtWan(yuan)` 内部会 `/10000`，故 lib 不要预先除万，否则会被二次除。这样与 `DashMetrics.vue` 的 `fmtWan(s.totalActual)` 口径完全一致。
2. **卡片用 `RouterLink`（渲染为 `<a>`），不叠加 `v-activate`。** RouterLink 原生可聚焦、Enter 即导航，已满足"键盘可达 + 导流"。再加 `v-activate`（它给元素加 role=button 并用 Enter/Space 合成 click）会与 `<a>` 的原生行为重复甚至双触发。这是对 spec 中"v-activate"字面表述的合理优化——目标（键盘可达）用更语义化的方式达成。
3. **today 注入。** lib 接收 `today: 'YYYY-MM-DD'` 形参便于测试；组件用本地当天日期生成该字符串后传入。日期加减用 UTC 锚点（`new Date(today + 'T00:00:00Z')`）避免时区漂移，比较用 'YYYY-MM-DD' 字符串字典序（planDate 数据即此格式）。
4. **"待回款/未回款"统一用 `getNodeRemaining(n) > 0`** 判定（= expectedPayment − actualPayment > 0），与全站口径一致；已全额/已提前回款的节点 remaining ≤ 0 自然排除。

---

### Task 1：lib/dashboardSignals.ts（纯函数 + 单测，TDD）

**Files:**
- Create: `frontend/src/lib/dashboardSignals.ts`
- Test: `frontend/src/lib/dashboardSignals.test.ts`

- [ ] **Step 1：先写失败测试**

创建 `frontend/src/lib/dashboardSignals.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { dashboardSignals } from './dashboardSignals'
import type { RawNode } from '@/types/analysis'

const TODAY = '2026-06-09'

function n(p: Record<string, any>): RawNode {
  return { projectId: 'P', tier: '100万以上', isPaymentRelated: true, ...p } as any
}

describe('dashboardSignals', () => {
  it('空数组 → 全 0', () => {
    const s = dashboardSignals([], TODAY)
    expect(s).toEqual({ monthDue: 0, due7Count: 0, delayed: 0, toFollowupCount: 0 })
  })

  it('综合用例：本月需回款/临期/延期/待跟进', () => {
    const nodes = [
      // A：本月、未回款、planDate 在 30 天内但 7 天外、无跟进中 → monthDue + 待跟进
      n({ planMonth: '2026-06', planDate: '2026-06-20', nodeStatus: '正常实施中', expectedPayment: 100000, actualPayment: 30000, followupRecords: [] }),
      // B：本月、未回款、planDate 在 7 天内、有"跟进中"记录 → monthDue + due7，但不计待跟进
      n({ planMonth: '2026-06', planDate: '2026-06-12', nodeStatus: '正常实施中', expectedPayment: 50000, actualPayment: 0, followupRecords: [{ '跟进状态': '跟进中' }] }),
      // C：延期、上月、planDate 已过 → delayed，不计本月/临期
      n({ planMonth: '2026-05', planDate: '2026-05-01', nodeStatus: '延期', expectedPayment: 80000, actualPayment: 0, followupRecords: [] }),
      // D：本月、已全额回款（remaining=0）→ 不计本月需回款
      n({ planMonth: '2026-06', planDate: '2026-06-15', nodeStatus: '已全额回款', expectedPayment: 40000, actualPayment: 40000, followupRecords: [] }),
    ]
    const s = dashboardSignals(nodes, TODAY)
    expect(s.monthDue).toBe(120000) // A 70000 + B 50000
    expect(s.due7Count).toBe(1) // B
    expect(s.delayed).toBe(80000) // C
    expect(s.toFollowupCount).toBe(1) // A（B 有跟进中、C 已过期、D 已回款）
  })

  it('7天边界：恰好第 7 天计入，第 8 天不计入', () => {
    const nodes = [
      n({ planDate: '2026-06-16', expectedPayment: 10000, actualPayment: 0, followupRecords: [] }), // today+7
      n({ planDate: '2026-06-17', expectedPayment: 10000, actualPayment: 0, followupRecords: [] }), // today+8
    ]
    const s = dashboardSignals(nodes, TODAY)
    expect(s.due7Count).toBe(1)
  })

  it('今天当天的临期节点计入 due7', () => {
    const s = dashboardSignals([n({ planDate: '2026-06-09', expectedPayment: 10000, actualPayment: 0, followupRecords: [] })], TODAY)
    expect(s.due7Count).toBe(1)
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/dashboardSignals`
Expected: FAIL（`dashboardSignals` 未定义 / 模块不存在）。

- [ ] **Step 3：实现 lib**

创建 `frontend/src/lib/dashboardSignals.ts`：

```ts
import type { RawNode } from '@/types/analysis'
import { getNodeRemaining } from './riskGroups'

export interface DashSignal {
  /** 本月需回款（元）：planMonth=当月且未回款节点的待回款合计 */
  monthDue: number
  /** 7 天内临期节点数：planDate 落在 [today, today+7天] 且未回款 */
  due7Count: number
  /** 延期额（元）：nodeStatus='延期' 节点的待回款合计 */
  delayed: number
  /** 待跟进节点数：planDate 落在 [today, today+30天]、未回款、且该节点所属项目无"跟进中"记录 */
  toFollowupCount: number
}

/** today('YYYY-MM-DD') + n 天 → 'YYYY-MM-DD'（UTC 锚点，避免时区漂移）。 */
function addDays(today: string, days: number): string {
  const d = new Date(today + 'T00:00:00Z')
  return new Date(d.getTime() + days * 864e5).toISOString().slice(0, 10)
}

/** 该节点所属项目是否有"跟进中"记录（followupRecords 为后端附的项目近期记录）。 */
function hasOpenFollowup(n: Record<string, any>): boolean {
  const recs = Array.isArray(n.followupRecords) ? n.followupRecords : []
  return recs.some((r: any) => r && r['跟进状态'] === '跟进中')
}

/** 看板首页"待办速览"4 信号。today 注入便于测试（组件传本地当天）。 */
export function dashboardSignals(nodes: RawNode[], today: string): DashSignal {
  const month = today.slice(0, 7)
  const horizon7 = addDays(today, 7)
  const horizon30 = addDays(today, 30)

  let monthDue = 0
  let due7Count = 0
  let delayed = 0
  let toFollowupCount = 0

  for (const node of nodes) {
    const n = node as Record<string, any>
    const rem = getNodeRemaining(n)

    if (n.planMonth === month && rem > 0) monthDue += rem
    if (n.nodeStatus === '延期') delayed += rem

    const pd: string = typeof n.planDate === 'string' ? n.planDate : ''
    if (pd && rem > 0 && pd >= today) {
      if (pd <= horizon7) due7Count++
      if (pd <= horizon30 && !hasOpenFollowup(n)) toFollowupCount++
    }
  }

  return { monthDue, due7Count, delayed, toFollowupCount }
}
```

- [ ] **Step 4：运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/dashboardSignals && npm run typecheck`
Expected: 5 测试全 PASS；typecheck 0 错误。

- [ ] **Step 5：提交**

```bash
git add frontend/src/lib/dashboardSignals.ts frontend/src/lib/dashboardSignals.test.ts
git commit -m "feat(E2): dashboardSignals 纯函数(本月需回款/临期/延期/待跟进)"
```

---

### Task 2：components/DashSignals.vue（展示组件 + 测试）

**Files:**
- Create: `frontend/src/components/DashSignals.vue`
- Test: `frontend/src/components/DashSignals.test.ts`

- [ ] **Step 1：先写失败测试**

创建 `frontend/src/components/DashSignals.test.ts`（RouterLink 用 stub，断言标签与导流目标，不断言依赖当天的数值）：

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DashSignals from './DashSignals.vue'
import { useDataStore } from '@/stores/data'

vi.mock('vue-router', () => ({
  RouterLink: { name: 'RouterLink', props: ['to'], template: '<a class="rl" :data-to="to"><slot /></a>' },
}))

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear() })

function seed() {
  const ds = useDataStore()
  ds.data = {
    meta: { lastUpdate: 'x', totalProjects: 0, totalPaymentNodes: 0 }, dashboard: {}, summary: {},
    rawNodes: [{ projectId: 'P1', tier: '100万以上', isPaymentRelated: true, nodeStatus: '正常实施中', expectedPayment: 100000, actualPayment: 0, planMonth: '2026-06', planDate: '2026-06-20', followupRecords: [] }],
    projectOverview: { projects: [], columns: [] },
    naguanMap: {}, naguanExclude: {}, displayColumns: {}, followupRecords: {},
  } as any
}

describe('DashSignals', () => {
  it('渲染 4 个信号卡与标签', () => {
    seed()
    const w = mount(DashSignals)
    expect(w.findAll('.ds-card').length).toBe(4)
    const t = w.text()
    expect(t).toContain('本月需回款')
    expect(t).toContain('7天内临期')
    expect(t).toContain('延期额')
    expect(t).toContain('待跟进')
  })

  it('4 张卡导流到正确路由', () => {
    seed()
    const w = mount(DashSignals)
    const tos = w.findAll('.rl').map((a) => a.attributes('data-to'))
    expect(tos).toEqual(['/calendar', '/calendar', '/analysis/risk', '/followup'])
  })
})
```

- [ ] **Step 2：运行测试确认失败**

Run: `cd frontend && npx vitest run src/components/DashSignals`
Expected: FAIL（组件不存在）。

- [ ] **Step 3：实现组件**

创建 `frontend/src/components/DashSignals.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useFilterStore } from '@/stores/filter'
import { dashboardSignals } from '@/lib/dashboardSignals'
import { fmtWan } from '@/lib/format'

const filter = useFilterStore()

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const sig = computed(() => dashboardSignals(filter.filteredNodes, todayStr()))

const cards = computed(() => [
  { k: '本月需回款(万)', v: fmtWan(sig.value.monthDue), cls: 'remaining', to: '/calendar' },
  { k: '7天内临期', v: String(sig.value.due7Count), cls: 'urgent', to: '/calendar' },
  { k: '延期额(万)', v: fmtWan(sig.value.delayed), cls: 'remaining', to: '/analysis/risk' },
  { k: '待跟进', v: String(sig.value.toFollowupCount), cls: 'accent', to: '/followup' },
])
</script>

<template>
  <div class="dash-signals u-grid-auto">
    <RouterLink v-for="c in cards" :key="c.k" :to="c.to" class="ds-card" :class="c.cls">
      <div class="ds-k">{{ c.k }}</div>
      <div class="ds-v">{{ c.v }}</div>
    </RouterLink>
  </div>
</template>

<style scoped>
.dash-signals { --col-min: 150px; margin-bottom: 12px; }
.ds-card { display: block; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; text-decoration: none; }
.ds-card:hover { border-color: var(--accent); }
.ds-k { font-size: var(--fs-1); color: var(--mut); }
.ds-v { font-size: var(--fs-5); font-weight: 800; margin-top: 4px; color: var(--txt); }
.ds-card.remaining .ds-v { color: var(--c-remaining); }
.ds-card.urgent .ds-v { color: var(--c-urgent); }
.ds-card.accent .ds-v { color: var(--accent); }
</style>
```

- [ ] **Step 4：运行测试确认通过**

Run: `cd frontend && npx vitest run src/components/DashSignals && npm run typecheck`
Expected: 2 测试 PASS；typecheck 0 错误。

- [ ] **Step 5：提交**

```bash
git add frontend/src/components/DashSignals.vue frontend/src/components/DashSignals.test.ts
git commit -m "feat(E2): DashSignals 信号行组件(RouterLink 导流, token 化)"
```

---

### Task 3：接入 DashboardView + 修订其测试 stub

**Files:**
- Modify: `frontend/src/views/DashboardView.vue`
- Modify: `frontend/src/views/DashboardView.test.ts`

- [ ] **Step 1：DashboardView 渲染 DashSignals（DashMetrics 之上）**

`frontend/src/views/DashboardView.vue` 的 `<script setup>` 中，在 `import DashMetrics ...` 行之后新增导入：

```ts
import DashSignals from '@/components/DashSignals.vue'
```

模板里，把：

```html
    <template v-else-if="data.data">
      <DashMetrics />
```

改为（在 DashMetrics 之上插入 DashSignals）：

```html
    <template v-else-if="data.data">
      <DashSignals />
      <DashMetrics />
```

- [ ] **Step 2：DashboardView.test 三处 mount 增加 DashSignals stub**

DashSignals 内部用 RouterLink，DashboardView.test 无 router 上下文。为保持该测试聚焦（DashSignals 自有测试覆盖），把三处 `stubs: { BoardDrilldownModal: true }` 均改为 `stubs: { BoardDrilldownModal: true, DashSignals: true }`。

`frontend/src/views/DashboardView.test.ts` 中，三处出现的：

```ts
{ global: { stubs: { BoardDrilldownModal: true } } }
```

全部替换为：

```ts
{ global: { stubs: { BoardDrilldownModal: true, DashSignals: true } } }
```

（共 3 处，行 19/30/36 附近。可用编辑器全局替换该精确串。）

- [ ] **Step 3：运行受影响测试 + typecheck**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/DashboardView`
Expected: typecheck 0 错误；DashboardView 3 测试全 PASS。

- [ ] **Step 4：提交**

```bash
git add frontend/src/views/DashboardView.vue frontend/src/views/DashboardView.test.ts
git commit -m "feat(E2): DashboardView 顶部接入 DashSignals 信号行"
```

---

### Task 4：全量验证 + PROGRESS 更新

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1：跑完整验证**

Run: `bash verify.sh`
Expected: 末尾 `[PASS] verify.sh 全部通过`（含前端 vitest 新增 dashboardSignals 5 + DashSignals 2 = 共 +7 测试，build 成功）。若失败，原样报告失败输出，勿改其他。

- [ ] **Step 2：更新 PROGRESS.md**

用 Read 打开 PROGRESS.md，在 Handoff 区"Plan E1 完成"条目之前（即最新位置）按既有 `### ✅ Plan Xx 完成（日期）：主题` 体例新增条目：

```
### ✅ Plan E2 完成（2026-06-09）：首页待办速览信号行
- 分支 **`refactor/e2-dashboard-signals`**，`verify.sh` 全绿。
- 产物：① `lib/dashboardSignals.ts` 纯函数算 4 信号（本月需回款/7天临期/延期额/待跟进，today 注入、复用 getNodeRemaining）；② `components/DashSignals.vue` 用 RouterLink 卡片导流（/calendar、/calendar、/analysis/risk、/followup），全 token 化（remaining/urgent/accent）；③ DashboardView 在 DashMetrics 之上接入。
- 设计说明：金额信号 lib 返回元、组件用 fmtWan 统一（与 DashMetrics 一致）；卡片用 RouterLink 原生键盘可达，未叠加 v-activate（避免双触发）。
```

同时把文件头部"最近更新"一行更新为 E2（日期 2026-06-09）。

- [ ] **Step 3：提交**

```bash
git add PROGRESS.md
git commit -m "docs(E2): PROGRESS 记录信号行完成"
```

- [ ] **Step 4：人工目检提示（无法自动验证，报告中注明）**

需用户人工目检：首页顶部出现 4 信号卡，数值合理；点击各卡跳转 /calendar、/analysis/risk、/followup；明暗与字号自适应；键盘 Tab 可聚焦、Enter 可导航。

---

## Self-Review

**1. Spec coverage（对照 spec 的 Plan E2 节）：**
- 新增 `lib/dashboardSignals.ts`（纯函数、today 注入、可单测）→ Task 1 ✓
- 新增 `components/DashSignals.vue`，挂 DashMetrics 之上 → Task 2 + Task 3 ✓
- 4 信号定义（本月需回款 / 7天临期 / 延期额 / 待跟进）与导流目标（/calendar、/calendar、/analysis/risk、/followup）→ Task 1 实现 + Task 2 断言 ✓
- 复用 getNodeRemaining、fmtWan → Task 1/Task 2 ✓
- 配色 token（remaining/urgent/accent）、明暗自适应 → Task 2 样式 ✓
- "无跟进中记录"判定（followupRecords 中 跟进状态==='跟进中'）→ Task 1 hasOpenFollowup ✓
- 边界（空数据 0、跨月、7/30 天边界、已全额不计）→ Task 1 测试 ✓
- spec 中"v-activate"→ 用 RouterLink 原生可达替代，已在"关键设计决定"说明理由 ✓（合理优化，非遗漏）

**2. Placeholder scan：** 无 TBD/TODO；每步含完整代码与可执行命令及预期。✓

**3. Type consistency：** lib 导出 `dashboardSignals` 与接口 `DashSignal{monthDue,due7Count,delayed,toFollowupCount}`，组件与测试引用字段名一致；`getNodeRemaining` 来自 `@/lib/riskGroups`（已存在导出）；`fmtWan` 来自 `@/lib/format`（除万，故 lib 返回元）；RawNode 字段（planMonth/planDate/nodeStatus/expectedPayment/actualPayment/followupRecords）均与 `types/analysis.ts` 一致。✓
