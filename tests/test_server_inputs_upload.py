# -*- coding: utf-8 -*-
import server as S


class TestIsValidInputName:
    def test_org_ok(self):
        assert S.is_valid_input_name("组织架构.xlsx") is True
    def test_mapping_ok(self):
        assert S.is_valid_input_name("A.xlsx") is True
    def test_delivery_ok(self):
        assert S.is_valid_input_name("delivery_analysis.csv") is True       # R1 起 csv 为主
        assert S.is_valid_input_name("delivery_analysis.xlsx") is True      # 过渡期 legacy 仍可上传
    def test_pmis_name_rejected(self):
        assert S.is_valid_input_name("项目中心.xlsx") is False  # PMIS 走 /api/pmis/upload
    def test_path_traversal_rejected(self):
        assert S.is_valid_input_name("../evil.xlsx") is False
    def test_lockfile_rejected(self):
        assert S.is_valid_input_name("~$A.xlsx") is False
    def test_empty_rejected(self):
        assert S.is_valid_input_name("") is False
