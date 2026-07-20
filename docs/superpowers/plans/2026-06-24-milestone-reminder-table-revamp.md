# /insight/milestone 到期提醒表改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/insight/milestone` 的「到期提醒」Tab 从"固定三档时间窗 + 只列未完成节点 + 散装筛选条"改造为"时间段选择 + 含已完成的到期清单 + 照搬 /projects 表格栈（选列/逐列筛选/排序/按筛选导出/分页）"。

**Architecture:** 复用 /projects 既有原语（方案 A，镜像 ProjectsView/KeyProjectsView），不改 /projects、不引新抽象。改两份文件：`lib/milestoneDetailRows.ts`（纯函数数据层：新行口径+新字段+时间段+汇总）与 `components/MilestoneReminderTab.vue`（组件重建）。MilestoneView 不改（已 `:projects="mps" :now="now"` 传入）。

**Tech Stack:** Vue3 `<script setup>` + TS + Element Plus + Pinia（crossFilter store）+ vitest。复用 `useColumnPrefs`/`ColumnPicker`/`ColumnFilter`/`crossFilter`/`DataTable`/`exportRows`。

## Global Constraints

- 禁止使用任何 emoji 装饰；需要符号用 `→ ↓ ❌ ✕ ▾`。
- 表格数字列必须挂 `.u-num`（DataTable 的 `num:true` 列自动挂；金额/日期数字列须标 num）。
- 间距/圆角/字号/颜色只引用设计令牌 `var(--*)`，不手写散值（像素硬编码、散写十六进制色值均违规）；沿用现有 `.mrt-*` 样式令牌。
- 版本 **V1.20.2**（`frontend/src/version.ts` 单一来源，Z 位），与累积未上线版本一并待打包。
- commit message 末尾保留 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` 行；spec/plan 文档写盘不 commit。
- 纯前端：不改后端、schema、核心口径；不动 MilestoneView 其它区块与「延期清单」「在建里程碑计划」两个 Tab。
- 行口径：时间段内 `计划时间(planDate)∈区间` 的全部里程碑节点都成行（**含已完成**，不再跳过 actualDate 非空者）。

---

## File Structure

- `frontend/src/lib/milestoneDetailRows.ts` — 纯函数数据层。改 `ReminderRow`、`buildReminderRows`、`reminderStat`，新增 `reminderRange`/`ReminderPreset`；删 `ReminderWin`（仅本文件+其测试+本组件用，无其它消费方，已 grep 核实）。`buildDelayedRows`/`buildPlanRows`/`NODE_TYPES`/`dayDiff` 不动。
- `frontend/src/lib/milestoneDetailRows.test.ts` — 重写 `buildReminderRows / reminderStat` 的 describe；`buildDelayedRows`/`buildPlanRows` 的 describe 不动。
- `frontend/src/components/MilestoneReminderTab.vue` — 组件重建（时间段选择 + 新列/行 + 汇总卡 + 分页 + 行点击；再叠加 选列/逐列筛选/关键词/排序/导出）。
- `frontend/src/components/MilestoneReminderTab.test.ts` — 重写。

---

### Task 1: 数据层 — 新行口径 + 新字段 + 时间段 + 汇总（milestoneDetailRows.ts）

**Files:**
- Modify: `frontend/src/lib/milestoneDetailRows.ts`
- Test: `frontend/src/lib/milestoneDetailRows.test.ts`

**Interfaces:**
- Consumes: `MilestoneProject`（含 projectId/projectName/projectType/manager/orgL3/orgL4/contract/nodes[{name,planDate,actualDate,payStage,priority}]）、已导入的 `ymd`/`reminderBounds`/`addDays`（来自 `./milestoneAnalytics`）。
- Produces:
  - `interface ReminderRow { projectId; projectName; projectType; manager; orgL3; orgL4; node; planDate; payStage; linked:'是'|'否'; priority; priorityLabel; urgency:'urgent'|'warn'|''; contract:number; actualDate:string; done:'是'|'否'; overdue:boolean }`
  - `type ReminderPreset = 'd7' | 'm1' | 'quarter'`
  - `function reminderRange(now: Date, preset: ReminderPreset): { start: string; end: string }`
  - `function buildReminderRows(ps: MilestoneProject[], now: Date, range: { start: string; end: string } | null): ReminderRow[]`
  - `interface ReminderStat { total:number; done:number; undone:number; overdue:number }`
  - `function reminderStat(rows: ReminderRow[]): ReminderStat`

- [ ] **Step 1: 重写失败测试**

把 `frontend/src/lib/milestoneDetailRows.test.ts` 顶部 import 改为：

```typescript
import { describe, it, expect } from 'vitest'
import { buildDelayedRows, buildReminderRows, reminderRange, reminderStat, buildPlanRows } from './milestoneDetailRows'
```

将文件中 `describe('buildReminderRows / reminderStat', ...)` 整段（约 8-34 行）替换为：

```typescript
describe('buildReminderRows / reminderStat (含已完成)', () => {
  const now = new Date(2026, 2, 10) // 2026-03-10
  const ps = [
    mp({ projectId: 'A', manager: '张', contract: 1234567, nodes: [
      { name: '到货', planDate: '2026-03-12', actualDate: '', payStage: '到货款', priority: 'high' }, // 区间内未完成,关联回款
      { name: '初验', planDate: '2026-04-05', actualDate: '', payStage: '', priority: 'mid' },          // 区间内未完成
      { name: '终验', planDate: '2026-03-15', actualDate: '2026-03-16', priority: 'high' },             // 区间内已完成
      { name: '关闭', planDate: '2026-02-01', actualDate: '', priority: 'low' },                        // 过期未完成
    ] }),
  ]

  it('区间内全部节点成行(含已完成),新字段齐', () => {
    const rows = buildReminderRows(ps, now, { start: '2026-03-01', end: '2026-03-31' })
    // 到货(03-12)、终验(03-15) 在 03-01..03-31;初验(04-05)出区间;关闭(02-01)出区间
    expect(rows.map((r) => r.node).sort()).toEqual(['到货', '终验'])
    const arr = rows.find((r) => r.node === '到货')!
    expect(arr).toMatchObject({ contract: 1234567, actualDate: '', done: '否', linked: '是', priority: 'high', priorityLabel: '高', urgency: 'urgent', overdue: false })
    const fin = rows.find((r) => r.node === '终验')!
    expect(fin).toMatchObject({ actualDate: '2026-03-16', done: '是', urgency: '', overdue: false })
  })

  it('已完成节点 done=是、urgency 空;逾期未完成 overdue=true', () => {
    const rows = buildReminderRows(ps, now, null) // null=全部
    const close = rows.find((r) => r.node === '关闭')!
    expect(close).toMatchObject({ done: '否', overdue: true }) // 02-01<今且未完成
    expect(rows.find((r) => r.node === '终验')!.done).toBe('是')
  })

  it('range=null 取全部到期节点;闭区间端点含', () => {
    expect(buildReminderRows(ps, now, null)).toHaveLength(4)
    // 端点 03-12 含于 [03-12, 03-12]
    expect(buildReminderRows(ps, now, { start: '2026-03-12', end: '2026-03-12' }).map((r) => r.node)).toEqual(['到货'])
  })

  it('reminderRange 三档:start=今,end 正确', () => {
    expect(reminderRange(now, 'd7')).toEqual({ start: '2026-03-10', end: '2026-03-17' })
    expect(reminderRange(now, 'm1')).toEqual({ start: '2026-03-10', end: '2026-04-10' })
    expect(reminderRange(now, 'quarter')).toEqual({ start: '2026-01-01', end: '2026-03-31' })
  })

  it('reminderStat 四项:total/done/undone/overdue', () => {
    const rows = buildReminderRows(ps, now, null)
    const s = reminderStat(rows)
    expect(s).toEqual({ total: 4, done: 1, undone: 3, overdue: 1 })
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/milestoneDetailRows.test.ts`
Expected: FAIL（`reminderRange` 未导出 / `buildReminderRows` 旧签名只认 `'7d'` / `reminderStat` 旧形状无 `total`）。

- [ ] **Step 3: 改实现**

在 `frontend/src/lib/milestoneDetailRows.ts`，把现有 `export type ReminderWin = ...`、`export interface ReminderRow {...}`、`buildReminderRows(...)`、`ReminderStat`/`reminderStat(...)` 整段（约 46-93 行）替换为：

```typescript
export type ReminderPreset = 'd7' | 'm1' | 'quarter'

/** 时间段快捷档:start 一律今日(向后看);d7=今+7、m1=今+1月、quarter=本季度边界。 */
export function reminderRange(now: Date, preset: ReminderPreset): { start: string; end: string } {
  const b = reminderBounds(now)
  if (preset === 'd7') return { start: b.today, end: b.d7 }
  if (preset === 'quarter') return { start: b.qs, end: b.qe }
  return { start: b.today, end: ymd(new Date(now.getFullYear(), now.getMonth() + 1, now.getDate())) }
}

export interface ReminderRow {
  projectId: string; projectName: string; projectType: string; manager: string
  orgL3: string; orgL4: string; node: string; planDate: string; payStage: string
  linked: '是' | '否'; priority: string; priorityLabel: string; urgency: 'urgent' | 'warn' | ''
  contract: number; actualDate: string; done: '是' | '否'; overdue: boolean
}

const PR_LABEL: Record<string, string> = { high: '高', mid: '中', low: '低' }

/** 到期清单(节点级,含已完成):planDate∈range 的节点逐条成行;range=null 取全部。 */
export function buildReminderRows(ps: MilestoneProject[], now: Date, range: { start: string; end: string } | null): ReminderRow[] {
  const today = ymd(now)
  const out: ReminderRow[] = []
  for (const p of ps) {
    for (const n of p.nodes) {
      const pd = (n.planDate ?? '').slice(0, 10)
      if (!pd) continue
      if (range && (pd < range.start || pd > range.end)) continue
      const actual = (n.actualDate ?? '').slice(0, 10)
      const diff = dayDiff(pd, now)
      const pr = ((n as any).priority === 'high' || (n as any).priority === 'mid') ? (n as any).priority : 'low'
      const payStage = ((n as any).payStage ?? '').trim()
      out.push({
        projectId: p.projectId, projectName: p.projectName, projectType: p.projectType, manager: p.manager,
        orgL3: p.orgL3, orgL4: p.orgL4, node: n.name ?? '', planDate: pd, payStage,
        linked: payStage ? '是' : '否', priority: pr, priorityLabel: PR_LABEL[pr],
        contract: p.contract, actualDate: actual, done: actual ? '是' : '否',
        overdue: !actual && pd < today,
        urgency: actual ? '' : (diff <= 3 ? 'urgent' : diff <= 7 ? 'warn' : ''),
      })
    }
  }
  return out
}

export interface ReminderStat { total: number; done: number; undone: number; overdue: number }
export function reminderStat(rows: ReminderRow[]): ReminderStat {
  let done = 0, overdue = 0
  for (const r of rows) {
    if (r.done === '是') done++
    if (r.overdue) overdue++
  }
  return { total: rows.length, done, undone: rows.length - done, overdue }
}
```

> 注：`PR_LABEL` 原文件已有一份（旧 buildReminderRows 上方），替换整段时确保最终只剩一份 `PR_LABEL` 定义（去重，避免重复声明）。`addDays` 若替换后不再被引用，从 `./milestoneAnalytics` 的 import 中移除以免未使用告警；`ymd`/`reminderBounds` 仍需保留。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/milestoneDetailRows.test.ts && cd frontend && npm run typecheck`
Expected: PASS（buildDelayedRows/buildPlanRows 既有用例零回归；typecheck 无未使用 import/重复声明）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/milestoneDetailRows.ts frontend/src/lib/milestoneDetailRows.test.ts
git commit -m "feat(fe): 到期提醒数据层改口径(含已完成节点)+时间段+项目金额/实际完成/逾期字段+四项汇总" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 组件核心 — 时间段选择 + 新列/行 + 汇总卡 + 分页（MilestoneReminderTab.vue）

**Files:**
- Modify: `frontend/src/components/MilestoneReminderTab.vue`
- Test: `frontend/src/components/MilestoneReminderTab.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `buildReminderRows(ps, now, range)`/`reminderRange(now, preset)`/`reminderStat(rows)`/`ReminderRow`/`ReminderPreset`；`useColumnPrefs(viewKey, allKeys, defaultVisible)→{visibleKeys, toggle, moveUp, moveDown, reset}`；`DataTable`/`type DataColumn`；`StatusBadge`。
- Produces: 一个能渲染（默认未来1个月区间）的表（含新列）+ 四张汇总卡 + 分页 + 行点击跳详情。`defineExpose` 暴露 `rangeModel`、`filtered` 供测试与 Task 3。

- [ ] **Step 1: 重写失败测试**

整体替换 `frontend/src/components/MilestoneReminderTab.test.ts` 为：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import MilestoneReminderTab from './MilestoneReminderTab.vue'
import DataTable from './DataTable.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

const now = new Date(2026, 2, 10) // 2026-03-10; m1→[03-10,04-10]
function mp(o: Partial<any> = {}): any {
  return { projectId: 'X', projectName: 'x', manager: '', orgL4: 'L4', orgL3: 'L3', orgL3_1: '', projectType: 'T', contract: 0, status: '正常', nodes: [], ...o }
}
const projects = [
  mp({ projectId: 'A', projectName: '甲', manager: '张', contract: 2000000, nodes: [
    { name: '到货', planDate: '2026-03-12', actualDate: '', payStage: '到货款', priority: 'high' },     // m1 区间内未完成
    { name: '终验', planDate: '2026-03-20', actualDate: '2026-03-19', payStage: '', priority: 'high' }, // m1 区间内已完成
    { name: '关闭', planDate: '2026-08-01', actualDate: '', priority: 'low' },                          // 出区间
  ] }),
]
function mountTab() {
  setActivePinia(createPinia())
  return mount(MilestoneReminderTab, { props: { projects, now }, global: { plugins: [ElementPlus] } })
}

describe('MilestoneReminderTab 核心', () => {
  it('默认未来1个月:到货+终验两行(含已完成),关闭出区间', () => {
    const w = mountTab()
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.node).sort()).toEqual(['到货', '终验'])
  })
  it('汇总卡四项随区间', () => {
    const w = mountTab()
    expect(w.text()).toContain('到期节点总数')
    expect(w.text()).toContain('已完成')
    expect(w.text()).toContain('未完成')
    expect(w.text()).toContain('逾期未完成')
  })
  it('快捷档"本季度"改区间(关闭仍出, 终验/到货在季度内)', async () => {
    const w = mountTab()
    await w.get('[data-test="rng-quarter"]').trigger('click')
    const rows = w.findComponent(DataTable).props('rows') as any[]
    expect(rows.map((r) => r.node).sort()).toEqual(['到货', '终验'])
  })
  it('点行跳 /project/:id', async () => {
    const w = mountTab()
    await w.findComponent(DataTable).vm.$emit('row-click', { projectId: 'A' })
    expect(push).toHaveBeenCalledWith('/project/A')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/MilestoneReminderTab.test.ts`
Expected: FAIL（无 `rng-quarter` 快捷档 / 汇总卡文案变了 / 默认区间行为变了）。

- [ ] **Step 3: 重建组件（核心部分）**

整体替换 `frontend/src/components/MilestoneReminderTab.vue` 为：

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { MilestoneProject } from '@/lib/milestoneAnalytics'
import { buildReminderRows, reminderRange, reminderStat, type ReminderPreset, type ReminderRow } from '@/lib/milestoneDetailRows'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import DataTable, { type DataColumn } from './DataTable.vue'
import StatusBadge from './StatusBadge.vue'

const props = defineProps<{ projects: MilestoneProject[]; now: Date }>()
const router = useRouter()

const TABLE_ID = 'milestone-reminder'

// 时间段:默认未来1个月;快捷档写 rangeModel;清空=全部
const m1 = reminderRange(props.now, 'm1')
const rangeModel = ref<[string, string] | null>([m1.start, m1.end])
const range = computed(() => (rangeModel.value ? { start: rangeModel.value[0], end: rangeModel.value[1] } : null))
function preset(p: ReminderPreset) { const r = reminderRange(props.now, p); rangeModel.value = [r.start, r.end] }

const winRows = computed(() => buildReminderRows(props.projects, props.now, range.value))
// Task 3 会把 filtered 改成 列筛选+关键词链;此处先 = winRows
const filtered = computed<ReminderRow[]>(() => winRows.value)
const stat = computed(() => reminderStat(filtered.value))

const PR_TONE: Record<string, string> = { high: 'danger', mid: 'warn', low: 'mut' }
const fmtWan = (v: number) => (v ? (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) : '-')

const ALL_COLUMNS: DataColumn[] = [
  { key: 'projectId', label: '项目编号', width: 150 },
  { key: 'projectName', label: '项目名称', wrap: true },
  { key: 'contract', label: '项目金额(万)', width: 110, num: true, sortable: true, formatter: (v) => fmtWan(v as number) },
  { key: 'projectType', label: '项目类型', width: 100 },
  { key: 'manager', label: '项目经理', width: 90 },
  { key: 'orgL3', label: 'L3部门', width: 110 },
  { key: 'orgL4', label: 'L4部门', width: 110 },
  { key: 'node', label: '到期节点', width: 110 },
  { key: 'planDate', label: '计划时间', width: 110, num: true, sortable: true },
  { key: 'actualDate', label: '实际完成时间', width: 120, num: true, sortable: true, formatter: (v) => (v ? String(v) : '-') },
  { key: 'done', label: '是否完成', width: 90 },
  { key: 'payStage', label: '回款阶段', width: 150, wrap: true },
  { key: 'linked', label: '是否关联回款', width: 110 },
  { key: 'priorityLabel', label: '处置优先级', width: 100 },
]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ['projectId', 'projectName', 'contract', 'manager', 'orgL4', 'node', 'planDate', 'actualDate', 'done', 'priorityLabel']
const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
import { watch } from 'vue'
watch(filtered, () => { currentPage.value = 1 })

function onRow(row: Record<string, any>) { router.push('/project/' + row.projectId) }

defineExpose({ rangeModel, filtered })
</script>

<template>
  <div class="mrt">
    <div class="mrt-bar">
      <el-date-picker v-model="rangeModel" type="daterange" value-format="YYYY-MM-DD" unlink-panels
        range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" size="small" clearable style="width: 260px" />
      <button class="mrt-btn" data-test="rng-d7" @click="preset('d7')">未来7天</button>
      <button class="mrt-btn" data-test="rng-m1" @click="preset('m1')">未来1个月</button>
      <button class="mrt-btn" data-test="rng-quarter" @click="preset('quarter')">本季度</button>
    </div>
    <div class="mrt-stats">
      <div class="mrt-card"><div class="mrt-k">到期节点总数</div><div class="mrt-v u-num">{{ stat.total }}</div></div>
      <div class="mrt-card"><div class="mrt-k">已完成</div><div class="mrt-v u-num">{{ stat.done }}</div></div>
      <div class="mrt-card"><div class="mrt-k">未完成</div><div class="mrt-v u-num">{{ stat.undone }}</div></div>
      <div class="mrt-card"><div class="mrt-k">逾期未完成</div><div class="mrt-v mrt-v-danger u-num">{{ stat.overdue }}</div></div>
    </div>
    <div class="mrt-scroll">
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable @row-click="onRow">
        <template #cell-projectId="{ value }"><span class="mrt-link">{{ value }}</span></template>
        <template #cell-planDate="{ row, value }"><span :class="['u-num', row.urgency ? 'mrt-date-' + row.urgency : '']">{{ value }}</span></template>
        <template #cell-done="{ value }"><StatusBadge :label="value" :tone="value === '是' ? 'ok' : 'mut'" /></template>
        <template #cell-linked="{ value }"><StatusBadge :label="value" :tone="value === '是' ? 'ok' : 'mut'" /></template>
        <template #cell-priorityLabel="{ row, value }"><StatusBadge :label="value" :tone="PR_TONE[row.priority]" /></template>
      </DataTable>
    </div>
    <div class="mrt-pager">
      <span class="u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize" :page-sizes="[20, 50, 80, 100]" :total="filtered.length" layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.mrt-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.mrt-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: var(--gap-card); margin-bottom: var(--sp-3); }
.mrt-card { background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); padding: var(--card-pad); }
.mrt-k { font-size: var(--fs-1); color: var(--mut); margin-bottom: var(--sp-1); }
.mrt-v { font-size: var(--fs-5); font-weight: 700; color: var(--txt); line-height: var(--lh-tight); }
.mrt-v-danger { color: var(--danger); }
.mrt-btn { padding: var(--sp-1) var(--sp-3); border: 1px solid var(--line2); border-radius: var(--r-sm); background: var(--card2); color: var(--sub); cursor: pointer; font-size: var(--fs-1); }
.mrt-btn:hover { background: var(--bg); color: var(--accent); }
.mrt-scroll { overflow-x: auto; }
.mrt-link { color: var(--accent); cursor: pointer; }
.mrt-date-urgent { color: var(--danger); font-weight: 600; }
.mrt-date-warn { color: var(--warn-text); font-weight: 600; }
.mrt-pager { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-3); }
</style>
```

> 注：`import { watch } from 'vue'` 应并入顶部第一行 `import { computed, ref, watch } from 'vue'`（此处分写只为阅读清晰，实现时合并，避免重复 import 报错）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/MilestoneReminderTab.test.ts && cd frontend && npm run typecheck`
Expected: PASS（4 个核心用例全过；typecheck 干净）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MilestoneReminderTab.vue frontend/src/components/MilestoneReminderTab.test.ts
git commit -m "feat(fe): 到期提醒Tab重建核心(时间段选择+快捷档+新列/含已完成行+四项汇总卡+分页+跳详情)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 表格栈能力 — 选列 + 逐列筛选 + 关键词 + 按筛选导出（MilestoneReminderTab.vue）

**Files:**
- Modify: `frontend/src/components/MilestoneReminderTab.vue`
- Test: `frontend/src/components/MilestoneReminderTab.test.ts`

**Interfaces:**
- Consumes: Task 2 组件；`ColumnPicker`（props `:columns(key/label)` `:visible-keys`；events `@toggle @move-up @move-down @reset`）；`ColumnFilter`（props `:table-id` `:col-key` `:source-rows`）；`useCrossFilterStore()`（`tableFilters(id)`/`setColumnFilter`/`clearColumn(id,key)`/`clearAll(id)`/`hasFilters(id)`）；`applyColumnFilters(rows, filters)`（来自 `@/lib/crossFilter`）；`exportRows(filename, rows)`（来自 `@/lib/exportXlsx`）。
- Produces: 选列/逐列筛选/关键词/导出全部接通；`filtered` 改为完整过滤链。

- [ ] **Step 1: 追加失败测试**

在 `MilestoneReminderTab.test.ts` 的 `describe('MilestoneReminderTab 核心', ...)` 之后追加新 describe（顶部补 import：`import ColumnPicker from './ColumnPicker.vue'`、`import { exportRows } from '@/lib/exportXlsx'`、`import * as xlsx from '@/lib/exportXlsx'`——按下列用例实际所需引入；mountTab 复用上方定义）：

```typescript
describe('MilestoneReminderTab 表格栈', () => {
  it('ColumnPicker 存在且含全部14列可选', () => {
    const w = mountTab()
    const cp = w.findComponent(ColumnPicker)
    expect(cp.exists()).toBe(true)
    expect((cp.props('columns') as any[]).length).toBe(14)
  })
  it('关键词搜索 编号/名称 收窄 filtered', async () => {
    const w = mountTab()
    const vm = w.vm as any
    const before = vm.filtered.length
    await w.get('[data-test="mrt-kw"]').setValue('不存在的编号zzz')
    expect((w.vm as any).filtered.length).toBe(0)
    expect(before).toBeGreaterThan(0)
  })
  it('按筛选导出调用 exportRows(条数与列键)', async () => {
    const spy = vi.spyOn(xlsx, 'exportRows').mockImplementation(() => {})
    const w = mountTab()
    await w.get('[data-test="mrt-export"]').trigger('click')
    expect(spy).toHaveBeenCalledTimes(1)
    const [, rowsArg] = spy.mock.calls[0]
    expect((rowsArg as any[]).length).toBe((w.vm as any).filtered.length)
    expect(Object.keys((rowsArg as any[])[0])).toContain('项目金额(万)')
    expect(Object.keys((rowsArg as any[])[0])).toContain('是否完成')
    spy.mockRestore()
  })
})
```

> 注：`exportRows` 用 `vi.spyOn(xlsx, 'exportRows')` 拦截需组件以 `import { exportRows } from '@/lib/exportXlsx'` 具名调用（spy 才能命中模块导出）。测试顶部加 `import * as xlsx from '@/lib/exportXlsx'`。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/MilestoneReminderTab.test.ts`
Expected: FAIL（无 ColumnPicker / 无 `mrt-kw` / 无 `mrt-export`）。

- [ ] **Step 3: 接通表格栈能力**

在 `MilestoneReminderTab.vue` 的 `<script setup>` 增改：

引入（与 Task 2 的 import 合并）：

```typescript
import { useCrossFilterStore } from '@/stores/crossFilter'
import { applyColumnFilters } from '@/lib/crossFilter'
import { exportRows } from '@/lib/exportXlsx'
import ColumnFilter from './ColumnFilter.vue'
import ColumnPicker from './ColumnPicker.vue'
```

在 `const TABLE_ID = ...` 后加 store 与列选支撑：

```typescript
const cf = useCrossFilterStore()
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
const FILTERABLE = new Set(['projectType', 'manager', 'orgL3', 'orgL4', 'node', 'done', 'linked', 'priorityLabel'])
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}
const fKw = ref('')
```

把 Task 2 里 `const filtered = computed(...)` 整体替换为完整过滤链：

```typescript
const filtered = computed<ReminderRow[]>(() => {
  const afterCols = applyColumnFilters(winRows.value, cf.tableFilters(TABLE_ID)) as ReminderRow[]
  const kw = fKw.value.trim()
  return kw ? afterCols.filter((r) => r.projectId.includes(kw) || r.projectName.includes(kw)) : afterCols
})
```

进页清残留 + 导出函数（加在 `onRow` 附近）：

```typescript
cf.clearAll(TABLE_ID)
function onExport() {
  exportRows(`里程碑到期提醒_${filtered.value.length}条.xlsx`, filtered.value.map((r) => ({
    项目编号: r.projectId, 项目名称: r.projectName, '项目金额(万)': r.contract ? r.contract / 10000 : 0,
    项目类型: r.projectType, 项目经理: r.manager, L3部门: r.orgL3, L4部门: r.orgL4,
    到期节点: r.node, 计划时间: r.planDate, 实际完成时间: r.actualDate, 是否完成: r.done,
    回款阶段: r.payStage, 是否关联回款: r.linked, 处置优先级: r.priorityLabel,
  })))
}
```

template 工具栏（`.mrt-bar` 内，快捷档之后）追加关键词框 + 选列 + 导出 + 清筛选：

```html
      <el-input v-model="fKw" size="small" placeholder="编号/名称" clearable style="width: 150px" data-test="mrt-kw" />
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button class="mrt-btn" data-test="mrt-export" @click="onExport">导出Excel</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
```

DataTable 加表头插槽接 ColumnFilter（`source-rows` 用 `winRows`，使枚举值反映当前时间段集）：

```html
      <DataTable :columns="visibleColumns" :rows="paged" :show-count="false" clickable @row-click="onRow">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="mrt-th">{{ c.label }}<ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="winRows" /></span>
        </template>
        <!-- 以下 cell 插槽保持 Task 2 不变 -->
        <template #cell-projectId="{ value }"><span class="mrt-link">{{ value }}</span></template>
        <template #cell-planDate="{ row, value }"><span :class="['u-num', row.urgency ? 'mrt-date-' + row.urgency : '']">{{ value }}</span></template>
        <template #cell-done="{ value }"><StatusBadge :label="value" :tone="value === '是' ? 'ok' : 'mut'" /></template>
        <template #cell-linked="{ value }"><StatusBadge :label="value" :tone="value === '是' ? 'ok' : 'mut'" /></template>
        <template #cell-priorityLabel="{ row, value }"><StatusBadge :label="value" :tone="PR_TONE[row.priority]" /></template>
      </DataTable>
```

样式追加表头容器：

```css
.mrt-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/MilestoneReminderTab.test.ts && cd frontend && npm run typecheck`
Expected: PASS（核心 4 + 表格栈 3 共 7 用例全过；typecheck 干净）。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MilestoneReminderTab.vue frontend/src/components/MilestoneReminderTab.test.ts
git commit -m "feat(fe): 到期提醒Tab接通/projects表格栈(选列+逐列筛选crossFilter+关键词+按筛选导出+清筛选)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 版本 V1.20.2 + PROGRESS.md + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1: 改版本**

`frontend/src/version.ts`：把 `export const APP_VERSION = 'V1.20.1'` 改为 `export const APP_VERSION = 'V1.20.2'`（`RELEASE_DATE = '2026-06-24'` 不变）。

- [ ] **Step 2: 更新 PROGRESS.md**

头部「当前版本」滚动为 V1.20.2，并把 V1.20.1 顺位下滚（当前→上一→更上→上上，丢弃最旧一档）；在 `## 版本` 小节版本史里、`- V1.20.1（2026-06-24）...` 条目之前插入：

```markdown
- V1.20.2（2026-06-24）/insight/milestone 到期提醒表改造（feat/milestone-reminder-revamp，SDD + verify 全绿）
  - 到期提醒 Tab 由"固定三档窗+只列未完成"改为"时间段选择(起止+快捷档未来7天/1个月/本季度,默认未来1个月)+含已完成的到期清单";加列 项目金额(万)/实际完成时间/是否完成;照搬 /projects 表格栈(ColumnPicker 选列+ColumnFilter 逐列筛选+关键词+sortable 排序+按筛选导出+分页);汇总卡改 到期节点总数/已完成/未完成/逾期未完成。纯前端,改 lib/milestoneDetailRows + components/MilestoneReminderTab。
```

- [ ] **Step 3: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。若失败不提交，报告失败阶段。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V1.20.2 /insight/milestone 到期提醒表改造" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（逐节核）：**
- spec §1.1 时间段替代三档 → T2（date-picker + 快捷档 + 默认 m1）✅
- spec §1.2 行口径含已完成 → T1（buildReminderRows 去 skip-completed）✅
- spec §1.3 加 3 列(项目金额/实际完成时间/是否完成) → T1 字段 + T2 ALL_COLUMNS ✅
- spec §1.4 照搬 /projects 表格栈(选列/逐列筛选/排序/按筛选导出/分页) → T2(sortable+分页) + T3(ColumnPicker/ColumnFilter/导出) ✅
- spec §1.5 汇总卡改造(总数/已完成/未完成/逾期未完成) → T1 reminderStat + T2 卡片 ✅
- spec §3.1 行字段(contract/actualDate/done/overdue/urgency 完成态置空) → T1 ✅
- spec §3.3 reminderRange 三档(start=今) → T1 ✅
- spec §5.1 列表(默认可见10/可筛选8/可排序3) → T2 DEFAULT_VISIBLE + T2 sortable + T3 FILTERABLE ✅
- spec §5.2 TABLE_ID/onToggle clearColumn/本地分页/行点击/清筛选/进页 clearAll → T2+T3 ✅
- spec §7 按筛选导出单表全列 → T3 onExport ✅
- spec §8 测试 → T1/T2/T3 各 TDD + T4 verify ✅
- spec §10 版本 V1.20.2 → T4 ✅

**2. Placeholder scan：** 无 TBD/TODO；每改码步含完整代码。两处「注」是给实现者的真实合并指引（PR_LABEL 去重、import 合并、spy 具名导出），非占位。✅

**3. Type consistency：**
- `ReminderRow` 字段（+contract/actualDate/done/overdue）T1 定义、T2 ALL_COLUMNS/cell 插槽、T3 onExport/关键词 消费一致。✅
- `buildReminderRows(ps, now, range|null)` / `reminderRange(now, preset)` / `reminderStat(rows)` 签名 T1 定义、T2/T3 调用一致（注意 reminderStat 单参，不再传 now）。✅
- `ReminderPreset='d7'|'m1'|'quarter'` T1 定义、T2 preset() 用一致；快捷档 data-test rng-d7/m1/quarter 与之对应。✅
- `useColumnPrefs` 返回 {visibleKeys,toggle,moveUp,moveDown,reset} 与 T2/T3 ColumnPicker 接线一致。✅
- 删除的 `ReminderWin` 无残留消费方（仅本文件+其测试+本组件，均在本计划改写）。✅
- `filtered` 在 T2 先 = winRows、T3 改为完整链；pagination/stat/export 均读 `filtered`，T3 改后自动生效，无悬空。✅
