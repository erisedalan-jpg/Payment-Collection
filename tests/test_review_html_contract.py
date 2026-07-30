# tests/test_review_html_contract.py
"""【复审 I-3】H5 填报页(frontend/public/review.html)字段契约回归网。

review.html 是全仓唯一无类型检查、无 lint、无单元测试的文件,却承载
lanxin.build_plan 产出的 reviewItems 与它之间的字段名契约。字段名一旦漂移
(比如 item.projectId 被顺手改成 item.pid),全仓 pytest/vitest/typecheck/build
可以全绿,线上表现却是卡片标题空白、提交必被越权闸拒 —— 看起来像 token 或
权限问题,实际是键名对不上。本仓 V4.0.5/V4.5.6/V4.5.7 连续三期都是这个形状,
这次移到了一个连 typecheck 都够不着的文件里,所以专开本文件补回归网。

两头都比对,只比一头没用:
  ① 产出端 —— 真跑一次 build_plan,断言产出的 reviewItems 每一项键集合【恰好
     等于】lanxin.py 里定义的 REVIEW_ITEM_KEYS_* 常量(用 set(...) == set(...),
     不是 issubset,防止常量本身与产出漂移了却被"包含关系"掩盖)。
  ② 消费端 —— 读 review.html 的源文本,断言每个常量键都以 item.<key> 或
     r.<key> 的形式确实出现在里面。
  ③ 自证规模 —— 钉住"确实读到了非空的、足够长的页面源码",防止路径写错时
     读到空串让所有 `in` 断言恒真(本仓踩过"解析失配 → 循环空跑 → 恒真"这类
     假绿)。

TREE/PMIS/_cfg_items 照抄 tests/test_lanxin.py 里的既有夹具,不新造一份。
"""
import os

import lanxin as LX
import lanxin_config as C

SECRET = "s" * 43

REVIEW_HTML_PATH = os.path.join(
    os.path.dirname(__file__), "..", "frontend", "public", "review.html")

# ── 照抄 tests/test_lanxin.py 的既有夹具(TREE/PMIS/_cfg_items),不新造一份 ──

TREE = {
    "byId": {
        "A001": {"name": "张英哲", "supId": None, "l4": "", "l31": ""},
        "A002": {"name": "于岩", "supId": "A001", "l4": "", "l31": "服务二部"},
        "A005": {"name": "耿磊磊", "supId": "A002", "l4": "小金融服务组", "l31": "服务二部"},
        "A006": {"name": "张三", "supId": "A005", "l4": "小金融服务组", "l31": "服务二部"},
        "A007": {"name": "李四", "supId": "A005", "l4": "小金融服务组", "l31": "服务二部"},
        "A010": {"name": "赵六", "supId": "A002", "l4": "小金融服务组", "l31": "服务二部"},
    },
    "byName": {"张英哲": ["A001"], "于岩": ["A002"], "耿磊磊": ["A005"],
               "张三": ["A006"], "李四": ["A007"], "赵六": ["A010"]},
}
PMIS = {
    "P1": {"team": {"项目经理": "张三"}},
    "P2": {"team": {"项目经理": "张三"}},
    "P3": {"team": {"项目经理": "李四"}},
}


def _cfg_items(ts_items=None, pj_items=None, ts_on=True, pj_on=True):
    """新结构配置工厂。ts_items/pj_items: {code: (enabled, primary, levels)},
    未列出的 code 补 (False, True, 0)。逐字抄自 tests/test_lanxin.py。"""
    c = C.default_config()

    def _mk(whitelist, spec):
        spec = spec or {}
        return [{"code": k, "enabled": spec.get(k, (False, True, 0))[0],
                 "primary": spec.get(k, (False, True, 0))[1],
                 "supervisorLevels": spec.get(k, (False, True, 0))[2]} for k in whitelist]

    c["routes"] = [
        {"key": "timesheet", "label": "倚天工时问题", "enabled": ts_on,
         "items": _mk(list(C.ISSUE_LABELS.keys()), ts_items)},
        {"key": "project", "label": "项目关注原因", "enabled": pj_on,
         "items": _mk(C.REASON_WHITELIST, pj_items)},
    ]
    return c


def _read_review_html():
    with open(REVIEW_HTML_PATH, "r", encoding="utf-8") as f:
        return f.read()


# ── ③ 自证规模:先钉住"读到的是真东西",其余测试的 `in` 断言才有意义 ──

def test_review_html_source_is_actually_read():
    """防止 REVIEW_HTML_PATH 写错时读到空串/极短内容,让下面所有 `in` 断言恒真。
    5000 是随手取的保守下限——真实文件按当前实现有数千字符的样式与脚本。"""
    src = _read_review_html()
    assert len(src) > 5000, "读到的内容异常短,路径多半算错了,长度=%d" % len(src)


# ── ① 产出端:build_plan 真跑一次,reviewItems 键集合恰好等于常量 ──

def test_project_review_items_keys_match_constant():
    cfg = _cfg_items(pj_items={"回款延期": (True, True, 0)})
    cfg["reviewBaseUrl"] = "http://x/pm"
    items = [{"kind": "project", "projectId": "P1",
              "reasons": [{"category": "回款延期", "detail": "3 个延期节点"}]}]
    plan = LX.build_plan(items, cfg, TREE, PMIS, review_secret=SECRET)
    primaries = [r for r in plan["recipients"] if r["role"] == "primary"]
    assert primaries, "夹具应产出至少一个 primary 收件人"
    r = primaries[0]
    assert r["reviewItems"], "夹具应产出至少一条 reviewItems"
    for it in r["reviewItems"]:
        assert set(it.keys()) == set(LX.REVIEW_ITEM_KEYS_PROJECT), \
            "project 侧 reviewItems 键集合与常量不符:%r" % (set(it.keys()),)
        assert it["reasons"], "夹具应带至少一条 reason"
        for reason in it["reasons"]:
            assert set(reason.keys()) == set(LX.REVIEW_REASON_KEYS), \
                "reason 键集合与常量不符:%r" % (set(reason.keys()),)


def test_timesheet_review_items_keys_match_constant():
    cfg = _cfg_items(ts_items={"MISS_SUMMARY": (True, True, 0)})
    cfg["reviewBaseUrl"] = "http://x/pm"
    items = [{"kind": "timesheet", "employId": "A006", "start": "", "end": "",
              "issues": [{"code": "MISS_SUMMARY", "label": "缺少工作概述",
                          "count": 3, "lastDate": "2026-07-25"}]}]
    plan = LX.build_plan(items, cfg, TREE, PMIS, review_secret=SECRET)
    primaries = [r for r in plan["recipients"] if r["role"] == "primary"]
    assert primaries, "夹具应产出至少一个 primary 收件人"
    r = primaries[0]
    assert r["reviewItems"], "夹具应产出至少一条 reviewItems"
    for it in r["reviewItems"]:
        assert set(it.keys()) == set(LX.REVIEW_ITEM_KEYS_TIMESHEET), \
            "timesheet 侧 reviewItems 键集合与常量不符:%r" % (set(it.keys()),)


# ── ② 消费端:review.html 源文本必须读到每一个键 ──

def test_review_html_reads_every_project_key():
    src = _read_review_html()
    assert len(src) > 5000
    for key in LX.REVIEW_ITEM_KEYS_PROJECT:
        assert ("item." + key) in src, "review.html 未读取 item.%s" % key
    for key in LX.REVIEW_REASON_KEYS:
        assert ("r." + key) in src, "review.html 未读取 r.%s" % key


def test_review_html_reads_every_timesheet_key():
    src = _read_review_html()
    assert len(src) > 5000
    for key in LX.REVIEW_ITEM_KEYS_TIMESHEET:
        assert ("item." + key) in src, "review.html 未读取 item.%s" % key
