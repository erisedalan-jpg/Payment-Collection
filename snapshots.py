"""项目域快照/事件流(Phase P3, spec 3.3)。

快照=每次数据处理后的精简状态(data/snapshots/YYYY-MM-DD.json,同日覆盖,保留 90 天)。
节点稳定键: "projectId|nodeName#k", k=该(projectId,nodeName)按 rawNodes 原始行序的第 k 次出现
(真实数据无天然唯一键: projectId+nodeName 25 组重复/84 行,无期次字段;行序跨同步最稳,
重复组中间插行仅影响该组内匹配,误差半径有限——P3 设计决策 1)。
"""
import json
import os
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import config


def _agg(projects: Dict[str, dict], nodes: Dict[str, dict]) -> Dict[str, Any]:
    exp = sum(n.get("expected") or 0 for n in nodes.values())
    act = sum(n.get("actual") or 0 for n in nodes.values())
    return {
        "projectCount": len(projects),
        "expectedTotal": round(exp, 2),
        "actualTotal": round(act, 2),
        "paymentRatio": round(act / exp, 4) if exp > 0 else None,
        "delayedNodes": sum(1 for n in nodes.values() if n.get("status") == config.STATUS_DELAYED),
        "openRiskTotal": sum(p.get("openRisks") or 0 for p in projects.values()),
        "overspendCount": sum(1 for p in projects.values() if p.get("overspend")),
    }


def build_snapshot(date_str: str, dept_projects: List[dict], project_pmis: Dict[str, dict],
                   raw_nodes: List[dict]) -> Dict[str, Any]:
    """从 final_data 三块构建精简快照(纯函数)。"""
    projs: Dict[str, dict] = {}
    for p in dept_projects:
        pid = p["projectId"]
        m = project_pmis.get(pid) or {}
        prog = m.get("progress") or {}
        st = m.get("status") or {}
        risk = m.get("risk") or {}
        cost = m.get("cost") or {}
        projs[pid] = {
            "name": p.get("projectName") or "",
            "stage": prog.get("项目阶段"),
            "milestone": prog.get("里程碑进度状态"),
            "status": st.get("项目状态"),
            "paused": bool(st.get("是否暂停")),
            "rating": st.get("评级"),
            "openRisks": int(risk.get("未关闭风险数") or 0),
            "overspend": bool(cost.get("超支")),
            "costRatio": cost.get("消耗比"),
        }
    nodes: Dict[str, dict] = {}
    seen: Dict[tuple, int] = {}
    for n in raw_nodes:
        if not n.get("isPaymentRelated"):
            continue
        pid = str(n.get("projectId") or "")
        nm = str(n.get("nodeName") or "")
        k = seen.get((pid, nm), 0)
        seen[(pid, nm)] = k + 1
        nodes[f"{pid}|{nm}#{k}"] = {
            "pid": pid,
            "pname": str(n.get("projectName") or ""),
            "node": nm,
            "status": n.get("nodeStatus") or "",
            "planDate": n.get("planDate") or "",
            "actual": float(n.get("actualPayment") or 0),
            "expected": float(n.get("expectedPayment") or 0),
        }
    return {"date": date_str, "projects": projs, "nodes": nodes, "agg": _agg(projs, nodes)}


# ── 文件 IO(目录由调用方传入,frozen 安全由 preprocess 的 OUTPUT_DIR 保证) ──

def _is_date_name(s: str) -> bool:
    try:
        date.fromisoformat(s)
        return True
    except ValueError:
        return False


def list_snapshot_dates(dirpath: str) -> List[str]:
    if not os.path.isdir(dirpath):
        return []
    out = [f[:-5] for f in os.listdir(dirpath) if f.endswith(".json") and _is_date_name(f[:-5])]
    return sorted(out)


def load_snapshot(dirpath: str, date_str: str) -> Optional[dict]:
    path = os.path.join(dirpath, f"{date_str}.json")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def save_snapshot(dirpath: str, snap: dict, today: Optional[str] = None, keep_days: int = 90) -> None:
    """写当日快照(同日覆盖),并清理 today-keep_days 之前的旧份。"""
    os.makedirs(dirpath, exist_ok=True)
    with open(os.path.join(dirpath, f"{snap['date']}.json"), "w", encoding="utf-8") as f:
        json.dump(snap, f, ensure_ascii=False, separators=(",", ":"))
    cutoff = date.fromisoformat(today or snap["date"]) - timedelta(days=keep_days)
    for ds in list_snapshot_dates(dirpath):
        if date.fromisoformat(ds) < cutoff:
            os.remove(os.path.join(dirpath, f"{ds}.json"))


def pick_baseline_dates(dates: List[str], today: str) -> Dict[str, Optional[str]]:
    """三基线: lastSync=最新一份; lastWeek=≤今天-7 最近; lastMonth=≤今天-30 最近(spec 3.3)。"""
    dates = sorted(dates)
    t = date.fromisoformat(today)

    def latest_at_or_before(cutoff: date) -> Optional[str]:
        cands = [d for d in dates if date.fromisoformat(d) <= cutoff]
        return cands[-1] if cands else None

    return {
        "lastSync": dates[-1] if dates else None,
        "lastWeek": latest_at_or_before(t - timedelta(days=7)),
        "lastMonth": latest_at_or_before(t - timedelta(days=30)),
    }
