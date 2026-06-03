# -*- coding: utf-8 -*-
"""
preprocess_data.py 纯函数单元测试（harness 验证层）。

只覆盖无副作用、不依赖文件/网络的解析函数——它们是金额/日期/比例的计算地基，
错一个数全盘皆错。改这些函数的行为时，请先改/补这里的用例。

注：is_past / is_future 依赖 datetime.now()，因此只用"远过去 / 远未来"的日期断言，
避免测试随时间漂移。
"""
import pytest

import preprocess_data as P


# ── parse_amount：解析金额（保持元单位） ──────────────────────────
class TestParseAmount:
    def test_plain_integer(self):
        assert P.parse_amount("1000") == 1000.0

    def test_decimal(self):
        assert P.parse_amount("50.5") == 50.5

    def test_strips_thousands_separators(self):
        assert P.parse_amount("1,234.56") == 1234.56
        assert P.parse_amount("1，234.56") == 1234.56  # 中文逗号

    def test_strips_currency_symbol_and_unit(self):
        assert P.parse_amount("￥1000元") == 1000.0

    def test_empty_and_none_return_zero(self):
        assert P.parse_amount("") == 0
        assert P.parse_amount(None) == 0
        assert P.parse_amount("   ") == 0

    def test_non_numeric_returns_zero(self):
        assert P.parse_amount("abc") == 0


# ── parse_ratio：百分比 → 0~1 小数 ───────────────────────────────
class TestParseRatio:
    def test_percent_string(self):
        assert P.parse_ratio("50%") == pytest.approx(0.5)

    def test_percent_over_100(self):
        assert P.parse_ratio("101%") == pytest.approx(1.01)
        assert P.parse_ratio("100%") == pytest.approx(1.0)

    def test_bare_decimal_le_1(self):
        assert P.parse_ratio("0.7") == pytest.approx(0.7)

    def test_bare_number_gt_1_divided_by_100(self):
        assert P.parse_ratio("70") == pytest.approx(0.7)

    def test_exactly_one(self):
        assert P.parse_ratio("1") == pytest.approx(1.0)

    def test_empty_and_none_return_none(self):
        assert P.parse_ratio("") is None
        assert P.parse_ratio(None) is None


# ── parse_ratio_raw：保留云文档展示值（小数×100 → "xx%"） ─────────
class TestParseRatioRaw:
    def test_float_internal_value_to_percent(self):
        assert P.parse_ratio_raw(0.7) == "70%"
        assert P.parse_ratio_raw(1.01) == "101%"
        assert P.parse_ratio_raw(0.3) == "30%"

    def test_already_has_percent_kept_asis(self):
        assert P.parse_ratio_raw("85%") == "85%"

    def test_zero(self):
        assert P.parse_ratio_raw(0) == "0%"

    def test_empty_and_pending_become_placeholder(self):
        assert P.parse_ratio_raw("") == "空值"
        assert P.parse_ratio_raw(None) == "空值"
        assert P.parse_ratio_raw("待上报") == "空值"

    def test_non_numeric_kept(self):
        assert P.parse_ratio_raw("abc") == "abc"


# ── excel_serial_to_date：Excel 序列号 / 多格式 → YYYY-MM-DD ──────
class TestExcelSerialToDate:
    def test_serial_number(self):
        # 43831 是 Excel 中 2020-01-01 的序列号
        assert P.excel_serial_to_date(43831) == "2020-01-01"
        assert P.excel_serial_to_date("43831") == "2020-01-01"

    def test_standard_formats(self):
        assert P.excel_serial_to_date("2021-03-05") == "2021-03-05"
        assert P.excel_serial_to_date("2021/03/05") == "2021-03-05"
        assert P.excel_serial_to_date("2021年3月5日") == "2021-03-05"
        assert P.excel_serial_to_date("2021.03.05") == "2021-03-05"

    def test_regex_fallback(self):
        assert P.excel_serial_to_date("2021-3-5 备注") == "2021-03-05"

    def test_out_of_range_serial_returns_none(self):
        assert P.excel_serial_to_date(39999) is None  # < 40000

    def test_empty_and_invalid(self):
        assert P.excel_serial_to_date("") is None
        assert P.excel_serial_to_date(None) is None
        assert P.excel_serial_to_date("abc") is None


# ── _clean_text：过滤 Excel 错误值大负数 ─────────────────────────
class TestCleanText:
    def test_normal_text_kept(self):
        assert P._clean_text("正常文本") == "正常文本"

    def test_strips_whitespace(self):
        assert P._clean_text("  abc  ") == "abc"

    def test_large_negative_error_value_dropped(self):
        assert P._clean_text("-2146826246") == ""

    def test_small_negative_kept(self):
        assert P._clean_text("-50") == "-50"

    def test_none_returns_empty(self):
        assert P._clean_text(None) == ""


# ── is_yes ───────────────────────────────────────────────────────
class TestIsYes:
    def test_yes(self):
        assert P.is_yes("是") is True
        assert P.is_yes("是的") is True

    def test_no(self):
        assert P.is_yes("否") is False
        assert P.is_yes(None) is False
        assert P.is_yes("") is False


# ── get_month ────────────────────────────────────────────────────
class TestGetMonth:
    def test_extracts_year_month(self):
        assert P.get_month("2026-06-03") == "2026-06"

    def test_too_short_returns_none(self):
        assert P.get_month("2026") is None
        assert P.get_month("") is None
        assert P.get_month(None) is None


# ── is_past / is_future（用远过去/远未来，避免随时间漂移） ─────────
class TestIsPastFuture:
    def test_far_past_is_past(self):
        assert P.is_past("2000-01-01") is True
        assert P.is_future("2000-01-01") is False

    def test_far_future_is_future(self):
        assert P.is_future("2099-01-01") is True
        assert P.is_past("2099-01-01") is False

    def test_invalid_inputs(self):
        assert P.is_past("") is False
        assert P.is_past("not-a-date") is False
        assert P.is_future(None) is False


# ── _format_completion_display：完成度内部值 → 展示百分比 ─────────
class TestFormatCompletionDisplay:
    def test_decimal_to_percent(self):
        assert P._format_completion_display("0.8") == "80%"

    def test_one_to_100(self):
        assert P._format_completion_display("1") == "100%"

    def test_integer_gt_1_kept_as_percent(self):
        assert P._format_completion_display("100") == "100%"

    def test_already_percent_kept(self):
        assert P._format_completion_display("85%") == "85%"

    def test_empty_placeholder(self):
        assert P._format_completion_display("") == "空值"
        assert P._format_completion_display("空值") == "空值"
        assert P._format_completion_display(None) == "空值"


# ── _get_ratio_num / _parse_completion_pct：取数用 0~1 ───────────
class TestRatioHelpers:
    def test_get_ratio_num(self):
        assert P._get_ratio_num("50%") == pytest.approx(0.5)
        assert P._get_ratio_num("空值") is None
        assert P._get_ratio_num("") is None
        assert P._get_ratio_num(None) is None

    def test_parse_completion_pct(self):
        assert P._parse_completion_pct("80%") == pytest.approx(0.8)
        assert P._parse_completion_pct("空值") is None
        assert P._parse_completion_pct("") is None
