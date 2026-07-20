import json
import os
import pytest
import lanxin_config as LC


def test_default_config_shape():
    d = LC.default_config()
    assert d["enabled"] is False
    assert d["sendIntervalMs"] == 200
    assert d["credentials"]["idType"] == "employ_id"
    assert {r["key"] for r in d["routes"]} == {"timesheet", "project"}
    ts = next(r for r in d["routes"] if r["key"] == "timesheet")
    pj = next(r for r in d["routes"] if r["key"] == "project")
    # 默认值:工时不发汇总;项目发到直接上级 —— 收件人规则已下沉到每一项(items)
    assert all(i["supervisorLevels"] == 0 for i in ts["items"])
    assert all(i["supervisorLevels"] == 1 for i in pj["items"])
    assert len(pj["items"]) == 8


def test_validate_accepts_default():
    assert LC.validate_config(LC.default_config())


@pytest.mark.parametrize("lv", [0, 1, 2, 3, 4, 5])
def test_supervisor_levels_0_to_5_ok(lv):
    c = LC.default_config()
    c["routes"][1]["items"][0]["supervisorLevels"] = lv
    assert LC.validate_config(c)["routes"][1]["items"][0]["supervisorLevels"] == lv


@pytest.mark.parametrize("lv", [-1, 6, 99, "1", None])
def test_supervisor_levels_out_of_range_rejected(lv):
    c = LC.default_config()
    c["routes"][1]["items"][0]["supervisorLevels"] = lv
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_unknown_issue_code_rejected():
    c = LC.default_config()
    c["routes"][0]["items"] = [
        {"code": "MISS_SUMMARY", "enabled": True, "primary": True, "supervisorLevels": 0},
        {"code": "NOT_A_CODE", "enabled": True, "primary": True, "supervisorLevels": 0},
    ]
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_unknown_reason_rejected():
    c = LC.default_config()
    c["routes"][1]["items"] = [
        {"code": "回款延期", "enabled": True, "primary": True, "supervisorLevels": 1},
        {"code": "不存在的原因", "enabled": True, "primary": True, "supervisorLevels": 1},
    ]
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_empty_subset_is_legal():
    """空 items = 该路由所有项都不推,是合法配置(等同停用),不应报错;
    自动按白名单补齐为全 disabled(而非报错或留空)。"""
    c = LC.default_config()
    c["routes"][1]["items"] = []
    out = LC.validate_config(c)["routes"][1]["items"]
    assert len(out) == 8
    assert all(i["enabled"] is False for i in out)


def test_non_https_gateway_rejected():
    c = LC.default_config()
    c["credentials"]["apiGateway"] = "http://apigw.example.com"
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_gateway_trailing_slash_normalized():
    c = LC.default_config()
    c["credentials"]["apiGateway"] = "https://apigw.example.com/"
    assert LC.validate_config(c)["credentials"]["apiGateway"] == "https://apigw.example.com"


def test_empty_gateway_is_legal_when_not_enabled():
    """凭证未申请下来时,允许留空保存(否则超管连路由都配不了)。"""
    c = LC.default_config()
    c["credentials"]["apiGateway"] = ""
    assert LC.validate_config(c)["credentials"]["apiGateway"] == ""


def test_public_config_masks_secret():
    c = LC.default_config()
    c["credentials"]["appSecret"] = "s3cr3t"
    p = LC.public_config(c)
    assert p["credentials"]["appSecret"] == ""
    assert p["credentials"]["hasSecret"] is True
    # 绝不能有任何地方泄漏明文
    assert "s3cr3t" not in json.dumps(p, ensure_ascii=False)


def test_public_config_no_secret_flag_false():
    p = LC.public_config(LC.default_config())
    assert p["credentials"]["hasSecret"] is False


def test_save_empty_secret_keeps_old(tmp_path):
    """脱敏读回后再保存,appSecret 是空串 → 必须保留旧值,不能清空。"""
    p = str(tmp_path / "lanxin_config.json")
    c = LC.default_config()
    c["credentials"]["appSecret"] = "old-secret"
    LC.save_config(p, c)
    c2 = LC.load_config(p)
    c2["credentials"]["appSecret"] = ""      # 前端脱敏回传
    LC.save_config(p, c2)
    assert LC.load_config(p)["credentials"]["appSecret"] == "old-secret"


def test_save_new_secret_overwrites(tmp_path):
    p = str(tmp_path / "lanxin_config.json")
    c = LC.default_config()
    c["credentials"]["appSecret"] = "old"
    LC.save_config(p, c)
    c["credentials"]["appSecret"] = "new"
    LC.save_config(p, c)
    assert LC.load_config(p)["credentials"]["appSecret"] == "new"


def test_load_missing_file_returns_default(tmp_path):
    assert LC.load_config(str(tmp_path / "nope.json")) == LC.default_config()


def test_save_is_atomic_no_tmp_left(tmp_path):
    p = str(tmp_path / "lanxin_config.json")
    LC.save_config(p, LC.default_config())
    assert os.path.exists(p)
    assert not os.path.exists(p + ".tmp")


def test_default_issue_codes_exclude_hint():
    """HINT_ 是「合规(提示)」不是问题(yitian_check.ok_of:含任一非 HINT_ 码才算问题)。
    实测 HINT_PRESALE_PRODUCT 96 条 > 全部真问题 63 条 —— 默认推它就是给「合规」的人
    发「你有问题」,且数量上还压过真问题。故默认不勾。"""
    from yitian_rules import ISSUE_LABELS
    ts = next(r for r in LC.default_config()["routes"] if r["key"] == "timesheet")
    enabled_codes = {i["code"] for i in ts["items"] if i["enabled"]}
    assert all(not c.startswith("HINT_") for c in enabled_codes)
    assert enabled_codes == {k for k in ISSUE_LABELS if not k.startswith("HINT_")}
    assert _item(ts, "HINT_PRESALE_PRODUCT")["enabled"] is False


def test_hint_code_still_selectable():
    """默认不勾 ≠ 不可勾:超管想推提示,页面上勾了必须能存下来。"""
    c = LC.default_config()
    ts = c["routes"][0]
    for it in ts["items"]:
        if it["code"] == "HINT_PRESALE_PRODUCT":
            it["enabled"] = True
    saved = LC.validate_config(c)
    ts_out = next(r for r in saved["routes"] if r["key"] == "timesheet")
    assert _item(ts_out, "HINT_PRESALE_PRODUCT")["enabled"] is True


def _codes(route):
    return [i["code"] for i in route["items"]]


def _item(route, code):
    return next(i for i in route["items"] if i["code"] == code)


def test_default_config_routes_use_items():
    import lanxin_config as C
    d = C.default_config()
    ts = next(r for r in d["routes"] if r["key"] == "timesheet")
    pj = next(r for r in d["routes"] if r["key"] == "project")
    assert "recipients" not in ts and "issueCodes" not in ts
    assert "recipients" not in pj and "reasons" not in pj
    assert _codes(ts) == list(C.ISSUE_LABELS.keys())     # 恒为完整白名单
    assert _codes(pj) == C.REASON_WHITELIST
    # 默认:HINT_ 前缀不勾(V4.0.0 实测该单码 96 条 > 全部真问题 63 条)
    assert _item(ts, "HINT_PRESALE_PRODUCT")["enabled"] is False
    assert _item(ts, "MISS_SUMMARY")["enabled"] is True
    # 默认收件人策略沿用 V4.0.0:工时不发汇总、项目发到直接上级
    assert _item(ts, "MISS_SUMMARY")["supervisorLevels"] == 0
    assert _item(pj, "回款延期")["supervisorLevels"] == 1
    assert _item(pj, "回款延期")["primary"] is True


def test_migrate_legacy_routes_preserves_behavior():
    """★ 迁移后行为必须与迁移前逐字节等价 —— 管理员不动配置就不该有任何行为变化。
    旧 issueCodes 里出现的 → enabled;其余 → 不启用;primary/levels 一律继承原 recipients。"""
    import lanxin_config as C
    legacy = C.default_config()
    legacy["routes"] = [
        {"key": "timesheet", "label": "倚天工时问题", "enabled": True,
         "issueCodes": ["MISS_SUMMARY", "TYPE_MISMATCH"],
         "recipients": {"primary": True, "supervisorLevels": 2}},
        {"key": "project", "label": "项目关注原因", "enabled": True,
         "reasons": ["回款延期", "数据异常"],
         "recipients": {"primary": False, "supervisorLevels": 3}},
    ]
    out = C.validate_config(legacy)
    ts = next(r for r in out["routes"] if r["key"] == "timesheet")
    pj = next(r for r in out["routes"] if r["key"] == "project")
    assert _item(ts, "MISS_SUMMARY")["enabled"] is True
    assert _item(ts, "TYPE_MISMATCH")["enabled"] is True
    assert _item(ts, "MISS_PROGRESS")["enabled"] is False        # 旧配置没勾
    # 继承原路由的 recipients —— 这是「行为等价」的关键
    for c in ("MISS_SUMMARY", "TYPE_MISMATCH", "MISS_PROGRESS"):
        assert _item(ts, c)["primary"] is True
        assert _item(ts, c)["supervisorLevels"] == 2
    assert _item(pj, "回款延期")["enabled"] is True
    assert _item(pj, "风险未闭环")["enabled"] is False
    for c in C.REASON_WHITELIST:
        assert _item(pj, c)["primary"] is False
        assert _item(pj, c)["supervisorLevels"] == 3


def test_migrate_is_idempotent():
    import lanxin_config as C
    once = C.validate_config(C.default_config())
    twice = C.validate_config(once)
    assert twice == once


def test_items_missing_codes_are_filled_as_disabled():
    """白名单里没出现在 items 的 code 自动补 enabled=False。
    将来新增问题码不会让旧配置校验失败(V4.0.0 吃过 ISSUE_LABELS 从 7 变 8 的亏)。"""
    import lanxin_config as C
    cfg = C.default_config()
    ts = next(r for r in cfg["routes"] if r["key"] == "timesheet")
    ts["items"] = [{"code": "MISS_SUMMARY", "enabled": True, "primary": True, "supervisorLevels": 1}]
    out = C.validate_config(cfg)
    ots = next(r for r in out["routes"] if r["key"] == "timesheet")
    assert _codes(ots) == list(C.ISSUE_LABELS.keys())
    assert _item(ots, "MISS_SUMMARY")["supervisorLevels"] == 1
    assert _item(ots, "MISS_PROGRESS")["enabled"] is False


def test_unknown_item_code_rejected():
    import lanxin_config as C
    cfg = C.default_config()
    ts = next(r for r in cfg["routes"] if r["key"] == "timesheet")
    ts["items"] = [{"code": "NOT_A_CODE", "enabled": True, "primary": True, "supervisorLevels": 0}]
    with pytest.raises(ValueError):
        C.validate_config(cfg)


def test_duplicate_item_code_rejected():
    import lanxin_config as C
    cfg = C.default_config()
    ts = next(r for r in cfg["routes"] if r["key"] == "timesheet")
    ts["items"] = [{"code": "MISS_SUMMARY", "enabled": True, "primary": True, "supervisorLevels": 0},
                   {"code": "MISS_SUMMARY", "enabled": False, "primary": True, "supervisorLevels": 0}]
    with pytest.raises(ValueError):
        C.validate_config(cfg)


@pytest.mark.parametrize("bad", [-1, 6, 99, "1", None, True])
def test_item_supervisor_levels_validated(bad):
    """True 必须被拒 —— isinstance(True, int) 为真,不显式排除就会漏过去。"""
    import lanxin_config as C
    cfg = C.default_config()
    pj = next(r for r in cfg["routes"] if r["key"] == "project")
    pj["items"][0]["supervisorLevels"] = bad
    with pytest.raises(ValueError):
        C.validate_config(cfg)


@pytest.mark.parametrize("field", ["enabled", "primary"])
def test_item_bool_fields_validated(field):
    import lanxin_config as C
    cfg = C.default_config()
    pj = next(r for r in cfg["routes"] if r["key"] == "project")
    pj["items"][0][field] = "yes"
    with pytest.raises(ValueError):
        C.validate_config(cfg)


# ---- V4.0.5 Task 3:回调凭证与发送身份 ----

def test_default_config_has_callback_credentials_and_send_as():
    cfg = LC.default_config()
    assert cfg["credentials"]["callbackAesKey"] == ""
    assert cfg["credentials"]["callbackSignToken"] == ""
    # 默认走应用号:机器人能力要额外一道组织管理员审批,可能批不下来
    assert cfg["sendAs"] == "account"


def test_public_config_masks_callback_secrets(tmp_path):
    cfg = LC.default_config()
    cfg["credentials"]["callbackAesKey"] = "AAA"
    cfg["credentials"]["callbackSignToken"] = "BBB"
    pub = LC.public_config(cfg)
    assert pub["credentials"]["callbackAesKey"] == ""
    assert pub["credentials"]["callbackSignToken"] == ""
    assert pub["credentials"]["hasCallbackAesKey"] is True
    assert pub["credentials"]["hasCallbackSignToken"] is True


def test_public_config_reports_missing_callback_secrets():
    pub = LC.public_config(LC.default_config())
    assert pub["credentials"]["hasCallbackAesKey"] is False
    assert pub["credentials"]["hasCallbackSignToken"] is False


def test_save_config_rejects_bad_send_as(tmp_path):
    import pytest
    cfg = LC.default_config()
    cfg["sendAs"] = "robot"          # 合法值只有 account / bot
    with pytest.raises(ValueError):
        LC.save_config(str(tmp_path / "c.json"), cfg)


def test_save_config_accepts_bot(tmp_path):
    cfg = LC.default_config()
    cfg["sendAs"] = "bot"
    saved = LC.save_config(str(tmp_path / "c.json"), cfg)
    assert saved["sendAs"] == "bot"


def test_save_config_empty_callback_secret_keeps_old(tmp_path):
    """与 appSecret 同规:传空串=不修改,避免脱敏读回后误清空。"""
    p = str(tmp_path / "c.json")
    cfg = LC.default_config()
    cfg["credentials"]["callbackAesKey"] = "KEEPME"
    LC.save_config(p, cfg)
    cfg2 = LC.load_config(p)
    cfg2["credentials"]["callbackAesKey"] = ""
    saved = LC.save_config(p, cfg2)
    assert saved["credentials"]["callbackAesKey"] == "KEEPME"
