import preprocess_data as pre


def test_derive_tag_seed_whitelist_match():
    rows = [
        {"项目编号": "A", "合同验收回款时间节点截图": "BH项目", "合同付款条件截图": ""},
        {"项目编号": "B", "合同验收回款时间节点截图": "框架合同", "合同付款条件截图": "佳杰"},
        {"项目编号": "C", "合同验收回款时间节点截图": "已100%回款", "合同付款条件截图": "=DISPIMG(x)"},
        {"项目编号": "D", "合同验收回款时间节点截图": "佳杰", "合同付款条件截图": "佳杰"},
        {"项目编号": "", "合同验收回款时间节点截图": "BH项目", "合同付款条件截图": ""},
    ]
    seed = pre.derive_tag_seed(rows)
    assert seed["A"] == ["BH项目"]
    assert set(seed["B"]) == {"框架合同", "佳杰"}
    assert "C" not in seed
    assert seed["D"] == ["佳杰"]
    assert "" not in seed


def test_derive_tag_seed_empty():
    assert pre.derive_tag_seed([]) == {}
