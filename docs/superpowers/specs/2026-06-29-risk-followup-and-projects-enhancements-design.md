# V2.3.0 设计：风险跟进新页 + 标签排除补全 + 孤儿原项目告警 + /projects 增强

> 状态：设计已与用户确认（4 个决策点：范围作用于风险行 / 默认展示全部风险 / 孤儿原项目进治理页告警 / 合并 V2.3.0 一次交付）。
> 日期：2026-06-29　版本：V2.2.2 → **V2.3.0**（新页=整页级 Y；其余 Z 级）。
> 交流语言：简体中文。设计令牌、口径、打包均沿用现有约定（见 CLAUDE.md）。

## 0. 总览与全局约束

四块相互独立、共享一个发布：

| 编号 | 内容 | 规模 | 后端 |
|---|---|---|---|
| Item 1 | 标签排除补两页（首页 / 成本分析） | 小（前端） | 无 |
| Item 2 | 新页「风险跟进」`/risk` | 大（新页+新后端模块） | `risk_followup.py` + 4 端点 |
| Item 3 | 孤儿原项目清单（治理页告警） | 小（前端纯函数） | 无 |
| Item 4 | `/projects` 列排序 + 关注原因拆分/筛选 | 中（前端） | 无 |

**全局约束（每个任务都隐含遵守）：**

- **不改 `preprocess_data.py` / `schema.py` / 数据管线**。Item 2 风险行前端拍平、Item 4.2 用现成 `cost.交付超支` 字段、Item 3 前端派生 → **升级不需点「更新数据」、无新依赖**。
- 唯一新增运行码：`risk_followup.py` + `server.py` 端点（随 `*.py` 进更新包）。
- **唯一新页面访问 key：`risk-followup`**。普通管理员需在「页面访问控制」授权才可见（手册必须写明，类似 V2.2.0 重点商机跟进页）。
- 设计令牌只引用 `theme.css` 变量，不手写散值；不使用 emoji（符号用 `→ ↓ ✕ ▾`）。
- 版本单一来源 `frontend/src/version.ts`：`APP_VERSION='V2.3.0'`、`RELEASE_DATE='2026-06-29'`。
- 验证：`bash verify.sh` 全绿（syntax/ruff/pytest + 前端 typecheck/vitest/build）。改后端纯函数先补测试再改实现。

---

## Item 1 — 标签排除补两页

### 现状
- 「按标签排除」是全局状态：`useFilterStore` 的 `excludeOn`(localStorage `pa_exclude_on`) + `excludeTags`(localStorage `pa_exclude_tags`) → 派生 `excludedIds: Record<pid,true>`。开关 UI 只在 `/data`(DataView) 设置，全站生效。
- `OverviewView`(`/`) 与 `CostDetailView`(`/insight/costdetail`) 路由均 `hideFilter:true`，不显示 FilterBar，且**未消费** `excludedIds` → 排除对这两页无效（缺陷）。

### 设计
两页都**继承全局排除状态、不加新 UI**（与「排除只在 /data 设、全站生效」一致）。在「喂给本页计算的项目集」处按 `excludedIds` 过滤：

- `OverviewView.vue`：已 `import useFilterStore`。在派生项目列表的源 computed 处加过滤：
  ```ts
  const filter = useFilterStore()
  const baseProjects = computed(() => {
    const all = (data.data?.projects ?? []) as Project[]
    if (!filter.excludeOn) return all
    return all.filter((p) => !filter.excludedIds[p.projectId])
  })
  ```
  页面后续所有 KPI / 风险分类 / 回款重点统计改读 `baseProjects.value`（替换原直接读 `data.data.projects` 的入口）。
- `CostDetailView.vue`：新增 `import { useFilterStore }`，在 `buildCostRows(projects, pmis)` 的 `projects` 入参处同样过滤后再传入。

### 测试
- `OverviewView.test.ts`：种入 2 个项目，其一挂被排除标签 + 开排除 → 断言该项目不计入某 KPI（如总数/某统计）。
- `CostDetailView.test.ts`：同理断言被排除项目不出现在成本行中。
- 关 `excludeOn` 时两页回到全量（回归安全网）。

---

## Item 2 — 新页「风险跟进」`/risk`

### 2.1 数据：前端拍平「风险行」（零后端数据改动）

风险记录现挂 `projectPmis[pid].riskRecords[]`。新增 `frontend/src/lib/riskRows.ts`：

```ts
import type { Project, ProjectPmis } from '@/types/analysis'
import { leafMatch } from './scopeOps'
import type { ScopeFilter, ScopeCondition, ScopeGroup } from './tempScope'

export interface RiskRow extends Record<string, any> {
  riskKey: string       // `${项目编号}::${风险编码}` 复合主键（兜底风险编码跨项目不唯一）
  projectId: string
  // …风险记录全部原始中文键（风险编码/风险名称/风险等级/风险状态/风险大类/…）
  // …join 的项目列（projectName/contractAmount/projectLevel/projectManager/orgL4/…）
  followAction?: string; revConclusion?: string; nextRevDate?: string
  followActionEditTime?: string; revConclusionEditTime?: string; nextRevDateEditTime?: string
}

/** 拍平所有项目的风险记录为风险行，join 项目列。默认全部风险（含已关闭）。 */
export function buildRiskRows(
  projects: Project[],
  pmis: Record<string, ProjectPmis>,
  followCurrent: Record<string, any>,
): RiskRow[] { /* 遍历 projects → 取 pmis[pid].riskRecords → 每条风险拼 项目列 + riskKey + 跟进字段 */ }

/** 单表范围匹配（风险行级，两级 AND/OR）。空范围→false（由视图判空决定是否回退全量）。 */
export function riskRowMatches(row: Record<string, any>, scope: ScopeFilter): boolean {
  if (!scope || !Array.isArray(scope.groups) || !scope.groups.length) return false
  const evalCond = (c: ScopeCondition) => leafMatch(row[c.field], c)
  const evalGroup = (g: ScopeGroup) =>
    g.conditions.length ? (g.combinator === 'OR' ? g.conditions.some(evalCond) : g.conditions.every(evalCond)) : false
  const rs = scope.groups.map(evalGroup)
  return scope.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}
```

**join 的项目列**取 `ProjectsView` 主域字段：`projectName`(项目名称)、`contractAmount`(项目金额)、`projectLevel`(项目级别)、`projectManager`(项目经理)、`orgL4`(L4组织)、以及其余项目列供「临时选择」。项目编号统一用项目主域 `projectId`（标签为「项目编号」），与风险记录里的 `项目编号` 去重（同一列只出现一次）。

**L4 隔离**：`data.data.projects` 已由后端按账号 L4 裁剪下发（沿用 useDataStore 现状），故风险行天然只含本人 L4 项目，无需额外裁剪。

### 2.2 列模型（默认 16 列 + 全列可选/可排序）

`RiskFollowupView.vue` 用 `DataTable` + `useColumnPrefs('risk-followup', ...)` + `ColumnPicker` + `ColumnFilter`（同 KeyProjectsView 结构）。

**列来源（按 label 去重，顺序：默认列在前）：**
1. 风险全列：沿用 `projectPage.ts` 的 `RISK_COLUMNS` 精选标签/宽度/日期格式，未命中的风险键用原始中文键名 + 宽 160 + `wrap:true`（同 ProjectDetailView 全列策略）。
2. 项目全列：`projectId→项目编号`、`projectName→项目名称`、`contractAmount→项目金额(万)`(formatter ÷1e4)、`projectLevel→项目级别`、`projectManager→项目经理`、`orgL4→L4组织`、其余项目列。
3. 三个跟进列（见 2.3）。

**默认可见列（16，`DEFAULT_VISIBLE`）：** 风险编码、风险等级、风险状态、项目编号、项目名称、项目金额、项目级别、项目经理、L4组织、风险名称、风险大类、风险小类、风险描述、跟进动作、rev结论、下次rev时间。

全列 `sortable:true`（Element Plus 原生排序）。`FILTERABLE` 含风险等级/风险状态/风险大类/风险小类/项目级别/项目经理/L4组织 等枚举列。

### 2.3 三个跟进字段（持久化、跟随风险）

| 列 | label | 编辑形态 | 后端字段 |
|---|---|---|---|
| 跟进动作 | 跟进动作 | 文本（`ProgressEditModal` 扩展） | `followAction` |
| rev结论 | rev结论 | 文本（`ProgressEditModal` 扩展） | `revConclusion` |
| 下次rev时间 | 下次rev时间 | **行内 `el-date-picker`**（`value-format="YYYY-MM-DD"`） | `nextRevDate` |

- **文本两列**：扩展 `ProgressEditModal.vue` —— `field` 联合类型加 `'followAction' | 'revConclusion'`；`store` 选项加 `'riskFollowup'`；`FIELD_LABEL` 加 `{ followAction:'跟进动作', revConclusion:'rev结论' }`；`activeStore` 分支加 risk store。点击单元格弹框编辑，保存调 `riskFollow.update(riskKey, field, text)`。
- **日期列**：单元格内嵌 `el-date-picker`，`@change` 调 `riskFollow.update(riskKey, 'nextRevDate', val)`（空值=清除）。
- 编辑后单元格展示 `editTime：内容`（同 key 页 progCell 风格）；历史快照模式只读。
- 主键用 `riskKey`（`项目编号::风险编码`），不是 `projectId`——因同一项目可有多条风险。

### 2.4 后端模块与端点

新模块 `risk_followup.py`（仿 `temp_followup.py` 纯函数，可单测）：

```python
PROGRESS_FIELDS = ('followAction', 'revConclusion', 'nextRevDate')
def new_store() -> dict: return {"version":1, "scope":{"combinator":"AND","groups":[]}, "current":{}, "archives":[]}
def normalize_scope(scope) -> dict: ...   # 同 temp 的宽容规整（单表：条件无 group 亦可，规整时 group 容缺）
def apply_update(store, risk_key, field, content, account, now) -> dict:
    if field not in PROGRESS_FIELDS: raise ValueError(...)
    rec = store.setdefault('current', {}).setdefault(risk_key, {})
    rec[field] = content; rec[field+'EditTime'] = now; rec[field+'EditBy'] = account
    return rec
def apply_archive(store, rows, now) -> None:          # 关键差异：只追加快照，不清空 current
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
    # 注意：不执行 store['current'] = {} —— 跟进数据留存
```

`server.py` 加（仿 progress / temp-followup 三件套）：`_load_risk_followup()/_save_risk_followup()`（文件 `data/risk_followup.json`，加锁）、`handle_risk_followup_get/_scope/_update/_archive`，在 `do_GET/do_POST` 注册路由。

| 端点 | 方法 | 权限 |
|---|---|---|
| `/api/risk-followup` | GET | 任意登录 |
| `/api/risk-followup/update` | POST | 任意登录（写 followAction/revConclusion/nextRevDate） |
| `/api/risk-followup/scope` | POST | **超管**（入 `_SUPER_ONLY_PATHS`） |
| `/api/risk-followup/archive` | POST | **超管**（入 `_SUPER_ONLY_PATHS`） |

`normalize_scope` 对单表范围的容错：`temp_followup.normalize_scope` 要求 `group ∈ SCOPE_GROUPS` 才收条件，会丢掉无 group 的单表条件。**因此 risk_followup 自带 `normalize_scope`**（不复用 temp 的），允许 `group` 缺省，只校验 `field` 非空 + `op ∈ _OPS`。

### 2.5 「归档（留存跟进）」—— 差异化语义

按钮文案改为 **「归档（留存跟进）」**（不叫「归档+清空」，避免误解）。确认弹窗文案：「将当前风险跟进快照归档为历史；已填写的跟进动作 / rev结论 / 下次rev时间**保留不清空**（下次『更新数据』后按风险编码重新挂到最新风险上）。确认归档？」

行为：`riskFollow.archive(currentRows)` → 后端 `apply_archive` 只 push 快照、`current` 原样保留。归档后停留在「当前数据」。

### 2.6 范围设置

复用 `ScopeBuilder`，单表模式：
```vue
<ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen"
  :inputs="riskRows" :initial="riskFollow.scope" single-table
  :catalog="RISK_SCOPE_CATALOG" :match-fn="riskRowMatches"
  title="范围设置（风险跟进）" count-unit="风险"
  @save="(s) => riskFollow.saveScope(s)" />
```
`RISK_SCOPE_CATALOG: FieldLike[]`（`{key,label,kind}`，无 group）= 风险列（enum/text/date 按字段判 kind）+ 项目列（orgL4/projectManager/projectLevel… enum；contractAmount number；…）。

**默认展示全部风险**：视图判空——范围无有效条件时展示全量，有条件时 `rows.filter((r)=>riskRowMatches(r, scope))`：
```ts
const hasScope = computed(() => riskFollow.scope.groups.some((g) => g.conditions.length))
const scopedRows = computed(() => hasScope.value ? allRows.value.filter((r) => riskRowMatches(r, riskFollow.scope)) : allRows.value)
```

### 2.7 路由 / 导航 / 权限 / store

- 路由：`{ path: '/risk', name: 'risk-followup', component: RiskFollowupView, meta: { title:'风险跟进', hideFilter:true, pageKey:'risk-followup' } }`（顶层 `/risk`，与既有 `/payment/risk`、`/insight/risk` 不冲突）。
- 导航：`nav.ts` 的 `KEY_FOLLOWUP_LINKS` 追加 `{ label:'风险跟进', to:'/risk', key:'risk-followup' }`（自动进侧栏 + 自动成为账号「可访问页面」选项，因 `PAGE_OPTIONS` 派生自 nav）。
- pageAccess：`PageKey` 联合类型加 `'risk-followup'`。
- 权限：同 `/projects/key`——编辑跟进字段任意登录管理员可写；范围设置/归档按钮 `v-if="auth.isSuper"` + 后端超管校验。
- store：新增 `frontend/src/stores/riskFollowup.ts`（仿 `tempFollowup` store：`current/archives/scope/load/update/archive/saveScope`），`lib/riskFollowupApi.ts`（4 端点封装）。

### 2.8 测试
- 后端 `tests/test_risk_followup.py`：`apply_update` 写三字段 + 盖编辑戳；`apply_archive` **断言归档后 `current` 不被清空**（与 temp 的关键差异）；`normalize_scope` 接受无 group 的单表条件、丢非法条件。
- 前端：`riskRows.test.ts`（拍平 + join + riskKey + riskRowMatches 两级 AND/OR + 空范围→false）；`RiskFollowupView.test.ts`（默认 16 列、无范围展示全量、有范围过滤、归档确认文案=留存、超管见范围/归档按钮普通管理员不见）；`ProgressEditModal.test.ts` 补 riskFollowup store 分支。

---

## Item 3 — 孤儿原项目清单（治理页告警）

### 设计
`governance.ts buildHealthReport(data)` 已收 `data.projects` + `data.projectPmis`。在 `alerts.sort` 前追加一类 `AlertGroup`：

```ts
const orphanOrigin = (data.projects ?? [])
  .filter((p) => p.relatedClosedId && !data.projectPmis?.[p.relatedClosedId])
  .map((p) => ({ projectId: p.projectId, projectName: p.projectName,
                 projectManager: p.projectManager, orgL4: p.orgL4, relatedClosedId: p.relatedClosedId }))
alerts.push({ key: 'originMissing', label: '原项目数据缺失', severity: 'mid', count: orphanOrigin.length,
  columns: [{ key:'projectId', label:'项目编号' }, { key:'projectName', label:'项目名称' },
            { key:'projectManager', label:'项目经理' }, { key:'orgL4', label:'L4组' },
            { key:'relatedClosedId', label:'原项目号' }],
  rows: orphanOrigin, exportName: '原项目数据缺失.xlsx' })
```

`DataQualityView`(`/governance`) 通用渲染所有 `alerts`，**零页面改动**。语义：项目填了原项目号（`relatedClosedId`），但 PMIS 项目域无对应行 → 售前整合/回款回退会静默落空，需导出端补该原项目数据。

### 测试
`governance.test.ts`：构造 1 个 `relatedClosedId` 命中 projectPmis、1 个未命中 → 断言 `originMissing` 告警仅含未命中那条；`relatedClosedId` 为空不计入。

---

## Item 4 — `/projects` 增强

### 4.1 列排序
`ProjectsView.vue ALL_COLUMNS` 给以下列加 `sortable: true`：`projectManager`(项目经理)、`orgL4`(L4组)、`riskLevel`(风险)、`projectLevel`(级别)、`projectType`(项目类型)、`projectStatus`(项目状态)。「风险」列按 `riskLevel` 文本排序（保持简单，不引自定义 sort-method）。

### 4.2 关注原因：拆成「总成本超支」+「交付成本超支」并支持筛选

**`riskReasons.ts`**：把 `RiskCategory` 的 `'成本超支'` 替换为 `'总成本超支' | '交付成本超支'`，逻辑：
```ts
// 总成本超支（整体预算维度）：overspendAmount>0 优先；否则 PMIS 项目超支 flag / 消耗比>1
const over = project.overspendAmount ?? 0
if (over > 0) out.push({ category: '总成本超支', detail: `超支 ${(over/10000).toFixed(1)} 万`, tone: 'danger' })
else if (pmis?.cost?.['项目超支'] || (pmis?.cost?.['消耗比'] ?? 0) > 1)
  out.push({ category: '总成本超支', detail: '项目超支', tone: 'danger' })
// 交付成本超支（交付部门人工成本，后端现成布尔 flag）
if (pmis?.cost?.['交付超支'] === true)
  out.push({ category: '交付成本超支', detail: '交付人工超支', tone: 'danger' })
```
两类可同时出现。同步更新所有引用 `'成本超支'` 字面量的测试。

**关注原因列筛选**：
- `ProjectsView.vue` 把 `'riskReasons'` 加入 `FILTERABLE`。
- `crossFilter.ts` 给 `riskReasons` 列加特殊处理：`cfUniqueValues` 把每行的 `RiskReason[]` 摊平成各 `category` 收集为去重选项；行匹配判定为「该行 categories 与所选集合有交集」（多值单元格语义）。其余列行为不变。
- `ColumnFilter` 沿用现有组件，选项即各关注原因类别（回款延期 / 里程碑滞后 / 总成本超支 / 交付成本超支 / 风险未闭环 / 数据异常）。

### 测试
- `riskReasons.test.ts`：`overspendAmount>0` → 含「总成本超支」；`交付超支===true` → 含「交付成本超支」；两者并存可同时出现；旧「成本超支」断言全部迁移。
- `ProjectsView` / `crossFilter.test.ts`：按「交付成本超支」筛选只留命中行；多值交集语义正确；非 riskReasons 列筛选回归不变。
- 排序：断言六列 `sortable:true`（或快照列定义）。

---

## 实现拆解（5 工作流）

1. **WS-1 Item 1**：标签排除补两页（前端，最小）。
2. **WS-2 Item 2 后端**：`risk_followup.py` + server.py 端点 + `data/risk_followup.json` + pytest（含归档不清空断言）。
3. **WS-3 Item 2 前端**：`riskRows.ts` + store + api + `RiskFollowupView.vue` + 路由/导航/pageAccess + `ProgressEditModal` 扩展 + vitest。
4. **WS-4 Item 3**：治理告警 originMissing（前端纯函数 + 测试）。
5. **WS-5 Item 4**：列排序 + 关注原因拆分/筛选 + crossFilter 扩展（前端 + 测试）。

WS-3 依赖 WS-2 的端点契约；其余互不依赖。

## 交付物（V2.3.0）

- `verify.sh` 全绿。
- 更新包 `release/pmplatform-update-V2.3.0.zip`：PowerShell `npx vite build --base=/pm/`（校验 `="/pm/assets`）→ `python make_update_zip.py` → **重建默认 base dist**。包含改动的 `*.py`（含 `risk_followup.py`）+ `/pm` dist；不含 data/input/tests/docs。
- 升级手册 `deploy/升级手册-V2.3.0.md`：**重点写**——① 新增页面访问 key `risk-followup`，普通管理员需在「页面访问控制」授权方可见；② 归档为「留存跟进」语义（不清空）；③ 关注原因新增「交付成本超支」类；④ 无新依赖、不需点「更新数据」。
- `PROGRESS.md` 同步版本史。
