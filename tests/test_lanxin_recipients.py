import pytest
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


def test_timesheet_card_fields_within_limit():
    issues = [{"code": "MISS_SUMMARY", "label": "缺少工作概述", "count": 3},
              {"code": "TYPE_MISMATCH", "label": "工时类型填报有误", "count": 2}]
    card = LR.build_timesheet_card("张三", issues, "2026-07-01", "2026-07-15")
    assert card["headTitle"] == "工时填报提醒"
    assert "5 条" in card["bodyTitle"]
    assert len(card["fields"]) == 2
    assert card["fields"][0]["key"] == "缺少工作概述"
    assert card["fields"][0]["value"] == "3 条"
    assert "2026-07-01" in card["bodySubTitle"]


def test_project_card_uses_reason_distribution_not_project_names_in_fields():
    """单人最多背 49 个项目(实测) —— fields 必须按原因(≤8类)排,不能按项目名排。"""
    by_reason = {"回款延期": ["P1", "P2", "P3"], "交付成本超支": ["P4"]}
    card = LR.build_project_card("李四", by_reason)
    assert len(card["fields"]) == 2
    assert card["fields"][0]["key"] == "回款延期"
    assert card["fields"][0]["value"] == "3 个项目"
    assert "4 个项目" in card["bodyTitle"]      # 去重后的项目总数
    assert "P1" in card["bodyContent"]


def test_project_card_bodycontent_truncates_with_notice():
    by_reason = {"回款延期": ["项目名称非常长的一个项目%d" % i for i in range(400)]}
    card = LR.build_project_card("李四", by_reason)
    assert len(card["bodyContent"].encode("utf-8")) <= 3000
    assert "未列出" in card["bodyContent"]


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


def test_short_label_used_in_project_card_fields_but_not_bodycontent():
    """短标签只用于 fields 的 key;bodyContent 里仍须全名,信息不丢。"""
    card = LR.build_project_card("张三", {"总成本超支大于5000": ["P1"], "总成本超支小于5000": ["P2"]})
    keys = [f["key"] for f in card["fields"]]
    assert "成本超支>5k" in keys and "成本超支<5k" in keys
    assert "总成本超支…" not in keys                    # 不再有截断撞车
    assert "总成本超支大于5000：P1" in card["bodyContent"]   # 全名仍在正文
    assert "总成本超支小于5000：P2" in card["bodyContent"]


def test_short_label_used_in_summary_card_value():
    rows = [{"name": "李四", "total": 2,
             "reasons": [("总成本超支大于5000", 1), ("总成本超支小于5000", 1)]}]
    card = LR.build_summary_card("组长", rows, "直接上级（+1）")
    v = card["fields"][0]["value"]
    assert "成本超支>5k 1" in v and "成本超支<5k 1" in v
