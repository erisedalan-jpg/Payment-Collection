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
    def test_negative(self):
        assert M.parse_pmis_money("-500.0") == -500.0


class TestParsePmisPct:
    def test_percent_text(self):
        assert M.parse_pmis_pct("80.00%") == pytest.approx(0.8)
    def test_bare_le_1(self):
        assert M.parse_pmis_pct(0.8) == pytest.approx(0.8)
    def test_gt_1_divided(self):
        assert M.parse_pmis_pct("100") == pytest.approx(1.0)
    def test_blank_none(self):
        assert M.parse_pmis_pct("") is None
        assert M.parse_pmis_pct(None) is None


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


import openpyxl


def _make_xlsx(dir_path, name, headers, rows):
    """造一个表头在第 2 行的 PMIS 风格 xlsx(第 1 行合并标题)。返回文件路径。"""
    import os as _os
    wb = openpyxl.Workbook(); ws = wb.active
    ws.cell(row=1, column=1, value="标题")
    for c, h in enumerate(headers, 1):
        ws.cell(row=2, column=c, value=h)
    for r, row in enumerate(rows, 3):
        for c, h in enumerate(headers, 1):
            ws.cell(row=r, column=c, value=row.get(h))
    _os.makedirs(dir_path, exist_ok=True)
    p = _os.path.join(dir_path, name); wb.save(p); return p


class TestReadPmisSheet:
    def test_reads_header_row2(self, tmp_path):
        p = _make_xlsx(str(tmp_path), "x.xlsx", ["项目编号", "项目名称"],
                       [{"项目编号": "A-1", "项目名称": "甲"}])
        rows = M.read_pmis_sheet(p)
        assert rows == [{"项目编号": "A-1", "项目名称": "甲"}]
    def test_missing_file_returns_empty(self, tmp_path):
        assert M.read_pmis_sheet(str(tmp_path / "nope.xlsx")) == []


class TestDeriveCost:
    def test_consume_ratio_and_overrun(self):
        row = {"项目总预算（元）": "1000", "项目核算（元）": "600", "剩余预算（元）": "400",
               "成本状态": "黄色预警"}
        center = {"是否人工成本超支": "否", "是否直接成本超支": "是"}
        cost = M.derive_cost(row, center)
        assert cost["消耗比"] == pytest.approx(0.6)
        assert cost["超支"] is True
        assert cost["成本状态"] == "黄色预警"
    def test_zero_budget_ratio_none(self):
        cost = M.derive_cost({"项目总预算（元）": "0", "项目核算（元）": "0"}, {})
        assert cost["消耗比"] is None


class TestDeriveRisk:
    def test_aggregate(self):
        recs = [{"风险等级": "低", "风险状态": "已关闭"},
                {"风险等级": "高", "风险状态": "已识别"}]
        risk = M.derive_risk(recs)
        assert risk["风险记录数"] == 2
        assert risk["最高等级"] == "高"
        assert risk["闭环率"] == pytest.approx(0.5)
    def test_empty(self):
        risk = M.derive_risk([])
        assert risk["风险记录数"] == 0 and risk["最高等级"] is None
