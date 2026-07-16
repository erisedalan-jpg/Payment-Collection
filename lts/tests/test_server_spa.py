# -*- coding: utf-8 -*-
import server as S


class TestShouldSpaFallback:
    def test_api_never_fallback(self):
        assert S.should_spa_fallback('/api/sync') is False
    def test_data_file_subpath_no_fallback(self):
        assert S.should_spa_fallback('/data/analysis_data.json') is False

    def test_data_vue_route_fallback(self):
        # /data 本身是 Vue 路由"数据管理",硬刷新需回退到 index.html
        assert S.should_spa_fallback('/data') is True
    def test_static_asset_path_no_fallback(self):
        assert S.should_spa_fallback('/assets/index-abc.js') is False
    def test_spa_route_fallback(self):
        assert S.should_spa_fallback('/governance') is True
        assert S.should_spa_fallback('/board') is True
    def test_root_fallback(self):
        assert S.should_spa_fallback('/') is True
