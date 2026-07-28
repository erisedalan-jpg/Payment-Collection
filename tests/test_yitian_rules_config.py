import json
import yitian_rules_config as RC
import yitian_rules as R


def test_default_config_shape_from_constants():
    cfg = RC.default_config()
    assert cfg["version"] == 1
    assert cfg["checkedTypes"] == list(R.CHECKED_TYPES)
    ck = cfg["checks"]
    # 必填三段由正则拆回关键词,首词与正则首分支一致
    assert ck["summary"]["keywords"][0] == "工作概述"
    assert ck["progress"]["enabled"] is True
    assert ck["next"]["keywords"][-1] == "下期计划"
    assert ck["serviceMode"]["effectiveDate"] == R.SERVICE_MODE_EFFECTIVE_DATE
    # 类型一致性:元组→二元列表
    assert ck["typeMismatch"]["rules"]["售前类"][0] == ["正式上线", "项目类"]
    # 产品线:装配为 {linePatterns,keywords}
    assert ck["product"]["lineKeywords"][0]["linePatterns"] == ["NGSOC"]
    assert "SOC" in ck["product"]["lineKeywords"][0]["keywords"]
    assert ck["product"]["nameKeywords"][0]["namePatterns"] == ["奇安信网神SSL编排控制网关系统V6.0"]
    assert set(ck["product"]["exclusiveKws"]) == {"组件", "租户"}
    assert ck["customer"]["hintKeywords"] == ["客户", "用户", "甲方", "业主"]
    assert set(ck["presaleProductHint"]["skipWorkTypes"]) == set(R.PRESALE_SKIP_WORKTYPES)
    # 每检查段都有 enabled
    for k in ("summary", "progress", "next", "serviceMode", "typeMismatch", "product", "customer", "presaleProductHint"):
        assert ck[k]["enabled"] is True


def test_validate_roundtrip_default():
    assert RC.validate_config(RC.default_config()) == RC.default_config()


def test_validate_missing_keys_fallback():
    cfg = RC.validate_config({"version": 1, "checks": {}})
    assert cfg["checkedTypes"] == list(R.CHECKED_TYPES)          # 缺 → 默认
    assert cfg["checks"]["summary"]["keywords"]                   # 缺段 → 默认段


def test_validate_rejects_bad_types():
    import pytest
    with pytest.raises(ValueError):
        RC.validate_config("nope")
    with pytest.raises(ValueError):
        RC.validate_config({"checkedTypes": "x"})               # 非数组
    with pytest.raises(ValueError):
        RC.validate_config({"checks": {"serviceMode": {"enabled": True, "effectiveDate": "2026/05/09"}}})  # 日期格式错


def test_validate_normalizes_lists():
    cfg = RC.validate_config({"checks": {"customer": {"enabled": True, "hintKeywords": [" 客户 ", "客户", ""]}}})
    assert cfg["checks"]["customer"]["hintKeywords"] == ["客户"]   # strip/去空/去重


def test_validate_typemismatch_shape():
    import pytest
    with pytest.raises(ValueError):
        RC.validate_config({"checks": {"typeMismatch": {"enabled": True, "rules": {"售前类": [["只有一个"]]}}}})


def test_save_load_roundtrip(tmp_path):
    p = str(tmp_path / "yitian_rules.json")
    cfg = RC.default_config()
    cfg["checks"]["product"]["enabled"] = False
    saved = RC.save_config(p, cfg)
    assert saved["checks"]["product"]["enabled"] is False
    assert RC.load_config(p)["checks"]["product"]["enabled"] is False


def test_load_missing_or_corrupt_falls_back(tmp_path):
    assert RC.load_config(str(tmp_path / "nope.json")) == RC.default_config()
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert RC.load_config(str(bad)) == RC.default_config()


def test_默认配置含pmTag与placeholder两节():
    d = RC.default_config()
    pm = d["checks"]["pmTag"]
    assert pm["enabled"] is True
    assert pm["workType3"] == ["项目管理", "项目验收", "文档编写与汇报"]
    assert pm["excludeTypes"] == ["售后类"]
    assert "担任角色" in pm["rolePrefixes"]
    assert pm["roleKeywords"] == ["项目经理"]
    assert d["checks"]["placeholder"]["customerWords"] == ["受影响的客户"]


def test_pmTag可被覆盖并归一化():
    cfg = RC.validate_config({"checks": {"pmTag": {
        "enabled": False,
        "workType3": [" 项目管理 ", "项目管理", "产品培训"],   # 去空白 + 去重
        "excludeTypes": [],
        "rolePrefixes": ["担任角色"],
        "roleKeywords": ["项目经理", "PM"],
    }}})
    pm = cfg["checks"]["pmTag"]
    assert pm["enabled"] is False
    assert pm["workType3"] == ["项目管理", "产品培训"]
    assert pm["excludeTypes"] == []
    assert pm["roleKeywords"] == ["项目经理", "PM"]


def test_pmTag缺段回落默认():
    cfg = RC.validate_config({"checks": {"summary": {"enabled": True, "keywords": ["工作概述"]}}})
    assert cfg["checks"]["pmTag"]["roleKeywords"] == ["项目经理"]
    assert cfg["checks"]["placeholder"]["customerWords"] == ["受影响的客户"]


def test_placeholder非数组报错():
    import pytest
    with pytest.raises(ValueError):
        RC.validate_config({"checks": {"placeholder": {"customerWords": "受影响的客户"}}})
