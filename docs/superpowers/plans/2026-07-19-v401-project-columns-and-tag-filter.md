# V4.0.1 实施计划：/projects 三个日期列 + 标签筛选下沉 + temp 选列补齐

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `/projects` 增加「原项目立项日期 / 计划终验时间 / 实际终验时间」三个默认隐藏列，同步进 `/projects/temp` 与 `/project/:id`，补齐 temp 漏掉的立项日期选列，并把 `/projects` 的标签筛选从工具栏下沉到表头列筛选。

**Architecture:** 三列的数据来源截然不同——计划终验时间后端**已存在**（`progress.终验时间`）只是从未暴露；原项目立项日期是纯前端派生（索引 `pmisMap[relatedClosedId]`）；只有实际终验时间需要新增后端管线字段。因此后端只做一件事（Task 1），其余全是前端消费方，按**文件所有权**切分任务以支持并行。

**Tech Stack:** Python 3.8+ 标准库 + pydantic(schema) + pytest / Vue3 + Vite + TS + Pinia + Element Plus + vitest

**Spec:** `docs/superpowers/specs/2026-07-19-v410-project-columns-and-tag-filter-design.md`

---

## Global Constraints

以下约束对**每个任务**都生效，实现者与审查者都必须逐条核对：

1. **不使用任何 emoji**。需要符号时用 `→ ↓ ❌ ✕ ▾`。（CLAUDE.md 铁律）
2. **交流语言简体中文**，代码/命令/文件名保持原文。
3. **`tempScope.ts` 的字段 key `finalAcceptDate` 严禁改名**，本版只改它的 `label`（「终验时间」→「计划终验时间」）。`data/temp_followup.json` 里用户已保存的范围条件按该 key 序列化，改名会让已配好的范围**静默失效**（条件仍显示、但永远匹配不到，且无任何报错）。
4. **新增字段 key 固定为**：`originSetupDate`（原项目立项日期）、`plannedFinalAcceptDate`（计划终验时间）、`actualFinalAcceptDate`（实际终验时间）。三个名字在所有文件中必须逐字一致。
5. **后端新增字段名固定为** `实际终验时间`（中文，与既有 `终验时间` 并列于 `PmisProgress`）。
6. **三个新列一律不进 `DEFAULT_VISIBLE`**（默认隐藏）。唯一例外是 `tags` 列——它要**加进** `/projects` 的 `DEFAULT_VISIBLE`，理由见 Task 5。
7. **口径单一来源**：判定逻辑只在前端 `lib/`，后端不得复刻；反之后端已算好的（如 `终验时间`）前端不得重算。
8. **改了 `preprocess_data.py` 的计算逻辑，先补/改测试再改实现**（CLAUDE.md §6）。
9. **完成的定义** = 代码改完 **且** `bash verify.sh` 全绿 **且** `PROGRESS.md` 已更新。
10. **不动 `lts/`**。`lts/milestones.py` 是精简变体的独立副本，本版不同步；且须确认根目录 pytest 未连带跑挂 lts 用例（本仓 V3.2.3 踩过 lts 污染 master 根 pytest 的坑）。

---

## 文件结构与任务依赖

按**文件所有权**切分——同一个文件的所有改动归属同一个任务，任务之间文件零重叠，因此同波次任务可安全并行。

| 任务 | 独占文件 | 依赖 |
|---|---|---|
| T1 后端实际终验时间 | `milestones.py` `preprocess_data.py` `schema.py` `tests/test_milestones.py` `tests/test_schema.py` `frontend/src/types/analysis.ts` | 无 |
| T2 /project/:id 原项目立项日期 | `frontend/src/views/ProjectDetailView.{vue,test.ts}` | 无 |
| T3 projectList 数据层 | `frontend/src/lib/projectList.{ts,test.ts}` | T1 |
| T4 temp 数据层三件套 | `frontend/src/lib/keyProjects.{ts,test.ts}` `tempScope.{ts,test.ts}` `tempFollowup.{ts,test.ts}` | T1 |
| T5 /projects 视图层 | `frontend/src/views/ProjectsView.{vue,test.ts}` | T3 |
| T6 /projects/temp 视图层 | `frontend/src/views/TempFollowupView.{vue,test.ts}` | T4 |
| T7 收尾 | `frontend/src/version.ts` `PROGRESS.md` `deploy/升级手册-V4.0.1.md` | T1..T6 |

**并行波次**（最多 2 个并行，受依赖限制，不受 6 个上限限制）：

```
Wave 1:  T1 ‖ T2
Wave 2:  T3 ‖ T4        (都依赖 T1 产出的 analysis.ts 类型)
Wave 3:  T5 ‖ T6        (T5 依赖 T3;T6 依赖 T4)
Wave 4:  T7             (串行收尾)
```

---

### Task 1: 后端新增「实际终验时间」管线字段

**Files:**
- Modify: `milestones.py:182-188`（新增孪生函数）
- Modify: `preprocess_data.py:86-91`（`backfill_final_acceptance` 回填两个字段）
- Modify: `schema.py:37-41`（`PmisProgress` 加字段）
- Modify: `tests/test_milestones.py:111-119`（新增用例，不改既有）
- Modify: `tests/test_preprocess.py`（新增回填用例）
- Modify: `tests/test_schema.py`（新增用例）
- Regenerate: `frontend/src/types/analysis.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `milestones.final_acceptance_actual_date(items: List[Dict], project_type: Any) -> Optional[str]`
  - `project_pmis[pid]["progress"]["实际终验时间"]`：`Optional[str]`，`YYYY-MM-DD` 或 `None`
  - `schema.PmisProgress.实际终验时间: Optional[str]`
  - 前端类型：`analysis.ts` 中 `PmisProgress` 多出 `实际终验时间?` 字段（供 T3/T4 消费）

**背景（实现者必读）：** `milestones.py:182` 已有 `final_acceptance_date()`，口径是「售前服务类→取『服务完成』里程碑的 `planDate`，其他→取『终验』的 `planDate`」。本任务要加的是它的孪生函数，target 选择规则**完全相同**，只是取 `actualDate`。既有函数原文：

```python
def final_acceptance_date(items: List[Dict[str, Any]], project_type: Any) -> Optional[str]:
    """按项目类型取里程碑计划日:售前服务类→服务完成.planDate,否则→终验.planDate。缺/空→None。"""
    target = "服务完成" if str(project_type or "").strip() == config.PRESALE_PROJECT_TYPE else "终验"
    for it in items or []:
        if it.get("name") == target:
            return it.get("planDate") or None
    return None
```

- [ ] **Step 1: 写失败测试（milestones 孪生函数）**

在 `tests/test_milestones.py` 的 `test_final_acceptance_date` 之后追加：

```python
def test_final_acceptance_actual_date():
    import milestones as M
    items = [{"name": "终验", "planDate": "2026-07-01", "actualDate": "2026-07-15"},
             {"name": "服务完成", "planDate": "2026-08-01", "actualDate": "2026-08-20"}]
    assert M.final_acceptance_actual_date(items, "实施项目") == "2026-07-15"      # 非售前→终验
    assert M.final_acceptance_actual_date(items, "售前服务类") == "2026-08-20"    # 售前→服务完成
    # 计划已排、实际未发生:必须 None,不能回退成 planDate
    assert M.final_acceptance_actual_date(
        [{"name": "终验", "planDate": "2026-07-01", "actualDate": ""}], "实施项目") is None
    assert M.final_acceptance_actual_date(
        [{"name": "初验", "actualDate": "2026-06-01"}], "实施项目") is None
    assert M.final_acceptance_actual_date([], "售前服务类") is None


def test_final_acceptance_pair_shares_target_rule():
    """计划与实际必须用同一套 target 选择规则 —— 两函数对同一项目必须命中同一个里程碑。"""
    import milestones as M
    items = [{"name": "终验", "planDate": "2026-07-01", "actualDate": "2026-07-15"},
             {"name": "服务完成", "planDate": "2026-08-01", "actualDate": "2026-08-20"}]
    for ptype in ("实施项目", "售前服务类"):
        plan = M.final_acceptance_date(items, ptype)
        actual = M.final_acceptance_actual_date(items, ptype)
        hit = next(i for i in items if i["planDate"] == plan)
        assert hit["actualDate"] == actual
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_milestones.py::test_final_acceptance_actual_date -v`
Expected: FAIL —— `AttributeError: module 'milestones' has no attribute 'final_acceptance_actual_date'`

- [ ] **Step 3: 实现孪生函数**

替换 `milestones.py:182-188` 的整块为（把 target 选择抽成私有函数，杜绝两处各写一遍）：

```python
def _final_acceptance_target(project_type: Any) -> str:
    """计划/实际两个取数口径共用的里程碑选择规则:售前服务类看「服务完成」,其他看「终验」。
    抽出来是为了让两个函数不可能漂移 —— 改规则只有这一处。"""
    return "服务完成" if str(project_type or "").strip() == config.PRESALE_PROJECT_TYPE else "终验"


def _final_acceptance_field(items: List[Dict[str, Any]], project_type: Any, field: str) -> Optional[str]:
    target = _final_acceptance_target(project_type)
    for it in items or []:
        if it.get("name") == target:
            return it.get(field) or None
    return None


def final_acceptance_date(items: List[Dict[str, Any]], project_type: Any) -> Optional[str]:
    """按项目类型取里程碑计划日:售前服务类→服务完成.planDate,否则→终验.planDate。缺/空→None。"""
    return _final_acceptance_field(items, project_type, "planDate")


def final_acceptance_actual_date(items: List[Dict[str, Any]], project_type: Any) -> Optional[str]:
    """同 final_acceptance_date,但取实际完成日 actualDate。计划已排而实际未发生→None(不回退 planDate)。"""
    return _final_acceptance_field(items, project_type, "actualDate")
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_milestones.py -v`
Expected: PASS —— 含既有 `test_final_acceptance_date`（不得回归）

- [ ] **Step 5: 写失败测试（回填两个字段）**

在 `tests/test_preprocess.py` 末尾追加（被测函数 `backfill_final_acceptance` 定义在 `preprocess_data.py`，测试按模块归位，不要放进 `test_milestones.py`）：

```python
def test_backfill_final_acceptance_fills_both_fields():
    import preprocess_data as P
    project_pmis = {
        "P1": {"status": {"项目类型": "实施项目"}},
        "P2": {"status": {"项目类型": "售前服务类"}},
        "P3": {"status": {"项目类型": "实施项目"}},
    }
    project_milestones = {
        "P1": [{"name": "终验", "planDate": "2026-07-01", "actualDate": "2026-07-15"}],
        "P2": [{"name": "服务完成", "planDate": "2026-08-01", "actualDate": "2026-08-20"}],
        # P3:计划已排,实际未发生
        "P3": [{"name": "终验", "planDate": "2026-09-01", "actualDate": ""}],
    }
    P.backfill_final_acceptance(project_pmis, project_milestones)
    assert project_pmis["P1"]["progress"]["终验时间"] == "2026-07-01"
    assert project_pmis["P1"]["progress"]["实际终验时间"] == "2026-07-15"
    assert project_pmis["P2"]["progress"]["终验时间"] == "2026-08-01"
    assert project_pmis["P2"]["progress"]["实际终验时间"] == "2026-08-20"
    # 实际未发生 → None,键必须存在(前端按 undefined/None 显 '-',缺键会让 schema 与前端类型不一致)
    assert project_pmis["P3"]["progress"]["终验时间"] == "2026-09-01"
    assert project_pmis["P3"]["progress"]["实际终验时间"] is None
    assert "实际终验时间" in project_pmis["P3"]["progress"]


def test_backfill_final_acceptance_keeps_existing_progress_keys():
    """回填是就地 setdefault + 赋值,不能把 progress 里既有的键冲掉。"""
    import preprocess_data as P
    project_pmis = {"P1": {"status": {"项目类型": "实施项目"},
                           "progress": {"完工进展": 0.8, "项目阶段": "实施"}}}
    P.backfill_final_acceptance(project_pmis, {"P1": [{"name": "终验", "actualDate": "2026-07-15"}]})
    assert project_pmis["P1"]["progress"]["完工进展"] == 0.8
    assert project_pmis["P1"]["progress"]["项目阶段"] == "实施"
    assert project_pmis["P1"]["progress"]["实际终验时间"] == "2026-07-15"
```

- [ ] **Step 6: 运行测试确认失败**

Run: `python -m pytest tests/test_preprocess.py::test_backfill_final_acceptance_fills_both_fields -v`
Expected: FAIL —— `KeyError: '实际终验时间'`

- [ ] **Step 7: 实现回填**

替换 `preprocess_data.py:86-91` 的整个 `backfill_final_acceptance` 为：

```python
def backfill_final_acceptance(project_pmis, project_milestones):
    """把里程碑的终验/服务完成日回填到 project_pmis[pid].progress(就地修改):
    终验时间=计划日(planDate)、实际终验时间=实际完成日(actualDate)。
    两者共用 milestones 的 target 选择规则(售前看服务完成、其他看终验),口径不会漂移。"""
    for pid, pm in project_pmis.items():
        ptype = (pm.get("status") or {}).get("项目类型")
        items = project_milestones.get(pid, [])
        prog = pm.setdefault("progress", {})
        prog["终验时间"] = milestones_mod.final_acceptance_date(items, ptype)
        prog["实际终验时间"] = milestones_mod.final_acceptance_actual_date(items, ptype)
```

- [ ] **Step 8: 运行测试确认通过**

Run: `python -m pytest tests/test_milestones.py tests/test_preprocess.py -v`
Expected: PASS

- [ ] **Step 9: 加 schema 字段与用例**

`schema.py` 的 `PmisProgress`（`:37-41`）改为：

```python
class PmisProgress(_Base):
    完工进展: Optional[float] = None
    里程碑进度状态: Optional[str] = None
    项目阶段: Optional[str] = None
    终验时间: Optional[str] = None
    实际终验时间: Optional[str] = None
```

在 `tests/test_schema.py` 末尾追加：

```python
def test_pmis_progress_has_actual_final_acceptance():
    import schema
    assert {"终验时间", "实际终验时间"} <= set(schema.PmisProgress.model_fields)
    p = schema.PmisProgress(**{"终验时间": "2026-07-01", "实际终验时间": "2026-07-15"})
    assert p.实际终验时间 == "2026-07-15"
    # 缺省必须是 None,不是空串 —— 前端按 null 判空显 '-'
    assert schema.PmisProgress().实际终验时间 is None
```

- [ ] **Step 10: 运行后端全量测试**

Run: `python -m pytest -q`
Expected: PASS，无 failure。

**注意**：若输出里出现 `lts/` 目录下的用例，说明根 pytest 收集范围有误（本仓 V3.2.3 踩过），停下来报告，不要自行调整 lts。

- [ ] **Step 11: 重新生成前端类型**

Run: `cd frontend && npm run gen:types`
Expected: `frontend/src/types/analysis.ts` 被重写。

验证生成结果确实包含新字段：

Run: `cd frontend && grep -n "实际终验时间" src/types/analysis.ts`
Expected: 至少 1 行命中。若无命中，说明 `gen:types` 没跑成功或 schema 没改对，**不要手改 analysis.ts**（它是生成产物）。

- [ ] **Step 12: 前端 typecheck**

Run: `cd frontend && npm run typecheck`
Expected: 0 error。（此时还没有消费方，只验证生成的类型本身合法）

- [ ] **Step 13: 提交**

```bash
git add milestones.py preprocess_data.py schema.py tests/test_milestones.py tests/test_preprocess.py tests/test_schema.py frontend/src/types/analysis.ts
git commit -m "feat(milestones): 新增实际终验时间管线字段

final_acceptance_actual_date 与既有 final_acceptance_date 共用
_final_acceptance_target 选择规则(售前看服务完成/其他看终验),
杜绝两处口径漂移。backfill 一并回填 progress.实际终验时间。
计划已排而实际未发生时为 None,不回退 planDate。"
```

---

### Task 2: `/project/:id` 原项目选项卡增加「原项目立项日期」

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue:266-275`
- Test: `frontend/src/views/ProjectDetailView.test.ts`

**Interfaces:**
- Consumes: 无（`page.value.closedPmis` 已存在）
- Produces: 无（其他任务不依赖本任务）

**背景（实现者必读）：** 该文件已有 `originInfo` 计算属性，渲染原项目选项卡的信息行。`cm` 是 `page.value.closedPmis`（**原项目**的 PMIS 数据）。现有代码原文：

```ts
const cm = computed(() => (page.value.closedPmis ?? {}) as Record<string, any>)
const originInfo = computed(() => [
  { k: '原项目编号', v: page.value.closedId || '-' },
  { k: '原项目名称', v: cm.value.team?.项目名称 || '-' },
  { k: '项目经理', v: cm.value.team?.项目经理 || '-' },
  ...
])
```

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/ProjectDetailView.test.ts` 中追加（如文件已有 mount 辅助函数与 fixture，复用之；下面的 fixture 字段名以本文件既有 fixture 为准，只需确保 `closedPmis.status.立项日期` 有值）：

```ts
it('原项目选项卡展示原项目立项日期(取原项目的 status.立项日期,不是本项目的)', async () => {
  const wrapper = await mountDetail({
    project: { projectId: 'SS-1', isPresale: true, relatedClosedId: 'OLD-9' },
    pmis: { 'SS-1': { status: { 立项日期: '2026-01-01' } },
            'OLD-9': { status: { 立项日期: '2024-03-15' }, team: { 项目名称: '原项目甲' } } },
  })
  const originTab = wrapper.find('[data-test="pd-origin-info"]')
  expect(originTab.text()).toContain('原项目立项日期')
  expect(originTab.text()).toContain('2024-03-15')
  // 反向断言:绝不能显示本项目的立项日期 —— 两者都是合法日期,写错不会报错,只能靠这条抓
  expect(originTab.text()).not.toContain('2026-01-01')
})
```

若 `originInfo` 渲染处尚无 `data-test="pd-origin-info"` 锚点，在 Step 3 一并加上（加在包裹 `originInfo` 的容器元素上）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts -t '原项目立项日期'`
Expected: FAIL —— 找不到「原项目立项日期」文本。

- [ ] **Step 3: 实现**

在 `originInfo` 数组中，「原项目名称」之后插入一行：

```ts
  { k: '原项目名称', v: cm.value.team?.项目名称 || '-' },
  { k: '原项目立项日期', v: cm.value.status?.立项日期 || '-' },
  { k: '项目经理', v: cm.value.team?.项目经理 || '-' },
```

同时确认包裹 `originInfo` 渲染结果的容器带有 `data-test="pd-origin-info"`，没有则加上。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: PASS，该文件既有用例不得回归。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(project-detail): 原项目选项卡展示原项目立项日期

取 closedPmis.status.立项日期(原项目),不是本项目的 status。
测试带反向断言:两者都是合法日期,取错不会报错,只能靠断言抓。"
```

---

### Task 3: `projectList.ts` 数据层——三个新字段 + 移除 tags 筛选

**Files:**
- Modify: `frontend/src/lib/projectList.ts:1-5`（import）、`:7-36`（`ProjectRow`）、`:39-47`（`ProjectFilters`）、`:59-95`（`buildProjectRows`）、`:112`（`applyProjectFilters`）
- Test: `frontend/src/lib/projectList.test.ts`

**Interfaces:**
- Consumes: T1 产出的 `analysis.ts` 中 `PmisProgress.实际终验时间`
- Produces（T5 依赖）：
  - `ProjectRow.originSetupDate: string | null`
  - `ProjectRow.plannedFinalAcceptDate: string | null`
  - `ProjectRow.actualFinalAcceptDate: string | null`
  - `ProjectFilters` **不再有** `tags` 字段

**背景（实现者必读）：** `buildProjectRows(projects, pmisMap, assignments)` 的函数体内已有局部变量：

```ts
const m = (pmisMap[p.projectId] ?? {}) as Record<string, any>
const prog = m.progress ?? {}
const status = m.status ?? {}
```

注意 `status` 是**当前项目**的。原项目立项日期必须从 `pmisMap[p.relatedClosedId]` 取，**不能**用 `status`。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/lib/projectList.test.ts` 追加：

```ts
describe('V4.0.1 三个日期字段', () => {
  const pmisMap = {
    'SS-1': { status: { 立项日期: '2026-01-01' },
              progress: { 终验时间: '2026-08-01', 实际终验时间: '2026-08-20' } },
    'OLD-9': { status: { 立项日期: '2024-03-15' } },
    'N-1': { status: { 立项日期: '2025-05-05' },
             progress: { 终验时间: '2026-07-01', 实际终验时间: null } },
  } as any

  it('售前项目的 originSetupDate 取原项目的立项日期', () => {
    const rows = buildProjectRows(
      [{ projectId: 'SS-1', isPresale: true, relatedClosedId: 'OLD-9' } as any], pmisMap)
    expect(rows[0].originSetupDate).toBe('2024-03-15')
    // 反向断言:绝不能等于本项目立项日期 —— 取错不会报错
    expect(rows[0].originSetupDate).not.toBe('2026-01-01')
    expect(rows[0].setupDate).toBe('2026-01-01')
  })

  it('无 relatedClosedId 的项目 originSetupDate 为 null', () => {
    const rows = buildProjectRows([{ projectId: 'N-1' } as any], pmisMap)
    expect(rows[0].originSetupDate).toBeNull()
  })

  it('relatedClosedId 指向不存在的项目时为 null,不抛错', () => {
    const rows = buildProjectRows(
      [{ projectId: 'SS-1', relatedClosedId: 'NOT-EXIST' } as any], pmisMap)
    expect(rows[0].originSetupDate).toBeNull()
  })

  it('计划/实际终验时间直取 progress,不重算', () => {
    const rows = buildProjectRows([{ projectId: 'SS-1' } as any], pmisMap)
    expect(rows[0].plannedFinalAcceptDate).toBe('2026-08-01')
    expect(rows[0].actualFinalAcceptDate).toBe('2026-08-20')
  })

  it('实际终验为 null 时字段为 null,不落成空串', () => {
    const rows = buildProjectRows([{ projectId: 'N-1' } as any], pmisMap)
    expect(rows[0].plannedFinalAcceptDate).toBe('2026-07-01')
    expect(rows[0].actualFinalAcceptDate).toBeNull()
  })

  it('progress 整体缺失时两个终验字段均为 null', () => {
    const rows = buildProjectRows([{ projectId: 'OLD-9' } as any], pmisMap)
    expect(rows[0].plannedFinalAcceptDate).toBeNull()
    expect(rows[0].actualFinalAcceptDate).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts -t 'V4.0.1'`
Expected: FAIL —— `originSetupDate` 等属性不存在（undefined ≠ 期望值）。

- [ ] **Step 3: 实现三个字段**

`ProjectRow` 接口在 `setupDate: string | null` 之后追加：

```ts
  setupDate: string | null
  originSetupDate: string | null
  plannedFinalAcceptDate: string | null
  actualFinalAcceptDate: string | null
```

`buildProjectRows` 的返回对象里，在 `setupDate: status.立项日期 ?? null,` 之后追加：

```ts
      setupDate: status.立项日期 ?? null,
      // 原项目立项日期:读的是【另一个项目】的 PMIS 记录。不要误用上面的局部变量 status
      // ——那是本项目的,用它会让每个售前项目显示自己的立项日期,而且两者都是合法日期、不会报错。
      originSetupDate: p.relatedClosedId
        ? (((pmisMap[p.relatedClosedId] ?? {}) as Record<string, any>).status?.立项日期 ?? null)
        : null,
      // 终验两列直取后端已回填的口径(preprocess.backfill_final_acceptance),前端不重算
      plannedFinalAcceptDate: prog.终验时间 ?? null,
      actualFinalAcceptDate: prog.实际终验时间 ?? null,
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts`
Expected: PASS

- [ ] **Step 5: 移除 tags 筛选（死代码清理）**

标签筛选下沉到表头列筛选后（T5 做视图层），`ProjectFilters.tags` 再无写入方，一并清理：

1. `ProjectFilters` 接口删除 `tags: string[]` 一行。
2. `applyProjectFilters` 删除这一行：
   ```ts
   if (f.tags && f.tags.length && !tagMatch(r.tags ?? [], f.tags)) return false
   ```
3. 文件顶部删除 `import { tagMatch } from './tagFilter'`。

**严禁删除 `frontend/src/lib/tagFilter.ts` 本身**——`tagMatch`/`tagFilterOptions` 另有 5 个页面在用（`/costdetail`、`/insight`、`/milestone`、`/payment/nodes`、`/payment/projects`）。本步只解除 `projectList.ts` 对它的依赖。

4. 删除 `projectList.test.ts` 中断言 `f.tags` 过滤行为的用例（若有）。

**保留** `ProjectRow.tags?: string[]` 字段——表头列筛选正是筛它。

- [ ] **Step 6: 运行测试与 typecheck 确认通过**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts && npm run typecheck`
Expected: vitest PASS。typecheck 此时**预期会在 `ProjectsView.vue` 报错**（它仍在给 `sp.tags` 赋值），这是正常的——T5 会修掉。若报错只出现在 `ProjectsView.vue`，继续；若在其他文件也报错，停下来报告（说明 `ProjectFilters.tags` 还有别的消费方，与调研结论不符）。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/projectList.ts frontend/src/lib/projectList.test.ts
git commit -m "feat(projectList): 三个日期字段 + 移除 ProjectFilters.tags

originSetupDate 取 pmisMap[relatedClosedId].status.立项日期(另一个项目),
测试带反向断言防止误用本项目 status。终验两列直取 progress 不重算。
tags 筛选下沉表头后 ProjectFilters.tags 无写入方,连同 tagMatch 分支删除;
tagFilter.ts 本身保留(另有 5 页在用)。"
```

---

### Task 4: temp 数据层三件套——`keyProjects` / `tempScope` / `tempFollowup`

**Files:**
- Modify: `frontend/src/lib/keyProjects.ts:14-22`（`KeyProjectRow`）、`:47-69`（`buildProgressRowBase`）
- Modify: `frontend/src/lib/tempScope.ts:63`（label 正名）、`:64` 后（新增字段）
- Modify: `frontend/src/lib/tempFollowup.ts:87`（`buildScopeInputs` 新增一行）
- Test: `frontend/src/lib/keyProjects.test.ts`、`tempScope.test.ts`、`tempFollowup.test.ts`

**Interfaces:**
- Consumes: T1 产出的 `analysis.ts` 中 `PmisProgress.实际终验时间`
- Produces（T6 依赖）：
  - `KeyProjectRow.plannedFinalAcceptDate: string | null`
  - `KeyProjectRow.actualFinalAcceptDate: string | null`
  - `KeyProjectRow.setupDate: string | null`（**已存在**，T6 只需补列定义）
  - `FIELD_CATALOG` 中 `finalAcceptDate` 的 label 为「计划终验时间」，新增 key `actualFinalAcceptDate`

**⚠ 本任务含全局约束 3：`finalAcceptDate` 的 key 严禁改名，只改 label。**

**背景（实现者必读）：** `buildProgressRowBase(p, pmis, rec)` 的函数体内已有：

```ts
const m = (pmis ?? {}) as Record<string, any>
const st = m.status ?? {}, risk = m.risk ?? {}, team = m.team ?? {}
```

注意**没有** `prog` 变量，需要新增。该函数同时被 `buildKeyProjectRows`（重点项目页 `/projects/key`）调用，新增字段会一并出现在重点项目行上——无害（不加列就不显示），但审查时应知晓。

- [ ] **Step 1: 写失败测试（keyProjects 两个新字段）**

在 `frontend/src/lib/keyProjects.test.ts` 追加：

```ts
describe('V4.0.1 终验两字段', () => {
  it('buildProgressRowBase 带出计划/实际终验时间', () => {
    const row = buildProgressRowBase(
      { projectId: 'P1' } as any,
      { progress: { 终验时间: '2026-07-01', 实际终验时间: '2026-07-15' } } as any,
      {} as any)
    expect(row.plannedFinalAcceptDate).toBe('2026-07-01')
    expect(row.actualFinalAcceptDate).toBe('2026-07-15')
  })

  it('实际未发生时为 null,不落成空串', () => {
    const row = buildProgressRowBase(
      { projectId: 'P1' } as any,
      { progress: { 终验时间: '2026-07-01', 实际终验时间: null } } as any,
      {} as any)
    expect(row.actualFinalAcceptDate).toBeNull()
  })

  it('pmis 整体缺失时两字段均为 null,不抛错', () => {
    const row = buildProgressRowBase({ projectId: 'P1' } as any, undefined, {} as any)
    expect(row.plannedFinalAcceptDate).toBeNull()
    expect(row.actualFinalAcceptDate).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/keyProjects.test.ts -t 'V4.0.1'`
Expected: FAIL

- [ ] **Step 3: 实现 keyProjects 两个字段**

`KeyProjectRow` 接口在 `setupDate: string | null` 之后追加：

```ts
  setupDate: string | null
  plannedFinalAcceptDate: string | null
  actualFinalAcceptDate: string | null
```

`buildProgressRowBase` 中，把局部变量声明补上 `prog`：

```ts
  const st = m.status ?? {}, risk = m.risk ?? {}, team = m.team ?? {}, prog = m.progress ?? {}
```

返回对象里，在 `setupDate: st.立项日期 ?? null,` 之后追加：

```ts
    setupDate: st.立项日期 ?? null,
    // 直取后端 backfill_final_acceptance 回填的口径,前端不重算
    plannedFinalAcceptDate: prog.终验时间 ?? null,
    actualFinalAcceptDate: prog.实际终验时间 ?? null,
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/keyProjects.test.ts`
Expected: PASS

- [ ] **Step 5: 写失败测试（tempScope：key 回归锁 + 新字段）**

在 `frontend/src/lib/tempScope.test.ts` 追加：

```ts
describe('V4.0.1 终验字段目录', () => {
  it('finalAcceptDate 这个 key 必须原样存在 —— 改名会让已存盘的范围条件静默失效', () => {
    // data/temp_followup.json 里用户已保存的条件按此 key 序列化。
    // 改 key 后条件仍会显示在界面上,但 evalCond 永远匹配不到,且没有任何报错。
    const f = FIELD_CATALOG.find((x) => x.group === 'project' && x.key === 'finalAcceptDate')
    expect(f).toBeDefined()
    expect(f!.label).toBe('计划终验时间')
    expect(f!.kind).toBe('date')
  })

  it('新增实际终验时间字段', () => {
    const f = FIELD_CATALOG.find((x) => x.group === 'project' && x.key === 'actualFinalAcceptDate')
    expect(f).toBeDefined()
    expect(f!.label).toBe('实际终验时间')
    expect(f!.kind).toBe('date')
  })

  it('实际终验时间可按区间筛选', () => {
    const f = { combinator: 'AND', groups: [{ combinator: 'AND', conditions: [
      { group: 'project', field: 'actualFinalAcceptDate', op: 'between',
        min: '2026-01-01', max: '2026-12-31' }] }] } as any
    expect(projectMatches(inp({ proj: { actualFinalAcceptDate: '2026-06-30' } }), f)).toBe(true)
    expect(projectMatches(inp({ proj: { actualFinalAcceptDate: '2027-01-01' } }), f)).toBe(false)
  })
})
```

（`inp` / `projectMatches` / `FIELD_CATALOG` 的 import 与既有用例一致，见该文件 `:64-66` 附近的 `finalAcceptDate` 用例。）

- [ ] **Step 6: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts -t 'V4.0.1'`
Expected: FAIL —— label 仍是「终验时间」；`actualFinalAcceptDate` 未定义。

- [ ] **Step 7: 实现 tempScope 字段目录**

`frontend/src/lib/tempScope.ts` 的 `FIELD_CATALOG` 中，把这一行：

```ts
  { group: 'project', key: 'finalAcceptDate', label: '终验时间', kind: 'date' },
```

改为（**key 一个字符都不动**，只改 label，并补一行新字段）：

```ts
  // key 严禁改名:data/temp_followup.json 里已存的范围条件按此 key 序列化,
  // 改名会让用户已配好的范围静默失效(条件仍显示、但永远匹配不到、无报错)。
  { group: 'project', key: 'finalAcceptDate', label: '计划终验时间', kind: 'date' },
  { group: 'project', key: 'actualFinalAcceptDate', label: '实际终验时间', kind: 'date' },
```

- [ ] **Step 8: 运行测试确认通过**

Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts`
Expected: PASS

- [ ] **Step 9: 变异验证 key 回归锁真的会红**

这条锁是本版最重要的护栏，必须确认它不是假绿：

1. 临时把 `tempScope.ts` 中的 `key: 'finalAcceptDate'` 改成 `key: 'plannedFinalAcceptDate'`
2. Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts`
   Expected: **FAIL**（`f` 为 undefined）
3. 改回 `key: 'finalAcceptDate'`
4. Run: `cd frontend && npx vitest run src/lib/tempScope.test.ts`
   Expected: PASS

若第 2 步没有变红，说明测试写错了，修到会红为止。

- [ ] **Step 10: 写失败测试（tempFollowup 范围输入）**

在 `frontend/src/lib/tempFollowup.test.ts` 追加：

```ts
describe('V4.0.1 buildScopeInputs 实际终验时间', () => {
  it('proj.actualFinalAcceptDate 取自 progress.实际终验时间并截到 10 位', () => {
    const inputs = buildScopeInputs(
      [{ projectId: 'P1' } as any],
      { P1: { progress: { 终验时间: '2026-07-01', 实际终验时间: '2026-07-15 00:00:00' } } } as any,
      {}, {})
    expect(inputs[0].proj.actualFinalAcceptDate).toBe('2026-07-15')
    expect(inputs[0].proj.finalAcceptDate).toBe('2026-07-01')
  })

  it('实际终验缺失时为空串(与既有 finalAcceptDate 的空值表示一致)', () => {
    const inputs = buildScopeInputs(
      [{ projectId: 'P1' } as any], { P1: { progress: {} } } as any, {}, {})
    expect(inputs[0].proj.actualFinalAcceptDate).toBe('')
  })
})
```

- [ ] **Step 11: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/lib/tempFollowup.test.ts -t 'V4.0.1'`
Expected: FAIL

- [ ] **Step 12: 实现 buildScopeInputs 新增行**

`frontend/src/lib/tempFollowup.ts` 的 `proj` 对象里，在 `finalAcceptDate` 那行之后追加一行（保持与相邻行同款的 `String(...).slice(0, 10)` 写法，空值落空串是该对象的既有约定）：

```ts
        finalAcceptDate: String(prog.终验时间 ?? '').slice(0, 10),
        actualFinalAcceptDate: String(prog.实际终验时间 ?? '').slice(0, 10),
        setupDate: String(pr?.setupDate ?? '').slice(0, 10),
```

- [ ] **Step 13: 运行三个文件的测试与 typecheck**

Run: `cd frontend && npx vitest run src/lib/keyProjects.test.ts src/lib/tempScope.test.ts src/lib/tempFollowup.test.ts && npm run typecheck`
Expected: vitest PASS。typecheck 可能仍在 `ProjectsView.vue` 报错（T3 遗留，T5 修），其余文件应无错。

- [ ] **Step 14: 提交**

```bash
git add frontend/src/lib/keyProjects.ts frontend/src/lib/keyProjects.test.ts frontend/src/lib/tempScope.ts frontend/src/lib/tempScope.test.ts frontend/src/lib/tempFollowup.ts frontend/src/lib/tempFollowup.test.ts
git commit -m "feat(temp): 终验两字段进 temp 数据层与范围设置

finalAcceptDate 只正名 label 为「计划终验时间」,key 原样保留 ——
已存盘范围条件按该 key 序列化,改名会静默失效。附 key 回归锁,
已做变异验证(改名即红)。新增 actualFinalAcceptDate。"
```

---

### Task 5: `/projects` 视图层——三列 + 标签筛选下沉

**Files:**
- Modify: `frontend/src/views/ProjectsView.vue:17`（import）、`:48-73`（`ALL_COLUMNS`）、`:75`（`DEFAULT_VISIBLE`）、`:76`（`FILTERABLE`）、`:44`（`sp` 初值）、`:158`（模板）
- Test: `frontend/src/views/ProjectsView.test.ts`

**Interfaces:**
- Consumes（T3 产出）：`ProjectRow.originSetupDate` / `.plannedFinalAcceptDate` / `.actualFinalAcceptDate`；`ProjectFilters` 已无 `tags` 字段
- Produces: 无

**背景（实现者必读）：** 现有 `DEFAULT_VISIBLE` 与 `FILTERABLE` 原文：

```ts
const DEFAULT_VISIBLE = ['projectName', 'projectId', 'contractAmount', 'projectManager', 'orgL4', 'riskLevel', 'projectLevel', 'projectType', 'costRatio', 'paymentRatio', 'projectStatus', 'health', 'riskReasons', 'action']
const FILTERABLE = new Set(['projectManager', 'orgL4', 'stage', 'projectStatus', 'riskLevel', 'projectLevel', 'projectType', 'paymentStatus', 'health', 'top1000', 'quadrant', 'riskReasons', 'signUnit', 'setupDate'])
```

`tags` 列已在 `ALL_COLUMNS`（`{ key: 'tags', label: '标签', width: 160, formatter: ... }`），当前默认隐藏。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/ProjectsView.test.ts` 追加：

```ts
describe('V4.0.1 列与标签筛选', () => {
  it('三个新日期列已登记且默认隐藏', () => {
    const wrapper = mountProjects()
    const cols = (wrapper.vm as any).ALL_COLUMNS as { key: string; label: string }[]
    const keys = cols.map((c) => c.key)
    expect(keys).toContain('originSetupDate')
    expect(keys).toContain('plannedFinalAcceptDate')
    expect(keys).toContain('actualFinalAcceptDate')
    expect(cols.find((c) => c.key === 'originSetupDate')!.label).toBe('原项目立项日期')
    expect(cols.find((c) => c.key === 'plannedFinalAcceptDate')!.label).toBe('计划终验时间')
    expect(cols.find((c) => c.key === 'actualFinalAcceptDate')!.label).toBe('实际终验时间')
    // 默认不展示
    const visible = (wrapper.vm as any).prefs.visibleKeys.value as string[]
    expect(visible).not.toContain('originSetupDate')
    expect(visible).not.toContain('plannedFinalAcceptDate')
    expect(visible).not.toContain('actualFinalAcceptDate')
  })

  it('标签筛选已从工具栏移除', () => {
    const wrapper = mountProjects()
    expect(wrapper.findComponent({ name: 'TagFilterSelect' }).exists()).toBe(false)
  })

  it('标签列默认可见且可筛 —— 否则下沉后筛选入口整个消失', () => {
    const wrapper = mountProjects()
    const visible = (wrapper.vm as any).prefs.visibleKeys.value as string[]
    expect(visible).toContain('tags')
    expect((wrapper.vm as any).FILTERABLE.has('tags')).toBe(true)
  })
})
```

若 `ProjectsView.vue` 未 `defineExpose` 出 `FILTERABLE`/`prefs`，在 Step 3 一并加入 expose（文件末尾已有 `defineExpose({ ALL_COLUMNS })`，扩成 `defineExpose({ ALL_COLUMNS, FILTERABLE, prefs })`）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts -t 'V4.0.1'`
Expected: FAIL

- [ ] **Step 3: 实现三个新列**

在 `ALL_COLUMNS` 中，`setupDate` 那一行之后插入三行：

```ts
  { key: 'setupDate', label: '立项日期', width: 110, sortable: true,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
  { key: 'originSetupDate', label: '原项目立项日期', width: 130, sortable: true,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
  { key: 'plannedFinalAcceptDate', label: '计划终验时间', width: 120, sortable: true,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
  { key: 'actualFinalAcceptDate', label: '实际终验时间', width: 120, sortable: true,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
```

- [ ] **Step 4: 实现 FILTERABLE 与 DEFAULT_VISIBLE**

`FILTERABLE` 改为（加四个 key：三个新列 + `tags`）：

```ts
const FILTERABLE = new Set(['projectManager', 'orgL4', 'stage', 'projectStatus', 'riskLevel', 'projectLevel', 'projectType', 'paymentStatus', 'health', 'top1000', 'quadrant', 'riskReasons', 'signUnit', 'setupDate', 'originSetupDate', 'plannedFinalAcceptDate', 'actualFinalAcceptDate', 'tags'])
```

`DEFAULT_VISIBLE` 改为（**只加 `tags`**，三个新日期列保持默认隐藏）：

```ts
// tags 进默认可见:ColumnFilter 挂在表头,列隐藏则筛选入口一并消失。
// 标签筛选原本是工具栏常驻的,若下沉后仍默认隐藏,升级后的观感就是「标签筛选没了」。
const DEFAULT_VISIBLE = ['projectName', 'projectId', 'contractAmount', 'projectManager', 'orgL4', 'riskLevel', 'projectLevel', 'projectType', 'costRatio', 'paymentRatio', 'projectStatus', 'health', 'riskReasons', 'tags', 'action']
```

- [ ] **Step 5: 移除工具栏标签筛选**

1. 模板中删除这一行：`<TagFilterSelect v-model="sp.tags" />`
2. `<script setup>` 中删除：`import TagFilterSelect from '@/components/TagFilterSelect.vue'`
3. `sp` 的初始化对象中删除 `tags: []` 一项（T3 已从 `ProjectFilters` 类型里删掉该字段，不删这里会 typecheck 报错）
4. 若 `defineExpose` 需要扩展（见 Step 1），一并改为 `defineExpose({ ALL_COLUMNS, FILTERABLE, prefs })`

- [ ] **Step 6: 运行测试与 typecheck**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts && npm run typecheck`
Expected: vitest PASS；typecheck **0 error**（T3 遗留的报错到此应全部消除）。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts
git commit -m "feat(projects): 三个日期列 + 标签筛选下沉表头

三个新列默认隐藏。tags 加进 FILTERABLE 与 DEFAULT_VISIBLE ——
ColumnFilter 挂表头,列隐藏则筛选入口消失,而标签筛选原本工具栏常驻,
不放出这一列升级后就是「功能没了」。
语义零漂移:crossFilter 数组列分支是 OR,与 tagMatch 等价。"
```

---

### Task 6: `/projects/temp` 视图层——补三列

**Files:**
- Modify: `frontend/src/views/TempFollowupView.vue:62-93`（`ALL_COLUMNS`）、`:98`（`FILTERABLE`）
- Test: `frontend/src/views/TempFollowupView.test.ts`

**Interfaces:**
- Consumes（T4 产出）：`KeyProjectRow.setupDate`（已存在）/ `.plannedFinalAcceptDate` / `.actualFinalAcceptDate`
- Produces: 无

**⚠ 实现者必读——本文件的列定义有个陷阱：** `ALL_COLUMNS` 整体被 `withSortable([...])` 包裹，而 `withSortable` 的实现是：

```ts
export function withSortable(columns: DataColumn[]): DataColumn[] {
  return columns.map((c) => ({ ...c, sortable: !NON_SORTABLE_KEYS.has(c.key) }))
}
```

即它会**无条件覆写**每一列的 `sortable`。因此新列**不要手写 `sortable: true`**（写了也会被覆盖，属误导性代码）。日期列不在 `NON_SORTABLE_KEYS` 中，会自动获得排序能力。

- [ ] **Step 1: 写失败测试**

在 `frontend/src/views/TempFollowupView.test.ts` 追加：

```ts
describe('V4.0.1 三个日期列', () => {
  it('立项日期/计划终验/实际终验已登记为可选列', () => {
    const wrapper = mountTemp()
    const cols = (wrapper.vm as any).ALL_COLUMNS as { key: string; label: string }[]
    const byKey = Object.fromEntries(cols.map((c) => [c.key, c]))
    expect(byKey['setupDate']?.label).toBe('立项日期')
    expect(byKey['plannedFinalAcceptDate']?.label).toBe('计划终验时间')
    expect(byKey['actualFinalAcceptDate']?.label).toBe('实际终验时间')
  })

  it('三列默认隐藏(属额外可选列)', () => {
    const wrapper = mountTemp()
    const visible = (wrapper.vm as any).prefs.visibleKeys.value as string[]
    expect(visible).not.toContain('setupDate')
    expect(visible).not.toContain('plannedFinalAcceptDate')
    expect(visible).not.toContain('actualFinalAcceptDate')
  })

  it('三列可筛', () => {
    const wrapper = mountTemp()
    const F = (wrapper.vm as any).FILTERABLE as Set<string>
    expect(F.has('setupDate')).toBe(true)
    expect(F.has('plannedFinalAcceptDate')).toBe(true)
    expect(F.has('actualFinalAcceptDate')).toBe(true)
  })

  it('三列都能排序(withSortable 自动赋予,不需手写)', () => {
    const wrapper = mountTemp()
    const cols = (wrapper.vm as any).ALL_COLUMNS as { key: string; sortable?: boolean }[]
    for (const k of ['setupDate', 'plannedFinalAcceptDate', 'actualFinalAcceptDate']) {
      expect(cols.find((c) => c.key === k)!.sortable).toBe(true)
    }
  })
})
```

若该组件未 expose `ALL_COLUMNS`/`FILTERABLE`/`prefs`，在 Step 3 加 `defineExpose({ ALL_COLUMNS, FILTERABLE, prefs })`（`ProjectsView.vue` 有同款先例）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && npx vitest run src/views/TempFollowupView.test.ts -t 'V4.0.1'`
Expected: FAIL

- [ ] **Step 3: 实现三列**

在 `ALL_COLUMNS` 的「额外可选列」区段内（`{ key: 'milestoneStatus', ... }` 之后、数组结束之前）追加三行。注意**不写 `sortable`**（见上方陷阱说明）：

```ts
  { key: 'milestoneStatus', label: '里程碑状态', width: 120 },
  { key: 'setupDate', label: '立项日期', width: 110,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
  { key: 'plannedFinalAcceptDate', label: '计划终验时间', width: 120,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
  { key: 'actualFinalAcceptDate', label: '实际终验时间', width: 120,
    formatter: (v) => (v ? String(v).slice(0, 10) : '-') },
])
```

`FILTERABLE` 改为：

```ts
const FILTERABLE = new Set(['projectLevel', 'projectManager', 'ar', 'sr', 'orgL4', 'riskLevel', 'followBy', 'followDate',
  'stage', 'projectType', 'projectStatus', 'health', 'paymentStatus', 'top1000', 'quadrant', 'milestoneStatus',
  'setupDate', 'plannedFinalAcceptDate', 'actualFinalAcceptDate'])
```

`DEFAULT_VISIBLE` **不动**（三列默认隐藏）。

- [ ] **Step 4: 运行测试与 typecheck**

Run: `cd frontend && npx vitest run src/views/TempFollowupView.test.ts && npm run typecheck`
Expected: PASS / 0 error

- [ ] **Step 5: 提交**

```bash
git add frontend/src/views/TempFollowupView.vue frontend/src/views/TempFollowupView.test.ts
git commit -m "feat(temp): 补立项日期/计划终验/实际终验三个可选列

立项日期是本次修的原始缺陷 —— 范围设置里早有,选列漏同步
(该页的字段目录与列定义是两份手工清单,无单一来源约束)。
新列不手写 sortable:withSortable 会无条件覆写。"
```

---

### Task 7: 收尾——版本号、文档、全量验证

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`
- Create: `deploy/升级手册-V4.0.1.md`

**Interfaces:**
- Consumes: T1..T6 全部产出
- Produces: 可交付版本

- [ ] **Step 1: 改版本号**

`frontend/src/version.ts` 改为：

```ts
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V4.0.1'
export const RELEASE_DATE = '2026-07-19'
```

- [ ] **Step 2: 跑全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）。

若有任何一项不绿，**停下来修**，不要继续。

- [ ] **Step 3: 真实数据冒烟核对口径**

这一步不能省——本版三列全是新口径暴露，只有真实数据能验出取数是否搭错。

1. Run: `python server.py`（另开一个终端）
2. 浏览器打开 `http://localhost:8080`，点一次「更新数据」等 SSE 跑完
3. 进 `/projects`，用选列勾出三个新列
4. 挑一个**售前服务类**项目，记下它的「计划终验时间」「实际终验时间」「原项目立项日期」
5. 点进该项目的 `/project/:id`：
   - 里程碑页签中「**服务完成**」那一行的计划日期/实际日期，必须与第 4 步记的两个值**逐字相同**
   - 原项目页签的「原项目立项日期」必须与第 4 步的值相同，且**不等于**该项目自己的立项日期
6. 挑一个**非售前**项目，重复第 5 步，但比对的里程碑行应是「**终验**」
7. 进 `/projects/temp`，确认选列里出现三个新列、范围设置里「计划终验时间」与「实际终验时间」都在，且「计划终验时间」这一项**保留了原有的已保存条件**（若之前配过）
8. 回 `/projects`，确认工具栏已无标签下拉、表头「标签」列有筛选箭头且能正常筛选
9. 确认浏览器 console 无报错

- [ ] **Step 4: 写升级手册**

创建 `deploy/升级手册-V4.0.1.md`，比照 `deploy/升级手册-V4.0.0.md` 的结构。**头号注意必须是**：

> **⚠ 本版升级后必须点一次「更新数据」。** `实际终验时间` 是本版新增的管线回填字段，不重跑管线则 `/projects` 与 `/projects/temp` 的「实际终验时间」列全部为空。V4.0.0 是「无需点更新数据」的，容易惯性跳过。

其余须覆盖：
- 本版动了后端（`milestones.py` / `preprocess_data.py` / `schema.py`）+ dist，需**重启后端**
- 无新增页面 / 路由 / pageKey / 授权项，现有账号授权一律不用动
- **标签筛选位置变了**：`/projects` 的标签筛选已从工具栏移到表头「标签」列的筛选箭头，标签列已默认放出
- 三个新列默认隐藏，需在「选列」里勾出
- 回滚步骤：同时还原 `.py` 与 `dist` 并重启；回滚后 `progress.实际终验时间` 会残留在 `data/analysis_data.json` 里但无人消费，无害

- [ ] **Step 5: 更新 PROGRESS.md**

在版本史中新增 V4.0.1 条目，记录：三个日期列及各自来源（计划终验是暴露既有字段、实际终验是新增管线字段、原项目立项日期是前端派生）、temp 选列补齐的根因（两份手工字段清单无单一来源）、标签筛选下沉仅限 `/projects`（其余 5 页未改，用户明确选定不记债）、升级须点「更新数据」。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md deploy/升级手册-V4.0.1.md
git commit -m "chore(release): V4.0.1

三个日期列 + 标签筛选下沉 + temp 选列补齐。
升级须点「更新数据」(实际终验时间是新增管线字段)。"
```

---

## 附：审查者重点

除各任务的 spec 符合性外，本版有四处值得单独盯：

1. **`finalAcceptDate` 的 key 是否被改名**（Task 4）。这是唯一会造成**存量用户数据静默失效**的改动点。审查时直接 `grep -n "finalAcceptDate" frontend/src/lib/tempScope.ts` 确认 key 原样、label 已改。
2. **`originSetupDate` 是否误取了本项目的 `status`**（Task 3）。两者都是合法日期，取错不报错、不变红，只有反向断言和真实数据比对能抓。
3. **`tags` 是否进了 `DEFAULT_VISIBLE`**（Task 5）。漏了就是「标签筛选功能消失」，而所有测试仍会绿。
4. **temp 新列是否手写了 `sortable`**（Task 6）。写了不会报错、也不影响功能，但是误导性代码——`withSortable` 会覆写它。
