"""蓝信推送:端点注册与审计埋点的接线测试(不起 HTTP,只查表)。
与 tests/test_server_lanxin.py 分工:那边测 HTTP 层行为(异常兜底、并发锁),
这边测「新端点有没有被正确登记进超管闸与审计表」—— 漏登记不会让任何用例变红,
只会让审计静默失效(V3.3.0 实际踩过),故单独成文件锁住。
"""
import io
import os
import re

import audit

_TS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "frontend", "src", "lib", "lanxinInbox.ts")


def test_action_map_has_all_lanxin_endpoints():
    """审计埋点靠 _ACTION_MAP 按 (method,path) 查表。
    新端点不加条目 → map_action 返 None → 一条审计都不写(V3.3.0 实际踩过的死埋点)。"""
    for m, p in [("POST", "/api/lanxin/config"),
                 ("POST", "/api/lanxin/selftest"),
                 ("POST", "/api/lanxin/send"),
                 # V4.5.10:撤销归入会改业务状态(解除标记 → 可重新写跟进域),必须留痕
                 ("POST", "/api/lanxin/inbox/unhandle")]:
        assert audit.map_action(m, p) is not None, "%s %s 缺审计条目" % (m, p)


def test_unhandle_endpoint_is_routed():
    """光有 handler 不算接线 —— do_POST 的分支里没有这条 path,请求会掉进 404,
    而 handler 本身的单测照样全绿(V4.5.6/V4.5.7 的「定义了却没接线」同款)。"""
    src = io.open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                               "server.py"), encoding="utf-8").read()
    assert "'/api/lanxin/inbox/unhandle'" in src
    assert "self.handle_lanxin_inbox_unhandle()" in src


def test_ts_handle_fields_match_backend_targets():
    """前端抽屉里那句「将追加到『X』列」的字段 key,与后端真正写入的字段必须同源。

    两头比对:后端读 server._LANXIN_HANDLE_TARGETS,前端读 .ts 源文本。
    用 == 而不是 issubset —— 后者漏一个域不会红。
    末尾的自证断言钉住解析规模:正则失配时 parsed 为空 dict,== 比较会直接暴露,
    但仍显式断言一次域数量,免得将来有人把两边一起改空还全绿。"""
    import server
    src = io.open(_TS, encoding="utf-8").read()
    block = re.search(r"HANDLE_FIELDS[^=]*=\s*\{(.*?)\n\}", src, re.S)
    assert block, "没解析到 HANDLE_FIELDS —— 正则与源码漂移了,本测试已失效"
    parsed = dict(re.findall(r"(\w+):\s*\{\s*key:\s*'([^']+)'", block.group(1)))
    assert len(parsed) == 4, "只解析出 %d 个域,预期 4 个" % len(parsed)
    expected = {d: t["field"] for d, t in server._LANXIN_HANDLE_TARGETS.items()}
    assert parsed == expected


def test_preview_is_not_audited_or_is_audited_consistently():
    """preview 不改任何状态,可不审计;但若审计则必须有条目。此测试锁定当前选择:不审计。"""
    assert audit.map_action("POST", "/api/lanxin/preview") is None


def test_super_only_paths_cover_lanxin():
    import server
    for p in ["/api/lanxin/config", "/api/lanxin/selftest",
              "/api/lanxin/preview", "/api/lanxin/send",
              "/api/lanxin/inbox", "/api/lanxin/inbox/handle",
              "/api/lanxin/inbox/unhandle", "/api/lanxin/inbox/delete"]:
        assert p in server._SUPER_ONLY_PATHS, "%s 未进超管闸" % p
    # 反向:免登录的回调/H5 三个端点【绝不能】进超管闸(那个闸按 path 匹配、不分 method)
    for p in ["/api/lanxin/callback", "/api/lanxin/review/items", "/api/lanxin/review/submit"]:
        assert p not in server._SUPER_ONLY_PATHS, "%s 误入超管闸,蓝信/员工会被挡在门外" % p
