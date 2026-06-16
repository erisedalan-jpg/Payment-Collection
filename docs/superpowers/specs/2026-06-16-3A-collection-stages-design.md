# 3A 回款换源（collection_stages.csv）+ 详情页脱离 rawNodes — 设计

> 程序背景：用户钦定**全局下线 rawNodes 旧口径**，拆解为 3A（地基：回款换源 + 详情页脱离 rawNodes）→ 3B 概览 → 3C 台账 → 3D 日历 → 3E 移除 rawNodes。本 spec 仅覆盖 **3A**。

## 1. 目标

- 详情页 `/project/:id`「回款（系统核心口径）」改由 `input/collection_stages.csv` 驱动，覆盖全部 9 类收款阶段（预付款/到货款/初验款/终验款/质保金/阶段验收款/合同约定日期收款/驻场验收款/服务-分期款）。
- 取代现有「从 PMIS 里程碑反推回款节点」的口径（`projects.build_payment_pmis` 按 `PAY_STAGES` 仅取到货/初验/终验/驻场）。
- 下线详情页旧口径：回款 tab 的「云文档回款节点（旧口径）」表、进度 tab 的「回款里程碑」表（均基于 rawNodes）。
- `paymentNodes` 是跨页面共享契约，status 词表更新连带适配分层/风险/导出（仅做状态串/配色对齐，**不重设计**那些页面）。

非目标（留给 3B-3E）：概览/台账/日历的 rawNodes 下线；后端 `rawNodes` 字段移除；详情页旧 `payment`（ProjectPayment）口径的后端聚合移除。3A 仅在前端停用它们的展示。

## 2. 数据源画像（input/collection_stages.csv）

UTF-8 BOM；1172 行 / 575 项目（项目编号=合同号粒度）；一行 = 一个收款阶段。15 列，3A 用到：

| 列 | 用途 | 解析 |
|---|---|---|
| 项目编号 | 分组主键（join paymentNodes 键） | 原样 |
| 回款类型 | 阶段大类 → `category`（质保金标识/分组） | 原样 |
| 阶段名称 | 期次级 → `stage`（如「阶段验收款3」「质保金1」） | 原样 |
| 回款比例 | → `payRatio` | `"15.00%"`→0.15 |
| 回款金额 | → `expectedPayment` | float，空→0 |
| 关联日期 | → `termDays`（账期/质保期天数） | int，空→None |
| 计划回款时间 | → `planDate` | epoch ms(**东八区零点**)→`YYYY-MM-DD`(UTC+8)，空→"" |
| 实际回款时间 | → `actualDate` | 同上 |
| 实际比例 | → `actualRatio`（**恒有值，0..1**），并据此派生 status/reached | float |
| 已收金额 | → `receivedAmount` | float，空→0 |
| 未收金额 | → `unpaidAmount` | float，空→0 |

数据特征（已核验）：566/575 项目比例和=100%（9 个 96~102% 为源数据本身，原样展示）；`实际比例` 空值 0/1172（可作 status 唯一真值）；`计划回款时间` 空 26、`实际回款时间` 空 587（=未回款）。

## 3. 架构与数据流

```
input/collection_stages.csv
   │ collection_stages.load_collection_stages(input_dir, today)
   ▼  Dict[项目编号 → List[node]]（每 node 含 status/reached，按 planDate 升序）
preprocess_data.main():  对每个 dept_project 取 eff 口径节点
   │   _nodes = collection.get(eff)；_summary = projects.build_payment_summary(contract, _nodes, pay_record)
   ▼
final_data["paymentNodes"][pid] = _nodes ;  p["paymentPmis"] = _summary
   ▼  schema 校验 → data/analysis_data.json
前端 data.paymentNodes[pid] →
   · 详情页 回款 tab（PMIS_NODE_COLS，本期换源 + 增列）
   · 分层 TierNodesTab / 风险 RiskTab / 导出 projectExport（经 lib/paymentPmis.paymentNodeRows）
```

`projectMilestones`（进度里程碑）在 `preprocess_data.py:1311` 独立输出，`build_payment_*` 只读不改它 → 摘掉回款派生**不影响进度里程碑**。`milestones.py` 完全不改（其 `parse_pay_stage_ratio` 仍服务 projectMilestones 的 payRatio 显示）。

## 4. 后端设计

### 4.1 config.py — 新增常量
```python
COLLECTION_STAGES_FILE = "collection_stages.csv"   # 收款阶段台账（系统核心口径回款源）
```

### 4.2 新增 collection_stages.py（核心，纯函数为主）

复用 `profit.read_csv_rows(path)`（utf-8-sig，缺文件返回 `[]`）。

```python
"""收款阶段台账(input/collection_stages.csv) → 系统核心口径回款节点。
一行=一个收款阶段;按项目编号分组,每组按计划回款日升序(空末尾)。"""
import datetime
import os
from typing import Any, Dict, List, Optional
import config, profit

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
    """'15.00%' → 0.15;无 % 或空 → None。"""
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
    """5 态(实际比例为唯一真值;实际比例列恒有值)。
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
    status = stage_status(category, plan, ar, today)
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
        "reached": ar >= 1,                      # 全额回款
        "status": status,
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

设计要点：
- status 仅由 `(category, planDate, actualRatio, today)` 决定，确定可测；`reached = actualRatio>=1`（与「已回款」对齐，部分回款 reached=False）。
- 缺文件返回 `{}` → 所有项目回款表优雅留空（满足「86 项目导出修好前不报错」要求）。
- 打包/开发同一路径：`os.path.join(BASE_DIR, "input", ...)`，与现有 input 读取（preprocess_data.py:1190/1199/1236）一致，**无需 frozen 分支**。

### 4.3 projects.py 重构

节点构建移至 collection_stages.py，故 `build_payment_pmis(contract, milestones, pay_record, today)` 改为只算摘要的 `build_payment_summary(contract, nodes, pay_record)`；删除 `_node_status` 与 `PAY_STAGES`（成为死代码；status 现由 collection_stages.stage_status 产出）。

```python
def build_payment_summary(contract, nodes, pay_record):
    """系统核心口径回款摘要:计划侧=收款阶段节点;实际侧=项目流水(不分摊节点)。
    nodes 已由 collection_stages 构建(含 status/reached)。fromOrigin 由调用方写。"""
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
摘要字段名与 `ProjectPaymentPmis`（schema 不变）逐一对齐；`deriveProgress`（前端项目级进度桶）取自这些字段，故不受影响。

### 4.4 preprocess_data.py 接入（替换 9f 段，1268-1287）

`main()` 内、9f 段之前一次性载入；循环里取 eff 节点 + 算摘要：
```python
collection_stages = collection_mod.load_collection_stages(
    os.path.join(BASE_DIR, "input"), _today)   # _today 已有
...
for p in dept_projects:
    ...  # _pid/_rid/_eff/_from_origin/_rec 解析逻辑不变(售前回退 relatedClosedId)
    _nodes = collection_stages.get(_eff) or []
    _summary = projects_mod.build_payment_summary(_pmis_contract(_eff), _nodes, _rec)
    _summary["fromOrigin"] = _from_origin
    p["paymentPmis"] = _summary
    payment_nodes[_pid] = _nodes
```
售前回退语义保留：节点按 `_eff`（售前=relatedClosedId）取，与现有合同/流水回退一致。`import collection_stages as collection_mod` 加到文件头。

### 4.5 schema.py 扩展 + 类型生成

`PaymentNodePmis`（157-165）增字段（全部带默认值，向后兼容旧快照/旧数据）：
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
`ProjectPaymentPmis` 不变。改后运行 `cd frontend && npm run gen:types` 重新生成 `src/types/analysis.ts`。

## 5. 状态词表（5 态）与跨页面契约传播

producer：`已回款 / 部分回款 / 质保期 / 延期 / 待回款`（取代旧 `已达成/待达成/延期`）。

`paymentNodes[].status` 消费方全部对齐（机械适配，不重设计页面）：

| 文件 | 现状 | 改为 |
|---|---|---|
| `lib/paymentPmis.ts:224,226`（nodeSummary） | reached=`已达成`、pending=`待达成` | reached=`已回款`；pending=非(已回款/延期)即 `待回款`+`部分回款`+`质保期` |
| `components/TierNodesTab.vue:37,39`（byDim） | 同上分桶 | 同上：`已回款`→reached、`延期`→delayed、其余→pending |
| `TierNodesTab.vue:56`（STATUS_CLASS） | `{已达成:st-ok,延期:st-danger,待达成:st-warn}` | `{已回款:st-ok,延期:st-danger,待回款:st-warn,部分回款:st-warn,质保期:st-warn}` |
| `TierNodesTab.vue:64,66,73`（标签） | 「已达成」「待达成」 | 「已回款」「待回款」 |
| `lib/projectExport.ts:77` | 透传 status | 无需改（透明） |

`RiskTab.vue` 经 `paymentNodeRows` 间接消费，通常筛 `延期`（保留），无需逻辑改动。`部分回款/质保期` 在分层页归入 warn/pending 桶（不细分；细分留 3B-3D 重设计）。

## 6. 前端设计（ProjectDetailView.vue）

### 6.1 回款 tab（模板 308-325 / 脚本 97-141）
- 删旧口径 chips `paySummary`（脚本 123-132）及模板 309-311。
- 删旧口径表 `NODE_COLS`（脚本 133-141）及模板 322；删模板 319 标题「云文档回款节点（旧口径，2B 将下线）」。
- 改模板 321 note：去掉「下表为云文档节点口径」，保留完成率口径说明 + 注明「回款阶段来源 input/collection_stages.csv」。
- `pmisPaySummary`/`pmisPay` 块（312-318）升为主表；`pmisPay` 恒非空（每项目都有 paymentPmis），去掉 `v-if="pmisPay"` 包裹或保留均可。chip「达成/节点」（脚本 110）改标签「已回款/阶段」。
- `PMIS_NODE_COLS`（113-120）增列：
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
- 节点空时显示 `<div class="pd-note">该项目暂无回款阶段数据。</div>`（覆盖 86 项目当前无行的情形）。
- status 列沿用纯文本（与当前 PMIS 表一致）；色彩三态化列为后续 polish，不在 3A。

### 6.2 进度 tab（模板 338-348 / 脚本 143-158）
- 保留 progressInfo chips + 「项目里程碑」MilestoneTable（myMilestones，PMIS 里程碑）。
- 删「回款里程碑」段：模板 345（标题）、346（`MILESTONE_COLS` DataTable on `page.nodes`）、347（else note）。
- 删脚本 `MILESTONE_COLS`（151-158）。

### 6.3 page.nodes / rawNodes
`page.nodes`（rawNodes 过滤）删除上述两表后在详情页不再被引用，但 `rawNodes` 字段与 `page.nodes` 定义**保留**（其他页面仍用；后端 rawNodes 由 3E 移除）。

## 7. 边界与错误处理

- CSV 缺失 / 不可读 → `{}` → 所有回款表留空，不报错（profit.read_csv_rows 已保证）。
- 单行字段空/脏：日期不可解析→`""`；比例无%→`payRatio=None`（前端 fmtRatio 显「-」）；金额脏→0。
- 项目编号空行跳过。
- 比例和≠100%（9 项目）/ 部分回款：原样展示，不纠偏。
- CSV 有、项目域无的 33 项目：load 后在 preprocess 仅按 dept_project 取用，未匹配项目自然忽略（已另存记录，见 §10）。

## 8. 测试

**pytest** `tests/test_collection_stages.py`（新）：
- `stage_status` 五态边界：ar≥1→已回款；0<ar<1→部分回款；ar=0&质保金→质保期；ar=0&plan<today→延期；ar=0&plan≥today/空→待回款。
- `_ms_to_date`（**东八区**：`1782057600000`→`2026-06-22`（非 UTC 的 06-21）/ 空→"" / 脏→""）、`_pct`（`"70.00%"`→0.7 / 空→None）、`_num`、`_int`。
- `load_collection_stages`：分组、按 planDate 升序（空末尾）、缺文件→{}、空项目编号跳过。用临时 CSV fixture。

**pytest** `tests/test_projects.py`（改 305/317/324）：`build_payment_pmis`→`build_payment_summary(contract, nodes, pay_record)`，入参改为预构建 nodes，断言 expectedTotal/nodeCount/reachedCount/delayedCount/paymentRatio/流水 None/合同 None 鲁棒。

**vitest**（前端）改断言词表：`paymentPmis.test.ts`（已达成→已回款、待达成→待回款，新增 部分回款/质保期 分桶）、`TierNodesTab.test.ts`、`ProjectDetailView.test.ts`（308/315 状态串 + 增列渲染 + 节点空留空）、`projectExport.test.ts`。

**契约/集成**：`npm run gen:types` 后 `npm run typecheck`；`bash verify.sh` 全绿（python 编译 + ruff + pytest + 前端 typecheck/vitest/build）。

## 9. 版本与范围

- 版本 V1.6.1 → **V1.6.2**（Z 级：详情页页内局部 + 共享契约对齐）。改 `frontend/src/version.ts` 与 RELEASE_DATE。
- 范围闭环：后端换源 + schema + 5 态契约传播 + 详情页两 tab 改造 + 测试。**不含** 概览/台账/日历改造、后端 rawNodes/payment 移除（3B-3E）。

## 10. 待办 / 缺口记录（不阻塞 3A）

- **86 项目**（现有项目域有、CSV 无收款阶段行）：用户已查为「应有数据、导出端缺失」，由用户修导出端；3A 读 CSV，修好重导后自动填充。其中 80 个现有回款节点本为 0（多为售前服务 WSGF-SF）。清单：`docs/superpowers/research/3A-86项目-CSV无收款阶段.csv`。
- **33 项目**（CSV 有、项目域无）：本期忽略。清单：`docs/superpowers/research/3A-33项目-CSV有但项目域无.csv`。
- `dashboard.totalPaymentNodes`（meta/概览）仍按 rawNodes 计：3B 概览换源时一并处理。
