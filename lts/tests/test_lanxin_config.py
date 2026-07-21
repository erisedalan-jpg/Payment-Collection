import json
import os
import pytest
import lanxin_config as LC


def test_default_config_shape():
    d = LC.default_config()
    assert d["enabled"] is False
    assert d["sendIntervalMs"] == 200
    assert d["credentials"]["idType"] == "employ_id"
    # LTS 无倚天工时域,routes 只含 project 一项
    assert {r["key"] for r in d["routes"]} == {"project"}
    pj = next(r for r in d["routes"] if r["key"] == "project")
    # 默认值:项目发到直接上级 —— 收件人规则已下沉到每一项(items)
    assert all(i["supervisorLevels"] == 1 for i in pj["items"])
    assert len(pj["items"]) == 8


def test_validate_accepts_default():
    assert LC.validate_config(LC.default_config())


@pytest.mark.parametrize("lv", [0, 1, 2, 3, 4, 5])
def test_supervisor_levels_0_to_5_ok(lv):
    c = LC.default_config()
    c["routes"][0]["items"][0]["supervisorLevels"] = lv
    assert LC.validate_config(c)["routes"][0]["items"][0]["supervisorLevels"] == lv


@pytest.mark.parametrize("lv", [-1, 6, 99, "1", None])
def test_supervisor_levels_out_of_range_rejected(lv):
    c = LC.default_config()
    c["routes"][0]["items"][0]["supervisorLevels"] = lv
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_unknown_route_key_rejected():
    """LTS 无倚天工时域,routes 只认 project;传入 timesheet 视为未知 route.key。"""
    c = LC.default_config()
    c["routes"].append({
        "key": "timesheet", "label": "倚天工时问题", "enabled": True,
        "items": [],
    })
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_unknown_reason_rejected():
    c = LC.default_config()
    c["routes"][0]["items"] = [
        {"code": "回款延期", "enabled": True, "primary": True, "supervisorLevels": 1},
        {"code": "不存在的原因", "enabled": True, "primary": True, "supervisorLevels": 1},
    ]
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_empty_subset_is_legal():
    """空 items = 该路由所有项都不推,是合法配置(等同停用),不应报错;
    自动按白名单补齐为全 disabled(而非报错或留空)。"""
    c = LC.default_config()
    c["routes"][0]["items"] = []
    out = LC.validate_config(c)["routes"][0]["items"]
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


def _codes(route):
    return [i["code"] for i in route["items"]]


def _item(route, code):
    return next(i for i in route["items"] if i["code"] == code)


def test_default_config_routes_use_items():
    import lanxin_config as C
    d = C.default_config()
    pj = next(r for r in d["routes"] if r["key"] == "project")
    assert "recipients" not in pj and "reasons" not in pj
    assert _codes(pj) == C.REASON_WHITELIST
    # 默认收件人策略:项目发到直接上级
    assert _item(pj, "回款延期")["supervisorLevels"] == 1
    assert _item(pj, "回款延期")["primary"] is True


def test_migrate_legacy_routes_preserves_behavior():
    """★ 迁移后行为必须与迁移前逐字节等价 —— 管理员不动配置就不该有任何行为变化。
    旧 reasons 里出现的 → enabled;其余 → 不启用;primary/levels 一律继承原 recipients。
    (LTS 无倚天工时域,只保留 project 路由的迁移用例。)"""
    import lanxin_config as C
    legacy = C.default_config()
    legacy["routes"] = [
        {"key": "project", "label": "项目关注原因", "enabled": True,
         "reasons": ["回款延期", "数据异常"],
         "recipients": {"primary": False, "supervisorLevels": 3}},
    ]
    out = C.validate_config(legacy)
    pj = next(r for r in out["routes"] if r["key"] == "project")
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
    将来新增关注原因不会让旧配置校验失败。"""
    import lanxin_config as C
    cfg = C.default_config()
    pj = next(r for r in cfg["routes"] if r["key"] == "project")
    pj["items"] = [{"code": "回款延期", "enabled": True, "primary": True, "supervisorLevels": 1}]
    out = C.validate_config(cfg)
    opj = next(r for r in out["routes"] if r["key"] == "project")
    assert _codes(opj) == C.REASON_WHITELIST
    assert _item(opj, "回款延期")["supervisorLevels"] == 1
    assert _item(opj, "风险未闭环")["enabled"] is False


def test_unknown_item_code_rejected():
    import lanxin_config as C
    cfg = C.default_config()
    pj = next(r for r in cfg["routes"] if r["key"] == "project")
    pj["items"] = [{"code": "NOT_A_CODE", "enabled": True, "primary": True, "supervisorLevels": 0}]
    with pytest.raises(ValueError):
        C.validate_config(cfg)


def test_duplicate_item_code_rejected():
    import lanxin_config as C
    cfg = C.default_config()
    pj = next(r for r in cfg["routes"] if r["key"] == "project")
    pj["items"] = [{"code": "回款延期", "enabled": True, "primary": True, "supervisorLevels": 0},
                   {"code": "回款延期", "enabled": False, "primary": True, "supervisorLevels": 0}]
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
