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


def test_sheet_names():
    assert config.SHEET_PAYMENT_NODES == "项目回款节点（里程碑）清单"
    assert config.SHEET_PROJECT_OVERVIEW == "项目验收日期、回款条件信息收集"
    assert config.SHEET_FOLLOWUP == "项目回款跟进记录"


def test_excel_serial_range():
    assert config.EXCEL_SERIAL_MIN == 40000
    assert config.EXCEL_SERIAL_MAX == 60000
