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


def test_collection_stages_is_valid_input_name():
    """核心回款源 collection_stages.csv 必须可经 /api/inputs/upload 页面上传。"""
    import server
    assert server.is_valid_input_name("collection_stages.csv") is True


def test_collection_stages_in_file_status(tmp_path):
    """文件状态清单必须包含 collection_stages.csv（缺失则值为 None，但键须在）。"""
    import server
    status = server.collect_file_status(str(tmp_path))
    assert "collection_stages.csv" in status
