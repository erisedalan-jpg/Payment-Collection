# -*- coding: utf-8 -*-
"""projects.py 纯函数单元测试。不依赖 input/ 真文件——用 tmp_path 生成的小 xlsx 或内存 dict。"""
import openpyxl
import pytest

import config
import projects as P


def _make_xlsx(dir_path, name, sheets):
    """造多 sheet xlsx。sheets = [(sheet名, rows[list[tuple]])]，首个 sheet 复用默认 active。"""
    wb = openpyxl.Workbook()
    for i, (title, rows) in enumerate(sheets):
        ws = wb.active if i == 0 else wb.create_sheet()
        ws.title = title
        for r in rows:
            ws.append(list(r))
    path = str(dir_path / name)
    wb.save(path)
    return path


class TestReadOrgNames:
    def test_picks_sheet_with_gonghao_header(self, tmp_path):
        path = _make_xlsx(tmp_path, "组织架构.xlsx", [
            ("Sheet2", [("行标签", "求和项:成本"), ("银行服务组", 100)]),  # 透视杂表在前
            ("Sheet1", [
                ("工号", "姓名", "员工类别", "新L2组织", "新L3组织", "新L3-1组织", "新L4组织",
                 "直接上级工号", "直接上级姓名", "是否项目经理", "成本"),
                ("A012804", "佘海龙", "正式员工", "交付中心", "交付实施三部", "服务二部",
                 "黑龙江服务组", "A001373", "于岩", None, 1500),
                ("A002338", "杨亮", "正式员工", "交付中心", "交付实施三部", "服务二部",
                 "黑龙江服务组", "A012804", "佘海龙", None, 1000),
            ]),
        ])
        names, l4s, rows = P.read_org_names(path)
        assert names == {"佘海龙", "杨亮"}
        assert l4s == {"黑龙江服务组"}
        assert rows == 2

    def test_missing_file_degrades(self, tmp_path):
        names, l4s, rows = P.read_org_names(str(tmp_path / "不存在.xlsx"))
        assert names == set() and l4s == set() and rows == 0


class TestReadMapping:
    def test_headerless_three_cols(self, tmp_path):
        path = _make_xlsx(tmp_path, "A.xlsx", [
            ("Sheet1", [
                ("WSGF-SF-202301100425", "于江", "WSGF-SS-202212229197"),
                ("WSGF-SF-202304190139", "于江", "WSGF-SS-202303289058"),
                (None, None, None),  # 空行跳过
                ("WSGF-SF-X", "某人", None),  # 缺已关闭号跳过
            ]),
        ])
        m = P.read_mapping(path)
        assert m == [
            {"current": "WSGF-SF-202301100425", "owner": "于江", "closed": "WSGF-SS-202212229197"},
            {"current": "WSGF-SF-202304190139", "owner": "于江", "closed": "WSGF-SS-202303289058"},
        ]

    def test_missing_file_degrades(self, tmp_path):
        assert P.read_mapping(str(tmp_path / "无.xlsx")) == []


class TestReadDelivery:
    def test_picks_sheet_with_pid_header_and_skips_pivot(self, tmp_path):
        path = _make_xlsx(tmp_path, "delivery_analysis.xlsx", [
            ("Sheet1", [(None, None), ("行标签", "求和项:x")]),  # 透视杂表
            ("delivery_analysis (1)", [
                ("项目编号", "项目名称", "项目经理", "L4组织", "差旅费_预算金额", "差旅费_消耗率"),
                ("WSGF-SS-1", "某项目", "佘海龙", "黑龙江服务组", 1000, "50%"),
            ]),
        ])
        rows = P.read_delivery(path)
        assert len(rows) == 1
        assert rows[0]["项目编号"] == "WSGF-SS-1"
        assert rows[0]["差旅费_预算金额"] == 1000
