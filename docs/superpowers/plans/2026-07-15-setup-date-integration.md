# PMIS 立项日期接入管线 + 多处暴露 实施计划（V3.2.2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 PMIS「立项日期」提取进项目域，并在 /projects、/project/:id、/projects/key 及 temp/payment-key/risk 的范围设置里暴露（列/详情/可排序/可筛选/日期区间）。

**Architecture:** 后端 `pmis._assemble` 在 `status` 子块加 `立项日期`（基础信息优先、状态表兜底），`schema.PmisStatus` 显式声明，`gen:types` 同源前端类型；前端各 lib 把 `status.立项日期` 挂到行对象（存原始 ISO 串保证 el-table 排序正确），各 view 加列/详情/筛选；范围设置复用现成 `kind:'date'` 范式（`finalAcceptDate`），ScopeBuilder/scopeOps/后端 scope 校验零改动。

**Tech Stack:** Python 标准库 + pydantic（后端）；Vue3 + TS + Element Plus + Pinia + vitest（前端）。

## Global Constraints

- 版本 **V3.2.2**（Z 级），单一来源 `frontend/src/version.ts`，只改此处。
- **不使用任何 emoji**；需符号用 `→ ↓ ❌ ✕ ▾`。交流语言简体中文；代码/文件名原文。
- 取数口径：`立项日期` = `base.get("立项日期") or status.get("立项日期") or None`（**不取** `项目中心`，其带时分秒）。
- 行对象存**原始 ISO 串**（不存展示串），排序才正确；展示/筛选/比较统一 `slice(0,10)` 归一 `YYYY-MM-DD`；空值行存 `null`、展示「-」。
- **非纯前端**：改 `pmis.py` + `schema.py`；改 `schema.py` 后**必须**跑 `cd frontend && npm run gen:types` 重生成 `src/types/analysis.ts`。
- **不改**已关闭项目（`/projects/closed` 列表、已关闭详情）、**不加** `projectExport.ts` 导出列。
- ScopeBuilder / `scopeOps.ts` / 后端 `followup_store.normalize_scope` **零改动**（`date` 的 `between/notBetween` 运算符已内建）。
- 改了 `preprocess/pmis` 计算逻辑：**先补/改测试再改实现**（TDD）。完成定义 = 代码改完 且 `verify.sh` 全绿 且 `PROGRESS.md` 更新。

---

### Task 1: 后端提取 status.立项日期 + schema + gen:types

**Files:**
- Modify: `pmis.py`（`_assemble` 的 `status` 块，约 `pmis.py:216-225`）
- Modify: `schema.py`（`PmisStatus` 类，`schema.py:51-59`）
- Test: `tests/test_pmis.py`（新增 `TestSetupDate` 类）
- Regenerate: `frontend/src/types/analysis.ts`（`npm run gen:types` 产出，不手改）

**Interfaces:**
- Produces: `projectPmis[pid].status.立项日期: str | None`（后端 JSON）；前端类型 `PmisStatus.立项日期?: string | null`（gen:types 生成）。Task 2/3 消费。

- [ ] **Step 1: 写失败测试**（`tests/test_pmis.py` 末尾追加）

```python
class TestSetupDate:
    def _tab(self, base_extra=None, status_extra=None):
        base = {"项目编号": "SS-1", "项目名称": "甲"}
        if base_extra:
            base.update(base_extra)
        status = {"项目编号": "SS-1"}
        if status_extra:
            status.update(status_extra)
        return {"base": [base], "center": [{"项目编号": "SS-1"}], "status": [status], "risk": []}

    def test_setup_date_from_base(self):
        # base 与 status 都有时,取 base(基础信息 100% 填充,权威)
        pm = M.build_project_pmis(self._tab({"立项日期": "2019-06-24"}, {"立项日期": "2000-01-01"}), {}, {"SS-1"})
        assert pm["SS-1"]["status"]["立项日期"] == "2019-06-24"

    def test_setup_date_fallback_status(self):
        # base 无、status 有 → 取 status
        pm = M.build_project_pmis(self._tab(None, {"立项日期": "2020-03-19"}), {}, {"SS-1"})
        assert pm["SS-1"]["status"]["立项日期"] == "2020-03-19"

    def test_setup_date_absent_is_none(self):
        pm = M.build_project_pmis(self._tab(), {}, {"SS-1"})
        assert pm["SS-1"]["status"]["立项日期"] is None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_pmis.py::TestSetupDate -q`
Expected: FAIL（`KeyError: '立项日期'`，因 status 块尚无此键）

- [ ] **Step 3: 改 pmis.py**（在 `status` dict 里 `项目类型` 那行之后加一行）

`pmis.py` 当前 `status` 块（`:216-225`）：
```python
        "status": {
            "项目状态": (b.get("项目状态") or s.get("项目状态") or None),
            "是否暂停": paused,
            "评级": (s.get("项目评级") or None),
            "项目级别": (b.get("项目级别") or s.get("项目级别") or None),
            "项目类型": (b.get("项目类型") or s.get("项目类型") or None),
            "评分": parse_pmis_money(b.get("项目评分")),
            "关键动作": (s.get("关键动作完成情况(必须-考核)") or None),
            "交付物": (s.get("交付物上传情况(必须-考核)") or None),
        },
```
改为（在 `"项目类型"` 行后插入 `"立项日期"` 一行）：
```python
        "status": {
            "项目状态": (b.get("项目状态") or s.get("项目状态") or None),
            "是否暂停": paused,
            "评级": (s.get("项目评级") or None),
            "项目级别": (b.get("项目级别") or s.get("项目级别") or None),
            "项目类型": (b.get("项目类型") or s.get("项目类型") or None),
            "立项日期": (b.get("立项日期") or s.get("立项日期") or None),
            "评分": parse_pmis_money(b.get("项目评分")),
            "关键动作": (s.get("关键动作完成情况(必须-考核)") or None),
            "交付物": (s.get("交付物上传情况(必须-考核)") or None),
        },
```

- [ ] **Step 4: 改 schema.py**（`PmisStatus` 加显式字段）

`schema.py` 当前（`:51-59`）：
```python
class PmisStatus(_Base):
    项目状态: Optional[str] = None
    是否暂停: Optional[bool] = None
    评级: Optional[str] = None
    项目级别: Optional[str] = None
    项目类型: Optional[str] = None
    评分: Optional[float] = None
    关键动作: Optional[str] = None
    交付物: Optional[str] = None
```
改为（在 `项目类型` 后加 `立项日期`）：
```python
class PmisStatus(_Base):
    项目状态: Optional[str] = None
    是否暂停: Optional[bool] = None
    评级: Optional[str] = None
    项目级别: Optional[str] = None
    项目类型: Optional[str] = None
    立项日期: Optional[str] = None
    评分: Optional[float] = None
    关键动作: Optional[str] = None
    交付物: Optional[str] = None
```

- [ ] **Step 5: 跑测试确认通过**

Run: `python -m pytest tests/test_pmis.py::TestSetupDate tests/test_schema.py -q`
Expected: PASS（3 例过；schema 测试不回归）

- [ ] **Step 6: 重生成前端类型**

Run: `cd frontend && npm run gen:types`
Expected: 成功；`git diff --stat frontend/src/types/analysis.ts` 显示该文件变化，其中 `PmisStatus` 出现 `立项日期?: string | null`（可 `grep -n 立项日期 frontend/src/types/analysis.ts` 确认）。

- [ ] **Step 7: 提交**

```bash
git add pmis.py schema.py tests/test_pmis.py frontend/src/types/analysis.ts
git commit -m "feat(pmis): 提取立项日期到 projectPmis.status(base优先/status兜底)+schema+gen:types"
```

---

### Task 2: /projects 列 + 行装配 + 详情展示

**Files:**
- Modify: `frontend/src/lib/projectList.ts`（`ProjectRow` 接口 `:8-36`、`buildProjectRows` return `:66-97`）
- Modify: `frontend/src/views/ProjectsView.vue`（`ALL_COLUMNS` `:48-71`、`FILTERABLE` `:74`）
- Modify: `frontend/src/views/ProjectDetailView.vue`（`.pd-meta` `:305-315`）
- Test: `frontend/src/lib/projectList.test.ts`（`describe('buildProjectRows')` 内追加）

**Interfaces:**
- Consumes: Task 1 的 `projectPmis[pid].status.立项日期`。
- Produces: `ProjectRow.setupDate: string | null`（Task 4、Task 5 经 `buildProjectRows` 的 `pr.setupDate` 消费）。

- [ ] **Step 1: 写失败测试**（`projectList.test.ts` 的 `describe('buildProjectRows', ...)` 块内追加一个 `it`）

```ts
  it('setupDate 取 status.立项日期(缺 pmis → null)', () => {
    const withDate = buildProjectRows([proj()], {
      'QABJ-SS-1': { ...(PMIS['QABJ-SS-1'] as any), status: { ...(PMIS['QABJ-SS-1'] as any).status, 立项日期: '2019-06-24' } },
    } as any)[0]
    expect(withDate.setupDate).toBe('2019-06-24')
    expect(buildProjectRows([proj()], {})[0].setupDate).toBeNull()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- projectList`
Expected: FAIL（`Property 'setupDate' does not exist` / `undefined` ≠ `'2019-06-24'`）

- [ ] **Step 3: 改 projectList.ts**

`ProjectRow` 接口（`:8-36`）在 `riskReasons: RiskReason[]` 前加一行：
```ts
  riskReasons: RiskReason[]
  setupDate: string | null
}
```
（即在接口末尾 `}` 前插入 `setupDate: string | null`。）

`buildProjectRows` return 对象（`:66-97`）在 `projectType: status.项目类型 || '-',` 之后加一行：
```ts
      projectType: status.项目类型 || '-',
      setupDate: status.立项日期 ?? null,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- projectList`
Expected: PASS

- [ ] **Step 5: 改 ProjectsView.vue（加列 + 列头筛选，不加默认可见）**

`ALL_COLUMNS`（`:48-71`）在 `contractAmount` 那条之后插入立项日期列：
```ts
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'setupDate', label: '立项日期', width: 110, sortable: true,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
```
`FILTERABLE`（`:74`）加入 `'setupDate'`：
```ts
const FILTERABLE = new Set(['projectManager', 'orgL4', 'stage', 'projectStatus', 'riskLevel', 'projectLevel', 'projectType', 'paymentStatus', 'health', 'top1000', 'quadrant', 'riskReasons', 'signUnit', 'setupDate'])
```
`DEFAULT_VISIBLE`（`:73`）**不改**（不含 `setupDate` → 默认隐藏，选列器可开）。

- [ ] **Step 6: 改 ProjectDetailView.vue（项目编号行末尾展示）**

`.pd-meta`（`:305-315`）在「编号」span（`:306`）后插入一行：
```html
            <span>编号 <b>{{ p.projectId }}</b></span>
            <span>立项日期 <b>{{ fmtDateCell(m.status?.立项日期) }}</b></span>
```
（`fmtDateCell` 已 import 于 `:7`；`m` 为 computed `:58`，模板中 `m.status?.立项日期` 可用，同 `:312` 的 `m.customer?.合同总额`。）

- [ ] **Step 7: 跑 vitest + typecheck**

Run: `cd frontend && npm run test:run -- projectList && npm run typecheck`
Expected: PASS（vitest 绿；tsc 无 setupDate 相关报错）

- [ ] **Step 8: 提交**

```bash
git add frontend/src/lib/projectList.ts frontend/src/lib/projectList.test.ts frontend/src/views/ProjectsView.vue frontend/src/views/ProjectDetailView.vue
git commit -m "feat(projects): /projects 立项日期列(默认隐藏/排序/列头筛选)+详情项目编号行展示"
```

---

### Task 3: /projects/key 列 + 列头筛选

**Files:**
- Modify: `frontend/src/lib/keyProjects.ts`（`KeyProjectRow` 接口 `:13-20`、`buildProgressRowBase` return `:46-66`）
- Modify: `frontend/src/views/KeyProjectsView.vue`（`ALL_COLUMNS` `:57-73`、`DEFAULT_VISIBLE` `:75`、`FILTERABLE` `:76`）
- Test: `frontend/src/lib/keyProjects.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `status.立项日期`（`buildProgressRowBase` 内 `st = m.status`）。
- Produces: `KeyProjectRow.setupDate: string | null`（仅本页用）。

- [ ] **Step 1: 写失败测试**（`keyProjects.test.ts` 的 `describe('buildKeyProjectRows', ...)` 后追加一个 `describe`）

```ts
describe('buildProgressRowBase setupDate', () => {
  it('setupDate 取 st.立项日期(缺→null)', () => {
    const r = buildProgressRowBase(proj(), pmis({ status: { 项目级别: 'P3', 立项日期: '2020-03-19' } }), {})
    expect(r.setupDate).toBe('2020-03-19')
    expect(buildProgressRowBase(proj(), pmis(), {}).setupDate).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- keyProjects`
Expected: FAIL（`Property 'setupDate' does not exist` / `undefined`）

- [ ] **Step 3: 改 keyProjects.ts**

`KeyProjectRow` 接口（`:13-20`）在末尾 `followDate: string; followBy: string` 那行后、`}` 前加：
```ts
  followDate: string; followBy: string
  setupDate: string | null
}
```
`buildProgressRowBase` return（`:46-66`）在 `projectLevel: v(st.项目级别, '-'),` 之后加一行（存原始 ISO 串，列 formatter 负责 slice 展示）：
```ts
    projectLevel: v(st.项目级别, '-'),
    setupDate: st.立项日期 ?? null,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- keyProjects`
Expected: PASS（注意：`tempFollowup.test.ts` 里有「buildProgressRowBase 与 buildKeyProjectRows 输出一致」的相等断言，加同一字段两侧同步，不会破坏。）

- [ ] **Step 5: 改 KeyProjectsView.vue（加列 + 默认隐藏 + 列头筛选）**

`ALL_COLUMNS`（`:57-73`，`withSortable([...])` 内）在 `contractWan` 那条之后插入：
```ts
  { key: 'contractWan', label: '合同金额(万)', width: 110, sortable: true, num: true,
    formatter: (v) => (v == null ? '-' : Number(v).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'setupDate', label: '立项日期', width: 110,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
```
（`withSortable` 会自动补 `sortable`，`setupDate` 不在 `NON_SORTABLE_KEYS` → 可排。）

`DEFAULT_VISIBLE`（`:75`）改为排除 setupDate（与 /projects 一致，默认隐藏可开）：
```ts
const DEFAULT_VISIBLE = ALL_KEYS.filter((k) => k !== 'setupDate')
```
`FILTERABLE`（`:76`）加入 `'setupDate'`：
```ts
const FILTERABLE = new Set(['projectLevel', 'projectManager', 'ar', 'sr', 'orgL4', 'riskLevel', 'followBy', 'followDate', 'setupDate'])
```

- [ ] **Step 6: 跑 vitest + typecheck**

Run: `cd frontend && npm run test:run -- keyProjects && npm run typecheck`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/keyProjects.ts frontend/src/lib/keyProjects.test.ts frontend/src/views/KeyProjectsView.vue
git commit -m "feat(projects-key): /projects/key 立项日期列(默认隐藏/排序/列头筛选)"
```

---

### Task 4: temp + payment-key 范围设置 date 字段

**Files:**
- Modify: `frontend/src/lib/tempScope.ts`（`FIELD_CATALOG` `:36-82`）
- Modify: `frontend/src/lib/tempFollowup.ts`（`buildScopeInputs.proj` `:59-88`）
- Test: `frontend/src/lib/tempFollowup.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `ProjectRow.setupDate`（`buildScopeInputs` 内 `pr = prMap.get(...)`，`pr.setupDate`）。
- Produces: 范围设置 `project` 组多一个 `{ key:'setupDate', kind:'date' }` 字段（temp 与 payment-key 共享同一 `FIELD_CATALOG` + `buildScopeInputs` + `projectMatches`，一处改两页生效）。

- [ ] **Step 1: 写失败测试**（`tempFollowup.test.ts`）

先确保顶部有 `ScopeFilter` 类型 import（当前 `:4` 仅 `import { projectMatches } from './tempScope'`）：改为
```ts
import { projectMatches, type ScopeFilter } from './tempScope'
```
在文件末尾追加：
```ts
describe('buildScopeInputs 立项日期', () => {
  const withSetup = () => ({
    P1: { ...(pmis().P1 as any), status: { ...(pmis().P1 as any).status, 立项日期: '2024-01-15' } },
  })
  it('proj.setupDate 取 status.立项日期(归一 10 位)', () => {
    const inputs = buildScopeInputs([proj({})], withSetup() as any, undefined, undefined)
    expect(inputs[0].proj.setupDate).toBe('2024-01-15')
  })
  it('projectMatches:立项日期 between 命中/不命中', () => {
    const inputs = buildScopeInputs([proj({})], withSetup() as any, undefined, undefined)
    const scope = (min: string, max: string): ScopeFilter => ({
      combinator: 'AND',
      groups: [{ combinator: 'AND', conditions: [{ group: 'project', field: 'setupDate', op: 'between', min, max } as any] }],
    })
    expect(projectMatches(inputs[0], scope('2024-01-01', '2024-12-31'))).toBe(true)
    expect(projectMatches(inputs[0], scope('2025-01-01', '2025-12-31'))).toBe(false)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- tempFollowup`
Expected: FAIL（`proj.setupDate` 为 `undefined`；between 用 `undefined` 比较不命中）

- [ ] **Step 3: 改 tempScope.ts（catalog 加 date 字段）**

`FIELD_CATALOG`（`:36-82`）在 project 组的 `finalAcceptDate` 那条之后插入：
```ts
  { group: 'project', key: 'finalAcceptDate', label: '终验时间', kind: 'date' },
  { group: 'project', key: 'setupDate', label: '立项日期', kind: 'date' },
```

- [ ] **Step 4: 改 tempFollowup.ts（buildScopeInputs.proj 加 setupDate）**

`buildScopeInputs` 的 `proj` 对象（`:59-88`）在 `finalAcceptDate: String(prog.终验时间 ?? '').slice(0, 10),` 之后加一行（读 `pr.setupDate`）：
```ts
        finalAcceptDate: String(prog.终验时间 ?? '').slice(0, 10),
        setupDate: String(pr?.setupDate ?? '').slice(0, 10),
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- tempFollowup`
Expected: PASS

- [ ] **Step 6: 跑 typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/tempScope.ts frontend/src/lib/tempFollowup.ts frontend/src/lib/tempFollowup.test.ts
git commit -m "feat(scope): temp/payment-key 范围设置加立项日期(date,区间筛选)"
```

---

### Task 5: risk 范围设置 date 字段

**Files:**
- Modify: `frontend/src/lib/riskRows.ts`（`buildRiskRows` 行 `:40-67`、`RISK_SCOPE_CATALOG` `:86-112`）
- Test: `frontend/src/lib/riskRows.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `ProjectRow.setupDate`（`buildRiskRows` 内 `pr = prMap.get(...)`）。
- Produces: risk 单表范围目录多一个 `{ key:'立项日期', kind:'date' }`。

- [ ] **Step 1: 写失败测试**（`riskRows.test.ts` 末尾追加；`ScopeFilter`/`RISK_SCOPE_CATALOG`/`buildRiskRows`/`riskRowMatches` 已在 `:1-3` import）

```ts
describe('buildRiskRows 立项日期 + scope date', () => {
  const ps = [{ projectId: 'P1', projectName: '甲', projectManager: '张三', orgL4: '一组', paymentPmis: { contract: 2_000_000 } }] as any
  const mk = (立项日期?: string) => ({
    P1: { status: { 项目级别: 'P1', ...(立项日期 ? { 立项日期 } : {}) },
          riskRecords: [{ 风险编码: 'FX-1', 风险名称: 'x', 风险等级: '高', 风险状态: '未关闭', 项目编号: 'P1' }] },
  }) as any
  it('行含 立项日期(取自项目域 setupDate)', () => {
    expect(buildRiskRows(ps, mk('2019-06-24'), {})[0]['立项日期']).toBe('2019-06-24')
    expect(buildRiskRows(ps, mk(), {})[0]['立项日期']).toBeNull()
  })
  it('RISK_SCOPE_CATALOG 含 立项日期(date) + riskRowMatches between', () => {
    expect(RISK_SCOPE_CATALOG.find((f) => f.key === '立项日期')?.kind).toBe('date')
    const row = buildRiskRows(ps, mk('2019-06-24'), {})[0]
    const scope: ScopeFilter = { combinator: 'AND', groups: [{ combinator: 'AND',
      conditions: [{ field: '立项日期', op: 'between', min: '2019-01-01', max: '2019-12-31' } as any] }] }
    expect(riskRowMatches(row, scope)).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- riskRows`
Expected: FAIL（`row['立项日期']` 为 `undefined`；catalog 找不到该字段）

- [ ] **Step 3: 改 riskRows.ts（行加立项日期）**

`buildRiskRows` 行对象（`:40-67`）在 `'项目状态': s(status['项目状态']),` 之后加一行（读 `pr.setupDate`）：
```ts
        '项目状态': s(status['项目状态']),
        '立项日期': pr?.setupDate ?? null,
```

- [ ] **Step 4: 改 riskRows.ts（目录加 date 字段）**

`RISK_SCOPE_CATALOG`（`:86-112`）在 `{ key: '项目状态', label: '项目状态', kind: 'enum' as FieldKind },` 之后加一行：
```ts
  { key: '项目状态', label: '项目状态', kind: 'enum' as FieldKind },
  { key: '立项日期', label: '立项日期', kind: 'date' as FieldKind },
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- riskRows`
Expected: PASS

- [ ] **Step 6: 跑 typecheck**

Run: `cd frontend && npm run typecheck`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/riskRows.ts frontend/src/lib/riskRows.test.ts
git commit -m "feat(scope): /risk 范围设置加立项日期(date,区间筛选)"
```

---

### Task 6: 版本号 + 全量验证 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`（版本条目）

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts`：
```ts
export const APP_VERSION = 'V3.2.2'
export const RELEASE_DATE = '2026-07-15'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（后端 py 编译 + ruff + pytest；前端 typecheck + vitest + build）。

- [ ] **Step 3: 更新 PROGRESS.md**

在 PROGRESS.md 顶部版本区加 V3.2.2 条目：一句话结论（立项日期接入管线 + /projects、/projects/key 加列、/project/:id 详情、temp/payment-key/risk 范围设置日期字段；非纯前端，升级须换 py+重启+点更新数据），标 `[~]` 或按当时状态。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V3.2.2 版本号 + PROGRESS(立项日期接入)"
```

---

## 执行说明（并行提示）

Task 1 是后端基座（含 gen:types），必须先完成。Task 2 产出 `ProjectRow.setupDate`，是 Task 4/5 的前置。可行的并行波次：
- 波次 A：Task 1（后端，单独）。
- 波次 B：Task 2、Task 3（前端，改文件互不相交，可并行；Task 3 只依赖 Task 1）。
- 波次 C：Task 4、Task 5（改文件互不相交，可并行；均依赖 Task 2 的 `ProjectRow.setupDate`）。
- 波次 D：Task 6（版本 + verify + PROGRESS）。

控制者对每波并行子代理各改各文件、各跑各自 targeted vitest、不各自 commit；每波结束串行审查 diff + 串行提交，最后一次合并 typecheck/build + opus 终审。浏览器目验（改口径/数据层）在合并后手动：点「更新数据」重跑管线，核对各处立项日期有值、排序/列头筛选/范围设置日期区间生效、深色主题正常。

## 自审记录

- **Spec 覆盖**：①接管线→Task1；②/projects 列(排序/筛选/默认隐藏)→Task2；③/project/:id 详情→Task2;④/projects/key→Task3;范围设置 temp/payment-key→Task4、risk→Task5;版本/验证→Task6。无遗漏。
- **不改项**（已关闭项目、导出列、ScopeBuilder/scopeOps/后端 scope 校验）：计划无涉及，符合约束。
- **类型一致**：`setupDate: string | null`（ProjectRow/KeyProjectRow）；行存原始 ISO、formatter slice(0,10) 展示；scope 侧 `String(pr?.setupDate ?? '').slice(0,10)`（proj）与 `pr?.setupDate ?? null`（risk 行，inRange 内部 slice）；catalog key：temp/payment 用 `setupDate`、risk 用 `立项日期`（与各自行键一致）。前后一致。
