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
