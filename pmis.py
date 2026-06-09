# pmis.py
"""PMIS 项目域数据摄取:解析七表 → 按 projectId join → 派生维度 + 数据质量。
纯函数为主(解析/join/派生/质量),文件读取(openpyxl)集中在 read_pmis_sheet/load_project_pmis。
PMIS 缺失要优雅降级,不抛错、不阻断回款主流程。"""
from __future__ import annotations
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import config


def parse_pmis_money(val) -> Optional[float]:
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip().replace(",", "").replace("，", "")
    m = re.search(r"-?[\d.]+", s)
    if not m:
        return None
    try:
        return float(m.group(0))
    except ValueError:
        return None


def parse_pmis_pct(val) -> Optional[float]:
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip().rstrip("%")
    try:
        num = float(s)
    except ValueError:
        return None
    return num if num <= 1 else num / 100


def parse_close_fraction(val) -> Optional[int]:
    if val is None or str(val).strip() == "":
        return None
    s = str(val).strip()
    m = re.match(r"(\d+)", s)
    return int(m.group(1)) if m else None


def read_pmis_sheet(path: str) -> List[Dict[str, Any]]:
    """读 PMIS xlsx(表头第 2 行)为 list[dict]。文件不存在返回 []。"""
    if not os.path.exists(path):
        return []
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))
    wb.close()
    hr = config.PMIS_HEADER_ROW
    if len(all_rows) < hr:
        return []
    headers = [str(h).strip() if h is not None else "" for h in all_rows[hr - 1]]
    out = []
    for raw in all_rows[hr:]:
        d = {}
        for i, h in enumerate(headers):
            if h:
                d[h] = raw[i] if i < len(raw) else None
        out.append(d)
    return out


_RISK_RANK = {"高": 3, "中": 2, "低": 1}


def derive_cost(status_row: Dict[str, Any], center_row: Dict[str, Any]) -> Dict[str, Any]:
    """计算项目成本维度:消耗比、超支标志、各金额字段。"""
    total = parse_pmis_money(status_row.get("项目总预算（元）"))
    used = parse_pmis_money(status_row.get("项目核算（元）"))
    remain = parse_pmis_money(status_row.get("剩余预算（元）"))
    ratio = (used / total) if (total and total > 0 and used is not None) else None
    overrun_keys = [k for k in center_row if "超支" in k]
    overrun = None
    if overrun_keys:
        overrun = any("是" in str(center_row.get(k) or "") for k in overrun_keys)
    return {"总预算": total, "核算": used, "剩余预算": remain, "消耗比": ratio,
            "超支": overrun, "成本状态": (status_row.get("成本状态") or None)}


def derive_risk(risk_recs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """汇总风险记录:记录数、最高等级、闭环率。"""
    n = len(risk_recs)
    if n == 0:
        return {"未关闭风险数": None, "风险记录数": 0, "最高等级": None, "闭环率": None}
    closed = sum(1 for r in risk_recs if "已关闭" in str(r.get("风险状态") or ""))
    levels = [str(r.get("风险等级") or "").strip() for r in risk_recs]
    top = max((lv for lv in levels if lv in _RISK_RANK), key=lambda x: _RISK_RANK[x], default=None)
    return {"未关闭风险数": n - closed, "风险记录数": n, "最高等级": top,
            "闭环率": (closed / n) if n else None}
