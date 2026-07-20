# 回款域重构 + 统一标签筛选 + 回款跟进新页 + 列表分页 设计

> 日期：2026-07-02　语言：简体中文　适用仓库：项目管理平台（Vue3 + Vite + Pinia + Element Plus / Python 标准库后端）
> 交付方式：**分期（4 期），逐期一个版本、独立 verify 与上线**。版本统一落在 **2.6.X**。

## 1. 背景与目标

用户在回款相关页面发现「在建项目总数 638」与「回款页看到 557」的差异，并借此提出对回款域的整体重构 + 跨页标签筛选 + 新增回款跟进页 + 列表分页修复等一揽子需求。

**638 vs 557 已查明**（实测 `data/analysis_data.json`）：
- 在建主域全部项目 = **638**（`data.projects[]` = PMIS 在建 ∩ 组织架构交付三部）。
- 有非空收款阶段节点的项目 = **557**；**81 个在建项目的 `paymentNodes[pid]` 为空数组**（0 个有流水、25 个合同>0、56 个合同为 0/空）。
- 异常项目（orgL4 空）当前数据 = **0**，故差异**与异常排除无关**，纯粹是 81 个项目**没有收款阶段节点**。
- 现状口径不一致：`/payment/projects`、`/payment/plan` 用 638；`/payment` 总览、`/ledger`、`/payment/nodes` 用 557。这是用户"较大差异"的直接来源。
- 关联技术债（CLAUDE.md）：`collection_stages.csv` 导出端覆盖风险——导出漏在建项目则回款节点静默缺失、无告警。本次通过「无回款阶段数据项目」清单把这 81 个显式化。

**总目标**：回款域口径清晰化 + 表格能力对齐 /projects + 新增回款重点跟进闭环 + 跨页统一标签筛选 + 列表分页统一。

## 2. 分期与版本

| 期 | 版本 | 主题 | 是否需点「更新数据」 | 新 pageKey |
|---|---|---|---|---|
| **P1** | V2.6.0 | 回款域重构（重做 /payment、/payment/projects、/payment/nodes；删 /payment/plan、/payment/risk、/ledger） | 否（纯前端） | 无（删 3 个 key） |
| **P2** | V2.6.1 | 新页 /payment/key 回款重点跟进 | 否（新 json 自建；需给普通管理员**授权新页**） | `payment-key` |
| **P3** | V2.6.2 | 统一标签筛选（含「无标签」）铺到 /projects、/insight、/insight/costdetail、/insight/milestone 三表 | 否（纯前端） | 无 |
| **P4** | V2.6.3 | 5 页分页+总数统计、/risk 两列加筛选 | 否（纯前端） | 无 |

每期独立走 `verify.sh` 全绿 + 真机冒烟 + 更新 `PROGRESS.md`，再合 master、出更新包。P1 是最大一期。

## 3. 架构决策（复用优先，勘察已确认）

- **标签数据**：`stores/projectTags.ts`，`assignments: Record<projectId, string[]>`、`activeTags`（已过滤 disabled）。
- **全局"按标签排除"（统计层面）**：`stores/filter.ts` 的 `excludeOn/excludeTags/excludedIds/setExclude`。**本次不动它**，继续服务首页/成本/里程碑的统计口径。
- **本次新增"统一标签筛选"**：一个**各页本地、互不联动**的多选控件，选项 = `[无标签] + activeTags`，语义 = OR/并集展示（详见 P3）。与上面的全局排除是两个独立机制。
- **跟进页模板**：`ScopeBuilder.vue`（可传自定义 `catalog`）、`ProgressEditModal.vue`、`ColumnFilter.vue`+`stores/crossFilter.ts`、`useColumnPrefsDynamic`、后端 `temp_followup.py`/`risk_followup.py` 5 端点范式。/payment/key 照此复刻，**归档语义用 /risk（仅归档不清空）**。
- **表格能力**：`DataTable.vue`（`externalSort` 全量排序）、`useColumnPrefs`（选列+列排序）、`columnSort.withSortable`、`crossFilter`+`ColumnFilter`（列头多选筛选）、`projectExport`/`exportXlsx`（导出）、`usePagedRows`（分页）。
- **下钻抽屉**：`ProjectDetailDrawer.vue` 全局单例（`stores/projectDetail.ts`，AppLayout 单挂载），`size` prop 控宽。**全局加宽 600→900px**（影响回款项目/回款节点/多维分析/回款日历，可接受）。
- **项目级别 P1-P4**：取自 `pmis.status['项目级别']`（原始字符串，无归一化）。回款项目行需新增此取数。
- **pageKey 流程**：加到 `lib/pageAccess.ts` 的 `PageKey` 联合 + `nav.ts` 的 LINKS 数组即自动级联到 /admin 授权下拉与侧栏；**后端 auth.py 不按 pageKey 鉴权、无需改**。
- **延期下钻**：复用首页机制 `router.push('/projects?riskCategory=回款延期')`（ProjectsView 已消费 `route.query.riskCategory`）。

---

## 4. P1（V2.6.0）— 回款域重构

### 4.1 `/payment` 总览（`views/DashboardView.vue` + 子组件）

保留 `DashMetrics`（6 卡）+ `PaymentL4Table`（改），删 `TrendCard`（待回款金额）+ `OrgRanking`（服务组达成排名），新增「无回款阶段数据项目」清单。删后回收 `.dash-grid` 两列布局。

**4.1.1 六卡（`DashMetrics.vue`）改动**
- **项目数卡**：取值由现在的"有回款活动 557"改为**在建主域整体 638**（即 `filterProjects(projects, opts).length`，等价于 `data.projects[]` 经视角/排除后的全量；当前无异常、无排除时 = 638）。
  - 加一行副字说明：`N 个项目无回款阶段`，N = 638 − 有非空收款节点的项目数（当前 = 81）。副字**可点击**，跳 `/projects`（在建项目）。
  - 计算：新增纯函数（`lib/payDashboard.ts`）返回 `{ totalProjects, noStageCount }`，`noStageCount = inScope.filter(p => !(paymentNodes[p.projectId]?.length)).length`。
- **回款节点数卡**：内容不变；**点击跳 `/payment/nodes`**。
- **延期项目数卡**：**点击下钻同首页** → `router.push('/projects?riskCategory=回款延期')`。
- **已回款(万)/待回款(万)/完成率** 三卡：内容不变、无下钻。
- tile 当前是纯 `<div>`，需注入 `useRouter` + 给上述三卡加 `@click` 与 hover 手型（仅可点的三卡加 `.u-lift`/cursor，遵守交互五态）。

**4.1.2 回款数据表（`PaymentL4Table.vue`）**
- 标题「回款数据（按 L4 服务组）」→ **「回款数据」**。
- **增大填充页面**：删两卡后此表成为主内容，占满宽度（去掉原并排 grid 约束，卡片 `width:100%`，表体高度自适应/可视区填充）。列与数据口径不变（`summaryByDim(pr,'dept')`）。

**4.1.3 新增「无回款阶段数据项目」清单（回款数据表下）**
- 数据源：`dept_projects`（在建主域）中 `paymentNodes[pid]` 为空数组的项目（当前 81 个）。经视角/全局排除过滤后再取（与项目数卡分母一致）。
- 新纯函数 `lib/payDashboard.ts` `noStageProjects(projects, paymentNodes, opts)` → 行 `{ projectId, projectName, projectManager, orgL4, contractWan }`。
- 形式：`DataTable`，列 = 项目编号 / 项目名称 / 项目经理 / L4组 / 合同额(万)。**支持导出**（`exportRows`）。
- **行可点击** → `router.push('/project/${projectId})`（跳全页项目详情）。

### 4.2 `/payment/projects`（`views/PayProjectsView.vue`）

**4.2.1 表格能力对齐 /projects**（复刻 DataTable externalSort + useColumnPrefs 选列/列排序 + crossFilter/ColumnFilter 列头筛选 + projectExport 导出 + 统一标签筛选[P3 机制，本页 P1 内先接入本页版]）。
- 新 `TABLE_ID = 'pay-projects'`。
- 列：在现有回款列基础上**新增「项目级别」列**（取 `pmis.status['项目级别']`，`projectPaymentRows` 补字段或视图 join）。
- **去掉「来源」列**（`fromOrigin`）。
- 排序：externalSort 全量排序（对齐 CostDetailView 模式）。
- 导出：按当前筛选行导出。
- 标签筛选：本页多选（`[无标签]+activeTags`，OR）。（注：P3 会把同款机制铺到其它页；本页作为 P1 一部分先落地，抽出的共享件供 P3 复用。）

> 说明：标签筛选的共享实现放在 P3 抽组件；P1 里 /payment/projects、/payment/nodes 先用同一份纯函数逻辑接入，P3 再统一为共享组件并回填这两页。为避免返工，**P1 即建共享纯函数 `lib/tagFilter.ts`**（见 P3），两页直接用。

**4.2.2 下钻抽屉**
- 全局加宽：`ProjectDetailDrawer.vue` `size="600px"` → `size="900px"`（内部 `.pd-grid` 两列布局随宽度调整）。
- **无回款阶段项目的特殊态**（如 QAGD-SS-202508149002，`paymentNodes[pid]` 空）：抽屉内容判断——若该项目无收款阶段节点，正文显示「该项目无回款阶段数据」，并给一个**「查看完整详情」按钮** → `router.push('/project/${id}')`（与有数据项目的全页详情一致）。有节点项目维持现有抽屉内容。
  - 判断落点：`ProjectDetailDrawer.vue` 读 `data.paymentNodes[openId]?.length`。

### 4.3 `/payment/nodes`（`views/PayNodesView.vue`）

- **删维度**：删 `SegToggle` 维度切换（`.pv-ctl`）+ 维度分组表（`.dim-summary`）+ `dim/dimField/dimLabel/byDim` 逻辑 + `PAY_FACET_DIMS` 依赖。
- **保留 5 个 stat 卡**（`.nsum`，`nodeSummary`）。
- **主表增强**：
  - 新增「项目经理」列（`PayNodeRow.projectManager` 现成）、「L4组」列（`PayNodeRow.dept` 现成）。
  - 接入 externalSort 排序 + crossFilter/ColumnFilter 列头筛选 + 统一标签筛选（`lib/tagFilter.ts`，按 `row.projectId` 关联标签）+ 导出（按筛选行）。
  - 新 `TABLE_ID = 'pay-nodes'`。

### 4.4 删除 `/payment/plan`、`/payment/risk`、`/ledger`

- 删视图：`views/PayPlanView.vue`、`views/PayRiskView.vue`、`views/LedgerView.vue`、`components/LedgerTable.vue`。
- `router/index.ts`：删路由与顶部 import；旧路径 `/payment/plan`、`/payment/risk`、`/ledger` 及旧深链 `/panalysis/:tab`、`/analysis/:tab` 中指向 plan/risk 的分支 → **redirect 到 `/payment`**（保留 board→/insight/board、calendar→/insight/calendar 现有 redirect）。
- `nav.ts`：`PAYMENT_LINKS` 删「回款进度/风险项目/回款台账」三条；清理死代码 `TIER_TABS`（含 plan/risk 且无引用）。
- `lib/pageAccess.ts`：`PageKey` 联合删 `'payment-plan' | 'payment-risk' | 'ledger'`。
- `layout/AppSidebar.vue`：`activeSectionKey` 清 `startsWith('/ledger')` 分支。
- 同步测试：`router/index.test.ts`、`layout/AppSidebar.test.ts`、以及被删视图相关测试。
- 保留 lib 计算层 `lib/ledger.ts`/`lib/payDashboard.ts` 中仍被引用的部分；`lib/ledger.ts` 若仅 LedgerView 用则一并删（执行期 grep 确认）。

---

## 5. P2（V2.6.1）— 新页 `/payment/key` 回款重点跟进

**形态同 `/projects/temp`**（范围引擎 + 进度编辑 + 归档），**归档语义同 `/risk`（仅归档不清空）**。

### 5.1 后端
- 新 `payment_key_followup.py`（仿 `risk_followup.py`）：`PROGRESS_FIELDS = ('followAction','revConclusion','nextRevDate')`（跟进动作/rev结论/下次rev时间，与 /risk 同字段名以复用 ProgressEditModal 与日期内联）；`new_store/normalize_scope/apply_update/apply_archive(不清 current)/apply_archive_delete`。
- `server.py`：`PAYKEY_FOLLOWUP_FILE = data/payment_key_followup.json` + 原子写 `_load/_save`（仿 risk）；5 handler（get/scope/update/archive/archive-delete）；do_GET/do_POST 分派；`_SUPER_ONLY_PATHS` 加 `/api/payment-key-followup/scope`、`/archive`、`/archive/delete`（范围/归档超管专属；单格编辑任意登录用户）。
- 无 L4 二次裁剪（沿用上游 `/data` 已按 L4 裁剪）。

### 5.2 前端
- `lib/paymentKeyFollowupApi.ts`（仿 tempFollowupApi）、`stores/paymentKeyFollowup.ts`（仿 riskFollowup：archive 不清 current）。
- `lib/paymentKeyRows.ts`：行构建，投影回款相关字段。
- `views/PaymentKeyFollowupView.vue`（仿 TempFollowupView，复用 ScopeBuilder + ProgressEditModal + ColumnFilter + useColumnPrefsDynamic）。
- `ProgressEditModal.vue`：`store` 枚举加 `'paymentKey'`，`activeStore` 映射到新 store。
- 路由：`{ path:'/payment/key', name:'payment-key', component: PaymentKeyFollowupView, meta:{ title:'回款重点跟进', hideFilter:true, pageKey:'payment-key' } }`（精确路径，勿引 `/payment/:param`）。
- pageKey：`lib/pageAccess.ts` 加 `'payment-key'`；**nav 位置** = 「重点跟进」区、风险跟进下（加到渲染该区的 LINKS 数组，执行期确认具体数组名）。

### 5.3 范围引擎字段目录（自定义 catalog，传给 ScopeBuilder）
以回款、回款节点、项目数据为筛选列，建 `PAYKEY_FIELD_CATALOG`（`FieldLike[]`）：
- 项目组：项目经理、L4组、项目级别、客户、合同额(万)、项目状态/阶段。
- 回款组（项目级）：完成率、已回款(万)、待回款(万)、是否延期。
- 回款节点组（子表存在性）：收款阶段/节点状态、计划日、计划金额。
（具体取值口径 = 数据源原值；数值/日期用 between、枚举用 in/notIn、文本用 contains。）

### 5.4 展示列
- **默认列**：项目编号 / 项目名称 / 项目经理 / L4组 / 项目级别 / 合同额(万) / 跟进动作 / rev结论 / 下次rev时间。
- **其他列**：范围筛选涉及的字段（完成率、已回款、待回款、是否延期、收款阶段状态等），位置在**合同额(万)之后、跟进动作之前**，默认隐藏、可在选列里开。
- 归档按钮文案「归档（留存跟进）」，二次确认，超管专属；单格编辑任意登录用户。

---

## 6. P3（V2.6.2）— 统一标签筛选（含「无标签」）

### 6.1 共享机制
- 新 `lib/tagFilter.ts`（P1 已建、P3 完善）：
  - `NO_TAG = '无标签'` 常量（作为下拉里的特殊选项值，需避免与真实标签重名——若存在同名标签，用一个不可能重名的 sentinel 值如 `'__NOTAG__'`，label 显示「无标签」）。
  - `tagFilterOptions(activeTags): {value,label}[]` = `[{value:NO_TAG,label:'无标签'}, ...tags]`。
  - `tagMatch(projectTags: string[], selected: string[]): boolean`：`selected` 空 → true；否则 `(selected.includes(NO_TAG) && projectTags.length===0) || projectTags.some(t => selected.includes(t))`（OR/并集）。
- 新组件 `components/TagFilterSelect.vue`：`el-select multiple collapse-tags clearable`，选项来自 `tagFilterOptions(projectTags.activeTags)`，`v-model` 绑各页本地 `selectedTags: ref<string[]>`。**各页本地、互不联动**。

### 6.2 挂载点（按项目 id 关联 `projectTags.assignments`）
| 页面 | 落点 | 关联字段 |
|---|---|---|
| /projects（`ProjectsView.vue`） | 现有标签多选换用 `tagFilterOptions` 加「无标签」选项；过滤逻辑改用 `tagMatch`（原 `filterProjectRows` tags 分支替换） | `row.projectId` / `r.tags` |
| /insight（`InsightView.vue`） | 引入 `projectTags` + 本地 `selectedTags`；在 `buildInsightRows(projects,...)` **入参前**先按 `tagMatch(assignments[p.projectId]??[], selectedTags)` 过滤 `projects`，排名/交叉/透视随之变化 | `p.projectId` |
| /insight/costdetail（`CostDetailView.vue`） | 「项目成本明细」表 `rows` 过滤链加一环 tagMatch | `row.projectId` |
| /insight/milestone 三表（`MilestoneView.vue`） | 单一域源 `mps`（`buildMilestoneProjects`）处加 tagMatch 过滤 → 覆盖延期/到期/在建计划三表 | `p.projectId` |

- 控件位置：各页工具栏/筛选行，紧邻现有筛选控件。
- 不改全局 `filter.ts` 排除；两机制并存（全局统计排除 + 本页展示标签筛选）。

---

## 7. P4（V2.6.3）— 列表分页 + /risk 两列筛选

### 7.1 分页（5 页）
对 `KeyProjectsView`(/projects/key)、`OpportunityFollowupView`(/opportunities/key)、`TempFollowupView`(/projects/temp)、`RiskFollowupView`(/risk)、`PaymentKeyFollowupView`(/payment/key)：
- 加 `usePagedRows(filtered)`，`:rows` 换成 `paged`；翻页处加 `共 {{ filtered.length }} 条` + `el-pagination`（`page-sizes=[20,50,80,100]`，模板照 CostDetailView）。
- **数据量小、无需翻页时也展示总数统计**（`共 N 条` 常显，pager 可在单页时隐藏或保留）。
- 排序：这几页现用 el-table 原生排序（只排当前页）。分页后为避免"排序只作用本页"，**改用 externalSort 全量排序**（对齐 CostDetailView）。序号列（若有）按页偏移重算。

### 7.2 /risk 两列筛选
- `RiskFollowupView.vue` 的 `FILTERABLE` set 追加 `'revConclusion'`、`'nextRevDate'`。纯前端，`ColumnFilter` 自动生效（按值去重）。

---

## 8. 测试策略（每期 TDD，先测后码）
- **纯函数**（vitest）：`payDashboard` 新增 `noStageCount/noStageProjects`；`tagFilter.tagMatch`（空/无标签/多标签/混选）；`paymentKeyRows` 行构建；后端 `payment_key_followup`（pytest：normalize_scope/apply_update/apply_archive 不清 current/archive_delete 越界）。
- **组件/视图**（vitest）：DashMetrics 卡片取值与下钻、无回款阶段清单渲染+行点击、PayProjects 级别列+去来源列、PayNodes 删维度+新列、TagFilterSelect 选项含无标签、抽屉无节点特殊态、分页+总数、/risk 两列可筛选。
- **路由/侧栏**：删 3 页后 redirect、nav 不再出现、pageKey 授权下拉不含删除项、含新增 `payment-key`。
- 每期 `verify.sh` 全绿（语法/ruff/pytest/typecheck/vitest/build）+ 真机冒烟（承 design-review-screenshot-harness：系统 Chrome + --no-proxy-server + cookie 登录）。

## 9. 风险与技术债
- **抽屉全局加宽**影响 board/日历下钻——已确认可接受；冒烟需覆盖这两处。
- **删 /ledger/plan/risk** 的旧深链降级为 redirect→/payment，不报错但功能收敛；升级手册需说明。
- **统一标签筛选各页本地**：同页内"标签筛选=本页、全局排除=统计"两套作用域，升级手册与页面提示需讲清区别，避免用户混淆。
- 81 个无回款阶段项目仍是导出端覆盖风险的表征；本次仅"显式化"，未解决导出源头（保留为治理告警 backlog）。
- `pmis.status['项目级别']` 未归一化（可能出现历史值 A/B），级别列/筛选按原值展示。

## 10. 完成定义
每期：代码改完 + `verify.sh` 全绿 + 真机冒烟通过 + `PROGRESS.md` 更新 + 合 master + 出更新包/升级手册。四期全部完成即本设计交付完成。
