import projects


def test_parse_presale_customer_standard():
    assert projects.parse_presale_customer_from_name("售前服务-中国农业发展银行-202410140295") == "中国农业发展银行"


def test_parse_presale_customer_name_contains_dash():
    # 客户名内含 '-'(英文测试名):贪婪 + 尾部数字锚定须正确保留中段
    assert projects.parse_presale_customer_from_name("售前服务-SS-Guangdong-202501010001") == "SS-Guangdong"


def test_parse_presale_customer_with_paren():
    assert projects.parse_presale_customer_from_name(
        "售前服务-沈阳市大数据管理中心（沈阳市信息中心、沈阳市信用中心）-202502100166"
    ) == "沈阳市大数据管理中心（沈阳市信息中心、沈阳市信用中心）"


def test_parse_presale_customer_no_match_returns_empty():
    assert projects.parse_presale_customer_from_name("中国农业发展银行") == ""        # 无前缀
    assert projects.parse_presale_customer_from_name("售前服务-某客户") == ""          # 无尾部数字
    assert projects.parse_presale_customer_from_name("") == ""
    assert projects.parse_presale_customer_from_name(None) == ""


def test_effective_customer_non_presale_uses_own():
    assert projects.effective_customer(False, "本项目客户", "", "any") == "本项目客户"


def test_effective_customer_presale_prefers_origin():
    assert projects.effective_customer(True, "", "原项目客户", "售前服务-忽略-202501010001") == "原项目客户"


def test_effective_customer_presale_falls_back_to_name_parse():
    # 售前 + 原项目无客户 → 用项目名解析
    assert projects.effective_customer(True, "", "", "售前服务-某银行-202501010001") == "某银行"


def test_effective_customer_presale_no_origin_no_name_returns_empty():
    assert projects.effective_customer(True, "", "", "不规范名") == ""
