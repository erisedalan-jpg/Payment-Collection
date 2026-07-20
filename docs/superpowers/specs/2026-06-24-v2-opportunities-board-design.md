# V2.0.0 子项目二：/opportunities 重点商机进展（线上可编辑表格）设计

> 状态：已批准（用户 2026-06-24 授权"无需确认、按推荐顺序执行、完成后审核"）。
> 这是 V2.0.0 的主体新功能：新增一个线上可编辑的"重点商机进展"表格页，含后端 JSON 持久化、超管专属写权限、普通管理员按 L4 只读隔离、从 input xlsx 读初始数据。

## 目标

在「重点跟进」导航分区下新增 `/opportunities`（**重点商机进展**）页：一个线上录入/编辑的商机台账表格。

- **超级管理员**（admin / wangxutong / zhangyingzhe，`isSuper`）：全量可见、可编辑任意行、可新增/删除行、可导入/导出。
- **普通管理员**：只读，且只看自己 `allowedL4` 范围内（按商机的 L4组织 字段）的行；不显示新增/删除/导入/导出按钮与行选择框。
- 表格支持选列、逐列筛选、排序、关键词、分页（照搬 /projects 表格栈能力）。
- 初始数据从 `input/opportunities.xlsx` 读取（用户原文写作 `opportunitites.xlsx`，疑似笔误 → **两个文件名都接受**，`opportunities.xlsx` 优先）。

## 架构

沿用本仓既有范式（领域模块 + 薄 server.py 处理器 + 本地 JSON 持久化 + 前端 store/api/view）：

```
input/opportunities.xlsx ──(首次无 json 时 seed)──┐
                                                   v
opportunities.py(领域纯函数: 解析xlsx/建行/改行/删行/L4过滤)
                                                   │
server.py 薄处理器(GET 只读+L4过滤; POST create/update/delete/import 超管专属)
                                                   │  读写
                                                   v
                              data/opportunities.json  (gitignore, 本地持久化)
                                                   │  /api/opportunities*
                                                   v
前端: stores/opportunities + lib/opportunitiesApi + lib/opportunityColumns
      + views/OpportunitiesView(el-table 选择/选列/筛选/排序/分页)
      + components/OpportunityEditDrawer(行编辑表单)
```

### 持久化文件 `data/opportunities.json`（gitignore）
```json
{ "version": 1, "seq": 12, "rows": [ { row }, ... ] }
```
`seq` 单调自增，用于生成行 `id`（`"opp-{seq}"`）。

### 行数据结构（`row`）
25 列 = **22 个可编辑业务字段** + **2 个后端盖章字段**(firstReg/lastUpdate) + **1 个前端派生字段**(recentUpdate，不持久化)。

| # | 列名 | field key | 类型 | 下拉选项（单一来源 opportunityColumns.ts） |
|---|------|-----------|------|------|
| 1 | L4组织 | `l4` | select | 小金融服务组/银行服务组/运营商服务组/京津服务组/河北服务组/广东二服务组/辽宁服务组/浙江服务组/上海一服务组/黑龙江服务组/吉林服务组（11 项，与真实 orgL4 取值一致，L4 隔离匹配键） |
| 2 | 销售负责人 | `salesOwner` | text | |
| 3 | 客户名称 | `customer` | text | |
| 4 | 行业归属 | `industry` | text | |
| 5 | 是否TOP1000客户 | `top1000` | select | TOP1000/非TOP1000/其他非指名 |
| 6 | 商机状态 | `status` | select | 方案设计沟通/售前测试/意向沟通/招投标/商务谈判/需求确认/合同签约/赢单/丢单/进行中 |
| 7 | 主观预测 | `forecast` | select | 可参与/可承诺/可争取/赢单 |
| 8 | 商机名称/项目名称 | `name` | text | |
| 9 | 预估金额（万元） | `amountWan` | number | |
| 10 | 预估落单时间 | `expectedDate` | date | |
| 11 | 产品大类 | `productCategory` | text | |
| 12 | 主要涉及产品 | `mainProducts` | text | |
| 13 | 是否含外包外采 | `outsource` | select | 是/否 |
| 14 | FR负责人 | `frOwner` | text | |
| 15 | FR能力是否匹配 | `frMatch` | select | 是/否 |
| 16 | 交付资源是否匹配 | `deliveryMatch` | select | 是/否 |
| 17 | 是否需要外区域支持 | `crossRegion` | select | 是/否 |
| 18 | 是否重点商机 | `keyOpp` | select | 是/否 |
| 19 | 是否提前介入 | `earlyIntervene` | select | 是/否 |
| 20 | 当前进展/风险说明/情况备注 | `remark` | text(长) | |
| 21 | 实际中标状态 | `bidStatus` | select | 已中标/未中标/待定 |
| 22 | 中标日期 | `bidDate` | date | |
| 23 | 首次登记日期 | `firstReg` | auto date | 后端盖：该行**首次有内容写入**时盖当日（`YYYY-MM-DD`） |
| 24 | 最后一次更新日期 | `lastUpdate` | auto datetime | 后端盖：每次 update 盖当前时刻（`YYYY-MM-DD HH:MM`） |
| 25 | 是否近7天更新 | `recentUpdate` | derived | 前端从 `lastUpdate` 派生：距今 ≤7 天→是，否则→否（空 lastUpdate→否） |

> `id` 为内部稳定主键（不展示列）。后端另存 `lastUpdateBy`（审计，不展示）。

## 后端

### 领域模块 `opportunities.py`（纯函数，pytest 覆盖）
- `FIELDS`：22 个可编辑 field key 元组（白名单，update 只接受其中字段）。
- `HEADER_TO_FIELD`：中文列名→field key 映射（用于 xlsx 解析；含 firstReg/lastUpdate 中文名以便回读导出过的表）。
- `read_opportunities_xlsx(path) -> list[dict]`：复用 `_read_header_sheet` 范式（openpyxl，data_only），按 `HEADER_TO_FIELD` 取列；定位 sheet 的关键表头用 `"客户名称"`；缺文件/无表头→`[]`（降级不抛）。每行补 `id`（按行序生成）、补齐缺字段为空串、amountWan 数值解析、日期规整为 `YYYY-MM-DD`。
- `new_row(rid) -> dict`：空白行（全字段空串，amountWan='' 或 0，无 firstReg/lastUpdate）。
- `apply_create(store, now) -> dict`：`store.seq+=1`；append `new_row("opp-%d")`；返回新行。
- `apply_update(store, rid, fields, account, now) -> dict`：仅取 `fields` 中 ∈ FIELDS 的键写入目标行；若该行 `firstReg` 为空且本次写入后行内有任意业务内容→盖 `firstReg=now_date`；每次盖 `lastUpdate=now_dt`、`lastUpdateBy=account`；行不存在→KeyError/None（处理器返 404）。返回更新后行。
- `apply_delete(store, ids) -> int`：从 `store.rows` 移除 id ∈ ids 的行；返回删除数。
- `filter_for_account(rows, allowed_l4, is_super) -> list`：is_super 或 `'*' in allowed_l4`→全部；否则取 `row.l4 ∈ set(allowed_l4)`。纯函数，镜像 `data_scope.allowed_project_ids` 的 L4 判定。

### server.py 处理器（薄）
读写 `OPPORTUNITIES_FILE = os.path.join(BASE_DIR, 'data', 'opportunities.json')`（BASE_DIR 双模式已就绪），`_opps_lock`。`_load_opportunities()`：json 存在→load；否则 seed：`read_opportunities_xlsx(input/opportunities.xlsx 或 opportunitites.xlsx)` → 建 store(seq=行数) → save → 返回。`_save_opportunities(store)` 原子写（.tmp 中转），与 `_save_progress` 同构。

路由（`do_GET` 388-、`do_POST` 488- 的 elif 链各加分支，镜像 `/api/progress`）：

| 端点 | 方法 | 权限 | 行为 |
|------|------|------|------|
| `/api/opportunities` | GET | 任意登录 | 取 store.rows → `filter_for_account(rows, account.allowedL4, account.isSuper)` → `{rows}`。未登录 401。 |
| `/api/opportunities/create` | POST | **超管** | `apply_create` → save → `{row}` |
| `/api/opportunities/update` | POST | **超管** | body `{id, fields}` → `apply_update` → save → `{row}`；行不存在 404 |
| `/api/opportunities/delete` | POST | **超管** | body `{ids}` → `apply_delete` → save → `{rows}`(过滤后全量) |
| `/api/opportunities/import` | POST | **超管** | multipart xlsx（镜像 `handle_inputs_upload` 982 的字节读取）→ 解析 → **整表替换**（替换前把旧 json 备份为 `data/opportunities.backup-<ts>.json`）→ save → `{rows, count}` |

**超管门禁**：`_SUPER_ONLY_PATHS`（149-158）新增 4 个写端点（`/create /update /delete /import`），`_authz_gate` 自动 403 拦非超管。GET 不入白名单（普通管理员需只读），其自身做 L4 过滤。

**导入语义**：整表替换（最直接、可预期），替换前自动备份旧表 → 可人工回滚。导入行的 lastUpdate 盖导入时刻；firstReg 取 xlsx 中"首次登记日期"列（若有且可解析）否则盖导入时刻。

### gitignore
`data/opportunities.json` 与 `data/opportunities.backup-*.json` 加入 `.gitignore`（业务数据，勿提交，同 `data/project_progress.json`）。

## 前端

### `frontend/src/lib/opportunityColumns.ts`（单一来源）
- `OPP_COLUMNS`：25 列定义 `{ key, label, type: 'text'|'number'|'date'|'select'|'auto'|'derived', options?, width?, filterable?, sortable?, wrap? }`。
- 各 select 的 `options` 字符串数组（上表）。`L4_OPTIONS` 单列导出（编辑抽屉与筛选共用）。
- `OPP_FIELDS`：22 个可编辑 key（与后端 FIELDS 对齐，前端校验/提交用）。
- `DEFAULT_VISIBLE`：默认可见列（约 12-14 个高频列，其余默认隐藏可在选列里开）。
- `FILTERABLE`：可逐列筛选的 key 集合（各 select 列 + L4 + 销售负责人 + 是否近7天更新 等）。
- `recentUpdateOf(lastUpdate, now) -> '是'|'否'`：派生纯函数（≤7 天→是）。

### `frontend/src/lib/opportunitiesApi.ts`
`api.get('/api/opportunities')` / `api.post('/api/opportunities/create'|'/update'|'/delete')` / import 用 `api` 的 multipart 上传（参考现有 inputs/upload 前端调用）。签名镜像 `projectProgressApi`。

### `frontend/src/stores/opportunities.ts`（Pinia，镜像 projectProgress）
`rows` ref、`loaded`、`load()`、`create()`、`update(id, fields)`、`remove(ids)`、`importFile(file)`、`reset()`（登入/登出重置，挂到 auth 的 reset 流程，防跨账号缓存——见 [[permission-control-feature]] V1.17.1 教训）。每个写操作后用后端返回的行/全量刷新本地（拿到新鲜 firstReg/lastUpdate）。

### `frontend/src/components/OpportunityEditDrawer.vue`
`el-drawer` 行编辑表单：22 个可编辑字段，按类型渲染 `el-input`/`el-input-number`/`el-select`(options)/`el-date-picker`；firstReg/lastUpdate/recentUpdate 只读展示。保存→`store.update(id, fields)`→toast→关闭。校验从宽（仅类型/下拉约束），不强制必填（录入中途可存）。

### `frontend/src/views/OpportunitiesView.vue`
基于 **el-table**（本页需要行选择+全选，DataTable 只读包装不含选择列，故本页直接用 el-table，外围复用 ColumnPicker/ColumnFilter/useColumnPrefs/crossFilter/exportRows）：

- 工具栏：关键词 `el-input`；`ColumnPicker`（选列）；清除筛选按钮。**超管专属**(`v-if="auth.isSuper"`)：「新增商机」「删除选中」「导入」「导出」。
- 行选择：`<el-table-column type="selection">` 仅超管渲染；`selectedIds` 驱动「删除选中」。原生表头复选=全选。
- 动态列：`visibleColumns`（ColumnPicker+useColumnPrefs，TABLE_ID='opportunities'）→ 渲染对应 `el-table-column`；可筛选列表头插 `ColumnFilter`（`:table-id :col-key :source-rows`，crossFilter）；`sortable` 列客户端排序。
- recentUpdate 列：派生展示（`recentUpdateOf(row.lastUpdate, now)`），状态徽标（是=ok 淡底/否=mut）。
- 行展示按列 type 格式化（date 取 YYYY-MM-DD、number 千分位、select 原值/状态徽标按需）。
- **编辑**：超管点行「编辑」操作列按钮 → 打开 `OpportunityEditDrawer`；普通管理员无编辑入口（纯只读单元格）。
- **新增商机**（超管）：`store.create()` → 新空行入表 → 自动打开该行编辑抽屉录入（满足"新增一行用于数据编辑"）。
- 分页：本地分页（pageSize 默认 50），`watch(filtered)` 重置页。
- 数据流：`store.rows` → `applyColumnFilters(rows, cf.tableFilters(TABLE_ID))` → 关键词过滤 → `filtered` → 排序 → 分页。
- **导出**（超管）：`exportRows('重点商机进展_{n}条.xlsx', filtered.map(→25中文列))`。
- L4 隔离由**后端 GET 已完成**（普通管理员 store.rows 即已是其 L4 行）；前端无需再过滤，仅按 isSuper 显隐写操作 UI。

### 路由 / 导航 / 门禁
- `nav.ts` `KEY_FOLLOWUP_LINKS` 追加 `{ label: '重点商机进展', to: '/opportunities', key: 'opportunities-progress' }`（PAGE_OPTIONS 自动纳入，建号表单即可勾选授权）。
- `pageAccess.ts` `PageKey` 联合追加 `'opportunities-progress'`。
- `router/index.ts` import `OpportunitiesView` + route `{ path:'/opportunities', name:'opportunities', component, meta:{ title:'重点商机进展', hideFilter:true, pageKey:'opportunities-progress' } }`。守卫自动按 pageKey 门禁。

## 关键约定遵从
- 无 emoji；设计令牌 `var(--*)` 不散写散值（控件宽度内联 px 属既有惯例）。
- 写操作有明确进度/结果反馈（toast），尤其导入。
- 数据隔离威胁模型沿用 SP-4「后端切数据」折中：普通管理员的 GET 已被后端按 L4 裁剪，前端不持有越权数据。
- 双模式（开发/打包）：新增端点只走 HTTP 路由（单路径），文件读写用 `BASE_DIR`（已 frozen-aware），不触发 reprocess 的 subprocess/importlib 分叉。input xlsx 读取走 `BASE_DIR/input`（与 TOP1000 同）。

## 测试策略
- **后端**：`tests/test_opportunities.py` 覆盖 opportunities.py 纯函数：xlsx 解析（用临时 openpyxl 写一张含中文表头的小表）、new_row/apply_create(seq 自增)、apply_update（firstReg 仅首次有内容时盖、lastUpdate 每次盖、非 FIELDS 字段被拒、行不存在）、apply_delete、filter_for_account（super/'*'/普通 L4 子集/空 allowedL4）。
- **前端**：`opportunityColumns` recentUpdateOf 边界（0/7/8 天、空）；store 用例（load/create/update/remove 刷新本地、reset）；OpportunitiesView 用例（超管见写按钮+选择列、普通管理员不见且只读；选列/筛选联动；新增→抽屉打开；删除选中→store.remove；导出按筛选）；EditDrawer 按类型渲染控件 + 保存提交 fields。
- `bash verify.sh` 全绿（py_compile+ruff+pytest+前端 typecheck/vitest/build）。

## 完成定义
verify.sh 全绿；版本号不在本子项目 bump（V2.0.0 在集成阶段统一改）。纯新增 + 三处注册点，部署需后端（server.py + 新模块 opportunities.py）与 dist 同发。
