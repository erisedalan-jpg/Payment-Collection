# -*- coding: utf-8 -*-
"""pmis.py 纯函数单元测试。不依赖 input/ 真文件——用内存 dict 或 tmp_path 生成的小 xlsx。"""
import pytest
import pmis as M


class TestParsePmisMoney:
    def test_plain(self):
        assert M.parse_pmis_money("1234.5") == 1234.5
    def test_with_separators(self):
        assert M.parse_pmis_money("1,234,567") == 1234567.0
    def test_blank_is_none(self):
        assert M.parse_pmis_money("") is None
        assert M.parse_pmis_money(None) is None
    def test_number_passthrough(self):
        assert M.parse_pmis_money(1000) == 1000.0


class TestParsePmisPct:
    def test_percent_text(self):
        assert M.parse_pmis_pct("80.00%") == pytest.approx(0.8)
    def test_bare_le_1(self):
        assert M.parse_pmis_pct(0.8) == pytest.approx(0.8)
    def test_gt_1_divided(self):
        assert M.parse_pmis_pct("100") == pytest.approx(1.0)
    def test_blank_none(self):
        assert M.parse_pmis_pct("") is None


class TestParseCloseFraction:
    """未关闭风险数量是 '未关闭/总' 分式文本,取分子。"""
    def test_fraction(self):
        assert M.parse_close_fraction("2/5") == 2
    def test_zero(self):
        assert M.parse_close_fraction("0/3") == 0
    def test_blank_none(self):
        assert M.parse_close_fraction("") is None
    def test_plain_int(self):
        assert M.parse_close_fraction("4") == 4
