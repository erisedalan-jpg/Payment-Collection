# R1 数据地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 摄取 7 个新数据文件（里程碑两表/payment_records/profit direct+bridge/budget_data/delivery csv 切换）入 analysis_data.json，治理页源卡 5→9，项目清单增 3 列。版本 V7.7.0。

**Architecture:** 两个新后端模块（milestones.py 宽转长+优先级、profit.py CSV 科目树+流水），preprocess_data.py 9e 段编排并把统计并入 projectsQuality；schema 扩展后 gen:types；前端只动 governance.ts/projectList.ts/ProjectsView。母 spec：`docs/superpowers/specs/2026-06-12-R-batch-data-expansion-design.md` §2。

**Tech Stack:** Python 标准库 + openpyxl（里程碑表复用 `pmis.read_pmis_sheet`，**禁止 read_only**——PMIS 导出 dimension 元数据是假的，read_only 会把 3915 行截成 1 行，pmis.py:68 注释有前车之鉴）；CSV 用 `csv.DictReader` + utf-8-sig。分支 `feat/phase-r1-data-foundation`。

## 实测事实（写代码前必读）

- 里程碑两表：表头第 2 行，40 列，13 类里程碑列对（见 T1 MILESTONE_DEFS）；在建表 634 行（∩主域 610，含 SF 317），已结项表 3914 项目（供 relatedClosedId 查原项目）。payStage 可能多值含换行：`'终验款，95.00%\n\n质保金1，5.00%'`。
- CSV 全部 utf-8-sig；金额是 `'0.0'` 式浮点字符串。
- direct 列名模式 `本项目_{code}_{name}_{metric}`，metric∈{预算金额,实际发生,剩余预算,消耗率}；bridge 同构前缀 `桥接_`，另有顶部列 桥接SS项目编码/桥接SS预算收入/桥接SS预算成本/桥接SS预算毛利/桥接SS预算毛利率/桥接SS实际成本；budget 前缀 `预算_`，metric∈{预算金额,概算金额,核算金额}，其中预算金额列**全 0**（有值的是概算 605/607、核算 421/607）。
- **科目树不同构陷阱**：budget 的 2.3.x（产品线/服务体系/其他人工）、2.4.x（培训费/差旅费/业务招待费/本地交通/行政费/产品线直接成本）与 direct 的 2.3.x（产品线/交付部门/安服部门/服管部门/其他部门）、2.4.x（差旅费/业务招待费/本地交通/其他费用）**编码同名不同**；毛利编码 budget=3.1/3.2 vs direct=3/4。合并规则：**code+name 双键完全一致才合并**，毛利行显式别名 `{"3.1":"3","3.2":"4"}`（按 code 映射后仍须 name 含"毛利"校验）。
- direct 顶部汇总列：收入确认/预算收入/预算成本/实际成本/成本消耗率/预算毛利/实际毛利/预算毛利率/剩余预算。
- 体积护栏：所有新数据按 `keep_ids = 主域项目 ∪ relatedClosedId` 过滤；科目行 level>1 且全指标为 None/0 的丢弃（level==1 与 3/4 汇总行保留）。
- 项目级别/项目类型列在 PMIS 基础信息表（b）与状态表（s）都有，按 b 优先 s 兜底（与"项目状态"同模式，pmis.py:177-180 status 块）。
- `parse_pmis_money/parse_pmis_pct` 在 pmis.py 顶部可导入。

## 分级调度

| 任务 | 内容 | 难度 | 实现 | 审查 |
|---|---|---|---|---|
| T1 | milestones.py 宽转长+优先级（TDD） | 高 | opus | 主循环真实数据核验 |
| T2 | profit.py 科目树+budget 合并+回款流水（TDD） | 高（合并陷阱） | opus | 主循环真实数据核验 |
| T3 | config/pmis/projects(csv)/schema/preprocess 9e 集成 + gen:types + .spec | 高（集成+frozen） | opus | 主循环跑全管线核验 |
| T4 | 前端：治理源卡 5→9 + 清单 3 列 + 测试 | 中 | sonnet | 主循环核验 |
| T5 | 版本 V7.7.0 + PROGRESS + verify + 终审 | 低 | 主循环 | opus 终审 |

---

### Task 1: milestones.py（宽转长 + 优先级）

**Files:** Create `milestones.py`、`tests/test_milestones.py`

- [ ] **Step 1: 写失败测试 tests/test_milestones.py**

```python
# -*- coding: utf-8 -*-
import openpyxl
import milestones as M


def _mk_xlsx(path, rows):
    """造 PMIS 风格小表:第1行合并标题,第2行表头,数据从第3行起。"""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["里程碑计划"])
    ws.append(M.MILESTONE_HEADER)
    for r in rows:
        ws.append(r)
    wb.save(path)


def _row(pid, **kw):
    """按表头生成一行,kw 用列名赋值。"""
    d = {h: "" for h in M.MILESTONE_HEADER}
    d["项目编号"] = pid
    d["项目名称"] = f"项目{pid}"
    d.update(kw)
    return [d[h] for h in M.MILESTONE_HEADER]


class TestPriority:
    def test_high_mid_low(self):
        assert M.milestone_priority("终验", "") == "high"
        assert M.milestone_priority("服务完成", None) == "high"
        assert M.milestone_priority("到货", "到货款1，70.00%") == "high"  # 关联回款
        assert M.milestone_priority("项目关闭", "") == "mid"
        assert M.milestone_priority("到货", "") == "low"
        assert M.milestone_priority("预检", "  ") == "low"


class TestRowToMilestones:
    def test_wide_to_long_skip_empty_and_order(self):
        raw = {h: "" for h in M.MILESTONE_HEADER}
        raw["计划终验时间"] = "2026-07-01"
        raw["终验关联回款阶段"] = "终验款，100.00%"
        raw["计划项目启动时间"] = "2026-01-01"
        raw["实际项目启动时间"] = "2026-01-02"
        items = M.row_to_milestones(raw)
        # 全空类目被丢弃,只剩 启动/终验,且按业务顺序
        assert [i["name"] for i in items] == ["项目启动", "终验"]
        assert items[0] == {"name": "项目启动", "planDate": "2026-01-01",
                            "actualDate": "2026-01-02", "payStage": "", "pct": None,
                            "priority": "low"}
        assert items[1]["priority"] == "high"

    def test_paystage_newline_normalized_and_pct(self):
        raw = {h: "" for h in M.MILESTONE_HEADER}
        raw["计划终验时间"] = "2026-07-01"
        raw["终验关联回款阶段"] = "终验款，95.00%\n\n质保金1，5.00%"
        raw["计划服务完成时间"] = "2026-08-01"
        raw["服务完成百分比"] = "50"
        items = M.row_to_milestones(raw)
        zy = next(i for i in items if i["name"] == "终验")
        assert zy["payStage"] == "终验款，95.00%；质保金1，5.00%"
        fw = next(i for i in items if i["name"] == "服务完成")
        assert fw["pct"] == 50.0

    def test_datetime_normalized(self):
        import datetime
        raw = {h: "" for h in M.MILESTONE_HEADER}
        raw["计划到货时间"] = datetime.datetime(2026, 6, 19, 0, 0)
        items = M.row_to_milestones(raw)
        assert items[0]["planDate"] == "2026-06-19"


class TestLoadMilestones:
    def test_filter_merge_and_stats(self, tmp_path):
        _mk_xlsx(str(tmp_path / "在建项目里程碑计划数据.xlsx"), [
            _row("SS-1", **{"计划终验时间": "2026-07-01"}),
            _row("SS-99", **{"计划终验时间": "2026-07-02"}),   # 不在 keep_ids,过滤
        ])
        _mk_xlsx(str(tmp_path / "已结项里程碑计划数据.xlsx"), [
            _row("SS-1", **{"计划项目关闭时间": "2025-12-01"}),  # 与在建重复,在建优先
            _row("OLD-1", **{"计划项目关闭时间": "2025-01-01"}),  # relatedClosedId 命中
        ])
        ms, sa, sc = M.load_milestones(str(tmp_path), {"SS-1", "OLD-1"})
        assert set(ms.keys()) == {"SS-1", "OLD-1"}
        assert ms["SS-1"][0]["name"] == "终验"            # 在建版本胜出
        assert ms["OLD-1"][0]["name"] == "项目关闭"
        assert sa == {"provided": True, "rows": 2, "matched": 1, "matchRate": 0.5}
        assert sc == {"provided": True, "rows": 2, "matched": 1, "matchRate": 0.5}

    def test_missing_files(self, tmp_path):
        ms, sa, sc = M.load_milestones(str(tmp_path), {"SS-1"})
        assert ms == {}
        assert sa["provided"] is False and sc["provided"] is False
```

- [ ] **Step 2: 跑红**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m pytest tests/test_milestones.py -q`
Expected: FAIL（no module milestones）

- [ ] **Step 3: 实现 milestones.py**

```python
# -*- coding: utf-8 -*-
"""项目里程碑摄取(Phase R1):PMIS 里程碑两表(宽表)→ 每项目长表 + 三段优先级。

宽表:一行一项目,13 类里程碑各占「计划/实际时间」列对,部分带关联回款阶段/百分比列。
优先级(母 spec §2/R 批次决策):高=终验、服务完成、关联回款阶段非空;中=项目关闭;低=其他。
"""
import os
from typing import Any, Dict, List, Optional, Set, Tuple

from pmis import read_pmis_sheet, parse_pmis_pct
import config

# (类目名, 计划列, 实际列, 关联回款列, 百分比列) —— 顺序即业务展示顺序
MILESTONE_DEFS = [
    ("项目启动", "计划项目启动时间", "实际项目启动时间", None, None),
    ("到货", "计划到货时间", "实际到货时间", "到货关联回款阶段", None),
    ("服务进场", "计划服务进场时间", "实际服务进场时间", None, None),
    ("交付完工", "计划交付完工时间", "实际交付完工时间", None, None),
    ("初验", "计划初验时间", "实际初验时间", "初验关联回款阶段", None),
    ("终验", "计划终验时间", "实际终验时间", "终验关联回款阶段", None),
    ("项目完工（服务离场）", "计划项目完工（服务离场）时间", "实际项目完工（服务离场）时间", None, None),
    ("实物点验", "计划实物点验完成时间", "实际实物点验完成时间", None, "实物点验百分比"),
    ("预检", "计划预检完成时间", "实际预检完成时间", None, "预检百分比"),
    ("节点成果确认", "计划节点成果确认完成时间", "实际节点成果确认完成时间", None, None),
    ("服务完成", "计划服务完成时间", "实际服务完成时间", None, "服务完成百分比"),
    ("项目关闭", "计划项目关闭时间", "实际项目关闭时间", None, None),
    # 驻场无计划/实际语义,开始→planDate、结束→actualDate
    ("驻场", "驻场开始时间", "驻场结束时间", "驻场关联回款阶段", None),
]

# 测试用:还原导出表头(序号/合同编号/项目编号/项目名称/项目级标志 + 各类目列 + 阶段列)
MILESTONE_HEADER = ["序号", "合同编号", "项目编号", "项目名称", "里程碑是否关联回款阶段"]
for _n, _p, _a, _pay, _pct in MILESTONE_DEFS:
    MILESTONE_HEADER.extend([_p, _a])
    if _pay:
        MILESTONE_HEADER.append(_pay)
    if _pct:
        MILESTONE_HEADER.append(_pct)
MILESTONE_HEADER.extend(["阶段计划完成时间", "阶段实际完成时间"])

HIGH_NAMES = {"终验", "服务完成"}
MID_NAMES = {"项目关闭"}


def milestone_priority(name: str, pay_stage: Optional[str]) -> str:
    if name in HIGH_NAMES or str(pay_stage or "").strip():
        return "high"
    if name in MID_NAMES:
        return "mid"
    return "low"


def _norm_date(v: Any) -> str:
    if v is None:
        return ""
    if hasattr(v, "isoformat"):
        return v.isoformat()[:10]
    return str(v).strip()[:10]


def _norm_stage(v: Any) -> str:
    s = str(v or "").strip()
    if not s:
        return ""
    return "；".join(part.strip() for part in s.splitlines() if part.strip())


def row_to_milestones(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """一行宽表 → 非全空类目的里程碑列表(按 MILESTONE_DEFS 顺序)。"""
    out = []
    for name, pcol, acol, paycol, pctcol in MILESTONE_DEFS:
        plan = _norm_date(row.get(pcol))
        actual = _norm_date(row.get(acol))
        pay = _norm_stage(row.get(paycol)) if paycol else ""
        pct = parse_pmis_pct(row.get(pctcol)) if pctcol else None
        if not (plan or actual or pay or pct is not None):
            continue
        out.append({"name": name, "planDate": plan, "actualDate": actual,
                    "payStage": pay, "pct": pct,
                    "priority": milestone_priority(name, pay)})
    return out


def _stat(provided: bool, rows: int, matched: int) -> Dict[str, Any]:
    return {"provided": provided, "rows": rows, "matched": matched,
            "matchRate": round(matched / rows, 4) if rows else 0.0}


def _load_one(path: str, keep_ids: Set[str]) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, Any]]:
    rows = read_pmis_sheet(path)
    if not rows:
        return {}, _stat(False, 0, 0)
    out: Dict[str, List[Dict[str, Any]]] = {}
    matched = 0
    for r in rows:
        pid = str(r.get("项目编号") or "").strip()
        if not pid:
            continue
        if pid in keep_ids:
            matched += 1
            items = row_to_milestones(r)
            if items:
                out[pid] = items
    return out, _stat(True, len(rows), matched)


def load_milestones(pmis_dir: str, keep_ids: Set[str]
                    ) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, Any], Dict[str, Any]]:
    """读在建+已结项两表,按 keep_ids(主域∪原项目)过滤;同项目在建优先。"""
    active, stat_a = _load_one(os.path.join(pmis_dir, config.MILESTONE_FILE_ACTIVE), keep_ids)
    closed, stat_c = _load_one(os.path.join(pmis_dir, config.MILESTONE_FILE_CLOSED), keep_ids)
    merged = dict(closed)
    merged.update(active)
    return merged, stat_a, stat_c
```

注意：`config.MILESTONE_FILE_ACTIVE/CLOSED` 在 T3 加入 config.py；T1 期间先在本文件顶部 `config` import 后临时使用，**测试若因 config 缺常量失败，在 config.py 的 PMIS_FILES_CLOSED 定义后追加**：

```python
# 里程碑两表(Phase R1,位于 input/pmis/)
MILESTONE_FILE_ACTIVE = "在建项目里程碑计划数据.xlsx"
MILESTONE_FILE_CLOSED = "已结项里程碑计划数据.xlsx"
```

- [ ] **Step 4: 跑绿**

Run: `python -m pytest tests/test_milestones.py -q` → PASS 7 项
Run: `python -m pytest -q` → 原 188 项不回归

- [ ] **Step 5: Commit**

```bash
git add milestones.py tests/test_milestones.py config.py
git commit -m "feat(r1): 里程碑摄取 milestones.py(宽转长13类目+三段优先级+主域过滤,在建优先)"
```

---

### Task 2: profit.py（科目树 + budget 合并 + 回款流水）

**Files:** Create `profit.py`、`tests/test_profit.py`

- [ ] **Step 1: 写失败测试 tests/test_profit.py**

```python
# -*- coding: utf-8 -*-
import profit as P


def _write(tmp_path, name, text):
    (tmp_path / name).write_text(text, encoding="utf-8-sig")


DIRECT_CSV = (
    "项目编号,项目名称,预算收入,预算成本,实际成本,成本消耗率,预算毛利,实际毛利,预算毛利率,剩余预算,"
    "本项目_1_项目收入_预算金额,本项目_1_项目收入_实际发生,本项目_1_项目收入_剩余预算,本项目_1_项目收入_消耗率,"
    "本项目_2_项目成本_预算金额,本项目_2_项目成本_实际发生,本项目_2_项目成本_剩余预算,本项目_2_项目成本_消耗率,"
    "本项目_2.3.2_交付部门人工成本_预算金额,本项目_2.3.2_交付部门人工成本_实际发生,本项目_2.3.2_交付部门人工成本_剩余预算,本项目_2.3.2_交付部门人工成本_消耗率,"
    "本项目_2.4.1_差旅费_预算金额,本项目_2.4.1_差旅费_实际发生,本项目_2.4.1_差旅费_剩余预算,本项目_2.4.1_差旅费_消耗率,"
    "本项目_3_项目毛利_预算金额,本项目_3_项目毛利_实际发生,本项目_3_项目毛利_剩余预算,本项目_3_项目毛利_消耗率\n"
    "SS-1,甲项目,1000.0,600.0,200.0,0.33,400.0,100.0,0.4,400.0,"
    "1000.0,0.0,1000.0,0.0,"
    "600.0,200.0,400.0,0.33,"
    "100.0,50.0,50.0,0.5,"
    "0.0,0.0,0.0,0.0,"
    "400.0,100.0,300.0,0.25\n"
)

BUDGET_CSV = (
    "项目编号,项目名称,预算_1_项目收入_预算金额,预算_1_项目收入_概算金额,预算_1_项目收入_核算金额,"
    "预算_2.3.2_服务体系人工成本_预算金额,预算_2.3.2_服务体系人工成本_概算金额,预算_2.3.2_服务体系人工成本_核算金额,"
    "预算_3.1_项目毛利_预算金额,预算_3.1_项目毛利_概算金额,预算_3.1_项目毛利_核算金额\n"
    "SS-1,甲项目,0.0,900.0,950.0,0.0,80.0,85.0,0.0,350.0,360.0\n"
)

BRIDGE_CSV = (
    "项目编号,项目名称,桥接SS项目编码,桥接SS预算收入,桥接SS预算成本,桥接SS预算毛利,桥接SS预算毛利率,桥接SS实际成本,"
    "桥接_1_项目收入_预算金额,桥接_1_项目收入_实际发生,桥接_1_项目收入_剩余预算,桥接_1_项目收入_消耗率\n"
    "SF-1,售前服务-某行,SS-9,500.0,300.0,200.0,0.4,250.0,500.0,0.0,500.0,0.0\n"
)

PAY_CSV = (
    "项目编号,项目名称,合同编号,回款类型,收款流水号,回款单位,付款金额,回款确认日期,认领人,备注,订单号,币种,汇率,票据_互抵协议号\n"
    "SS-1,甲项目,C-1,实际回款,BANK-1,某公司,2250.0,2026-06-04,马春艳,,N-1,CNY,1.0,\n"
    "SS-1,甲项目,C-1,实际回款,BANK-2,某公司,1000.0,2026-05-27,赵岩,,N-2,USD,7.1,\n"
    "SS-99,乙项目,C-9,实际回款,BANK-9,别家,5.0,2026-01-01,张三,,N-9,CNY,1.0,\n"
)


class TestParseProfitRows:
    def test_tree_levels_and_zero_pruning(self):
        import csv, io
        row = next(csv.DictReader(io.StringIO(DIRECT_CSV)))
        rows = P.parse_profit_rows(row, "本项目_")
        codes = [r["code"] for r in rows]
        assert codes == ["1", "2", "2.3.2", "3"]   # 2.4.1 全 0 被剪,一级行保留
        r232 = next(r for r in rows if r["code"] == "2.3.2")
        assert r232 == {"code": "2.3.2", "name": "交付部门人工成本", "level": 3,
                        "budget": 100.0, "estimate": None, "final": None,
                        "actual": 50.0, "remaining": 50.0, "rate": 0.5}


class TestLoadProfit:
    def test_merge_budget_and_bridge(self, tmp_path):
        _write(tmp_path, "profit_loss_direct.csv", DIRECT_CSV)
        _write(tmp_path, "budget_data.csv", BUDGET_CSV)
        _write(tmp_path, "profit_loss_bridge.csv", BRIDGE_CSV)
        pp, stats = P.load_profit(str(tmp_path), {"SS-1", "SF-1"})
        rows = pp["SS-1"]["rows"]
        r1 = next(r for r in rows if r["code"] == "1")
        assert r1["estimate"] == 900.0 and r1["final"] == 950.0      # code+name 一致 → 合并
        r232 = next(r for r in rows if r["code"] == "2.3.2")
        assert r232["estimate"] is None                               # 同 code 名不同(服务体系≠交付部门) → 不合并
        r3 = next(r for r in rows if r["code"] == "3")
        assert r3["estimate"] == 350.0 and r3["final"] == 360.0      # 毛利别名 3.1→3
        assert pp["SS-1"]["summary"]["预算收入"] == 1000.0
        assert pp["SS-1"]["summary"]["成本消耗率"] == 0.33
        assert pp["SS-1"]["bridge"] is None
        br = pp["SF-1"]["bridge"]
        assert br["ssId"] == "SS-9" and br["summary"]["实际成本"] == 250.0
        assert br["rows"][0]["code"] == "1"
        assert stats["direct"] == {"provided": True, "rows": 1, "matched": 1, "matchRate": 1.0}
        assert stats["budget"]["provided"] is True
        assert stats["bridge"]["matched"] == 1

    def test_missing_files(self, tmp_path):
        pp, stats = P.load_profit(str(tmp_path), {"SS-1"})
        assert pp == {}
        assert stats["direct"]["provided"] is False


class TestPaymentRecords:
    def test_group_and_summary(self, tmp_path):
        _write(tmp_path, "payment_records.csv", PAY_CSV)
        recs, stat = P.load_payment_records(str(tmp_path), {"SS-1"})
        e = recs["SS-1"]
        assert e["count"] == 2 and e["total"] == 3250.0 and e["lastDate"] == "2026-06-04"
        assert e["records"][0]["date"] == "2026-06-04"   # 新→旧排序
        assert e["records"][1]["currency"] == "USD" and e["records"][1]["rate"] == 7.1
        assert "SS-99" not in recs                        # keep_ids 过滤
        assert stat == {"provided": True, "rows": 3, "matched": 2, "matchRate": 0.6667}

    def test_missing(self, tmp_path):
        recs, stat = P.load_payment_records(str(tmp_path), {"SS-1"})
        assert recs == {} and stat["provided"] is False
```

- [ ] **Step 2: 跑红**

Run: `python -m pytest tests/test_profit.py -q` → FAIL（no module profit）

- [ ] **Step 3: 实现 profit.py**

```python
# -*- coding: utf-8 -*-
"""预算/核算/回款 CSV 摄取(Phase R1):
- profit_loss_direct.csv:项目全预算科目树(预算/实际/剩余/消耗率)+顶部汇总
- budget_data.csv:概算/核算两版本,按 code+name 双键并入 direct 科目行(毛利编码别名 3.1→3/3.2→4)
- profit_loss_bridge.csv:售前 SF → 原 SS 项目同构科目树
- payment_records.csv:回款流水按项目分组+汇总
全部 utf-8-sig;缺文件不致命(provided=False)。
"""
import csv
import os
from typing import Any, Dict, List, Optional, Set, Tuple

import config

_METRIC_KEYS = {"预算金额": "budget", "实际发生": "actual", "剩余预算": "remaining", "消耗率": "rate"}
_BUDGET_KEYS = {"概算金额": "estimate", "核算金额": "final"}
_GRoss_ALIAS = {"3.1": "3", "3.2": "4"}  # budget 毛利编码 → direct 毛利编码


def read_csv_rows(path: str) -> List[Dict[str, str]]:
    """utf-8-sig CSV → List[dict];缺失/不可读返回 []。"""
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    except (OSError, csv.Error):
        return []


def _num(v: Any) -> Optional[float]:
    s = str(v if v is not None else "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _split_col(col: str, prefix: str) -> Optional[Tuple[str, str, str]]:
    """'本项目_2.3.2_交付部门人工成本_预算金额' → ('2.3.2','交付部门人工成本','预算金额')。"""
    if not col.startswith(prefix):
        return None
    rest = col[len(prefix):]
    left, _, metric = rest.rpartition("_")
    code, _, name = left.partition("_")
    if not (code and name and metric):
        return None
    return code, name, metric


def parse_profit_rows(row: Dict[str, Any], prefix: str) -> List[Dict[str, Any]]:
    """一行 CSV → 科目树行(按列序;level>1 且四指标全 None/0 的剪掉)。"""
    found: Dict[Tuple[str, str], Dict[str, Any]] = {}
    order: List[Tuple[str, str]] = []
    for col, raw in row.items():
        parsed = _split_col(col, prefix)
        if not parsed:
            continue
        code, name, metric = parsed
        if metric not in _METRIC_KEYS:
            continue
        key = (code, name)
        if key not in found:
            found[key] = {"code": code, "name": name, "level": code.count(".") + 1,
                          "budget": None, "estimate": None, "final": None,
                          "actual": None, "remaining": None, "rate": None}
            order.append(key)
        found[key][_METRIC_KEYS[metric]] = _num(raw)
    out = []
    for key in order:
        r = found[key]
        vals = [r["budget"], r["actual"], r["remaining"], r["rate"]]
        if r["level"] > 1 and not any(v for v in vals):
            continue
        out.append(r)
    return out


def _budget_versions(row: Dict[str, Any]) -> Dict[Tuple[str, str], Dict[str, Optional[float]]]:
    """budget_data 一行 → {(code,name): {estimate, final}}(毛利编码按别名映射)。"""
    out: Dict[Tuple[str, str], Dict[str, Optional[float]]] = {}
    for col, raw in row.items():
        parsed = _split_col(col, "预算_")
        if not parsed:
            continue
        code, name, metric = parsed
        if metric not in _BUDGET_KEYS:
            continue
        code = _GRoss_ALIAS.get(code, code)
        d = out.setdefault((code, name), {"estimate": None, "final": None})
        d[_BUDGET_KEYS[metric]] = _num(raw)
    return out


def _stat(provided: bool, rows: int, matched: int) -> Dict[str, Any]:
    return {"provided": provided, "rows": rows, "matched": matched,
            "matchRate": round(matched / rows, 4) if rows else 0.0}


_SUMMARY_COLS = ["预算收入", "预算成本", "实际成本", "成本消耗率", "预算毛利", "实际毛利", "预算毛利率", "剩余预算"]


def load_profit(input_dir: str, keep_ids: Set[str]
                ) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """direct+budget+bridge → {pid: {summary, rows, bridge}}, stats{direct,budget,bridge}。"""
    direct = read_csv_rows(os.path.join(input_dir, config.PROFIT_DIRECT_FILE))
    budget = read_csv_rows(os.path.join(input_dir, config.BUDGET_FILE))
    bridge = read_csv_rows(os.path.join(input_dir, config.PROFIT_BRIDGE_FILE))

    budget_map: Dict[str, Dict[Tuple[str, str], Dict[str, Optional[float]]]] = {}
    budget_matched = 0
    for r in budget:
        pid = str(r.get("项目编号") or "").strip()
        if pid in keep_ids:
            budget_matched += 1
        budget_map[pid] = _budget_versions(r)

    out: Dict[str, Dict[str, Any]] = {}
    direct_matched = 0
    for r in direct:
        pid = str(r.get("项目编号") or "").strip()
        if pid not in keep_ids:
            continue
        direct_matched += 1
        rows = parse_profit_rows(r, "本项目_")
        # 名同码同才并入概算/核算;毛利行经别名后再以"名含毛利"双保险
        bv = budget_map.get(pid, {})
        for row_item in rows:
            hit = bv.get((row_item["code"], row_item["name"]))
            if hit is None and row_item["code"] in ("3", "4") and "毛利" in row_item["name"]:
                hit = next((v for (c, n), v in bv.items()
                            if c == row_item["code"] and "毛利" in n), None)
            if hit:
                row_item["estimate"] = hit["estimate"]
                row_item["final"] = hit["final"]
        out[pid] = {
            "summary": {k: _num(r.get(k)) for k in _SUMMARY_COLS},
            "rows": rows,
            "bridge": None,
        }

    bridge_matched = 0
    for r in bridge:
        pid = str(r.get("项目编号") or "").strip()
        if pid not in keep_ids:
            continue
        bridge_matched += 1
        entry = out.setdefault(pid, {"summary": {k: None for k in _SUMMARY_COLS},
                                     "rows": [], "bridge": None})
        entry["bridge"] = {
            "ssId": str(r.get("桥接SS项目编码") or "").strip(),
            "summary": {
                "预算收入": _num(r.get("桥接SS预算收入")),
                "预算成本": _num(r.get("桥接SS预算成本")),
                "预算毛利": _num(r.get("桥接SS预算毛利")),
                "预算毛利率": _num(r.get("桥接SS预算毛利率")),
                "实际成本": _num(r.get("桥接SS实际成本")),
            },
            "rows": parse_profit_rows(r, "桥接_"),
        }

    stats = {
        "direct": _stat(bool(direct), len(direct), direct_matched),
        "budget": _stat(bool(budget), len(budget), budget_matched),
        "bridge": _stat(bool(bridge), len(bridge), bridge_matched),
    }
    return out, stats


def load_payment_records(input_dir: str, keep_ids: Set[str]
                         ) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    """payment_records.csv → {pid: {total,count,lastDate,records[新→旧]}}。"""
    rows = read_csv_rows(os.path.join(input_dir, config.PAYMENT_RECORDS_FILE))
    if not rows:
        return {}, _stat(False, 0, 0)
    out: Dict[str, Dict[str, Any]] = {}
    matched = 0
    for r in rows:
        pid = str(r.get("项目编号") or "").strip()
        if pid not in keep_ids:
            continue
        matched += 1
        rec = {
            "type": str(r.get("回款类型") or "").strip(),
            "serial": str(r.get("收款流水号") or "").strip(),
            "payer": str(r.get("回款单位") or "").strip(),
            "amount": _num(r.get("付款金额")),
            "date": str(r.get("回款确认日期") or "").strip()[:10],
            "claimer": str(r.get("认领人") or "").strip(),
            "orderNo": str(r.get("订单号") or "").strip(),
            "currency": str(r.get("币种") or "").strip(),
            "rate": _num(r.get("汇率")),
            "note": str(r.get("备注") or "").strip(),
        }
        e = out.setdefault(pid, {"total": 0.0, "count": 0, "lastDate": "", "records": []})
        e["records"].append(rec)
        e["count"] += 1
        e["total"] = round(e["total"] + (rec["amount"] or 0.0), 2)
        if rec["date"] > e["lastDate"]:
            e["lastDate"] = rec["date"]
    for e in out.values():
        e["records"].sort(key=lambda x: x["date"], reverse=True)
    return out, _stat(True, len(rows), matched)
```

注意：`config.PROFIT_DIRECT_FILE/PROFIT_BRIDGE_FILE/BUDGET_FILE/PAYMENT_RECORDS_FILE` 若 config.py 尚无，在 MILESTONE 常量后追加：

```python
# 预算/核算/回款 CSV(Phase R1,位于 input/ 根)
PROFIT_DIRECT_FILE = "profit_loss_direct.csv"
PROFIT_BRIDGE_FILE = "profit_loss_bridge.csv"
BUDGET_FILE = "budget_data.csv"
PAYMENT_RECORDS_FILE = "payment_records.csv"
```

- [ ] **Step 4: 跑绿**

Run: `python -m pytest tests/test_profit.py tests/test_milestones.py -q` → PASS；`python -m pytest -q` 不回归

- [ ] **Step 5: Commit**

```bash
git add profit.py tests/test_profit.py config.py
git commit -m "feat(r1): 预算/核算/回款 CSV 摄取 profit.py(科目树+budget双键合并毛利别名+桥接+流水分组)"
```

---

### Task 3: 集成（config/pmis/projects/schema/preprocess/gen:types/.spec）

**Files:** Modify `config.py`、`pmis.py:177-180`、`projects.py:88-91`、`schema.py`、`preprocess_data.py:1205-1230`、`PaymentReviewApp.spec:68`、`frontend/src/types/analysis.ts`(生成)

- [ ] **Step 1: config.py DELIVERY_FILE 切 csv**

`DELIVERY_FILE = "delivery_analysis.xlsx"` → `DELIVERY_FILE = "delivery_analysis.csv"`，并在其下加一行：`DELIVERY_FILE_LEGACY = "delivery_analysis.xlsx"  # csv 缺失时回退(R 批次过渡)`

- [ ] **Step 2: projects.py read_delivery 支持 csv + 回退**

```python
def read_delivery(path: str) -> List[Dict[str, Any]]:
    """delivery_analysis 表:csv 优先(R1 起),缺失回退旧 xlsx;xlsx 按"表头含项目编号"自动选 sheet。"""
    if path.endswith(".csv"):
        from profit import read_csv_rows
        rows = read_csv_rows(path)
        if rows:
            return rows
        legacy = os.path.join(os.path.dirname(path), config.DELIVERY_FILE_LEGACY)
        return _read_header_sheet(legacy, "项目编号")
    return _read_header_sheet(path, "项目编号")
```

加 pytest（tests/test_projects.py 追加）：

```python
class TestReadDeliveryCsv:
    def test_csv_first_and_legacy_fallback(self, tmp_path):
        import projects as PJ
        csv_path = tmp_path / "delivery_analysis.csv"
        csv_path.write_text("项目编号,项目名称,交付外包服务成本_预算金额\nSS-1,甲,100.0\n", encoding="utf-8-sig")
        rows = PJ.read_delivery(str(csv_path))
        assert rows[0]["项目编号"] == "SS-1"
        # csv 缺失 → 回退 xlsx(不存在则空)
        assert PJ.read_delivery(str(tmp_path / "none" / "delivery_analysis.csv")) == []
```

（delivery_costs_for 的 parse_pmis_money 接受字符串 '100.0'，无需改。）

- [ ] **Step 3: pmis.py status 块加两字段（177-180 行处）**

```python
        "status": {
            "项目状态": (b.get("项目状态") or s.get("项目状态") or None),
            "是否暂停": paused,
            "评级": (s.get("项目评级") or None),
            "项目级别": (b.get("项目级别") or s.get("项目级别") or None),
            "项目类型": (b.get("项目类型") or s.get("项目类型") or None),
```

tests/test_pmis.py 找到现有 _assemble/status 断言用例，补两字段断言（按文件内既有 fixture 模式，base 行加 `"项目级别": "P3", "项目类型": "交付项目"` 后断言透传）。

- [ ] **Step 4: schema.py 扩展**

PmisStatus 加：`项目级别: Optional[str] = None`、`项目类型: Optional[str] = None`。
ProjectsQuality 加 6 字段（InputFileStat 默认工厂同现有三个）：`milestoneActive/milestoneClosed/paymentRecordsFile/profitDirectFile/profitBridgeFile/budgetFile`。
Event 模型之前插入新模型：

```python
class MilestoneItem(_Base):
    name: str
    planDate: str = ""
    actualDate: str = ""
    payStage: str = ""
    pct: Optional[float] = None
    priority: str = "low"  # high | mid | low


class PaymentRecord(_Base):
    type: str = ""
    serial: str = ""
    payer: str = ""
    amount: Optional[float] = None
    date: str = ""
    claimer: str = ""
    orderNo: str = ""
    currency: str = ""
    rate: Optional[float] = None
    note: str = ""


class PaymentRecordsEntry(_Base):
    total: float = 0
    count: int = 0
    lastDate: str = ""
    records: List[PaymentRecord] = []


class ProfitRow(_Base):
    code: str
    name: str
    level: int = 1
    budget: Optional[float] = None
    estimate: Optional[float] = None   # budget_data 概算
    final: Optional[float] = None      # budget_data 核算
    actual: Optional[float] = None
    remaining: Optional[float] = None
    rate: Optional[float] = None


class BridgeProfit(_Base):
    ssId: str = ""
    summary: Dict[str, Optional[float]] = {}
    rows: List[ProfitRow] = []


class ProjectProfit(_Base):
    summary: Dict[str, Optional[float]] = {}
    rows: List[ProfitRow] = []
    bridge: Optional[BridgeProfit] = None
```

AnalysisData 加（projectsQuality 之后）：

```python
    projectMilestones: Dict[str, List[MilestoneItem]] = {}
    paymentRecords: Dict[str, PaymentRecordsEntry] = {}
    projectProfit: Dict[str, ProjectProfit] = {}
```

tests/test_schema.py 的 `_minimal_analysis_data` 不需改（新字段全有默认）；追加一个用例校验带新数据的 round-trip（仿现有风格，构造一项 projectMilestones/paymentRecords/projectProfit 过 AnalysisData(**data) 不抛）。

- [ ] **Step 5: preprocess_data.py 9e 段（9c 之后、`=== 10` 之前插入）**

顶部 import 区加 `import milestones as milestones_mod`、`import profit as profit_mod`。

```python
    # === 9e. 新数据源(Phase R1):里程碑/回款流水/全预算 ===
    print("[INFO] 摄取里程碑/回款流水/全预算数据...")
    keep_ids = {p["projectId"] for p in dept_projects}
    keep_ids |= {p["relatedClosedId"] for p in dept_projects if p.get("relatedClosedId")}
    project_milestones, ms_a, ms_c = milestones_mod.load_milestones(pmis_dir, keep_ids)
    payment_records, pr_stat = profit_mod.load_payment_records(
        os.path.join(BASE_DIR, "input"), keep_ids)
    project_profit, pf_stats = profit_mod.load_profit(
        os.path.join(BASE_DIR, "input"), keep_ids)
    projects_quality["milestoneActive"] = ms_a
    projects_quality["milestoneClosed"] = ms_c
    projects_quality["paymentRecordsFile"] = pr_stat
    projects_quality["profitDirectFile"] = pf_stats["direct"]
    projects_quality["profitBridgeFile"] = pf_stats["bridge"]
    projects_quality["budgetFile"] = pf_stats["budget"]
    for label, st in [("里程碑(在建)", ms_a), ("里程碑(已结项)", ms_c),
                      ("回款流水", pr_stat), ("全预算(direct)", pf_stats["direct"]),
                      ("预算版本(budget)", pf_stats["budget"]), ("桥接预算", pf_stats["bridge"])]:
        if st["provided"]:
            print(f"  [OK] {label} {st['rows']} 行, 命中 {st['matched']}")
        else:
            print(f"  [WARN] 未提供 {label} 数据文件")
```

final_data 加三键（projectsQuality 行后）：

```python
        "projectMilestones": project_milestones,
        "paymentRecords": payment_records,
        "projectProfit": project_profit,
```

- [ ] **Step 6: PaymentReviewApp.spec datas 加两行（write_followup.py 行后）**

```python
        ('milestones.py', '.'),
        ('profit.py', '.'),
```

- [ ] **Step 7: 全量验证 + 真实数据跑管线 + gen:types**

```bash
python -m pytest -q                                  # 全绿
PYTHONIOENCODING=utf-8 python preprocess_data.py     # 真实管线,看 9e 段 [OK] 行数
cd frontend && npm run gen:types && npm run typecheck
```

preprocess 期望输出（量级核对）：里程碑(在建) 634 行命中 ~610、已结项 391x 行命中 ~310、回款流水 622、direct 903 命中 ~600+、budget 607、桥接 285。typecheck 此时应仍绿（前端尚未消费新字段）。

- [ ] **Step 8: Commit**

```bash
git add config.py pmis.py projects.py schema.py preprocess_data.py PaymentReviewApp.spec frontend/src/types/analysis.ts tests/
git commit -m "feat(r1): 七文件集成入 analysis_data(9e 段+schema 三新键+质量统计6项+delivery csv 切换回退+spec datas),gen:types"
```

---

### Task 4: 前端（治理源卡 5→9 + 清单 3 列）

**Files:** Modify `frontend/src/lib/governance.ts`、`frontend/src/lib/governance.test.ts`、`frontend/src/lib/projectList.ts`、`frontend/src/lib/projectList.test.ts`（如有）、`frontend/src/views/ProjectsView.vue`、`frontend/src/views/ProjectsView.test.ts`

- [ ] **Step 1: governance.test.ts 追加用例（跑红）**

先把 makeData 的 projectsQuality fixture **补全 R1 六统计**（org 三项之后追加，provided 全 true）：

```ts
      milestoneActive: { provided: true, rows: 634, matched: 610, matchRate: 0.96 },
      milestoneClosed: { provided: true, rows: 3914, matched: 310, matchRate: 0.08 },
      paymentRecordsFile: { provided: true, rows: 622, matched: 600, matchRate: 0.96 },
      profitDirectFile: { provided: true, rows: 903, matched: 620, matchRate: 0.69 },
      profitBridgeFile: { provided: true, rows: 285, matched: 280, matchRate: 0.98 },
      budgetFile: { provided: true, rows: 607, matched: 600, matchRate: 0.99 },
```

再追加两个用例：

```ts
  it('R1 新源四卡:就绪计 9 卡', () => {
    const r = buildHealthReport(makeData())
    expect(r.sources).toHaveLength(9)
    expect(r.sources.map((s) => s.key)).toContain('milestone')
    expect(r.sources.find((s) => s.key === 'profit')!.subs[0]).toContain('budget 607')
    expect(r.verdict).toBe('green')
  })

  it('R1 新源缺失:在建里程碑/流水/direct 高告警,已结项/桥接/budget 中告警', () => {
    const d = makeData()
    for (const k of ['milestoneActive', 'milestoneClosed', 'paymentRecordsFile', 'profitDirectFile', 'profitBridgeFile', 'budgetFile']) {
      delete (d.projectsQuality as any)[k]   // 退回 P1 时代形状 → R1 六源全缺失
    }
    const r = buildHealthReport(d)
    expect(r.sources.find((s) => s.key === 'milestone')!.provided).toBe(false)
    const keys = r.alerts.filter((a) => a.key.startsWith('missing-')).map((a) => a.key)
    expect(keys).toEqual(expect.arrayContaining(
      ['missing-msActive', 'missing-msClosed', 'missing-paymentRecords', 'missing-profitDirect', 'missing-profitBridge', 'missing-budget']))
    expect(r.alerts.find((a) => a.key === 'missing-msActive')!.severity).toBe('high')
    expect(r.alerts.find((a) => a.key === 'missing-msClosed')!.severity).toBe('mid')
    expect(r.alerts.find((a) => a.key === 'missing-budget')!.severity).toBe('mid')
    expect(r.verdict).toBe('yellow')
  })
```

原有用例同步两处：「全源就绪零告警 → 绿」无需改（fixture 补全后仍绿，sources 断言为 toHaveLength(5) 的改 9——若该例写的是 every(provided) 则不动）；「projectsQuality 整体缺失」断言改为 **7 卡未提供**（org/mapping/delivery/milestone/payRecords/profit/bridge）与 **9 条 missing-\*** 告警（org/mapping/delivery/msActive/paymentRecords/profitDirect 高 + msClosed/profitBridge/budget 中）。「辅源缺失→黄」例不受影响。

- [ ] **Step 2: governance.ts 扩展（实现）**

MISSING 增六项（org 条目后）：

```ts
  msActive: { label: '数据源缺失:里程碑(在建)', note: '项目里程碑展示缺失。请从 PMIS 导出 在建项目里程碑计划数据.xlsx 放入 input/pmis/ 后点「更新数据」。' },
  msClosed: { label: '数据源缺失:里程碑(已结项)', note: '售前项目的原项目里程碑缺失。请从 PMIS 导出 已结项里程碑计划数据.xlsx 放入 input/pmis/ 后点「更新数据」。' },
  paymentRecords: { label: '数据源缺失:回款流水', note: '详情页回款数据 Tab 缺失。请提供 input/payment_records.csv 后点「更新数据」。' },
  profitDirect: { label: '数据源缺失:全预算(direct)', note: '预算核算科目树缺失。请提供 input/profit_loss_direct.csv 后点「更新数据」。' },
  profitBridge: { label: '数据源缺失:桥接预算', note: '售前项目的原项目预算核算缺失。请提供 input/profit_loss_bridge.csv 后点「更新数据」。' },
  budget: { label: '数据源缺失:预算版本(budget)', note: '科目树概算/核算两列将为空。请提供 input/budget_data.csv 后点「更新数据」。' },
```

sources 数组（delivery 卡后）追加 4 卡：

```ts
    { key: 'milestone', label: '里程碑两表', provided: !!(msA?.provided || msC?.provided),
      main: msA?.provided ? String(msA.matched ?? 0) : '-', mainLabel: '在建命中',
      subs: (msA?.provided || msC?.provided)
        ? [`在建 ${msA?.rows ?? 0} 行 · 已结项 ${msC?.rows ?? 0} 行`]
        : ['未提供'] },
    { key: 'payRecords', label: '回款流水', provided: !!prF?.provided,
      main: prF?.provided ? String(prF.rows ?? 0) : '-', mainLabel: '流水行数',
      subs: prF?.provided ? [`命中主域 ${prF.matched ?? 0}`] : ['未提供'] },
    { key: 'profit', label: '全预算(direct+budget)', provided: !!pdF?.provided,
      main: pdF?.provided ? pct(pdF.matchRate) : '-', mainLabel: '匹配率',
      subs: pdF?.provided ? [`direct ${pdF.rows ?? 0} 行 · budget ${bgF?.rows ?? 0} 行`] : ['未提供'] },
    { key: 'bridge', label: '桥接预算', provided: !!pbF?.provided,
      main: pbF?.provided ? String(pbF.matched ?? 0) : '-', mainLabel: '售前命中',
      subs: pbF?.provided ? [`${pbF.rows ?? 0} 行`] : ['未提供'] },
```

取值常量（orgF 行后）：`const msA = pq?.milestoneActive; const msC = pq?.milestoneClosed; const prF = pq?.paymentRecordsFile; const pdF = pq?.profitDirectFile; const pbF = pq?.profitBridgeFile; const bgF = pq?.budgetFile`（生成类型为 any 兜底时加 `as InputFileStat | undefined` 风格断言，跟随现有写法）。

missPairs 改为带 severity 的三元组并相应改循环：

```ts
  const missPairs: [keyof typeof MISSING, boolean, Severity][] = [
    ['pmis', pmisOk, 'high'], ['org', !!orgF?.provided, 'high'],
    ['mapping', !!mapF?.provided, 'high'], ['delivery', !!delF?.provided, 'high'],
    ['msActive', !!msA?.provided, 'high'], ['msClosed', !!msC?.provided, 'mid'],
    ['paymentRecords', !!prF?.provided, 'high'], ['profitDirect', !!pdF?.provided, 'high'],
    ['profitBridge', !!pbF?.provided, 'mid'], ['budget', !!bgF?.provided, 'mid'],
  ]
  for (const [k, ok, sev] of missPairs) {
    if (!ok) alerts.push({ key: `missing-${k}`, label: MISSING[k].label, severity: sev, count: 1, columns: [], rows: [], note: MISSING[k].note })
  }
```

DataQualityView.test.ts 的「点击展开…note」用例使用 missing-mapping，不受影响；若有断言告警总数的用例同步。

- [ ] **Step 3: 跑绿**

Run: `cd frontend && npx vitest run src/lib/governance.test.ts src/views/DataQualityView.test.ts` → PASS

- [ ] **Step 4: 清单 3 列（projectList.ts + ProjectsView.vue，先改测试再实现）**

projectList.ts：ProjectRow 接口加 `contractAmount: number | null`、`projectLevel: string`、`projectType: string`；buildProjectRows 返回对象加：

```ts
      contractAmount: typeof customer.合同总额 === 'number' ? customer.合同总额 : null,
      projectLevel: status.项目级别 || '-',
      projectType: status.项目类型 || '-',
```

ProjectsView.vue columns（customer 列后插「合同金额」，riskLevel 列后插「级别/项目类型」两列）：

```ts
  { key: 'contractAmount', label: '合同金额(万)', width: 110, sortable: true,
    formatter: (v) => (v == null ? '-' : (v / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })) },
  { key: 'projectLevel', label: '级别', width: 70 },
  { key: 'projectType', label: '项目类型', width: 100 },
```

（列序：项目名称/编号/客户/**合同金额**/经理/服务组/阶段/完工%/风险/**级别**/**项目类型**/消耗比/回款完成率/健康度。）
测试：projectList 相关测试文件（`grep -l buildProjectRows frontend/src/lib`）补字段断言；ProjectsView.test.ts 补 `expect(w.text()).toContain('合同金额')` 与某行级别值断言（fixture 的 projectPmis status 加 `项目级别: 'P3', 项目类型: '交付项目'`、customer 加 `合同总额: 1234567`，断言文本含 `123.5`）。

- [ ] **Step 5: 全量前端验证**

Run: `cd frontend && npm run test:run 2>&1 | tail -3 && npm run typecheck` → 全绿

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(r1): 治理页源卡 5→9(里程碑/流水/全预算/桥接+分级缺失告警)+项目清单增合同金额/级别/项目类型列"
```

---

### Task 5: 版本 + PROGRESS + verify + 终审

- [ ] **Step 1**: `frontend/src/version.ts` → `V7.7.0` / `2026-06-12`
- [ ] **Step 2**: PROGRESS.md——头部版本/最近更新；「进行中」改 Phase R：R1 完成待合并（spec 链接 2026-06-12-R-batch），下一期 R2；Handoff R1 条目（七文件摄取量级实测数、科目树双键合并与毛利别名决策、read_only 截断坑、keep_ids 体积护栏、烟雾清单：①治理页 9 源卡数值 ②清单三新列与排序 ③`python preprocess_data.py` 后 analysis_data.json 含三新键且 verify 绿）；backlog：R 批次余项指针（R2/R3/R4 待启动）。
- [ ] **Step 3**: `bash verify.sh` 全绿（pytest 数量 188→200+，vitest 443→450+）
- [ ] **Step 4**: Commit `chore(r1): 版本 V7.7.0 + PROGRESS 记录 R1 完成`，随后 opus 整体终审（diff master..HEAD 对照母 spec §2 + 实测数据复算抽查），终审通过走 finishing-a-development-branch 四选项菜单。
