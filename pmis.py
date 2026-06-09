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
        # 跳过全空行(合并单元格/分隔/翻页标题行会产生),避免幽灵记录
        if any(v is not None for v in d.values()):
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
        overrun = any(str(center_row.get(k) or "").strip() == "是" for k in overrun_keys)
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


def _index_by_pid(rows: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """将行列表按项目编号索引为 dict(重复 pid 保留首条)。"""
    idx: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        pid = r.get("项目编号")
        if pid not in (None, ""):
            idx.setdefault(str(pid).strip(), r)
    return idx


def _risk_by_pid(rows: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """将风险行列表按项目编号聚合为 dict[pid → list[row]]。"""
    out: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        pid = r.get("项目编号")
        if pid not in (None, ""):
            out.setdefault(str(pid).strip(), []).append(r)
    return out


def _assemble(pid: str, base_i: Dict, center_i: Dict, status_i: Dict,
              risk_i: Dict, source: str) -> Dict[str, Any]:
    """将四张表的索引合并为单个项目的维度 dict。"""
    b = base_i.get(pid, {}); c = center_i.get(pid, {}); s = status_i.get(pid, {})
    cost = derive_cost(s, c)
    risk = derive_risk(risk_i.get(pid, []))
    ucf = parse_close_fraction(s.get("未关闭风险数量")) if s else None
    if ucf is not None:
        risk["未关闭风险数"] = ucf
    return {
        "matched": True, "source": source,
        "cost": cost,
        "progress": {
            "完工进展": parse_pmis_pct(s.get("项目累计完工进展百分比")),
            "里程碑进度状态": (s.get("里程碑进度状态") or None),
            "项目阶段": (s.get("项目阶段") or c.get("项目阶段") or None),
            "计划终验": (c.get("计划终验时间") or s.get("合同目标终验时间") or None),
        },
        "risk": risk,
        "status": {
            "项目状态": (b.get("项目状态") or s.get("项目状态") or None),
            "是否暂停": (("是" in str(b.get("是否暂停") or "")) if b.get("是否暂停") else None),
            "评级": (s.get("项目评级") or None),
            "评分": parse_pmis_money(b.get("项目评分")),
        },
        "customer": {
            "最终客户": (b.get("最终客户") or None),
            "合同编号": (b.get("合同编号") or None),
            "签约形式": (b.get("签约形式分类") or None),
            "行业": (b.get("行业中类") or None),
            "合同总额": parse_pmis_money(b.get("合同总额（元）")),
        },
    }


def build_project_pmis(active: Dict[str, List[Dict[str, Any]]],
                       closed: Dict[str, List[Dict[str, Any]]],
                       payment_project_ids: set) -> Dict[str, Dict[str, Any]]:
    """在建全量入库;已关闭仅收 ∩ 回款。优先在建(同 pid 不被已关闭覆盖)。"""
    a_base = _index_by_pid(active.get("base", []))
    a_center = _index_by_pid(active.get("center", []))
    a_status = _index_by_pid(active.get("status", []))
    a_risk = _risk_by_pid(active.get("risk", []))
    out: Dict[str, Dict[str, Any]] = {}
    for pid in a_base.keys() | a_center.keys() | a_status.keys():
        out[pid] = _assemble(pid, a_base, a_center, a_status, a_risk, "在建")
    c_base = _index_by_pid(closed.get("base", []))
    c_center = _index_by_pid(closed.get("center", []))
    c_status = _index_by_pid(closed.get("status", []))
    c_risk = _risk_by_pid(closed.get("risk", []))
    for pid in (c_base.keys() | c_center.keys() | c_status.keys()):
        if pid in payment_project_ids and pid not in out:
            out[pid] = _assemble(pid, c_base, c_center, c_status, c_risk, "已关闭")
    return out
