# yitian_check.py
"""倚天工时域:合规判定(纯函数)。规则常量全部来自 yitian_rules,本模块只写判定逻辑。

入参 row 是归一化后的 dict,键:work_type/content/date/service_mode/customer/
product_line/product_name/project_type/work_type3/work_order。
"""
from __future__ import annotations

import re
from typing import Dict, List, Tuple

import yitian_rules as R

# 一级表的全量关键词(去掉云安全专属词),用于"正文是否含他家产品词"的判断
_ALL_LINE_KWS = {
    kw.lower()
    for _, kws in R.PRODUCT_LINE_KEYWORDS
    for kw in kws
    if kw not in R.EXCLUSIVE_KWS
}


def corrected_work_type(project_type: str, work_type: str) -> str:
    """数据校正:项目类型含「售前服务」→ 工时类型强制为「项目类」(纳入项目类检查与统计口径)。"""
    if R.PRESALE_PROJECT_TYPE_KEY in str(project_type or ""):
        return "项目类"
    return work_type


def is_checked(work_type: str, hours: float) -> bool:
    """[已退役,勿用于新代码] 早期版本用它在后端预判"是否进合规检查"。
    该口径已改为超管可配(yitian_settings.excludedTypes),由前端现算 —— 后端不再预判。
    保留仅为不破坏既有测试;新代码一律不要调用。"""
    if work_type in R.EXCLUDED_TYPES:
        return False
    try:
        h = float(hours)
    except (TypeError, ValueError):
        return False
    return h > 0


def peer_contents(rows: List[dict]) -> Dict[str, str]:
    """按工单编号合并同工单全部工作成果(同工单关联检查用)。无工单号的行不参与。"""
    out: Dict[str, str] = {}
    for r in rows:
        wo = str(r.get("work_order") or "").strip()
        if not wo or wo.lower() in ("nan", "none", "-"):
            continue
        out[wo] = out.get(wo, "") + " " + str(r.get("content") or "")
    return out


def _check_product(row: dict, peer: str) -> Tuple[List[str], List[str]]:
    """产品类别:两级复核 + 同工单关联。返回 ([code], [msg]) 或 ([], [])。"""
    line = str(row.get("product_line") or "").strip()
    name = str(row.get("product_name") or "").strip()
    content = str(row.get("content") or "")
    if not line or line.lower() in ("nan", "none", "-"):
        return [], []

    # 正文含"项目管理" → 不做产品归属判断
    if "项目管理" in content:
        return [], []

    own = None
    for patterns, kws in R.PRODUCT_LINE_KEYWORDS:
        if any(p in line for p in patterns):
            own = kws
            break
    if own is None:
        return [], []            # 产品线不在表中 → 跳过

    low = content.lower()
    if any(kw.lower() in low for kw in own):
        return [], []            # 一级命中本产品词 → 合格

    # 同工单关联:同工单其他工时的正文命中本产品词 → 合格
    if peer and any(kw.lower() in peer.lower() for kw in own):
        return [], []

    own_low = {kw.lower() for kw in own}
    hits = sorted(kw for kw in (_ALL_LINE_KWS - own_low) if kw in low)
    if not hits:
        return [], []            # 既无本产品词也无他家词 → 无法判断,不报错

    # 二级复核:按产研侧产品名称匹配,命中则覆盖一级报错
    if name and name.lower() not in ("nan", "none", "-", "其他"):
        for patterns, kws in R.PRODUCT_NAME_KEYWORDS:
            if any(p in name for p in patterns):
                if any(kw.lower() in low for kw in kws):
                    return [], []
                break

    own_str = "/".join('"%s"' % k for k in own[:3])
    hit_str = "、".join("[%s]" % k for k in hits[:3])
    msg = ('产品类别填写错误:产品线为"%s",工作成果不含%s等本产品关键词,却包含%s等其他产品内容'
           % (line, own_str, hit_str))
    return ["PRODUCT_MISMATCH"], [msg]


def check_row(row: dict, peer: str = "") -> Tuple[List[str], List[str]]:
    """单行合规判定 → (问题码列表, 中文消息列表),两者一一对应。管理类直接合规。"""
    work_type = str(row.get("work_type") or "")
    if work_type == R.MGMT_TYPE:
        return [], []
    if work_type not in R.CHECKED_TYPES:
        return [], []

    content = str(row.get("content") or "")
    codes: List[str] = []
    msgs: List[str] = []

    # 1) 必填三段(全文模糊匹配)
    for code, pattern in (
        ("MISS_SUMMARY", R.SUMMARY_RE),
        ("MISS_PROGRESS", R.PROGRESS_RE),
        ("MISS_NEXT", R.NEXT_RE),
    ):
        if not re.search(pattern, content, re.IGNORECASE):
            codes.append(code)
            msgs.append(R.ISSUE_LABELS[code])

    # 2) 服务方式:读列非空;早于生效日豁免(ISO 日期串字典序可直接比较)
    date_s = str(row.get("date") or "")
    if date_s >= R.SERVICE_MODE_EFFECTIVE_DATE:
        if not str(row.get("service_mode") or "").strip():
            codes.append("MISS_SERVICE_MODE")
            msgs.append(R.ISSUE_LABELS["MISS_SERVICE_MODE"])

    # 3) 工时类型一致性(仅售前类/售后类)
    forbidden = R.TYPE_MISMATCH_RULES.get(work_type)
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
    pcodes, pmsgs = _check_product(row, peer)
    codes.extend(pcodes)
    msgs.extend(pmsgs)

    # 5) 客户名称一致性
    if not str(row.get("customer") or "").strip():
        if re.search(R.CUSTOMER_HINT_RE, content):
            codes.append("MISS_CUSTOMER")
            msgs.append("客户名称未填写,但工作内容中提到客户")

    # 6) 售前服务产品类别提示(只提示,不计不合规)
    if R.PRESALE_PROJECT_TYPE_KEY in str(row.get("project_type") or ""):
        if str(row.get("work_type3") or "") not in R.PRESALE_SKIP_WORKTYPES:
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
