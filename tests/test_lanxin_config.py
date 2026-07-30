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


def test_default_config_has_review_deadline_hours():
    assert LC.default_config()["reviewDeadlineHours"] == 24


def test_validate_keeps_review_deadline_hours():
    """validate_config 的返回是【白名单 dict】,新键不显式加进去就会被静默丢弃 ——
    配了 48 保存后变回 24,页面上看不出任何异常。本条钉死它。"""
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = 48
    assert LC.validate_config(cfg)["reviewDeadlineHours"] == 48


@pytest.mark.parametrize("bad", [0, -1, 721, 1000])
def test_validate_rejects_out_of_range_deadline(bad):
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = bad
    with pytest.raises(ValueError):
        LC.validate_config(cfg)


@pytest.mark.parametrize("good", [1, 24, 720])
def test_validate_accepts_boundary_deadline(good):
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = good
    assert LC.validate_config(cfg)["reviewDeadlineHours"] == good


def test_validate_rejects_non_integer_deadline():
    """'24' 这种字符串必须拒,不许静默 int() —— 前端传错类型时要报出来。"""
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = "24"
    with pytest.raises(ValueError):
        LC.validate_config(cfg)


@pytest.mark.parametrize("bad", [True, False])
def test_validate_rejects_bool_deadline(bad):
    """True 必须被拒 —— isinstance(True, int) 为真,不显式排除就会漏过去。"""
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = bad
    with pytest.raises(ValueError):
        LC.validate_config(cfg)


def test_public_config_carries_review_deadline_hours():
    """public_config 是深拷贝全量 + 抹密钥,顶层新键应自动透出;本条防将来有人改成白名单式。"""
    cfg = LC.default_config()
    cfg["reviewDeadlineHours"] = 36
    assert LC.public_config(cfg)["reviewDeadlineHours"] == 36


# ---- V4.5.9 Task 2:reviewTokenSecret 与 reviewBaseUrl ----

def test_validate_keeps_review_token_secret():
    """【承重·同 reviewDeadlineHours 那个坑】validate_config 的 cred 是【固定键元组】,
    新键不加进去就被静默丢弃 —— 表现是「密钥生成了、下次读配置又没了、
    已签发的 token 全部失效」,而全程零报错。"""
    cfg = LC.default_config()
    cfg["credentials"]["reviewTokenSecret"] = "abc123"
    assert LC.validate_config(cfg)["credentials"]["reviewTokenSecret"] == "abc123"


def test_public_config_masks_review_token_secret():
    """密钥绝不回显。与其余三个密钥同款:抹成空串,只透 has* 布尔。"""
    cfg = LC.default_config()
    cfg["credentials"]["reviewTokenSecret"] = "SECRET_VALUE"
    pub = LC.public_config(cfg)
    assert pub["credentials"]["reviewTokenSecret"] == ""
    assert pub["credentials"]["hasReviewTokenSecret"] is True
    assert "SECRET_VALUE" not in json.dumps(pub, ensure_ascii=False)


def test_default_config_has_empty_review_base_url():
    assert LC.default_config()["reviewBaseUrl"] == ""


def test_validate_keeps_review_base_url():
    cfg = LC.default_config()
    cfg["reviewBaseUrl"] = "http://10.248.105.95/pm"
    assert LC.validate_config(cfg)["reviewBaseUrl"] == "http://10.248.105.95/pm"


def test_validate_strips_trailing_slash_from_review_base_url():
    """末尾斜杠必须剥掉 —— 拼 cardLink 时是 base + '/review/' + token,
    不剥就拼出 '//review/',蓝信 webview 未必容错。"""
    cfg = LC.default_config()
    cfg["reviewBaseUrl"] = "http://10.248.105.95/pm/"
    assert LC.validate_config(cfg)["reviewBaseUrl"] == "http://10.248.105.95/pm"


@pytest.mark.parametrize("bad", ["10.248.105.95/pm", "ftp://x/pm", "javascript:alert(1)"])
def test_validate_rejects_non_http_review_base_url(bad):
    """必须 http:// 或 https:// 开头。这个值会被拼进【推给员工的卡片】的
    cardLink 里,放行任意 scheme 等于把它变成一个钓鱼跳板。"""
    cfg = LC.default_config()
    cfg["reviewBaseUrl"] = bad
    with pytest.raises(ValueError):
        LC.validate_config(cfg)


def test_empty_review_base_url_is_allowed():
    """留空是合法状态:此时不发 H5 链接,卡片文案自动退回「请直接回复本消息反馈」。"""
    cfg = LC.default_config()
    cfg["reviewBaseUrl"] = ""
    assert LC.validate_config(cfg)["reviewBaseUrl"] == ""


def test_ensure_review_token_secret_generates_once_and_persists(tmp_path):
    """【承重】密钥必须持久。若在 default_config/validate_config 里生成,
    每次 load 都会换一个新的 —— 服务重启后此前签发的 token 全部失效
    (TTL 48 小时,重启很可能落在窗口内)。故只在首次真正要用时生成【并立刻落盘】。"""
    p = tmp_path / "lanxin_config.json"
    cfg = LC.default_config()
    first = LC.ensure_review_token_secret(str(p), cfg)
    assert first and len(first) >= 32
    assert p.exists(), "生成后必须落盘"
    reloaded = LC.load_config(str(p))
    assert reloaded["credentials"]["reviewTokenSecret"] == first
    assert LC.ensure_review_token_secret(str(p), reloaded) == first, "已有则不许重新生成"


def test_ensure_review_token_secret_does_not_log_it(tmp_path, caplog):
    """密钥绝不进日志。"""
    p = tmp_path / "lanxin_config.json"
    cfg = LC.default_config()
    with caplog.at_level(0):
        sec = LC.ensure_review_token_secret(str(p), cfg)
    assert sec not in caplog.text


# ---- 终审 Critical 修复:save_config 曾静默清空 reviewTokenSecret ----

def test_save_config_empty_review_token_secret_keeps_old(tmp_path):
    """与其余三个密钥同规:传空串=不修改,避免脱敏读回后误清空。
    reviewTokenSecret 是服务端自生成、界面上没有它的输入框 —— 一旦被清空,
    已发出去的 H5 链接(TTL 48 小时)集体静默失效,且无任何报错线索。"""
    p = str(tmp_path / "c.json")
    cfg = LC.default_config()
    cfg["credentials"]["reviewTokenSecret"] = "KEEPME"
    LC.save_config(p, cfg)
    cfg2 = LC.load_config(p)
    cfg2["credentials"]["reviewTokenSecret"] = ""
    saved = LC.save_config(p, cfg2)
    assert saved["credentials"]["reviewTokenSecret"] == "KEEPME"


def test_ensure_then_public_then_save_roundtrip_keeps_review_token_secret(tmp_path):
    """端到端复现终审逮到的真实故障链路:ensure_review_token_secret 生成并落盘
    → public_config 下发(该字段被抹成 "") → 前端原样把下发对象 PUT 回来
    → save_config → 密钥仍在。这条比上一条更贴近「超管点一次保存」的真实路径。"""
    p = str(tmp_path / "c.json")
    cfg = LC.default_config()
    secret = LC.ensure_review_token_secret(p, cfg)
    pub = LC.public_config(LC.load_config(p))
    assert pub["credentials"]["reviewTokenSecret"] == ""      # 确认下发环节真的抹空了
    LC.save_config(p, pub)                                     # 模拟前端原样回传
    assert LC.load_config(p)["credentials"]["reviewTokenSecret"] == secret
