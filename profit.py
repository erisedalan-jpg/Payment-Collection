# -*- coding: utf-8 -*-
"""预算/核算/回款 CSV 摄取(Phase R1):
- profit_loss_direct.csv:项目全预算科目树(预算/实际/剩余/消耗率)+顶部汇总
- budget_data.csv:概算/核算两版本,按 code+name 双键并入 direct 科目行(毛利编码别名 3.1→3/3.2→4)
- profit_loss_bridge.csv:售前 SF → 原 SS 项目同构科目树
- payment_records.csv:回款流水按项目分组+汇总
全部 utf-8-sig;缺文件不致命(provided=False)。
"""
import csv
import os
from typing import Any, Dict, List, Optional, Set, Tuple

import config

_METRIC_KEYS = {"预算金额": "budget", "实际发生": "actual", "剩余预算": "remaining", "消耗率": "rate"}
_BUDGET_KEYS = {"概算金额": "estimate", "核算金额": "final"}
_GROSS_ALIAS = {"3.1": "3", "3.2": "4"}  # budget 毛利编码 → direct 毛利编码


def read_csv_rows(path: str) -> List[Dict[str, str]]:
    """utf-8-sig CSV → List[dict];缺失/不可读返回 []。"""
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            return list(csv.DictReader(f))
    except (OSError, csv.Error):
        return []


def _num(v: Any) -> Optional[float]:
    s = str(v if v is not None else "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _split_col(col: str, prefix: str) -> Optional[Tuple[str, str, str]]:
    """'本项目_2.3.2_交付部门人工成本_预算金额' → ('2.3.2','交付部门人工成本','预算金额')。"""
    if not col.startswith(prefix):
        return None
    rest = col[len(prefix):]
    left, _, metric = rest.rpartition("_")
    code, _, name = left.partition("_")
    if not (code and name and metric):
        return None
    return code, name, metric


def parse_profit_rows(row: Dict[str, Any], prefix: str) -> List[Dict[str, Any]]:
    """一行 CSV → 科目树行(按列序;level>1 且四指标全 None/0 的剪掉)。"""
    found: Dict[Tuple[str, str], Dict[str, Any]] = {}
    order: List[Tuple[str, str]] = []
    for col, raw in row.items():
        parsed = _split_col(col, prefix)
        if not parsed:
            continue
        code, name, metric = parsed
        if metric not in _METRIC_KEYS:
            continue
        key = (code, name)
        if key not in found:
            found[key] = {"code": code, "name": name, "level": code.count(".") + 1,
                          "budget": None, "estimate": None, "final": None,
                          "actual": None, "remaining": None, "rate": None}
            order.append(key)
        found[key][_METRIC_KEYS[metric]] = _num(raw)
    out = []
    for key in order:
        r = found[key]
        vals = [r["budget"], r["actual"], r["remaining"], r["rate"]]
        if r["level"] > 1 and not any(v for v in vals):
            continue
        out.append(r)
    return out


def _budget_versions(row: Dict[str, Any]) -> Dict[Tuple[str, str], Dict[str, Optional[float]]]:
    """budget_data 一行 → {(code,name): {estimate, final}}(毛利编码按别名映射)。"""
    out: Dict[Tuple[str, str], Dict[str, Optional[float]]] = {}
    for col, raw in row.items():
        parsed = _split_col(col, "预算_")
        if not parsed:
            continue
        code, name, metric = parsed
        if metric not in _BUDGET_KEYS:
            continue
        code = _GROSS_ALIAS.get(code, code)
        d = out.setdefault((code, name), {"estimate": None, "final": None})
        d[_BUDGET_KEYS[metric]] = _num(raw)
    return out


def _stat(provided: bool, rows: int, matched: int) -> Dict[str, Any]:
    return {"provided": provided, "rows": rows, "matched": matched,
            "matchRate": round(matched / rows, 4) if rows else 0.0}


_SUMMARY_COLS = ["预算收入", "预算成本", "实际成本", "成本消耗率", "预算毛利", "实际毛利", "预算毛利率", "剩余预算"]


def load_profit(input_dir: str, keep_ids: Set[str]
                ) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """direct+budget+bridge → {pid: {summary, rows, bridge}}, stats{direct,budget,bridge}。"""
    direct = read_csv_rows(os.path.join(input_dir, config.PROFIT_DIRECT_FILE))
    budget = read_csv_rows(os.path.join(input_dir, config.BUDGET_FILE))
    bridge = read_csv_rows(os.path.join(input_dir, config.PROFIT_BRIDGE_FILE))

    budget_map: Dict[str, Dict[Tuple[str, str], Dict[str, Optional[float]]]] = {}
    budget_matched = 0
    for r in budget:
        pid = str(r.get("项目编号") or "").strip()
        if pid in keep_ids:
            budget_matched += 1
        budget_map[pid] = _budget_versions(r)

    out: Dict[str, Dict[str, Any]] = {}
    direct_matched = 0
    for r in direct:
        pid = str(r.get("项目编号") or "").strip()
        if pid not in keep_ids:
            continue
        direct_matched += 1
        rows = parse_profit_rows(r, "本项目_")
        # 名同码同才并入概算/核算;毛利行经别名后再以"名含毛利"双保险
        bv = budget_map.get(pid, {})
        for row_item in rows:
            hit = bv.get((row_item["code"], row_item["name"]))
            if hit is None and row_item["code"] in ("3", "4") and "毛利" in row_item["name"]:
                hit = next((v for (c, n), v in bv.items()
                            if c == row_item["code"] and "毛利" in n), None)
            if hit:
                row_item["estimate"] = hit["estimate"]
                row_item["final"] = hit["final"]
        out[pid] = {
            "summary": {k: _num(r.get(k)) for k in _SUMMARY_COLS},
            "rows": rows,
            "bridge": None,
        }

    bridge_matched = 0
    for r in bridge:
        pid = str(r.get("项目编号") or "").strip()
        if pid not in keep_ids:
            continue
        bridge_matched += 1
        entry = out.setdefault(pid, {"summary": {k: None for k in _SUMMARY_COLS},
                                     "rows": [], "bridge": None})
        entry["bridge"] = {
            "ssId": str(r.get("桥接SS项目编码") or "").strip(),
            "summary": {
                "预算收入": _num(r.get("桥接SS预算收入")),
                "预算成本": _num(r.get("桥接SS预算成本")),
                "预算毛利": _num(r.get("桥接SS预算毛利")),
                "预算毛利率": _num(r.get("桥接SS预算毛利率")),
                "实际成本": _num(r.get("桥接SS实际成本")),
            },
            "rows": parse_profit_rows(r, "桥接_"),
        }

    stats = {
        "direct": _stat(bool(direct), len(direct), direct_matched),
        "budget": _stat(bool(budget), len(budget), budget_matched),
        "bridge": _stat(bool(bridge), len(bridge), bridge_matched),
    }
    return out, stats


def load_payment_records(input_dir: str, keep_ids: Set[str]
                         ) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Any]]:
    """payment_records.csv → {pid: {total,count,lastDate,records[新→旧]}}。"""
    rows = read_csv_rows(os.path.join(input_dir, config.PAYMENT_RECORDS_FILE))
    if not rows:
        return {}, _stat(False, 0, 0)
    out: Dict[str, Dict[str, Any]] = {}
    matched = 0
    for r in rows:
        pid = str(r.get("项目编号") or "").strip()
        if pid not in keep_ids:
            continue
        matched += 1
        rec = {
            "type": str(r.get("回款类型") or "").strip(),
            "serial": str(r.get("收款流水号") or "").strip(),
            "payer": str(r.get("回款单位") or "").strip(),
            "amount": _num(r.get("付款金额")),
            "date": str(r.get("回款确认日期") or "").strip()[:10],
            "claimer": str(r.get("认领人") or "").strip(),
            "orderNo": str(r.get("订单号") or "").strip(),
            "currency": str(r.get("币种") or "").strip(),
            "rate": _num(r.get("汇率")),
            "note": str(r.get("备注") or "").strip(),
        }
        e = out.setdefault(pid, {"total": 0.0, "count": 0, "lastDate": "", "records": []})
        e["records"].append(rec)
        e["count"] += 1
        e["total"] = round(e["total"] + (rec["amount"] or 0.0), 2)
        if rec["date"] > e["lastDate"]:
            e["lastDate"] = rec["date"]
    for e in out.values():
        e["records"].sort(key=lambda x: x["date"], reverse=True)
    return out, _stat(True, len(rows), matched)
