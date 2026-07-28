# yitian_derive.py
"""倚天工时域:派生字段(纯函数,V4.5.4)。

四组:产品线校准 / 项目管理工时标签 / 客户占位词识别 / 可转移非原厂五档判定。
判定所用词表全部来自传入的 cfg 段(yitian_rules_config 结构),本模块只写逻辑。
"""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Tuple

# 校准状态
LINE_SRC_RAW = 0          # 原值有效,未触发校准
LINE_SRC_CALIBRATED = 1   # 唯一命中,已校准
LINE_SRC_AMBIGUOUS = 2    # 命中 >=2 条产品线,留白
LINE_SRC_UNMATCHED = 3    # 零命中,留白

# 可转移五档(数值写死,前端标签按下标取,勿调整顺序)
TR_UNATTRIBUTED = 0
TR_M12 = 1
TR_PM = 2
TR_NOT_CHANNEL = 3
TR_YES = 4

_EMPTY_LINE = ("", "其他", "nan", "none", "-")


def canonical_line(short: str, vocab: Iterable[str] = ()) -> Tuple[str, bool]:
    """匹配短名 → 规范产品线全称。返回 (值, 是否已解析)。

    lineKeywords 的 linePatterns 是用来【匹配】原始产品线的**短名**(如「威胁感知」),
    而产品线的规范取值是**全称**(如「威胁感知（天眼）」)。不做这一步有两个后果:
      ① dims.products 里同一条产品线会同时出现短名与全称两个值 —— 明细页那一列、
         列筛选、以及按产品线/大类的聚合全部会裂成两半;
      ② 按全称建键的产品分类表查不到 → 产品大类与渠道可交付静默落空(实测少算 216h,
         「可转移非原厂」被低估 1.3%)。
    实测 21 条 linePatterns 里有 6 条是短名(一体化终端/新天擎/威胁感知/保密监管/
    网闸/服务器安全管理),在产品分类表里各自的前缀候选均唯一。

    候选唯一才采纳;**0 个或多个都判未解析**,由调用方留白并告警,绝不静默取第一个。
    vocab 为空(产品分类表缺失)时不解析、原样返回 —— 该退化场景已由就绪度
    productCategory.provided=false 的 [WARN] 覆盖,不在这里重复报。
    """
    if not vocab:
        return short, True
    names = list(vocab)
    if short in names:
        return short, True
    cand = [k for k in names if short in k]
    return (cand[0], True) if len(cand) == 1 else (short, False)


def unresolved_aliases(line_keywords: List[dict], vocab: Iterable[str] = ()) -> List[str]:
    """配置健康检查:linePatterns 短名中无法在 vocab 里唯一定位的那些。

    一次性检查(21x108),不随行跑。返回非空即说明词库与产品分类表对不上,
    这些产品线的校准结果会被留白 —— 调用方须打 [WARN],否则又是一处静默降级。
    """
    if not vocab:
        return []
    out = []
    for entry in line_keywords:
        pats = entry.get("linePatterns") or []
        if not pats:
            continue
        short = str(pats[0])
        if not canonical_line(short, vocab)[1]:
            out.append(short)
    return out


def calibrate_line(product_line: str, work_type: str, content: str,
                   line_keywords: List[dict], checked_types: Iterable[str],
                   vocab: Iterable[str] = ()) -> Tuple[str, int]:
    """校准后产研侧产品线。返回 (生效产品线, 校准状态码)。

    触发条件:产品线 ∈ {空, 其他} 且 工时类型 ∈ checked_types(客户类)。
    命中判定:拿工作成果去撞【全部】产品线的关键词集合(大小写不敏感)——
      恰好 1 条 → 经 canonical_line 解析成规范全称后采纳;>=2 条 → 留白(ambiguous);
      0 条 → 留白(unmatched)。唯一命中但短名无法唯一解析 → 同样留白(ambiguous),
      绝不把非规范短名写进产品线码表。

    **只采纳唯一命中**。词库是为反方向设计的(已知产品线验内容),反过来猜产品线时
    实测多义率 67%(86 个关键词里 19 个被多条产品线共用)。按优先级表强选一个,
    等于把 2/3 的下游结论建在无业务依据的猜测上,且错了无任何信号。

    vocab:规范产品线全集(产品分类表的键)。省略则不做短名解析,行为与 V4.5.4 前一致。
    """
    line = str(product_line or "").strip()
    if line.lower() not in _EMPTY_LINE:
        return line, LINE_SRC_RAW
    if str(work_type or "") not in set(checked_types):
        return line, LINE_SRC_RAW

    low = str(content or "").lower()
    hits = []
    for entry in line_keywords:
        pats = entry.get("linePatterns") or []
        kws = entry.get("keywords") or []
        if not pats:
            continue
        if any(str(k).lower() in low for k in kws):
            hits.append(str(pats[0]))
    uniq = sorted(set(hits))
    if len(uniq) == 1:
        canon, resolved = canonical_line(uniq[0], vocab)
        return (canon, LINE_SRC_CALIBRATED) if resolved else (line, LINE_SRC_AMBIGUOUS)
    if len(uniq) > 1:
        return line, LINE_SRC_AMBIGUOUS
    return line, LINE_SRC_UNMATCHED


def _role_re(prefixes: List[str], keywords: List[str]):
    """角色槽位正则:前缀词 + 至多 4 个分隔符 + 至多 12 字 + 角色词。
    骨架固定在代码、只有词表可配 —— 用户可控正则会静默命中 0 条,且有 ReDoS 风险。"""
    if not prefixes or not keywords:
        return None
    p = "(" + "|".join(re.escape(x) for x in prefixes) + ")"
    k = "(" + "|".join(re.escape(x) for x in keywords) + ")"
    return re.compile(p + r"[】\]\s:：]{0,4}[^。；\n]{0,12}?" + k)


def pm_tag(work_type: str, work_type3: str, content: str, seg: dict) -> bool:
    """项目管理工时标签。两条件任一成立即为真。

    ① 工时类型 == 项目类 且 工作类型三 ∈ seg["workType3"]
    ② 工时类型 ∉ seg["excludeTypes"] 且 工作成果命中角色槽位

    **条件② 必须用角色槽位、不可用裸关键词**:实测裸匹配多吃 51 行/290h,
    抽查 6 条全是假阳性(「输出给项目经理」「反馈给我司项目经理」等)。
    假阳性会让「可转移非原厂」被低估,宁窄勿宽。
    """
    if not seg.get("enabled", True):
        return False
    wt = str(work_type or "")
    if wt == "项目类" and str(work_type3 or "") in set(seg.get("workType3") or []):
        return True
    if wt in set(seg.get("excludeTypes") or []):
        return False
    rx = _role_re(list(seg.get("rolePrefixes") or []), list(seg.get("roleKeywords") or []))
    return bool(rx and rx.search(str(content or "")))


def is_placeholder_customer(customer: str, seg: dict) -> bool:
    """客户不可归属:客户字段为空,或**精确等于**占位词表中某一项。

    精确匹配、不做子串 —— 「受影响的客户张三」是真实填写的变体,子串匹配会误伤。
    seg 禁用时只判空(空客户名永远是不可归属,与词表无关)。
    """
    c = str(customer or "").strip()
    if not c:
        return True
    if not seg.get("enabled", True):
        return False
    return c in set(seg.get("customerWords") or [])


def transferable(cust_unknown: bool, quad: str, pm: bool, channel: bool) -> int:
    """可转移非原厂支持,五档。判定顺序不可调整。

    ① 客户不可归属 —— **必须先判**。这批工时的客户象限必然为空,若按字面
       「象限 != M1/M2」往下走会被判成「可转移」,那是编出来的结论。
    ② 客户象限 M1/M2 → 战略客户仍原厂支持(前缀匹配,象限值后半段是描述文案会变)
    ③ 项目管理工时 → 仍原厂支持
    ④ 非渠道商可交付产品 → 无法转移
    ⑤ 以上皆否 → 可转移
    """
    if cust_unknown:
        return TR_UNATTRIBUTED
    q = str(quad or "").strip()
    if q.startswith("M1") or q.startswith("M2"):
        return TR_M12
    if pm:
        return TR_PM
    if not channel:
        return TR_NOT_CHANNEL
    return TR_YES
