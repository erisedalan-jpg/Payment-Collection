# 商机清单改造 + 重点商机跟进新页 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `/opportunities` 移入「项目」分组并改名「商机清单」+新增「商机级别」P1–P4 下拉列；新增 `/opportunities/key`「重点商机跟进」页（形式同 `/projects/temp`，超管选范围生成清单、普通管理员填跟进、超管留档）。

**Architecture:** 后端复用商机持久化(`opportunities.py`)+新增跟进域纯模块(`opportunity_followup.py`，镜像 `temp_followup.py`)；前端把范围匹配纯运算符抽成 `scopeOps.ts` 共享，`tempScope.ts` 改引用、`opportunityScope.ts` 新建单表匹配；`ScopeBuilder.vue` 加向后兼容可选 prop 同时服务两页；新视图 `OpportunityFollowupView.vue` 取数自 opportunities store 叠加跟进记录。

**Tech Stack:** Python 标准库 HTTP(server.py, ThreadingHTTPServer) + pydantic/openpyxl；Vue3 + Vite + TS + Pinia + Element Plus；pytest + vitest。

## Global Constraints

- 交流/文案一律**简体中文**；**不使用 emoji**，需符号时用 `→ ↓ ❌ ✕ ▾`。
- 样式只引用 `frontend/src/styles/theme.css` 设计令牌(`--*`)，**不手写散值**。
- 版本单一来源 `frontend/src/version.ts`：本期 **V1.x → V2.2.0**（新增整页=Y 级；改此一处）。
- **不改回款口径**、不动 temp/key 既有页面行为（参数化须以默认值保持 temp 调用处不变）。
- 列名取 `OPP_COLUMNS` 的 label；"客户类型"是用户对 `top1000`(是否TOP1000客户) 的指代，**列头仍显示 `是否TOP1000客户`，不改名为"客户类型"**，只是把 `top1000` 放进新页默认列。
- `/opportunities` 的 `pageKey` 保持 `'opportunities-progress'` 不变；新页 `pageKey='opportunity-followup'`。
- `feature_list.json` **与页面访问控制无关**（全仓 `.py/.ts` 源码均不读它）；页面访问 = `pageAccess.ts` 的 `PageKey` 联合类型 + `nav.ts` 链接 + 账号 `allowedPages`。后端 `allowedPages` 仅按字符串列表校验(`_validate_str_list`)，新 pageKey **无需后端改动**。
- 商机范围是**单表**：条件无子表 `group` 键；`ScopeCondition.group` 改为可选以兼容两页。
- 新页默认范围：`(top1000 in [TOP1000]) AND (earlyIntervene in [是]) AND (keyOpp in [是]) AND (status notIn [赢单])`（单组四条 AND；"赢单"是 `STATUS_OPTIONS` 合法值）。
- 完成 = 代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
- 本特性全为纯 Python 文件 IO + 前端，**无 subprocess、无 frozen 分支需求**。

---

## Part 1 — /opportunities 改造

### Task 1: 后端新增 opportunityLevel 字段

**Files:**
- Modify: `opportunities.py:7-12`(FIELDS), `opportunities.py:16-25`(HEADER_TO_FIELD)
- Test: `tests/test_opportunities.py`

**Interfaces:**
- Produces: `opportunities.FIELDS` 含 `'opportunityLevel'`（普通字符串字段，走默认 `_s` 分支）；xlsx 表头 `商机级别` → `opportunityLevel`。
- Consumes: 既有 `new_row`(按 FIELDS 初始化空串)、`apply_update`(白名单 + 盖章) 无需改。

- [ ] **Step 1: 写失败测试**（追加到 `tests/test_opportunities.py` 末尾）

```python
def test_opportunity_level_is_editable_field():
    assert 'opportunityLevel' in opp.FIELDS
    r = opp.new_row("opp-1")
    assert r["opportunityLevel"] == ""
    s = _store(); opp.apply_create(s, "d")
    r2 = opp.apply_update(s, "opp-1", {"opportunityLevel": "P2"}, "admin", "d", "t")
    assert r2["opportunityLevel"] == "P2"


def test_read_xlsx_maps_opportunity_level(tmp_path):
    p = tmp_path / "opp_level.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["客户名称", "商机级别"])
    ws.append(["甲公司", "P1"])
    wb.save(p)
    rows = opp.read_opportunities_xlsx(str(p))
    assert rows[0]["opportunityLevel"] == "P1"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_opportunities.py -q -k "opportunity_level"`
Expected: FAIL（`'opportunityLevel' in opp.FIELDS` 为 False / xlsx 映射缺失）

- [ ] **Step 3: 改实现** — `opportunities.py`

`FIELDS` 末尾加 `opportunityLevel`：

```python
FIELDS = (
    'l4', 'salesOwner', 'customer', 'industry', 'top1000', 'status', 'forecast',
    'name', 'amountWan', 'expectedDate', 'productCategory', 'mainProducts',
    'outsource', 'frOwner', 'frMatch', 'deliveryMatch', 'crossRegion',
    'keyOpp', 'earlyIntervene', 'remark', 'bidStatus', 'bidDate',
    'opportunityLevel',
)
```

`HEADER_TO_FIELD` 加一行映射（放在 `预估落单时间` 行附近即可，dict 顺序不影响）：

```python
    '是否需要外区域支持': 'crossRegion', '是否重点商机': 'keyOpp', '是否提前介入': 'earlyIntervene',
    '当前进展/风险说明/情况备注': 'remark', '实际中标状态': 'bidStatus', '中标日期': 'bidDate',
    '商机级别': 'opportunityLevel',
    '首次登记日期': 'firstReg', '最后一次更新日期': 'lastUpdate',
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_opportunities.py -q`
Expected: PASS（全部，含既有用例——`new_row` 循环对 `opportunityLevel` 也得空串）

- [ ] **Step 5: 提交**

```bash
git add opportunities.py tests/test_opportunities.py
git commit -m "feat(opp): 商机新增 opportunityLevel 字段(白名单+xlsx映射)"
```

---

### Task 2: 前端新增「商机级别」列

**Files:**
- Modify: `frontend/src/lib/opportunityColumns.ts`
- Test: `frontend/src/lib/opportunityColumns.test.ts`

**Interfaces:**
- Produces: `OPP_COLUMNS` 含 `opportunityLevel`(type `select`, options P1–P4)，位于 `amountWan` 与 `expectedDate` 之间；`DEFAULT_VISIBLE` 含 `opportunityLevel`(同位)；`OPP_FIELDS` 因此变 23 项、`OPP_COLUMNS` 变 26 列。
- Consumes: 既有 `OppColumn` 类型、select 渲染/编辑/筛选机制(自动适配)。

- [ ] **Step 1: 改测试为新期望**（`opportunityColumns.test.ts`）

把计数断言改 22→23、25→26，并新增列位置/取值断言；顶部 import 加 `DEFAULT_VISIBLE`：

```ts
import { recentUpdateOf, OPP_COLUMNS, OPP_FIELDS, L4_OPTIONS, DEFAULT_VISIBLE } from './opportunityColumns'
```

```ts
  it('OPP_FIELDS 23 个可编辑字段', () => {
    expect(OPP_FIELDS).toHaveLength(23)
    expect(OPP_FIELDS).toContain('l4'); expect(OPP_FIELDS).toContain('opportunityLevel')
    expect(OPP_FIELDS).not.toContain('firstReg')
  })
  it('OPP_COLUMNS 含 26 列', () => { expect(OPP_COLUMNS).toHaveLength(26) })
  it('商机级别列: select P1-P4, 位于 amountWan 与 expectedDate 之间, 默认显示', () => {
    const keys = OPP_COLUMNS.map((c) => c.key)
    const ai = keys.indexOf('amountWan'), oi = keys.indexOf('opportunityLevel'), ei = keys.indexOf('expectedDate')
    expect(oi).toBe(ai + 1)
    expect(ei).toBe(oi + 1)
    const col = OPP_COLUMNS.find((c) => c.key === 'opportunityLevel')!
    expect(col.type).toBe('select')
    expect(col.options).toEqual(['P1', 'P2', 'P3', 'P4'])
    expect(DEFAULT_VISIBLE).toContain('opportunityLevel')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/opportunityColumns.test.ts`
Expected: FAIL（长度 25/22；找不到 opportunityLevel 列）

- [ ] **Step 3: 改实现** — `opportunityColumns.ts`

在 `BID_OPTIONS` 行下加常量：

```ts
const BID_OPTIONS = ['已中标','未中标','待定']
const OPPORTUNITY_LEVEL_OPTIONS = ['P1', 'P2', 'P3', 'P4']
```

在 `amountWan` 行与 `expectedDate` 行之间插入新列：

```ts
  { key: 'amountWan', label: '预估金额(万元)', type: 'number', width: 120, sortable: true },
  { key: 'opportunityLevel', label: '商机级别', type: 'select', options: OPPORTUNITY_LEVEL_OPTIONS, width: 100, filterable: true },
  { key: 'expectedDate', label: '预估落单时间', type: 'date', width: 130, sortable: true },
```

`DEFAULT_VISIBLE` 在 `amountWan` 与 `expectedDate` 之间插入 `opportunityLevel`：

```ts
export const DEFAULT_VISIBLE = ['l4','salesOwner','customer','top1000','status','forecast','name','amountWan','opportunityLevel','expectedDate','bidStatus','lastUpdate','recentUpdate']
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/opportunityColumns.test.ts src/views/OpportunitiesView.test.ts`
Expected: PASS（OpportunitiesView 既有断言不受影响）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/opportunityColumns.ts frontend/src/lib/opportunityColumns.test.ts
git commit -m "feat(opp): 商机清单新增「商机级别」P1-P4 下拉列(amountWan 后/默认显示)"
```

---

### Task 3: 菜单移入「项目」分组 + 改名「商机清单」

**Files:**
- Modify: `frontend/src/nav.ts:21-26`(PROJECT_LINKS), `frontend/src/nav.ts:39-43`(KEY_FOLLOWUP_LINKS)
- Modify: `frontend/src/router/index.ts:62`(meta.title)
- Modify: `frontend/src/views/OpportunitiesView.vue:174,189`(H2 + 导出文件名)
- Test: `frontend/src/lib/pageAccess.test.ts`, `frontend/src/layout/AppSidebar.test.ts`

**Interfaces:**
- Produces: `/opportunities` 链接以 label「商机清单」位于 PROJECT_LINKS（已关闭项目后、项目动态前）；KEY_FOLLOWUP_LINKS 暂为 `[projects-key, temp-followup]`（Task 10 再加新页）。
- Consumes: 既有 `activeSectionKey` 默认 fallthrough 返回 `'project'`，`/opportunities` 自然归「项目」，**AppSidebar.vue 无需改**。

- [ ] **Step 1: 改实现** — `nav.ts`

PROJECT_LINKS 插入「商机清单」：

```ts
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目总览', to: '/', key: 'overview' },
  { label: '在建项目', to: '/projects', key: 'projects' },
  { label: '已关闭项目', to: '/projects/closed', key: 'projects-closed' },
  { label: '商机清单', to: '/opportunities', key: 'opportunities-progress' },
  { label: '项目动态', to: '/activity', key: 'activity' },
]
```

KEY_FOLLOWUP_LINKS 移除「重点商机进展」一行：

```ts
export const KEY_FOLLOWUP_LINKS: NavLink[] = [
  { label: '重点项目进展', to: '/projects/key', key: 'projects-key' },
  { label: '临时重点跟进', to: '/projects/temp', key: 'temp-followup' },
]
```

- [ ] **Step 2: 改实现** — `router/index.ts:62` 标题改名

```ts
    { path: '/opportunities', name: 'opportunities', component: OpportunitiesView, meta: { title: '商机清单', hideFilter: true, pageKey: 'opportunities-progress' } },
```

- [ ] **Step 3: 改实现** — `OpportunitiesView.vue` H2 与导出文件名改名

`:189` H2：

```vue
    <h2 class="opp-title">商机清单</h2>
```

`:174` 导出文件名：

```ts
    '商机清单_' + filtered.value.length + '条.xlsx',
```

- [ ] **Step 4: 改测试为新期望**

`pageAccess.test.ts` 的 `nav links` 用例改为反映新顺序（opportunities-progress 已移出 KEY_FOLLOWUP_LINKS）：

```ts
describe('nav links', () => {
  it('KEY_FOLLOWUP_LINKS = [重点项目进展, 临时重点跟进]', () => {
    const keys = KEY_FOLLOWUP_LINKS.map((l) => l.key)
    expect(keys).toEqual(['projects-key', 'temp-followup'])
    const temp = KEY_FOLLOWUP_LINKS.find((l) => l.key === 'temp-followup')!
    expect(temp.to).toBe('/projects/temp')
    expect(temp.label).toBe('临时重点跟进')
  })
  it('商机清单(opportunities-progress)移入 PROJECT_LINKS,在已关闭项目后、项目动态前', () => {
    const keys = PROJECT_LINKS.map((l) => l.key)
    expect(keys.indexOf('opportunities-progress')).toBe(keys.indexOf('projects-closed') + 1)
    expect(keys.indexOf('activity')).toBe(keys.indexOf('opportunities-progress') + 1)
    const opp = PROJECT_LINKS.find((l) => l.key === 'opportunities-progress')!
    expect(opp.label).toBe('商机清单')
  })
})
```

`pageAccess.test.ts` 顶部 import 增加 `PROJECT_LINKS`：

```ts
import { KEY_FOLLOWUP_LINKS, PROJECT_LINKS } from '@/nav'
```

`AppSidebar.test.ts:74` 把 `重点商机进展` 断言改为 `商机清单`，并把 `.nav-sub` 计数 15→14（商机从二级 .nav-sub 移到「项目」组的一级 .nav-item）：

```ts
    expect(text).toContain('商机清单')        // 已移入「项目」组
```
```ts
    // 项目分析(6) + 重点跟进(2) + 回款子域(6) 均为 .nav-sub 二级呈现 = 14
    expect(wrapper.findAll('.nav-sub').length).toBe(14)
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/pageAccess.test.ts src/layout/AppSidebar.test.ts src/views/OpportunitiesView.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add frontend/src/nav.ts frontend/src/router/index.ts frontend/src/views/OpportunitiesView.vue frontend/src/lib/pageAccess.test.ts frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(opp): /opportunities 移入「项目」分组并改名「商机清单」(已关闭后/动态前)"
```

---

## Part 2 — 新页面「重点商机跟进」/opportunities/key

### Task 4: 抽出共享范围运算符 scopeOps.ts，重构 tempScope.ts

**Files:**
- Create: `frontend/src/lib/scopeOps.ts`
- Create: `frontend/src/lib/scopeOps.test.ts`
- Modify: `frontend/src/lib/tempScope.ts`(改引用共享运算符；`ScopeCondition.group` 改可选；导出 `FieldLike`)
- Test: 既有 `frontend/src/lib/tempScope.test.ts` 必须保持全绿(回归)

**Interfaces:**
- Produces: `scopeOps.ts` 导出 `type Combinator/ScopeOp/FieldKind/LeafCondition`、`opsForKind(kind)`、`OPS_BY_KIND`、`OP_LABEL`、`leafMatch(raw, c)`。`tempScope.ts` 续导出 `Combinator/ScopeOp/opsForKind/FIELD_CATALOG/projectMatches/ScopeFilter/ScopeGroup/ScopeCondition/FieldDef/ScopeProjectInput`，新增导出 `FieldLike`，且 `ScopeCondition.group?` 可选。
- Consumes: `tempScope` 既有消费方（`ScopeBuilder.vue`、`tempFollowupApi.ts`、`stores/tempFollowup.ts`、`tempScope.test.ts`）import 路径不变。

- [ ] **Step 1: 新建 `scopeOps.ts`**（把 tempScope 的纯运算符整体搬来）

```ts
// 范围筛选的纯运算符与类型(temp/opportunity 两页共享)。
export type Combinator = 'AND' | 'OR'
export type ScopeOp = 'in' | 'notIn' | 'between' | 'notBetween' | 'contains' | 'notContains'
export type FieldKind = 'enum' | 'number' | 'date' | 'text'

/** leafMatch 只读 op/values/min/max——temp 与 opportunity 的条件对象都满足。 */
export interface LeafCondition { op: ScopeOp; values?: string[]; min?: number | string | null; max?: number | string | null }

export function opsForKind(kind: FieldKind): ScopeOp[] {
  if (kind === 'enum') return ['in', 'notIn']
  if (kind === 'text') return ['contains', 'notContains']
  return ['between', 'notBetween'] // number / date
}

export const OPS_BY_KIND: Record<string, ScopeOp[]> = {
  enum: ['in', 'notIn'],
  text: ['contains', 'notContains'],
  number: ['between', 'notBetween'],
  date: ['between', 'notBetween'],
}

export const OP_LABEL: Record<string, string> = {
  in: '属于', notIn: '不属于', between: '区间内', notBetween: '区间外', contains: '包含', notContains: '不包含',
}

function isDateLike(x: any): boolean {
  return typeof x === 'string' && /\d{4}-\d{2}-\d{2}/.test(x)
}

function inRange(raw: any, min: any, max: any): boolean {
  const hasMin = min != null && min !== ''
  const hasMax = max != null && max !== ''
  if (!hasMin && !hasMax) return true
  if (isDateLike(min) || isDateLike(max)) {
    const v = String(raw ?? '').slice(0, 10)
    if (v === '') return false
    if (hasMin && v < String(min).slice(0, 10)) return false
    if (hasMax && v > String(max).slice(0, 10)) return false
    return true
  }
  if (raw == null || raw === '') return false
  const n = Number(raw)
  if (Number.isNaN(n)) return false
  if (hasMin && n < Number(min)) return false
  if (hasMax && n > Number(max)) return false
  return true
}

export function leafMatch(raw: any, c: LeafCondition): boolean {
  switch (c.op) {
    case 'in':
    case 'notIn': {
      const set = new Set(c.values ?? [])
      const hit = Array.isArray(raw) ? raw.some((v) => set.has(String(v))) : set.has(String(raw ?? ''))
      return c.op === 'in' ? hit : !hit
    }
    case 'between':
    case 'notBetween': {
      const within = inRange(raw, c.min, c.max)
      return c.op === 'between' ? within : !within
    }
    case 'contains':
    case 'notContains': {
      const term = String((c.values && c.values[0]) ?? '')
      const hit = term !== '' && String(raw ?? '').includes(term)
      return c.op === 'contains' ? hit : !hit
    }
  }
  return false
}
```

- [ ] **Step 2: 新建 `scopeOps.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { leafMatch, opsForKind, OPS_BY_KIND, OP_LABEL } from './scopeOps'

describe('opsForKind', () => {
  it('按 kind 给运算符', () => {
    expect(opsForKind('enum')).toEqual(['in', 'notIn'])
    expect(opsForKind('text')).toEqual(['contains', 'notContains'])
    expect(opsForKind('number')).toEqual(['between', 'notBetween'])
    expect(opsForKind('date')).toEqual(['between', 'notBetween'])
    expect(OPS_BY_KIND['date']).toEqual(['between', 'notBetween'])
    expect(OP_LABEL['notIn']).toBe('不属于')
  })
})

describe('leafMatch', () => {
  it('in / notIn(标量与数组)', () => {
    expect(leafMatch('A', { op: 'in', values: ['A', 'B'] })).toBe(true)
    expect(leafMatch('C', { op: 'in', values: ['A'] })).toBe(false)
    expect(leafMatch('C', { op: 'notIn', values: ['A'] })).toBe(true)
    expect(leafMatch(['x', 'y'], { op: 'in', values: ['y'] })).toBe(true)
  })
  it('number between 含端点 / 空值不命中', () => {
    expect(leafMatch(100, { op: 'between', min: 100, max: 500 })).toBe(true)
    expect(leafMatch(80, { op: 'between', min: 100, max: 500 })).toBe(false)
    expect(leafMatch(null, { op: 'between', min: 100, max: 500 })).toBe(false)
  })
  it('date between 取前10位字典序', () => {
    expect(leafMatch('2026-06-30', { op: 'between', min: '2026-01-01', max: '2026-12-31' })).toBe(true)
    expect(leafMatch('2027-01-01', { op: 'between', min: '2026-01-01', max: '2026-12-31' })).toBe(false)
  })
  it('contains / notContains', () => {
    expect(leafMatch('初验收节点', { op: 'contains', values: ['验收'] })).toBe(true)
    expect(leafMatch('启动', { op: 'contains', values: ['验收'] })).toBe(false)
    expect(leafMatch('启动', { op: 'notContains', values: ['验收'] })).toBe(true)
  })
})
```

- [ ] **Step 3: 重构 `tempScope.ts`** 引用共享模块（删本地运算符，改 import；`group` 可选；导出 `FieldLike`）

文件顶部改为：

```ts
// 临时重点跟进范围筛选:条件树类型 + 字段目录 + 匹配(前端算,数据已按 L4 裁剪)。
import { leafMatch, opsForKind, type Combinator, type ScopeOp, type FieldKind } from './scopeOps'
export type { Combinator, ScopeOp } from './scopeOps'
export { opsForKind } from './scopeOps'

export interface ScopeCondition {
  group?: 'project' | 'paymentNode' | 'milestone'
  field: string
  op: ScopeOp
  values?: string[]
  min?: number | string | null
  max?: number | string | null
}
export interface ScopeGroup { combinator: Combinator; conditions: ScopeCondition[] }
export interface ScopeFilter { combinator: Combinator; groups: ScopeGroup[] }

export interface FieldDef {
  group: 'project' | 'paymentNode' | 'milestone'
  key: string
  label: string
  kind: FieldKind
}

/** ScopeBuilder 的 catalog 通用形状:temp 的 FieldDef 与 opportunity 的 {key,label,kind} 都满足。 */
export interface FieldLike { key: string; label: string; kind: FieldKind; group?: FieldDef['group'] }

export interface ScopeProjectInput {
  id: string
  proj: Record<string, any>
  nodes: Record<string, any>[]
  milestones: Record<string, any>[]
}
```

删除文件中**本地定义**的 `opsForKind`(已改为 re-export)、`isDateLike`、`inRange`、`leafMatch` 四个函数（它们已搬到 scopeOps）。保留 `FIELD_CATALOG`、`fieldsOf`，并把 `evalCond` 改用 import 的 `leafMatch`：

```ts
function evalCond(input: ScopeProjectInput, c: ScopeCondition): boolean {
  if (c.group === 'project') return leafMatch(input.proj[c.field], c)
  const rows = c.group === 'paymentNode' ? input.nodes : input.milestones
  return (rows ?? []).some((r) => leafMatch(r[c.field], c))
}

function evalGroup(input: ScopeProjectInput, g: ScopeGroup): boolean {
  if (!g.conditions || !g.conditions.length) return false
  const rs = g.conditions.map((c) => evalCond(input, c))
  return g.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}

export function projectMatches(input: ScopeProjectInput, scope: ScopeFilter): boolean {
  if (!scope || !Array.isArray(scope.groups) || !scope.groups.length) return false
  const rs = scope.groups.map((g) => evalGroup(input, g))
  return scope.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}
```

（`FIELD_CATALOG` 数组与 `fieldsOf` 原样保留，`FieldDef['kind']` 现来自 `FieldKind`，值不变。）

- [ ] **Step 4: 跑测试确认通过（回归 + 新增）**

Run: `cd frontend && npx vitest run src/lib/scopeOps.test.ts src/lib/tempScope.test.ts src/components/ScopeBuilder*.test.ts && npx vitest run src/views/TempFollowupView.test.ts`
Expected: PASS（tempScope.test.ts 一字未改仍全绿 = 行为等价）

- [ ] **Step 5: typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 无错误（`ScopeBuilder.vue` 仍从 `tempScope` 取 `ScopeOp` 等，re-export 保证可用）

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/scopeOps.ts frontend/src/lib/scopeOps.test.ts frontend/src/lib/tempScope.ts
git commit -m "refactor(scope): 抽出共享运算符 scopeOps + tempScope 改引用(group 可选,行为等价)"
```

---

### Task 5: 商机单表范围引擎 opportunityScope.ts

**Files:**
- Create: `frontend/src/lib/opportunityScope.ts`
- Create: `frontend/src/lib/opportunityScope.test.ts`

**Interfaces:**
- Consumes: `OPP_COLUMNS`(Task 2 后含 opportunityLevel)、`scopeOps.leafMatch`、`tempScope` 的 `ScopeFilter/ScopeGroup/FieldLike`。
- Produces: `OPP_SCOPE_CATALOG: FieldLike[]`(从 OPP_COLUMNS 派生)、`opportunityMatches(row, scope)`、`DEFAULT_OPP_SCOPE: ScopeFilter`。

- [ ] **Step 1: 写失败测试** — `opportunityScope.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { OPP_SCOPE_CATALOG, opportunityMatches, DEFAULT_OPP_SCOPE } from './opportunityScope'
import type { ScopeFilter } from './tempScope'

const row = (o: Record<string, any>) => ({
  top1000: '非TOP1000', earlyIntervene: '否', keyOpp: '否', status: '意向沟通',
  amountWan: 100, ...o,
})

describe('OPP_SCOPE_CATALOG', () => {
  it('从 OPP_COLUMNS 派生,含 opportunityLevel(enum),金额为 number', () => {
    const m = new Map(OPP_SCOPE_CATALOG.map((f) => [f.key, f.kind]))
    expect(m.get('opportunityLevel')).toBe('enum')
    expect(m.get('amountWan')).toBe('number')
    expect(m.get('expectedDate')).toBe('date')
    expect(m.get('customer')).toBe('text')
    expect(OPP_SCOPE_CATALOG.length).toBe(26)
  })
})

describe('DEFAULT_OPP_SCOPE', () => {
  it('= TOP1000 & 提前介入 & 重点商机 & 状态非赢单', () => {
    const conds = DEFAULT_OPP_SCOPE.groups[0].conditions
    expect(DEFAULT_OPP_SCOPE.combinator).toBe('AND')
    expect(conds).toHaveLength(4)
    expect(conds.map((c) => [c.field, c.op])).toEqual([
      ['top1000', 'in'], ['earlyIntervene', 'in'], ['keyOpp', 'in'], ['status', 'notIn'],
    ])
  })
  it('默认范围只命中四条件齐备且状态非赢单的商机', () => {
    const hit = row({ top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '招投标' })
    const missEarly = row({ top1000: 'TOP1000', earlyIntervene: '否', keyOpp: '是', status: '招投标' })
    const won = row({ top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '赢单' })
    expect(opportunityMatches(hit, DEFAULT_OPP_SCOPE)).toBe(true)
    expect(opportunityMatches(missEarly, DEFAULT_OPP_SCOPE)).toBe(false)
    expect(opportunityMatches(won, DEFAULT_OPP_SCOPE)).toBe(false)
  })
})

describe('opportunityMatches', () => {
  const scope = (s: Partial<ScopeFilter>): ScopeFilter => ({ combinator: 'AND', groups: [], ...s })
  it('空范围 → false', () => {
    expect(opportunityMatches(row({}), scope({}))).toBe(false)
  })
  it('number between 与 两级 OR', () => {
    const f: ScopeFilter = { combinator: 'OR', groups: [
      { combinator: 'AND', conditions: [{ field: 'amountWan', op: 'between', min: 150, max: 300 }] },
      { combinator: 'AND', conditions: [{ field: 'opportunityLevel', op: 'in', values: ['P1'] }] },
    ] }
    expect(opportunityMatches(row({ amountWan: 200 }), f)).toBe(true)
    expect(opportunityMatches(row({ amountWan: 100, opportunityLevel: 'P1' }), f)).toBe(true)
    expect(opportunityMatches(row({ amountWan: 100, opportunityLevel: 'P3' }), f)).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/opportunityScope.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现** — `opportunityScope.ts`

```ts
// 重点商机跟进范围筛选:商机单表,条件直接作用于商机行字段(无子表 group)。
import { OPP_COLUMNS, type OppColumn } from './opportunityColumns'
import { leafMatch, type FieldKind } from './scopeOps'
import type { ScopeFilter, ScopeGroup, FieldLike } from './tempScope'

function kindOfType(t: OppColumn['type']): FieldKind {
  if (t === 'number') return 'number'
  if (t === 'date' || t === 'auto') return 'date'
  if (t === 'select' || t === 'derived') return 'enum'
  return 'text'
}

/** 字段目录从 OPP_COLUMNS 派生(单一来源):每列 → {key,label,kind}。 */
export const OPP_SCOPE_CATALOG: FieldLike[] = OPP_COLUMNS.map((c) => ({
  key: c.key, label: c.label, kind: kindOfType(c.type),
}))

function evalGroup(row: Record<string, any>, g: ScopeGroup): boolean {
  if (!g.conditions || !g.conditions.length) return false
  const rs = g.conditions.map((c) => leafMatch(row[c.field], c))
  return g.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}

/** 空范围(无 groups 或全空组)→ false。两级 AND/OR,叶子直接读 row[field]。 */
export function opportunityMatches(row: Record<string, any>, scope: ScopeFilter): boolean {
  if (!scope || !Array.isArray(scope.groups) || !scope.groups.length) return false
  const rs = scope.groups.map((g) => evalGroup(row, g))
  return scope.combinator === 'OR' ? rs.some(Boolean) : rs.every(Boolean)
}

/** 默认范围:TOP1000 & 提前介入 & 重点商机 & 状态非赢单。 */
export const DEFAULT_OPP_SCOPE: ScopeFilter = {
  combinator: 'AND',
  groups: [{ combinator: 'AND', conditions: [
    { field: 'top1000', op: 'in', values: ['TOP1000'] },
    { field: 'earlyIntervene', op: 'in', values: ['是'] },
    { field: 'keyOpp', op: 'in', values: ['是'] },
    { field: 'status', op: 'notIn', values: ['赢单'] },
  ] }],
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/opportunityScope.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/opportunityScope.ts frontend/src/lib/opportunityScope.test.ts
git commit -m "feat(opp): 商机单表范围引擎 opportunityScope(目录派生自 OPP_COLUMNS + 默认条件)"
```

---

### Task 6: 后端跟进域 opportunity_followup.py + server 端点

**Files:**
- Create: `opportunity_followup.py`
- Create: `tests/test_opportunity_followup.py`
- Create: `tests/test_server_opportunity_followup.py`
- Modify: `server.py`(import；`_SUPER_ONLY_PATHS`；load/save；4 个 handler；do_GET/do_POST 分派)

**Interfaces:**
- Produces 端点：`GET /api/opportunity-followup`(任意登录) → `{success,scope,current,archives}`；`POST /api/opportunity-followup/scope`(超管) `{combinator,groups}`；`POST /api/opportunity-followup/update`(任意登录) `{oppId,field,content}`；`POST /api/opportunity-followup/archive`(超管) `{rows}`。
- Consumes：既有 `_session_account_rec`、`auth.validate_session`、`_read_json_body`、`_json_response`、`_send_json`、`_error_payload`、`_temp` 同款 datetime 盖章。

- [ ] **Step 1: 写失败测试（纯模块）** — `tests/test_opportunity_followup.py`

```python
import pytest
import opportunity_followup as of


def test_new_store_seeds_default_scope():
    s = of.new_store()
    assert s["version"] == 1 and s["current"] == {} and s["archives"] == []
    conds = s["scope"]["groups"][0]["conditions"]
    assert [(c["field"], c["op"]) for c in conds] == [
        ("top1000", "in"), ("earlyIntervene", "in"), ("keyOpp", "in"), ("status", "notIn")]
    assert conds[0]["values"] == ["TOP1000"] and conds[3]["values"] == ["赢单"]


def test_normalize_scope_single_table_no_group_and_defaults():
    raw = {"combinator": "XOR", "groups": [
        {"combinator": "OR", "conditions": [
            {"group": "ignored", "field": "top1000", "op": "in", "values": ["TOP1000"]},
            {"field": 123, "op": "in"},          # field 非字符串 → 丢
        ]},
    ]}
    out = of.normalize_scope(raw)
    assert out["combinator"] == "AND"
    conds = out["groups"][0]["conditions"]
    assert len(conds) == 1 and conds[0]["field"] == "top1000"
    assert "group" not in conds[0]                # 单表:不保留 group 键


def test_normalize_scope_garbage_returns_default():
    assert of.normalize_scope(None) == {"combinator": "AND", "groups": []}
    assert of.normalize_scope({"groups": "nope"}) == {"combinator": "AND", "groups": []}


def test_apply_update_stamps_and_invalid_field_raises():
    s = of.new_store()
    rec = of.apply_update(s, "opp-1", "weekProgress", "本周X", "wangxutong", "2026-06-25 10:00:00")
    assert rec["weekProgress"] == "本周X"
    assert rec["weekProgressEditTime"] == "2026-06-25 10:00:00"
    assert rec["weekProgressEditBy"] == "wangxutong"
    assert s["current"]["opp-1"]["weekProgress"] == "本周X"
    with pytest.raises(ValueError):
        of.apply_update(s, "opp-1", "badField", "x", "u", "t")


def test_apply_archive_appends_and_clears():
    s = of.new_store()
    of.apply_update(s, "opp-1", "weekProgress", "A", "u1", "t1")
    rows = [{"id": "opp-1", "weekProgress": "A"}]
    of.apply_archive(s, rows, "2026-06-25 18:00:00")
    assert len(s["archives"]) == 1 and s["archives"][0]["archiveTime"] == "2026-06-25 18:00:00"
    assert s["archives"][0]["rows"] == rows and s["current"] == {}
```

- [ ] **Step 2: 跑确认失败**

Run: `python -m pytest tests/test_opportunity_followup.py -q`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写实现** — `opportunity_followup.py`

```python
"""重点商机跟进(/opportunities/key)领域纯函数:范围条件规整 + 进展编辑/归档。
单表(商机)范围,条件无子表 group;匹配在前端做(数据已按 L4 裁剪),本模块只规整与存储进展。"""
from __future__ import annotations
import json as _json
from typing import Any, Dict, List

PROGRESS_FIELDS = ('weekProgress', 'nextPlan')
_COMBINATORS = ('AND', 'OR')
_OPS = ('in', 'notIn', 'between', 'notBetween', 'contains', 'notContains')

# 默认范围:TOP1000 & 提前介入 & 重点商机 & 状态非赢单(单组四条 AND)
DEFAULT_SCOPE: Dict[str, Any] = {
    "combinator": "AND",
    "groups": [{"combinator": "AND", "conditions": [
        {"field": "top1000", "op": "in", "values": ["TOP1000"]},
        {"field": "earlyIntervene", "op": "in", "values": ["是"]},
        {"field": "keyOpp", "op": "in", "values": ["是"]},
        {"field": "status", "op": "notIn", "values": ["赢单"]},
    ]}],
}


def new_store() -> Dict[str, Any]:
    return {"version": 1, "scope": _json.loads(_json.dumps(DEFAULT_SCOPE)),
            "current": {}, "archives": []}


def _norm_combinator(v: Any) -> str:
    return v if v in _COMBINATORS else 'AND'


def _norm_condition(c: Any) -> Dict[str, Any] | None:
    if not isinstance(c, dict):
        return None
    field = c.get('field')
    if not isinstance(field, str) or not field:
        return None
    op = c.get('op') if c.get('op') in _OPS else 'in'
    out: Dict[str, Any] = {"field": field, "op": op}
    if isinstance(c.get('values'), list):
        out['values'] = [str(x) for x in c['values']]
    if c.get('min') is not None:
        out['min'] = c['min']
    if c.get('max') is not None:
        out['max'] = c['max']
    return out


def normalize_scope(scope: Any) -> Dict[str, Any]:
    """宽容规整;结构非法 → 空范围 {combinator:'AND', groups:[]}。"""
    default = {"combinator": "AND", "groups": []}
    if not isinstance(scope, dict):
        return default
    groups_raw = scope.get('groups')
    if not isinstance(groups_raw, list):
        return default
    groups: List[Dict[str, Any]] = []
    for g in groups_raw:
        if not isinstance(g, dict):
            continue
        conds_raw = g.get('conditions')
        conds = [nc for nc in (_norm_condition(c) for c in conds_raw) if nc] if isinstance(conds_raw, list) else []
        groups.append({"combinator": _norm_combinator(g.get('combinator')), "conditions": conds})
    return {"combinator": _norm_combinator(scope.get('combinator')), "groups": groups}


def apply_update(store, opp_id, field, content, account, now) -> Dict[str, Any]:
    if field not in PROGRESS_FIELDS:
        raise ValueError("invalid field: %s" % field)
    rec = store.setdefault('current', {}).setdefault(opp_id, {})
    rec[field] = content
    rec[field + 'EditTime'] = now
    rec[field + 'EditBy'] = account
    return rec


def apply_archive(store, rows, now) -> None:
    store.setdefault('archives', []).append({"archiveTime": now, "rows": rows})
    store['current'] = {}
```

- [ ] **Step 4: 跑纯模块测试确认通过**

Run: `python -m pytest tests/test_opportunity_followup.py -q`
Expected: PASS

- [ ] **Step 5: server.py 接线**

(a) import（在 `import temp_followup as _temp` 行附近，约 server.py:34）：

```python
import opportunity_followup as _oppf
```

(b) `_SUPER_ONLY_PATHS`（在 `'/api/temp-followup/scope', '/api/temp-followup/archive',` 行后加）：

```python
    '/api/opportunity-followup/scope', '/api/opportunity-followup/archive',
```

(c) load/save（在 `_save_temp_followup` 之后、`# ── 商机管理(V2.0.0) ──` 之前插入）：

```python
# ── 重点商机跟进(/opportunities/key;V2.2.0):scope 条件 + current 进展 + archives 快照 ──
OPP_FOLLOWUP_FILE = os.path.join(BASE_DIR, 'data', 'opportunity_followup.json')
_opp_followup_lock = threading.Lock()


def _load_opportunity_followup():
    """加载商机跟进 store;缺文件/损坏 → 默认(new_store,含默认范围)。不抛。"""
    if os.path.exists(OPP_FOLLOWUP_FILE):
        try:
            with open(OPP_FOLLOWUP_FILE, 'r', encoding='utf-8') as f:
                store = json.load(f)
            if isinstance(store, dict):
                store.setdefault('version', 1)
                store['scope'] = _oppf.normalize_scope(store.get('scope'))
                store.setdefault('current', {})
                store.setdefault('archives', [])
                return store
        except Exception:
            pass
    return _oppf.new_store()


def _save_opportunity_followup(store):
    with _opp_followup_lock:
        os.makedirs(os.path.dirname(OPP_FOLLOWUP_FILE), exist_ok=True)
        tmp = OPP_FOLLOWUP_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(store, f, ensure_ascii=False, indent=2)
        os.replace(tmp, OPP_FOLLOWUP_FILE)
```

(d) 四个 handler（紧跟 `handle_temp_followup_archive` 之后插入）：

```python
    def handle_opportunity_followup_get(self):
        """GET /api/opportunity-followup — {scope, current, archives}。任意登录用户。"""
        account, rec = self._session_account_rec()
        if not rec:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        try:
            store = _load_opportunity_followup()
            self._json_response({"success": True, "scope": store.get("scope"),
                                 "current": store.get("current", {}), "archives": store.get("archives", [])})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"读取商机跟进失败: {e}"))

    def handle_opportunity_followup_scope(self):
        """POST /api/opportunity-followup/scope {combinator, groups} — 保存范围。超管专属(_authz_gate 拦)。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        try:
            store = _load_opportunity_followup()
            store['scope'] = _oppf.normalize_scope(data)
            _save_opportunity_followup(store)
            self._json_response({"success": True, "scope": store['scope']})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"保存范围失败: {e}"))

    def handle_opportunity_followup_update(self):
        """POST /api/opportunity-followup/update {oppId, field, content} — 编辑单格进展。任意登录用户。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        oid = str(data.get('oppId') or '').strip()
        field = data.get('field')
        if not oid or field not in _oppf.PROGRESS_FIELDS:
            self._send_json(400, _error_payload(ERR_VALIDATION, "oppId 必填、field 须为 weekProgress/nextPlan"))
            return
        account = auth.validate_session(auth.parse_cookie_token(self.headers.get('Cookie')))
        if not account:
            self._send_json(401, _error_payload(ERR_AUTH, "未登录或会话已过期"))
            return
        try:
            store = _load_opportunity_followup()
            rec = _oppf.apply_update(store, oid, field, str(data.get('content') or ''),
                                     account, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            _save_opportunity_followup(store)
            self._json_response({"success": True, "record": rec})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"保存进展失败: {e}"))

    def handle_opportunity_followup_archive(self):
        """POST /api/opportunity-followup/archive {rows} — 冻结当前为快照并清空 current。超管专属。"""
        data = self._read_json_body()
        if data is None:
            self._send_json(400, _error_payload(ERR_PARSE, "请求体解析失败"))
            return
        rows = data.get('rows')
        if not isinstance(rows, list):
            self._send_json(400, _error_payload(ERR_VALIDATION, "rows 须为数组"))
            return
        try:
            store = _load_opportunity_followup()
            _oppf.apply_archive(store, rows, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
            _save_opportunity_followup(store)
            self._json_response({"success": True, "archives": store.get("archives", [])})
        except Exception as e:
            self._json_response(_error_payload(ERR_INTERNAL, f"归档失败: {e}"))
```

(e) do_GET 分派（在 `elif parsed.path == '/api/temp-followup':` 块后加）：

```python
        elif parsed.path == '/api/opportunity-followup':
            self.handle_opportunity_followup_get()
```

(f) do_POST 分派（在 `elif parsed.path == '/api/temp-followup/archive':` 块后加）：

```python
        elif parsed.path == '/api/opportunity-followup/scope':
            self.handle_opportunity_followup_scope()
        elif parsed.path == '/api/opportunity-followup/update':
            self.handle_opportunity_followup_update()
        elif parsed.path == '/api/opportunity-followup/archive':
            self.handle_opportunity_followup_archive()
```

- [ ] **Step 6: 写 server 接线测试** — `tests/test_server_opportunity_followup.py`

```python
import server


def test_load_missing_returns_default_with_default_scope(tmp_path, monkeypatch):
    monkeypatch.setattr(server, "OPP_FOLLOWUP_FILE", str(tmp_path / "none.json"))
    s = server._load_opportunity_followup()
    assert s["current"] == {} and s["archives"] == []
    assert len(s["scope"]["groups"]) == 1
    assert len(s["scope"]["groups"][0]["conditions"]) == 4


def test_load_corrupt_returns_default(tmp_path, monkeypatch):
    f = tmp_path / "opportunity_followup.json"
    f.write_text("{bad", encoding="utf-8")
    monkeypatch.setattr(server, "OPP_FOLLOWUP_FILE", str(f))
    assert len(server._load_opportunity_followup()["scope"]["groups"]) == 1


def test_save_load_roundtrip(tmp_path, monkeypatch):
    f = tmp_path / "opportunity_followup.json"
    monkeypatch.setattr(server, "OPP_FOLLOWUP_FILE", str(f))
    store = server._load_opportunity_followup()
    server._oppf.apply_update(store, "opp-1", "weekProgress", "x", "admin", "t")
    server._save_opportunity_followup(store)
    assert server._load_opportunity_followup()["current"]["opp-1"]["weekProgress"] == "x"


def test_super_only_paths():
    assert '/api/opportunity-followup/scope' in server._SUPER_ONLY_PATHS
    assert '/api/opportunity-followup/archive' in server._SUPER_ONLY_PATHS
    assert '/api/opportunity-followup' not in server._SUPER_ONLY_PATHS         # GET 任意登录
    assert '/api/opportunity-followup/update' not in server._SUPER_ONLY_PATHS  # 进展编辑任意登录
```

- [ ] **Step 7: 跑后端测试 + 语法编译确认通过**

Run: `python -m pytest tests/test_opportunity_followup.py tests/test_server_opportunity_followup.py -q && python -m py_compile server.py opportunity_followup.py`
Expected: PASS / 无语法错误

- [ ] **Step 8: 提交**

```bash
git add opportunity_followup.py server.py tests/test_opportunity_followup.py tests/test_server_opportunity_followup.py
git commit -m "feat(opp): 后端重点商机跟进域+4端点(scope/archive 超管;默认范围 seed)"
```

---

### Task 7: 跟进 store + API + ProgressEditModal 扩展 + 登出复位

**Files:**
- Create: `frontend/src/lib/opportunityFollowupApi.ts`
- Create: `frontend/src/stores/opportunityFollowup.ts`
- Create: `frontend/src/stores/opportunityFollowup.test.ts`
- Modify: `frontend/src/components/ProgressEditModal.vue`(加 `store='oppFollowup'`)
- Modify: `frontend/src/stores/auth.ts`(两处 reset 块加新 store 复位)

**Interfaces:**
- Produces: `useOpportunityFollowupStore`(state `scope/current/archives/loaded`；action `load/saveScope/update(oppId,field,content)/archive(rows)/reset`)；`opportunityFollowupApi`。ProgressEditModal `store?: 'key' | 'temp' | 'oppFollowup'`。
- Consumes: Task 6 端点契约；`ScopeFilter`、`ProgressRecord`、`Archive` 类型。

- [ ] **Step 1: 写 API 客户端** — `opportunityFollowupApi.ts`

```ts
import { api } from '@/api/client'
import type { ScopeFilter } from './tempScope'
import type { ProgressRecord } from './keyProjects'
import type { Archive } from './projectProgressApi'

export interface OppFollowupGetResp { success?: boolean; scope: ScopeFilter; current: Record<string, ProgressRecord>; archives: Archive[] }
export interface OppFollowupScopeResp { success: boolean; scope: ScopeFilter }
export interface OppFollowupUpdateResp { success: boolean; record: ProgressRecord }
export interface OppFollowupArchiveResp { success: boolean; archives: Archive[] }

export const opportunityFollowupApi = {
  get: () => api.get<OppFollowupGetResp>('/api/opportunity-followup'),
  saveScope: (scope: ScopeFilter) => api.post<OppFollowupScopeResp>('/api/opportunity-followup/scope', scope),
  update: (oppId: string, field: 'weekProgress' | 'nextPlan', content: string) =>
    api.post<OppFollowupUpdateResp>('/api/opportunity-followup/update', { oppId, field, content }),
  archive: (rows: Record<string, unknown>[]) => api.post<OppFollowupArchiveResp>('/api/opportunity-followup/archive', { rows }),
}
```

- [ ] **Step 2: 写 store** — `opportunityFollowup.ts`

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { opportunityFollowupApi } from '@/lib/opportunityFollowupApi'
import type { Archive } from '@/lib/projectProgressApi'
import type { ProgressRecord } from '@/lib/keyProjects'
import type { ScopeFilter } from '@/lib/tempScope'

const EMPTY_SCOPE: ScopeFilter = { combinator: 'AND', groups: [] }

export const useOpportunityFollowupStore = defineStore('opportunityFollowup', () => {
  const scope = ref<ScopeFilter>({ ...EMPTY_SCOPE })
  const current = ref<Record<string, ProgressRecord>>({})
  const archives = ref<Archive[]>([])
  const loaded = ref(false)

  async function load() {
    const r = await opportunityFollowupApi.get()
    scope.value = r.scope ?? { ...EMPTY_SCOPE }
    current.value = r.current ?? {}
    archives.value = r.archives ?? []
    loaded.value = true
  }
  async function saveScope(next: ScopeFilter) {
    const r = await opportunityFollowupApi.saveScope(next)
    scope.value = r.scope ?? next
  }
  async function update(oppId: string, field: 'weekProgress' | 'nextPlan', content: string) {
    const r = await opportunityFollowupApi.update(oppId, field, content)
    current.value = { ...current.value, [oppId]: { ...current.value[oppId], ...r.record } }
  }
  async function archive(rows: Record<string, unknown>[]) {
    const r = await opportunityFollowupApi.archive(rows)
    archives.value = r.archives ?? []
    current.value = {}
  }
  function reset() {
    scope.value = { ...EMPTY_SCOPE }
    current.value = {}
    archives.value = []
    loaded.value = false
  }
  return { scope, current, archives, loaded, load, saveScope, update, archive, reset }
})
```

- [ ] **Step 3: 写 store 失败测试** — `opportunityFollowup.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/lib/opportunityFollowupApi', () => ({
  opportunityFollowupApi: {
    get: vi.fn().mockResolvedValue({
      scope: { combinator: 'AND', groups: [] }, current: { 'opp-1': { weekProgress: 'x' } }, archives: [],
    }),
    saveScope: vi.fn().mockResolvedValue({ scope: { combinator: 'OR', groups: [] } }),
    update: vi.fn().mockResolvedValue({ record: { weekProgress: 'y', weekProgressEditBy: 'admin' } }),
    archive: vi.fn().mockResolvedValue({ archives: [{ archiveTime: 't', rows: [] }] }),
  },
}))

import { useOpportunityFollowupStore } from './opportunityFollowup'

describe('useOpportunityFollowupStore', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('load 填充 scope/current/archives', async () => {
    const s = useOpportunityFollowupStore(); await s.load()
    expect(s.loaded).toBe(true)
    expect(s.current['opp-1'].weekProgress).toBe('x')
  })
  it('saveScope 更新 scope', async () => {
    const s = useOpportunityFollowupStore(); await s.saveScope({ combinator: 'OR', groups: [] })
    expect(s.scope.combinator).toBe('OR')
  })
  it('update 合并单商机记录(键=oppId)', async () => {
    const s = useOpportunityFollowupStore(); await s.update('opp-1', 'weekProgress', 'y')
    expect(s.current['opp-1'].weekProgress).toBe('y')
  })
  it('archive 后清空 current', async () => {
    const s = useOpportunityFollowupStore(); await s.load(); await s.archive([])
    expect(s.archives).toHaveLength(1)
    expect(s.current).toEqual({})
  })
  it('reset 复位', async () => {
    const s = useOpportunityFollowupStore(); await s.load(); s.reset()
    expect(s.loaded).toBe(false)
    expect(s.archives).toEqual([])
  })
})
```

- [ ] **Step 4: 扩展 `ProgressEditModal.vue`** 支持第三种 store

import 与 props/computed 改为：

```ts
import { ref, watch, computed } from 'vue'
import Modal from './Modal.vue'
import { useProjectProgressStore } from '@/stores/projectProgress'
import { useTempFollowupStore } from '@/stores/tempFollowup'
import { useOpportunityFollowupStore } from '@/stores/opportunityFollowup'

const props = defineProps<{
  modelValue: boolean; projectId: string; projectName: string
  field: 'weekProgress' | 'nextPlan'; initial: string
  store?: 'key' | 'temp' | 'oppFollowup'
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const keyStore = useProjectProgressStore()
const tempStore = useTempFollowupStore()
const oppStore = useOpportunityFollowupStore()
const activeStore = computed(() =>
  props.store === 'temp' ? tempStore : props.store === 'oppFollowup' ? oppStore : keyStore)
```

（其余不变；`activeStore.value.update(props.projectId, props.field, text.value)` 对三者签名一致——商机页把 oppId 经 `projectId` 传入。）

- [ ] **Step 5: `auth.ts` 两处 reset 块加新 store 复位**

import 区加：

```ts
import { useOpportunityFollowupStore } from './opportunityFollowup'
```

两处 reset 块（约 auth.ts:21-24 身份切换、:34-37 登出）各加一行：

```ts
      useTempFollowupStore().reset()
      useOpportunityFollowupStore().reset()
```

（两块都加；与既有 `useDataStore().reset()` 等并列，杜绝跨账号复用商机跟进缓存绕过 L4。）

- [ ] **Step 6: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/stores/opportunityFollowup.test.ts && npm run typecheck`
Expected: PASS / 无类型错误

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/opportunityFollowupApi.ts frontend/src/stores/opportunityFollowup.ts frontend/src/stores/opportunityFollowup.test.ts frontend/src/components/ProgressEditModal.vue frontend/src/stores/auth.ts
git commit -m "feat(opp): 商机跟进 store/api + ProgressEditModal 加 oppFollowup + 登出复位"
```

---

### Task 8: 参数化 ScopeBuilder.vue（单表模式，向后兼容）

**Files:**
- Modify: `frontend/src/components/ScopeBuilder.vue`
- Create: `frontend/src/components/ScopeBuilder.test.ts`

**Interfaces:**
- Produces: ScopeBuilder 新增可选 prop：`catalog?: FieldLike[]`(默认 `FIELD_CATALOG`)、`singleTable?: boolean`(默认 false)、`title?: string`(默认临时跟进标题)、`matchFn?: (input, draft)=>boolean`(默认 `projectMatches`)、`countUnit?: string`(默认 `'项目'`)。temp 调用处不传 → 行为不变。
- Consumes: `tempScope` 的 `FIELD_CATALOG/projectMatches/FieldLike/ScopeFilter/ScopeCondition`；`scopeOps` 的 `OP_LABEL`(经 tempScope 不导出,直接从 scopeOps import)。

- [ ] **Step 1: 改 `ScopeBuilder.vue` 脚本**（替换 import 与逻辑块）

```ts
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { FIELD_CATALOG, projectMatches,
  type ScopeFilter, type ScopeCondition, type FieldDef, type FieldLike } from '@/lib/tempScope'
import { OP_LABEL, type ScopeOp } from '@/lib/scopeOps'

const props = defineProps<{
  modelValue: boolean
  inputs: any[]
  initial: ScopeFilter
  catalog?: FieldLike[]
  singleTable?: boolean
  title?: string
  matchFn?: (input: any, draft: ScopeFilter) => boolean
  countUnit?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; save: [ScopeFilter] }>()

const CATALOG = computed<FieldLike[]>(() => props.catalog ?? FIELD_CATALOG)
const SINGLE = computed(() => props.singleTable === true)
const TITLE = computed(() => props.title ?? '范围设置（临时重点跟进）')
const UNIT = computed(() => props.countUnit ?? '项目')
const matchOf = (i: any, d: ScopeFilter) => (props.matchFn ?? projectMatches)(i, d)

const GROUP_LABEL: Record<string, string> = { project: '项目级', paymentNode: '回款节点', milestone: '里程碑明细' }

function clone(s: ScopeFilter): ScopeFilter {
  return JSON.parse(JSON.stringify(s ?? { combinator: 'AND', groups: [] }))
}
const draft = ref<ScopeFilter>(clone(props.initial))
watch(() => props.modelValue, (v) => { if (v) draft.value = clone(props.initial) })

function defFor(c: ScopeCondition): FieldLike | undefined {
  if (SINGLE.value) return CATALOG.value.find((f) => f.key === c.field)
  return CATALOG.value.find((f) => f.group === c.group && f.key === c.field)
}
function kindOf(c: ScopeCondition): FieldDef['kind'] { return defFor(c)?.kind ?? 'enum' }

const fieldsByGroup = computed<Record<string, FieldLike[]>>(() => {
  const map: Record<string, FieldLike[]> = {}
  for (const f of CATALOG.value) {
    const g = f.group ?? ''
    if (!map[g]) map[g] = []
    map[g].push(f)
  }
  return map
})
const OPS_BY_KIND: Record<string, ScopeOp[]> = {
  enum: ['in', 'notIn'], text: ['contains', 'notContains'],
  number: ['between', 'notBetween'], date: ['between', 'notBetween'],
}
function stableFieldsOf(group: string): FieldLike[] {
  if (SINGLE.value) return CATALOG.value
  return fieldsByGroup.value[group] ?? []
}
function stableOpsForKind(kind: string): ScopeOp[] {
  return OPS_BY_KIND[kind] ?? OPS_BY_KIND['number']
}

const candidatesMap = computed(() => {
  const map: Record<string, string[]> = {}
  for (const f of CATALOG.value) {
    const set = new Set<string>()
    for (const it of props.inputs) {
      if (SINGLE.value) {
        const v = (it as any)[f.key]
        if (Array.isArray(v)) v.forEach((x) => x != null && x !== '' && set.add(String(x)))
        else if (v != null && v !== '') set.add(String(v))
      } else if (f.group === 'project') {
        const v = it.proj[f.key]
        if (Array.isArray(v)) v.forEach((x: any) => x != null && x !== '' && set.add(String(x)))
        else if (v != null && v !== '') set.add(String(v))
      } else {
        const rows = f.group === 'paymentNode' ? it.nodes : it.milestones
        for (const r of rows ?? []) { const val = r[f.key]; if (val != null && val !== '') set.add(String(val)) }
      }
    }
    map[(SINGLE.value ? '' : (f.group ?? '') + '::') + f.key] = [...set].sort((a, b) => a.localeCompare(b, 'zh'))
  }
  return map
})
function candidates(c: ScopeCondition): string[] {
  return candidatesMap.value[(SINGLE.value ? '' : (c.group ?? '') + '::') + c.field] ?? []
}

function addGroup() { draft.value.groups.push({ combinator: 'AND', conditions: [] }) }
function removeGroup(gi: number) { draft.value.groups.splice(gi, 1) }
function addCondition(gi: number) {
  if (SINGLE.value) {
    const first = CATALOG.value[0]
    draft.value.groups[gi].conditions.push({ field: first?.key ?? '', op: stableOpsForKind(first?.kind ?? 'enum')[0], values: [] })
  } else {
    draft.value.groups[gi].conditions.push({ group: 'project', field: 'orgL4', op: 'in', values: [] })
  }
}
function removeCondition(gi: number, ci: number) { draft.value.groups[gi].conditions.splice(ci, 1) }
function onGroupChange(c: ScopeCondition) {
  const first = stableFieldsOf(c.group ?? '')[0]
  c.field = first?.key ?? ''
  c.op = stableOpsForKind(first?.kind ?? 'enum')[0]
  c.values = []; c.min = null; c.max = null
}
function onFieldChange(c: ScopeCondition) {
  c.op = stableOpsForKind(kindOf(c))[0]
  c.values = []; c.min = null; c.max = null
}

const matchCount = computed(() => props.inputs.filter((i) => matchOf(i, draft.value)).length)

function onSave() { emit('save', clone(draft.value)); emit('update:modelValue', false) }
function onCancel() { emit('update:modelValue', false) }

defineExpose({ draft, matchCount, addGroup, addCondition, removeGroup, removeCondition, onSave, candidates, kindOf, SINGLE })
</script>
```

- [ ] **Step 2: 改 `ScopeBuilder.vue` 模板**（标题、组选择器 v-if、字段选项源、命中单位）

把 `<el-drawer ... title="范围设置（临时重点跟进）"` 改为 `:title="TITLE"`；
条件行的"子表选择" `<el-select v-model="c.group" ...>` 加 `v-if="!SINGLE"`；
字段选择 `v-for` 源改 `stableFieldsOf(c.group ?? '')`；
底部命中标签 `命中 {{ matchCount }} 个项目` 改 `命中 {{ matchCount }} 个{{ UNIT }}`：

```vue
  <el-drawer :model-value="modelValue" :title="TITLE" direction="rtl" size="640px"
    @update:model-value="emit('update:modelValue', $event)">
```
```vue
      <div v-for="(c, ci) in g.conditions" :key="ci" class="sb-cond">
        <el-select v-if="!SINGLE" v-model="c.group" size="small" style="width: 110px" @change="onGroupChange(c)">
          <el-option v-for="(lbl, gk) in GROUP_LABEL" :key="gk" :label="lbl" :value="gk" />
        </el-select>
        <el-select v-model="c.field" size="small" style="width: 140px" @change="onFieldChange(c)">
          <el-option v-for="f in stableFieldsOf(c.group ?? '')" :key="f.key" :label="f.label" :value="f.key" />
        </el-select>
```
```vue
      <span class="sb-count u-num">命中 {{ matchCount }} 个{{ UNIT }}</span>
```

- [ ] **Step 3: 写测试** — `ScopeBuilder.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import ScopeBuilder from './ScopeBuilder.vue'
import { OPP_SCOPE_CATALOG, opportunityMatches, DEFAULT_OPP_SCOPE } from '@/lib/opportunityScope'
import type { ScopeProjectInput } from '@/lib/tempScope'

beforeEach(() => setActivePinia(createPinia()))

function mountSB(props: Record<string, any>) {
  return mount(ScopeBuilder, { props: { modelValue: true, ...props }, global: { plugins: [ElementPlus] } })
}

describe('ScopeBuilder 单表模式(商机)', () => {
  const oppRows = [
    { id: 'o1', top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '招投标' },
    { id: 'o2', top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '赢单' },
    { id: 'o3', top1000: '非TOP1000', earlyIntervene: '否', keyOpp: '否', status: '意向沟通' },
  ]
  it('singleTable=true 时 matchCount 用 matchFn,默认范围命中 1 条', () => {
    const w = mountSB({
      inputs: oppRows, initial: DEFAULT_OPP_SCOPE,
      catalog: OPP_SCOPE_CATALOG, singleTable: true, matchFn: opportunityMatches, countUnit: '商机',
    })
    expect((w.vm as any).SINGLE).toBe(true)
    expect((w.vm as any).matchCount).toBe(1)   // 仅 o1(状态非赢单+三条件齐)
  })
  it('addCondition 在单表模式建无 group 的条件', () => {
    const w = mountSB({
      inputs: oppRows, initial: { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] },
      catalog: OPP_SCOPE_CATALOG, singleTable: true, matchFn: opportunityMatches,
    })
    ;(w.vm as any).addCondition(0)
    const c = (w.vm as any).draft.groups[0].conditions[0]
    expect(c.group).toBeUndefined()
    expect(typeof c.field).toBe('string')
  })
})

describe('ScopeBuilder 默认(temp 三子表)行为不回归', () => {
  const inp = (over: Partial<ScopeProjectInput>): ScopeProjectInput => ({ id: 'P', proj: {}, nodes: [], milestones: [], ...over })
  it('不传新 prop → 多表模式,addCondition 建 project/orgL4 条件', () => {
    const w = mountSB({
      inputs: [inp({ proj: { orgL4: '银行服务组' } })],
      initial: { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [] }] },
    })
    expect((w.vm as any).SINGLE).toBe(false)
    ;(w.vm as any).addCondition(0)
    const c = (w.vm as any).draft.groups[0].conditions[0]
    expect(c.group).toBe('project')
    expect(c.field).toBe('orgL4')
  })
})
```

- [ ] **Step 4: 跑测试 + 回归 + typecheck**

Run: `cd frontend && npx vitest run src/components/ScopeBuilder.test.ts src/views/TempFollowupView.test.ts && npm run typecheck`
Expected: PASS（temp 视图测试不回归）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/ScopeBuilder.vue frontend/src/components/ScopeBuilder.test.ts
git commit -m "feat(opp): ScopeBuilder 参数化(catalog/singleTable/matchFn/countUnit;temp 默认不变)"
```

---

### Task 9: 新视图 OpportunityFollowupView.vue + 行构建 lib

**Files:**
- Create: `frontend/src/lib/opportunityFollowup.ts`
- Create: `frontend/src/views/OpportunityFollowupView.vue`
- Create: `frontend/src/views/OpportunityFollowupView.test.ts`

**Interfaces:**
- Consumes: `useOpportunitiesStore`(取数,已按 L4 裁剪)、`useOpportunityFollowupStore`、`OPP_COLUMNS`、`OPP_SCOPE_CATALOG`/`opportunityMatches`、`ScopeBuilder`、`ProgressEditModal`(`store='oppFollowup'`)、`DataTable`、`ColumnFilter`、`ColumnPicker`、`exportSheets`、`useColumnPrefs`、`useCrossFilterStore`、`keyProjects.followDate/followBy`。
- Produces: 行类型 `OppFollowupRow`；视图 `defineExpose({ scopeOpen, mode, historyIdx, isCurrent, editOpen, editCtx, inScopeRows, allRows, exportSel, allSelected, datasetOpts, toggleAllExport })`。

- [ ] **Step 1: 写行构建 lib** — `opportunityFollowup.ts`

```ts
import type { OppRow } from './opportunitiesApi'
import { recentUpdateOf } from './opportunityColumns'
import { followDate, followBy, type ProgressRecord } from './keyProjects'

const s = (raw: unknown): string => (raw == null ? '' : String(raw))

export interface OppFollowupRow extends Record<string, any> {
  id: string
  weekProgress: string; weekProgressEditTime: string; weekProgressEditBy: string
  nextPlan: string; nextPlanEditTime: string; nextPlanEditBy: string
  followDate: string; followBy: string
  recentUpdate: string
}

/** 全部商机行(注入 recentUpdate + 跟进记录),不做范围过滤;范围匹配由调用方对返回行跑 opportunityMatches。 */
export function buildOppFollowupRows(
  opps: OppRow[],
  current: Record<string, ProgressRecord>,
  now: Date,
): OppFollowupRow[] {
  return opps.map((o) => {
    const rec: ProgressRecord = current[o.id] ?? {}
    return {
      ...o,
      recentUpdate: recentUpdateOf(s(o.lastUpdate), now),
      weekProgress: s(rec.weekProgress), weekProgressEditTime: s(rec.weekProgressEditTime), weekProgressEditBy: s(rec.weekProgressEditBy),
      nextPlan: s(rec.nextPlan), nextPlanEditTime: s(rec.nextPlanEditTime), nextPlanEditBy: s(rec.nextPlanEditBy),
      followDate: followDate(rec), followBy: followBy(rec),
    }
  })
}
```

- [ ] **Step 2: 写视图** — `OpportunityFollowupView.vue`

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useOpportunitiesStore } from '@/stores/opportunities'
import { useOpportunityFollowupStore } from '@/stores/opportunityFollowup'
import { useCrossFilterStore } from '@/stores/crossFilter'
import { OPP_COLUMNS, FILTERABLE as OPP_FILTERABLE, type OppColumn } from '@/lib/opportunityColumns'
import { OPP_SCOPE_CATALOG, opportunityMatches } from '@/lib/opportunityScope'
import { buildOppFollowupRows, type OppFollowupRow } from '@/lib/opportunityFollowup'
import { applyColumnFilters } from '@/lib/crossFilter'
import { useColumnPrefs } from '@/lib/useColumnPrefs'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'
import ColumnFilter from '@/components/ColumnFilter.vue'
import ColumnPicker from '@/components/ColumnPicker.vue'
import Modal from '@/components/Modal.vue'
import SegToggle from '@/components/SegToggle.vue'
import ProgressEditModal from '@/components/ProgressEditModal.vue'
import ScopeBuilder from '@/components/ScopeBuilder.vue'
import { exportSheets } from '@/lib/exportXlsx'

const TABLE_ID = 'opportunity-followup'
const auth = useAuthStore()
const opps = useOpportunitiesStore()
const oppf = useOpportunityFollowupStore()
const cf = useCrossFilterStore()

onMounted(() => {
  if (!opps.loaded) opps.load()
  if (!oppf.loaded) oppf.load()
})

const now = new Date()

const mode = ref<'current' | 'history'>('current')
const historyIdx = ref(0)
const isCurrent = computed(() => mode.value === 'current')

const datasetOpts = computed(() => [
  { value: 'current', label: '当前数据' },
  ...oppf.archives.map((a, i) => ({ value: 'a' + i, label: a.archiveTime })),
])
const historyOpts = computed(() => oppf.archives.map((a, i) => ({ value: i, label: a.archiveTime })))
watch(() => [mode.value, oppf.archives.length] as const, () => {
  if (mode.value === 'history') historyIdx.value = Math.max(0, oppf.archives.length - 1)
})

// 全部商机行(注入派生+跟进) → 供 ScopeBuilder 命中计数;再按 scope 过滤为当前清单
const allRows = computed<OppFollowupRow[]>(() => buildOppFollowupRows(opps.rows, oppf.current, now))
const inScopeRows = computed<OppFollowupRow[]>(() => allRows.value.filter((r) => opportunityMatches(r, oppf.scope)))
const rows = computed<OppFollowupRow[]>(() =>
  isCurrent.value ? inScopeRows.value : ((oppf.archives[historyIdx.value]?.rows ?? []) as OppFollowupRow[]))
const filtered = computed(() => applyColumnFilters(rows.value, cf.tableFilters(TABLE_ID)) as OppFollowupRow[])

function oppToDataColumn(c: OppColumn): DataColumn {
  const base: DataColumn = { key: c.key, label: c.label, width: c.width, wrap: c.wrap, sortable: c.sortable }
  if (c.type === 'number')
    return { ...base, num: true, formatter: (v) => (v === '' || v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) }
  if (c.type === 'date')
    return { ...base, formatter: (v) => (String(v || '').slice(0, 10) || '-') }
  return { ...base, formatter: (v) => (v === '' || v == null ? '-' : String(v)) }
}
const FOLLOWUP_COLUMNS: DataColumn[] = [
  { key: 'weekProgress', label: '本周工作进展', width: 240, wrap: true, formatter: (v, r) => (v ? `${r.weekProgressEditTime}：${v}` : '') },
  { key: 'nextPlan', label: '后续工作计划', width: 240, wrap: true, formatter: (v, r) => (v ? `${r.nextPlanEditTime}：${v}` : '') },
  { key: 'followDate', label: '跟进日期', width: 160, sortable: true },
  { key: 'followBy', label: '跟进人', width: 120 },
]
const ALL_COLUMNS: DataColumn[] = [...OPP_COLUMNS.map(oppToDataColumn), ...FOLLOWUP_COLUMNS]
const ALL_KEYS = ALL_COLUMNS.map((c) => c.key)
const DEFAULT_VISIBLE = ['name', 'customer', 'top1000', 'amountWan', 'opportunityLevel', 'status', 'frOwner',
  'weekProgress', 'nextPlan', 'followDate', 'followBy']
const FILTERABLE = new Set<string>([...OPP_FILTERABLE, 'followBy', 'followDate'])
const prefs = useColumnPrefs(TABLE_ID, ALL_KEYS, DEFAULT_VISIBLE)
const visibleColumns = computed(() =>
  prefs.visibleKeys.value.map((k) => ALL_COLUMNS.find((c) => c.key === k)).filter((c): c is DataColumn => !!c))
const pickerColumns = ALL_COLUMNS.map((c) => ({ key: c.key, label: c.label }))
function onToggle(key: string) {
  if (prefs.visibleKeys.value.includes(key)) cf.clearColumn(TABLE_ID, key)
  prefs.toggle(key)
}

function progCell(row: OppFollowupRow, field: 'weekProgress' | 'nextPlan'): string {
  const t = field === 'weekProgress' ? row.weekProgressEditTime : row.nextPlanEditTime
  const c = row[field]
  if (!c) return isCurrent.value ? '点击填写' : '-'
  return `${t}：${c}`
}

// 进展编辑(走 oppFollowup store;projectId 位置传 oppId)
const editOpen = ref(false)
const editCtx = reactive({ projectId: '', projectName: '', field: 'weekProgress' as 'weekProgress' | 'nextPlan', initial: '' })
function openEdit(row: OppFollowupRow, field: 'weekProgress' | 'nextPlan') {
  if (!isCurrent.value) return
  editCtx.projectId = row.id; editCtx.projectName = String(row.name ?? row.id)
  editCtx.field = field; editCtx.initial = row[field] ?? ''
  editOpen.value = true
}

const scopeOpen = ref(false)

const archiving = ref(false)
const archiveConfirm = ref(false)
async function doArchive() {
  archiving.value = true
  try { await oppf.archive(inScopeRows.value as any); archiveConfirm.value = false; mode.value = 'current' }
  finally { archiving.value = false }
}

const exportOpen = ref(false)
const exportSel = ref<string[]>(['current'])
const allSelected = computed(() => exportSel.value.length > 0 && exportSel.value.length === datasetOpts.value.length)
const exportIndeterminate = computed(() => exportSel.value.length > 0 && exportSel.value.length < datasetOpts.value.length)
function toggleAllExport(val: boolean) { exportSel.value = val ? datasetOpts.value.map((o) => o.value) : [] }
function exportRow(r: OppFollowupRow): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const col of visibleColumns.value) {
    const v = (r as any)[col.key]
    out[col.label] = col.formatter ? col.formatter(v, r) : (v ?? '')
  }
  return out
}
function doExport() {
  const sheets = exportSel.value.map((sel) => {
    const opt = datasetOpts.value.find((o) => o.value === sel)
    const src: OppFollowupRow[] = sel === 'current' ? inScopeRows.value
      : ((oppf.archives[Number(sel.slice(1))]?.rows ?? []) as OppFollowupRow[])
    const fr = applyColumnFilters(src, cf.tableFilters(TABLE_ID)) as OppFollowupRow[]
    return { name: (opt?.label ?? sel).replace(/[:\\/?\*\[\]]/g, '-'), rows: fr.map(exportRow) }
  })
  exportSheets(`重点商机跟进_${exportSel.value.length}集.xlsx`, sheets)
  exportOpen.value = false
}

defineExpose({ scopeOpen, mode, historyIdx, isCurrent, editOpen, editCtx, inScopeRows, allRows, exportSel, allSelected, datasetOpts, toggleAllExport })
</script>

<template>
  <div class="opp-followup-view">
    <h2 class="kp-title">重点商机跟进</h2>
    <div class="toolbar">
      <span class="kp-label">数据集</span>
      <SegToggle v-model="mode" :options="[{ value: 'current', label: '当前数据' }, { value: 'history', label: '历史数据' }]" />
      <el-select v-if="mode === 'history'" v-model="historyIdx" size="small" style="width: 200px"
        :disabled="!oppf.archives.length" placeholder="选择历史快照">
        <el-option v-for="o in historyOpts" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <ColumnPicker :columns="pickerColumns" :visible-keys="prefs.visibleKeys.value"
        @toggle="onToggle" @move-up="prefs.moveUp" @move-down="prefs.moveDown" @reset="prefs.reset" />
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="scopeOpen = true">范围设置</button>
      <button v-if="auth.isSuper" class="kp-archive-btn" @click="archiveConfirm = true">更新（归档+清空）</button>
      <button v-if="auth.isSuper" class="kp-export-btn" @click="exportOpen = true">导出</button>
      <el-button v-if="cf.hasFilters(TABLE_ID)" size="small" style="margin-left: auto" @click="cf.clearAll(TABLE_ID)">清除所有筛选</el-button>
    </div>

    <div v-if="!rows.length" class="kp-empty">
      {{ auth.isSuper ? '请点击「范围设置」定义重点商机跟进范围（默认：TOP1000 且 提前介入 且 重点商机 且 状态非赢单）。' : '暂无重点商机跟进。' }}
    </div>
    <div v-else class="kp-scroll">
      <DataTable :columns="visibleColumns" :rows="filtered" :show-count="false">
        <template v-for="col in visibleColumns" :key="col.key" #[`header-${col.key}`]="{ col: c }">
          <span class="kp-th">
            {{ c.label }}
            <ColumnFilter v-if="FILTERABLE.has(c.key)" :table-id="TABLE_ID" :col-key="c.key" :source-rows="rows" />
          </span>
        </template>
        <template #cell-weekProgress="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as OppFollowupRow, 'weekProgress')">{{ progCell(row as OppFollowupRow, 'weekProgress') }}</span>
        </template>
        <template #cell-nextPlan="{ row }">
          <span class="kp-prog-cell" :class="{ editable: isCurrent }"
            @click.stop="openEdit(row as OppFollowupRow, 'nextPlan')">{{ progCell(row as OppFollowupRow, 'nextPlan') }}</span>
        </template>
      </DataTable>
    </div>

    <ProgressEditModal v-model="editOpen" store="oppFollowup"
      :project-id="editCtx.projectId" :project-name="editCtx.projectName" :field="editCtx.field" :initial="editCtx.initial" />

    <ScopeBuilder v-if="auth.isSuper" v-model="scopeOpen" :inputs="allRows" :initial="oppf.scope"
      :catalog="OPP_SCOPE_CATALOG" :single-table="true" :match-fn="opportunityMatches"
      title="范围设置（重点商机跟进）" count-unit="商机" @save="(s) => oppf.saveScope(s)" />

    <Modal v-model="archiveConfirm" title="更新（归档）" width="420px">
      <div>将把当前数据归档为历史快照，并清空两列进展（开始新一期）。确认更新？</div>
      <div style="margin-top: var(--gap-card); display: flex; justify-content: flex-end; gap: var(--sp-2)">
        <button class="kp-cancel" @click="archiveConfirm = false">取消</button>
        <button class="kp-archive-btn" :disabled="archiving" @click="doArchive">确认更新</button>
      </div>
    </Modal>

    <Modal v-model="exportOpen" title="导出数据集" width="420px">
      <el-checkbox :model-value="allSelected" :indeterminate="exportIndeterminate" @change="toggleAllExport($event as boolean)">全选</el-checkbox>
      <el-checkbox-group v-model="exportSel">
        <el-checkbox v-for="o in datasetOpts" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
      </el-checkbox-group>
      <div style="margin-top: var(--gap-card)">
        <button class="kp-export-btn" :disabled="!exportSel.length" @click="doExport">导出 xlsx（{{ exportSel.length }} 个数据集，按当前列筛选）</button>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.opp-followup-view { padding: var(--sp-4); }
.kp-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.kp-label { font-size: var(--fs-1); color: var(--sub); }
.kp-scroll { overflow-x: auto; }
.kp-th { display: inline-flex; align-items: center; gap: var(--sp-1); }
.kp-empty { padding: var(--sp-5); color: var(--mut); text-align: center; }
.kp-prog-cell { display: inline-block; white-space: pre-wrap; }
.kp-prog-cell.editable { cursor: pointer; color: var(--accent); }
.kp-archive-btn, .kp-export-btn, .kp-cancel {
  font-size: var(--fs-1); border: 1px solid var(--line); border-radius: var(--r-sm);
  padding: 2px 10px; cursor: pointer; background: var(--card2); color: var(--accent); }
.kp-archive-btn:disabled { opacity: var(--disabled-opacity, 0.45); cursor: not-allowed; }
</style>
```

- [ ] **Step 3: 写视图测试** — `OpportunityFollowupView.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import OpportunityFollowupView from './OpportunityFollowupView.vue'
import { useAuthStore } from '@/stores/auth'
import * as oppApi from '@/lib/opportunitiesApi'
import * as oppfApi from '@/lib/opportunityFollowupApi'
import { DEFAULT_OPP_SCOPE } from '@/lib/opportunityScope'

const ROWS = [
  { id: 'opp-1', name: '甲商机', customer: '甲公司', top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '招投标', amountWan: 200, opportunityLevel: 'P1', frOwner: '王', lastUpdate: '2026-06-20' },
  { id: 'opp-2', name: '乙商机', customer: '乙公司', top1000: 'TOP1000', earlyIntervene: '是', keyOpp: '是', status: '赢单', amountWan: 80, opportunityLevel: 'P3', frOwner: '李', lastUpdate: '2026-06-01' },
  { id: 'opp-3', name: '丙商机', customer: '丙公司', top1000: '非TOP1000', earlyIntervene: '否', keyOpp: '否', status: '意向沟通', amountWan: 50, opportunityLevel: 'P4', frOwner: '赵', lastUpdate: '2026-05-01' },
]

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(oppApi.opportunitiesApi, 'list').mockResolvedValue({ rows: ROWS as any })
  vi.spyOn(oppfApi.opportunityFollowupApi, 'get').mockResolvedValue({
    scope: DEFAULT_OPP_SCOPE, current: { 'opp-1': { weekProgress: '本周推进', weekProgressEditTime: '2026-06-25 10:00', weekProgressEditBy: 'admin' } }, archives: [],
  } as any)
})

async function mountView(isSuper = true) {
  const auth = useAuthStore()
  auth.user = { account: 't', displayName: 't', isSuper, allowedPages: ['*'], allowedL4: [] } as any
  const w = mount(OpportunityFollowupView, { global: { plugins: [ElementPlus] } })
  await flushPromises()
  return w
}

describe('OpportunityFollowupView', () => {
  it('默认范围只保留命中商机(opp-1):状态非赢单+三条件齐', async () => {
    const w = await mountView(true)
    const ids = (w.vm as any).inScopeRows.map((r: any) => r.id)
    expect(ids).toEqual(['opp-1'])
  })
  it('默认列含跟进四列与商机级别;跟进进展单元格渲染时间+内容', async () => {
    const w = await mountView(true)
    const html = w.html()
    expect(html).toContain('本周工作进展')
    expect(html).toContain('跟进人')
    expect(html).toContain('商机级别')
    expect(html).toContain('2026-06-25 10:00：本周推进')
  })
  it('超管见范围设置/更新/导出按钮;普通管理员不见', async () => {
    const ws = await mountView(true)
    expect(ws.text()).toContain('范围设置')
    const wn = await mountView(false)
    expect(wn.text()).not.toContain('范围设置')
  })
})
```

- [ ] **Step 4: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/lib/opportunityFollowup* src/views/OpportunityFollowupView.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/opportunityFollowup.ts frontend/src/views/OpportunityFollowupView.vue frontend/src/views/OpportunityFollowupView.test.ts
git commit -m "feat(opp): 重点商机跟进视图(取数自商机store+范围过滤+跟进四列+导出)"
```

---

### Task 10: 路由 / 菜单 / 页面访问 接入新页

**Files:**
- Modify: `frontend/src/lib/pageAccess.ts`(PageKey 加 `opportunity-followup`)
- Modify: `frontend/src/nav.ts`(KEY_FOLLOWUP_LINKS 加新链接)
- Modify: `frontend/src/router/index.ts`(import + 路由)
- Modify: `frontend/src/layout/AppSidebar.vue`(activeSectionKey 加 `/opportunities/key`)
- Test: `frontend/src/lib/pageAccess.test.ts`, `frontend/src/layout/AppSidebar.test.ts`

**Interfaces:**
- Consumes: Task 9 的 `OpportunityFollowupView`；Task 3 后的 nav/sidebar 状态。
- Produces: 路由 `/opportunities/key`(name `opportunity-followup`, pageKey `opportunity-followup`)；菜单「重点跟进」组顺序 → 重点项目进展 / 重点商机跟进 / 临时重点跟进。

- [ ] **Step 1: `pageAccess.ts` PageKey 联合类型加新键**

```ts
  | 'projects-key' | 'opportunities-progress' | 'temp-followup' | 'opportunity-followup'
```

- [ ] **Step 2: `nav.ts` KEY_FOLLOWUP_LINKS 加新链接**（重点项目进展 与 临时重点跟进 之间）

```ts
export const KEY_FOLLOWUP_LINKS: NavLink[] = [
  { label: '重点项目进展', to: '/projects/key', key: 'projects-key' },
  { label: '重点商机跟进', to: '/opportunities/key', key: 'opportunity-followup' },
  { label: '临时重点跟进', to: '/projects/temp', key: 'temp-followup' },
]
```

- [ ] **Step 3: `router/index.ts` import + 路由**

import 区加（在 `import TempFollowupView ...` 附近）：

```ts
import OpportunityFollowupView from '@/views/OpportunityFollowupView.vue'
```

在 `/opportunities` 路由行后加新路由：

```ts
    { path: '/opportunities/key', name: 'opportunity-followup', component: OpportunityFollowupView, meta: { title: '重点商机跟进', hideFilter: true, pageKey: 'opportunity-followup' } },
```

- [ ] **Step 4: `AppSidebar.vue` activeSectionKey 加 `/opportunities/key`**（必须在默认 fallthrough 之前；`/opportunities` 精确清单页仍走 fallthrough→project）

```ts
const activeSectionKey = computed(() => {
  const p = route.path
  if (p.startsWith('/projects/key')) return 'keyfollowup'
  if (p.startsWith('/opportunities/key')) return 'keyfollowup'
  if (p.startsWith('/insight')) return 'analysis'
  if (p.startsWith('/payment') || p.startsWith('/ledger')) return 'payment'
  if (p.startsWith('/data') || p.startsWith('/governance') || p.startsWith('/about')) return 'tools'
  if (p.startsWith('/admin')) return 'admin'
  return 'project'
})
```

- [ ] **Step 5: 改测试为最终态**

`pageAccess.test.ts` 的 KEY_FOLLOWUP_LINKS 断言改回三项（含新页，在重点项目进展后、临时重点跟进前）：

```ts
  it('KEY_FOLLOWUP_LINKS = [重点项目进展, 重点商机跟进, 临时重点跟进]', () => {
    const keys = KEY_FOLLOWUP_LINKS.map((l) => l.key)
    expect(keys).toEqual(['projects-key', 'opportunity-followup', 'temp-followup'])
    const oppf = KEY_FOLLOWUP_LINKS.find((l) => l.key === 'opportunity-followup')!
    expect(oppf.to).toBe('/opportunities/key')
    expect(oppf.label).toBe('重点商机跟进')
  })
```

`AppSidebar.test.ts`：makeRouter 的 routes 加 `/opportunities/key`（在 `/opportunities` 行后）：

```ts
      { path: '/opportunities', component: { template: '<div/>' } },
      { path: '/opportunities/key', component: { template: '<div/>' } },
```

主断言块加「重点商机跟进」、`.nav-sub` 计数回 15：

```ts
    expect(text).toContain('商机清单')        // 已移入「项目」组
    expect(text).toContain('重点商机跟进')    // 重点跟进分区(新页)
```
```ts
    // 项目分析(6) + 重点跟进(3) + 回款子域(6) 均为 .nav-sub 二级呈现 = 15
    expect(wrapper.findAll('.nav-sub').length).toBe(15)
```

- [ ] **Step 6: 跑测试 + typecheck**

Run: `cd frontend && npx vitest run src/lib/pageAccess.test.ts src/layout/AppSidebar.test.ts src/router && npm run typecheck`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/pageAccess.ts frontend/src/nav.ts frontend/src/router/index.ts frontend/src/layout/AppSidebar.vue frontend/src/lib/pageAccess.test.ts frontend/src/layout/AppSidebar.test.ts
git commit -m "feat(opp): 接入 /opportunities/key 路由+菜单+页面访问(重点跟进组)"
```

---

### Task 11: 版本号 + PROGRESS + 打包白名单 + 全量验证

**Files:**
- Modify: `frontend/src/version.ts`(→ V2.2.0)
- Modify: `make_deploy_zip.py`(TOP_FILES 加 `opportunity_followup.py`)
- Modify: `PROGRESS.md`

**Interfaces:** 无新接口；收尾与发布前置。

- [ ] **Step 1: 版本号 → V2.2.0** — `frontend/src/version.ts`

把 `APP_VERSION` 改为 `'V2.2.0'`（仅此一处；其它文档不同步）。

- [ ] **Step 2: 打包整包白名单补新后端模块** — `make_deploy_zip.py` `TOP_FILES`

在 `"pmis_config.py",` 行附近加：

```python
    "pmis_config.py",
    "opportunity_followup.py",
```

（`make_update_zip.py` 用 `*.py` glob 自动纳入，无需改。）

- [ ] **Step 3: 更新 `PROGRESS.md`**

在版本史顶部追加 V2.2.0 条目：商机清单改造（移入项目组+改名+商机级别 P1-P4 列）+ 新增 /opportunities/key 重点商机跟进页（单表范围引擎、默认条件 TOP1000&提前介入&重点商机&状态非赢单、复用参数化 ScopeBuilder/ProgressEditModal）。记录技术债（如有）：`handle_opportunity_followup_*` 与 temp 同款 busy 无锁（沿用既有约定，后续统一收紧）。

- [ ] **Step 4: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 5: 提交**

```bash
git add frontend/src/version.ts make_deploy_zip.py PROGRESS.md
git commit -m "chore(release): V2.2.0(商机清单改造+重点商机跟进页) + 打包纳入 opportunity_followup.py"
```

---

## 自查（writing-plans Self-Review）

**1. Spec 覆盖**
- Part1.1 菜单移动/改名/排序 → Task 3 ✓；1.2 商机级别列(后端) → Task 1 ✓、(前端+默认列+位置) → Task 2 ✓。
- Part2.1 后端模块+端点+默认 seed → Task 6 ✓；2.2 单表范围引擎(派生自 OPP_COLUMNS) → Task 5（依赖 Task 4 共享运算符）✓；2.3 视图(取数/范围/跟进四列/导出/默认11列/只读) → Task 9 ✓；store/api/弹窗/复位 → Task 7 ✓；ScopeBuilder 参数化 → Task 8 ✓；2.4 路由/菜单/权限 → Task 10 ✓（已纠正：用 PageKey 联合类型，非 feature_list.json）；2.5 测试矩阵分散各任务 + Task 11 verify ✓；版本 V2.2.0 + 打包 → Task 11 ✓。
- 默认列「客户类型」→ `top1000`，列头仍显「是否TOP1000客户」（Global Constraints 已锁）✓。

**2. 占位符扫描**：无 TBD/TODO；每个改代码步骤均给完整代码与确切命令/预期。

**3. 类型一致性**
- `ScopeCondition.group` Task 4 改可选 → Task 5/8/9 的无 group 条件类型自洽 ✓。
- `FieldLike` 在 tempScope 定义并导出，Task 5 的 `OPP_SCOPE_CATALOG: FieldLike[]`、Task 8 的 `catalog?: FieldLike[]` 一致 ✓。
- store `update(oppId,...)` 与 ProgressEditModal `activeStore.update(projectId,...)` 签名同形（位置参数）✓。
- 端点路径在 server.py(dispatch+_SUPER_ONLY_PATHS)、api 客户端、测试三处一致：`/api/opportunity-followup{,/scope,/update,/archive}` ✓。
- 计数断言跨任务连续：OPP_COLUMNS 25→26 / OPP_FIELDS 22→23(Task2)；`.nav-sub` 15→14(Task3)→15(Task10)；KEY_FOLLOWUP_LINKS 3→2(Task3)→3(Task10) ✓。

**4. 依赖顺序**：1,2,3 独立可先行；4→5（scopeOps 先于 opportunityScope）；6 独立；7 依赖 6 契约；8 依赖 4,5；9 依赖 2,5,7,8；10 依赖 3,9；11 收尾。串行执行无并发冲突。
