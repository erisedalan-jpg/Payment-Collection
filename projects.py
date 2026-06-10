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
    """组织架构表 → (姓名集合, L4组织集合, 行数)。按"表头含工号"自动选 sheet。"""
    rows = _read_header_sheet(path, "工号")
    names = {str(r.get("姓名")).strip() for r in rows if r.get("姓名")}
    l4s = {str(r.get("新L4组织")).strip() for r in rows if r.get("新L4组织")}
    return names, l4s, len(rows)


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
    """delivery_analysis 表。按"表头含项目编号"自动选 sheet(跳过透视杂表)。"""
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
    progress_ab = "滞后" in str(pm.get("progress", {}).get("里程碑进度状态") or "")
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
