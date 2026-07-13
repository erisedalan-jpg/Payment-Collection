# -*- coding: utf-8 -*-
"""yitian_settings.py:合规检查范围配置(超管可配,消灭硬编码)。"""
import json

import pytest

import yitian_settings as S


class TestDefaults:
    def test_default_excluded_types_matches_original_tool(self):
        # 默认值 = 原工具 exclude_types,保证开箱即用时口径与历史一致
        assert S.DEFAULT_EXCLUDED_TYPES == ["管理类", "业务类", "假期类"]

    def test_default_settings_shape(self):
        assert S.default_settings() == {"excludedTypes": ["管理类", "业务类", "假期类"]}


class TestValidate:
    def test_accepts_valid(self):
        assert S.validate_settings({"excludedTypes": ["管理类"]}) == {"excludedTypes": ["管理类"]}

    def test_accepts_empty_list(self):
        # 全部纳入(不剔除任何类型)是合法配置
        assert S.validate_settings({"excludedTypes": []}) == {"excludedTypes": []}

    def test_missing_key_falls_back_to_default(self):
        assert S.validate_settings({}) == S.default_settings()

    def test_rejects_non_list(self):
        with pytest.raises(ValueError):
            S.validate_settings({"excludedTypes": "管理类"})

    def test_rejects_non_string_items(self):
        with pytest.raises(ValueError):
            S.validate_settings({"excludedTypes": ["管理类", 123]})

    def test_strips_and_dedups(self):
        assert S.validate_settings({"excludedTypes": [" 管理类 ", "管理类", ""]}) == {"excludedTypes": ["管理类"]}

    def test_rejects_too_many(self):
        with pytest.raises(ValueError):
            S.validate_settings({"excludedTypes": [f"类型{i}" for i in range(S.MAX_TYPES + 1)]})


class TestLoadSave:
    def test_missing_file_returns_default(self, tmp_path):
        assert S.load_settings(str(tmp_path / "nope.json")) == S.default_settings()

    def test_corrupt_file_returns_default(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{坏 json", encoding="utf-8")
        assert S.load_settings(str(p)) == S.default_settings()

    def test_roundtrip(self, tmp_path):
        p = str(tmp_path / "s.json")
        S.save_settings(p, {"excludedTypes": ["假期类"]})
        assert S.load_settings(p) == {"excludedTypes": ["假期类"]}
        with open(p, encoding="utf-8") as f:
            assert json.load(f)["excludedTypes"] == ["假期类"]
