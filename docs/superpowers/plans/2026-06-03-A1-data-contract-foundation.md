# Plan A1：数据契约与配置地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为重构建立后端的契约与配置地基——集中硬编码到 `config.py`、用 pydantic 在 `schema.py` 固化数据契约、抽出关键纯函数（`assign_tier`/`compute_node_status`）并加测试、让 `preprocess_data.py` 输出经校验的 `data/analysis_data.json`，并能导出 JSON Schema 供前端生成 TS 类型。

**Architecture:** 保留现有 Python 数据管道；以"纯函数 + 显式契约 + 校验后输出"为原则做行为保持式重构。本计划是整体重构的第一块（A1），自成闭环、可独立测试；后续 A2（server/fetch/write 加固）、B（前端）、C（集成打包）各自单独成计划。

**Tech Stack:** Python 3.8+、pydantic v2、pytest、ruff（已接入 `verify.sh`）。

参考 spec：`docs/superpowers/specs/2026-06-03-payment-platform-refactor-design.md`

---

## File Structure

- Create: `config.py` — 集中常量（Sheet 名、tier 阈值与标签、Excel 序列号阈值、节点状态枚举）
- Create: `schema.py` — pydantic 数据契约模型 + JSON Schema 导出 + 校验后写 JSON 的辅助函数
- Modify: `preprocess_data.py` — 抽 `assign_tier`/`compute_node_status` 纯函数；替换内联逻辑；`main()` 改为输出经校验的 `analysis_data.json`
- Modify: `requirements.txt` — 增加 `pydantic`
- Create: `tests/test_config.py`、`tests/test_assign_tier.py`、`tests/test_compute_node_status.py`、`tests/test_schema.py`、`tests/test_pipeline_integration.py`、`tests/fixtures/payment_nodes_sample.json`
- Modify: `PROGRESS.md` — 标记 A1 完成项

约定：从项目根运行命令；`conftest.py` 已把根目录加入 `sys.path`，测试可直接 `import preprocess_data` / `config` / `schema`。

---

### Task 1: config.py 常量集中

**Files:**
- Create: `config.py`
- Test: `tests/test_config.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_config.py
import config


def test_tier_thresholds_and_labels():
    assert config.TIER_ABOVE_1M == 1_000_000
    assert config.TIER_ABOVE_500K == 500_000
    assert config.TIER_LABELS == ["100万以上", "50-100万", "50万以下"]


def test_node_statuses_complete():
    assert config.NODE_STATUSES == [
        "加资源可提前", "达到回款条件", "已提前回款",
        "已全额回款", "延期", "正常实施中",
    ]


def test_sheet_names():
    assert config.SHEET_PAYMENT_NODES == "项目回款节点（里程碑）清单"
    assert config.SHEET_PROJECT_OVERVIEW == "项目验收日期、回款条件信息收集"
    assert config.SHEET_FOLLOWUP == "项目回款跟进记录"


def test_excel_serial_range():
    assert config.EXCEL_SERIAL_MIN == 40000
    assert config.EXCEL_SERIAL_MAX == 60000
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_config.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'config'`）

- [ ] **Step 3: 写实现**

```python
# config.py
"""集中配置常量：消除散落在 preprocess_data.py 各处的硬编码。"""

# ── 云文档 Sheet 名 ──
SHEET_PAYMENT_NODES = "项目回款节点（里程碑）清单"
SHEET_PROJECT_OVERVIEW = "项目验收日期、回款条件信息收集"
SHEET_FOLLOWUP = "项目回款跟进记录"

# ── 金额分层阈值（元）与标签 ──
TIER_ABOVE_1M = 1_000_000
TIER_ABOVE_500K = 500_000
TIER_ABOVE_1M_LABEL = "100万以上"
TIER_MID_LABEL = "50-100万"
TIER_BELOW_500K_LABEL = "50万以下"
TIER_LABELS = [TIER_ABOVE_1M_LABEL, TIER_MID_LABEL, TIER_BELOW_500K_LABEL]

# ── Excel 序列号合理范围 ──
EXCEL_SERIAL_MIN = 40000
EXCEL_SERIAL_MAX = 60000

# ── 节点状态枚举（判定优先级顺序）──
STATUS_CAN_ADVANCE = "加资源可提前"
STATUS_REACHED = "达到回款条件"
STATUS_ADVANCE_PAID = "已提前回款"
STATUS_FULL_PAID = "已全额回款"
STATUS_DELAYED = "延期"
STATUS_ON_TIME = "正常实施中"
NODE_STATUSES = [
    STATUS_CAN_ADVANCE, STATUS_REACHED, STATUS_ADVANCE_PAID,
    STATUS_FULL_PAID, STATUS_DELAYED, STATUS_ON_TIME,
]
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_config.py -q`
Expected: PASS（4 passed）

- [ ] **Step 5: 提交**

```bash
git add config.py tests/test_config.py
git commit -m "feat(config): 集中 Sheet名/tier阈值/状态枚举常量"
```

---

### Task 2: assign_tier 纯函数 + 替换内联阈值

**Files:**
- Modify: `preprocess_data.py`（新增 `assign_tier`；替换 `main()` 957-964 内联阈值；grep 替换其余同款阈值）
- Test: `tests/test_assign_tier.py`

- [ ] **Step 1: 写失败测试**

```python
# tests/test_assign_tier.py
import preprocess_data as P


def test_above_1m_inclusive():
    assert P.assign_tier(1_500_000) == "100万以上"
    assert P.assign_tier(1_000_000) == "100万以上"


def test_mid_inclusive():
    assert P.assign_tier(800_000) == "50-100万"
    assert P.assign_tier(500_000) == "50-100万"


def test_below_500k():
    assert P.assign_tier(300_000) == "50万以下"
    assert P.assign_tier(0) == "50万以下"


def test_none_treated_as_zero():
    assert P.assign_tier(None) == "50万以下"
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_assign_tier.py -q`
Expected: FAIL（`AttributeError: module 'preprocess_data' has no attribute 'assign_tier'`）

- [ ] **Step 3: 写实现**

在 `preprocess_data.py` 顶部 import 区加入：

```python
import config
```

在工具函数区（如 `excel_serial_to_date` 之后）新增：

```python
def assign_tier(amount):
    """按项目金额（元）确定分层标签。None 视为 0。"""
    amt = amount if amount is not None else 0
    if amt >= config.TIER_ABOVE_1M:
        return config.TIER_ABOVE_1M_LABEL
    if amt >= config.TIER_ABOVE_500K:
        return config.TIER_MID_LABEL
    return config.TIER_BELOW_500K_LABEL
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_assign_tier.py -q`
Expected: PASS（4 passed）

- [ ] **Step 5: 替换 main() 中的内联阈值（957-964）**

将 `preprocess_data.py` 当前这段：

```python
        for node in nodes:
            amt = node.get("projectAmount", 0)
            if amt >= 1000000:
                node["tier"] = "100万以上"
            elif amt >= 500000:
                node["tier"] = "50-100万"
            else:
                node["tier"] = "50万以下"
```

替换为：

```python
        for node in nodes:
            node["tier"] = assign_tier(node.get("projectAmount", 0))
```

- [ ] **Step 6: 替换其余同款内联阈值**

Run: `python -c "import re,sys; print('hits'); " ` 之前先定位：
Run: `grep -nE "1000000|500000" preprocess_data.py`
对每一处用金额阈值判定 tier/amountTier 的 `if amt >= 1000000 ... elif ... >= 500000 ...` 块，替换为 `assign_tier(<金额变量>)`。若该处是计算 `amountTier` 字段，则赋值给对应字段。
（无其它命中则跳过本步。）

- [ ] **Step 7: 运行全部测试确认未回归**

Run: `python -m pytest -q`
Expected: PASS（含此前 41 + 新增用例）

- [ ] **Step 8: 提交**

```bash
git add preprocess_data.py tests/test_assign_tier.py
git commit -m "refactor(preprocess): 抽 assign_tier 纯函数并替换内联金额阈值"
```

---

### Task 3: compute_node_status 纯函数 + 接入

**Files:**
- Modify: `preprocess_data.py`（新增 `compute_node_status`；替换 `process_below100_nodes` 317-350 内联判定）
- Test: `tests/test_compute_node_status.py`

说明：这是**行为保持式**重构。新函数把原 317-350 的判定逐条搬入，并把 `datetime.now()` 改为可注入的 `now` 参数（便于测试）。

- [ ] **Step 1: 写失败测试**

```python
# tests/test_compute_node_status.py
from datetime import datetime
import preprocess_data as P

NOW = datetime(2026, 6, 3)


def call(**kw):
    base = dict(
        is_payment_related=True, can_advance=False, completion_pct=None,
        actual_ratio=None, is_milestone_achieved="", plan_date="", now=NOW,
    )
    base.update(kw)
    return P.compute_node_status(**base)


def test_not_payment_related_returns_empty():
    assert call(is_payment_related=False) == ("", 0)


def test_can_advance():
    assert call(can_advance=True, completion_pct=0.5, actual_ratio=0.5) == ("加资源可提前", 0)


def test_reached_condition():
    assert call(completion_pct=1.0, is_milestone_achieved="是", actual_ratio=0.5) == ("达到回款条件", 0)


def test_advance_paid_future_plan_fully_paid():
    assert call(plan_date="2026-12-01", actual_ratio=1.0) == ("已提前回款", 0)


def test_full_paid_when_not_future():
    assert call(plan_date="2026-01-01", actual_ratio=1.0) == ("已全额回款", 0)


def test_delayed_with_delay_days():
    status, delay = call(plan_date="2026-01-01", completion_pct=0.5, actual_ratio=0.0)
    assert status == "延期"
    assert delay == 153  # 2026-01-01 → 2026-06-03


def test_on_time_default():
    assert call(plan_date="2026-12-01", completion_pct=0.5, actual_ratio=0.0) == ("正常实施中", 0)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `python -m pytest tests/test_compute_node_status.py -q`
Expected: FAIL（`AttributeError: ... has no attribute 'compute_node_status'`）

- [ ] **Step 3: 写实现**

在 `preprocess_data.py` 工具函数区新增（保持与原 317-350 完全一致的分支顺序与条件）：

```python
def compute_node_status(*, is_payment_related, can_advance, completion_pct,
                        actual_ratio, is_milestone_achieved, plan_date, now):
    """计算回款节点状态与延期天数（行为同原 process_below100_nodes 内联逻辑）。

    completion_pct / actual_ratio 为 0~1 小数或 None；now 为参考时间（datetime）。
    返回 (nodeStatus, delayDays)。
    """
    if not is_payment_related:
        return "", 0

    cp = completion_pct
    ar = actual_ratio

    def _past(ds):
        if not ds or len(ds) < 10:
            return False
        try:
            return datetime.strptime(ds[:10], "%Y-%m-%d") < now
        except Exception:
            return False

    def _future(ds):
        if not ds or len(ds) < 10:
            return False
        try:
            return datetime.strptime(ds[:10], "%Y-%m-%d") > now
        except Exception:
            return False

    # 步骤1: 加资源可提前
    if can_advance and (cp is not None and cp < 1.0) and (ar is not None and ar < 1.0):
        return config.STATUS_CAN_ADVANCE, 0
    # 步骤2: 达到回款条件
    if (cp is not None and cp >= 1.0) and ("是" in str(is_milestone_achieved)) and (ar is None or ar < 1.0):
        return config.STATUS_REACHED, 0
    # 步骤3: 已提前回款
    if _future(plan_date) and (ar is not None and ar >= 1.0):
        return config.STATUS_ADVANCE_PAID, 0
    # 步骤4: 已全额回款
    if ar is not None and ar >= 1.0:
        return config.STATUS_FULL_PAID, 0
    # 步骤5: 延期
    if _past(plan_date) and (cp is None or cp < 1.0) and (ar is None or ar < 1.0):
        delay_days = 0
        if plan_date:
            try:
                plan_d = datetime.strptime(plan_date[:10], "%Y-%m-%d")
                delay_days = max(0, (now - plan_d).days)
            except Exception:
                pass
        return config.STATUS_DELAYED, delay_days
    # 步骤6: 正常实施中（兜底）
    return config.STATUS_ON_TIME, 0
```

- [ ] **Step 4: 运行测试确认通过**

Run: `python -m pytest tests/test_compute_node_status.py -q`
Expected: PASS（7 passed）

- [ ] **Step 5: 接入 process_below100_nodes（替换 317-350）**

将 `process_below100_nodes` 中从 `node_status = "正常实施中"  # 兜底` 到步骤6 `else: node_status = "正常实施中"` 的整段（当前 317-350）替换为：

```python
        node_status, delay_days = compute_node_status(
            is_payment_related=is_payment_related,
            can_advance=can_advance,
            completion_pct=completion_pct,
            actual_ratio=actual_ratio,
            is_milestone_achieved=is_milestone_achieved,
            plan_date=plan_date,
            now=datetime.now(),
        )
```

（其后构建 `node` 字典中 `"nodeStatus": node_status, "delayDays": delay_days` 保持不变。）

- [ ] **Step 6: 运行全部测试确认未回归**

Run: `python -m pytest -q`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add preprocess_data.py tests/test_compute_node_status.py
git commit -m "refactor(preprocess): 抽 compute_node_status 纯函数（now 可注入）并接入"
```

---

### Task 4: schema.py 数据契约（pydantic）

**Files:**
- Create: `schema.py`
- Modify: `requirements.txt`
- Test: `tests/test_schema.py`

- [ ] **Step 1: 安装 pydantic 并登记依赖**

Run: `python -m pip install "pydantic>=2"`
然后编辑 `requirements.txt`，在 `playwright>=1.40` 下一行加入：

```
pydantic>=2          # 数据契约校验（schema.py）
```

- [ ] **Step 2: 写失败测试**

```python
# tests/test_schema.py
import pytest
import schema


def _minimal_valid():
    return {
        "meta": {"lastUpdate": "2026-06-03 10:00", "totalProjects": 1, "totalPaymentNodes": 1},
        "dashboard": {
            "totalProjectCount": 1, "totalPaymentNodes": 1, "totalPaidNodes": 0,
        },
        "summary": {"100万以上": {"projectCount": 1}},
        "rawNodes": [
            {"projectId": "P1", "projectName": "测试", "tier": "100万以上",
             "isPaymentRelated": True, "nodeStatus": "延期"}
        ],
        "projectOverview": {"projects": [], "columns": []},
        "naguanMap": {}, "naguanExclude": {},
        "displayColumns": {}, "followupRecords": {},
    }


def test_valid_data_parses():
    obj = schema.AnalysisData.model_validate(_minimal_valid())
    assert obj.meta.totalProjects == 1
    assert obj.rawNodes[0].projectId == "P1"


def test_missing_top_level_key_fails():
    bad = _minimal_valid()
    del bad["dashboard"]
    with pytest.raises(Exception):
        schema.AnalysisData.model_validate(bad)


def test_wrong_type_on_core_field_fails():
    bad = _minimal_valid()
    bad["rawNodes"][0]["isPaymentRelated"] = "not-a-bool-like"
    with pytest.raises(Exception):
        schema.AnalysisData.model_validate(bad)


def test_extra_node_fields_allowed():
    data = _minimal_valid()
    data["rawNodes"][0]["someFutureField"] = "x"
    obj = schema.AnalysisData.model_validate(data)
    assert obj.rawNodes[0].projectId == "P1"
```

- [ ] **Step 3: 运行测试确认失败**

Run: `python -m pytest tests/test_schema.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'schema'`）

- [ ] **Step 4: 写实现**

首版采用 `extra="allow"`：契约约束核心字段与顶层结构，容忍 RawNode 的众多次要字段（避免首轮过脆）。

```python
# schema.py
"""数据契约（pydantic v2）：AnalysisData 是前后端共享的权威结构。

策略：首版重"结构 + 核心字段类型"，对节点的众多次要字段用 extra=allow 容纳，
后续可逐步收紧。preprocess_data.py 末尾用本模块校验输出。
"""
from __future__ import annotations

import json
from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(extra="allow")


class Meta(_Base):
    lastUpdate: str
    totalProjects: int
    totalPaymentNodes: int


class RawNode(_Base):
    projectId: str
    projectName: str = ""
    tier: str
    isPaymentRelated: bool
    nodeStatus: str = ""
    projectAmount: float = 0
    expectedPayment: float = 0
    actualPayment: float = 0
    delayDays: int = 0
    planDate: str = ""
    planMonth: str = ""
    followupRecords: List[Any] = []


class Dashboard(_Base):
    totalProjectCount: int
    totalPaymentNodes: int
    totalPaidNodes: int


class TierSummary(_Base):
    projectCount: int


class ProjectOverview(_Base):
    projects: List[Dict[str, Any]] = []
    columns: List[Dict[str, Any]] = []


class AnalysisData(_Base):
    meta: Meta
    dashboard: Dashboard
    summary: Dict[str, TierSummary]
    rawNodes: List[RawNode]
    projectOverview: ProjectOverview
    naguanMap: Dict[str, bool] = {}
    naguanExclude: Dict[str, bool] = {}
    displayColumns: Dict[str, Any] = {}
    followupRecords: Dict[str, Any] = {}


def validate_and_write_json(final_data: dict, output_dir: str) -> str:
    """用 AnalysisData 校验 final_data，校验通过后写出 analysis_data.json。
    返回输出文件路径。校验失败抛 pydantic.ValidationError。"""
    import os

    AnalysisData.model_validate(final_data)
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, "analysis_data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(final_data, f, ensure_ascii=False, indent=1)
    return out_path


def dump_json_schema(out_path: str) -> None:
    """导出 JSON Schema（供前端 json-schema-to-typescript 生成 TS 类型）。"""
    sch = AnalysisData.model_json_schema()
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(sch, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    dump_json_schema("schema.json")
    print("[OK] JSON Schema 已写出: schema.json")
```

- [ ] **Step 5: 运行测试确认通过**

Run: `python -m pytest tests/test_schema.py -q`
Expected: PASS（4 passed）

- [ ] **Step 6: 提交**

```bash
git add schema.py tests/test_schema.py requirements.txt
git commit -m "feat(schema): pydantic 数据契约 + 校验写JSON + JSON Schema 导出"
```

---

### Task 5: 管道集成测试（fixture → 节点 → 看板）

**Files:**
- Create: `tests/fixtures/payment_nodes_sample.json`
- Test: `tests/test_pipeline_integration.py`

说明：用最小脱敏样本验证 `process_below100_nodes` → `compute_dashboard` 的链路与关键数值。覆盖列名以现 `process_below100_nodes` 的 `row.get(...)` 为准。

- [ ] **Step 1: 创建 fixture**

```json
// tests/fixtures/payment_nodes_sample.json
{
  "name": "项目回款节点（里程碑）清单",
  "data": [
    ["项目编号","项目名称","项目金额","该节点计划完成时间","是否关联回款","关联回款比例","实际回款比例","是否增加资源是否可以提前完成里程碑计划","当前项目完成%","是否已达成里程碑","里程碑节点","项目经理L4部门"],
    ["P1","已全额回款项目","2000000","2025-01-10","是","1.0","1.0","否","1.0","是","终验款","北京服务组"],
    ["P2","延期项目","800000","2025-01-10","是","1.0","0","否","0.5","否","到货款","上海一服务组"],
    ["P3","不关联回款","300000","2025-01-10","否","","","否","","","实施","上海一服务组"]
  ]
}
```

- [ ] **Step 2: 写失败测试**

```python
# tests/test_pipeline_integration.py
import json
import os

import preprocess_data as P

FIX = os.path.join(os.path.dirname(__file__), "fixtures", "payment_nodes_sample.json")


def _load_fixture():
    with open(FIX, encoding="utf-8") as f:
        return json.load(f)


def test_process_nodes_assigns_tier_and_status():
    nodes = P.process_below100_nodes(_load_fixture(), "__temp__")
    # main() 会按金额重分配 tier，这里手动复用 assign_tier 验证
    for n in nodes:
        n["tier"] = P.assign_tier(n["projectAmount"])
    by_id = {n["projectId"]: n for n in nodes}

    assert by_id["P1"]["tier"] == "100万以上"
    assert by_id["P1"]["nodeStatus"] == "已全额回款"
    assert by_id["P2"]["tier"] == "50-100万"
    assert by_id["P2"]["nodeStatus"] == "延期"
    # 不关联回款：状态为空、金额为 0
    assert by_id["P3"]["isPaymentRelated"] is False
    assert by_id["P3"]["nodeStatus"] == ""
    assert by_id["P3"]["expectedPayment"] == 0


def test_compute_dashboard_basic_counts():
    nodes = P.process_below100_nodes(_load_fixture(), "__temp__")
    for n in nodes:
        n["tier"] = P.assign_tier(n["projectAmount"])
    dash = P.compute_dashboard(nodes)

    assert dash["totalProjectCount"] == 3          # P1/P2/P3 去重
    assert dash["totalPaymentNodes"] == 2          # P1/P2 关联回款
    assert dash["totalPaidNodes"] == 1             # 仅 P1 已全额回款
    assert dash["totalDelayed"] == 1               # 仅 P2 延期
```

- [ ] **Step 3: 运行测试确认失败/通过**

Run: `python -m pytest tests/test_pipeline_integration.py -q`
Expected: 全部 PASS（若失败，按断言信息核对 fixture 列名与 `process_below100_nodes` 的 `row.get` 键是否一致后修正 fixture）。

- [ ] **Step 4: 提交**

```bash
git add tests/fixtures/payment_nodes_sample.json tests/test_pipeline_integration.py
git commit -m "test(pipeline): 节点处理→看板汇总 集成测试 + 最小样本 fixture"
```

---

### Task 6: main() 输出经校验的 analysis_data.json

**Files:**
- Modify: `preprocess_data.py`（`main()` 落地段 1119-1126）

说明：老版本废弃，不再输出 `analysis_data.js`，改为校验后输出 `analysis_data.json`。

- [ ] **Step 1: 在 import 区加入 schema**

`preprocess_data.py` 顶部加入：

```python
import schema
```

- [ ] **Step 2: 替换落地段（当前 1119-1126）**

将：

```python
    # === 10. 保存 ===
    output_file = f"{OUTPUT_DIR}/analysis_data.js"
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("// 自动生成的分析数据V3 - 合并回款节点清单 + 项目验收日期Sheet\n")
        f.write(f"// 生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("var ANALYSIS_DATA = ")
        json.dump(final_data, f, ensure_ascii=False, indent=1)
        f.write(";\n")
```

替换为：

```python
    # === 10. 保存（校验后输出 JSON）===
    output_file = schema.validate_and_write_json(final_data, OUTPUT_DIR)
    print("[OK] 数据已通过 schema 校验")
```

- [ ] **Step 3: 编译检查**

Run: `python -m py_compile preprocess_data.py schema.py config.py`
Expected: 无输出（通过）

- [ ] **Step 4: 真实数据冒烟（若本机有 yundocs_data）**

Run: `python preprocess_data.py`
Expected: 末尾打印 `[OK] 数据已通过 schema 校验`，并在 `data/analysis_data.json` 生成文件。
（若本机无 `yundocs_data/` 样本，跳过本步——Task 5 已覆盖逻辑正确性；校验逻辑已在 Task 4 单测。）

- [ ] **Step 5: 提交**

```bash
git add preprocess_data.py
git commit -m "feat(preprocess): 输出经 schema 校验的 analysis_data.json（弃用 .js）"
```

---

### Task 7: 收尾——verify 全绿 + 更新 PROGRESS

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: 全量验证**

Run: `bash verify.sh`
Expected: `[PASS] verify.sh 全部通过 ✓`（py_compile + ruff + 全部 pytest 绿）

- [ ] **Step 2: 更新 PROGRESS.md**

在 `PROGRESS.md` 的 Backlog 中，将与本计划相关项标记完成，并追加一条：

```markdown
- [x] **A1** 数据契约与配置地基：config.py + schema.py（pydantic 契约/校验/JSON Schema 导出）+ assign_tier/compute_node_status 纯函数 + 管道集成测试 + preprocess 输出校验后的 analysis_data.json
```

同时把受 A1 覆盖的旧项（如 H-7 数据结构化、HX-6 计算层测试的一部分）标注"部分由 A1 完成"。

- [ ] **Step 3: 提交**

```bash
git add PROGRESS.md
git commit -m "docs(progress): 标记 A1 数据契约与配置地基完成"
```

---

## Self-Review

**Spec coverage（对照 spec 第 6 节 Phase A）：**
- config.py 消除硬编码 → Task 1 ✓
- schema.py pydantic 契约 + 校验 + JSON Schema 导出 → Task 4 ✓
- 抽纯函数 assign_tier / compute_node_status → Task 2/3 ✓
- preprocess 输出校验后的 JSON → Task 6 ✓
- compute_* 集成测试 + fixtures → Task 5 ✓
- **本计划未含**（属 Phase A 但拆到后续 A1.x/A2，spec 已说明分计划）：`server.py` 加固、`fetch`/`write_followup` 健壮性、`process_followup_records`/`load_sheet` 的完整 I/O 解耦、`count_nodes_by_status` 去重、TS 类型 codegen（待前端工程存在后在 Phase B 首个任务执行；A1 已产出 `schema.json` 作为其输入）。→ 记入 PROGRESS 的后续计划。

**Placeholder scan：** 无 TBD/TODO；每个代码步骤含完整代码；命令含预期输出。Task 2 Step 6 为条件步骤（grep 命中才执行），已说明"无命中则跳过"。

**Type consistency：** `assign_tier`、`compute_node_status(*, ..., now)`、`schema.AnalysisData` / `validate_and_write_json(final_data, output_dir)` / `dump_json_schema(out_path)` 在各任务中签名一致；`config.STATUS_*` 常量名与 `compute_node_status` 返回值一致；fixture 列名与 `process_below100_nodes` 的 `row.get` 键一致。

---

## Execution Handoff

见会话中执行方式选择。
