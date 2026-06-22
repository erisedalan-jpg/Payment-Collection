# -*- coding: utf-8 -*-
import os
import config
import server as S


class TestCollectFileStatus:
    def test_known_files_mtime_and_missing_none(self, tmp_path):
        pmis_dir = tmp_path / "input" / config.PMIS_DIRNAME
        pmis_dir.mkdir(parents=True)
        (pmis_dir / config.MILESTONE_FILE_ACTIVE).write_bytes(b"x")
        (tmp_path / "input" / config.PAYMENT_RECORDS_FILE).write_bytes(b"y")
        st = S.collect_file_status(str(tmp_path))
        assert st[config.MILESTONE_FILE_ACTIVE] is not None        # 有文件 → 时间串
        assert len(st[config.MILESTONE_FILE_ACTIVE]) == 16          # 'YYYY-MM-DD HH:MM'
        assert st[config.PAYMENT_RECORDS_FILE] is not None
        assert st["项目中心.xlsx"] is None                           # 缺失 → None
        # 名单覆盖:九表 + input 根白名单全部在键中
        for name in config.PMIS_ALL_FILENAMES:
            assert name in st
        for name in config.INPUT_UPLOAD_NAMES:
            assert name in st


class TestWhitelists:
    def test_pmis_upload_allows_milestones(self):
        assert S.is_valid_pmis_name(config.MILESTONE_FILE_ACTIVE) is True
        assert S.is_valid_pmis_name(config.MILESTONE_FILE_CLOSED) is True
        assert S.is_valid_pmis_name("../evil.xlsx") is False

    def test_inputs_upload_allows_csvs(self):
        for name in [config.PAYMENT_RECORDS_FILE, config.PROFIT_DIRECT_FILE,
                     config.PROFIT_BRIDGE_FILE, config.BUDGET_FILE]:
            assert S.is_valid_input_name(name) is True
