# 3A 回款换源（collection_stages.csv）+ 详情页脱离 rawNodes 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把详情页「回款（系统核心口径）」的数据源从 PMIS 里程碑反推换为 `input/collection_stages.csv` 全收款阶段台账，并让详情页脱离 rawNodes 旧口径。

**Architecture:** 新增纯函数模块 `collection_stages.py` 读 CSV 生成回款节点（status 5 态、东八区日期）；`projects.build_payment_pmis` 瘦身为 `build_payment_summary`（只聚合摘要）；`preprocess_data.py` 9f 段换源；`schema.PaymentNodePmis` 扩字段并重生成 TS；`paymentNodes.status` 5 态契约同步传播到分层/风险/导出；详情页回款/进度两 tab 改造。

**Tech Stack:** Python 3.8+ 标准库（csv/datetime）+ pydantic（schema）+ pytest；前端 Vue3+TS+Pinia+Element Plus + vitest。

**Spec:** `docs/superpowers/specs/2026-06-16-3A-collection-stages-design.md`
**分支:** `feat/3a-collection-stages`（已建）

---

## 文件结构（改动面）

| 文件 | 职责 | 动作 |
|---|---|---|
| `config.py` | 新增 `COLLECTION_STAGES_FILE` 常量 | Modify |
| `collection_stages.py` | CSV→回款节点（解析/状态派生/分组排序） | Create |
| `tests/test_collection_stages.py` | 上述纯函数单测 | Create |
| `projects.py` | `build_payment_pmis`→`build_payment_summary`；删 `_node_status`/`PAY_STAGES` | Modify 134-173 |
| `tests/test_projects.py` | 适配新签名 | Modify 295-326 |
| `schema.py` | `PaymentNodePmis` 增 5 字段 | Modify 157-165 |
| `frontend/src/types/analysis.ts` | 重生成 | Regen |
| `preprocess_data.py` | 9f 段换源接入 | Modify 1268-1287 + 文件头 import |
| `frontend/src/lib/paymentPmis.ts` | nodeSummary 词表对齐 | Modify 224-226 |
| `frontend/src/components/TierNodesTab.vue` | byDim/STATUS_CLASS/标签词表对齐 | Modify 37-39,56,64-73 |
| `frontend/src/lib/paymentPmis.test.ts`、`TierNodesTab.test.ts` | 测试词表对齐 | Modify |
| `frontend/src/views/ProjectDetailView.vue` | 回款 tab 换主表+增列+删旧表；进度 tab 删回款里程碑表 | Modify |
| `frontend/src/views/ProjectDetailView.test.ts` | 适配 | Modify |
| `frontend/src/version.ts` | V1.6.2 | Modify |
| `PROGRESS.md` | 进度更新 | Modify |

---

## Task 1: config 常量 + collection_stages.py 解析模块（TDD，核心）

**Files:**
- Modify: `config.py`（在第 7 行后新增常量）
- Create: `collection_stages.py`
- Create: `tests/test_collection_stages.py`

- [ ] **Step 1: 写失败测试 `tests/test_collection_stages.py`**

```python
import os

import collection_stages as CS


def test_ms_to_date_tz8():
    # 1782057600000 = 东八区 2026-06-22 00:00（UTC 为 06-21 16:00）；须按 +8 转换
    assert CS._ms_to_date("1782057600000") == "2026-06-22"
    assert CS._ms_to_date("") == ""
    assert CS._ms_to_date("abc") == ""
    assert CS._ms_to_date(None) == ""


def test_pct():
    assert CS._pct("70.00%") == 0.7
    assert CS._pct("15%") == 0.15
    assert CS._pct("") is None
    assert CS._pct("abc") is None


def test_num_and_int():
    assert CS._num("123.5") == 123.5
    assert CS._num("") == 0.0
    assert CS._num("x") == 0.0
    assert CS._int("365.0") == 365
    assert CS._int("") is None
    assert CS._int("x") is None


def test_stage_status_branches():
    today = "2026-06-16"
    assert CS.stage_status("终验款", "2026-01-01", 1.0, today) == "已回款"
    assert CS.stage_status("到货款", "2026-01-01", 0.5, today) == "部分回款"
    assert CS.stage_status("质保金", "", 0.0, today) == "质保期"
    assert CS.stage_status("终验款", "2020-01-01", 0.0, today) == "延期"      # 计划<今天且未收
    assert CS.stage_status("终验款", "2099-01-01", 0.0, today) == "待回款"
    assert CS.stage_status("终验款", "", 0.0, today) == "待回款"
    assert CS.stage_status("质保金", "2026-01-01", 1.0, today) == "已回款"    # 质保金已收→不再质保期


def _write_csv(path, rows):
    import csv
    cols = ["项目编号", "项目名称", "合同编号", "回款类型", "阶段名称", "回款比例", "回款金额",
            "关联日期", "计划回款时间", "实际回款时间", "实际比例", "已收金额", "收款条件", "未收金额", "调整原因"]
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


def test_load_groups_sorts_and_maps(tmp_path):
    p = str(tmp_path)
    _write_csv(os.path.join(p, "collection_stages.csv"), [
        {"项目编号": "X1", "回款类型": "终验款", "阶段名称": "终验款", "回款比例": "90.00%",
         "回款金额": "900000", "关联日期": "20", "计划回款时间": "1782057600000",
         "实际回款时间": "", "实际比例": "0.0", "已收金额": "0", "未收金额": "900000"},
        {"项目编号": "X1", "回款类型": "预付款", "阶段名称": "预付款", "回款比例": "10.00%",
         "回款金额": "100000", "关联日期": "0", "计划回款时间": "1765468800000",
         "实际回款时间": "1765468800000", "实际比例": "1.0", "已收金额": "100000", "未收金额": "0"},
        {"项目编号": "", "回款类型": "终验款", "阶段名称": "终验款", "回款比例": "100%",
         "回款金额": "1", "关联日期": "1", "计划回款时间": "", "实际回款时间": "",
         "实际比例": "0.0", "已收金额": "0", "未收金额": "1"},  # 空项目编号→跳过
    ])
    out = CS.load_collection_stages(p, "2026-06-16")
    assert set(out.keys()) == {"X1"}
    nodes = out["X1"]
    assert len(nodes) == 2
    # 按计划日升序：预付款(2025-12-12) 在 终验款(2026-06-22) 之前
    assert nodes[0]["stage"] == "预付款" and nodes[1]["stage"] == "终验款"
    pre = nodes[0]
    assert pre["category"] == "预付款" and pre["payRatio"] == 0.1
    assert pre["planDate"] == "2025-12-12" and pre["actualDate"] == "2025-12-12"
    assert pre["expectedPayment"] == 100000.0
    assert pre["receivedAmount"] == 100000.0 and pre["unpaidAmount"] == 0.0
    assert pre["actualRatio"] == 1.0 and pre["termDays"] == 0
    assert pre["reached"] is True and pre["status"] == "已回款"
    fin = nodes[1]
    assert fin["planDate"] == "2026-06-22" and fin["reached"] is False
    assert fin["status"] == "待回款"   # 计划 2026-06-22 在 today 之后


def test_load_missing_file_returns_empty(tmp_path):
    assert CS.load_collection_stages(str(tmp_path), "2026-06-16") == {}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_collection_stages.py -q`
Expected: FAIL（`ModuleNotFoundError: No module named 'collection_stages'`）

- [ ] **Step 3: config.py 新增常量**

在 `config.py` 第 7 行（`SHEET_FOLLOWUP = ...`）之后新增：
```python

# ── 收款阶段台账（系统核心口径回款源，位于 input/）──
COLLECTION_STAGES_FILE = "collection_stages.csv"
```

- [ ] **Step 4: 创建 collection_stages.py**

```python
"""收款阶段台账(input/collection_stages.csv) → 系统核心口径回款节点。
一行=一个收款阶段;按项目编号分组,每组按计划回款日升序(空末尾)。"""
import datetime
import os
from typing import Any, Dict, List, Optional

import config
import profit

# CSV 计划/实际回款时间为东八区本地零点的 epoch 毫秒(已核验 1146/1146 落 +8 零点);
# 必须按 UTC+8 转换,否则 utcfromtimestamp 会把每个日期整体提前一天。
_TZ8 = datetime.timezone(datetime.timedelta(hours=8))


def _ms_to_date(v: str) -> str:
    """epoch 毫秒字符串 → 'YYYY-MM-DD'(东八区);空/不可解析 → ''。"""
    s = (v or "").strip()
    if not s:
        return ""
    try:
        return datetime.datetime.fromtimestamp(int(float(s)) / 1000, _TZ8).strftime("%Y-%m-%d")
    except (ValueError, OverflowError, OSError):
        return ""


def _pct(v: str) -> Optional[float]:
    """'15.00%' → 0.15;无 %/空 → None。"""
    s = (v or "").strip().rstrip("%").strip()
    if not s:
        return None
    try:
        return round(float(s) / 100, 4)
    except ValueError:
        return None


def _num(v: str) -> float:
    s = (v or "").strip()
    try:
        return float(s) if s else 0.0
    except ValueError:
        return 0.0


def _int(v: str) -> Optional[int]:
    s = (v or "").strip()
    try:
        return int(float(s)) if s else None
    except ValueError:
        return None


def stage_status(category: str, plan_date: str, actual_ratio: float, today: str) -> str:
    """5 态(实际比例为唯一真值;CSV 实际比例列恒有值)。
    已回款(>=1) / 部分回款(0<ar<1) / 质保期(质保金且未收) / 延期(计划<今天且未收) / 待回款。"""
    ar = actual_ratio or 0.0
    if ar >= 1:
        return "已回款"
    if ar > 0:
        return "部分回款"
    if category == "质保金":
        return "质保期"
    if plan_date and plan_date < today:
        return "延期"
    return "待回款"


def _row_to_node(row: Dict[str, str], today: str) -> Dict[str, Any]:
    category = (row.get("回款类型") or "").strip()
    plan = _ms_to_date(row.get("计划回款时间"))
    ar = _num(row.get("实际比例"))
    return {
        "stage": (row.get("阶段名称") or "").strip(),
        "category": category,
        "planDate": plan,
        "actualDate": _ms_to_date(row.get("实际回款时间")),
        "payRatio": _pct(row.get("回款比例")),
        "expectedPayment": _num(row.get("回款金额")),
        "receivedAmount": _num(row.get("已收金额")),
        "unpaidAmount": _num(row.get("未收金额")),
        "actualRatio": round(ar, 4),
        "termDays": _int(row.get("关联日期")),
        "reached": ar >= 1,                         # 全额回款
        "status": stage_status(category, plan, ar, today),
    }


def load_collection_stages(input_dir: str, today: str) -> Dict[str, List[Dict[str, Any]]]:
    """读 CSV → {项目编号: [node,...]};每组按 planDate 升序(空排末尾)。缺文件 → {}。"""
    rows = profit.read_csv_rows(os.path.join(input_dir, config.COLLECTION_STAGES_FILE))
    by_pid: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        pid = (r.get("项目编号") or "").strip()
        if not pid:
            continue
        by_pid.setdefault(pid, []).append(_row_to_node(r, today))
    for nodes in by_pid.values():
        nodes.sort(key=lambda n: (n["planDate"] == "", n["planDate"]))
    return by_pid
```

- [ ] **Step 5: 跑测试确认通过**

Run: `python -m pytest tests/test_collection_stages.py -q`
Expected: PASS（6 passed）

- [ ] **Step 6: ruff 检查**

Run: `ruff check collection_stages.py tests/test_collection_stages.py`
Expected: 无错误（若报行宽/未用导入，按提示修）

- [ ] **Step 7: Commit**

```bash
git add config.py collection_stages.py tests/test_collection_stages.py
git commit -m "feat(3a): collection_stages.py 解析收款阶段台账(5态状态+东八区日期)+pytest"
```

---

## Task 2: projects.build_payment_summary 重构（TDD）

**Files:**
- Modify: `projects.py:134-173`（删 `PAY_STAGES`/`_node_status`，`build_payment_pmis`→`build_payment_summary`）
- Modify: `tests/test_projects.py:295-326`

- [ ] **Step 1: 改测试 `tests/test_projects.py`**

把 `class TestBuildPaymentPmis`（295-326 整段）替换为：
```python
class TestBuildPaymentSummary:
    def _node(self, stage, expected, reached, status):
        return {"stage": stage, "expectedPayment": expected, "reached": reached, "status": status}

    def test_summary_from_nodes(self):
        import projects as PJ
        nodes = [self._node("到货款", 700000.0, True, "已回款"),
                 self._node("终验款", 300000.0, False, "延期")]
        rec = {"total": 700000.0, "count": 2, "lastDate": "2026-06-04"}
        s = PJ.build_payment_summary(1000000.0, nodes, rec)
        assert s["contract"] == 1000000.0 and s["actualTotal"] == 700000.0 and s["paymentCount"] == 2
        assert s["paymentRatio"] == 0.7 and s["expectedTotal"] == 1000000.0
        assert s["nodeCount"] == 2 and s["reachedCount"] == 1 and s["delayedCount"] == 1
        assert s["lastPaymentDate"] == "2026-06-04" and s["fromOrigin"] is False

    def test_robust_none(self):
        import projects as PJ
        s = PJ.build_payment_summary(None, [], None)
        assert s["paymentRatio"] is None and s["actualTotal"] is None
        assert s["expectedTotal"] == 0 and s["nodeCount"] == 0
        assert s["reachedCount"] == 0 and s["delayedCount"] == 0
```

- [ ] **Step 2: 跑测试确认失败**

Run: `python -m pytest tests/test_projects.py::TestBuildPaymentSummary -q`
Expected: FAIL（`AttributeError: module 'projects' has no attribute 'build_payment_summary'`）

- [ ] **Step 3: 重构 projects.py**

把 `projects.py:134-173`（从 `PAY_STAGES = ...` 到 `build_payment_pmis` 函数 `return summary, nodes` 结束）整段替换为：
```python
def build_payment_summary(contract, nodes, pay_record):
    """系统核心口径回款摘要:计划侧=收款阶段节点(由 collection_stages 构建,含 status/reached);
    实际侧=项目流水(不分摊节点)。fromOrigin 由调用方写。"""
    actual_total = (pay_record or {}).get("total")
    return {
        "contract": contract,
        "actualTotal": actual_total,
        "paymentCount": (pay_record or {}).get("count", 0),
        "paymentRatio": round(actual_total / contract, 4) if (actual_total is not None and contract) else None,
        "expectedTotal": round(sum(n["expectedPayment"] for n in nodes), 2),
        "nodeCount": len(nodes),
        "reachedCount": sum(1 for n in nodes if n["reached"]),
        "delayedCount": sum(1 for n in nodes if n["status"] == "延期"),
        "lastPaymentDate": (pay_record or {}).get("lastDate", ""),
        "fromOrigin": False,
    }
```
（注：`PAY_STAGES` 与 `_node_status` 一并删除——status 现由 `collection_stages.stage_status` 产出；确认 `projects.py` 内无其他引用，本计划 Task 1/Task 4 grep 已确认仅此处。）

- [ ] **Step 4: 跑测试确认通过**

Run: `python -m pytest tests/test_projects.py -q`
Expected: PASS（含其余 projects 测试不回归）

- [ ] **Step 5: Commit**

```bash
git add projects.py tests/test_projects.py
git commit -m "refactor(3a): build_payment_pmis→build_payment_summary(仅聚合;节点构建移交 collection_stages)"
```

---

## Task 3: schema.PaymentNodePmis 扩展 + 重生成 TS 类型

**Files:**
- Modify: `schema.py:157-165`
- Regen: `frontend/src/types/analysis.ts`

- [ ] **Step 1: 扩展 schema.py**

把 `schema.py:157-165` 的 `PaymentNodePmis` 类替换为：
```python
class PaymentNodePmis(_Base):
    stage: str
    category: str = ""
    planDate: str = ""
    actualDate: str = ""
    payRatio: Optional[float] = None
    expectedPayment: float = 0
    receivedAmount: float = 0
    unpaidAmount: float = 0
    actualRatio: Optional[float] = None
    termDays: Optional[int] = None
    reached: bool = False
    status: str = ""
```

- [ ] **Step 2: 校验 schema 可导出**

Run: `python -c "import schema; schema.dump_json_schema('schema.json'); print('ok')"`
Expected: 打印 `ok`，无异常

- [ ] **Step 3: 重生成前端类型**

Run: `cd frontend && npm run gen:types`
Expected: 重写 `frontend/src/types/analysis.ts`，`PaymentNodePmis` 接口含 `category/receivedAmount/unpaidAmount/actualRatio/termDays`

- [ ] **Step 4: 前端类型检查（确认无破坏）**

Run: `cd frontend && npm run typecheck`
Expected: 通过（新增字段均可选/有默认，不破坏现有引用）

- [ ] **Step 5: Commit**

```bash
git add schema.py schema.json frontend/src/types/analysis.ts
git commit -m "feat(3a): PaymentNodePmis 增 category/已收/未收/实际比例/账期 + 重生成 TS 类型"
```

---

## Task 4: preprocess_data.py 9f 段换源接入 + 全量验证

**Files:**
- Modify: `preprocess_data.py`（文件头 import + 1268-1287 段）

- [ ] **Step 1: 文件头加 import**

在 `preprocess_data.py` 现有 `import projects as projects_mod` 等模块导入附近，新增：
```python
import collection_stages as collection_mod
```

- [ ] **Step 2: 换源改写 9f 段**

把 `preprocess_data.py:1268-1287`（`# === 9f. PMIS 核心回款模型...` 到 `print(... fromOrigin ...)`）整段替换为：
```python
    # === 9f. 系统核心口径回款(3A):收款阶段台账 collection_stages.csv;售前回退原项目 ===
    def _pmis_contract(_pid):
        return ((project_pmis.get(_pid) or {}).get("customer") or {}).get("合同总额")
    _today = datetime.now().strftime("%Y-%m-%d")
    collection_stages = collection_mod.load_collection_stages(
        os.path.join(BASE_DIR, "input"), _today)
    payment_nodes = {}
    for p in dept_projects:
        _pid = p["projectId"]
        _rid = p.get("relatedClosedId") or ""
        _eff, _from_origin = _pid, False
        if not _pmis_contract(_pid) and _rid and _pmis_contract(_rid):
            _eff, _from_origin = _rid, True
        # 节点按 eff 取(售前=原项目);流水本项目优先,缺再回退原项目
        _rec = payment_records.get(_pid) or (payment_records.get(_rid) if _rid else None)
        _nodes = collection_stages.get(_eff) or []
        _summary = projects_mod.build_payment_summary(_pmis_contract(_eff), _nodes, _rec)
        _summary["fromOrigin"] = _from_origin
        p["paymentPmis"] = _summary
        payment_nodes[_pid] = _nodes
    print(f"  [OK] 系统核心口径回款已回填 {len(dept_projects)} 项目"
          f"(售前取原项目 {sum(1 for p in dept_projects if p['paymentPmis']['fromOrigin'])}"
          f";收款阶段项目 {len(collection_stages)})")
```
（打包/开发同一路径 `os.path.join(BASE_DIR, "input", ...)`，与 1190/1199/1236 一致，无需 frozen 分支。）

- [ ] **Step 3: 全量 pytest（含管道集成）**

Run: `python -m pytest -q`
Expected: 全绿（`test_projects`/`test_collection_stages`/`test_pipeline_integration` 等均通过）

- [ ] **Step 4: 真实数据冒烟（只读，不改产出）**

Run:
```bash
python -c "import collection_stages as C; d=C.load_collection_stages('input','2026-06-16'); n=d.get('QABJ-SS-202506249001') or []; print('项目数',len(d)); print('样例阶段',[(x['stage'],x['payRatio'],x['planDate'],x['status']) for x in n])"
```
Expected: 打印 `项目数 575`；样例含 `合同约定日期收款1..4` 与 `预付款`，planDate 为东八区日期、status 为 5 态之一

- [ ] **Step 5: Commit**

```bash
git add preprocess_data.py
git commit -m "feat(3a): preprocess 9f 段回款换源为 collection_stages(系统核心口径)"
```

---

## Task 5: 前端 status 5 态契约传播（分层/风险/导出）

**Files:**
- Modify: `frontend/src/lib/paymentPmis.ts:221-229`
- Modify: `frontend/src/components/TierNodesTab.vue:31-73`
- Modify: `frontend/src/lib/paymentPmis.test.ts`、`frontend/src/components/TierNodesTab.test.ts`

- [ ] **Step 1: 改测试 paymentPmis.test.ts**

① `paymentNodeRows` 用例（153-164）节点 status 改词表：`'已达成'`→`'已回款'`，GHOST 的 `'待达成'`→`'待回款'`；断言 163 `status: '已达成'`→`status: '已回款'`。

② `nodeSummary` 用例（174-183）替换为：
```typescript
    const nodes: Record<string, PaymentNodePmis[]> = {
      A: [
        { stage: '到货', status: '已回款', expectedPayment: 70 } as PaymentNodePmis,
        { stage: '终验', status: '延期', expectedPayment: 30 } as PaymentNodePmis,
        { stage: '驻场', status: '待回款', expectedPayment: 10 } as PaymentNodePmis,
        { stage: '阶段', status: '部分回款', expectedPayment: 5 } as PaymentNodePmis,
        { stage: '质保', status: '质保期', expectedPayment: 5 } as PaymentNodePmis,
      ],
    }
    const s = nodeSummary(paymentNodeRows(nodes, projects, {}))
    expect(s).toEqual({ total: 5, reached: 1, delayed: 1, pending: 3, expectedTotal: 120 })
```
（验证 部分回款/质保期/待回款 都归入 pending）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: FAIL（reached/pending 仍按旧词表计数）

- [ ] **Step 3: 改 paymentPmis.ts nodeSummary（224-226）**

把 `nodeSummary` 内三行替换为：
```typescript
    reached: rows.filter((r) => r.status === '已回款').length,
    delayed: rows.filter((r) => r.status === '延期').length,
    pending: rows.filter((r) => r.status !== '已回款' && r.status !== '延期').length,
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/paymentPmis.test.ts`
Expected: PASS

- [ ] **Step 5: 改测试 TierNodesTab.test.ts**

`seed()`（14-15）节点 status `'已达成'`→`'已回款'`；用例描述与断言（25/30/38）`'已达成'`→`'已回款'`。

- [ ] **Step 6: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/components/TierNodesTab.test.ts`
Expected: FAIL

- [ ] **Step 7: 改 TierNodesTab.vue**

① `byDim` 分桶（37-39）替换为：
```typescript
    if (r.status === '已回款') g.reached++
    else if (r.status === '延期') g.delayed++
    else g.pending++
```
② `STATUS_CLASS`（56）替换为：
```typescript
const STATUS_CLASS: Record<string, string> = { 已回款: 'st-ok', 延期: 'st-danger', 待回款: 'st-warn', 部分回款: 'st-warn', 质保期: 'st-warn' }
```
③ 汇总条与表头标签：模板 64 `已达成`→`已回款`、66 `待达成`→`待回款`、73 表头 `<th>已达成</th>...<th>待达成</th>`→`<th>已回款</th>...<th>待回款</th>`。

- [ ] **Step 8: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/components/TierNodesTab.test.ts src/lib/projectExport.test.ts`
Expected: PASS（projectExport 仅透传 status，不应回归）

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/paymentPmis.ts frontend/src/components/TierNodesTab.vue frontend/src/lib/paymentPmis.test.ts frontend/src/components/TierNodesTab.test.ts
git commit -m "refactor(3a): paymentNodes.status 5 态契约传播(分层/风险计数+配色对齐)"
```

---

## Task 6: 详情页 回款/进度 tab 改造

**Files:**
- Modify: `frontend/src/views/ProjectDetailView.vue`（脚本 97-158、模板 308-348）
- Modify: `frontend/src/views/ProjectDetailView.test.ts:298-317`

- [ ] **Step 1: 改测试 ProjectDetailView.test.ts（298-317）**

① 节点 fixture（306-311）补新字段并改 status：
```typescript
    ;(ds.data as any).paymentNodes = { 'P-1': [
      { stage: '到货款', category: '到货款', planDate: '2026-01-01', actualDate: '2026-01-02',
        payRatio: 0.7, expectedPayment: 700000, receivedAmount: 700000, unpaidAmount: 0,
        actualRatio: 1, termDays: 90, reached: true, status: '已回款' },
      { stage: '终验款', category: '终验款', planDate: '2020-01-01', actualDate: '',
        payRatio: 0.3, expectedPayment: 300000, receivedAmount: 0, unpaidAmount: 300000,
        actualRatio: 0, termDays: 20, reached: false, status: '延期' },
    ] }
```
② 断言（313-315）：`toContain('PMIS 回款')`→`toContain('系统核心口径')`；`toContain('已达成')`→`toContain('已回款')`。（不新增列头断言——el-table 列头在 JSDOM 未必渲染；增列由 typecheck + build 兜底。）

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts`
Expected: FAIL（标题/状态串/列头不匹配）

- [ ] **Step 3: 改脚本 — 删旧口径 computed/cols，增列**

① 删除 `paySummary`（123-132 整块）与 `NODE_COLS`（133-141 整块）与 `MILESTONE_COLS`（151-158 整块）。
② `PMIS_NODE_COLS`（113-120）替换为：
```typescript
const PMIS_NODE_COLS: DataColumn[] = [
  { key: 'stage', label: '回款阶段' },
  { key: 'planDate', label: '计划日期', formatter: (v) => fmtDateCell(v) },
  { key: 'actualDate', label: '实际日期', formatter: (v) => fmtDateCell(v) },
  { key: 'payRatio', label: '计划比例', formatter: (v) => fmtRatio(v) },
  { key: 'expectedPayment', label: '计划回款(万)', formatter: (v) => fmtWan(v as number) },
  { key: 'receivedAmount', label: '已收(万)', formatter: (v) => fmtWan(v as number) },
  { key: 'unpaidAmount', label: '未收(万)', formatter: (v) => fmtWan(v as number) },
  { key: 'termDays', label: '账期(天)', formatter: (v) => (v == null ? '-' : String(v)) },
  { key: 'status', label: '状态' },
]
```
③ `pmisPaySummary`（101-112）的 `'达成/节点'`（110）改标签 `'已回款/阶段'`。

- [ ] **Step 4: 改模板 — 回款 tab（308-325）**

把 `<section v-if="tab === 'payment'" ...>` 整段（308-325）替换为：
```html
          <section v-if="tab === 'payment'" class="pd-section">
            <div class="pd-section-title">回款（系统核心口径<span v-if="pmisPay?.fromOrigin">·取原项目</span>）</div>
            <div class="pd-chips">
              <div v-for="it in pmisPaySummary" :key="it.k" class="pd-chip"><span class="pd-chip-k">{{ it.k }}</span><span class="pd-chip-v u-num">{{ it.v }}</span></div>
            </div>
            <div class="pd-note">完成率=回款流水累计÷合同总额（payment_records.csv；售前项目取原项目合同总额）。回款阶段来源 input/collection_stages.csv。</div>
            <DataTable v-if="pmisNodes.length" :columns="PMIS_NODE_COLS" :rows="pmisNodes as any[]" :show-count="false" />
            <div v-else class="pd-note">该项目暂无回款阶段数据。</div>
            <div class="pd-section-title">跟进记录</div>
            <FollowupRecords :project-id="p.projectId" :project-name="p.projectName || ''" />
          </section>
```

- [ ] **Step 5: 改模板 — 进度 tab（删回款里程碑表）**

把进度 tab（338-348）中下面三行删除：
```html
            <div class="pd-section-title">回款里程碑（来源：项目回款节点（里程碑）清单）</div>
            <DataTable v-if="page.nodes.length" :columns="MILESTONE_COLS" :rows="page.nodes" :show-count="false" />
            <div v-else class="pd-note">无里程碑节点记录。</div>
```
保留 progressInfo chips 与「项目里程碑」MilestoneTable。

- [ ] **Step 6: 跑测试 + 类型检查**

Run: `cd frontend && npx vitest run src/views/ProjectDetailView.test.ts && npm run typecheck`
Expected: PASS（typecheck 须确认 `paySummary`/`NODE_COLS`/`MILESTONE_COLS`/`formatCellValue` 删除后无残留引用；若 `formatCellValue` import 变为未使用则一并删除该 import）

- [ ] **Step 7: Commit**

```bash
git add frontend/src/views/ProjectDetailView.vue frontend/src/views/ProjectDetailView.test.ts
git commit -m "feat(3a): 详情页回款tab换源主表+增列、删旧口径表与chips;进度tab删回款里程碑表"
```

---

## Task 7: 版本 V1.6.2 + 全量 verify + PROGRESS

**Files:**
- Modify: `frontend/src/version.ts`
- Modify: `PROGRESS.md`

- [ ] **Step 1: 版本号**

`frontend/src/version.ts` 替换为：
```typescript
// 版本号/发布信息单一来源（约定：发版时只改此处）。
export const APP_VERSION = 'V1.6.2'
export const RELEASE_DATE = '2026-06-16'
```

- [ ] **Step 2: 全量验证**

Run: `bash verify.sh`
Expected: 全绿（python 编译 + ruff + pytest + 前端 typecheck/vitest/build）

- [ ] **Step 3: 更新 PROGRESS.md**

在 PROGRESS.md 进行中/已完成区记一行（in_progress→done 形式按本仓库现有写法），写明：3A 回款换源 collection_stages.csv（系统核心口径全收款阶段）+ 详情页脱离 rawNodes；版本 V1.6.2；遗留 86 项目（导出端缺失，待用户修导出后重导自动填充）、33 项目（CSV 多出，忽略）记录于 `docs/superpowers/research/`。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/version.ts PROGRESS.md
git commit -m "chore(3a): 版本 V1.6.2 + PROGRESS(回款换源 collection_stages 完成)"
```

---

## 自审（计划 vs spec）

**1. spec 覆盖**
- §4.1 config 常量 → T1 Step3 ✓
- §4.2 collection_stages.py（_ms_to_date 东八区/_pct/_num/_int/stage_status/_row_to_node/load）→ T1 ✓
- §4.3 build_payment_summary + 删 _node_status/PAY_STAGES → T2 ✓
- §4.4 preprocess 9f 换源（售前 eff 回退保留）→ T4 ✓
- §4.5 schema 扩字段 + gen:types → T3 ✓
- §5 status 5 态契约传播（paymentPmis.ts/TierNodesTab.vue + 测试）→ T5 ✓
- §6.1 回款 tab 换主表+增列+删旧表/chips/note → T6 Step3-4 ✓
- §6.2 进度 tab 删回款里程碑表 → T6 Step5 ✓
- §8 测试（test_collection_stages 新建、test_projects 改、4 vitest 改、verify.sh）→ T1/T2/T5/T6/T7 ✓
- §9 版本 V1.6.2 → T7 ✓
- §10 缺口记录（86/33）→ 已在 spec 提交时归档，T7 Step3 PROGRESS 复述 ✓

**2. 占位扫描**：无 TBD/TODO；每个改码步骤均含完整代码或精确 old→new。

**3. 类型/签名一致**：
- `build_payment_summary(contract, nodes, pay_record)` 在 T2 定义、T4 调用一致；摘要字段（contract/actualTotal/paymentCount/paymentRatio/expectedTotal/nodeCount/reachedCount/delayedCount/lastPaymentDate/fromOrigin）与 schema `ProjectPaymentPmis`（不变）一致。
- 节点字段（stage/category/planDate/actualDate/payRatio/expectedPayment/receivedAmount/unpaidAmount/actualRatio/termDays/reached/status）在 T1 产出、T3 schema、T6 列定义三处一致。
- status 词表 `已回款/部分回款/质保期/延期/待回款` 在 T1 产出、T5 消费、T6 显示三处一致。
- `load_collection_stages(input_dir, today)` 在 T1 定义、T4 调用一致。
