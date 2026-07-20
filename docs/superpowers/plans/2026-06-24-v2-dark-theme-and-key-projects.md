# V2.0.0 子项目一实现计划：深色底色 + /projects/key 增强

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development。Steps 用 `- [ ]`。

**Goal:** 调亮深色两底色到钦定值；/projects/key 历史快照改下拉、导出加一键全选。

**Architecture:** 纯前端。改 theme.css/echartsTheme.ts/对应 token 测试；重构 KeyProjectsView.vue 的数据集选择与导出弹窗。

**Tech Stack:** Vue3 `<script setup>` + TS + Element Plus + vitest。

## Global Constraints
- 无 emoji；设计令牌 `var(--*)`，不散写散值（控件宽度内联 px 属既有惯例）。
- 深色 hex 用**小写**（与 theme.css 既有风格一致）。
- 版本号本子项目**不** bump（V2.0.0 集成阶段统一改）。
- 改前端必须 `npm run typecheck` + `vitest` 绿。
- TDD：先改/加测试看红，再改实现看绿。

---

### Task 1: 深色底色三色调整 + 桥接/测试同步

**Files:**
- Modify: `frontend/src/styles/theme.css`（`html.dark` 块 `--bg`/`--card`/`--card2`）
- Modify: `frontend/src/charts/echartsTheme.ts:19`（`STRUCT_DARK.card`）
- Modify: `frontend/src/styles/theme.tokens.test.ts:107-108`（断言新 hex）
- 关联（不改，须保持绿）：`frontend/src/charts/echartsTheme.tokens.test.ts:53`（契约：`STRUCT_DARK.card === cssVar(dark,'--card')`）

**Interfaces:**
- Consumes: 无
- Produces: 新深色底色令牌；下游页面/图表自动随 `var(--card)`/`var(--bg)`/`var(--card2)` 取色。

**映射决策（保表面层级：页面底最暗 < 卡片面 < 抬升面）：**
- `--bg`（页面底）→ `#1c1a18`（柔和黑，最暗）
- `--card`（卡片面）→ `#1a1d24`（深灰，抬升一层）
- `--card2`（抬升面，派生联动）→ `#232730`（明显亮于 card，冷调同源）

- [ ] **Step 1: 改 token 测试为新值（RED）**

`theme.tokens.test.ts` 第 107-108 行：
```ts
    expect(dark).toContain('--bg: #1c1a18')
    expect(dark).toContain('--card: #1a1d24')
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd frontend && npx vitest run src/styles/theme.tokens.test.ts`
Expected: FAIL（theme.css 仍为旧值，toContain 不匹配）

- [ ] **Step 3: 改 theme.css `html.dark` 三行**

`theme.css` `html.dark`（约 129、132、133 行）：
```css
  --bg: #1c1a18;
  --card: #1a1d24;
  --card2: #232730;
```
（其余结构色/状态色/图表色不动。）

- [ ] **Step 4: 同步 echartsTheme.ts 桥接（契约）**

`echartsTheme.ts:19`：把 `card: '#121212'` 改为 `card: '#1a1d24'`（须与新 `--card` 严格相等，否则 `echartsTheme.tokens.test.ts:53` 红）。其余 STRUCT_DARK 不动（dark 不含 bg/card2）。

- [ ] **Step 5: 跑全部相关测试确认绿**

Run: `cd frontend && npx vitest run src/styles/theme.tokens.test.ts src/charts/echartsTheme.tokens.test.ts`
Expected: PASS（token 断言 + 桥接契约均绿）

- [ ] **Step 6: typecheck + commit**

Run: `cd frontend && npm run typecheck`
```bash
git add frontend/src/styles/theme.css frontend/src/charts/echartsTheme.ts frontend/src/styles/theme.tokens.test.ts
git commit -m "$(printf 'feat(theme): 深色两底色调亮(柔和黑#1c1a18/深灰#1a1d24)+card2派生上调\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: /projects/key 历史快照改下拉 + 导出一键全选

**Files:**
- Modify: `frontend/src/views/KeyProjectsView.vue`
- Test: 定位现有 KeyProjectsView 组件测试（`frontend/src/views/KeyProjectsView*.test.ts` 或 `frontend/src/**/KeyProjects*.spec.ts`，用 glob 找；若无则新建 `frontend/src/views/KeyProjectsView.dataset.test.ts`）

**Interfaces:**
- Consumes: `useProjectProgressStore().archives`（`{archiveTime, rows}[]`，append 序，末尾最新）；`exportSheets`。
- Produces: `defineExpose({ mode, historyIdx, isCurrent, exportSel, allSelected })`（保留 `isCurrent` 语义不变）。

**设计要点（见 spec 2.1/2.2）：**
- 数据集控件：两段 SegToggle `mode∈{current,history}` + history 时 `el-select` 选 `historyIdx`。
- `isCurrent = computed(() => mode.value==='current')`（保留，老用例兼容）。
- `rows = isCurrent ? currentRows : (archives[historyIdx]?.rows ?? [])`。
- 默认 `mode='current'`；`historyIdx` 默认最新 = `archives.length-1`（archives 空时历史段禁用）。
- 导出弹窗加「全选」`el-checkbox`：`allSelected` 派生于 `exportSel.length===datasetOpts.length`，`indeterminate` 派生于 `0<exportSel.length<total`；勾选→`exportSel=全部value`，取消→`exportSel=[]`。

- [ ] **Step 1: 写失败测试（RED）**

在 KeyProjectsView 测试文件加用例（用 `mount` + Pinia + 预置 `progress.archives`）：
```ts
// a) 默认当前数据
it('默认 mode=current、isCurrent 为真', () => {
  const wrapper = mountView()  // 复用文件内现有挂载 helper；无则参考其他 view 测试构造
  expect(wrapper.vm.isCurrent).toBe(true)
})
// b) 切历史→取最新 archive 行
it('切历史数据后默认选最新快照、rows 取该快照', async () => {
  const wrapper = mountView({ archives: [
    { archiveTime: '2026-01-01 10:00', rows: [{ projectId: 'A' }] },
    { archiveTime: '2026-02-01 10:00', rows: [{ projectId: 'B' }] },
  ]})
  wrapper.vm.mode = 'history'
  await wrapper.vm.$nextTick()
  expect(wrapper.vm.historyIdx).toBe(1)         // 最新
  expect(wrapper.vm.isCurrent).toBe(false)
})
// c) 导出全选/全不选
it('全选切换 exportSel', async () => {
  const wrapper = mountView({ archives: [{ archiveTime: 't', rows: [] }] })
  wrapper.vm.toggleAllExport(true)
  expect(wrapper.vm.exportSel.length).toBe(wrapper.vm.datasetOpts.length)
  wrapper.vm.toggleAllExport(false)
  expect(wrapper.vm.exportSel).toEqual([])
})
```
> 实现者：先读现有 KeyProjectsView 测试文件，沿用其挂载/stub 范式（Element Plus、router、stores）。若现有 defineExpose 不含 mode/historyIdx/exportSel/toggleAllExport，本任务实现步骤会补上。

- [ ] **Step 2: 跑测试确认红**

Run: `cd frontend && npx vitest run <KeyProjectsView 测试文件>`
Expected: FAIL（mode/historyIdx/toggleAllExport 未定义）

- [ ] **Step 3: 改 `<script setup>` 数据集逻辑**

替换原 `dataset`/`datasetOpts`/`isCurrent`/`rows` 段为：
```ts
const mode = ref<'current' | 'history'>('current')
const historyIdx = ref(0)
const isCurrent = computed(() => mode.value === 'current')

const datasetOpts = computed(() => [
  { value: 'current', label: '当前数据' },
  ...progress.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime })),
])
const historyOpts = computed(() =>
  progress.archives.map((a, i) => ({ value: i, label: a.archiveTime })))

// 进入历史/archives 变化时，默认指向最新快照
watch(
  () => [mode.value, progress.archives.length] as const,
  () => { if (mode.value === 'history') historyIdx.value = Math.max(0, progress.archives.length - 1) },
)

const currentRows = computed<KeyProjectRow[]>(() => /* 原 currentRows 实现保持 */ buildKeyProjectRows(
  (data.data?.projects ?? []) as Project[],
  (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>,
  progress.current,
))
const rows = computed<KeyProjectRow[]>(() =>
  isCurrent.value ? currentRows.value : ((progress.archives[historyIdx.value]?.rows ?? []) as KeyProjectRow[]))
```
（`watch` 从 vue 引入。）`openEdit`/`doArchive`/`doExport` 内用 `isCurrent` 的逻辑不变。`doArchive` 末尾 `dataset.value='current'` 改为 `mode.value='current'`。

- [ ] **Step 4: 改导出全选逻辑（script）**

```ts
const allSelected = computed(() =>
  exportSel.value.length > 0 && exportSel.value.length === datasetOpts.value.length)
const exportIndeterminate = computed(() =>
  exportSel.value.length > 0 && exportSel.value.length < datasetOpts.value.length)
function toggleAllExport(val: boolean) {
  exportSel.value = val ? datasetOpts.value.map((o) => o.value) : []
}
```
`defineExpose` 改为：`defineExpose({ editOpen, editCtx, mode, historyIdx, isCurrent, exportSel, allSelected, datasetOpts, toggleAllExport })`。

- [ ] **Step 5: 改模板**

数据集控件块（原 SegToggle）替换为：
```vue
<span class="kp-label">数据集</span>
<SegToggle v-model="mode" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
<el-select v-if="mode === 'history'" v-model="historyIdx" size="small" style="width: 200px"
  :disabled="!progress.archives.length" placeholder="选择历史快照">
  <el-option v-for="o in historyOpts" :key="o.value" :label="o.label" :value="o.value" />
</el-select>
```
导出弹窗 `el-checkbox-group` 之前插全选：
```vue
<el-checkbox :model-value="allSelected" :indeterminate="exportIndeterminate"
  @change="toggleAllExport($event as boolean)">全选</el-checkbox>
```

- [ ] **Step 6: 跑测试 + typecheck 确认绿**

Run: `cd frontend && npx vitest run <KeyProjectsView 测试文件> && npm run typecheck`
Expected: PASS

- [ ] **Step 7: commit**

```bash
git add frontend/src/views/KeyProjectsView.vue frontend/src/**/KeyProjects*.test.ts
git commit -m "$(printf 'feat(key-projects): 历史快照改下拉选择 + 导出弹窗一键全选\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Self-Review
- Spec 覆盖：深色三色映射(Task1)、桥接/测试同步(Task1)、历史下拉(Task2 S3/S5)、导出全选(Task2 S4/S5) 均有任务。
- Placeholder：测试文件路径用 glob 定位（实现者第一步读现有文件确定）；其余均给出实际代码。
- 类型一致：`isCurrent` 在两任务语义不变；`mode`/`historyIdx`/`toggleAllExport` 在 S3/S4 定义、S1 测试引用、S4 expose，一致。
