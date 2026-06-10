# P1 项目主域数据地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三个新输入文件（组织架构/A 映射/delivery_analysis）摄取 + build_projects 构建"PMIS 在建∩交付三部"项目主表 + Project/质量数据入 schema 与 analysis_data.json + 数据管理页上传入口。

**Architecture:** 新建 `projects.py`（镜像 `pmis.py` 的纯函数+优雅降级模式）做读表/筛选/聚合/健康度/质量；`pmis.py` 小幅扩展（team 段、风险明细、已关闭收录范围）；`preprocess_data.py` main() 加 9a/9c 两步；`server.py` 加 `/api/inputs/upload`（镜像 PMIS 上传白名单模式）；前端加 `useInputFiles` composable + DataView 卡。治理页 UI 不动（质量数据只入 JSON）。

**Tech Stack:** Python 标准库 + openpyxl + pydantic v2（schema 契约）；Vue3 + TS + Vitest；TDD（pytest 先红后绿）。

**上下文（执行者必读）:**
- spec：`docs/superpowers/specs/2026-06-10-project-domain-dashboard-design.md`（口径与降级规则）。
- 工作分支 `feat/phase-p-project-domain`（已存在，spec 已提交）。
- 实际文件结构（已核实）：
  - `input/组织架构.xlsx`：Sheet1 表头第 1 行 `工号/姓名/员工类别/新L2组织/新L3组织/新L3-1组织/新L4组织/直接上级工号/直接上级姓名/是否项目经理/成本`（86 行）；Sheet2/Sheet3 是透视杂表（必须跳过 → 按"表头含`工号`"选 sheet）。
  - `input/A.xlsx`：单 sheet **无表头** 462 行，A 列=当前项目号（WSGF-SF-…）、B 列=桥接负责人、C 列=已关闭项目号（WSGF-SS-…）。注意 `~$A.xlsx` 是 Excel 锁文件，读取逻辑不能扫目录，只按固定名读。
  - `input/delivery_analysis.xlsx`：数据在 sheet `delivery_analysis (1)`（911 行），表头第 1 行 `项目编号/项目名称/合同编号/项目经理/销售/L4组织/项目级别/桥接项目号/合同号/桥接类型/桥接负责人/数据来源` + 7 成本类目 × `_预算金额/_实际发生/_剩余预算/_消耗率`；Sheet1 是透视杂表（按"表头含`项目编号`"选 sheet）。
  - PMIS `项目中心.xlsx` 有 `项目经理` 列；`项目基础信息数据.xlsx` 有 `项目经理（FR）`、`项目经理L4部门`（表头第 2 行，`config.PMIS_HEADER_ROW`）。
- openpyxl 注意：读 WPS 导出文件**不要 `read_only=True`**（dimension 元数据不可靠会截断行，见 `pmis.py:62` 注释）；openpyxl 返回的日期是 `datetime` 对象，**入 JSON 前必须转 str**。
- 路径基线：`preprocess_data.py` 与 `server.py` 均已有 `BASE_DIR`（frozen/dev 双模式都正确），新代码一律 `os.path.join(BASE_DIR, "input", ...)`，**不要**自创路径逻辑。
- 测试运行：`python -m pytest tests/test_projects.py -q`（Windows bash 下运行正常）。

**File Structure（本计划新增/修改的全部文件）:**

| 文件 | 动作 | 职责 |
|---|---|---|
| `config.py` | 修改 | 新文件名/部门/售前前缀/成本类目常量 |
| `projects.py` | 新建 | 项目主域：读表（自动选 sheet）/筛三部/售前映射/回款与成本聚合/健康度/质量 |
| `pmis.py` | 修改 | `_assemble` 加 team 段与 riskRecords；`build_project_pmis`/`load_project_pmis` 加 `extra_closed_ids` |
| `preprocess_data.py` | 修改 | main() 加 9a（读映射）/9c（构建项目主域）；final_data 加 projects/projectsQuality |
| `schema.py` | 修改 | PmisTeam/Project/ProjectPayment/DeliveryCostItem/ProjectHealth/InputFileStat/ProjectsQuality 模型 |
| `server.py` | 修改 | `is_valid_input_name` + `/api/inputs/upload`（与 PMIS 上传共用保存逻辑） |
| `tests/test_projects.py` | 新建 | projects.py 全部纯函数测试 |
| `tests/test_pmis.py` | 修改 | team/riskRecords/extra_closed_ids 测试追加 |
| `tests/test_server_inputs_upload.py` | 新建 | 上传白名单测试（镜像 test_server_pmis_upload.py） |
| `frontend/src/composables/useInputFiles.ts(+.test.ts)` | 新建 | 三文件上传 composable |
| `frontend/src/views/DataView.vue(+.test.ts)` | 修改 | 获取段加「项目域数据」卡 |
| `frontend/src/types/analysis.ts` | 再生成 | `npm run gen:types` |
| `frontend/src/version.ts`、`PROGRESS.md` | 修改 | V7.0.0 |

---

### Task 1: config 常量 + projects.py 读表函数

**Files:**
- Modify: `config.py`（文件末尾追加）
- Create: `projects.py`
- Test: `tests/test_projects.py`

- [ ] **Step 1: 写失败测试**

新建 `tests/test_projects.py`：

```python
# -*- coding: utf-8 -*-
"""projects.py 纯函数单元测试。不依赖 input/ 真文件——用 tmp_path 生成的小 xlsx 或内存 dict。"""
import openpyxl
import pytest

import config
import projects as P


def _make_xlsx(dir_path, name, sheets):
    """造多 sheet xlsx。sheets = [(sheet名, rows[list[tuple]])]，首个 sheet 复用默认 active。"""
    wb = openpyxl.Workbook()
    for i, (title, rows) in enumerate(sheets):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = title
        for r in rows:
            ws.append(list(r))
    path = str(dir_path / name)
    wb.save(path)
    return path


class TestReadOrgNames:
    def test_picks_sheet_with_gonghao_header(self, tmp_path):
        path = _make_xlsx(tmp_path, "组织架构.xlsx", [
            ("Sheet2", [("行标签", "求和项:成本"), ("银行服务组", 100)]),  # 透视杂表在前
            ("Sheet1", [
                ("工号", "姓名", "员工类别", "新L2组织", "新L3组织", "新L3-1组织", "新L4组织",
                 "直接上级工号", "直接上级姓名", "是否项目经理", "成本"),
                ("A012804", "佘海龙", "正式员工", "交付中心", "交付实施三部", "服务二部",
                 "黑龙江服务组", "A001373", "于岩", None, 1500),
                ("A002338", "杨亮", "正式员工", "交付中心", "交付实施三部", "服务二部",
                 "黑龙江服务组", "A012804", "佘海龙", None, 1000),
            ]),
        ])
        names, l4s, rows = P.read_org_names(path)
        assert names == {"佘海龙", "杨亮"}
        assert l4s == {"黑龙江服务组"}
        assert rows == 2

    def test_missing_file_degrades(self, tmp_path):
        names, l4s, rows = P.read_org_names(str(tmp_path / "不存在.xlsx"))
        assert names == set() and l4s == set() and rows == 0


class TestReadMapping:
    def test_headerless_three_cols(self, tmp_path):
        path = _make_xlsx(tmp_path, "A.xlsx", [
            ("Sheet1", [
                ("WSGF-SF-202301100425", "于江", "WSGF-SS-202212229197"),
                ("WSGF-SF-202304190139", "于江", "WSGF-SS-202303289058"),
                (None, None, None),  # 空行跳过
                ("WSGF-SF-X", "某人", None),  # 缺已关闭号跳过
            ]),
        ])
        m = P.read_mapping(path)
        assert m == [
            {"current": "WSGF-SF-202301100425", "owner": "于江", "closed": "WSGF-SS-202212229197"},
            {"current": "WSGF-SF-202304190139", "owner": "于江", "closed": "WSGF-SS-202303289058"},
        ]

    def test_missing_file_degrades(self, tmp_path):
        assert P.read_mapping(str(tmp_path / "无.xlsx")) == []


class TestReadDelivery:
    def test_picks_sheet_with_pid_header_and_skips_pivot(self, tmp_path):
        path = _make_xlsx(tmp_path, "delivery_analysis.xlsx", [
            ("Sheet1", [(None, None), ("行标签", "求和项:x")]),  # 透视杂表
            ("delivery_analysis (1)", [
                ("项目编号", "项目名称", "项目经理", "L4组织", "差旅费_预算金额", "差旅费_消耗率"),
                ("WSGF-SS-1", "某项目", "佘海龙", "黑龙江服务组", 1000, "50%"),
            ]),
        ])
        rows = P.read_delivery(path)
        assert len(rows) == 1
        assert rows[0]["项目编号"] == "WSGF-SS-1"
        assert rows[0]["差旅费_预算金额"] == 1000
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_projects.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'projects'`）

- [ ] **Step 3: 实现**

`config.py` 末尾追加：

```python
# ── 项目主域输入文件(Phase P,位于 input/ 根) ──
ORG_FILE = "组织架构.xlsx"
MAPPING_FILE = "A.xlsx"
DELIVERY_FILE = "delivery_analysis.xlsx"
INPUT_UPLOAD_NAMES = [ORG_FILE, MAPPING_FILE, DELIVERY_FILE]
DEPT_L3 = "交付实施三部"
PRESALE_PREFIX = "售前服务"
DELIVERY_COST_CATEGORIES = [
    "交付外包服务成本", "交付部门人工成本", "项目直接成本", "差旅费",
    "业务招待费", "本地交通及通讯费", "其他费用",
]
```

新建 `projects.py`：

```python
# projects.py
"""项目主域(Phase P)构建:三输入文件摄取 → 筛三部 → 售前映射 → 回款/成本聚合 → 健康度 + 质量。
镜像 pmis.py 模式:纯函数为主,文件读取集中,任一输入缺失优雅降级(不抛错、不阻断回款主流程)。"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import config


def _open_workbook(path: str):
    """打开 xlsx;文件缺失/损坏返回 None。不用 read_only(WPS 导出 dimension 不可靠会截断行)。"""
    if not os.path.exists(path):
        return None
    import openpyxl
    try:
        return openpyxl.load_workbook(path, data_only=True)
    except Exception:
        return None


def _read_header_sheet(path: str, key_header: str) -> List[Dict[str, Any]]:
    """在所有 sheet 中找首行含 key_header 的表(跳过透视杂表),转 list[dict]。找不到返回 []。"""
    wb = _open_workbook(path)
    if wb is None:
        return []
    try:
        for ws in wb.worksheets:
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                continue
            headers = [str(h).strip() if h is not None else "" for h in rows[0]]
            if key_header not in headers:
                continue
            out = []
            for raw in rows[1:]:
                d = {}
                for i, h in enumerate(headers):
                    if h:
                        d[h] = raw[i] if i < len(raw) else None
                if any(v is not None for v in d.values()):
                    out.append(d)
            return out
        return []
    finally:
        wb.close()


def read_org_names(path: str) -> Tuple[set, set, int]:
    """组织架构表 → (姓名集合, L4组织集合, 行数)。按"表头含工号"自动选 sheet。"""
    rows = _read_header_sheet(path, "工号")
    names = {str(r.get("姓名")).strip() for r in rows if r.get("姓名")}
    l4s = {str(r.get("新L4组织")).strip() for r in rows if r.get("新L4组织")}
    return names, l4s, len(rows)


def read_mapping(path: str) -> List[Dict[str, str]]:
    """A.xlsx(无表头):A列=当前项目号 B列=桥接负责人 C列=已关闭项目号。AC 全有才收。"""
    wb = _open_workbook(path)
    if wb is None:
        return []
    try:
        ws = wb.worksheets[0]
        out = []
        for raw in ws.iter_rows(values_only=True):
            cur = str(raw[0]).strip() if raw and raw[0] is not None else ""
            owner = str(raw[1]).strip() if raw and len(raw) > 1 and raw[1] is not None else ""
            closed = str(raw[2]).strip() if raw and len(raw) > 2 and raw[2] is not None else ""
            if cur and closed:
                out.append({"current": cur, "owner": owner, "closed": closed})
        return out
    finally:
        wb.close()


def read_delivery(path: str) -> List[Dict[str, Any]]:
    """delivery_analysis 表。按"表头含项目编号"自动选 sheet(跳过透视杂表)。"""
    return _read_header_sheet(path, "项目编号")
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_projects.py -q`
Expected: PASS（7 passed）

- [ ] **Step 5: Commit**

```bash
git add config.py projects.py tests/test_projects.py
git commit -m "feat(p1): projects.py 三输入文件读表(自动选sheet/无表头映射/优雅降级) + config 常量"
```

---

### Task 2: pmis.py 扩展（team 段 / 风险明细 / 已关闭收录范围）

**Files:**
- Modify: `pmis.py:143-179`（`_assemble`）、`pmis.py:291-309`（`build_project_pmis`）、`pmis.py:312-344`（`load_project_pmis`）
- Modify: `schema.py:94-101`（ProjectPmis）
- Test: `tests/test_pmis.py`（文件末尾追加）

- [ ] **Step 1: 写失败测试**

`tests/test_pmis.py` 末尾追加：

```python
class TestAssembleTeamAndRisks:
    def test_team_from_center_then_base(self):
        base_i = {"P1": {"项目经理（FR）": "李四", "项目经理L4部门": "银行服务组", "项目名称": "B名"}}
        center_i = {"P1": {"项目经理": "张三", "项目名称": "C名"}}
        out = M._assemble("P1", base_i, center_i, {}, {}, "在建")
        assert out["team"] == {"项目名称": "C名", "项目经理": "张三", "L4部门": "银行服务组"}

    def test_team_fallback_to_base(self):
        base_i = {"P1": {"项目经理（FR）": "李四", "项目经理L4部门": "银行服务组", "项目名称": "B名"}}
        out = M._assemble("P1", base_i, {}, {}, {}, "在建")
        assert out["team"]["项目经理"] == "李四"
        assert out["team"]["项目名称"] == "B名"

    def test_risk_records_jsonable(self):
        import datetime
        risk_i = {"P1": [{"风险等级": "高", "风险状态": "已关闭",
                          "登记日期": datetime.datetime(2026, 1, 2, 3, 4)}]}
        out = M._assemble("P1", {}, {}, {}, risk_i, "在建")
        recs = out["riskRecords"]
        assert len(recs) == 1
        assert recs[0]["登记日期"] == "2026-01-02T03:04:00"  # datetime 必须转 str 才能入 JSON


class TestBuildProjectPmisExtraClosed:
    def test_closed_included_via_extra_ids(self):
        closed = {"base": [{"项目编号": "SS-1", "项目状态": "已完工"}], "center": [], "status": []}
        out = M.build_project_pmis({"base": [], "center": [], "status": [], "risk": []},
                                   closed, set(), extra_closed_ids={"SS-1"})
        assert "SS-1" in out and out["SS-1"]["source"] == "已关闭"

    def test_closed_excluded_without_any_ids(self):
        closed = {"base": [{"项目编号": "SS-1"}], "center": [], "status": []}
        out = M.build_project_pmis({"base": [], "center": [], "status": [], "risk": []},
                                   closed, set())
        assert "SS-1" not in out
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_pmis.py -q`
Expected: FAIL（KeyError 'team' / TypeError extra_closed_ids）；既有用例必须保持 PASS

- [ ] **Step 3: 实现**

`pmis.py` `_assemble` 的 return dict 中追加两个键（放在 `"customer"` 之后）：

```python
        "team": {
            "项目名称": (c.get("项目名称") or b.get("项目名称") or None),
            "项目经理": (c.get("项目经理") or b.get("项目经理（FR）") or None),
            "L4部门": (b.get("项目经理L4部门") or None),
        },
        "riskRecords": [_jsonable_row(r) for r in risk_i.get(pid, [])],
```

`pmis.py` 模块级新增（放在 `_risk_by_pid` 之后）：

```python
def _jsonable_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """openpyxl 单元格可能是 datetime,入 JSON 前转 isoformat 字符串。"""
    return {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.items()}
```

`build_project_pmis` 签名与已关闭收录改为：

```python
def build_project_pmis(active: Dict[str, List[Dict[str, Any]]],
                       closed: Dict[str, List[Dict[str, Any]]],
                       payment_project_ids: set,
                       extra_closed_ids: Optional[set] = None) -> Dict[str, Dict[str, Any]]:
    """在建全量入库;已关闭收 ∩(回款 ∪ extra_closed_ids[售前映射目标])。优先在建。"""
```

已关闭循环的判断条件改为：

```python
    include_closed = payment_project_ids | (extra_closed_ids or set())
    for pid in (c_base.keys() | c_center.keys() | c_status.keys()):
        if pid in include_closed and pid not in out:
            out[pid] = _assemble(pid, c_base, c_center, c_status, c_risk, "已关闭")
```

`load_project_pmis` 签名加 `extra_closed_ids=None`，调用处改 `build_project_pmis(active, closed, pay_ids, extra_closed_ids)`。

`schema.py` 在 `PmisCustomer` 之后加模型，并扩展 `ProjectPmis`：

```python
class PmisTeam(_Base):
    项目名称: Optional[str] = None
    项目经理: Optional[str] = None
    L4部门: Optional[str] = None
```

`ProjectPmis` 增加两个字段：

```python
    team: PmisTeam = PmisTeam()
    riskRecords: List[Dict[str, Any]] = []
```

- [ ] **Step 4: 跑测试确认通过（含既有全量）**

Run: `python -m pytest tests/test_pmis.py tests/test_schema.py tests/test_pipeline_integration.py -q`
Expected: PASS（若既有用例对 `_assemble` 结果做了**全字典相等**断言而失败，修该断言补上 team/riskRecords 两键——属预期的契约扩展）

- [ ] **Step 5: Commit**

```bash
git add pmis.py schema.py tests/test_pmis.py
git commit -m "feat(p1): pmis 摄取扩展 team段/风险明细jsonable/已关闭收录含售前映射目标"
```

---

### Task 3: projects.py 聚合与健康度

**Files:**
- Modify: `projects.py`（追加函数）
- Test: `tests/test_projects.py`（追加）

- [ ] **Step 1: 写失败测试**

`tests/test_projects.py` 末尾追加：

```python
class TestDeliveryCostsFor:
    def test_seven_categories_parsed(self):
        row = {"差旅费_预算金额": "1,000", "差旅费_实际发生": 600,
               "差旅费_剩余预算": 400, "差旅费_消耗率": "60%"}
        out = P.delivery_costs_for(row)
        assert len(out) == len(config.DELIVERY_COST_CATEGORIES)
        trip = next(i for i in out if i["类别"] == "差旅费")
        assert trip == {"类别": "差旅费", "预算金额": 1000.0, "实际发生": 600.0,
                        "剩余预算": 400.0, "消耗率": pytest.approx(0.6)}
        other = next(i for i in out if i["类别"] == "其他费用")
        assert other["预算金额"] is None  # 缺列降 None


class TestAggregatePayment:
    def test_sums_and_delayed(self):
        nodes = [
            {"isPaymentRelated": True, "expectedPayment": 100.0, "actualPayment": 40.0,
             "nodeStatus": config.STATUS_DELAYED},
            {"isPaymentRelated": True, "expectedPayment": 50.0, "actualPayment": 50.0,
             "nodeStatus": config.STATUS_FULL_PAID},
            {"isPaymentRelated": False, "expectedPayment": 999.0, "actualPayment": 0.0,
             "nodeStatus": ""},  # 非回款节点不计
        ]
        agg = P.aggregate_payment(nodes)
        assert agg == {"relatedNodeCount": 2, "expectedTotal": 150.0, "actualTotal": 90.0,
                       "remainingTotal": 60.0, "paymentRatio": 0.6, "delayedCount": 1}

    def test_zero_expected_ratio_none(self):
        assert P.aggregate_payment([])["paymentRatio"] is None


class TestComputeHealth:
    def _pm(self, **over):
        pm = {"progress": {"里程碑进度状态": "正常"},
              "risk": {"最高等级": "低", "未关闭风险数": 0},
              "cost": {"超支": False, "消耗比": 0.5}}
        pm.update(over)
        return pm

    def test_all_ok(self):
        h = P.compute_health(self._pm(), delayed_count=0)
        assert h["overall"] == "健康"
        assert not any([h["progressAbnormal"], h["riskAbnormal"],
                        h["costAbnormal"], h["paymentAbnormal"]])

    def test_one_abnormal_is_warn(self):
        h = P.compute_health(self._pm(progress={"里程碑进度状态": "里程碑滞后"}), 0)
        assert h["progressAbnormal"] is True and h["overall"] == "关注"

    def test_two_abnormal_is_risk(self):
        h = P.compute_health(self._pm(risk={"最高等级": "高", "未关闭风险数": 2}), 1)
        assert h["riskAbnormal"] and h["paymentAbnormal"] and h["overall"] == "风险"

    def test_cost_abnormal_by_ratio_or_overrun(self):
        assert P.compute_health(self._pm(cost={"超支": True, "消耗比": 0.2}), 0)["costAbnormal"]
        assert P.compute_health(self._pm(cost={"超支": None, "消耗比": 1.2}), 0)["costAbnormal"]
        assert not P.compute_health(self._pm(cost={"超支": None, "消耗比": None}), 0)["costAbnormal"]
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_projects.py -q`
Expected: FAIL（AttributeError delivery_costs_for）

- [ ] **Step 3: 实现**

`projects.py` 顶部 import 增加 `from pmis import parse_pmis_money, parse_pmis_pct`，末尾追加：

```python
def delivery_costs_for(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """delivery_analysis 一行 → 7 类目成本四元组(缺列降 None)。"""
    out = []
    for cat in config.DELIVERY_COST_CATEGORIES:
        out.append({
            "类别": cat,
            "预算金额": parse_pmis_money(row.get(f"{cat}_预算金额")),
            "实际发生": parse_pmis_money(row.get(f"{cat}_实际发生")),
            "剩余预算": parse_pmis_money(row.get(f"{cat}_剩余预算")),
            "消耗率": parse_pmis_pct(row.get(f"{cat}_消耗率")),
        })
    return out


def aggregate_payment(nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """项目的回款子域聚合(仅 isPaymentRelated 节点;明细仍在 rawNodes,不复制)。"""
    rel = [n for n in nodes if n.get("isPaymentRelated")]
    exp = sum(float(n.get("expectedPayment") or 0) for n in rel)
    act = sum(float(n.get("actualPayment") or 0) for n in rel)
    delayed = sum(1 for n in rel if n.get("nodeStatus") == config.STATUS_DELAYED)
    return {
        "relatedNodeCount": len(rel),
        "expectedTotal": round(exp, 2),
        "actualTotal": round(act, 2),
        "remainingTotal": round(max(exp - act, 0), 2),
        "paymentRatio": round(act / exp, 4) if exp > 0 else None,
        "delayedCount": delayed,
    }


def compute_health(pm: Dict[str, Any], delayed_count: int) -> Dict[str, Any]:
    """四维三态健康度(spec 4.6;阈值集中在此,后续可调)。"""
    progress_ab = "滞后" in str(pm.get("progress", {}).get("里程碑进度状态") or "")
    risk = pm.get("risk", {})
    risk_ab = (risk.get("最高等级") == "高") and ((risk.get("未关闭风险数") or 0) > 0)
    cost = pm.get("cost", {})
    ratio = cost.get("消耗比")
    cost_ab = bool(cost.get("超支")) or (ratio is not None and ratio > 1)
    pay_ab = delayed_count > 0
    n = sum([progress_ab, risk_ab, cost_ab, pay_ab])
    overall = "健康" if n == 0 else ("关注" if n == 1 else "风险")
    return {"progressAbnormal": progress_ab, "riskAbnormal": risk_ab,
            "costAbnormal": cost_ab, "paymentAbnormal": pay_ab, "overall": overall}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_projects.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add projects.py tests/test_projects.py
git commit -m "feat(p1): 成本四元组解析/回款聚合/四维健康度纯函数"
```

---

### Task 4: build_projects + 质量数据 + load_dept_projects

**Files:**
- Modify: `projects.py`（追加函数）
- Test: `tests/test_projects.py`（追加）

- [ ] **Step 1: 写失败测试**

`tests/test_projects.py` 末尾追加：

```python
def _pm_active(name, manager, l4="黑龙江服务组", **over):
    pm = {"matched": True, "source": "在建",
          "team": {"项目名称": name, "项目经理": manager, "L4部门": l4},
          "progress": {"里程碑进度状态": "正常"},
          "risk": {"最高等级": None, "未关闭风险数": 0},
          "cost": {"超支": None, "消耗比": None}}
    pm.update(over)
    return pm


class TestBuildProjects:
    def test_filters_active_and_dept(self):
        ppm = {
            "SF-1": _pm_active("售前服务A", "佘海龙"),
            "SS-9": _pm_active("外部项目", "外部人"),       # 经理不在清单 → 排除
            "SS-8": {**_pm_active("已关闭项目", "佘海龙"), "source": "已关闭"},  # 非在建 → 排除
        }
        out = P.build_projects(ppm, {"佘海龙"}, {"黑龙江服务组"}, [], [], [])
        assert [p["projectId"] for p in out] == ["SF-1"]

    def test_org_missing_degrades_to_all_active(self):
        ppm = {"SS-1": _pm_active("某项目", "任意人")}
        out = P.build_projects(ppm, set(), set(), [], [], [])
        assert len(out) == 1  # 空人员清单=不过滤(spec 3.4 降级)

    def test_presale_mapping_and_payment(self):
        ppm = {"SF-1": _pm_active("售前服务A", "佘海龙")}
        mapping = [{"current": "SF-1", "owner": "于江", "closed": "SS-99"}]
        nodes = [{"projectId": "SF-1", "isPaymentRelated": True, "expectedPayment": 10.0,
                  "actualPayment": 0.0, "nodeStatus": config.STATUS_DELAYED}]
        delivery = [{"项目编号": "SF-1", "项目名称": "售前服务A", "差旅费_预算金额": 100}]
        out = P.build_projects(ppm, {"佘海龙"}, {"黑龙江服务组"}, mapping, delivery, nodes)
        p = out[0]
        assert p["isPresale"] is True
        assert p["relatedClosedId"] == "SS-99"
        assert p["payment"]["delayedCount"] == 1
        assert p["health"]["paymentAbnormal"] is True
        assert next(i for i in p["deliveryCosts"] if i["类别"] == "差旅费")["预算金额"] == 100.0

    def test_name_falls_back_to_nodes(self):
        ppm = {"SS-1": _pm_active(None, "佘海龙")}
        nodes = [{"projectId": "SS-1", "projectName": "节点名",
                  "isPaymentRelated": True, "expectedPayment": 1, "actualPayment": 0,
                  "nodeStatus": ""}]
        out = P.build_projects(ppm, {"佘海龙"}, set(), [], [], nodes)
        assert out[0]["projectName"] == "节点名"


class TestProjectsQuality:
    def test_quality_counts_and_alerts(self):
        ppm = {
            "SF-1": _pm_active("售前服务A", "佘海龙"),
            "SS-2": _pm_active("漏网项目", "王漏网", l4="黑龙江服务组"),  # L4 命中但经理不在清单 → 告警
        }
        projects = P.build_projects(ppm, {"佘海龙", "杨亮"}, {"黑龙江服务组"},
                                    [{"current": "SF-1", "owner": "x", "closed": "SS-99"}],
                                    [{"项目编号": "SF-1"}], [])
        q = P.compute_projects_quality(projects, ppm, {"佘海龙", "杨亮"}, {"黑龙江服务组"}, 2,
                                       [{"current": "SF-1", "owner": "x", "closed": "SS-99"}],
                                       [{"项目编号": "SF-1"}, {"项目编号": "SS-外部"}])
        assert q["deptProjectCount"] == 1
        assert q["staffNoProject"] == [{"name": "杨亮"}]
        assert q["managerNotInOrg"] == [{"projectId": "SS-2", "projectName": "漏网项目",
                                         "manager": "王漏网"}]
        assert q["presaleTotal"] == 1 and q["presaleMapped"] == 1 and q["presaleUnmapped"] == []
        assert q["mappingFile"] == {"provided": True, "rows": 1, "matched": 1, "matchRate": 1.0}
        assert q["deliveryFile"]["matched"] == 1 and q["deliveryFile"]["rows"] == 2
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_projects.py -q`
Expected: FAIL（AttributeError build_projects）

- [ ] **Step 3: 实现**

`projects.py` 末尾追加：

```python
def build_projects(project_pmis: Dict[str, Dict[str, Any]], org_names: set, org_l4s: set,
                   mapping: List[Dict[str, str]], delivery_rows: List[Dict[str, Any]],
                   all_nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """项目主表:PMIS 在建 → 筛三部(空人员清单=不过滤,降级) → 挂映射/回款/成本/健康度。"""
    nodes_by_pid: Dict[str, List[Dict[str, Any]]] = {}
    for n in all_nodes:
        pid = str(n.get("projectId") or "").strip()
        if pid:
            nodes_by_pid.setdefault(pid, []).append(n)
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
        nodes = nodes_by_pid.get(pid, [])
        drow = delivery_by_pid.get(pid)
        name = str(team.get("项目名称") or "").strip()
        if not name and drow:
            name = str(drow.get("项目名称") or "").strip()
        if not name and nodes:
            name = str(nodes[0].get("projectName") or "").strip()
        m = map_by_current.get(pid)
        payment = aggregate_payment(nodes)
        out.append({
            "projectId": pid,
            "projectName": name,
            "projectManager": manager,
            "orgL4": str(team.get("L4部门") or "").strip(),
            "isPresale": name.startswith(config.PRESALE_PREFIX),
            "relatedClosedId": (m["closed"] if m else ""),
            "payment": payment,
            "deliveryCosts": delivery_costs_for(drow) if drow else [],
            "health": compute_health(pm, payment["delayedCount"]),
        })
    out.sort(key=lambda p: p["projectId"])
    return out


def compute_projects_quality(projects: List[Dict[str, Any]],
                             project_pmis: Dict[str, Dict[str, Any]],
                             org_names: set, org_l4s: set, org_rows: int,
                             mapping: List[Dict[str, str]],
                             delivery_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """项目主域质量(spec 3.6):三文件记分卡 + 人员↔项目双向告警 + 售前映射覆盖。"""
    proj_ids = {p["projectId"] for p in projects}
    managers = {p["projectManager"] for p in projects if p["projectManager"]}
    staff_no_project = sorted(org_names - managers)
    manager_not_in_org = []
    if org_names:
        for pid, pm in project_pmis.items():
            if pm.get("source") != "在建" or pid in proj_ids:
                continue
            team = pm.get("team", {})
            mgr = str(team.get("项目经理") or "").strip()
            l4 = str(team.get("L4部门") or "").strip()
            if l4 in org_l4s and mgr:
                manager_not_in_org.append({
                    "projectId": pid,
                    "projectName": str(team.get("项目名称") or ""),
                    "manager": mgr,
                })
    presale = [p for p in projects if p["isPresale"]]
    presale_unmapped = [p for p in presale if not p["relatedClosedId"]]
    mapping_matched = sum(1 for m in mapping if m["current"] in proj_ids)
    delivery_matched = sum(1 for r in delivery_rows
                           if str(r.get("项目编号") or "").strip() in proj_ids)

    def stat(provided: bool, rows: int, matched: int) -> Dict[str, Any]:
        return {"provided": provided, "rows": rows, "matched": matched,
                "matchRate": round(matched / rows, 4) if rows else 0.0}

    return {
        "deptProjectCount": len(projects),
        "orgFile": stat(bool(org_names), org_rows, len(org_names & managers)),
        "mappingFile": stat(bool(mapping), len(mapping), mapping_matched),
        "deliveryFile": stat(bool(delivery_rows), len(delivery_rows), delivery_matched),
        "staffNoProject": [{"name": n} for n in staff_no_project],
        "managerNotInOrg": sorted(manager_not_in_org, key=lambda x: x["projectId"]),
        "presaleTotal": len(presale),
        "presaleMapped": len(presale) - len(presale_unmapped),
        "presaleUnmapped": [{"projectId": p["projectId"], "projectName": p["projectName"]}
                            for p in presale_unmapped],
    }


def load_dept_projects(input_dir: str, project_pmis: Dict[str, Dict[str, Any]],
                       all_nodes: List[Dict[str, Any]],
                       mapping: List[Dict[str, str]]
                       ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """读组织架构+delivery → build_projects + 质量。mapping 由调用方先读(9a 也要用)。"""
    names, l4s, org_rows = read_org_names(os.path.join(input_dir, config.ORG_FILE))
    delivery = read_delivery(os.path.join(input_dir, config.DELIVERY_FILE))
    projects = build_projects(project_pmis, names, l4s, mapping, delivery, all_nodes)
    quality = compute_projects_quality(projects, project_pmis, names, l4s, org_rows,
                                       mapping, delivery)
    return projects, quality
```

注意 `compute_projects_quality` 的 `managerNotInOrg` 排除了已入主域的项目（`pid in proj_ids` 跳过），测试 `test_quality_counts_and_alerts` 中 SS-2 因经理不在清单未入主域、且 L4 命中 → 告警。

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_projects.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add projects.py tests/test_projects.py
git commit -m "feat(p1): build_projects 主表构建 + 双向告警/售前覆盖质量数据"
```

---

### Task 5: schema 模型 + main() 集成 + 真实数据冒烟 + 类型再生成

**Files:**
- Modify: `schema.py`（DataQuality 之后、AnalysisData 之前插入；AnalysisData 加字段）
- Modify: `preprocess_data.py`（顶部 import；main() 9a/9b/9c；final_data）
- Test: `tests/test_schema.py`（追加）
- Regenerate: `frontend/src/types/analysis.ts`

- [ ] **Step 1: 写失败测试**

`tests/test_schema.py` 末尾追加：

```python
class TestProjectsContract:
    def test_minimal_project_validates(self):
        import schema as S
        proj = {
            "projectId": "SF-1", "projectName": "售前服务A", "projectManager": "佘海龙",
            "orgL4": "黑龙江服务组", "isPresale": True, "relatedClosedId": "SS-99",
            "payment": {"relatedNodeCount": 1, "expectedTotal": 10.0, "actualTotal": 0.0,
                        "remainingTotal": 10.0, "paymentRatio": 0.0, "delayedCount": 1},
            "deliveryCosts": [{"类别": "差旅费", "预算金额": 100.0, "实际发生": None,
                               "剩余预算": None, "消耗率": None}],
            "health": {"progressAbnormal": False, "riskAbnormal": False, "costAbnormal": False,
                       "paymentAbnormal": True, "overall": "关注"},
        }
        S.Project.model_validate(proj)

    def test_projects_quality_validates(self):
        import schema as S
        S.ProjectsQuality.model_validate({
            "deptProjectCount": 1,
            "orgFile": {"provided": True, "rows": 2, "matched": 1, "matchRate": 0.5},
            "mappingFile": {"provided": False, "rows": 0, "matched": 0, "matchRate": 0.0},
            "deliveryFile": {"provided": False, "rows": 0, "matched": 0, "matchRate": 0.0},
            "staffNoProject": [{"name": "杨亮"}],
            "managerNotInOrg": [], "presaleTotal": 1, "presaleMapped": 1, "presaleUnmapped": [],
        })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_schema.py -q`
Expected: FAIL（AttributeError: module 'schema' has no attribute 'Project'）

- [ ] **Step 3: 实现 schema 模型**

`schema.py` 在 `DataQuality` 类之后插入：

```python
class ProjectPayment(_Base):
    relatedNodeCount: int = 0
    expectedTotal: float = 0
    actualTotal: float = 0
    remainingTotal: float = 0
    paymentRatio: Optional[float] = None
    delayedCount: int = 0


class DeliveryCostItem(_Base):
    类别: str
    预算金额: Optional[float] = None
    实际发生: Optional[float] = None
    剩余预算: Optional[float] = None
    消耗率: Optional[float] = None


class ProjectHealth(_Base):
    progressAbnormal: bool = False
    riskAbnormal: bool = False
    costAbnormal: bool = False
    paymentAbnormal: bool = False
    overall: str = "健康"


class Project(_Base):
    projectId: str
    projectName: str = ""
    projectManager: str = ""
    orgL4: str = ""
    isPresale: bool = False
    relatedClosedId: str = ""
    payment: ProjectPayment = ProjectPayment()
    deliveryCosts: List[DeliveryCostItem] = []
    health: ProjectHealth = ProjectHealth()


class InputFileStat(_Base):
    provided: bool = False
    rows: int = 0
    matched: int = 0
    matchRate: float = 0.0


class ProjectsQuality(_Base):
    deptProjectCount: int = 0
    orgFile: InputFileStat = InputFileStat()
    mappingFile: InputFileStat = InputFileStat()
    deliveryFile: InputFileStat = InputFileStat()
    staffNoProject: List[Dict[str, Any]] = []
    managerNotInOrg: List[Dict[str, Any]] = []
    presaleTotal: int = 0
    presaleMapped: int = 0
    presaleUnmapped: List[Dict[str, Any]] = []
```

`AnalysisData` 增加两个字段（`dataQuality` 之后）：

```python
    projects: List[Project] = []
    projectsQuality: Optional[ProjectsQuality] = None
```

- [ ] **Step 4: 跑 schema 测试通过**

Run: `python -m pytest tests/test_schema.py -q`
Expected: PASS

- [ ] **Step 5: main() 集成**

`preprocess_data.py` 顶部（`import pmis` 之后）加 `import projects as projects_mod`。

main() 中"=== 9b. 摄取 PMIS"段改为（9a 在 9b 之前插入，9b 仅改一行调用，9c 在 9b 之后插入）：

```python
    # === 9a. 读项目映射(售前↔已关闭原项目),供 PMIS 已关闭收录与项目主域使用 ===
    mapping = projects_mod.read_mapping(os.path.join(BASE_DIR, "input", config.MAPPING_FILE))
    extra_closed = {m["closed"] for m in mapping}
    if mapping:
        print(f"  [OK] 项目映射 {len(mapping)} 条(售前↔已关闭)")
```

9b 的调用行改为：

```python
    project_pmis, data_quality = pmis.load_project_pmis(
        pmis_dir, pay_projects, dirty=dirty, extra_closed_ids=extra_closed)
```

9b 之后插入：

```python
    # === 9c. 构建项目主域(PMIS在建 ∩ 交付三部,Phase P1) ===
    print("[INFO] 构建项目主域(交付实施三部)...")
    dept_projects, projects_quality = projects_mod.load_dept_projects(
        os.path.join(BASE_DIR, "input"), project_pmis, all_nodes, mapping)
    if projects_quality["orgFile"]["provided"]:
        print(f"  [OK] 主域项目 {projects_quality['deptProjectCount']} 个, "
              f"售前已映射 {projects_quality['presaleMapped']}/{projects_quality['presaleTotal']}, "
              f"漏网告警 {len(projects_quality['managerNotInOrg'])}")
    else:
        print("  [WARN] 未提供 组织架构.xlsx,主域退化为 PMIS 在建全量")
```

final_data dict 中 `"dataQuality": data_quality,` 之后加：

```python
        "projects": dept_projects,
        "projectsQuality": projects_quality,
```

- [ ] **Step 6: 全量测试 + 真实数据冒烟**

Run: `python -m pytest -q`
Expected: 全部 PASS

Run: `PYTHONIOENCODING=utf-8 python preprocess_data.py`
Expected: 输出含 `[OK] 项目映射 460 条`（±2，A.xlsx 有 462 行含可能空行）、`[OK] 主域项目 N 个`（N 应为几十到几百之间且 < 911）、`[OK] 数据已通过 schema 校验`。**把 N、售前映射数、漏网告警数记录到任务报告**，供用户核对口径。

- [ ] **Step 7: 类型再生成并验证前端编译**

Run: `cd frontend && npm run gen:types && npm run typecheck`
Expected: `src/types/analysis.ts` 出现 Project/ProjectsQuality 类型；typecheck 通过

- [ ] **Step 8: Commit**

```bash
git add schema.py preprocess_data.py tests/test_schema.py frontend/src/types/analysis.ts
git commit -m "feat(p1): Project/ProjectsQuality 契约 + main() 9a/9c 集成 + 类型同源再生成"
```

---

### Task 6: server.py /api/inputs/upload

**Files:**
- Modify: `server.py`（`is_valid_pmis_name` 附近加 `is_valid_input_name`；do_POST 路由表加一项；`handle_pmis_upload` 附近加 `handle_inputs_upload`）
- Test: `tests/test_server_inputs_upload.py`（新建，镜像 `tests/test_server_pmis_upload.py` 的结构——若该文件除白名单类外还有 handler 级用例，按同样手法一并镜像）

- [ ] **Step 1: 写失败测试**

```python
# -*- coding: utf-8 -*-
import server as S


class TestIsValidInputName:
    def test_org_ok(self):
        assert S.is_valid_input_name("组织架构.xlsx") is True
    def test_mapping_ok(self):
        assert S.is_valid_input_name("A.xlsx") is True
    def test_delivery_ok(self):
        assert S.is_valid_input_name("delivery_analysis.xlsx") is True
    def test_pmis_name_rejected(self):
        assert S.is_valid_input_name("项目中心.xlsx") is False  # PMIS 走 /api/pmis/upload
    def test_path_traversal_rejected(self):
        assert S.is_valid_input_name("../evil.xlsx") is False
    def test_lockfile_rejected(self):
        assert S.is_valid_input_name("~$A.xlsx") is False
    def test_empty_rejected(self):
        assert S.is_valid_input_name("") is False
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_server_inputs_upload.py -q`
Expected: FAIL（AttributeError is_valid_input_name）

- [ ] **Step 3: 实现**

`server.py` 在 `is_valid_pmis_name` 之后加：

```python
_INPUT_UPLOAD_NAMES = set(config.INPUT_UPLOAD_NAMES)


def is_valid_input_name(name: str) -> bool:
    """仅允许 3 个项目主域固定文件名(防目录穿越/任意写)。"""
    return bool(name) and name in _INPUT_UPLOAD_NAMES
```

do_POST 路由分发处（`elif parsed.path == '/api/pmis/upload':` 之后）加：

```python
        elif parsed.path == '/api/inputs/upload':
            self.handle_inputs_upload()
```

`handle_pmis_upload` 之后加（与其同构，仅白名单与目标目录不同；保持镜像而非抽公共函数，避免本期顺手重构——抽取已记入 H-8）：

```python
    def handle_inputs_upload(self):
        """POST /api/inputs/upload?name=<文件名> - 接收原始字节，写入 input/ 根（项目主域三文件）"""
        qs = parse_qs(urlparse(self.path).query)
        name = (qs.get('name', [''])[0] or '').strip()
        if not is_valid_input_name(name):
            self.send_response(400)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "message": f"非法文件名: {name}"}, ensure_ascii=False).encode('utf-8'))
            return
        length = int(self.headers.get('Content-Length', 0))
        if length <= 0:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "message": "缺少文件内容"}, ensure_ascii=False).encode('utf-8'))
            return
        body = self.rfile.read(length)
        input_dir = os.path.join(BASE_DIR, 'input')
        os.makedirs(input_dir, exist_ok=True)
        with open(os.path.join(input_dir, name), 'wb') as f:
            f.write(body)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "name": name, "bytes": len(body)}, ensure_ascii=False).encode('utf-8'))
```

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_server_inputs_upload.py tests/test_server_pmis_upload.py -q`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server.py tests/test_server_inputs_upload.py
git commit -m "feat(p1): /api/inputs/upload 项目主域三文件上传(白名单防穿越)"
```

---

### Task 7: 前端 useInputFiles + DataView 项目域数据卡

**Files:**
- Create: `frontend/src/composables/useInputFiles.ts`
- Test: `frontend/src/composables/useInputFiles.test.ts`
- Modify: `frontend/src/views/DataView.vue`（script 加状态/方法；template 获取段 PMIS 卡之后加一卡）
- Modify: `frontend/src/views/DataView.test.ts`（沿其既有挂载桩模式补一个用例）

- [ ] **Step 1: 写失败测试**

新建 `frontend/src/composables/useInputFiles.test.ts`：

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useInputFiles, INPUT_FILE_NAMES } from './useInputFiles'

function fakeFile(name: string): File {
  return { name, arrayBuffer: async () => new ArrayBuffer(4) } as unknown as File
}

afterEach(() => vi.unstubAllGlobals())

describe('useInputFiles', () => {
  it('包含三个固定文件名', () => {
    expect(INPUT_FILE_NAMES).toEqual(['组织架构.xlsx', 'A.xlsx', 'delivery_analysis.xlsx'])
  })

  it('upload 只传白名单文件并按文件名编码到 query', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      return { ok: true } as Response
    }))
    const { upload } = useInputFiles()
    const ok = await upload([fakeFile('组织架构.xlsx'), fakeFile('别的.xlsx')])
    expect(ok).toBe(1)
    expect(calls).toEqual(['/api/inputs/upload?name=' + encodeURIComponent('组织架构.xlsx')])
  })

  it('上传失败不计入成功数', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false } as Response)))
    const { upload } = useInputFiles()
    expect(await upload([fakeFile('A.xlsx')])).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/composables/useInputFiles.test.ts`
Expected: FAIL（找不到模块 ./useInputFiles）

- [ ] **Step 3: 实现 composable**

新建 `frontend/src/composables/useInputFiles.ts`（镜像 `usePmisSync.ts` 的 upload 部分）：

```typescript
export const INPUT_FILE_NAMES = ['组织架构.xlsx', 'A.xlsx', 'delivery_analysis.xlsx']

/** 项目主域三输入文件上传(组织架构/项目映射/预算核算)。白名单外文件跳过。 */
export function useInputFiles() {
  async function upload(files: File[]): Promise<number> {
    let ok = 0
    for (const f of files) {
      if (!INPUT_FILE_NAMES.includes(f.name)) continue
      const buf = await f.arrayBuffer()
      const res = await fetch('/api/inputs/upload?name=' + encodeURIComponent(f.name), {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf,
      })
      if (res.ok) ok++
    }
    return ok
  }
  return { upload, INPUT_FILE_NAMES }
}
```

- [ ] **Step 4: 跑 composable 测试通过**

Run: `cd frontend && npx vitest run src/composables/useInputFiles.test.ts`
Expected: PASS（3 passed）

- [ ] **Step 5: DataView 接入（含视图测试）**

`DataView.vue` script 中（PMIS 上传状态附近，`pmisUploadMsg` 之后）加：

```typescript
const { upload: inputsUpload, INPUT_FILE_NAMES } = useInputFiles()
const inputsInput = ref<HTMLInputElement | null>(null)
const inputsUploadMsg = ref('')
async function onUploadInputs() {
  const files = Array.from(inputsInput.value?.files || [])
  const ok = await inputsUpload(files)
  inputsUploadMsg.value = `已上传 ${ok}/${files.length} 个项目域文件,请点[更新数据]生效`
  if (inputsInput.value) inputsInput.value.value = ''
}
```

并在 import 区加 `import { useInputFiles } from '../composables/useInputFiles'`。

template 获取段 PMIS 卡（`dv-pmis` 相关块）之后加同构一卡（类名沿用 dv-* 既有样式，不新增样式）：

```html
      <div class="dv-card">
        <div class="dv-card-title">项目域数据（组织架构 / 项目映射 / 预算核算）</div>
        <div class="dv-row dv-note">离线:将 3 个文件放入 input/ 根目录,或在此多选上传:{{ INPUT_FILE_NAMES.join(' · ') }}。</div>
        <div class="dv-row">
          <input ref="inputsInput" type="file" accept=".xlsx" multiple class="dv-file" />
          <button class="dv-btn" @click="onUploadInputs">上传</button>
        </div>
        <div v-if="inputsUploadMsg" class="dv-row dv-note">{{ inputsUploadMsg }}</div>
      </div>
```

注意：`dv-card`/`dv-card-title` 等类名以 DataView.vue 现有获取段卡的实际类名为准——若现有卡用的是别的容器类名（执行时打开文件核对），同构沿用，不发明新结构。

`DataView.test.ts` 沿其既有挂载/stub 模式追加一个用例（挂载后断言文案存在）：

```typescript
it('渲染项目域数据上传卡', () => {
  // 沿用本文件既有的 mount 辅助/stubs(执行时复用现有 beforeEach 装配)
  expect(wrapper.text()).toContain('项目域数据')
  expect(wrapper.text()).toContain('组织架构.xlsx')
})
```

- [ ] **Step 6: 跑前端全量验证**

Run: `cd frontend && npm run test:run && npm run typecheck`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/composables/useInputFiles.ts frontend/src/composables/useInputFiles.test.ts frontend/src/views/DataView.vue frontend/src/views/DataView.test.ts
git commit -m "feat(p1): 数据管理页项目域三文件上传入口(useInputFiles + DataView 卡)"
```

---

### Task 8: 版本 V7.0.0 + PROGRESS + verify 全绿收口

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`（进行中条目更新 + 新 Handoff 段）

- [ ] **Step 1: 版本号**

`frontend/src/version.ts` 改为：

```typescript
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V7.0.0'
export const RELEASE_DATE = '2026-06-10'
```

Run: `cd frontend && grep -rn "V6.5.0" src/ tests/ 2>/dev/null; npm run test:run`
若有测试断言旧版本号（如 AboutView.test.ts），同步更新断言。Expected: PASS

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 四步全绿（py_compile + ruff + pytest + 前端 typecheck/vitest/build）。ruff 若报新文件风格问题就地修复。

- [ ] **Step 3: 更新 PROGRESS.md**

「进行中」条目改为 P1 完成、下一步 P2；新增 Handoff 段（沿既有格式）记录：P1 交付物清单、主域项目数/售前映射数/漏网告警数（Task 5 Step 6 记录的真实数字）、手工烟雾清单：

> 手工端到端烟雾测试（需用户执行）：`cd frontend && npm run build` → `python server.py` → 数据管理页出现「项目域数据」卡;上传/放置三文件后点[更新数据];验证 data/analysis_data.json 含 projects（主域项目数与预期一致）、projectsQuality（售前映射覆盖、漏网告警可核对）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(p1): 版本 V7.0.0 + PROGRESS 记录 P1 数据地基完成"
```

---

## Self-Review 结论（已自查）

- **Spec 覆盖**：3.1 输入文件（Task 1）、3.2 六步构建中 P1 范围的 1-5 步+健康度（Task 3/4；快照/diff 属 P3 不在本计划）、售前两份信息的已关闭收录（Task 2 extra_closed_ids；「原项目信息块」的前端展示属 P2 详情页）、3.4 降级（Task 1/4 空集合降级 + Task 5 WARN 日志）、3.5 契约与双模式（Task 5；路径全走既有 BASE_DIR）、3.6 质量数据（Task 4，UI 不动）、数据管理页入口（Task 6/7）。
- **占位扫描**：无 TBD；DataView 卡的容器类名标注了"以现有文件为准沿用"，属执行期核对而非未定设计。
- **类型一致性**：`projects.py` 输出键 ↔ `schema.py` 模型字段 ↔ Task 5 测试样例逐一核对一致（payment 六键/health 五键/quality 九键）；`build_project_pmis(extra_closed_ids)` 在 Task 2 定义、Task 5 main() 调用签名一致。
