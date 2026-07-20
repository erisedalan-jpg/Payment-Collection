# V2.1.0 设计：临时重点跟进页 + 商机新增改造

> 状态：已与用户确认设计要点（2026-06-25），待用户复核本 spec → 转 writing-plans。
> 交流语言：简体中文。本版本预计生产交付（连升第二跳）。

## 0. 目标（两块需求）

1. **商机新增改为"先编辑后加行"**：`/opportunities` 点「新增商机」不再立即追加空行，而是先弹编辑抽屉，保存后才创建并追加该行；取消则不产生任何行。
2. **新增整页「临时重点跟进」`/projects/temp`**：形式照搬 `/projects/key`，但项目范围由超管通过**可保存、动态重算、支持 AND/OR 逻辑**的范围筛选自定义；普通管理员看不到筛选，只能编辑进展列。

## 1. 全局约束（Global Constraints，每个任务都隐含遵守）

- **版本**：`frontend/src/version.ts` 单一来源改为 `APP_VERSION = 'V2.1.0'`、`RELEASE_DATE = '2026-06-25'`。新增整页＝Y 级（已与用户确认）。
- **超管恒为三个**：`admin` / `wangxutong` / `zhangyingzhe`，绝不新增第四个。本版本不改 `auth.py` 种子逻辑。
- **L4 数据隔离**：普通管理员只见本人 `allowedL4` 的项目。`analysis_data.json` 已在 `handle_data_json` 按会话 L4 裁剪，前端拿到的 `projects` 即已隔离——临时跟进的范围匹配在前端做，自动得到 `范围∩本人L4`。
- **设计令牌**：页面只引用 `var(--*)` 令牌（见 `theme.css`），禁止手写散值、禁止伪令牌（无 `--border`，用 `--line`）。弹层/抽屉优先用 Element Plus。
- **无 emoji**：需要符号时用 `→ ↓ ❌ ✕ ▾`。跟进类型术语用「邮件推动」。
- **双模式**：凡改"调用脚本/读写文件路径"逻辑，开发模式与打包模式（`getattr(sys,'frozen',False)`）两条分支都要顾及。本版仅新增 JSON store（路径基于 `BASE_DIR`，与 `PROGRESS_FILE`/`OPPORTUNITIES_FILE` 同构），无需 frozen 特判，但新文件路径必须走 `BASE_DIR`。
- **完成定义**：`bash verify.sh` 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）+ `PROGRESS.md` 更新。
- **gitignore**：新增 `data/temp_followup.json`、`data/temp_followup.backup-*.json`（运行时数据，不入库）。
- **目录穿越防护**：新建涉及文件名的逻辑主动 basename 防穿越（本版 store 文件名固定，无用户控文件名，无此风险，但导入类操作如有则加）。

---

## 2. 需求一：商机新增「先编辑后加行」

### 2.1 现状

- `OpportunitiesView.onCreate()`：`await store.create()` → 后端 `apply_create` 立即 append 空行 → 打开抽屉编辑。取消也已留下空行。
- `OpportunityEditDrawer.vue`：`onSave` 需 `props.row`（已存在的 `OppRow`），调 `store.update(row.id, fields)`。

### 2.2 目标行为

- 点「新增商机」→ 直接弹抽屉，表单为空白草稿（无后端行、无 id）。
- 抽屉「保存」→ 才创建并追加该行（带初始字段一次落地），照常盖 `firstReg`（首次有内容时）/`lastUpdate`/`lastUpdateBy`。
- 抽屉「取消」→ 不产生任何行。

### 2.3 改动

**后端 `/api/opportunities/create`（超管门禁不变）**：接收**可选** `fields`（dict）。处理器：`apply_create(store, now_date)` 建行得 `row`，若 `fields` 非空则立即 `apply_update(store, row['id'], fields, account, now_date, now_dt)` 落字段，再 `_save_opportunities`，返回最终行。`fields` 缺省/空 → 行为同现状（空行）。`opportunities.py` 纯函数 **不改签名**（`apply_create`/`apply_update` 已满足），仅处理器编排两步。

**前端**：
- `lib/opportunitiesApi.ts`：`create(fields?: Record<string,any>)` → `api.post('/api/opportunities/create', fields ? { fields } : {})`。
- `stores/opportunities.ts`：`create(fields?: Record<string,any>): Promise<OppRow>` 透传 `fields`，append 返回行。
- `components/OpportunityEditDrawer.vue`：加 `mode?: 'create' | 'edit'`（默认 `'edit'`）。
  - create 模式：表单从空白 `OPP_FIELDS`（全 `null`）起；`onSave` 调 `store.create(fields)` 而非 `update`；保存成功后 `ElMessage.success('已新增')`、`emit('update:modelValue', false)`；只读信息区（firstReg/lastUpdate/recentUpdate）在 create 模式隐藏（`v-if="mode==='edit' && row"`）。
  - edit 模式：行为不变。
- `views/OpportunitiesView.vue`：
  - 新增 `editMode = ref<'create'|'edit'>('edit')`。
  - `onCreate()` 改为：`editRow.value = null; editMode.value = 'create'; editOpen.value = true`（不再先 `store.create()`）。
  - `openEdit(row)`：`editMode.value = 'edit'`（其余不变）。
  - 抽屉绑定 `:mode="editMode"`。

### 2.4 测试

- pytest：扩展 `tests/test_opportunities*`——create-with-fields 路径：`apply_create` 后 `apply_update` 落字段 + firstReg/lastUpdate 盖章正确；空 fields 退化为空行。
- vitest：`OpportunityEditDrawer` create 模式 onSave 调 `store.create(fields)`、不调 `update`、隐藏只读信息区；`OpportunitiesView.onCreate` 打开 create 抽屉且不预创建行（store.create 未被调用直至保存）。

---

## 3. 需求二：临时重点跟进页 `/projects/temp`

### 3.1 架构与数据流

整页照搬 `/projects/key` 的前后端栈。差异只在"范围来源"：key 用固定取数规则（`isKeyProject`），temp 用超管自定义、可保存、动态重算、支持 AND/OR 的范围筛选。

```
analysis_data.json（服务端已按会话 L4 裁剪）
  projects[] + projectPmis{} + paymentNodes{} + projectMilestones{}
        │  前端 matchScope(scope.conditions) → 命中项目集（∩ 本人 L4 自动成立）
        ▼
  TempFollowupView（仿 KeyProjectsView）
    ├ 范围设置（超管）→ ScopeBuilder → POST /api/temp-followup/scope
    ├ 当前 / 历史 数据集切换 + 选列 + 列内筛选 + 排序     （所有人）
    ├ 周进展 / 后续计划 两列就地编辑                      （所有人，含普通管理员）
    └ 更新（归档+清空）/ 导出                             （超管专属）
```

**两层"筛选"必须分清**：
- **范围筛选（第 1 层，超管专属、持久化、定义成员）**＝用户所说"可保存的筛选条件"。
- **列内筛选（第 2 层，所有人、临时视图）**＝沿用 key 页的 `ColumnFilter`（cross-filter store）+「清除所有筛选」，只过滤已在范围内的行。

### 3.2 后端：`temp_followup.py` + 端点

**新模块 `temp_followup.py`（纯函数，pytest 覆盖；不依赖 server）**：

```python
SCOPE_FIELDS = ('project', 'paymentNode', 'milestone')  # 维度组校验用（白名单）
PROGRESS_FIELDS = ('weekProgress', 'nextPlan')

def new_store() -> dict:
    return {"version": 1, "scope": {"combinator": "AND", "groups": []},
            "current": {}, "archives": []}

def normalize_scope(scope) -> dict:
    """宽容校验 + 规整范围条件结构；非法/缺字段回退默认。
    顶层 {combinator:'AND'|'OR', groups:[{combinator, conditions:[cond,...]}]}。
    cond = {group∈SCOPE_FIELDS, field:str, op:str, values?:list, min?, max?}。
    丢弃 group 不在白名单或 field 非字符串的 cond；combinator 非 AND/OR → 'AND'。"""

def apply_update(store, project_id, field, content, account, now):
    """field 须 ∈ PROGRESS_FIELDS，否则 ValueError。写 store['current'][pid]，盖章 EditTime/EditBy。返回该记录。"""

def apply_archive(store, rows, now):
    """append {archiveTime: now, rows} 到 archives，清空 current。"""
```

> 说明：`apply_update`/`apply_archive` 与 server.py 的 `_progress_apply_update`/`_progress_apply_archive` 语义同构。**刻意不复用 key 的实现**（key 的实现是 server.py 模块级函数、绑定 `PROGRESS_FILE`），把 temp 的纯函数收敛进 `temp_followup.py` 以获得独立 pytest 目标并隔离 key 路径（避免为加一页去改动已上线的 key 后端）。少量重复已知并接受。

**store 文件**：`data/temp_followup.json`，形状 `{version, scope, current:{projectId:{weekProgress,weekProgressEditTime,weekProgressEditBy,nextPlan,nextPlanEditTime,nextPlanEditBy}}, archives:[{archiveTime, rows}]}`。

**server.py 接线（与 progress / opportunities 同构）**：
- 模块级：`TEMP_FOLLOWUP_FILE = os.path.join(BASE_DIR, 'data', 'temp_followup.json')`、`_temp_lock = threading.Lock()`、`_load_temp_followup()`（缺文件/损坏→`temp_followup.new_store()`；`setdefault` 补 version/scope/current/archives）、`_save_temp_followup(store)`；`import temp_followup as _temp`。
- 端点（路由 dispatch 同 progress 的位置风格）：
  - `GET /api/temp-followup` → `handle_temp_followup_get`：返回 `{success, scope, current, archives}`（任意登录用户；普通管理员也需 scope 才能在前端算命中集）。
  - `POST /api/temp-followup/scope` `{conditions}` → `handle_temp_followup_scope`：`store['scope']=_temp.normalize_scope(body)`；`_save`；返回 `{success, scope}`。**超管专属**。
  - `POST /api/temp-followup/update` `{projectId, field, content}` → `handle_temp_followup_update`：校验 `field∈PROGRESS_FIELDS`、登录态取 `account`、`_temp.apply_update`、`_save`；返回 `{success, record}`。**任意登录用户**（普通管理员要能编辑进展列）。
  - `POST /api/temp-followup/archive` `{rows}` → `handle_temp_followup_archive`：校验 rows 为 list、`_temp.apply_archive`、`_save`；返回 `{success, archives}`。**超管专属**。
- `_SUPER_ONLY_PATHS` 追加：`/api/temp-followup/scope`、`/api/temp-followup/archive`（GET 与 update **不**列入）。
- 错误用既有 `_error_payload(ERR_PARSE/ERR_VALIDATION/ERR_AUTH/ERR_INTERNAL, msg)`、`_send_json(status, payload)` / `_json_response(payload)`。登录态取账号沿用 `auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))`。

**pytest**：`new_store` 默认形状；`normalize_scope` 丢非法 cond/回退 combinator；`apply_update` 非法 field 抛 ValueError、合法盖章；`apply_archive` 追加+清空。

### 3.3 范围筛选：字段目录 + 条件树 + 匹配语义

**条件树（两级 AND/OR + 条件级取反）**——前端类型（`lib/tempScope.ts`）：

```ts
export type Combinator = 'AND' | 'OR'
export type ScopeOp = 'in' | 'notIn' | 'between' | 'notBetween' | 'contains' | 'notContains'
export interface ScopeCondition {
  group: 'project' | 'paymentNode' | 'milestone'
  field: string                 // 须 ∈ 对应组的 FIELD_CATALOG 键
  op: ScopeOp
  values?: string[]             // in/notIn 用（枚举多选）
  min?: number | string | null  // between/notBetween 用（数值或 YYYY-MM-DD）
  max?: number | string | null
}
export interface ScopeGroup { combinator: Combinator; conditions: ScopeCondition[] }
export interface ScopeFilter { combinator: Combinator; groups: ScopeGroup[] }
```

**匹配语义（`matchScope`）**：
- 顶层：`groups` 之间按 `scope.combinator`（AND/OR）。空 `groups` 或全空组 → **命中为空**（不是命中全部）。
- 组内：`conditions` 之间按 `group.combinator`。空组（无 condition）按其上下文中性处理：AND 树里中性=true、OR 树里中性=false（实现上：空组在 groups 求值时跳过/视语义，详见实现说明）。为避免歧义，**实现规则统一为**：`evalGroup` 对空 conditions 返回 `false`（无条件不命中），顶层空 groups 返回 `false`。
- 条件求值：
  - `project` 组：取该项目的项目级值（来自 `buildProjectRows` 得到的 `ProjectRow` + AR/SR + 里程碑进度状态/终验时间），按 op 比较。
  - `paymentNode` / `milestone` 组：**存在性**——项目的该子表（`paymentNodes[pid][]` / `projectMilestones[pid][]`）中**任一行**满足该条件即为 true。多个子表条件各自独立按存在性判定，再并入树。
  - op：`in`=值∈values；`notIn`=值∉values；`between`=min≤值≤max（任一端为空则该端不限）；`notBetween`=取反；`contains`/`notContains`=文本包含/不包含（用于名称类）。数值/日期比较前做类型规整（日期按 `YYYY-MM-DD` 字符串字典序即可，值取前 10 位）。

**字段目录 `FIELD_CATALOG`（类型化，单一来源；每项 `{group, key, label, kind:'enum'|'number'|'date'|'text', accessor}`）**：

- **project 组**（accessor 走 `ProjectRow` 字段或 pmis）：
  - enum：`customer 客户`、`projectManager 项目经理`、`ar AR`、`sr SR`、`orgL4 L4组`、`projectLevel 级别`、`projectType 项目类型`、`stage 阶段`、`projectStatus 项目状态`、`health 健康度`、`riskLevel 风险等级`、`paymentStatus 回款状态`、`top1000 TOP1000`、`quadrant 象限`、`paused 是否暂停(是/否)`、`overspend 是否超支(是/否)`、`isPresale 是否售前(是/否)`、`tags 标签(多值,任一∈values 命中)`、`milestoneStatus 里程碑进度状态(pmis.progress.里程碑进度状态)`
  - number：`contractWan 合同金额(万)`、`progress 完工进展(0..1)`、`costRatio 预算消耗比`、`paymentRatio 回款完成率`、`openRisks 未关闭风险数`
  - date：`finalAcceptDate 终验时间(pmis.progress.终验时间, 取前10位)`
  - 布尔类 enum（paused/overspend/isPresale）取值集合固定 `['是','否']`，accessor 把 boolean 映射为 是/否。
- **paymentNode 组**（accessor 走 `PaymentNodePmis` 字段，存在性）：
  - enum：`stage 回款阶段`、`category 回款类型`、`status 状态`
  - date：`planDate 计划日期`、`actualDate 实际日期`
  - number：`payRatio 计划比例`、`actualRatio 实际比例`、`expectedPayment 计划回款(万)`、`receivedAmount 已收(万)`、`unpaidAmount 未收(万)`、`termDays 账期(天)`
- **milestone 组**（accessor 走 `MilestoneItem` 字段，存在性）：
  - enum：`priority 优先级`、`payStage 关联收款阶段`
  - text：`name 里程碑名称`
  - date：`planDate 计划日期`、`actualDate 实际日期`

> 枚举候选值由前端从当前数据动态去重（`cfUniqueValues` 同理），不在目录里硬编码取值（除布尔三态）。

**vitest（`lib/tempScope.test.ts`）**：覆盖 in/notIn/between/notBetween/contains/notContains；project vs 子表存在性；两级 AND/OR（`A AND B`、`A OR B`、`(A∧B)∨(C∧D)`、`(A∨B)∧C`）；空范围→空；日期区间端点边界；tags 多值命中。

### 3.4 前端：行模型 / API / store

**`lib/keyProjects.ts` 小重构（行为不变，已有测试护栏）**：抽出 `buildProgressRowBase(p, pmis, rec): KeyProjectRow`（即现 `buildKeyProjectRows` 的 per-project 映射体），`buildKeyProjectRows` 改为 `filter(isKeyProject).map(p=>buildProgressRowBase(...))`。temp 复用 `buildProgressRowBase`。

**`lib/tempFollowup.ts`**：
```ts
export interface TempRow extends KeyProjectRow {
  // 额外可选列（项目级属性，便于看清为何入选）：
  stage: string; projectType: string; projectStatus: string; health: string
  progress: number | null; costRatio: number | null; paymentRatio: number | null
  paymentStatus: string; top1000: string; quadrant: string
  paused: boolean; overspend: boolean; milestoneStatus: string
}
export function buildTempRows(
  projects: Project[], pmisMap: Record<string, ProjectPmis>,
  current: Record<string, ProgressRecord>, inScopeIds: Set<string>,
): TempRow[]
```
实现：`projects.filter(p=>inScopeIds.has(p.projectId))` → 每项 `{...buildProgressRowBase(p,pmis,rec), ...项目级额外字段}`。额外项目级字段复用 `buildProjectRows` 的派生（按 projectId 取一次性建好的 `ProjectRow` map，避免重复推导），`milestoneStatus` 取 `pmis.progress.里程碑进度状态`。

**`lib/tempFollowupApi.ts`**：
```ts
export interface TempScopeResp { success?: boolean; scope: ScopeFilter; current: Record<string,ProgressRecord>; archives: Archive[] }
export const tempFollowupApi = {
  get: () => api.get<TempScopeResp>('/api/temp-followup'),
  saveScope: (conditions: ScopeFilter) => api.post('/api/temp-followup/scope', conditions),
  update: (projectId, field, content) => api.post('/api/temp-followup/update', { projectId, field, content }),
  archive: (rows) => api.post('/api/temp-followup/archive', { rows }),
}
```

**`stores/tempFollowup.ts`**：`{ scope, current, archives, loaded, load(), saveScope(scope), update(pid,field,content), archive(rows), reset() }`，结构镜像 `projectProgress`，外加 `scope`。`reset()` 接入 `stores/auth.ts` 的 `login`/`logout`（紧邻 `useProjectProgressStore().reset()` / `useOpportunitiesStore().reset()`，跨账号防泄漏）。

### 3.5 前端：组件

**`components/ScopeBuilder.vue`（超管专属，el-drawer rtl 或 Modal）**：
- 顶层 combinator（组之间 AND/OR）切换。
- 组列表：每组一张卡——组内 combinator（AND/OR）+ 条件行列表 + 「添加条件」「删除组」。
- 条件行：选维度组（项目/回款节点/里程碑）→ 选字段（按组过滤目录）→ 选运算符（按字段 kind 给可选 op）→ 值控件（enum→`el-select` 多选 + 动态候选；number→两个 `el-input-number` min/max；date→`el-date-picker` 范围或两个日期；text→`el-input`）。删除条件。
- 「添加组」。
- 底部：实时「命中 N 个项目」（前端 `matchScope` 对当前 store 数据算）+ 保存 / 取消。保存调 `store.saveScope`（超管端点）。
- 全令牌化、五态齐全、`.u-num` 用于命中数。

**`views/TempFollowupView.vue`（仿 `KeyProjectsView.vue`）**：
- onMounted：`data.load()`、`tempFollowup.load()`。
- `inScopeIds = computed(() => matchScope(data.data.projects, pmis, paymentNodes, milestones, tempFollowup.scope))`。
- `currentRows = computed(() => buildTempRows(projects, pmis, tempFollowup.current, inScopeIds))`。
- 数据集 current/history 切换（`SegToggle` + history `el-select`）、`historyOpts`/默认指向最新快照——同 key。
- 列：`ALL_COLUMNS` = key 那套 14 列（**默认可见**）+ 额外可选列（默认隐藏）：`stage 阶段`、`projectType 类型`、`projectStatus 状态`、`health 健康度`、`progress 完工%`、`paymentRatio 回款完成率`、`costRatio 消耗比`、`paymentStatus 回款状态`、`top1000 TOP1000`、`quadrant 象限`、`paused 暂停`、`overspend 超支`、`milestoneStatus 里程碑状态`。`useColumnPrefs('temp-followup', ALL_KEYS, DEFAULT_VISIBLE=key那14键)`。`FILTERABLE`（列内 cross-filter）取枚举型列集合。
- 工具栏：数据集 + ColumnPicker + **范围设置（`v-if="auth.isSuper"`）**打开 ScopeBuilder + **更新（归档+清空）（超管）** + **导出（超管）** + 清除所有筛选。
- 表体：`DataTable`，两列进展 `weekProgress`/`nextPlan` 就地编辑（`ProgressEditModal` 复用，但其 update 走 `tempFollowup.update`——见下）。点行 `router.push('/project/'+projectId)`（同 key）。
- 空态：超管→「请点击『范围设置』定义临时跟进范围」；普通管理员→「暂无临时重点跟进项目」。
- 归档 `doArchive`：`tempFollowup.archive(currentRows)`；导出 `doExport`：多数据集多 sheet（同 key 的 `exportSheets`），导出列含已显示列。

**进展编辑弹层复用**：`ProgressEditModal` 目前内部调 `useProjectProgressStore().update`。为复用到 temp，给 `ProgressEditModal` 加 `store?: 'key' | 'temp'`（默认 `'key'`）prop，按值选 `useProjectProgressStore` 或 `useTempFollowupStore`。**或**更干净：把 `ProgressEditModal` 改为 `emit('save', {projectId, field, content})`，由各 View 自行落库。优先后者（解耦），但需同步改 key 页的 `ProgressEditModal` 用法——属"改动 key 页"风险，**取保守方案：加 `store` prop 分流**，key 页用法不变。最终方案由实现任务在计划中定，spec 取「加 `store` prop」为基线。

**vitest**：`ScopeBuilder`（加/删组与条件、op 随 kind 变、命中数随条件变、保存调 saveScope、普通管理员不渲染——但 ScopeBuilder 本就只在超管处挂载，测 View 层 gating）；`TempFollowupView`（inScope→rows 管线、默认列=key 14、额外列可选、超管见范围/更新/导出按钮且普通管理员不见、进展编辑走 temp store、空态文案分超管/普通）。

### 3.6 路由 / 导航 / 页面门禁注册

- `lib/pageAccess.ts`：`PageKey` 增 `'temp-followup'`；`PAGE_OPTIONS` 注释计数 20→21（实际由 nav 链接派生，无需手列）。
- `nav.ts`：`KEY_FOLLOWUP_LINKS` 增 `{ label: '临时重点跟进', to: '/projects/temp', key: 'temp-followup' }`，**放在「重点商机进展」之后**。
- `router/index.ts`：`import TempFollowupView`；route `{ path:'/projects/temp', name:'temp-followup', component: TempFollowupView, meta:{ title:'临时重点跟进', hideFilter:true, pageKey:'temp-followup' } }`。注意 `/projects/temp` 与 `/projects/key`、`/projects/closed` 均为精确路径，互不遮蔽。
- vitest：`AppSidebar.test` 链接计数 14→15（或相应基数）同步；门禁：普通管理员未授权该 key → `firstAllowedPath` 跳转（既有 beforeEach 逻辑覆盖，新增计数测试即可）。

---

## 4. 版本与交付（连升第二跳）

- 版本 **V2.1.0**（`version.ts` 单一来源）；`PROGRESS.md` 头部滚动 + 增 V2.1.0 版本史条目。
- **V2.0.0 更新包原封不动**。新出：
  - 升级手册 `deploy/升级手册-V2.1.0.md`：写明这是"第二跳"——现网(V1.16.4) → 套 V2.0.0 更新包 → 再套 V2.1.0 更新包；含临时跟进首用需超管在「范围设置」定义范围、`data/temp_followup.json` 持久化与备份说明、上线验证清单（含 `/projects/temp` 超管见范围设置/普通管理员只见可编辑进展+无范围入口、`/api/temp-followup/scope` 未超管 403、未登录 GET 401、商机新增改为先弹抽屉）。
  - 最小更新包 `release/pmplatform-update-V2.1.0.zip`：全根 `.py`（含新增 `temp_followup.py`）+ `/pm` dist + 升级手册-V2.1.0.md；不含 data/input。
  - `make_deploy_zip.py` 的 `TOP_FILES` 增 `temp_followup.py`。
- **打包注意**：`/pm` dist 必须用 PowerShell 或 `MSYS_NO_PATHCONV=1` 构建（Bash 篡改 `--base=/pm/`），锚定校验 `grep '="/pm/assets'`；出包后本地 dist 须重建回默认 base 防本地白屏。

## 5. 测试策略汇总

- **pytest**：`temp_followup.py` 纯函数；商机 create-with-fields 路径。
- **vitest**：`tempScope`（matchScope 全分支）、`tempFollowup`（行构建）、`ScopeBuilder`、`TempFollowupView`、`OpportunityEditDrawer` create 模式、`OpportunitiesView.onCreate`、`AppSidebar` 计数、`keyProjects`（重构后回归绿）。
- **typecheck / build**：全绿。
- **真实数据 live 冒烟（主控亲做，合并前）**：启 server + 超管登录 → `/projects/temp` 定义一组范围（含一个子表存在性条件、一个 AND/OR 组合）→ 命中数合理 → 编辑进展 → 归档 → 导出 → 普通管理员登录只见 L4∩范围、无范围/更新/导出入口、可编辑进展；`/opportunities` 新增走先弹抽屉、取消不留行、保存才加行。

## 6. 决策记录（已确认）

- 范围模型：**全局共享单一范围**（非每超管一套）。
- 保存语义：**保存条件、动态重算**（数据更新自动进出范围）。
- 可筛维度：**项目级属性 + 回款节点子表 + 里程碑明细子表**（不含风险记录/成本行/回款流水等其它子表）。
- 逻辑：**两级 AND/OR + 条件级取反（op 内置 not* 变体）+ 子表存在性**；空范围→命中为空。
- 版本：**V2.1.0**（新增整页＝Y 级）。

## 7. 不做（YAGNI / 出范围）

- 不做任意层级嵌套的条件树（两级足够）；不做"子表同一行同时满足多条件"（按各自存在性）。
- 不改 key 页后端、不改 `auth.py` 种子、不重构 progress store 为多 board。
- 子表条件不落成表格列（多行不适合）；额外列仅项目级属性。
- 不做范围条件的导入/导出（范围由页面构建器维护即可）。
