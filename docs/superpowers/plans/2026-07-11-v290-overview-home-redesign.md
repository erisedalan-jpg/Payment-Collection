# V2.9.0 首页总览下半区重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页（`OverviewView.vue`）下半区从「异常卡 | 项目动态」两栏，改为「异常卡 | 待办·临期 | 项目动态」三栏，新增待办队列、异常卡默认内联、项目动态加数字条与要紧过滤。

**Architecture:** 纯前端展示层。新增一个纯计算层 `lib/todoQueue.ts`（把回款节点/里程碑节点/成本超支项目聚合成一条按紧急度排序的待办队列）和一个表现型组件 `components/TodoQueue.vue`；`OverviewView.vue` 装配三栏、内联异常卡、增强动态栏。后端与数据口径零改动。

**Tech Stack:** Vue 3 `<script setup lang="ts">` + Pinia + Element Plus + Vitest + `@vue/test-utils`。

## Global Constraints

- **纯前端展示层**：不改任何 `*.py`、schema、数据口径；升级仅换 `frontend/dist`，不重启后端、不点「更新数据」。
- **版本**：`frontend/src/version.ts` 是版本唯一来源，本期 → `V2.9.0`。
- **不使用任何 emoji**；需要符号时用 `→ ↓ ❌ ✕ ▾`。
- **只引设计令牌**（`styles/theme.css` 的 `--*` 变量），不手写散值；不引新框架；不外链字体。
- **金额展示**一律用 `@/lib/format` 的 `fmtWan`（元→万，避免二次除万坑）；金额/日期/计数元素挂 `.u-num`（tabular-nums）。
- **状态色三态**「淡底+深字」：danger 用 `--danger-bg`+`--danger-text`，warn 用 `--warn-bg`+`--warn-text`；不写实底小号白字。muted 蓝紫不用于小号正文。
- **中文不加 `--ls-wide`、不大写**。
- 每个 commit 结尾附：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- 声称完成前 `bash verify.sh` 必须全绿。

## 文件结构

- **Create** `frontend/src/lib/todoQueue.ts` —— 纯函数 `buildTodoQueue(...)`，把回款/里程碑/成本超支聚合成排序好的待办队列 + 4 桶计数。唯一职责：计算。
- **Create** `frontend/src/lib/todoQueue.test.ts` —— 上面的单测。
- **Create** `frontend/src/components/TodoQueue.vue` —— 表现型组件：顶部 4 桶计数 chip + 7/30 天窗口切换，下方按紧急度扁平列表，行 `RouterLink` → `/project/:id`。唯一职责：渲染队列。
- **Create** `frontend/src/components/TodoQueue.test.ts` —— 组件挂载测试。
- **Modify** `frontend/src/views/OverviewView.vue` —— 三栏布局；装配 `TodoQueue`；异常卡默认内联 3 行、删 toggle；动态栏加数字条 + 要紧/ L4 过滤。
- **Modify** `frontend/src/views/OverviewView.test.ts` —— 更新受影响断言（动态默认要紧过滤、异常卡内联、新增 TodoQueue 存在）。
- **Modify** `frontend/src/version.ts` —— `V2.9.0`。

---

### Task 1: `lib/todoQueue.ts` 纯计算层

**Files:**
- Create: `frontend/src/lib/todoQueue.ts`
- Test: `frontend/src/lib/todoQueue.test.ts`

**Interfaces:**
- Consumes: `PayNodeRow`（`@/lib/paymentPmis`，字段 `projectId/projectName/stage/planDate/status/unpaidAmount`）、`MilestoneProject`（`@/lib/milestoneAnalytics`，字段 `projectId/projectName/nodes[]`，node 有 `name/planDate/actualDate`）、`RiskReason`（`@/lib/riskReasons`，字段 `category`）。
- Produces:
  - `type TodoBucket = '回款临期' | '回款已延期' | '里程碑' | '成本超支'`
  - `interface TodoItem { key: string; bucket: TodoBucket; stateLabel: string; tone: 'warn'|'danger'; projectId: string; projectName: string; date?: string; amount?: number; detail: string; urgencyRank: number; sortSub: number }`
  - `interface TodoQueueResult { items: TodoItem[]; counts: Record<TodoBucket, number> }`
  - `function buildTodoQueue(payNodes: PayNodeRow[], milestones: MilestoneProject[], projectRows: Array<{ projectId: string; projectName: string; riskReasons: RiskReason[]; overspendAmount: number }>, now: Date, windowDays: 7 | 30): TodoQueueResult`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/lib/todoQueue.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { buildTodoQueue } from './todoQueue'
import type { PayNodeRow } from './paymentPmis'
import type { MilestoneProject } from './milestoneAnalytics'
import type { RiskReason } from './riskReasons'

// 固定 now，避免日历脆弱
const NOW = new Date(2026, 6, 11) // 2026-07-11 (月份 0-based)
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

function payNode(over: Partial<PayNodeRow>): PayNodeRow {
  return {
    projectId: 'P', projectName: '项目', stage: '款', planDate: '', actualDate: '',
    payRatio: null, actualRatio: null, expectedPayment: 0, receivedAmount: 0, unpaidAmount: 0,
    projectManager: '', status: '', dept: '', orgL3_1: '', projStage: '', tier: '', progress: '',
    ...over,
  }
}
function ms(projectId: string, nodes: MilestoneProject['nodes']): MilestoneProject {
  return { projectId, projectName: projectId + '名', manager: '', orgL4: '', orgL3_1: '', orgL3: '', projectType: '', contract: 0, status: '正常', nodes }
}
function prow(projectId: string, cats: string[], overspendAmount: number) {
  return { projectId, projectName: projectId + '名', riskReasons: cats.map((c) => ({ category: c, detail: '', tone: 'danger' } as RiskReason)), overspendAmount }
}

describe('buildTodoQueue', () => {
  it('回款：延期→已延期桶(rank0)，今日到期→今到期(rank1)，窗口内→临期(rank2)', () => {
    const nodes: PayNodeRow[] = [
      payNode({ projectId: 'A', stage: 's1', status: '延期', planDate: ymd(2026, 6, 1), unpaidAmount: 1200000 }),
      payNode({ projectId: 'B', stage: 's2', status: '待回款', planDate: ymd(2026, 7, 11), unpaidAmount: 800000 }),
      payNode({ projectId: 'C', stage: 's3', status: '待回款', planDate: ymd(2026, 7, 15), unpaidAmount: 600000 }),
    ]
    const r = buildTodoQueue(nodes, [], [], NOW, 7)
    expect(r.counts['回款已延期']).toBe(1)
    expect(r.counts['回款临期']).toBe(2) // 今到期 + 临期
    expect(r.items.map((i) => i.stateLabel)).toEqual(['已延期', '今到期', '临期'])
  })

  it('窗口 7→30：窗口外临期节点在 7 天时不计、30 天时计入', () => {
    const nodes: PayNodeRow[] = [payNode({ projectId: 'D', stage: 's', status: '待回款', planDate: ymd(2026, 7, 25), unpaidAmount: 100000 })]
    expect(buildTodoQueue(nodes, [], [], NOW, 7).counts['回款临期']).toBe(0)
    expect(buildTodoQueue(nodes, [], [], NOW, 30).counts['回款临期']).toBe(1)
  })

  it('延期节点即使 planDate 落窗口也只进已延期，不双计', () => {
    const nodes: PayNodeRow[] = [payNode({ projectId: 'E', stage: 's', status: '延期', planDate: ymd(2026, 7, 12), unpaidAmount: 500000 })]
    const r = buildTodoQueue(nodes, [], [], NOW, 7)
    expect(r.counts['回款已延期']).toBe(1)
    expect(r.counts['回款临期']).toBe(0)
  })

  it('里程碑：planDate<今且未完成=滞后(rank3)，窗口内=临期(rank4)，已完成(actualDate非空)不计', () => {
    const projects: MilestoneProject[] = [
      ms('M1', [{ name: '终验', planDate: ymd(2026, 7, 1), actualDate: '' } as any]),
      ms('M2', [{ name: '初验', planDate: ymd(2026, 7, 13), actualDate: '' } as any]),
      ms('M3', [{ name: '到货', planDate: ymd(2026, 7, 1), actualDate: ymd(2026, 7, 2) } as any]),
    ]
    const r = buildTodoQueue([], projects, [], NOW, 7)
    expect(r.counts['里程碑']).toBe(2)
    expect(r.items.map((i) => i.stateLabel)).toEqual(['里程碑滞后', '里程碑临期'])
  })

  it('成本超支：命中 交付成本超支/总成本超支大于5000 入队，一项目一条，金额降序', () => {
    const rows = [
      prow('X', ['总成本超支大于5000'], 80000),
      prow('Y', ['交付成本超支', '总成本超支大于5000'], 50000), // 多原因只出一条
      prow('Z', ['总成本超支小于5000'], 3000), // 不入
    ]
    const r = buildTodoQueue([], [], rows as any, NOW, 7)
    expect(r.counts['成本超支']).toBe(2)
    expect(r.items.filter((i) => i.bucket === '成本超支').map((i) => i.projectId)).toEqual(['X', 'Y'])
  })

  it('混合桶整体按 urgencyRank 升序：已延期 < 今到期 < 临期 < 里程碑 < 超支', () => {
    const nodes: PayNodeRow[] = [
      payNode({ projectId: 'A', stage: 's', status: '延期', planDate: ymd(2026, 6, 1), unpaidAmount: 100 }),
      payNode({ projectId: 'B', stage: 's', status: '待回款', planDate: ymd(2026, 7, 11), unpaidAmount: 100 }),
    ]
    const projects: MilestoneProject[] = [ms('M', [{ name: '终验', planDate: ymd(2026, 7, 1), actualDate: '' } as any])]
    const rows = [prow('X', ['交付成本超支'], 60000)]
    const r = buildTodoQueue(nodes, projects, rows as any, NOW, 7)
    expect(r.items.map((i) => i.urgencyRank)).toEqual([0, 1, 3, 5])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/todoQueue.test.ts`
Expected: FAIL —— `buildTodoQueue` 未定义 / 模块不存在。

- [ ] **Step 3: 写最小实现**

创建 `frontend/src/lib/todoQueue.ts`：

```ts
import type { PayNodeRow } from './paymentPmis'
import type { MilestoneProject } from './milestoneAnalytics'
import type { RiskReason } from './riskReasons'

// 待办/临期 队列纯计算层（V2.9.0 首页）。now 由调用方注入，保持纯函数可测。
// 回款节点单状态互斥：status==='延期' 优先入「回款已延期」，否则再判临期窗口。
// 里程碑节点：actualDate 空且 planDate<今=滞后、窗口内=临期，二选一。
// 成本超支：riskReasons 命中 交付成本超支 ∪ 总成本超支大于5000，项目级一条。

export type TodoBucket = '回款临期' | '回款已延期' | '里程碑' | '成本超支'

export interface TodoItem {
  key: string
  bucket: TodoBucket
  stateLabel: string
  tone: 'warn' | 'danger'
  projectId: string
  projectName: string
  date?: string
  amount?: number
  detail: string
  urgencyRank: number
  sortSub: number
}

export interface TodoQueueResult {
  items: TodoItem[]
  counts: Record<TodoBucket, number>
}

// 「大于5000」两档中仅取超支档；交付超支恒入。判据用常量避免散写。
const OVERSPEND_TODO_CATS = new Set<string>(['交付成本超支', '总成本超支大于5000'])

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function dateNum(d: string): number {
  return Number(d.replace(/-/g, '')) || 0
}
const wan = (n: number) => (n / 10000).toFixed(1)

export function buildTodoQueue(
  payNodes: PayNodeRow[],
  milestones: MilestoneProject[],
  projectRows: Array<{ projectId: string; projectName: string; riskReasons: RiskReason[]; overspendAmount: number }>,
  now: Date,
  windowDays: 7 | 30,
): TodoQueueResult {
  const today = ymd(now)
  const until = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + windowDays))
  const items: TodoItem[] = []

  // 1. 回款：延期优先，否则判临期窗口（互斥）
  payNodes.forEach((n, i) => {
    const plan = String(n.planDate || '')
    if (n.status === '延期') {
      items.push({
        key: `pay-delayed-${i}-${n.projectId}`, bucket: '回款已延期', stateLabel: '已延期', tone: 'danger',
        projectId: n.projectId, projectName: n.projectName, date: plan, amount: n.unpaidAmount,
        detail: `已延期 · 待回 ${wan(n.unpaidAmount)} 万`, urgencyRank: 0, sortSub: -n.unpaidAmount,
      })
    } else if (n.status !== '已回款' && plan) {
      if (plan === today) {
        items.push({
          key: `pay-due-${i}-${n.projectId}`, bucket: '回款临期', stateLabel: '今到期', tone: 'warn',
          projectId: n.projectId, projectName: n.projectName, date: plan, amount: n.unpaidAmount,
          detail: `今到期 · 待回 ${wan(n.unpaidAmount)} 万`, urgencyRank: 1, sortSub: -n.unpaidAmount,
        })
      } else if (plan > today && plan <= until) {
        items.push({
          key: `pay-soon-${i}-${n.projectId}`, bucket: '回款临期', stateLabel: '临期', tone: 'warn',
          projectId: n.projectId, projectName: n.projectName, date: plan, amount: n.unpaidAmount,
          detail: `${plan.slice(5)} 到期 · 待回 ${wan(n.unpaidAmount)} 万`, urgencyRank: 2, sortSub: dateNum(plan),
        })
      }
    }
  })

  // 2. 里程碑：actualDate 空，planDate<今=滞后 / 窗口内=临期
  milestones.forEach((p) => {
    p.nodes.forEach((nd, j) => {
      if ((nd.actualDate ?? '').trim()) return
      const plan = (nd.planDate ?? '').slice(0, 10)
      if (!plan) return
      if (plan < today) {
        items.push({
          key: `ms-lag-${p.projectId}-${j}`, bucket: '里程碑', stateLabel: '里程碑滞后', tone: 'danger',
          projectId: p.projectId, projectName: p.projectName, date: plan,
          detail: `${nd.name} · 计划 ${plan.slice(5)}`, urgencyRank: 3, sortSub: dateNum(plan),
        })
      } else if (plan <= until) {
        items.push({
          key: `ms-soon-${p.projectId}-${j}`, bucket: '里程碑', stateLabel: '里程碑临期', tone: 'warn',
          projectId: p.projectId, projectName: p.projectName, date: plan,
          detail: `${nd.name} · 计划 ${plan.slice(5)}`, urgencyRank: 4, sortSub: dateNum(plan),
        })
      }
    })
  })

  // 3. 成本超支 >5000（项目级去重，一项目一条）
  projectRows.forEach((r) => {
    if (r.riskReasons.some((rr) => OVERSPEND_TODO_CATS.has(rr.category))) {
      items.push({
        key: `over-${r.projectId}`, bucket: '成本超支', stateLabel: '超支', tone: 'danger',
        projectId: r.projectId, projectName: r.projectName, amount: r.overspendAmount,
        detail: `超支 ${wan(r.overspendAmount)} 万`, urgencyRank: 5, sortSub: -r.overspendAmount,
      })
    }
  })

  items.sort((a, b) => a.urgencyRank - b.urgencyRank || a.sortSub - b.sortSub)

  const counts: Record<TodoBucket, number> = { '回款临期': 0, '回款已延期': 0, '里程碑': 0, '成本超支': 0 }
  for (const it of items) counts[it.bucket]++

  return { items, counts }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/todoQueue.test.ts`
Expected: PASS（6 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/todoQueue.ts frontend/src/lib/todoQueue.test.ts
git commit -m "$(cat <<'EOF'
feat(overview): 新增 lib/todoQueue 待办队列纯计算层(V2.9.0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `components/TodoQueue.vue` 表现型组件

**Files:**
- Create: `frontend/src/components/TodoQueue.vue`
- Test: `frontend/src/components/TodoQueue.test.ts`

**Interfaces:**
- Consumes: `TodoQueueResult`（Task 1）、`SegToggle`（`@/components/SegToggle.vue`，props `modelValue:string` + `options:{value,label}[]`，emit `update:modelValue`）。
- Produces: 组件 `<TodoQueue :result :window-days @update:window-days />`
  - props：`result: TodoQueueResult`、`windowDays: 7 | 30`
  - emits：`update:windowDays`（值为 `7 | 30`）
  - 行为：顶部 4 桶计数 chip（点击切换 `activeBucket` 过滤，再点同桶取消）+ 窗口 SegToggle；下方 `RouterLink` 行 `to=/project/{projectId}`。

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/components/TodoQueue.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TodoQueue from './TodoQueue.vue'
import type { TodoQueueResult } from '@/lib/todoQueue'

const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/', component: { template: '<div/>' } },
  { path: '/project/:id', component: { template: '<div/>' } },
] })

const result: TodoQueueResult = {
  items: [
    { key: 'k1', bucket: '回款已延期', stateLabel: '已延期', tone: 'danger', projectId: 'A', projectName: '甲', amount: 1200000, detail: '已延期 · 待回 120.0 万', urgencyRank: 0, sortSub: -1200000 },
    { key: 'k2', bucket: '成本超支', stateLabel: '超支', tone: 'danger', projectId: 'B', projectName: '乙', amount: 80000, detail: '超支 8.0 万', urgencyRank: 5, sortSub: -80000 },
  ],
  counts: { '回款临期': 3, '回款已延期': 1, '里程碑': 2, '成本超支': 4 },
}

function mountQ() {
  return mount(TodoQueue, { props: { result, windowDays: 7 }, global: { plugins: [router] } })
}

describe('TodoQueue', () => {
  it('渲染 4 桶计数与全部条目', () => {
    const w = mountQ()
    expect(w.text()).toContain('已延期')
    expect(w.text()).toContain('超支')
    expect(w.findAll('.tq-item')).toHaveLength(2)
  })

  it('行链接指向 /project/:id', () => {
    const w = mountQ()
    expect(w.find('a[href="/project/A"]').exists()).toBe(true)
  })

  it('点击桶计数过滤列表，再点取消', async () => {
    const w = mountQ()
    await w.find('[data-test="tq-bucket-成本超支"]').trigger('click')
    expect(w.findAll('.tq-item')).toHaveLength(1)
    expect(w.find('.tq-item').text()).toContain('乙')
    await w.find('[data-test="tq-bucket-成本超支"]').trigger('click')
    expect(w.findAll('.tq-item')).toHaveLength(2)
  })

  it('切换窗口 emit update:windowDays', async () => {
    const w = mountQ()
    await w.find('[data-test="seg-30"]').trigger('click')
    expect(w.emitted('update:windowDays')?.[0]).toEqual([30])
  })

  it('空队列显示空态', () => {
    const w = mount(TodoQueue, { props: { result: { items: [], counts: { '回款临期': 0, '回款已延期': 0, '里程碑': 0, '成本超支': 0 } }, windowDays: 7 }, global: { plugins: [router] } })
    expect(w.text()).toContain('暂无待办')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/TodoQueue.test.ts`
Expected: FAIL —— 组件不存在。

- [ ] **Step 3: 写实现**

创建 `frontend/src/components/TodoQueue.vue`：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TodoBucket, TodoQueueResult } from '@/lib/todoQueue'
import SegToggle from '@/components/SegToggle.vue'

const props = defineProps<{ result: TodoQueueResult; windowDays: 7 | 30 }>()
const emit = defineEmits<{ 'update:windowDays': [7 | 30] }>()

// 4 桶展示顺序与短标
const BUCKETS: { key: TodoBucket; short: string }[] = [
  { key: '回款临期', short: '临期' },
  { key: '回款已延期', short: '已延期' },
  { key: '里程碑', short: '里程碑' },
  { key: '成本超支', short: '超支' },
]
const WINDOW_OPTS = [
  { value: '7', label: '7天' },
  { value: '30', label: '30天' },
]

const activeBucket = ref<TodoBucket | ''>('')
function toggleBucket(k: TodoBucket) { activeBucket.value = activeBucket.value === k ? '' : k }

const visibleItems = computed(() =>
  activeBucket.value ? props.result.items.filter((i) => i.bucket === activeBucket.value) : props.result.items,
)

const winStr = computed({
  get: () => String(props.windowDays),
  set: (v: string) => emit('update:windowDays', v === '30' ? 30 : 7),
})
</script>

<template>
  <div class="tq">
    <div class="tq-head">
      <span class="tq-title">待办 / 临期</span>
      <SegToggle v-model="winStr" :options="WINDOW_OPTS" />
    </div>
    <div class="tq-counts">
      <button
        v-for="b in BUCKETS" :key="b.key" type="button"
        class="tq-count" :class="{ on: activeBucket === b.key }"
        :data-test="`tq-bucket-${b.key}`" @click="toggleBucket(b.key)"
      >
        <span class="tq-count-k">{{ b.short }}</span>
        <span class="tq-count-v u-num">{{ result.counts[b.key] }}</span>
      </button>
    </div>
    <div v-if="visibleItems.length" class="tq-list">
      <RouterLink
        v-for="it in visibleItems" :key="it.key" class="tq-item"
        :to="`/project/${it.projectId}`"
      >
        <span class="tq-state" :class="`tone-${it.tone}`">{{ it.stateLabel }}</span>
        <span class="tq-name">{{ it.projectName }}</span>
        <span class="tq-detail u-num">{{ it.detail }}</span>
      </RouterLink>
    </div>
    <div v-else class="tq-empty">暂无待办</div>
  </div>
</template>

<style scoped>
.tq { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); box-shadow: var(--shadow-1); }
.tq-head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.tq-title { font-size: var(--fs-2); font-weight: 700; color: var(--txt); }
.tq-counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sp-2); margin-bottom: var(--sp-3); }
.tq-count { display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--line); background: var(--card2); border-radius: var(--r-sm); padding: var(--sp-1) 0; cursor: pointer; transition: background-color var(--dur-1) var(--ease); }
.tq-count:hover { background: var(--hover-tint); }
.tq-count.on { background: var(--selected-tint); border-color: var(--accent); }
.tq-count-k { font-size: var(--fs-1); color: var(--mut); }
.tq-count-v { font-size: var(--fs-3); font-weight: 700; color: var(--txt); }
.tq-list { display: flex; flex-direction: column; gap: 2px; max-height: 420px; overflow-y: auto; }
.tq-item { display: flex; align-items: baseline; gap: var(--sp-2); padding: var(--sp-1) var(--sp-1); border-radius: var(--r-sm); text-decoration: none; }
.tq-item:hover { background: var(--hover-tint); }
.tq-state { flex-shrink: 0; font-size: var(--fs-1); font-weight: 600; padding: 0 var(--sp-2); border-radius: var(--r-full); line-height: 1.7; }
.tq-state.tone-warn { background: var(--warn-bg); color: var(--warn-text); }
.tq-state.tone-danger { background: var(--danger-bg); color: var(--danger-text); }
.tq-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--accent); font-weight: 600; }
.tq-detail { flex-shrink: 0; font-size: var(--fs-1); color: var(--sub); white-space: nowrap; }
.tq-empty { font-size: var(--fs-1); color: var(--mut); padding: var(--sp-4) 0; text-align: center; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/TodoQueue.test.ts`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/TodoQueue.vue frontend/src/components/TodoQueue.test.ts
git commit -m "$(cat <<'EOF'
feat(overview): 新增 TodoQueue 待办/临期 组件(V2.9.0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: OverviewView 三栏布局 + 装配 TodoQueue

**Files:**
- Modify: `frontend/src/views/OverviewView.vue`
- Modify: `frontend/src/views/OverviewView.test.ts`

**Interfaces:**
- Consumes: `buildTodoQueue`（Task 1）、`TodoQueue`（Task 2）、`buildMilestoneProjects`（`@/lib/milestoneAnalytics`，签名 `(projects, pmis, milestones, opts?)→MilestoneProject[]`）、已有 `buildProjectRows`、`paymentNodeRows`。
- Produces: 三栏 `ov-lower`；中列 `<TodoQueue>`。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/OverviewView.test.ts` 的 `describe('OverviewView', ...)` 内追加：

```ts
  it('中列渲染待办/临期队列(有延期回款节点时非空)', async () => {
    seed()
    const w = await mountView()
    expect(w.text()).toContain('待办 / 临期')
    // seed P-1 有 status='延期' 节点 → 至少一条已延期待办
    expect(w.findAll('.tq-item').length).toBeGreaterThanOrEqual(1)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/OverviewView.test.ts -t "待办/临期队列"`
Expected: FAIL —— 页面不含「待办 / 临期」。

- [ ] **Step 3: 改 `OverviewView.vue` 脚本**

3a. 在 `<script setup>` import 区追加（紧跟现有 import）：

```ts
import TodoQueue from '@/components/TodoQueue.vue'
import { buildTodoQueue } from '@/lib/todoQueue'
import { buildMilestoneProjects } from '@/lib/milestoneAnalytics'
```

3b. 在 `rows`/`classEntries` 计算属性之后追加待办队列数据（`rows` 已是 `buildProjectRows(...)`）：

```ts
// 待办/临期 队列（7/30 天窗口）
const todoWindow = ref<7 | 30>(7)
const milestoneProjects = computed(() =>
  buildMilestoneProjects(projects.value, pmisMap.value, (data.data?.projectMilestones ?? {}) as Record<string, any>),
)
const payNodes = computed(() => paymentNodeRows(data.data?.paymentNodes, projects.value, data.data?.projectPmis))
const pidOverspend = computed(() => new Map(projects.value.map((p) => [p.projectId, p.overspendAmount ?? 0])))
const todoRows = computed(() =>
  rows.value.map((r) => ({ projectId: r.projectId, projectName: r.projectName, riskReasons: r.riskReasons, overspendAmount: pidOverspend.value.get(r.projectId) ?? 0 })),
)
const todoResult = computed(() => buildTodoQueue(payNodes.value, milestoneProjects.value, todoRows.value, new Date(), todoWindow.value))
```

并把 `import { computed, onMounted, reactive } from 'vue'` 改为包含 `ref`：

```ts
import { computed, onMounted, reactive, ref } from 'vue'
```

- [ ] **Step 4: 改 `OverviewView.vue` 模板 —— 三栏 + 中列 TodoQueue**

把 `<div class="ov-lower"> … </div>` 内部由「异常 section + aside」两块，改为三块（异常 section 保持不动，在其后、aside 之前插入中列）：

```html
    <div class="ov-lower">
      <section class="ov-anomaly">
        <!-- 原有异常 section 内容保持不变（Task 4 再改内联） -->
        ...
      </section>

      <section class="ov-todo">
        <TodoQueue :result="todoResult" v-model:window-days="todoWindow" />
      </section>

      <aside class="ov-aside">
        <!-- 原有动态 aside 内容保持不变（Task 5 再增强） -->
        ...
      </aside>
    </div>
```

- [ ] **Step 5: 改 `OverviewView.vue` 样式 —— `.ov-lower` 三栏**

把 `.ov-lower` 规则改为三栏，并在 `@media (max-width: 1200px)` 内保持单列：

```css
.ov-lower { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
```

`@media (max-width: 1200px)` 块内已有 `.ov-lower { grid-template-columns: 1fr; }`，保持不变（三栏在窄屏自动堆叠）。

- [ ] **Step 6: 跑受影响测试确认通过**

Run: `cd frontend && npx vitest run src/views/OverviewView.test.ts`
Expected: PASS（含新加「待办/临期队列」用例；原有用例仍绿——本任务未改动画态与异常卡）。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/views/OverviewView.vue frontend/src/views/OverviewView.test.ts
git commit -m "$(cat <<'EOF'
feat(overview): 下半区改三栏并装配 TodoQueue 待办队列(V2.9.0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 异常卡默认内联前 3 行（去掉逐个展开）

**Files:**
- Modify: `frontend/src/views/OverviewView.vue`
- Modify: `frontend/src/views/OverviewView.test.ts`

**Interfaces:**
- Consumes: 已有 `anomalyCards`、`cardItems(cat)`、`catLink(cat)`、`BLURB`、`router`。
- Produces: 异常卡默认内联 top-3；移除 `expanded`/`toggle`。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/OverviewView.test.ts` 追加：

```ts
  it('异常卡默认内联显示项目行(无需点展开)且无展开按钮', async () => {
    seed()
    const w = await mountView()
    // seed P-1 命中回款延期/成本超支等 → 至少一张卡，且默认可见项目名「风险甲」
    expect(w.find('.ov-acard-item').exists()).toBe(true)
    expect(w.text()).toContain('风险甲')
    // 旧「展开 ▾」toggle 已移除
    expect(w.find('.ov-acard-toggle').exists()).toBe(false)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/OverviewView.test.ts -t "异常卡默认内联"`
Expected: FAIL —— 当前 `.ov-acard-item` 藏在未展开的 `expanded` 里、且 `.ov-acard-toggle` 存在。

- [ ] **Step 3: 改脚本 —— 删展开状态、cardItems 截断 3**

3a. 删除这两行（`expanded` reactive 与 `toggle`）：

```ts
const expanded = reactive<Record<string, boolean>>({})
function toggle(cat: string) { expanded[cat] = !expanded[cat] }
```

（随之把 `import { computed, onMounted, reactive, ref } from 'vue'` 中不再使用的 `reactive` 去掉 → `import { computed, onMounted, ref } from 'vue'`。）

3b. `cardItems` 的 `slice(0, 5)` 改 `slice(0, 3)`（延期分支的 `delayedTop` 也截 3）：

将
```ts
  if (cat === '回款延期' && band.value.delayedTop.length) {
    return band.value.delayedTop.map((t, i) => ({
```
下方 `delayedTop` 已是 top-3（`paymentBand` 返回 `slice(0,3)`），无需改；仅改另一分支：

```ts
  return (entry?.projects ?? []).slice(0, 3).map((p, i) => ({
```

- [ ] **Step 4: 改模板 —— 内联渲染，去 toggle/展开容器**

把异常卡 `<div class="ov-acard-ops">…</div>` 与其后的 `v-if="expanded[...]"` 容器，替换为「操作行只留查看清单 + 始终内联的 body」：

```html
            <div class="ov-acard-body">
              <button v-for="it in cardItems(c.category)" :key="it.key" type="button"
                class="ov-acard-item" @click="router.push(`/project/${it.projectId}`)">
                <span class="ov-acard-item-name">{{ it.primary }}</span>
                <span class="ov-acard-item-detail">{{ it.secondary }}</span>
              </button>
              <RouterLink v-if="c.count > cardItems(c.category).length" class="ov-acard-all" :to="catLink(c.category)">
                查看全部 {{ c.count }} 个 →
              </RouterLink>
            </div>
```

即：删除含 `ov-acard-toggle`/`ov-acard-arrow` 的 `<div class="ov-acard-ops">`（连同其中的「查看清单」链接与展开按钮），`ov-acard-body` 去掉 `v-if="expanded[...]"` 让其始终渲染。`ov-acard-blurb` 保留。

- [ ] **Step 5: 清理无用 CSS（可选但推荐）**

删除不再引用的 `.ov-acard-ops`、`.ov-acard-toggle`、`.ov-acard-arrow`、`.ov-acard-arrow--open`、`.ov-acard-link` 规则（若 `typecheck`/`build` 不因未用 CSS 报错则非阻塞；为整洁一并删）。异常卡在 1/3 宽列内自动单列：`.ov-anomaly-grid` 的 `repeat(auto-fit, minmax(280px, 1fr))` 在窄列回落单列，无需改。

- [ ] **Step 6: 跑受影响测试确认通过**

Run: `cd frontend && npx vitest run src/views/OverviewView.test.ts`
Expected: PASS。注意原「异常分诊区…」用例仍需绿（仍含标题、仍 `not.toContain('健康度低')`）。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/views/OverviewView.vue frontend/src/views/OverviewView.test.ts
git commit -m "$(cat <<'EOF'
feat(overview): 异常卡默认内联前3行、去逐个展开(V2.9.0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 项目动态加强（本期变化数字条 + 默认要紧 + L4 快筛）

**Files:**
- Modify: `frontend/src/views/OverviewView.vue`
- Modify: `frontend/src/views/OverviewView.test.ts`

**Interfaces:**
- Consumes: `data.data.periodCompare?.lastSync`（`PeriodCompareEntry`：`advancedProjects/newDelayedNodes/paymentGained/riskNetChange`）、`filterEvents`（`@/lib/activity`）、`SegToggle`、已有 `fmtWan`。
- Produces: 动态栏顶部数字条 + 「只看要紧/全部」切换 + L4 下拉；事件默认要紧过滤。

- [ ] **Step 1: 写失败测试 + 修既有耦合断言**

先**更新既有会被打破的用例**「右栏动态最多 10 条 + 查看全部链接」：新逻辑默认只看要紧（`tone∈warn/danger`），而 `seed()` 事件无 `tone` → 默认过滤后为 0 条。改造该用例的 `seed` 事件带 tone 并断言默认要紧行为。

替换 `seed()` 中的 `events:` 定义为（10 条 danger + 2 条无 tone）：

```ts
    events: [
      ...Array.from({ length: 10 }, (_, i) => ({
        date: iso(now), type: '延期', domain: 'project', projectId: 'P-1', projectName: '风险甲', summary: `要紧${i}`, tone: 'danger',
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        date: iso(now), type: '到账', domain: 'payment', projectId: 'P-1', projectName: '风险甲', summary: `普通${i}`,
      })),
    ],
```

把原用例「右栏动态最多 10 条 + 查看全部链接」替换为：

```ts
  it('右栏动态默认只看要紧(过滤无 tone 事件)且有查看全部链接', async () => {
    seed()
    const w = await mountView()
    // 12 条事件中仅 10 条 danger 计入（2 条无 tone 被默认要紧过滤）
    expect(w.findAll('.ev-item')).toHaveLength(10)
    expect(w.find('a[href="/activity"]').exists()).toBe(true)
  })

  it('切到「全部」后普通事件也显示', async () => {
    seed()
    const w = await mountView()
    await w.find('[data-test="seg-all"]').trigger('click')
    expect(w.text()).toContain('普通0')
  })

  it('本期变化数字条:有 periodCompare 时显示、无时不渲染', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).periodCompare = { lastSync: { baseDate: '2026-07-01', advancedProjects: 4, newDelayedNodes: 2, paymentGained: 3500000, riskNetChange: 1 } }
    const w = await mountView()
    expect(w.find('.ov-digest').exists()).toBe(true)
    expect(w.find('.ov-digest').text()).toContain('阶段推进')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/OverviewView.test.ts -t "动态默认只看要紧"`
Expected: FAIL —— 当前无要紧过滤、无 `data-test="seg-all"`、无 `.ov-digest`。

- [ ] **Step 3: 改脚本 —— 数字条 + 要紧/L4 过滤**

3a. import 追加：

```ts
import SegToggle from '@/components/SegToggle.vue'
import { filterEvents } from '@/lib/activity'
```

3b. 删除旧 `recentEvents`（将被 `shownEvents` 取代）：

```ts
const recentEvents = computed(() => ((data.data?.events ?? []) as Event[]).slice(0, 10))
```

3c. 追加数字条 + 事件过滤逻辑：

```ts
// 本期变化数字条（基线=上次同步；快照不足则 null 不渲染）
const digest = computed(() => {
  const e = data.data?.periodCompare?.lastSync
  if (!e) return null
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n))
  return [
    { k: '阶段推进', v: String(e.advancedProjects ?? 0) },
    { k: '新增延期', v: String(e.newDelayedNodes ?? 0) },
    { k: '回款新增', v: `${fmtWan(e.paymentGained ?? 0)}万` },
    { k: '风险净增', v: sign(e.riskNetChange ?? 0) },
  ]
})

// 事件：默认只看要紧（tone∈warn/danger）+ L4 快筛
const EV_SCOPE_OPTS = [
  { value: 'important', label: '只看要紧' },
  { value: 'all', label: '全部' },
]
const evScope = ref('important') // 'important' | 'all'（用 string 避免 SegToggle v-model 回写 string 时的联合类型不可赋值）
const evL4 = ref('')
const pidL4 = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const p of projects.value) { if (p.projectId && p.orgL4) map[p.projectId] = String(p.orgL4) }
  return map
})
const l4Options = computed(() => {
  const set = new Set<string>()
  for (const p of projects.value) { if (p.orgL4) set.add(String(p.orgL4)) }
  return [{ value: '', label: '全部 L4' }, ...[...set].sort((a, b) => a.localeCompare(b, 'zh-CN')).map((v) => ({ value: v, label: v }))]
})
const shownEvents = computed(() => {
  let evs = (data.data?.events ?? []) as Event[]
  if (evScope.value === 'important') evs = evs.filter((e) => e.tone === 'warn' || e.tone === 'danger')
  if (evL4.value) evs = filterEvents(evs, { domain: '', query: '', types: [], l4: evL4.value }, pidL4.value)
  return evs.slice(0, 10)
})
```

- [ ] **Step 4: 改模板 —— aside 顶部数字条 + 工具行**

把 `<aside class="ov-aside"> … </aside>` 内容改为：

```html
      <aside class="ov-aside">
        <div class="ov-aside-title">项目动态</div>
        <div v-if="digest" class="ov-digest">
          <span v-for="d in digest" :key="d.k" class="ov-digest-i">
            <span class="ov-digest-k">{{ d.k }}</span>
            <span class="ov-digest-v u-num">{{ d.v }}</span>
          </span>
        </div>
        <div class="ov-ev-tools">
          <SegToggle v-model="evScope" :options="EV_SCOPE_OPTS" />
          <el-select v-model="evL4" size="small" style="width: 120px">
            <el-option v-for="o in l4Options" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </div>
        <EventTimeline :events="shownEvents" empty-text="暂无要紧动态" />
        <RouterLink class="ov-more" to="/activity">查看全部 →</RouterLink>
      </aside>
```

（`EventTimeline` import 保留；`empty-text` 由「首次同步…」改「暂无要紧动态」——要紧过滤后可能为空。空态文案变化不被既有断言约束：无数据空态用例用的是 `paymentNodes/events` 全空，走的仍是新文案，需同步该用例，见 Step 5。）

- [ ] **Step 5: 同步无数据空态用例文案**

「无数据空态不崩」用例原断言 `toContain('首次同步，暂无变化记录')`。空态下 events 为空、要紧过滤后仍空，`EventTimeline` 显示新 `empty-text`「暂无要紧动态」。更新该断言：

```ts
    expect(w.text()).toContain('暂无要紧动态')
```

- [ ] **Step 6: 加数字条与工具行样式**

在 `<style scoped>` 末尾追加：

```css
.ov-digest { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--sp-1) var(--sp-3); padding: var(--sp-2) 0; margin-bottom: var(--sp-2); border-bottom: 1px solid var(--line); }
.ov-digest-i { display: flex; align-items: baseline; justify-content: space-between; gap: var(--sp-2); }
.ov-digest-k { font-size: var(--fs-1); color: var(--mut); }
.ov-digest-v { font-size: var(--fs-2); font-weight: 700; color: var(--txt); }
.ov-ev-tools { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); flex-wrap: wrap; }
```

- [ ] **Step 7: 跑受影响测试确认通过**

Run: `cd frontend && npx vitest run src/views/OverviewView.test.ts`
Expected: PASS（全部用例，含更新后的动态/空态用例）。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/views/OverviewView.vue frontend/src/views/OverviewView.test.ts
git commit -m "$(cat <<'EOF'
feat(overview): 项目动态加本期变化数字条+默认要紧+L4快筛(V2.9.0)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 版本号 + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：

```ts
export const APP_VERSION = 'V2.9.0'
export const RELEASE_DATE = '2026-07-11'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（后端 pytest 不受影响；前端 typecheck + vitest 全绿——含 `todoQueue`、`TodoQueue`、`OverviewView` 用例 + build）。

若 `verify.sh` 因未用 CSS/变量报 lint/build 失败，回到 Task 4 Step 5 清理残留 CSS 或去掉未用 import。

- [ ] **Step 3: 手动冒烟（真实数据）**

```bash
python server.py            # :8080
cd frontend && npm run dev  # :5173
```

核对：
- 首页下半区三栏并列（异常 | 待办 | 动态），窄屏堆叠不错位；
- 待办 4 桶计数与 `/payment`（延期/临期）、`/milestone`（滞后）、`/projects?riskCategory=…`（成本超支>5000）交叉一致；7/30 切换只改临期数；行点击进 `/project/:id`；
- 异常卡默认内联 3 行、「查看全部 N 个」跳转正确、无「展开」按钮；
- 动态数字条与 `/activity` 周期对比一致（无快照则不显示）；默认只看要紧，切「全部」出普通事件，L4 快筛生效；
- 无 console 报错。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts
git commit -m "$(cat <<'EOF'
chore(release): V2.9.0 首页总览下半区重做(待办队列+异常内联+动态加强)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 打包与部署（实现全绿后）

> 纯前端增量包，流程同 V2.8.x。**用 PowerShell**（Git Bash 会篡改 `--base=/pm/`）。

```powershell
cd frontend; npx vite build --base=/pm/          # /pm 构建
# 校验：grep -o '/pm/assets[^"]*' frontend/dist/index.html | head -1  应含 /pm/assets
cd ..; python make_update_zip.py                  # 产 release/pmplatform-update-V2.9.0.zip
```

- 出包后**本地 dist 须用默认 base 重建**（`cd frontend; npx vite build`），否则本地 `server.py`(:8080) 白屏。
- 写 `deploy/升级手册-V2.9.0.md`（仿 V2.8.5：纯前端仅换 dist、不重启后端、不点更新数据、从基线 V2.8.5 增量）。
- `make_update_zip.py` 会把手册纳入包（`EXTRA_FILES` 读 `升级手册-{VERSION}.md`），故打包前先写好手册。

## Self-Review 结论

- **Spec 覆盖**：§1 三栏布局→Task 3；§2 待办队列→Task 1(计算)+Task 2(组件)+Task 3(装配)；§3 异常内联→Task 4；§4 动态加强→Task 5；§5 版本→Task 6。全覆盖。
- **占位扫描**：无 TBD/TODO；每个代码步给出完整代码。
- **类型一致**：`buildTodoQueue`/`TodoQueueResult`/`TodoBucket`/`TodoItem` 在 Task 1 定义，Task 2/3 消费签名一致；`v-model:window-days` ↔ `update:windowDays`（`7|30`）一致；`evScope`('important'|'all')↔`data-test="seg-all"` 一致。
- **既有测试耦合**（重点）：Task 5 显式改写「右栏动态最多 10 条」与「无数据空态」两条既有用例（默认要紧过滤 + 空态文案变化），避免假绿/误红。
