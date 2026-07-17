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
    # 默认值:工时不发汇总;项目发到直接上级
    assert ts["recipients"]["supervisorLevels"] == 0
    assert pj["recipients"]["supervisorLevels"] == 1
    assert len(pj["reasons"]) == 8


def test_validate_accepts_default():
    assert LC.validate_config(LC.default_config())


@pytest.mark.parametrize("lv", [0, 1, 2, 3, 4, 5])
def test_supervisor_levels_0_to_5_ok(lv):
    c = LC.default_config()
    c["routes"][1]["recipients"]["supervisorLevels"] = lv
    assert LC.validate_config(c)["routes"][1]["recipients"]["supervisorLevels"] == lv


@pytest.mark.parametrize("lv", [-1, 6, 99, "1", None])
def test_supervisor_levels_out_of_range_rejected(lv):
    c = LC.default_config()
    c["routes"][1]["recipients"]["supervisorLevels"] = lv
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_unknown_issue_code_rejected():
    c = LC.default_config()
    c["routes"][0]["issueCodes"] = ["MISS_SUMMARY", "NOT_A_CODE"]
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_unknown_reason_rejected():
    c = LC.default_config()
    c["routes"][1]["reasons"] = ["回款延期", "不存在的原因"]
    with pytest.raises(ValueError):
        LC.validate_config(c)


def test_empty_subset_is_legal():
    """空子集 = 该路由不推任何原因,是合法配置(等同停用),不应报错。"""
    c = LC.default_config()
    c["routes"][1]["reasons"] = []
    assert LC.validate_config(c)["routes"][1]["reasons"] == []


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
    assert all(not c.startswith("HINT_") for c in ts["issueCodes"])
    assert set(ts["issueCodes"]) == {k for k in ISSUE_LABELS if not k.startswith("HINT_")}
    assert "HINT_PRESALE_PRODUCT" not in ts["issueCodes"]


def test_hint_code_still_selectable():
    """默认不勾 ≠ 不可勾:超管想推提示,页面上勾了必须能存下来。"""
    c = LC.default_config()
    c["routes"][0]["issueCodes"] = ["MISS_SUMMARY", "HINT_PRESALE_PRODUCT"]
    saved = LC.validate_config(c)
    assert "HINT_PRESALE_PRODUCT" in saved["routes"][0]["issueCodes"]
