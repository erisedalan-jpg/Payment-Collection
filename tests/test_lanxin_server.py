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
