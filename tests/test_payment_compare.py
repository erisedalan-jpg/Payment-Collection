import compare_payment_sources as C


def test_parse_pay_stage_ratio():
    assert C.parse_pay_stage_ratio("到货款1，70.00%") == 0.70
    assert C.parse_pay_stage_ratio("终验款，100.00%") == 1.0
    assert C.parse_pay_stage_ratio("") is None
    assert C.parse_pay_stage_ratio(None) is None
    assert C.parse_pay_stage_ratio("无比例文字") is None


def test_parse_ratio():
    assert C.parse_ratio(0.6) == 0.6
    assert C.parse_ratio(1) == 1.0
    assert C.parse_ratio("60%") == 0.6
    assert C.parse_ratio("60") == 0.6
    assert C.parse_ratio(1.08) == 1.08
    assert C.parse_ratio("") is None
    assert C.parse_ratio(None) is None
    assert C.parse_ratio("空值") is None


def test_diff_flag():
    assert C.diff_flag(0.9, 1.0, 0.10) is False
    assert C.diff_flag(0.85, 1.0, 0.10) is True
    assert C.diff_flag(None, 1.0, 0.10) is False
    assert C.diff_flag(1.0, None, 0.10) is False


def test_node_actual_amount():
    assert C.node_actual_amount(1000000, 0.7, 1.0) == 700000.0
    assert C.node_actual_amount(1000000, 0.7, 0.5) == 350000.0
    assert C.node_actual_amount(1000000, None, 0.5) == 0.0
    assert C.node_actual_amount(None, 0.7, 1.0) == 0.0


def test_days_between():
    assert C.days_between("2026-06-01", "2026-06-30") == 29
    assert C.days_between("2026-06-30", "2026-06-01") == 29
    assert C.days_between("2026-06-01T00:00:00", "2026-06-11") == 10
    assert C.days_between("", "2026-06-01") is None
    assert C.days_between("bad", "2026-06-01") is None


def test_classify_level():
    assert C.classify_level(0) == "绿"
    assert C.classify_level(1) == "黄"
    assert C.classify_level(2) == "红"
    assert C.classify_level(3) == "红"
