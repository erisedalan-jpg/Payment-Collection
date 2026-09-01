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
        return config.STAGE_STATUS_PAID
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
    expected = _num(row.get("回款金额"))
    received = _num(row.get("已收金额"))
    return {
        "stage": (row.get("阶段名称") or "").strip(),
        "category": category,
        "planDate": plan,
        "actualDate": _ms_to_date(row.get("实际回款时间")),
        "payRatio": _pct(row.get("回款比例")),
        "expectedPayment": expected,
        "receivedAmount": received,
        # 未收金额=回款−已收 派生,不读 CSV"未收金额"列:PMIS 导出对部分阶段该列缺值留 0
        # (44/1457 行 已收=0 却未收=0),致"待回款"误显 0。派生原样复现正确行(含超收负值)、修好缺值行。
        "unpaidAmount": round(expected - received, 2),
        "actualRatio": round(ar, 4),
        "termDays": _int(row.get("关联日期")),
        "payTerm": (row.get("收款条件") or "").strip(),
        "reached": ar >= 1,                         # 全额回款
        "status": stage_status(category, plan, ar, today),
    }


def _num_ok(v: Any) -> bool:
    """判定一个金额单元格是否"可解析"：留空视为合法(不计失败),
    能 float() 解析视为合法,否则(如千分位逗号/非数字文本)判定为解析失败。"""
    s = (v or "").strip()
    if not s:
        return True
    try:
        float(s)
        return True
    except ValueError:
        return False


def count_parse_errors(input_dir: str) -> Dict[str, int]:
    """治理告警:逐行扫描收款台账 CSV,统计"非空白但无法解析"的单元格数,
    分金额/日期/比例三类;PMIS 导出格式漂移会让 _num/_ms_to_date/_pct 静默降级
    为 0/''/None,此计数让漂移在 dataQuality 里可见,而不改变现有解析口径。
    缺文件 → 全 0(与 load_collection_stages 的"缺文件→{}"降级一致)。"""
    rows = profit.read_csv_rows(os.path.join(input_dir, config.COLLECTION_STAGES_FILE))
    errors = {"amount": 0, "date": 0, "ratio": 0}
    for r in rows:
        for col in ("回款金额", "已收金额"):
            if not _num_ok(r.get(col)):
                errors["amount"] += 1
        for col in ("计划回款时间", "实际回款时间"):
            v = (r.get(col) or "").strip()
            if v and not _ms_to_date(v):
                errors["date"] += 1
        # 回款比例:_row_to_node 用 _pct 解析(payRatio)
        rr = (r.get("回款比例") or "").strip()
        if rr and _pct(rr) is None:
            errors["ratio"] += 1
        # 实际比例:_row_to_node 用 _num 解析(actualRatio),故用 _num_ok 判失败对齐真实降级
        if not _num_ok(r.get("实际比例")):
            errors["ratio"] += 1
    return errors


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


def collection_stages_stat(input_dir: str, keep_ids) -> Dict[str, Any]:
    """收款阶段台账的就绪度,形状与 projectsQuality 里另外 9 个输入文件完全一致。

    ★ 2026-08-31 审查补:本文件是 CLAUDE.md 明确的「回款数据核心源」,却是唯一一个
      没有任何就绪度上报的输入文件 —— 导出端漏了在建项目时,其回款节点会静默缺失,
      看板上只表现为「这些项目没有收款阶段」,没有任何告警说数据源可能不全。

    provided 看【文件在不在】,rows 看【读懂了几行】。两者分开的理由见 profit.read_csv_rows。
    """
    path = os.path.join(input_dir, config.COLLECTION_STAGES_FILE)
    rows = profit.read_csv_rows(path)
    keep = set(keep_ids or ())
    matched = sum(1 for r in rows if str(r.get("项目编号") or "").strip() in keep)
    return {"provided": os.path.isfile(path), "rows": len(rows), "matched": matched,
            "matchRate": round(matched / len(rows), 4) if rows else 0.0}


def missing_coverage(projects, payment_nodes) -> List[Dict[str, Any]]:
    """治理告警:【有合同却一个收款阶段节点都没有】的主域项目。

    为什么不是简单的 noStageCount:合同=0 的项目本来就不该有收款阶段,把它们混进来
    会让这个数变成噪音(2026-08-31 实测生产 75 个零节点项目里,只有 31 个有合同)。
    这 31 个的合同【进达成率分母、分子为 0】,实测拉低全域达成率 2.39 个百分点 ——
    究竟是「真的没有收款阶段」还是「导出漏了」需要业务侧判断,但先得让它可见。

    异常项目(orgL4 空)不计:全站已把它们硬排除出回款统计(lib/anomaly.isAnomalous),
    这里算进来会让告警数与看板对不上。
    """
    nodes = payment_nodes or {}
    out: List[Dict[str, Any]] = []
    for p in projects or []:
        if not str(p.get("orgL4") or "").strip():
            continue
        contract = (p.get("paymentPmis") or {}).get("contract")
        if not contract or contract <= 0:
            continue
        if nodes.get(p.get("projectId")):
            continue
        out.append({"projectId": p.get("projectId"), "projectName": p.get("projectName") or "",
                    "orgL4": p.get("orgL4"), "contract": contract})
    return out
