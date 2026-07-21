# lanxin_recipients.py
"""蓝信推送域:组织树 / 收件人解析 / 卡片组装。纯函数,可单测。

为什么不复用 projects.read_org_roster:
  1) 它硬过滤「新L3组织 == 交付实施三部」。今天全表都是三部、行为一样,但等花名册扩到
     整个团队,张英哲的上级必然不属三部,套过滤会把 +4/+5 级挡掉。本模块读全表。
  2) 它的产物落进 yitian_data.json。schema._Base 是 extra="allow",给它加「直接上级」
     字段不会报错,但会静默流进倚天下发数据 —— 本仓吃过 extra=allow 假绿的亏。
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from projects import read_sheet_by_header

MAX_LEVELS = 5

# appCard 字段上限(蓝信官方参数表,单位:UTF-8 字节)
LIMIT_BODY_TITLE = 600
LIMIT_BODY_SUBTITLE = 1200
LIMIT_BODY_CONTENT = 3000
# fields 的上限在两版文档里表述不同,故取两者更严的一个(见 fit_field):
#   developer.lanxin.cn(V4.0.0 依据):18 / 192 【字节】
#   openapi.lanxin.cn (V4.0.3 复核):6 个汉字 / 64 字 【字数】
# 纯中文时等价(6*3=18、64*3=192),混合中英文时不等价 —— 凭证未到位无法实测,不去赌。
LIMIT_FIELD_KEY = 18
LIMIT_FIELD_KEY_CHARS = 6
LIMIT_FIELD_VALUE = 192
LIMIT_FIELD_VALUE_CHARS = 64
LIMIT_SIGNATURE = 96
MAX_FIELDS = 10

SIGNATURE = "项目管理平台"

# 卡片底部引导语。仅在【回调凭证已配置】时附加 —— 回调没配就写「请直接回复」,
# 是让人对着收不到的地方说话。两种发送身份都能收回复(应用号走 account_message,
# 机器人走 bot_private_message),故不按身份区分。
REPLY_HINT = "如有说明，请直接回复本消息"

# 卡片 fields 的 key 上限 18 字节(蓝信硬限)。八类关注原因里这三类超限,
# 其中「总成本超支大于/小于5000」截断后【完全相同】(都成「总成本超支…」),收件人分不清 —— 目验才发现。
# 故卡内用短标签。注意:这【不改口径】,riskReasons 的 RiskCategory 一个字不动,
# 仅组卡时把长名映射成短名显示;bodyContent 里仍用全名列项目,信息不丢。
REASON_SHORT_LABELS = {
    "总成本超支大于5000": "超支>5千",        # 5 字符 / 11 字节
    "总成本超支小于5000": "超支<5千",        # 5 字符 / 11 字节
    # 「未获原项目预算」是 21 字节仍超限;砍成「未获原项目预」虽合规却是缺「算」的残词。
    # 同为 18 字节但通顺的写法:「无原项目预算」。
    "未获取原项目预算": "无原项目预算",      # 24 → 18 字节
}


def short_reason(reason: str) -> str:
    """卡片 fields 的 key 显示名。超 18 字节的三类用短标签,其余原样。"""
    return REASON_SHORT_LABELS.get(reason, reason)


# 工时问题标签同款处理:7 类里 5 类超 18 字节(其中 4 类真问题 + 1 类 HINT_ 提示,均可勾选)。
# 与 REASON_SHORT_LABELS 同一条铁律:字节合规不等于可读,不能是砍掉词尾的残词。
ISSUE_SHORT_LABELS = {
    "缺少下一步工作计划": "缺下一步计划",              # 27 → 18 字节
    "工时类型填报有误": "工时类型有误",                # 24 → 18 字节
    "产品类别填写错误": "产品类别有误",                # 24 → 18 字节
    "客户名称未填写": "缺客户名称",                    # 21 → 15 字节
    "售前服务类产品类别不应为「其他」": "售前类别有误",  # 48 → 18 字节
}


def short_issue(label: str) -> str:
    """工时卡 fields 的 key 显示名。超 18 字节的五类用短标签,其余原样。"""
    return ISSUE_SHORT_LABELS.get(label, label)


def fit_bytes(s: str, limit: int) -> str:
    """按 UTF-8 字节截断(中文 3 字节/字)。超出时末尾加 '…'(自身 3 字节)。
    绝不切半个字符 —— 逐字符累加,放不下就停。"""
    b = s.encode("utf-8")
    if len(b) <= limit:
        return s
    ell = "…"
    budget = limit - len(ell.encode("utf-8"))
    if budget <= 0:
        return ""
    out = []
    used = 0
    for ch in s:
        n = len(ch.encode("utf-8"))
        if used + n > budget:
            break
        out.append(ch)
        used += n
    return "".join(out) + ell


def fit_field(s: str, max_chars: int, max_bytes: int) -> str:
    """fields 专用截断:字符数与字节数【同时】满足,取更严的那个。

    bodyTitle/bodySubTitle/bodyContent 明写字节上限,用 fit_bytes 即可;
    唯独 fields 两版文档一个说字节、一个说字数,含英文/数字的标签在两种解读下
    结果不同(例:「成本超支>5k」7 字符但只有 15 字节)。两边都不越即可,
    代价仅是混合文本略严一点。"""
    if len(s) <= max_chars and len(s.encode("utf-8")) <= max_bytes:
        return s
    ell = "…"
    char_budget = max_chars - len(ell)
    byte_budget = max_bytes - len(ell.encode("utf-8"))
    if char_budget <= 0 or byte_budget <= 0:
        return ""
    out = []
    used = 0
    for ch in s:
        n = len(ch.encode("utf-8"))
        if len(out) + 1 > char_budget or used + n > byte_budget:
            break
        out.append(ch)
        used += n
    return "".join(out) + ell


def read_org_tree(path: str) -> Dict[str, Any]:
    """组织架构表 → {'byId': {工号: {name,supId,l4,l31}}, 'byName': {姓名: [工号,...]}}。
    读全表,不按 新L3组织 过滤(见模块 docstring)。工号大写归一,与花名册跨域连接键一致。
    byName 的值是 list —— 为重名(1:N)留位,消费方必须自行处理 len>1。"""
    rows = read_sheet_by_header(path, "工号")
    by_id: Dict[str, Dict[str, Any]] = {}
    by_name: Dict[str, List[str]] = {}
    for r in rows:
        emp = str(r.get("工号") or "").strip().upper()
        if not emp:
            continue
        name = str(r.get("姓名") or "").strip()
        sup = str(r.get("直接上级工号") or "").strip().upper() or None
        by_id[emp] = {
            "name": name,
            "supId": sup,
            "l4": str(r.get("新L4组织") or "").strip(),
            "l31": str(r.get("新L3-1组织") or "").strip(),
        }
        if name:
            by_name.setdefault(name, []).append(emp)
    return {"byId": by_id, "byName": by_name}


def supervisor_chain(tree: Dict[str, Any], emp_id: str, levels: int) -> List[str]:
    """从 emp_id 向上最多 levels 级,返回上级工号列表(不含自己,近的在前)。
    带环检测(seen)、深度上限;上级为空/不在册 → 停止(不报错:L4 组长的 +3 本就没有对象)。"""
    if levels <= 0:
        return []
    levels = min(levels, MAX_LEVELS)
    by_id = tree["byId"]
    out: List[str] = []
    seen = {emp_id}
    cur = (by_id.get(emp_id) or {}).get("supId")
    while cur and cur not in seen and cur in by_id and len(out) < levels:
        out.append(cur)
        seen.add(cur)
        cur = by_id[cur].get("supId")
    return out


def resolve_project_manager(tree: Dict[str, Any],
                            pmis_team: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """PMIS team.项目经理(姓名) → 工号。→ (工号, None) 或 (None, 原因)。
    1:N 时跳过并报告 —— 推给错的人比不推更糟。"""
    name = str((pmis_team or {}).get("项目经理") or "").strip()
    if not name:
        return None, "项目无经理"
    ids = tree["byName"].get(name) or []
    if not ids:
        return None, "经理不在花名册"
    if len(ids) > 1:
        return None, "姓名映射到多个工号"
    return ids[0], None


def _field(key: str, value: str) -> Dict[str, str]:
    return {"key": fit_field(key, LIMIT_FIELD_KEY_CHARS, LIMIT_FIELD_KEY),
            "value": fit_field(value, LIMIT_FIELD_VALUE_CHARS, LIMIT_FIELD_VALUE)}


def _card(head: str, title: str, subtitle: str, fields: List[Dict[str, str]],
          content: str = "") -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "headTitle": head,
        "bodyTitle": fit_bytes(title, LIMIT_BODY_TITLE),
        "bodySubTitle": fit_bytes(subtitle, LIMIT_BODY_SUBTITLE),
        "fields": fields[:MAX_FIELDS],
        "signature": fit_bytes(SIGNATURE, LIMIT_SIGNATURE),
    }
    if content:
        out["bodyContent"] = fit_bytes(content, LIMIT_BODY_CONTENT)
    return out


def build_timesheet_card(name: str, issues: List[Dict[str, Any]],
                         start: str, end: str, reply_hint: bool = False) -> Dict[str, Any]:
    """工时卡 → 填报人本人。问题类型共 7 类,fields 恒 ≤10 对,永不撞线。
    start/end 任一为空 → 不出「统计区间」这行副标题,绝不拼出半截文案(宁可不显示,不显示空区间)。
    reply_hint=True 时在 bodyContent 追加回复引导语(仅回调凭证已配置时由调用方传 True)。"""
    total = sum(int(i["count"]) for i in issues)
    rows = sorted(issues, key=lambda i: -int(i["count"]))
    fields = [_field(short_issue(i["label"]), "%d 条" % int(i["count"])) for i in rows]
    subtitle = "统计区间 %s ~ %s" % (start, end) if start and end else ""
    content = REPLY_HINT if reply_hint else ""
    return _card("工时填报提醒",
                 "你有 %d 条工时填报存在问题" % total,
                 subtitle,
                 fields,
                 content)


def build_project_card(name: str, by_reason: Dict[str, List[str]],
                       reply_hint: bool = False) -> Dict[str, Any]:
    """项目卡 → 项目经理本人。
    fields 按【原因】排(共 8 类,恒 ≤10 对) —— 不能按项目名排:实测单人最多背 49 个项目。
    具体项目名进 bodyContent(3000 字节/八行),超出显式写「另有 N 个未列出」。
    「未列出」按项目去重计数(M-3):一个项目可能同时命中多个原因,若它已经靠某一行挤进了
    bodyContent,就不算「未列出」——即便它在另一行(被截断丢弃的原因)里也出现过。旧实现按
    原因逐条累加(omitted += len(names)),同一项目撞两个原因就会被数两次,曾在「单人49个
    项目×8类原因」的实测上界下出现「标题49个、正文却说另有60个未列出」的自相矛盾。"""
    rows = sorted(by_reason.items(), key=lambda kv: -len(kv[1]))
    fields = [_field(short_reason(r), "%d 个项目" % len(ps)) for r, ps in rows]
    distinct = len({p for ps in by_reason.values() for p in ps})

    lines: List[str] = []
    used = 0
    shown: set = set()      # 已经写进 bodyContent 某一行的项目名
    dropped: set = set()    # 因超预算被丢弃那一行涉及的项目名
    # 预留「另有…」的 60 字节;引导语是循环后追加的,也必须先扣掉,
    # 否则最坏情形会被 _card 的 fit_bytes 截成半截指令(引导语是操作指引,
    # 截半了比不显示更糟 —— 用户不知道该做什么)。
    reserve = 60 + (len(REPLY_HINT.encode("utf-8")) + 1 if reply_hint else 0)
    for reason, names in rows:
        line = "%s：%s" % (reason, "、".join(names))
        n = len(line.encode("utf-8")) + 1
        if used + n > LIMIT_BODY_CONTENT - reserve:
            dropped.update(names)
            continue
        lines.append(line)
        used += n
        shown.update(names)
    omitted = dropped - shown      # 只统计【完全没出现在正文里】的项目
    if omitted:
        lines.append("另有 %d 个项目未列出" % len(omitted))
    if reply_hint:
        lines.append(REPLY_HINT)
    return _card("项目关注提醒",
                 "你名下 %d 个项目存在关注原因" % distinct,
                 "",
                 fields,
                 "\n".join(lines))


def build_summary_card(name: str, rows: List[Dict[str, Any]], level_label: str,
                       unit: str = "项", head_title: str = "项目关注提醒",
                       title_fmt: str = "你的团队有 %d 个项目存在关注原因",
                       label_fn=short_reason, reply_hint: bool = False) -> Dict[str, Any]:
    """汇总卡 → 上级。按【直接下属 × 原因/问题码】嵌套聚合:key=姓名, value='N <unit>：标签 n · 标签 n'。
    数字是该下属整棵子树的合计(逐层卷上去)。只列有异常的直属。
    主动不越 10 对 —— 蓝信超限行为未知,不去赌。
    unit/head_title/title_fmt/label_fn 让本函数同时服务项目路由(默认:项目/短原因)与
    工时路由(条/短问题标签)—— 两者量纲不同,文案不能共用「N 个项目」。"""
    ordered = sorted(rows, key=lambda r: -int(r["total"]))
    shown = ordered[:MAX_FIELDS]
    rest = ordered[MAX_FIELDS:]
    total = sum(int(r["total"]) for r in ordered)

    fields: List[Dict[str, str]] = []
    for r in shown:
        parts = ["%s %d" % (label_fn(c), n) for c, n in sorted(r["reasons"], key=lambda x: -x[1])]
        value = "%d %s：%s" % (int(r["total"]), unit, " · ".join(parts))
        # value 超 192 字节时逐个丢掉最小的原因,末尾以「等」示意
        while (len(value) > LIMIT_FIELD_VALUE_CHARS
               or len(value.encode("utf-8")) > LIMIT_FIELD_VALUE) and len(parts) > 1:
            parts.pop()
            value = "%d %s：%s 等" % (int(r["total"]), unit, " · ".join(parts))
        fields.append(_field(r["name"], value))

    content = ""
    if rest:
        content = "另有 %d 人共 %d %s未列出" % (len(rest), sum(int(r["total"]) for r in rest), unit)
    if reply_hint:
        content = (content + "\n" + REPLY_HINT) if content else REPLY_HINT
    return _card(head_title,
                 title_fmt % total,
                 level_label,
                 fields,
                 content)
