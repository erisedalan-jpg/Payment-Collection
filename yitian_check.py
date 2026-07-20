# yitian_check.py
"""倚天工时域:合规判定(纯函数)。判定所用规则全部来自传入的 cfg(yitian_rules_config 结构);
本模块只写判定逻辑。cfg=None 时回落 default_config()。

入参 row 是归一化后的 dict,键:work_type/content/date/service_mode/customer/
product_line/product_name/project_type/work_type3/work_order。
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple

import yitian_rules as R   # 仅用非规则常量:ISSUE_LABELS / HINT_PREFIX / PRESALE_PROJECT_TYPE_KEY


def corrected_work_type(project_type: str, work_type: str) -> str:
    """数据校正:项目类型含「售前服务」→ 工时类型强制为「项目类」。"""
    if R.PRESALE_PROJECT_TYPE_KEY in str(project_type or ""):
        return "项目类"
    return work_type


def peer_contents(rows: List[dict]) -> Dict[str, str]:
    """按工单编号合并同工单全部工作成果(同工单关联检查用)。无工单号的行不参与。"""
    out: Dict[str, str] = {}
    for r in rows:
        wo = str(r.get("work_order") or "").strip()
        if not wo or wo.lower() in ("nan", "none", "-"):
            continue
        out[wo] = out.get(wo, "") + " " + str(r.get("content") or "")
    return out


def _keywords_re(keywords: List[str]) -> str:
    """关键词列表拼成 (a|b|c),各词 re.escape(默认词无特殊字符,行为与旧正则一致)。"""
    return "(" + "|".join(re.escape(k) for k in keywords) + ")"


def _all_line_kws(cfg: dict) -> set:
    """他家产品词全集(去专属词),按 cfg 现算(不再 import 期固化为模块常量)。"""
    exclusive = set(cfg["checks"]["product"].get("exclusiveKws", []))
    return {kw.lower()
            for entry in cfg["checks"]["product"]["lineKeywords"]
            for kw in entry["keywords"]
            if kw not in exclusive}


def _check_product(row: dict, peer: str, cfg: dict) -> Tuple[List[str], List[str]]:
    """产品类别:两级复核 + 同工单关联。返回 ([code], [msg]) 或 ([], [])。"""
    pc = cfg["checks"]["product"]
    line = str(row.get("product_line") or "").strip()
    name = str(row.get("product_name") or "").strip()
    content = str(row.get("content") or "")
    if not line or line.lower() in ("nan", "none", "-"):
        return [], []
    if "项目管理" in content:
        return [], []

    own = None
    for entry in pc["lineKeywords"]:
        if any(p in line for p in entry["linePatterns"]):
            own = entry["keywords"]
            break
    if own is None:
        return [], []

    low = content.lower()
    if any(kw.lower() in low for kw in own):
        return [], []
    if peer and any(kw.lower() in peer.lower() for kw in own):
        return [], []

    own_low = {kw.lower() for kw in own}
    hits = sorted(kw for kw in (_all_line_kws(cfg) - own_low) if kw in low)
    if not hits:
        return [], []

    if name and name.lower() not in ("nan", "none", "-", "其他"):
        for entry in pc["nameKeywords"]:
            if any(p in name for p in entry["namePatterns"]):
                if any(kw.lower() in low for kw in entry["keywords"]):
                    return [], []
                break

    own_str = "/".join('"%s"' % k for k in own[:3])
    hit_str = "、".join("[%s]" % k for k in hits[:3])
    msg = ('产品类别填写错误:产品线为"%s",工作成果不含%s等本产品关键词,却包含%s等其他产品内容'
           % (line, own_str, hit_str))
    return ["PRODUCT_MISMATCH"], [msg]


def check_row(row: dict, peer: str = "", cfg: dict = None) -> Tuple[List[str], List[str]]:
    """单行合规判定 → (问题码列表, 中文消息列表)。cfg=None 用默认配置。
    仅 cfg['checkedTypes'] 内的工时类型进检查;每检查项先看 enabled。"""
    if cfg is None:
        import yitian_rules_config as RC
        cfg = RC.default_config()

    work_type = str(row.get("work_type") or "")
    if work_type not in cfg["checkedTypes"]:
        return [], []

    content = str(row.get("content") or "")
    checks = cfg["checks"]
    codes: List[str] = []
    msgs: List[str] = []

    # 1) 必填三段(全文模糊匹配,大小写不敏感)
    for key, code in (("summary", "MISS_SUMMARY"), ("progress", "MISS_PROGRESS"), ("next", "MISS_NEXT")):
        c = checks[key]
        if c["enabled"] and c["keywords"]:
            if not re.search(_keywords_re(c["keywords"]), content, re.IGNORECASE):
                codes.append(code)
                msgs.append(R.ISSUE_LABELS[code])

    # 2) 服务方式:V4.0.4 起与必填三段一致 —— 在【正文】里找关键词,不再读工时表的「服务方式」列。
    #    早于生效日豁免(ISO 日期串字典序可直接比较),不翻旧账。
    sm = checks["serviceMode"]
    if sm["enabled"] and sm["keywords"]:
        if str(row.get("date") or "") >= sm["effectiveDate"]:
            if not re.search(_keywords_re(sm["keywords"]), content, re.IGNORECASE):
                codes.append("MISS_SERVICE_MODE")
                msgs.append(R.ISSUE_LABELS["MISS_SERVICE_MODE"])

    # 3) 工时类型一致性(禁止词 → 疑似填错类型)
    tm = checks["typeMismatch"]
    if tm["enabled"]:
        forbidden = tm["rules"].get(work_type)
        if forbidden:
            by_target: Dict[str, List[str]] = {}
            for kw, target in forbidden:
                if kw in content:
                    by_target.setdefault(target, []).append(kw)
            if by_target:
                parts = []
                for target, kws in by_target.items():
                    parts.append("%s工时疑似含%s内容:%s"
                                 % (work_type, target, "、".join("[%s]" % k for k in kws)))
                codes.append("TYPE_MISMATCH")
                msgs.append(";".join(parts))

    # 4) 产品类别
    if checks["product"]["enabled"]:
        pcodes, pmsgs = _check_product(row, peer, cfg)
        codes.extend(pcodes)
        msgs.extend(pmsgs)

    # 5) 客户名称一致性(客户列空但正文提到客户;大小写敏感,与旧口径一致)
    cu = checks["customer"]
    if cu["enabled"] and cu["hintKeywords"]:
        if not str(row.get("customer") or "").strip():
            if re.search(_keywords_re(cu["hintKeywords"]), content):
                codes.append("MISS_CUSTOMER")
                msgs.append("客户名称未填写,但工作内容中提到客户")

    # 6) 售前服务产品类别提示(只提示,不计不合规)
    ph = checks["presaleProductHint"]
    if ph["enabled"]:
        if R.PRESALE_PROJECT_TYPE_KEY in str(row.get("project_type") or ""):
            if str(row.get("work_type3") or "") not in ph["skipWorkTypes"]:
                if str(row.get("product_line") or "").strip() == "其他":
                    codes.append("HINT_PRESALE_PRODUCT")
                    msgs.append(R.ISSUE_LABELS["HINT_PRESALE_PRODUCT"])

    return codes, msgs


def ok_of(codes: List[str]) -> int:
    """0=合规 / 1=合规(提示) / 2=问题。含任一非 HINT_ 码即为问题。"""
    if not codes:
        return 0
    if any(not c.startswith(R.HINT_PREFIX) for c in codes):
        return 2
    return 1
