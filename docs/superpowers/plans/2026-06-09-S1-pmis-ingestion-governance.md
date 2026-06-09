# S1 双域数据地基与治理层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 PMIS 七表(在建 4 + 已关闭 3)摄取进现有管线,按 `projectId` join 到回款项目,把可用维度入库 `projectPmis`、把治理指标入库 `dataQuality`,并新增「数据治理」前端视图(覆盖率记分卡 + 未匹配/回填清单 + 冲突/脏值告警,可导出);PMIS 文件支持在线下载与离线放置两种获取方式。

**Architecture:** 新建纯函数模块 `pmis.py`(解析/join/派生/质量计算,openpyxl 读 xlsx),`preprocess_data.py` 在 `main()` 末尾调用它并把结果并入 `final_data`;`schema.py` 增 `ProjectPmis`/`DataQuality` 模型驱动前端类型;在线下载用 `pmis_download.py`(stdlib urllib)+ `server.py` 新端点(SSE 进度、frozen/dev 双路径)。前端新增 `DataQualityView.vue` + `lib/governance.ts` + 导出工具 + 数据管理页 PMIS 区块。

**Tech Stack:** Python 3.8+(标准库 + openpyxl + pydantic v2);Vue3 `<script setup>` + Pinia + scoped CSS/token;Vitest;SheetJS(`xlsx`)导出。验证 `bash verify.sh`。

**关键既有事实(实现时遵循):**
- 回款节点来自 `yundocs_data/sheet_*.json`(`load_sheet`),非 xlsx;PMIS 反之是 xlsx,需 openpyxl(已在 `PaymentReviewApp.spec` hiddenimports,但**未在 requirements.txt**,Task 1 补)。
- PMIS 表表头在**第 2 行**(第 1 行是合并标题);回款节点表表头在第 1 行。
- `final_data` 在 `preprocess_data.py:1134` 构建,`schema.validate_and_write_json` 在 `:1154` 校验输出。节点对象 `projectId` 即"项目编号"。
- 已有 `lib/dataQuality.ts` + "数据质检"(integrity)tab 是**回款内**质检,与本期 PMIS 跨域治理无关——新视图命名 **数据治理 / governance**,勿复用 `dataQuality.ts`。
- 实测锚定:回款 628 项目;∩在建 462、∩已关闭 158、未匹配 8(全 SF);消耗比=核算/总预算(97.4% 吻合);成本数值权威源=项目状态信息。
- 约定:无 emoji(用 `→ ↓ ❌ ✕ ▾`);frozen/dev 双路径都改;**禁止 `git add -A`/`git add .`**,只 add 指定文件(`input/`、`data/` 绝不提交)。

---

### Task 1: config 常量 + pmis.py 读表与解析(纯函数)

**Files:**
- Modify: `config.py`(追加 PMIS 文件名常量)
- Create: `pmis.py`(读表 + 解析纯函数)
- Create: `tests/test_pmis.py`
- Modify: `requirements.txt`(加 openpyxl)

- [ ] **Step 1: 追加 config 常量**

在 `config.py` 末尾追加:

```python
# ── PMIS 数据(项目域)──
PMIS_DIRNAME = "pmis"  # 位于 input/pmis/
# 在建四表 + 已关闭三表(风险无已关闭变体);键=逻辑名,值=固定文件名
PMIS_FILES_ACTIVE = {
    "center": "项目中心.xlsx",
    "base": "项目基础信息数据.xlsx",
    "status": "项目状态信息数据.xlsx",
    "risk": "项目风险数据.xlsx",
}
PMIS_FILES_CLOSED = {
    "center": "项目中心-已关闭.xlsx",
    "base": "项目基础信息数据-已关闭.xlsx",
    "status": "项目状态信息数据-已关闭.xlsx",
}
PMIS_HEADER_ROW = 2  # PMIS 表表头在第 2 行(第 1 行为合并标题)
```

- [ ] **Step 2: 写失败测试(解析纯函数)**

创建 `tests/test_pmis.py`:

```python
# -*- coding: utf-8 -*-
"""pmis.py 纯函数单元测试。不依赖 input/ 真文件——用内存 dict 或 tmp_path 生成的小 xlsx。"""
import pytest
import pmis as M


class TestParsePmisMoney:
    def test_plain(self):
        assert M.parse_pmis_money("1234.5") == 1234.5
    def test_with_separators(self):
        assert M.parse_pmis_money("1,234,567") == 1234567.0
    def test_blank_is_none(self):
        assert M.parse_pmis_money("") is None
        assert M.parse_pmis_money(None) is None
    def test_number_passthrough(self):
        assert M.parse_pmis_money(1000) == 1000.0


class TestParsePmisPct:
    def test_percent_text(self):
        assert M.parse_pmis_pct("80.00%") == pytest.approx(0.8)
    def test_bare_le_1(self):
        assert M.parse_pmis_pct(0.8) == pytest.approx(0.8)
    def test_gt_1_divided(self):
        assert M.parse_pmis_pct("100") == pytest.approx(1.0)
    def test_blank_none(self):
        assert M.parse_pmis_pct("") is None


class TestParseCloseFraction:
    """未关闭风险数量是 '未关闭/总' 分式文本,取分子。"""
    def test_fraction(self):
        assert M.parse_close_fraction("2/5") == 2
    def test_zero(self):
        assert M.parse_close_fraction("0/3") == 0
    def test_blank_none(self):
        assert M.parse_close_fraction("") is None
    def test_plain_int(self):
        assert M.parse_close_fraction("4") == 4
```

- [ ] **Step 3: 运行确认失败**

Run: `python -m pytest tests/test_pmis.py -q`
Expected: FAIL(`ModuleNotFoundError: No module named 'pmis'`)

- [ ] **Step 4: 实现解析纯函数**

创建 `pmis.py`:

```python
# pmis.py
"""PMIS 项目域数据摄取:解析七表 → 按 projectId join → 派生维度 + 数据质量。
纯函数为主(解析/join/派生/质量),文件读取(openpyxl)集中在 read_pmis_sheet/load_project_pmis。
PMIS 缺失要优雅降级,不抛错、不阻断回款主流程。"""
from __future__ import annotations
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import config


def parse_pmis_money(val) -> Optional[float]:
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip().replace(",", "").replace("，", "")
    m = re.search(r"-?[\d.]+", s)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def parse_pmis_pct(val) -> Optional[float]:
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip().rstrip("%")
    try:
        num = float(s)
    except ValueError:
        return None
    return num if num <= 1 else num / 100


def parse_close_fraction(val) -> Optional[int]:
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip()
    m = re.match(r"\s*(\d+)", s)
    return int(m.group(1)) if m else None
```

在 `requirements.txt` 的运行时依赖段补一行(openpyxl 已在 PyInstaller spec,显式声明运行时依赖):

```
openpyxl>=3.0       # pmis.py 读取 PMIS xlsx(项目域)
```

- [ ] **Step 5: 运行确认通过**

Run: `python -m pytest tests/test_pmis.py -q`
Expected: PASS(全部解析测试通过)

- [ ] **Step 6: 提交**

```bash
git add config.py pmis.py tests/test_pmis.py requirements.txt
git commit -m "feat(S1): pmis.py 解析纯函数 + config PMIS 文件常量"
```

---

### Task 2: PMIS 读表 + 派生(成本/风险/完工)

**Files:**
- Modify: `pmis.py`
- Modify: `tests/test_pmis.py`

- [ ] **Step 1: 写失败测试(读表 + 派生)**

在 `tests/test_pmis.py` 追加:

```python
import openpyxl


def _make_xlsx(tmp_path, name, headers, rows):
    """造一个表头在第 2 行的 PMIS 风格 xlsx(第 1 行合并标题)。"""
    wb = openpyxl.Workbook(); ws = wb.active
    ws.cell(row=1, column=1, value="标题")
    for c, h in enumerate(headers, 1):
        ws.cell(row=2, column=c, value=h)
    for r, row in enumerate(rows, 3):
        for c, h in enumerate(headers, 1):
            ws.cell(row=r, column=c, value=row.get(h))
    p = tmp_path / name; wb.save(p); return str(p)


class TestReadPmisSheet:
    def test_reads_header_row2(self, tmp_path):
        p = _make_xlsx(tmp_path, "x.xlsx", ["项目编号", "项目名称"],
                       [{"项目编号": "A-1", "项目名称": "甲"}])
        rows = M.read_pmis_sheet(p)
        assert rows == [{"项目编号": "A-1", "项目名称": "甲"}]
    def test_missing_file_returns_empty(self, tmp_path):
        assert M.read_pmis_sheet(str(tmp_path / "nope.xlsx")) == []


class TestDeriveCost:
    def test_consume_ratio_and_overrun(self):
        row = {"项目总预算（元）": "1000", "项目核算（元）": "600", "剩余预算（元）": "400",
               "成本状态": "黄色预警"}
        center = {"是否人工成本超支": "否", "是否直接成本超支": "是"}
        cost = M.derive_cost(row, center)
        assert cost["消耗比"] == pytest.approx(0.6)
        assert cost["超支"] is True
        assert cost["成本状态"] == "黄色预警"
    def test_zero_budget_ratio_none(self):
        cost = M.derive_cost({"项目总预算（元）": "0", "项目核算（元）": "0"}, {})
        assert cost["消耗比"] is None


class TestDeriveRisk:
    def test_aggregate(self):
        recs = [{"风险等级": "低", "风险状态": "已关闭"},
                {"风险等级": "高", "风险状态": "已识别"}]
        risk = M.derive_risk(recs)
        assert risk["风险记录数"] == 2
        assert risk["最高等级"] == "高"
        assert risk["闭环率"] == pytest.approx(0.5)
    def test_empty(self):
        risk = M.derive_risk([])
        assert risk["风险记录数"] == 0 and risk["最高等级"] is None
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_pmis.py -q`
Expected: FAIL(`AttributeError: module 'pmis' has no attribute 'read_pmis_sheet'`)

- [ ] **Step 3: 实现读表 + 派生**

在 `pmis.py` 追加:

```python
def read_pmis_sheet(path: str) -> List[Dict[str, Any]]:
    """读 PMIS xlsx(表头第 2 行)为 list[dict]。文件不存在返回 []。"""
    if not os.path.exists(path):
        return []
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    all_rows = list(rows_iter)
    wb.close()
    hr = config.PMIS_HEADER_ROW
    if len(all_rows) < hr:
        return []
    headers = [str(h).strip() if h is not None else "" for h in all_rows[hr - 1]]
    out = []
    for raw in all_rows[hr:]:
        d = {}
        for i, h in enumerate(headers):
            if h:
                d[h] = raw[i] if i < len(raw) else None
        out.append(d)
    return out


_RISK_RANK = {"高": 3, "中": 2, "低": 1}


def derive_cost(status_row: Dict[str, Any], center_row: Dict[str, Any]) -> Dict[str, Any]:
    total = parse_pmis_money(status_row.get("项目总预算（元）"))
    used = parse_pmis_money(status_row.get("项目核算（元）"))
    remain = parse_pmis_money(status_row.get("剩余预算（元）"))
    ratio = (used / total) if (total and total > 0 and used is not None) else None
    overrun_keys = [k for k in center_row if "超支" in k]
    overrun = None
    if overrun_keys:
        overrun = any("是" in str(center_row.get(k) or "") for k in overrun_keys)
    return {"总预算": total, "核算": used, "剩余预算": remain, "消耗比": ratio,
            "超支": overrun, "成本状态": (status_row.get("成本状态") or None)}


def derive_risk(risk_recs: List[Dict[str, Any]]) -> Dict[str, Any]:
    n = len(risk_recs)
    if n == 0:
        return {"未关闭风险数": None, "风险记录数": 0, "最高等级": None, "闭环率": None}
    closed = sum(1 for r in risk_recs if "已关闭" in str(r.get("风险状态") or ""))
    levels = [str(r.get("风险等级") or "").strip() for r in risk_recs]
    top = max((lv for lv in levels if lv in _RISK_RANK), key=lambda x: _RISK_RANK[x], default=None)
    return {"未关闭风险数": n - closed, "风险记录数": n, "最高等级": top,
            "闭环率": (closed / n) if n else None}
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_pmis.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add pmis.py tests/test_pmis.py
git commit -m "feat(S1): PMIS 读表 + 成本/风险派生"
```

---

### Task 3: build_project_pmis(join 在建全量 + 已关闭∩回款)

**Files:**
- Modify: `pmis.py`
- Modify: `tests/test_pmis.py`

- [ ] **Step 1: 写失败测试**

在 `tests/test_pmis.py` 追加:

```python
class TestBuildProjectPmis:
    def _tables(self):
        active = {
            "base": [{"项目编号": "SS-1", "项目名称": "甲", "最终客户": "客A", "项目状态": "实施中"}],
            "center": [{"项目编号": "SS-1", "是否人工成本超支": "是"}],
            "status": [{"项目编号": "SS-1", "项目总预算（元）": "1000", "项目核算（元）": "500",
                        "项目累计完工进展百分比": "80%", "未关闭风险数量": "1/2"}],
            "risk": [{"项目编号": "SS-1", "风险等级": "高", "风险状态": "已识别"}],
        }
        closed = {
            "base": [{"项目编号": "SS-9", "项目名称": "乙", "项目状态": "已结项"},
                     {"项目编号": "SS-OUT", "项目名称": "丙"}],
            "center": [{"项目编号": "SS-9"}],
            "status": [{"项目编号": "SS-9", "项目总预算（元）": "200", "项目核算（元）": "200"}],
        }
        return active, closed

    def test_active_full_and_closed_filtered(self):
        active, closed = self._tables()
        pay_ids = {"SS-1", "SS-9", "SS-FREE"}  # SS-FREE 不在 PMIS;SS-OUT 在已关闭但不在回款
        pm = M.build_project_pmis(active, closed, pay_ids)
        # 在建全量入库
        assert "SS-1" in pm and pm["SS-1"]["matched"] is True
        assert pm["SS-1"]["source"] == "在建"
        assert pm["SS-1"]["cost"]["消耗比"] == pytest.approx(0.5)
        assert pm["SS-1"]["progress"]["完工进展"] == pytest.approx(0.8)
        assert pm["SS-1"]["risk"]["最高等级"] == "高"
        assert pm["SS-1"]["customer"]["最终客户"] == "客A"
        # 已关闭只收在回款里的
        assert "SS-9" in pm and pm["SS-9"]["source"] == "已关闭"
        assert "SS-OUT" not in pm  # 已关闭但不在回款 → 不入库
        # 回款里但 PMIS 没有的不出现在 projectPmis(进 unmatched,见 Task4)
        assert "SS-FREE" not in pm
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_pmis.py::TestBuildProjectPmis -q`
Expected: FAIL(`has no attribute 'build_project_pmis'`)

- [ ] **Step 3: 实现 build_project_pmis**

在 `pmis.py` 追加:

```python
def _index_by_pid(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    idx = {}
    for r in rows:
        pid = r.get("项目编号")
        if pid not in (None, ""):
            idx.setdefault(str(pid).strip(), r)
    return idx


def _risk_by_pid(rows: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        pid = r.get("项目编号")
        if pid not in (None, ""):
            out.setdefault(str(pid).strip(), []).append(r)
    return out


def _assemble(pid, base_i, center_i, status_i, risk_i, source) -> Dict[str, Any]:
    b = base_i.get(pid, {}); c = center_i.get(pid, {}); s = status_i.get(pid, {})
    cost = derive_cost(s, c)
    risk = derive_risk(risk_i.get(pid, []))
    # 未关闭风险数优先用 status 的分式文本(填充率高)
    ucf = parse_close_fraction(s.get("未关闭风险数量")) if s else None
    if ucf is not None:
        risk["未关闭风险数"] = ucf
    return {
        "matched": True, "source": source,
        "cost": cost,
        "progress": {
            "完工进展": parse_pmis_pct(s.get("项目累计完工进展百分比")),
            "里程碑进度状态": (s.get("里程碑进度状态") or None),
            "项目阶段": (s.get("项目阶段") or c.get("项目阶段") or None),
            "计划终验": (c.get("计划终验时间") or s.get("合同目标终验时间") or None),
        },
        "risk": risk,
        "status": {
            "项目状态": (b.get("项目状态") or s.get("项目状态") or None),
            "是否暂停": (("是" in str(b.get("是否暂停") or "")) if b.get("是否暂停") else None),
            "评级": (s.get("项目评级") or None),
            "评分": parse_pmis_money(b.get("项目评分")),
        },
        "customer": {
            "最终客户": (b.get("最终客户") or None),
            "合同编号": (b.get("合同编号") or None),
            "签约形式": (b.get("签约形式分类") or None),
            "行业": (b.get("行业中类") or None),
            "合同总额": parse_pmis_money(b.get("合同总额（元）")),
        },
    }


def build_project_pmis(active: Dict[str, List[Dict[str, Any]]],
                       closed: Dict[str, List[Dict[str, Any]]],
                       payment_project_ids: set) -> Dict[str, Dict[str, Any]]:
    """在建全量入库;已关闭仅收 ∩ 回款。优先在建(同 pid 不被已关闭覆盖)。"""
    a_base, a_center = _index_by_pid(active.get("base", [])), _index_by_pid(active.get("center", []))
    a_status, a_risk = _index_by_pid(active.get("status", [])), _risk_by_pid(active.get("risk", []))
    out: Dict[str, Dict[str, Any]] = {}
    for pid in a_base.keys() | a_center.keys() | a_status.keys():
        out[pid] = _assemble(pid, a_base, a_center, a_status, a_risk, "在建")
    c_base, c_center = _index_by_pid(closed.get("base", [])), _index_by_pid(closed.get("center", []))
    c_status, c_risk = _index_by_pid(closed.get("status", [])), _risk_by_pid(closed.get("risk", []))
    for pid in (c_base.keys() | c_center.keys() | c_status.keys()):
        if pid in payment_project_ids and pid not in out:
            out[pid] = _assemble(pid, c_base, c_center, c_status, c_risk, "已关闭")
    return out
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_pmis.py::TestBuildProjectPmis -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add pmis.py tests/test_pmis.py
git commit -m "feat(S1): build_project_pmis(在建全量 + 已关闭∩回款 join)"
```

---

### Task 4: compute_data_quality(覆盖率/未匹配/回填/脏值)

**Files:**
- Modify: `pmis.py`
- Modify: `tests/test_pmis.py`

- [ ] **Step 1: 写失败测试**

在 `tests/test_pmis.py` 追加:

```python
class TestComputeDataQuality:
    def test_unmatched_and_summary(self):
        project_pmis = {"SS-1": {"matched": True, "source": "在建",
                                 "cost": {"成本状态": None, "消耗比": 0.5},
                                 "progress": {"完工进展": None}, "status": {"项目状态": "实施中"}}}
        # 回款项目:SS-1 命中在建;SS-9 命中已关闭;SF-2 未匹配
        pay_projects = [
            {"projectId": "SS-1", "projectName": "甲"},
            {"projectId": "SS-9", "projectName": "乙"},
            {"projectId": "SF-2", "projectName": "丙售前"},
        ]
        project_pmis["SS-9"] = {"matched": True, "source": "已关闭",
                                "cost": {"成本状态": "正常", "消耗比": 1.0},
                                "progress": {"完工进展": 1.0}, "status": {"项目状态": "已结项"}}
        dq = M.compute_data_quality(project_pmis, pay_projects)
        assert dq["summary"]["matchedActive"] == 1
        assert dq["summary"]["matchedClosed"] == 1
        assert dq["summary"]["unmatched"] == 1
        kinds = {u["projectId"]: u["kind"] for u in dq["unmatched"]}
        assert kinds == {"SF-2": "SF售前"}
        # 实施中且成本状态/完工空 → 进回填
        bf = {b["projectId"] for b in dq["backfill"]}
        assert "SS-1" in bf
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_pmis.py::TestComputeDataQuality -q`
Expected: FAIL(`has no attribute 'compute_data_quality'`)

- [ ] **Step 3: 实现 compute_data_quality**

在 `pmis.py` 追加(`conflicts` 为承接普查的静态告警常量,`dirty` 由回款节点扫描得到——本函数先做覆盖率/未匹配/回填,dirty 在 Task 5 集成时由调用方传入回款节点扫描结果):

```python
# 普查确认的跨表口径冲突(静态告警,展示用)
PMIS_CONFLICTS = [
    {"column": "项目金额", "sheets": ["项目状态信息", "项目中心", "回款节点清单"],
     "issue": "项目状态信息无'项目金额'列(其金额列为项目总预算),跨表不可相加",
     "recommendation": "回款金额以回款清单为准;成本分析用项目状态信息总预算"},
    {"column": "成本状态", "sheets": ["项目中心", "项目状态信息"],
     "issue": "同名取值域一致但填充率不同(中心约35%/状态约46%)",
     "recommendation": "以项目状态信息为权威源"},
    {"column": "风险状态/风险等级", "sheets": ["项目风险", "项目中心", "项目状态信息"],
     "issue": "记录级风险状态 vs 项目级风险评级混用,项目级评级几乎全空",
     "recommendation": "项目级风险由项目风险表按 projectId 聚合派生"},
]

_BACKFILL_FIELDS = [  # (展示名, 取值函数)
    ("完工进展", lambda p: p.get("progress", {}).get("完工进展")),
    ("成本状态", lambda p: p.get("cost", {}).get("成本状态")),
    ("项目阶段", lambda p: p.get("progress", {}).get("项目阶段")),
    ("项目评级", lambda p: p.get("status", {}).get("评级")),
]


def _kind(pid: str) -> str:
    if "-SF-" in pid:
        return "SF售前"
    if "-SS-" in pid:
        return "SS实施"
    return "其他"


def compute_data_quality(project_pmis: Dict[str, Dict[str, Any]],
                         payment_projects: List[Dict[str, Any]],
                         dirty: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    matched_active = matched_closed = 0
    unmatched: List[Dict[str, Any]] = []
    backfill: List[Dict[str, Any]] = []
    seen = set()
    for p in payment_projects:
        pid = str(p.get("projectId") or "").strip()
        if not pid or pid in seen:
            continue
        seen.add(pid)
        pm = project_pmis.get(pid)
        if not pm:
            unmatched.append({"projectId": pid, "projectName": p.get("projectName", ""),
                              "kind": _kind(pid)})
            continue
        if pm.get("source") == "已关闭":
            matched_closed += 1
        else:
            matched_active += 1
        # 回填:在建且关键字段空
        if pm.get("status", {}).get("项目状态") == "实施中":
            missing = [name for name, fn in _BACKFILL_FIELDS if fn(pm) in (None, "")]
            if missing:
                backfill.append({"projectId": pid, "projectName": p.get("projectName", ""),
                                 "missingFields": missing})
    total = len(seen) or 1
    return {
        "summary": {
            "pmisProvided": bool(project_pmis),
            "joinRate": round((matched_active + matched_closed) / total, 4),
            "matchedActive": matched_active, "matchedClosed": matched_closed,
            "unmatched": len(unmatched),
        },
        "themes": _theme_coverage(project_pmis, seen),
        "unmatched": unmatched,
        "backfill": backfill,
        "conflicts": PMIS_CONFLICTS,
        "dirty": dirty or [],
    }


def _theme_coverage(project_pmis, payment_ids: set) -> List[Dict[str, Any]]:
    """五主题:在已匹配回款项目上,各关键字段的非空占比。"""
    matched = [project_pmis[p] for p in payment_ids if p in project_pmis]
    n = len(matched) or 1
    def pctf(fn):
        return round(sum(1 for m in matched if fn(m) not in (None, "")) / n, 4)
    specs = [
        ("成本预算", [("总预算", lambda m: m["cost"]["总预算"]),
                   ("成本状态", lambda m: m["cost"]["成本状态"])]),
        ("交付进度", [("完工进展", lambda m: m["progress"]["完工进展"]),
                   ("里程碑进度状态", lambda m: m["progress"]["里程碑进度状态"])]),
        ("风险", [("风险记录数", lambda m: m["risk"]["风险记录数"])]),
        ("客户合同", [("最终客户", lambda m: m["customer"]["最终客户"]),
                   ("合同总额", lambda m: m["customer"]["合同总额"])]),
    ]
    out = []
    for theme, fields in specs:
        frs = [{"field": fn_name, "fillPct": pctf(fn)} for fn_name, fn in fields]
        cov = round(sum(f["fillPct"] for f in frs) / len(frs), 4) if frs else 0.0
        verdict = "green" if cov >= 0.7 else ("yellow" if cov >= 0.3 else "red")
        out.append({"theme": theme, "verdict": verdict, "coveragePct": cov, "fields": frs})
    return out
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_pmis.py -q`
Expected: PASS(全 Task 1-4 测试通过)

- [ ] **Step 5: 提交**

```bash
git add pmis.py tests/test_pmis.py
git commit -m "feat(S1): compute_data_quality(覆盖率/未匹配/回填/冲突)"
```

---

### Task 5: load_project_pmis 编排 + 优雅降级

**Files:**
- Modify: `pmis.py`
- Modify: `tests/test_pmis.py`

- [ ] **Step 1: 写失败测试**

在 `tests/test_pmis.py` 追加:

```python
class TestLoadProjectPmis:
    def test_missing_dir_graceful(self, tmp_path):
        pm, dq = M.load_project_pmis(str(tmp_path / "nope"), {"SS-1"})
        assert pm == {}
        assert dq["summary"]["pmisProvided"] is False
    def test_reads_files(self, tmp_path):
        d = tmp_path / "pmis"; d.mkdir()
        _make_xlsx(tmp_path / "pmis", config.PMIS_FILES_ACTIVE["base"],
                   ["项目编号", "项目名称", "项目状态"], [{"项目编号": "SS-1", "项目名称": "甲", "项目状态": "实施中"}])
        _make_xlsx(tmp_path / "pmis", config.PMIS_FILES_ACTIVE["status"],
                   ["项目编号", "项目总预算（元）", "项目核算（元）"], [{"项目编号": "SS-1", "项目总预算（元）": "1000", "项目核算（元）": "500"}])
        pm, dq = M.load_project_pmis(str(d), {"SS-1"})
        assert "SS-1" in pm
        assert dq["summary"]["pmisProvided"] is True
```

(注:`_make_xlsx` 已在 Task 2 定义于本测试文件,签名 `_make_xlsx(dir_path, name, headers, rows)`——本步用 `tmp_path/"pmis"` 作 dir。若 Task 2 的 `_make_xlsx` 第一参为 `tmp_path` 且内部 `tmp_path/name`,这里改为先 `mkdir` 再调用,把目录作为第一参传入并在函数内 `os.path.join`。统一为:`_make_xlsx(dir, name, headers, rows)` 内部 `wb.save(os.path.join(dir, name))`。)

- [ ] **Step 2: 调整 `_make_xlsx` 签名为 (dir, name, headers, rows)**

把 Task 2 写入的 `_make_xlsx` 改为接收目录:

```python
def _make_xlsx(dir_path, name, headers, rows):
    import os as _os
    wb = openpyxl.Workbook(); ws = wb.active
    ws.cell(row=1, column=1, value="标题")
    for c, h in enumerate(headers, 1):
        ws.cell(row=2, column=c, value=h)
    for r, row in enumerate(rows, 3):
        for c, h in enumerate(headers, 1):
            ws.cell(row=r, column=c, value=row.get(h))
    _os.makedirs(dir_path, exist_ok=True)
    p = _os.path.join(dir_path, name); wb.save(p); return p
```

并把 Task 2 中 `TestReadPmisSheet` 调用改为 `M.read_pmis_sheet(_make_xlsx(str(tmp_path), "x.xlsx", [...], [...]))`。

- [ ] **Step 3: 运行确认失败**

Run: `python -m pytest tests/test_pmis.py::TestLoadProjectPmis -q`
Expected: FAIL(`has no attribute 'load_project_pmis'`)

- [ ] **Step 4: 实现 load_project_pmis**

在 `pmis.py` 追加:

```python
def load_project_pmis(pmis_dir: str, payment_projects_or_ids,
                      ) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    """读 input/pmis/ 下七表 → build_project_pmis + compute_data_quality。
    payment_projects_or_ids: 回款项目列表(dict 含 projectId/projectName)或 id 集合。
    目录/文件缺失 → 返回 ({}, 质量{pmisProvided:False})。"""
    if isinstance(payment_projects_or_ids, set):
        pay_projects = [{"projectId": pid, "projectName": ""} for pid in payment_projects_or_ids]
    else:
        pay_projects = list(payment_projects_or_ids)
    pay_ids = {str(p.get("projectId") or "").strip() for p in pay_projects if p.get("projectId")}

    def read_group(files):
        g = {}
        for key, fname in files.items():
            g[key] = read_pmis_sheet(os.path.join(pmis_dir, fname))
        return g

    if not os.path.isdir(pmis_dir):
        return {}, compute_data_quality({}, pay_projects)
    active = read_group(config.PMIS_FILES_ACTIVE)
    closed = read_group(config.PMIS_FILES_CLOSED)
    if not any(active.values()) and not any(closed.values()):
        return {}, compute_data_quality({}, pay_projects)
    project_pmis = build_project_pmis(active, closed, pay_ids)
    dq = compute_data_quality(project_pmis, pay_projects)
    return project_pmis, dq
```

- [ ] **Step 5: 运行确认通过**

Run: `python -m pytest tests/test_pmis.py -q`
Expected: PASS(全部 pmis 测试)

- [ ] **Step 6: 提交**

```bash
git add pmis.py tests/test_pmis.py
git commit -m "feat(S1): load_project_pmis 编排 + 缺失优雅降级"
```

---

### Task 6: schema 增 ProjectPmis / DataQuality + 重新生成前端类型

**Files:**
- Modify: `schema.py`
- Modify: `tests/test_schema.py`
- Generated: `schema.json`、`frontend/src/types/analysis.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/test_schema.py` 追加(若无该文件则参照其现有用例风格新增类):

```python
import schema as S


def _minimal_analysis():
    return {
        "meta": {"lastUpdate": "2026-06-09 10:00", "totalProjects": 1, "totalPaymentNodes": 1},
        "dashboard": {"totalProjectCount": 1, "totalPaymentNodes": 1, "totalPaidNodes": 0},
        "summary": {}, "rawNodes": [],
        "projectOverview": {"projects": [], "columns": []},
    }


class TestPmisSchema:
    def test_backward_compatible_without_pmis(self):
        # 旧数据(无 projectPmis/dataQuality)仍校验通过
        S.AnalysisData.model_validate(_minimal_analysis())

    def test_with_pmis_and_quality(self):
        d = _minimal_analysis()
        d["projectPmis"] = {"SS-1": {"matched": True, "source": "在建",
                                     "cost": {"消耗比": 0.5}, "progress": {}, "risk": {},
                                     "status": {}, "customer": {}}}
        d["dataQuality"] = {"summary": {"pmisProvided": True, "joinRate": 0.98,
                                        "matchedActive": 1, "matchedClosed": 0, "unmatched": 0},
                            "themes": [], "unmatched": [], "backfill": [],
                            "conflicts": [], "dirty": []}
        S.AnalysisData.model_validate(d)
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_schema.py::TestPmisSchema -q`
Expected: FAIL(`test_with_pmis_and_quality` 通过但字段被 extra=allow 吞掉、或断言不足时改为下方实现后才有意义。先确认 import S 与最小数据通过,with_pmis 因模型缺字段而仅靠 extra 容纳——为使类型导出含新结构,需显式建模,故继续 Step 3)

- [ ] **Step 3: 实现 schema 模型**

在 `schema.py` 的 `class AnalysisData` 之前新增:

```python
class PmisCost(_Base):
    总预算: float | None = None
    核算: float | None = None
    剩余预算: float | None = None
    消耗比: float | None = None
    超支: bool | None = None
    成本状态: str | None = None


class PmisProgress(_Base):
    完工进展: float | None = None
    里程碑进度状态: str | None = None
    项目阶段: str | None = None
    计划终验: str | None = None


class PmisRisk(_Base):
    未关闭风险数: int | None = None
    风险记录数: int | None = None
    最高等级: str | None = None
    闭环率: float | None = None


class PmisStatus(_Base):
    项目状态: str | None = None
    是否暂停: bool | None = None
    评级: str | None = None
    评分: float | None = None


class PmisCustomer(_Base):
    最终客户: str | None = None
    合同编号: str | None = None
    签约形式: str | None = None
    行业: str | None = None
    合同总额: float | None = None


class ProjectPmis(_Base):
    matched: bool = False
    source: str = ""
    cost: PmisCost = PmisCost()
    progress: PmisProgress = PmisProgress()
    risk: PmisRisk = PmisRisk()
    status: PmisStatus = PmisStatus()
    customer: PmisCustomer = PmisCustomer()


class QualitySummary(_Base):
    pmisProvided: bool = False
    joinRate: float = 0.0
    matchedActive: int = 0
    matchedClosed: int = 0
    unmatched: int = 0


class DataQuality(_Base):
    summary: QualitySummary
    themes: List[Dict[str, Any]] = []
    unmatched: List[Dict[str, Any]] = []
    backfill: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []
    dirty: List[Dict[str, Any]] = []
```

在 `class AnalysisData` 内 `followupRecords` 之后追加两字段:

```python
    projectPmis: Dict[str, ProjectPmis] = {}
    dataQuality: DataQuality | None = None
```

- [ ] **Step 4: 运行测试 + 重新生成类型**

Run:
```bash
python -m pytest tests/test_schema.py -q
cd frontend && npm run gen:types
```
Expected: pytest PASS;`gen:types` 重新生成 `frontend/src/types/analysis.ts`(含 `ProjectPmis`/`DataQuality`),`npm run typecheck` 无错。

- [ ] **Step 5: 提交**

```bash
git add schema.py tests/test_schema.py schema.json frontend/src/types/analysis.ts
git commit -m "feat(S1): schema 增 ProjectPmis/DataQuality + 重生成前端类型"
```

---

### Task 7: preprocess_data.py 集成(join + 入 final_data)

**Files:**
- Modify: `preprocess_data.py:1124-1151`

- [ ] **Step 1: 在 main() 处理跟进记录之后、构建 final_data 之前插入 PMIS 摄取**

在 `preprocess_data.py` 的 `# === 10. 构建最终数据 ===`(约 1133 行)**之前**插入:

```python
    # === 9b. 摄取 PMIS 项目域(在建全量 + 已关闭∩回款),按 projectId join ===
    print("[INFO] 摄取 PMIS 项目域数据...")
    import pmis
    pmis_dir = os.path.join(BASE_DIR, "input", config.PMIS_DIRNAME)
    pay_projects = [{"projectId": n.get("projectId", ""), "projectName": n.get("projectName", "")}
                    for n in all_nodes]
    # 回款侧脏值:实际回款比例 > 1
    dirty = []
    for n in all_nodes:
        rnum = _get_ratio_num(n.get("actualPaymentRatio"))
        if rnum is not None and rnum > 1:
            dirty.append({"type": "回款比例>1", "projectId": n.get("projectId", ""),
                          "field": "actualPaymentRatio", "value": n.get("actualPaymentRatio")})
    project_pmis, data_quality = pmis.load_project_pmis(pmis_dir, pay_projects)
    data_quality["dirty"] = dirty
    if data_quality["summary"]["pmisProvided"]:
        print(f"  [OK] PMIS 命中在建 {data_quality['summary']['matchedActive']} / "
              f"已关闭 {data_quality['summary']['matchedClosed']} / 未匹配 {data_quality['summary']['unmatched']}")
    else:
        print("  [WARN] 未提供 PMIS 数据(input/pmis/ 为空),数据治理视图将提示去获取")
```

- [ ] **Step 2: 在 `final_data` 字典(约 1134-1151)末尾追加两键**

把 `final_data` 的 `"followupRecords": followup_records,` 之后追加:

```python
        "projectPmis": project_pmis,
        "dataQuality": data_quality,
```

- [ ] **Step 3: 运行集成(无 PMIS 时优雅降级)+ 全套 pytest**

Run:
```bash
python -m pytest -q
```
Expected: 全绿(现有集成测试 `test_pipeline_integration.py` 在无 input/pmis/ 时仍通过——`final_data` 含 `dataQuality.summary.pmisProvided=False`,schema 校验通过)。

- [ ] **Step 4: 提交**

```bash
git add preprocess_data.py
git commit -m "feat(S1): preprocess 集成 PMIS join,入 projectPmis/dataQuality"
```

---

### Task 8: pmis_download.py(在线下载,frozen/dev)

**Files:**
- Create: `pmis_download.py`
- Create: `tests/test_pmis_download.py`

- [ ] **Step 1: 写失败测试(链接读取 + 下载封装可注入)**

创建 `tests/test_pmis_download.py`:

```python
# -*- coding: utf-8 -*-
import json
import os
import pmis_download as D


def test_plan_downloads_maps_links_to_files(tmp_path):
    links = {"项目中心.xlsx": "http://x/a", "项目基础信息数据.xlsx": "http://x/b"}
    plan = D.plan_downloads(links)
    # 只下载已配置且文件名属于 PMIS 七表的链接
    names = {p["name"] for p in plan}
    assert "项目中心.xlsx" in names and "项目基础信息数据.xlsx" in names


def test_run_downloads_uses_injected_fetch(tmp_path):
    calls = []
    def fake_fetch(url, dest):
        calls.append((url, dest))
        with open(dest, "wb") as f:
            f.write(b"x")
    links = {"项目中心.xlsx": "http://x/a"}
    ok = D.run_downloads(links, str(tmp_path), fetch=fake_fetch)
    assert ok == 1
    assert os.path.exists(os.path.join(str(tmp_path), "项目中心.xlsx"))
    assert calls and calls[0][0] == "http://x/a"
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_pmis_download.py -q`
Expected: FAIL(`No module named 'pmis_download'`)

- [ ] **Step 3: 实现 pmis_download.py**

```python
# pmis_download.py
"""PMIS 在线下载:按持久化链接把七个文件下载到 input/pmis/。
进度用 [INFO]/[OK]/[ERROR] 标记输出,供 server 解析为 SSE。
fetch 可注入便于测试;默认用 urllib(标准库,无新依赖)。"""
from __future__ import annotations
import os
import sys
from typing import Callable, Dict, List

import config

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

_ALL_PMIS_NAMES = set(config.PMIS_FILES_ACTIVE.values()) | set(config.PMIS_FILES_CLOSED.values())


def plan_downloads(links: Dict[str, str]) -> List[Dict[str, str]]:
    """links: 文件名→URL。只保留属于 PMIS 七表且 URL 非空的项。"""
    return [{"name": name, "url": url} for name, url in links.items()
            if name in _ALL_PMIS_NAMES and url and str(url).strip()]


def _default_fetch(url: str, dest: str) -> None:
    import urllib.request
    with urllib.request.urlopen(url, timeout=60) as resp, open(dest, "wb") as f:
        f.write(resp.read())


def run_downloads(links: Dict[str, str], pmis_dir: str,
                  fetch: Callable[[str, str], None] = _default_fetch) -> int:
    os.makedirs(pmis_dir, exist_ok=True)
    plan = plan_downloads(links)
    ok = 0
    print(f"[INFO] 计划下载 {len(plan)} 个 PMIS 文件...")
    for item in plan:
        dest = os.path.join(pmis_dir, item["name"])
        try:
            fetch(item["url"], dest)
            ok += 1
            print(f"[OK] 已下载 {item['name']}")
        except Exception as e:  # noqa: BLE001
            print(f"[ERROR] 下载失败 {item['name']}: {e}")
    print(f"[OK] PMIS 下载完成 {ok}/{len(plan)}")
    return ok


def load_links(links_path: str) -> Dict[str, str]:
    import json
    if os.path.exists(links_path):
        with open(links_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("links", {}) if isinstance(data, dict) else {}
    return {}


def main():
    """frozen/dev 进程内或子进程入口:读 data/pmis_links.json → 下载到 input/pmis/。"""
    links_path = os.path.join(BASE_DIR, "data", "pmis_links.json")
    pmis_dir = os.path.join(BASE_DIR, "input", config.PMIS_DIRNAME)
    run_downloads(load_links(links_path), pmis_dir)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_pmis_download.py -q`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add pmis_download.py tests/test_pmis_download.py
git commit -m "feat(S1): pmis_download 在线下载(urllib,fetch 可注入)"
```

---

### Task 9: server.py PMIS 端点(链接读写 + 下载 SSE,frozen/dev)

**Files:**
- Modify: `server.py`(do_GET/do_POST 路由 + 三个 handler + run_pmis_download)

- [ ] **Step 1: 注册路由**

在 `server.py` `do_GET`(约 304 行 `handle_followup_sync_status` 分支后)追加:

```python
        elif parsed.path == '/api/pmis/links':
            self.handle_pmis_links_get()
        elif parsed.path == '/api/pmis/download':
            self.handle_pmis_download()
```

在 `do_POST`(约 345 行 followup/update 分支后)追加:

```python
        elif parsed.path == '/api/pmis/links':
            self.handle_pmis_links_post()
```

- [ ] **Step 2: 实现 handler(链接读写)**

在 `server.py` 的 `PaymentHandler` 类中(紧邻 followup handler)新增。链接持久化文件 `data/pmis_links.json`,路径基于 `BASE_DIR`:

```python
    def _pmis_links_path(self):
        return os.path.join(BASE_DIR, 'data', 'pmis_links.json')

    def handle_pmis_links_get(self):
        path = self._pmis_links_path()
        links = {}
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    links = json.load(f).get('links', {})
            except Exception:
                links = {}
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"links": links}, ensure_ascii=False).encode('utf-8'))

    def handle_pmis_links_post(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else b'{}'
        try:
            payload = json.loads(body.decode('utf-8'))
            links = payload.get('links', {})
        except Exception:
            links = {}
        os.makedirs(os.path.join(BASE_DIR, 'data'), exist_ok=True)
        with open(self._pmis_links_path(), 'w', encoding='utf-8') as f:
            json.dump({"links": links}, f, ensure_ascii=False, indent=2)
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True}).encode('utf-8'))
```

- [ ] **Step 3: 实现下载 SSE(复用 sync 的状态机 + frozen/dev 双路径)**

在 `server.py` 顶部状态区(`sync_state` 附近)加 `pmis_state = {"running": False, "progress": 0, "message": ""}`。新增模块级 `run_pmis_download()`(仿 `run_sync` 结构,**frozen/dev 双路径**):

```python
def run_pmis_download():
    global pmis_state
    try:
        pmis_state = {"running": True, "progress": 10, "message": "开始下载 PMIS 数据..."}
        script, cwd = _find_script("pmis_download.py")
        if not script:
            pmis_state = {"running": False, "progress": 0, "message": "pmis_download.py 不存在"}
            return
        if getattr(sys, 'frozen', False):
            # 打包模式:进程内直接执行
            _run_script_direct(script, 'pmis_download', cwd)
        else:
            # 开发模式:子进程,解析 [OK]/[ERROR] 进度
            proc = subprocess.Popen([sys.executable, script], cwd=cwd,
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                    text=True, encoding='utf-8', errors='replace')
            for line in proc.stdout:
                parsed = classify_progress_line(line)
                if parsed:
                    _level, text = parsed
                    pmis_state = {"running": True, "progress": min(pmis_state["progress"] + 10, 90),
                                  "message": text}
            proc.wait()
        # 下载后立即重跑预处理,使 PMIS 入 analysis_data
        preprocess_script, pcwd = _find_script("preprocess_data.py")
        if preprocess_script:
            pmis_state = {"running": True, "progress": 92, "message": "重新预处理(并入项目域)..."}
            if getattr(sys, 'frozen', False):
                _run_script_direct(preprocess_script, 'preprocess_data', pcwd)
            else:
                subprocess.run([sys.executable, preprocess_script], cwd=pcwd)
        pmis_state = {"running": False, "progress": 100, "message": "PMIS 下载并预处理完成"}
    except Exception as e:  # noqa: BLE001
        logger.error(f"PMIS 下载失败: {e}")
        pmis_state = {"running": False, "progress": 0, "message": f"下载失败: {e}"}
```

handler `handle_pmis_download`(SSE,仿 `handle_sync` 的流式循环):

```python
    def handle_pmis_download(self):
        global pmis_state
        if pmis_state.get("running"):
            self._json_response(pmis_state); return
        pmis_state = {"running": True, "progress": 0, "message": "启动 PMIS 下载..."}
        threading.Thread(target=run_pmis_download, daemon=True).start()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        while True:
            self.wfile.write(f"data: {json.dumps(pmis_state)}\n\n".encode('utf-8'))
            self.wfile.flush()
            if pmis_state["progress"] >= 100 or not pmis_state["running"]:
                break
            time.sleep(0.5)
```

(若 `_json_response` 不存在,用 send_response(200)+json.dumps 写回,与现有 handler 一致。)

- [ ] **Step 4: 语法编译 + 启动冒烟**

Run:
```bash
python -m py_compile server.py
```
Expected: 无错。手动:`python server.py` 启动,GET `/api/pmis/links` 返回 `{"links":{}}`,不报错。

- [ ] **Step 5: 提交**

```bash
git add server.py
git commit -m "feat(S1): server PMIS 端点(链接读写 + 下载 SSE,frozen/dev 双路径)"
```

---

### Task 10: 前端 lib/governance.ts(视图模型纯函数)+ 导出工具

**Files:**
- Create: `frontend/src/lib/governance.ts`
- Create: `frontend/src/lib/governance.test.ts`
- Create: `frontend/src/lib/exportXlsx.ts`
- Create: `frontend/src/lib/exportXlsx.test.ts`

- [ ] **Step 1: 写失败测试(governance)**

创建 `frontend/src/lib/governance.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { coverageColor, verdictLabel } from './governance'

describe('coverageColor', () => {
  it('maps thresholds to tokens', () => {
    expect(coverageColor(0.8)).toBe('var(--c-paid)')
    expect(coverageColor(0.5)).toBe('var(--c-pending)')
    expect(coverageColor(0.1)).toBe('var(--danger)')
  })
})

describe('verdictLabel', () => {
  it('maps verdict to symbol text', () => {
    expect(verdictLabel('green')).toBe('可用')
    expect(verdictLabel('yellow')).toBe('部分')
    expect(verdictLabel('red')).toBe('不足')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/lib/governance.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 governance.ts**

创建 `frontend/src/lib/governance.ts`:

```ts
export function coverageColor(pct: number): string {
  if (pct >= 0.7) return 'var(--c-paid)'
  if (pct >= 0.3) return 'var(--c-pending)'
  return 'var(--danger)'
}

export function verdictLabel(v: string): string {
  return v === 'green' ? '可用' : v === 'yellow' ? '部分' : '不足'
}
```

- [ ] **Step 4: 写失败测试(exportXlsx)**

创建 `frontend/src/lib/exportXlsx.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}))

import * as XLSX from 'xlsx'
import { exportRows } from './exportXlsx'

describe('exportRows', () => {
  it('builds a sheet and writes a file', () => {
    exportRows('未匹配.xlsx', [{ a: 1 }])
    expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith([{ a: 1 }])
    expect(XLSX.writeFile).toHaveBeenCalled()
  })
  it('no-ops on empty rows', () => {
    ;(XLSX.writeFile as any).mockClear()
    exportRows('x.xlsx', [])
    expect(XLSX.writeFile).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5: 实现 exportXlsx.ts**

创建 `frontend/src/lib/exportXlsx.ts`:

```ts
import * as XLSX from 'xlsx'

/** 把行数组导出为 xlsx 下载。空数组不动作。 */
export function exportRows(filename: string, rows: Record<string, any>[]): void {
  if (!rows || rows.length === 0) return
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}
```

- [ ] **Step 6: 运行确认通过**

Run: `cd frontend && npx vitest run src/lib/governance.test.ts src/lib/exportXlsx.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add frontend/src/lib/governance.ts frontend/src/lib/governance.test.ts frontend/src/lib/exportXlsx.ts frontend/src/lib/exportXlsx.test.ts
git commit -m "feat(S1): 前端 governance 视图模型 + xlsx 导出工具"
```

---

### Task 11: DataQualityView(数据治理视图)+ 路由 + 导航

**Files:**
- Create: `frontend/src/views/DataQualityView.vue`
- Create: `frontend/src/views/DataQualityView.test.ts`
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/nav.ts`

- [ ] **Step 1: 写失败测试**

创建 `frontend/src/views/DataQualityView.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useDataStore } from '@/stores/data'
import DataQualityView from './DataQualityView.vue'

function seed(dq: any) {
  const store = useDataStore()
  ;(store as any).data = {
    meta: {}, dashboard: {}, summary: {}, rawNodes: [],
    projectOverview: { projects: [], columns: [] }, dataQuality: dq,
  }
}

describe('DataQualityView', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('shows empty guide when PMIS not provided', () => {
    seed({ summary: { pmisProvided: false }, themes: [], unmatched: [], backfill: [], conflicts: [], dirty: [] })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('未提供 PMIS')
  })

  it('renders scorecard + unmatched count when provided', () => {
    seed({
      summary: { pmisProvided: true, joinRate: 0.98, matchedActive: 462, matchedClosed: 158, unmatched: 8 },
      themes: [{ theme: '成本预算', verdict: 'yellow', coveragePct: 0.5, fields: [] }],
      unmatched: [{ projectId: 'SF-1', projectName: '甲', kind: 'SF售前' }],
      backfill: [], conflicts: [], dirty: [],
    })
    const w = mount(DataQualityView)
    expect(w.text()).toContain('98')
    expect(w.text()).toContain('成本预算')
    expect(w.find('[data-test="unmatched-count"]').text()).toContain('1')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/views/DataQualityView.test.ts`
Expected: FAIL(组件不存在)

- [ ] **Step 3: 实现 DataQualityView.vue**

创建 `frontend/src/views/DataQualityView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useDataStore } from '@/stores/data'
import { coverageColor, verdictLabel } from '@/lib/governance'
import { exportRows } from '@/lib/exportXlsx'

const data = useDataStore()
onMounted(() => { if (!data.data) data.load() })

const dq = computed(() => (data.data as any)?.dataQuality ?? null)
const provided = computed(() => !!dq.value?.summary?.pmisProvided)
const themes = computed(() => dq.value?.themes ?? [])
const unmatched = computed(() => dq.value?.unmatched ?? [])
const backfill = computed(() => dq.value?.backfill ?? [])
const conflicts = computed(() => dq.value?.conflicts ?? [])
const dirty = computed(() => dq.value?.dirty ?? [])

function pctTxt(n: number) { return Math.round((n ?? 0) * 100) + '%' }
function exportUnmatched() { exportRows('PMIS未匹配清单.xlsx', unmatched.value) }
function exportBackfill() {
  exportRows('PMIS回填待办.xlsx', backfill.value.map((b: any) => ({
    项目编号: b.projectId, 项目名称: b.projectName, 缺失字段: (b.missingFields || []).join('、'),
  })))
}
</script>

<template>
  <div class="dq-view">
    <h2 class="dq-title">数据治理</h2>
    <div v-if="!provided" class="dq-empty">
      未提供 PMIS 数据。请到「数据管理」页录入下载链接并下载,或把 PMIS 七个 xlsx 放入 input/pmis/ 后重新同步。
    </div>
    <template v-else>
      <div class="dq-cards">
        <div class="dq-card"><div class="dq-k">匹配率</div><div class="dq-v">{{ pctTxt(dq.summary.joinRate) }}</div></div>
        <div class="dq-card"><div class="dq-k">命中在建</div><div class="dq-v">{{ dq.summary.matchedActive }}</div></div>
        <div class="dq-card"><div class="dq-k">命中已关闭</div><div class="dq-v">{{ dq.summary.matchedClosed }}</div></div>
        <div class="dq-card"><div class="dq-k">未匹配</div><div class="dq-v" data-test="unmatched-count">{{ unmatched.length }}</div></div>
      </div>

      <h3 class="dq-h">主题覆盖率</h3>
      <div class="dq-themes">
        <div v-for="t in themes" :key="t.theme" class="dq-theme">
          <span class="dq-theme-name">{{ t.theme }}</span>
          <span class="dq-theme-bar"><i :style="{ width: pctTxt(t.coveragePct), background: coverageColor(t.coveragePct) }"></i></span>
          <span class="dq-theme-val">{{ pctTxt(t.coveragePct) }} · {{ verdictLabel(t.verdict) }}</span>
        </div>
      </div>

      <h3 class="dq-h">未匹配清单({{ unmatched.length }}) <button class="dq-exp" @click="exportUnmatched">导出</button></h3>
      <table class="dq-tbl"><thead><tr><th>项目编号</th><th>项目名称</th><th>类型</th></tr></thead>
        <tbody><tr v-for="u in unmatched" :key="u.projectId"><td>{{ u.projectId }}</td><td>{{ u.projectName }}</td><td>{{ u.kind }}</td></tr></tbody>
      </table>

      <h3 class="dq-h">回填待办({{ backfill.length }}) <button class="dq-exp" @click="exportBackfill">导出</button></h3>
      <table class="dq-tbl"><thead><tr><th>项目编号</th><th>项目名称</th><th>缺失字段</th></tr></thead>
        <tbody><tr v-for="b in backfill" :key="b.projectId"><td>{{ b.projectId }}</td><td>{{ b.projectName }}</td><td>{{ (b.missingFields || []).join('、') }}</td></tr></tbody>
      </table>

      <details class="dq-fold"><summary>口径冲突告警({{ conflicts.length }})</summary>
        <ul><li v-for="(c, i) in conflicts" :key="i"><b>{{ c.column }}</b> — {{ c.issue }} → {{ c.recommendation }}</li></ul>
      </details>
      <details class="dq-fold"><summary>脏值告警({{ dirty.length }})</summary>
        <ul><li v-for="(d, i) in dirty" :key="i">{{ d.type }}:{{ d.projectId }} {{ d.field }}={{ d.value }}</li></ul>
      </details>
    </template>
  </div>
</template>

<style scoped>
.dq-view { padding: 16px; }
.dq-title { font-size: var(--fs-5); margin: 0 0 12px; color: var(--txt); }
.dq-empty { padding: 32px; text-align: center; color: var(--mut); background: var(--card); border: 1px solid var(--line); border-radius: 8px; }
.dq-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
.dq-card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.dq-k { font-size: var(--fs-1); color: var(--mut); }
.dq-v { font-size: var(--fs-4); font-weight: 700; color: var(--txt); }
.dq-h { font-size: var(--fs-2); color: var(--txt); margin: 18px 0 8px; }
.dq-themes { display: flex; flex-direction: column; gap: 8px; }
.dq-theme { display: grid; grid-template-columns: 100px 1fr 120px; align-items: center; gap: 10px; }
.dq-theme-name { color: var(--sub); font-size: var(--fs-1); }
.dq-theme-bar { height: 10px; background: var(--card2); border-radius: 5px; overflow: hidden; }
.dq-theme-bar i { display: block; height: 100%; }
.dq-theme-val { font-size: var(--fs-1); color: var(--sub); }
.dq-exp { font-size: var(--fs-1); margin-left: 8px; cursor: pointer; background: var(--accent); color: var(--on-accent); border: none; border-radius: 6px; padding: 2px 10px; }
.dq-tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-1); }
.dq-tbl th, .dq-tbl td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; color: var(--txt); }
.dq-tbl th { background: var(--card2); color: var(--sub); }
.dq-fold { margin-top: 14px; color: var(--sub); }
</style>
```

- [ ] **Step 4: 注册路由 + 导航**

`frontend/src/router/index.ts`:加 import 与路由项:

```ts
import DataQualityView from '@/views/DataQualityView.vue'
```
在 `routes` 中 `/data` 之后加:
```ts
    { path: '/governance', name: 'governance', component: DataQualityView, meta: { title: '数据治理' } },
```

`frontend/src/nav.ts`:在 `TOOL_LINKS` 中"数据管理"之后加:
```ts
  { label: '数据治理', to: '/governance' },
```

- [ ] **Step 5: 运行确认通过 + typecheck**

Run: `cd frontend && npx vitest run src/views/DataQualityView.test.ts && npm run typecheck`
Expected: PASS;typecheck 0 错误。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/views/DataQualityView.vue frontend/src/views/DataQualityView.test.ts frontend/src/router/index.ts frontend/src/nav.ts
git commit -m "feat(S1): 数据治理视图 + 路由 + 导航"
```

---

### Task 12: 数据管理页 PMIS 区块(链接录入 + 下载 SSE)

**Files:**
- Create: `frontend/src/composables/usePmisSync.ts`
- Create: `frontend/src/composables/usePmisSync.test.ts`
- Modify: `frontend/src/views/DataView.vue`(新增 PMIS 区块)

- [ ] **Step 1: 写失败测试(composable)**

创建 `frontend/src/composables/usePmisSync.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePmisSync } from './usePmisSync'

describe('usePmisSync', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('loads links via GET /api/pmis/links', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ links: { 'a.xlsx': 'u' } }) })) as any)
    const s = usePmisSync()
    await s.loadLinks()
    expect(s.links.value).toEqual({ 'a.xlsx': 'u' })
  })

  it('saves links via POST', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }))
    vi.stubGlobal('fetch', fetchMock as any)
    const s = usePmisSync()
    s.links.value = { 'a.xlsx': 'u' }
    await s.saveLinks()
    expect(fetchMock).toHaveBeenCalledWith('/api/pmis/links', expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/composables/usePmisSync.test.ts`
Expected: FAIL(模块不存在)

- [ ] **Step 3: 实现 usePmisSync.ts**

创建 `frontend/src/composables/usePmisSync.ts`(七个文件名常量 + 链接读写 + SSE 下载,SSE 仿现有 `useCloudSync` 模式):

```ts
import { ref } from 'vue'

export const PMIS_FILE_NAMES = [
  '项目中心.xlsx', '项目基础信息数据.xlsx', '项目状态信息数据.xlsx', '项目风险数据.xlsx',
  '项目中心-已关闭.xlsx', '项目基础信息数据-已关闭.xlsx', '项目状态信息数据-已关闭.xlsx',
]

export function usePmisSync() {
  const links = ref<Record<string, string>>({})
  const progress = ref(0)
  const message = ref('')
  const running = ref(false)

  async function loadLinks() {
    const res = await fetch('/api/pmis/links')
    if (res.ok) links.value = (await res.json()).links ?? {}
  }
  async function saveLinks() {
    await fetch('/api/pmis/links', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: links.value }),
    })
  }
  async function download() {
    running.value = true; progress.value = 0
    await saveLinks()
    const res = await fetch('/api/pmis/download')
    const reader = res.body?.getReader()
    if (!reader) { running.value = false; return }
    const dec = new TextDecoder()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (const line of dec.decode(value).split('\n')) {
        const t = line.startsWith('data:') ? line.slice(5).trim() : ''
        if (!t) continue
        try {
          const s = JSON.parse(t)
          progress.value = s.progress; message.value = s.message; running.value = s.running
        } catch { /* 跳过半包 */ }
      }
    }
    running.value = false
  }
  return { links, progress, message, running, loadLinks, saveLinks, download, PMIS_FILE_NAMES }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd frontend && npx vitest run src/composables/usePmisSync.test.ts`
Expected: PASS

- [ ] **Step 5: 在 DataView.vue 增 PMIS 区块**

在 `frontend/src/views/DataView.vue` 的 `<script setup>` 引入并在模板加一个区块(七个链接输入 + 进度 + 下载按钮)。脚本:

```ts
import { onMounted } from 'vue'
import { usePmisSync } from '@/composables/usePmisSync'
const pmis = usePmisSync()
onMounted(() => { pmis.loadLinks() })
```

模板(放在数据管理页合适位置,沿用页面现有卡片/分区样式 class):

```vue
<section class="dv-section">
  <h3>PMIS 项目域数据</h3>
  <p class="dv-hint">录入七个文件的下载链接后点"下载并刷新";或离线把七个 xlsx 放入 input/pmis/ 再做同步。</p>
  <div v-for="name in pmis.PMIS_FILE_NAMES" :key="name" class="dv-pmis-row">
    <label>{{ name }}</label>
    <input v-model="pmis.links.value[name]" type="text" placeholder="下载链接(可空)" />
  </div>
  <button :disabled="pmis.running.value" @click="pmis.download()">下载并刷新 PMIS</button>
  <div v-if="pmis.running.value || pmis.progress.value > 0" class="dv-pmis-progress">
    {{ pmis.progress.value }}% — {{ pmis.message.value }}
  </div>
</section>
```

(class 名沿用 DataView 现有分区样式;如无则补少量 scoped CSS,用 token。)

- [ ] **Step 6: typecheck + 该视图测试不回归**

Run: `cd frontend && npm run typecheck && npx vitest run src/views/DataView`
Expected: typecheck 0 错误;DataView 现有测试通过(新增区块不破坏既有断言)。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/composables/usePmisSync.ts frontend/src/composables/usePmisSync.test.ts frontend/src/views/DataView.vue
git commit -m "feat(S1): 数据管理页 PMIS 区块(链接录入 + 下载 SSE)"
```

---

### Task 13: 全量验证 + 版本 + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 跑完整 verify.sh**

Run: `bash verify.sh`
Expected: 末尾通过(py_compile + ruff + pytest + 前端 typecheck/vitest/build 全绿)。若 ruff 报 `pmis.py`/`pmis_download.py` 风格问题,按现有 `ruff.toml` 规则修正(如未用变量、import 顺序)。

- [ ] **Step 2: 手动端到端冒烟**

把 PMIS 七个 xlsx 放入 `input/pmis/`,`python server.py` 后跑一次同步/导入(或直接 `python preprocess_data.py`),浏览器开 `/governance`:
- 记分卡匹配率约 98%、命中在建≈462 / 已关闭≈158 / 未匹配≈8;
- 主题覆盖率红黄绿合理;未匹配/回填可导出 xlsx;
- 清空 `input/pmis/` 再跑 → `/governance` 显"未提供 PMIS",回款各页正常(主流程不受影响)。

- [ ] **Step 3: 版本号 + PROGRESS**

`frontend/src/version.ts` 升次版本:

```ts
export const APP_VERSION = 'V6.1.0'
export const RELEASE_DATE = '2026-06-09'
```

`PROGRESS.md` 进度记录处追加一行:

```
- S1 双域数据地基完成:PMIS 七表(在建+已关闭)摄取 + projectId join(覆盖 98%,未匹配 8 全 SF)+ projectPmis/dataQuality 入库 + 数据治理视图(记分卡/未匹配/回填/告警,可导出)+ PMIS 在线下载/离线放置。后续 P 项目域看板、S2 回款×项目详情、S3 多角色看板。
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "docs(S1): 版本 V6.1.0 + PROGRESS 记录双域数据地基完成"
```

---

## Self-Review

**1. Spec coverage(对照 spec 各节):**
- 在线下载 + 离线放置 → Task 8(下载)+ Task 9(端点)+ Task 12(录入/触发);离线=放入 input/pmis/ 由 Task 5/7 读取 ✓
- 解析七表 + join(在建全量 + 已关闭∩回款)→ Task 2/3/5 ✓
- 自算派生(消耗比/超支/风险聚合/完工)→ Task 2/3 ✓
- projectPmis 入库 → Task 3/6/7 ✓
- dataQuality(覆盖率/未匹配/回填/冲突/脏值)→ Task 4/7 ✓
- schema + 前端类型同源 → Task 6 ✓
- 数据治理视图 + 导出 → Task 10/11 ✓
- 优雅降级(PMIS 缺失不阻断回款)→ Task 5/7(pmisProvided=False)+ Task 11(空态)✓
- frozen/dev 双路径 → Task 8(BASE_DIR)+ Task 9(run_pmis_download 双分支)✓
- 不做:项目域看板/历史/SF映射/节点合并 → 未列入任务 ✓
- 测试 TDD → 每个后端/前端单元均先写失败测试 ✓

**2. Placeholder scan:** 无 TBD/TODO;每个改动给出完整代码与可执行命令及预期。Task 12 的 DataView 模板因需嵌入既有页面,给了完整区块代码 + class 复用说明(非占位)。✓

**3. Type consistency:**
- `projectPmis[pid]` 结构(cost/progress/risk/status/customer)在 pmis.py `_assemble`、schema `ProjectPmis`、前端 view 三处一致 ✓
- `dataQuality` 键(summary/themes/unmatched/backfill/conflicts/dirty)在 `compute_data_quality`、schema `DataQuality`、view 三处一致 ✓
- `summary` 字段(pmisProvided/joinRate/matchedActive/matchedClosed/unmatched)三处一致 ✓
- `_make_xlsx` 签名在 Task 5 Step 2 统一为 `(dir, name, headers, rows)`,并回改 Task 2 调用 ✓
- 函数名 `load_project_pmis`/`build_project_pmis`/`compute_data_quality`/`derive_cost`/`derive_risk`/`read_pmis_sheet` 全程一致 ✓
- 前端 `coverageColor`/`verdictLabel`/`exportRows`/`usePmisSync` 命名前后一致 ✓
