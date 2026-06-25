# 商机清单改造 + 重点商机跟进新页 设计（Design Spec）

> 日期：2026-06-25　|　目标版本：**V2.2.0**（新增整页 → Y 级）
> 关联：复用 `/projects/temp`（临时重点跟进）+ `/projects/key`（重点项目进展）既有机制；改造 `/opportunities`。

## 0. 目标与范围

两件事，一次交付：

1. **改造 `/opportunities`**：移动到「项目」菜单分组、改名「商机清单」、新增「商机级别」下拉列（P1/P2/P3/P4）。
2. **新增 `/opportunities/key`「重点商机跟进」页**：形式同 `/projects/temp`——超管选定范围生成清单、普通管理员填写跟进、超管留档生成新清单。范围筛选字段取自商机清单各列；跟进四列设计同 `/projects/key`。

非目标（YAGNI）：不改 temp/key 既有行为；不改回款/分析口径；不动 `pageKey:'opportunities-progress'` 的权限键。

## 1. 架构取舍（已定）

- **复用并参数化**现有组件，而非另起并行组件：
  - `ScopeBuilder.vue` 增加两个**带默认值、不改 temp 调用处**的可选 prop：`catalog`（字段目录）+ `singleTable`（单表模式，隐藏"子表"选择器）。temp 调用处不传 → 行为不变。
  - `ProgressEditModal.vue` 增加第三种 `store` 取值 `'oppFollowup'`。
  - 把 tempScope 中**纯运算符/按类型取运算符**抽出为共享小模块，供 tempScope 与新 opportunityScope 共用（消除重复，纯函数低风险）。
- 商机是**单张扁平表**（无回款节点/里程碑这类子表），故 `singleTable` 模式更简单：所有条件直接作用于商机行字段。

## 2. 现状关键事实（实现时锚点）

### 2.1 商机数据域
- 持久化：`data/opportunities.json` = `{version, seq, rows:[…]}`，每行 id 形如 `opp-N`。
- 可编辑业务字段白名单：`opportunities.py` `FIELDS`（22 个）。日期字段 `_DATE_FIELDS=('expectedDate','bidDate')`。
- xlsx→字段映射：`opportunities.py` `HEADER_TO_FIELD`。seed 入口 `server.py`（`input/opportunities.xlsx`，兼容笔误 `opportunitites.xlsx`）。
- 自动字段（只读）：`firstReg`/`lastUpdate`/`lastUpdateBy`，更新时由 `apply_update` 盖章。
- 前端列定义单一来源：`frontend/src/lib/opportunityColumns.ts` `OPP_COLUMNS`（25 列含 auto/derived），`DEFAULT_VISIBLE`，`OPP_FIELDS`（剔除 auto/derived）。
- 选列偏好：`useColumnPrefs(TABLE_ID, allKeys, DEFAULT_VISIBLE)`。编辑：`OpportunityEditDrawer.vue`（select 列用 `el-select` + `col.options`）。
- store：`stores/opportunities.ts`（`list/create/update/remove/importFile`）→ `lib/opportunitiesApi.ts`。
- GET 端点 `server.py handle_opportunities_get` 按 `rec.allowedL4` + `isSuper` 做 L4 裁剪（`_opp.filter_for_account`）。

商机列与字段键（label → key）：
`L4组织 l4 / 销售负责人 salesOwner / 客户名称 customer / 行业归属 industry / 是否TOP1000客户 top1000 / 商机状态 status / 主观预测 forecast / 商机名称-项目名称 name / 预估金额(万元) amountWan / 预估落单时间 expectedDate / 产品大类 productCategory / 主要涉及产品 mainProducts / 是否含外包外采 outsource / FR负责人 frOwner / FR能力是否匹配 frMatch / 交付资源是否匹配 deliveryMatch / 是否需要外区域支持 crossRegion / 是否重点商机 keyOpp / 是否提前介入 earlyIntervene / 当前进展…备注 remark / 实际中标状态 bidStatus / 中标日期 bidDate / 首次登记日期 firstReg(auto) / 最后一次更新日期 lastUpdate(auto) / 是否近7天更新 recentUpdate(derived)`。

枚举取值：`STATUS_OPTIONS` 含 `赢单`（默认条件 `status notIn [赢单]` 合法）；`top1000=['TOP1000','非TOP1000','其他非指名']`；`YN=['是','否']`。

### 2.2 跟进机制（temp/key）
- 后端 `temp_followup.py`：`PROGRESS_FIELDS=('weekProgress','nextPlan')`；存 `data/temp_followup.json` = `{version, scope, current:{id:{…}}, archives:[{archiveTime, rows:[…]}]}`。
- 跟进字段六键：`weekProgress`/`weekProgressEditTime`/`weekProgressEditBy` 与 `nextPlan`/`nextPlanEditTime`/`nextPlanEditBy`。派生 `followDate=max(两 EditTime)`、`followBy=去重(两 EditBy)`。
- 端点：`GET /api/temp-followup`（任意登录）、`POST .../scope`（超管）、`POST .../update`（任意登录 `{projectId,field,content}`，`field∈PROGRESS_FIELDS`）、`POST .../archive`（超管 `{rows}`）。`_SUPER_ONLY_PATHS` 含 scope/archive。
- 范围 schema（`lib/tempScope.ts`）：`{combinator:'AND'|'OR', groups:[{combinator, conditions:[{group, field, op, values?, min?, max?}]}]}`；`op∈ in|notIn|between|notBetween|contains|notContains`。matching 在**前端**（`projectMatches`），后端只规整+持久化。
- ScopeBuilder.vue：两级 AND/OR 构建器；条件行 = 子表选择 + 字段 + 运算符 + 值控件（枚举多选 / 文本包含 / 数值或日期区间）；底部"命中 N 个"。`candidatesMap` 预聚合候选值。
- 四个跟进列（temp/key 一致）：
  `{weekProgress 本周工作进展 wrap} {nextPlan 后续工作计划 wrap} {followDate 跟进日期 sortable} {followBy 跟进人}`；
  单元格点击 → `openEdit(row,field)` → `ProgressEditModal`；显示 `"{EditTime}：{内容}"` 或"点击填写"。
- 公共件：`DataTable` / `ColumnFilter` / `ColumnPicker` / `ProgressEditModal` / `Modal`；`useColumnPrefs`；导出 `exportSheets`/`exportRow`。
- 菜单 `nav.ts`：`PROJECT_LINKS`（项目总览 / 在建项目 `/projects` / 已关闭项目 `/projects/closed` / 项目动态 `/activity`）；`KEY_FOLLOWUP_LINKS`（重点项目进展 `/projects/key` / 重点商机进展 `/opportunities` / 临时重点跟进 `/projects/temp`）。`AppSidebar.vue activeSectionKey` 现把 `/opportunities` 归 `keyfollowup`。

## 3. Part 1 — /opportunities 改造

### 3.1 菜单移动 + 改名 + 排序
- `nav.ts`：
  - `KEY_FOLLOWUP_LINKS` 移除 `重点商机进展 /opportunities`。
  - `PROJECT_LINKS` 在「已关闭项目」后、「项目动态」前插入 `{ label:'商机清单', to:'/opportunities', key:'opportunities-progress' }`。最终顺序：项目总览 / 在建项目 / 已关闭项目 / **商机清单** / 项目动态。
- `AppSidebar.vue activeSectionKey`：**先**判 `/opportunities/key`→`keyfollowup`，**再**判 `/opportunities`→`project`（顺序不能反，否则清单页落错分组）。
- `router/index.ts`：`/opportunities` 的 `meta.title` 改 `'商机清单'`；**`pageKey` 保持 `'opportunities-progress'` 不变**。
- `feature_list.json`：若其中存有该页人类可读名"重点商机进展"，同步改显示名为"商机清单"，**键不变**。

### 3.2 新增「商机级别」列 opportunityLevel
- 后端 `opportunities.py`：
  - `FIELDS` 末尾加 `'opportunityLevel'`。
  - `HEADER_TO_FIELD` 加 `'商机级别': 'opportunityLevel'`（xlsx 有该列即 seed；无则忽略）。
  - 确认 `new_row` 对 `opportunityLevel` 初始化为 `''`（若 `new_row` 按固定字段列表初始化，需同步加入）。`apply_update` 走通用字符串分支即可（非数字/日期）。
- 前端 `opportunityColumns.ts`：
  - 顶部加 `const OPPORTUNITY_LEVEL_OPTIONS = ['P1','P2','P3','P4']`。
  - 在 `amountWan` 与 `expectedDate` 之间插入：
    `{ key:'opportunityLevel', label:'商机级别', type:'select', options:OPPORTUNITY_LEVEL_OPTIONS, width:100, filterable:true }`。
  - `DEFAULT_VISIBLE` 在 `'amountWan'` 与 `'expectedDate'` 之间插入 `'opportunityLevel'`。
- EditDrawer 下拉、`fmtCell` 渲染、列筛选**自动适配**（沿用 select 列既有机制），无需改组件。
- 存量数据：旧行无 `opportunityLevel` 键，GET 原样返回；前端读 `row.opportunityLevel ?? ''` → 表格显示 `-`。**无迁移脚本**。

## 4. Part 2 — 新页面「重点商机跟进」/opportunities/key

### 4.1 后端 opportunity_followup.py（镜像 temp_followup.py）
- 常量：`PROGRESS_FIELDS=('weekProgress','nextPlan')`。
- 纯函数：
  - `normalize_scope(scope)`：规整为 `{combinator, groups:[{combinator, conditions:[{field, op, values?, min?, max?}]}]}`。商机单表，条件**无 `group` 子表键**（或恒为 `'opportunity'`，二选一并在前后端一致；本设计取**省略 group**）。
  - `apply_update(store, oppId, field, content, account, now)`：`field∈PROGRESS_FIELDS`，写 `store['current'][oppId][field]` 并盖章 `{field}EditTime`/`{field}EditBy`。
  - `apply_archive(store, rows, now)`：`rows` 追加进 `archives`（`{archiveTime, rows}`），清空 `current={}`。
  - `default_scope()`：返回默认范围（见 4.5）。
- 存储：`data/opportunity_followup.json` = `{version:1, scope, current:{oppId:{…}}, archives:[…]}`。

### 4.2 后端端点（server.py）
| 端点 | 方法 | 授权 | 请求 | 响应 |
|---|---|---|---|---|
| `/api/opportunity-followup` | GET | 任意登录 | — | `{scope, current, archives}` |
| `/api/opportunity-followup/scope` | POST | **超管** | `{combinator, groups}` | `{success, scope}` |
| `/api/opportunity-followup/update` | POST | 任意登录 | `{oppId, field, content}` | `{success, record}` |
| `/api/opportunity-followup/archive` | POST | **超管** | `{rows}` | `{success, archives}` |
- `_SUPER_ONLY_PATHS` 加 `/api/opportunity-followup/scope`、`/api/opportunity-followup/archive`。
- GET 首次（store 无 scope）→ 以 `default_scope()` 初始化并落盘。
- `_load_/_save_` 沿用现有 data 目录解析；纯文件 IO，**无 frozen 分支**。
- L4：后端返回全量 scope/current/archives；可见商机的 L4 裁剪由前端依赖**已裁剪的 opportunities store** 自然实现（普通管理员只见自身 L4 内、且命中范围的商机）。

### 4.3 前端范围引擎 opportunityScope.ts
- `FIELD_CATALOG` **从 `OPP_COLUMNS` 派生**（单一来源）：每列 → `{key, label, kind}`；kind 映射 `select→enum / number→number / date→date / text→text`；`auto`(lastUpdate)→date、`derived`(recentUpdate)→enum（候选 `['是','否']`）。枚举候选取 `col.options`。含新列 `opportunityLevel`。
- `opportunityMatches(row, scope)`：在扁平商机行上跑两级 AND-OR，叶子判断复用共享运算符模块。
- 共享运算符模块（新 `lib/scopeOps.ts` 或等价）：`leafMatch(value, condition)` + `opsForKind(kind)`，从 tempScope 抽出；tempScope 改为引用它（行为等价，受双方测试守护）。

### 4.4 前端页面 OpportunityFollowupView.vue + stores/opportunityFollowup.ts
- store 镜像 `tempFollowup`：state `{scope, current, archives}`；action `load / saveScope / update / archive`；对应 4.2 端点。
- 视图镜像 `TempFollowupView.vue`：
  - `onMounted`：加载 opportunities store + opportunityFollowup store。
  - 范围与行：`inScopeIds = opportunities.rows.filter(r => opportunityMatches(r, scope)).map(r=>r.id)`；`currentRows` = 对在范围内的商机行，叠加 `current[oppId]` 跟进记录并计算 `followDate/followBy`；历史快照 `archives[idx].rows`（冻结）。
  - 列：`ALL_COLUMNS` = 全部 `OPP_COLUMNS`（映射为表格列）+ 四跟进列 `weekProgress/nextPlan/followDate/followBy`（设计/控件同 key 页）。
  - **默认 11 列**：`name`(项目名称) / `customer`(客户名称) / `top1000`(客户类型) / `amountWan`(预估金额) / `opportunityLevel`(商机级别) / `status`(商机状态) / `frOwner`(FR负责人) / `weekProgress` / `nextPlan` / `followDate` / `followBy`。
  - 商机字段列**只读**；仅四跟进列可点击编辑（`ProgressEditModal` `store='oppFollowup'`，普通+超管均可编辑）。
  - 范围设置（**仅超管**）：参数化 `ScopeBuilder`（`:catalog` = 商机字段目录、`:singleTable="true"`）。
  - 当前/历史下拉、"更新/留档"归档确认、导出 xlsx：均同 `/projects/temp`、`/projects/key`（`exportRow` 覆盖可见列，跟进列导出 `"{EditTime}：{内容}"`）。

### 4.5 默认范围（首次 seed）
`(是否TOP1000客户 in [TOP1000]) AND (是否提前介入 in [是]) AND (是否重点商机 in [是]) AND (商机状态 notIn [赢单])`

结构（单组、四条 AND）：
```json
{ "combinator": "AND", "groups": [ { "combinator": "AND", "conditions": [
  { "field": "top1000",        "op": "in",    "values": ["TOP1000"] },
  { "field": "earlyIntervene", "op": "in",    "values": ["是"] },
  { "field": "keyOpp",         "op": "in",    "values": ["是"] },
  { "field": "status",         "op": "notIn", "values": ["赢单"] }
] } ] }
```

### 4.6 路由 / 菜单 / 权限
- `router/index.ts` 加 `{ path:'/opportunities/key', name:'opportunity-followup', component:OpportunityFollowupView, meta:{ title:'重点商机跟进', hideFilter:true, pageKey:'opportunity-followup' } }`。
- 新 `pageKey:'opportunity-followup'` **注册进 `feature_list.json`**（页面访问控制注册表）+ 权限默认（超管 + 授权普通管理员可见），确保门禁生效且默认可达。
- `nav.ts KEY_FOLLOWUP_LINKS`：原"重点商机进展"位置改放 `{ label:'重点商机跟进', to:'/opportunities/key', key:'opportunity-followup' }`，顺序：重点项目进展 / **重点商机跟进** / 临时重点跟进。
- `AppSidebar.vue activeSectionKey`：`/opportunities/key` 归 `keyfollowup`（见 3.1 顺序约束）。

## 5. 错误处理 / 边界
- 商机被删除：其行从 current 清单自然消失（同 temp 项目离开范围）；archives 快照保留冻结值。
- 范围命中为空：清单空表（不报错）。
- scope/archive 端点被普通管理员调用：`_authz_gate` 返回 403（与 temp 一致）。
- `opportunityLevel` 非法值：后端不做枚举强校验（与既有 select 字段一致，存字符串）；前端下拉限定 P1–P4。
- frozen/dev：本特性全为纯 Python 文件 IO + 前端，无 subprocess、无新路径分支需求。

## 6. 测试
- pytest（`tests/`）：`opportunity_followup.py` 纯函数——`normalize_scope` 形状、`apply_update` 盖章 EditTime/EditBy、`apply_archive` 冻结+清空、`default_scope` 结构。
- vitest：`opportunityScope.ts` 在样例行集上验证默认条件命中（含 notIn/边界）；`opportunityColumns` 新列与默认列；`ScopeBuilder` `singleTable` 模式（隐藏子表选择器、temp 默认行为不回归）；视图默认可见列。
- `verify.sh` 全绿（语法+ruff+pytest+前端 typecheck/vitest/build）。

## 7. 版本与交付
- `frontend/src/version.ts`：`V2.1.1 → V2.2.0`（新增整页 = Y 级）。
- `PROGRESS.md`：记本期范围、技术债（若有）。
- 打包：沿用 `make_deploy_zip.py` / `make_update_zip.py`（新增的 `opportunity_followup.py` 由 `*.py` glob 自动纳入更新包；整包 `TOP_FILES` 需补 `opportunity_followup.py`）。

## 8. 文件清单（预估）
新增：`opportunity_followup.py`、`frontend/src/views/OpportunityFollowupView.vue`、`frontend/src/stores/opportunityFollowup.ts`、`frontend/src/lib/opportunityScope.ts`、`frontend/src/lib/scopeOps.ts`、`tests/test_opportunity_followup.py`、相关 vitest。
修改：`opportunities.py`、`frontend/src/lib/opportunityColumns.ts`、`frontend/src/nav.ts`、`frontend/src/layout/AppSidebar.vue`、`frontend/src/router/index.ts`、`frontend/src/components/ScopeBuilder.vue`、`frontend/src/components/ProgressEditModal.vue`、`frontend/src/lib/tempScope.ts`（改引用共享运算符）、`server.py`、`feature_list.json`、`frontend/src/version.ts`、`make_deploy_zip.py`、`PROGRESS.md`。
