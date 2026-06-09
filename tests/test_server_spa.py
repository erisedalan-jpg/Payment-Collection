# -*- coding: utf-8 -*-
import server as S


class TestShouldSpaFallback:
    def test_api_never_fallback(self):
        assert S.should_spa_fallback('/api/sync') is False
    def test_data_never_fallback(self):
        assert S.should_spa_fallback('/data/analysis_data.json') is False
    def test_static_asset_path_no_fallback(self):
        assert S.should_spa_fallback('/assets/index-abc.js') is False
    def test_spa_route_fallback(self):
        assert S.should_spa_fallback('/governance') is True
        assert S.should_spa_fallback('/board') is True
    def test_root_fallback(self):
        assert S.should_spa_fallback('/') is True
