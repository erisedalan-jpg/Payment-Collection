import pytest
import lanxin_config as LC
import lanxin_recipients as LR


def _tree(rows):
    """rows: [(工号, 姓名, 上级工号)] → read_org_tree 的产物结构"""
    by_id = {i: {"name": n, "supId": s, "l4": "", "l31": ""} for i, n, s in rows}
    by_name = {}
    for i, n, _ in rows:
        by_name.setdefault(n, []).append(i)
    return {"byId": by_id, "byName": by_name}


ORG = _tree([
    ("A001", "张英哲", None),      # 根
    ("A002", "于岩", "A001"),
    ("A003", "隋文宇", "A001"),
    ("A004", "陶俊", "A002"),
    ("A005", "耿磊磊", "A003"),
    ("A006", "张三", "A005"),      # 员工级
])


def test_chain_walks_up_cumulatively():
    assert LR.supervisor_chain(ORG, "A006", 1) == ["A005"]
    assert LR.supervisor_chain(ORG, "A006", 2) == ["A005", "A003"]
    assert LR.supervisor_chain(ORG, "A006", 3) == ["A005", "A003", "A001"]


def test_chain_stops_at_root_no_error():
    """链长不足即停,不报错 —— L4 组长的 +3 本就没有对象(实测常态)。"""
    assert LR.supervisor_chain(ORG, "A006", 5) == ["A005", "A003", "A001"]
    assert LR.supervisor_chain(ORG, "A004", 5) == ["A002", "A001"]
    assert LR.supervisor_chain(ORG, "A001", 5) == []


def test_chain_levels_zero_returns_empty():
    assert LR.supervisor_chain(ORG, "A006", 0) == []


def test_chain_detects_cycle():
    """花名册是人工维护的 xlsx,填成环就会死循环。必须带环检测。"""
    bad = _tree([("X1", "甲", "X2"), ("X2", "乙", "X1")])
    assert LR.supervisor_chain(bad, "X1", 5) == ["X2"]     # 走到 X1 发现回到起点,停


def test_chain_self_loop():
    bad = _tree([("Y1", "丙", "Y1")])
    assert LR.supervisor_chain(bad, "Y1", 5) == []


def test_chain_stops_when_supervisor_outside_roster():
    outside = _tree([("Z1", "丁", "NOT_IN_ROSTER")])
    assert LR.supervisor_chain(outside, "Z1", 5) == []


def test_resolve_manager_ok():
    assert LR.resolve_project_manager(ORG, {"项目经理": "张三"}) == ("A006", None)


def test_resolve_manager_not_in_roster():
    emp, reason = LR.resolve_project_manager(ORG, {"项目经理": "查无此人"})
    assert emp is None and reason == "经理不在花名册"


def test_resolve_manager_homonym_skips_never_guesses():
    """姓名 1:N 时必须跳过并报告,绝不猜 —— 推给错的人比不推更糟。"""
    dup = _tree([("D1", "重名", None), ("D2", "重名", None)])
    emp, reason = LR.resolve_project_manager(dup, {"项目经理": "重名"})
    assert emp is None and reason == "姓名映射到多个工号"


def test_resolve_manager_empty():
    emp, reason = LR.resolve_project_manager(ORG, {"项目经理": "  "})
    assert emp is None and reason == "项目无经理"


def test_fit_bytes_counts_utf8_not_chars():
    """中文 3 字节/字 —— 按字符数算会把 192 字节的框撑到 576 字节。"""
    assert LR.fit_bytes("中文", 10) == "中文"          # 6 字节,不截
    out = LR.fit_bytes("中文中文中文", 10)             # 18 字节 → 截
    assert len(out.encode("utf-8")) <= 10
    assert out.endswith("…")


def test_fit_bytes_never_splits_a_char():
    out = LR.fit_bytes("中中中", 4)                    # 4 字节放不下 2 个中文
    assert out.encode("utf-8")                         # 不抛 UnicodeDecodeError
    assert len(out.encode("utf-8")) <= 4


def test_fit_bytes_noop_when_short():
    assert LR.fit_bytes("abc", 100) == "abc"


def test_summary_card_nested_shape():
    rows = [{"name": "隋文宇", "total": 14, "reasons": [("回款延期", 6), ("成本超支", 5)]},
            {"name": "于岩", "total": 9, "reasons": [("回款延期", 3)]}]
    card = LR.build_summary_card("张英哲", rows, "部门级汇总（+3）")
    assert len(card["fields"]) == 2
    assert card["fields"][0]["key"] == "隋文宇"
    assert card["fields"][0]["value"].startswith("14 项：")
    assert "回款延期 6" in card["fields"][0]["value"]
    assert "23 个项目" in card["bodyTitle"]
    assert card["bodySubTitle"] == "部门级汇总（+3）"


def test_summary_card_caps_fields_at_10_and_says_so():
    """主动不越 10 对 —— 蓝信超限行为未知(拒绝?静默截断?),不去赌。"""
    rows = [{"name": "下属%02d" % i, "total": 20 - i, "reasons": [("回款延期", 1)]}
            for i in range(13)]
    card = LR.build_summary_card("组长", rows, "直接上级（+1）")
    assert len(card["fields"]) == 10
    assert card["fields"][0]["key"] == "下属00"       # 按 total 降序
    assert "另有 3 人" in card["bodyContent"]


def test_summary_card_value_within_192_bytes():
    rows = [{"name": "甲", "total": 99,
             "reasons": [("总成本超支大于5000", 20), ("未获取原项目预算", 19),
                         ("里程碑滞后", 18), ("交付成本超支", 17),
                         ("风险未闭环", 16), ("回款延期", 9)]}]
    card = LR.build_summary_card("组长", rows, "直接上级（+1）")
    assert len(card["fields"][0]["value"].encode("utf-8")) <= 192


def test_all_cards_respect_key_18_bytes():
    rows = [{"name": "姓名特别长的一个人", "total": 1, "reasons": [("回款延期", 1)]}]
    card = LR.build_summary_card("组长", rows, "直接上级（+1）")
    assert len(card["fields"][0]["key"].encode("utf-8")) <= 18


def test_short_labels_fit_18_bytes_and_are_distinct():
    """key 上限 18 字节。原「总成本超支大于/小于5000」都是 25 字节,截断后都成「总成本超支…」
    —— 两行长得一样、收件人分不清。这是目验才发现的缺陷。"""
    # 验证映射中的所有短标签都不超 18 字节
    for orig, short in LR.REASON_SHORT_LABELS.items():
        assert len(short.encode("utf-8")) <= LR.LIMIT_FIELD_KEY, \
            "%s 短标签仍超 18 字节" % orig
    # 关键:显示名必须两两不同,不能有两类撞成同一串
    shown = list(LR.REASON_SHORT_LABELS.values())
    assert len(set(shown)) == len(shown), "短标签中有撞车: %s" % shown


def test_short_label_used_in_summary_card_value():
    rows = [{"name": "李四", "total": 2,
             "reasons": [("总成本超支大于5000", 1), ("总成本超支小于5000", 1)]}]
    card = LR.build_summary_card("组长", rows, "直接上级（+1）")
    v = card["fields"][0]["value"]
    assert "超支>5千 1" in v and "超支<5千 1" in v

def test_short_labels_are_not_mangled_words():
    """字节合规 ≠ 可读。「未获原项目预」是 18 字节但缺了「算」,是残词 ——
    光断言 <=18 字节抓不到这种,只有人眼或本测试能挡。
    规则:短标签若以中文结尾,不得是把某个词砍掉末字得来的(此处用白名单锁死具体取值)。"""
    assert LR.REASON_SHORT_LABELS["总成本超支大于5000"] == "超支>5千"
    assert LR.REASON_SHORT_LABELS["总成本超支小于5000"] == "超支<5千"
    assert LR.REASON_SHORT_LABELS["未获取原项目预算"] == "无原项目预算"
    # 残词回归护栏:曾经用过的「未获原项目预」不得复现
    assert "未获原项目预" not in LR.REASON_SHORT_LABELS.values()


# ── I-3:工时问题标签同款短标签处理(修前 7 类里 5 类超 18 字节,卡上显示省略号残词) ──

def test_every_issue_label_fits_field_key_without_truncation():
    """护栏:不论将来 yitian_rules.ISSUE_LABELS 怎么改文案/加码,short_issue 的产物都必须
    不超 18 字节、且不被 fit_bytes 二次截断(截断=残词)。"""
    from yitian_rules import ISSUE_LABELS
    for code, lab in ISSUE_LABELS.items():
        s = LR.short_issue(lab)
        assert len(s.encode("utf-8")) <= LR.LIMIT_FIELD_KEY, "%s(%s) → %s 仍超限" % (code, lab, s)
        assert LR._field(s, "1 条")["key"] == s, "%s 被 fit_bytes 截成残词" % lab


def test_issue_short_labels_are_distinct():
    """短标签必须两两不同,不能像修前那样多类撞成同一串导致卡片列名分不清。"""
    shown = list(LR.ISSUE_SHORT_LABELS.values())
    assert len(set(shown)) == len(shown), "工时短标签中有撞车: %s" % shown


def test_issue_short_labels_are_not_mangled_words():
    """同 test_short_labels_are_not_mangled_words 的护栏,锁死工时侧的具体取值,
    防止将来有人图省事直接砍字节数导致读不通的残词。"""
    assert LR.ISSUE_SHORT_LABELS["缺少下一步工作计划"] == "缺下一步计划"
    assert LR.ISSUE_SHORT_LABELS["工时类型填报有误"] == "工时类型有误"
    assert LR.ISSUE_SHORT_LABELS["产品类别填写错误"] == "产品类别有误"
    assert LR.ISSUE_SHORT_LABELS["客户名称未填写"] == "缺客户名称"
    assert LR.ISSUE_SHORT_LABELS["售前服务类产品类别不应为「其他」"] == "售前类别有误"


# ── 同款护栏也补给 REASON_WHITELIST(此前三个短标签是人肉算的字节数,没有测试锁住) ──

def test_every_reason_fits_field_key_without_truncation():
    for reason in LC.REASON_WHITELIST:
        s = LR.short_reason(reason)
        assert len(s.encode("utf-8")) <= LR.LIMIT_FIELD_KEY, "%s → %s 仍超限" % (reason, s)
        assert LR._field(s, "1 个项目")["key"] == s, "%s 被 fit_field 截成残词" % reason


# ── I-1:build_summary_card 的 unit/head_title/title_fmt/label_fn 通用化(供工时汇总卡复用) ──

def test_summary_card_default_params_unchanged():
    """默认参数必须与修前逐字节一致 —— 项目路由调用点未改动传参,不能因为加参数改变行为。"""
    rows = [{"name": "隋文宇", "total": 14, "reasons": [("回款延期", 6), ("成本超支", 5)]}]
    card = LR.build_summary_card("张英哲", rows, "部门级汇总（+3）")
    assert card["headTitle"] == "项目关注提醒"
    assert card["bodyTitle"] == "你的团队有 14 个项目存在关注原因"
    assert card["fields"][0]["value"].startswith("14 项：")


def test_summary_card_timesheet_unit_and_title():
    """工时汇总卡走「条」量纲 + 专属文案 + short_issue,不能出现「N 个项目」这种不适用的措辞。"""
    rows = [{"name": "张三", "total": 3, "reasons": [("工时类型填报有误", 2), ("缺少工作概述", 1)]}]
    card = LR.build_summary_card("耿磊磊", rows, "直接上级（+1）",
                                 unit="条", head_title="工时填报提醒",
                                 title_fmt="你的团队工时填报存在 %d 条问题",
                                 label_fn=LR.short_issue)
    assert card["headTitle"] == "工时填报提醒"
    assert "条" in card["bodyTitle"] and "项目" not in card["bodyTitle"]
    assert card["fields"][0]["value"].startswith("3 条：")
    assert "工时类型有误" in card["fields"][0]["value"]     # 用了短标签,不是原始长标签


# ── V4.0.3:fields 的双重限制(字符数 AND 字节数) ──────────────────────────
#
# openapi.lanxin.cn 的 message_body_type.md 对 fields 用的是【字数】而非字节:
#   fields.key   长度不超过 6 个汉字
#   fields.value 两行(接口限制 64 字)
# 而 bodyTitle/bodySubTitle/bodyContent 明写 "200*3 / 400*3 / 1000*3 字节"。
# 纯中文时两种算法等价(6*3=18),混合中英文时【不等价】——凭证未到位实测不了,
# 故对 fields 取两者更严的一个,无论蓝信按哪种解读都不越限。

def test_fit_field_char_limit_bites_before_byte_limit():
    """混合中英文:字节没超但字符数超 → 必须按字符数截。"""
    import lanxin_recipients as LR
    s = "成本超支>5000元"          # 10 字符 / 4*3+1+4+3 = 20 字节
    assert len(s) == 10 and len(s.encode("utf-8")) == 20
    out = LR.fit_field(s, 6, 18)
    assert len(out) <= 6
    assert len(out.encode("utf-8")) <= 18


def test_fit_field_byte_limit_bites_before_char_limit():
    """纯中文:字符数没超但字节超 → 必须按字节截。"""
    import lanxin_recipients as LR
    s = "回款延期风险"              # 6 字符 / 18 字节
    out = LR.fit_field(s, 6, 12)   # 故意把字节上限压到 12
    assert len(out.encode("utf-8")) <= 12


def test_fit_field_passthrough_when_both_ok():
    import lanxin_recipients as LR
    assert LR.fit_field("回款延期", 6, 18) == "回款延期"


def test_all_reason_field_keys_fit_both_limits():
    """★ 八类关注原因(经短标签映射后)必须同时满足 <=6 字符 且 <=18 字节,
    且【不被截断】—— 截断产生的残词读不通,是 V4.0.0 踩过的坑。"""
    import lanxin_config as C
    import lanxin_recipients as LR
    for reason in C.REASON_WHITELIST:
        label = LR.short_reason(reason)
        assert len(label) <= LR.LIMIT_FIELD_KEY_CHARS, "%s → %s 超 6 字符" % (reason, label)
        assert len(label.encode("utf-8")) <= LR.LIMIT_FIELD_KEY, "%s → %s 超 18 字节" % (reason, label)
        assert LR.fit_field(label, LR.LIMIT_FIELD_KEY_CHARS, LR.LIMIT_FIELD_KEY) == label, \
            "%s → %s 会被截断成残词" % (reason, label)


def test_all_issue_field_keys_fit_both_limits():
    """八类工时问题标签同上。"""
    import yitian_rules as R
    import lanxin_recipients as LR
    for code, raw in R.ISSUE_LABELS.items():
        label = LR.short_issue(raw)
        assert len(label) <= LR.LIMIT_FIELD_KEY_CHARS, "%s → %s 超 6 字符" % (code, label)
        assert len(label.encode("utf-8")) <= LR.LIMIT_FIELD_KEY, "%s → %s 超 18 字节" % (code, label)
        assert LR.fit_field(label, LR.LIMIT_FIELD_KEY_CHARS, LR.LIMIT_FIELD_KEY) == label, \
            "%s → %s 会被截断成残词" % (code, label)


def test_cost_overspend_labels_are_distinct_and_short():
    """两个成本超支标签:必须互不相同(V4.0.0 目验逮到过截断后撞车)且 <=6 字符。"""
    import lanxin_recipients as LR
    a = LR.short_reason("总成本超支大于5000")
    b = LR.short_reason("总成本超支小于5000")
    assert a != b
    for x in (a, b):
        assert len(x) <= 6, "%s 有 %d 字符" % (x, len(x))


def test_summary_card_value_respects_char_limit():
    """汇总卡 value 是「N 项：标签 n · 标签 n」的混合文本,
    64 字符比 192 字节严格得多 —— 丢弃循环必须按双重限制判。"""
    import lanxin_recipients as LR
    rows = [{"name": "张三", "total": 99,
             "reasons": [("回款延期", 20), ("里程碑滞后", 19), ("交付成本超支", 18),
                         ("风险未闭环", 17), ("数据异常", 15), ("无原项目预算", 10)]}]
    card = LR.build_summary_card("李四", rows, "团队汇总")
    v = card["fields"][0]["value"]
    assert len(v) <= LR.LIMIT_FIELD_VALUE_CHARS, "value 有 %d 字符" % len(v)
    assert len(v.encode("utf-8")) <= LR.LIMIT_FIELD_VALUE


def test_action_hint_h5_wins():
    """有 H5 时优先引导点卡片(二期上线后自动切到这一态,无需再改文案)。"""
    assert LR.build_action_hint(24, h5_url="http://x/review/t", reply_hint=True) == \
        "请点击卡片逐条反馈，24小时内未反馈将列入《未响应清单》"


def test_action_hint_falls_back_to_reply():
    assert LR.build_action_hint(48, h5_url="", reply_hint=True) == \
        "请直接回复本消息反馈，48小时内未反馈将列入《未响应清单》"


def test_action_hint_empty_when_no_channel():
    """【承重】没有任何回流通道时必须返回空串,调用方据此【不输出】动作要求 field。
    有通道才承诺反馈;否则卡上写「N 小时内未反馈将列入未响应清单」而人无处可反馈,
    就是空头支票。现有 REPLY_HINT 已有同款严谨性(见其上方注释)。"""
    assert LR.build_action_hint(24, h5_url="", reply_hint=False) == ""


def test_action_hint_uses_given_hours_verbatim():
    """N 由调用方传入,本函数不带自己的默认值 —— 默认值散落多处正是「卡上24、清单按48」的成因。
    子串包含不够严格（「172小时内」也包含「72小时内」）—— 改为精确匹配整句。"""
    assert LR.build_action_hint(72, reply_hint=True) == \
        "请直接回复本消息反馈，72小时内未反馈将列入《未响应清单》"


def test_action_hint_requires_explicit_hours():
    """【承重】deadline_hours 不得有默认值。加上默认值后本条会红。
    N 的默认值散落多处正是「卡上写 24 小时、清单按 48 小时算」这类事故的成因 ——
    这个函数只负责按调用方给的值组文案,不替调用方决定 N 是多少。"""
    with pytest.raises(TypeError):
        LR.build_action_hint()


# ── Task 3:build_project_card 改为按项目分行(旧「按原因分行」结构作废) ──────────

def _proj(name, *reasons):
    """reasons: (category, detail) 元组序列"""
    return {"name": name, "reasons": [{"category": c, "detail": d} for c, d in reasons]}


def test_project_card_lists_each_project_with_detail():
    card = LR.build_project_card("张三", [
        _proj("XX智慧园区", ("回款延期", "3 个延期节点")),
        _proj("YY数据中心", ("回款延期", "2 个延期节点"), ("风险未闭环", "2 个未关闭风险")),
    ])
    assert card["bodyTitle"] == "你名下 2 个项目需要跟进"
    # 多原因的排前面
    assert card["fields"][0] == {"key": "1", "value": "YY数据中心 · 回款延期(2 个延期节点)、风险未闭环(2 个未关闭风险)"}
    assert card["fields"][1] == {"key": "2", "value": "XX智慧园区 · 回款延期(3 个延期节点)"}


def test_project_card_key_is_index_not_project_name():
    """【承重】key 必须是序号。蓝信 fields.key 上限 6 汉字/18 字节,项目名普遍超限,
    截断后可能撞名(REASON_SHORT_LABELS 上方注释记着「总成本超支大于/小于5000」
    截断后完全相同的实测)。项目名放 value(64 字)才放得下。"""
    card = LR.build_project_card("张三", [
        _proj("华南区域智慧城市综合管理平台建设项目", ("回款延期", "1 个延期节点")),
    ])
    assert card["fields"][0]["key"] == "1"
    assert "华南区域智慧城市" in card["fields"][0]["value"]


def test_project_card_caps_detail_rows_at_8_and_counts_rest_accurately():
    """明细固定 8 行;「其余」的 N 是【全量计数】,与名字是否被截断无关。"""
    projs = [_proj("项目%02d" % i, ("回款延期", "1 个延期节点")) for i in range(1, 13)]
    card = LR.build_project_card("张三", projs)
    detail = [f for f in card["fields"] if f["key"].isdigit()]
    assert len(detail) == 8
    rest = [f for f in card["fields"] if f["key"] == "其余"][0]
    assert rest["value"].startswith("另有 4 个：")


def test_project_card_row_cap_is_unconditional():
    """明细上限恒为 8,【不因动作要求缺席而放宽到 9】——
    条件式上限会让「同一个人、配置一变、卡片行数就变」,排查时多一个变量。"""
    projs = [_proj("项目%02d" % i, ("回款延期", "1 个延期节点")) for i in range(1, 13)]
    no_hint = LR.build_project_card("张三", projs, action_hint="")
    with_hint = LR.build_project_card("张三", projs, action_hint="请直接回复本消息反馈，24小时内未反馈将列入《未响应清单》")
    assert len([f for f in no_hint["fields"] if f["key"].isdigit()]) == 8
    assert len([f for f in with_hint["fields"] if f["key"].isdigit()]) == 8


def test_project_card_omits_action_field_when_hint_empty():
    """空 action_hint → 不出这个 field(不是出一个空 value 的 field)。"""
    card = LR.build_project_card("张三", [_proj("A", ("回款延期", "1 个延期节点"))], action_hint="")
    assert all(f["key"] != "动作要求" for f in card["fields"])


def test_project_card_action_field_is_last():
    """动作要求必须在所有字段最下 —— bodyContent 渲染在 fields 之前(蓝信实测),
    所以只能放 fields 末尾。"""
    card = LR.build_project_card("张三", [_proj("A", ("回款延期", "1 个延期节点"))],
                                 action_hint="请直接回复本消息反馈，24小时内未反馈将列入《未响应清单》")
    assert card["fields"][-1]["key"] == "动作要求"


def test_project_card_never_exceeds_10_fields():
    """8 明细 + 其余 + 动作要求 = 恰好 10,是蓝信硬上限,永不越线。"""
    projs = [_proj("项目%02d" % i, ("回款延期", "1 个延期节点")) for i in range(1, 30)]
    card = LR.build_project_card("张三", projs, action_hint="x")
    assert len(card["fields"]) == 10


def test_project_card_head_and_title_never_empty():
    """蓝信硬约束:bodyTitle 必填非空;headTitle 单行不可含换行。"""
    for sent_at in ("", "2026-07-28 09:00"):
        card = LR.build_project_card("张三", [_proj("A", ("回款延期", "1 个延期节点"))], sent_at=sent_at)
        assert card["bodyTitle"]
        assert card["headTitle"]
        assert "\n" not in card["headTitle"]


def test_project_card_sent_at_goes_to_head_title():
    card = LR.build_project_card("张三", [_proj("A", ("回款延期", "1 个延期节点"))],
                                 sent_at="2026-07-28 09:00")
    assert card["headTitle"] == "推送时间：2026-07-28 09:00"


def test_project_card_reason_without_detail_shows_category_only():
    """detail 为空时不拼出「回款延期()」这种残文案。"""
    card = LR.build_project_card("张三", [_proj("A", ("数据异常", ""))])
    assert card["fields"][0]["value"] == "A · 数据异常"


# ── 终审 I-1/I-2:两条测试保护网补漏(实现行为本身已确认正确,缺的是钉住它的测试) ──

def test_project_card_rest_count_stays_full_even_when_value_is_truncated():
    """【承重】实测:29 个项目、8 展示、21 归入「其余」时,fit_field 把该行截到
    64 字,value 里只剩 11 个项目名可见 —— 但 N 必须仍是【全量计数】21,不能退化成
    「数一数 value 里截断后剩几个名字」(那样会得 11)。旧实现里同款场景(用大量/超长
    名字把预算主动打满,验证计数类文案在截断压力下仍准确)靠三条测试钉住,新结构把
    项目清单从 bodyContent 搬到「其余」字段后,这条护栏必须跟着搬,不能随旧测试一起
    消失 —— test_project_card_never_exceeds_10_fields 用的正是这组会截断的输入,
    但只查字段数不查内容;test_project_card_caps_detail_rows_at_8_and_counts_rest_accurately
    只用 4 个短名字,不会触发截断,两种算法在那里结果一样,抓不出退化。
    断言里同时钉住"确实触发了截断"(以 … 结尾),否则这条测试可能在未来某次改动后
    悄悄退化成「没触发截断」的无效用例 —— 那正是它要防的东西。"""
    projs = [_proj("项目%02d" % i, ("回款延期", "1 个延期节点")) for i in range(1, 30)]
    card = LR.build_project_card("张三", projs)
    rest = [f for f in card["fields"] if f["key"] == "其余"][0]
    assert rest["value"].startswith("另有 21 个：")
    assert rest["value"].endswith("…")      # 确认真的截断了,不是巧合达标


def test_project_card_body_content_never_populated():
    """【承重】bodyContent 必须留空 —— 它在蓝信卡片里渲染在 fields 之前,「动作要求」
    这类字段一旦被误塞进这里会跑到所有字段最上方,而不是应有的 fields 末尾。_card()
    对空 content 干脆不写 bodyContent 键,这里直接断言该键不存在,防止「两处都写」
    (既让「动作要求」留在 fields 末尾,又往 _card 最后一个参数塞了内容)这种疏忽
    蒙混过关 —— test_project_card_action_field_is_last 只查 fields 顺序,
    查不到 bodyContent 是否被污染。"""
    card = LR.build_project_card("张三", [_proj("A", ("回款延期", "1 个延期节点"))],
                                 action_hint="请直接回复本消息反馈，24小时内未反馈将列入《未响应清单》")
    assert "bodyContent" not in card


# ── Task 4:build_timesheet_card 加最近日期/动作要求/推送时间(与 build_project_card 同构) ──

def test_timesheet_card_shows_last_date():
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_SUMMARY", "label": "未填工作成果", "count": 5, "lastDate": "2026-07-25"},
    ], "2026-07-20", "2026-07-26")
    assert card["fields"][0] == {"key": "未填工作成果", "value": "5 条 · 最近 07-25"}


def test_timesheet_card_omits_last_date_when_absent():
    """lastDate 缺失 → 不拼出「· 最近 」这种残文案。与 start/end 同策略:
    宁可不显示,不显示空值。"""
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_SUMMARY", "label": "未填工作成果", "count": 5},
    ], "2026-07-20", "2026-07-26")
    assert card["fields"][0]["value"] == "5 条"


def test_timesheet_card_action_field_is_last():
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_SUMMARY", "label": "未填工作成果", "count": 5, "lastDate": "2026-07-25"},
    ], "2026-07-20", "2026-07-26",
        action_hint="请直接回复本消息反馈，24小时内未反馈将列入《未响应清单》")
    assert card["fields"][-1]["key"] == "动作要求"


def test_timesheet_card_omits_action_field_when_hint_empty():
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_SUMMARY", "label": "未填工作成果", "count": 5},
    ], "", "", action_hint="")
    assert all(f["key"] != "动作要求" for f in card["fields"])


def test_timesheet_card_keeps_short_label_mapping():
    """回归安全网:超 18 字节的标签仍走 short_issue 短标签,本次改动不得影响它。"""
    card = LR.build_timesheet_card("张三", [
        {"code": "MISS_NEXT", "label": "缺少下一步工作计划", "count": 2},
    ], "", "")
    assert card["fields"][0]["key"] == "缺下一步计划"


def test_timesheet_card_keeps_subtitle_rule():
    """回归安全网:start/end 任一为空则不出副标题,绝不拼半截文案。"""
    assert LR.build_timesheet_card("张三", [
        {"code": "X", "label": "L", "count": 1}], "2026-07-20", "")["bodySubTitle"] == ""
    assert LR.build_timesheet_card("张三", [
        {"code": "X", "label": "L", "count": 1}], "2026-07-20", "2026-07-26")["bodySubTitle"] \
        == "统计区间 2026-07-20 ~ 2026-07-26"


def test_timesheet_card_sent_at_goes_to_head_title():
    card = LR.build_timesheet_card("张三", [
        {"code": "X", "label": "L", "count": 1}], "", "", sent_at="2026-07-28 09:00")
    assert card["headTitle"] == "推送时间：2026-07-28 09:00"
    assert "\n" not in card["headTitle"]


# ── 终审补漏:旧用例 test_timesheet_card_fields_within_limit(Step 1 因签名换成
#    action_hint 被删,删除本身没错)保护的三个关切,Task 4 新增的 7 条用例全是
#    单条 issue 的夹具,没有一条继承下来 ──

def test_timesheet_card_aggregates_and_sorts_multiple_issues():
    """继承自被删的 test_timesheet_card_fields_within_limit。它验证的三个关切在单条
    issue 的夹具下全部测不出,7 条新用例因此都没接住:
    1) total 是多条 count 的合计(sum(...) 写错在单条夹具下 3 恒等于 3,发现不了);
    2) fields 按 count 降序排列(单条夹具下排序是恒等操作,sorted 是否真的在起作用测不出);
    3) sent_at 缺省时 headTitle 回退到「工时填报提醒」(7 条新用例只有
       test_timesheet_card_sent_at_goes_to_head_title 验了"给了 sent_at"这一支,没有
       一条验空 sent_at 的回退支)。
    issues 刻意把 count 小的排在【前面】、count 大的排在【后面】——若实现退化成不排序
    (直接 list(issues)),fields[0] 会变成 count=2 的那条,下面按 key/value 的断言就会
    失败;若像旧用例那样凑巧按 count 降序传参,排序失效时输出不变,这条测试就形同虚设。
    """
    issues = [
        {"code": "TYPE_MISMATCH", "label": "工时类型填报有误", "count": 2},
        {"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3},
    ]
    card = LR.build_timesheet_card("张三", issues, "2026-07-01", "2026-07-15")
    assert card["headTitle"] == "工时填报提醒"                  # sent_at 缺省 → 回退文案
    assert card["bodyTitle"] == "你有 5 条工时填报存在问题"      # 3+2=5,不是任一单条的 count
    assert len(card["fields"]) == 2
    assert card["fields"][0]["key"] == "缺少工作概述"            # count=3,排到前面(与输入顺序相反)
    assert card["fields"][0]["value"] == "3 条"
    assert card["fields"][1]["key"] == "工时类型有误"            # count=2,排后面;短标签生效
    assert card["fields"][1]["value"] == "2 条"
    assert "2026-07-01" in card["bodySubTitle"]
