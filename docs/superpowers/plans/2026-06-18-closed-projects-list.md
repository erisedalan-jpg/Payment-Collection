# 在建/已关闭项目清单 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全量摄取交付实施三部的已关闭项目（轻量 PMIS 已关闭三表口径），前端拆为在建/已关闭两个独立路由清单，已关闭行可点开精简详情页。

**Architecture:** 后端新增 `pmis.build_closed_projects` 读已关闭三表、复用 `_assemble`(source=已关闭) 取核心字段 + closeInfo，产出独立 `closedProjects` 键；schema 单一类型源经 gen:types 同步；前端新增两视图(清单+精简详情)+两路由+导航。先后端→schema→前端，TDD 每步先改/补测试。

**Tech Stack:** Python 3.8+（stdlib + openpyxl + pydantic v2）、Vue3 + Vite + TS + Pinia + Element Plus、pytest、vitest。

## Global Constraints

- 简体中文沟通；**全程禁用 emoji**，符号用 `→ ↓ ❌ ✕ ▾`。
- 根目录未跟踪文件 `看板数据取值条件与计算公式.md` 已删除；禁止 `git add -A` / `git add .`，每次提交只逐路径 `git add`。未跟踪的 `docs/字段级数据血缘-*.md`、`docs/数据血缘清单-*.md`、`.claude/` 不提交。
- 版本单一来源 `frontend/src/version.ts`；本子项目 Y 级（新增整页）→ V1.8.0，落版本只改此处 + PROGRESS 头部同步。
- 提交信息结尾恒为：`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`。
- PMIS/preprocess 运行命令前缀：`PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python ...`。
- 删除/迁移类任务（本计划 Task 3 schema 改 gen:types、Task 5/6 前端整页）跑**全量** pytest + 全量 vitest。
- closeInfo 日期字段（关闭时间/计划终验时间）必须归一化为 `"YYYY-MM-DD"` 字符串：`final_data` 经 `AnalysisData`(pydantic, str 字段) 校验 + `schema.validate_and_write_json` 的 `json.dump`（无 default=str），原始 openpyxl datetime 会校验失败且不可序列化。
- 已关闭 universe = 已关闭中心 ∩ 项目经理∈org_names（org_names 空则不过滤，降级），与现 `count_closed_dept` 同口径；`meta.totalClosed = len(closedProjects)`，现 `count_closed_dept`/`closedDeptCount` 保留不动（同口径相等）。
- L3-1 字段 JSON 键用下划线 `L3_1部门`，展示标签写 "L3-1部门"。
- schema 模型含 `extra="allow"` → 生成 TS interface 带 `[k: string]: unknown` 索引签名：删/改字段不报 typecheck，前端换名靠 grep 手改。

---

### Task 1: pmis.py — `_pmis_date_to_str` + `build_closed_projects`

**Files:**
- Modify: `pmis.py`（在 `build_project_pmis` 之后，约 338 行后追加）
- Test: `tests/test_pmis.py`（新增 `class TestBuildClosedProjects`）

**Interfaces:**
- Consumes: 现有 `read_pmis_sheet` / `_index_by_pid` / `_assemble` / `config.PMIS_FILES_CLOSED`（同模块/已 import）。
- Produces: `_pmis_date_to_str(v) -> Optional[str]`；`build_closed_projects(pmis_dir: str, org_names: set) -> List[Dict[str, Any]]`，每项含 `projectId/projectName/projectManager/orgL4/orgL3_1/合同编号/team/customer/status/progress/cost/closeInfo`（Task 2/3/4 消费）。

- [ ] **Step 1: 写失败测试**

`tests/test_pmis.py` 末尾追加：

```python
class TestBuildClosedProjects:
    def _make_closed(self, tmp_path):
        import openpyxl, datetime
        d = tmp_path / "pmis"; d.mkdir()

        def _wb(fn, headers, rows):
            wb = openpyxl.Workbook(); ws = wb.active
            ws.cell(row=1, column=1, value="标题")  # 第1行为合并标题,表头在第2行
            for j, h in enumerate(headers, start=1):
                ws.cell(row=2, column=j, value=h)
            for i, rec in enumerate(rows, start=3):
                for j, h in enumerate(headers, start=1):
                    ws.cell(row=i, column=j, value=rec.get(h))
            wb.save(str(d / fn))

        _wb(M.config.PMIS_FILES_CLOSED["center"],
            ["项目编号", "项目名称", "项目经理", "是否交付部门人工成本超支", "成本状态", "计划终验时间", "合同编号"],
            [{"项目编号": "C-1", "项目名称": "中心甲", "项目经理": "张三",
              "是否交付部门人工成本超支": "是", "成本状态": "正常",
              "计划终验时间": datetime.datetime(2025, 7, 1), "合同编号": "HT-C1"},
             {"项目编号": "C-2", "项目经理": "外部人"}])
        _wb(M.config.PMIS_FILES_CLOSED["base"],
            ["项目编号", "项目名称", "项目经理（FR）", "项目经理L4部门", "项目经理L3-1部门",
             "签约单位", "最终客户", "行业中类", "合同总额（元）", "合同编号",
             "项目状态", "项目关闭时间", "是否正常关闭", "关闭说明"],
            [{"项目编号": "C-1", "项目名称": "基础甲", "项目经理L4部门": "安全A组",
              "项目经理L3-1部门": "三部一组", "签约单位": "甲单位", "最终客户": "客A",
              "行业中类": "金融", "合同总额（元）": "1000000", "合同编号": "HT-B1",
              "项目状态": "已验收", "项目关闭时间": datetime.datetime(2025, 8, 15),
              "是否正常关闭": "是", "关闭说明": "正常结项"}])
        _wb(M.config.PMIS_FILES_CLOSED["status"],
            ["项目编号", "项目总预算（元）", "项目核算（元）", "剩余预算（元）",
             "项目阶段", "项目类型", "项目级别", "项目累计完工进展百分比"],
            [{"项目编号": "C-1", "项目总预算（元）": "1000", "项目核算（元）": "1200",
              "剩余预算（元）": "-200", "项目阶段": "项目收尾", "项目类型": "实施项目",
              "项目级别": "B", "项目累计完工进展百分比": "100"}])
        return str(d)

    def test_universe_and_fields(self, tmp_path):
        d = self._make_closed(tmp_path)
        out = M.build_closed_projects(d, {"张三"})
        assert [p["projectId"] for p in out] == ["C-1"]      # 仅经理∈org_names(C-2 外部人剔除)
        p = out[0]
        assert p["projectName"] == "中心甲"                   # center 优先
        assert p["projectManager"] == "张三"
        assert p["orgL4"] == "安全A组" and p["orgL3_1"] == "三部一组"
        assert p["合同编号"] == "HT-C1"                        # center 优先→base
        assert p["customer"]["签约单位"] == "甲单位"
        assert p["customer"]["合同总额"] == 1000000.0
        assert p["status"]["项目状态"] == "已验收" and p["status"]["项目级别"] == "B"
        assert p["progress"]["项目阶段"] == "项目收尾"
        assert p["cost"]["剩余预算"] == -200.0 and p["cost"]["项目超支"] is True
        assert p["cost"]["交付超支"] is True                   # center 是否交付部门人工成本超支==是
        assert p["closeInfo"]["关闭时间"] == "2025-08-15"      # datetime→YYYY-MM-DD
        assert p["closeInfo"]["计划终验时间"] == "2025-07-01"
        assert p["closeInfo"]["是否正常关闭"] == "是"
        assert p["team"]["L3_1部门"] == "三部一组"             # 下划线键

    def test_empty_org_no_filter_and_missing_dir(self, tmp_path):
        d = self._make_closed(tmp_path)
        assert {p["projectId"] for p in M.build_closed_projects(d, set())} == {"C-1", "C-2"}  # 空清单不过滤
        assert M.build_closed_projects(str(tmp_path / "none"), {"张三"}) == []                 # 缺目录→[]

    def test_count_consistency(self, tmp_path):
        import projects as P
        d = self._make_closed(tmp_path)
        assert len(M.build_closed_projects(d, {"张三"})) == P.count_closed_dept(d, {"张三"})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_pmis.py::TestBuildClosedProjects -q`
Expected: FAIL（`AttributeError: module 'pmis' has no attribute 'build_closed_projects'`）

- [ ] **Step 3: 实现 `_pmis_date_to_str` + `build_closed_projects`**

`pmis.py` 在 `build_project_pmis` 函数之后（约 338 行后、`load_project_pmis` 之前）新增：

```python
def _pmis_date_to_str(v: Any) -> Optional[str]:
    """PMIS xlsx 日期单元格(openpyxl datetime/文本)归一为 'YYYY-MM-DD';空→None。"""
    if v is None or v == "":
        return None
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    return s[:10] if s else None


def build_closed_projects(pmis_dir: str, org_names: set) -> List[Dict[str, Any]]:
    """已关闭项目轻量清单:已关闭中心 ∩ 项目经理∈org_names(空则不过滤,降级)。
    复用 _assemble(已关闭) 取 PMIS 已关闭三表核心字段 + closeInfo(关闭时间/是否正常关闭/
    关闭说明/计划终验时间);无回款/里程碑/利润/风险 join。"""
    c_base = _index_by_pid(read_pmis_sheet(os.path.join(pmis_dir, config.PMIS_FILES_CLOSED["base"])))
    c_center = _index_by_pid(read_pmis_sheet(os.path.join(pmis_dir, config.PMIS_FILES_CLOSED["center"])))
    c_status = _index_by_pid(read_pmis_sheet(os.path.join(pmis_dir, config.PMIS_FILES_CLOSED["status"])))
    out: List[Dict[str, Any]] = []
    for pid, crow in c_center.items():
        mgr = str(crow.get("项目经理") or "").strip()
        if org_names and mgr not in org_names:
            continue
        pm = _assemble(pid, c_base, c_center, c_status, {}, "已关闭")
        brow = c_base.get(pid, {})
        team = pm["team"]
        out.append({
            "projectId": pid,
            "projectName": team["项目名称"] or "",
            "projectManager": team["项目经理"] or "",
            "orgL4": team["L4部门"] or "",
            "orgL3_1": team["L3_1部门"] or "",
            "合同编号": pm["customer"]["合同编号"] or "",
            "team": team,
            "customer": pm["customer"],
            "status": pm["status"],
            "progress": pm["progress"],
            "cost": pm["cost"],
            "closeInfo": {
                "关闭时间": _pmis_date_to_str(brow.get("项目关闭时间")),
                "是否正常关闭": (str(brow.get("是否正常关闭")).strip() or None) if brow.get("是否正常关闭") not in (None, "") else None,
                "关闭说明": (str(brow.get("关闭说明")).strip() or None) if brow.get("关闭说明") not in (None, "") else None,
                "计划终验时间": _pmis_date_to_str(crow.get("计划终验时间")),
            },
        })
    return out
```

（注：`cost`/`status`/`progress`/`team`/`customer` 直接透传 `_assemble` 产出的整块——它们恰好对应 schema 的 `PmisCost/PmisStatus/PmisProgress/PmisTeam/PmisCustomer`，轻量且无 risk/riskRecords/payment。）

- [ ] **Step 4: 跑测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_pmis.py::TestBuildClosedProjects -q`
Expected: PASS

- [ ] **Step 5: 跑全量 pmis 测试**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_pmis.py -q`
Expected: PASS（全绿）

- [ ] **Step 6: Commit**

```bash
git add pmis.py tests/test_pmis.py
git commit -m "feat(pmis): build_closed_projects 已关闭轻量摄取(已关闭三表∩三部,closeInfo 日期归一)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: preprocess_data.py — closedProjects 接线 + meta.totalClosed

**Files:**
- Modify: `preprocess_data.py`（9c 区 ~853 后取 names + 调 build_closed_projects；meta ~932-933；final_data ~945 同级加 closedProjects）
- Test: `tests/test_preprocess.py`（新增单测）

**Interfaces:**
- Consumes: `pmis.build_closed_projects`（Task 1，已全单测）、`projects_mod.read_org_names`（现有）。
- Produces: `final_data["closedProjects"]`（List）、`meta.totalClosed = len(closedProjects)`（Task 3/4 消费）。

> 注：本任务是 main() 编排接线（2 处编辑），无新纯函数（`build_closed_projects` 逻辑已在 Task 1 TDD 全覆盖）。main() 不可单测，故本任务的可测交付物 = **真实集成冒烟对产物 JSON 的断言**（Step 2）+ 全量 pytest（Step 3）。不写测桩自身的空洞单测。

- [ ] **Step 1: 接线 main() — 取 names + 构建 closedProjects**

`preprocess_data.py` 中 `dept_projects, projects_quality = projects_mod.load_dept_projects(os.path.join(BASE_DIR, "input"), project_pmis, mapping)`（~853-854）之后插入：

```python
    org_names, _org_l4s, _org_rows = projects_mod.read_org_names(
        os.path.join(BASE_DIR, "input", config.ORG_FILE))
    closed_projects = pmis.build_closed_projects(pmis_dir, org_names)
    print(f"  [OK] 已关闭项目清单 {len(closed_projects)} 个(交付三部)")
```

- [ ] **Step 2: 接线 main() — meta + final_data**

`preprocess_data.py` meta 块（~932-933）`"totalClosed"` 行改为：

```python
            "totalClosed": len(closed_projects),
```

`final_data` 中 `"projects": dept_projects,`（~945）下一行加：

```python
        "closedProjects": closed_projects,
```

- [ ] **Step 3: 集成冒烟 — 跑真实 preprocess 并核对（本任务可测交付物）**

Run:
```bash
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python preprocess_data.py
PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -c "import json; d=json.load(open('data/analysis_data.json',encoding='utf-8')); cp=d['closedProjects']; print('closedProjects', len(cp), 'totalClosed', d['meta']['totalClosed']); p=cp[0]; print('ok', d['meta']['totalClosed']==len(cp) and 'closeInfo' in p and 'team' in p and 'cost' in p and isinstance(p['closeInfo'].get('关闭时间'),(str,type(None))))"
```
Expected: `closedProjects` 约 3417、`totalClosed` 与之相等、`ok True`（closeInfo.关闭时间 为 str/None，非 datetime）。

- [ ] **Step 4: 全量 pytest**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest -q`
Expected: PASS（全绿）

- [ ] **Step 5: Commit**

```bash
git add preprocess_data.py
git commit -m "feat(preprocess): 接线 closedProjects(已关闭全量) + meta.totalClosed=len(closedProjects)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: schema.py + gen:types

**Files:**
- Modify: `schema.py`（新增 `ClosedProjectCloseInfo`/`ClosedProject`；`AnalysisData` 加 `closedProjects`）
- Generated: `frontend/src/types/analysis.ts`（gen:types 重写）
- Test: `tests/test_schema.py`

**Interfaces:**
- Consumes: 现有 `PmisTeam/PmisCustomer/PmisStatus/PmisProgress/PmisCost`（复用）。
- Produces: `ClosedProject` 模型 + `AnalysisData.closedProjects: List[ClosedProject]`；`analysis.ts` 的 `ClosedProject`/`ClosedProjectCloseInfo`（Task 4/5/6 消费）。

> 对 spec 的 DRY 精化：spec §三 列了独立 `ClosedProjectCost`，但其字段与现有 `PmisCost` 完全相同（总预算/核算/剩余预算/消耗比/项目超支/交付超支/成本状态），且 Task 1 的 `build_closed_projects` 直接透传 `_assemble` 的 `cost`（=derive_cost 输出=PmisCost 形态）。故 `ClosedProject.cost` **直接复用 `PmisCost`**，不另建 `ClosedProjectCost`。

- [ ] **Step 1: 写/改 schema 测试**

`tests/test_schema.py` 末尾追加：

```python
def test_closed_projects_schema():
    import schema
    base = {"meta": {"lastUpdate": "2026-06-18 10:00", "totalProjects": 1, "totalClosed": 1, "totalPaymentNodes": 0},
            "projectOverview": {"projects": [], "columns": []},
            "closedProjects": [{
                "projectId": "C-1", "projectName": "甲", "projectManager": "张三",
                "orgL4": "安全A组", "orgL3_1": "三部一组", "合同编号": "HT-1",
                "team": {"L3_1部门": "三部一组", "AR": "AR张"},
                "customer": {"最终客户": "客A", "签约单位": "甲单位", "合同总额": 1000000.0, "行业": "金融"},
                "status": {"项目状态": "已验收", "项目级别": "B", "项目类型": "实施项目", "评级": "A"},
                "progress": {"完工进展": 1.0, "项目阶段": "项目收尾"},
                "cost": {"剩余预算": -200.0, "项目超支": True, "交付超支": True, "消耗比": 1.2},
                "closeInfo": {"关闭时间": "2025-08-15", "是否正常关闭": "是", "关闭说明": "正常结项", "计划终验时间": "2025-07-01"},
            }]}
    m = schema.AnalysisData.model_validate(base)
    cp = m.closedProjects[0]
    assert cp.projectId == "C-1" and cp.合同编号 == "HT-1"
    assert cp.team.L3_1部门 == "三部一组"
    assert cp.cost.项目超支 is True and cp.cost.交付超支 is True
    assert cp.closeInfo.关闭时间 == "2025-08-15" and cp.closeInfo.计划终验时间 == "2025-07-01"
    assert cp.status.项目状态 == "已验收"
    # 声明完整性(防字段被误删)
    assert "closedProjects" in schema.AnalysisData.model_fields
    assert {"关闭时间", "计划终验时间", "是否正常关闭", "关闭说明"} <= set(schema.ClosedProjectCloseInfo.model_fields)
    assert "closeInfo" in schema.ClosedProject.model_fields


def test_closed_projects_default_empty():
    import schema
    base = {"meta": {"lastUpdate": "x", "totalProjects": 0, "totalPaymentNodes": 0},
            "projectOverview": {"projects": [], "columns": []}}
    m = schema.AnalysisData.model_validate(base)
    assert m.closedProjects == []   # 默认空(不传不报错)
```

- [ ] **Step 2: 跑测试确认失败**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_schema.py::test_closed_projects_schema -q`
Expected: FAIL（`closedProjects`/`ClosedProject` 不存在）

- [ ] **Step 3: 改 schema.py**

`schema.py` 在 `class Project(_Base):` 之后（约 185 行后）新增：

```python
class ClosedProjectCloseInfo(_Base):
    关闭时间: Optional[str] = None
    是否正常关闭: Optional[str] = None
    关闭说明: Optional[str] = None
    计划终验时间: Optional[str] = None


class ClosedProject(_Base):
    projectId: str
    projectName: str = ""
    projectManager: str = ""
    orgL4: str = ""
    orgL3_1: str = ""
    合同编号: str = ""
    team: PmisTeam = PmisTeam()
    customer: PmisCustomer = PmisCustomer()
    status: PmisStatus = PmisStatus()
    progress: PmisProgress = PmisProgress()
    cost: PmisCost = PmisCost()
    closeInfo: ClosedProjectCloseInfo = ClosedProjectCloseInfo()
```

`AnalysisData`（~306）在 `projects: List[Project] = []` 下一行加：

```python
    closedProjects: List[ClosedProject] = []
```

- [ ] **Step 4: 跑 schema 测试确认通过**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest tests/test_schema.py -q`
Expected: PASS

- [ ] **Step 5: 重生类型**

Run: `cd frontend && npm run gen:types`
Expected: 无报错；`frontend/src/types/analysis.ts` 重写，含 `interface ClosedProject`（projectId/projectName/projectManager/orgL4/orgL3_1/合同编号/team/customer/status/progress/cost/closeInfo）与 `interface ClosedProjectCloseInfo`（关闭时间?/是否正常关闭?/关闭说明?/计划终验时间?），`interface AnalysisData` 含 `closedProjects?`。

- [ ] **Step 6: 全量 pytest + 全量 vitest（迁移类:gen:types 后防牵连）**

Run: `PYTHONUTF8=1 PYTHONIOENCODING=utf-8 python -m pytest -q && cd frontend && npm run test:run`
Expected: PASS（前端未改、靠索引签名兜底，应仍全绿）

- [ ] **Step 7: Commit**

```bash
git add schema.py tests/test_schema.py frontend/src/types/analysis.ts
git commit -m "feat(schema): ClosedProject 模型 + closedProjects 根键 + gen:types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 前端 lib — closedProjectList.ts

**Files:**
- Create: `frontend/src/lib/closedProjectList.ts`
- Test: `frontend/src/lib/closedProjectList.test.ts`

**Interfaces:**
- Consumes: `ClosedProject`（Task 3 类型）。
- Produces: `ClosedRow`、`ClosedFilters`、`buildClosedRows(closedProjects)`、`filterClosedRows(rows, f)`、`distinctClosedOptions(rows, key)`（Task 5 消费）。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/lib/closedProjectList.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { buildClosedRows, filterClosedRows, distinctClosedOptions, type ClosedRow } from './closedProjectList'
import type { ClosedProject } from '@/types/analysis'

function cp(over: Partial<any> = {}): any {
  return {
    projectId: 'C-1', projectName: '甲', projectManager: '张三', orgL4: '安全A组', orgL3_1: '三部一组',
    合同编号: 'HT-1',
    customer: { 最终客户: '客A', 签约单位: '甲单位', 合同总额: 1000000, 行业: '金融' },
    status: { 项目状态: '已验收', 项目级别: 'B', 项目类型: '实施项目', 评级: 'A' },
    progress: { 项目阶段: '项目收尾', 完工进展: 1 },
    cost: { 消耗比: 1.2, 项目超支: true, 交付超支: true },
    closeInfo: { 关闭时间: '2025-08-15', 计划终验时间: '2025-07-01', 是否正常关闭: '是' },
    ...over,
  }
}

describe('buildClosedRows', () => {
  it('扁平化关键列', () => {
    const r = buildClosedRows([cp() as ClosedProject])[0]
    expect(r.projectId).toBe('C-1')
    expect(r.customer).toBe('客A')
    expect(r.signParty).toBe('甲单位')
    expect(r.contractAmount).toBe(1000000)
    expect(r.orgL4).toBe('安全A组')
    expect(r.orgL3_1).toBe('三部一组')
    expect(r.projectType).toBe('实施项目')
    expect(r.projectLevel).toBe('B')
    expect(r.rating).toBe('A')
    expect(r.stage).toBe('项目收尾')
    expect(r.projectStatus).toBe('已验收')
    expect(r.closedAt).toBe('2025-08-15')
    expect(r.costRatio).toBe(1.2)
    expect(r.overspend).toBe(true)
  })
})

describe('filterClosedRows', () => {
  const rows = buildClosedRows([
    cp() as ClosedProject,
    cp({ projectId: 'C-2', projectName: '乙', projectManager: '李四',
         orgL4: '安全B组', orgL3_1: '三部二组',
         status: { 项目状态: '已关闭', 项目级别: 'A', 项目类型: '售前服务类', 评级: 'B' },
         progress: { 项目阶段: '已结项' } }) as ClosedProject,
  ])
  it('搜索匹配 名/编号/客户/经理', () => {
    expect(filterClosedRows(rows, { search: '李四', manager: [], orgL4: [], orgL3_1: [], projectType: [], projectLevel: [], rating: [], stage: [], projectStatus: [] }).map(r => r.projectId)).toEqual(['C-2'])
  })
  it('多选 经理 过滤', () => {
    expect(filterClosedRows(rows, { search: '', manager: ['张三'], orgL4: [], orgL3_1: [], projectType: [], projectLevel: [], rating: [], stage: [], projectStatus: [] }).map(r => r.projectId)).toEqual(['C-1'])
  })
  it('空筛选返回全部', () => {
    expect(filterClosedRows(rows, { search: '', manager: [], orgL4: [], orgL3_1: [], projectType: [], projectLevel: [], rating: [], stage: [], projectStatus: [] }).length).toBe(2)
  })
})

describe('distinctClosedOptions', () => {
  it('去重升序', () => {
    const rows = buildClosedRows([cp() as ClosedProject, cp({ projectId: 'C-2', projectManager: '李四' }) as ClosedProject])
    expect(distinctClosedOptions(rows, 'projectManager')).toEqual(['张三', '李四'].sort())
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- closedProjectList`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 closedProjectList.ts**

Create `frontend/src/lib/closedProjectList.ts`：

```typescript
import type { ClosedProject } from '@/types/analysis'

// 已关闭项目清单行：closedProjects[] 扁平化展示模型(轻量,无回款/健康)
export interface ClosedRow {
  projectId: string
  projectName: string
  projectManager: string
  orgL4: string
  orgL3_1: string
  customer: string
  signParty: string
  contractAmount: number | null
  industry: string
  projectType: string
  projectLevel: string
  rating: string
  stage: string
  projectStatus: string
  closedAt: string
  costRatio: number | null
  overspend: boolean
}

export interface ClosedFilters {
  search: string
  manager: string[]
  orgL4: string[]
  orgL3_1: string[]
  projectType: string[]
  projectLevel: string[]
  rating: string[]
  stage: string[]
  projectStatus: string[]
}

const v = (x: unknown): string => (x == null ? '' : String(x)).trim()

export function buildClosedRows(closed: ClosedProject[]): ClosedRow[] {
  return (closed ?? []).map((p) => ({
    projectId: p.projectId,
    projectName: v(p.projectName),
    projectManager: v(p.projectManager),
    orgL4: v(p.orgL4),
    orgL3_1: v(p.orgL3_1),
    customer: v(p.customer?.最终客户),
    signParty: v(p.customer?.签约单位),
    contractAmount: (p.customer?.合同总额 ?? null) as number | null,
    industry: v(p.customer?.行业),
    projectType: v(p.status?.项目类型),
    projectLevel: v(p.status?.项目级别),
    rating: v(p.status?.评级),
    stage: v(p.progress?.项目阶段),
    projectStatus: v(p.status?.项目状态),
    closedAt: v(p.closeInfo?.关闭时间),
    costRatio: (p.cost?.消耗比 ?? null) as number | null,
    overspend: p.cost?.项目超支 === true,
  }))
}

export function filterClosedRows(rows: ClosedRow[], f: ClosedFilters): ClosedRow[] {
  const kw = f.search.trim().toLowerCase()
  const inSel = (sel: string[], val: string) => sel.length === 0 || sel.includes(val)
  return rows.filter((r) => {
    if (kw && ![r.projectName, r.projectId, r.customer, r.projectManager]
      .some((x) => x.toLowerCase().includes(kw))) return false
    return inSel(f.manager, r.projectManager) && inSel(f.orgL4, r.orgL4)
      && inSel(f.orgL3_1, r.orgL3_1) && inSel(f.projectType, r.projectType)
      && inSel(f.projectLevel, r.projectLevel) && inSel(f.rating, r.rating)
      && inSel(f.stage, r.stage) && inSel(f.projectStatus, r.projectStatus)
  })
}

export function distinctClosedOptions(rows: ClosedRow[], key: keyof ClosedRow): string[] {
  const s = new Set<string>()
  for (const r of rows) { const val = String(r[key] ?? '').trim(); if (val) s.add(val) }
  return [...s].sort()
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- closedProjectList`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/closedProjectList.ts frontend/src/lib/closedProjectList.test.ts
git commit -m "feat(fe-lib): closedProjectList(已关闭清单行/筛选/选项)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 前端 — ClosedProjectsView + 路由 + 导航

**Files:**
- Create: `frontend/src/views/ClosedProjectsView.vue`
- Modify: `frontend/src/router/index.ts`（加 2 路由）
- Modify: `frontend/src/nav.ts`（PROJECT_LINKS 改名 + 加项）
- Modify: `frontend/src/layout/AppSidebar.test.ts`（'项目清单'→'在建项目' 断言）
- Test: `frontend/src/views/ClosedProjectsView.test.ts`

**Interfaces:**
- Consumes: `buildClosedRows/filterClosedRows/distinctClosedOptions/ClosedFilters`（Task 4）、`ClosedProject`（Task 3）、`DataTable`（现有）。
- Produces: 路由 `/projects/closed`、`/closed-project/:id`（Task 6 用后者）；导航「在建项目」「已关闭项目」。

- [ ] **Step 1: 改导航 nav.ts**

`frontend/src/nav.ts` 的 `PROJECT_LINKS`（20-25）改为：

```typescript
export const PROJECT_LINKS: NavLink[] = [
  { label: '项目总览', to: '/' },
  { label: '在建项目', to: '/projects' },
  { label: '已关闭项目', to: '/projects/closed' },
  { label: '项目动态', to: '/activity' },
  { label: '项目分析', to: '/insight' },
]
```

- [ ] **Step 2: 改 AppSidebar.test.ts 断言**

`frontend/src/layout/AppSidebar.test.ts:33` 的 `expect(text).toContain('项目清单')` 改为：

```typescript
    expect(text).toContain('在建项目')        // 项目组（在建）
    expect(text).toContain('已关闭项目')      // 项目组（已关闭）
```

- [ ] **Step 3: 加路由**

`frontend/src/router/index.ts` 顶部 import 加：

```typescript
import ClosedProjectsView from '@/views/ClosedProjectsView.vue'
import ClosedProjectDetailView from '@/views/ClosedProjectDetailView.vue'
```

`routes` 数组中 `/project/:id` 路由那行之后插入：

```typescript
    { path: '/projects/closed', name: 'closed-projects', component: ClosedProjectsView, meta: { title: '已关闭项目', hideFilter: true } },
    { path: '/closed-project/:id', name: 'closed-project-detail', component: ClosedProjectDetailView, meta: { title: '已关闭项目详情', hideFilter: true } },
```

（注：Task 6 才创建 `ClosedProjectDetailView.vue`；本任务先建占位避免 import 报错——见 Step 4 末尾占位说明，或将本 import+路由行与 Task 6 同测；为保证本任务 typecheck 过，Step 4 同时创建 ClosedProjectDetailView 的最小占位，Task 6 再充实。）

- [ ] **Step 4: 创建 ClosedProjectsView.vue + ClosedProjectDetailView 占位**

Create `frontend/src/views/ClosedProjectsView.vue`：

```vue
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { ClosedProject } from '@/types/analysis'
import { buildClosedRows, filterClosedRows, distinctClosedOptions, type ClosedFilters } from '@/lib/closedProjectList'
import { fmtRatio } from '@/lib/format'
import DataTable, { type DataColumn } from '@/components/DataTable.vue'

const data = useDataStore()
const router = useRouter()
onMounted(() => { if (!data.data) data.load() })

const rows = computed(() => buildClosedRows((data.data?.closedProjects ?? []) as ClosedProject[]))
const filters = reactive<ClosedFilters>({ search: '', manager: [], orgL4: [], orgL3_1: [], projectType: [], projectLevel: [], rating: [], stage: [], projectStatus: [] })
const filtered = computed(() => filterClosedRows(rows.value, filters))

const managerOpts = computed(() => distinctClosedOptions(rows.value, 'projectManager'))
const orgL4Opts = computed(() => distinctClosedOptions(rows.value, 'orgL4'))
const orgL31Opts = computed(() => distinctClosedOptions(rows.value, 'orgL3_1'))
const typeOpts = computed(() => distinctClosedOptions(rows.value, 'projectType'))
const levelOpts = computed(() => distinctClosedOptions(rows.value, 'projectLevel'))
const ratingOpts = computed(() => distinctClosedOptions(rows.value, 'rating'))
const stageOpts = computed(() => distinctClosedOptions(rows.value, 'stage'))
const statusOpts = computed(() => distinctClosedOptions(rows.value, 'projectStatus'))

const pageSize = ref(50)
const currentPage = ref(1)
const paged = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value))
watch(filtered, () => { currentPage.value = 1 })

const columns: DataColumn[] = [
  { key: 'projectName', label: '项目名称' },
  { key: 'projectId', label: '项目编号', width: 190 },
  { key: 'customer', label: '客户', width: 130 },
  { key: 'signParty', label: '签约单位', width: 130 },
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'orgL4', label: '服务组(L4)', width: 110 },
  { key: 'orgL3_1', label: 'L3-1部门', width: 110 },
  { key: 'projectManager', label: '项目经理', width: 90 },
  { key: 'projectType', label: '项目类型', width: 100 },
  { key: 'projectLevel', label: '级别', width: 70 },
  { key: 'rating', label: '评级', width: 70 },
  { key: 'stage', label: '项目阶段', width: 100 },
  { key: 'projectStatus', label: '项目状态', width: 100 },
  { key: 'closedAt', label: '关闭时间', width: 110, sortable: true },
  { key: 'costRatio', label: '预算消耗比', width: 105, sortable: true, formatter: (v) => fmtRatio(v) },
  { key: 'overspend', label: '项目超支', width: 90, formatter: (v) => (v === true ? '是' : '否') },
]

function onRow(row: Record<string, any>) { router.push(`/closed-project/${row.projectId}`) }
</script>

<template>
  <div class="closed-view">
    <h2 class="cv-title">已关闭项目</h2>
    <div class="toolbar">
      <el-input v-model="filters.search" size="small" placeholder="搜索 项目名/编号/客户/经理" clearable style="width: 230px" />
      <el-select v-model="filters.manager" size="small" multiple collapse-tags clearable placeholder="项目经理" style="width: 130px">
        <el-option v-for="o in managerOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.orgL4" size="small" multiple collapse-tags clearable placeholder="服务组(L4)" style="width: 130px">
        <el-option v-for="o in orgL4Opts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.orgL3_1" size="small" multiple collapse-tags clearable placeholder="L3-1部门" style="width: 130px">
        <el-option v-for="o in orgL31Opts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectType" size="small" multiple collapse-tags clearable placeholder="项目类型" style="width: 120px">
        <el-option v-for="o in typeOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectLevel" size="small" multiple collapse-tags clearable placeholder="级别" style="width: 110px">
        <el-option v-for="o in levelOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.rating" size="small" multiple collapse-tags clearable placeholder="评级" style="width: 110px">
        <el-option v-for="o in ratingOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.stage" size="small" multiple collapse-tags clearable placeholder="项目阶段" style="width: 120px">
        <el-option v-for="o in stageOpts" :key="o" :value="o" :label="o" />
      </el-select>
      <el-select v-model="filters.projectStatus" size="small" multiple collapse-tags clearable placeholder="项目状态" style="width: 120px">
        <el-option v-for="o in statusOpts" :key="o" :value="o" :label="o" />
      </el-select>
    </div>

    <div v-if="!rows.length" class="cv-empty">暂无已关闭项目数据——请在「数据管理」提供 PMIS 已关闭三表后点「更新数据」。</div>
    <DataTable v-else :columns="columns" :rows="paged" :show-count="false" clickable @row-click="onRow" />

    <div v-if="rows.length" class="cv-pager">
      <span class="cv-total u-num">共 {{ filtered.length }} 条</span>
      <el-pagination v-model:current-page="currentPage" v-model:page-size="pageSize"
        :page-sizes="[20, 50, 80, 100]" :total="filtered.length"
        layout="sizes, prev, pager, next" size="small" background />
    </div>
  </div>
</template>

<style scoped>
.closed-view { padding: var(--sp-4); }
.cv-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0 0 var(--sp-3); }
.toolbar { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.cv-empty { color: var(--mut); padding: var(--sp-7) 0; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.cv-pager { display: flex; align-items: center; justify-content: flex-end; gap: var(--sp-3); margin-top: var(--sp-3); }
.cv-total { font-size: var(--fs-1); color: var(--sub); }
</style>
```

同时创建最小占位 `frontend/src/views/ClosedProjectDetailView.vue`（Task 6 充实）：

```vue
<script setup lang="ts"></script>
<template><div class="cd-view">已关闭项目详情</div></template>
```

- [ ] **Step 5: 写 ClosedProjectsView 测试**

Create `frontend/src/views/ClosedProjectsView.test.ts`（参照现有 view 测试：建 store + mount + 断言）。最小：

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ClosedProjectsView from './ClosedProjectsView.vue'
import { useDataStore } from '@/stores/data'

function makeRouter() {
  return createRouter({ history: createWebHistory(), routes: [
    { path: '/projects/closed', component: ClosedProjectsView },
    { path: '/closed-project/:id', component: { template: '<div/>' } },
  ] })
}

describe('ClosedProjectsView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('渲染已关闭清单列与行', async () => {
    const ds = useDataStore()
    ds.data = { closedProjects: [{
      projectId: 'C-1', projectName: '终端甲', projectManager: '张三', orgL4: '安全A组', orgL3_1: '三部一组',
      合同编号: 'HT-1', customer: { 最终客户: '客A', 签约单位: '甲单位', 合同总额: 1000000, 行业: '金融' },
      status: { 项目状态: '已验收', 项目级别: 'B', 项目类型: '实施项目', 评级: 'A' },
      progress: { 项目阶段: '项目收尾', 完工进展: 1 }, cost: { 消耗比: 1.2, 项目超支: true, 交付超支: true },
      closeInfo: { 关闭时间: '2025-08-15', 计划终验时间: '2025-07-01', 是否正常关闭: '是' },
    }] } as any
    const router = makeRouter(); router.push('/projects/closed'); await router.isReady()
    const w = mount(ClosedProjectsView, { global: { plugins: [router] } })
    await w.vm.$nextTick()
    expect(w.text()).toContain('已关闭项目')
    expect(w.text()).toContain('终端甲')
    expect(w.text()).toContain('已验收')
    expect(w.text()).toContain('2025-08-15')
  })

  it('空数据空态', async () => {
    const ds = useDataStore(); ds.data = { closedProjects: [] } as any
    const router = makeRouter(); router.push('/projects/closed'); await router.isReady()
    const w = mount(ClosedProjectsView, { global: { plugins: [router] } })
    await w.vm.$nextTick()
    expect(w.text()).toContain('暂无已关闭项目数据')
  })
})
```

（若现有 view 测试用更简的 mount helper/stub，按本仓现有约定对齐；Element Plus 组件需在 vitest setup 注册或用 global.stubs，参照同目录现有 *.test.ts 写法。）

- [ ] **Step 6: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- ClosedProjectsView AppSidebar`
Expected: PASS（含 AppSidebar 改后断言）

- [ ] **Step 7: typecheck + 全量 vitest**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: PASS（占位 ClosedProjectDetailView 不报错；全量绿）

- [ ] **Step 8: Commit**

```bash
git add frontend/src/views/ClosedProjectsView.vue frontend/src/views/ClosedProjectDetailView.vue frontend/src/router/index.ts frontend/src/nav.ts frontend/src/layout/AppSidebar.test.ts frontend/src/views/ClosedProjectsView.test.ts
git commit -m "feat(fe-views): 已关闭项目清单 /projects/closed + 路由/导航(在建项目/已关闭项目)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 前端 — ClosedProjectDetailView（精简详情）

**Files:**
- Modify: `frontend/src/views/ClosedProjectDetailView.vue`（充实占位）
- Test: `frontend/src/views/ClosedProjectDetailView.test.ts`

**Interfaces:**
- Consumes: `ClosedProject`（Task 3）；路由 `/closed-project/:id`（Task 5）。

- [ ] **Step 1: 写失败测试**

Create `frontend/src/views/ClosedProjectDetailView.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ClosedProjectDetailView from './ClosedProjectDetailView.vue'
import { useDataStore } from '@/stores/data'

const CP = {
  projectId: 'C-1', projectName: '终端甲', projectManager: '何平', orgL4: '安全A组', orgL3_1: '三部一组',
  合同编号: 'HT-1',
  team: { 项目经理: '何平', L4部门: '安全A组', L3部门: '安全事业部', L3_1部门: '三部一组', AR: 'AR张', SR: 'SR李', CSR: 'CSR王', CDR: 'CDR赵', Sponsor: 'Sponsor陈' },
  customer: { 最终客户: '客A', 签约单位: '甲单位', 合同总额: 1000000, 行业: '金融' },
  status: { 项目状态: '已验收', 项目级别: 'B', 项目类型: '实施项目', 评级: 'A' },
  progress: { 项目阶段: '项目收尾', 完工进展: 1 },
  cost: { 总预算: 1000, 核算: 1200, 剩余预算: -200, 消耗比: 1.2, 项目超支: true, 交付超支: true, 成本状态: '红色预警' },
  closeInfo: { 关闭时间: '2025-08-15', 是否正常关闭: '是', 关闭说明: '正常结项', 计划终验时间: '2025-07-01' },
}

function mountAt(id: string) {
  const router = createRouter({ history: createWebHistory(), routes: [
    { path: '/closed-project/:id', component: ClosedProjectDetailView },
    { path: '/projects/closed', component: { template: '<div/>' } },
  ] })
  router.push(`/closed-project/${id}`)
  return router.isReady().then(() => mount(ClosedProjectDetailView, { global: { plugins: [router] } }))
}

describe('ClosedProjectDetailView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('四块渲染 + L3-1部门键守护(下划线键→连字符标签)', async () => {
    const ds = useDataStore(); ds.data = { closedProjects: [CP] } as any
    const w = await mountAt('C-1')
    expect(w.text()).toContain('终端甲')
    expect(w.text()).toContain('关闭时间') && expect(w.text()).toContain('2025-08-15')
    expect(w.text()).toContain('正常结项')                 // closeInfo
    expect(w.text()).toContain('L3-1部门') && expect(w.text()).toContain('三部一组')  // 团队块:连字符标签 + 下划线键值
    expect(w.text()).toContain('AR张')
    expect(w.text()).toContain('甲单位')                   // 客户:签约单位
    expect(w.text()).toContain('HT-1')                     // 客户:合同编号
    expect(w.text()).toContain('项目超支') && expect(w.text()).toContain('是')        // 成本块
  })

  it('未找到→404 文案', async () => {
    const ds = useDataStore(); ds.data = { closedProjects: [CP] } as any
    const w = await mountAt('NOPE')
    expect(w.text()).toContain('不在交付三部已关闭清单')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npm run test:run -- ClosedProjectDetailView`
Expected: FAIL（占位视图无对应内容）

- [ ] **Step 3: 充实 ClosedProjectDetailView.vue**

替换 `frontend/src/views/ClosedProjectDetailView.vue` 占位为：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDataStore } from '@/stores/data'
import type { ClosedProject } from '@/types/analysis'
import { fmtRatio } from '@/lib/format'

const data = useDataStore()
const route = useRoute()
const p = computed<ClosedProject | undefined>(() =>
  ((data.data?.closedProjects ?? []) as ClosedProject[]).find((x) => x.projectId === String(route.params.id)))

const fmtWan = (v: number | null | undefined) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }))
const yn = (v: unknown) => (v === true ? '是' : v === false ? '否' : '-')

const closeRows = computed(() => [
  { k: '关闭时间', v: p.value?.closeInfo?.关闭时间 || '-' },
  { k: '是否正常关闭', v: p.value?.closeInfo?.是否正常关闭 || '-' },
  { k: '计划终验时间', v: p.value?.closeInfo?.计划终验时间 || '-' },
  { k: '关闭说明', v: p.value?.closeInfo?.关闭说明 || '-' },
])
const teamRows = computed(() => [
  { k: '项目经理', v: p.value?.team?.项目经理 || '-' },
  { k: 'L4部门', v: p.value?.team?.L4部门 || '-' },
  { k: 'L3部门', v: p.value?.team?.L3部门 || '-' },
  { k: 'L3-1部门', v: p.value?.team?.L3_1部门 || '-' },
  { k: 'AR', v: p.value?.team?.AR || '-' },
  { k: 'SR', v: p.value?.team?.SR || '-' },
  { k: 'CSR', v: p.value?.team?.CSR || '-' },
  { k: 'CDR', v: p.value?.team?.CDR || '-' },
  { k: 'Sponsor', v: p.value?.team?.Sponsor || '-' },
])
const custRows = computed(() => [
  { k: '最终客户', v: p.value?.customer?.最终客户 || '-' },
  { k: '签约单位', v: p.value?.customer?.签约单位 || '-' },
  { k: '合同编号', v: p.value?.合同编号 || '-' },
  { k: '行业', v: p.value?.customer?.行业 || '-' },
  { k: '合同总额(万)', v: fmtWan(p.value?.customer?.合同总额) },
])
const costRows = computed(() => [
  { k: '总预算(万)', v: fmtWan(p.value?.cost?.总预算) },
  { k: '核算(万)', v: fmtWan(p.value?.cost?.核算) },
  { k: '剩余预算(万)', v: fmtWan(p.value?.cost?.剩余预算) },
  { k: '消耗比', v: fmtRatio(p.value?.cost?.消耗比) },
  { k: '项目超支', v: yn(p.value?.cost?.项目超支) },
  { k: '交付超支', v: yn(p.value?.cost?.交付超支) },
  { k: '成本状态', v: p.value?.cost?.成本状态 || '-' },
])
</script>

<template>
  <div class="closed-detail-view">
    <div v-if="!p" class="cd-404">
      <div class="cd-404-title">未找到该已关闭项目</div>
      <div class="cd-404-sub">项目编号 {{ route.params.id }} 不在交付三部已关闭清单中。</div>
      <RouterLink to="/projects/closed" class="cd-404-link">← 返回已关闭项目</RouterLink>
    </div>
    <template v-else>
      <div class="cd-head">
        <h2 class="cd-name">{{ p.projectName || p.projectId }}</h2>
        <span class="cd-badge">{{ p.status?.项目状态 || '已关闭' }}</span>
        <span v-if="p.progress?.项目阶段" class="cd-badge stage">{{ p.progress.项目阶段 }}</span>
      </div>
      <div class="cd-meta"><span>编号 <b>{{ p.projectId }}</b></span><span>经理 <b>{{ p.projectManager || '-' }}</b></span><span>服务组 <b>{{ p.orgL4 || '-' }}</b></span></div>

      <section><div class="cd-section-title">关闭信息</div>
        <div class="cd-chips"><div v-for="it in closeRows" :key="it.k" class="cd-chip"><span class="cd-chip-k">{{ it.k }}</span><span class="cd-chip-v">{{ it.v }}</span></div></div></section>
      <section><div class="cd-section-title">团队</div>
        <div class="cd-chips"><div v-for="it in teamRows" :key="it.k" class="cd-chip"><span class="cd-chip-k">{{ it.k }}</span><span class="cd-chip-v">{{ it.v }}</span></div></div></section>
      <section><div class="cd-section-title">客户</div>
        <div class="cd-chips"><div v-for="it in custRows" :key="it.k" class="cd-chip"><span class="cd-chip-k">{{ it.k }}</span><span class="cd-chip-v u-num">{{ it.v }}</span></div></div></section>
      <section><div class="cd-section-title">成本</div>
        <div class="cd-chips"><div v-for="it in costRows" :key="it.k" class="cd-chip"><span class="cd-chip-k">{{ it.k }}</span><span class="cd-chip-v u-num">{{ it.v }}</span></div></div></section>
    </template>
  </div>
</template>

<style scoped>
.closed-detail-view { padding: var(--sp-4); }
.cd-404 { text-align: center; padding: var(--sp-7) 0; background: var(--card); border: 1px solid var(--line); border-radius: var(--r-md); }
.cd-404-title { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin-bottom: var(--sp-2); }
.cd-404-sub { font-size: var(--fs-2); color: var(--mut); margin-bottom: var(--sp-4); }
.cd-404-link { color: var(--accent); font-size: var(--fs-2); text-decoration: none; font-weight: 600; }
.cd-head { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); margin-bottom: var(--sp-2); }
.cd-name { font-size: var(--fs-4); font-weight: 700; color: var(--txt); margin: 0; }
.cd-badge { display: inline-block; padding: 1px var(--sp-2); border-radius: var(--r-full); font-size: var(--fs-1); font-weight: 600; background: var(--card2); color: var(--sub); }
.cd-badge.stage { background: var(--selected-tint); color: var(--accent); }
.cd-meta { display: flex; flex-wrap: wrap; gap: var(--sp-4); font-size: var(--fs-2); color: var(--sub); margin-bottom: var(--sp-3); }
.cd-meta b { color: var(--txt); }
.cd-section-title { font-weight: 700; color: var(--accent); font-size: var(--fs-2); margin: var(--sp-4) 0 var(--sp-2); }
.cd-chips { display: flex; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-3); }
.cd-chip { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--card2); border: 1px solid var(--line); border-radius: var(--r-sm); font-size: var(--fs-2); }
.cd-chip-k { color: var(--mut); }
.cd-chip-v { color: var(--txt); font-weight: 600; }
</style>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npm run test:run -- ClosedProjectDetailView`
Expected: PASS

- [ ] **Step 5: typecheck + 全量 vitest**

Run: `cd frontend && npm run typecheck && npm run test:run`
Expected: PASS（全绿）

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/ClosedProjectDetailView.vue frontend/src/views/ClosedProjectDetailView.test.ts
git commit -m "feat(fe-views): 精简已关闭详情页 /closed-project/:id(关闭/团队/客户/成本四块)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 版本号 V1.8.0 + verify.sh 全绿 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 升版本（Y 级）**

`frontend/src/version.ts`：

```typescript
export const APP_VERSION = 'V1.8.0'
export const RELEASE_DATE = '2026-06-18'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（语法编译 + ruff + pytest + 前端 typecheck/vitest/build）。任何红条先修到绿。

- [ ] **Step 3: 更新 PROGRESS.md**

`PROGRESS.md` 头部：当前版本改 `V1.8.0`；最近更新写结论（子项目2 在建/已关闭项目清单：已关闭全量摄取交付三部 closedProjects(轻量 PMIS 已关闭三表 + closeInfo)、meta.totalClosed=len、前端 /projects 在建 + /projects/closed 已关闭两路由 + /closed-project/:id 精简详情、导航在建项目/已关闭项目）；上一版本顺延记 V1.7.1。合适清单区加 `[x] 子项目2 在建/已关闭项目清单`（合并 SHA 在 finishing 后回填）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore: 版本 V1.8.0 + PROGRESS(子项目2 在建/已关闭项目清单)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## 完成后

跑完 Task 7 进入 superpowers:finishing-a-development-branch（option 1：merge --no-ff 到 master、合并结果跑 verify.sh、回填 PROGRESS 合并 SHA、删分支）。完成后更新数据血缘文档 `docs/数据血缘清单-页面到原始文件-2026-06-18.md`(新增已关闭两页) 与 `docs/字段级数据血缘-数据字典-2026-06-18.md`(closedProjects 字段)——但这两份未跟踪文档不提交。
```
