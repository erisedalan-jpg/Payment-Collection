# -*- coding: utf-8 -*-
"""项目里程碑摄取(Phase R1):PMIS 里程碑两表(宽表)→ 每项目长表 + 三段优先级。

宽表:一行一项目,13 类里程碑各占「计划/实际时间」列对,部分带关联回款阶段/百分比列。
优先级(母 spec §2/R 批次决策):高=终验、服务完成、关联回款阶段非空;中=项目关闭;低=其他。
"""
import os
import re
from typing import Any, Dict, List, Optional, Set, Tuple

from pmis import read_pmis_sheet
import config

# (类目名, 计划列, 实际列, 关联回款列, 百分比列) —— 顺序即业务展示顺序
MILESTONE_DEFS = [
    ("项目启动", "计划项目启动时间", "实际项目启动时间", None, None),
    ("到货", "计划到货时间", "实际到货时间", "到货关联回款阶段", None),
    ("服务进场", "计划服务进场时间", "实际服务进场时间", None, None),
    ("交付完工", "计划交付完工时间", "实际交付完工时间", None, None),
    ("初验", "计划初验时间", "实际初验时间", "初验关联回款阶段", None),
    ("终验", "计划终验时间", "实际终验时间", "终验关联回款阶段", None),
    ("项目完工（服务离场）", "计划项目完工（服务离场）时间", "实际项目完工（服务离场）时间", None, None),
    ("实物点验", "计划实物点验完成时间", "实际实物点验完成时间", None, "实物点验百分比"),
    ("预检", "计划预检完成时间", "实际预检完成时间", None, "预检百分比"),
    ("节点成果确认", "计划节点成果确认完成时间", "实际节点成果确认完成时间", None, None),
    ("服务完成", "计划服务完成时间", "实际服务完成时间", None, "服务完成百分比"),
    ("项目关闭", "计划项目关闭时间", "实际项目关闭时间", None, None),
    # 驻场无计划/实际语义,开始→planDate、结束→actualDate
    ("驻场", "驻场开始时间", "驻场结束时间", "驻场关联回款阶段", None),
]

# 测试用:还原导出表头(序号/合同编号/项目编号/项目名称/项目级标志 + 各类目列 + 阶段列)
MILESTONE_HEADER = ["序号", "合同编号", "项目编号", "项目名称", "里程碑是否关联回款阶段"]
for _n, _p, _a, _pay, _pct in MILESTONE_DEFS:
    MILESTONE_HEADER.extend([_p, _a])
    if _pay:
        MILESTONE_HEADER.append(_pay)
    if _pct:
        MILESTONE_HEADER.append(_pct)
MILESTONE_HEADER.extend(["阶段计划完成时间", "阶段实际完成时间"])

HIGH_NAMES = {"终验", "服务完成"}
MID_NAMES = {"项目关闭"}


def milestone_priority(name: str, pay_stage: Optional[str]) -> str:
    if name in HIGH_NAMES or str(pay_stage or "").strip():
        return "high"
    if name in MID_NAMES:
        return "mid"
    return "low"


def _norm_date(v: Any) -> str:
    if v is None:
        return ""
    if hasattr(v, "isoformat"):
        return v.isoformat()[:10]
    return str(v).strip()[:10]


def _norm_stage(v: Any) -> str:
    s = str(v or "").strip()
    if not s:
        return ""
    return "；".join(part.strip() for part in s.splitlines() if part.strip())


def _norm_pct(v: Any) -> Optional[float]:
    """里程碑完成百分比列(实物点验/预检/服务完成):0-100 标度,原样返回数值;空→None。
    不复用 pmis.parse_pmis_pct(它会把 >1 的值除以 100,与里程碑展示语义不符)。"""
    s = str(v if v is not None else "").strip().rstrip("%")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_pay_stage_ratio(pay_stage):
    """'到货款1，70.00%' / 多期 '到货款1，70%；到货款2，30%' → 计划回款比例(累加所有期 %/100);无 % → None。"""
    if not pay_stage:
        return None
    pcts = re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*%", str(pay_stage))
    if not pcts:
        return None
    return round(sum(float(p) for p in pcts) / 100, 4)


def row_to_milestones(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    """一行宽表 → 非全空类目的里程碑列表(按 MILESTONE_DEFS 顺序)。"""
    out = []
    for name, pcol, acol, paycol, pctcol in MILESTONE_DEFS:
        plan = _norm_date(row.get(pcol))
        actual = _norm_date(row.get(acol))
        pay = _norm_stage(row.get(paycol)) if paycol else ""
        pct = _norm_pct(row.get(pctcol)) if pctcol else None
        if not (plan or actual or pay or pct is not None):
            continue
        out.append({"name": name, "planDate": plan, "actualDate": actual,
                    "payStage": pay, "pct": pct, "payRatio": parse_pay_stage_ratio(pay),
                    "priority": milestone_priority(name, pay)})
    return out


def _stat(provided: bool, rows: int, matched: int) -> Dict[str, Any]:
    return {"provided": provided, "rows": rows, "matched": matched,
            "matchRate": round(matched / rows, 4) if rows else 0.0}


def _load_one(path: str, keep_ids: Set[str], exclude: Optional[Set[str]] = None
              ) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, Any]]:
    """读单表 → {pid: items}, 质量统计。exclude 中的 pid(已被在建表覆盖,在建优先)
    既不计入 matched 也不进入输出,使已结项统计反映净新增贡献。"""
    rows = read_pmis_sheet(path)
    if not rows:
        return {}, _stat(False, 0, 0)
    exclude = exclude or set()
    out: Dict[str, List[Dict[str, Any]]] = {}
    matched = 0
    for r in rows:
        pid = str(r.get("项目编号") or "").strip()
        if not pid or pid in exclude:
            continue
        if pid in keep_ids:
            matched += 1
            items = row_to_milestones(r)
            if items:
                out[pid] = items
    return out, _stat(True, len(rows), matched)


def load_milestones(pmis_dir: str, keep_ids: Set[str]
                    ) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, Any], Dict[str, Any]]:
    """读在建+已结项两表,按 keep_ids(主域∪原项目)过滤;同项目在建优先
    (已结项表中已被在建覆盖的 pid 不计入已结项统计,也不进入合并结果)。"""
    active, stat_a = _load_one(os.path.join(pmis_dir, config.MILESTONE_FILE_ACTIVE), keep_ids)
    closed, stat_c = _load_one(os.path.join(pmis_dir, config.MILESTONE_FILE_CLOSED),
                               keep_ids, exclude=set(active.keys()))
    merged = dict(closed)
    merged.update(active)
    return merged, stat_a, stat_c
