"""蓝信推送:端点注册与审计埋点的接线测试(不起 HTTP,只查表)。
与 tests/test_server_lanxin.py 分工:那边测 HTTP 层行为(异常兜底、并发锁),
这边测「新端点有没有被正确登记进超管闸与审计表」—— 漏登记不会让任何用例变红,
只会让审计静默失效(V3.3.0 实际踩过),故单独成文件锁住。
"""
import audit


def test_action_map_has_all_lanxin_endpoints():
    """审计埋点靠 _ACTION_MAP 按 (method,path) 查表。
    新端点不加条目 → map_action 返 None → 一条审计都不写(V3.3.0 实际踩过的死埋点)。"""
    for m, p in [("POST", "/api/lanxin/config"),
                 ("POST", "/api/lanxin/selftest"),
                 ("POST", "/api/lanxin/send")]:
        assert audit.map_action(m, p) is not None, "%s %s 缺审计条目" % (m, p)


def test_preview_is_not_audited_or_is_audited_consistently():
    """preview 不改任何状态,可不审计;但若审计则必须有条目。此测试锁定当前选择:不审计。"""
    assert audit.map_action("POST", "/api/lanxin/preview") is None


def test_super_only_paths_cover_lanxin():
    import server
    for p in ["/api/lanxin/config", "/api/lanxin/selftest",
              "/api/lanxin/preview", "/api/lanxin/send"]:
        assert p in server._SUPER_ONLY_PATHS, "%s 未进超管闸" % p
