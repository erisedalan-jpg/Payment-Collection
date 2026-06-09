# -*- coding: utf-8 -*-
import server as S


class TestIsValidPmisName:
    def test_active_name_ok(self):
        assert S.is_valid_pmis_name("项目中心.xlsx") is True
    def test_closed_name_ok(self):
        assert S.is_valid_pmis_name("项目状态信息数据-已关闭.xlsx") is True
    def test_unknown_name_rejected(self):
        assert S.is_valid_pmis_name("随便.xlsx") is False
    def test_path_traversal_rejected(self):
        assert S.is_valid_pmis_name("../evil.xlsx") is False
    def test_empty_rejected(self):
        assert S.is_valid_pmis_name("") is False
