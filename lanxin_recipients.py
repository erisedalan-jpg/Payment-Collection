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


def build_action_hint(deadline_hours: int, h5_url: str = "",
                      reply_hint: bool = False) -> str:
    """卡片末尾「动作要求」文案。按【实际可用的回流通道】三态生成。

    返回空串 = 没有任何通道,调用方据此【不输出】动作要求 field。
    为什么不退化成「请及时处理」之类:卡上承诺「N 小时内未反馈将列入《未响应清单》」
    却没有任何能反馈的地方,就是空头支票。REPLY_HINT 上方注释已有同款判断
    (「回调没配就写『请直接回复』,是让人对着收不到的地方说话」)。

    deadline_hours 由调用方传入,本函数【不设默认值】—— 默认值散落多处,
    正是「卡上写 24 小时、清单按 48 小时算」这类事故的成因。
    """
    if h5_url:
        action = "请点击卡片逐条反馈"
    elif reply_hint:
        action = "请直接回复本消息反馈"
    else:
        return ""
    return "%s，%d小时内未反馈将列入《未响应清单》" % (action, deadline_hours)


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
          content: str = "", card_link: str = "") -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "headTitle": head,
        "bodyTitle": fit_bytes(title, LIMIT_BODY_TITLE),
        "bodySubTitle": fit_bytes(subtitle, LIMIT_BODY_SUBTITLE),
        "fields": fields[:MAX_FIELDS],
        "signature": fit_bytes(SIGNATURE, LIMIT_SIGNATURE),
    }
    if content:
        out["bodyContent"] = fit_bytes(content, LIMIT_BODY_CONTENT)
    # cardLink 非空即让整卡可点(蓝信实测)。空串【不写这个键】—— 写了等于整卡
    # 点了没反应,比不可点更糟(用户以为坏了)。
    # 【不做任何截断】:它是 URL,截断即失效;token 约 100+ 字符,总长可轻易超过
    # 其它字段的字节上限,套用 fit_* 会把链接切坏。
    if card_link:
        out["cardLink"] = card_link
    return out


def build_timesheet_card(name: str, issues: List[Dict[str, Any]],
                         start: str, end: str, action_hint: str = "",
                         sent_at: str = "", card_link: str = "") -> Dict[str, Any]:
    """工时卡 → 填报人本人。

    issues 元素:{"code":…, "label":…, "count":…, "lastDate": "YYYY-MM-DD"(可选)}
    lastDate 缺失 → 不拼「· 最近 …」,绝不拼出半截文案(与 start/end 同策略:
    宁可不显示,不显示空值)。
    card_link: 整卡点击链接。非空时蓝信让整卡可点,空则卡片不可点。

    问题码共 8 类 → 明细最多 8 行,加动作要求 = 9,永不触及蓝信 10 对上限
    (_card 仍有 fields[:MAX_FIELDS] 兜底)。
    """
    total = sum(int(i["count"]) for i in issues)
    rows = sorted(issues, key=lambda i: -int(i["count"]))
    fields: List[Dict[str, str]] = []
    for i in rows:
        value = "%d 条" % int(i["count"])
        last = str(i.get("lastDate") or "")
        # 长度判断而非单纯真值判断:lastDate 若被传成"2026"这类不足 5 字符的非法短值,
        # 仍是真值但 last[5:] 会切出空串,拼出"· 最近 "这种被明令禁止的半截文案。
        if len(last) >= 5:
            value += " · 最近 %s" % last[5:]      # 'YYYY-MM-DD' → 'MM-DD',卡片上年份是噪音
        fields.append(_field(short_issue(i["label"]), value))
    if action_hint:
        fields.append(_field("动作要求", action_hint))

    return _card(("推送时间：%s" % sent_at) if sent_at else "工时填报提醒",
                 "你有 %d 条工时填报存在问题" % total,
                 "统计区间 %s ~ %s" % (start, end) if start and end else "",
                 fields,
                 "",
                 card_link)


PROJECT_DETAIL_ROWS = 8        # 明细行上限。8 + 「其余」+ 「动作要求」= 10,正好是蓝信 fields 硬上限


def build_project_card(name: str, projects: List[Dict[str, Any]],
                       action_hint: str = "", sent_at: str = "",
                       card_link: str = "") -> Dict[str, Any]:
    """项目卡 → 项目经理本人。一人一张。

    projects: [{"name": 项目名, "reasons": [{"category":…, "detail":…}, …]}, …]
    card_link: 整卡点击链接。非空时蓝信让整卡可点,空则卡片不可点。

    为什么仍是聚合卡而不是单项目单卡:实测 638 个在建项目里 324 个命中关注原因、
    涉及 69 人,单人最多背 32 个 —— 单项目单卡会让 3 个人一次收到 20+ 张,一次就砸掉
    功能信任。督办系统能用单卡是因为它按「计划回款日 T-15/T/T+15」触发、天然稀疏,
    我们是存量全量扫描、天然稠密。

    fields.key 用【序号】而非项目名:蓝信 key 上限 6 汉字/18 字节,项目名普遍超限,
    截断后可能撞名(见 REASON_SHORT_LABELS 上方那条实测)。项目名放 value(64 字)。

    明细行上限恒为 PROJECT_DETAIL_ROWS,【不因 action_hint 缺席而放宽】——
    条件式上限会让「同一个人、配置一变、卡片行数就变」,排查时多一个变量。

    按项目分行使每个项目恰好出现一次。旧实现按【原因】分行,同一项目命中多个原因时
    会在多行出现,不得不用 omitted = dropped - shown 去重,否则出现「标题说 49 个、
    正文说另有 60 个未列出」的自相矛盾(实测过)。新结构下该矛盾不可能发生,去重逻辑
    已随之删除,不是保留。
    """
    rows = sorted(projects, key=lambda p: (-len(p["reasons"]), p["name"]))
    shown, rest = rows[:PROJECT_DETAIL_ROWS], rows[PROJECT_DETAIL_ROWS:]

    fields: List[Dict[str, str]] = []
    for idx, p in enumerate(shown, 1):
        parts = [("%s(%s)" % (r["category"], r["detail"])) if r.get("detail") else r["category"]
                 for r in p["reasons"]]
        fields.append(_field(str(idx), "%s · %s" % (p["name"], "、".join(parts))))
    if rest:
        # N 是【全量计数】,与名字列表是否被 fit_field 截断无关
        fields.append(_field("其余", "另有 %d 个：%s"
                             % (len(rest), "、".join(p["name"] for p in rest))))
    if action_hint:
        fields.append(_field("动作要求", action_hint))

    return _card(("推送时间：%s" % sent_at) if sent_at else "项目关注提醒",
                 "你名下 %d 个项目需要跟进" % len(rows),
                 "",
                 fields,
                 "",
                 card_link)      # bodyContent 留空:它渲染在 fields 之前,动作要求放这儿会跑到最上面


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
