# 回款数据比对报告 实施计划（第一期诊断）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现。步骤用 `- [ ]` 复选框追踪。

**Goal:** 产出一次性离线诊断脚本 `compare_payment_sources.py`，逐项目比对"人工云文档 vs PMIS 系统"，输出数据源归属清单 + 逐项目偏差 CSV + 汇总 MD。

**Architecture:** 单脚本 `compare_payment_sources.py`：纯函数（比例/金额/日期/分级）+ 装载器（云文档主表/节点清单直读 xlsx，PMIS 流水/里程碑/合同总额复用现有解析器，并解析里程碑`关联回款阶段`抽节点级计划比例）+ 比对装配 + 三份报告写出。纯函数走 pytest；产物落 `report/`（gitignore）；**不接管线、不改看板、不升应用版本**。依据 `docs/superpowers/specs/2026-06-15-payment-compare-report-design.md`。

**Tech Stack:** Python 标准库 + openpyxl + 复用 profit/milestones/pmis。

**分级调度：**

| 任务 | 难度 | 派发 | 理由 |
|---|---|---|---|
| T1 纯函数 + pytest | 常规 | sonnet 子代理 | 独立可测，TDD |
| T2 脚本主体（装载/解析/join/比对/报告/main） | 易踩坑 | opus 子代理 | xlsx 多表头、PMIS read_only=False、join 键、关联回款阶段解析、复用解析器 |
| T3 .gitignore + 真实数据冒烟 + py_compile/ruff | 机械 | 主循环 | 收尾验证 |

子代理产出经 git diff + pytest + 真实数据冒烟核实。顺序 T1 → T2（用 T1 纯函数）→ T3。

## 文件结构
- 新建 `compare_payment_sources.py`（项目根，纯函数 + 装载 + 比对 + 报告 + `if __name__=='__main__'` main）
- 新建 `tests/test_payment_compare.py`（pytest，import 纯函数）
- 改 `.gitignore`（加 `report/`）

---

### Task 1: 纯函数 + pytest（TDD）

**Files:** Create `compare_payment_sources.py`（先只放纯函数与常量）、`tests/test_payment_compare.py`

- [ ] **Step 1: 写失败测试 `tests/test_payment_compare.py`**

```python
import compare_payment_sources as C


def test_parse_pay_stage_ratio():
    assert C.parse_pay_stage_ratio("到货款1，70.00%") == 0.70
    assert C.parse_pay_stage_ratio("终验款，100.00%") == 1.0
    assert C.parse_pay_stage_ratio("") is None
    assert C.parse_pay_stage_ratio(None) is None
    assert C.parse_pay_stage_ratio("无比例文字") is None


def test_parse_ratio():
    assert C.parse_ratio(0.6) == 0.6
    assert C.parse_ratio(1) == 1.0
    assert C.parse_ratio("60%") == 0.6
    assert C.parse_ratio("60") == 0.6        # >1.5 视作百分数
    assert C.parse_ratio(1.08) == 1.08       # 108% 合法,不再除
    assert C.parse_ratio("") is None
    assert C.parse_ratio(None) is None
    assert C.parse_ratio("空值") is None


def test_diff_flag():
    assert C.diff_flag(0.9, 1.0, 0.10) is False   # 0.10 不算超
    assert C.diff_flag(0.85, 1.0, 0.10) is True    # 0.15 超
    assert C.diff_flag(None, 1.0, 0.10) is False   # 一侧空,不算异常
    assert C.diff_flag(1.0, None, 0.10) is False


def test_node_actual_amount():
    assert C.node_actual_amount(1000000, 0.7, 1.0) == 700000.0
    assert C.node_actual_amount(1000000, 0.7, 0.5) == 350000.0
    assert C.node_actual_amount(1000000, None, 0.5) == 0.0
    assert C.node_actual_amount(None, 0.7, 1.0) == 0.0


def test_days_between():
    assert C.days_between("2026-06-01", "2026-06-30") == 29
    assert C.days_between("2026-06-30", "2026-06-01") == 29
    assert C.days_between("2026-06-01T00:00:00", "2026-06-11") == 10
    assert C.days_between("", "2026-06-01") is None
    assert C.days_between("bad", "2026-06-01") is None


def test_classify_level():
    assert C.classify_level(0) == "绿"
    assert C.classify_level(1) == "黄"
    assert C.classify_level(2) == "红"
    assert C.classify_level(3) == "红"
```

- [ ] **Step 2: 运行确认失败**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m pytest tests/test_payment_compare.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'compare_payment_sources'`）。

- [ ] **Step 3: 实现纯函数（`compare_payment_sources.py` 顶部）**

```python
"""回款数据比对报告(第一期诊断,一次性离线脚本)。
逐项目比对"人工云文档(交付中心 xlsx) vs PMIS 系统",产出数据源归属清单+逐项目偏差+汇总。
只读,不接入管线、不改看板。依据 docs/superpowers/specs/2026-06-15-payment-compare-report-design.md。
"""
import csv
import os
import re
from datetime import datetime

# —— 阈值/常量(可调) ——
THRESH_NODE_RATIO = 0.01      # 节点级计划比例逐阶段差
THRESH_RATIO_PP = 0.10        # 项目级回款百分比差(10pp)
THRESH_AMOUNT = 50000.0       # 回款金额差(元)
THRESH_AMOUNT_REL = 0.20      # 回款金额相对差
THRESH_DAYS = 30              # 里程碑日期差(天)

CLOUD_XLSX = "input/交付中心-全量项目清单-交付实施三部.xlsx"
SHEET_MASTER = "数据源表_全量项目清单 (2)"
SHEET_NODES = "项目回款节点（里程碑）清单"
PMIS_DIR = "input/pmis"
INPUT_DIR = "input"
OUT_DIR = "report"
# PMIS 里程碑"关联回款阶段"列(阶段名→列名)
PMIS_STAGE_COLS = {"到货": "到货关联回款阶段", "初验": "初验关联回款阶段",
                   "终验": "终验关联回款阶段", "驻场": "驻场关联回款阶段"}


def parse_pay_stage_ratio(cell):
    """'到货款1，70.00%' → 0.70;空/无% → None。"""
    if not cell:
        return None
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*%", str(cell))
    return round(float(m.group(1)) / 100, 4) if m else None


def parse_ratio(v):
    """手填回款比例 → 0-1 小数。兼容 0.6 / '60%' / '60' / '' / None / '空值'。>1.5 视作百分数。"""
    if v is None or v == "" or v == "空值":
        return None
    if isinstance(v, (int, float)):
        return round(float(v), 4)
    s = str(v).strip().replace("%", "")
    if not s or s == "空值":
        return None
    try:
        n = float(s)
    except ValueError:
        return None
    return round(n / 100, 4) if n > 1.5 else round(n, 4)


def diff_flag(a, b, thresh):
    """|a-b| > thresh → True;任一 None → False(无法比,不算异常)。"""
    if a is None or b is None:
        return False
    return abs(a - b) > thresh


def node_actual_amount(project_amount, plan_ratio, actual_ratio):
    """节点实际回款金额 = 项目金额 × 关联回款比例 × 实际回款比例;任一 None → 0。"""
    return round((project_amount or 0) * (plan_ratio or 0) * (actual_ratio or 0), 2)


def days_between(d1, d2):
    """两个 'YYYY-MM-DD…' 字符串相差天数(绝对值);任一空/不可解析 → None。"""
    try:
        a = datetime.strptime(str(d1)[:10], "%Y-%m-%d")
        b = datetime.strptime(str(d2)[:10], "%Y-%m-%d")
        return abs((a - b).days)
    except (TypeError, ValueError):
        return None


def classify_level(strong_anomaly_count):
    return "红" if strong_anomaly_count >= 2 else ("黄" if strong_anomaly_count == 1 else "绿")
```

- [ ] **Step 4: 运行确认通过**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m pytest tests/test_payment_compare.py -q`
Expected: 6 项全 PASS。若 `parse_ratio` 边界不符按测试修实现（不改测试断言）。

- [ ] **Step 5: 语法 + ruff**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m py_compile compare_payment_sources.py && python -m ruff check compare_payment_sources.py tests/test_payment_compare.py`
Expected: 无错误。

- [ ] **Step 6: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add compare_payment_sources.py tests/test_payment_compare.py
git commit -m "feat(compare): 回款比对纯函数(比例/金额/日期/分级)+pytest"
```

---

### Task 2: 脚本主体（装载 / 解析 / join / 比对 / 报告 / main）

**Files:** Modify `compare_payment_sources.py`（在纯函数之后追加装载/比对/报告/main）

依赖 T1 纯函数。**坑位提醒**：PMIS 里程碑表 `read_only=False`（read_only 会截断），表头在**第 2 行**（第 1 行是标题）；云文档 xlsx 用 `read_only=True, data_only=True`；join 键 = 主表 `当前在建项目编号`（实测 ∩流水 320/395，用 `项目编号` 仅 132/395）。

- [ ] **Step 1: 列名定位 + 云文档读取**

追加：
```python
import openpyxl
import warnings

import profit as profit_mod
import milestones as milestones_mod
import pmis as pmis_mod

warnings.filterwarnings("ignore")


def _col_idx(header, *subs):
    """按列名子串定位下标(首个命中);找不到 → None。"""
    for i, h in enumerate(header):
        hs = str(h or "").strip()
        if all(s in hs for s in subs):
            return i
    return None


def load_cloud_master(path):
    """主表 → {pid(当前在建项目编号): {项目名称,L4,合同总额,手填已回款比例,项目状态,合同编号}}。"""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[SHEET_MASTER]
    it = ws.iter_rows(values_only=True)
    hdr = [str(h or "").strip() for h in next(it)]
    ci = {
        "pid": _col_idx(hdr, "当前在建项目编号"), "name": _col_idx(hdr, "项目名称"),
        "l4": _col_idx(hdr, "新L4组织"), "contract": _col_idx(hdr, "合同总额"),
        "ratio": _col_idx(hdr, "已回款比例"), "status": _col_idx(hdr, "项目状态"),
        "cno": _col_idx(hdr, "合同编号"), "pm": _col_idx(hdr, "项目经理"),
    }
    out = {}
    for r in it:
        pid = str(r[ci["pid"]]).strip() if ci["pid"] is not None and r[ci["pid"]] else ""
        if not pid:
            continue
        out[pid] = {
            "项目名称": r[ci["name"]] if ci["name"] is not None else "",
            "L4": r[ci["l4"]] if ci["l4"] is not None else "",
            "项目经理": r[ci["pm"]] if ci["pm"] is not None else "",
            "合同编号": r[ci["cno"]] if ci["cno"] is not None else "",
            "合同总额": r[ci["contract"]] if ci["contract"] is not None else None,
            "手填已回款比例": parse_ratio(r[ci["ratio"]]) if ci["ratio"] is not None else None,
            "项目状态": r[ci["status"]] if ci["status"] is not None else "",
        }
    wb.close()
    return out


def load_cloud_nodes(path):
    """节点清单 → {pid: {阶段名: {plan_ratio, actual_ratio, plan_date, related}}}。
    阶段名取自'里程碑节点'(到货/初验/终验/驻场…)。"""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[SHEET_NODES]
    it = ws.iter_rows(values_only=True)
    hdr = [str(h or "").strip() for h in next(it)]
    ci = {k: _col_idx(hdr, s) for k, s in {
        "pid": "项目编号", "amount": "项目金额", "node": "里程碑节点",
        "plan_date": "该节点计划完成时间", "related": "是否关联回款",
        "plan_ratio": "关联回款比例", "actual_ratio": "实际回款比例"}.items()}
    out = {}
    for r in it:
        pid = str(r[ci["pid"]]).strip() if ci["pid"] is not None and r[ci["pid"]] else ""
        node = str(r[ci["node"]]).strip() if ci["node"] is not None and r[ci["node"]] else ""
        if not pid or not node:
            continue
        d = out.setdefault(pid, {"_amount": r[ci["amount"]] if ci["amount"] is not None else None, "nodes": {}})
        d["nodes"][node] = {
            "plan_ratio": _num(r[ci["plan_ratio"]]) if ci["plan_ratio"] is not None else None,
            "actual_ratio": _num(r[ci["actual_ratio"]]) if ci["actual_ratio"] is not None else None,
            "plan_date": r[ci["plan_date"]] if ci["plan_date"] is not None else None,
            "related": str(r[ci["related"]]).strip() == "是" if ci["related"] is not None and r[ci["related"]] else False,
        }
    wb.close()
    return out


def _num(v):
    try:
        return round(float(v), 4)
    except (TypeError, ValueError):
        return None
```

- [ ] **Step 2: PMIS 里程碑关联回款阶段解析（节点级计划比例）**

```python
def load_pmis_stage_ratios(pmis_dir):
    """读两张里程碑表(read_only=False,表头第2行),解析4个关联回款阶段列 →
    {pid: {阶段名: 计划回款比例}}。同 pid 在建优先(先读在建,已结项不覆盖)。"""
    import config
    out = {}
    for fn in [config.MILESTONE_FILE_ACTIVE, config.MILESTONE_FILE_CLOSED]:
        fp = os.path.join(pmis_dir, fn)
        if not os.path.exists(fp):
            continue
        wb = openpyxl.load_workbook(fp, read_only=False, data_only=True)
        ws = wb[wb.sheetnames[0]]
        rows = list(ws.iter_rows(values_only=True))
        wb.close()
        if len(rows) < 2:
            continue
        hdr = [str(h or "").strip() for h in rows[1]]          # 表头第2行
        pid_i = _col_idx(hdr, "项目编号")
        stage_i = {st: _col_idx(hdr, col) for st, col in PMIS_STAGE_COLS.items()}
        for r in rows[2:]:
            if not any(r):
                continue
            pid = str(r[pid_i]).strip() if pid_i is not None and pid_i < len(r) and r[pid_i] else ""
            if not pid or pid in out:                          # 在建优先:已存在则跳过
                continue
            d = {}
            for st, ci in stage_i.items():
                if ci is not None and ci < len(r):
                    rt = parse_pay_stage_ratio(r[ci])
                    if rt is not None:
                        d[st] = rt
            if d:
                out[pid] = d
    return out
```

注：`config.MILESTONE_FILE_ACTIVE/CLOSED` 即两张里程碑文件名（已在 config）。

- [ ] **Step 3: 比对装配 `build_rows`**

按 spec §4/§6 逐项目装配。要点：keep_ids = 主表全部 pid；PMIS 流水/合同总额复用解析器；节点级计划比例 = 云文档节点 `plan_ratio` vs PMIS `load_pmis_stage_ratios` 同阶段；强异常计数 = 节点比例分歧/项目回款百分比/回款金额/里程碑日期 四类命中数。

```python
def build_rows(base_dir):
    master = load_cloud_master(os.path.join(base_dir, CLOUD_XLSX))
    nodes = load_cloud_nodes(os.path.join(base_dir, CLOUD_XLSX))
    keep = set(master.keys())
    pay, _ = profit_mod.load_payment_records(os.path.join(base_dir, INPUT_DIR), keep)
    pmis_map, _ = pmis_mod.load_project_pmis(os.path.join(base_dir, PMIS_DIR), keep)
    pmis_stage = load_pmis_stage_ratios(os.path.join(base_dir, PMIS_DIR))
    ms, _, _ = milestones_mod.load_milestones(os.path.join(base_dir, PMIS_DIR), keep)
    rows = []
    for pid, m in master.items():
        contract = _num(m["合同总额"])
        rec = pay.get(pid) or {}
        pmis_total = rec.get("total")
        pmis_count = rec.get("count", 0)
        pmis_ratio = round(pmis_total / contract, 4) if (pmis_total is not None and contract) else None
        # 项目回款百分比
        ratio_diff = (None if (pmis_ratio is None or m["手填已回款比例"] is None)
                      else round(pmis_ratio - m["手填已回款比例"], 4))
        ratio_anom = diff_flag(pmis_ratio, m["手填已回款比例"], THRESH_RATIO_PP)
        # 节点级计划比例逐阶段分歧
        cnodes = (nodes.get(pid) or {}).get("nodes", {})
        camount = (nodes.get(pid) or {}).get("_amount")
        pstage = pmis_stage.get(pid, {})
        ratio_mismatch_stages = []
        for st, prt in pstage.items():
            crt = next((v["plan_ratio"] for k, v in cnodes.items() if st in k), None)
            if crt is not None and diff_flag(prt, crt, THRESH_NODE_RATIO):
                ratio_mismatch_stages.append(f"{st}(PMIS{prt}/云{crt})")
        node_ratio_anom = bool(ratio_mismatch_stages)
        # 回款金额:云节点 Σ实际 vs PMIS 流水累计
        cloud_actual_amt = round(sum(
            node_actual_amount(camount, v["plan_ratio"], v["actual_ratio"])
            for v in cnodes.values() if v["related"]), 2)
        amt_diff = (None if pmis_total is None else round(pmis_total - cloud_actual_amt, 2))
        amt_anom = diff_flag(pmis_total, cloud_actual_amt, THRESH_AMOUNT)
        # 笔数/个数
        cloud_paid_nodes = sum(1 for v in cnodes.values() if v["related"] and (v["actual_ratio"] or 0) >= 1)
        cloud_rel_nodes = sum(1 for v in cnodes.values() if v["related"])
        pmis_rel_ms = len(pstage)
        # 里程碑日期分歧(按阶段对齐 PMIS 里程碑 planDate)
        ms_items = {it_["payStage"]: it_ for it_ in (ms.get(pid) or []) if it_.get("payStage")}
        date_anom_stages = []
        for st in pstage:
            c_node = next((v for k, v in cnodes.items() if st in k), None)
            p_ms = next((it_ for key, it_ in ((i.get("name"), i) for i in (ms.get(pid) or []))
                         if key and st in str(key)), None)
            if c_node and p_ms:
                dd = days_between(c_node["plan_date"], p_ms.get("planDate"))
                if dd is not None and dd > THRESH_DAYS:
                    date_anom_stages.append(f"{st}({dd}天)")
        strong = sum([node_ratio_anom, ratio_anom, amt_anom, bool(date_anom_stages)])
        flags = []
        if m["手填已回款比例"] is None:
            flags.append("手填比例未填")
        if pmis_total is None:
            flags.append("PMIS无流水")
        if not contract:
            flags.append("PMIS无合同总额")
        if not pstage:
            flags.append("PMIS无关联回款比例")
        if cloud_rel_nodes != pmis_rel_ms:
            flags.append("节点个数不一致")
        if cloud_paid_nodes != pmis_count:
            flags.append("笔数不一致")
        rows.append({
            "pid": pid, "项目名称": m["项目名称"], "L4": m["L4"], "项目经理": m["项目经理"],
            "合同编号": m["合同编号"], "合同总额": contract, "项目状态": m["项目状态"],
            "手填已回款比例": m["手填已回款比例"], "PMIS流水比例": pmis_ratio, "比例差": ratio_diff,
            "比例异常": ratio_anom, "节点比例分歧阶段": "；".join(ratio_mismatch_stages),
            "云已回款金额": cloud_actual_amt, "PMIS流水累计": pmis_total, "金额差": amt_diff, "金额异常": amt_anom,
            "云已回款节点数": cloud_paid_nodes, "PMIS笔数": pmis_count,
            "云回款节点数": cloud_rel_nodes, "PMIS关联回款里程碑数": pmis_rel_ms,
            "里程碑日期异常阶段": "；".join(date_anom_stages),
            "强异常维度数": strong, "等级": classify_level(strong), "标记位": "；".join(flags),
        })
    return rows, {"master": len(master), "pay": len(pay), "pmis_stage": len(pmis_stage)}
```

（注：里程碑日期对齐取 PMIS 里程碑 `name` 含阶段名者的 `planDate`；实现时按 milestones.py 实际返回字段微调，保证 planDate 键名正确。）

- [ ] **Step 4: 三份报告写出 + main**

```python
CSV_COLS = ["pid", "项目名称", "L4", "项目经理", "合同编号", "合同总额", "项目状态",
            "手填已回款比例", "PMIS流水比例", "比例差", "比例异常", "节点比例分歧阶段",
            "云已回款金额", "PMIS流水累计", "金额差", "金额异常",
            "云已回款节点数", "PMIS笔数", "云回款节点数", "PMIS关联回款里程碑数",
            "里程碑日期异常阶段", "强异常维度数", "等级", "标记位"]


def write_reports(rows, stat, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    # 逐项目 CSV
    with open(os.path.join(out_dir, "回款比对_逐项目.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLS, extrasaction="ignore")
        w.writeheader()
        for r in sorted(rows, key=lambda x: -x["强异常维度数"]):
            w.writerow(r)
    # 汇总 MD
    n = len(rows)
    red = sum(1 for r in rows if r["等级"] == "红")
    yellow = sum(1 for r in rows if r["等级"] == "黄")
    from collections import Counter
    fc = Counter(fl for r in rows for fl in (r["标记位"].split("；") if r["标记位"] else []))
    lines = [f"# 回款比对汇总", "",
             f"- 参与比对项目: {n}（红 {red} / 黄 {yellow} / 绿 {n-red-yellow}）",
             f"- join 命中: 主表 {stat['master']} / 流水 {stat['pay']} / PMIS含比例 {stat['pmis_stage']}", "",
             "## 标记位分布"]
    for k, v in fc.most_common():
        lines.append(f"- {k}: {v}（{round(v/n*100,1)}%）")
    lines += ["", "## 红等级 Top 异常"]
    for r in [r for r in rows if r["等级"] == "红"][:50]:
        lines.append(f"- {r['pid']} {r['项目名称']}: 比例差 {r['比例差']} / 金额差 {r['金额差']} / "
                     f"节点分歧 {r['节点比例分歧阶段']} / 日期异常 {r['里程碑日期异常阶段']}")
    lines += ["", f"## 阈值", f"- 节点比例 {THRESH_NODE_RATIO} / 百分比 {THRESH_RATIO_PP} / "
              f"金额 {THRESH_AMOUNT} / 日期 {THRESH_DAYS}天"]
    with open(os.path.join(out_dir, "回款比对_汇总.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    # 数据源归属清单(静态结论,见 spec §3)
    with open(os.path.join(out_dir, "数据源归属清单.md"), "w", encoding="utf-8") as f:
        f.write(SRC_INVENTORY_MD)


SRC_INVENTORY_MD = '''# 数据源归属清单(回款看板字段 → PMIS可/人工only)

## PMIS 可（以 PMIS 为准）
项目编号/金额/合同总额、tier、orgL4/项目经理、里程碑节点名+计划/实际日期、
**节点级计划回款比例**(解析里程碑"关联回款阶段")、是否已达成里程碑(actualDate非空近似)、
项目实际到账(流水累计)、回款笔数、项目回款%(流水÷合同)、签约形式分类。

## 人工 only（无法 PMIS 化）
- G1 节点级实际回款比例(严格手填;可用里程碑达成+项目流水重定义)
- G2 加资源可提前 canAdvance
- G3 业务分类标签(BH/退换货/0元单/框架/维保;"已100%回款""已关闭"可PMIS派生)
- G4 纳管(工具自有域控制开关)
- G5 跟进记录(工具自有+云文档回写)

> G3/G4 第二期由项目标签体系承载;G1 第二期改 PMIS 口径;G2 多半可弃。
'''


def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    rows, stat = build_rows(base_dir)
    write_reports(rows, stat, os.path.join(base_dir, OUT_DIR))
    red = sum(1 for r in rows if r["等级"] == "红")
    print(f"[OK] 比对完成: {len(rows)} 项目, 红 {red}; 报告见 {OUT_DIR}/")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: 语法 + ruff + 既有测试不回归**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && python -m py_compile compare_payment_sources.py && python -m ruff check compare_payment_sources.py && python -m pytest tests/test_payment_compare.py -q`
Expected: 编译/ruff 无错；pytest 6 项仍 PASS。

- [ ] **Step 6: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add compare_payment_sources.py
git commit -m "feat(compare): 装载/解析关联回款阶段/join/比对/三报告+main"
```

---

### Task 3: .gitignore + 真实数据冒烟 + 验证（主循环）

**Files:** Modify `.gitignore`

- [ ] **Step 1: `.gitignore` 加 `report/`**

在"生成物/运行时数据"段加：
```
# 回款比对报告(含真实业务数据,一次性产物,不入库)
report/
```

- [ ] **Step 2: 真实数据冒烟跑脚本**

Run: `cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection" && PYTHONIOENCODING=utf-8 python compare_payment_sources.py`
Expected: 打印 `[OK] 比对完成: N 项目...`；`report/` 下生成三文件。
核对：`ls report/ && head -3 report/回款比对_逐项目.csv && cat report/回款比对_汇总.md | head -25`
人工抽查 3-5 个项目差异与 xlsx/流水原值一致；确认节点比例分歧量级与立项实测（215一致/15分歧）同量级；记录红黄绿分布与 join 命中率。

- [ ] **Step 3: 提交**

```bash
cd "C:/Users/tjusu/Desktop/cc/work/tools/Payment Collection"
git add .gitignore
git commit -m "chore(compare): report/ 入 gitignore"
```

---

## 收尾
全部任务完成、纯函数 pytest 全绿、真实数据冒烟产出三报告并抽查无误后，用 superpowers:finishing-a-development-branch 收束（惯例「1 合并回 master」→ 复跑 pytest → 删分支）。**不升应用版本**（诊断脚本，非应用发布）。报告产物供你人工判断异常规模，决定第二期 2A 起步。

## 自检（writing-plans 强制）
- **spec 覆盖**：§1 产物三文件→T2 write_reports；§2 join 键/装载→T2 Step1-3；§3 归属清单→T2 SRC_INVENTORY_MD；§4 六维比对→T2 build_rows；§5 分级→T1 classify_level + T2 strong 计数；§6 报告结构→T2 Step4；§7 实现要点(read_only=False/表头第2行/复用解析器/常量)→T2；§8 测试→T1+T3。
- **占位符**：无 TBD；纯函数与脚本主体均给完整代码；里程碑日期对齐字段名注明按 milestones.py 实际微调（已标注，opus 实现时核对）。
- **命名一致**：纯函数 `parse_pay_stage_ratio/parse_ratio/diff_flag/node_actual_amount/days_between/classify_level` 在 T1 定义、T2 调用一致；CSV_COLS 与 build_rows 行字典键一致；join 键当前在建项目编号贯穿。
- **依赖顺序**：T2 依赖 T1 纯函数；计划已声明 T1→T2→T3。
