# V2.6.9 前端 useFollowupPage 重构 + 修复（批3a）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抽 `useFollowupPage` composable + `FollowupModals` 组件 + 共享样式，把 5 跟进页约 700 行逐字重复收敛；收敛排序/分页/选列三件套；修 store 集中 reset、保存失败反馈、ScopeBuilder key、filter.ts 护栏。

**Architecture:** 5 跟进页（KeyProjects/Temp/Risk/Opportunity/PaymentKey）**逐字相同**的部分（数据集/历史切换、删历史、导出选择态+通用 exportRow、分页、删除/导出 Modal、`.kp-*` 样式）抽入 `useFollowupPage` composable + `FollowupModals` 组件 + 共享 CSS；**因页而异**的部分（列定义源、范围引擎、cell 编辑字段、doArchive 行集、归档清空 vs 留存由 store 决定）留在各页。逐页迁移，既有 view 测试 + typecheck 为回归网。批3a 不 bump 版本、不打包（批3b 收尾 bump V2.6.9 + 累积打包）。

**Tech Stack:** Vue3 + TS + Pinia + Element Plus + vitest。

## Global Constraints

- 版本：批3a **不改 `version.ts`**（批3b 收尾统一 bump V2.6.9）。
- 设计令牌：新增/改动样式只引用 `frontend/src/styles/theme.css` 令牌（`--sp-*`/`--gap-*`/`--r-*`/状态色 `--*-text`），**不手写散值**；不使用 emoji。
- 5 跟进页差异（重构须保持，见各任务参数表）：列定义源(静态/动态computed/外部适配)、范围引擎(无/简单/扩展)、归档语义(清空 Key/Temp/Opp vs 留存 Risk/PaymentKey，**由 store.archive 自身决定，页面不管**)、store(单/双)、cell 编辑字段(weekProgress/nextPlan 文本×2 vs followAction/revConclusion/nextRevDate 文本×2+日期×1)。
- 5 store 共享接口（已核实）：`scope`/`current`/`archives`/`loaded` refs + `load()`/`update(id,field,content)`/`archive(rows)`/`deleteArchive(idx)`/`reset()`。`archive` 是否清 `current` 由各 store 自身实现（temp/opp/progress 清、risk/paykey 不清）。
- 验收：`bash verify.sh` 全绿（前端 typecheck + vitest + build 是重点）。改视图先跑既有 view 测试建基线、迁移后必须仍绿。
- 测试：`cd frontend && npx vitest run <文件>`；typecheck `npm run typecheck`。
- 提交信息结尾附：`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: usePagedRows 增强（watch pageSize + 钳位 currentPage）

**背景**：`lib/usePagedRows.ts` 现只 `watch(source)` 回第 1 页，未 watch `pageSize`；批1 lib 审查发现调大 pageSize 可能停在越界空页。

**Files:**
- Modify: `frontend/src/lib/usePagedRows.ts`
- Test: `frontend/src/lib/usePagedRows.test.ts`

**Interfaces:**
- Produces: `usePagedRows(source, size=50)` 行为不变，另：`pageSize` 变更时 `currentPage` 钳位到有效范围（≥1 且不超过总页数），避免越界空页。

- [ ] **Step 1: Write the failing test**

```ts
import { ref, nextTick } from 'vue'
import { usePagedRows } from './usePagedRows'

it('pageSize 调大后 currentPage 钳位不越界空页', async () => {
  const src = ref(Array.from({ length: 30 }, (_, i) => i))
  const { paged, currentPage, pageSize } = usePagedRows(src, 10)
  currentPage.value = 3           // 第 3 页(21..30)
  pageSize.value = 20             // 总页数变 2,第 3 页越界
  await nextTick()
  expect(currentPage.value).toBeLessThanOrEqual(2)
  expect(paged.value.length).toBeGreaterThan(0)   // 不是空页
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/usePagedRows.test.ts`
Expected: FAIL（currentPage 停在 3、paged 空）

- [ ] **Step 3: Write minimal implementation**

`usePagedRows.ts` 加 `watch(pageSize, ...)` 钳位：

```ts
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

export function usePagedRows<T>(source: Ref<T[]> | ComputedRef<T[]>, size = 50) {
  const currentPage = ref(1)
  const pageSize = ref(size)
  const paged = computed<T[]>(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return source.value.slice(start, start + pageSize.value)
  })
  watch(source, () => { currentPage.value = 1 })
  watch(pageSize, () => {
    const maxPage = Math.max(1, Math.ceil(source.value.length / pageSize.value))
    if (currentPage.value > maxPage) currentPage.value = maxPage
  })
  return { paged, currentPage, pageSize }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/usePagedRows.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/usePagedRows.ts frontend/src/lib/usePagedRows.test.ts
git commit -m "fix(paging): usePagedRows pageSize变更钳位currentPage(修越界空页) (V2.6.9 批3a)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: `useFollowupPage` composable + 测试

**背景**：5 跟进页的数据集/历史切换、删历史、导出选择态、分页逐字相同（仅 store 前缀不同）。抽 composable 承载。

**Files:**
- Create: `frontend/src/composables/useFollowupPage.ts`
- Test: `frontend/src/composables/useFollowupPage.test.ts`

**Interfaces:**
- Consumes: `usePagedRows`（Task 1）；一个 followup store（含 `archives`/`deleteArchive`）；`filtered: ComputedRef<T[]>`。
- Produces: `useFollowupPage(store, filtered)` 返回 `{ mode, historyIdx, isCurrent, datasetOpts, historyOpts, paged, currentPage, pageSize, delConfirm, deleting, doDeleteArchive, exportOpen, exportSel, allSelected, exportIndeterminate, toggleAllExport }`。`store` 参数只依赖 `archives`(数组,响应式) 与 `deleteArchive(idx)`；`datasetOpts` 第 0 项恒 `{value:'current',label:'当前数据'}`,其余为 `{value:'a'+i, label:archiveTime}`。

- [ ] **Step 1: Write the failing test**

```ts
import { ref, computed, nextTick } from 'vue'
import { useFollowupPage } from './useFollowupPage'

function fakeStore(archives: any[]) {
  const a = ref(archives)
  return {
    get archives() { return a.value },
    deleteArchive: async (idx: number) => { a.value = a.value.filter((_, i) => i !== idx) },
  }
}

it('datasetOpts/historyOpts 含当前+归档', () => {
  const store = fakeStore([{ archiveTime: 't1' }, { archiveTime: 't2' }])
  const fp = useFollowupPage(store, computed(() => [] as any[]))
  expect(fp.datasetOpts.value[0]).toEqual({ value: 'current', label: '当前数据' })
  expect(fp.datasetOpts.value.map((o: any) => o.value)).toEqual(['current', 'a0', 'a1'])
  expect(fp.historyOpts.value).toEqual([{ value: 0, label: 't1' }, { value: 1, label: 't2' }])
})

it('doDeleteArchive 删末条后回 current,导出全选态正确', async () => {
  const store = fakeStore([{ archiveTime: 't1' }])
  const fp = useFollowupPage(store, computed(() => [] as any[]))
  fp.mode.value = 'history'; fp.historyIdx.value = 0
  await fp.doDeleteArchive()
  expect(store.archives.length).toBe(0)
  expect(fp.mode.value).toBe('current')
  fp.toggleAllExport(true)
  expect(fp.allSelected.value).toBe(true) && expect(fp.exportIndeterminate.value).toBe(false)
})

it('分页切片随 filtered', () => {
  const rows = ref(Array.from({ length: 120 }, (_, i) => i))
  const fp = useFollowupPage(fakeStore([]), computed(() => rows.value))
  expect(fp.paged.value.length).toBe(50)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/composables/useFollowupPage.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: Write minimal implementation**

```ts
import { ref, computed, watch, type ComputedRef } from 'vue'
import { usePagedRows } from '@/lib/usePagedRows'

interface FollowupStoreLike {
  archives: { archiveTime?: string }[]
  deleteArchive: (idx: number) => Promise<unknown>
}

/** 5 跟进页共享的数据集/历史切换 + 删历史 + 导出选择态 + 分页(逐字相同段抽取)。
 * 页面自留:列定义/范围引擎/cell编辑/doArchive(行集与文案)/onRow。 */
export function useFollowupPage<T>(store: FollowupStoreLike, filtered: ComputedRef<T[]>) {
  const mode = ref<'current' | 'history'>('current')
  const historyIdx = ref(0)
  const isCurrent = computed(() => mode.value === 'current')
  const datasetOpts = computed(() => [
    { value: 'current', label: '当前数据' },
    ...store.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime ?? '' })),
  ])
  const historyOpts = computed(() => store.archives.map((a, i) => ({ value: i, label: a.archiveTime ?? '' })))
  watch(() => [mode.value, store.archives.length] as const, () => {
    if (mode.value === 'history') historyIdx.value = Math.max(0, store.archives.length - 1)
  })

  const { paged, currentPage, pageSize } = usePagedRows(filtered, 50)

  const delConfirm = ref(false)
  const deleting = ref(false)
  async function doDeleteArchive() {
    deleting.value = true
    try {
      await store.deleteArchive(historyIdx.value)
      delConfirm.value = false
      if (!store.archives.length) mode.value = 'current'
      else historyIdx.value = Math.min(historyIdx.value, store.archives.length - 1)
    } finally { deleting.value = false }
  }

  const exportOpen = ref(false)
  const exportSel = ref<string[]>(['current'])
  const allSelected = computed(() => exportSel.value.length > 0 && exportSel.value.length === datasetOpts.value.length)
  const exportIndeterminate = computed(() => exportSel.value.length > 0 && exportSel.value.length < datasetOpts.value.length)
  function toggleAllExport(val: boolean) { exportSel.value = val ? datasetOpts.value.map((o) => o.value) : [] }

  return {
    mode, historyIdx, isCurrent, datasetOpts, historyOpts,
    paged, currentPage, pageSize,
    delConfirm, deleting, doDeleteArchive,
    exportOpen, exportSel, allSelected, exportIndeterminate, toggleAllExport,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/composables/useFollowupPage.test.ts && cd frontend && npm run typecheck`
Expected: PASS + typecheck 干净

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useFollowupPage.ts frontend/src/composables/useFollowupPage.test.ts
git commit -m "feat(followup): 新增 useFollowupPage composable(数据集/历史/删档/导出态/分页共享) (V2.6.9 批3a)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 共享 `.kp-*` 样式抽出到单一 CSS

**背景**：`.kp-title/.kp-label/.kp-scroll/.kp-th/.kp-empty/.kp-prog-cell/.kp-archive-btn/.kp-export-btn/.kp-cancel/.kp-pager` 在 5 页 `<style scoped>` 逐字复制。抽到一个非 scoped 共享 CSS，5 页 import。

**Files:**
- Create: `frontend/src/styles/followup.css`
- Test: 无独立单测（由 Task 5-9 各页迁移后的 vitest + 真机冒烟覆盖；本任务只搬样式）

- [ ] **Step 1: 建共享 CSS**

从 `KeyProjectsView.vue` 的 `<style scoped>`（316-338）**原样复制** `.kp-*` 规则到 `frontend/src/styles/followup.css`（去掉 scoped——这些类名带 `kp-` 前缀、全局不冲突；令牌值保持不变）。**先读 KeyProjectsView 现有 `.kp-*` 规则原文照搬,勿改任何令牌值。**

- [ ] **Step 2: 校验 CSS 语法**

Run: `cd frontend && npx stylelint src/styles/followup.css 2>/dev/null || echo "(无 stylelint,跳过)"`；至少肉眼确认无语法错。

- [ ] **Step 3: Commit**（样式文件先落地,页面 import 在 Task 5-9 各页迁移时加）

```bash
git add frontend/src/styles/followup.css
git commit -m "style(followup): 抽 .kp-* 共享样式到 followup.css(5页迁移时import) (V2.6.9 批3a)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `FollowupModals` 组件（删除/导出/归档三 Modal）

**背景**：删除历史确认 + 导出选择两个 Modal 5 页逐字相同；归档确认 Modal 骨架相同、文案两组（清空 vs 留存）。抽组件，用 `retain` prop 切归档文案/宽度。

**Files:**
- Create: `frontend/src/components/FollowupModals.vue`
- Test: `frontend/src/components/FollowupModals.test.ts`

**Interfaces:**
- Produces: `<FollowupModals>` props：`v-model:delConfirm`、`v-model:exportOpen`、`v-model:archiveOpen`、`historyLabel:string`、`deleting:boolean`、`archiving:boolean`、`retain:boolean`（false=清空文案 420px；true=留存文案 460px）、`datasetOpts`、`exportSel`(v-model)、`allSelected`、`exportIndeterminate`、`exportCount:number`。emits：`confirmDelete`、`confirmArchive`、`doExport`、`toggleAll(val:boolean)`。内部复用 `Modal`（现有组件）+ el-checkbox；样式引用 `styles/followup.css` 的 `.kp-cancel/.kp-archive-btn/.kp-export-btn`。**具体三个 Modal 的模板从 KeyProjectsView(283-312) 与 RiskFollowupView(247-253 留存版) 原样搬,归档 Modal 用 `retain ? 留存文案/460px : 清空文案/420px`。**

- [ ] **Step 1: Write the failing test**

```ts
import { mount } from '@vue/test-utils'
import FollowupModals from './FollowupModals.vue'

it('retain=false 归档文案含清空;retain=true 含留存', async () => {
  const w = mount(FollowupModals, { props: {
    delConfirm: false, exportOpen: false, archiveOpen: true, historyLabel: 't',
    deleting: false, archiving: false, retain: false,
    datasetOpts: [{ value: 'current', label: '当前' }], exportSel: ['current'],
    allSelected: true, exportIndeterminate: false, exportCount: 1,
  }, global: { stubs: { teleport: true } } })
  expect(w.text()).toContain('清空')
  await w.setProps({ retain: true })
  expect(w.text()).toContain('留存')
})

it('确认删除 emit confirmDelete', async () => {
  const w = mount(FollowupModals, { props: {
    delConfirm: true, exportOpen: false, archiveOpen: false, historyLabel: 't1',
    deleting: false, archiving: false, retain: false,
    datasetOpts: [], exportSel: [], allSelected: false, exportIndeterminate: false, exportCount: 0,
  }, global: { stubs: { teleport: true } } })
  await w.find('.kp-archive-btn').trigger('click')
  expect(w.emitted('confirmDelete')).toBeTruthy()
})
```

（选择器/文案以实际搬入的模板为准,先搬模板再据实微调断言。）

- [ ] **Step 2-4: 实现并通过**

搬 3 个 Modal 模板到 `FollowupModals.vue`，归档 Modal 按 `retain` 切文案/宽度（清空："更新（归档）"420px/"清空两列进展"；留存："归档（留存跟进）"460px/"保留不清空…重新挂到最新…上"——**文案原文从 Temp 与 Risk 页搬**）；`<style scoped>` 里 `@import '@/styles/followup.css'` 或引用其类。
Run: `cd frontend && npx vitest run src/components/FollowupModals.test.ts && npm run typecheck`
Expected: PASS + typecheck 干净

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/FollowupModals.vue frontend/src/components/FollowupModals.test.ts
git commit -m "feat(followup): FollowupModals组件(删除/导出/归档,retain切清空vs留存文案) (V2.6.9 批3a)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5-9: 逐页迁移到 useFollowupPage + FollowupModals + 共享样式

> **执行方式**：一页一任务（Task 5=Temp、6=PaymentKey、7=KeyProjects、8=Opportunity、9=Risk），**从最规整的 Temp 开始、最不规整的 Risk 最后**。每页迁完即跑该页既有 vitest + typecheck，绿了再迁下一页。**Risk 因动态列/骨架屏/手写 sortable/无样板，风险最高，单独最后做。**

**每页迁移动作（通用模式）**：
1. 引入 `const fp = useFollowupPage(<该页store>, filtered)`，用 `fp.mode/historyIdx/isCurrent/datasetOpts/historyOpts/paged/currentPage/pageSize/delConfirm/deleting/doDeleteArchive/exportOpen/exportSel/allSelected/exportIndeterminate/toggleAllExport` **替换该页本地同名 ref/computed/函数**（删掉被替换的本地定义）。
2. 模板里删除/导出/归档三个 Modal 换成 `<FollowupModals ... />`（绑 fp 的态 + `retain`=该页是否留存 + `@confirmDelete="fp.doDeleteArchive"` `@confirmArchive="doArchive"` `@doExport="doExport"` `@toggleAll="fp.toggleAllExport"`）。**归档 Modal 正文用具名 slot 传该页原文**：`<template #archive-body>` 里放该页原归档确认 Modal 的正文文案（Key/Temp/Opp 清空版原文；Risk/PaymentKey 留存版原文，如 Risk="风险跟进快照…风险编码…"、PaymentKey="回款重点跟进快照…项目编号…"）——`retain` 只驱动标题/宽度，正文各页原文经 slot 传入保证字节等价。
3. `<style scoped>` 删掉 `.kp-*` 规则，改 `<style scoped>` 顶部 `@import '@/styles/followup.css';`（保留该页根 class 与独有规则如 Risk 的 `.kp-defer`）。
4. **保留该页独有**：列定义、范围引擎(ScopeBuilder)、cell 编辑(progCell/openEdit/onDateChange/editCtx)、doArchive(行集)、onRow、样板(scrollMemory 等)。

**每页参数（照此，勿混）**：

| Task | 页 | store 传入 | retain | 归档行集 doArchive | cell 编辑 | 独有注意 |
|---|---|---|---|---|---|---|
| 5 | Temp | `temp`(useTempFollowupStore) | false | inScopeRows | weekProgress/nextPlan | 简单版 ScopeBuilder |
| 6 | PaymentKey | `pk`(usePaymentKeyFollowupStore) | true | inScopeRows | followAction/revConclusion/nextRevDate | 简单版 ScopeBuilder;date-picker `@click.stop`(**统一保留**) |
| 7 | KeyProjects | `progress`(useProjectProgressStore) | false | currentRows | weekProgress/nextPlan | **无 ScopeBuilder**;exportRow 手写(不走 visibleColumns,保留);ProgressEditModal **不传 store** |
| 8 | Opportunity | `oppf`(useOpportunityFollowupStore) | false | inScopeRows | weekProgress/nextPlan | **双 store**(opps+oppf,均 load);扩展版 ScopeBuilder;无 useDataStore;无 onRow |
| 9 | Risk | `risk`(useRiskFollowupStore) | true | inScopeRows | followAction/revConclusion/nextRevDate | **动态 computed 列**;useColumnPrefsDynamic;useDeferredMount 骨架屏(保留 `v-else-if="!ready"`+`.kp-defer`);手写 sortable(保留);扩展版 ScopeBuilder;无 onRow;date-picker `@click.stop`(**统一加上,消除与 PaymentKey 的漂移**) |

**回归网**：每页对应的既有 `views/<Page>.test.ts`（若存在；先 `ls frontend/src/views/*Followup*.test.ts frontend/src/views/KeyProjectsView.test.ts` 确认）+ `npm run typecheck` + 全量 `npm run test:run`。

**每个 Task 5-9 的步骤**：
- [ ] Step 1: `ls`/读该页既有测试建基线（`npx vitest run <该页.test.ts>` 绿）。
- [ ] Step 2: 按上表迁移该页（引 fp、换 Modal、换样式 import、删被替换的本地定义、保留独有）。
- [ ] Step 3: `cd frontend && npx vitest run <该页.test.ts> && npm run typecheck`（该页测试 + typecheck 绿）。
- [ ] Step 4: Commit：`refactor(followup): <Page> 迁移到 useFollowupPage+FollowupModals+共享样式 (V2.6.9 批3a)`（含 Co-Authored-By 尾注）。

**Task 9(Risk)额外**：统一 date-picker `@click.stop`（与 PaymentKey 一致，消除已知行为漂移）；迁移后手动核对动态列/骨架屏/范围扩展版仍工作（真机冒烟留到批3a 收尾 Task 13）。

---

### Task 10: `useExternalSort` 收敛（/projects 系 4 页）

**背景**：`OpportunitiesView`/`CostDetailView`/`PayProjectsView`/`PayNodesView` 各有一段逐字相同的 `sortState/onSortChange/sorted`（外部排序，NUMERIC_KEYS + 'ascending'→'asc' 映射）。抽 `useExternalSort`。**注意：5 跟进页用 native el-table 排序，不在本任务范围。**

**Files:**
- Create: `frontend/src/lib/useExternalSort.ts`
- Modify: `views/OpportunitiesView.vue`、`views/CostDetailView.vue`、`views/PayProjectsView.vue`、`views/PayNodesView.vue`
- Test: `frontend/src/lib/useExternalSort.test.ts` + 4 页既有测试为回归网

**Interfaces:**
- Produces: `useExternalSort<T>(rows: ComputedRef<T[]>, numericKeys: Set<string>)` 返回 `{ sortState, onSortChange, sorted }`。`onSortChange({prop,order})` 把 `'ascending'/'descending'` 映射为 `'asc'/'desc'`；`sorted` 按 prop 排序（数值键按数值、其余按字符串比较），无排序时返回原 rows。**实现前先读 OpportunitiesView:76-97 的确切排序逻辑原样搬入(含 NUMERIC_KEYS 判定、null/空值处理),保证行为字节等价。**

- [ ] Step 1: 读 `OpportunitiesView.vue:76-97` 原排序段建为 `useExternalSort` 的实现基准 + 写测试（数值键降序、字符串键、空排序返回原序）先红。
- [ ] Step 2-4: 建 `useExternalSort.ts`（照搬逻辑）→ 4 页各删本地 sortState/onSortChange/sorted、改用 `useExternalSort(filtered, NUMERIC_KEYS)` → 每页 typecheck + 既有测试绿。
- [ ] Step 5: Commit：`refactor(sort): 抽 useExternalSort 收敛4页外部排序 (V2.6.9 批3a)`。

---

### Task 11: `useColumnPrefs` 融入「关列清筛选」+ 其余页收敛

**背景**：`onToggle(key){ if(visibleKeys.includes(key)) cf.clearColumn(TABLE_ID,key); prefs.toggle(key) }` 在约 9 页逐字重复；「关列清筛选」不变式散落。把它折进 `useColumnPrefs` 的返回值。

**Files:**
- Modify: `frontend/src/lib/useColumnPrefs.ts`（返回值加 `onToggle(cf, tableId)` 高阶或 `makeToggle(cf, tableId)`）
- Modify: 消费 onToggle 的页（Task 5-9 迁移后剩下的：`ProjectsView`/`ClosedProjectsView`/`OpportunitiesView`/`MilestoneReminderTab` 等——先 grep `function onToggle` 全仓定位）
- Test: `frontend/src/lib/useColumnPrefs.test.ts` + 相关页既有测试

**Interfaces:**
- Produces: `useColumnPrefs(...)` 返回值新增 `makeToggle(cf, tableId)` → 返回一个 `(key)=>void`，内部即「关列清筛选 + toggle」。各页 `const onToggle = prefs.makeToggle(cf, TABLE_ID)` 替换本地手写。**cf 的类型/接口先读现有 crossFilter 用法确认。**

- [ ] Step 1: 读现有 `useColumnPrefs.ts` + 一处 `onToggle` 用法 → 写测试（makeToggle 关列时调 cf.clearColumn、开列不调）先红。
- [ ] Step 2-4: 加 `makeToggle` → 全仓 grep `function onToggle`（排除已迁移的 5 跟进页——它们的选列若也用同款可一并；但本任务聚焦非跟进页避免与 Task5-9 冲突）逐页替换 → typecheck + 既有测试绿。
- [ ] Step 5: Commit：`refactor(columns): useColumnPrefs.makeToggle 收敛「关列清筛选」 (V2.6.9 批3a)`。

---

### Task 12: 三个小修复（store 集中 reset + 保存失败反馈 + ScopeBuilder key + filter.ts 护栏）

**背景**：批1 lib 审查 + 视图审查的四条小缺陷。

**Files:**
- Modify: `frontend/src/stores/auth.ts`（login/logout 补 riskFollowup + paymentKeyFollowup reset）
- Modify: `frontend/src/components/OpportunityEditDrawer.vue`、`frontend/src/components/ProgressEditModal.vue`（保存失败 catch + ElMessage.error）
- Modify: `frontend/src/components/ScopeBuilder.vue`（v-for 用稳定 uid 而非数组索引）
- Modify: `frontend/src/stores/filter.ts`（裸 JSON.parse 包 try/catch）
- Test: `frontend/src/stores/auth.test.ts`（若有）/ 新建针对性小测试；ScopeBuilder/filter 以 typecheck + 既有测试为网

- [ ] **Step 1: store 集中 reset**（最小安全改法，非 pinia 插件）——`stores/auth.ts` 的 login 与 logout 两处 reset 清单里，`import` 并调用 `useRiskFollowupStore().reset()` 与 `usePaymentKeyFollowupStore().reset()`（与现有 `useTempFollowupStore().reset()` 并列）。加/改测试断言换账号后这两 store 被 reset（若有 auth.test.ts；否则加一条）。
- [ ] **Step 2: 保存失败反馈**——`OpportunityEditDrawer.vue` 的 `onSave`、`ProgressEditModal.vue` 的 `save` 包 `try { ... } catch (e) { ElMessage.error('保存失败: ' + (e as Error).message) } `（对照 `OpportunitiesView.vue:159-170` 的既有 try/catch+ElMessage 写法）。
- [ ] **Step 3: ScopeBuilder 稳定 key**——`ScopeBuilder.vue:130,141` 的 `:key="gi"`/`:key="ci"` 改为给每个 group/condition 生成/维护稳定 uid（如新增时 `_uid` 字段，`:key="g._uid"`）。**先读 ScopeBuilder 的 group/condition 增删逻辑(removeGroup/removeCondition/addGroup/addCondition)确保 uid 全流程维护。**
- [ ] **Step 4: filter.ts 护栏**——`stores/filter.ts:52` 的 `JSON.parse(localStorage.getItem(...) || '[]')` 包 try/catch 回退 `[]`（对照 `ui.ts`/`useColumnPrefs.ts` 的既有防护）。
- [ ] **Step 5: 验证 + 提交**——`cd frontend && npm run typecheck && npm run test:run`（全绿）；`git add` 上述文件 + 测试，commit：`fix(frontend): store集中reset补齐+保存失败反馈+ScopeBuilder稳定key+filter护栏 (V2.6.9 批3a)`（含 Co-Authored-By）。

---

### Task 13: 批3a 全量验收（不 bump、不打包）

**Files:** 无代码改动（收尾核验）。

- [ ] **Step 1: 全量验收**：`bash verify.sh`（前端 typecheck+vitest+build 全绿；后端不受本批影响）。
- [ ] **Step 2: 真机冒烟**（`python server.py` + `cd frontend && npm run dev`）：5 跟进页（Temp/PaymentKey/KeyProjects/Opportunity/Risk）逐页核对——数据集/历史切换、删历史确认、归档（Key/Temp/Opp 清空 vs Risk/PaymentKey 留存）、导出选择、分页、单元格编辑（含 Risk/PaymentKey 日期选择 `@click.stop` 一致不误触发行跳转）、Risk 动态列/骨架屏、范围设置；/projects 系 4 页排序仍工作；换账号后 risk/paykey 跟进不残留上一账号数据；商机抽屉/进度弹窗保存失败弹错。
- [ ] **Step 3: 更新 PROGRESS**：记 V2.6.9 批3a 完成（前端重构+修复，**不 bump 版本、不打包，待批3b 设计清理后统一收尾**）。
- [ ] **Step 4: Commit**：`docs(progress): V2.6.9 批3a 前端重构+修复收官(待批3b设计清理+打包)`（含 Co-Authored-By）。

---

## Self-Review（作者已核对）

- **Spec 覆盖**（roadmap 第 5 节的重构+修复部分）：useFollowupPage=T2；FollowupToolbar/ArchiveModals→本 plan 落为 `FollowupModals` 组件(T4)+共享样式(T3)（**未单独抽 FollowupToolbar 组件**——工具栏各页 slot 差异大，抽组件净收益低、slot 插槽风险高；工具栏的重复由 composable 提供的共享态 + 各页保留模板承担）；5 页迁移=T5-9；useExternalSort=T10；usePagedRows 收敛=T1+composable 内用；useColumnPrefs 关列清筛选=T11；store 集中 reset=T12.1；保存失败反馈=T12.2；ScopeBuilder key=T12.3；filter.ts=T12.4。设计令牌违例（状态色/散值/图表色/.u-num/a11y/confirm）→**批3b**（本 3a 不含）。
- **降级/取舍声明**：不抽 FollowupToolbar 组件（slot 差异大，见上）；store reset 用"auth.ts 补两 store"最小改法而非 pinia 插件（插件会误 reset ui/settings 等不该 reset 的 store，风险高——记 backlog 可选）；5 跟进页选列迁移由 useFollowupPage 之外的各页保留（onToggle 收敛在 T11，但为避免与 T5-9 冲突，跟进页的 onToggle 是否并入 T11 由执行时按顺序决定，T11 明确聚焦非跟进页）。
- **Placeholder 扫描**：T2/T4 组件有完整代码；T3/T5-9/T10/T11/T12.3 明确要求"先读该页/组件现有代码原样搬"（因 Vue 模板/样式量大且须字节等价，照搬现网代码是正确做法、非占位符）。参数化差异全部落在 T5-9 的参数表（精确来自 5 页映射）。
- **类型/命名一致性**：`useFollowupPage(store, filtered)` 返回字段在 T2 定义、T5-9 五页统一消费；`FollowupModals` props/emits 在 T4 定义、T5-9 统一绑定；`usePagedRows`(T1 增强) 被 useFollowupPage(T2) 内部用；`useExternalSort`(T10)/`makeToggle`(T11) 各自独立。
- **风险排序**：T9(Risk 迁移,动态列/骨架屏/无样板)最高;T5-9 逐页迁移+每页即测+从规整到不规整顺序降险;T4(组件 slot/文案两组) 次之。T1/T2/T12 低风险。**批3a 全前端,回归网=既有 view 测试 + typecheck + build + 真机冒烟。**
- **执行顺序**：T1→T2→T3→T4(基础件)→T5→6→7→8→9(逐页迁移,同碰 followup 页顺序做)→T10→T11(其它页)→T12(小修复)→T13(验收)。
