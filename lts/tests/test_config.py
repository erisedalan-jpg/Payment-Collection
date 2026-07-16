# tests/test_config.py
import config


def test_tier_thresholds_and_labels():
    assert config.TIER_ABOVE_1M == 1_000_000
    assert config.TIER_ABOVE_500K == 500_000
    assert config.TIER_LABELS == ["100万以上", "50-100万", "50万以下"]


def test_node_statuses_complete():
    assert config.NODE_STATUSES == [
        "加资源可提前", "达到回款条件", "已提前回款",
        "已全额回款", "延期", "正常实施中",
    ]


def test_excel_serial_range():
    assert config.EXCEL_SERIAL_MIN == 40000
    assert config.EXCEL_SERIAL_MAX == 60000
