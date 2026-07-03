"""项目域快照/事件流(Phase P3, spec 3.3)。

快照=每次数据处理后的精简状态(data/snapshots/YYYY-MM-DD.json,同日覆盖,保留 90 天)。
节点稳定键: "projectId|stage#k", k=该(projectId,stage)按 paymentNodes 原始行序的第 k 次出现
(真实数据无天然唯一键:行序跨同步最稳,重复 stage 组中间插行仅影响该组内匹配,
误差半径有限——P3 设计决策 1;3E-3 起数据源换为 paymentNodes,stage 替代 nodeName)。
"""
import json
import os
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

import config
from profit import overspend_amount
from projects import delivery_overspend_cats


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
                   payment_nodes: Dict[str, List[dict]],
                   project_profit: Optional[Dict[str, dict]] = None) -> Dict[str, Any]:
    """从 final_data 三块构建精简快照(纯函数)。

    payment_nodes: {pid: [{stage, planDate, receivedAmount, expectedPayment, unpaidAmount, status}]}
    稳定键格式: "pid|stage#k"，k 为同 (pid, stage) 在列表中的第 k 次出现(0-based)。
    """
    projs: Dict[str, dict] = {}
    for p in dept_projects:
        pid = p["projectId"]
        m = project_pmis.get(pid) or {}
        prog = m.get("progress") or {}
        st = m.get("status") or {}
        risk = m.get("risk") or {}
        cost = m.get("cost") or {}
        cats = delivery_overspend_cats(p.get("deliveryCosts") or [])
        projs[pid] = {
            "name": p.get("projectName") or "",
            "stage": prog.get("项目阶段"),
            "milestone": prog.get("里程碑进度状态"),
            "status": st.get("项目状态"),
            "paused": bool(st.get("是否暂停")),
            "rating": st.get("评级"),
            "openRisks": int(risk.get("未关闭风险数") or 0),
            "overspend": bool(cost.get("项目超支")),
            "costRatio": cost.get("消耗比"),
            "overspendAmount": overspend_amount((project_profit or {}).get(pid)),
            "deliveryOver": bool(cats),
            "deliveryOverCats": cats,
        }
    nodes: Dict[str, dict] = {}
    seen: Dict[tuple, int] = {}
    for pid, plist in (payment_nodes or {}).items():
        pid = str(pid)
        pname = (projs.get(pid) or {}).get("name", "")
        for n in plist:
            st = str(n.get("stage") or "")
            k = seen.get((pid, st), 0)
            seen[(pid, st)] = k + 1
            nodes[f"{pid}|{st}#{k}"] = {
                "pid": pid,
                "pname": pname,
                "node": st,
                "status": n.get("status") or "",
                "planDate": n.get("planDate") or "",
                "actual": float(n.get("receivedAmount") or 0),
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
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        # 损坏/不可读的快照按缺失处理(与 append_events 防护标准一致),调用方走"无基线"分支
        return None


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


def _ev(date_str: str, etype: str, domain: str, pid: str, pname: str, summary: str,
        prev: Any = None, curr: Any = None, amount: Optional[float] = None,
        tone: str = "") -> dict:
    return {"date": date_str, "type": etype, "domain": domain, "projectId": pid,
            "projectName": pname, "summary": summary, "prev": prev, "curr": curr,
            "amount": amount, "tone": tone}


def diff_snapshots(prev: dict, cur: dict) -> List[dict]:
    """两快照 diff → 事件列表(spec 3.3 事件类型;纯函数,事件日期取 cur 日期)。"""
    evs: List[dict] = []
    d = cur["date"]
    pp, cp = prev.get("projects") or {}, cur.get("projects") or {}

    for pid, b in cp.items():
        name = b.get("name") or ""
        a = pp.get(pid)
        if a is None:
            evs.append(_ev(d, "新增项目", "project", pid, name, "新增项目（进入项目主域）", tone="ok"))
            continue
        for field, etype in (("stage", "阶段变更"), ("milestone", "里程碑状态变更"),
                             ("status", "项目状态变更")):
            if a.get(field) != b.get(field):
                tone = ""
                if field == "milestone" and any(
                        kw in str(b.get(field) or "") for kw in config.MILESTONE_DELAYED_KEYWORDS):
                    tone = "danger"
                evs.append(_ev(d, etype, "project", pid, name,
                               f"{a.get(field) or '-'} → {b.get(field) or '-'}",
                               prev=a.get(field), curr=b.get(field), tone=tone))
        if bool(a.get("paused")) != bool(b.get("paused")):
            etype = "暂停" if b.get("paused") else "恢复"
            evs.append(_ev(d, etype, "project", pid, name, f"项目{etype}"))
        ra, rb = int(a.get("openRisks") or 0), int(b.get("openRisks") or 0)
        if ra != rb:
            evs.append(_ev(d, "风险数增减", "project", pid, name,
                           f"未关闭风险 {ra} → {rb}", prev=ra, curr=rb,
                           tone="danger" if rb > ra else "ok"))
        if bool(a.get("overspend")) != bool(b.get("overspend")):
            if b.get("overspend"):
                amt = b.get("overspendAmount")
                # 整体超支金额>0 才入摘要与阈值判色;PMIS 分项超支但整体未超(实测 38/45 为负)只标 warn 不显负数
                if amt is not None and amt > 0:
                    evs.append(_ev(d, "超支出现", "project", pid, name,
                                   f"超支出现,整体超支 {round(amt / 10000, 2)} 万",
                                   amount=amt, tone="danger" if amt > 5000 else "warn"))
                else:
                    evs.append(_ev(d, "超支出现", "project", pid, name, "超支出现", tone="warn"))
            else:
                evs.append(_ev(d, "超支解除", "project", pid, name, "超支解除", tone="ok"))
        # 交付费用超支(S1 新事件;旧快照缺字段=升级首跑,不触发)
        if "deliveryOver" in a and not a.get("deliveryOver") and b.get("deliveryOver"):
            evs.append(_ev(d, "交付费用超支", "project", pid, name,
                           f"交付费用超支：{'、'.join(b.get('deliveryOverCats') or []) or '-'}",
                           tone="danger"))
    for pid, a in pp.items():
        if pid not in cp:
            evs.append(_ev(d, "关闭项目", "project", pid, a.get("name") or "",
                           "关闭项目（移出项目主域）", tone="ok"))

    pn, cn = prev.get("nodes") or {}, cur.get("nodes") or {}
    for key, b in cn.items():
        a = pn.get(key)
        pid, pname, node = b.get("pid") or "", b.get("pname") or "", b.get("node") or ""
        if a is None:
            evs.append(_ev(d, "回款节点新增", "payment", pid, pname, f"新增节点「{node}」"))
            continue
        delta = round((b.get("actual") or 0) - (a.get("actual") or 0), 2)
        if delta > 0:
            evs.append(_ev(d, "到账", "payment", pid, pname,
                           f"「{node}」到账 {round(delta / 10000, 2)} 万",
                           prev=a.get("actual"), curr=b.get("actual"), amount=delta))
        sa, sb = a.get("status"), b.get("status")
        if sa != sb:
            if sb == config.STATUS_DELAYED:
                evs.append(_ev(d, "延期发生", "payment", pid, pname,
                               f"「{node}」{sa or '-'} → 延期", prev=sa, curr=sb, tone="danger"))
            elif sb == config.STAGE_STATUS_PAID:
                evs.append(_ev(d, "回款完成", "payment", pid, pname,
                               f"「{node}」已全额回款", prev=sa, curr=sb))
        if (a.get("planDate") or "") != (b.get("planDate") or ""):
            evs.append(_ev(d, "计划回款日变更", "payment", pid, pname,
                           f"「{node}」计划日 {a.get('planDate') or '-'} → {b.get('planDate') or '-'}",
                           prev=a.get("planDate"), curr=b.get("planDate")))
    # 因项目关闭(从主域移出)而连带消失的节点不单独记"回款节点移除",避免与"关闭项目"事件重复刷屏
    closed_pids = {pid for pid in pp if pid not in cp}
    for key, a in pn.items():
        if key not in cn:
            if (a.get("pid") or "") in closed_pids:
                continue
            evs.append(_ev(d, "回款节点移除", "payment", a.get("pid") or "",
                           a.get("pname") or "", f"节点「{a.get('node') or ''}」移除"))
    return evs


def append_events(path: str, new_events: List[dict], cap: int = 500) -> List[dict]:
    """events.json 旧→新追加,超 cap 截头;返回截断后的全量列表。"""
    existing: List[dict] = []
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                existing = json.load(f)
        except (json.JSONDecodeError, OSError):
            existing = []
    merged = (existing + new_events)[-cap:]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
    return merged


def compute_period_compare_entry(base_date: str, base: dict, cur: dict) -> dict:
    """单基线六指标(spec 3.3): 直接 diff 快照,不累加事件。"""
    order = {s: i for i, s in enumerate(config.STAGE_ORDER)}
    bp, cp = base.get("projects") or {}, cur.get("projects") or {}
    advanced = sum(
        1 for pid, b in cp.items()
        if pid in bp and bp[pid].get("stage") in order and b.get("stage") in order
        and order[b["stage"]] > order[bp[pid]["stage"]]
    )
    bn, cn = base.get("nodes") or {}, cur.get("nodes") or {}
    new_delayed = sum(
        1 for k, v in cn.items()
        if v.get("status") == config.STATUS_DELAYED
        and (k not in bn or bn[k].get("status") != config.STATUS_DELAYED)
    )
    gained = round(sum(
        max((v.get("actual") or 0) - ((bn.get(k) or {}).get("actual") or 0), 0)
        for k, v in cn.items()
    ), 2)
    risk_net = int((cur.get("agg") or {}).get("openRiskTotal") or 0) - int((base.get("agg") or {}).get("openRiskTotal") or 0)
    new_overspend = sum(1 for pid, v in cp.items()
                        if v.get("overspend") and not (bp.get(pid) or {}).get("overspend"))
    rb = (base.get("agg") or {}).get("paymentRatio")
    rc = (cur.get("agg") or {}).get("paymentRatio")
    ratio_change = round((rc - rb) * 100, 1) if (rb is not None and rc is not None) else None
    return {
        "baseDate": base_date,
        "advancedProjects": advanced,
        "newDelayedNodes": new_delayed,
        "paymentGained": gained,
        "riskNetChange": risk_net,
        "newOverspendProjects": new_overspend,
        "paymentRatioChange": ratio_change,
    }
