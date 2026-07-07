# V2.6.15 签约单位列 + 售前回退 + 佳杰规则标签 —— 设计

> 版本：V2.6.15（Z 级；含后端 schema + preprocess 改动，**升级须点「更新数据」**，同 V2.3.2 模式）
> 交流语言：简体中文。

## 1. 背景与目标

「签约单位」字段 PMIS 已逐项目解析进 `projectPmis[pid].customer.签约单位`（`pmis.py:229`），已关闭原项目亦然（售前映射目标经 `extra_closed_ids` 收录）。但当前：
- `/projects` 无签约单位列；`/project/:id` 只显示**本项目**签约单位（售前服务类本项目该字段几乎全空 → 显 "-"）。
- 「佳杰」标签靠**手动逐个标注**（`project_tags.json` 的 `assignments`），共 23 个项目，维护跟不上。

三项目标：
1. `/projects` 增加「签约单位」列，默认隐藏。
2. 售前服务类项目签约单位**回退原项目**，展示在 `/projects` 该列与 `/project/:id`。
3. 增加规则：签约单位（回退后）为「上海伟仕佳杰科技有限公司」的项目自动打「佳杰」标签，新项目自动跟随。

## 2. 关键数据事实（实测 `analysis_data.json` + `project_tags.json`，2026-07-06）

- 当前手动「佳杰」= **23 个**（21 个在主域）。
- 按规则（回退后签约单位 == 上海伟仕佳杰科技有限公司）**全主域命中 128 个** → 规则生效后佳杰标签从 23 扩到约 128（新增约 112 个）。**这是"新项目自动打上"的必然效果，已与用户确认为期望。**
- 128 命中里约 34 个是**售前、需回退原项目**才判得出（本项目签约单位空）→ 印证回退的必要性。
- 现有 23 手动佳杰里 **7 个规则判不出**：5 个签约单位全空、1 个原项目签约单位是「北京方正慧新」、2 个已出主域。**这 7 个靠保留手动 assignments 不丢。**

## 3. 架构决策（均已与用户确认）

| 决策 | 选择 | 理由 |
|---|---|---|
| 签约单位回退落点 | **后端单一来源** | 落 `Project.signUnit`，列/详情/规则同一口径；仿 `effective_customer` 先例 |
| 佳杰标签实现 | **规则自动派生** | 复活 `tagSeed`，每次更新数据重算；不写标签文件、签约单位纠正后自动回收 |
| 佳杰匹配口径 | **精确等于全称** | 数据里签约单位就是唯一规范全称，零误伤 |
| 规则生效范围 | **全站一致** | 佳杰规则标签与手动标签同等对待，凡读标签处皆体现（单点注入 `effectiveAssignments`） |
| 列位置 | 靠近「标签」列 | 客户属性聚在一起 |

## 4. 详细设计

### 4.1 后端：签约单位回退单一来源

- **`projects.py`** 新增纯函数：
  ```python
  def effective_sign_unit(is_presale: bool, own_su: str, orig_su: str) -> str:
      """有效签约单位(单一来源):非售前=本项目签约单位;售前=原项目签约单位,空则空串。"""
      if not is_presale:
          return own_su or ""
      return orig_su or ""
  ```
  在 `build_projects` 循环里（现有 `effective_customer` 旁）：
  ```python
  own_su = str(customer.get("签约单位") or "").strip()
  orig_su = str(((project_pmis.get(related_closed) or {}).get("customer") or {}).get("签约单位") or "").strip()
  sign_unit = effective_sign_unit(is_presale, own_su, orig_su)
  ```
  落入输出 dict：`"signUnit": sign_unit`。

- **`schema.py`** `Project` 加字段（`customer` 旁）：
  ```python
  signUnit: str = ""   # 有效签约单位(单一来源):非售前=本项目签约单位;售前=原项目签约单位
  ```
- **`npm run gen:types`** 重新生成 `frontend/src/types/analysis.ts`（`Project.signUnit?: string`）。

### 4.2 后端：佳杰规则派生 tagSeed

- **`config.py`** 加表驱动规则（表驱动便于未来扩展，成本同硬编码）：
  ```python
  # 签约单位 → 自动标签 规则(精确等于全称)。当前仅佳杰一条。
  SIGN_UNIT_TAG_RULES = {"上海伟仕佳杰科技有限公司": "佳杰"}
  ```
- **`preprocess_data.py`** 新增：
  ```python
  def derive_sign_unit_tag_seed(project_rows):
      """按 config.SIGN_UNIT_TAG_RULES 精确匹配 signUnit → {pid: [tag,...]}。"""
      seed = {}
      for p in project_rows:
          tag = config.SIGN_UNIT_TAG_RULES.get((p.get("signUnit") or "").strip())
          if tag:
              seed[p["projectId"]] = [tag]
      return seed
  ```
  `"tagSeed": {}` → `"tagSeed": derive_sign_unit_tag_seed(dept_projects)`（`dept_projects` 已含 `signUnit`）。
- **`schema.py`** `tagSeed: Dict[str, List[str]]` 字段已存在，无需改。

### 4.3 前端：projectTags store —— seed / manual 分离（核心正确性设计）

现状：`assignments` 既是持久化数据、又是展示来源；`save()` 写 `assignments`；`tagsOf` = `assignments[pid]`。

改造后**严格区分三类读取**：

| 名称 | 含义 | 用途 | 是否含 seed |
|---|---|---|---|
| `assignments` | 手动分配（持久化） | **编辑、save** | 否 |
| `seed` | 规则派生（只读，来自 `data.tagSeed`） | — | — |
| `effectiveAssignments` | `assignments ∪ seed` 合并去重（map） | 展示/筛选/导出（需整表处） | 是 |
| `tagsOf(pid)` | 合并去重（单项目） | 单项目展示 | 是 |
| `manualTagsOf(pid)` | `assignments[pid]`（不含 seed） | **详情页编辑基线** | 否 |
| `seedTagsOf(pid)` | `seed[pid]`（只读规则） | 详情页只读 chip | 仅 seed |

- `seed` = computed 读 `useDataStore().data?.tagSeed ?? {}`（惰性，随 data 变）。
- **`save()` 仍只写 `assignments`**（绝不含 seed）→ 规则不写 `project_tags.json`、不污染手动数据。
- 合并去重：`[...new Set([...(assignments[pid] ?? []), ...(seed[pid] ?? [])])]`。

### 4.4 前端：/projects 列（需求 1 + 2 展示）

- **`projectList.ts`**：`ProjectRow` 加 `signUnit: string`；`buildProjectRows` 里 `signUnit: p.signUnit || '-'`。
- **`ProjectsView.vue`**：
  - `ALL_COLUMNS` 在 `tags` 列旁加 `{ key: 'signUnit', label: '签约单位', width: 180, sortable: true }`。
  - **不加入 `DEFAULT_VISIBLE`** → 默认隐藏（ColumnPicker 可勾出）。
  - 加入 `FILTERABLE` → 支持列头枚举筛选。
  - `buildProjectRows(..., projectTags.assignments)` → 改传 `projectTags.effectiveAssignments`（line 39）。
  - 导出 `assignments: projectTags.assignments`（line 130）→ `effectiveAssignments`。

### 4.5 前端：/project/:id（需求 2 展示 + 标签编辑安全）

- 签约单位展示（`ProjectDetailView.vue:308`）：`m.customer?.签约单位` → `p.signUnit || '-'`（读后端回退后字段）。
- 标签区（line 27-44）：
  - 展示 chips 分两组：手动标签（`manualTagsOf`，带删除按钮）+ 规则标签（`seedTagsOf`，**只读、无删除按钮**，或以中性样式标识"规则")。
  - 新增标签：基于 `manualTagsOf`（不含 seed）计算 `setProjectTags(pid, [...manualTagsOf, name])` → 不把佳杰写进文件。
  - 删除：只作用手动标签；规则标签不可删（删了下次派生又回来，故不给入口，避免困惑）。

### 4.6 前端：全站标签消费方统一（需求 3 全站一致）

以下展示/筛选点由 `assignments[pid]` / `assignments` 改为读合并值（`tagsOf(pid)` 或 `effectiveAssignments`）：

| 文件:行 | 现状 | 改为 |
|---|---|---|
| `stores/filter.ts:71` | `Object.entries(assignments)` | `effectiveAssignments` |
| `views/BoardView.vue:66` | 传 `assignments` | `effectiveAssignments` |
| `views/CostDetailView.vue:153` | `tagMatch(assignments[pid], ...)` | `tagMatch(tagsOf(pid), ...)` |
| `views/InsightView.vue:35` | 同上 | `tagsOf(pid)` |
| `views/MilestoneView.vue:62` | 同上 | `tagsOf(pid)` |
| `views/PayNodesView.vue:70` | 同上 | `tagsOf(pid)` |
| `views/PayProjectsView.vue:86` | 同上 | `tagsOf(pid)` |
| `views/ProjectsView.vue:39,130` | `assignments` | `effectiveAssignments` |
| `lib/projectExport.ts:54` | `ctx.assignments[pid]` | 传入 `effectiveAssignments` |

**保持不动（编辑/管理路径）**：`DataView.vue`（标签定义增删改 + save）、`ProjectDetailView.vue:31,43`（改用 `manualTagsOf` 基线，见 4.5）。

## 5. 边界与非目标

- 已关闭清单 `/closed`、`ClosedProjectDetailView` 沿用其自身签约单位展示，不纳入本次回退改造（它们展示的就是已关闭项目本身）。
- 规则表仅佳杰一条；不做管理界面配置（YAGNI）。将来加规则=改 `SIGN_UNIT_TAG_RULES` 一处。
- 不清理现有手动佳杰 assignments（保留以覆盖 7 个规则外特例）。
- 匹配严格精确等于，不做去空格外的归一（数据实测无变体）。

## 6. 验证

- **后端**：
  - `test_projects`：`effective_sign_unit`（非售前/售前回退/双空）、`build_projects` 落 `signUnit`（售前回退原项目、非售前取本项目）。
  - `test_preprocess`（或新建）：`derive_sign_unit_tag_seed` 命中/未命中/空。
  - `test_schema`：`Project.signUnit` 存在、`tagSeed` 契约。
- **前端**：
  - `projectTags.test`：`seed` 合并、`effectiveAssignments`/`tagsOf` 含 seed、`manualTagsOf` 不含 seed、**`save` payload 不含 seed**。
  - `projectList.test`：`signUnit` 落值。
  - `ProjectsView.test`：签约单位列默认隐藏、勾出后显示、可筛选。
  - `ProjectDetailView.test`：售前回退展示 `signUnit`；规则标签只读、编辑不写 seed。
- `bash verify.sh` 全绿（pytest + 前端 typecheck/vitest/build）。

## 7. 部署

- 改了 `schema.py` + `preprocess_data.py` → 产物 `analysis_data.json` 结构/内容变化（新增 `Project.signUnit`、`tagSeed` 填充）。
- **升级须点「更新数据」**（同 V2.3.2 客户单一来源化）。升级手册须显著标注。
- 无新增页面 / pageKey / 依赖 / 授权。server.py 无业务改动（tags 端点不变）。

## 8. 版本

V2.6.15（`frontend/src/version.ts` 单一来源）。
