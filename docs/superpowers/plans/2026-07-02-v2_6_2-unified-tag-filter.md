# P3 统一标签筛选（含「无标签」）铺开（V2.6.2）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 逐任务实现。步骤用 checkbox（`- [ ]`）跟踪。

**Goal:** 把 P1 已建的统一标签筛选（`lib/tagFilter.ts` + `TagFilterSelect.vue`，选项 = `[无标签]+启用标签`、OR 并集、各页本地）铺到 /projects、/insight、/insight/costdetail、/insight/milestone。

**Architecture:** 纯前端。复用 `TagFilterSelect`（含「无标签」选项）+ `tagMatch(projectTags, selected)`（`@/lib/tagFilter`）。**不动全局 `stores/filter.ts` 的「按标签排除（统计层面）」**——两套独立机制。各页作用域按用户措辞精确落点：/projects 与 /insight 影响整页项目集；costdetail 只影响「项目成本明细」表；milestone 只影响下方三表（不动 KPI/图）。

**Tech Stack:** Vue3+TS+Pinia+Element Plus / Vitest。

## Global Constraints（每任务隐含遵守）

- **不使用任何 emoji**；只引设计令牌不手写散值。
- 版本单一来源 `frontend/src/version.ts`，本期 **V2.6.2**（延续 2.6.X，Z 级）。
- 标签筛选=**各页本地、互不联动**；选项含「无标签」；语义走 `tagMatch`（OR 并集，空=全部）。**不改** filter.ts 全局排除。
- 数字列 `.u-num`；改计算逻辑先补/改测试；声称完成前 `bash verify.sh` 全绿。
- **本轮 P2-P4 不出升级包**，到 P4/V2.6.3 统一出累积包；本期只合 master。
- commit 仅在特性分支按任务提交（尾行 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`）；不动本期外既有未提交工作树改动。

## 复用件（P1 已建，勿重建）

- `frontend/src/lib/tagFilter.ts`：`NO_TAG_VALUE`、`tagFilterOptions(activeTags)`、`tagMatch(projectTags, selected)`。
- `frontend/src/components/TagFilterSelect.vue`：`el-select` 多选，`v-model` 绑 `string[]`，选项 = `tagFilterOptions(projectTags.activeTags)`，`data-test="tag-filter"`，width 140px。
- 标签数据：`useProjectTagsStore()` 的 `assignments: Record<projectId, string[]>`（`tags.assignments[pid] ?? []`）。

## 文件结构（P3 落点）

- 修改：`frontend/src/lib/projectList.ts`（filterProjectRows tags 分支改 tagMatch）、`frontend/src/views/ProjectsView.vue`、`frontend/src/views/InsightView.vue`、`frontend/src/views/CostDetailView.vue`、`frontend/src/views/MilestoneView.vue`、`frontend/src/version.ts`、`PROGRESS.md`
- 测试：`frontend/src/lib/projectList.test.ts` + 各视图 `*.test.ts`（追加）

---

### Task 1: /projects 标签筛选换 TagFilterSelect（含无标签）

**Files:**
- Modify: `frontend/src/lib/projectList.ts`（`filterProjectRows` tags 分支）
- Modify: `frontend/src/views/ProjectsView.vue`（标签下拉换组件）
- Test: `frontend/src/lib/projectList.test.ts`（追加 无标签/OR 用例）

- [ ] **Step 1: 写失败测试**（`projectList.test.ts` 追加）：`filterProjectRows` 的 tags 用 `NO_TAG_VALUE`（from `@/lib/tagFilter`）时只留无标签行；选标签时 OR 命中；混选并集。示例：

```ts
import { NO_TAG_VALUE } from '@/lib/tagFilter'
// rows: A tags ['x'], B tags []
expect(filterProjectRows(rows, { ...base, tags: [NO_TAG_VALUE] }).map(r=>r.projectId)).toEqual(['B'])
expect(filterProjectRows(rows, { ...base, tags: ['x'] }).map(r=>r.projectId)).toEqual(['A'])
expect(filterProjectRows(rows, { ...base, tags: [NO_TAG_VALUE,'x'] }).map(r=>r.projectId)).toEqual(['A','B'])
```
（`base` = 其余 ProjectFilters 字段空。）

- [ ] **Step 2: 失败** `cd frontend && npx vitest run src/lib/projectList.test.ts`
- [ ] **Step 3: 实现**
  - `projectList.ts`：顶部 `import { tagMatch } from './tagFilter'`；`filterProjectRows` 的 tags 分支（现 L103-106）替换为：
    ```ts
    if (f.tags && f.tags.length && !tagMatch(r.tags ?? [], f.tags)) return false
    ```
  - `ProjectsView.vue`：import `TagFilterSelect`；模板里现有标签 `el-select`（`v-model="sp.tags"` 那段）整体替换为 `<TagFilterSelect v-model="sp.tags" />`。`sp.tags` 仍是 `string[]`（现在可含 `NO_TAG_VALUE`），过滤链不变（`filterProjectRows` 已改 tagMatch）。若 ProjectsView 有清空/重置逻辑涉及 tags，保持置 `[]` 即可。
- [ ] **Step 4: 通过 + typecheck + 全量 vitest 无回归**
- [ ] **Step 5: Commit** `feat(projects): 标签筛选换统一 TagFilterSelect(含无标签,tagMatch)`

---

### Task 2: /insight 整页标签筛选

**Files:**
- Modify: `frontend/src/views/InsightView.vue`
- Test: `frontend/src/views/InsightView.test.ts`（新建或追加）

- [ ] **Step 1: 写失败测试**：挂载 InsightView（data stub 含 2 项目，其一有标签一无）；断言存在 `[data-test=tag-filter]`；选某标签后 rank/groups 项目集随之收窄（可 defineExpose selectedTags/rows 或断言渲染行数变化）。参照既有 view 测试风格。
- [ ] **Step 2: 失败**
- [ ] **Step 3: 实现**（InsightView.vue）：
  - import `useProjectTagsStore`、`TagFilterSelect`、`tagMatch`；`const projectTags = useProjectTagsStore()`；`onMounted` 加 `if (!projectTags.loaded) projectTags.load()`。
  - `const selectedTags = ref<string[]>([])`。
  - `rows` computed（现 L24-29）改为先按标签过滤底层项目：
    ```ts
    const rows = computed(() => {
      const ps = ((data.data?.projects ?? []) as Project[])
        .filter((p) => tagMatch(projectTags.assignments[p.projectId] ?? [], selectedTags.value))
      return buildInsightRows(ps, (data.data?.projectPmis ?? {}) as Record<string, ProjectPmis>)
    })
    ```
  - 工具栏（`.iv-toolbar` 首行）加 `<TagFilterSelect v-model="selectedTags" />`（放在 SegToggle 之后）。
  - `defineExpose({ selectedTags })`（便于测试）。
- [ ] **Step 4: 通过 + typecheck**
- [ ] **Step 5: Commit** `feat(insight): 整页标签筛选(聚合前过滤底层项目,含无标签)`

---

### Task 3: /insight/costdetail「项目成本明细」表标签筛选

**Files:**
- Modify: `frontend/src/views/CostDetailView.vue`
- Test: `frontend/src/views/CostDetailView.test.ts`（追加）

**作用域：仅「项目成本明细」表**（不动 KPI 卡 / 超支分布图 / L4 汇总——它们用 `rows`，明细表用 `filtered`→`sorted`）。

- [ ] **Step 1: 写失败测试**：挂载 CostDetailView（stub），断言 `[data-test=tag-filter]` 存在于明细表工具栏；选标签后 `filtered`/`sorted` 行收窄，而 `kpi`（用 rows）不变。
- [ ] **Step 2: 失败**
- [ ] **Step 3: 实现**（CostDetailView.vue）：
  - import `useProjectTagsStore`、`TagFilterSelect`、`tagMatch`；`const projectTags = useProjectTagsStore()`；`onMounted` 已有 `if(!data.data)data.load()`，追加 `if(!projectTags.loaded) projectTags.load()`。
  - `const selectedTags = ref<string[]>([])`。
  - `filtered` computed（现 L138-146）在 `applyColumnFilters` 之后、关键词之前，加一环标签过滤：
    ```ts
    const colFiltered = applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID))
    const tagged = colFiltered.filter((x) => tagMatch(projectTags.assignments[x.projectId] ?? [], selectedTags.value))
    const kw = fKw.value.trim()
    let r = kw ? tagged.filter(...) : tagged
    ...(其余不变)
    ```
  - 明细表工具栏 `.cd-bar`（现 L209-214，含关键词/重置/清除/导出）加 `<TagFilterSelect v-model="selectedTags" />`。
  - `reset()` 里加 `selectedTags.value = []`。
- [ ] **Step 4: 通过 + typecheck**
- [ ] **Step 5: Commit** `feat(costdetail): 项目成本明细表标签筛选(仅明细表,含无标签)`

---

### Task 4: /insight/milestone 下方三表标签筛选

**Files:**
- Modify: `frontend/src/views/MilestoneView.vue`
- Test: `frontend/src/views/MilestoneView.test.ts`（追加）

**作用域：仅下方三表（延期项目清单/到期提醒/在建里程碑计划）**——KPI/6 图仍用 `mps`，三表用 `mpsFiltered`。

- [ ] **Step 1: 写失败测试**：挂载 MilestoneView（stub，projectTags 有 assignments），断言三表区存在 `[data-test=tag-filter]`；选标签后传给三表组件的 projects 收窄，而 `kpi`（用 mps）不变。（可 defineExpose `mps`/`mpsFiltered`/`selectedTags` 断言长度差异。）
- [ ] **Step 2: 失败**
- [ ] **Step 3: 实现**（MilestoneView.vue）：
  - import `TagFilterSelect`、`tagMatch`（`useProjectTagsStore` 已 import，`projectTags.load()` 已在 onMounted）。
  - `const selectedTags = ref<string[]>([])`。
  - 新增 `const mpsFiltered = computed(() => mps.value.filter((m) => tagMatch(projectTags.assignments[m.projectId] ?? [], selectedTags.value)))`（**确认 `mps` 元素有 `projectId` 字段**——通读 `buildMilestoneProjects` 返回类型;三表组件既用 `row.projectId` 说明有）。
  - 三表组件（`<MilestoneDelayedTab>`/`<MilestoneReminderTab>`/`<MilestonePlanTab>`，现 `:projects="mps"`）改为 `:projects="mpsFiltered"`。KPI/6 图的 `mps` 引用**不动**。
  - 在三表 SegToggle（`detailTab` 切换,detail 区）附近加 `<TagFilterSelect v-model="selectedTags" />`（放在 detail-tab 工具行；仅作用三表,视觉上靠近三表区）。
  - `defineExpose` 补 `mps`/`mpsFiltered`/`selectedTags`（若已 expose 则追加）。
- [ ] **Step 4: 通过 + typecheck + 全量 vitest 无回归**
- [ ] **Step 5: Commit** `feat(milestone): 下方三表标签筛选(仅三表不动KPI/图,含无标签)`

---

### Task 5: 版本 + PROGRESS + 验证

**Files:**
- Modify: `frontend/src/version.ts`、`PROGRESS.md`

- [ ] **Step 1:** `version.ts`：`APP_VERSION='V2.6.2'`、`RELEASE_DATE='2026-07-02'`。
- [ ] **Step 2:** `PROGRESS.md`：加 V2.6.2 版本节（P3 四页标签筛选 + 各页作用域说明；**纯前端,升级不需更新数据/无新页/无新 pageKey**；本轮不出包到 P4 统一）。
- [ ] **Step 3: 全量验证** `bash verify.sh` 全绿。
- [ ] **Step 4: 真机冒烟**（承 design-review-screenshot-harness）：四页各有标签筛选下拉且含「无标签」选项；/projects 选「无标签」只剩无标签项目、选标签 OR 命中;/insight 选标签后排名维度随之变;costdetail 选标签后明细表收窄而 KPI 卡不变;milestone 选标签后三表收窄而上方 KPI/图不变;全局「按标签排除」仍独立工作;0 console 报错。
- [ ] **Step 5: Commit** `chore(release): V2.6.2 统一标签筛选铺开 版本+PROGRESS`

---

## 自查（写完计划的检查）

- **spec 覆盖**：spec §6（统一标签筛选）+ 用户 item 2（四页,含各页作用域措辞:/insight 整页、costdetail 明细表、milestone 三表）→ Task 1-4;收尾 Task 5。✓
- **占位扫描**：各任务给了精确落点行 + 关键代码片段;复用件不重建。✓
- **作用域精确**：/projects+/insight 整页项目集；costdetail 仅 `filtered`(明细表);milestone 仅 `mpsFiltered`(三表)——KPI/图不受影响,符合用户措辞。✓
- **不碰全局排除**：filter.ts 的 excludeOn/excludeTags 全程不动;milestone 现有 excludeOn/excludeTags 控件保留(与新标签筛选并存,两套作用域)。✓
- **顺序**：Task 1 改 projectList.filterProjectRows(共享)先行;Task 2-4 各页独立、无相互依赖;Task 5 收尾。✓
