# V4.0.1 设计：/projects 三个日期列 + 标签筛选下沉 + temp 选列补齐

日期：2026-07-19
版本：**V4.0.1**（Z 级：无新增页面/路由，仅列与页内筛选位置调整）
基线：V4.0.0（已上线）

---

## 1. 目标

四件事，全部围绕「项目日期维度的可见性」与「筛选交互一致性」：

1. `/projects/temp` 选列补上**立项日期**（范围设置里早已有，选列漏同步）
2. `/projects` 新增三个默认隐藏列：**原项目立项日期 / 计划终验时间 / 实际终验时间**
3. 后两列同步进 `/projects/temp` 的**范围设置与选列**；原项目立项日期同步进 `/project/:id` 的**原项目选项卡**
4. `/projects` 的**标签筛选**从表格上方下沉进表头列筛选

用户原始需求中的「多实例临时跟进」与「蓝信推送路由逐项拆分」**不在本版**，见 §9。

---

## 2. 数据层：三列的来源截然不同

调研结论（这是本设计最重要的事实，直接决定工作量）：

| 列 | 数据来源 | 后端改动 |
|---|---|---|
| 原项目立项日期 | `projectPmis[relatedClosedId].status.立项日期` | **无**，前端派生 |
| 计划终验时间 | `projectPmis[pid].progress.终验时间` —— **已存在** | **无**，只是从未暴露成列 |
| 实际终验时间 | 不存在，需新增 | **有**，本版唯一的后端改动 |

### 2.1 计划终验时间：已经存在，不要重新造

`preprocess_data.py:86` 的 `backfill_final_acceptance()` 已经把 `milestones.final_acceptance_date()`
的结果回填进了 `project_pmis[pid].progress.终验时间`。而该函数（`milestones.py:182`）的口径是：

```python
target = "服务完成" if 项目类型 == config.PRESALE_PROJECT_TYPE else "终验"
→ 返回该里程碑的 planDate
```

**这与本次需求「售前服务类取服务完成计划时间，其他取终验计划时间」逐字一致。**

它今天已经出现在 `/projects/temp` 的范围设置里（`tempScope.ts:63`），只是 label 叫「终验时间」，
从名字看不出是计划还是实际。本版把它**正名**为「计划终验时间」，并暴露成 `/projects` 与
`/projects/temp` 的表格列。

### 2.2 实际终验时间：本版唯一的后端新增

与计划完全对称的口径，取 `actualDate` 而非 `planDate`：

- `milestones.py`：新增 `final_acceptance_actual_date(items, project_type)`，与
  `final_acceptance_date` 共用同一套 target 选择逻辑（售前→「服务完成」，其他→「终验」），
  只是取 `actualDate`。两个函数的 target 选择必须同源，不允许各写一遍。
- `preprocess_data.py`：`backfill_final_acceptance()` 一并回填 `progress.实际终验时间`。
  函数名与 docstring 相应更新（它现在回填两个字段）。
- `schema.py`：`PmisProgress` 加 `实际终验时间: Optional[str] = None`。
- 前端：`cd frontend && npm run gen:types` 重新生成 `src/types/analysis.ts`。

### 2.3 原项目立项日期：纯前端派生

`projectPmis` 已全量下发到前端，`relatedClosedId` 已在 `Project` 上。派生规则：

```
originSetupDate = relatedClosedId ? (pmisMap[relatedClosedId]?.status?.立项日期 ?? null) : null
```

**不加 `isPresale` 判断**：`relatedClosedId` 本就只在售前项目上非空（`projects.py:294-321`），
再叠一层 `isPresale` 是冗余条件，且一旦上游口径调整（如非售前也建映射）会变成静默丢数据。
非售前项目该列显示 `-`。

---

## 3. ⚠ 硬约束：`finalAcceptDate` 的 key 不许改名

`tempScope.ts:63` 的字段 key `finalAcceptDate` **必须原样保留**，本版只改它的 `label`
（「终验时间」→「计划终验时间」）。

原因：`data/temp_followup.json` 里用户已保存的范围条件是按 `field: 'finalAcceptDate'`
序列化存盘的（结构见 `followup_store.normalize_scope`）。改 key 会让已配好的范围条件
**静默失效**——条件仍在界面上显示，但 `evalCond` 永远匹配不到，用户看到的是「范围没变但项目
全没了」，且没有任何报错。

这正是本仓 `field-rename-orphan-consumers` 记录的坑型：`schema._Base` 的 `extra="allow"`
让 typecheck 沉默，自洽的 fixture 让 vitest 也沉默，只有真实存量数据会现形。

新增的实际终验时间使用新 key **`actualFinalAcceptDate`**，与既有 key 无冲突。

---

## 4. 落点：`/projects`

`frontend/src/views/ProjectsView.vue`

### 4.1 三个新列

加进 `ALL_COLUMNS`（`:48-73`），三者**都不**加进 `DEFAULT_VISIBLE`（`:75`）——即默认隐藏，
符合需求「默认不展示」。列定义比照既有 `setupDate` 列的形状：

```ts
{ key: 'originSetupDate', label: '原项目立项日期', width: 130, sortable: true,
  formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
{ key: 'plannedFinalAcceptDate', label: '计划终验时间', width: 120, sortable: true,
  formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
{ key: 'actualFinalAcceptDate', label: '实际终验时间', width: 120, sortable: true,
  formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
```

三者一并加进 `FILTERABLE`（`:76`）——`setupDate` 已在其中，日期列可筛是既有惯例。

### 4.2 行数据装配

`frontend/src/lib/projectList.ts` 的 `ProjectRow` 加三个字段并在 `buildProjectRows` 赋值。

计划终验取 `prog.终验时间`（**不是**新算），实际终验取 `prog.实际终验时间`——两者与既有
`stage`/`progress` 同源，都从 `m = pmisMap[p.projectId]` 的 `progress` 子对象取。

原项目立项日期的取数路径**与其余列都不同**，需特别注意：它读的是**另一个项目**的 PMIS 记录，
而非当前项目的。所幸 `buildProjectRows(projects, pmisMap, assignments)`（`:59`）签名里拿到的
就是全量 `pmisMap`，因此可直接索引：

```ts
originSetupDate: p.relatedClosedId
  ? ((pmisMap[p.relatedClosedId] as Record<string, any>)?.status?.立项日期 ?? null)
  : null,
```

不要误用函数体内已有的局部变量 `status`——那是**当前项目**的 `m.status`，用它会让每个售前项目
显示自己的立项日期，与需求完全相反，且因为两者都是合法日期而**不会报任何错**。

### 4.3 标签筛选下沉

- 删除 `<TagFilterSelect v-model="sp.tags" />`（`:158`）与该组件在本文件的 import
- `tags` 加进 `FILTERABLE`
- **`tags` 加进 `DEFAULT_VISIBLE`**（本版唯一的默认列变化）。理由：`ColumnFilter` 挂在表头，
  列隐藏则筛选入口一并消失。而标签筛选今天是工具栏常驻可见的——若下沉后仍保持默认隐藏，
  用户升级后的直接观感是「标签筛选功能没了」，得先想到去选列里勾出标签列才能找回。
  下沉的前提是入口可达，所以默认放出这一列。
  代价：`/projects` 默认列数 +1。若实际观感偏挤，可在验收时改回默认隐藏——但那样必须在
  升级手册里明写「标签筛选已移至表头，需先在选列勾出标签列」，否则就是静默的功能失踪。
- 清理死代码：`ProjectFilters.tags` 字段（`projectList.ts:44`）与 `applyProjectFilters` 里的
  `tagMatch` 分支（`:112`）在本页移除 `sp.tags` 后再无写入方，一并删除，并同步改
  `projectList.test.ts` 中相关用例。
  **注意** `tagFilter.ts` 的 `tagMatch`/`tagFilterOptions` 本身**不能删**——另有 5 个页面
  （`/costdetail`、`/insight`、`/milestone`、`/payment/nodes`、`/payment/projects`）在用。

**语义等价性**（这是下沉可行的前提，已核实）：`crossFilter.ts::cfUniqueValues` 有通用数组列
分支（元素级去重），`applyColumnFilters` 对数组列用 `sel.some(s => strs.includes(s))` —— OR
语义，与 `tagMatch` 的 OR 完全等价。**口径零漂移。**

**已知的一处行为差异**（有意接受）：`TagFilterSelect` 的选项来自「所有已定义标签」
（`tagFilterOptions`），`ColumnFilter` 的选项来自「当前数据里出现过的标签」。无任何项目使用的
标签将不再出现在筛选里。这是改进——选中它只会得到空结果。

**范围**：本版**只改 `/projects`**（用户明确选定）。其余 5 页的 `TagFilterSelect` 保持原位，
不改、不记技术债。

---

## 5. 落点：`/project/:id` 原项目选项卡

`frontend/src/views/ProjectDetailView.vue:266-270` 的 `originRows`，在「原项目名称」之后加一行：

```ts
{ k: '原项目立项日期', v: cm.value.status?.立项日期 || '-' },
```

`cm` 即 `page.value.closedPmis`，已是原项目的 PMIS 数据，直接取 `status.立项日期`，
与 §2.3 前端派生同源、不另开口径。

---

## 6. 落点：`/projects/temp`

### 6.1 根因：两份手工维护的字段清单

该页存在两份互不约束的清单：

| 清单 | 位置 | 服务于 |
|---|---|---|
| `FIELD_CATALOG` | `frontend/src/lib/tempScope.ts:36-83` | 范围设置（ScopeBuilder） |
| 本地 `ALL_COLUMNS` | `frontend/src/views/TempFollowupView.vue:62-93` | 表格列 + 选列（ColumnPicker） |

立项日期加进了前者、漏了后者，这就是需求第 1 项的根因。**本版只补齐，不重构成单一来源**——
那会把改动面扩到整页，且两份清单的字段集本就不完全重合（范围设置有 `paymentNode`/`milestone`
两组是表格列没有的），合并需要单独设计。

### 6.2 具体改动

**表格列 / 选列**（`TempFollowupView.vue` 本地 `ALL_COLUMNS`）新增三列：

```ts
{ key: 'setupDate', label: '立项日期', width: 110, sortable: true, formatter: ... },
{ key: 'plannedFinalAcceptDate', label: '计划终验时间', width: 120, sortable: true, formatter: ... },
{ key: 'actualFinalAcceptDate', label: '实际终验时间', width: 120, sortable: true, formatter: ... },
```

三者加进该页的 `FILTERABLE`（`:98`）。

**行数据**：`keyProjects.ts` 的 `KeyProjectRow` 已有 `setupDate`（`:20`，`buildProgressRowBase:52`
已赋值），故立项日期列**零数据改动、只补列定义**。另需给 `KeyProjectRow` 加
`plannedFinalAcceptDate` / `actualFinalAcceptDate` 两字段并在 `buildProgressRowBase` 赋值
（从 `pmis.progress` 取）。

**范围设置**（`tempScope.ts` 的 `FIELD_CATALOG`）：

- `finalAcceptDate` 的 label 改为「计划终验时间」（**key 不动**，见 §3）
- 新增 `{ group: 'project', key: 'actualFinalAcceptDate', label: '实际终验时间', kind: 'date' }`

**范围输入**（`tempFollowup.ts::buildScopeInputs` 的 `proj` 对象，`:87` 附近）加一行：

```ts
actualFinalAcceptDate: String(prog.实际终验时间 ?? '').slice(0, 10),
```

### 6.3 明确不做

「原项目立项日期」**不进** `/projects/temp`。需求只要求它进 `/projects` 与 `/project/:id`，
不擅自扩大。

---

## 7. 测试

**后端（pytest）**

- `tests/test_milestones.py`：为 `final_acceptance_actual_date` 补用例，与既有
  `test_final_acceptance_date`（`:111-119`）对称覆盖：非售前取终验、售前取服务完成、
  里程碑缺失→None、`actualDate` 为空串→None、空数组→None。
- `backfill_final_acceptance` 补用例：一次调用同时回填两个字段；某项目只有计划无实际时，
  `实际终验时间` 为 `None` 而非空串或缺键。
- `tests/test_schema.py`：`PmisProgress` 含 `实际终验时间`。

**前端（vitest）**

- `tempScope.test.ts`：补 `actualFinalAcceptDate` 的 `between` 条件用例（比照既有
  `finalAcceptDate` 用例 `:64-66`）。
- **回归锁**：补一条断言 `FIELD_CATALOG` 中存在 key 恰为 `finalAcceptDate` 的条目
  —— 直接把 §3 的硬约束钉进测试，将来任何人改这个 key 都会当场变红。
- `projectList.test.ts`：三个新字段的装配（含非售前项目 `originSetupDate` 为 null）；
  删除 `ProjectFilters.tags` 相关用例。
- `ProjectsView` 相关测试：标签筛选已不在工具栏；`tags` 在 `FILTERABLE` 中。

**变异验证**（本仓惯例，防「测试写了但抓不到」）：至少对 §3 的 key 回归锁做一次变异——
手动把 `finalAcceptDate` 改名，确认测试变红，再改回。

**口径核对**：改完用真实数据启服务，抽查若干售前与非售前项目，确认计划/实际终验时间
与 `/project/:id` 里程碑页签中「服务完成」/「终验」两行的 planDate/actualDate 逐一对得上。

---

## 8. 部署影响

> **⚠ 与 V4.0.0 不同：本版升级后必须点一次「更新数据」。**

本版改了主域管线产物（`progress.实际终验时间` 是 `preprocess_data.py` 回填的新字段），
不重跑管线则该列全为空。V4.0.0 是「无需点更新数据」的，存在惯性略过的风险，
升级手册须把这条放在头号注意位置。

其余：需换 `dist` + 覆盖 `milestones.py`/`preprocess_data.py`/`schema.py` + 重启后端。
无新增页面 / 路由 / pageKey / 授权项。

**`lts/` 隔离**：`lts/milestones.py` 是精简变体的独立副本，本版**不同步改动**（lts 已去除临时
跟进等域）。改 master 的 `milestones.py` 时须确认未污染 `lts/`，且根目录 pytest 不因此连带
跑挂 lts 用例（本仓 V3.2.3 曾踩过 lts 污染 master 根 pytest 的坑）。

---

## 9. 本版明确不做（留 V4.1.0）

用户原始需求的后两项，经确认拆版交付：

- **多实例临时跟进**：`/projects/temp` 页内多选项卡，沿用单一路由与 pageKey，
  后端 `temp_followup.json` 由单 scope 改为实例数组（各带 scope + current + archives）。
  需要数据迁移。
- **蓝信推送路由逐项拆分**：8 条问题类型与 8 类关注原因各自独立配置收件人规则，
  但**仍按人合并成一张卡**（一人多项 = 1 条消息、卡内多行），收件人取并集。
  需要 `lanxin_config.py` 的 routes 结构重构与迁移。

两者都改 `data/*.json` 结构、都需要迁移，放在一起单独设计与验证，避免与本版纯展示层
改动同批上线导致回滚粒度过粗。

---

## 10. 变更文件清单

**后端**
- `milestones.py` — 新增 `final_acceptance_actual_date`
- `preprocess_data.py` — `backfill_final_acceptance` 回填两个字段
- `schema.py` — `PmisProgress.实际终验时间`
- `tests/test_milestones.py`、`tests/test_schema.py`

**前端**
- `frontend/src/types/analysis.ts` — `gen:types` 重生成
- `frontend/src/lib/projectList.ts` — `ProjectRow` 三字段；删 `ProjectFilters.tags` 与 tagMatch 分支
- `frontend/src/lib/keyProjects.ts` — `KeyProjectRow` 两字段
- `frontend/src/lib/tempScope.ts` — label 正名 + 新字段
- `frontend/src/lib/tempFollowup.ts` — `buildScopeInputs` 新字段
- `frontend/src/views/ProjectsView.vue` — 三列 + FILTERABLE + 标签下沉
- `frontend/src/views/TempFollowupView.vue` — 三列 + FILTERABLE
- `frontend/src/views/ProjectDetailView.vue` — 原项目选项卡一行
- `frontend/src/version.ts` — V4.0.1
- 对应 `*.test.ts`

**文档**
- `PROGRESS.md`、`deploy/升级手册-V4.0.1.md`
