# 回款明细改「元」+ 商机「是否重大POC」列 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/project/:id` 回款明细表三列改用「元」精确展示，并为商机清单新增「是否重大POC」列（自动联动重点商机跟进页的筛选与可选列），版本升至 V2.2.1。

**Architecture:** 三块独立改动。第 1 块仅改 `ProjectDetailView.vue` 一个列定义数组的三列 label/formatter（`fmtWan`→`fmtYuan`）。第 2 块给 `opportunities.py`（后端白名单）与 `opportunityColumns.ts`（前端列定义）各加一列，`/opportunities/key` 的范围筛选目录与可选列均派生自 `OPP_COLUMNS`，自动生效。第 3 块版本号与 PROGRESS。全程 TDD，每任务独立可测可提交。

**Tech Stack:** Python 标准库 + pydantic（后端纯函数）、Vue3 + Vite + TS + Vitest（前端）、pytest（后端）。

## Global Constraints

- 交流语言简体中文；**全站不使用任何 emoji**（需符号用 `→ ↓ ❌ ✕ ▾`）。
- 版本单一来源 `frontend/src/version.ts`；本期为 **V2.2.1**（Z 级——子页面/页内局部调整）。
- 字段 key 命名 `majorPoc`；列定义 `type:'select'`、`options:['是','否']`、`width:120`、`filterable:true`、label `是否重大POC`、中文表头 `是否重大POC`。
- 回款明细三列（`expectedPayment`/`receivedAmount`/`unpaidAmount`）用 `fmtYuan`、label 后缀 `(元)`；`账期(天)`（`termDays`）与回款 Tab 顶部汇总卡片**不动**。
- 「是否重大POC」**不**进 `/opportunities/key`（OpportunityFollowupView）的默认显示列；仅作可选列 + 筛选字段（自动派生，不写新代码）。
- 本期**无 `preprocess_data.py`/`schema.py` 改动**；不改后端数据层、不做历史数据迁移。
- 完成定义：代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。

---

### Task 1: `/project/:id` 回款明细表三列改用「元」

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue`（`PMIS_NODE_COLS`，约 111–124 行）
- Test: `frontend/src/views/ProjectDetailView.test.ts`（新增一个用例）

**Interfaces:**
- Consumes: `fmtYuan`（`@/lib/format`，已在本文件第 8 行 import：`import { fmtWan, fmtRatio, fmtYuan } from '@/lib/format'`）。`fmtYuan(n)` = 原始数值 `toLocaleString('zh-CN', { maximumFractionDigits: 2 })`，不做 `÷10000`。
- Produces: 无（仅本文件内部列定义变更）。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/ProjectDetailView.test.ts` 的 `describe('ProjectDetailView', ...)` 内（紧接现有「回款 tab:PMIS 回款摘要与节点表(2A)」用例之后）新增：

```ts
  it('回款节点表金额列以「元」展示原始值(精度,非万)', async () => {
    seed()
    const ds = useDataStore()
    ;(ds.data as any).projects[0].paymentPmis = {
      contract: 1000000, actualTotal: 700000, paymentCount: 1,
      expectedTotal: 1000000, nodeCount: 1, reachedCount: 1, delayedCount: 0,
      lastPaymentDate: '2026-06-04', fromOrigin: false,
    }
    ;(ds.data as any).paymentNodes = { 'P-1': [
      { stage: '到货款', category: '到货款', planDate: '2026-01-01', actualDate: '2026-01-02',
        payRatio: 0.7, expectedPayment: 123456, receivedAmount: 123456, unpaidAmount: 0,
        actualRatio: 1, termDays: 90, payTerm: '到货后付款', reached: true, status: '已回款' },
    ] }
    const w = await mountAt('/project/P-1')
    // 三列表头改为「元」
    expect(w.text()).toContain('计划回款(元)')
    expect(w.text()).toContain('已收(元)')
    expect(w.text()).toContain('未收(元)')
    // 这两列不再有「万」表头(它们只作为节点列存在,不在汇总卡片中)
    expect(w.text()).not.toContain('已收(万)')
    expect(w.text()).not.toContain('未收(万)')
    // 展示原始元值(精确,无万元四舍五入: 123456 元 → 123,456, 而非 12.35)
    expect(w.text()).toContain('123,456')
    expect(w.text()).not.toContain('12.35')
    // 账期仍为天(不动)
    expect(w.text()).toContain('账期(天)')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts -t "回款节点表金额列以「元」展示原始值"`
Expected: FAIL —— 当前列头为「计划回款(万)」，值经 `fmtWan` 为 `12.35`，断言 `计划回款(元)` 与 `123,456` 不满足。

- [ ] **Step 3: 改实现**

在 `frontend/src/views/ProjectDetailView.vue` 的 `PMIS_NODE_COLS` 中，把这三行：

```ts
  { key: 'expectedPayment', label: '计划回款(万)', formatter: (v) => fmtWan(v as number) },
  { key: 'receivedAmount', label: '已收(万)', formatter: (v) => fmtWan(v as number) },
  { key: 'unpaidAmount', label: '未收(万)', formatter: (v) => fmtWan(v as number) },
```

改为：

```ts
  { key: 'expectedPayment', label: '计划回款(元)', formatter: (v) => fmtYuan(v as number) },
  { key: 'receivedAmount', label: '已收(元)', formatter: (v) => fmtYuan(v as number) },
  { key: 'unpaidAmount', label: '未收(元)', formatter: (v) => fmtYuan(v as number) },
```

其余列（`termDays` 账期(天)、`payTerm`、`status` 等）与顶部 `pmisPaySummary` 汇总卡片**保持不变**。`fmtWan` 仍被汇总卡片等使用，import 不动。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: PASS（新用例及该文件其余用例全绿；其余用例不断言这三列的「万」标签，不受影响）。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(project-detail): 回款明细 计划回款/已收/未收 改以元为单位(精度)"
```

---

### Task 2: 商机新增「是否重大POC」列（后端白名单 + 前端列定义 + 联动 key 页筛选/可选列）

**Files:**
- Modify: `opportunities.py`（`FIELDS` 元组、顶部注释、`HEADER_TO_FIELD`）
- Modify: `frontend/src/lib/opportunityColumns.ts`（`OPP_COLUMNS`、`DEFAULT_VISIBLE`）
- Test: `tests/test_opportunities.py`（新增 2 用例）
- Test: `frontend/src/lib/opportunityColumns.test.ts`（改 2 处长度断言、加 1 用例）
- Test: `frontend/src/lib/opportunityScope.test.ts`（改 1 处长度断言、加 1 行 kind 断言）

**Interfaces:**
- Produces（供 `/opportunities/key` 自动联动，无需改其代码）：
  - `OPP_COLUMNS` 新增项 `{ key:'majorPoc', label:'是否重大POC', type:'select', options:['是','否'], width:120, filterable:true }`。
  - `OPP_SCOPE_CATALOG`（`lib/opportunityScope.ts` 中 `OPP_COLUMNS.map(...)` 派生）将含 `{ key:'majorPoc', kind:'enum' }`（`type:'select'` → `kindOfType` 映射为 `'enum'`）。
  - `OPP_FIELDS`（前端，过滤 auto/derived 后的 key 列表）由 26→27 项中取非 auto/derived = 24 项，与后端 `FIELDS`（24）对齐。
- Consumes: 后端 `FIELDS` 白名单驱动 `new_row`/`apply_update`/`read_opportunities_xlsx`（循环 `FIELDS` + `HEADER_TO_FIELD`，自动覆盖新字段）；前端 `YN = ['是','否']` 常量已存在于 `opportunityColumns.ts`。

#### 后端

- [ ] **Step 1: 写失败测试（后端）**

在 `tests/test_opportunities.py` 末尾追加：

```python
def test_major_poc_is_editable_field():
    assert 'majorPoc' in opp.FIELDS
    r = opp.new_row("opp-1")
    assert r["majorPoc"] == ""
    s = _store(); opp.apply_create(s, "d")
    r2 = opp.apply_update(s, "opp-1", {"majorPoc": "是"}, "admin", "d", "t")
    assert r2["majorPoc"] == "是"


def test_read_xlsx_maps_major_poc(tmp_path):
    p = tmp_path / "opp_poc.xlsx"
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["客户名称", "是否重大POC"])
    ws.append(["甲公司", "是"])
    wb.save(p)
    rows = opp.read_opportunities_xlsx(str(p))
    assert rows[0]["majorPoc"] == "是"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_opportunities.py -q -k "major_poc"`
Expected: FAIL —— `'majorPoc' not in FIELDS`，`read_opportunities_xlsx` 不识别表头「是否重大POC」（`rows[0]` 无 `majorPoc` 键 → KeyError）。

- [ ] **Step 3: 改实现（后端）**

在 `opportunities.py` 中：

把顶部注释 `# 23 个可编辑业务字段(白名单;update 只接受其中字段)` 改为 `# 24 个可编辑业务字段(白名单;update 只接受其中字段)`。

把 `FIELDS` 末尾的 `'opportunityLevel',` 一行改为：

```python
    'opportunityLevel', 'majorPoc',
```

在 `HEADER_TO_FIELD` 中，`'商机级别': 'opportunityLevel',` 行后新增一行：

```python
    '是否重大POC': 'majorPoc',
```

（`new_row`/`apply_update`/`read_opportunities_xlsx` 函数体不改：`majorPoc` 非日期非金额，`apply_update` 走默认 `_s()` 字符串分支，`read_opportunities_xlsx` 按 `HEADER_TO_FIELD` 自动映射。）

- [ ] **Step 4: 跑测试确认通过（后端）**

Run: `python -m pytest tests/test_opportunities.py -q`
Expected: PASS（新增 2 用例 + 既有用例全绿；`test_new_row_blank_has_all_fields` 按 `FIELDS` 循环，自动覆盖 `majorPoc`）。

#### 前端列定义 + 测试

- [ ] **Step 5: 改前端测试为失败态（列定义断言）**

在 `frontend/src/lib/opportunityColumns.test.ts` 中：

把 `expect(OPP_FIELDS).toHaveLength(23)` 改为 `expect(OPP_FIELDS).toHaveLength(24)`。
把 `expect(OPP_COLUMNS).toHaveLength(26)` 改为 `expect(OPP_COLUMNS).toHaveLength(27)`。
在 `recentUpdateOf` 用例之前新增用例：

```ts
  it('是否重大POC列: select 是/否, 位于 expectedDate 之后, 默认显示且在 expectedDate 与 bidStatus 之间', () => {
    const keys = OPP_COLUMNS.map((c) => c.key)
    const ei = keys.indexOf('expectedDate'), mi = keys.indexOf('majorPoc')
    expect(mi).toBe(ei + 1)                          // 紧跟预估落单时间之后
    expect(keys.indexOf('bidStatus')).toBeGreaterThan(mi)  // 排在实际中标状态之前
    const col = OPP_COLUMNS.find((c) => c.key === 'majorPoc')!
    expect(col.type).toBe('select')
    expect(col.options).toEqual(['是', '否'])
    expect(col.width).toBe(120)
    expect(col.filterable).toBe(true)
    // 默认显示, 且落在 expectedDate 与 bidStatus 之间
    expect(DEFAULT_VISIBLE).toContain('majorPoc')
    const di = DEFAULT_VISIBLE.indexOf('majorPoc')
    expect(DEFAULT_VISIBLE.indexOf('expectedDate')).toBe(di - 1)
    expect(DEFAULT_VISIBLE.indexOf('bidStatus')).toBe(di + 1)
  })
```

在 `frontend/src/lib/opportunityScope.test.ts` 中：

把 `expect(OPP_SCOPE_CATALOG.length).toBe(26)` 改为 `expect(OPP_SCOPE_CATALOG.length).toBe(27)`。
在同一 `it('从 OPP_COLUMNS 派生...')` 用例内，`expect(m.get('customer')).toBe('text')` 之后新增一行：

```ts
    expect(m.get('majorPoc')).toBe('enum')
```

- [ ] **Step 6: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/opportunityColumns.test.ts src/lib/opportunityScope.test.ts`
Expected: FAIL —— `OPP_COLUMNS` 仍 26 列、无 `majorPoc`，长度与 `mi` 断言不满足。

- [ ] **Step 7: 改实现（前端列定义）**

在 `frontend/src/lib/opportunityColumns.ts` 的 `OPP_COLUMNS` 中，`{ key: 'expectedDate', ... }` 这一行之后、`{ key: 'productCategory', ... }` 之前，插入：

```ts
  { key: 'majorPoc', label: '是否重大POC', type: 'select', options: YN, width: 120, filterable: true },
```

把 `DEFAULT_VISIBLE` 由：

```ts
export const DEFAULT_VISIBLE = ['l4','salesOwner','customer','top1000','status','forecast','name','amountWan','opportunityLevel','expectedDate','bidStatus','lastUpdate','recentUpdate']
```

改为（在 `'expectedDate'` 后插入 `'majorPoc'`）：

```ts
export const DEFAULT_VISIBLE = ['l4','salesOwner','customer','top1000','status','forecast','name','amountWan','opportunityLevel','expectedDate','majorPoc','bidStatus','lastUpdate','recentUpdate']
```

（`OPP_FIELDS`、`FILTERABLE` 自动派生，不改。）

- [ ] **Step 8: 跑测试确认通过（前端单元）**

Run: `cd frontend && npx vitest run src/lib/opportunityColumns.test.ts src/lib/opportunityScope.test.ts`
Expected: PASS（列定义、默认列、范围目录 kind 全部满足；`OPP_SCOPE_CATALOG` 与 `/opportunities/key` 可选列均由 `OPP_COLUMNS` 派生，自动含 `majorPoc`，验证第 3 项联动）。

- [ ] **Step 9: 提交**

```bash
git add opportunities.py tests/test_opportunities.py frontend/src/lib/opportunityColumns.ts frontend/src/lib/opportunityColumns.test.ts frontend/src/lib/opportunityScope.test.ts
git commit -m "feat(opp): 商机新增「是否重大POC」是/否列(联动重点商机跟进筛选与可选列)"
```

---

### Task 3: 版本号 V2.2.1 + PROGRESS.md

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

**Interfaces:**
- Consumes: 无（纯版本/文档）。
- Produces: 无。

- [ ] **Step 1: 改版本号**

把 `frontend/src/version.ts` 第 2–3 行：

```ts
export const APP_VERSION = 'V2.2.0'
export const RELEASE_DATE = '2026-06-25'
```

改为：

```ts
export const APP_VERSION = 'V2.2.1'
export const RELEASE_DATE = '2026-06-26'
```

- [ ] **Step 2: 跑前端 typecheck 确认无破坏**

Run: `cd frontend && npm run typecheck`
Expected: PASS（无类型错误）。

- [ ] **Step 3: 更新 PROGRESS.md**

在 `PROGRESS.md` 顶部版本史区追加 V2.2.1 条目（紧接 V2.2.0 之上，与现有条目同样式），内容如实记述本期两块改动：

```markdown
- V2.2.1（2026-06-26，Z 级·子页面局部调整）：
  - `/project/:id` 回款明细表「计划回款/已收/未收」三列由「万元」改为「元」展示（`fmtWan`→`fmtYuan`），消除 ÷10000 + 两位小数四舍五入导致的精度丢失；账期(天) 与回款 Tab 顶部汇总卡片不变。与 `/payment` 台账下钻「已收(元)/未收(元)」口径一致。
  - `/opportunities`（商机清单）新增「是否重大POC」是/否下拉列，位于「预估落单时间」之后、「实际中标状态」之前，默认显示；后端 `opportunities.py` `FIELDS`/`HEADER_TO_FIELD` 加 `majorPoc`（字段 23→24）。`/opportunities/key`（重点商机跟进）的范围筛选目录与可选显示列均派生自 `OPP_COLUMNS`，新列自动成为可筛选字段 + 可选列（按定不进该页默认列）。
  - 无 `preprocess_data.py` 改动 → 升级不需点「更新数据」；无新依赖。
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V2.2.1(回款明细改元+商机是否重大POC列)"
```

- [ ] **Step 5: 全量验证**

Run: `bash verify.sh`
Expected: 语法编译 + ruff + pytest + 前端 typecheck/vitest/build 全绿。

---

## 自检（计划对 spec 的覆盖）

- spec 第 1 项（回款明细三列改元，账期/汇总卡片不动）→ Task 1（含 `账期(天)` 保留、`已收(万)/未收(万)` 负断言）。
- spec 第 2 项（后端 FIELDS/HEADER_TO_FIELD + 前端列定义 + 默认列 + 位置）→ Task 2 后端 Step 1–4、前端 Step 5–9，位置由 `mi==ei+1` 与 `bidStatus>mi` 断言锁定。
- spec 第 3 项（key 页筛选/可选列自动联动、不进默认列）→ Task 2 Step 8 由 `OPP_SCOPE_CATALOG` 含 `majorPoc(enum)` 验证筛选；可选列同源派生；不改 `OpportunityFollowupView` 的 `DEFAULT_VISIBLE`（不进默认列，零代码）。
- spec 版本/发布 → Task 3。
- 类型一致性：字段 key `majorPoc`、label/表头 `是否重大POC`、`options:['是','否']`、`width:120` 在后端测试、前端列定义、前端测试中一致；后端 `FIELDS`=24 与前端 `OPP_FIELDS`=24 对齐（27 列 − 3 auto/derived）。
