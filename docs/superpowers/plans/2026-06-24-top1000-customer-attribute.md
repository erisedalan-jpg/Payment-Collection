# TOP1000 客户属性接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `input/TOP1000.xlsx` 客户清单数据源，按 `最终客户` 匹配把「是否 TOP1000 大客户」与「象限」两属性写到项目主域，在 /projects、/project/:id、/insight、/insight/board、/insight/risk 展示/筛选/作为分析维度。

**Architecture:** 后端 `read_top1000` 解析 → `build_projects` 内按 `最终客户` 查表 → 给每个 `Project` 加 `top1000`/`quadrant` 两字段（schema 显式声明，单一来源）；前端 5 个消费点统一从 `Project` 读，零口径分叉。`preprocess_data.py` 不改（路径定位由 `load_dept_projects(input_dir)` 覆盖开发/打包双模式）。

**Tech Stack:** Python 标准库 + openpyxl（后端）；Vue3 + TS + Vite + Element Plus + Pinia + vitest（前端）。

## Global Constraints

> 每个任务的要求都隐含包含本节。值逐字照抄，不得改写。

- **匹配键**：项目 `最终客户`（`(pm.get("customer") or {}).get("最终客户")`）strip 后与 `TOP1000.客户名称` strip 后**精确等值**匹配。不做模糊匹配。
- **派生规则**：`top1000 = "是"` ⟺ 命中清单 **且** 命中行 `客户级别 == "TOP1000大客户"`（即 `config.TOP1000_LEVEL`）；否则 `"否"`（含未命中）。`quadrant = ` 命中行 `象限`（strip）；未命中或空 → `""`。两者解耦：`quadrant` 仅取决于是否命中，与 `top1000` 是/否无关。
- **字段名**：`Project.top1000`（`str`，默认 `"否"`）、`Project.quadrant`（`str`，默认 `""`）。schema 显式声明（不依赖 `extra=allow`）。改 schema 后必须 `cd frontend && npm run gen:types`。
- **维度统一命名**：key 用 `'top1000'`、`'quadrant'`；label 用 `'TOP1000'`、`'象限'`；在三个分析 lib 的维度数组**末尾追加**这两项（先 TOP1000 后 象限）。
- **前端取值约定**：
  - 分析行（InsightRow/PayBoardRow/RiskRow）用各 lib 现有 `v()` helper：`top1000: v(p.top1000, '否')`、`quadrant: v(p.quadrant)`（空象限归 `'未指定'`，与 industry 等同款）。
  - 表格行 ProjectRow：`top1000: p.top1000 || '否'`、`quadrant: p.quadrant || ''`（象限无数据显示空，用户钦定）。
- **/projects 列**：两列**不**加入 `DEFAULT_VISIBLE`（默认隐藏，可勾选）；**加入** `FILTERABLE`（可筛选）。
- **/project/:id 位置**：在 `pd-meta` 的「客户」与「签约单位」之间插入两个同形 `<span>`。
- **`preprocess_data.py` 不改动。**
- **版本**：`frontend/src/version.ts` → `APP_VERSION='V1.19.0'`、`RELEASE_DATE='2026-06-24'`。
- **禁止 emoji**；交流/注释用简体中文。
- **commit message 末尾必须是**：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- spec/plan 文档写盘**不 commit**（项目约定）。

---

## File Structure

| 文件 | 改动 | 任务 |
|---|---|---|
| `config.py` | 加 `TOP1000_FILE`/`TOP1000_LEVEL`，`INPUT_UPLOAD_NAMES` 加项 | T1 |
| `projects.py` | 新增 `read_top1000`；改 `build_projects`、`load_dept_projects` | T1（parser）/T2（wiring） |
| `tests/test_projects.py` | 加 `TestReadTop1000`、`TestBuildProjectsTop1000` | T1/T2 |
| `schema.py` | `Project` 加 `top1000`/`quadrant` | T2 |
| `frontend/src/types/analysis.ts` | `npm run gen:types` 再生成 | T2 |
| `frontend/src/composables/useInputFiles.ts`(+`.test.ts`) | `INPUT_FILE_NAMES` 加项 | T3 |
| `frontend/src/lib/projectList.ts`(+`.test.ts`) | `ProjectRow`+`buildProjectRows` | T4 |
| `frontend/src/views/ProjectsView.vue`(+`.test.ts`) | `ALL_COLUMNS`+`FILTERABLE` | T4 |
| `frontend/src/views/ProjectDetailView.vue`(+`.test.ts`) | pd-meta 插两 span | T5 |
| `frontend/src/lib/projectPivot.ts`(+`.test.ts`) | 维度+行 | T6 |
| `frontend/src/lib/paymentBoard.ts`(+`.test.ts`) | 维度+行 | T7 |
| `frontend/src/lib/riskBoard.ts`(+`.test.ts`) | 维度+行 | T8 |
| `frontend/src/version.ts` / `PROGRESS.md` | 版本 + 进度 | T9 |

---

### Task 1: 后端 config 常量 + `read_top1000` 解析器

**Files:**
- Modify: `config.py:63-71`
- Modify: `projects.py`（在 `read_delivery` 之后，约 :98 后新增函数）
- Test: `tests/test_projects.py`（新增 `TestReadTop1000`）

**Interfaces:**
- Produces: `config.TOP1000_FILE = "TOP1000.xlsx"`、`config.TOP1000_LEVEL = "TOP1000大客户"`；`projects.read_top1000(path: str) -> Dict[str, Dict[str, str]]`，返回 `{客户名称: {"level": 客户级别, "quad": 象限}}`，缺文件/无表头 → `{}`。

- [ ] **Step 1: 写失败测试**

在 `tests/test_projects.py` 末尾追加（文件已有 `_make_xlsx` 工具与 `import projects as P`）：

```python
class TestReadTop1000:
    def test_parses_name_level_quadrant_and_strips(self, tmp_path):
        path = _make_xlsx(tmp_path, "TOP1000.xlsx", [
            ("Sheet1", [
                ("客户编码", "客户名称", "客户级别", "象限"),
                ("C001", "辽宁省公安厅", "TOP1000大客户", "M1 战略核心区"),
                ("C002", " 北京能源集团 ", "TOP1000大客户", " M1 战略核心区 "),
            ]),
        ])
        m = P.read_top1000(path)
        assert m["辽宁省公安厅"] == {"level": "TOP1000大客户", "quad": "M1 战略核心区"}
        assert m["北京能源集团"] == {"level": "TOP1000大客户", "quad": "M1 战略核心区"}

    def test_skips_empty_name_rows(self, tmp_path):
        path = _make_xlsx(tmp_path, "TOP1000.xlsx", [
            ("Sheet1", [
                ("客户编码", "客户名称", "客户级别", "象限"),
                ("C001", None, "TOP1000大客户", "M1 战略核心区"),
                ("C002", "有名客户", "TOP1000大客户", "M2 现金牛/打猎区"),
            ]),
        ])
        m = P.read_top1000(path)
        assert list(m.keys()) == ["有名客户"]

    def test_missing_file_degrades_to_empty(self, tmp_path):
        assert P.read_top1000(str(tmp_path / "无.xlsx")) == {}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_projects.py::TestReadTop1000 -v`
Expected: FAIL（`AttributeError: module 'projects' has no attribute 'read_top1000'`）

- [ ] **Step 3: 加 config 常量**

`config.py`，在 `MAPPING_FILE = "A.xlsx"`（:65）一带新增两常量，并把 `TOP1000_FILE` 加进 `INPUT_UPLOAD_NAMES`（:69-71）：

```python
# ── 项目主域输入文件(Phase P,位于 input/ 根) ──
ORG_FILE = "组织架构.xlsx"
MAPPING_FILE = "A.xlsx"
TOP1000_FILE = "TOP1000.xlsx"           # CRM 大客户清单(客户名称→级别/象限)
TOP1000_LEVEL = "TOP1000大客户"          # top1000 判定级别
DELIVERY_FILE = "delivery_analysis.csv"
DELIVERY_FILE_LEGACY = "delivery_analysis.xlsx"  # csv 缺失时回退(R 批次过渡)
# 上传白名单含 legacy:R 批次过渡期 csv/xlsx 两式 delivery 均可上传(读侧 read_delivery 同款回退)
INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE, DELIVERY_FILE_LEGACY,
                      PAYMENT_RECORDS_FILE, PROFIT_DIRECT_FILE, PROFIT_BRIDGE_FILE, BUDGET_FILE,
                      COLLECTION_STAGES_FILE, TOP1000_FILE]
```

- [ ] **Step 4: 实现 `read_top1000`**

`projects.py`，在 `read_delivery`（:89-98）之后新增。复用现有 `_read_header_sheet`（其 `_open_workbook` 不用 read_only，规避 WPS 截行）：

```python
def read_top1000(path: str) -> Dict[str, Dict[str, str]]:
    """TOP1000.xlsx → {客户名称: {"level": 客户级别, "quad": 象限}}。
    复用 _read_header_sheet(找含"客户名称"表头的 sheet);缺文件/无表头 → {}(降级)。
    客户名称为空的行跳过;级别/象限 strip。"""
    rows = _read_header_sheet(path, "客户名称")
    out: Dict[str, Dict[str, str]] = {}
    for r in rows:
        name = str(r.get("客户名称") or "").strip()
        if not name:
            continue
        out[name] = {
            "level": str(r.get("客户级别") or "").strip(),
            "quad": str(r.get("象限") or "").strip(),
        }
    return out
```

- [ ] **Step 5: 跑测试确认通过**

Run: `python -m pytest tests/test_projects.py::TestReadTop1000 -v`
Expected: PASS（3 passed）

- [ ] **Step 6: ruff + 全量 pytest**

Run: `python -m ruff check config.py projects.py && python -m pytest -q`
Expected: 全绿（无新增失败）

- [ ] **Step 7: Commit**

```bash
git add config.py projects.py tests/test_projects.py
git commit -m "feat(backend): TOP1000.xlsx 解析器 read_top1000 + config 常量/上传白名单" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `build_projects` 派生 + `load_dept_projects` 接线 + schema 字段 + gen:types

**Files:**
- Modify: `projects.py:184-226`（`build_projects`）、`projects.py:284-292`（`load_dept_projects`）
- Modify: `schema.py:166-179`（`Project`）
- Modify: `frontend/src/types/analysis.ts`（`npm run gen:types` 再生成，勿手改）
- Test: `tests/test_projects.py`（新增 `TestBuildProjectsTop1000`）

**Interfaces:**
- Consumes: `config.TOP1000_FILE`、`config.TOP1000_LEVEL`、`projects.read_top1000`（Task 1）。
- Produces: `build_projects(project_pmis, org_names, org_l4s, mapping, delivery_rows, top1000_map=None)`（第 6 个形参，带默认向后兼容）；每个项目 dict 新增键 `top1000`('是'|'否')、`quadrant`(str)。`Project` schema 含 `top1000: str = "否"`、`quadrant: str = ""`。

- [ ] **Step 1: 写失败测试**

`tests/test_projects.py` 末尾追加（文件已有 `_pm_active` 工具，其 `customer` 默认 `{"合同编号": ...}`，本测试补 `最终客户`）：

```python
class TestBuildProjectsTop1000:
    def _ppm(self, final_customer):
        pm = _pm_active("项目甲", "佘海龙")
        pm["customer"]["最终客户"] = final_customer
        return {"SS-1": pm}

    def test_matched_top1000_level_yes_with_quadrant(self):
        m = {"辽宁省公安厅": {"level": "TOP1000大客户", "quad": "M1 战略核心区"}}
        out = P.build_projects(self._ppm("辽宁省公安厅"), {"佘海龙"}, set(), [], [], m)
        assert out[0]["top1000"] == "是"
        assert out[0]["quadrant"] == "M1 战略核心区"

    def test_matched_non_top1000_level_is_no_but_quadrant_kept(self):
        m = {"某客户": {"level": "TOP1001大客户", "quad": "M2 现金牛/打猎区"}}
        out = P.build_projects(self._ppm("某客户"), {"佘海龙"}, set(), [], [], m)
        assert out[0]["top1000"] == "否"
        assert out[0]["quadrant"] == "M2 现金牛/打猎区"

    def test_unmatched_is_no_empty_quadrant(self):
        m = {"辽宁省公安厅": {"level": "TOP1000大客户", "quad": "M1 战略核心区"}}
        out = P.build_projects(self._ppm("不在表里"), {"佘海龙"}, set(), [], [], m)
        assert out[0]["top1000"] == "否"
        assert out[0]["quadrant"] == ""

    def test_no_map_degrades_to_no(self):
        out = P.build_projects(self._ppm("辽宁省公安厅"), {"佘海龙"}, set(), [], [])
        assert out[0]["top1000"] == "否"
        assert out[0]["quadrant"] == ""
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_projects.py::TestBuildProjectsTop1000 -v`
Expected: FAIL（`KeyError: 'top1000'`，或 `build_projects() takes 5 positional arguments but 6 were given`）

- [ ] **Step 3: 改 `build_projects`**

`projects.py`，签名加第 6 形参；循环体在 `out.append` 前算派生；`out.append` 字典末尾加两键。完整替换 :184-226 的函数为：

```python
def build_projects(project_pmis: Dict[str, Dict[str, Any]], org_names: set, org_l4s: set,
                   mapping: List[Dict[str, str]], delivery_rows: List[Dict[str, Any]],
                   top1000_map: Optional[Dict[str, Dict[str, str]]] = None) -> List[Dict[str, Any]]:
    """项目主表:PMIS 在建 → 筛三部(空人员清单=不过滤,降级) → 挂映射/成本/健康度/TOP1000。
    payment 字段由 preprocess 9f 循环用 aggregate_payment_pmis 填入。
    matched=False 守卫为防御性分支(现行 _assemble 恒 matched=True),供未来非 PMIS 来源项目使用。"""
    top1000_map = top1000_map or {}
    delivery_by_pid: Dict[str, Dict[str, Any]] = {}
    for r in delivery_rows:
        pid = str(r.get("项目编号") or "").strip()
        if pid:
            delivery_by_pid.setdefault(pid, r)
    map_by_current = {m["current"]: m for m in mapping}

    out = []
    for pid, pm in project_pmis.items():
        if pm.get("source") != "在建":
            continue
        team = pm.get("team", {})
        manager = str(team.get("项目经理") or "").strip()
        if org_names and manager not in org_names:
            continue
        drow = delivery_by_pid.get(pid)
        name = str(team.get("项目名称") or "").strip()
        if not name and drow:
            name = str(drow.get("项目名称") or "").strip()
        m = map_by_current.get(pid)
        # paymentAbnormal 暂用 0 计算，后续 9f 用收款阶段 delayed 重算
        health = (compute_health(pm, 0) if pm.get("matched")
                  else {"progressAbnormal": False, "riskAbnormal": False, "costAbnormal": False,
                        "paymentAbnormal": False, "overall": "无数据"})
        customer = pm.get("customer") or {}
        final_customer = str(customer.get("最终客户") or "").strip()
        t1 = top1000_map.get(final_customer)
        top1000 = "是" if (t1 and t1.get("level") == config.TOP1000_LEVEL) else "否"
        quadrant = (t1.get("quad") if t1 else "") or ""
        out.append({
            "projectId": pid,
            "projectName": name,
            "projectManager": manager,
            "orgL4": str(team.get("L4部门") or "").strip(),
            "orgL3_1": str(team.get("L3_1部门") or "").strip(),
            "合同编号": str(customer.get("合同编号") or "").strip(),
            "isPresale": ((pm.get("status") or {}).get("项目类型") == config.PRESALE_PROJECT_TYPE),
            "relatedClosedId": (m["closed"] if m else ""),
            "deliveryCosts": delivery_costs_for(drow) if drow else [],
            "health": health,
            "top1000": top1000,
            "quadrant": quadrant,
        })
    out.sort(key=lambda p: p["projectId"])
    return out
```

- [ ] **Step 4: 改 `load_dept_projects` 读取并传入**

`projects.py:284-292`，`load_dept_projects` 增读 TOP1000 并传给 `build_projects`。当前函数体（:290-292）：

```python
    names, l4s, org_rows = read_org_names(os.path.join(input_dir, config.ORG_FILE))
    delivery = read_delivery(os.path.join(input_dir, config.DELIVERY_FILE))
    projects = build_projects(project_pmis, names, l4s, mapping, delivery)
```

改为：

```python
    names, l4s, org_rows = read_org_names(os.path.join(input_dir, config.ORG_FILE))
    delivery = read_delivery(os.path.join(input_dir, config.DELIVERY_FILE))
    top1000 = read_top1000(os.path.join(input_dir, config.TOP1000_FILE))
    projects = build_projects(project_pmis, names, l4s, mapping, delivery, top1000)
```

- [ ] **Step 5: 跑测试确认通过**

Run: `python -m pytest tests/test_projects.py::TestBuildProjectsTop1000 tests/test_projects.py::TestBuildProjects -v`
Expected: PASS（新 4 个 + 旧 build_projects 用例全过）

- [ ] **Step 6: 改 schema `Project`**

`schema.py:166-179`，`Project` 模型在 `health` 字段后加两字段：

```python
class Project(_Base):
    projectId: str
    projectName: str = ""
    projectManager: str = ""
    orgL4: str = ""
    orgL3_1: str = ""
    合同编号: str = ""
    isPresale: bool = False
    relatedClosedId: str = ""
    payment: ProjectPayment = ProjectPayment()
    deliveryCosts: List[DeliveryCostItem] = []
    overspendAmount: Optional[float] = None   # S2:整体超支金额(元,同源 profit.overspend_amount,可为负=未超支)
    paymentPmis: Optional[ProjectPaymentPmis] = None   # 2A:PMIS 核心回款摘要(售前回退原项目)
    health: ProjectHealth = ProjectHealth()
    top1000: str = "否"        # TOP1000.xlsx:是否 TOP1000 大客户(按最终客户匹配)
    quadrant: str = ""         # TOP1000.xlsx:客户象限(M1/M2/M3/M4),未匹配为空
```

- [ ] **Step 7: 再生成前端类型**

Run: `cd frontend && npm run gen:types`
Expected: `src/types/analysis.ts` 的 `Project` 接口新增 `top1000?: string` 与 `quadrant?: string`。**核对 git diff 仅这两项变更**（无其他漂移）：`git diff --stat frontend/src/types/analysis.ts`

- [ ] **Step 8: 校验 schema 自洽 + 全量 pytest**

Run: `python -m pytest -q && python -m ruff check projects.py schema.py`
Expected: 全绿

- [ ] **Step 9: Commit**

```bash
git add projects.py schema.py tests/test_projects.py frontend/src/types/analysis.ts
git commit -m "feat(backend): build_projects 派生 top1000/quadrant + schema 字段 + gen:types" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: /data 数据管理页上传清单加 TOP1000.xlsx

**Files:**
- Modify: `frontend/src/composables/useInputFiles.ts:3-7`
- Test: `frontend/src/composables/useInputFiles.test.ts:11-21`

**Interfaces:**
- Produces: `INPUT_FILE_NAMES` 含 `'TOP1000.xlsx'`（前端上传白名单；后端白名单已在 T1 加好）。

- [ ] **Step 1: 改失败测试（精确数组断言需同步）**

`useInputFiles.test.ts`，把 :11-17 的精确数组断言追加 `'TOP1000.xlsx'`，并把描述「九个」改「十个」，再加一条 `toContain`：

```typescript
  it('包含十个固定文件名(含核心回款源/TOP1000)', () => {
    expect(INPUT_FILE_NAMES).toEqual([
      '组织架构.xlsx', 'A.xlsx', 'delivery_analysis.csv', 'delivery_analysis.xlsx',
      'payment_records.csv', 'profit_loss_direct.csv', 'profit_loss_bridge.csv', 'budget_data.csv',
      'collection_stages.csv', 'TOP1000.xlsx',
    ])
  })

  it('白名单包含 TOP1000.xlsx', () => {
    expect(INPUT_FILE_NAMES).toContain('TOP1000.xlsx')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/composables/useInputFiles.test.ts`
Expected: FAIL（数组不含 TOP1000.xlsx）

- [ ] **Step 3: 改源**

`useInputFiles.ts:3-7`：

```typescript
export const INPUT_FILE_NAMES = [
  '组织架构.xlsx', 'A.xlsx', 'delivery_analysis.csv', 'delivery_analysis.xlsx',
  'payment_records.csv', 'profit_loss_direct.csv', 'profit_loss_bridge.csv', 'budget_data.csv',
  'collection_stages.csv', 'TOP1000.xlsx',
]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/composables/useInputFiles.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/composables/useInputFiles.ts frontend/src/composables/useInputFiles.test.ts
git commit -m "feat(fe): 数据管理页上传清单加 TOP1000.xlsx" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: /projects 新增 TOP1000/象限 两列（默认隐藏、可筛选）

**Files:**
- Modify: `frontend/src/lib/projectList.ts:6-31`(`ProjectRow`)、`:53-88`(`buildProjectRows`)
- Modify: `frontend/src/views/ProjectsView.vue:41-61`(`ALL_COLUMNS`)、`:64`(`FILTERABLE`)
- Test: `frontend/src/lib/projectList.test.ts`、`frontend/src/views/ProjectsView.test.ts`

**Interfaces:**
- Consumes: `Project.top1000`、`Project.quadrant`（Task 2）。
- Produces: `ProjectRow.top1000: string`、`ProjectRow.quadrant: string`。ProjectsView 两新列 key `top1000`/`quadrant`，不在 `DEFAULT_VISIBLE`、在 `FILTERABLE`。

- [ ] **Step 1: 写失败测试（projectList）**

`projectList.test.ts`，在 `describe('buildProjectRows', ...)` 块内追加用例（`proj()` 工具见文件 :7-14，`Project` 经 gen:types 已含可选 top1000/quadrant）：

```typescript
  it('从 Project 取 top1000/quadrant', () => {
    const [r] = buildProjectRows([proj({ top1000: '是', quadrant: 'M1 战略核心区' } as Partial<Project>)], {})
    expect(r.top1000).toBe('是')
    expect(r.quadrant).toBe('M1 战略核心区')
  })
  it('缺省 top1000→否 / quadrant→空', () => {
    const [r] = buildProjectRows([proj({ projectId: 'X9' })], {})
    expect(r.top1000).toBe('否')
    expect(r.quadrant).toBe('')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts`
Expected: FAIL（`r.top1000` undefined）

- [ ] **Step 3: 改 `ProjectRow` 与 `buildProjectRows`**

`projectList.ts`，`ProjectRow`（:6-31）在 `health: string` 后加两字段：

```typescript
  health: string
  top1000: string
  quadrant: string
```

`buildProjectRows`（:53-88）的返回对象，在 `health: p.health?.overall || '无数据',` 后加两行：

```typescript
      health: p.health?.overall || '无数据',
      top1000: p.top1000 || '否',
      quadrant: p.quadrant || '',
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/projectList.test.ts`
Expected: PASS

- [ ] **Step 5: 写失败测试（ProjectsView 列）**

`ProjectsView.test.ts`，在 `describe('ProjectsView', ...)` 末尾追加两条（`seed()`/`mountView()` 见文件 :28-49；localStorage 键 `colprefs:projects-active`）：

```typescript
  it('TOP1000/象限 列默认隐藏(不在默认表头)', async () => {
    seed()
    const w = mountView()
    await flushPromises()
    const headers = w.findAll('th').map((n) => n.text().trim())
    expect(headers.some((t) => t.includes('TOP1000'))).toBe(false)
    expect(headers.some((t) => t === '象限')).toBe(false)
  })

  it('启用后 TOP1000/象限 列渲染且带筛选器(可筛)', async () => {
    seed()
    localStorage.setItem('colprefs:projects-active',
      JSON.stringify(['projectName', 'top1000', 'quadrant', 'action']))
    const w = mountView()
    await flushPromises()
    const ths = w.findAll('th')
    const topTh = ths.find((n) => n.text().includes('TOP1000'))
    const quadTh = ths.find((n) => n.text().includes('象限'))
    expect(topTh).toBeTruthy()
    expect(quadTh).toBeTruthy()
    // FILTERABLE → 表头含 ColumnFilter 触发器 .cf-icon
    expect(topTh!.find('.cf-icon').exists()).toBe(true)
    expect(quadTh!.find('.cf-icon').exists()).toBe(true)
    localStorage.clear()
  })
```

- [ ] **Step 6: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts`
Expected: FAIL（启用列断言：列不存在 / 无 cf-icon）

- [ ] **Step 7: 改 `ALL_COLUMNS` 与 `FILTERABLE`**

`ProjectsView.vue`，`ALL_COLUMNS`（:41-61）在 `tags` 列（:59）与 `action` 列（:60）之间插入两列：

```typescript
  { key: 'tags', label: '标签', width: 160, formatter: (v) => (Array.isArray(v) && v.length ? v.join('、') : '') },
  { key: 'top1000', label: 'TOP1000', width: 90 },
  { key: 'quadrant', label: '象限', width: 140 },
  { key: 'action', label: '操作', width: 80, fixed: 'right' },
```

`FILTERABLE`（:64）加入两 key（**不**改 `DEFAULT_VISIBLE`）：

```typescript
const FILTERABLE = new Set(['projectManager', 'orgL4', 'stage', 'projectStatus', 'riskLevel', 'projectLevel', 'projectType', 'paymentStatus', 'health', 'top1000', 'quadrant'])
```

- [ ] **Step 8: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/ProjectsView.test.ts src/lib/projectList.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/projectList.ts frontend/src/lib/projectList.test.ts frontend/src/views/ProjectsView.vue frontend/src/views/ProjectsView.test.ts
git commit -m "feat(fe): /projects 加 TOP1000/象限 两列(默认隐藏可筛选)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: /project/:id 客户与签约单位之间展示 TOP1000大客户/象限

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue:282-290`（`pd-meta`）
- Test: `frontend/src/views/ProjectDetailView.test.ts`

**Interfaces:**
- Consumes: `Project.top1000`、`Project.quadrant`（详情页 `p` 即 `page.project`，是 `Project` 记录）。

- [ ] **Step 1: 写失败测试**

`ProjectDetailView.test.ts`，在 `seed()`（:37-45）的 `projects[0]`（P-1）对象里补两字段（加在 `health: { overall: '风险' }` 同对象内）：

```typescript
      { projectId: 'P-1', projectName: '终端安全项目', projectManager: '何平', orgL4: 'A组', isPresale: false, relatedClosedId: '', 合同编号: 'HT-2026-001',
        payment: { relatedNodeCount: 1, expectedTotal: 500000, actualTotal: 0, remainingTotal: 500000, paymentRatio: 0, delayedCount: 1 },
        deliveryCosts: [{ 类别: '内部人员成本', 预算金额: 122641.51, 实际发生: 0.0, 剩余预算: 122641.51, 消耗率: 0.0 }],
        top1000: '是', quadrant: 'M1 战略核心区',
        health: { overall: '风险' } },
```

并在 `describe('ProjectDetailView', ...)` 末尾追加用例：

```typescript
  it('详情头部 pd-meta 渲染 TOP1000大客户/象限(客户与签约单位之间)', async () => {
    seed()
    const w = await mountAt('/project/P-1')
    const meta = w.find('.pd-meta')
    expect(meta.text()).toContain('TOP1000大客户')
    expect(meta.text()).toContain('是')
    expect(meta.text()).toContain('象限')
    expect(meta.text()).toContain('M1 战略核心区')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: FAIL（pd-meta 不含 'TOP1000大客户'）

- [ ] **Step 3: 插入两 span**

`ProjectDetailView.vue:282-290`，在「客户」span（:285）与「签约单位」span（:286）之间插入：

```html
          <div class="pd-meta">
            <span>编号 <b>{{ p.projectId }}</b></span>
            <span>合同编号 <b>{{ p.合同编号 || '-' }}</b></span>
            <span>客户 <b>{{ m.customer?.最终客户 || '-' }}</b></span>
            <span>TOP1000大客户 <b>{{ p.top1000 || '否' }}</b></span>
            <span>象限 <b>{{ p.quadrant || '-' }}</b></span>
            <span>签约单位 <b>{{ m.customer?.签约单位 || '-' }}</b></span>
            <span>合同总额(万) <b class="u-num">{{ fmtWan(m.customer?.合同总额) }}</b></span>
            <span>项目经理 <b>{{ p.projectManager || '-' }}</b></span>
            <span>服务组 <b>{{ p.orgL4 || '-' }}</b></span>
          </div>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(fe): /project/:id 客户与签约单位间展示 TOP1000大客户/象限" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: /insight 维度新增 TOP1000/象限

**Files:**
- Modify: `frontend/src/lib/projectPivot.ts:8-28`(`InsightRow`)、`:37-69`(`buildInsightRows`)、`:71-89`(`InsightDimDef`+`INSIGHT_DIMENSIONS`)
- Test: `frontend/src/lib/projectPivot.test.ts`

**Interfaces:**
- Consumes: `Project.top1000`、`Project.quadrant`。
- Produces: `InsightRow.top1000: string`、`InsightRow.quadrant: string`；`INSIGHT_DIMENSIONS` 末尾加 `{key:'top1000',label:'TOP1000'}`、`{key:'quadrant',label:'象限'}`；`InsightDimDef.key` 联合类型加 `'top1000'|'quadrant'`。

- [ ] **Step 1: 改失败测试（契约面数组需同步 + 加映射断言）**

`projectPivot.test.ts`，把 :128 的维度 label 断言改为含新两项：

```typescript
    expect(INSIGHT_DIMENSIONS.map((d) => d.label)).toEqual(['阶段', '项目状态', '风险等级', '项目经理', '服务组', '项目级别', '行业', '签约单位', '健康度', '超支', '暂停', 'TOP1000', '象限'])
```

并在 `describe('契约面', ...)` 块内追加一条映射断言：

```typescript
  it('buildInsightRows 映射 top1000/quadrant', () => {
    const projects = [{ projectId: 'P-1', projectName: '甲', orgL4: '组', payment: { ...PAY0 }, health: {}, top1000: '是', quadrant: 'M1 战略核心区' }] as unknown as Project[]
    const r = buildInsightRows(projects, {})[0]
    expect(r.top1000).toBe('是')
    expect(r.quadrant).toBe('M1 战略核心区')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/projectPivot.test.ts`
Expected: FAIL（label 数组不含 TOP1000/象限；`r.top1000` undefined）

- [ ] **Step 3: 改 `InsightRow`、`buildInsightRows`、维度**

`projectPivot.ts`，`InsightRow`（:8-28）在 `paused: string` 后加两字段：

```typescript
  overspend: string // '是' | '否'(维度用字符串值)
  paused: string    // '是' | '否'
  top1000: string   // '是' | '否'
  quadrant: string  // 象限 M1/M2/M3/M4 或 '未指定'
```

`buildInsightRows`（:37-69）返回对象在 `paused: ...,` 后加两行（用文件内 `v()` helper，:30-33）：

```typescript
      overspend: cost.项目超支 === true ? '是' : '否',
      paused: st.是否暂停 === true ? '是' : '否',
      top1000: v(p.top1000, '否'),
      quadrant: v(p.quadrant),
```

`InsightDimDef.key` 联合类型（:72）加两项：

```typescript
export interface InsightDimDef {
  key: 'stage' | 'projectStatus' | 'riskLevel' | 'manager' | 'orgL4' | 'projectLevel' | 'industry' | 'signType' | 'health' | 'overspend' | 'paused' | 'top1000' | 'quadrant'
  label: string
}
```

`INSIGHT_DIMENSIONS`（:77-89）末尾追加：

```typescript
  { key: 'overspend', label: '超支' },
  { key: 'paused', label: '暂停' },
  { key: 'top1000', label: 'TOP1000' },
  { key: 'quadrant', label: '象限' },
]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/projectPivot.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/projectPivot.ts frontend/src/lib/projectPivot.test.ts
git commit -m "feat(fe): /insight 维度加 TOP1000/象限" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: /insight/board 维度新增 TOP1000/象限

**Files:**
- Modify: `frontend/src/lib/paymentBoard.ts:14-38`(`PayBoardRow`)、`:40-86`(`buildPayBoardRows`)、`:88-99`(`PayBoardDimDef`+`PAY_BOARD_DIMENSIONS`)
- Test: `frontend/src/lib/paymentBoard.test.ts`

**Interfaces:**
- Consumes: `Project.top1000`、`Project.quadrant`。
- Produces: `PayBoardRow.top1000: string`、`PayBoardRow.quadrant: string`；`PAY_BOARD_DIMENSIONS` 末尾加两维；`PayBoardDimDef.key` 加 `'top1000'|'quadrant'`。

- [ ] **Step 1: 改失败测试（维度 key 数组需同步 + 加映射断言）**

`paymentBoard.test.ts`，把 :60 的维度 key 断言改为含新两项：

```typescript
    expect(PAY_BOARD_DIMENSIONS.map((d) => d.key)).toEqual(['dept', 'projectLevel', 'industry', 'stage', 'tag', 'top1000', 'quadrant'])
```

并在 `describe('buildPayBoardRows', ...)` 块末尾追加一条映射断言（`projects`/`pmisMap` 夹具见文件 :28-48；P-A 项目对象无 top1000，验证缺省=否）：

```typescript
  it('映射 top1000/quadrant(缺省→否/未指定)', () => {
    const withT = [{ ...projects[0], top1000: '是', quadrant: 'M2 现金牛/打猎区' }] as unknown as Project[]
    const a = buildPayBoardRows(withT, pmisMap, paymentNodes, paymentRecords, '', '')[0]
    expect(a.top1000).toBe('是')
    expect(a.quadrant).toBe('M2 现金牛/打猎区')
    const b = buildPayBoardRows([projects[1]], pmisMap, paymentNodes, paymentRecords, '', '')[0]
    expect(b.top1000).toBe('否')
    expect(b.quadrant).toBe('未指定')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentBoard.test.ts`
Expected: FAIL（key 数组不含 top1000/quadrant；`a.top1000` undefined）

- [ ] **Step 3: 改 `PayBoardRow`、`buildPayBoardRows`、维度**

`paymentBoard.ts`，`PayBoardRow`（:14-38）在 `projectLevel: string` 后加两字段：

```typescript
  projectLevel: string
  top1000: string
  quadrant: string
```

`buildPayBoardRows`（:40-86）返回对象在 `projectLevel: v(stat['项目级别']),` 后加两行（用文件内 `v()` helper，:9-12）：

```typescript
      projectLevel: v(stat['项目级别']),
      top1000: v(p.top1000, '否'),
      quadrant: v(p.quadrant),
```

`PayBoardDimDef.key`（:89）加两项：

```typescript
export interface PayBoardDimDef {
  key: 'dept' | 'projectLevel' | 'industry' | 'stage' | 'tag' | 'top1000' | 'quadrant'
  label: string
  multi?: boolean   // tag 为 true：分组时按标签炸开
}
```

`PAY_BOARD_DIMENSIONS`（:93-99）末尾追加：

```typescript
  { key: 'stage', label: '项目阶段' },
  { key: 'tag', label: '标签', multi: true },
  { key: 'top1000', label: 'TOP1000' },
  { key: 'quadrant', label: '象限' },
]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentBoard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/paymentBoard.ts frontend/src/lib/paymentBoard.test.ts
git commit -m "feat(fe): /insight/board 维度加 TOP1000/象限" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: /insight/risk 维度新增 TOP1000/象限

**Files:**
- Modify: `frontend/src/lib/riskBoard.ts:31-41`(`RiskRow`)、`:43-60`(`buildRiskRows`)、`:85-92`(`RiskDimDef`+`RISK_DIMENSIONS`)
- Test: `frontend/src/lib/riskBoard.test.ts`

**Interfaces:**
- Consumes: `Project.top1000`、`Project.quadrant`。
- Produces: `RiskRow.top1000: string`、`RiskRow.quadrant: string`；`RISK_DIMENSIONS` 末尾加两维（自动出现在风险统计分析+风险概览两个维度选择器）；`RiskDimDef.key` 加 `'top1000'|'quadrant'`。

- [ ] **Step 1: 改失败测试（维度 key 数组需同步 + 加映射断言）**

`riskBoard.test.ts`，把 :82 的维度 key 断言改为含新两项：

```typescript
    expect(RISK_DIMENSIONS.map((d) => d.key)).toEqual(['riskLevel', 'orgL4', 'projectLevel', 'manager', 'industry', 'top1000', 'quadrant'])
```

并在 `describe('buildRiskRows', ...)` 块末尾追加一条映射断言（`projects`/`pmisMap` 夹具见文件 :35-43）：

```typescript
  it('映射 top1000/quadrant(缺省→否/未指定)', () => {
    const ps = [
      { projectId: 'T1', projectName: 't1', orgL4: '组', projectManager: '甲', top1000: '是', quadrant: 'M1 战略核心区' },
      { projectId: 'T2', projectName: 't2', orgL4: '组', projectManager: '乙' },
    ] as unknown as Project[]
    const [a, b] = buildRiskRows(ps, {})
    expect(a.top1000).toBe('是')
    expect(a.quadrant).toBe('M1 战略核心区')
    expect(b.top1000).toBe('否')
    expect(b.quadrant).toBe('未指定')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts`
Expected: FAIL（key 数组不含 top1000/quadrant；`a.top1000` undefined）

- [ ] **Step 3: 改 `RiskRow`、`buildRiskRows`、维度**

`riskBoard.ts`，`RiskRow`（:31-41）在 `industry: string` 后加两字段：

```typescript
  manager: string
  industry: string
  top1000: string
  quadrant: string
  riskLevel: RiskLevel
```

`buildRiskRows`（:43-60）返回对象在 `industry: v(cust['行业']),` 后加两行（用文件内 `v()` helper，:6-9）：

```typescript
      industry: v(cust['行业']),
      top1000: v(p.top1000, '否'),
      quadrant: v(p.quadrant),
      riskLevel: projectRiskLevel(m),
```

`RiskDimDef.key`（:85）加两项，`RISK_DIMENSIONS`（:86-92）末尾追加：

```typescript
export interface RiskDimDef { key: 'riskLevel' | 'orgL4' | 'projectLevel' | 'manager' | 'industry' | 'top1000' | 'quadrant'; label: string }
export const RISK_DIMENSIONS: RiskDimDef[] = [
  { key: 'riskLevel', label: '风险等级' },
  { key: 'orgL4', label: 'L4组织' },
  { key: 'projectLevel', label: '项目级别' },
  { key: 'manager', label: '项目经理' },
  { key: 'industry', label: '行业' },
  { key: 'top1000', label: 'TOP1000' },
  { key: 'quadrant', label: '象限' },
]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/riskBoard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/riskBoard.ts frontend/src/lib/riskBoard.test.ts
git commit -m "feat(fe): /insight/risk 维度加 TOP1000/象限" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 版本 V1.19.0 + PROGRESS.md + 全量验证

**Files:**
- Modify: `frontend/src/version.ts:1-4`
- Modify: `PROGRESS.md`（追加 V1.19.0 一条）

**Interfaces:**
- Consumes: 全部前置任务。

- [ ] **Step 1: 改版本**

`frontend/src/version.ts`：

```typescript
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.19.0'
export const RELEASE_DATE = '2026-06-24'
```

- [ ] **Step 2: 更新 PROGRESS.md**

在 `PROGRESS.md` 版本史区追加一行（格式照既有条目）：

```markdown
- V1.19.0(2026-06-24)：新增 TOP1000.xlsx 客户清单数据源。按最终客户匹配派生 top1000(是/否)/quadrant(象限) 到项目主域(schema 显式字段)；/data 可上传、更新数据同步；/projects 加两列(默认隐藏可筛选)；/project/:id 客户与签约单位间展示；/insight、/insight/board、/insight/risk 维度各加 TOP1000/象限。preprocess_data.py 未改。
```

- [ ] **Step 3: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(release): V1.19.0 TOP1000 客户属性接入" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（逐条对 spec）：**
- §1 目标 5 页 → T3(/data)/T4(/projects)/T5(/project:id)/T6,7,8(三分析页) ✅
- §2 数据源结构 → T1 read_top1000 解析客户名称/级别/象限 ✅
- §3 匹配/派生 → T2 build_projects（最终客户匹配 + level 判定 + quadrant 解耦）✅
- §4 后端（config/projects/schema/preprocess 不改）→ T1+T2 ✅
- §5.1 上传 → T3 ✅；§5.2 表格列 → T4 ✅；§5.3 详情 → T5 ✅；§5.4 三维度 → T6/7/8 ✅
- §6 边界（缺文件降级/未命中/空象限）→ T1 missing_file 测试 + T2 unmatched/no_map 测试 ✅
- §7 测试策略（后端 pytest + 前端 vitest + verify.sh + gen:types）→ 各任务 TDD + T2 gen:types + T9 verify ✅
- §8 版本 V1.19.0 → T9 ✅

**2. Placeholder scan：** 无 TBD/TODO；每个改码步骤均含完整代码块。✅

**3. Type consistency：**
- 字段名全程 `top1000`/`quadrant`（后端 dict 键、schema、analysis.ts、四个 Row 类型、四个维度 key）一致。✅
- `build_projects` 新形参 `top1000_map`（默认 None→{}）与 `load_dept_projects` 调用一致。✅
- 维度 key `'top1000'|'quadrant'` 同步加入三处 DimDef 联合类型，避免 typecheck 失败。✅
- 前端取值：分析行 `v(p.top1000,'否')`/`v(p.quadrant)`；表格行 `p.top1000||'否'`/`p.quadrant||''`；详情 `p.top1000||'否'`/`p.quadrant||'-'`——按上下文区分，已在 Global Constraints 锁定。✅
