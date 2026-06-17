# projects.py
"""项目主域(Phase P)构建:三输入文件摄取 → 筛三部 → 售前映射 → 回款/成本聚合 → 健康度 + 质量。
镜像 pmis.py 模式:纯函数为主,文件读取集中,任一输入缺失优雅降级(不抛错、不阻断回款主流程)。"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Tuple

import config
from pmis import parse_pmis_money, parse_pmis_pct


def _open_workbook(path: str):
    """打开 xlsx;文件缺失/损坏返回 None。不用 read_only(WPS 导出 dimension 不可靠会截断行)。"""
    if not os.path.exists(path):
        return None
    import openpyxl
    try:
        return openpyxl.load_workbook(path, data_only=True)
    except Exception:
        return None


def _read_header_sheet(path: str, key_header: str) -> List[Dict[str, Any]]:
    """在所有 sheet 中找首行含 key_header 的表(跳过透视杂表),转 list[dict]。找不到返回 []。"""
    wb = _open_workbook(path)
    if wb is None:
        return []
    try:
        for ws in wb.worksheets:
            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                continue
            headers = [str(h).strip() if h is not None else "" for h in rows[0]]
            if key_header not in headers:
                continue
            out = []
            for raw in rows[1:]:
                d = {}
                for i, h in enumerate(headers):
                    if h:
                        d[h] = raw[i] if i < len(raw) else None
                if any(v is not None for v in d.values()):
                    out.append(d)
            return out
        return []
    finally:
        wb.close()


def read_org_names(path: str) -> Tuple[set, set, int]:
    """组织架构表 → (姓名集合, L4组织集合, 行数)。按"表头含工号"自动选 sheet。
    若存在 新L3组织 列,仅收 交付实施三部 行(防误放全公司清单);姓名/L4 先 strip 再判空。"""
    rows = _read_header_sheet(path, "工号")
    if rows and any(r.get("新L3组织") for r in rows):
        rows = [r for r in rows if str(r.get("新L3组织") or "").strip() == config.DEPT_L3]
    names: set = set()
    l4s: set = set()
    for r in rows:
        name = str(r.get("姓名") or "").strip()
        if name:
            names.add(name)
        l4 = str(r.get("新L4组织") or "").strip()
        if l4:
            l4s.add(l4)
    return names, l4s, len(rows)


def read_org_l3_map(path: str) -> Dict[str, str]:
    """组织架构表 → {姓名: 新L3-1组织}。同 read_org_names 选 sheet 与交付实施三部过滤。"""
    rows = _read_header_sheet(path, "工号")
    if rows and any(r.get("新L3组织") for r in rows):
        rows = [r for r in rows if str(r.get("新L3组织") or "").strip() == config.DEPT_L3]
    out: Dict[str, str] = {}
    for r in rows:
        name = str(r.get("姓名") or "").strip()
        l3 = str(r.get("新L3-1组织") or "").strip()
        if name and l3:
            out[name] = l3
    return out


def read_mapping(path: str) -> List[Dict[str, str]]:
    """A.xlsx(无表头):A列=当前项目号 B列=桥接负责人 C列=已关闭项目号。AC 全有才收。"""
    wb = _open_workbook(path)
    if wb is None:
        return []
    try:
        ws = wb.worksheets[0]
        out = []
        for raw in ws.iter_rows(values_only=True):
            cur = str(raw[0]).strip() if raw and raw[0] is not None else ""
            owner = str(raw[1]).strip() if raw and len(raw) > 1 and raw[1] is not None else ""
            closed = str(raw[2]).strip() if raw and len(raw) > 2 and raw[2] is not None else ""
            if cur and closed:
                out.append({"current": cur, "owner": owner, "closed": closed})
        return out
    finally:
        wb.close()


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


def delivery_costs_for(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """delivery_analysis 一行 → 7 类目成本四元组(缺列降 None)。"""
    out = []
    for cat in config.DELIVERY_COST_CATEGORIES:
        out.append({
            "类别": cat,
            "预算金额": parse_pmis_money(row.get(f"{cat}_预算金额")),
            "实际发生": parse_pmis_money(row.get(f"{cat}_实际发生")),
            "剩余预算": parse_pmis_money(row.get(f"{cat}_剩余预算")),
            "消耗率": parse_pmis_pct(row.get(f"{cat}_消耗率")),
        })
    return out


def delivery_overspend_cats(delivery_costs: List[Dict[str, Any]]) -> List[str]:
    """交付费用超支类目(S1):实际发生 > 预算金额 的类目名(预算缺失不判)。"""
    out = []
    for c in delivery_costs or []:
        b, a = c.get("预算金额"), c.get("实际发生")
        if b is not None and a is not None and a > b:
            out.append(str(c.get("类别") or ""))
    return out


def payment_ratio_from_records(records_total: Optional[float], contract: Optional[float],
                               closed_contract: Optional[float]) -> Optional[float]:
    """回款完成率新口径(S1):流水累计 ÷ 合同总额(本项目优先,售前回退原项目)。
    分母缺失/0 → None(前端显 '-');无流水但有合同 → 0。"""
    denom = contract if contract else closed_contract
    if not denom or denom <= 0:
        return None
    return round((records_total or 0) / denom, 4)


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


def aggregate_payment(nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """项目的回款子域聚合(仅 isPaymentRelated 节点;明细仍在 rawNodes,不复制)。"""
    rel = [n for n in nodes if n.get("isPaymentRelated")]
    exp = sum(float(n.get("expectedPayment") or 0) for n in rel)
    act = sum(float(n.get("actualPayment") or 0) for n in rel)
    delayed = sum(1 for n in rel if n.get("nodeStatus") == config.STATUS_DELAYED)
    return {
        "relatedNodeCount": len(rel),
        "expectedTotal": round(exp, 2),
        "actualTotal": round(act, 2),
        "remainingTotal": round(max(exp - act, 0), 2),
        "paymentRatio": round(act / exp, 4) if exp > 0 else None,
        "delayedCount": delayed,
    }


def compute_health(pm: Dict[str, Any], delayed_count: int) -> Dict[str, Any]:
    """四维三态健康度(spec 4.6;阈值集中在此,后续可调)。"""
    _ms = str(pm.get("progress", {}).get("里程碑进度状态") or "")
    progress_ab = any(k in _ms for k in config.MILESTONE_DELAYED_KEYWORDS)
    risk = pm.get("risk", {})
    risk_ab = (risk.get("最高等级") == "高") and ((risk.get("未关闭风险数") or 0) > 0)
    cost = pm.get("cost", {})
    ratio = cost.get("消耗比")
    cost_ab = bool(cost.get("超支")) or (ratio is not None and ratio > 1)
    pay_ab = delayed_count > 0
    n = sum([progress_ab, risk_ab, cost_ab, pay_ab])
    overall = "健康" if n == 0 else ("关注" if n == 1 else "风险")
    return {"progressAbnormal": progress_ab, "riskAbnormal": risk_ab,
            "costAbnormal": cost_ab, "paymentAbnormal": pay_ab, "overall": overall}


def build_projects(project_pmis: Dict[str, Dict[str, Any]], org_names: set, org_l4s: set,
                   mapping: List[Dict[str, str]], delivery_rows: List[Dict[str, Any]],
                   all_nodes: List[Dict[str, Any]],
                   org_l3_map: Dict[str, str] = None) -> List[Dict[str, Any]]:
    """项目主表:PMIS 在建 → 筛三部(空人员清单=不过滤,降级) → 挂映射/回款/成本/健康度。
    matched=False 守卫为防御性分支(现行 _assemble 恒 matched=True),供未来非 PMIS 来源项目使用。"""
    org_l3_map = org_l3_map or {}
    nodes_by_pid: Dict[str, List[Dict[str, Any]]] = {}
    for n in all_nodes:
        pid = str(n.get("projectId") or "").strip()
        if pid:
            nodes_by_pid.setdefault(pid, []).append(n)
    delivery_by_pid: Dict[str, Dict[str, Any]] = {}
    for r in delivery_rows:
        pid = str(r.get("项目编号") or "").strip()
        if pid:
            delivery_by_pid.setdefault(pid, r)
    map_by_current = {m["current"]: m for m in mapping}

    out = []
    for pid, pm in project_pmis.items():
        if pm.get("source") != "在建":
            continue
        team = pm.get("team", {})
        manager = str(team.get("项目经理") or "").strip()
        if org_names and manager not in org_names:
            continue
        nodes = nodes_by_pid.get(pid, [])
        drow = delivery_by_pid.get(pid)
        name = str(team.get("项目名称") or "").strip()
        if not name and drow:
            name = str(drow.get("项目名称") or "").strip()
        if not name and nodes:
            name = str(nodes[0].get("projectName") or "").strip()
        m = map_by_current.get(pid)
        payment = aggregate_payment(nodes)
        health = (compute_health(pm, payment["delayedCount"]) if pm.get("matched")
                  else {"progressAbnormal": False, "riskAbnormal": False, "costAbnormal": False,
                        "paymentAbnormal": False, "overall": "无数据"})
        out.append({
            "projectId": pid,
            "projectName": name,
            "projectManager": manager,
            "orgL4": str(team.get("L4部门") or "").strip(),
            "orgL3": org_l3_map.get(manager, ""),
            "isPresale": name.startswith(config.PRESALE_PREFIX),
            "relatedClosedId": (m["closed"] if m else ""),
            "payment": payment,
            "deliveryCosts": delivery_costs_for(drow) if drow else [],
            "health": health,
        })
    out.sort(key=lambda p: p["projectId"])
    return out


def compute_projects_quality(projects: List[Dict[str, Any]],
                             project_pmis: Dict[str, Dict[str, Any]],
                             org_names: set, org_l4s: set, org_rows: int,
                             mapping: List[Dict[str, str]],
                             delivery_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """项目主域质量(spec 3.6):三文件记分卡 + 人员↔项目双向告警 + 售前映射覆盖。"""
    proj_ids = {p["projectId"] for p in projects}
    managers = {p["projectManager"] for p in projects if p["projectManager"]}
    staff_no_project = sorted(org_names - managers)
    manager_not_in_org = []
    if org_names:
        for pid, pm in project_pmis.items():
            if pm.get("source") != "在建" or pid in proj_ids:
                continue
            team = pm.get("team", {})
            mgr = str(team.get("项目经理") or "").strip()
            l4 = str(team.get("L4部门") or "").strip()
            if l4 in org_l4s and mgr:
                manager_not_in_org.append({
                    "projectId": pid,
                    "projectName": str(team.get("项目名称") or ""),
                    "manager": mgr,
                })
    presale = [p for p in projects if p["isPresale"]]
    presale_unmapped = [p for p in presale if not p["relatedClosedId"]]
    mapping_matched = sum(1 for m in mapping if m["current"] in proj_ids)
    delivery_matched = sum(1 for r in delivery_rows
                           if str(r.get("项目编号") or "").strip() in proj_ids)

    def stat(provided: bool, rows: int, matched: int) -> Dict[str, Any]:
        return {"provided": provided, "rows": rows, "matched": matched,
                "matchRate": round(matched / rows, 4) if rows else 0.0}

    return {
        "deptProjectCount": len(projects),
        "orgFile": stat(bool(org_names), org_rows, len(org_names & managers)),
        "mappingFile": stat(bool(mapping), len(mapping), mapping_matched),
        "deliveryFile": stat(bool(delivery_rows), len(delivery_rows), delivery_matched),
        "staffNoProject": [{"name": n} for n in staff_no_project],
        "managerNotInOrg": sorted(manager_not_in_org, key=lambda x: x["projectId"]),
        "presaleTotal": len(presale),
        "presaleMapped": len(presale) - len(presale_unmapped),
        "presaleUnmapped": [{"projectId": p["projectId"], "projectName": p["projectName"]}
                            for p in presale_unmapped],
    }


def load_dept_projects(input_dir: str, project_pmis: Dict[str, Dict[str, Any]],
                       all_nodes: List[Dict[str, Any]],
                       mapping: List[Dict[str, str]]
                       ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """读组织架构+delivery → build_projects + 质量。mapping 由调用方先读(9a 也要用)。"""
    names, l4s, org_rows = read_org_names(os.path.join(input_dir, config.ORG_FILE))
    l3_map = read_org_l3_map(os.path.join(input_dir, config.ORG_FILE))
    delivery = read_delivery(os.path.join(input_dir, config.DELIVERY_FILE))
    projects = build_projects(project_pmis, names, l4s, mapping, delivery, all_nodes, l3_map)
    quality = compute_projects_quality(projects, project_pmis, names, l4s, org_rows,
                                       mapping, delivery)
    return projects, quality
