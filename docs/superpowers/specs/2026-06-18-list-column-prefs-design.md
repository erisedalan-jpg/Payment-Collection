# 项目清单选列 + 表头筛选 + 横滚 设计

> 生成 2026-06-18。作用于 `/projects`(在建项目, ProjectsView) 与 `/projects/closed`(已关闭项目, ClosedProjectsView)。
> 前置：子项目2(V1.8.0)已合并；两视图均用 `DataTable`(el-table 薄封装)。

## 目标

解决两清单"列多、部分筛选无对应展示列、列展示不全"的问题：把列值筛选移到表头、新增选列(显隐+排序)菜单、补项目状态列、加横向滚动。

## 范围

**范围内**：`/projects` 与 `/projects/closed` 两视图——表头列筛选(复用 ColumnFilter)、列显隐+排序选列菜单(localStorage 持久化)、项目状态列(在建)、回款状态列(在建,承载原孤立筛选)、"服务组(L4)"列名改"L4组"、横向滚动；新增共享 `useColumnPrefs` 组合式 + `ColumnPicker` 组件。版本 V1.9.0。

**范围外**：不改 `DataTable` 核心(仅经现有 `header-${key}` 插槽注入筛选 + 列宽促成横滚)；不动其它消费 DataTable 的视图；不引入拖拽/表格框架；后端与 schema 不改。

## 决策（brainstorming 已定）

1. 表头筛选**复用现有 `ColumnFilter` + `crossFilter` store + `applyColumnFilters`**（单表 tableId，无看板联动）。
2. 列枚举筛选移入表头 ▼；**非列枚举的特殊项**（全列搜索、售前整合、标签、已暂停/超支、KPI 深链）留工具栏/chip。
3. 选列偏好 **localStorage 持久化**（每视图独立 key）；列**排序用菜单内上/下箭头**。
4. 在建页**项目状态列默认展示**，位于 回款完成率 与 健康度 之间（req1 优先，补进默认集）。
5. 已关闭页默认隐藏 签约单位/L3-1部门/评级。
6. 版本 **V1.9.0**（Y 级：两整页展示重构）。

**不变式（本设计核心约束）**：表头列筛选只在该列**可见**时呈现其 ▼。为不产生"看不见的筛选"：(a) 在选列菜单关闭某列时，清除该列的 crossFilter；(b) KPI 深链命中某列枚举时，强制该列可见再设其筛选。`applyColumnFilters` 仍按 store 全量应用（实现简单），由 (a)(b) 维持"活跃表头筛选 ⟺ 可见列+其▼"。

## 一、架构（新增 2 件共享 + 复用）

### 1.1 `useColumnPrefs(viewKey, allKeys, defaultVisible)` 组合式（新建 `frontend/src/lib/useColumnPrefs.ts`）

```
useColumnPrefs(viewKey: string, allKeys: string[], defaultVisible: string[])
  → {
      visibleKeys: Ref<string[]>          // 有序的可见列 key（即列顺序）
      toggle(key: string): void           // 显↔隐；由隐转显追加到末尾
      moveUp(key: string): void           // 在 visibleKeys 内与前一项互换
      moveDown(key: string): void
      reset(): void                       // 恢复 defaultVisible
    }
```

- localStorage key：`colprefs:${viewKey}`，值 = `JSON.stringify(visibleKeys)`（有序可见 key 数组）。
- 加载：读 localStorage → 若存在且解析为数组：**过滤到 `∈ allKeys`** 的 key（剔除已删列）；为空/解析失败 → 用 `defaultVisible`。
- **新列默认隐藏（req4.4）**：`allKeys` 中存在但不在已存 `visibleKeys` 的 key，不自动加入（保持隐藏），仅 `toggle` 启用或 `reset` 时按 `defaultVisible` 处理。
- 每次变更后写回 localStorage。localStorage 不可用(异常)时降级为内存态(try/catch,不崩)。

### 1.2 `ColumnPicker.vue`（新建 `frontend/src/components/ColumnPicker.vue`，受控展示组件）

```
props: { columns: { key: string; label: string }[]; visibleKeys: string[] }
emits: { toggle: [key]; 'move-up': [key]; 'move-down': [key]; reset: [] }
```

- 「选列」按钮 → `el-popover`。列表：先按 `visibleKeys` 顺序列出可见列（勾选 + 上/下箭头按钮，首项 ↑ 禁用、末项 ↓ 禁用），再列出隐藏列（未勾选，无箭头）。底部「恢复默认」按钮 → emit `reset`。
- 不自持状态；视图用 `useColumnPrefs` 持有状态，把 `visibleKeys` 传入、把 toggle/move/reset 接到组合式方法。

### 1.3 复用现有
- `ColumnFilter.vue`（表头 ▼ 列值筛选弹层）、`useCrossFilterStore`、`applyColumnFilters(rows, store.tableFilters(tableId))`、`cfUniqueValues`——均不改。tableId：`'projects-active'` / `'projects-closed'`，**不传 group**（无联动）。

## 二、表头筛选（req2/3）

- 在 DataTable 的 `header-${key}` 插槽内为每个**可筛列**渲染 `<ColumnFilter :table-id :col-key="key" :source-rows="rows">`（label 由 slot 默认值给）。el-table 只渲染可见列的表头，故隐藏列不出 ▼（符合不变式）。
- 过滤管线（视图 computed）：
  - `const cfRows = applyColumnFilters(rows, cf.tableFilters(tableId))`
  - 在建：`filtered = filterProjectRows(cfRows, specialFilters)`，其中 `filterProjectRows` **删去列枚举分支**（manager/orgL4/stage/projectStatus/riskLevel/projectLevel/paymentStatus/health 改由表头 crossFilter 承担），只保留 search/presale/paused/overspend/tags。
  - 已关闭：`filtered = closedSearch(cfRows, search)`（`filterClosedRows` 删去列枚举分支，只保留 search）。
- 可筛列：
  - 在建：projectManager / orgL4 / stage / projectStatus / riskLevel / projectLevel / projectType / paymentStatus / health（9 列）。
  - 已关闭：projectManager / orgL4 / orgL3_1 / projectType / projectLevel / rating / stage / projectStatus（8 列）。
- 工具栏精简：
  - 在建：全列搜索框 + ColumnPicker + 售前整合下拉(yes/no) + 标签多选；已暂停/超支沿用现 `pv-tags` 可移除 chip。
  - 已关闭：全列搜索框 + ColumnPicker。
- **KPI 深链**（在建，`route.query`）：现实际深链来自 OverviewView——`?projectStatus=实施中`、`?riskLevel=高`、`?paused=yes`、`?overspend=yes`（测试另含 `?orgL4=`）。进页时：
  - 列枚举类(manager/orgL4/stage/projectStatus/riskLevel/projectLevel/paymentStatus/health)：对每个有值的 key，`cf.setColumnFilter(tableId, key, [值], cfUniqueValues(rows,key).length)`。当前实际深链命中的列枚举(projectStatus/riskLevel/orgL4)均为**默认可见列**；为稳健仍加安全网——若命中列恰为隐藏，则先 toggle 显(此操作会写入 localStorage,属罕见可接受副作用)。
  - 特殊类(presale/paused/overspend)：设本地状态(同现状)。
- **选列关列联动**：`ColumnPicker` toggle 某列为隐藏时，视图同时 `cf.clearColumn(tableId, key)`（清其表头筛选，维持不变式 (a)）。

## 三、列定义、默认集、横滚（req1/4/5）

> 列宽统一显式指定（含 projectName），使 el-table 总宽超容器 → **原生横向滚动条**（req5）。在建「操作」列 `fixed="right"` 常驻。

### 3.1 在建（ProjectsView）全列集（`allColumns`，顺序即默认顺序）

| key | label | width | 可筛▼ | 默认显隐 |
|---|---|---|---|---|
| projectName | 项目名称 | 220 | — | 显 |
| projectId | 项目编号 | 175 | — | 显 |
| contractAmount | 合同金额(万) | 110 sort | — | 显 |
| projectManager | 项目经理 | 96 | ✓ | 显 |
| orgL4 | **L4组** | 110 | ✓ | 显 |
| stage | 阶段 | 100 | ✓ | 隐 |
| progress | 完工% | 90 sort | — | 隐 |
| riskLevel | 风险 | 96 | ✓ | 显 |
| projectLevel | 级别 | 80 | ✓ | 显 |
| projectType | 项目类型 | 110 | ✓ | 显 |
| costRatio | 预算消耗比 | 105 sort | — | 显 |
| paymentRatio | 回款完成率 | 105 sort | — | 显 |
| projectStatus | **项目状态**(新, req1) | 100 | ✓ | 显(置于 paymentRatio 与 health 间) |
| health | 健康度 | 96 | ✓ | 显 |
| paymentStatus | 回款状态(承载原 paymentStatus 筛选) | 100 | ✓ | 隐 |
| tags | 标签 | 160 | — | 隐 |
| action | 操作 | 80 fixed=right | — | 显 |

- **默认可见(13)**：projectName, projectId, contractAmount, projectManager, orgL4, riskLevel, projectLevel, projectType, costRatio, paymentRatio, projectStatus, health, action。
- **默认隐藏(4)**：stage, progress, paymentStatus, tags。
- 项目状态列读 `ProjectRow.projectStatus`(已存在,= status.项目状态)；回款状态列读 `ProjectRow.paymentStatus`(已存在四态)。无需改 `projectList.ts` 行模型。
- 现有 cell 自定义插槽保留：projectName 的「原项目*」标记、health 的 `HealthBadge`、tags、action 跟进按钮。
- 可筛列(projectManager/orgL4/stage/projectStatus/riskLevel/projectLevel/projectType/paymentStatus/health)的 `header-${key}` 插槽内容 = 列名文字 + `ColumnFilter` ▼。health 列额外保留其既有四维异常 info tooltip（与 ▼ 同处表头：`健康度 [i] ▼`）。

### 3.2 已关闭（ClosedProjectsView）全列集

| key | label | width | 可筛▼ | 默认显隐 |
|---|---|---|---|---|
| projectName | 项目名称 | 220 | — | 显 |
| projectId | 项目编号 | 175 | — | 显 |
| customer | 客户 | 130 | — | 显 |
| signParty | 签约单位 | 130 | — | 隐 |
| contractAmount | 合同金额(万) | 110 sort | — | 显 |
| orgL4 | **L4组** | 110 | ✓ | 显 |
| orgL3_1 | L3-1部门 | 110 | ✓ | 隐 |
| projectManager | 项目经理 | 96 | ✓ | 显 |
| projectType | 项目类型 | 110 | ✓ | 显 |
| projectLevel | 级别 | 80 | ✓ | 显 |
| rating | 评级 | 80 | ✓ | 隐 |
| stage | 项目阶段 | 110 | ✓ | 显 |
| projectStatus | 项目状态 | 100 | ✓ | 显 |
| closedAt | 关闭时间 | 110 sort | — | 显 |
| costRatio | 预算消耗比 | 105 sort | — | 显 |
| overspend | 项目超支 | 90 | — | 显 |

- **默认可见(13)**：projectName, projectId, customer, contractAmount, orgL4, projectManager, projectType, projectLevel, stage, projectStatus, closedAt, costRatio, overspend。
- **默认隐藏(3)**：signParty, orgL3_1, rating。
- 行模型 `ClosedRow`(子项目2)已含全部字段，无需改 `closedProjectList.ts` 行模型。

## 四、版本

`frontend/src/version.ts` → `V1.9.0` / `2026-06-18`。PROGRESS 头部同步，上一版顺延 V1.8.0。

## 五、边界 + 测试

**边界**：
- localStorage 不可用/损坏 → useColumnPrefs try/catch 降级内存态，用默认集，不崩。
- 存储的 visibleKeys 含已删 key → 加载时剔除。
- 全部列被隐藏（用户取消勾选所有）→ 允许（表格仅表头/空体）；ColumnPicker 仍可恢复。
- 隐藏列的表头筛选：toggle 关列即 clearColumn，不留孤立筛选。
- 横滚：列总宽 < 容器时不出现滚动条（正常）；超出时出现（已关闭页当前即此情形）。

**测试（vitest）**：
- `useColumnPrefs`：默认集、localStorage 读写往返、剔除失效 key、新列默认隐藏、toggle/moveUp/moveDown/reset、localStorage 异常降级。
- `ColumnPicker`：渲染可见(勾选+箭头)/隐藏(未勾选)分区、首末项箭头禁用、toggle/move/reset 事件、恢复默认。
- `ProjectsView`：默认列集渲染(含项目状态在 回款完成率/健康度 间)、L4组 列名、表头 ColumnFilter 存在于可筛列、选列菜单显隐生效、横滚容器存在；现有断言不弱化。
- **现有 ProjectsView 深链测试迁移**：`ProjectsView.test.ts` 现有 `?overspend=yes`/`?orgL4=B组`/`?riskLevel=中` 用例——overspend 仍走本地特殊态；orgL4/riskLevel 改为断言进页后 crossFilter(`projects-active`)对应列被设值且过滤输出正确(机制由本地筛选→表头 crossFilter,**过滤结果断言保持不弱化**)。
- `ClosedProjectsView`：默认列集(隐藏 签约单位/L3-1/评级)、表头筛选、选列、横滚。
- 全量 vitest + typecheck 全绿。

## 六、验证（完成定义）
- `bash verify.sh` 全绿（前端 typecheck/vitest/build；后端无改动仍跑）。
- 手动：/projects、/projects/closed —— 选列菜单显隐+上下移+恢复默认、刷新后保留；表头 ▼ 筛选；KPI 从总览点入仍正确过滤；横向滚动条出现且操作列(在建)常驻；项目状态列默认在回款完成率与健康度间；列名"L4组"。
- PROGRESS 更新 + V1.9.0。
